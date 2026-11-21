import { colors, radius, card, pagePadding } from '../../theme';
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  TextInput, ActivityIndicator, RefreshControl, Modal,
  Switch, Alert,
} from 'react-native';
import { useRoute, RouteProp } from '@react-navigation/native';
import { LoadingScreen } from '../../components/LoadingScreen';
import { KeyboardAwareScrollView, SheetScrollView } from '../../components/KeyboardAwareScrollView';
import { EmptyState, ErrorState, StatusPill, friendlyError, Tone } from '../../components/ui';
import { Ionicons } from '@expo/vector-icons';
import { adminService, AdminStaff } from '../../services/adminService';
import { RootStackParamList, StaffRoleFilter } from '../../types/navigation';

const ROLE_TABS: { key: StaffRoleFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'riders', label: 'Riders' },
  { key: 'staff', label: 'Staff' },
];

/** How each working status reads: ink and soft fill for avatars and chips, plus the pill tone. */
const STATUS_LOOK: Record<string, { fg: string; bg: string; tone: Tone }> = {
  Active: { fg: colors.success, bg: colors.successBg, tone: 'success' },
  Inactive: { fg: colors.warningText, bg: colors.warningBg, tone: 'warning' },
  'On Leave': { fg: colors.info, bg: colors.infoBg, tone: 'info' },
  Resigned: { fg: colors.textSecondary, bg: colors.lineSoft, tone: 'neutral' },
  Terminated: { fg: colors.danger, bg: colors.dangerBg, tone: 'danger' },
};
const statusLook = (status: string) => STATUS_LOOK[status] ?? STATUS_LOOK.Resigned;

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

