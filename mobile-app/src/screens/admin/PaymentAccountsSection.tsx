import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Image, StyleSheet, Switch, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, space, fontSize, card, pagePadding } from '../../theme';
import { ErrorState, StatusPill, friendlyError } from '../../components/ui';
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
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ ...BLANK });
  const [qr, setQr] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setAccounts(await adminService.getPaymentAccounts());
    } catch (e: any) {
      setError(e?.message || 'Could not load the payment accounts.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const retry = () => { setLoading(true); load(); };

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
        message: friendlyError(e?.message),
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
    } catch (e: any) {
      void notify({ title: 'Could not update the account', message: friendlyError(e?.message), tone: 'destructive' });
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
    } catch (e: any) {
      void notify({ title: 'Could not delete the account', message: friendlyError(e?.message), tone: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionIcon}>
          <Ionicons name="card" size={20} color={colors.primary} />
        </View>
        <Text style={styles.sectionTitle}>Payment Accounts</Text>
      </View>
      <Text style={styles.sectionDesc}>
        Where customers send online transfers. Riders show these at the door.
      </Text>

      {loading ? (
        <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 14 }} />
      ) : error && accounts.length === 0 ? (
        <ErrorState
          title="Could not load the accounts"
          message={error}
          onRetry={retry}
          style={styles.errorState}
        />
      ) : (
        <>
          {!!error && (
            <View style={styles.errorNote}>
              <Ionicons name="cloud-offline-outline" size={20} color={colors.danger} />
              <Text style={styles.errorNoteText}>{friendlyError(error)}</Text>
              <TouchableOpacity onPress={retry} accessibilityLabel="Try again">
                <Text style={styles.errorNoteRetry}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}

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
                {!a.is_active && <StatusPill label="Off" tone="neutral" style={styles.offPill} />}
              </View>

              <View style={styles.rowActions}>
                <Switch
                  value={a.is_active}
                  onValueChange={() => toggle(a)}
                  disabled={busyId === a.id}
                  trackColor={{ false: colors.line, true: colors.primarySoft }}
                  thumbColor={a.is_active ? colors.primary : colors.disabled}
                />
                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={() => remove(a)}
                  disabled={busyId === a.id}
                  accessibilityLabel={`Delete ${a.bank_name}`}
                >
                  <Ionicons
                    name="trash-outline"
                    size={20}
                    color={busyId === a.id ? colors.disabled : colors.danger}
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
                placeholderTextColor={colors.muted}
                value={form.bank_name}
                onChangeText={(v) => setForm({ ...form, bank_name: v })}
              />
              <TextInput
                style={styles.input}
                placeholder="Account title, e.g. Century Sip"
                placeholderTextColor={colors.muted}
                value={form.account_title}
                onChangeText={(v) => setForm({ ...form, account_title: v })}
              />
              <TextInput
                style={styles.input}
                placeholder="Account number"
                placeholderTextColor={colors.muted}
                value={form.account_number}
                onChangeText={(v) => setForm({ ...form, account_number: v })}
              />
              <TextInput
                style={styles.input}
                placeholder="IBAN"
                placeholderTextColor={colors.muted}
                autoCapitalize="characters"
                value={form.iban}
                onChangeText={(v) => setForm({ ...form, iban: v })}
              />
              <TextInput
                style={styles.input}
                placeholder="Instructions (optional)"
                placeholderTextColor={colors.muted}
                value={form.instructions}
                onChangeText={(v) => setForm({ ...form, instructions: v })}
              />

              <TouchableOpacity style={styles.qrPick} onPress={pickQr}>
                <Ionicons name="qr-code-outline" size={20} color={colors.primary} />
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
                    ? <ActivityIndicator size="small" color={colors.white} />
                    : <Text style={styles.saveText}>Add account</Text>}
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity style={styles.addBtn} onPress={() => setAdding(true)}>
              <Ionicons name="add" size={20} color={colors.primary} />
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
    ...card,
    padding: space.lg,
    marginHorizontal: pagePadding,
    marginBottom: space.lg,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  sectionIcon: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primaryTint,
    alignItems: 'center', justifyContent: 'center',
  },
  sectionTitle: { flex: 1, fontSize: fontSize.md, fontWeight: '800', color: colors.ink },
  sectionDesc: { fontSize: fontSize.sm, color: colors.muted, marginTop: space.md, lineHeight: 20 },
  emptyText: { fontSize: fontSize.sm, color: colors.muted, marginTop: space.md, lineHeight: 20 },
  errorState: { paddingVertical: space.sm },
  errorNote: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.md, padding: space.md,
    backgroundColor: colors.dangerBg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.dangerLine,
  },
  errorNoteText: { flex: 1, fontSize: fontSize.sm, color: colors.danger, lineHeight: 19 },
  errorNoteRetry: { fontSize: fontSize.sm, fontWeight: '800', color: colors.danger, paddingHorizontal: space.sm, paddingVertical: space.sm },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.md, padding: space.md,
    backgroundColor: colors.surfaceTint, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line,
  },
  rowOff: { opacity: 0.75 },
  qr: { width: 56, height: 56, borderRadius: radius.sm, backgroundColor: colors.surface },
  qrEmpty: {
    borderWidth: 1, borderColor: colors.line, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center',
  },
  qrEmptyText: { fontSize: fontSize.xs, color: colors.muted },
  rowInfo: { flex: 1, gap: 2 },
  bank: { fontSize: fontSize.md, fontWeight: '800', color: colors.ink },
  title: { fontSize: fontSize.sm, color: colors.textSecondary },
  mono: { fontSize: fontSize.sm, fontWeight: '600', color: colors.textSecondary, fontVariant: ['tabular-nums'] },
  monoFaint: { fontSize: fontSize.xs, color: colors.muted, fontVariant: ['tabular-nums'] },
  offPill: { marginTop: 4 },
  rowActions: { alignItems: 'center', gap: space.xs },
  deleteBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.dangerBg, alignItems: 'center', justifyContent: 'center',
  },

  form: { marginTop: space.lg, gap: 10 },
  input: {
    height: 48, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md,
    paddingHorizontal: 14, fontSize: fontSize.sm, color: colors.ink, backgroundColor: colors.surfaceTint,
  },
  qrPick: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48,
    borderWidth: 1, borderColor: colors.primarySoft, borderRadius: radius.md,
    backgroundColor: colors.primaryTint, paddingHorizontal: 14,
  },
  qrPickText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.primary },
  warn: { fontSize: fontSize.sm, color: colors.warningText, lineHeight: 20 },
  formActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelBtn: {
    flex: 1, height: 50, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.muted,
    alignItems: 'center', justifyContent: 'center',
  },
  cancelText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.ink },
  saveBtn: {
    flex: 1, height: 50, borderRadius: radius.md,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  saveText: { fontSize: fontSize.sm, fontWeight: '800', color: colors.white },

  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: space.lg, height: 50, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.primarySoft, backgroundColor: colors.primaryTint,
  },
  addBtnText: { fontSize: fontSize.sm, fontWeight: '800', color: colors.primary },
});
