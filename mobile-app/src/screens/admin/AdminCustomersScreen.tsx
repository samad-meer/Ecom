import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  TextInput, ActivityIndicator, RefreshControl, Modal, Alert,
} from 'react-native';
import { LoadingScreen } from '../../components/LoadingScreen';
import { Ionicons } from '@expo/vector-icons';
import { adminService, AdminCustomer, CustomerStats } from '../../services/adminService';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../types/navigation';
import { balanceReminderMessage, canWhatsApp, openWhatsApp } from '../../utils/whatsapp';
import {
  AddressFields, AddressParts, EMPTY_ADDRESS, validateAddress,
  composeAddress, splitAddress,
} from '../../components/AddressFields';
import { matchesCustomerSearch } from '../../utils/customerSearch';
import { FieldLabel, PasswordRules, isPasswordValid } from '../../components/FormField';
import { KeyboardAwareScrollView } from '../../components/KeyboardAwareScrollView';

// ─── Styles (declared first so all components below can reference them) ───────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'white', padding: 12,
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  searchInput: { flex: 1, fontSize: 14, color: '#000' },
  addBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: '#007AFF', alignItems: 'center', justifyContent: 'center',
  },
  countText: { fontSize: 12, color: '#999', paddingHorizontal: 16, paddingVertical: 6 },
  row: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'white', paddingHorizontal: 16, paddingVertical: 12, gap: 12,
  },
  avatar: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: '#007AFF20', alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 18, fontWeight: '700', color: '#007AFF' },
  rowInfo: { flex: 1, gap: 2 },
  name: { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
  username: { fontSize: 12, color: '#888' },
  sub: { fontSize: 12, color: '#888', marginTop: 1 },
  separator: { height: 1, backgroundColor: '#f5f5f5' },
  emptyText: { fontSize: 15, color: '#aaa' },
});

const addModal = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: 'white', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 36, maxHeight: '90%',
  },
  header: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 16,
  },
  title: { fontSize: 18, fontWeight: '700', color: '#1a1a1a' },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#f0f0f0', alignItems: 'center', justifyContent: 'center',
  },
  row: { flexDirection: 'row', gap: 10 },
  field: { marginTop: 14 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#444', marginBottom: 8 },
  helper: { fontSize: 12, color: '#888', marginTop: 6, lineHeight: 16 },
  input: {
    borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8,
    padding: 11, fontSize: 14, color: '#000', backgroundColor: '#fafafa',
  },
  passwordRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eyeBtn: {
    width: 44, height: 44, borderRadius: 8,
    backgroundColor: '#f0f0f0', alignItems: 'center', justifyContent: 'center',
  },
  errorBox: {
    marginTop: 10, backgroundColor: '#FF3B3010', borderRadius: 8,
    padding: 10, borderWidth: 1, borderColor: '#FF3B3030',
  },
  errorText: { fontSize: 13, color: '#FF3B30' },
  submitBtn: {
    marginTop: 16, backgroundColor: '#007AFF', borderRadius: 12,
    paddingVertical: 14, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  submitText: { color: 'white', fontSize: 15, fontWeight: '700' },
});

