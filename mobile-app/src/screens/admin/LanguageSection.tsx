import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, StyleSheet, Switch, Text, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const token = await getAuthToken();
      const res = await fetch(`${API_URL}/localization/language-access/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setAccess(await res.json());
    } catch {
      // Silent: the section stays blank and the screen's refresh retries.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

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
      if (!res.ok) throw new Error('save failed');
      setAccess(await res.json());
    } catch {
      setAccess(previous);
      void notify({
        title: 'Could not save',
        message: 'The language setting was not changed. Please try again.',
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
          <Ionicons name="language" size={18} color="#7A5AF8" />
        </View>
        <Text style={styles.sectionTitle}>Language</Text>
      </View>

      {loading || !access ? (
        <ActivityIndicator size="small" color="#007AFF" style={{ marginVertical: 14 }} />
      ) : (
        <>
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
              trackColor={{ false: '#e0e0e0', true: '#34C75940' }}
              thumbColor={access.urdu_enabled ? '#34C759' : '#ccc'}
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
                  style={styles.typeRow}
                  onPress={() => toggleType(value)}
                  disabled={saving}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                >
                  <Ionicons
                    name={on ? 'checkbox' : 'square-outline'}
                    size={20}
                    color={on ? '#007AFF' : '#c7cdd4'}
                  />
                  <Text style={styles.typeLabel}>{label}</Text>
                  <Text style={styles.typeState}>
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
    backgroundColor: 'white', borderRadius: 14, padding: 16,
    marginHorizontal: 16, marginBottom: 14,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sectionIcon: {
    width: 34, height: 34, borderRadius: 10, backgroundColor: '#7A5AF818',
    alignItems: 'center', justifyContent: 'center',
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1a2530' },

  masterRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginTop: 14, paddingVertical: 12, paddingHorizontal: 14,
    backgroundColor: '#f7f9fc', borderRadius: 11,
    borderWidth: 1, borderColor: '#e4e9ee',
  },
  masterLabel: { fontSize: 15, fontWeight: '700', color: '#1a2530' },
  masterSub: { fontSize: 12, color: '#8a929b', marginTop: 3, lineHeight: 17 },

  groupCaption: {
    fontSize: 11, fontWeight: '700', color: '#8a929b',
    letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 18, marginBottom: 4,
  },
  disabledGroup: { opacity: 0.4 },
  typeRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#f2f4f7',
  },
  typeLabel: { flex: 1, fontSize: 14.5, color: '#1a2530', fontWeight: '600' },
  typeState: { fontSize: 12, color: '#8a929b' },
});
