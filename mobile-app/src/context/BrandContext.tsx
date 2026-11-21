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
const ORDER_SUCCESS_CACHE_KEY = 'order_success_message';

interface BrandValue {
  name: string;
  orderSuccessMessage: string;
  /** Saves a new name for everyone. Throws with a readable message on failure. */
  rename: (next: string) => Promise<void>;
  /** Updates the order success confirmation message for everyone. */
  updateOrderSuccessMessage: (next: string) => Promise<void>;
}

const BrandContext = createContext<BrandValue>({
  name: DEFAULT_BRAND,
  orderSuccessMessage: DEFAULT_ORDER_SUCCESS_MESSAGE,
  rename: async () => {},
  updateOrderSuccessMessage: async () => {},
});

export const BrandProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [name, setName] = useState(DEFAULT_BRAND);
  const [orderSuccessMessage, setOrderSuccessMessage] = useState(DEFAULT_ORDER_SUCCESS_MESSAGE);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(CACHE_KEY)
      .then(v => { if (!cancelled && v) setName(v); })
      .catch(() => {});
    AsyncStorage.getItem(ORDER_SUCCESS_CACHE_KEY)
      .then(v => { if (!cancelled && v) setOrderSuccessMessage(v); })
      .catch(() => {});

    fetch(`${API_URL}/ledger/business/`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        const freshName = typeof data?.name === 'string' ? data.name.trim() : '';
        if (!cancelled && freshName) {
          setName(freshName);
          AsyncStorage.setItem(CACHE_KEY, freshName).catch(() => {});
        }
        const freshMsg = typeof data?.order_success_message === 'string' ? data.order_success_message.trim() : '';
        if (!cancelled && freshMsg) {
          setOrderSuccessMessage(freshMsg);
          AsyncStorage.setItem(ORDER_SUCCESS_CACHE_KEY, freshMsg).catch(() => {});
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const rename = useCallback(async (next: string) => {
    const trimmed = next.trim();
    if (!trimmed) throw new Error('The name cannot be empty.');
    const res = await authedFetch(`${API_URL}/ledger/business/`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_name: trimmed }),
    });
    if (!res.ok) {
      let detail = `The server refused the change (error ${res.status}).`;
      try {
        const errJson = await res.json();
        if (errJson?.detail) detail = errJson.detail;
      } catch {}
      throw new Error(detail);
    }
    const data = await res.json();
    const saved = (typeof data?.name === 'string' && data.name.trim()) || trimmed;
    setName(saved);
    await AsyncStorage.setItem(CACHE_KEY, saved).catch(() => {});
  }, []);

  const updateOrderSuccessMessage = useCallback(async (next: string) => {
    const trimmed = next.trim();
    if (!trimmed) throw new Error('Message cannot be empty.');
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
      throw new Error(detail);
    }
    const data = await res.json();
    const saved = (typeof data?.order_success_message === 'string' && data.order_success_message.trim()) || trimmed;
    setOrderSuccessMessage(saved);
    await AsyncStorage.setItem(ORDER_SUCCESS_CACHE_KEY, saved).catch(() => {});
  }, []);

  const value = useMemo(() => ({
    name,
    orderSuccessMessage,
    rename,
    updateOrderSuccessMessage,
  }), [name, orderSuccessMessage, rename, updateOrderSuccessMessage]);

  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>;
};

export const useBrand = () => useContext(BrandContext);