const modal = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: 'white', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 10, maxHeight: '88%',
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  avatar: {
    width: 50, height: 50, borderRadius: 25,
    backgroundColor: '#007AFF20', alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 22, fontWeight: '700', color: '#007AFF' },
  name: { fontSize: 18, fontWeight: '700', color: '#1a1a1a' },
  username: { fontSize: 13, color: '#888', marginTop: 1 },
  closeBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: '#f0f0f0', alignItems: 'center', justifyContent: 'center',
  },
  editLabel: { fontSize: 12, fontWeight: '600', color: '#888', marginTop: 10, marginBottom: 4 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  input: {
    flex: 1, borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8,
    padding: 10, fontSize: 14, color: '#000', backgroundColor: '#fafafa',
  },
  saveBtn: {
    marginTop: 12, backgroundColor: '#007AFF', borderRadius: 10,
    paddingVertical: 12, alignItems: 'center',
  },
  saveBtnText: { color: 'white', fontSize: 14, fontWeight: '700' },
  divider: { height: 1, backgroundColor: '#f0f0f0', marginVertical: 14 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCell: {
    width: '47%', backgroundColor: '#f7f8fa',
    borderRadius: 12, padding: 14, alignItems: 'center',
  },
  statValue: { fontSize: 20, fontWeight: '700', color: '#1a1a1a' },
  statLabel: { fontSize: 11, color: '#888', marginTop: 3, textAlign: 'center' },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 7, paddingVertical: 12, borderRadius: 10, borderWidth: 1,
  },
  ledgerBtn: { borderColor: '#007AFF40', backgroundColor: '#007AFF10' },
  waBtn: { borderColor: '#25D36640', backgroundColor: '#25D36610' },
  actionText: { fontSize: 14, fontWeight: '700' },
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
      let msg = 'Failed to create customer.';
      try { const parsed = JSON.parse(e.message); msg = Object.values(parsed).flat().join(' '); } catch {}
      setError(msg);
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
              <Ionicons name="close" size={20} color="#555" />
            </TouchableOpacity>
          </View>

          <KeyboardAwareScrollView showsVerticalScrollIndicator={false} extraBottomSpace={28}>
            <View style={addModal.row}>
              <View style={{ flex: 1 }}>
                <FieldLabel text="First Name" />
                <TextInput
                  style={addModal.input} value={form.first_name} onChangeText={set('first_name')}
                  placeholder="Ali" placeholderTextColor="#000"
                />
              </View>
              <View style={{ flex: 1 }}>
                <FieldLabel text="Last Name" />
                <TextInput
                  style={addModal.input} value={form.last_name} onChangeText={set('last_name')}
                  placeholder="Hassan" placeholderTextColor="#000"
                />
              </View>
            </View>

            <View style={addModal.field}>
              <FieldLabel text="Username" required />
              <TextInput
                style={addModal.input} value={form.username} onChangeText={set('username')}
                placeholder="alihassan" placeholderTextColor="#000"
                autoCapitalize="none" autoCorrect={false}
              />
            </View>

            <View style={addModal.field}>
              <FieldLabel text="Phone" />
              <TextInput
                style={addModal.input} value={form.phone_number} onChangeText={set('phone_number')}
                placeholder="03xx-xxxxxxx" placeholderTextColor="#000" keyboardType="phone-pad"
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
                  placeholder="Leave blank — no sign-in" placeholderTextColor="#000"
                  secureTextEntry={!showPassword}
                  autoCapitalize="none" autoCorrect={false}
                />
                <TouchableOpacity onPress={() => setShowPassword(v => !v)} style={addModal.eyeBtn}>
                  <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={18} color="#888" />
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
                ? <ActivityIndicator size="small" color="white" />
                : (
                  <>
                    <Ionicons name="person-add" size={18} color="white" />
                    <Text style={addModal.submitText}>Create Account</Text>
                  </>
                )
              }
            </TouchableOpacity>
          </KeyboardAwareScrollView>
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
    setLoading(true);
    adminService.getCustomerStats(customer.id)
      .then(setStats)
      .catch(() => null)
      .finally(() => setLoading(false));
  }, [customer]);

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
      Alert.alert('Error', e.message || 'Failed to update.');
    } finally { setSaving(false); }
  };

  const lastDate = stats?.last_order_date
    ? new Date(stats.last_order_date).toLocaleDateString('en-PK', {
        day: 'numeric', month: 'short', year: 'numeric',
      })
    : '—';

  const balanceNum = stats?.account_balance ?? null;
  const balanceColor = balanceNum === null
    ? '#888'
    : balanceNum < 0 ? '#FF3B30' : balanceNum > 0 ? '#34C759' : '#888';

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={modal.overlay}>
        <View style={modal.sheet}>
          {/* Header */}
          <View style={modal.header}>
            <View style={modal.avatar}>
              <Text style={modal.avatarText}>{customer.name.charAt(0).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={modal.name}>{customer.name}</Text>
              <Text style={modal.username}>@{customer.username}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={modal.closeBtn}>
              <Ionicons name="close" size={20} color="#555" />
            </TouchableOpacity>
          </View>

          <KeyboardAwareScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* Editable contact fields */}
            <Text style={modal.editLabel}>Phone</Text>
            <View style={modal.inputRow}>
              <Ionicons name="call-outline" size={15} color="#888" style={{ marginTop: 12 }} />
              <TextInput
                style={modal.input}
                value={phone}
                onChangeText={setPhone}
                placeholder="03xx-xxxxxxx"
                placeholderTextColor="#000"
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
                  ? <ActivityIndicator size="small" color="white" />
                  : <Text style={modal.saveBtnText}>Save Changes</Text>
                }
              </TouchableOpacity>
            )}

            <View style={modal.divider} />

            {/* Order stats */}
            {loading ? (
              <ActivityIndicator size="small" color="#007AFF" style={{ marginVertical: 20 }} />
            ) : stats ? (
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
                  <Text style={modal.statValue}>{lastDate}</Text>
                  <Text style={modal.statLabel}>Last Order</Text>
                </View>
                <View style={[modal.statCell, { width: '100%' }]}>
                  <Text style={[modal.statValue, { color: balanceColor }]}>
                    {balanceNum === null
                      ? '—'
                      : `${balanceNum >= 0 ? '+' : ''}PKR ${Math.abs(balanceNum).toLocaleString()}`}
                  </Text>
                  <Text style={modal.statLabel}>
                    {balanceNum === null ? 'Balance' : balanceNum < 0 ? 'Owes' : 'Credit'}
                  </Text>
                </View>
              </View>
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
                <Ionicons name="book-outline" size={17} color="#007AFF" />
                <Text style={[modal.actionText, { color: '#007AFF' }]}>View Ledger</Text>
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
                  <Ionicons name="logo-whatsapp" size={17} color="#25D366" />
                  <Text style={[modal.actionText, { color: '#25D366' }]}>WhatsApp</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={{ height: 16 }} />
          </KeyboardAwareScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export const AdminCustomersScreen: React.FC = () => {
  const [customers, setCustomers] = useState<AdminCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<AdminCustomer | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const data = await adminService.getCustomers();
      setCustomers(data);
    } catch {
      // silent
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Multi-word, digit-tolerant on phones, and aware of the structured address
  // parts. Same rules as the server's search and the web admin's.
  const filtered = search
    ? customers.filter(c => matchesCustomerSearch(c, search))
    : customers;

  return (
    <View style={styles.container}>
      {/* Search + Add button */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={16} color="#888" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name, phone, address…"
          value={search}
          onChangeText={setSearch}
          placeholderTextColor="#000"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={16} color="#888" />
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.addBtn} onPress={() => setAddOpen(true)}>
          <Ionicons name="person-add" size={18} color="white" />
        </TouchableOpacity>
      </View>

      <Text style={styles.countText}>{filtered.length} customers</Text>

      {loading ? (
        <LoadingScreen message="Loading customers…" />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={c => String(c.id)}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} />
          }
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.row} onPress={() => setSelected(item)}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{item.name.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={styles.rowInfo}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.username}>@{item.username}</Text>
                {item.phone && (
                  <Text style={styles.sub}>📞 {item.phone}</Text>
                )}
                {item.address && (
                  <Text style={styles.sub} numberOfLines={1}>📍 {item.address}</Text>
                )}
              </View>
              <Ionicons name="chevron-forward" size={16} color="#ccc" />
            </TouchableOpacity>
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="people-outline" size={48} color="#ccc" />
              <Text style={styles.emptyText}>No customers found</Text>
            </View>
          }
          contentContainerStyle={filtered.length === 0 ? { flex: 1 } : { paddingBottom: 24 }}
        />
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
    </View>
  );
};
