import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Modal, RefreshControl,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useRoute } from '@react-navigation/native';
import { LoadingScreen } from '../../components/LoadingScreen';
import { KeyboardAwareScrollView } from '../../components/KeyboardAwareScrollView';
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

const today = () => new Date().toISOString().slice(0, 10);

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  tabBar: { flexDirection: 'row', backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#eee' },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 13 },
  tabActive: { borderBottomWidth: 2, borderBottomColor: '#007AFF' },
  tabText: { fontSize: 14, fontWeight: '600', color: '#888' },
  tabTextActive: { color: '#007AFF' },

  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'white', padding: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  searchInput: { flex: 1, fontSize: 14, color: '#000' },
  filterChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14,
    borderWidth: 1, borderColor: '#e0e0e0', backgroundColor: 'white',
  },
  filterChipActive: { backgroundColor: '#007AFF', borderColor: '#007AFF' },
  filterChipText: { fontSize: 12, fontWeight: '600', color: '#666' },
  filterChipTextActive: { color: 'white' },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'white', paddingHorizontal: 16, paddingVertical: 13,
  },
  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 17, fontWeight: '700' },
  rowInfo: { flex: 1, gap: 2 },
  name: { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
  sub: { fontSize: 12, color: '#888' },
  balance: { fontSize: 15, fontWeight: '700' },
  balanceLabel: { fontSize: 10, color: '#aaa', textAlign: 'right' },
  separator: { height: 1, backgroundColor: '#f5f5f5' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, paddingTop: 60 },
  emptyText: { fontSize: 15, color: '#aaa' },

  // Statement
  headerCard: { backgroundColor: 'white', padding: 16, gap: 4 },
  headerName: { fontSize: 18, fontWeight: '700', color: '#1a1a1a' },
  headerMeta: { fontSize: 12, color: '#888' },
  summaryRow: { flexDirection: 'row', gap: 10, padding: 12 },
  summaryCard: {
    flex: 1, backgroundColor: 'white', borderRadius: 12, padding: 12,
    borderLeftWidth: 3,
  },
  summaryValue: { fontSize: 17, fontWeight: '700', color: '#1a1a1a' },
  summaryLabel: { fontSize: 11, color: '#888', marginTop: 2 },

  entryCard: {
    backgroundColor: 'white', marginHorizontal: 12, marginBottom: 8,
    borderRadius: 10, padding: 12,
  },
  entryTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  entryDate: { fontSize: 12, color: '#888' },
  entryDoc: { fontSize: 13, fontWeight: '700', color: '#1a1a1a' },
  entryItem: { fontSize: 13, color: '#555', marginTop: 2 },
  entryAmount: { fontSize: 15, fontWeight: '700' },
  entryBalance: { fontSize: 11, color: '#aaa', textAlign: 'right', marginTop: 2 },
  entryFooter: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#f2f2f2',
  },
  chip: {
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6,
    backgroundColor: '#f0f0f0',
  },
  chipText: { fontSize: 10, fontWeight: '700', color: '#777' },
  linkBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  linkText: { fontSize: 12, fontWeight: '700', color: '#007AFF' },

  actionBar: {
    flexDirection: 'row', gap: 10, padding: 12,
    backgroundColor: 'white', borderTopWidth: 1, borderTopColor: '#eee',
  },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 13, borderRadius: 10,
  },
  payBtn: { backgroundColor: '#007AFF' },
  shareBtn: { backgroundColor: '#25D366' },
  actionText: { fontSize: 14, fontWeight: '700', color: 'white' },
});

