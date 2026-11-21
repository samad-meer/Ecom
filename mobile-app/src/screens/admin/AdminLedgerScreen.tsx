import { colors, radius, card, pagePadding } from '../../theme';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Modal, RefreshControl,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useRoute } from '@react-navigation/native';
import { LoadingScreen } from '../../components/LoadingScreen';
import { KeyboardAwareScrollView, SheetScrollView } from '../../components/KeyboardAwareScrollView';
import { EmptyState, ErrorState, StatusPill, friendlyError, Tone } from '../../components/ui';
import {
  adminService, LedgerEntry, LedgerStatement, Receivable,
} from '../../services/adminService';
import { shareCustomerStatement, sharePaymentReceipt } from '../../services/documentService';
import {
  balanceReminderMessage, canWhatsApp, openWhatsApp, paymentReceivedMessage,
} from '../../utils/whatsapp';
import { RootStackParamList } from '../../types/navigation';

// Cash-only business, so the method is fixed rather than chosen.
const PAYMENT_METHOD = 'Cash';

/** Money for display. Balances arriving here are already owed-positive. */
const fmt = (value: string | number | null | undefined) => {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return '—';
  return `PKR ${Math.abs(n).toLocaleString('en-PK', { maximumFractionDigits: 0 })}`;
};

/** The figure alone, for places that set the PKR unit in a smaller size. */
const num = (value: string | number | null | undefined) => {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return '—';
  return Math.abs(n).toLocaleString('en-PK', { maximumFractionDigits: 0 });
};

/** An owed-positive balance as the word, pill tone and amount colour to show. */
const balanceLook = (owed: number, words: { owes: string; credit: string }):
  { label: string; tone: Tone; color: string } => {
  if (owed > 0) return { label: words.owes, tone: 'danger', color: colors.danger };
  if (owed < 0) return { label: words.credit, tone: 'success', color: colors.success };
  return { label: 'Settled', tone: 'neutral', color: colors.textSecondary };
};

const today = () => new Date().toISOString().slice(0, 10);

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  tabBar: {
    flexDirection: 'row', gap: 8,
    paddingHorizontal: pagePadding, paddingTop: 12, paddingBottom: 4,
  },
  tab: {
    flex: 1, height: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line,
  },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabDisabled: { opacity: 0.6 },
  tabText: { fontSize: 14, fontWeight: '800', color: colors.ink },
  tabTextActive: { color: colors.white },

  searchBar: { paddingHorizontal: pagePadding, paddingTop: 10 },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10, height: 48, paddingHorizontal: 14,
    backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line,
  },
  searchInput: { flex: 1, fontSize: 14, color: colors.ink },
  clearBtn: { padding: 4 },
  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: pagePadding, paddingTop: 10, paddingBottom: 12 },
  filterChip: {
    height: 40, paddingHorizontal: 18, borderRadius: radius.pill, justifyContent: 'center',
    borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface,
  },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterChipText: { fontSize: 14, fontWeight: '700', color: colors.ink },
  filterChipTextActive: { color: colors.white },

  list: { paddingHorizontal: pagePadding, paddingBottom: 24, flexGrow: 1 },

  // Receivable cards
  totalCard: {
    ...card, padding: 16, marginBottom: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12,
  },
  totalLabel: { fontSize: 14, fontWeight: '700', color: colors.textSecondary, marginBottom: 4 },
  totalCount: { fontSize: 14, fontWeight: '700', color: colors.muted, textAlign: 'right' },
  row: { ...card, padding: 16, marginBottom: 12 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 20, fontWeight: '800' },
  rowInfo: { flex: 1, gap: 2 },
  name: { fontSize: 16, fontWeight: '800', color: colors.ink },
  sub: { fontSize: 14, color: colors.textSecondary },
  subMuted: { fontSize: 12, color: colors.muted },
  rowFooter: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.lineSoft,
  },
  amountUnit: { fontSize: 12, fontWeight: '700', color: colors.muted },
  amountLg: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  amountXl: { fontSize: 24, fontWeight: '800', letterSpacing: -0.3 },

  // Statement
  headerCard: { ...card, padding: 16, gap: 4, marginBottom: 12 },
  headerName: { fontSize: 20, fontWeight: '800', color: colors.ink },
  headerMeta: { fontSize: 14, color: colors.textSecondary },
  summaryRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  summaryCard: { ...card, flex: 1, padding: 16, gap: 6 },
  summaryValue: { fontSize: 24, fontWeight: '800', color: colors.ink, letterSpacing: -0.3 },
  summaryLabel: { fontSize: 14, fontWeight: '700', color: colors.textSecondary },

  entryCard: { ...card, padding: 16, marginBottom: 12 },
  entryTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  entryDate: { fontSize: 12, color: colors.muted },
  entryDoc: { fontSize: 16, fontWeight: '800', color: colors.ink, marginTop: 2 },
  entryItem: { fontSize: 14, color: colors.textSecondary, marginTop: 2 },
  entryAmountCol: { alignItems: 'flex-end', gap: 2 },
  entryAmount: { fontSize: 16, fontWeight: '800' },
  entryAmountWord: { fontSize: 12, fontWeight: '700', color: colors.muted },
  entryBalance: { fontSize: 12, color: colors.muted, textAlign: 'right' },
  entryFooter: {
    flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8,
    marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.lineSoft,
  },
  linkBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingHorizontal: 4,
  },
  linkText: { fontSize: 14, fontWeight: '800', color: colors.primary },

  actionBar: { flexDirection: 'row', gap: 10, paddingHorizontal: pagePadding, paddingTop: 8, paddingBottom: 16 },
  actionBtn: {
    flex: 1, height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: radius.md,
  },
  payBtn: { backgroundColor: colors.primary },
  shareBtn: { backgroundColor: colors.whatsapp },
  actionText: { fontSize: 14, fontWeight: '800', color: colors.white },
  shareText: { fontSize: 14, fontWeight: '800', color: colors.ink },
});

