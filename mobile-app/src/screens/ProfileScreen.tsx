import React, { useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, Modal, ActivityIndicator, Animated, Easing,
} from 'react-native';
import { AuthContext } from '../context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';
import { useLanguage } from '../context/LanguageContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { KeyboardAwareScrollView } from '../components/KeyboardAwareScrollView';
import { FieldError } from '../components/FormField';
import { authService } from '../services/authService';
import { CustomerAddress, Pin, addressService, formatPin } from '../services/addressService';
import { AddressPinMap } from '../components/AddressPinMap';
import { API_URL } from '../constants/config';
import { canWhatsApp, openWhatsApp } from '../utils/whatsapp';
import { shareLocation, toMapPin } from '../utils/maps';
import { getCurrentPin, openAppSettings } from '../utils/deviceLocation';

const BRAND_BLUE = '#0A84FF';
const BRAND_DARK = '#0D1B2A';
const PAGE_BG = '#F4F6F8';

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

async function fetchProfileConfig(token: string): Promise<ProfileConfig | null> {
  try {
    const res = await fetch(`${API_URL}/auth/mobile-profile-config/`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.fields ?? null;
  } catch {
    return null;
  }
}

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
    <Ionicons name={name} size={17} color={color} />
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
    <Ionicons name="chevron-forward" size={18} color="#c7cdd4" />
  </TouchableOpacity>
);

// ── Component ─────────────────────────────────────────────────────────────────

