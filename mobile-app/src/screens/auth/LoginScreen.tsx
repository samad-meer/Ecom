import React, { useState, useContext, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
  ScrollView, Dimensions, Animated, Easing,
} from 'react-native';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { AuthContext } from '../../context/AuthContext';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { FieldError } from '../../components/FormField';
import { useLanguage } from '../../context/LanguageContext';
import { GoogleSignInButton } from '../../components/GoogleSignInButton';
import { IS_GOOGLE_SIGNIN_CONFIGURED } from '../../constants/googleConfig';
import {
  loadRememberedCredentials,
  saveRememberedCredentials,
  clearRememberedCredentials,
} from '../../services/rememberedCredentials';

const { height: SCREEN_H } = Dimensions.get('window');
const BRAND_BLUE = '#0A84FF';
const BRAND_DARK = '#0D1B2A';

const FEATURE_PILLS = ['💧 Fresh & Pure', '🚴 Fast Delivery', '📱 Track Orders'];

/** Accent bar under the greeting, and the light that travels along it. */
const ACCENT_W = 52;
const ACCENT_SHEEN_W = 16;

/**
 * Animation runs on RN's built-in Animated API rather than Reanimated, which
 * this project does not depend on (same call as FloatingContactButton). Every
 * transform/opacity animation uses the native driver; the only one that cannot
 * is the field focus tint, because colour is a layout prop.
 */