// ─── Styles (declared first) ──────────────────────────────────────────────────

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
  countText: {
    fontSize: 14, fontWeight: '700', color: colors.textSecondary,
    paddingHorizontal: pagePadding, paddingTop: 12, paddingBottom: 10,
  },
  roleTabs: {
    flexDirection: 'row', gap: 8,
    paddingHorizontal: pagePadding, paddingTop: 12,
  },
  roleTab: {
    flex: 1, height: 40, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.line,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface,
  },
  roleTabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  roleTabText: { fontSize: 14, fontWeight: '700', color: colors.ink },
  roleTabTextActive: { color: colors.white },
  list: { paddingHorizontal: pagePadding, paddingBottom: 24, flexGrow: 1 },

  card: { ...card, padding: 16, marginBottom: 12 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 48, height: 48, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 20, fontWeight: '800' },
  cardInfo: { flex: 1, gap: 2 },
  name: { fontSize: 16, fontWeight: '800', color: colors.ink },
  username: { fontSize: 14, color: colors.textSecondary },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  phoneText: { flex: 1, fontSize: 14, color: colors.textSecondary },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
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
function InlineError({ title, message, onRetry }: { title: string; message: string; onRetry: () => void }) {
  return (
    <View style={inline.box}>
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

/** Role and availability words for a person, shared by the card and the detail sheet. */
function StaffPills({ staff, workStatus, accountActive }: {
  staff: AdminStaff; workStatus: string; accountActive: boolean;
}) {
  const look = statusLook(workStatus);
  return (
    <>
      {staff.is_rider
        ? <StatusPill label="Rider" tone="info" icon="bicycle-outline" />
        : <StatusPill label="Staff" tone="primary" icon="briefcase-outline" />}
      <StatusPill label={workStatus} tone={look.tone} />
      {staff.is_rider && (
        staff.is_available
          ? <StatusPill label="Available" tone="success" icon="radio-button-on" />
          : <StatusPill label="Unavailable" tone="neutral" icon="radio-button-off" />
      )}
      {!accountActive && <StatusPill label="Account disabled" tone="danger" icon="lock-closed-outline" />}
    </>
  );
}

const addModal = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(10,31,68,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    padding: 20, paddingBottom: 36, maxHeight: '92%',
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
  twoCol: { flexDirection: 'row', gap: 10 },
  label: { fontSize: 14, fontWeight: '700', color: colors.textSecondary, marginBottom: 6, marginTop: 14 },
  required: { color: colors.danger },
  input: {
    height: 48, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md,
    paddingHorizontal: 14, fontSize: 16, color: colors.ink, backgroundColor: colors.surfaceTint,
  },
  passwordRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eyeBtn: {
    width: 48, height: 48, borderRadius: radius.md,
    backgroundColor: colors.lineSoft, alignItems: 'center', justifyContent: 'center',
  },
  toggle: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    marginTop: 16, paddingVertical: 12, paddingHorizontal: 14,
    backgroundColor: colors.surfaceTint, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line,
  },
  toggleLabel: { fontSize: 14, fontWeight: '800', color: colors.ink },
  toggleSub: { fontSize: 12, color: colors.muted, marginTop: 1 },
  statusPicker: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 2 },
  statusChip: {
    height: 40, paddingHorizontal: 14, justifyContent: 'center',
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  statusChipText: { fontSize: 14, fontWeight: '700' },
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

// ─── Detail / Edit modal ──────────────────────────────────────────────────────

const detailModal = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(10,31,68,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    padding: 20, paddingBottom: 10, maxHeight: '94%',
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  avatar: {
    width: 52, height: 52, borderRadius: 26,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 24, fontWeight: '800' },
  name: { fontSize: 20, fontWeight: '800', color: colors.ink },
  username: { fontSize: 14, color: colors.textSecondary, marginTop: 1 },
  closeBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.lineSoft, alignItems: 'center', justifyContent: 'center',
  },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  twoCol: { flexDirection: 'row', gap: 10 },
  label: { fontSize: 14, fontWeight: '700', color: colors.textSecondary, marginBottom: 6, marginTop: 12 },
  section: {
    marginTop: 16, padding: 16, borderRadius: radius.lg,
    backgroundColor: colors.surfaceTint, borderWidth: 1, borderColor: colors.line,
  },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: colors.ink },
  input: {
    height: 48, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md,
    paddingHorizontal: 14, fontSize: 16, color: colors.ink, backgroundColor: colors.surface,
  },
  infoCard: {
    backgroundColor: colors.surfaceTint, borderRadius: radius.lg, padding: 16, gap: 10,
    borderWidth: 1, borderColor: colors.line,
  },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  infoLabel: { fontSize: 14, color: colors.muted, fontWeight: '600' },
  infoValue: { fontSize: 14, color: colors.ink, fontWeight: '700', flex: 1, textAlign: 'right' },
  statusPicker: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 12, marginBottom: 12 },
  statusChip: {
    height: 40, paddingHorizontal: 14, justifyContent: 'center',
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface,
  },
  statusChipText: { fontSize: 14, fontWeight: '700' },
  toggle: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    paddingVertical: 12, paddingHorizontal: 14, marginTop: 12,
    backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line,
  },
  toggleLabel: { fontSize: 14, fontWeight: '800', color: colors.ink },
  toggleSub: { fontSize: 12, color: colors.muted, marginTop: 1 },
  pwRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 12 },
  eyeBtn: {
    width: 48, height: 48, borderRadius: radius.md,
    backgroundColor: colors.lineSoft, alignItems: 'center', justifyContent: 'center',
  },
  genBtn: {
    marginTop: 10, height: 48, borderRadius: radius.md,
    backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  genBtnText: { fontSize: 14, fontWeight: '800', color: colors.primary },
  resetBtn: {
    marginTop: 10, height: 48, borderRadius: radius.md,
    backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center',
  },
  resetBtnText: { fontSize: 14, fontWeight: '800', color: colors.white },
  saveBtn: {
    marginTop: 16, height: 52,
    backgroundColor: colors.primary, borderRadius: radius.md,
    alignItems: 'center', justifyContent: 'center',
  },
  saveBtnText: { color: colors.white, fontSize: 16, fontWeight: '800' },
});

// ─── Add Staff Modal ──────────────────────────────────────────────────────────

const STATUSES = ['Active', 'Inactive', 'On Leave', 'Resigned', 'Terminated'];

