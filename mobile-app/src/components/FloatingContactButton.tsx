import { colors } from '../theme';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Linking,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { API_URL } from '../constants/config';
import { useLanguage } from '../context/LanguageContext';
import { canWhatsApp, openWhatsApp } from '../utils/whatsapp';

/**
 * A contact button that floats above every customer screen and can be dragged
 * out of the way.
 *
 * It is draggable because a fixed floating button always ends up covering
 * something — a price, an "Add to cart", the last row of a list — and which
 * thing it covers depends on the screen. Rather than guess a safe corner, the
 * customer moves it and we remember where they left it.
 *
 * Built on PanResponder + Animated rather than Reanimated/gesture-handler,
 * neither of which this project depends on.
 */

const STORAGE_KEY = 'contact_fab_position_v1';
const SIZE = 56;
const EDGE_MARGIN = 12;
/** Movement under this many px counts as a tap, not a drag. */
const TAP_SLOP = 6;

type BusinessContact = { name?: string; phone?: string | null; address?: string | null };
type Position = { x: number; y: number };

export const FloatingContactButton = () => {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const navigation = useNavigation<any>();
  const { t } = useLanguage();

  const [business, setBusiness] = useState<BusinessContact | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [ready, setReady] = useState(false);

  // Keeps the button inside the screen no matter how it rotates or resizes.
  const clamp = useCallback(
    (p: Position): Position => ({
      x: Math.min(Math.max(p.x, EDGE_MARGIN), Math.max(EDGE_MARGIN, width - SIZE - EDGE_MARGIN)),
      y: Math.min(
        Math.max(p.y, insets.top + EDGE_MARGIN),
        Math.max(insets.top + EDGE_MARGIN, height - SIZE - insets.bottom - EDGE_MARGIN),
      ),
    }),
    [width, height, insets.top, insets.bottom],
  );

  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  // Animated values cannot be read synchronously without touching private
  // fields, so a listener mirrors the live position into a ref for the
  // release handler and for persistence.
  const positionRef = useRef<Position>({ x: 0, y: 0 });

  useEffect(() => {
    const id = pan.addListener(value => {
      positionRef.current = { x: value.x, y: value.y };
    });
    return () => pan.removeListener(id);
  }, [pan]);

  // Restore where the customer last parked it; fall back to above the tab bar
  // on the right, which is where a support button is conventionally expected.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let start: Position = {
        x: width - SIZE - EDGE_MARGIN,
        y: height - SIZE - insets.bottom - 168, // clears the floating tab bar and the cart bar
      };
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (typeof parsed?.x === 'number' && typeof parsed?.y === 'number') {
            start = parsed;
          }
        }
      } catch {
        // A corrupt saved position must not cost the customer the button.
      }
      if (cancelled) return;
      const safe = clamp(start);
      pan.setValue(safe);
      positionRef.current = safe;
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
    // Deliberately mount-only: re-running would yank the button back mid-drag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The number is served by the backend so it can change without a new build.
  useEffect(() => {
    let cancelled = false;
    fetch(`${API_URL}/ledger/business/`)
      .then(res => (res.ok ? res.json() : null))
      .then(data => !cancelled && data && setBusiness(data))
      .catch(() => {
        // Offline or endpoint down — the button falls back to the in-app
        // complaints form, which is the one channel that always works.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const settle = useCallback(() => {
    // Snap to whichever side is nearer, so the button never floats mid-screen
    // over content, and keep the vertical position the customer chose.
    const current = positionRef.current;
    const snappedX =
      current.x + SIZE / 2 < width / 2
        ? EDGE_MARGIN
        : width - SIZE - EDGE_MARGIN;
    const target = clamp({ x: snappedX, y: current.y });

    Animated.spring(pan, {
      toValue: target,
      useNativeDriver: false,
      friction: 7,
      tension: 60,
    }).start();
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(target)).catch(() => {
      // Losing the saved position is cosmetic; never surface it.
    });
  }, [clamp, pan, width]);

  // PanResponder.create runs once, so its handlers would capture the first
  // settle() forever and keep snapping to the launch-time screen width. The
  // ref keeps them calling the current one.
  const settleRef = useRef(settle);
  useEffect(() => {
    settleRef.current = settle;
  }, [settle]);

  const responder = useRef(
    PanResponder.create({
      // The inner Pressable claims the responder on touch-down, so a plain
      // onStartShouldSetPanResponder here would swallow every tap and the menu
      // would never open. Instead, let the press through and *steal* the
      // gesture in the capture phase once it travels far enough to be a drag.
      // Stealing terminates the Pressable's press, so a drag never also fires
      // onPress.
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponderCapture: (_evt, g) =>
        Math.abs(g.dx) > TAP_SLOP || Math.abs(g.dy) > TAP_SLOP,
      onPanResponderGrant: () => {
        pan.setOffset(positionRef.current);
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event(
        [null, { dx: pan.x, dy: pan.y }],
        { useNativeDriver: false },
      ),
      onPanResponderRelease: () => {
        pan.flattenOffset();
        settleRef.current();
      },
      onPanResponderTerminate: () => {
        pan.flattenOffset();
        settleRef.current();
      },
    }),
  ).current;

  const phone = business?.phone;
  const businessName = business?.name || 'Century Sip';

  const dial = () => {
    if (!phone) return;
    const scheme = Platform.OS === 'ios' ? 'telprompt' : 'tel';
    Linking.openURL(`${scheme}:${phone.replace(/[^\d+]/g, '')}`).catch(() => {
      // Tablet or emulator with no dialler — nothing useful to say.
    });
  };

  if (!ready) return null;

  return (
    <>
      {/* box-none so only the button itself intercepts touches; the rest of
          the screen keeps working normally underneath. */}
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <Animated.View
          style={[styles.fabWrap, { transform: pan.getTranslateTransform() }]}
          {...responder.panHandlers}
        >
          <Pressable
            onPress={() => setMenuOpen(true)}
            android_ripple={{ color: 'rgba(255,255,255,0.25)', borderless: true }}
            style={styles.fab}
            accessibilityRole="button"
            accessibilityLabel={t('contact_us_whatsapp', 'Contact us on WhatsApp')}
            accessibilityHint={t(
              'contact_fab_hint',
              'Opens contact options. Drag to move this button.',
            )}
          >
            <Ionicons name="logo-whatsapp" size={30} color="#fff" />
          </Pressable>
        </Animated.View>
      </View>

      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setMenuOpen(false)}>
          {/* Stops a tap inside the card from closing it. */}
          <Pressable style={styles.card} onPress={() => {}}>
            <View style={styles.grabber} />
            <Text style={styles.cardTitle}>{t('contact_us', 'Contact us')}</Text>
            <Text style={styles.cardSubtitle}>
              {t('contact_us_sub', 'We usually reply within business hours.')}
            </Text>

            {canWhatsApp(phone) && (
              <TouchableOpacity
                style={styles.row}
                onPress={() => {
                  setMenuOpen(false);
                  openWhatsApp(
                    phone,
                    `Hello ${businessName}, I need help with my account.`,
                  );
                }}
              >
                <Ionicons name="logo-whatsapp" size={22} color="#25D366" />
                <Text style={styles.rowText}>
                  {t('contact_whatsapp', 'Contact us on WhatsApp')}
                </Text>
                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
              </TouchableOpacity>
            )}

            {!!phone && (
              <TouchableOpacity style={styles.row} onPress={() => { setMenuOpen(false); dial(); }}>
                <Ionicons name="call" size={22} color={colors.primary} />
                <Text style={styles.rowText}>{t('contact_call', 'Call us')}</Text>
                <Text style={styles.rowMeta}>{phone}</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.row}
              onPress={() => {
                setMenuOpen(false);
                navigation.navigate('Complaints');
              }}
            >
              <Ionicons name="chatbubbles-outline" size={22} color={colors.ink} />
              <Text style={styles.rowText}>
                {t('support_complaints', 'Support & Complaints')}
              </Text>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </TouchableOpacity>

            <Text style={styles.hint}>
              {t('contact_fab_drag_hint', 'Tip: drag the button to move it out of the way.')}
            </Text>

            <TouchableOpacity style={styles.close} onPress={() => setMenuOpen(false)}>
              <Text style={styles.closeText}>{t('close', 'Close')}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  fabWrap: {
    position: 'absolute',
    width: SIZE,
    height: SIZE,
  },
  fab: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    // WhatsApp brand green — the icon is the whole point of recognising it.
    backgroundColor: '#25D366',
    alignItems: 'center',
    justifyContent: 'center',
    // Elevation on Android, shadow on iOS — without one it reads as flat
    // against the content it is floating over.
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 28,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.lineSoft,
    marginBottom: 14,
  },
  cardTitle: { fontSize: 18, fontWeight: '700', color: colors.ink },
  cardSubtitle: { fontSize: 13, color: colors.muted, marginTop: 2, marginBottom: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 15,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  rowText: { flex: 1, fontSize: 15, color: colors.ink, fontWeight: '500' },
  rowMeta: { fontSize: 13, color: colors.muted },
  hint: { fontSize: 12, color: colors.muted, marginTop: 14, textAlign: 'center' },
  close: {
    marginTop: 14,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: colors.bg,
    alignItems: 'center',
  },
  closeText: { fontSize: 15, fontWeight: '600', color: colors.textSecondary },
});
