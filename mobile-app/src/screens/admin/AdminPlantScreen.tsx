import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, space, fontSize, card, pagePadding } from '../../theme';
import { ErrorState, EmptyState, StatusPill, friendlyError } from '../../components/ui';
import { KeyboardAwareScrollView } from '../../components/KeyboardAwareScrollView';
import { FieldError } from '../../components/FormField';
import { isoDate, parseIsoDate } from '../../utils/dateRange';
import { CalendarModal } from '../../components/CalendarModal';
import {
  adminService,
  PlantRecord,
  PlantSummary,
  PlantAnalytics,
  PricedType,
} from '../../services/adminService';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** The local calendar day. toISOString() would give yesterday's date in the small hours east of UTC. */
function today() {
  return isoDate(new Date());
}

/** The number alone, for tiles that show the currency as a caption. */
function fmtNum(val: string | number | undefined | null) {
  if (val == null) return '—';
  const n = parseFloat(String(val));
  return isNaN(n) ? '—' : n.toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmt(val: string | number | undefined | null) {
  const n = fmtNum(val);
  return n === '—' ? n : `PKR ${n}`;
}

const capitalise = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

/** A failed refresh keeps the last good data on screen, so the reason sits above it. */
function ErrorBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={eb.box}>
      <Ionicons name="cloud-offline-outline" size={20} color={colors.danger} />
      <Text style={eb.text}>{friendlyError(message)}</Text>
      <TouchableOpacity onPress={onRetry} accessibilityLabel="Try again">
        <Text style={eb.retry}>Retry</Text>
      </TouchableOpacity>
    </View>
  );
}

const eb = StyleSheet.create({
  box: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.md, padding: space.md,
    backgroundColor: colors.dangerBg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.dangerLine,
  },
  text: { flex: 1, fontSize: fontSize.sm, color: colors.danger, lineHeight: 19 },
  retry: { fontSize: fontSize.sm, fontWeight: '800', color: colors.danger, paddingHorizontal: space.sm, paddingVertical: space.sm },
});

// ─── Summary tiles ────────────────────────────────────────────────────────────

const SUMMARY_TONES = {
  primary: { fg: colors.primary, bg: colors.primaryTint },
  info: { fg: colors.info, bg: colors.infoBg },
  success: { fg: colors.success, bg: colors.successBg },
  danger: { fg: colors.danger, bg: colors.dangerBg },
} as const;

function SummaryCard({
  label, value, tone, icon,
}: {
  label: string;
  value: string;
  tone: keyof typeof SUMMARY_TONES;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  const t = SUMMARY_TONES[tone];
  return (
    <View style={sc.tile}>
      <View style={[sc.iconWrap, { backgroundColor: t.bg }]}>
        <Ionicons name={icon} size={18} color={t.fg} />
      </View>
      <Text style={sc.value} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{value}</Text>
      <Text style={sc.label}>{label}</Text>
    </View>
  );
}

const sc = StyleSheet.create({
  tile: { ...card, flexGrow: 1, flexBasis: '45%', padding: space.lg, gap: 2 },
  iconWrap: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: space.sm },
  value: { fontSize: fontSize.xl, fontWeight: '800', color: colors.ink, letterSpacing: -0.3 },
  label: { fontSize: fontSize.xs, fontWeight: '700', color: colors.muted },
});

// ─── Ledger tab ───────────────────────────────────────────────────────────────

