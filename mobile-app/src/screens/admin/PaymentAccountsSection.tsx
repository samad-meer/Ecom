import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Image, StyleSheet, Switch, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { adminService, PaymentAccount } from '../../services/adminService';
import { useDialog } from '../../components/AppDialog';

/**
 * The accounts a customer can transfer money into, managed from the phone.
 *
 * More than one, because a customer who banks with the same institution
 * transfers instantly and for free — so the rider needs to show whichever
 * account matches, not just the one configured first.
 *
 * Turning an account off hides it from riders and customers while keeping its
 * history, which is almost always what is wanted instead of deleting.
 */

const BLANK = {
  bank_name: '',
  account_title: '',
  account_number: '',
  iban: '',
  instructions: '',
};

export function PaymentAccountsSection() {
  const { confirm, notify } = useDialog();
  const [accounts, setAccounts] = useState<PaymentAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ ...BLANK });
  const [qr, setQr] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setAccounts(await adminService.getPaymentAccounts());
    } catch {
      // Silent: the section renders empty and pull-to-refresh retries.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const pickQr = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      void notify({
        title: 'Photo access needed',
        message: 'Allow photo access to attach a QR code.',
        tone: 'destructive',
      });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
    });
    if (!result.canceled && result.assets?.[0]) setQr(result.assets[0]);
  };

  const reset = () => {
    setForm({ ...BLANK });
    setQr(null);
    setAdding(false);
  };

  // Mirrors the server rule: a card with nothing to pay into is worse than no
  // card, because the rider shows it and the customer cannot act on it.
  const payable = !!(form.account_number.trim() || form.iban.trim() || qr);
  const canSave = !!form.bank_name.trim() && !!form.account_title.trim() && payable;

  const create = async () => {
    setSaving(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([key, value]) => fd.append(key, value.trim()));
      if (qr) {
        fd.append('qr', {
          uri: qr.uri,
          name: qr.fileName || 'qr.jpg',
          type: qr.mimeType || 'image/jpeg',
        } as unknown as Blob);
      }
      await adminService.createPaymentAccount(fd);
      reset();
      await load();
    } catch (e: any) {
      void notify({
        title: 'Could not add the account',
        message: e?.message || 'Please try again.',
        tone: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (account: PaymentAccount) => {
    setBusyId(account.id);
    try {
      const fd = new FormData();
      fd.append('is_active', String(!account.is_active));
      await adminService.updatePaymentAccount(account.id, fd);
      await load();
    } catch {
      void notify({ title: 'Could not update the account', tone: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (account: PaymentAccount) => {
    const ok = await confirm({
      title: `Delete ${account.bank_name}?`,
      message:
        'Customers will no longer see this account.\n\n'
        + 'Turning it off does the same thing and can be undone.',
      confirmLabel: 'Delete account',
      destructive: true,
    });
    if (!ok) return;
    setBusyId(account.id);
    try {
      await adminService.deletePaymentAccount(account.id);
      await load();
    } catch {
      void notify({ title: 'Could not delete the account', tone: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionIcon}>
          <Ionicons name="card" size={18} color="#0A84FF" />
        </View>
        <Text style={styles.sectionTitle}>Payment Accounts</Text>
      </View>
      <Text style={styles.sectionDesc}>
        Where customers send online transfers. Riders show these at the door.
      </Text>

      {loading ? (
        <ActivityIndicator size="small" color="#007AFF" style={{ marginVertical: 14 }} />
      ) : (
        <>
          {accounts.length === 0 && !adding && (
            <Text style={styles.emptyText}>
              No accounts yet — customers cannot pay by transfer until you add one.
            </Text>
          )}

          {accounts.map((a) => (
            <View key={a.id} style={[styles.row, !a.is_active && styles.rowOff]}>
              {a.qr ? (
                <Image source={{ uri: a.qr }} style={styles.qr} resizeMode="contain" />
              ) : (
                <View style={[styles.qr, styles.qrEmpty]}>
                  <Text style={styles.qrEmptyText}>No QR</Text>
                </View>
              )}

              <View style={styles.rowInfo}>
                <Text style={styles.bank}>{a.bank_name}</Text>
                <Text style={styles.title}>{a.account_title}</Text>
                {!!a.account_number && <Text style={styles.mono}>{a.account_number}</Text>}
                {!!a.iban && <Text style={styles.monoFaint}>{a.iban}</Text>}
              </View>

              <View style={styles.rowActions}>
                <Switch
                  value={a.is_active}
                  onValueChange={() => toggle(a)}
                  disabled={busyId === a.id}
                  trackColor={{ false: '#e0e0e0', true: '#34C75940' }}
                  thumbColor={a.is_active ? '#34C759' : '#ccc'}
                />
                <TouchableOpacity onPress={() => remove(a)} disabled={busyId === a.id}>
                  <Ionicons
                    name="trash-outline"
                    size={17}
                    color={busyId === a.id ? '#ddd' : '#FF3B30'}
                  />
                </TouchableOpacity>
              </View>
            </View>
          ))}

          {adding ? (
            <View style={styles.form}>
              <TextInput
                style={styles.input}
                placeholder="Bank or wallet, e.g. Meezan Bank"
                placeholderTextColor="#000"
                value={form.bank_name}
                onChangeText={(v) => setForm({ ...form, bank_name: v })}
              />
              <TextInput
                style={styles.input}
                placeholder="Account title, e.g. Century Sip"
                placeholderTextColor="#000"
                value={form.account_title}
                onChangeText={(v) => setForm({ ...form, account_title: v })}
              />
              <TextInput
                style={styles.input}
                placeholder="Account number"
                placeholderTextColor="#000"
                value={form.account_number}
                onChangeText={(v) => setForm({ ...form, account_number: v })}
              />
              <TextInput
                style={styles.input}
                placeholder="IBAN"
                placeholderTextColor="#000"
                autoCapitalize="characters"
                value={form.iban}
                onChangeText={(v) => setForm({ ...form, iban: v })}
              />
              <TextInput
                style={styles.input}
                placeholder="Instructions (optional)"
                placeholderTextColor="#000"
                value={form.instructions}
                onChangeText={(v) => setForm({ ...form, instructions: v })}
              />

              <TouchableOpacity style={styles.qrPick} onPress={pickQr}>
                <Ionicons name="qr-code-outline" size={17} color="#0A84FF" />
                <Text style={styles.qrPickText}>
                  {qr ? 'QR selected — tap to change' : 'Attach QR code (optional)'}
                </Text>
              </TouchableOpacity>

              {!payable && (
                <Text style={styles.warn}>
                  Give an account number, an IBAN or a QR — otherwise the customer has
                  nothing to pay into.
                </Text>
              )}

              <View style={styles.formActions}>
                <TouchableOpacity style={styles.cancelBtn} onPress={reset} disabled={saving}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveBtn, (!canSave || saving) && { opacity: 0.5 }]}
                  onPress={create}
                  disabled={!canSave || saving}
                >
                  {saving
                    ? <ActivityIndicator size="small" color="white" />
                    : <Text style={styles.saveText}>Add account</Text>}
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity style={styles.addBtn} onPress={() => setAdding(true)}>
              <Ionicons name="add" size={18} color="#0A84FF" />
              <Text style={styles.addBtnText}>Add payment account</Text>
            </TouchableOpacity>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: 'white', borderRadius: 14, padding: 16,
    marginHorizontal: 16, marginBottom: 14,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sectionIcon: {
    width: 34, height: 34, borderRadius: 10, backgroundColor: '#0A84FF18',
    alignItems: 'center', justifyContent: 'center',
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1a2530' },
  sectionDesc: { fontSize: 12.5, color: '#8a929b', marginTop: 8, lineHeight: 18 },
  emptyText: { fontSize: 13, color: '#8a929b', marginTop: 14, lineHeight: 19 },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderTopWidth: 1, borderTopColor: '#f0f2f5', paddingVertical: 12, marginTop: 12,
  },
  rowOff: { opacity: 0.5 },
  qr: { width: 52, height: 52, borderRadius: 8, backgroundColor: '#fff' },
  qrEmpty: {
    borderWidth: 1, borderColor: '#e4e9ee', borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center',
  },
  qrEmptyText: { fontSize: 9, color: '#b6bcc4' },
  rowInfo: { flex: 1, gap: 1 },
  bank: { fontSize: 14.5, fontWeight: '700', color: '#1a2530' },
  title: { fontSize: 13, color: '#5b6672' },
  mono: { fontSize: 12, color: '#5b6672', fontVariant: ['tabular-nums'] },
  monoFaint: { fontSize: 11.5, color: '#8a929b', fontVariant: ['tabular-nums'] },
  rowActions: { alignItems: 'center', gap: 10 },

  form: { marginTop: 14, gap: 9 },
  input: {
    borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 9,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: '#000', backgroundColor: '#fafbfc',
  },
  qrPick: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderColor: '#b9d4ff', borderRadius: 9,
    backgroundColor: '#eaf2ff', paddingHorizontal: 12, paddingVertical: 11,
  },
  qrPickText: { fontSize: 13.5, fontWeight: '600', color: '#0A84FF' },
  warn: { fontSize: 12, color: '#8a6100', lineHeight: 17 },
  formActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    backgroundColor: '#f0f2f5', alignItems: 'center',
  },
  cancelText: { fontSize: 14.5, fontWeight: '600', color: '#5b6672' },
  saveBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    backgroundColor: '#007AFF', alignItems: 'center',
  },
  saveText: { fontSize: 14.5, fontWeight: '700', color: 'white' },

  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    marginTop: 14, paddingVertical: 12, borderRadius: 10,
    borderWidth: 1, borderColor: '#b9d4ff', backgroundColor: '#eaf2ff',
  },
  addBtnText: { fontSize: 14, fontWeight: '700', color: '#0A84FF' },
});
