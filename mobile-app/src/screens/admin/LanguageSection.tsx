import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, StyleSheet, Switch, Text, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, space, fontSize, card, pagePadding } from '../../theme';
import { ErrorState, friendlyError } from '../../components/ui';
import { API_URL } from '../../constants/config';
import { getAuthToken } from '../../services/authService';
import { useDialog } from '../../components/AppDialog';

/**
 * Whether Urdu is offered at all, and to whom.
 *
 * Two switches answering different questions. `urdu_enabled` is the master:
 * off means the app is English-only for everyone, whatever the per-user-type
 * list says. That is what the office needs while translations are still being
 * filled in — a way to withdraw a half-finished Urdu without losing the record
 * of who was allowed to use it.
 */

const USER_TYPES: { value: string; label: string }[] = [
  { value: 'customer', label: 'Customers' },
  { value: 'delivery_boy', label: 'Riders' },
  { value: 'staff', label: 'Staff' },
  { value: 'admin', label: 'Admins' },
];

interface Access {
  urdu_enabled: boolean;
  allowed_user_types: string[];
}

export function LanguageSection() {
  const { notify } = useDialog();
  const [access, setAccess] = useState<Access | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const token = await getAuthToken();
      const res = await fetch(`${API_URL}/localization/language-access/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`The server could not return the language settings (error ${res.status}).`);
      setAccess(await res.json());
    } catch (e: any) {
      setError(e?.message || 'Could not load the language settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const retry = () => { setLoading(true); load(); };

  const patch = async (body: Partial<Access>) => {
    if (!access) return;
    // Optimistic: a toggle that waits on the network feels broken.
    const previous = access;
    setAccess({ ...access, ...body });
    setSaving(true);
    try {
      const token = await getAuthToken();
      const res = await fetch(`${API_URL}/localization/language-access/`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`The server refused the change (error ${res.status}).`);
      setAccess(await res.json());
    } catch (e: any) {
      setAccess(previous);
      void notify({
        title: 'Could not save',
        message: `The language setting was not changed. ${friendlyError(e?.message)}`,
        tone: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleType = (value: string) => {
    if (!access) return;
    const next = access.allowed_user_types.includes(value)
      ? access.allowed_user_types.filter((v) => v !== value)
      : [...access.allowed_user_types, value];
    void patch({ allowed_user_types: next });
  };

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionIcon}>
          <Ionicons name="language" size={20} color={colors.primary} />
        </View>
        <Text style={styles.sectionTitle}>Language</Text>
      </View>

      {loading ? (
        <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 14 }} />
      ) : !access ? (
        <ErrorState
          title="Could not load the language settings"
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

          <View style={styles.masterRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.masterLabel}>Urdu (اردو)</Text>
              <Text style={styles.masterSub}>
                {access.urdu_enabled
                  ? 'Available in the app, to the roles ticked below.'
                  : 'Turned off — the app is English-only for everyone.'}
              </Text>
            </View>
            <Switch
              value={access.urdu_enabled}
              onValueChange={(v) => patch({ urdu_enabled: v })}
              disabled={saving}
              trackColor={{ false: colors.line, true: colors.primarySoft }}
              thumbColor={access.urdu_enabled ? colors.primary : colors.disabled}
            />
          </View>

          <Text style={styles.groupCaption}>Who can switch</Text>

          {/* Dimmed rather than hidden while Urdu is off: the office can still
              see and set who gets it for when it comes back on. */}
          <View style={!access.urdu_enabled && styles.disabledGroup} pointerEvents={access.urdu_enabled ? 'auto' : 'none'}>
            {USER_TYPES.map(({ value, label }) => {
              const on = access.allowed_user_types.includes(value);
              return (
                <TouchableOpacity
                  key={value}
                  style={[styles.typeRow, on && styles.typeRowOn]}
                  onPress={() => toggleType(value)}
                  disabled={saving}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                >
                  <Ionicons
                    name={on ? 'checkbox' : 'square-outline'}
                    size={24}
                    color={on ? colors.primary : colors.muted}
                  />
                  <Text style={styles.typeLabel}>{label}</Text>
                  <Text style={[styles.typeState, on && styles.typeStateOn]}>
                    {on ? 'Can switch' : 'English only'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
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
  errorState: { paddingVertical: space.sm },
  errorNote: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.md, padding: space.md,
    backgroundColor: colors.dangerBg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.dangerLine,
  },
  errorNoteText: { flex: 1, fontSize: fontSize.sm, color: colors.danger, lineHeight: 19 },
  errorNoteRetry: { fontSize: fontSize.sm, fontWeight: '800', color: colors.danger, paddingHorizontal: space.sm, paddingVertical: space.sm },

  masterRow: {
    flexDirection: 'row', alignItems: 'center', gap: space.md,
    marginTop: space.lg, padding: space.md,
    backgroundColor: colors.surfaceTint, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.line,
  },
  masterLabel: { fontSize: fontSize.md, fontWeight: '800', color: colors.ink },
  masterSub: { fontSize: fontSize.sm, color: colors.muted, marginTop: 3, lineHeight: 19 },

  groupCaption: {
    fontSize: fontSize.xs, fontWeight: '800', color: colors.muted,
    letterSpacing: 0.6, textTransform: 'uppercase', marginTop: space.xl, marginBottom: space.sm,
  },
  disabledGroup: { opacity: 0.4 },
  typeRow: {
    flexDirection: 'row', alignItems: 'center', gap: space.md,
    minHeight: 52, paddingHorizontal: space.md, marginBottom: space.sm,
    backgroundColor: colors.surfaceTint, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.line,
  },
  typeRowOn: { backgroundColor: colors.primaryTint, borderColor: colors.primarySoft },
  typeLabel: { flex: 1, fontSize: fontSize.md, color: colors.ink, fontWeight: '700' },
  typeState: { fontSize: fontSize.xs, fontWeight: '700', color: colors.muted },
  typeStateOn: { color: colors.primaryDark },
});