function LedgerTab() {
  const [records, setRecords] = useState<PlantRecord[]>([]);
  const [summary, setSummary] = useState<PlantSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(today());
  const [showCalendar, setShowCalendar] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [bottleTypes, setBottleTypes] = useState<PricedType[]>([]);
  const [customerTypes, setCustomerTypes] = useState<PricedType[]>([]);
  // Typing a date fires a load per keystroke; a late answer for an old date must
  // not overwrite the current one.
  const requestId = useRef(0);
  // The day the figures on screen belong to, so a failed load for a different
  // day does not leave the old day's records standing under the new date.
  const loadedDay = useRef('');

  // Form state
  const [house, setHouse] = useState('');
  const [bottles, setBottles] = useState('');
  const [paidAmount, setPaidAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ house?: string; bottles?: string }>({});

  // The date is typed by hand. A half-typed date makes the server reject the
  // request, so nothing is fetched until it is a whole, real date.
  const day = selectedDate.trim();
  const dayOk = !!parseIsoDate(day);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    if (!dayOk) {
      setError(null);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    setError(null);
    try {
      // The bottle and customer types are only a convenience; they must not
      // take the whole ledger down with them.
      const [recs, sum, bt, ct] = await Promise.all([
        adminService.getPlantRecords({ date: day }),
        adminService.getPlantSummary({ date: day }),
        adminService.getBottleTypes().catch(() => [] as PricedType[]),
        adminService.getCustomerTypes().catch(() => [] as PricedType[]),
      ]);
      if (id !== requestId.current) return;
      loadedDay.current = day;
      setRecords(recs);
      setSummary(sum);
      setBottleTypes(bt.filter(b => b.is_active));
      setCustomerTypes(ct.filter(c => c.is_active));
    } catch (e: any) {
      if (id !== requestId.current) return;
      if (loadedDay.current !== day) { setRecords([]); setSummary(null); }
      setError(e?.message || 'Could not load ledger data.');
    } finally {
      if (id === requestId.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [day, dayOk]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!dayOk) {
      Alert.alert('Check the date', 'Type the date as YYYY-MM-DD in the box at the top first.');
      return;
    }
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
        date: day,
        house: house.trim(),
        bottles: parseInt(bottles, 10),
        paid_amount: paidAmount ? parseFloat(paidAmount) : 0,
        notes: notes.trim(),
      });
      setHouse(''); setBottles(''); setPaidAmount(''); setNotes('');
      setShowForm(false);
      load();
    } catch (e: any) {
      Alert.alert('Error', `Could not add the record: ${friendlyError(e?.message)}`);
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
          catch (e: any) { Alert.alert('Error', `Failed to delete: ${friendlyError(e?.message)}`); }
        },
      },
    ]);
  };

  const failedWithNothing = dayOk && !!error && !summary && records.length === 0;

  return (
    <KeyboardAwareScrollView
      style={{ flex: 1 }}
      contentContainerStyle={lt.content}
      extraBottomSpace={24}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} colors={[colors.primary]} tintColor={colors.primary} />}
    >
      {/* Date picker row */}
      <TouchableOpacity
        style={lt.dateRow}
        onPress={() => setShowCalendar(true)}
        activeOpacity={0.7}
        accessibilityLabel="Open calendar to pick date"
      >
        <Ionicons name="calendar" size={20} color={colors.primary} />
        <Text style={lt.dateInput}>{selectedDate}</Text>
        <View style={lt.calendarPill}>
          <Text style={lt.calendarPillText}>Change</Text>
        </View>
      </TouchableOpacity>

      <CalendarModal
        visible={showCalendar}
        onClose={() => setShowCalendar(false)}
        selectedDate={selectedDate}
        onSelectDate={(d) => setSelectedDate(d)}
        title="Plant Deliveries Date"
      />

      {!!error && !failedWithNothing && <ErrorBanner message={error} onRetry={() => { setLoading(true); load(); }} />}

      {/* Summary */}
      {dayOk && summary && (
        <View style={lt.summaryGrid}>
          <SummaryCard label="Records" value={String(summary.records)} tone="primary" icon="document-text" />
          <SummaryCard label="Bottles" value={String(summary.bottles)} tone="info" icon="water" />
          <SummaryCard label="Revenue (PKR)" value={fmtNum(summary.amount)} tone="success" icon="cash" />
          <SummaryCard label="Pending (PKR)" value={fmtNum(summary.pending)} tone="danger" icon="time" />
        </View>
      )}

      {/* Add record button */}
      <TouchableOpacity style={lt.addBtn} onPress={() => setShowForm(v => !v)}>
        <Ionicons name={showForm ? 'close' : 'add'} size={20} color={colors.white} />
        <Text style={lt.addBtnText}>{showForm ? 'Cancel' : 'Add Record'}</Text>
      </TouchableOpacity>

      {/* Add form */}
      {showForm && (
        <View style={lt.form}>
          <Text style={lt.formTitle}>New Delivery Record</Text>
          <TextInput
            style={[lt.input, !!fieldErrors.house && lt.inputInvalid]}
            placeholder="House / Address *"
            placeholderTextColor={colors.muted}
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
            placeholderTextColor={colors.muted}
            value={bottles}
            onChangeText={(v) => {
              setBottles(v);
              if (fieldErrors.bottles) setFieldErrors((e) => ({ ...e, bottles: undefined }));
            }}
            keyboardType="number-pad"
          />
          <FieldError message={fieldErrors.bottles} />
          <TextInput style={lt.input} placeholder="Amount Received (PKR)" placeholderTextColor={colors.muted} value={paidAmount} onChangeText={setPaidAmount} keyboardType="decimal-pad" />
          <TextInput style={lt.input} placeholder="Notes (optional)" placeholderTextColor={colors.muted} value={notes} onChangeText={setNotes} />
          <TouchableOpacity
            style={[lt.submitBtn, submitting && { opacity: 0.5 }]}
            onPress={handleAdd}
            disabled={submitting}
          >
            {submitting
              ? <ActivityIndicator size="small" color={colors.white} />
              : <Text style={lt.submitText}>Save Record</Text>
            }
          </TouchableOpacity>
        </View>
      )}

      {/* Records list */}
      {!dayOk ? (
        <EmptyState
          icon="calendar-outline"
          title="Enter a date"
          text="Type the day as YYYY-MM-DD, for example 2026-03-28, to see its deliveries."
        />
      ) : loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 32 }} />
      ) : failedWithNothing ? (
        <ErrorState title="Could not load the ledger" message={error} onRetry={() => { setLoading(true); load(); }} />
      ) : records.length === 0 ? (
        <EmptyState
          icon="water-outline"
          title={`No records for ${day}`}
          text="Deliveries recorded for this date will appear here. Tap Add Record to log one."
        />
      ) : (
        <View style={lt.listWrap}>
          {records.map((r) => (
            <View key={r.id} style={lt.recordCard}>
              <View style={lt.recordInfo}>
                <Text style={lt.house} numberOfLines={2}>{r.house}</Text>
                <Text style={lt.meta}>
                  {r.bottles} bottles
                  {r.bottle_type_name ? ` · ${r.bottle_type_name}` : ''}
                </Text>
                <StatusPill
                  label={capitalise(r.payment_status || '')}
                  tone={r.paid ? 'success' : r.payment_status === 'partial' ? 'warning' : 'danger'}
                  style={lt.statusPill}
                />
              </View>
              <View style={lt.amountBox}>
                <Text style={lt.amount}>{fmtNum(r.amount)}</Text>
                <Text style={lt.amountUnit}>PKR</Text>
              </View>
              <TouchableOpacity onPress={() => handleDelete(r.id)} style={lt.deleteBtn} accessibilityLabel={`Delete record for ${r.house}`}>
                <Ionicons name="trash-outline" size={20} color={colors.danger} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}
    </KeyboardAwareScrollView>
  );
}

const lt = StyleSheet.create({
  content: { paddingHorizontal: pagePadding, paddingTop: space.md },
  dateRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, height: 50, paddingHorizontal: 14, marginBottom: space.md,
    backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line,
  },
  dateInput: { flex: 1, fontSize: fontSize.md, fontWeight: '700', color: colors.ink },
  calendarPill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryTint,
  },
  calendarPillText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.primaryDark,
  },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, marginBottom: space.md },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: space.md,
    height: 50, backgroundColor: colors.primary, borderRadius: radius.md,
  },
  addBtnText: { color: colors.white, fontWeight: '800', fontSize: fontSize.md },
  form: { ...card, marginBottom: space.md, padding: space.lg, gap: 10 },
  formTitle: { fontSize: fontSize.md, fontWeight: '800', color: colors.ink, marginBottom: 2 },
  inputInvalid: { borderColor: colors.danger, backgroundColor: colors.dangerBg },
  input: {
    height: 48, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md,
    paddingHorizontal: 14, fontSize: fontSize.sm, color: colors.ink, backgroundColor: colors.surfaceTint,
  },
  submitBtn: { height: 50, backgroundColor: colors.primary, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  submitText: { color: colors.white, fontWeight: '800', fontSize: fontSize.md },
  listWrap: { gap: space.md },
  recordCard: { ...card, padding: space.lg, flexDirection: 'row', alignItems: 'center', gap: space.md },
  recordInfo: { flex: 1, gap: 3 },
  house: { fontSize: fontSize.md, fontWeight: '700', color: colors.ink },
  meta: { fontSize: fontSize.sm, color: colors.muted },
  statusPill: { marginTop: 4 },
  amountBox: { alignItems: 'flex-end' },
  amount: { fontSize: fontSize.lg, fontWeight: '800', color: colors.ink, letterSpacing: -0.3 },
  amountUnit: { fontSize: fontSize.xs, fontWeight: '700', color: colors.muted },
  deleteBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.dangerBg },
});

