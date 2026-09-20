import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  TextInput, ActivityIndicator, RefreshControl, Modal,
  Switch, Alert,
} from 'react-native';
import { useRoute, RouteProp } from '@react-navigation/native';
import { LoadingScreen } from '../../components/LoadingScreen';
import { KeyboardAwareScrollView } from '../../components/KeyboardAwareScrollView';
import { Ionicons } from '@expo/vector-icons';
import { adminService, AdminStaff } from '../../services/adminService';
import { RootStackParamList, StaffRoleFilter } from '../../types/navigation';

const ROLE_TABS: { key: StaffRoleFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'riders', label: 'Riders' },
  { key: 'staff', label: 'Staff' },
];

const STATUS_COLORS: Record<string, string> = {
  Active: '#34C759',
  Inactive: '#FF9500',
  'On Leave': '#32ADE6',
  Resigned: '#888',
  Terminated: '#FF3B30',
};

// ─── Styles (declared first) ──────────────────────────────────────────────────

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
  roleTabs: {
    flexDirection: 'row', gap: 8,
    paddingHorizontal: 16, paddingTop: 10,
    backgroundColor: 'white',
  },
  roleTab: {
    flex: 1, paddingVertical: 7, borderRadius: 10,
    borderWidth: 1, borderColor: '#e4e6ea',
    alignItems: 'center', backgroundColor: 'white',
  },
  roleTabActive: { backgroundColor: '#007AFF', borderColor: '#007AFF' },
  roleTabText: { fontSize: 13, fontWeight: '600', color: '#666' },
  roleTabTextActive: { color: 'white' },
  row: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'white', paddingHorizontal: 16, paddingVertical: 12, gap: 12,
  },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 18, fontWeight: '700', color: 'white' },
  rowInfo: { flex: 1, gap: 3 },
  name: { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
  username: { fontSize: 12, color: '#888' },
  tagRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  statusBadge: {
    paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: 6, borderWidth: 1,
  },
  statusText: { fontSize: 11, fontWeight: '600' },
  riderBadge: {
    paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: 6, backgroundColor: '#32ADE615', borderWidth: 1, borderColor: '#32ADE640',
  },
  riderText: { fontSize: 11, color: '#32ADE6', fontWeight: '600' },
  separator: { height: 1, backgroundColor: '#f5f5f5' },
  emptyText: { fontSize: 15, color: '#aaa' },
});

const addModal = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: 'white', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 36, maxHeight: '92%',
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
  twoCol: { flexDirection: 'row', gap: 10 },
  label: { fontSize: 13, fontWeight: '600', color: '#444', marginBottom: 5, marginTop: 12 },
  required: { color: '#FF3B30' },
  input: {
    borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8,
    padding: 11, fontSize: 14, color: '#000', backgroundColor: '#fafafa',
  },
  passwordRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eyeBtn: {
    width: 44, height: 44, borderRadius: 8,
    backgroundColor: '#f0f0f0', alignItems: 'center', justifyContent: 'center',
  },
  toggle: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 14, paddingVertical: 10, paddingHorizontal: 14,
    backgroundColor: '#f7f8fa', borderRadius: 10, borderWidth: 1, borderColor: '#e0e0e0',
  },
  toggleLabel: { fontSize: 14, fontWeight: '600', color: '#1a1a1a' },
  toggleSub: { fontSize: 12, color: '#888', marginTop: 1 },
  statusPicker: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 6 },
  statusChip: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 14, borderWidth: 1, borderColor: '#e0e0e0',
    backgroundColor: 'white',
  },
  statusChipActive: { borderColor: 'transparent' },
  statusChipText: { fontSize: 12, fontWeight: '600' },
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

// ─── Detail / Edit modal ──────────────────────────────────────────────────────