const inline = StyleSheet.create({
  box: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: pagePadding, marginBottom: 12, padding: 12,
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

const sheet = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(10,31,68,0.45)', justifyContent: 'flex-end' },
  body: {
    backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    padding: 20, paddingBottom: 34, maxHeight: '90%',
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  title: { fontSize: 20, fontWeight: '800', color: colors.ink },
  closeBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.lineSoft,
    alignItems: 'center', justifyContent: 'center',
  },
  fromBox: {
    padding: 14, borderRadius: radius.md, backgroundColor: colors.surfaceTint,
    borderWidth: 1, borderColor: colors.line, gap: 8,
  },
  fromLabel: { fontSize: 12, fontWeight: '700', color: colors.muted },
  fromName: { fontSize: 16, fontWeight: '800', color: colors.ink },
  label: { fontSize: 14, fontWeight: '700', color: colors.textSecondary, marginBottom: 6, marginTop: 16 },
  input: {
    height: 50, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md,
    paddingHorizontal: 14, fontSize: 16, color: colors.ink, backgroundColor: colors.surfaceTint,
  },
  amountInput: { height: 58, fontSize: 24, fontWeight: '800' },
  submit: {
    marginTop: 24, height: 54, backgroundColor: colors.primary, borderRadius: radius.md,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  submitText: { color: colors.white, fontSize: 16, fontWeight: '800' },
});

// ─── Record payment sheet ─────────────────────────────────────────────────────

function RecordPaymentSheet({
  visible, customer, onClose, onRecorded,
}: {
  visible: boolean;
  customer: { id: number; name: string; phone?: string | null } | null;
  onClose: () => void;
  onRecorded: (entry: LedgerEntry) => void;
}) {
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setAmount(''); setReference(''); setNotes('');
    }
  }, [visible]);

  const submit = async () => {
    const value = parseFloat(amount);
    if (!Number.isFinite(value) || value <= 0) {
      Alert.alert('Invalid amount', 'Enter an amount greater than zero.');
      return;
    }
    if (!customer) return;

    setSaving(true);
    try {
      const entry = await adminService.recordPayment({
        customer_id: customer.id,
        amount: value.toFixed(2),
        payment_method: PAYMENT_METHOD,
        reference: reference.trim(),
        notes: notes.trim(),
      });
      onRecorded(entry);
      onClose();

      // balance_after is stored credit-positive; the message wants owed.
      const owed = -Number(entry.balance_after ?? 0);
      Alert.alert(
        'Payment recorded',
        `Receipt ${entry.receipt_number}\n${fmt(entry.amount)} received.`,
        [
          { text: 'Done', style: 'cancel' },
          {
            text: 'Send receipt',
            onPress: () => sharePaymentReceipt(entry.id, entry.receipt_number),
          },
          ...(canWhatsApp(customer.phone) ? [{
            text: 'WhatsApp',
            onPress: () => openWhatsApp(customer.phone, paymentReceivedMessage({
              customerName: customer.name,
              amount: entry.amount,
              receiptNumber: entry.receipt_number,
              balanceAfter: owed,
            })),
          }] : []),
        ],
      );
    } catch (e: any) {
      Alert.alert('Could not record payment', friendlyError(e?.message));
    } finally {
      setSaving(false);
    }
  };

  if (!customer) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={sheet.overlay}>
        <View style={sheet.body}>
          <View style={sheet.header}>
            <Text style={sheet.title}>Record Payment</Text>
            <TouchableOpacity onPress={onClose} style={sheet.closeBtn} accessibilityLabel="Close">
              <Ionicons name="close" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <SheetScrollView keyboardShouldPersistTaps="handled">
            <View style={sheet.fromBox}>
              <Text style={sheet.fromLabel}>Received from</Text>
              <Text style={sheet.fromName}>{customer.name}</Text>
              <StatusPill label={`Paid by ${PAYMENT_METHOD}`} tone="neutral" icon="cash-outline" />
            </View>

            <Text style={sheet.label}>Amount (PKR) *</Text>
            <TextInput
              style={[sheet.input, sheet.amountInput]}
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={colors.muted}
              autoFocus
            />

            <Text style={sheet.label}>Reference (voucher / slip no.)</Text>
            <TextInput
              style={sheet.input} value={reference} onChangeText={setReference}
              placeholder="Optional" placeholderTextColor={colors.muted}
            />

            <Text style={sheet.label}>Notes</Text>
            <TextInput
              style={sheet.input} value={notes} onChangeText={setNotes}
              placeholder="Optional" placeholderTextColor={colors.muted}
            />

            <TouchableOpacity
              style={[sheet.submit, saving && { opacity: 0.6 }]}
              onPress={submit}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator color={colors.white} />
                : <><Ionicons name="checkmark-circle" size={20} color={colors.white} />
                    <Text style={sheet.submitText}>Record Payment</Text></>}
            </TouchableOpacity>
          </SheetScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ─── Receivables tab ──────────────────────────────────────────────────────────