// ─── Analytics tab ────────────────────────────────────────────────────────────

function AnalyticsTab() {
  const [data, setData] = useState<PlantAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await adminService.getPlantAnalytics();
      setData(res);
    } catch (e: any) {
      setError(e?.message || 'Could not load analytics.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const retry = () => { setLoading(true); load(); };

  if (loading) return <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 64 }} />;
  if (!data) {
    return error ? <ErrorState title="Could not load analytics" message={error} onRetry={retry} /> : null;
  }

  const maxBottles = Math.max(...data.daily.map(d => d.bottles || 0), 1);

  return (
    <ScrollView
      contentContainerStyle={at.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} colors={[colors.primary]} tintColor={colors.primary} />}
    >
      {!!error && <ErrorBanner message={error} onRetry={retry} />}

      <Text style={at.sectionTitle}>Last 30 Days</Text>

      {/* Totals */}
      <View style={at.totalGrid}>
        <SummaryCard label="Records" value={String(data.totals.records)} tone="primary" icon="document-text" />
        <SummaryCard label="Bottles" value={String(data.totals.bottles)} tone="info" icon="water" />
        <SummaryCard label="Revenue (PKR)" value={fmtNum(data.totals.amount)} tone="success" icon="cash" />
        <SummaryCard label="Pending (PKR)" value={fmtNum(data.totals.pending)} tone="danger" icon="time" />
      </View>

      {data.daily.length === 0 && data.top_houses.length === 0 && (
        <EmptyState
          icon="bar-chart-outline"
          title="No deliveries yet"
          text="Daily deliveries and your top houses will show here once records are added."
        />
      )}

      {/* Daily bar chart */}
      {data.daily.length > 0 && (
        <View style={at.chartCard}>
          <Text style={at.cardTitle}>Daily Deliveries</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={at.chartWrap}>
              {data.daily.map((d) => {
                const heightPct = (d.bottles / maxBottles) * 90;
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
            <View key={h.house} style={at.houseCard}>
              <View style={at.rankBadge}>
                <Text style={at.houseRank}>#{i + 1}</Text>
              </View>
              <View style={at.houseInfo}>
                <Text style={at.houseName} numberOfLines={1}>{h.house}</Text>
                <Text style={at.houseBottles}>{h.bottles} bottles</Text>
              </View>
              <Text style={at.houseAmt}>{fmt(h.amount)}</Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const at = StyleSheet.create({
  content: { paddingHorizontal: pagePadding, paddingTop: space.md, paddingBottom: space.xxl },
  sectionTitle: { fontSize: fontSize.md, fontWeight: '800', color: colors.ink, marginBottom: space.md },
  totalGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  chartCard: { ...card, marginTop: space.lg, padding: space.lg },
  cardTitle: { fontSize: fontSize.md, fontWeight: '800', color: colors.ink, marginBottom: space.md },
  chartWrap: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, paddingBottom: 4 },
  barCol: { alignItems: 'center', width: 38 },
  barVal: { fontSize: fontSize.xs, fontWeight: '700', color: colors.textSecondary, marginBottom: 2 },
  bar: { width: 24, backgroundColor: colors.primary, borderRadius: 8 },
  barDate: { fontSize: fontSize.xs, color: colors.muted, marginTop: 4 },
  topSection: { marginTop: space.xl },
  houseCard: { ...card, flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, marginBottom: space.md },
  rankBadge: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center' },
  houseRank: { fontSize: fontSize.sm, fontWeight: '800', color: colors.primaryDark },
  houseInfo: { flex: 1, gap: 2 },
  houseName: { fontSize: fontSize.md, fontWeight: '700', color: colors.ink },
  houseBottles: { fontSize: fontSize.sm, color: colors.muted },
  houseAmt: { fontSize: fontSize.md, fontWeight: '800', color: colors.ink },
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
              size={16}
              color={activeTab === t ? colors.white : colors.muted}
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
  container: { flex: 1, backgroundColor: colors.bg },
  tabBar: { flexDirection: 'row', gap: space.sm, paddingHorizontal: pagePadding, paddingTop: space.xs },
  tab: {
    flex: 1, height: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line,
  },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.ink },
  tabTextActive: { color: colors.white },
});