const detailModal = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: 'white', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 10, maxHeight: '94%',
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  avatar: {
    width: 50, height: 50, borderRadius: 25,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 22, fontWeight: '700' },
  name: { fontSize: 18, fontWeight: '700', color: '#1a1a1a' },
  username: { fontSize: 13, color: '#888', marginTop: 1 },
  closeBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: '#f0f0f0', alignItems: 'center', justifyContent: 'center',
  },
  twoCol: { flexDirection: 'row', gap: 10 },
  label: { fontSize: 13, fontWeight: '600', color: '#444', marginBottom: 5, marginTop: 12 },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: '#999', letterSpacing: 0.6,
    marginTop: 20, marginBottom: 10, borderTopWidth: 1, borderTopColor: '#f0f0f0', paddingTop: 16,
  },
  input: {
    borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8,
    padding: 11, fontSize: 14, color: '#000', backgroundColor: '#fafafa',
  },
  infoCard: {
    backgroundColor: '#f7f8fa', borderRadius: 12, padding: 14, gap: 8,
    borderWidth: 1, borderColor: '#e8e8e8',
  },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  infoLabel: { fontSize: 12, color: '#999', fontWeight: '500' },
  infoValue: { fontSize: 13, color: '#333', fontWeight: '600', flex: 1, textAlign: 'right' },
  statusPicker: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 14 },
  statusChip: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 14, borderWidth: 1, borderColor: '#e0e0e0', backgroundColor: 'white',
  },
  statusChipText: { fontSize: 12, fontWeight: '600' },
  toggle: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 10, paddingHorizontal: 14,
    backgroundColor: '#f7f8fa', borderRadius: 10, borderWidth: 1, borderColor: '#e0e0e0',
    marginBottom: 2,
  },
  toggleLabel: { fontSize: 14, fontWeight: '600', color: '#1a1a1a' },
  toggleSub: { fontSize: 12, color: '#888', marginTop: 1 },
  pwRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  eyeBtn: {
    width: 44, height: 44, borderRadius: 8,
    backgroundColor: '#f0f0f0', alignItems: 'center', justifyContent: 'center',
  },
  genBtn: {
    marginTop: 10, paddingVertical: 11, borderRadius: 10,
    backgroundColor: '#FF950015', borderWidth: 1, borderColor: '#FF950040',
    alignItems: 'center',
  },
  genBtnText: { fontSize: 13, fontWeight: '700', color: '#FF9500' },
  resetBtn: {
    marginTop: 8, paddingVertical: 11, borderRadius: 10,
    backgroundColor: '#FF3B3015', borderWidth: 1, borderColor: '#FF3B3040',
    alignItems: 'center',
  },
  resetBtnText: { fontSize: 13, fontWeight: '700', color: '#FF3B30' },
  saveBtn: {
    marginTop: 18, marginBottom: 20,
    backgroundColor: '#007AFF', borderRadius: 12,
    paddingVertical: 14, alignItems: 'center',
  },
  saveBtnText: { color: 'white', fontSize: 15, fontWeight: '700' },
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
      let msg = 'Failed to create staff.';
      try { const p = JSON.parse(e.message); msg = Object.values(p).flat().join(' '); } catch {}
      setError(msg);
    } finally { setSaving(false); }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={addModal.overlay}>
        <View style={addModal.sheet}>
          <View style={addModal.header}>
            <Text style={addModal.title}>Add Staff Member</Text>
            <TouchableOpacity onPress={() => { reset(); onClose(); }} style={addModal.closeBtn}>
              <Ionicons name="close" size={20} color="#555" />
            </TouchableOpacity>
          </View>

          <KeyboardAwareScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* Name */}
            <View style={addModal.twoCol}>
              <View style={{ flex: 1 }}>
                <Text style={addModal.label}>First Name</Text>
                <TextInput style={addModal.input} value={form.first_name} onChangeText={set('first_name')} placeholder="Ali" placeholderTextColor="#000" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={addModal.label}>Last Name</Text>
                <TextInput style={addModal.input} value={form.last_name} onChangeText={set('last_name')} placeholder="Hassan" placeholderTextColor="#000" />
              </View>
            </View>

            <Text style={addModal.label}>Username <Text style={addModal.required}>*</Text></Text>
            <TextInput style={addModal.input} value={form.username} onChangeText={set('username')} placeholder="ali.staff" placeholderTextColor="#000" autoCapitalize="none" autoCorrect={false} />

            <Text style={addModal.label}>Phone</Text>
            <TextInput style={addModal.input} value={form.phone_number} onChangeText={set('phone_number')} placeholder="03xx-xxxxxxx" placeholderTextColor="#000" keyboardType="phone-pad" />

            <View style={addModal.twoCol}>
              <View style={{ flex: 1 }}>
                <Text style={addModal.label}>Department</Text>
                <TextInput style={addModal.input} value={form.department} onChangeText={set('department')} placeholder="Operations" placeholderTextColor="#000" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={addModal.label}>Designation</Text>
                <TextInput style={addModal.input} value={form.designation} onChangeText={set('designation')} placeholder="Manager" placeholderTextColor="#000" />
              </View>
            </View>

            <Text style={addModal.label}>Working Status</Text>
            <View style={addModal.statusPicker}>
              {STATUSES.map(s => {
                const color = STATUS_COLORS[s] ?? '#888';
                const active = form.working_status === s;
                return (
                  <TouchableOpacity
                    key={s}
                    style={[addModal.statusChip, active && { backgroundColor: color + '20', borderColor: color }]}
                    onPress={() => set('working_status')(s)}
                  >
                    <Text style={[addModal.statusChipText, { color: active ? color : '#888' }]}>{s}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Rider toggle */}
            <View style={addModal.toggle}>
              <View>
                <Text style={addModal.toggleLabel}>Is Rider</Text>
                <Text style={addModal.toggleSub}>Can be assigned to deliveries</Text>
              </View>
              <Switch
                value={form.is_rider}
                onValueChange={v => set('is_rider')(v)}
                trackColor={{ false: '#e0e0e0', true: '#32ADE640' }}
                thumbColor={form.is_rider ? '#32ADE6' : '#ccc'}
              />
            </View>

            {/* Rider fields */}
            {form.is_rider && (
              <View style={addModal.twoCol}>
                <View style={{ flex: 1 }}>
                  <Text style={addModal.label}>Vehicle Type</Text>
                  <TextInput style={addModal.input} value={form.vehicle_type} onChangeText={set('vehicle_type')} placeholder="Bike, Motorcycle" placeholderTextColor="#000" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={addModal.label}>Vehicle No.</Text>
                  <TextInput style={addModal.input} value={form.vehicle_number} onChangeText={set('vehicle_number')} placeholder="ABC-1234" placeholderTextColor="#000" />
                </View>
              </View>
            )}

            <Text style={addModal.label}>Password <Text style={addModal.required}>*</Text></Text>
            <View style={addModal.passwordRow}>
              <TextInput
                style={[addModal.input, { flex: 1 }]}
                value={form.password} onChangeText={set('password')}
                placeholder="Min. 6 characters" placeholderTextColor="#000"
                secureTextEntry={!showPw}
              />
              <TouchableOpacity onPress={() => setShowPw(v => !v)} style={addModal.eyeBtn}>
                <Ionicons name={showPw ? 'eye-off' : 'eye'} size={18} color="#888" />
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
                ? <ActivityIndicator size="small" color="white" />
                : (
                  <>
                    <Ionicons name="person-add" size={18} color="white" />
                    <Text style={addModal.submitText}>Register Staff</Text>
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
  const color = STATUS_COLORS[workStatus] ?? '#888';

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
      Alert.alert('Error', e.message || 'Failed to update.');
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
            Alert.alert('Error', e.message || 'Failed.');
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
            Alert.alert('Error', e.message || 'Failed.');
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
            <View style={[detailModal.avatar, { backgroundColor: color + '25' }]}>
              <Text style={[detailModal.avatarText, { color }]}>{fullName.charAt(0).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={detailModal.name}>{fullName}</Text>
              <Text style={detailModal.username}>@{staff.username}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={detailModal.closeBtn}>
              <Ionicons name="close" size={20} color="#555" />
            </TouchableOpacity>
          </View>

          <KeyboardAwareScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

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
                <Text style={[detailModal.infoValue, { color: isActive ? '#34C759' : '#FF3B30' }]}>
                  {isActive ? 'Active' : 'Disabled'}
                </Text>
              </View>
            </View>

            {/* Edit fields */}
            <Text style={detailModal.sectionLabel}>PROFILE</Text>

            <View style={detailModal.twoCol}>
              <View style={{ flex: 1 }}>
                <Text style={detailModal.label}>First Name</Text>
                <TextInput style={detailModal.input} value={firstName} onChangeText={setFirstName} placeholder="First name" placeholderTextColor="#000" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={detailModal.label}>Last Name</Text>
                <TextInput style={detailModal.input} value={lastName} onChangeText={setLastName} placeholder="Last name" placeholderTextColor="#000" />
              </View>
            </View>

            <Text style={detailModal.label}>Phone</Text>
            <TextInput style={detailModal.input} value={phone} onChangeText={setPhone} placeholder="03xx-xxxxxxx" placeholderTextColor="#000" keyboardType="phone-pad" />

            <View style={detailModal.twoCol}>
              <View style={{ flex: 1 }}>
                <Text style={detailModal.label}>Department</Text>
                <TextInput style={detailModal.input} value={department} onChangeText={setDepartment} placeholder="Operations" placeholderTextColor="#000" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={detailModal.label}>Designation</Text>
                <TextInput style={detailModal.input} value={designation} onChangeText={setDesignation} placeholder="Manager" placeholderTextColor="#000" />
              </View>
            </View>

            <Text style={detailModal.sectionLabel}>STATUS</Text>

            {/* Account active toggle */}
            <View style={[detailModal.toggle, { marginBottom: 10 }]}>
              <View>
                <Text style={detailModal.toggleLabel}>Account Active</Text>
                <Text style={detailModal.toggleSub}>Allow this staff member to log in</Text>
              </View>
              <Switch
                value={isActive}
                onValueChange={setIsActive}
                trackColor={{ false: '#FF3B3040', true: '#34C75940' }}
                thumbColor={isActive ? '#34C759' : '#FF3B30'}
              />
            </View>

            <View style={detailModal.statusPicker}>
              {STATUSES.map(s => {
                const c = STATUS_COLORS[s] ?? '#888';
                const active = workStatus === s;
                return (
                  <TouchableOpacity
                    key={s}
                    style={[detailModal.statusChip, active && { backgroundColor: c + '20', borderColor: c }]}
                    onPress={() => setWorkStatus(s)}
                  >
                    <Text style={[detailModal.statusChipText, { color: active ? c : '#888' }]}>{s}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Rider toggle */}
            <View style={detailModal.toggle}>
              <View>
                <Text style={detailModal.toggleLabel}>Is Rider</Text>
                <Text style={detailModal.toggleSub}>Can be assigned to deliveries</Text>
              </View>
              <Switch
                value={isRider}
                onValueChange={setIsRider}
                trackColor={{ false: '#e0e0e0', true: '#32ADE640' }}
                thumbColor={isRider ? '#32ADE6' : '#ccc'}
              />
            </View>

            {isRider && (
              <View style={[detailModal.twoCol, { marginTop: 10 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={detailModal.label}>Vehicle Type</Text>
                  <TextInput style={detailModal.input} value={vehicleType} onChangeText={setVehicleType} placeholder="Bike" placeholderTextColor="#000" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={detailModal.label}>Vehicle No.</Text>
                  <TextInput style={detailModal.input} value={vehicleNumber} onChangeText={setVehicleNumber} placeholder="ABC-1234" placeholderTextColor="#000" />
                </View>
              </View>
            )}

            <TouchableOpacity
              style={[detailModal.saveBtn, saving && { opacity: 0.5 }]}
              onPress={save}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator size="small" color="white" />
                : <Text style={detailModal.saveBtnText}>Save Changes</Text>
              }
            </TouchableOpacity>

            {/* Password reset */}
            <Text style={detailModal.sectionLabel}>PASSWORD MANAGEMENT</Text>
            <View style={detailModal.pwRow}>
              <TextInput
                style={[detailModal.input, { flex: 1 }]}
                value={newPw}
                onChangeText={setNewPw}
                placeholder="New password (min. 6)"
                placeholderTextColor="#000"
                secureTextEntry={!showPw}
              />
              <TouchableOpacity onPress={() => setShowPw(v => !v)} style={detailModal.eyeBtn}>
                <Ionicons name={showPw ? 'eye-off' : 'eye'} size={18} color="#888" />
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={[detailModal.resetBtn, pwSaving && { opacity: 0.5 }]}
              onPress={resetPassword}
              disabled={pwSaving}
            >
              {pwSaving
                ? <ActivityIndicator size="small" color="#FF3B30" />
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

            <View style={{ height: 36 }} />
          </KeyboardAwareScrollView>
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
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<StaffRoleFilter>(route.params?.role ?? 'all');
  const [selected, setSelected] = useState<AdminStaff | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try { setStaff(await adminService.getStaff()); }
    catch { /* silent */ }
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
    const color = STATUS_COLORS[item.working_status] ?? '#888';
    return (
      <TouchableOpacity style={styles.row} onPress={() => setSelected(item)}>
        <View style={[styles.avatar, { backgroundColor: color + '25' }]}>
          <Text style={[styles.avatarText, { color }]}>{fullName.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.rowInfo}>
          <Text style={styles.name}>{fullName}</Text>
          <Text style={styles.username}>@{item.username}</Text>
          <View style={styles.tagRow}>
            <View style={[styles.statusBadge, { backgroundColor: color + '15', borderColor: color + '40' }]}>
              <Text style={[styles.statusText, { color }]}>{item.working_status}</Text>
            </View>
            {item.is_rider && (
              <View style={styles.riderBadge}>
                <Text style={styles.riderText}>Rider</Text>
              </View>
            )}
          </View>
        </View>
        {item.phone_number && (
          <Text style={{ fontSize: 12, color: '#aaa' }}>{item.phone_number}</Text>
        )}
        <Ionicons name="chevron-forward" size={16} color="#ccc" />
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <Ionicons name="search" size={16} color="#888" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name, username, phone…"
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

      <Text style={styles.countText}>{filtered.length} {noun}</Text>

      {loading ? (
        <LoadingScreen message="Loading staff…" />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={s => String(s.id)}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} />
          }
          renderItem={renderItem}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name={role === 'riders' ? 'bicycle-outline' : 'people-outline'} size={48} color="#ccc" />
              <Text style={styles.emptyText}>No {noun} found</Text>
            </View>
          }
          contentContainerStyle={filtered.length === 0 ? { flex: 1 } : { paddingBottom: 24 }}
        />
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
