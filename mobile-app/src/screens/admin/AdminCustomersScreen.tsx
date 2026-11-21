import { colors, radius, card, pagePadding } from '../../theme';
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  TextInput, ActivityIndicator, RefreshControl, Modal, Alert, ScrollView,
} from 'react-native';
import { LoadingScreen } from '../../components/LoadingScreen';
import { EmptyState, ErrorState, StatusPill, friendlyError, Tone } from '../../components/ui';
import { Ionicons } from '@expo/vector-icons';
import { adminService, AdminCustomer, CustomerStats, Receivable } from '../../services/adminService';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../types/navigation';
import { balanceReminderMessage, canWhatsApp, openWhatsApp } from '../../utils/whatsapp';
import {
  AddressFields, AddressParts, EMPTY_ADDRESS, validateAddress,
  composeAddress, splitAddress,
} from '../../components/AddressFields';
import { matchesCustomerSearch } from '../../utils/customerSearch';
import { useRefetchOnFocus } from '../../hooks/useRefetchOnFocus';
import { FieldLabel, PasswordRules, isPasswordValid } from '../../components/FormField';
import { KeyboardAwareScrollView, SheetScrollView } from '../../components/KeyboardAwareScrollView';
import { CalendarModal } from '../../components/CalendarModal';
import { isoDate } from '../../utils/dateRange';

const money = (n: number) => Math.abs(n).toLocaleString('en-PK', { maximumFractionDigits: 0 });

/** An owed-positive balance as the word, pill tone and amount colour to show. */
const balanceLook = (owed: number): { label: string; tone: Tone; color: string } => {
  if (owed > 0) return { label: 'Owes', tone: 'danger', color: colors.danger };
  if (owed < 0) return { label: 'In credit', tone: 'success', color: colors.success };
  return { label: 'Settled', tone: 'neutral', color: colors.textSecondary };
};

/** The server sends field errors as JSON; anything else is plain text. */
const failureReason = (e: any, prefix: string): string => {
  const raw = e?.message;
  try {
    const parsed = JSON.parse(raw);
    const text = parsed && typeof parsed === 'object' ? Object.values(parsed).flat().join(' ') : '';
    if (text) return text;
  } catch { /* plain text, not JSON */ }
  return `${prefix}: ${friendlyError(raw)}`;
};

// ─── Styles (declared first so all components below can reference them) ───────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  topRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: pagePadding, paddingTop: 12,
  },
  searchBox: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10,
    height: 48, paddingHorizontal: 14,
    backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.line,
  },
  searchInput: { flex: 1, fontSize: 14, color: colors.ink },
  clearBtn: { padding: 4 },
  addBtn: {
    width: 48, height: 48, borderRadius: radius.md,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  filterBar: { flexGrow: 0, marginTop: 4 },
  filterBarContent: { paddingHorizontal: pagePadding, paddingVertical: 8, gap: 8 },
  filterChip: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, height: 38,
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterChipActiveYellow: { backgroundColor: colors.sun, borderColor: colors.sun },
  filterChipActiveOwes: { backgroundColor: colors.danger, borderColor: colors.danger },
  filterChipActiveSuccess: { backgroundColor: colors.success, borderColor: colors.success },
  filterChipText: { fontSize: 13, color: colors.ink, fontWeight: '700' },
  filterChipTextActive: { color: colors.white },
  filterChipTextActiveDark: { color: colors.ink, fontWeight: '800' },
  calendarChip: { borderColor: colors.primarySoft, backgroundColor: colors.primaryTint },
  chipClearBtn: { marginLeft: 6, padding: 2 },
  chipDivider: { width: 1, height: 22, backgroundColor: colors.line, alignSelf: 'center', marginHorizontal: 2 },
  countRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: pagePadding, paddingTop: 4, paddingBottom: 6,
  },
  countText: {
    fontSize: 13, fontWeight: '700', color: colors.textSecondary,
  },
  resetFilterBtn: { paddingVertical: 4, paddingHorizontal: 6 },
  resetFilterText: { fontSize: 13, fontWeight: '700', color: colors.primary },
  list: { paddingHorizontal: pagePadding, paddingBottom: 24, flexGrow: 1 },

  card: { ...card, padding: 16, marginBottom: 12 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 20, fontWeight: '800', color: colors.primary },
  cardInfo: { flex: 1, gap: 2 },
  name: { fontSize: 16, fontWeight: '800', color: colors.ink },
  username: { fontSize: 14, color: colors.textSecondary },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  detailText: { flex: 1, fontSize: 14, color: colors.textSecondary },
  balanceRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.lineSoft,
  },
  amount: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  amountUnit: { fontSize: 12, fontWeight: '700', color: colors.muted },
});