const LoginScreen = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  // Which box is at fault, so the person is not left hunting for it.
  const [fieldErrors, setFieldErrors] = useState<{ username?: string; password?: string }>({});
  const [remember, setRemember] = useState(false);
  const { login, isLoading, error, clearError } = useContext(AuthContext);
  // Whatever failed on some other screen is not this form's problem.
  useEffect(() => { clearError(); }, [clearError]);
  const { t } = useLanguage();
  const navigation = useNavigation<any>();
  const reducedMotion = useReducedMotion();

  // ── Animation values ───────────────────────────────────────────────────────
  // Entrance: each group settles slightly after the one above it, so the eye is
  // led from the logo down to the button rather than everything appearing at once.
  const logoIn = useRef(new Animated.Value(0)).current;
  const titleIn = useRef(new Animated.Value(0)).current;
  const pillIns = useRef(FEATURE_PILLS.map(() => new Animated.Value(0))).current;
  const cardIn = useRef(new Animated.Value(0)).current;

  // Ambient: two ripples leaving the logo like a drop hitting water, half a
  // period apart, plus a slow drift on the background circles.
  const rippleA = useRef(new Animated.Value(0)).current;
  const rippleB = useRef(new Animated.Value(0)).current;
  const drift = useRef(new Animated.Value(0)).current;

  // Greeting. Deliberately animated as whole strings rather than split into
  // characters: `welcome_back` is admin-translated and may arrive as Urdu,
  // whose letters join up — rendering one <Text> per character would break the
  // ligatures and print nonsense.
  const greetIn = useRef(new Animated.Value(0)).current;
  const accentIn = useRef(new Animated.Value(0)).current;
  const subIn = useRef(new Animated.Value(0)).current;
  const sheen = useRef(new Animated.Value(0)).current;

  // Interaction
  const userFocus = useRef(new Animated.Value(0)).current;
  const passFocus = useRef(new Animated.Value(0)).current;
  const btnScale = useRef(new Animated.Value(1)).current;
  const shake = useRef(new Animated.Value(0)).current;

  // Entrance — run once. Under reduce-motion everything jumps to its resting
  // state, which must still happen or the screen would render invisible.
  useEffect(() => {
    const settled: Animated.Value[] = [
      logoIn, titleIn, ...pillIns, cardIn, greetIn, accentIn, subIn,
    ];
    if (reducedMotion) {
      settled.forEach(value => value.setValue(1));
      return;
    }

    const animation = Animated.parallel([
      Animated.stagger(90, [
        Animated.spring(logoIn, {
          toValue: 1, friction: 6, tension: 48, useNativeDriver: true,
        }),
        Animated.timing(titleIn, {
          toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true,
        }),
        ...pillIns.map(value =>
          Animated.timing(value, {
            toValue: 1, duration: 360, easing: Easing.out(Easing.cubic), useNativeDriver: true,
          }),
        ),
      ]),
      // Starts while the pills are still arriving, so the card feels like it is
      // rising to meet them instead of queueing behind them.
      Animated.sequence([
        Animated.delay(180),
        Animated.spring(cardIn, {
          toValue: 1, friction: 9, tension: 52, useNativeDriver: true,
        }),
      ]),
      // The greeting lands once the card has arrived, so it reads as the card
      // speaking rather than as one more thing flying in alongside it.
      Animated.sequence([
        Animated.delay(430),
        Animated.parallel([
          Animated.spring(greetIn, {
            toValue: 1, friction: 7, tension: 58, useNativeDriver: true,
          }),
          Animated.sequence([
            Animated.delay(150),
            Animated.timing(accentIn, {
              toValue: 1, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: true,
            }),
          ]),
          Animated.sequence([
            Animated.delay(230),
            Animated.timing(subIn, {
              toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true,
            }),
          ]),
        ]),
      ]),
    ]);

    animation.start();
    return () => animation.stop();
  }, [reducedMotion, logoIn, titleIn, pillIns, cardIn, greetIn, accentIn, subIn]);

  // Ambient loops. Skipped entirely under reduce-motion — the values stay at 0,
  // where the ripples interpolate to fully transparent.
  useEffect(() => {
    if (reducedMotion) return;

    // resetBeforeIteration (the default) snaps back to 0 each pass, so one
    // timing is a whole ripple.
    const rippleLoop = (value: Animated.Value) =>
      Animated.loop(
        Animated.timing(value, {
          toValue: 1, duration: 2800, easing: Easing.out(Easing.quad), useNativeDriver: true,
        }),
      );

    const loopA = rippleLoop(rippleA);
    const loopB = rippleLoop(rippleB);
    const driftLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, {
          toValue: 1, duration: 9000, easing: Easing.inOut(Easing.sin), useNativeDriver: true,
        }),
        Animated.timing(drift, {
          toValue: 0, duration: 9000, easing: Easing.inOut(Easing.sin), useNativeDriver: true,
        }),
      ]),
    );

    // A light travelling along the accent bar under the greeting. Long pause
    // between passes — it should catch the eye once, not flicker away in the
    // corner of it while someone is typing a password.
    const sheenLoop = Animated.loop(
      Animated.sequence([
        Animated.delay(2600),
        Animated.timing(sheen, {
          toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true,
        }),
      ]),
    );

    loopA.start();
    driftLoop.start();
    sheenLoop.start();
    // Half a period late, so the two rings are always on opposite phases. A
    // delay inside the loop would push the period out to 4.2s instead.
    const phaseOffset = setTimeout(() => loopB.start(), 1400);

    return () => {
      clearTimeout(phaseOffset);
      loopA.stop();
      loopB.stop();
      driftLoop.stop();
      sheenLoop.stop();
    };
  }, [reducedMotion, rippleA, rippleB, drift, sheen]);

  // A rejected login returns the same screen with an error line that is easy to
  // miss, so the card flinches once to say the attempt was actually received.
  useEffect(() => {
    if (!error || reducedMotion) return;
    shake.setValue(0);
    Animated.sequence([
      Animated.timing(shake, { toValue: 1, duration: 55, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -1, duration: 55, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0.5, duration: 55, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0, duration: 55, useNativeDriver: true }),
    ]).start();
  }, [error, reducedMotion, shake]);

  const animateFocus = useCallback((value: Animated.Value, toValue: number) => {
    Animated.timing(value, {
      toValue,
      duration: 180,
      easing: Easing.out(Easing.quad),
      // Colour is not a transform, so this one cannot go to the native thread.
      useNativeDriver: false,
    }).start();
  }, []);

  // Pre-fill from the last "remember me" login. Runs before the user can
  // type, and never overwrites anything they have already entered.
  useEffect(() => {
    let cancelled = false;
    loadRememberedCredentials()
      .then(saved => {
        if (cancelled || !saved.remember) return;
        setUsername(prev => prev || saved.username);
        setPassword(prev => prev || saved.password);
        setRemember(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogin = async () => {
    // Marked on the fields themselves. A dialog saying "fill in all fields"
    // covers the form it is complaining about and makes the person find the
    // empty box for themselves.
    const missing: { username?: string; password?: string } = {};
    if (!username.trim()) missing.username = t('username_required', 'Enter your username');
    if (!password) missing.password = t('password_required', 'Enter your password');
    setFieldErrors(missing);
    if (missing.username || missing.password) return;

    try {
      await login({ username, password });
      // Only after the server accepts them — remembering a rejected password
      // would pre-fill a login that is guaranteed to fail.
      if (remember) {
        await saveRememberedCredentials(username, password);
      } else {
        await clearRememberedCredentials();
      }
    } catch (e) {
      Alert.alert(t('login_failed', 'Login Failed'), e instanceof Error ? e.message : t('error', 'An error occurred'));
    }
  };

  // ── Derived styles ─────────────────────────────────────────────────────────
  const rippleStyle = (value: Animated.Value) => ({
    transform: [
      { scale: value.interpolate({ inputRange: [0, 1], outputRange: [1, 2.2] }) },
    ],
    // Fades in fast, then spends the rest of the pass dissolving outward.
    opacity: value.interpolate({ inputRange: [0, 0.12, 1], outputRange: [0, 0.32, 0] }),
  });

  const fieldStyle = (value: Animated.Value) => ({
    borderColor: value.interpolate({ inputRange: [0, 1], outputRange: ['#eee', BRAND_BLUE] }),
    backgroundColor: value.interpolate({ inputRange: [0, 1], outputRange: ['#fafafa', '#F4F9FF'] }),
  });

  const riseStyle = (value: Animated.Value, distance: number) => ({
    opacity: value,
    transform: [
      { translateY: value.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] }) },
    ],
  });

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.root}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Brand hero ─────────────────────────────────────────── */}
        <View style={styles.hero}>
          {/* Decorative circles, drifting slowly so the backdrop is never
              completely still without ever pulling focus. */}
          <Animated.View
            style={[
              styles.decCircle1,
              {
                transform: [
                  { translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [0, 18] }) },
                  { translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [0, -12] }) },
                ],
              },
            ]}
          />
          <Animated.View
            style={[
              styles.decCircle2,
              {
                transform: [
                  { translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [0, -14] }) },
                  { translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [0, 10] }) },
                ],
              },
            ]}
          />

          {/* Logo, with ripples leaving it. pointerEvents none so the rings
              never sit between a tap and anything underneath. */}
          <View style={styles.logoStage} pointerEvents="none">
            <Animated.View style={[styles.ripple, rippleStyle(rippleA)]} />
            <Animated.View style={[styles.ripple, rippleStyle(rippleB)]} />
            <Animated.View
              style={[
                styles.logoRing,
                {
                  opacity: logoIn,
                  transform: [
                    { scale: logoIn.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] }) },
                  ],
                },
              ]}
            >
              <View style={styles.logoInner}>
                <Ionicons name="water" size={44} color="#fff" />
              </View>
            </Animated.View>
          </View>

          <Animated.View style={[styles.titleWrap, riseStyle(titleIn, 14)]}>
            <Text style={styles.brandName}>
              Century<Text style={{ color: '#60B4FF' }}> Sip</Text>
            </Text>
            <Text style={styles.tagline}>Pure water. Fast delivery.</Text>
          </Animated.View>

          {/* Feature pills */}
          <View style={styles.pills}>
            {FEATURE_PILLS.map((label, index) => (
              <Animated.View key={label} style={[styles.pill, riseStyle(pillIns[index], 10)]}>
                <Text style={styles.pillText}>{label}</Text>
              </Animated.View>
            ))}
          </View>
        </View>

        {/* ── Form card ──────────────────────────────────────────── */}
        <Animated.View
          style={[
            styles.card,
            {
              opacity: cardIn,
              transform: [
                { translateY: cardIn.interpolate({ inputRange: [0, 1], outputRange: [44, 0] }) },
                { translateX: shake.interpolate({ inputRange: [-1, 1], outputRange: [-9, 9] }) },
              ],
            },
          ]}
        >
          <Animated.Text
            style={[
              styles.cardTitle,
              {
                opacity: greetIn,
                transform: [
                  { translateY: greetIn.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
                  { scale: greetIn.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
                ],
              },
            ]}
          >
            {t('welcome_back', 'Welcome Back')}
          </Animated.Text>

          {/* Accent bar — draws itself out from the left under the greeting,
              then a light passes along it every few seconds. */}
          <View style={styles.accentTrack}>
            <Animated.View style={[styles.accentBar, { transform: [{ scaleX: accentIn }] }]}>
              <Animated.View
                style={[
                  styles.accentSheen,
                  {
                    transform: [
                      {
                        translateX: sheen.interpolate({
                          inputRange: [0, 1],
                          outputRange: [-ACCENT_SHEEN_W, ACCENT_W + ACCENT_SHEEN_W],
                        }),
                      },
                    ],
                    opacity: sheen.interpolate({
                      inputRange: [0, 0.15, 0.85, 1],
                      outputRange: [0, 1, 1, 0],
                    }),
                  },
                ]}
              />
            </Animated.View>
          </View>

          <Animated.Text
            style={[
              styles.cardSub,
              {
                opacity: subIn,
                transform: [
                  { translateY: subIn.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) },
                ],
              },
            ]}
          >
            {t('sign_in_continue', 'Sign in to your account')}
          </Animated.Text>

          {/* Username */}
          <Animated.View
            style={[styles.field, fieldStyle(userFocus), !!fieldErrors.username && styles.fieldInvalid]}
          >
            <View style={styles.fieldIconWrap}>
              <Ionicons name="person-outline" size={18} color={BRAND_BLUE} />
            </View>
            <TextInput
              style={styles.fieldInput}
              placeholder={t('username_placeholder', 'Username')}
              placeholderTextColor="#000"
              value={username}
              onChangeText={(v) => {
                setUsername(v);
                if (fieldErrors.username) setFieldErrors((e) => ({ ...e, username: undefined }));
              }}
              onFocus={() => animateFocus(userFocus, 1)}
              onBlur={() => animateFocus(userFocus, 0)}
              autoCapitalize="none"
              returnKeyType="next"
            />
          </Animated.View>
          <FieldError message={fieldErrors.username} />

          {/* Password */}
          <Animated.View
            style={[styles.field, fieldStyle(passFocus), !!fieldErrors.password && styles.fieldInvalid]}
          >
            <View style={styles.fieldIconWrap}>
              <Ionicons name="lock-closed-outline" size={18} color={BRAND_BLUE} />
            </View>
            <TextInput
              style={styles.fieldInput}
              placeholder={t('password_placeholder', 'Password')}
              placeholderTextColor="#000"
              value={password}
              onChangeText={(v) => {
                setPassword(v);
                if (fieldErrors.password) setFieldErrors((e) => ({ ...e, password: undefined }));
              }}
              onFocus={() => animateFocus(passFocus, 1)}
              onBlur={() => animateFocus(passFocus, 0)}
              secureTextEntry={!showPassword}
              returnKeyType="done"
              onSubmitEditing={handleLogin}
            />
            <TouchableOpacity
              onPress={() => setShowPassword(v => !v)}
              style={styles.eyeBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
            >
              <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color="#aaa" />
            </TouchableOpacity>
          </Animated.View>
          <FieldError message={fieldErrors.password} />

          {/* Remember me — unticking it wipes anything already saved, so the
              box doubles as the way to forget a shared device. */}
          <TouchableOpacity
            style={styles.rememberRow}
            onPress={() => {
              const next = !remember;
              setRemember(next);
              if (!next) clearRememberedCredentials();
            }}
            activeOpacity={0.7}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: remember }}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <View style={[styles.checkbox, remember && styles.checkboxOn]}>
              {remember && <Ionicons name="checkmark" size={14} color="#fff" />}
            </View>
            <View style={styles.rememberTextWrap}>
              <Text style={styles.rememberText}>
                {t('remember_me', 'Remember me')}
              </Text>
              <Text style={styles.rememberHint}>
                {t('remember_me_hint', 'Stay filled in after you sign out. Use only on your own device.')}
              </Text>
            </View>
          </TouchableOpacity>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {/* Login button — presses in slightly so the tap is acknowledged
              before the network round trip has anything to show for it. */}
          <Animated.View style={{ transform: [{ scale: btnScale }] }}>
            <TouchableOpacity
              style={[styles.loginBtn, isLoading && styles.loginBtnDisabled]}
              onPress={handleLogin}
              onPressIn={() =>
                Animated.spring(btnScale, {
                  toValue: 0.97, friction: 7, tension: 220, useNativeDriver: true,
                }).start()
              }
              onPressOut={() =>
                Animated.spring(btnScale, {
                  toValue: 1, friction: 5, tension: 180, useNativeDriver: true,
                }).start()
              }
              disabled={isLoading}
              activeOpacity={0.9}
            >
              {isLoading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.loginBtnText}>{t('login_btn', 'Sign In')}</Text>
              }
            </TouchableOpacity>
          </Animated.View>

          {IS_GOOGLE_SIGNIN_CONFIGURED && (
            <>
              {/* Divider */}
              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerOr}>OR</Text>
                <View style={styles.dividerLine} />
              </View>

              <GoogleSignInButton
                label="Continue with Google"
                failureTitle="Google Sign-In Failed"
                style={styles.googleBtn}
                textStyle={styles.googleText}
                disabled={isLoading}
              />
            </>
          )}

          {/* Register link */}
          <TouchableOpacity
            style={styles.registerLink}
            onPress={() => navigation.navigate('Register')}
          >
            <Text style={styles.registerText}>
              {t('no_account_signup', "Don't have an account?")}{' '}
              <Text style={{ color: BRAND_BLUE, fontWeight: '700' }}>Sign Up</Text>
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

