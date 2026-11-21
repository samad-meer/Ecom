import { colors, radius, card, pagePadding, shadow, space } from '../theme';
import React, { useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, Modal, ActivityIndicator, Animated, Easing,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthContext } from '../context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';
import { useLanguage } from '../context/LanguageContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { KeyboardAwareScrollView } from '../components/KeyboardAwareScrollView';
import { FieldError } from '../components/FormField';
import { ErrorState, StatusPill, friendlyError } from '../components/ui';
import { authService } from '../services/authService';
import { CustomerAddress, Pin, addressService, formatPin } from '../services/addressService';
import { AddressPinMap } from '../components/AddressPinMap';
import { API_URL } from '../constants/config';
import { canWhatsApp, openWhatsApp } from '../utils/whatsapp';
import { shareLocation, toMapPin } from '../utils/maps';
import { getCurrentPin, openAppSettings } from '../utils/deviceLocation';
import { useBrand } from '../context/BrandContext';

const BRAND_BLUE = colors.primary;
const BRAND_DARK = colors.ink;
const PAGE_BG = colors.bg;

interface BusinessContact {
  name: string;
  phone: string | null;
  address: string | null;
  /** Business-wide default for a shared work-place location, set in the web
   *  admin's Settings page. Blank means "<name> — work place". */
  share_location_label?: string;
}

// ── Field config types ────────────────────────────────────────────────────────

interface FieldConfig {
  visible: boolean;
  editable: boolean;
  label: string;
}

type ProfileConfig = Record<string, FieldConfig>;

// All fields the profile screen can show, in display order
const ALL_FIELDS: { key: string; multiline?: boolean; keyboard?: 'default' | 'phone-pad' | 'numeric' | 'decimal-pad' }[] = [
  { key: 'username' },
  { key: 'first_name' },
  { key: 'last_name' },
  { key: 'phone_number', keyboard: 'phone-pad' },
  { key: 'address', multiline: true },
  { key: 'emergency_contact', keyboard: 'phone-pad' },
  { key: 'employee_id' },
  { key: 'designation' },
  { key: 'department' },
  { key: 'vehicle_type' },
  { key: 'vehicle_number' },
  { key: 'cnic_number' },
  { key: 'date_of_birth' },
  { key: 'date_of_joining' },
  { key: 'salary', keyboard: 'decimal-pad' },
  { key: 'remarks', multiline: true },
];

// Editable fields the profile PATCH endpoint accepts
const EDITABLE_KEYS = new Set(['username', 'first_name', 'last_name', 'phone_number', 'address', 'emergency_contact']);

// ── Fetch helper ─────────────────────────────────────────────────────────────

// Throws with the reason instead of returning null: "no config" and "the
// request failed" must not look alike, or a rider whose profile fields did not
// load would just see an empty screen with no way to tell why.
//
// It also gives up after a while. The first load blocks the whole screen behind
// a spinner, so a request that never answers would leave a rider staring at it
// forever instead of reaching the error card with its retry button.
const CONFIG_TIMEOUT_MS = 15000;

async function fetchProfileConfig(token: string): Promise<ProfileConfig | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONFIG_TIMEOUT_MS);
  try {
    const res = await fetch(`${API_URL}/auth/mobile-profile-config/`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`The server could not send your profile fields (error ${res.status}).`);
    }
    const data = await res.json();
    if (!data?.fields) throw new Error('The server did not send your profile fields.');
    return data.fields;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * A failure reason that is safe to print. A server error page comes back as raw
 * HTML, and showing a page of markup inside a small card breaks the screen.
 */
const readableReason = (raw?: string | null): string => {
  const text = friendlyError(raw);
  return /<\/?[a-z][^>]*>/i.test(text) || text.length > 200
    ? 'The server sent an unexpected reply. Please try again.'
    : text;
};

// ── Presentational bits ───────────────────────────────────────────────────────

/** Fade up into place. Shared by every section so the cascade stays uniform. */
const riseStyle = (value: Animated.Value, distance = 18) => ({
  opacity: value,
  transform: [
    { translateY: value.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] }) },
  ],
});

/**
 * The tinted rounded square in front of a section title or menu row. Carries
 * the colour coding that lets someone find "the green one" without reading.
 */
const IconChip: React.FC<{
  name: keyof typeof Ionicons.glyphMap;
  color: string;
  bg: string;
}> = ({ name, color, bg }) => (
  <View style={[styles.chip, { backgroundColor: bg }]}>
    <Ionicons name={name} size={18} color={color} />
  </View>
);

const MenuRow: React.FC<{
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  bg: string;
  label: string;
  onPress: () => void;
  divided?: boolean;
}> = ({ icon, color, bg, label, onPress, divided }) => (
  <TouchableOpacity
    style={[styles.menuRow, divided && styles.divided]}
    onPress={onPress}
    activeOpacity={0.6}
    accessibilityRole="button"
  >
    <IconChip name={icon} color={color} bg={bg} />
    <Text style={styles.menuLabel}>{label}</Text>
    <Ionicons name="chevron-forward" size={20} color={colors.muted} />
  </TouchableOpacity>
);

// ── Component ─────────────────────────────────────────────────────────────────