const inline = StyleSheet.create({
  box: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: pagePadding, marginTop: 12, padding: 12,
    backgroundColor: colors.dangerBg, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.dangerLine,
  },
  textCol: { flex: 1, gap: 2 },
  title: { fontSize: 14, fontWeight: '800', color: colors.danger },
  text: { fontSize: 14, color: colors.ink },
  btn: {
    height: 40, paddingHorizontal: 14, borderRadius: radius.pill,
    backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center',
  },
  btnText: { fontSize: 14, fontWeight: '800', color: colors.white },
});

/** A failed refresh while good data is still on screen: say why, offer a retry. */
function InlineError({
  title, message, onRetry, flush,
}: { title: string; message: string; onRetry: () => void; flush?: boolean }) {
  return (
    <View style={[inline.box, flush && { marginHorizontal: 0 }]}>
      <Ionicons name="alert-circle" size={22} color={colors.danger} />
      <View style={inline.textCol}>
        <Text style={inline.title}>{title}</Text>
        <Text style={inline.text}>{friendlyError(message)}</Text>
      </View>
      <TouchableOpacity style={inline.btn} onPress={onRetry} accessibilityLabel="Try again">
        <Text style={inline.btnText}>Retry</Text>
      </TouchableOpacity>
    </View>
  );
}

const addModal = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(10,31,68,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    padding: 20, paddingBottom: 36, maxHeight: '90%',
  },
  header: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 16,
  },
  title: { fontSize: 20, fontWeight: '800', color: colors.ink },
  closeBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.lineSoft, alignItems: 'center', justifyContent: 'center',
  },
  row: { flexDirection: 'row', gap: 10 },
  field: { marginTop: 14 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: colors.ink, marginBottom: 8 },
  helper: { fontSize: 12, color: colors.muted, marginTop: 6, lineHeight: 16 },
  input: {
    height: 48, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md,
    paddingHorizontal: 14, fontSize: 16, color: colors.ink, backgroundColor: colors.surfaceTint,
  },
  passwordRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eyeBtn: {
    width: 48, height: 48, borderRadius: radius.md,
    backgroundColor: colors.lineSoft, alignItems: 'center', justifyContent: 'center',
  },
  errorBox: {
    marginTop: 12, backgroundColor: colors.dangerBg, borderRadius: radius.md,
    padding: 12, borderWidth: 1, borderColor: colors.dangerLine,
  },
  errorText: { fontSize: 14, color: colors.danger },
  submitBtn: {
    marginTop: 16, height: 52, backgroundColor: colors.primary, borderRadius: radius.md,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  submitText: { color: colors.white, fontSize: 16, fontWeight: '800' },
});

const modal = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(10,31,68,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    padding: 20, paddingBottom: 10, maxHeight: '90%',
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  avatar: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 24, fontWeight: '800', color: colors.primary },
  name: { fontSize: 20, fontWeight: '800', color: colors.ink },
  username: { fontSize: 14, color: colors.textSecondary, marginTop: 1 },
  closeBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.lineSoft, alignItems: 'center', justifyContent: 'center',
  },

  balanceCard: {
    borderRadius: radius.lg, borderWidth: 1, padding: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12,
  },
  balanceLabel: { fontSize: 14, fontWeight: '700', color: colors.textSecondary, marginBottom: 6 },
  balanceAmount: { fontSize: 24, fontWeight: '800', letterSpacing: -0.3 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 },
  statCell: {
    width: '48%', flexGrow: 1, backgroundColor: colors.surfaceTint,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.line,
    padding: 14, alignItems: 'center',
  },
  statValue: { fontSize: 20, fontWeight: '800', color: colors.ink },
  statValueSmall: { fontSize: 16, fontWeight: '800', color: colors.ink, paddingVertical: 2 },
  statLabel: { fontSize: 12, fontWeight: '700', color: colors.muted, marginTop: 4, textAlign: 'center' },

  actionRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  actionBtn: {
    flex: 1, height: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: radius.md,
  },
  ledgerBtn: { borderWidth: 1.5, borderColor: colors.primary, backgroundColor: colors.surface },
  waBtn: { backgroundColor: colors.whatsapp },
  actionText: { fontSize: 14, fontWeight: '800' },

  section: {
    marginTop: 20, padding: 16, borderRadius: radius.lg,
    backgroundColor: colors.surfaceTint, borderWidth: 1, borderColor: colors.line,
  },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: colors.ink },
  editLabel: { fontSize: 14, fontWeight: '700', color: colors.textSecondary, marginTop: 12, marginBottom: 6 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    flex: 1, height: 48, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md,
    paddingHorizontal: 14, fontSize: 16, color: colors.ink, backgroundColor: colors.surface,
  },
  saveBtn: {
    marginTop: 16, height: 50, backgroundColor: colors.primary, borderRadius: radius.md,
    alignItems: 'center', justifyContent: 'center',
  },
  saveBtnText: { color: colors.white, fontSize: 16, fontWeight: '800' },
});

