import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator, RefreshControl, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { colors, radius, shadow } from '../../theme';
import { KeyboardAwareScrollView } from '../../components/KeyboardAwareScrollView';
import { useDialog } from '../../components/AppDialog';
import { friendlyError } from '../../components/ui';
import {
  adminService, PaymentClaim, PaymentClaimStatus,
} from '../../services/adminService';

/**
 * Online payments a rider has recorded but the office has not yet matched
 * against the bank or wallet. Oldest first, so nothing sits forgotten.
 *
 * Nothing here moves a customer's balance until Confirm is pressed.
 */

const TABS: { key: PaymentClaimStatus; label: string }[] = [
  { key: 'waiting', label: 'Waiting' },
  { key: 'not_found', label: 'Not found' },
  { key: 'confirmed', label: 'Done' },
];

const money = (value: string | number | null | undefined) => {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('en-PK', { maximumFractionDigits: 0 });
};

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "9:40 am" for today, "Mon 9:40 am" for an earlier day. */
const since = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const h = d.getHours();
  const time = `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
  return d.toDateString() === new Date().toDateString() ? time : `${DAYS[d.getDay()]} ${time}`;
};

export const AdminPaymentClaimsScreen: React.FC = () => {
  const dialog = useDialog();
  const [tab, setTab] = useState<PaymentClaimStatus>('waiting');
  const [search, setSearch] = useState('');
  const [claims, setClaims] = useState<PaymentClaim[]>([]);
  const [count, setCount] = useState(0);
  const [total, setTotal] = useState<string | number>(0);
  const [waitingCount, setWaitingCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [references, setReferences] = useState<Record<number, string>>({});
  // A late answer to an old tab or search must not overwrite the current list.
  const requestId = useRef(0);

  const load = useCallback(async (opts: { silent?: boolean } = {}) => {
    const id = ++requestId.current;
    if (!opts.silent) setLoading(true);
    setError(null);
    try {
      const data = await adminService.getPaymentClaims({ status: tab, search: search.trim() || undefined, limit: 100 });
      if (id !== requestId.current) return;
      setClaims(data.results);
      setCount(data.count);
      setTotal(data.total_amount);
      if (tab === 'waiting' && !search.trim()) setWaitingCount(data.count);
    } catch (e: any) {
      if (id !== requestId.current) return;
      setError(e?.message || 'Could not load payments.');
    } finally {
      if (id === requestId.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [tab, search]);

  // Reload whenever the screen is shown or the tab/search changes.
  useFocusEffect(useCallback(() => {
    const timer = setTimeout(() => { load(); }, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, search]));

  const confirm = async (claim: PaymentClaim) => {
    const reference = (references[claim.id] || '').trim();
    const who = claim.customer_name || 'this customer';
    const ok = await dialog.confirm({
      title: 'Confirm payment?',
      message: `PKR ${money(claim.amount)} from ${who}. This adds a payment to their account and prints a receipt. Only confirm if you can see it in the bank or wallet.`,
      confirmLabel: 'Confirm payment',
    });
    if (!ok) return;
    setBusyId(claim.id);
    try {
      await adminService.confirmPaymentClaim(claim.id, reference);
      setReferences((r) => { const next = { ...r }; delete next[claim.id]; return next; });
      await load({ silent: true });
      if (tab !== 'waiting') adminService.getPaymentClaims({ status: 'waiting', limit: 1 }).then((d) => setWaitingCount(d.count)).catch(() => {});
    } catch (e: any) {
      await dialog.notify({ title: 'Could not confirm', message: e?.message || 'Please try again.', tone: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  const notFound = async (claim: PaymentClaim) => {
    setBusyId(claim.id);
    try {
      await adminService.markPaymentClaimNotFound(claim.id);
      await load({ silent: true });
    } catch (e: any) {
      await dialog.notify({ title: 'Could not update', message: e?.message || 'Please try again.', tone: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  const renderClaim = (claim: PaymentClaim) => {
    const busy = busyId === claim.id;
    const open = claim.status !== 'confirmed';
    return (
      <View key={claim.id} style={styles.card}>
        <View style={styles.cardTop}>
          <View style={styles.cardInfo}>
            <Text style={styles.name} numberOfLines={1}>{claim.customer_name || 'Guest order'}</Text>
            <Text style={styles.sub} numberOfLines={2}>
              {[
                claim.claimed_by_name ? `via rider ${claim.claimed_by_name}` : null,
                claim.order ? `order #${claim.order}` : null,
                since(claim.created_at),
              ].filter(Boolean).join(' · ')}
            </Text>
          </View>
          <View style={styles.amountBox}>
            <Text style={styles.amount}>{money(claim.amount)}</Text>
            <Text style={styles.amountUnit}>PKR</Text>
          </View>
        </View>

        {claim.status === 'not_found' && (
          <View style={[styles.chip, { backgroundColor: colors.warningBg }]}>
            <Text style={[styles.chipText, { color: colors.warningText }]}>Not found in the bank yet</Text>
          </View>
        )}
        {claim.status === 'confirmed' && (
          <View style={[styles.chip, { backgroundColor: colors.successBg }]}>
            <Ionicons name="checkmark" size={14} color={colors.success} />
            <Text style={[styles.chipText, { color: colors.success }]}>
              {['Confirmed', claim.receipt_number, claim.reference ? `ref ${claim.reference}` : null].filter(Boolean).join(' · ')}
            </Text>
          </View>
        )}

        {open && (
          <>
            <TextInput
              style={styles.input}
              placeholder="Transaction ID (optional)"
              placeholderTextColor={colors.muted}
              value={references[claim.id] || ''}
              onChangeText={(v) => setReferences((r) => ({ ...r, [claim.id]: v }))}
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!busy}
            />
            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.confirmBtn, busy && styles.disabled]}
                onPress={() => confirm(claim)}
                disabled={busy}
                accessibilityLabel={`Confirm PKR ${money(claim.amount)} from ${claim.customer_name || 'guest'}`}
              >
                {busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.confirmText}>Confirm</Text>}
              </TouchableOpacity>
              {claim.status === 'waiting' && (
                <TouchableOpacity style={[styles.notFoundBtn, busy && styles.disabled]} onPress={() => notFound(claim)} disabled={busy}>
                  <Text style={styles.notFoundText}>Not found</Text>
                </TouchableOpacity>
              )}
            </View>
          </>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.summary}>
        <Text style={styles.summaryText}>
          {count} {tab === 'waiting' ? 'waiting' : tab === 'not_found' ? 'not found' : 'confirmed'}
          {Number(total) > 0 ? ` · PKR ${money(total)}` : ''}
        </Text>
      </View>

      <View style={styles.tabs}>
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <TouchableOpacity key={t.key} style={[styles.tab, active && styles.tabActive]} onPress={() => setTab(t.key)}>
              <Text style={[styles.tabText, active && styles.tabTextActive]}>
                {t.label}{t.key === 'waiting' && waitingCount ? ` ${waitingCount}` : ''}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.searchBox}>
        <Ionicons name="search" size={18} color={colors.muted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search name, phone or code"
          placeholderTextColor={colors.muted}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
        />
      </View>

      <KeyboardAwareScrollView
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load({ silent: true }); }} colors={[colors.primary]} tintColor={colors.primary} />}
      >
        {loading && claims.length === 0 ? (
          <ActivityIndicator style={styles.center} color={colors.primary} />
        ) : error ? (
          <View style={styles.center}>
            <Text style={styles.emptyTitle}>{friendlyError(error)}</Text>
            <TouchableOpacity style={styles.retry} onPress={() => load()}><Text style={styles.retryText}>Try again</Text></TouchableOpacity>
          </View>
        ) : claims.length === 0 ? (
          <View style={styles.center}>
            <View style={styles.emptyIcon}><Ionicons name="checkmark-done" size={30} color={colors.success} /></View>
            <Text style={styles.emptyTitle}>
              {tab === 'waiting' ? 'Nothing to check' : tab === 'not_found' ? 'No missing payments' : 'No confirmed payments yet'}
            </Text>
            <Text style={styles.emptyText}>
              {tab === 'waiting' ? 'When a rider records an online payment it will appear here.' : 'They will appear here.'}
            </Text>
          </View>
        ) : (
          claims.map(renderClaim)
        )}
      </KeyboardAwareScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  summary: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 10 },
  summaryText: { fontSize: 16, fontWeight: '700', color: colors.ink },

  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingBottom: 12 },
  tab: {
    minHeight: 40, paddingHorizontal: 16, paddingVertical: 9, borderRadius: radius.pill, justifyContent: 'center',
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line,
  },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { fontSize: 14, fontWeight: '700', color: colors.ink },
  tabTextActive: { color: colors.white },

  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 20, marginBottom: 12, paddingHorizontal: 16, height: 48,
    backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line,
  },
  searchInput: { flex: 1, fontSize: 15, color: colors.ink },

  list: { paddingHorizontal: 20, paddingBottom: 24, flexGrow: 1 },
  card: {
    backgroundColor: colors.surface, borderRadius: radius.xl - 4, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: colors.line, ...shadow.card,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardInfo: { flex: 1 },
  name: { fontSize: 16, fontWeight: '700', color: colors.ink },
  sub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  amountBox: { alignItems: 'flex-end' },
  amount: { fontSize: 26, fontWeight: '800', color: colors.ink, letterSpacing: -0.5 },
  amountUnit: { fontSize: 12, fontWeight: '700', color: colors.muted, marginTop: -2 },

  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    marginTop: 10, paddingHorizontal: 12, paddingVertical: 5, borderRadius: radius.pill,
  },
  chipText: { fontSize: 13, fontWeight: '700' },

  input: {
    marginTop: 12, height: 46, borderRadius: radius.md, paddingHorizontal: 14, fontSize: 15,
    backgroundColor: colors.surfaceTint, borderWidth: 1, borderColor: colors.line, color: colors.ink,
  },
  actions: { flexDirection: 'row', gap: 10, marginTop: 10 },
  confirmBtn: {
    flex: 2, height: 46, borderRadius: radius.md, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  confirmText: { color: colors.white, fontSize: 16, fontWeight: '800' },
  notFoundBtn: {
    flex: 1, height: 46, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.muted,
    alignItems: 'center', justifyContent: 'center',
  },
  notFoundText: { color: colors.ink, fontSize: 14, fontWeight: '700' },
  disabled: { opacity: 0.55 },

  center: { alignItems: 'center', justifyContent: 'center', paddingTop: 56, paddingHorizontal: 24, gap: 8 },
  emptyIcon: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: colors.successBg,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: colors.ink, textAlign: 'center' },
  emptyText: { fontSize: 14, color: colors.muted, textAlign: 'center' },
  retry: { marginTop: 8, paddingHorizontal: 20, minHeight: 44, justifyContent: 'center', borderRadius: radius.pill, backgroundColor: colors.primary },
  retryText: { color: colors.white, fontWeight: '800', fontSize: 14 },
});