export const ProfileScreen = () => {
  const { user, token, updateProfile, logout } = useContext(AuthContext);
  const { language, setLanguage, t, urduEnabled } = useLanguage();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const reducedMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
  const { name: brandName } = useBrand();

  const [form, setForm] = useState<Record<string, string>>({});
  const [isEditing, setIsEditing] = useState(false);
  const [config, setConfig] = useState<ProfileConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(false);
  // Why the rider/staff field list could not be loaded, if it could not. Bumping
  // the nonce re-runs the focus effect below for the retry button.
  const [configError, setConfigError] = useState<string | null>(null);
  const [configNonce, setConfigNonce] = useState(0);

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  // Keyed by field so the message lands on the box at fault.
  const [pwErrors, setPwErrors] = useState<Record<string, string>>({});
  const [business, setBusiness] = useState<BusinessContact | null>(null);

  // Summary of the address book, for the card that replaces the old free-text
  // address field. `addressError` is tracked separately because an empty list
  // and a failed request must not look the same — "you have no address" would
  // push the customer to re-add one they already have.
  const [defaultAddress, setDefaultAddress] = useState<CustomerAddress | null>(null);
  const [addressCount, setAddressCount] = useState(0);
  const [addressLoading, setAddressLoading] = useState(true);
  // The reason the book could not be read; null means it loaded fine.
  const [addressError, setAddressError] = useState<string | null>(null);

  // The admin's work place pin. Saved the moment it changes rather than behind
  // the Edit/Save cycle — "add my location" should be one tap, not four.
  const [pin, setPin] = useState<Pin | null>(null);
  const [pinSaving, setPinSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [pinNotice, setPinNotice] = useState<{ message: string; canOpenSettings?: boolean } | null>(null);
  // The name that goes out with the shared link. Held locally while it is being
  // typed and committed on blur, so every keystroke is not a PATCH.
  const [placeLabel, setPlaceLabel] = useState('');
  const [labelSaving, setLabelSaving] = useState(false);

  const isStaff = user?.user_type === 'delivery_boy' || user?.user_type === 'staff';
  // Django's is_staff, i.e. an administrator — not the same thing as `isStaff`
  // above, which means "employed as a rider or office staff".
  const isAdmin = user?.is_staff === true;
  // Admins share this screen (it is mounted in both tab navigators), so a
  // customer is anyone who is neither staff nor an admin.
  const isCustomer = !isStaff && user?.is_staff !== true;

  // ── Animation ──────────────────────────────────────────────────────────────
  const heroIn = useRef(new Animated.Value(0)).current;
  const infoIn = useRef(new Animated.Value(0)).current;
  const addressIn = useRef(new Animated.Value(0)).current;
  const locationIn = useRef(new Animated.Value(0)).current;
  const langIn = useRef(new Animated.Value(0)).current;
  const actionsIn = useRef(new Animated.Value(0)).current;
  const drift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const settled = [heroIn, infoIn, addressIn, locationIn, langIn, actionsIn];
    if (reducedMotion) {
      // Settled, not skipped — leaving these at 0 would render a blank screen.
      settled.forEach(value => value.setValue(1));
      return;
    }
    const animation = Animated.stagger(
      70,
      settled.map(value =>
        Animated.timing(value, {
          toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true,
        }),
      ),
    );
    animation.start();
    return () => animation.stop();
  }, [reducedMotion, heroIn, infoIn, addressIn, locationIn, langIn, actionsIn]);

  // Slow drift on the hero's background circles, matching the login screen.
  useEffect(() => {
    if (reducedMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, {
          toValue: 1, duration: 9000, easing: Easing.inOut(Easing.sin), useNativeDriver: true,
        }),
        Animated.timing(drift, {
          toValue: 0, duration: 9000, easing: Easing.inOut(Easing.sin), useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reducedMotion, drift]);

  // Business contact for the WhatsApp button. Served from the backend rather
  // than baked into the build so the number can change without a new release.
  useEffect(() => {
    fetch(`${API_URL}/ledger/business/`)
      .then(res => (res.ok ? res.json() : null))
      .then(data => data && setBusiness(data))
      .catch(() => { /* the button simply stays hidden */ });
  }, []);

  // Populate form from user
  useEffect(() => {
    if (!user) return;
    const initial: Record<string, string> = {};
    ALL_FIELDS.forEach(({ key }) => {
      initial[key] = String((user as any)[key] ?? '');
    });
    setForm(initial);
  }, [user]);

  // Field config for staff/riders, refreshed every time the screen is focused.
  //
  // A plain mount effect is not enough: a bottom-tab screen stays mounted once
  // visited, so the config fetched at launch would be the config forever. An
  // admin hiding or locking a field would not reach the rider until they
  // killed and reopened the app.
  const hasLoadedConfig = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!isStaff || !token) return;
      let cancelled = false;
      const firstLoad = !hasLoadedConfig.current;
      // Only the first load blocks the screen; later refreshes are silent so
      // returning to the tab does not flash a spinner.
      if (firstLoad) setConfigLoading(true);

      fetchProfileConfig(token)
        .then(next => {
          if (cancelled) return;
          // Keep the last good config when a refresh fails — blanking it would
          // hide every field the rider is legitimately allowed to see.
          if (next) setConfig(next);
          setConfigError(null);
          hasLoadedConfig.current = true;
        })
        .catch(e => {
          if (cancelled) return;
          setConfigError(e?.message ?? '');
          hasLoadedConfig.current = true;
        })
        .finally(() => {
          if (!cancelled && firstLoad) setConfigLoading(false);
        });

      return () => {
        cancelled = true;
      };
    }, [isStaff, token, configNonce]),
  );

  // The address book is the customer's real address store, so this screen only
  // summarises it. Re-read on focus rather than on mount: a tab screen stays
  // mounted once visited, so an address added or promoted in the book — or at
  // checkout — would otherwise never reach the card.
  useFocusEffect(
    useCallback(() => {
      if (!isCustomer) return;
      // Nothing to fetch without a token, but the card must not sit on
      // "Loading…" forever because of it.
      if (!token) {
        setAddressLoading(false);
        return;
      }
      let cancelled = false;

      addressService
        .list()
        .then(list => {
          if (cancelled) return;
          // The API already sorts default-first, but pick it explicitly: the
          // badge below claims "Default" and must not claim it of a fallback.
          setDefaultAddress(list.find(a => a.is_default) ?? list[0] ?? null);
          setAddressCount(list.length);
          setAddressError(null);
        })
        .catch(e => !cancelled && setAddressError(e?.message ?? ''))
        .finally(() => !cancelled && setAddressLoading(false));

      return () => {
        cancelled = true;
      };
    }, [isCustomer, token]),
  );

  const getFieldConfig = (key: string): FieldConfig | null => {
    if (!isStaff) {
      // Customers: show first_name, last_name, phone_number
      const customerFields: Record<string, FieldConfig> = {
        username:     { visible: true, editable: true, label: 'Username' },
        first_name:   { visible: true, editable: true, label: t('first_name', 'First Name') },
        last_name:    { visible: true, editable: true, label: t('last_name', 'Last Name') },
        phone_number: { visible: true, editable: true, label: 'Phone Number' },
        // A customer's delivery address lives in the address book — several
        // labelled entries, each with an optional map pin, and one of them the
        // default checkout actually uses. A free-text box here would be a
        // second copy that silently disagrees with it, so the card below links
        // to the book instead.
        //
        // Admins share this screen and reach this branch too. Nothing is ever
        // delivered *to* an admin, so for them the same field is where the
        // business operates from — the address they hand out to suppliers and
        // walk-in customers.
        ...(isCustomer
          ? {}
          : { address: { visible: true, editable: true, label: 'Work Place Address' } }),
      };
      return customerFields[key] ?? null;
    }
    return config?.[key] ?? null;
  };

  const visibleFields = ALL_FIELDS.filter(({ key }) => {
    const cfg = getFieldConfig(key);
    return cfg?.visible === true;
  });

  const handleUpdate = async () => {
    const payload: Record<string, string> = {};
    visibleFields.forEach(({ key }) => {
      const cfg = getFieldConfig(key);
      if (cfg?.editable && EDITABLE_KEYS.has(key)) {
        payload[key] = form[key] ?? '';
      }
    });
    try {
      await updateProfile(payload);
      setIsEditing(false);
      Alert.alert('Success', 'Profile updated successfully');
    } catch (e: any) {
      Alert.alert('Error', readableReason(e?.message));
    }
  };

  // Seed the pin from the server, and re-seed after every save so the screen
  // shows what was actually stored rather than what we hoped would be.
  useEffect(() => {
    const stored = toMapPin(user?.customer_latitude, user?.customer_longitude);
    setPin(stored ? { latitude: stored.latitude, longitude: stored.longitude } : null);
  }, [user?.customer_latitude, user?.customer_longitude]);

  useEffect(() => {
    setPlaceLabel(user?.work_place_label ?? '');
  }, [user?.work_place_label]);

  /**
   * What the shared message is titled, most specific first:
   *   1. this admin's own name for the place, set below;
   *   2. the business-wide default from web admin → Settings → Shared Location;
   *   3. "<business name> — work place", so a share is never a bare "Location".
   */
  const businessDefault =
    business?.share_location_label?.trim() || `${business?.name || 'Century Sip'} — work place`;
  const shareTitle = placeLabel.trim() || businessDefault;

  const saveLabel = async () => {
    const next = placeLabel.trim();
    if (next === (user?.work_place_label ?? '')) return;
    setLabelSaving(true);
    try {
      await updateProfile({ work_place_label: next });
    } catch (e: any) {
      // Put back what is actually stored rather than leaving an edit on screen
      // that looks saved but is not.
      setPlaceLabel(user?.work_place_label ?? '');
      Alert.alert('Not saved', `Could not save the name. ${readableReason(e?.message)}`);
    } finally {
      setLabelSaving(false);
    }
  };

  /**
   * Persist a pin immediately. Both coordinates travel together or the
   * serializer rejects the pair, and null/null is how a pin is cleared.
   */
  const savePin = async (next: Pin | null) => {
    setPinSaving(true);
    setPinNotice(null);
    try {
      await updateProfile({
        customer_latitude: next ? next.latitude.toFixed(6) : null,
        customer_longitude: next ? next.longitude.toFixed(6) : null,
      });
      setPin(next);
    } catch (e: any) {
      setPinNotice({ message: `Could not save the location. ${readableReason(e?.message)}` });
    } finally {
      setPinSaving(false);
    }
  };

  // The one-tap path, and the only one that works without a Maps key — without
  // it an admin has no way to attach a location at all.
  const handleUseCurrentLocation = async () => {
    setLocating(true);
    setPinNotice(null);
    const result = await getCurrentPin();
    setLocating(false);
    if (result.ok) await savePin(result.pin);
    else setPinNotice({ message: result.message, canOpenSettings: result.canOpenSettings });
  };

  // Send the work place to someone who does not have this app — a supplier, a
  // walk-in customer, a courier. Uses the live pin and the address currently on
  // screen, so a location just dropped goes out with it.
  const handleShareWorkplace = () => {
    shareLocation({
      pin: pin ? { ...pin, title: shareTitle } : null,
      // The admin's own work-place address if they have set one, else the
      // business address from the ledger settings — without this the share is
      // a bare link, which is exactly what it looked like before.
      address: form.address || user?.address || business?.address || null,
      title: shareTitle,
    });
  };

  const handleCancelEdit = () => {
    if (!user) return;
    const reset: Record<string, string> = {};
    ALL_FIELDS.forEach(({ key }) => { reset[key] = String((user as any)[key] ?? ''); });
    setForm(reset);
    setIsEditing(false);
  };

  const handleChangePassword = async () => {
    // Shown against the field, not in a dialog. "New passwords do not match"
    // as a popup is the worst of the three: it has to be dismissed before the
    // person can even see the two boxes it is talking about.
    const errors: Record<string, string> = {};
    if (!oldPassword) errors['Current Password'] = 'Enter your current password';
    if (!newPassword) errors['New Password'] = 'Enter a new password';
    else if (newPassword.length < 8) errors['New Password'] = 'Use at least 8 characters';
    if (!confirmPassword) errors['Confirm New Password'] = 'Repeat the new password';
    else if (newPassword && newPassword !== confirmPassword) {
      errors['Confirm New Password'] = 'This does not match the new password';
    }
    setPwErrors(errors);
    if (Object.keys(errors).length) return;
    setPasswordLoading(true);
    try {
      await authService.changePassword(token!, oldPassword, newPassword);
      setShowPasswordModal(false);
      setOldPassword(''); setNewPassword(''); setConfirmPassword('');
      Alert.alert('Success', 'Password changed successfully');
    } catch (e: any) {
      let message = 'Failed to change password';
      try {
        const err = JSON.parse(e.message);
        message = err.detail || err.old_password?.[0] || err.new_password?.[0] || message;
      } catch { message = readableReason(e?.message); }
      Alert.alert('Error', message);
    } finally {
      setPasswordLoading(false);
    }
  };

  // One way out of the password sheet, shared by the X and the Android back
  // button, so a half-typed password or an old error never greets the next open.
  const closePasswordModal = () => {
    setShowPasswordModal(false);
    setOldPassword(''); setNewPassword(''); setConfirmPassword('');
    setPwErrors({});
  };

  const confirmLogout = () => {
    Alert.alert(
      t('logout', 'Logout'),
      'You will need to sign in again to place or manage orders.',
      [
        { text: t('cancel', 'Cancel'), style: 'cancel' },
        { text: t('logout', 'Logout'), style: 'destructive', onPress: logout },
      ],
    );
  };

  const hasAnyEditable = visibleFields.some(({ key }) => {
    const cfg = getFieldConfig(key);
    return cfg?.editable && EDITABLE_KEYS.has(key);
  });

  if (configLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={BRAND_BLUE} />
      </View>
    );
  }

  // Two initials where there is a real name, one otherwise — never the blank
  // circle an empty profile would otherwise show.
  const initials = (
    [user?.first_name, user?.last_name].filter(Boolean).map(n => n![0]).join('')
    || user?.username?.[0]
    || '?'
  ).toUpperCase().slice(0, 2);

  const roleLabel = isAdmin
    ? 'Administrator'
    : user?.user_type === 'delivery_boy'
      ? 'Rider'
      : user?.user_type === 'staff'
        ? 'Staff'
        : 'Customer';

  const fullName = [user?.first_name, user?.last_name].filter(Boolean).join(' ');

  return (
    <KeyboardAwareScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      extraBottomSpace={32}
    >
      {/* ── Top Header ────────────────────────────────────────────── */}
      <View style={[styles.topBar, { paddingTop: Math.max(insets.top, 14) }]}>
        <View style={styles.topBarTextWrap}>
          <Text style={styles.topBarTitle}>{t('profile', 'My Profile')}</Text>
          <View style={styles.brandRow}>
            <Ionicons name="water" size={13} color={colors.primary} />
            <Text style={styles.brandSubtitle}>{brandName}</Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.topLogoutBtn}
          onPress={confirmLogout}
          accessibilityLabel={t('logout', 'Logout')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="log-out-outline" size={20} color={colors.danger} />
        </TouchableOpacity>
      </View>

      {/* ── Profile Identity Card ──────────────────────────────────── */}
      <Animated.View style={[styles.profileCard, riseStyle(heroIn, 10)]}>
        <View style={styles.profileCardMain}>
          <View style={styles.avatarWrap}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            <View style={[styles.avatarBadge, isAdmin && styles.avatarBadgeAdmin]}>
              <Ionicons
                name={isAdmin ? 'shield-checkmark' : 'checkmark-circle'}
                size={12}
                color={isAdmin ? colors.ink : colors.white}
              />
            </View>
          </View>

          <View style={styles.profileMeta}>
            <Text style={styles.profileName} numberOfLines={1}>
              {fullName || user?.username}
            </Text>
            <Text style={styles.profileHandle}>
              @{user?.username}
            </Text>

            <View style={styles.chipsRow}>
              <View style={[styles.roleChip, isAdmin && styles.roleChipAdmin]}>
                <Ionicons
                  name={isAdmin ? 'shield-checkmark' : 'person'}
                  size={11}
                  color={isAdmin ? colors.ink : colors.primaryDark}
                />
                <Text style={[styles.roleChipText, isAdmin && styles.roleChipTextAdmin]}>
                  {roleLabel}
                </Text>
              </View>

              <View style={styles.statusChip}>
                <View style={styles.statusDot} />
                <Text style={styles.statusText}>Active</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Info strip */}
        <View style={styles.profileFooter}>
          <View style={styles.footerItem}>
            <Ionicons name="mail-outline" size={14} color={colors.muted} />
            <Text style={styles.footerItemText} numberOfLines={1}>
              {user?.email || 'No email on file'}
            </Text>
          </View>
          {isCustomer && user?.account_balance != null && (
            <View style={[styles.footerItem, { justifyContent: 'flex-end' }]}>
              <Ionicons name="wallet-outline" size={14} color={colors.success} />
              <Text style={[styles.footerItemText, { color: colors.success, fontWeight: '700' }]}>
                PKR {user.account_balance}
              </Text>
            </View>
          )}
        </View>
      </Animated.View>

      {/* ── Personal information ─────────────────────────────────────────── */}
      {/* A rider's field list comes from the server. If that request failed and
          nothing was ever loaded, say so here rather than showing no section. */}
      {isStaff && !config && configError !== null && (
        <Animated.View style={[styles.section, riseStyle(infoIn)]}>
          <View style={styles.sectionHeader}>
            <IconChip name="person" color={BRAND_BLUE} bg={colors.primaryTint} />
            <Text style={styles.sectionTitle}>{t('personal_info', 'Personal Information')}</Text>
          </View>
          <ErrorState
            title="Could not load your details"
            message={readableReason(configError)}
            style={styles.stateInCard}
            onRetry={() => {
              // Back to a first load, so the spinner shows while it retries.
              hasLoadedConfig.current = false;
              setConfigError(null);
              setConfigNonce(n => n + 1);
            }}
          />
        </Animated.View>
      )}

      {visibleFields.length > 0 && (
        <Animated.View style={[styles.section, riseStyle(infoIn)]}>
          <View style={styles.sectionHeader}>
            <IconChip name="person" color={BRAND_BLUE} bg={colors.primaryTint} />
            <Text style={styles.sectionTitle}>{t('personal_info', 'Personal Information')}</Text>
            {hasAnyEditable && (
              <TouchableOpacity
                onPress={isEditing ? handleCancelEdit : () => setIsEditing(true)}
                style={[styles.editBtn, isEditing && styles.editBtnMuted]}
                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                accessibilityRole="button"
                accessibilityLabel={isEditing ? 'Cancel editing' : 'Edit profile'}
              >
                <Ionicons
                  name={isEditing ? 'close' : 'create-outline'}
                  size={17}
                  color={isEditing ? colors.textSecondary : colors.primaryDark}
                />
                <Text style={[styles.editBtnText, isEditing && styles.editBtnTextMuted]}>
                  {isEditing ? t('cancel', 'Cancel') : t('edit', 'Edit')}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {visibleFields.map(({ key, multiline, keyboard }, index) => {
            const cfg = getFieldConfig(key)!;
            const isFieldEditable = isEditing && cfg.editable && EDITABLE_KEYS.has(key);
            const value = form[key] ?? '';
            return (
              <View key={key} style={[styles.fieldRow, index > 0 && styles.divided]}>
                <Text style={styles.fieldLabel}>{cfg.label}</Text>

                {/* Read mode shows plain text. The old screen rendered a
                    disabled TextInput even when nothing was editable, which put
                    an input box around every value and made the whole screen
                    look like a form nobody could use. */}
                {isFieldEditable ? (
                  <TextInput
                    style={[styles.input, multiline && styles.multilineInput]}
                    value={value}
                    onChangeText={(v) => setForm((p) => ({ ...p, [key]: v }))}
                    placeholder={cfg.label}
                    placeholderTextColor={colors.muted}
                    multiline={multiline}
                    numberOfLines={multiline ? 2 : 1}
                    keyboardType={keyboard ?? 'default'}
                  />
                ) : (
                  <Text style={[styles.fieldValue, !value && styles.fieldValueEmpty]}>
                    {value || '—'}
                  </Text>
                )}

              </View>
            );
          })}

          {isEditing && (
            <TouchableOpacity style={styles.saveButton} onPress={handleUpdate} activeOpacity={0.9}>
              <Ionicons name="checkmark-circle" size={20} color={colors.white} />
              <Text style={styles.saveButtonText}>{t('save_changes', 'Save Changes')}</Text>
            </TouchableOpacity>
          )}
        </Animated.View>
      )}

      {/* ── Delivery address (customers) ──────────────────────────────────────
          A read-only summary of the default entry, tapping through to the book
          where it can actually be edited. Its own section rather than a row in
          the form above: it is not saved by "Save Changes", and sitting under
          that button would imply it was. */}
      {isCustomer && (
        <Animated.View style={[styles.section, riseStyle(addressIn)]}>
          <View style={styles.sectionHeader}>
            <IconChip name="location" color={colors.success} bg={colors.successBg} />
            <Text style={styles.sectionTitle}>{t('delivery_address', 'Delivery Address')}</Text>
          </View>

          <TouchableOpacity
            style={styles.addressCard}
            onPress={() => navigation.navigate('AddressBook')}
            activeOpacity={0.6}
            accessibilityRole="button"
            accessibilityLabel={t('delivery_addresses', 'Delivery Addresses')}
          >
            <View style={styles.addressBody}>
              {addressLoading ? (
                <Text style={styles.addressMuted}>Loading…</Text>
              ) : addressError !== null ? (
                <>
                  <Text style={styles.addressTitle}>
                    {t('delivery_addresses', 'Delivery Addresses')}
                  </Text>
                  <Text style={styles.addressMuted}>
                    Could not load them just now — tap to open.
                  </Text>
                  <Text style={styles.addressReason}>{readableReason(addressError)}</Text>
                </>
              ) : defaultAddress ? (
                <>
                  <View style={styles.addressTitleRow}>
                    <Text style={styles.addressTitle}>{defaultAddress.display_label}</Text>
                    {defaultAddress.is_default && <StatusPill label="Default" tone="primary" />}
                  </View>
                  <Text style={styles.addressLine}>{defaultAddress.address}</Text>
                  <View style={styles.addressMetaRow}>
                    <Ionicons
                      name={defaultAddress.has_pin ? 'navigate-circle' : 'navigate-circle-outline'}
                      size={15}
                      color={defaultAddress.has_pin ? colors.success : colors.muted}
                    />
                    <Text style={styles.addressMeta}>
                      {defaultAddress.has_pin ? 'Map pin set' : 'No map pin'}
                      {addressCount > 1 ? ` · ${addressCount} saved` : ''}
                    </Text>
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.addressTitle}>No delivery address yet</Text>
                  <Text style={styles.addressMuted}>
                    Add one so checkout does not have to ask every time.
                  </Text>
                </>
              )}
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.muted} />
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* ── Work place location (admins) ──────────────────────────────────────
          Only the admin's work place is meant to be handed out; a rider's
          address is their home and is nobody else's to send. Everything here
          saves on the spot, so attaching a location is one tap rather than
          Edit → type coordinates → Save. */}
      {isAdmin && (
        <Animated.View style={[styles.section, riseStyle(locationIn)]}>
          <View style={styles.sectionHeader}>
            <IconChip name="navigate" color={colors.success} bg={colors.successBg} />
            <Text style={styles.sectionTitle}>Work Place Location</Text>
          </View>

          {/* The name that travels with the link. Committed on blur rather than
              per keystroke, and left blank to fall back to the business name. */}
          <View style={styles.labelField}>
            <View style={styles.labelHeadRow}>
              <Text style={styles.fieldLabel}>Name shown when sharing</Text>
              {labelSaving && <ActivityIndicator size="small" color={BRAND_BLUE} />}
            </View>
            <TextInput
              style={styles.input}
              value={placeLabel}
              onChangeText={setPlaceLabel}
              onBlur={saveLabel}
              onSubmitEditing={saveLabel}
              returnKeyType="done"
              placeholder={businessDefault}
              placeholderTextColor={colors.muted}
              maxLength={120}
            />
            <Text style={styles.fieldHint}>
              Leave blank to use the business default set by your admin panel.
            </Text>
          </View>

          {/* Renders a draggable map where the build has a Maps key, and an
              honest placeholder where it does not — which is the case here
              until GOOGLE_MAPS_API_KEY is set. The button below works either way. */}
          <AddressPinMap pin={pin} onChange={savePin} style={styles.map} />

          <View style={styles.pinRow}>
            <Ionicons
              name={pin ? 'location' : 'location-outline'}
              size={15}
              color={pin ? colors.success : colors.muted}
            />
            <Text style={[styles.pinValue, pin ? styles.pinValueMono : styles.pinValueEmpty]}>
              {pin ? formatPin(pin) : 'No location saved yet.'}
            </Text>
            {pinSaving && <ActivityIndicator size="small" color={BRAND_BLUE} />}
          </View>

          <View style={styles.pinActions}>
            <TouchableOpacity
              style={[styles.primaryPill, (locating || pinSaving) && styles.pillBusy]}
              onPress={handleUseCurrentLocation}
              disabled={locating || pinSaving}
              activeOpacity={0.9}
            >
              {locating
                ? <ActivityIndicator size="small" color={colors.white} />
                : <Ionicons name="locate" size={18} color={colors.white} />}
              <Text style={styles.primaryPillText}>
                {locating ? 'Finding you…' : 'Use my current location'}
              </Text>
            </TouchableOpacity>

            {!!pin && (
              <TouchableOpacity
                style={styles.ghostPill}
                onPress={() => savePin(null)}
                disabled={pinSaving}
                activeOpacity={0.7}
              >
                <Ionicons name="trash-outline" size={16} color={colors.textSecondary} />
                <Text style={styles.ghostPillText}>Clear</Text>
              </TouchableOpacity>
            )}
          </View>

          {!!pinNotice && (
            <View style={styles.noticeBox}>
              <Text style={styles.noticeText}>{pinNotice.message}</Text>
              {pinNotice.canOpenSettings && (
                <TouchableOpacity onPress={openAppSettings}>
                  <Text style={styles.noticeLink}>Open Settings</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          <TouchableOpacity
            style={styles.shareWide}
            onPress={handleShareWorkplace}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Share work place location"
          >
            <Ionicons name="share-social" size={18} color={colors.primaryDark} />
            <Text style={styles.shareText}>Share this location</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* ── Language ───────────────────────────────────────────────────────
          Hidden entirely when the office has Urdu switched off: a picker with
          one option is just a control that does nothing. */}
      {urduEnabled && (
      <Animated.View style={[styles.section, riseStyle(langIn)]}>
        <View style={styles.sectionHeader}>
          <IconChip name="language" color={colors.info} bg={colors.infoBg} />
          <Text style={styles.sectionTitle}>{t('language_settings', 'Language Settings')}</Text>
        </View>
        <View style={styles.segment}>
          {(['en', 'ur'] as const).map((lang) => {
            const active = language === lang;
            return (
              <TouchableOpacity
                key={lang}
                style={[styles.segmentItem, active && styles.segmentItemActive]}
                onPress={() => setLanguage(lang)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                  {lang === 'en' ? 'English' : 'اردو'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </Animated.View>
      )}

      {/* ── Actions ──────────────────────────────────────────────────────── */}
      <Animated.View style={[styles.section, riseStyle(actionsIn)]}>
        {canWhatsApp(business?.phone) && (
          <MenuRow
            icon="logo-whatsapp"
            color={colors.ink}
            bg={colors.whatsapp}
            label={t('contact_whatsapp', 'Contact us on WhatsApp')}
            onPress={() => openWhatsApp(
              business?.phone,
              `Hello ${business?.name || 'Century Sip'}, I need help with my account.`,
            )}
          />
        )}
        {/* No "Delivery Addresses" row here — the card above already opens the
            book, and two entry points to one screen is just clutter. */}
        {/* A rule goes above every row that has one before it, never above the
            first row of the card. */}
        <MenuRow
          icon="chatbubbles"
          color={colors.warning}
          bg={colors.warningBg}
          label={t('support_complaints', 'Support & Complaints')}
          onPress={() => navigation.navigate('Complaints')}
          divided={canWhatsApp(business?.phone)}
        />
        <MenuRow
          icon="lock-closed"
          color={colors.primary}
          bg={colors.primaryTint}
          label="Change Password"
          onPress={() => setShowPasswordModal(true)}
          divided
        />
      </Animated.View>

      {/* Sign out sits apart from the menu above: it is the one row here that
          throws work away, and grouping it with "Change Password" invites the
          mis-tap. */}
      <Animated.View style={riseStyle(actionsIn)}>
        <TouchableOpacity style={styles.logoutButton} onPress={confirmLogout} activeOpacity={0.7}>
          <Ionicons name="log-out-outline" size={20} color={colors.danger} />
          <Text style={styles.logoutButtonText}>{t('logout', 'Logout')}</Text>
        </TouchableOpacity>
      </Animated.View>

      {/* Scroll room under Logout for the floating WhatsApp button. The scroll
          view sets its own bottom padding, so padding on the content container
          would be overwritten; a spacer is not. */}
      <View style={styles.floatingButtonClearance} />

      {/* ── Change Password Modal ────────────────────────────────────────────
          The sheet rides above the keyboard (a Modal is its own window, so the
          screen's keyboard handling does not reach it) and its fields scroll,
          so on a short phone the third box and the button are still reachable. */}
      <Modal
        visible={showPasswordModal}
        animationType="slide"
        transparent
        onRequestClose={closePasswordModal}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={[styles.modalCard, { paddingBottom: Math.max(insets.bottom, 12) + 24 }]}>
            <View style={styles.grabber} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Change Password</Text>
              <TouchableOpacity
                onPress={closePasswordModal}
                style={styles.modalClose}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={24} color={colors.muted} />
              </TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {[
                { label: 'Current Password', val: oldPassword, set: setOldPassword },
                { label: 'New Password', val: newPassword, set: setNewPassword },
                { label: 'Confirm New Password', val: confirmPassword, set: setConfirmPassword },
              ].map(({ label, val, set }) => (
                <View key={label} style={styles.modalField}>
                  <Text style={styles.fieldLabel}>{label}</Text>
                  <TextInput
                    style={[styles.input, !!pwErrors[label] && styles.inputInvalid]}
                    value={val}
                    onChangeText={(v) => {
                      set(v);
                      if (pwErrors[label]) {
                        setPwErrors((e) => {
                          const next = { ...e };
                          delete next[label];
                          return next;
                        });
                      }
                    }}
                    secureTextEntry
                    placeholder={label}
                    placeholderTextColor={colors.muted}
                  />
                  <FieldError message={pwErrors[label]} />
                </View>
              ))}
              <TouchableOpacity
                style={[styles.saveButton, passwordLoading && styles.disabledButton]}
                onPress={handleChangePassword}
                disabled={passwordLoading}
                activeOpacity={0.9}
              >
                {passwordLoading
                  ? <ActivityIndicator color={colors.white} />
                  : <Text style={styles.saveButtonText}>Update Password</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </KeyboardAwareScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PAGE_BG },
  // No bottom padding here: KeyboardAwareScrollView sets its own and would
  // overwrite it. The clearance for the floating button is the spacer below.
  scrollContent: { paddingHorizontal: pagePadding, paddingTop: 4 },
  // The floating WhatsApp button parks 96px above the bottom inset and is 56px
  // tall — it therefore covers the last ~90px of this viewport. Without this the
  // scroll ends flush and Logout, being the very last row, sits underneath it
  // with nothing left to scroll. 64 here plus the scroll view's own 32 = 96.
  floatingButtonClearance: { height: 64 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: PAGE_BG },

  // ── Top Bar ───────────────────────────────────────────────────────────────
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 14,
  },
  topBarTextWrap: { flex: 1 },
  topBarTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.ink,
    letterSpacing: -0.5,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
  },
  brandSubtitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
  },
  topLogoutBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.line,
    ...shadow.card,
  },

  // ── Profile Identity Card ──────────────────────────────────────────────────
  profileCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: 16,
    marginBottom: space.md,
    borderWidth: 1,
    borderColor: colors.line,
    ...shadow.card,
  },
  profileCardMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  avatarWrap: {
    position: 'relative',
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  avatarText: {
    color: colors.white,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  avatarBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarBadgeAdmin: {
    backgroundColor: colors.sun,
  },
  profileMeta: {
    flex: 1,
    minWidth: 0,
  },
  profileName: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.ink,
    letterSpacing: -0.3,
  },
  profileHandle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
    marginTop: 1,
  },
  chipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  roleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryTint,
  },
  roleChipAdmin: {
    backgroundColor: colors.sun,
  },
  roleChipText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primaryDark,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  roleChipTextAdmin: {
    color: colors.ink,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.successBg,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.success,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.success,
  },
  profileFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.lineSoft,
    gap: 12,
  },
  footerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    minWidth: 0,
  },
  footerItemText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '500',
  },

  // ── Sections ──────────────────────────────────────────────────────────────
  section: {
    ...card,
    padding: 16,
    marginBottom: 12,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  sectionTitle: { flex: 1, fontSize: 16, fontWeight: '800', color: colors.ink },
  chip: {
    width: 36, height: 36, borderRadius: radius.sm,
    alignItems: 'center', justifyContent: 'center',
  },
  editBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    height: 36, paddingHorizontal: 14, borderRadius: radius.pill,
    backgroundColor: colors.primaryTint,
  },
  editBtnMuted: { backgroundColor: colors.lineSoft },
  editBtnText: { fontSize: 14, fontWeight: '800', color: colors.primaryDark },
  editBtnTextMuted: { color: colors.textSecondary },
  // An ErrorState sitting inside a section card needs less air than a full page.
  stateInCard: { paddingVertical: 12, paddingHorizontal: 0 },

  // ── Fields ────────────────────────────────────────────────────────────────
  divided: { borderTopWidth: 1, borderTopColor: colors.lineSoft },
  fieldRow: { paddingVertical: 12 },
  fieldLabel: { fontSize: 12, color: colors.muted, fontWeight: '700', marginBottom: 4 },
  fieldValue: { fontSize: 16, color: colors.ink, lineHeight: 22 },
  fieldValueEmpty: { color: colors.muted },
  input: {
    minHeight: 48,
    borderWidth: 1, borderColor: colors.line, borderRadius: radius.md,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 16, color: colors.ink, backgroundColor: colors.surfaceTint,
  },
  inputInvalid: { borderColor: colors.danger, backgroundColor: colors.dangerBg },
  multilineInput: { minHeight: 72, textAlignVertical: 'top' },
  // ── Work place location ───────────────────────────────────────────────────
  labelField: { marginTop: 8 },
  labelHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fieldHint: { fontSize: 12, color: colors.muted, marginTop: 6, lineHeight: 16 },
  map: { height: 190, borderRadius: radius.md, overflow: 'hidden', marginTop: 14 },
  pinRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  pinValue: { flex: 1, fontSize: 14, color: colors.ink },
  // Coordinates only — tabular figures stop the digits jittering as they update.
  pinValueMono: { fontVariant: ['tabular-nums'] },
  pinValueEmpty: { color: colors.muted },
  pinActions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  primaryPill: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: BRAND_BLUE, borderRadius: radius.md, height: 48,
  },
  pillBusy: { opacity: 0.65 },
  primaryPillText: { color: colors.white, fontSize: 14, fontWeight: '800' },
  ghostPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderRadius: radius.md, height: 48, paddingHorizontal: 16,
    borderWidth: 1.5, borderColor: colors.muted, backgroundColor: colors.surface,
  },
  ghostPillText: { fontSize: 14, fontWeight: '700', color: colors.ink },
  noticeBox: {
    marginTop: 12, padding: 12, borderRadius: radius.md, gap: 6,
    backgroundColor: colors.warningBg, borderWidth: 1, borderColor: colors.warningLine,
  },
  noticeText: { fontSize: 14, color: colors.warningText, lineHeight: 20 },
  noticeLink: { fontSize: 14, fontWeight: '800', color: colors.primaryDark, paddingVertical: 10 },
  shareWide: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 12, backgroundColor: colors.primaryTint, borderRadius: radius.md, height: 48,
  },
  shareText: { fontSize: 14, fontWeight: '800', color: colors.primaryDark },

  saveButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: BRAND_BLUE, height: 52, borderRadius: radius.md,
    marginTop: 16,
  },
  saveButtonText: { color: colors.white, fontSize: 16, fontWeight: '800' },
  disabledButton: { backgroundColor: colors.primarySoft },

  // ── Address card ──────────────────────────────────────────────────────────
  addressCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.surfaceTint, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.line,
    padding: 14, marginTop: 4, minHeight: 64,
  },
  addressBody: { flex: 1 },
  addressTitleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  addressTitle: { fontSize: 16, fontWeight: '800', color: colors.ink },
  addressLine: { fontSize: 14, color: colors.textSecondary, marginTop: 4, lineHeight: 20 },
  addressMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  addressMeta: { fontSize: 12, color: colors.muted },
  addressMuted: { fontSize: 14, color: colors.muted, marginTop: 3, lineHeight: 20 },
  addressReason: { fontSize: 12, color: colors.danger, marginTop: 4, lineHeight: 16 },

  // ── Language segment ──────────────────────────────────────────────────────
  segment: {
    flexDirection: 'row', marginTop: 4, gap: 8,
  },
  segmentItem: {
    flex: 1, height: 44, alignItems: 'center', justifyContent: 'center',
    borderRadius: radius.pill, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.line,
  },
  segmentItemActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  segmentText: { fontSize: 14, color: colors.ink, fontWeight: '700' },
  segmentTextActive: { color: colors.white, fontWeight: '800' },

  // ── Menu ──────────────────────────────────────────────────────────────────
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 10 },
  menuLabel: { flex: 1, fontSize: 16, color: colors.ink, fontWeight: '600' },

  // ── Logout ────────────────────────────────────────────────────────────────
  logoutButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.surface, borderRadius: radius.md, height: 52,
    borderWidth: 1.5, borderColor: colors.dangerLine,
  },
  logoutButtonText: { color: colors.danger, fontSize: 16, fontWeight: '800' },

  // ── Modal ─────────────────────────────────────────────────────────────────
  modalOverlay: { flex: 1, backgroundColor: 'rgba(10,31,68,0.5)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    paddingHorizontal: 20, paddingTop: 10, paddingBottom: 36,
    // Never taller than the screen: the fields inside scroll instead.
    maxHeight: '92%',
  },
  grabber: {
    alignSelf: 'center', width: 40, height: 4, borderRadius: 2,
    backgroundColor: colors.line, marginBottom: 16,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: colors.ink },
  modalClose: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginRight: -8 },
  modalField: { marginBottom: 14 },
});