export const ProfileScreen = () => {
  const { user, token, updateProfile, logout } = useContext(AuthContext);
  const { language, setLanguage, t, urduEnabled } = useLanguage();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const reducedMotion = useReducedMotion();

  const [form, setForm] = useState<Record<string, string>>({});
  const [isEditing, setIsEditing] = useState(false);
  const [config, setConfig] = useState<ProfileConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(false);

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
  const [addressError, setAddressError] = useState(false);

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
          hasLoadedConfig.current = true;
        })
        .finally(() => {
          if (!cancelled && firstLoad) setConfigLoading(false);
        });

      return () => {
        cancelled = true;
      };
    }, [isStaff, token]),
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
          setAddressError(false);
        })
        .catch(() => !cancelled && setAddressError(true))
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
      Alert.alert('Error', e.message);
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
    } catch {
      // Put back what is actually stored rather than leaving an edit on screen
      // that looks saved but is not.
      setPlaceLabel(user?.work_place_label ?? '');
      Alert.alert('Not saved', 'Could not save the name. Check your connection and try again.');
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
    } catch {
      setPinNotice({ message: 'Could not save the location. Check your connection and try again.' });
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
      } catch { message = e.message; }
      Alert.alert('Error', message);
    } finally {
      setPasswordLoading(false);
    }
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
      {/* ── Hero ──────────────────────────────────────────────────────────────
          A floating dark card rather than a full-bleed banner: the navigator
          header above is white, and running navy straight into it made a hard
          seam. Inset with rounded corners, it reads as deliberate. */}
      <Animated.View style={[styles.hero, riseStyle(heroIn, 10)]}>
        <Animated.View
          style={[
            styles.heroCircle1,
            {
              transform: [
                { translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [0, 14] }) },
                { translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [0, -10] }) },
              ],
            },
          ]}
        />
        <Animated.View
          style={[
            styles.heroCircle2,
            {
              transform: [
                { translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [0, -12] }) },
                { translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [0, 8] }) },
              ],
            },
          ]}
        />

        <View style={styles.avatarRing}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
        </View>

        <Text style={styles.heroName}>{fullName || user?.username}</Text>
        {!!fullName && <Text style={styles.heroHandle}>@{user?.username}</Text>}
        {!!user?.email && <Text style={styles.heroEmail}>{user.email}</Text>}

        <View style={styles.heroBadges}>
          <View style={styles.roleBadge}>
            <Ionicons name="shield-checkmark" size={12} color="#60B4FF" />
            <Text style={styles.roleBadgeText}>{roleLabel}</Text>
          </View>
          {/* Only for customers, and only when the API actually sent one — a
              balance chip reading "Rs 0" on an account that has no ledger at
              all would be inventing information. */}
          {isCustomer && user?.account_balance != null && (
            <View style={styles.roleBadge}>
              <Ionicons name="wallet" size={12} color="#60B4FF" />
              <Text style={styles.roleBadgeText}>Rs {user.account_balance}</Text>
            </View>
          )}
        </View>
      </Animated.View>

      {/* ── Personal information ─────────────────────────────────────────── */}
      {visibleFields.length > 0 && (
        <Animated.View style={[styles.section, riseStyle(infoIn)]}>
          <View style={styles.sectionHeader}>
            <IconChip name="person" color={BRAND_BLUE} bg="#E9F2FF" />
            <Text style={styles.sectionTitle}>{t('personal_info', 'Personal Information')}</Text>
            {hasAnyEditable && (
              <TouchableOpacity
                onPress={isEditing ? handleCancelEdit : () => setIsEditing(true)}
                style={styles.editBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={isEditing ? 'Cancel editing' : 'Edit profile'}
              >
                <Ionicons
                  name={isEditing ? 'close' : 'create-outline'}
                  size={17}
                  color={isEditing ? '#8a929b' : BRAND_BLUE}
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
                    placeholderTextColor="#000"
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
              <Ionicons name="checkmark-circle" size={18} color="#fff" />
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
            <IconChip name="location" color="#00A37A" bg="#E4F7F1" />
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
              ) : addressError ? (
                <>
                  <Text style={styles.addressTitle}>
                    {t('delivery_addresses', 'Delivery Addresses')}
                  </Text>
                  <Text style={styles.addressMuted}>
                    Could not load them just now — tap to open.
                  </Text>
                </>
              ) : defaultAddress ? (
                <>
                  <View style={styles.addressTitleRow}>
                    <Text style={styles.addressTitle}>{defaultAddress.display_label}</Text>
                    {defaultAddress.is_default && (
                      <View style={styles.defaultBadge}>
                        <Text style={styles.defaultBadgeText}>Default</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.addressLine}>{defaultAddress.address}</Text>
                  <View style={styles.addressMetaRow}>
                    <Ionicons
                      name={defaultAddress.has_pin ? 'navigate-circle' : 'navigate-circle-outline'}
                      size={13}
                      color={defaultAddress.has_pin ? '#00A37A' : '#b6bcc4'}
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
            <Ionicons name="chevron-forward" size={18} color="#c7cdd4" />
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
            <IconChip name="navigate" color="#00A37A" bg="#E4F7F1" />
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
              placeholderTextColor="#000"
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
              color={pin ? '#00A37A' : '#b6bcc4'}
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
                ? <ActivityIndicator size="small" color="#fff" />
                : <Ionicons name="locate" size={16} color="#fff" />}
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
                <Ionicons name="trash-outline" size={15} color="#8a929b" />
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
            <Ionicons name="share-social" size={16} color={BRAND_BLUE} />
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
          <IconChip name="language" color="#7A5AF8" bg="#EFEBFE" />
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
            color="#25D366"
            bg="#E6F9EE"
            label={t('contact_whatsapp', 'Contact us on WhatsApp')}
            onPress={() => openWhatsApp(
              business?.phone,
              `Hello ${business?.name || 'Century Sip'}, I need help with my account.`,
            )}
            divided
          />
        )}
        {/* No "Delivery Addresses" row here — the card above already opens the
            book, and two entry points to one screen is just clutter. */}
        <MenuRow
          icon="chatbubbles"
          color="#F5A524"
          bg="#FEF3E2"
          label={t('support_complaints', 'Support & Complaints')}
          onPress={() => navigation.navigate('Complaints')}
          divided
        />
        <MenuRow
          icon="lock-closed"
          color="#5B6B7C"
          bg="#EDF1F5"
          label="Change Password"
          onPress={() => setShowPasswordModal(true)}
        />
      </Animated.View>

      {/* Sign out sits apart from the menu above: it is the one row here that
          throws work away, and grouping it with "Change Password" invites the
          mis-tap. */}
      <Animated.View style={riseStyle(actionsIn)}>
        <TouchableOpacity style={styles.logoutButton} onPress={confirmLogout} activeOpacity={0.7}>
          <Ionicons name="log-out-outline" size={18} color="#FF3B30" />
          <Text style={styles.logoutButtonText}>{t('logout', 'Logout')}</Text>
        </TouchableOpacity>
      </Animated.View>

      {/* ── Change Password Modal ────────────────────────────────────────── */}
      <Modal visible={showPasswordModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.grabber} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Change Password</Text>
              <TouchableOpacity
                onPress={() => { setShowPasswordModal(false); setOldPassword(''); setNewPassword(''); setConfirmPassword(''); }}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={24} color="#8a929b" />
              </TouchableOpacity>
            </View>
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
                  placeholderTextColor="#000"
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
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.saveButtonText}>Update Password</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAwareScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PAGE_BG },
  // Clearance for the floating WhatsApp button, which parks 96px above the
  // bottom inset and is 56px tall — it therefore covers the last ~90px of this
  // viewport. Without this the scroll ends flush and Logout, being the very
  // last row, sits underneath it with nothing left to scroll.
  scrollContent: { paddingBottom: 96, paddingHorizontal: 14, paddingTop: 14 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: PAGE_BG },

  // ── Hero ──────────────────────────────────────────────────────────────────
  hero: {
    backgroundColor: BRAND_DARK,
    borderRadius: 24,
    alignItems: 'center',
    paddingVertical: 26,
    paddingHorizontal: 20,
    marginBottom: 14,
    overflow: 'hidden',
    shadowColor: BRAND_DARK,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 16,
    elevation: 8,
  },
  heroCircle1: {
    position: 'absolute', width: 210, height: 210, borderRadius: 105,
    backgroundColor: `${BRAND_BLUE}1A`, top: -80, right: -70,
  },
  heroCircle2: {
    position: 'absolute', width: 150, height: 150, borderRadius: 75,
    backgroundColor: `${BRAND_BLUE}12`, bottom: -60, left: -50,
  },
  avatarRing: {
    width: 92, height: 92, borderRadius: 46,
    borderWidth: 2, borderColor: `${BRAND_BLUE}55`,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 14,
  },
  avatar: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: BRAND_BLUE,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: BRAND_BLUE,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 10,
  },
  avatarText: { color: '#fff', fontSize: 26, fontWeight: '800', letterSpacing: 0.5 },
  heroName: { fontSize: 21, fontWeight: '800', color: '#fff', letterSpacing: -0.3 },
  heroHandle: { fontSize: 13, color: 'rgba(255,255,255,0.45)', marginTop: 2 },
  heroEmail: { fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 6 },
  heroBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14, justifyContent: 'center' },
  roleBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(255,255,255,0.09)',
    borderRadius: 20, paddingHorizontal: 11, paddingVertical: 5,
  },
  roleBadgeText: { fontSize: 12, color: 'rgba(255,255,255,0.8)', fontWeight: '600' },

  // ── Sections ──────────────────────────────────────────────────────────────
  section: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 18,
    marginBottom: 14,
    shadowColor: '#0D1B2A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  sectionTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: '#1a2530' },
  chip: {
    width: 32, height: 32, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  editBtnText: { fontSize: 13, fontWeight: '700', color: BRAND_BLUE },
  editBtnTextMuted: { color: '#8a929b' },

  // ── Fields ────────────────────────────────────────────────────────────────
  divided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#e9edf1' },
  fieldRow: { paddingVertical: 12 },
  fieldLabel: { fontSize: 12, color: '#8a929b', fontWeight: '600', marginBottom: 5 },
  fieldValue: { fontSize: 15, color: '#1a2530', lineHeight: 21 },
  fieldValueEmpty: { color: '#c2c8ce' },
  input: {
    borderWidth: 1.5, borderColor: '#e4e9ee', borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 11,
    fontSize: 15, color: '#000', backgroundColor: '#fafbfc',
  },
  inputInvalid: { borderColor: '#D93025', backgroundColor: '#FFF7F7' },
  multilineInput: { minHeight: 68, textAlignVertical: 'top' },
  // ── Work place location ───────────────────────────────────────────────────
  labelField: { marginTop: 12 },
  labelHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fieldHint: { fontSize: 11.5, color: '#8a929b', marginTop: 6, lineHeight: 16 },
  map: { height: 190, borderRadius: 14, overflow: 'hidden', marginTop: 14 },
  pinRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 12 },
  pinValue: { flex: 1, fontSize: 13, color: '#1a2530' },
  // Coordinates only — tabular figures stop the digits jittering as they update.
  pinValueMono: { fontVariant: ['tabular-nums'] },
  pinValueEmpty: { color: '#8a929b' },
  pinActions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  primaryPill: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: BRAND_BLUE, borderRadius: 12, paddingVertical: 13,
    shadowColor: BRAND_BLUE,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 4,
  },
  pillBusy: { opacity: 0.65 },
  primaryPillText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  ghostPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: 12, paddingVertical: 13, paddingHorizontal: 14,
    borderWidth: 1, borderColor: '#e4e9ee', backgroundColor: '#fafbfc',
  },
  ghostPillText: { fontSize: 13, fontWeight: '600', color: '#8a929b' },
  noticeBox: {
    marginTop: 12, padding: 12, borderRadius: 12, gap: 6,
    backgroundColor: '#FFF8E5', borderWidth: 1, borderColor: '#FFE2A8',
  },
  noticeText: { fontSize: 13, color: '#8a6100', lineHeight: 18 },
  noticeLink: { fontSize: 13, fontWeight: '700', color: BRAND_BLUE },
  shareWide: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    marginTop: 12, backgroundColor: '#E9F2FF', borderRadius: 12, paddingVertical: 12,
  },
  shareText: { fontSize: 13.5, fontWeight: '700', color: BRAND_BLUE },

  saveButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: BRAND_BLUE, paddingVertical: 14, borderRadius: 14,
    marginTop: 16,
    shadowColor: BRAND_BLUE,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.3,
    shadowRadius: 9,
    elevation: 5,
  },
  saveButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  disabledButton: { backgroundColor: '#a0c4ff', shadowOpacity: 0 },

  // ── Address card ──────────────────────────────────────────────────────────
  addressCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fafbfc', borderRadius: 14,
    borderWidth: 1, borderColor: '#eef2f5',
    padding: 14, marginTop: 8,
  },
  addressBody: { flex: 1 },
  addressTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  addressTitle: { fontSize: 15, fontWeight: '700', color: '#1a2530' },
  addressLine: { fontSize: 13.5, color: '#5b6b7c', marginTop: 4, lineHeight: 19 },
  addressMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 7 },
  addressMeta: { fontSize: 12, color: '#8a929b' },
  addressMuted: { fontSize: 13, color: '#8a929b', marginTop: 3, lineHeight: 18 },
  defaultBadge: { backgroundColor: '#E9F2FF', borderRadius: 9, paddingHorizontal: 7, paddingVertical: 2 },
  defaultBadgeText: { fontSize: 10.5, fontWeight: '800', color: BRAND_BLUE, letterSpacing: 0.2 },

  // ── Language segment ──────────────────────────────────────────────────────
  segment: {
    flexDirection: 'row', marginTop: 10,
    backgroundColor: '#f0f3f6', borderRadius: 12, padding: 4,
  },
  segmentItem: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 9 },
  segmentItemActive: {
    backgroundColor: '#fff',
    shadowColor: '#0D1B2A', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1, shadowRadius: 3, elevation: 2,
  },
  segmentText: { fontSize: 14, color: '#5b6b7c', fontWeight: '600' },
  segmentTextActive: { color: BRAND_BLUE, fontWeight: '800' },

  // ── Menu ──────────────────────────────────────────────────────────────────
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  menuLabel: { flex: 1, fontSize: 15, color: '#1a2530', fontWeight: '500' },

  // ── Logout ────────────────────────────────────────────────────────────────
  logoutButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#fff', borderRadius: 16, paddingVertical: 15,
    borderWidth: 1, borderColor: '#ffd9d7',
  },
  logoutButtonText: { color: '#FF3B30', fontSize: 15, fontWeight: '700' },

  // ── Modal ─────────────────────────────────────────────────────────────────
  modalOverlay: { flex: 1, backgroundColor: 'rgba(13,27,42,0.5)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 22, paddingTop: 10, paddingBottom: 36,
  },
  grabber: {
    alignSelf: 'center', width: 40, height: 4, borderRadius: 2,
    backgroundColor: '#e4e9ee', marginBottom: 16,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  modalTitle: { fontSize: 19, fontWeight: '800', color: '#1a2530' },
  modalField: { marginBottom: 14 },
});
