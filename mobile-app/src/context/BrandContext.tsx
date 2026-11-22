import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { API_URL } from '../constants/config';
import { authedFetch } from '../services/authService';

/**
 * The business name and order success message shown inside the app.
 *
 * They live on the server (LedgerSettings.business_name & LedgerSettings.order_success_message),
 * so an admin can change them from Settings and every phone picks them up without a new build.
 * Values are cached in AsyncStorage so they render instantly at launch before the network answers.
 */

export const DEFAULT_BRAND = Constants.expoConfig?.name || 'Century Sip';
export const DEFAULT_ORDER_SUCCESS_MESSAGE = 'Your order is under process';
const CACHE_KEY = 'brand_name';
const CACHE_CUSTOM_KEY = 'brand_is_custom';
const ORDER_SUCCESS_CACHE_KEY = 'order_success_message';
const ORDER_SUCCESS_CUSTOM_KEY = 'order_success_is_custom';

interface BrandValue {
  name: string;
  orderSuccessMessage: string;
  /** Saves a new name for everyone. Throws with a readable message on failure. */
  rename: (next: string) => Promise<void>;
  /** Updates the order success confirmation message for everyone. */
  updateOrderSuccessMessage: (next: string) => Promise<void>;
  /** Refreshes brand info from the server while preserving custom user overrides. */
  refreshBrand: () => Promise<void>;
}

const BrandContext = createContext<BrandValue>({
  name: DEFAULT_BRAND,
  orderSuccessMessage: DEFAULT_ORDER_SUCCESS_MESSAGE,
  rename: async () => {},
  updateOrderSuccessMessage: async () => {},
  refreshBrand: async () => {},
});

export const BrandProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [name, setName] = useState(DEFAULT_BRAND);
  const [orderSuccessMessage, setOrderSuccessMessage] = useState(DEFAULT_ORDER_SUCCESS_MESSAGE);

  const refreshBrand = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/ledger/business/`);
      if (!res.ok) return;
      const data = await res.json();
      const serverName = (typeof data?.business_name === 'string' && data.business_name.trim()) ||
                         (typeof data?.name === 'string' && data.name.trim()) || '';
      const isCustom = await AsyncStorage.getItem(CACHE_CUSTOM_KEY).catch(() => null);
      const localName = await AsyncStorage.getItem(CACHE_KEY).catch(() => null);

      if (serverName) {
        if (!isCustom || (serverName !== DEFAULT_BRAND && serverName !== 'Century Sip') || !localName) {
          setName(serverName);
          await AsyncStorage.setItem(CACHE_KEY, serverName).catch(() => {});
        } else if (localName) {
          setName(localName);
        }
      }

      const freshMsg = typeof data?.order_success_message === 'string' ? data.order_success_message.trim() : '';
      const isMsgCustom = await AsyncStorage.getItem(ORDER_SUCCESS_CUSTOM_KEY).catch(() => null);
      const localMsg = await AsyncStorage.getItem(ORDER_SUCCESS_CACHE_KEY).catch(() => null);
      if (freshMsg) {
        if (!isMsgCustom || (freshMsg !== DEFAULT_ORDER_SUCCESS_MESSAGE && freshMsg !== 'Your order is under process') || !localMsg) {
          setOrderSuccessMessage(freshMsg);
          await AsyncStorage.setItem(ORDER_SUCCESS_CACHE_KEY, freshMsg).catch(() => {});
        } else if (localMsg) {
          setOrderSuccessMessage(localMsg);
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cachedName = await AsyncStorage.getItem(CACHE_KEY);
        if (!cancelled && cachedName) setName(cachedName);
        const cachedMsg = await AsyncStorage.getItem(ORDER_SUCCESS_CACHE_KEY);
        if (!cancelled && cachedMsg) setOrderSuccessMessage(cachedMsg);
      } catch {}
      if (!cancelled) {
        await refreshBrand();
      }
    })();
    return () => { cancelled = true; };
  }, [refreshBrand]);

  const rename = useCallback(async (next: string) => {
    const trimmed = next.trim();
    if (!trimmed) throw new Error('The name cannot be empty.');

    // Instantly commit locally so UI across all screens (headers, settings, dialogs) updates immediately
    setName(trimmed);
    await AsyncStorage.setItem(CACHE_KEY, trimmed).catch(() => {});
    await AsyncStorage.setItem(CACHE_CUSTOM_KEY, 'true').catch(() => {});

    try {
      const res = await authedFetch(`${API_URL}/ledger/business/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_name: trimmed, name: trimmed }),
      });
      if (!res.ok) {
        let detail = `The server refused the change (error ${res.status}).`;
        try {
          const errJson = await res.json();
          if (errJson?.detail) detail = errJson.detail;
        } catch {}
        console.warn('Server business rename warning:', detail);
      } else {
        const data = await res.json().catch(() => null);
        const returned = (typeof data?.business_name === 'string' && data.business_name.trim()) ||
                         (typeof data?.name === 'string' && data.name.trim()) || '';
        const saved = (returned && returned.toLowerCase() === trimmed.toLowerCase()) ? returned : trimmed;
        setName(saved);
        await AsyncStorage.setItem(CACHE_KEY, saved).catch(() => {});
      }
    } catch (e: any) {
      console.warn('Network error saving business name to server:', e?.message || e);
    }
  }, []);

  const updateOrderSuccessMessage = useCallback(async (next: string) => {
    const trimmed = next.trim();
    if (!trimmed) throw new Error('Message cannot be empty.');

    // Instantly commit locally
    setOrderSuccessMessage(trimmed);
    await AsyncStorage.setItem(ORDER_SUCCESS_CACHE_KEY, trimmed).catch(() => {});
    await AsyncStorage.setItem(ORDER_SUCCESS_CUSTOM_KEY, 'true').catch(() => {});

    try {
      const res = await authedFetch(`${API_URL}/ledger/business/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_success_message: trimmed }),
      });
      if (!res.ok) {
        let detail = `The server refused the change (error ${res.status}).`;
        try {
          const errJson = await res.json();
          if (errJson?.detail) detail = errJson.detail;
        } catch {}
        console.warn('Server order success message warning:', detail);
      } else {
        const data = await res.json().catch(() => null);
        const returned = (typeof data?.order_success_message === 'string' && data.order_success_message.trim()) || '';
        const saved = returned || trimmed;
        setOrderSuccessMessage(saved);
        await AsyncStorage.setItem(ORDER_SUCCESS_CACHE_KEY, saved).catch(() => {});
      }
    } catch (e: any) {
      console.warn('Network error saving order success message to server:', e?.message || e);
    }
  }, []);

  const value = useMemo(() => ({
    name,
    orderSuccessMessage,
    rename,
    updateOrderSuccessMessage,
    refreshBrand,
  }), [name, orderSuccessMessage, rename, updateOrderSuccessMessage, refreshBrand]);

  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>;
};

export const useBrand = () => useContext(BrandContext);
