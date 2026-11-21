import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../constants/config';

const fetchWithTimeout = async (url: string, options: RequestInit, timeout = 30000) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Request timeout - please check your network connection');
    }
    throw error;
  }
};

// ── Token storage keys ───────────────────────────────────────────────────────
const ACCESS_KEY = 'auth_token';
const REFRESH_KEY = 'refresh_token';

/** Decode a base64url string (JWT parts) without relying on atob being present. */
const decodeBase64Url = (input: string): string => {
  let s = input.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  if (typeof atob === 'function') {
    try { return atob(s); } catch { /* fall through to manual decode */ }
  }
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let output = '';
  let buffer = 0, bits = 0;
  for (const ch of s) {
    if (ch === '=') break;
    const idx = chars.indexOf(ch);
    if (idx === -1) continue;
    buffer = (buffer << 6) | idx;
    bits += 6;
    if (bits >= 8) { bits -= 8; output += String.fromCharCode((buffer >> bits) & 0xff); }
  }
  return output;
};

/** True if the JWT is missing/expired (with a small clock-skew buffer). */
const isAccessExpired = (token: string, skewSeconds = 60): boolean => {
  try {
    const payload = JSON.parse(decodeBase64Url(token.split('.')[1]));
    if (!payload.exp) return false;
    return Date.now() / 1000 >= payload.exp - skewSeconds;
  } catch {
    return true; // unparseable → force a refresh
  }
};

/**
 * Exchange the stored refresh token for a new access token (and a rotated
 * refresh token). On failure the session is cleared. Returns the new access
 * token, or null if the user must log in again.
 */
const doRefresh = async (): Promise<string | null> => {
  const refresh = await AsyncStorage.getItem(REFRESH_KEY);
  if (!refresh) return null;
  try {
    const res = await fetch(`${API_URL}/auth/token/refresh/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh }),
    });
    if (!res.ok) {
      // Refresh token expired/blacklisted → end the session.
      await AsyncStorage.multiRemove([ACCESS_KEY, REFRESH_KEY]);
      return null;
    }
    const data = await res.json();
    await AsyncStorage.setItem(ACCESS_KEY, data.access);
    // Rotation returns a new refresh token — persist it so the 90-day window slides.
    if (data.refresh) await AsyncStorage.setItem(REFRESH_KEY, data.refresh);
    return data.access;
  } catch (error) {
    console.error('Token refresh failed:', error);
    return null;
  }
};

let refreshing: Promise<string | null> | null = null;

/**
 * Refresh, but only once at a time. The refresh token rotates on use, so two
 * screens refreshing together would burn each other's token and sign the user
 * out. Everyone who asks while one is in flight gets that same answer.
 */
export const refreshAccessToken = (): Promise<string | null> => {
  if (!refreshing) {
    refreshing = doRefresh().finally(() => { refreshing = null; });
  }
  return refreshing;
};

/**
 * fetch with the login attached. A token can be refused by the server even
 * though its own expiry has not passed (the signing key changed, or it was
 * revoked), and the screens then all fail at once. So a 401 refreshes the
 * token and tries once more before giving up.
 */
export const authedFetch = async (url: string, init: RequestInit = {}): Promise<Response> => {
  const send = (token: string | null) => fetch(url, {
    ...init,
    headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` },
  });
  let token = await getAuthToken();
  let res = await send(token);
  if (res.status === 401) {
    const fresh = await refreshAccessToken();
    if (fresh) { token = fresh; res = await send(fresh); }
  }
  // The shared host now and then answers a request with a 500 or 502 that
  // works a second later. Reads are safe to repeat; writes are never retried.
  const method = (init.method || 'GET').toUpperCase();
  for (const wait of method === 'GET' ? [600, 1500] : []) {
    if (res.status < 500) break;
    await new Promise((resolve) => setTimeout(resolve, wait));
    res = await send(token);
  }
  return res;
};

/**
 * Get a valid access token, transparently refreshing it if it has expired.
 * Used by every authenticated request, so users stay logged in as long as the
 * (sliding) refresh token is alive — no manual re-login for active users.
 */
export const getAuthToken = async (): Promise<string | null> => {
  try {
    const access = await AsyncStorage.getItem(ACCESS_KEY);
    if (!access) return null;
    if (isAccessExpired(access)) {
      return await refreshAccessToken();
    }
    return access;
  } catch (error) {
    console.error('Error getting auth token:', error);
    return null;
  }
};

export const authService = {
  async register(userData: any) {
    console.log('🔵 Registering user to:', `${API_URL}/auth/register/`);
    const response = await fetchWithTimeout(`${API_URL}/auth/register/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(userData),
    });
    
    const data = await response.json();
    if (!response.ok) {
      throw new Error(JSON.stringify(data));
    }
    return data;
  },

  async login(credentials: any) {
    console.log('🔵 Logging in to:', `${API_URL}/auth/login/`);
    try {
      const response = await fetchWithTimeout(`${API_URL}/auth/login/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(credentials),
      });

      const data = await response.json();
      console.log('✅ Login response:', response.status);
      
      if (!response.ok) {
        console.log('❌ Login failed:', data);
        throw new Error(JSON.stringify(data));
      }
      return data;
    } catch (error: any) {
      console.error('❌ Login error:', error.message);
      throw error;
    }
  },

  async getProfile(token: string) {
    console.log('🔵 Fetching profile from:', `${API_URL}/auth/profile/`);
    try {
      const response = await fetchWithTimeout(`${API_URL}/auth/profile/`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await response.json();
      console.log('✅ Profile response:', response.status);
      
      if (!response.ok) {
        console.log('❌ Profile fetch failed:', data);
        throw new Error(JSON.stringify(data));
      }
      return data;
    } catch (error: any) {
      console.error('❌ Profile error:', error.message);
      throw error;
    }
  },

  async updateProfile(_token: string, userData: any) {
    // Always use a freshly-refreshed token so long sessions don't 401.
    const token = (await getAuthToken()) || _token;
    const response = await fetch(`${API_URL}/auth/profile/`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(userData),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(JSON.stringify(data));
    }
    return data;
  },

  async googleLogin(googleAccessToken: string) {
    const response = await fetchWithTimeout(`${API_URL}/auth/google/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: googleAccessToken }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(JSON.stringify(data));
    return data;
  },

  async changePassword(_token: string, oldPassword: string, newPassword: string) {
    const token = (await getAuthToken()) || _token;
    const response = await fetchWithTimeout(`${API_URL}/auth/change-password/`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(JSON.stringify(data));
    }
    return data;
  },
};
