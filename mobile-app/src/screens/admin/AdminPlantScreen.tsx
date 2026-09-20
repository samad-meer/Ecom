import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { KeyboardAwareScrollView } from '../../components/KeyboardAwareScrollView';
import { FieldError } from '../../components/FormField';
import {
  adminService,
  PlantRecord,
  PlantSummary,
  PlantAnalytics,
  PricedType,
} from '../../services/adminService';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function today() {
  return new Date().toISOString().split('T')[0];
}

function fmt(val: string | number | undefined | null) {
  if (val == null) return '—';
  const n = parseFloat(String(val));
  return isNaN(n) ? '—' : `PKR ${n.toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

// ─── Summary cards ────────────────────────────────────────────────────────────

function SummaryCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={[sc.card, { borderLeftColor: color }]}>
      <Text style={sc.value}>{value}</Text>
      <Text style={sc.label}>{label}</Text>
    </View>
  );
}

const sc = StyleSheet.create({
  card: {
    flex: 1, backgroundColor: 'white', borderRadius: 12,
    padding: 12, borderLeftWidth: 3,
    elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 3,
  },
  value: { fontSize: 18, fontWeight: '800', color: '#1a1a1a' },
  label: { fontSize: 11, color: '#888', marginTop: 2 },
});

// ─── Ledger tab ───────────────────────────────────────────────────────────────

function LedgerTab() {
  const [records, setRecords] = useState<PlantRecord[]>([]);
  const [summary, setSummary] = useState<PlantSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDate, setSelectedDate] = useState(today());
  const [showForm, setShowForm] = useState(false);
  const [bottleTypes, setBottleTypes] = useState<PricedType[]>([]);
  const [customerTypes, setCustomerTypes] = useState<PricedType[]>([]);

  // Form state
  const [house, setHouse] = useState('');
  const [bottles, setBottles] = useState('');
  const [paidAmount, setPaidAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ house?: string; bottles?: string }>({});

  const load = useCallback(async () => {
    try {
      const [recs, sum, bt, ct] = await Promise.all([
        adminService.getPlantRecords({ date: selectedDate }),
        adminService.getPlantSummary({ date: selectedDate }),
        adminService.getBottleTypes(),
        adminService.getCustomerTypes(),
      ]);
      setRecords(recs);
      setSummary(sum);
      setBottleTypes(bt.filter(b => b.is_active));
      setCustomerTypes(ct.filter(c => c.is_active));
    } catch {
      Alert.alert('Error', 'Failed to load ledger data.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedDate]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    // On the fields themselves — a dialog listing the field names still leaves
    // the operator matching those names back to boxes.
    const missing: { house?: string; bottles?: string } = {};
    if (!house.trim()) missing.house = 'Enter the house or address';
    if (!bottles) missing.bottles = 'Enter how many bottles';
    else if (!(parseInt(bottles, 10) > 0)) missing.bottles = 'Enter a number greater than zero';
    setFieldErrors(missing);
    if (missing.house || missing.bottles) return;
    setSubmitting(true);
    try {
      await adminService.createPlantRecord({
        date: selectedDate,
        house: house.trim(),
        bottles: parseInt(bottles, 10),
        paid_amount: paidAmount ? parseFloat(paidAmount) : 0,
        notes: notes.trim(),
      });
      setHouse(''); setBottles(''); setPaidAmount(''); setNotes('');
      setShowForm(false);
      load();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to add record.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (id: number) => {
    Alert.alert(
      'Delete this delivery record?',
      `The bottles and the charge come back off the customer’s ledger, so their balance changes to match. This cannot be undone.`,
      [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try { await adminService.deletePlantRecord(id); load(); }
          catch { Alert.alert('Error', 'Failed to delete.'); }
        },
      },
    ]);
  };

  return (
    <KeyboardAwareScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
    >
      {/* Date picker row */}
      <View style={lt.dateRow}>
        <Ionicons name="calendar-outline" size={16} color="#007AFF" />
        <TextInput
          style={lt.dateInput}
          value={selectedDate}
          onChangeText={setSelectedDate}
          placeholder="YYYY-MM-DD"
          placeholderTextColor="#000"
        />
      </View>

      {/* Summary */}
      {summary && (
        <View style={lt.summaryRow}>
          <SummaryCard label="Records" value={String(summary.records)} color="#007AFF" />
          <SummaryCard label="Bottles" value={String(summary.bottles)} color="#34C759" />
          <SummaryCard label="Revenue" value={fmt(summary.amount)} color="#FF9500" />
          <SummaryCard label="Pending" value={fmt(summary.pending)} color="#FF3B30" />
        </View>
      )}

      {/* Add record button */}
      <TouchableOpacity style={lt.addBtn} onPress={() => setShowForm(v => !v)}>
        <Ionicons name={showForm ? 'close' : 'add'} size={18} color="white" />
        <Text style={lt.addBtnText}>{showForm ? 'Cancel' : 'Add Record'}</Text>
      </TouchableOpacity>

      {/* Add form */}
      {showForm && (
        <View style={lt.form}>
          <Text style={lt.formTitle}>New Delivery Record</Text>
          <TextInput
            style={[lt.input, !!fieldErrors.house && lt.inputInvalid]}
            placeholder="House / Address *"
            placeholderTextColor="#000"
            value={house}
            onChangeText={(v) => {
              setHouse(v);
              if (fieldErrors.house) setFieldErrors((e) => ({ ...e, house: undefined }));
            }}
          />
          <FieldError message={fieldErrors.house} />
          <TextInput
            style={[lt.input, !!fieldErrors.bottles && lt.inputInvalid]}
            placeholder="Bottles *"
            placeholderTextColor="#000"
            value={bottles}
            onChangeText={(v) => {
              setBottles(v);
              if (fieldErrors.bottles) setFieldErrors((e) => ({ ...e, bottles: undefined }));
            }}
            keyboardType="number-pad"
          />
          <FieldError message={fieldErrors.bottles} />
          <TextInput style={lt.input} placeholder="Amount Received (PKR)" placeholderTextColor="#000" value={paidAmount} onChangeText={setPaidAmount} keyboardType="decimal-pad" />
          <TextInput style={lt.input} placeholder="Notes (optional)" placeholderTextColor="#000" value={notes} onChangeText={setNotes} />
          <TouchableOpacity
            style={[lt.submitBtn, submitting && { opacity: 0.5 }]}
            onPress={handleAdd}
            disabled={submitting}
          >
            {submitting
              ? <ActivityIndicator size="small" color="white" />
              : <Text style={lt.submitText}>Save Record</Text>
            }
          </TouchableOpacity>
        </View>
      )}

      {/* Records list */}
      {loading ? (
        <ActivityIndicator size="large" color="#007AFF" style={{ marginTop: 32 }} />
      ) : records.length === 0 ? (
        <View style={lt.empty}>
          <Ionicons name="water-outline" size={36} color="#ddd" />
          <Text style={lt.emptyText}>No records for {selectedDate}</Text>
        </View>
      ) : (
        <View style={lt.listWrap}>
          {records.map((r) => (
            <View key={r.id} style={lt.recordCard}>
              <View style={{ flex: 1 }}>
                <Text style={lt.house}>{r.house}</Text>
                <Text style={lt.meta}>
                  {r.bottles} bottles · {fmt(r.amount)}
                  {r.bottle_type_name ? ` · ${r.bottle_type_name}` : ''}
                </Text>
                <View style={[lt.statusBadge, r.paid ? lt.paid : r.payment_status === 'partial' ? lt.partial : lt.unpaid]}>
                  <Text style={lt.statusText}>{r.payment_status.toUpperCase()}</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => handleDelete(r.id)} style={lt.deleteBtn}>
                <Ionicons name="trash-outline" size={16} color="#FF3B30" />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}
    </KeyboardAwareScrollView>
  );
}

const lt = StyleSheet.create({
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 8, margin: 16, padding: 12, backgroundColor: 'white', borderRadius: 12, borderWidth: 1, borderColor: '#e0e0e0' },
  dateInput: { flex: 1, fontSize: 14, color: '#000' },
  summaryRow: { flexDirection: 'row', gap: 8, marginHorizontal: 16, marginBottom: 12 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 16, marginBottom: 12, backgroundColor: '#007AFF', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 16 },
  addBtnText: { color: 'white', fontWeight: '700', fontSize: 14 },
  form: { marginHorizontal: 16, marginBottom: 12, backgroundColor: 'white', borderRadius: 14, padding: 16, gap: 10, elevation: 1 },
  formTitle: { fontSize: 15, fontWeight: '700', color: '#1a1a1a', marginBottom: 4 },
  inputInvalid: { borderColor: '#D93025', backgroundColor: '#FFF7F7' },
  input: { borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#000' },
  submitBtn: { backgroundColor: '#34C759', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  submitText: { color: 'white', fontWeight: '700', fontSize: 14 },
  listWrap: { marginHorizontal: 16, gap: 8 },
  recordCard: { backgroundColor: 'white', borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3 },
  house: { fontSize: 14, fontWeight: '600', color: '#1a1a1a' },
  meta: { fontSize: 12, color: '#888', marginTop: 2 },
  statusBadge: { marginTop: 6, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  statusText: { fontSize: 10, fontWeight: '700' },
  paid: { backgroundColor: '#34C75920' },
  partial: { backgroundColor: '#FF950020' },
  unpaid: { backgroundColor: '#FF3B3020' },
  deleteBtn: { padding: 8 },
  empty: { alignItems: 'center', marginTop: 48, gap: 8 },
  emptyText: { color: '#bbb', fontSize: 14 },
});

// ─── Analytics tab ────────────────────────────────────────────────────────────

function AnalyticsTab() {
  const [data, setData] = useState<PlantAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await adminService.getPlantAnalytics();
      setData(res);
    } catch {
      Alert.alert('Error', 'Failed to load analytics.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <ActivityIndicator size="large" color="#007AFF" style={{ marginTop: 64 }} />;
  if (!data) return null;

  const maxBottles = Math.max(...data.daily.map(d => d.bottles || 0), 1);

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
    >
      <Text style={at.sectionTitle}>Last 30 Days</Text>

      {/* Totals */}
      <View style={at.totalRow}>
        <SummaryCard label="Records" value={String(data.totals.records)} color="#007AFF" />
        <SummaryCard label="Bottles" value={String(data.totals.bottles)} color="#34C759" />
      </View>
      <View style={[at.totalRow, { marginTop: 8 }]}>
        <SummaryCard label="Revenue" value={fmt(data.totals.amount)} color="#FF9500" />
        <SummaryCard label="Pending" value={fmt(data.totals.pending)} color="#FF3B30" />
      </View>

      {/* Daily bar chart */}
      {data.daily.length > 0 && (
        <View style={at.chartSection}>
          <Text style={at.sectionTitle}>Daily Deliveries</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={at.chartWrap}>
              {data.daily.map((d) => {
                const heightPct = (d.bottles / maxBottles) * 80;
                return (
                  <View key={d.date} style={at.barCol}>
                    <Text style={at.barVal}>{d.bottles}</Text>
                    <View style={[at.bar, { height: Math.max(heightPct, 4) }]} />
                    <Text style={at.barDate}>{d.date.slice(5)}</Text>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </View>
      )}

      {/* Top houses */}
      {data.top_houses.length > 0 && (
        <View style={at.topSection}>
          <Text style={at.sectionTitle}>Top Houses</Text>
          {data.top_houses.map((h, i) => (
            <View key={h.house} style={at.houseRow}>
              <Text style={at.houseRank}>#{i + 1}</Text>
              <Text style={at.houseName} numberOfLines={1}>{h.house}</Text>
              <Text style={at.houseBottles}>{h.bottles} btl</Text>
              <Text style={at.houseAmt}>{fmt(h.amount)}</Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const at = StyleSheet.create({
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#555', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 },
  totalRow: { flexDirection: 'row', gap: 10 },
  chartSection: { marginTop: 20 },
  chartWrap: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, paddingBottom: 4 },
  barCol: { alignItems: 'center', width: 36 },
  barVal: { fontSize: 10, color: '#888', marginBottom: 2 },
  bar: { width: 24, backgroundColor: '#007AFF40', borderRadius: 4 },
  barDate: { fontSize: 9, color: '#bbb', marginTop: 4 },
  topSection: { marginTop: 20 },
  houseRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  houseRank: { fontSize: 12, fontWeight: '700', color: '#007AFF', width: 24 },
  houseName: { flex: 1, fontSize: 13, color: '#333' },
  houseBottles: { fontSize: 12, color: '#888', width: 50, textAlign: 'right' },
  houseAmt: { fontSize: 12, fontWeight: '600', color: '#1a1a1a', width: 80, textAlign: 'right' },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

type Tab = 'ledger' | 'analytics';

export const AdminPlantScreen: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('ledger');

  return (
    <View style={styles.container}>
      {/* Tab bar */}
      <View style={styles.tabBar}>
        {(['ledger', 'analytics'] as Tab[]).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, activeTab === t && styles.tabActive]}
            onPress={() => setActiveTab(t)}
          >
            <Ionicons
              name={t === 'ledger' ? 'list' : 'bar-chart'}
              size={15}
              color={activeTab === t ? '#007AFF' : '#aaa'}
            />
            <Text style={[styles.tabText, activeTab === t && styles.tabTextActive]}>
              {t === 'ledger' ? 'Ledger' : 'Analytics'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {activeTab === 'ledger' ? <LedgerTab /> : <AnalyticsTab />}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  tabBar: { flexDirection: 'row', backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#eee' },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 },
  tabActive: { borderBottomWidth: 2, borderBottomColor: '#007AFF' },
  tabText: { fontSize: 14, fontWeight: '600', color: '#aaa' },
  tabTextActive: { color: '#007AFF' },
});
