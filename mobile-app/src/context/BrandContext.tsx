import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../constants/config';
import { getAuthToken } from '../services/authService';

/**
 * The business name shown inside the app (headers, loading screen).
 *
 * It lives on the server (LedgerSettings.business_name, the same name printed on
 * receipts), so an admin can change it from Settings and every phone picks it
 * up without a new build. The last value is cached so the right name is on
 * screen at launch, before the network answers.
 *
 * The name under the app icon on the home screen is baked into the installed
 * app by the OS and cannot be changed from inside it.
 */

export const DEFAULT_BRAND = 'Century Sip';
const CACHE_KEY = 'brand_name';

interface BrandValue {
  name: string;
  /** Saves a new name for everyone. Throws with a readable message on failure. */
  rename: (next: string) => Promise<void>;
}

const BrandContext = createContext<BrandValue>({
  name: DEFAULT_BRAND,
  rename: async () => {},
});

export const BrandProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [name, setName] = useState(DEFAULT_BRAND);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(CACHE_KEY)
      .then(v => { if (!cancelled && v) setName(v); })
      .catch(() => {});
    fetch(`${API_URL}/ledger/business/`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        const fresh = typeof data?.name === 'string' ? data.name.trim() : '';
        if (cancelled || !fresh) return;
        setName(fresh);
        AsyncStorage.setItem(CACHE_KEY, fresh).catch(() => {});
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const rename = useCallback(async (next: string) => {
    const trimmed = next.trim();
    if (!trimmed) throw new Error('The name cannot be empty.');
    const token = await getAuthToken();
    const res = await fetch(`${API_URL}/ledger/business/`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ business_name: trimmed }),
    });
    if (!res.ok) {
      throw new Error(
        res.status === 403
          ? 'Only administrators can change the name.'
          : `The server refused the change (error ${res.status}).`,
      );
    }
    const data = await res.json();
    const saved = (typeof data?.name === 'string' && data.name.trim()) || trimmed;
    setName(saved);
    AsyncStorage.setItem(CACHE_KEY, saved).catch(() => {});
  }, []);

  const value = useMemo(() => ({ name, rename }), [name, rename]);
  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>;
};

export const useBrand = () => useContext(BrandContext);