// ─── Add Customer Modal ───────────────────────────────────────────────────────

const EMPTY_FORM = {
  first_name: '', last_name: '', username: '',
  phone_number: '', password: '',
};

function AddCustomerModal({
  visible, onClose, onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [address, setAddress] = useState<AddressParts>(EMPTY_ADDRESS);
  const [addressErrors, setAddressErrors] = useState<Partial<Record<keyof AddressParts, string>>>({});
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (key: keyof typeof EMPTY_FORM) => (val: string) =>
    setForm(f => ({ ...f, [key]: val }));

  const reset = () => {
    setForm(EMPTY_FORM);
    setAddress(EMPTY_ADDRESS);
    setAddressErrors({});
    setError('');
    setShowPassword(false);
  };

  // A walk-in is often registered from a phone call with nothing but a name, so
  // an entirely blank address is allowed. Once any part is typed the record is
  // meant to be delivered to, and a half-address cannot be.
  const hasAddress = Object.values(address).some(part => part.trim() !== '');
  const passwordUnusable = form.password !== '' && !isPasswordValid(form.password);

  const submit = async () => {
    setError('');
    setAddressErrors({});
    if (!form.username.trim()) { setError('Username is required.'); return; }
    if (passwordUnusable) { setError('The password does not meet the requirements below.'); return; }

    if (hasAddress) {
      const errs = validateAddress(address);
      if (Object.keys(errs).length) {
        setAddressErrors(errs);
        setError('Complete the address, or clear every part of it.');
        return;
      }
    }

    setSaving(true);
    try {
      const created = await adminService.createCustomer({
        username: form.username.trim(),
        first_name: form.first_name.trim() || undefined,
        last_name: form.last_name.trim() || undefined,
        phone_number: form.phone_number.trim() || undefined,
        // Omitted entirely rather than sent blank — the backend reads a missing
        // password as "store an unusable one", not as an empty password.
        ...(form.password ? { password: form.password } : {}),
        ...(hasAddress ? {
          house_number: address.house_number.trim(),
          portion: address.portion.trim() || undefined,
          block: address.block.trim() || undefined,
          area: address.area.trim(),
        } : {}),
      });
      reset();
      onCreated();
      onClose();
      if (!created.can_sign_in) {
        Alert.alert(
          'Customer saved',
          `${created.name || created.username} was created without sign-in access. `
          + 'An admin can set a password later if they ever need to log in.',
        );
      }
    } catch (e: any) {
      setError(failureReason(e, 'Failed to create customer'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={addModal.overlay}>
        <View style={addModal.sheet}>
          <View style={addModal.header}>
            <Text style={addModal.title}>Add Customer</Text>
            <TouchableOpacity onPress={() => { reset(); onClose(); }} style={addModal.closeBtn}>
              <Ionicons name="close" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <SheetScrollView showsVerticalScrollIndicator={false} extraBottomSpace={28}>
            <View style={addModal.row}>
              <View style={{ flex: 1 }}>
                <FieldLabel text="First Name" />
                <TextInput
                  style={addModal.input} value={form.first_name} onChangeText={set('first_name')}
                  placeholder="Ali" placeholderTextColor={colors.muted}
                />
              </View>
              <View style={{ flex: 1 }}>
                <FieldLabel text="Last Name" />
                <TextInput
                  style={addModal.input} value={form.last_name} onChangeText={set('last_name')}
                  placeholder="Hassan" placeholderTextColor={colors.muted}
                />
              </View>
            </View>

            <View style={addModal.field}>
              <FieldLabel text="Username" required />
              <TextInput
                style={addModal.input} value={form.username} onChangeText={set('username')}
                placeholder="alihassan" placeholderTextColor={colors.muted}
                autoCapitalize="none" autoCorrect={false}
              />
            </View>

            <View style={addModal.field}>
              <FieldLabel text="Phone" />
              <TextInput
                style={addModal.input} value={form.phone_number} onChangeText={set('phone_number')}
                placeholder="03xx-xxxxxxx" placeholderTextColor={colors.muted} keyboardType="phone-pad"
              />
            </View>

            <View style={addModal.field}>
              <Text style={addModal.sectionTitle}>Address</Text>
              <AddressFields
                value={address}
                onChange={setAddress}
                errors={addressErrors}
                hint="Leave every part blank if the address is not known yet."
              />
            </View>

            <View style={addModal.field}>
              <FieldLabel text="Password" />
              <View style={addModal.passwordRow}>
                <TextInput
                  style={[addModal.input, { flex: 1 }]}
                  value={form.password} onChangeText={set('password')}
                  placeholder="Leave blank — no sign-in" placeholderTextColor={colors.muted}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none" autoCorrect={false}
                />
                <TouchableOpacity onPress={() => setShowPassword(v => !v)} style={addModal.eyeBtn}>
                  <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={18} color={colors.muted} />
                </TouchableOpacity>
              </View>
              <Text style={addModal.helper}>
                Walk-in and phone-in customers do not need one. Left blank, the account cannot be
                signed into — an admin can set a password later.
              </Text>
              {/* Only police a password that was actually typed. */}
              {form.password !== '' && <PasswordRules password={form.password} />}
            </View>

            {error !== '' && (
              <View style={addModal.errorBox}>
                <Text style={addModal.errorText}>{error}</Text>
              </View>
            )}

            <TouchableOpacity
              style={[addModal.submitBtn, (saving || passwordUnusable) && { opacity: 0.6 }]}
              onPress={submit}
              disabled={saving || passwordUnusable}
            >
              {saving
                ? <ActivityIndicator size="small" color={colors.white} />
                : (
                  <>
                    <Ionicons name="person-add" size={18} color={colors.white} />
                    <Text style={addModal.submitText}>Create Account</Text>
                  </>
                )
              }
            </TouchableOpacity>
          </SheetScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ─── Customer Detail / Edit Modal ────────────────────────────────────────────

function CustomerStatsModal({
  customer, onClose, onUpdated,
}: {
  customer: AdminCustomer | null;
  onClose: () => void;
  onUpdated?: () => void;
}) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [stats, setStats] = useState<CustomerStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [statsReload, setStatsReload] = useState(0);
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState<AddressParts>(EMPTY_ADDRESS);
  const [addressErrors, setAddressErrors] = useState<Partial<Record<keyof AddressParts, string>>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!customer) return;
    setPhone(customer.phone || '');
    // Prefer the stored parts. Records created before the split have none, so
    // fall back to picking the old one-line address apart — otherwise editing a
    // legacy customer would silently blank their address.
    setAddress(
      customer.house_number || customer.area || customer.block || customer.portion
        ? {
            house_number: customer.house_number || '',
            portion: customer.portion || '',
            block: customer.block || '',
            area: customer.area || '',
          }
        : splitAddress(customer.address),
    );
    setAddressErrors({});
  }, [customer]);

  // Separate from the form reset above so a retry never wipes unsaved edits.
  useEffect(() => {
    if (!customer) return;
    let live = true;
    // Drop the previous customer's figures: a failed load must not leave
    // someone else's balance on screen.
    setStats(null);
    setStatsError(null);
    setLoading(true);
    adminService.getCustomerStats(customer.id)
      .then(s => { if (live) setStats(s); })
      .catch((e: any) => { if (live) setStatsError(e?.message || 'Could not load order stats.'); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [customer, statsReload]);

  if (!customer) return null;

  // Compare on the composed line: that is what the server stores, so an edit
  // that only reshuffles the parts into the same address is genuinely no change.
  const changed =
    phone !== (customer.phone || '') ||
    composeAddress(address) !== (customer.address || '');

  const save = async () => {
    // An address is optional, but a half-filled one is not — without a house
    // number and an area a rider has nowhere to go.
    const wantsAddress = Object.values(address).some(part => part.trim() !== '');
    const errs = wantsAddress ? validateAddress(address) : {};
    setAddressErrors(errs);
    if (Object.keys(errs).length > 0) {
      Alert.alert('Check the address', 'Complete the address, or clear every part of it.');
      return;
    }

    setSaving(true);
    try {
      // Only the parts go up; the server recomposes `address` from them.
      await adminService.updateCustomer(customer.id, {
        phone_number: phone.trim() || undefined,
        house_number: wantsAddress ? address.house_number.trim() : '',
        portion: wantsAddress ? address.portion.trim() : '',
        block: wantsAddress ? address.block.trim() : '',
        area: wantsAddress ? address.area.trim() : '',
      });
      onUpdated?.();
      onClose();
    } catch (e: any) {
      Alert.alert('Error', failureReason(e, 'Failed to update'));
    } finally { setSaving(false); }
  };

  const lastDate = stats?.last_order_date
    ? new Date(stats.last_order_date).toLocaleDateString('en-PK', {
        day: 'numeric', month: 'short', year: 'numeric',
      })
    : '—';

  const balanceNum = stats?.account_balance ?? null;
  // stats.account_balance is credit-positive, so what is owed is its negative.
  const look = balanceNum === null ? null : balanceLook(-balanceNum);
  const lookBg = !look ? colors.surfaceTint
    : look.tone === 'danger' ? colors.dangerBg
    : look.tone === 'success' ? colors.successBg
    : colors.surfaceTint;
  const lookLine = !look ? colors.line
    : look.tone === 'danger' ? colors.dangerLine
    : look.tone === 'success' ? colors.successBg
    : colors.line;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={modal.overlay}>
        <View style={modal.sheet}>
          {/* Header */}
          <View style={modal.header}>
            <View style={modal.avatar}>
              <Text style={modal.avatarText}>{(customer.name || customer.username || '?').charAt(0).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={modal.name} numberOfLines={1}>{customer.name}</Text>
              <Text style={modal.username}>@{customer.username}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={modal.closeBtn} accessibilityLabel="Close">
              <Ionicons name="close" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <SheetScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* Balance and order stats */}
            {loading ? (
              <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 20 }} />
            ) : statsError ? (
              <InlineError
                flush
                title="Could not load balance and orders"
                message={statsError}
                onRetry={() => setStatsReload(n => n + 1)}
              />
            ) : stats ? (
              <>
                <View style={[modal.balanceCard, { backgroundColor: lookBg, borderColor: lookLine }]}>
                  <View>
                    <Text style={modal.balanceLabel}>Account balance</Text>
                    <Text style={[modal.balanceAmount, { color: look ? look.color : colors.textSecondary }]}>
                      {balanceNum === null ? '—' : `PKR ${money(balanceNum)}`}
                    </Text>
                  </View>
                  {look && <StatusPill label={look.label} tone={look.tone} />}
                </View>

                <View style={modal.statsGrid}>
                  <View style={modal.statCell}>
                    <Text style={modal.statValue}>{stats.total_orders}</Text>
                    <Text style={modal.statLabel}>Total Orders</Text>
                  </View>
                  <View style={modal.statCell}>
                    <Text style={modal.statValue}>{stats.delivered_count}</Text>
                    <Text style={modal.statLabel}>Delivered</Text>
                  </View>
                  <View style={modal.statCell}>
                    <Text style={modal.statValue}>{stats.total_bottles}</Text>
                    <Text style={modal.statLabel}>Bottles</Text>
                  </View>
                  <View style={modal.statCell}>
                    <Text style={modal.statValueSmall}>{lastDate}</Text>
                    <Text style={modal.statLabel}>Last Order</Text>
                  </View>
                </View>
              </>
            ) : null}

            {/* Ledger + WhatsApp actions */}
            <View style={modal.actionRow}>
              <TouchableOpacity
                style={[modal.actionBtn, modal.ledgerBtn]}
                onPress={() => {
                  onClose();
                  navigation.navigate('AdminLedger', {
                    customerId: customer.id,
                    customerName: customer.name || customer.username,
                  });
                }}
              >
                <Ionicons name="book-outline" size={18} color={colors.primary} />
                <Text style={[modal.actionText, { color: colors.primary }]}>View Ledger</Text>
              </TouchableOpacity>

              {canWhatsApp(phone) && (
                <TouchableOpacity
                  style={[modal.actionBtn, modal.waBtn]}
                  onPress={() => openWhatsApp(phone, balanceReminderMessage({
                    customerName: customer.name || customer.username,
                    // stats.account_balance is credit-positive; the reminder
                    // wants the owed figure.
                    balance: balanceNum === null ? 0 : -balanceNum,
                  }))}
                >
                  <Ionicons name="logo-whatsapp" size={18} color={colors.ink} />
                  <Text style={[modal.actionText, { color: colors.ink }]}>WhatsApp</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Editable contact fields */}
            <View style={modal.section}>
              <Text style={modal.sectionTitle}>Contact and address</Text>

              <Text style={modal.editLabel}>Phone</Text>
              <View style={modal.inputRow}>
                <Ionicons name="call-outline" size={18} color={colors.muted} />
                <TextInput
                  style={modal.input}
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="03xx-xxxxxxx"
                  placeholderTextColor={colors.muted}
                  keyboardType="phone-pad"
                />
              </View>

              <View style={{ marginTop: 4 }}>
                <AddressFields
                  value={address}
                  onChange={setAddress}
                  errors={addressErrors}
                  hint="Leave every part blank if the address is not known yet."
                />
              </View>

              {changed && (
                <TouchableOpacity
                  style={[modal.saveBtn, saving && { opacity: 0.5 }]}
                  onPress={save}
                  disabled={saving}
                >
                  {saving
                    ? <ActivityIndicator size="small" color={colors.white} />
                    : <Text style={modal.saveBtnText}>Save Changes</Text>
                  }
                </TouchableOpacity>
              )}
            </View>

            <View style={{ height: 16 }} />
          </SheetScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

type CustomerFilterKey =
  | 'all'
  | 'owes'
  | 'credit'
  | 'settled'
  | 'this_month'
  | 'missing_address'
  | 'with_phone';

const formatDateChip = (iso: string) => {
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d.getTime())) return iso;
  const today = isoDate(new Date());
  if (iso === today) return 'Today';
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
};

export const AdminCustomersScreen: React.FC = () => {
  const [customers, setCustomers] = useState<AdminCustomer[]>([]);
  // Owed-positive ledger figures by customer id. Missing entries simply show no
  // balance on the card; they are never guessed.
  const [balances, setBalances] = useState<Record<number, Receivable>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<AdminCustomer | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  // Filters
  const [activeFilter, setActiveFilter] = useState<CustomerFilterKey>('all');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [calendarVisible, setCalendarVisible] = useState(false);

  // A late answer from an older load must not overwrite a newer one.
  const requestId = useRef(0);

  const load = useCallback(async (isRefresh = false) => {
    const id = ++requestId.current;
    if (!isRefresh) setLoading(true);
    setError(null);

    // Balances are a bonus on each card, so they are fetched on their own and
    // never awaited by the list. The ledger call has no timeout and can be slow
    // or refused (an admin without ledger access): waiting for it, or letting
    // its failure through, would hold up or break the customer list. The cards
    // simply fill in with balances when it answers, and stay as they are if not.
    adminService.getReceivables({ limit: 500 })
      .then(r => {
        if (id !== requestId.current) return;
        const byId: Record<number, Receivable> = {};
        (r?.results || []).forEach(row => { byId[row.id] = row; });
        setBalances(byId);
      })
      .catch(() => { /* no balances this time; the list is unaffected */ });

    try {
      const data = await adminService.getCustomers();
      if (id !== requestId.current) return;
      setCustomers(data);
    } catch (e: any) {
      if (id !== requestId.current) return;
      setError(e?.message || 'Could not load customers.');
    } finally {
      if (id === requestId.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // A payment recorded in the ledger changes a balance shown on these cards, so
  // coming back here must re-read them. Silent: the list stays on screen.
  useRefetchOnFocus(() => load(true));

  // Multi-word, digit-tolerant on phones, and aware of the structured address
  // parts. Same rules as the server's search and the web admin's.
  const filtered = useMemo(() => {
    return customers.filter(c => {
      // 1. Search query
      if (search && !matchesCustomerSearch(c, search)) {
        return false;
      }

      // 2. Date joined calendar filter
      if (selectedDate) {
        if (!c.date_joined) return false;
        const joinedIso = isoDate(new Date(c.date_joined));
        if (joinedIso !== selectedDate) return false;
      }

      // 3. Status filter
      if (activeFilter === 'owes') {
        const bal = balances[c.id] ? Number(balances[c.id].balance) : 0;
        return bal > 0;
      }
      if (activeFilter === 'credit') {
        const bal = balances[c.id] ? Number(balances[c.id].balance) : 0;
        return bal < 0;
      }
      if (activeFilter === 'settled') {
        const bal = balances[c.id] ? Number(balances[c.id].balance) : 0;
        return bal === 0;
      }
      if (activeFilter === 'this_month') {
        if (!c.date_joined) return false;
        const d = new Date(c.date_joined);
        const now = new Date();
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      }
      if (activeFilter === 'missing_address') {
        return !c.address || !c.address.trim();
      }
      if (activeFilter === 'with_phone') {
        return !!c.phone && !!c.phone.trim();
      }

      return true;
    });
  }, [customers, search, selectedDate, activeFilter, balances]);

  const filterCounts = useMemo(() => {
    let owes = 0;
    let credit = 0;
    let settled = 0;
    let thisMonth = 0;
    let missingAddress = 0;
    let withPhone = 0;

    const now = new Date();
    customers.forEach(c => {
      const bal = balances[c.id] ? Number(balances[c.id].balance) : 0;
      if (bal > 0) owes++;
      else if (bal < 0) credit++;
      else settled++;

      if (c.date_joined) {
        const d = new Date(c.date_joined);
        if (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) {
          thisMonth++;
        }
      }

      if (!c.address || !c.address.trim()) {
        missingAddress++;
      }
      if (c.phone && c.phone.trim()) {
        withPhone++;
      }
    });

    return {
      all: customers.length,
      owes,
      credit,
      settled,
      thisMonth,
      missingAddress,
      withPhone,
    };
  }, [customers, balances]);

  const renderFilterBar = () => {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterBar}
        contentContainerStyle={styles.filterBarContent}
      >
        {/* All */}
        <TouchableOpacity
          style={[styles.filterChip, activeFilter === 'all' && !selectedDate && styles.filterChipActiveYellow]}
          onPress={() => {
            setActiveFilter('all');
            setSelectedDate(null);
          }}
          accessibilityRole="button"
        >
          <Text style={[styles.filterChipText, activeFilter === 'all' && !selectedDate && styles.filterChipTextActiveDark]}>
            All ({filterCounts.all})
          </Text>
        </TouchableOpacity>

        {/* Owes */}
        <TouchableOpacity
          style={[styles.filterChip, activeFilter === 'owes' && styles.filterChipActiveOwes]}
          onPress={() => setActiveFilter(activeFilter === 'owes' ? 'all' : 'owes')}
          accessibilityRole="button"
        >
          <Ionicons
            name="alert-circle"
            size={14}
            color={activeFilter === 'owes' ? colors.white : colors.danger}
            style={{ marginRight: 4 }}
          />
          <Text style={[styles.filterChipText, activeFilter === 'owes' && styles.filterChipTextActive]}>
            Owes ({filterCounts.owes})
          </Text>
        </TouchableOpacity>

        {/* In Credit */}
        <TouchableOpacity
          style={[styles.filterChip, activeFilter === 'credit' && styles.filterChipActiveSuccess]}
          onPress={() => setActiveFilter(activeFilter === 'credit' ? 'all' : 'credit')}
          accessibilityRole="button"
        >
          <Ionicons
            name="wallet-outline"
            size={14}
            color={activeFilter === 'credit' ? colors.white : colors.success}
            style={{ marginRight: 4 }}
          />
          <Text style={[styles.filterChipText, activeFilter === 'credit' && styles.filterChipTextActive]}>
            In Credit ({filterCounts.credit})
          </Text>
        </TouchableOpacity>

        {/* Settled */}
        <TouchableOpacity
          style={[styles.filterChip, activeFilter === 'settled' && styles.filterChipActive]}
          onPress={() => setActiveFilter(activeFilter === 'settled' ? 'all' : 'settled')}
          accessibilityRole="button"
        >
          <Ionicons
            name="checkmark-circle-outline"
            size={14}
            color={activeFilter === 'settled' ? colors.white : colors.textSecondary}
            style={{ marginRight: 4 }}
          />
          <Text style={[styles.filterChipText, activeFilter === 'settled' && styles.filterChipTextActive]}>
            Settled ({filterCounts.settled})
          </Text>
        </TouchableOpacity>

        <View style={styles.chipDivider} />

        {/* Date Joined Calendar Filter */}
        <TouchableOpacity
          style={[
            styles.filterChip,
            selectedDate !== null ? styles.filterChipActiveYellow : styles.calendarChip,
          ]}
          onPress={() => setCalendarVisible(true)}
          accessibilityRole="button"
        >
          <Ionicons
            name="calendar"
            size={14}
            color={selectedDate ? colors.ink : colors.primary}
            style={{ marginRight: 4 }}
          />
          <Text
            style={[
              styles.filterChipText,
              selectedDate !== null && styles.filterChipTextActiveDark,
              !selectedDate && { color: colors.primary, fontWeight: '700' },
            ]}
          >
            {selectedDate ? `Joined ${formatDateChip(selectedDate)}` : 'Joined Date'}
          </Text>
          {selectedDate && (
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation();
                setSelectedDate(null);
              }}
              style={styles.chipClearBtn}
              accessibilityLabel="Clear date filter"
            >
              <Ionicons name="close-circle" size={16} color={colors.ink} />
            </TouchableOpacity>
          )}
        </TouchableOpacity>

        {/* This Month */}
        <TouchableOpacity
          style={[styles.filterChip, activeFilter === 'this_month' && styles.filterChipActive]}
          onPress={() => setActiveFilter(activeFilter === 'this_month' ? 'all' : 'this_month')}
          accessibilityRole="button"
        >
          <Ionicons
            name="sparkles-outline"
            size={14}
            color={activeFilter === 'this_month' ? colors.white : colors.primary}
            style={{ marginRight: 4 }}
          />
          <Text style={[styles.filterChipText, activeFilter === 'this_month' && styles.filterChipTextActive]}>
            This Month ({filterCounts.thisMonth})
          </Text>
        </TouchableOpacity>

        <View style={styles.chipDivider} />

        {/* Missing Address */}
        <TouchableOpacity
          style={[styles.filterChip, activeFilter === 'missing_address' && styles.filterChipActive]}
          onPress={() => setActiveFilter(activeFilter === 'missing_address' ? 'all' : 'missing_address')}
          accessibilityRole="button"
        >
          <Ionicons
            name="location-outline"
            size={14}
            color={activeFilter === 'missing_address' ? colors.white : colors.warning}
            style={{ marginRight: 4 }}
          />
          <Text style={[styles.filterChipText, activeFilter === 'missing_address' && styles.filterChipTextActive]}>
            No Address ({filterCounts.missingAddress})
          </Text>
        </TouchableOpacity>

        {/* With Phone */}
        <TouchableOpacity
          style={[styles.filterChip, activeFilter === 'with_phone' && styles.filterChipActive]}
          onPress={() => setActiveFilter(activeFilter === 'with_phone' ? 'all' : 'with_phone')}
          accessibilityRole="button"
        >
          <Ionicons
            name="call-outline"
            size={14}
            color={activeFilter === 'with_phone' ? colors.white : colors.primary}
            style={{ marginRight: 4 }}
          />
          <Text style={[styles.filterChipText, activeFilter === 'with_phone' && styles.filterChipTextActive]}>
            With Phone ({filterCounts.withPhone})
          </Text>
        </TouchableOpacity>
      </ScrollView>
    );
  };

  const renderItem = ({ item }: { item: AdminCustomer }) => {
    const receivable = balances[item.id];
    const owed = receivable ? Number(receivable.balance) : null;
    const look = owed !== null && Number.isFinite(owed) ? balanceLook(owed) : null;
    return (
      <TouchableOpacity style={styles.card} onPress={() => setSelected(item)} activeOpacity={0.85}>
        <View style={styles.cardTop}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(item.name || item.username || '?').charAt(0).toUpperCase()}</Text>
          </View>
          <View style={styles.cardInfo}>
            <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
            <Text style={styles.username} numberOfLines={1}>
              @{item.username}{receivable?.customer_code ? ` · #${receivable.customer_code}` : ''}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </View>

        {item.phone ? (
          <View style={styles.detailRow}>
            <Ionicons name="call-outline" size={16} color={colors.muted} />
            <Text style={styles.detailText} numberOfLines={1}>{item.phone}</Text>
          </View>
        ) : null}
        {item.address ? (
          <View style={[styles.detailRow, { marginTop: item.phone ? 4 : 10 }]}>
            <Ionicons name="location-outline" size={16} color={colors.muted} />
            <Text style={styles.detailText} numberOfLines={1}>{item.address}</Text>
          </View>
        ) : null}

        {look && owed !== null ? (
          <View style={styles.balanceRow}>
            <StatusPill label={look.label} tone={look.tone} />
            <Text style={[styles.amount, { color: look.color }]}>
              <Text style={styles.amountUnit}>PKR </Text>{money(owed)}
            </Text>
          </View>
        ) : null}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Search + Add button */}
      <View style={styles.topRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name, phone, address…"
            value={search}
            onChangeText={setSearch}
            placeholderTextColor={colors.muted}
          />
          {search.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearch('')}
              style={styles.clearBtn}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityLabel="Clear search"
            >
              <Ionicons name="close-circle" size={18} color={colors.muted} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => setAddOpen(true)} accessibilityLabel="Add customer">
          <Ionicons name="person-add" size={20} color={colors.white} />
        </TouchableOpacity>
      </View>

      {/* Filter Bar */}
      {!(error && customers.length === 0) && renderFilterBar()}

      {/* Count & Reset Row */}
      {!(error && customers.length === 0) && (
        <View style={styles.countRow}>
          <Text style={styles.countText}>
            {filtered.length} {filtered.length === 1 ? 'customer' : 'customers'}
            {filtered.length !== customers.length ? ` (filtered from ${customers.length})` : ''}
          </Text>
          {(activeFilter !== 'all' || selectedDate !== null || search.length > 0) && (
            <TouchableOpacity
              onPress={() => {
                setActiveFilter('all');
                setSelectedDate(null);
                setSearch('');
              }}
              style={styles.resetFilterBtn}
              accessibilityLabel="Reset all filters"
            >
              <Text style={styles.resetFilterText}>Reset filters</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {loading ? (
        <LoadingScreen message="Loading customers…" />
      ) : error && customers.length === 0 ? (
        <ErrorState title="Could not load customers" message={error} onRetry={() => load()} />
      ) : (
        <>
          {/* A failed refresh keeps the last good list and says why. */}
          {error ? (
            <InlineError title="Could not refresh customers" message={error} onRetry={() => load(true)} />
          ) : null}
          <FlatList
            data={filtered}
            extraData={balances}
            keyExtractor={c => String(c.id)}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => { setRefreshing(true); load(true); }}
                colors={[colors.primary]}
                tintColor={colors.primary}
              />
            }
            renderItem={renderItem}
            ListEmptyComponent={
              search ? (
                <EmptyState
                  icon="search-outline"
                  title="No customers match search"
                  text="Try a different name, phone number or part of the address."
                />
              ) : activeFilter !== 'all' || selectedDate ? (
                <EmptyState
                  icon="filter-outline"
                  title="No customers match filter"
                  text="No customers match the current filter selection. Tap Reset to view all."
                />
              ) : (
                <EmptyState
                  icon="people-outline"
                  title="No customers yet"
                  text="Customers you add, or who sign up in the app, will appear here."
                />
              )
            }
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
          />
        </>
      )}

      <CustomerStatsModal
        customer={selected}
        onClose={() => setSelected(null)}
        onUpdated={() => { setSelected(null); load(true); }}
      />

      <AddCustomerModal
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={() => load(true)}
      />

      {/* Responsive Calendar Modal */}
      <CalendarModal
        visible={calendarVisible}
        onClose={() => setCalendarVisible(false)}
        selectedDate={selectedDate || undefined}
        onSelectDate={(date) => {
          setSelectedDate(date);
          setCalendarVisible(false);
        }}
        title="Filter by Registration Date"
        quickPresets={true}
      />
    </View>
  );
};