export default LoginScreen;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BRAND_DARK },
  scroll: { flexGrow: 1 },

  // ── Hero ──────────────────────────────────────────────────────────────────
  hero: {
    backgroundColor: BRAND_DARK,
    minHeight: SCREEN_H * 0.42,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 56,
    paddingBottom: 36,
    overflow: 'hidden',
  },
  // Decorative background circles
  decCircle1: {
    position: 'absolute', width: 280, height: 280, borderRadius: 140,
    backgroundColor: `${BRAND_BLUE}18`,
    top: -60, right: -60,
  },
  decCircle2: {
    position: 'absolute', width: 180, height: 180, borderRadius: 90,
    backgroundColor: `${BRAND_BLUE}10`,
    bottom: 0, left: -40,
  },
  // Fixed box so the absolutely-positioned ripples have something to centre on.
  logoStage: {
    width: 110, height: 110,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 18,
  },
  ripple: {
    position: 'absolute',
    width: 110, height: 110, borderRadius: 55,
    borderWidth: 1.5,
    borderColor: BRAND_BLUE,
  },
  logoRing: {
    width: 110, height: 110, borderRadius: 55,
    borderWidth: 2, borderColor: `${BRAND_BLUE}40`,
    alignItems: 'center', justifyContent: 'center',
  },
  logoInner: {
    width: 86, height: 86, borderRadius: 43,
    backgroundColor: BRAND_BLUE,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: BRAND_BLUE,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.55,
    shadowRadius: 16,
    elevation: 14,
  },
  titleWrap: { alignItems: 'center' },
  brandName: {
    fontSize: 34, fontWeight: '900', color: '#fff',
    letterSpacing: -0.5, marginBottom: 6,
  },
  tagline: {
    fontSize: 14, color: 'rgba(255,255,255,0.45)',
    letterSpacing: 0.4, marginBottom: 24,
  },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', paddingHorizontal: 16 },
  pill: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5,
  },
  pillText: { fontSize: 12, color: 'rgba(255,255,255,0.65)', fontWeight: '500' },

  // ── Form card ─────────────────────────────────────────────────────────────
  card: {
    flex: 1,
    backgroundColor: '#fff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 28,
    paddingBottom: 40,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 8,
  },
  cardTitle: { fontSize: 24, fontWeight: '800', color: '#1a1a1a', marginBottom: 2 },
  // alignSelf keeps the track the width of the bar, so the sheen is clipped to
  // the bar rather than travelling the whole card.
  accentTrack: { alignSelf: 'flex-start', marginTop: 9, marginBottom: 12 },
  accentBar: {
    width: ACCENT_W, height: 3, borderRadius: 2,
    backgroundColor: BRAND_BLUE,
    overflow: 'hidden',
    // Without this the bar would grow from its centre outwards; it should be
    // drawn on, left to right, like an underline.
    transformOrigin: 'left center',
  },
  accentSheen: {
    position: 'absolute', top: 0, bottom: 0,
    width: ACCENT_SHEEN_W,
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  cardSub: { fontSize: 14, color: '#999', marginBottom: 24 },

  // ── Fields ────────────────────────────────────────────────────────────────
  field: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderColor: '#eee',
    borderRadius: 14, backgroundColor: '#fafafa',
    marginBottom: 14, paddingHorizontal: 4,
  },
  fieldIconWrap: {
    width: 42, height: 52, alignItems: 'center', justifyContent: 'center',
  },
  fieldInvalid: {
    borderColor: '#D93025',
    backgroundColor: '#FFF7F7',
  },
  fieldInput: {
    flex: 1, height: 52, fontSize: 15, color: '#000',
    paddingRight: 12,
  },
  eyeBtn: { paddingHorizontal: 12 },

  errorText: {
    color: '#FF3B30', fontSize: 13, textAlign: 'center',
    marginBottom: 10, marginTop: -4,
  },

  // ── Remember me ───────────────────────────────────────────────────────────
  rememberRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 16,
    marginTop: 2,
  },
  checkbox: {
    width: 20, height: 20, borderRadius: 5,
    borderWidth: 1.5, borderColor: '#c7c7cc',
    alignItems: 'center', justifyContent: 'center',
    marginTop: 1,
  },
  checkboxOn: { backgroundColor: BRAND_BLUE, borderColor: BRAND_BLUE },
  rememberTextWrap: { flex: 1 },
  rememberText: { fontSize: 14, color: '#333', fontWeight: '500' },
  rememberHint: { fontSize: 11, color: '#999', marginTop: 2 },

  // ── Login button ──────────────────────────────────────────────────────────
  loginBtn: {
    backgroundColor: BRAND_BLUE,
    borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', marginTop: 4,
    shadowColor: BRAND_BLUE,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  loginBtnDisabled: { opacity: 0.6 },
  loginBtnText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },

  // ── Divider ───────────────────────────────────────────────────────────────
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 20, gap: 10 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#eee' },
  dividerOr: { fontSize: 12, color: '#bbb', fontWeight: '700' },

  // ── Google ────────────────────────────────────────────────────────────────
  googleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, borderWidth: 1.5, borderColor: '#eee',
    borderRadius: 14, paddingVertical: 14, backgroundColor: '#fff',
  },
  googleG: { fontSize: 17, fontWeight: '900', color: '#EA4335' },
  googleText: { fontSize: 15, fontWeight: '600', color: '#333' },

  // ── Register link ─────────────────────────────────────────────────────────
  registerLink: { alignItems: 'center', marginTop: 20 },
  registerText: { fontSize: 14, color: '#888' },
});