function ReceivablesTab({ onOpen }: { onOpen: (r: Receivable) => void }) {
  const [rows, setRows] = useState<Receivable[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [onlyOwing, setOnlyOwing] = useState(true);
  // A slow answer to an old search must not overwrite the current list.
  const requestId = useRef(0);

  const load = useCallback(async (isRefresh = false) => {
    const id = ++requestId.current;
    if (!isRefresh) setLoading(true);
    setError(null);
    try {
      const data = await adminService.getReceivables({ search, only_owing: onlyOwing, limit: 500 });
      if (id !== requestId.current) return;
      setRows(data.results || []);
    } catch (e: any) {
      if (id !== requestId.current) return;
      // Whatever is on screen stays; the reason shows above it.
      setError(e?.message || 'Could not load balances.');
    } finally {
      if (id === requestId.current) { setLoading(false); setRefreshing(false); }
    }
  }, [search, onlyOwing]);

  useEffect(() => {
    const timer = setTimeout(() => load(), search ? 350 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  const totalOwed = rows.reduce((sum, r) => sum + Math.max(Number(r.balance), 0), 0);

  const renderRow = ({ item }: { item: Receivable }) => {
    const balance = Number(item.balance);
    const look = balanceLook(balance, { owes: 'Owes', credit: 'In credit' });
    return (
      <TouchableOpacity style={styles.row} onPress={() => onOpen(item)} activeOpacity={0.85}>
        <View style={styles.rowTop}>
          <View style={[styles.avatar, { backgroundColor: balance > 0 ? colors.dangerBg : balance < 0 ? colors.successBg : colors.primaryTint }]}>
            <Text style={[styles.avatarText, { color: balance > 0 || balance < 0 ? look.color : colors.primary }]}>
              {(item.name || item.username).charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.rowInfo}>
            <Text style={styles.name} numberOfLines={1}>{item.name || item.username}</Text>
            <Text style={styles.sub} numberOfLines={1}>
              {item.customer_code ? `#${item.customer_code} · ` : ''}{item.phone || 'No phone'}
            </Text>
            {item.bottles_held !== 0 && (
              <Text style={styles.subMuted}>{item.bottles_held} bottle(s) held</Text>
            )}
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </View>
        <View style={styles.rowFooter}>
          <StatusPill label={look.label} tone={look.tone} />
          <Text style={[styles.amountLg, { color: look.color }]}>
            <Text style={styles.amountUnit}>PKR </Text>{num(balance)}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.searchBar}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search name, code, phone…"
            placeholderTextColor={colors.muted}
            value={search}
            onChangeText={setSearch}
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
      </View>

      <View style={styles.filterRow}>
        <TouchableOpacity
          style={[styles.filterChip, onlyOwing && styles.filterChipActive]}
          onPress={() => setOnlyOwing(true)}
        >
          <Text style={[styles.filterChipText, onlyOwing && styles.filterChipTextActive]}>
            Owing
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterChip, !onlyOwing && styles.filterChipActive]}
          onPress={() => setOnlyOwing(false)}
        >
          <Text style={[styles.filterChipText, !onlyOwing && styles.filterChipTextActive]}>
            Everyone
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <LoadingScreen message="Loading balances…" />
      ) : error && rows.length === 0 ? (
        <ErrorState title="Could not load balances" message={error} onRetry={() => load()} />
      ) : (
        <>
          {error ? (
            <InlineError title="Could not refresh balances" message={error} onRetry={() => load(true)} />
          ) : null}
          <FlatList
            data={rows}
            keyExtractor={r => String(r.id)}
            renderItem={renderRow}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => { setRefreshing(true); load(true); }}
                colors={[colors.primary]}
                tintColor={colors.primary}
              />
            }
            ListHeaderComponent={
              rows.length > 0 ? (
                <View style={styles.totalCard}>
                  <View>
                    <Text style={styles.totalLabel}>Total outstanding</Text>
                    <Text style={[styles.amountXl, { color: totalOwed > 0 ? colors.danger : colors.textSecondary }]}>
                      <Text style={styles.amountUnit}>PKR </Text>{num(totalOwed)}
                    </Text>
                  </View>
                  <Text style={styles.totalCount}>{rows.length} customer(s)</Text>
                </View>
              ) : null
            }
            ListEmptyComponent={
              <EmptyState
                icon={onlyOwing ? 'checkmark-done-outline' : 'wallet-outline'}
                title={onlyOwing ? 'Nobody owes anything' : 'No customers found'}
                text={onlyOwing
                  ? 'Customers with an unpaid balance will appear here.'
                  : 'Try a different name, code or phone number.'}
              />
            }
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
          />
        </>
      )}
    </View>
  );
}

