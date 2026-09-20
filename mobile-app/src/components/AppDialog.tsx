import React, {
  createContext, useCallback, useContext, useMemo, useRef, useState,
} from 'react';
import {
  Modal, Pressable, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/**
 * The app's own confirmation dialog, replacing React Native's Alert.alert.
 *
 * Alert.alert renders the OS dialog — grey on Android, a different shape on
 * iOS, following the system theme rather than the app's. Next to a white,
 * blue-accented app it reads as something belonging to the phone rather than
 * to Century Sip, and none of it can be styled.
 *
 * Alert.alert is imperative and a themed replacement has to live in the tree,
 * so this is a provider holding one dialog with an imperative API on top:
 *
 *     const { confirm, notify } = useDialog();
 *     if (await confirm({ title: 'Delete?', message: '...', destructive: true })) ...
 *     await notify({ title: 'Order #12 created' });
 *
 * Both return a promise, so a call site reads top to bottom instead of burying
 * the real work inside an onPress callback.
 */

export type DialogTone = 'default' | 'destructive' | 'success';

export interface ConfirmOptions {
  title: string;
  message?: string;
  /** Names the action, e.g. "Delete record". Never "OK". */
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: DialogTone;
  /** Convenience for tone: 'destructive'. */
  destructive?: boolean;
}

export interface NotifyOptions {
  title: string;
  message?: string;
  closeLabel?: string;
  tone?: DialogTone;
}

interface DialogApi {
  /** Resolves true when confirmed, false when cancelled or dismissed. */
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  /** A single-button notice. Resolves when it closes. */
  notify: (options: NotifyOptions) => Promise<void>;
}

const DialogContext = createContext<DialogApi | null>(null);

const TONES: Record<DialogTone, { accent: string; icon: keyof typeof Ionicons.glyphMap }> = {
  default: { accent: '#007AFF', icon: 'help-circle' },
  destructive: { accent: '#FF3B30', icon: 'alert-circle' },
  success: { accent: '#34C759', icon: 'checkmark-circle' },
};

interface Pending {
  kind: 'confirm' | 'notify';
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone: DialogTone;
}

export const DialogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [pending, setPending] = useState<Pending | null>(null);
  // Holds the promise the caller is waiting on. A ref rather than state, so
  // settling it never schedules a render of its own.
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const settle = useCallback((value: boolean) => {
    const resolve = resolver.current;
    resolver.current = null;
    setPending(null);
    resolve?.(value);
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    // Two dialogs cannot stack, so anything already open is cancelled rather
    // than left holding a promise nobody will ever settle.
    resolver.current?.(false);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
      setPending({
        kind: 'confirm',
        title: options.title,
        message: options.message,
        confirmLabel: options.confirmLabel ?? 'Confirm',
        cancelLabel: options.cancelLabel ?? 'Cancel',
        tone: options.tone ?? (options.destructive ? 'destructive' : 'default'),
      });
    });
  }, []);

  const notify = useCallback((options: NotifyOptions) => {
    resolver.current?.(false);
    return new Promise<void>((resolve) => {
      resolver.current = () => resolve();
      setPending({
        kind: 'notify',
        title: options.title,
        message: options.message,
        confirmLabel: options.closeLabel ?? 'Done',
        tone: options.tone ?? 'default',
      });
    });
  }, []);

  const api = useMemo<DialogApi>(() => ({ confirm, notify }), [confirm, notify]);
  const tone = pending ? TONES[pending.tone] : TONES.default;

  return (
    <DialogContext.Provider value={api}>
      {children}
      <Modal
        visible={pending !== null}
        transparent
        animationType="fade"
        // The Android back button must settle the promise, not orphan it.
        onRequestClose={() => settle(false)}
      >
        <Pressable
          style={styles.backdrop}
          // Tapping outside cancels a question but never a notice — dismissing
          // a confirmation by accident must not mean "yes".
          onPress={() => pending?.kind === 'confirm' && settle(false)}
        >
          <Pressable style={styles.card} onPress={() => {}}>
            <View style={[styles.iconWrap, { backgroundColor: tone.accent + '18' }]}>
              <Ionicons name={tone.icon} size={26} color={tone.accent} />
            </View>

            <Text style={styles.title}>{pending?.title}</Text>
            {!!pending?.message && <Text style={styles.message}>{pending.message}</Text>}

            <View style={styles.actions}>
              {pending?.kind === 'confirm' && (
                <TouchableOpacity
                  style={[styles.button, styles.cancelButton]}
                  onPress={() => settle(false)}
                  accessibilityRole="button"
                >
                  <Text style={styles.cancelText}>{pending.cancelLabel}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.button, { backgroundColor: tone.accent }]}
                onPress={() => settle(true)}
                accessibilityRole="button"
              >
                <Text style={styles.confirmText}>{pending?.confirmLabel}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </DialogContext.Provider>
  );
};

export function useDialog(): DialogApi {
  const api = useContext(DialogContext);
  if (!api) {
    throw new Error('useDialog must be used inside <DialogProvider>, mounted in App.tsx.');
  }
  return api;
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#fff',
    borderRadius: 18,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 18,
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
  },
  iconWrap: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a2530',
    textAlign: 'center',
  },
  message: {
    fontSize: 14.5,
    color: '#5b6672',
    textAlign: 'center',
    lineHeight: 21,
    marginTop: 9,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 22,
    width: '100%',
  },
  button: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: { backgroundColor: '#f0f2f5' },
  cancelText: { fontSize: 15, fontWeight: '600', color: '#5b6672' },
  confirmText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
