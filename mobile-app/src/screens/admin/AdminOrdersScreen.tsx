import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  TextInput, RefreshControl,
} from 'react-native';
import { LoadingScreen } from '../../components/LoadingScreen';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, fontSize, card, pagePadding } from '../../theme';
import { ErrorState, EmptyState, StatusPill, orderStatusTone, friendlyError } from '../../components/ui';
import { adminService, AdminOrder, DeliveryBoy } from '../../services/adminService';
import { useRefetchOnFocus } from '../../hooks/useRefetchOnFocus';
import { RootStackParamList, AdminTabParamList } from '../../types/navigation';
import { CalendarModal } from '../../components/CalendarModal';
import { isoDate, parseIsoDate } from '../../utils/dateRange';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const STATUS_FILTERS = ['All', 'Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];

function OrderCard({ order, onPress }: { order: AdminOrder; onPress: () => void }) {
  const date = new Date(order.created_at).toLocaleDateString('en-PK', {
    day: 'numeric', month: 'short',
  });
  return (
    <TouchableOpacity
      style={[styles.card, order.is_hidden && styles.cardHidden]}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`Order ${order.id}, ${order.customer_name}, ${order.status}, ${order.is_paid ? 'paid' : 'unpaid'}`}
    >
      <View style={styles.cardTop}>
        <View style={styles.cardInfo}>
          <View style={styles.nameRow}>
            <Text style={styles.customerName} numberOfLines={1}>{order.customer_name}</Text>
            {/* Phone marker: a call-in guest, not a registered account. */}
            {!!order.guest_name && <Ionicons name="call" size={14} color={colors.primary} />}
          </View>
          <Text style={styles.orderMeta}>#{order.id} · {date}</Text>
        </View>
        <Text style={styles.orderTotal}>PKR {Number(order.total_price).toLocaleString()}</Text>
      </View>

      <View style={styles.addressRow}>
        <Ionicons name="location-outline" size={16} color={colors.muted} style={styles.addressIcon} />
        <Text style={styles.orderAddress} numberOfLines={2}>{order.shipping_address || '—'}</Text>
      </View>

      <View style={styles.pillRow}>
        <StatusPill label={order.status} tone={orderStatusTone(order.status)} />
        <StatusPill
          label={order.is_paid ? 'Paid' : 'Unpaid'}
          tone={order.is_paid ? 'success' : 'danger'}
          icon={order.is_paid ? 'checkmark-circle' : 'alert-circle'}
        />
        {order.is_hidden && <StatusPill label="Hidden" tone="neutral" icon="eye-off" />}
      </View>
    </TouchableOpacity>
  );
}

