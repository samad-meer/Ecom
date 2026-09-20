import React, { useState, useEffect, useCallback, useContext, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  RefreshControl, TextInput,
} from 'react-native';
import { LoadingScreen } from '../../components/LoadingScreen';
import { KeyboardAwareScrollView } from '../../components/KeyboardAwareScrollView';
import { useRefetchOnFocus } from '../../hooks/useRefetchOnFocus';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { AuthContext } from '../../context/AuthContext';
import { adminService, AdminSummary } from '../../services/adminService';
import { RootStackParamList } from '../../types/navigation';
import { RangeKey, RANGES, describeRange, parseIsoDate, rangeToDates } from '../../utils/dateRange';

type Nav = NativeStackNavigationProp<RootStackParamList>;

interface StatCardProps {
  label: string;
  value: string | number;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  bg: string;
  onPress?: () => void;
}

function StatCard({ label, value, icon, color, bg, onPress }: StatCardProps) {
  return (
    <TouchableOpacity
      style={[styles.statCard, { backgroundColor: bg }]}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={onPress ? 0.7 : 1}
    >
      <View style={[styles.statIcon, { backgroundColor: color + '22' }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {onPress && <Ionicons name="chevron-forward" size={12} color={color} style={{ marginTop: 2 }} />}
    </TouchableOpacity>
  );
}

export const AdminDashboardScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const { user } = useContext(AuthContext);
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [range, setRange] = useState<RangeKey>('today');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  // No date-picker library ships with the app, so custom dates are typed. Say
  // nothing until both boxes have text — complaining mid-keystroke is noise.
  const customError = useMemo(() => {
    if (range !== 'custom') return '';
    if (!customFrom.trim() || !customTo.trim()) return '';
    const from = parseIsoDate(customFrom);
    const to = parseIsoDate(customTo);
    if (!from) return 'Start date must look like YYYY-MM-DD.';
    if (!to) return 'End date must look like YYYY-MM-DD.';
    if (from > to) return 'Start date is after the end date.';
    return '';
  }, [range, customFrom, customTo]);

  const customReady =
    !!customFrom.trim() && !!customTo.trim() && !customError;

  /** Blank while a custom range is half-typed, which is what suspends fetching. */
  const { from, to } = useMemo(() => {
    if (range !== 'custom') return rangeToDates(range);
    return customReady
      ? { from: customFrom.trim(), to: customTo.trim() }
      : { from: '', to: '' };
  }, [range, customReady, customFrom, customTo]);

  const awaitingDates = range === 'custom' && !customReady;

  const load = useCallback(async () => {
    // Firing without both custom dates would silently return all-time figures
    // under a "Custom" heading, so hold the previous numbers instead.
    if (awaitingDates) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      const data = await adminService.getSummary({
        date_from: from || undefined,
        date_to: to || undefined,
      });
      setSummary(data);
    } catch (e) {
      console.error('Dashboard load error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [awaitingDates, from, to]);

  useEffect(() => { load(); }, [load]);

  // The tiles count orders, so they go stale the moment the admin taps into
  // the order list and changes something. load() never raises the spinner
  // itself — it only clears it — so re-running it on focus is silent.
  useRefetchOnFocus(() => load());

  const onRefresh = () => { setRefreshing(true); load(); };

  if (loading) {
    return <LoadingScreen message="Loading dashboard…" />;
  }

  const name = user?.first_name || user?.username || 'Admin';
  const rangeLabel = RANGES.find(r => r.key === range)?.label ?? 'Period';
  const periodDates = awaitingDates ? '' : describeRange(range, { from, to });
  // While a custom range is incomplete the figures on screen still belong to the
  // previous period, so the caption has to admit that rather than claim them.
  const periodCaption = awaitingDates
    ? `${rangeLabel} · pick both dates`
    : `${rangeLabel}${periodDates ? ` · ${periodDates}` : ''}`;

  return (
    <KeyboardAwareScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Welcome back,</Text>
          <Text style={styles.name}>{name}</Text>
        </View>
        <View style={styles.headerBadge}>
          <Ionicons name="shield-checkmark" size={16} color="#007AFF" />
          <Text style={styles.headerBadgeText}>Admin</Text>
        </View>
      </View>

      {/* Period filter — chips match the activity log so the two read as one UI */}
      <View style={styles.rangeRow}>
        {RANGES.map(r => {
          const active = range === r.key;
          return (
            <TouchableOpacity
              key={r.key}
              style={[styles.rangeChip, active && styles.rangeChipActive]}
              onPress={() => setRange(r.key)}
            >
              <Text style={[styles.rangeChipText, active && styles.rangeChipTextActive]}>
                {r.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {range === 'custom' && (
        <View style={styles.customBlock}>
          <View style={styles.customRow}>
            <TextInput
              style={[styles.customInput, !!customError && styles.customInputInvalid]}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#000"
              value={customFrom}
              onChangeText={setCustomFrom}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={10}
            />
            <Text style={styles.customArrow}>→</Text>
            <TextInput
              style={[styles.customInput, !!customError && styles.customInputInvalid]}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#000"
              value={customTo}
              onChangeText={setCustomTo}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={10}
            />
          </View>
          {customError ? (
            <Text style={styles.customError}>{customError}</Text>
          ) : awaitingDates ? (
            <Text style={styles.customHint}>Enter both dates to load this period.</Text>
          ) : null}
        </View>
      )}

      {/* Period summary — every figure below is scoped to the chips above */}
      <View style={styles.todayCard}>
        <Text style={styles.todayTitle}>{periodCaption}</Text>
        <View style={styles.todayRow}>
          <View style={styles.todayStat}>
            <Text style={styles.todayValue}>{summary?.total ?? 0}</Text>
            <Text style={styles.todayLabel}>Orders</Text>
          </View>
          <View style={styles.todayDivider} />
          <View style={styles.todayStat}>
            <Text style={styles.todayValue}>
              PKR {(summary?.revenue ?? 0).toLocaleString()}
            </Text>
            <Text style={styles.todayLabel}>Revenue</Text>
          </View>
        </View>
      </View>

      {/* Today never moves with the filter, so it only earns a line of its own
          once the selected period is something wider. */}
      {range !== 'today' && (
        <View style={styles.todayStrip}>
          <Ionicons name="today-outline" size={15} color="#007AFF" />
          <Text style={styles.todayStripText}>
            Today: {summary?.today_orders ?? 0} orders · PKR{' '}
            {(summary?.today_revenue ?? 0).toLocaleString()}
          </Text>
        </View>
      )}

      {/* Order stats grid */}
      <Text style={styles.sectionTitle}>Order Status</Text>
      <Text style={styles.sectionCaption}>Orders placed within {periodCaption}</Text>
      <View style={styles.statsGrid}>
        <StatCard
          label="Total" value={summary?.total ?? 0} icon="list" color="#007AFF" bg="#fff"
          onPress={() => (navigation as any).navigate('AdminTabs', { screen: 'AdminOrders', params: { initialStatus: 'All' } })}
        />
        <StatCard
          label="Pending" value={summary?.pending ?? 0} icon="time" color="#FF9500" bg="#fff"
          onPress={() => (navigation as any).navigate('AdminTabs', { screen: 'AdminOrders', params: { initialStatus: 'Pending' } })}
        />
        <StatCard
          label="Processing" value={summary?.processing ?? 0} icon="refresh" color="#5856D6" bg="#fff"
          onPress={() => (navigation as any).navigate('AdminTabs', { screen: 'AdminOrders', params: { initialStatus: 'Processing' } })}
        />
        <StatCard
          label="Shipped" value={summary?.shipped ?? 0} icon="car" color="#32ADE6" bg="#fff"
          onPress={() => (navigation as any).navigate('AdminTabs', { screen: 'AdminOrders', params: { initialStatus: 'Shipped' } })}
        />
        <StatCard
          label="Delivered" value={summary?.delivered ?? 0} icon="checkmark-circle" color="#34C759" bg="#fff"
          onPress={() => (navigation as any).navigate('AdminTabs', { screen: 'AdminOrders', params: { initialStatus: 'Delivered' } })}
        />
        <StatCard
          label="Cancelled" value={summary?.cancelled ?? 0} icon="close-circle" color="#FF3B30" bg="#fff"
          onPress={() => (navigation as any).navigate('AdminTabs', { screen: 'AdminOrders', params: { initialStatus: 'Cancelled' } })}
        />
      </View>

      {/* Payment stats */}
      <Text style={styles.sectionTitle}>Payments</Text>
      <Text style={styles.sectionCaption}>Orders placed within {periodCaption}</Text>
      <View style={styles.statsGrid}>
        <StatCard
          label="Paid" value={summary?.paid_count ?? 0} icon="card" color="#34C759" bg="#fff"
          onPress={() => (navigation as any).navigate('AdminTabs', { screen: 'AdminOrders', params: { initialStatus: 'All', initialPaid: true } })}
        />
        <StatCard
          label="Unpaid" value={summary?.unpaid_count ?? 0} icon="alert-circle" color="#FF3B30" bg="#fff"
          onPress={() => (navigation as any).navigate('AdminTabs', { screen: 'AdminOrders', params: { initialStatus: 'All', initialPaid: false } })}
        />
      </View>

      {/* Quick actions */}
      <Text style={styles.sectionTitle}>Quick Actions</Text>
      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => navigation.navigate('AdminCreateOrder')}
        >
          <Ionicons name="add-circle" size={28} color="#007AFF" />
          <Text style={styles.actionLabel}>New Order</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => (navigation as any).navigate('AdminTabs', { screen: 'AdminOrders' })}
        >
          <Ionicons name="list" size={28} color="#5856D6" />
          <Text style={styles.actionLabel}>All Orders</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => (navigation as any).navigate('AdminTabs', { screen: 'AdminCustomers' })}
        >
          <Ionicons name="people" size={28} color="#FF9500" />
          <Text style={styles.actionLabel}>Customers</Text>
        </TouchableOpacity>
      </View>

      <View style={{ height: 32 }} />
    </KeyboardAwareScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'white',
    padding: 20,
    paddingTop: 16,
    marginBottom: 12,
  },
  greeting: { fontSize: 13, color: '#888' },
  name: { fontSize: 20, fontWeight: 'bold', color: '#1a1a1a' },
  headerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#007AFF15',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  headerBadgeText: { fontSize: 13, fontWeight: '600', color: '#007AFF' },
  // Kept byte-identical to AdminActivityScreen's chips so both screens match.
  rangeRow: {
    flexDirection: 'row', gap: 8,
    paddingHorizontal: 12, paddingTop: 10, paddingBottom: 2,
    backgroundColor: 'white',
  },
  rangeChip: {
    flex: 1, paddingVertical: 7, borderRadius: 10,
    borderWidth: 1, borderColor: '#e4e6ea', backgroundColor: 'white',
    alignItems: 'center',
  },
  rangeChipActive: { backgroundColor: '#007AFF', borderColor: '#007AFF' },
  rangeChipText: { fontSize: 12, fontWeight: '600', color: '#666' },
  rangeChipTextActive: { color: 'white' },
  customBlock: {
    backgroundColor: 'white',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 4,
  },
  customRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  customInput: {
    flex: 1, height: 38, borderRadius: 10,
    borderWidth: 1, borderColor: '#e4e6ea', backgroundColor: '#fafafa',
    paddingHorizontal: 10, fontSize: 13, color: '#000',
  },
  customInputInvalid: { borderColor: '#D93025', backgroundColor: '#FFF7F7' },
  customArrow: { fontSize: 14, color: '#aaa' },
  customError: { fontSize: 12, color: '#D93025', marginTop: 6 },
  customHint: { fontSize: 12, color: '#999', marginTop: 6 },
  todayStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 16,
    marginTop: -10,
    marginBottom: 18,
  },
  todayStripText: { fontSize: 12, color: '#666' },
  todayCard: {
    backgroundColor: '#007AFF',
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 20,
    marginTop: 14,
    marginBottom: 20,
  },
  todayTitle: { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginBottom: 12 },
  todayRow: { flexDirection: 'row', alignItems: 'center' },
  todayStat: { flex: 1, alignItems: 'center' },
  todayValue: { fontSize: 22, fontWeight: 'bold', color: 'white' },
  todayLabel: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  todayDivider: { width: 1, height: 40, backgroundColor: 'rgba(255,255,255,0.3)' },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
    marginHorizontal: 16,
    marginBottom: 10,
  },
  sectionCaption: {
    fontSize: 11,
    color: '#999',
    marginHorizontal: 16,
    marginTop: -6,
    marginBottom: 10,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    gap: 8,
    marginBottom: 20,
  },
  statCard: {
    width: '30%',
    flexGrow: 1,
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  statValue: { fontSize: 20, fontWeight: 'bold', color: '#1a1a1a' },
  statLabel: { fontSize: 11, color: '#888', marginTop: 2, textAlign: 'center' },
  actionsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 12,
    marginBottom: 8,
  },
  actionBtn: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    gap: 8,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
  },
  actionLabel: { fontSize: 12, fontWeight: '600', color: '#333', textAlign: 'center' },
});