const EMPTY_FORM = {
  first_name: '', last_name: '', username: '', phone_number: '',
  password: '', is_rider: false,
  vehicle_type: '', vehicle_number: '',
  department: '', designation: '',
  working_status: 'Active',
};

function AddStaffModal({
  visible, onClose, onCreated,
}: { visible: boolean; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [showPw, setShowPw] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (key: keyof typeof EMPTY_FORM) => (val: string | boolean) =>
    setForm(f => ({ ...f, [key]: val }));

  const reset = () => { setForm(EMPTY_FORM); setError(''); setShowPw(false); };

  const submit = async () => {
    setError('');
    if (!form.username.trim()) { setError('Username is required.'); return; }
    if (form.password.length < 6) { setError('Password must be at least 6 characters.'); return; }

    setSaving(true);
    try {
      await adminService.createStaff({
        username: form.username.trim(),
        password: form.password,
        first_name: form.first_name.trim() || undefined,
        last_name: form.last_name.trim() || undefined,
        phone_number: form.phone_number.trim() || undefined,
        is_rider: form.is_rider,
        vehicle_type: form.is_rider ? (form.vehicle_type.trim() || undefined) : undefined,
        vehicle_number: form.is_rider ? (form.vehicle_number.trim() || undefined) : undefined,
        department: form.department.trim() || undefined,
        designation: form.designation.trim() || undefined,
        working_status: form.working_status,
      });
      reset();
      onCreated();
      onClose();
    } catch (e: any) {
      setError(failureReason(e, 'Failed to create staff'));
    } finally { setSaving(false); }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={addModal.overlay}>
        <View style={addModal.sheet}>
          <View style={addModal.header}>
            <Text style={addModal.title}>Add Staff Member</Text>
            <TouchableOpacity onPress={() => { reset(); onClose(); }} style={addModal.closeBtn} accessibilityLabel="Close">
              <Ionicons name="close" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <SheetScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* Name */}
            <View style={addModal.twoCol}>
              <View style={{ flex: 1 }}>
                <Text style={addModal.label}>First Name</Text>
                <TextInput style={addModal.input} value={form.first_name} onChangeText={set('first_name')} placeholder="Ali" placeholderTextColor={colors.muted} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={addModal.label}>Last Name</Text>
                <TextInput style={addModal.input} value={form.last_name} onChangeText={set('last_name')} placeholder="Hassan" placeholderTextColor={colors.muted} />
              </View>
            </View>

            <Text style={addModal.label}>Username <Text style={addModal.required}>*</Text></Text>
            <TextInput style={addModal.input} value={form.username} onChangeText={set('username')} placeholder="ali.staff" placeholderTextColor={colors.muted} autoCapitalize="none" autoCorrect={false} />

            <Text style={addModal.label}>Phone</Text>
            <TextInput style={addModal.input} value={form.phone_number} onChangeText={set('phone_number')} placeholder="03xx-xxxxxxx" placeholderTextColor={colors.muted} keyboardType="phone-pad" />

            <View style={addModal.twoCol}>
              <View style={{ flex: 1 }}>
                <Text style={addModal.label}>Department</Text>
                <TextInput style={addModal.input} value={form.department} onChangeText={set('department')} placeholder="Operations" placeholderTextColor={colors.muted} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={addModal.label}>Designation</Text>
                <TextInput style={addModal.input} value={form.designation} onChangeText={set('designation')} placeholder="Manager" placeholderTextColor={colors.muted} />
              </View>
            </View>

            <Text style={addModal.label}>Working Status</Text>
            <View style={addModal.statusPicker}>
              {STATUSES.map(s => {
                const look = statusLook(s);
                const active = form.working_status === s;
                return (
                  <TouchableOpacity
                    key={s}
                    style={[addModal.statusChip, active && { backgroundColor: look.bg, borderColor: look.fg }]}
                    onPress={() => set('working_status')(s)}
                  >
                    <Text style={[addModal.statusChipText, { color: active ? colors.ink : colors.textSecondary }]}>{s}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Rider toggle */}
            <View style={addModal.toggle}>
              <View style={{ flex: 1 }}>
                <Text style={addModal.toggleLabel}>Is Rider</Text>
                <Text style={addModal.toggleSub}>Can be assigned to deliveries</Text>
              </View>
              <Switch
                value={form.is_rider}
                onValueChange={v => set('is_rider')(v)}
                trackColor={{ false: colors.line, true: colors.info + '40' }}
                thumbColor={form.is_rider ? colors.info : colors.muted}
              />
            </View>

            {/* Rider fields */}
            {form.is_rider && (
              <View style={addModal.twoCol}>
                <View style={{ flex: 1 }}>
                  <Text style={addModal.label}>Vehicle Type</Text>
                  <TextInput style={addModal.input} value={form.vehicle_type} onChangeText={set('vehicle_type')} placeholder="Bike, Motorcycle" placeholderTextColor={colors.muted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={addModal.label}>Vehicle No.</Text>
                  <TextInput style={addModal.input} value={form.vehicle_number} onChangeText={set('vehicle_number')} placeholder="ABC-1234" placeholderTextColor={colors.muted} />
                </View>
              </View>
            )}

            <Text style={addModal.label}>Password <Text style={addModal.required}>*</Text></Text>
            <View style={addModal.passwordRow}>
              <TextInput
                style={[addModal.input, { flex: 1 }]}
                value={form.password} onChangeText={set('password')}
                placeholder="Min. 6 characters" placeholderTextColor={colors.muted}
                secureTextEntry={!showPw}
              />
              <TouchableOpacity onPress={() => setShowPw(v => !v)} style={addModal.eyeBtn}>
                <Ionicons name={showPw ? 'eye-off' : 'eye'} size={18} color={colors.muted} />
              </TouchableOpacity>
            </View>

            {error !== '' && (
              <View style={addModal.errorBox}>
                <Text style={addModal.errorText}>{error}</Text>
              </View>
            )}

            <TouchableOpacity
              style={[addModal.submitBtn, saving && { opacity: 0.6 }]}
              onPress={submit}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator size="small" color={colors.white} />
                : (
                  <>
                    <Ionicons name="person-add" size={18} color={colors.white} />
                    <Text style={addModal.submitText}>Register Staff</Text>
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

// ─── Staff Detail / Edit Modal ────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' });
}

function StaffDetailModal({
  staff, onClose, onUpdated,
}: { staff: AdminStaff | null; onClose: () => void; onUpdated: () => void }) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [department, setDepartment] = useState('');
  const [designation, setDesignation] = useState('');
  const [workStatus, setWorkStatus] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [isRider, setIsRider] = useState(false);
  const [vehicleType, setVehicleType] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [saving, setSaving] = useState(false);

  // Password reset
  const [newPw, setNewPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);

  useEffect(() => {
    if (staff) {
      setFirstName(staff.first_name || '');
      setLastName(staff.last_name || '');
      setPhone(staff.phone_number || '');
      setDepartment(staff.department || '');
      setDesignation(staff.designation || '');
      setWorkStatus(staff.working_status);
      setIsActive(staff.is_active);
      setIsRider(staff.is_rider);
      setVehicleType(staff.vehicle_type || '');
      setVehicleNumber(staff.vehicle_number || '');
      setNewPw('');
    }
  }, [staff]);

  if (!staff) return null;

  const fullName = staff.full_name || staff.username;
  const look = statusLook(workStatus);

  const save = async () => {
    setSaving(true);
    try {
      await adminService.updateStaff(staff.id, {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        phone_number: phone.trim() || undefined,
        department: department.trim() || undefined,
        designation: designation.trim() || undefined,
        working_status: workStatus,
        is_active: isActive,
        is_rider: isRider,
        vehicle_type: isRider ? (vehicleType.trim() || undefined) : undefined,
        vehicle_number: isRider ? (vehicleNumber.trim() || undefined) : undefined,
      });
      onUpdated();
      onClose();
    } catch (e: any) {
      Alert.alert('Error', failureReason(e, 'Failed to update'));
    } finally { setSaving(false); }
  };

  const resetPassword = async () => {
    if (newPw.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters.');
      return;
    }
    Alert.alert(
      'Reset password?',
      `${fullName} will need the new password next time they sign in. Tell them what it is — they cannot recover it themselves.`,
      [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reset', style: 'destructive',
        onPress: async () => {
          setPwSaving(true);
          try {
            await adminService.resetPassword(staff.user_id, newPw);
            setNewPw('');
            Alert.alert('Done', 'Password has been reset.');
          } catch (e: any) {
            Alert.alert('Error', failureReason(e, 'Failed to reset the password'));
          } finally { setPwSaving(false); }
        },
      },
    ]);
  };

  const generatePassword = async () => {
    Alert.alert(
      'Generate a password?',
      `A random password will be created for ${fullName} and shown to you once. Send it to them before you close it, or you will have to generate another.`,
      [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Generate',
        onPress: async () => {
          setPwSaving(true);
          try {
            const res = await adminService.generateTempPassword(staff.user_id);
            Alert.alert('Temporary Password', `New password: ${res.new_password}\n\nShare this with the staff member.`);
          } catch (e: any) {
            Alert.alert('Error', failureReason(e, 'Failed to generate a password'));
          } finally { setPwSaving(false); }
        },
      },
    ]);
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={detailModal.overlay}>
        <View style={detailModal.sheet}>
          {/* Header */}
          <View style={detailModal.header}>
            <View style={[detailModal.avatar, { backgroundColor: look.bg }]}>
              <Text style={[detailModal.avatarText, { color: look.fg }]}>{fullName.charAt(0).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={detailModal.name} numberOfLines={1}>{fullName}</Text>
              <Text style={detailModal.username}>@{staff.username}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={detailModal.closeBtn} accessibilityLabel="Close">
              <Ionicons name="close" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={detailModal.pillRow}>
            <StaffPills
              staff={{ ...staff, is_rider: isRider }}
              workStatus={workStatus}
              accountActive={isActive}
            />
          </View>

          <SheetScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

            {/* Account info */}
            <View style={detailModal.infoCard}>
              <View style={detailModal.infoRow}>
                <Text style={detailModal.infoLabel}>Last Login</Text>
                <Text style={detailModal.infoValue}>{fmtDate(staff.last_login)}</Text>
              </View>
              <View style={detailModal.infoRow}>
                <Text style={detailModal.infoLabel}>Joined</Text>
                <Text style={detailModal.infoValue}>{fmtDate(staff.date_joined)}</Text>
              </View>
              {staff.created_by_name ? (
                <View style={detailModal.infoRow}>
                  <Text style={detailModal.infoLabel}>Created By</Text>
                  <Text style={detailModal.infoValue}>{staff.created_by_name}</Text>
                </View>
              ) : null}
              <View style={detailModal.infoRow}>
                <Text style={detailModal.infoLabel}>Account Status</Text>
                <Text style={[detailModal.infoValue, { color: isActive ? colors.success : colors.danger }]}>
                  {isActive ? 'Active' : 'Disabled'}
                </Text>
              </View>
            </View>

            {/* Edit fields */}
            <View style={detailModal.section}>
              <Text style={detailModal.sectionTitle}>Profile</Text>

              <View style={detailModal.twoCol}>
                <View style={{ flex: 1 }}>
                  <Text style={detailModal.label}>First Name</Text>
                  <TextInput style={detailModal.input} value={firstName} onChangeText={setFirstName} placeholder="First name" placeholderTextColor={colors.muted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={detailModal.label}>Last Name</Text>
                  <TextInput style={detailModal.input} value={lastName} onChangeText={setLastName} placeholder="Last name" placeholderTextColor={colors.muted} />
                </View>
              </View>

              <Text style={detailModal.label}>Phone</Text>
              <TextInput style={detailModal.input} value={phone} onChangeText={setPhone} placeholder="03xx-xxxxxxx" placeholderTextColor={colors.muted} keyboardType="phone-pad" />

              <View style={detailModal.twoCol}>
                <View style={{ flex: 1 }}>
                  <Text style={detailModal.label}>Department</Text>
                  <TextInput style={detailModal.input} value={department} onChangeText={setDepartment} placeholder="Operations" placeholderTextColor={colors.muted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={detailModal.label}>Designation</Text>
                  <TextInput style={detailModal.input} value={designation} onChangeText={setDesignation} placeholder="Manager" placeholderTextColor={colors.muted} />
                </View>
              </View>
            </View>

            <View style={detailModal.section}>
              <Text style={detailModal.sectionTitle}>Status</Text>

              {/* Account active toggle */}
              <View style={detailModal.toggle}>
                <View style={{ flex: 1 }}>
                  <Text style={detailModal.toggleLabel}>Account Active</Text>
                  <Text style={detailModal.toggleSub}>Allow this staff member to log in</Text>
                </View>
                <Switch
                  value={isActive}
                  onValueChange={setIsActive}
                  trackColor={{ false: colors.danger + '40', true: colors.success + '40' }}
                  thumbColor={isActive ? colors.success : colors.danger}
                />
              </View>

              <View style={detailModal.statusPicker}>
                {STATUSES.map(s => {
                  const c = statusLook(s);
                  const active = workStatus === s;
                  return (
                    <TouchableOpacity
                      key={s}
                      style={[detailModal.statusChip, active && { backgroundColor: c.bg, borderColor: c.fg }]}
                      onPress={() => setWorkStatus(s)}
                    >
                      <Text style={[detailModal.statusChipText, { color: active ? colors.ink : colors.textSecondary }]}>{s}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Rider toggle */}
              <View style={[detailModal.toggle, { marginTop: 0 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={detailModal.toggleLabel}>Is Rider</Text>
                  <Text style={detailModal.toggleSub}>Can be assigned to deliveries</Text>
                </View>
                <Switch
                  value={isRider}
                  onValueChange={setIsRider}
                  trackColor={{ false: colors.line, true: colors.info + '40' }}
                  thumbColor={isRider ? colors.info : colors.muted}
                />
              </View>

              {isRider && (
                <View style={detailModal.twoCol}>
                  <View style={{ flex: 1 }}>
                    <Text style={detailModal.label}>Vehicle Type</Text>
                    <TextInput style={detailModal.input} value={vehicleType} onChangeText={setVehicleType} placeholder="Bike" placeholderTextColor={colors.muted} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={detailModal.label}>Vehicle No.</Text>
                    <TextInput style={detailModal.input} value={vehicleNumber} onChangeText={setVehicleNumber} placeholder="ABC-1234" placeholderTextColor={colors.muted} />
                  </View>
                </View>
              )}
            </View>

            <TouchableOpacity
              style={[detailModal.saveBtn, saving && { opacity: 0.5 }]}
              onPress={save}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator size="small" color={colors.white} />
                : <Text style={detailModal.saveBtnText}>Save Changes</Text>
              }
            </TouchableOpacity>

            {/* Password reset */}
            <View style={detailModal.section}>
              <Text style={detailModal.sectionTitle}>Password management</Text>
              <View style={detailModal.pwRow}>
                <TextInput
                  style={[detailModal.input, { flex: 1 }]}
                  value={newPw}
                  onChangeText={setNewPw}
                  placeholder="New password (min. 6)"
                  placeholderTextColor={colors.muted}
                  secureTextEntry={!showPw}
                />
                <TouchableOpacity onPress={() => setShowPw(v => !v)} style={detailModal.eyeBtn}>
                  <Ionicons name={showPw ? 'eye-off' : 'eye'} size={18} color={colors.muted} />
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={[detailModal.resetBtn, pwSaving && { opacity: 0.5 }]}
                onPress={resetPassword}
                disabled={pwSaving}
              >
                {pwSaving
                  ? <ActivityIndicator size="small" color={colors.white} />
                  : <Text style={detailModal.resetBtnText}>Set Password</Text>
                }
              </TouchableOpacity>
              <TouchableOpacity
                style={[detailModal.genBtn, pwSaving && { opacity: 0.5 }]}
                onPress={generatePassword}
                disabled={pwSaving}
              >
                <Text style={detailModal.genBtnText}>Generate Temporary Password</Text>
              </TouchableOpacity>
            </View>

            <View style={{ height: 36 }} />
          </SheetScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export const AdminStaffScreen: React.FC = () => {
  const route = useRoute<RouteProp<RootStackParamList, 'AdminStaff'>>();
  const [staff, setStaff] = useState<AdminStaff[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<StaffRoleFilter>(route.params?.role ?? 'all');
  const [selected, setSelected] = useState<AdminStaff | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    setError(null);
    try { setStaff(await adminService.getStaff()); }
    catch (e: any) { setError(e?.message || 'Could not load staff.'); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const byRole = role === 'all'
    ? staff
    : staff.filter(s => (role === 'riders' ? s.is_rider : !s.is_rider));

  const filtered = search
    ? byRole.filter(s => {
        const name = s.full_name.toLowerCase();
        const q = search.toLowerCase();
        return name.includes(q) || s.username.toLowerCase().includes(q) ||
          (s.phone_number && s.phone_number.includes(q));
      })
    : byRole;

  const noun = role === 'riders' ? 'riders' : role === 'staff' ? 'staff members' : 'staff & riders';

  const renderItem = ({ item }: { item: AdminStaff }) => {
    const fullName = item.full_name || item.username;
    const look = statusLook(item.working_status);
    return (
      <TouchableOpacity style={styles.card} onPress={() => setSelected(item)} activeOpacity={0.85}>
        <View style={styles.cardTop}>
          <View style={[styles.avatar, { backgroundColor: look.bg }]}>
            <Text style={[styles.avatarText, { color: look.fg }]}>{fullName.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={styles.cardInfo}>
            <Text style={styles.name} numberOfLines={1}>{fullName}</Text>
            <Text style={styles.username} numberOfLines={1}>@{item.username}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </View>

        {item.phone_number ? (
          <View style={styles.phoneRow}>
            <Ionicons name="call-outline" size={16} color={colors.muted} />
            <Text style={styles.phoneText} numberOfLines={1}>{item.phone_number}</Text>
          </View>
        ) : null}

        <View style={styles.pillRow}>
          <StaffPills staff={item} workStatus={item.working_status} accountActive={item.is_active} />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name, username, phone…"
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
        <TouchableOpacity style={styles.addBtn} onPress={() => setAddOpen(true)} accessibilityLabel="Add staff member">
          <Ionicons name="person-add" size={20} color={colors.white} />
        </TouchableOpacity>
      </View>

      <View style={styles.roleTabs}>
        {ROLE_TABS.map(tab => {
          const active = role === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.roleTab, active && styles.roleTabActive]}
              onPress={() => setRole(tab.key)}
            >
              <Text style={[styles.roleTabText, active && styles.roleTabTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {!(error && staff.length === 0) && (
        <Text style={styles.countText}>{filtered.length} {noun}</Text>
      )}

      {loading ? (
        <LoadingScreen message="Loading staff…" />
      ) : error && staff.length === 0 ? (
        <ErrorState title="Could not load staff" message={error} onRetry={() => load()} />
      ) : (
        <>
          {/* A failed refresh keeps the last good list and says why. */}
          {error ? (
            <InlineError title="Could not refresh staff" message={error} onRetry={() => load(true)} />
          ) : null}
          <FlatList
            data={filtered}
            keyExtractor={s => String(s.id)}
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
              <EmptyState
                icon={role === 'riders' ? 'bicycle-outline' : 'people-outline'}
                title={`No ${noun} found`}
                text={search
                  ? 'Try a different name, username or phone number.'
                  : 'Use the add button above to register someone.'}
              />
            }
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
          />
        </>
      )}

      <StaffDetailModal
        staff={selected}
        onClose={() => setSelected(null)}
        onUpdated={() => load(true)}
      />
      <AddStaffModal
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={() => load(true)}
      />
    </View>
  );
};
