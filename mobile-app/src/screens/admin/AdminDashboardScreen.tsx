import { colors, radius, shadow } from '../../theme';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  RefreshControl, TextInput,
} from 'react-native';
import { LoadingScreen } from '../../components/LoadingScreen';
import { ErrorState, friendlyError } from '../../components/ui';
import { KeyboardAwareScrollView } from '../../components/KeyboardAwareScrollView';
import { useRefetchOnFocus } from '../../hooks/useRefetchOnFocus';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { adminService, AdminSummary } from '../../services/adminService';
import { RootStackParamList } from '../../types/navigation';
import { RangeKey, RANGES, describeRange, parseIsoDate, rangeToDates, isoDate } from '../../utils/dateRange';
import { CalendarModal } from '../../components/CalendarModal';

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
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  // Online payments waiting for the office. Null until known, and stays null for
  // staff who may not see the ledger, so the tile simply does not appear.
  const [claims, setClaims] = useState<{ count: number; total: string | number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // The reason the last load failed. Without it a failed load looked exactly
  // like a quiet day: every figure on screen read zero.
  const [error, setError] = useState<string | null>(null);

  const [range, setRange] = useState<RangeKey>('today');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [calendarTarget, setCalendarTarget] = useState<'from' | 'to' | null>(null);

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
    setError(null);
    try {
      const data = await adminService.getSummary({
        date_from: from || undefined,
        date_to: to || undefined,
      });
      setSummary(data);
    } catch (e: any) {
      console.error('Dashboard load error:', e);
      setError(e?.message || 'Could not load the dashboard.');
    }
    try {
      const waiting = await adminService.getPaymentClaims({ status: 'waiting', limit: 1 });
      setClaims({ count: waiting.count, total: waiting.total_amount });
    } catch {
      setClaims(null);
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

  const retry = () => { setRefreshing(true); load(); };
  // A failed first load has nothing real to show, so the figures give way to the error.
  const showStats = !(error && !summary);
  const todayLabel = new Date().toLocaleDateString('en-PK', { weekday: 'short', day: 'numeric', month: 'short' });
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
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} tintColor={colors.primary} />}
    >
      {/* Header */}
      <View style={styles.header}>
        {/* The greeting and name now live in the admin header above. */}
        <View style={styles.headerText}>
          <Text style={styles.name} numberOfLines={1}>Overview</Text>
          <Text style={styles.greeting}>How the business is doing</Text>
        </View>
        <View style={styles.headerBadge}>
          <Ionicons name="calendar-outline" size={16} color={colors.primary} />
          <Text style={styles.headerBadgeText}>{todayLabel}</Text>
        </View>
      </View>

      {error && (
        summary ? (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={20} color={colors.danger} />
            <Text style={styles.errorBannerText}>{friendlyError(error)}</Text>
            <TouchableOpacity onPress={retry} accessibilityLabel="Try again">
              <Text style={styles.errorBannerRetry}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ErrorState title="Could not load the dashboard" message={error} onRetry={retry} />
        )
      )}

      {/* The one thing that needs a person today. Loud when there is work,
          calm when there is none. */}
      {claims && (
        <TouchableOpacity
          style={[styles.needsCard, claims.count === 0 && styles.needsCardCalm]}
          onPress={() => navigation.navigate('AdminPaymentClaims')}
          activeOpacity={0.85}
          accessibilityLabel={claims.count > 0 ? `${claims.count} online payments waiting. Review` : 'Online payments. All checked'}
        >
          <View style={styles.needsText}>
            <Text style={[styles.needsLabel, claims.count === 0 && { color: colors.mintText }]}>
              {claims.count > 0 ? 'ONLINE PAYMENTS WAITING' : 'ONLINE PAYMENTS'}
            </Text>
            {claims.count > 0 ? (
              <Text style={styles.needsValue}>
                {claims.count}
                <Text style={styles.needsAmount}>{'  '}PKR {Number(claims.total).toLocaleString('en-PK', { maximumFractionDigits: 0 })}</Text>
              </Text>
            ) : (
              <Text style={styles.needsValue}>All checked</Text>
            )}
          </View>
          <View style={[styles.needsButton, claims.count === 0 && styles.needsButtonCalm]}>
            <Text style={[styles.needsButtonText, claims.count === 0 && { color: colors.mintText }]}>
              {claims.count > 0 ? 'Review' : 'History'}
            </Text>
            <Ionicons name="arrow-forward" size={16} color={claims.count > 0 ? colors.sun : colors.mintText} />
          </View>
        </TouchableOpacity>
      )}

      {/* Period filter — chips match the activity log so the two read as one UI */}
      <View style={styles.rangeRow}>
        {RANGES.map(r => {
          const active = range === r.key;
          return (
            <TouchableOpacity
              key={r.key}
              style={[styles.rangeChip, active && styles.rangeChipActive]}
              onPress={() => {
                setRange(r.key);
                if (r.key === 'custom' && !customFrom) {
                  setCalendarTarget('from');
                }
              }}
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
            <TouchableOpacity
              style={[styles.customDateField, !!customError && styles.customInputInvalid]}
              onPress={() => setCalendarTarget('from')}
              activeOpacity={0.7}
              accessibilityLabel="Select start date"
            >
              <Ionicons name="calendar" size={17} color={colors.primary} />
              <Text
                style={[styles.customDateText, !customFrom && styles.customDatePlaceholder]}
                numberOfLines={1}
              >
                {customFrom || 'Start Date'}
              </Text>
              {customFrom ? (
                <TouchableOpacity
                  onPress={(e) => {
                    e.stopPropagation();
                    setCustomFrom('');
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityLabel="Clear start date"
                >
                  <Ionicons name="close-circle" size={16} color={colors.muted} />
                </TouchableOpacity>
              ) : null}
            </TouchableOpacity>

            <Text style={styles.customArrow}>→</Text>

            <TouchableOpacity
              style={[styles.customDateField, !!customError && styles.customInputInvalid]}
              onPress={() => setCalendarTarget('to')}
              activeOpacity={0.7}
              accessibilityLabel="Select end date"
            >
              <Ionicons name="calendar" size={17} color={colors.primary} />
              <Text
                style={[styles.customDateText, !customTo && styles.customDatePlaceholder]}
                numberOfLines={1}
              >
                {customTo || 'End Date'}
              </Text>
              {customTo ? (
                <TouchableOpacity
                  onPress={(e) => {
                    e.stopPropagation();
                    setCustomTo('');
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityLabel="Clear end date"
                >
                  <Ionicons name="close-circle" size={16} color={colors.muted} />
                </TouchableOpacity>
              ) : null}
            </TouchableOpacity>
          </View>
          {customError ? (
            <Text style={styles.customError}>{customError}</Text>
          ) : awaitingDates ? (
            <Text style={styles.customHint}>Tap each box above to open the calendar and choose dates.</Text>
          ) : null}
        </View>
      )}

      {showStats && (<>
      {/* Period summary — every figure below is scoped to the chips above */}
      <View style={styles.todayCard}>
        <View style={styles.todayCircle} />
        <Text style={styles.todayTitle}>{periodCaption}</Text>
        <View style={styles.todayRow}>
          <TouchableOpacity
            style={styles.todayStat}
            activeOpacity={0.8}
            onPress={() => (navigation as any).navigate('AdminTabs', {
              screen: 'AdminOrders',
              params: { initialStatus: 'All', initialDateFrom: from || undefined, initialDateTo: to || undefined }
            })}
          >
            <Text style={styles.todayValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{summary?.total ?? 0}</Text>
            <Text style={styles.todayLabel}>Orders</Text>
          </TouchableOpacity>
          <View style={styles.todayDivider} />
          <View style={styles.todayStat}>
            <Text style={styles.todayValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
              PKR {(summary?.revenue ?? 0).toLocaleString()}
            </Text>
            <Text style={styles.todayLabel}>Revenue</Text>
          </View>
        </View>
      </View>

      {/* Today never moves with the filter, so it only earns a line of its own
          once the selected period is something wider. */}
      {range !== 'today' && (
        <TouchableOpacity
          style={styles.todayStrip}
          activeOpacity={0.8}
          onPress={() => {
            const today = isoDate(new Date());
            (navigation as any).navigate('AdminTabs', {
              screen: 'AdminOrders',
              params: { initialStatus: 'All', initialDateFrom: today, initialDateTo: today }
            });
          }}
        >
          <Ionicons name="today-outline" size={15} color={colors.primary} />
          <Text style={styles.todayStripText}>
            Today: {summary?.today_orders ?? 0} orders · PKR{' '}
            {(summary?.today_revenue ?? 0).toLocaleString()}
          </Text>
        </TouchableOpacity>
      )}

      {/* Order stats grid */}
      <Text style={styles.sectionTitle}>Order Status</Text>
      <Text style={styles.sectionCaption}>Orders placed within {periodCaption}</Text>
      <View style={styles.statsGrid}>
        <StatCard
          label="Total" value={summary?.total ?? 0} icon="list" color={colors.primary} bg={colors.surface}
          onPress={() => (navigation as any).navigate('AdminTabs', {
            screen: 'AdminOrders',
            params: { initialStatus: 'All', initialDateFrom: from || undefined, initialDateTo: to || undefined }
          })}
        />
        <StatCard
          label="Pending" value={summary?.pending ?? 0} icon="time" color={colors.warning} bg={colors.surface}
          onPress={() => (navigation as any).navigate('AdminTabs', {
            screen: 'AdminOrders',
            params: { initialStatus: 'Pending', initialDateFrom: from || undefined, initialDateTo: to || undefined }
          })}
        />
        <StatCard
          label="Processing" value={summary?.processing ?? 0} icon="refresh" color={colors.primaryDark} bg={colors.surface}
          onPress={() => (navigation as any).navigate('AdminTabs', {
            screen: 'AdminOrders',
            params: { initialStatus: 'Processing', initialDateFrom: from || undefined, initialDateTo: to || undefined }
          })}
        />
        <StatCard
          label="Shipped" value={summary?.shipped ?? 0} icon="car" color={colors.info} bg={colors.surface}
          onPress={() => (navigation as any).navigate('AdminTabs', {
            screen: 'AdminOrders',
            params: { initialStatus: 'Shipped', initialDateFrom: from || undefined, initialDateTo: to || undefined }
          })}
        />
        <StatCard
          label="Delivered" value={summary?.delivered ?? 0} icon="checkmark-circle" color={colors.success} bg={colors.surface}
          onPress={() => (navigation as any).navigate('AdminTabs', {
            screen: 'AdminOrders',
            params: { initialStatus: 'Delivered', initialDateFrom: from || undefined, initialDateTo: to || undefined }
          })}
        />
        <StatCard
          label="Cancelled" value={summary?.cancelled ?? 0} icon="close-circle" color={colors.danger} bg={colors.surface}
          onPress={() => (navigation as any).navigate('AdminTabs', {
            screen: 'AdminOrders',
            params: { initialStatus: 'Cancelled', initialDateFrom: from || undefined, initialDateTo: to || undefined }
          })}
        />
      </View>

      {/* Payment stats */}
      <Text style={styles.sectionTitle}>Payments</Text>
      <Text style={styles.sectionCaption}>Orders placed within {periodCaption}</Text>
      <View style={styles.statsGrid}>
        <StatCard
          label="Paid" value={summary?.paid_count ?? 0} icon="card" color={colors.success} bg={colors.surface}
          onPress={() => (navigation as any).navigate('AdminTabs', {
            screen: 'AdminOrders',
            params: { initialStatus: 'All', initialPaid: true, initialDateFrom: from || undefined, initialDateTo: to || undefined }
          })}
        />
        <StatCard
          label="Unpaid" value={summary?.unpaid_count ?? 0} icon="alert-circle" color={colors.danger} bg={colors.surface}
          onPress={() => (navigation as any).navigate('AdminTabs', {
            screen: 'AdminOrders',
            params: { initialStatus: 'All', initialPaid: false, initialDateFrom: from || undefined, initialDateTo: to || undefined }
          })}
        />
      </View>

      </>)}

      {/* Quick actions */}
      <Text style={styles.sectionTitle}>Quick Actions</Text>
      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => navigation.navigate('AdminCreateOrder')}
        >
          <Ionicons name="add-circle" size={28} color={colors.primary} />
          <Text style={styles.actionLabel}>New Order</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => (navigation as any).navigate('AdminTabs', { screen: 'AdminOrders' })}
        >
          <Ionicons name="list" size={28} color={colors.primaryDark} />
          <Text style={styles.actionLabel}>All Orders</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => (navigation as any).navigate('AdminTabs', { screen: 'AdminCustomers' })}
        >
          <Ionicons name="people" size={28} color={colors.warning} />
          <Text style={styles.actionLabel}>Customers</Text>
        </TouchableOpacity>
      </View>

      <View style={{ height: 32 }} />

      <CalendarModal
        visible={calendarTarget !== null}
        onClose={() => setCalendarTarget(null)}
        title={calendarTarget === 'from' ? 'Select Start Date' : 'Select End Date'}
        selectedDate={calendarTarget === 'from' ? customFrom : customTo}
        minDate={calendarTarget === 'to' && customFrom ? customFrom : undefined}
        onSelectDate={(date) => {
          if (calendarTarget === 'from') {
            setCustomFrom(date);
            if (!customTo || customTo < date) {
              setCustomTo(date);
            }
          } else if (calendarTarget === 'to') {
            setCustomTo(date);
          }
        }}
      />
    </KeyboardAwareScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.bg,
    padding: 20,
    paddingTop: 18,
    marginBottom: 4,
  },
  headerText: { flex: 1, minWidth: 0 },
  greeting: { fontSize: 14, color: colors.muted },
  name: { fontSize: 20, fontWeight: 'bold', color: colors.ink },
  headerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
  },
  headerBadgeText: { fontSize: 13, fontWeight: '700', color: colors.ink },
  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16, marginBottom: 12, padding: 14,
    backgroundColor: colors.dangerBg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.dangerLine,
  },
  errorBannerText: { flex: 1, fontSize: 14, color: colors.ink, lineHeight: 19 },
  errorBannerRetry: { fontSize: 14, fontWeight: '800', color: colors.primary, paddingHorizontal: 4 },
  needsCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginHorizontal: 16, marginBottom: 12, padding: 18,
    backgroundColor: colors.sun, borderRadius: radius.xl, ...shadow.card,
  },
  needsCardCalm: { backgroundColor: colors.mint },
  needsText: { flex: 1 },
  needsLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 0.8, color: colors.ink },
  needsValue: { fontSize: 32, fontWeight: '800', color: colors.ink, marginTop: 2, letterSpacing: -0.5 },
  needsAmount: { fontSize: 16, fontWeight: '700' },
  needsButton: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.ink, paddingHorizontal: 16, height: 42, borderRadius: radius.md,
  },
  needsButtonCalm: { backgroundColor: colors.surface },
  needsButtonText: { color: colors.sun, fontSize: 14, fontWeight: '800' },
  // Kept byte-identical to AdminActivityScreen's chips so both screens match.
  rangeRow: {
    flexDirection: 'row', gap: 8,
    paddingHorizontal: 16, paddingTop: 6, paddingBottom: 2,
    backgroundColor: colors.bg,
  },
  rangeChip: {
    flex: 1, minHeight: 40, paddingVertical: 9, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  rangeChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  rangeChipText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  rangeChipTextActive: { color: colors.white },
  customBlock: {
    backgroundColor: colors.bg,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 4,
  },
  customRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  customDateField: {
    flex: 1,
    height: 46,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    ...shadow.card,
  },
  customDateText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: colors.ink,
  },
  customDatePlaceholder: {
    fontWeight: '500',
    color: colors.muted,
  },
  customInputInvalid: { borderColor: colors.danger, backgroundColor: colors.dangerBg },
  customArrow: { fontSize: 16, fontWeight: '800', color: colors.primary },
  customError: { fontSize: 12, color: colors.danger, marginTop: 6 },
  customHint: { fontSize: 12, color: colors.muted, marginTop: 6 },
  todayStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 16,
    marginTop: -10,
    marginBottom: 18,
  },
  todayStripText: { flex: 1, fontSize: 13, color: colors.textSecondary },
  todayCard: {
    backgroundColor: colors.primary,
    marginHorizontal: 16,
    borderRadius: radius.xl,
    padding: 22,
    marginTop: 14,
    marginBottom: 20,
    overflow: 'hidden',
    ...shadow.card,
  },
  todayCircle: {
    position: 'absolute', right: -46, top: -56, width: 190, height: 190, borderRadius: 95,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  todayTitle: { fontSize: 14, fontWeight: '600', color: colors.white, marginBottom: 12 },
  todayRow: { flexDirection: 'row', alignItems: 'center' },
  todayStat: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  todayValue: { fontSize: 28, fontWeight: '800', color: colors.white, letterSpacing: -0.5 },
  todayLabel: { fontSize: 14, color: colors.white, marginTop: 2 },
  todayDivider: { width: 1, height: 40, backgroundColor: 'rgba(255,255,255,0.3)' },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.ink,
    marginHorizontal: 16,
    marginBottom: 10,
  },
  sectionCaption: {
    fontSize: 12,
    color: colors.muted,
    marginHorizontal: 16,
    marginTop: -6,
    marginBottom: 10,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    gap: 10,
    marginBottom: 20,
  },
  statCard: {
    width: '30%',
    flexGrow: 1,
    padding: 14,
    borderRadius: radius.lg + 4,
    alignItems: 'center',
    ...shadow.card,
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  statValue: { fontSize: 20, fontWeight: 'bold', color: colors.ink },
  statLabel: { fontSize: 12, color: colors.muted, marginTop: 2, textAlign: 'center' },
  actionsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 12,
    marginBottom: 8,
  },
  actionBtn: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg + 4,
    padding: 16,
    alignItems: 'center',
    gap: 8,
    ...shadow.card,
  },
  actionLabel: { fontSize: 13, fontWeight: '700', color: colors.ink, textAlign: 'center' },
});