export const AdminOrdersScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProp<AdminTabParamList, 'AdminOrders'>>();

  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [deliveryBoys, setDeliveryBoys] = useState<DeliveryBoy[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(route.params?.initialStatus ?? 'All');
  const [paidFilter, setPaidFilter] = useState<boolean | null>(
    route.params?.initialPaid !== undefined ? (route.params.initialPaid ?? null) : null,
  );
  const [showHidden, setShowHidden] = useState(false);
  const [dateFrom, setDateFrom] = useState<string>(route.params?.initialDateFrom ?? '');
  const [dateTo, setDateTo] = useState<string>(route.params?.initialDateTo ?? '');
  const [calendarVisible, setCalendarVisible] = useState(false);
  // A late answer for an old filter must not overwrite the current list.
  const requestId = useRef(0);

  const todayStr = useMemo(() => isoDate(new Date()), []);

  // Sync when navigated from dashboard with new params
  useEffect(() => {
    if (route.params?.initialStatus !== undefined) {
      setStatusFilter(route.params.initialStatus ?? 'All');
    }
    if (route.params?.initialPaid !== undefined) {
      setPaidFilter(route.params.initialPaid ?? null);
    }
    if (route.params?.initialDateFrom !== undefined || route.params?.initialDateTo !== undefined) {
      setDateFrom(route.params?.initialDateFrom ?? '');
      setDateTo(route.params?.initialDateTo ?? '');
    }
  }, [route.params]);

  const load = useCallback(async (isRefresh = false) => {
    const id = ++requestId.current;
    if (!isRefresh) setLoading(true);
    setError(null);
    try {
      const [orderData, riders] = await Promise.all([
        adminService.getOrders({
          status: statusFilter !== 'All' ? statusFilter : undefined,
          search: search || undefined,
          is_paid: paidFilter !== null ? paidFilter : undefined,
          show_hidden: showHidden,
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
        }),
        adminService.getDeliveryBoys(),
      ]);
      if (id !== requestId.current) return;
      setOrders(orderData);
      setDeliveryBoys(riders);
    } catch (e: any) {
      if (id !== requestId.current) return;
      setError(e?.message || 'Could not load orders.');
      // A refresh keeps the last good list on screen; a new filter must not
      // keep showing the previous filter's orders under the wrong chip.
      if (!isRefresh) setOrders([]);
    } finally {
      if (id === requestId.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [statusFilter, search, paidFilter, showHidden, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  // Coming back from a detail screen that changed something must show the
  // change. Silent refetch — load(true) skips the full-screen spinner, so the
  // list updates in place instead of flashing blank.
  useRefetchOnFocus(() => load(true));

  const onRefresh = () => { setRefreshing(true); load(true); };

  const hasDateFilter = Boolean(dateFrom || dateTo);
  const filtersActive = search.trim().length > 0 || statusFilter !== 'All' || paidFilter !== null || showHidden || hasDateFilter;

  const dateLabel = useMemo(() => {
    if (!hasDateFilter) return 'All Dates';
    if (dateFrom && dateTo) {
      if (dateFrom === dateTo) {
        if (dateFrom === todayStr) return 'Today';
        const d = parseIsoDate(dateFrom);
        return d ? d.toLocaleDateString('en-PK', { day: 'numeric', month: 'short' }) : dateFrom;
      }
      const d1 = parseIsoDate(dateFrom);
      const d2 = parseIsoDate(dateTo);
      const s1 = d1 ? d1.toLocaleDateString('en-PK', { day: 'numeric', month: 'short' }) : dateFrom;
      const s2 = d2 ? d2.toLocaleDateString('en-PK', { day: 'numeric', month: 'short' }) : dateTo;
      return `${s1} – ${s2}`;
    }
    if (dateFrom) {
      const d = parseIsoDate(dateFrom);
      return `From ${d ? d.toLocaleDateString('en-PK', { day: 'numeric', month: 'short' }) : dateFrom}`;
    }
    const d = parseIsoDate(dateTo);
    return `Until ${d ? d.toLocaleDateString('en-PK', { day: 'numeric', month: 'short' }) : dateTo}`;
  }, [hasDateFilter, dateFrom, dateTo, todayStr]);

  return (
    <View style={styles.container}>
      {/* Search */}
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Customer, phone, address…"
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
            onSubmitEditing={() => load()}
            placeholderTextColor={colors.muted}
          />
          {search.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearch('')}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityLabel="Clear search"
            >
              <Ionicons name="close-circle" size={18} color={colors.muted} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          style={[styles.iconBtn, showHidden && styles.iconBtnActive]}
          onPress={() => setShowHidden(v => !v)}
          accessibilityLabel={showHidden ? 'Hide hidden orders' : 'Show hidden orders'}
        >
          <Ionicons name={showHidden ? 'eye' : 'eye-off'} size={20} color={showHidden ? colors.warningText : colors.muted} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.iconBtn, styles.newOrderBtn]}
          onPress={() => navigation.navigate('AdminCreateOrder')}
          accessibilityLabel="Create a new order"
        >
          <Ionicons name="add" size={24} color={colors.white} />
        </TouchableOpacity>
      </View>

      {/* Status filter chips */}
      <FlatList
        data={STATUS_FILTERS}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={s => s}
        style={styles.chipScroll}
        contentContainerStyle={styles.chipList}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.chip, statusFilter === item && styles.chipActive]}
            onPress={() => setStatusFilter(item)}
          >
            <Text style={[styles.chipText, statusFilter === item && styles.chipTextActive]}>
              {item}
            </Text>
          </TouchableOpacity>
        )}
      />

      {/* Paid / Unpaid toggle & Date filter chip */}
      <View style={styles.filterControlsRow}>
        <View style={styles.paidChips}>
          <TouchableOpacity
            style={[styles.chip, paidFilter === true && styles.chipPaidActive]}
            onPress={() => setPaidFilter(v => v === true ? null : true)}
          >
            <Ionicons name="checkmark-circle" size={16} color={paidFilter === true ? colors.white : colors.success} />
            <Text style={[styles.chipText, paidFilter === true && styles.chipTextActive]}>Paid</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.chip, paidFilter === false && styles.chipUnpaidActive]}
            onPress={() => setPaidFilter(v => v === false ? null : false)}
          >
            <Ionicons name="alert-circle" size={16} color={paidFilter === false ? colors.white : colors.danger} />
            <Text style={[styles.chipText, paidFilter === false && styles.chipTextActive]}>Unpaid</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.dateChip, hasDateFilter && styles.dateChipActive]}
          onPress={() => setCalendarVisible(true)}
          accessibilityRole="button"
          accessibilityLabel="Filter by date"
        >
          <Ionicons
            name="calendar"
            size={15}
            color={hasDateFilter ? colors.ink : colors.primary}
          />
          <Text
            style={[styles.dateChipText, hasDateFilter && styles.dateChipTextActive]}
            numberOfLines={1}
          >
            {dateLabel}
          </Text>
          {hasDateFilter && (
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation();
                setDateFrom('');
                setDateTo('');
              }}
              style={styles.dateClearBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Clear date filter"
            >
              <Ionicons name="close-circle" size={16} color={colors.ink} />
            </TouchableOpacity>
          )}
        </TouchableOpacity>
      </View>

      {loading ? (
        <LoadingScreen message="Loading orders…" />
      ) : error && orders.length === 0 ? (
        <ErrorState title="Could not load orders" message={error} onRetry={() => load()} />
      ) : (
        <>
          {/* A failed refresh keeps the list below and says why. */}
          {!!error && (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle" size={20} color={colors.danger} />
              <Text style={styles.errorText}>{friendlyError(error)}</Text>
              <TouchableOpacity style={styles.errorRetry} onPress={() => load()} accessibilityLabel="Try again">
                <Text style={styles.errorRetryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}
          <FlatList
            style={styles.orderList}
            data={orders}
            keyExtractor={o => String(o.id)}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} tintColor={colors.primary} />
            }
            renderItem={({ item }) => (
              <OrderCard
                order={item}
                onPress={() => navigation.navigate('AdminOrderDetail', { order: item, deliveryBoys })}
              />
            )}
            ListEmptyComponent={
              <EmptyState
                icon="clipboard-outline"
                title={filtersActive ? 'No orders match' : 'No orders yet'}
                text={filtersActive
                  ? 'Try a different search or clear a filter.'
                  : 'New orders will appear here. Tap + to add a call-in order.'}
              />
            }
            contentContainerStyle={styles.list}
          />
        </>
      )}

      {/* Responsive Calendar Modal */}
      <CalendarModal
        visible={calendarVisible}
        onClose={() => setCalendarVisible(false)}
        selectedDate={dateFrom || todayStr}
        onSelectDate={(date) => {
          setDateFrom(date);
          setDateTo(date);
          setCalendarVisible(false);
        }}
        title="Filter Orders by Date"
        quickPresets={true}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: pagePadding, paddingTop: 16, paddingBottom: 12,
  },
  searchBox: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10,
    height: 48, paddingHorizontal: 14,
    backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.line,
  },
  searchInput: { flex: 1, fontSize: fontSize.sm, color: colors.ink },
  iconBtn: {
    width: 48, height: 48, borderRadius: radius.md,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line,
    alignItems: 'center', justifyContent: 'center',
  },
  iconBtnActive: { backgroundColor: colors.warningBg, borderColor: colors.warningLine },
  newOrderBtn: { backgroundColor: colors.primary, borderColor: colors.primary },

  // flexShrink 0 is the fix for the squashed chip rows: the order list below is
  // far taller than the screen, so flexbox shrank these rows to make room and
  // clipped the chips (the Paid/Unpaid row lost its top edge).
  chipScroll: { flexGrow: 0, flexShrink: 0 },
  chipList: { paddingHorizontal: pagePadding, gap: 8, alignItems: 'center' },
  filterControlsRow: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: pagePadding,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 8,
  },
  paidChips: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    height: 40, paddingHorizontal: 16, borderRadius: radius.pill,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipPaidActive: { backgroundColor: colors.success, borderColor: colors.success },
  chipUnpaidActive: { backgroundColor: colors.danger, borderColor: colors.danger },
  chipText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.ink },
  chipTextActive: { color: colors.white },

  dateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 40,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    maxWidth: '52%',
  },
  dateChipActive: {
    backgroundColor: colors.sun,
    borderColor: colors.sun,
  },
  dateChipText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.primary,
    flexShrink: 1,
  },
  dateChipTextActive: {
    color: colors.ink,
    fontWeight: '800',
  },
  dateClearBtn: {
    marginLeft: 2,
  },

  orderList: { flex: 1 },
  list: { paddingHorizontal: pagePadding, paddingBottom: 24, flexGrow: 1 },
  card: { ...card, padding: 16, marginBottom: 12 },
  cardHidden: { opacity: 0.6 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  cardInfo: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  customerName: { flexShrink: 1, fontSize: fontSize.md, fontWeight: '700', color: colors.ink },
  orderMeta: { fontSize: fontSize.sm, color: colors.muted, marginTop: 2 },
  orderTotal: { fontSize: fontSize.lg, fontWeight: '800', color: colors.ink, letterSpacing: -0.3 },
  addressRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 10 },
  addressIcon: { marginTop: 2 },
  orderAddress: { flex: 1, fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 20 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },

  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: pagePadding, marginBottom: 12, padding: 12,
    backgroundColor: colors.dangerBg, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.dangerLine,
  },
  errorText: { flex: 1, fontSize: fontSize.sm, color: colors.danger, fontWeight: '600' },
  errorRetry: {
    height: 40, paddingHorizontal: 16, borderRadius: radius.pill,
    backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center',
  },
  errorRetryText: { color: colors.white, fontSize: fontSize.sm, fontWeight: '800' },
});