// ─── Statement tab ────────────────────────────────────────────────────────────

function StatementTab({
  customerId, customerName, onPay,
}: {
  customerId: number;
  customerName: string;
  onPay: (c: { id: number; name: string; phone?: string | null }) => void;
}) {
  const [data, setData] = useState<LedgerStatement | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    setError(null);
    try { setData(await adminService.getStatement(customerId)); }
    catch (e: any) { setError(e?.message || 'Could not load the statement.'); }
    finally { setLoading(false); setRefreshing(false); }
  }, [customerId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <LoadingScreen message="Loading statement…" />;
  if (!data) {
    return (
      <ErrorState title="Could not load the statement" message={error} onRetry={() => load()} />
    );
  }

  const balance = Number(data.closing_balance);
  const look = balanceLook(balance, { owes: 'Outstanding', credit: 'In credit' });
  const customer = { id: customerId, name: customerName, phone: data.customer.phone };

  const renderEntry = ({ item }: { item: LedgerEntry }) => {
    const isCredit = Number(item.amount) > 0;
    return (
      <View style={styles.entryCard}>
        <View style={styles.entryTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.entryDate}>{item.entry_date}</Text>
            <Text style={styles.entryDoc}>{item.document_label}</Text>
            {!!(item.item_label || item.description) && (
              <Text style={styles.entryItem}>
                {item.item_label || item.description}
                {item.quantity ? `  ·  ${Number(item.quantity)} × ${fmt(item.unit_price)}` : ''}
              </Text>
            )}
          </View>
          <View style={styles.entryAmountCol}>
            <Text style={[styles.entryAmount, { color: isCredit ? colors.success : colors.danger }]}>
              {isCredit ? '−' : '+'}{fmt(item.amount)}
            </Text>
            <Text style={styles.entryAmountWord}>{isCredit ? 'Credit' : 'Charge'}</Text>
            <Text style={styles.entryBalance}>Bal {fmt(item.running_balance)}</Text>
          </View>
        </View>

        <View style={styles.entryFooter}>
          <StatusPill label={item.source.toUpperCase()} tone="neutral" />
          {item.bottles_out !== 0 && (
            <StatusPill label={`OUT ${item.bottles_out}`} tone="neutral" />
          )}
          {item.bottles_in !== 0 && (
            <StatusPill label={`EMPTY ${item.bottles_in}`} tone="neutral" />
          )}
          {item.is_reversed && (
            <StatusPill label="VOIDED" tone="danger" />
          )}
          <View style={{ flex: 1 }} />
          {!!item.receipt_number && !item.is_reversed && (
            <TouchableOpacity
              style={styles.linkBtn}
              onPress={() => sharePaymentReceipt(item.id, item.receipt_number)}
            >
              <Ionicons name="share-outline" size={16} color={colors.primary} />
              <Text style={styles.linkText}>Receipt</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={{ flex: 1 }}>
      {/* A failed refresh keeps the statement on screen and says why. */}
      {error ? (
        <View style={{ paddingTop: 12 }}>
          <InlineError title="Could not refresh the statement" message={error} onRetry={() => load(true)} />
        </View>
      ) : null}
      <FlatList
        data={data.results}
        keyExtractor={e => String(e.id)}
        renderItem={renderEntry}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(true); }}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
        ListHeaderComponent={
          <View style={{ paddingTop: 12 }}>
            <View style={styles.headerCard}>
              <Text style={styles.headerName}>{data.customer.name}</Text>
              <Text style={styles.headerMeta}>
                {data.customer.customer_code ? `Code ${data.customer.customer_code} · ` : ''}
                {data.customer.phone || 'No phone'}
              </Text>
              {!!data.customer.address && (
                <Text style={styles.headerMeta}>{data.customer.address}</Text>
              )}
            </View>
            <View style={styles.summaryRow}>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Balance</Text>
                <Text style={[styles.summaryValue, { color: look.color }]}>
                  <Text style={styles.amountUnit}>PKR </Text>{num(balance)}
                </Text>
                <StatusPill label={look.label} tone={look.tone} />
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Bottles held</Text>
                <Text style={styles.summaryValue}>{data.closing_stock}</Text>
                <StatusPill label="With customer" tone="primary" icon="water-outline" />
              </View>
            </View>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="document-text-outline"
            title="No ledger entries yet"
            text="Orders, payments and bottle returns for this customer will be listed here."
          />
        }
        contentContainerStyle={styles.list}
      />

      <View style={styles.actionBar}>
        <TouchableOpacity style={[styles.actionBtn, styles.payBtn]} onPress={() => onPay(customer)}>
          <Ionicons name="cash-outline" size={18} color={colors.white} />
          <Text style={styles.actionText}>Record Payment</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, styles.shareBtn, sharing && { opacity: 0.6 }]}
          disabled={sharing}
          onPress={async () => {
            setSharing(true);
            await shareCustomerStatement(customerId, customerName);
            setSharing(false);
          }}
        >
          {sharing
            ? <ActivityIndicator color={colors.ink} size="small" />
            : <><Ionicons name="share-social-outline" size={18} color={colors.ink} />
                <Text style={styles.shareText}>Send Statement</Text></>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

type Tab = 'receivables' | 'statement';

export const AdminLedgerScreen: React.FC = () => {
  const route = useRoute<RouteProp<RootStackParamList, 'AdminLedger'>>();
  const [tab, setTab] = useState<Tab>(route.params?.customerId ? 'statement' : 'receivables');
  const [selected, setSelected] = useState<{ id: number; name: string; phone?: string | null } | null>(
    route.params?.customerId
      ? { id: route.params.customerId, name: route.params.customerName || 'Customer' }
      : null,
  );
  const [payFor, setPayFor] = useState<{ id: number; name: string; phone?: string | null } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const openCustomer = (r: Receivable) => {
    setSelected({ id: r.id, name: r.name || r.username, phone: r.phone });
    setTab('statement');
  };

  return (
    <View style={styles.container}>
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, tab === 'receivables' && styles.tabActive]}
          onPress={() => setTab('receivables')}
        >
          <Ionicons name="wallet-outline" size={18}
                    color={tab === 'receivables' ? colors.white : colors.ink} />
          <Text style={[styles.tabText, tab === 'receivables' && styles.tabTextActive]}>
            Receivables
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'statement' && styles.tabActive, !selected && styles.tabDisabled]}
          onPress={() => selected && setTab('statement')}
          disabled={!selected}
        >
          <Ionicons name="document-text-outline" size={18}
                    color={tab === 'statement' ? colors.white : selected ? colors.ink : colors.muted} />
          <Text style={[
            styles.tabText,
            tab === 'statement' && styles.tabTextActive,
            !selected && { color: colors.muted },
          ]}>
            Statement
          </Text>
        </TouchableOpacity>
      </View>

      {tab === 'receivables' || !selected ? (
        <ReceivablesTab onOpen={openCustomer} />
      ) : (
        <StatementTab
          key={`${selected.id}-${reloadKey}`}
          customerId={selected.id}
          customerName={selected.name}
          onPay={setPayFor}
        />
      )}

      <RecordPaymentSheet
        visible={!!payFor}
        customer={payFor}
        onClose={() => setPayFor(null)}
        onRecorded={() => setReloadKey(k => k + 1)}
      />
    </View>
  );
};