const sheet = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  body: {
    backgroundColor: 'white', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 34, maxHeight: '90%',
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  title: { fontSize: 18, fontWeight: '700', color: '#1a1a1a' },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: '#f0f0f0',
    alignItems: 'center', justifyContent: 'center',
  },
  label: { fontSize: 13, fontWeight: '600', color: '#444', marginBottom: 5, marginTop: 12 },
  input: {
    borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8,
    padding: 12, fontSize: 15, color: '#000', backgroundColor: '#fafafa',
  },
  methods: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  method: {
    paddingHorizontal: 13, paddingVertical: 7, borderRadius: 16,
    borderWidth: 1, borderColor: '#e0e0e0', backgroundColor: 'white',
  },
  methodActive: { backgroundColor: '#007AFF', borderColor: '#007AFF' },
  methodText: { fontSize: 12, fontWeight: '600', color: '#666' },
  methodTextActive: { color: 'white' },
  submit: {
    marginTop: 20, backgroundColor: '#007AFF', borderRadius: 12, paddingVertical: 15,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  submitText: { color: 'white', fontSize: 15, fontWeight: '700' },
  hint: { fontSize: 12, color: '#888', marginTop: 8 },
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
      Alert.alert('Could not record payment', e?.message || 'Please try again.');
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
            <TouchableOpacity onPress={onClose} style={sheet.closeBtn}>
              <Ionicons name="close" size={20} color="#555" />
            </TouchableOpacity>
          </View>

          <KeyboardAwareScrollView keyboardShouldPersistTaps="handled">
            <Text style={sheet.hint}>From {customer.name}</Text>

            <Text style={sheet.label}>Amount (PKR) *</Text>
            <TextInput
              style={sheet.input}
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor="#000"
              autoFocus
            />

            <Text style={sheet.label}>Reference (voucher / slip no.)</Text>
            <TextInput
              style={sheet.input} value={reference} onChangeText={setReference}
              placeholder="Optional" placeholderTextColor="#000"
            />

            <Text style={sheet.label}>Notes</Text>
            <TextInput
              style={sheet.input} value={notes} onChangeText={setNotes}
              placeholder="Optional" placeholderTextColor="#000"
            />

            <TouchableOpacity
              style={[sheet.submit, saving && { opacity: 0.6 }]}
              onPress={submit}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator color="white" />
                : <><Ionicons name="checkmark-circle" size={18} color="white" />
                    <Text style={sheet.submitText}>Record Payment</Text></>}
            </TouchableOpacity>
          </KeyboardAwareScrollView>
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
  const [search, setSearch] = useState('');
  const [onlyOwing, setOnlyOwing] = useState(true);

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const data = await adminService.getReceivables({ search, only_owing: onlyOwing });
      setRows(data.results || []);
    } catch { /* keep whatever is on screen */ }
    finally { setLoading(false); setRefreshing(false); }
  }, [search, onlyOwing]);

  useEffect(() => {
    const timer = setTimeout(() => load(), search ? 350 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  const totalOwed = rows.reduce((sum, r) => sum + Math.max(Number(r.balance), 0), 0);

  const renderRow = ({ item }: { item: Receivable }) => {
    const balance = Number(item.balance);
    const colour = balance > 0 ? '#FF3B30' : balance < 0 ? '#34C759' : '#888';
    return (
      <TouchableOpacity style={styles.row} onPress={() => onOpen(item)}>
        <View style={[styles.avatar, { backgroundColor: colour + '20' }]}>
          <Text style={[styles.avatarText, { color: colour }]}>
            {(item.name || item.username).charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.rowInfo}>
          <Text style={styles.name}>{item.name || item.username}</Text>
          <Text style={styles.sub}>
            {item.customer_code ? `#${item.customer_code} · ` : ''}{item.phone || 'No phone'}
          </Text>
          {item.bottles_held !== 0 && (
            <Text style={styles.sub}>{item.bottles_held} bottle(s) held</Text>
          )}
        </View>
        <View>
          <Text style={[styles.balance, { color: colour }]}>{fmt(balance)}</Text>
          <Text style={styles.balanceLabel}>
            {balance > 0 ? 'Owes' : balance < 0 ? 'Credit' : 'Settled'}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color="#ccc" />
      </TouchableOpacity>
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.searchBar}>
        <Ionicons name="search" size={16} color="#888" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search name, code, phone…"
          placeholderTextColor="#000"
          value={search}
          onChangeText={setSearch}
        />
        <TouchableOpacity
          style={[styles.filterChip, onlyOwing && styles.filterChipActive]}
          onPress={() => setOnlyOwing(v => !v)}
        >
          <Text style={[styles.filterChipText, onlyOwing && styles.filterChipTextActive]}>
            Owing
          </Text>
        </TouchableOpacity>
      </View>

      {rows.length > 0 && (
        <Text style={{ fontSize: 12, color: '#888', paddingHorizontal: 16, paddingVertical: 7 }}>
          {rows.length} customer(s) · {fmt(totalOwed)} outstanding
        </Text>
      )}

      {loading ? (
        <LoadingScreen message="Loading balances…" />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={r => String(r.id)}
          renderItem={renderRow}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} />
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="wallet-outline" size={48} color="#ccc" />
              <Text style={styles.emptyText}>
                {onlyOwing ? 'Nobody owes anything' : 'No customers found'}
              </Text>
            </View>
          }
          contentContainerStyle={rows.length === 0 ? { flex: 1 } : { paddingBottom: 24 }}
        />
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
  const [sharing, setSharing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try { setData(await adminService.getStatement(customerId)); }
    catch { /* keep what is on screen */ }
    finally { setLoading(false); setRefreshing(false); }
  }, [customerId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <LoadingScreen message="Loading statement…" />;
  if (!data) {
    return (
      <View style={styles.center}>
        <Ionicons name="alert-circle-outline" size={48} color="#ccc" />
        <Text style={styles.emptyText}>Could not load the statement</Text>
      </View>
    );
  }

  const balance = Number(data.closing_balance);
  const balanceColour = balance > 0 ? '#FF3B30' : balance < 0 ? '#34C759' : '#888';
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
          <View>
            <Text style={[styles.entryAmount, { color: isCredit ? '#34C759' : '#FF3B30' }]}>
              {isCredit ? '−' : '+'}{fmt(item.amount)}
            </Text>
            <Text style={styles.entryBalance}>Bal {fmt(item.running_balance)}</Text>
          </View>
        </View>

        <View style={styles.entryFooter}>
          <View style={styles.chip}><Text style={styles.chipText}>{item.source.toUpperCase()}</Text></View>
          {item.bottles_out !== 0 && (
            <View style={styles.chip}><Text style={styles.chipText}>OUT {item.bottles_out}</Text></View>
          )}
          {item.bottles_in !== 0 && (
            <View style={styles.chip}><Text style={styles.chipText}>EMPTY {item.bottles_in}</Text></View>
          )}
          {item.is_reversed && (
            <View style={[styles.chip, { backgroundColor: '#FF3B3020' }]}>
              <Text style={[styles.chipText, { color: '#FF3B30' }]}>VOIDED</Text>
            </View>
          )}
          <View style={{ flex: 1 }} />
          {!!item.receipt_number && !item.is_reversed && (
            <TouchableOpacity
              style={styles.linkBtn}
              onPress={() => sharePaymentReceipt(item.id, item.receipt_number)}
            >
              <Ionicons name="share-outline" size={14} color="#007AFF" />
              <Text style={styles.linkText}>Receipt</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={data.results}
        keyExtractor={e => String(e.id)}
        renderItem={renderEntry}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} />
        }
        ListHeaderComponent={
          <>
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
              <View style={[styles.summaryCard, { borderLeftColor: balanceColour }]}>
                <Text style={[styles.summaryValue, { color: balanceColour }]}>{fmt(balance)}</Text>
                <Text style={styles.summaryLabel}>
                  {balance > 0 ? 'Outstanding' : balance < 0 ? 'In credit' : 'Settled'}
                </Text>
              </View>
              <View style={[styles.summaryCard, { borderLeftColor: '#32ADE6' }]}>
                <Text style={styles.summaryValue}>{data.closing_stock}</Text>
                <Text style={styles.summaryLabel}>Bottles held</Text>
              </View>
            </View>
          </>
        }
        ListEmptyComponent={
          <View style={styles.center}>
            <Ionicons name="document-text-outline" size={48} color="#ccc" />
            <Text style={styles.emptyText}>No ledger entries yet</Text>
          </View>
        }
        contentContainerStyle={{ paddingBottom: 16 }}
      />

      <View style={styles.actionBar}>
        <TouchableOpacity style={[styles.actionBtn, styles.payBtn]} onPress={() => onPay(customer)}>
          <Ionicons name="cash-outline" size={17} color="white" />
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
            ? <ActivityIndicator color="white" size="small" />
            : <><Ionicons name="share-social-outline" size={17} color="white" />
                <Text style={styles.actionText}>Send Statement</Text></>}
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
          <Ionicons name="wallet-outline" size={17}
                    color={tab === 'receivables' ? '#007AFF' : '#888'} />
          <Text style={[styles.tabText, tab === 'receivables' && styles.tabTextActive]}>
            Receivables
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'statement' && styles.tabActive]}
          onPress={() => selected && setTab('statement')}
          disabled={!selected}
        >
          <Ionicons name="document-text-outline" size={17}
                    color={tab === 'statement' ? '#007AFF' : selected ? '#888' : '#ccc'} />
          <Text style={[
            styles.tabText,
            tab === 'statement' && styles.tabTextActive,
            !selected && { color: '#ccc' },
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
