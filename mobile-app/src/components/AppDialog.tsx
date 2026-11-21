import { colors, radius, shadow } from '../theme';
import React, {
  createContext, useCallback, useContext, useMemo, useRef, useState, useEffect,
} from 'react';
import {
  Modal, Pressable, StyleSheet, Text, TouchableOpacity, View, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/**
 * The app's own themed confirmation and notice dialog engine.
 *
 * Replaces React Native's native OS dialogs (Alert.alert) which render
 * dark/grey system popups on Android and plain OS sheets on iOS.
 *
 * This provider intercepts Alert.alert globally AND provides the imperative
 * useDialog() hook (confirm / notify), ensuring every popup in the app
 * matches Century Sip's Bright Sky design language with proper tone icons,
 * high-contrast typography, and beautiful buttons.
 */

export type DialogTone = 'default' | 'destructive' | 'success' | 'warning' | 'info';

export interface DialogButton {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

export interface ConfirmOptions {
  title: string;
  message?: string;
  /** Action button text, e.g. "Delete Record" or "Sign Out". */
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: DialogTone;
  /** Convenience shortcut for tone: 'destructive'. */
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
  /** Single-button notice. Resolves when closed. */
  notify: (options: NotifyOptions) => Promise<void>;
  /** Custom multi-button dialog. */
  show: (title: string, message?: string, buttons?: DialogButton[], tone?: DialogTone) => void;
}

const DialogContext = createContext<DialogApi | null>(null);

const TONES: Record<DialogTone, { accent: string; bg: string; icon: keyof typeof Ionicons.glyphMap }> = {
  default:     { accent: colors.primary,  bg: colors.primaryTint, icon: 'help-circle' },
  destructive: { accent: colors.danger,   bg: colors.dangerBg,    icon: 'alert-circle' },
  success:     { accent: colors.success,  bg: colors.successBg,   icon: 'checkmark-circle' },
  warning:     { accent: colors.warning,  bg: colors.warningBg,   icon: 'warning' },
  info:        { accent: colors.info,     bg: colors.infoBg,      icon: 'information-circle' },
};

export function detectTone(title: string, message: string = '', buttons: DialogButton[] = []): DialogTone {
  const hasDestructiveBtn = buttons.some(b => b.style === 'destructive');
  if (hasDestructiveBtn) return 'destructive';

  const text = `${title} ${message}`.toLowerCase();

  if (/(error|fail|invalid|cannot|could not|rejected|denied|delete|remove|cancel|logout|expired|session expired|danger|check the date|check the address|not saved)/i.test(text)) {
    return 'destructive';
  }
  if (/(success|done|saved|updated|created|sent|confirmed|added|all checked)/i.test(text)) {
    return 'success';
  }
  if (/(warning|caution|alert|check|attention|missing|required|permission needed|too large|temporary password)/i.test(text)) {
    return 'warning';
  }
  if (/(info|notice|note|tip|about|sharing|phone|draft)/i.test(text)) {
    return 'info';
  }

  return 'default';
}

interface PendingDialog {
  title: string;
  message?: string;
  tone: DialogTone;
  buttons: DialogButton[];
  cancelable?: boolean;
  onDismiss?: () => void;
}

let activeShowDialog: ((pending: PendingDialog) => void) | null = null;

export const DialogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [pending, setPending] = useState<PendingDialog | null>(null);

  const closeDialog = useCallback(() => {
    setPending(null);
  }, []);

  const handleButtonPress = (btn: DialogButton) => {
    closeDialog();
    // Run after closing modal so any navigation or subsequent modal works smoothly
    setTimeout(() => {
      btn.onPress?.();
    }, 100);
  };

  const handleDismiss = () => {
    if (pending?.cancelable !== false) {
      const onDismiss = pending?.onDismiss;
      closeDialog();
      onDismiss?.();
    }
  };

  // ── Global Alert.alert monkey-patching ──────────────────────────────────────
  useEffect(() => {
    activeShowDialog = (p: PendingDialog) => {
      setPending(p);
    };

    const originalAlert = Alert.alert;
    (Alert as any).alert = (
      title: string,
      message?: string,
      buttons?: any[],
      options?: { cancelable?: boolean; onDismiss?: () => void }
    ) => {
      const rawButtons: DialogButton[] =
        buttons && buttons.length > 0
          ? buttons.map(b => ({
              text: b.text || 'OK',
              onPress: b.onPress,
              style: b.style || 'default',
            }))
          : [{ text: 'OK', style: 'default' }];

      const tone = detectTone(title || '', message || '', rawButtons);

      if (activeShowDialog) {
        activeShowDialog({
          title: title || '',
          message: typeof message === 'string' ? message : undefined,
          buttons: rawButtons,
          tone,
          cancelable: options?.cancelable ?? true,
          onDismiss: options?.onDismiss,
        });
      } else {
        originalAlert(title, message, buttons, options);
      }
    };

    return () => {
      activeShowDialog = null;
      (Alert as any).alert = originalAlert;
    };
  }, []);

  // ── Imperative API ──────────────────────────────────────────────────────────

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      const tone = options.tone ?? (options.destructive ? 'destructive' : detectTone(options.title, options.message));
      setPending({
        title: options.title,
        message: options.message,
        tone,
        buttons: [
          {
            text: options.cancelLabel ?? 'Cancel',
            style: 'cancel',
            onPress: () => resolve(false),
          },
          {
            text: options.confirmLabel ?? 'Confirm',
            style: options.destructive ? 'destructive' : 'default',
            onPress: () => resolve(true),
          },
        ],
        cancelable: true,
        onDismiss: () => resolve(false),
      });
    });
  }, []);

  const notify = useCallback((options: NotifyOptions) => {
    return new Promise<void>((resolve) => {
      const tone = options.tone ?? detectTone(options.title, options.message);
      setPending({
        title: options.title,
        message: options.message,
        tone,
        buttons: [
          {
            text: options.closeLabel ?? 'Done',
            style: 'default',
            onPress: () => resolve(),
          },
        ],
        cancelable: true,
        onDismiss: () => resolve(),
      });
    });
  }, []);

  const show = useCallback((title: string, message?: string, buttons?: DialogButton[], tone?: DialogTone) => {
    const rawButtons = buttons && buttons.length > 0 ? buttons : [{ text: 'OK', style: 'default' as const }];
    const resolvedTone = tone ?? detectTone(title, message, rawButtons);
    setPending({
      title,
      message,
      buttons: rawButtons,
      tone: resolvedTone,
      cancelable: true,
    });
  }, []);

  const api = useMemo<DialogApi>(() => ({ confirm, notify, show }), [confirm, notify, show]);
  const toneConfig = pending ? TONES[pending.tone] : TONES.default;

  return (
    <DialogContext.Provider value={api}>
      {children}
      <Modal
        visible={pending !== null}
        transparent
        animationType="fade"
        onRequestClose={handleDismiss}
      >
        <Pressable style={styles.backdrop} onPress={handleDismiss}>
          <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
            {/* Tone Icon Badge */}
            <View style={[styles.iconWrap, { backgroundColor: toneConfig.bg }]}>
              <Ionicons name={toneConfig.icon} size={28} color={toneConfig.accent} />
            </View>

            {/* Title & Message */}
            <Text style={styles.title}>{pending?.title}</Text>
            {!!pending?.message && <Text style={styles.message}>{pending.message}</Text>}

            {/* Action Buttons */}
            {pending && pending.buttons.length > 0 && (
              <View
                style={[
                  styles.actions,
                  pending.buttons.length === 2 && styles.actionsRow,
                  pending.buttons.length > 2 && styles.actionsColumn,
                ]}
              >
                {pending.buttons.map((btn, index) => {
                  const isCancel = btn.style === 'cancel';
                  const isDestructive = btn.style === 'destructive';
                  const isMainAction = !isCancel;

                  let btnBg: string = colors.surfaceTint;
                  let textColor: string = colors.textSecondary;

                  if (isCancel) {
                    btnBg = colors.surfaceTint;
                    textColor = colors.muted;
                  } else if (isDestructive) {
                    btnBg = colors.danger;
                    textColor = colors.white;
                  } else if (pending.tone === 'success') {
                    btnBg = colors.success;
                    textColor = colors.white;
                  } else if (pending.tone === 'warning') {
                    btnBg = colors.warning;
                    textColor = colors.white;
                  } else {
                    btnBg = colors.primary;
                    textColor = colors.white;
                  }

                  return (
                    <TouchableOpacity
                      key={`${btn.text}_${index}`}
                      style={[
                        styles.button,
                        pending.buttons.length === 2 && { flex: 1 },
                        pending.buttons.length === 1 && { width: '100%' },
                        isCancel && styles.cancelButton,
                        isMainAction && { backgroundColor: btnBg },
                      ]}
                      onPress={() => handleButtonPress(btn)}
                      activeOpacity={0.8}
                      accessibilityRole="button"
                    >
                      <Text
                        style={[
                          styles.buttonText,
                          { color: textColor },
                          isMainAction && styles.buttonTextBold,
                        ]}
                      >
                        {btn.text}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
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
    backgroundColor: 'rgba(10, 31, 68, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.lineSoft,
    ...shadow.float,
  },
  iconWrap: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 19,
    fontWeight: '800',
    color: colors.ink,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  message: {
    fontSize: 14.5,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
    marginTop: 8,
  },
  actions: {
    marginTop: 22,
    width: '100%',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  actionsColumn: {
    flexDirection: 'column',
    gap: 8,
  },
  button: {
    height: 46,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  cancelButton: {
    backgroundColor: colors.surfaceTint,
    borderWidth: 1,
    borderColor: colors.line,
  },
  buttonText: {
    fontSize: 14.5,
    fontWeight: '700',
  },
  buttonTextBold: {
    fontWeight: '800',
  },
});
