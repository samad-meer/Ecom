import { colors, radius, card, pagePadding } from '../theme';
import React, { useEffect, useState, useContext } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, RefreshControl, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LoadingScreen } from '../components/LoadingScreen';
import { TrackingStatusBanner } from '../components/TrackingStatusBanner';
import { ErrorState, EmptyState, StatusPill, orderStatusTone, friendlyError } from '../components/ui';
import { toMapPin } from '../utils/maps';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { MainTabParamList } from '../types/navigation';
import { getOrders, getDeliveryOrders, getDeliveryStatuses, Order, DeliveryStatus } from '../services/orderService';
import { useLanguage } from '../context/LanguageContext';
import { AuthContext } from '../context/AuthContext';
import { useFocusEffect } from '@react-navigation/native';
import { canWhatsApp, openWhatsApp, orderDispatchMessage } from '../utils/whatsapp';
import { callNumber, canCall } from '../utils/phone';

type Props = BottomTabScreenProps<MainTabParamList, 'Orders'>;

const STATUS_FILTERS = ['All', 'Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'] as const;
type StatusFilter = typeof STATUS_FILTERS[number];

/** "1,200" rather than "1200.00"; a value that is not a number is shown as sent. */
const money = (value: string | number | null | undefined) => {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return String(value ?? '');
  return n.toLocaleString('en-PK', { maximumFractionDigits: 2 });
};

export const OrderHistoryScreen: React.FC<Props> = ({ navigation }) => {
  const { t } = useLanguage();
  const { user } = useContext(AuthContext);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // The reason the last load failed. Kept apart from `orders` so a failed
  // refresh leaves the previous list on screen instead of blanking it.
  const [error, setError] = useState<string | null>(null);
  const [deliveryStatuses, setDeliveryStatuses] = useState<DeliveryStatus[]>([]);
  const [selectedFilter, setSelectedFilter] = useState<StatusFilter>('All');
  const isDeliveryBoy = user?.user_type === 'delivery_boy';

  const fetchOrders = async () => {
    try {
      const data = isDeliveryBoy ? await getDeliveryOrders() : await getOrders();
      setOrders(data);
      setError(null);
    } catch (e: any) {
      console.error('Error fetching orders:', e);
      setError(e?.message || 'Could not load your orders.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchDeliveryStatuses = async () => {
    if (!isDeliveryBoy) return;
    try {
      const statuses = await getDeliveryStatuses();
      setDeliveryStatuses(statuses);
    } catch (error) {
      console.error('Error fetching delivery statuses:', error);
    }
  };

  useEffect(() => {
    fetchOrders();
    fetchDeliveryStatuses();
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      if (!loading) {
        fetchOrders();
      }
    }, [isDeliveryBoy, loading])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchOrders();
  };

  const getDeliveryStatusColor = (deliveryStatusName: string) => {
    const status = deliveryStatuses.find(s => s.name === deliveryStatusName);
    if (status) {
      return { bg: status.background_color, text: status.color, border: status.border_color };
    }
    return { bg: colors.primaryTint, text: colors.primary, border: colors.primary };
  };

  const filteredOrders = selectedFilter === 'All'
    ? orders
    : orders.filter(o => o.status === selectedFilter);

  const renderFilterChips = () => {
    if (isDeliveryBoy) return null;
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterBar}
        contentContainerStyle={styles.filterBarContent}
      >
        {STATUS_FILTERS.map(filter => {
          const active = selectedFilter === filter;
          const count = filter !== 'All' ? orders.filter(o => o.status === filter).length : 0;
          return (
            <TouchableOpacity
              key={filter}
              style={[styles.filterChip, active && styles.filterChipActive]}
              onPress={() => setSelectedFilter(filter)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                {filter}
                {count > 0 ? ` (${count})` : ''}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    );
  };

  /**
   * The rider's card. Ordered by what someone standing on a doorstep needs, not
   * by what the record looks like: where to go first, which order it is, what
   * the office told them, then the contents, and only then the bookkeeping.
   */
  const renderRiderOrder = ({ item }: { item: Order }) => {
    const pin = toMapPin(item.shipping_latitude, item.shipping_longitude);
    const isDelivered = item.delivery_status === 'Delivered' || item.status === 'Delivered';
    // Submitting is what closes an order, and the timestamp is what records it.
    // Orders closed under the older flow sit on a status like 'Not Responding'
    // but are just as final, so they must not still offer "Manage Delivery" —
    // the server rejects every write to them.
    const isSubmitted = isDelivered || !!(item as any).delivery_status_updated_at;
    const received = Number(item.cash_amount ?? 0);

    const statusColor = item.delivery_status
      ? getDeliveryStatusColor(item.delivery_status)
      : null;
    // The rider serializer sends a `customer` block built for this screen;
    // guest phone-in orders carry their number on the order itself instead.
    const customerName: string = (item as any).customer?.name || item.user || 'Customer';
    const customerPhone: string | null =
      (item as any).customer?.phone_number ?? (item as any).guest_phone ?? null;
    const itemCount = item.items.reduce((n, p) => n + p.quantity, 0);

    return (
      <View style={styles.riderCard}>
        {/* A status-coloured spine down the left edge. Riders scan a list of
            near-identical cards, and colour is readable at arm's length in a
            way a small badge is not. */}
        <View
          style={[
            styles.riderSpine,
            { backgroundColor: isDelivered ? colors.success : statusColor?.border || colors.primary },
          ]}
        />

        {/* Order number as a banner welded to the right edge. */}
        <View style={styles.riderBanner}>
          <Text style={styles.riderBannerHash}>#</Text>
          <Text style={styles.riderBannerId}>{item.id}</Text>
        </View>

        <View style={styles.riderBody}>
          {/* 1 — Address. The whole job starts with getting to the right gate.
              Padded clear of the banner so long addresses never run under it. */}
          <View style={styles.riderAddressRow}>
            <Ionicons name="location" size={18} color={colors.primary} style={{ marginTop: 2 }} />
            <Text style={styles.riderAddress} numberOfLines={3}>
              {item.shipping_address || t('no_address', 'No address on this order')}
            </Text>
          </View>

          {/* Whether an exact pin exists changes how a rider plans the stop. */}
          {(!!pin || (!!item.delivery_status && !!statusColor)) && (
            <View style={styles.riderChipRow}>
              {!!pin && <StatusPill label="Pinned" tone="success" icon="location" />}
              {!!item.delivery_status && statusColor && (
                <View style={[
                  styles.riderStatusChip,
                  { backgroundColor: statusColor.bg, borderColor: statusColor.border },
                ]}>
                  <View style={[styles.riderStatusDot, { backgroundColor: statusColor.border }]} />
                  <Text style={[styles.riderStatusText, { color: statusColor.text }]}>
                    {item.delivery_status}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Contact. A rider standing at a locked gate needs the number in one
              tap, without opening the order. Which app is not ours to decide —
              WhatsApp is free but the customer may not have it or be online, so
              the SIM is always offered too. */}
          {(canCall(customerPhone) || canWhatsApp(customerPhone)) && (
            <View style={styles.riderContactRow}>
              <Ionicons name="call-outline" size={16} color={colors.muted} />
              <Text style={styles.riderPhone}>{customerPhone}</Text>
              {canCall(customerPhone) && (
                <TouchableOpacity
                  style={[styles.riderContactBtn, styles.riderCallBtn]}
                  onPress={() => callNumber(customerPhone)}
                  accessibilityRole="button"
                  accessibilityLabel={`Call ${customerName}`}
                  hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                >
                  <Ionicons name="call" size={18} color={colors.white} />
                </TouchableOpacity>
              )}
              {canWhatsApp(customerPhone) && (
                <TouchableOpacity
                  style={[styles.riderContactBtn, styles.riderWaBtn]}
                  onPress={() => openWhatsApp(
                    customerPhone,
                    orderDispatchMessage({
                      customerName,
                      orderId: item.id,
                      items: item.items,
                      orderTotal: item.total_price,
                      previousBalance: (item as any).customer?.account_balance,
                      isPaid: (item as any).is_paid,
                      shippingAddress: item.shipping_address,
                    }),
                  )}
                  accessibilityRole="button"
                  accessibilityLabel={`WhatsApp ${customerName}`}
                  hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                >
                  <Ionicons name="logo-whatsapp" size={18} color={colors.ink} />
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* 3 — What the office told the rider about this drop. */}
          {!!item.delivery_notes && (
            <View style={styles.riderNoteBox}>
              <Ionicons name="chatbubble-ellipses" size={16} color={colors.warningText} />
              <Text style={styles.riderNoteText}>{item.delivery_notes}</Text>
            </View>
          )}

          {/* 4 — Order detail, boxed so it reads as one block rather than
              loose rows competing with the address above it. */}
          <View style={styles.riderItemsBox}>
            {item.items.map((product) => (
              <View key={product.id} style={styles.riderItemRow}>
                <View style={styles.riderQtyPill}>
                  <Text style={styles.riderQtyText}>{product.quantity}</Text>
                </View>
                <Text style={styles.riderItemName} numberOfLines={1}>
                  {product.product_details?.name || t('unknown_product', 'Unknown Product')}
                </Text>
                <Text style={styles.riderItemPrice}>PKR {product.price}</Text>
              </View>
            ))}
            <View style={styles.riderTotalRow}>
              <Text style={styles.riderTotalLabel}>
                {t('total_amount', 'Total')} · {itemCount} {itemCount === 1 ? 'item' : 'items'}
              </Text>
              <Text style={styles.riderTotalValue}>PKR {item.total_price}</Text>
            </View>
          </View>

          {/* 5, 7 — Date, and what the rider actually collected. Shown as a dash
              rather than "PKR 0" until something is collected: zero is a real
              answer here (an unpaid drop) and must not look like "not yet". */}
          <View style={styles.riderFooterRow}>
            <View style={styles.riderDateWrap}>
              <Ionicons name="calendar-outline" size={14} color={colors.muted} />
              <Text style={styles.riderDate}>
                {new Date(item.created_at).toLocaleDateString()}
              </Text>
            </View>
            <View style={styles.riderReceivedWrap}>
              <Text style={styles.riderReceivedLabel}>Received</Text>
              <Text style={[styles.riderReceivedValue, item.cash_received && styles.riderReceivedPaid]}>
                {item.cash_received ? `PKR ${received.toFixed(0)}` : '—'}
              </Text>
            </View>
          </View>

          {/* A submitted delivery is final — nothing left to manage. */}
          {isSubmitted ? (
            <View style={styles.riderDoneRow}>
              <Ionicons name="checkmark-circle" size={18} color={colors.success} />
              <Text style={styles.riderDoneText}>
                {isDelivered ? 'Delivered — no further changes' : 'Submitted — no further changes'}
              </Text>
            </View>
          ) : item.status !== 'Cancelled' ? (
            <TouchableOpacity
              style={styles.riderManageBtn}
              onPress={() => (navigation as any).navigate('DeliveryOrderDetail', { order: item })}
              activeOpacity={0.85}
            >
              <Ionicons name="navigate" size={18} color={colors.white} />
              <Text style={styles.updateButtonText}>{t('manage_delivery', 'Manage Delivery')}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    );
  };

  const renderCustomerOrder = ({ item }: { item: Order }) => (
    <View style={styles.orderCard}>
      <View style={styles.orderHeader}>
        <View style={styles.orderHeaderText}>
          <Text style={styles.orderId}>{t('order_number', 'Order #')}{item.id}</Text>
          <Text style={styles.orderDate}>{new Date(item.created_at).toLocaleDateString()}</Text>
        </View>
        <StatusPill
          label={t(`status_${item.status.toLowerCase()}`, item.status)}
          tone={orderStatusTone(item.status)}
        />
      </View>

      <View style={styles.productsBox}>
        {item.items.map((product) => (
          <View key={product.id} style={styles.productRow}>
            <Text style={styles.productText} numberOfLines={2}>
              {product.quantity} x {product.product_details?.name || t('unknown_product', 'Unknown Product')}
            </Text>
            <Text style={styles.productPrice}>PKR {product.price}</Text>
          </View>
        ))}
      </View>

      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>{t('total_amount', 'Total Amount')}</Text>
        <Text style={styles.totalAmount}>PKR {money(item.total_price)}</Text>
      </View>
    </View>
  );

  const renderOrder = ({ item }: { item: Order }) =>
    isDeliveryBoy ? renderRiderOrder({ item }) : renderCustomerOrder({ item });

  if (loading && orders.length === 0) {
    return <LoadingScreen message="Loading orders…" />;
  }

  const showEmpty = filteredOrders.length === 0;
  // Nothing to show and the reason is a failed request, not an empty history:
  // "no orders" here would read as the customer having never ordered.
  const failedWithNothing = !!error && orders.length === 0;

  const refreshControl = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      colors={[colors.primary]}
      tintColor={colors.primary}
      title="Pull to refresh"
      titleColor={colors.textSecondary}
    />
  );

  return (
    <View style={styles.container}>
      {!failedWithNothing && renderFilterChips()}

      {/* Riders are tracked in the background, so they get told so on the very
          screen they work from — not buried in a settings page. */}
      {isDeliveryBoy && <TrackingStatusBanner />}

      {/* A refresh that failed keeps the list below; this says why it may be old. */}
      {!!error && orders.length > 0 && (
        <View style={styles.errorBanner}>
          <Ionicons name="cloud-offline-outline" size={18} color={colors.danger} />
          <View style={styles.errorBannerBody}>
            <Text style={styles.errorBannerText}>{friendlyError(error)}</Text>
            <TouchableOpacity style={styles.errorBannerBtn} onPress={onRefresh} accessibilityLabel="Try again">
              <Text style={styles.errorBannerLink}>Try again</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {failedWithNothing ? (
        <ScrollView contentContainerStyle={styles.emptyContainer} refreshControl={refreshControl}>
          <ErrorState title="Could not load your orders" message={error} onRetry={onRefresh} />
        </ScrollView>
      ) : showEmpty ? (
        <ScrollView contentContainerStyle={styles.emptyContainer} refreshControl={refreshControl}>
          <EmptyState
            icon={isDeliveryBoy ? 'bicycle-outline' : 'receipt-outline'}
            title={
              orders.length === 0
                ? isDeliveryBoy
                  ? t('no_delivery_orders', 'No delivery orders assigned')
                  : t('no_orders', 'No orders found')
                : `No ${selectedFilter.toLowerCase()} orders`
            }
            text={
              orders.length === 0
                ? isDeliveryBoy
                  ? 'New deliveries from the office will show up here. Pull down to check again.'
                  : 'Your orders will appear here once you place one.'
                : 'Try another filter to see your other orders.'
            }
          />
          {!isDeliveryBoy && orders.length === 0 && (
            <TouchableOpacity style={styles.shopNowButton} onPress={() => navigation.navigate('Home')}>
              <Text style={styles.shopNowText}>{t('start_shopping', 'Start Shopping')}</Text>
            </TouchableOpacity>
          )}
          {selectedFilter !== 'All' && (
            <TouchableOpacity style={styles.clearFilterButton} onPress={() => setSelectedFilter('All')}>
              <Text style={styles.clearFilterText}>Show all orders</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      ) : (
        <FlatList
          data={filteredOrders}
          renderItem={renderOrder}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.listContent}
          refreshControl={refreshControl}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },

  // Filters sit straight on the page, not on a white band.
  filterBar: {
    flexGrow: 0,
  },
  filterBarContent: {
    paddingHorizontal: pagePadding,
    paddingVertical: 12,
    gap: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: 40,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterChipText: {
    fontSize: 14,
    color: colors.ink,
    fontWeight: '700',
  },
  filterChipTextActive: {
    color: colors.white,
  },
  listContent: {
    paddingHorizontal: pagePadding,
    paddingTop: 4,
    // The floating WhatsApp button sits over the lower right of this screen for
    // customers and riders. Without this clearance the last card, and a rider's
    // "Manage Delivery" button on it, can end up underneath with nothing left
    // to scroll.
    paddingBottom: 96,
  },

  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginHorizontal: pagePadding,
    marginBottom: 8,
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: colors.dangerBg,
    borderWidth: 1,
    borderColor: colors.dangerLine,
  },
  errorBannerBody: { flex: 1, gap: 4 },
  errorBannerText: { fontSize: 14, color: colors.danger, lineHeight: 20 },
  // 40px tall so the link is easy to hit; text alone would be about 20.
  errorBannerBtn: { minHeight: 40, justifyContent: 'center', alignSelf: 'flex-start' },
  errorBannerLink: { fontSize: 14, fontWeight: '800', color: colors.primaryDark },

  // ── Customer card ─────────────────────────────────────────────────────────
  orderCard: {
    ...card,
    padding: 16,
    marginBottom: 12,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 12,
  },
  orderHeaderText: { flex: 1 },
  orderId: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.ink,
  },
  orderDate: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  productsBox: {
    backgroundColor: colors.surfaceTint,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
  },
  productRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  productText: {
    fontSize: 14,
    color: colors.textSecondary,
    flex: 1,
  },
  productPrice: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.ink,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  totalAmount: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.ink,
  },

  // ── Empty and error states ────────────────────────────────────────────────
  emptyContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  shopNowButton: {
    backgroundColor: colors.primary,
    height: 48,
    paddingHorizontal: 24,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  shopNowText: {
    color: colors.white,
    fontWeight: '800',
    fontSize: 16,
  },
  clearFilterButton: {
    marginTop: 12,
    height: 46,
    paddingHorizontal: 22,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearFilterText: {
    color: colors.primary,
    fontWeight: '800',
    fontSize: 14,
  },

  // ── Rider card ────────────────────────────────────────────────────────────
  riderCard: {
    ...card,
    marginBottom: 12,
    // Clips the spine and the banner to the rounded corners.
    overflow: 'hidden',
  },
  riderSpine: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 5 },
  // Welded to the top-right corner: square where it meets the card edges,
  // rounded only on the inward corner, so it reads as a banner rather than a
  // floating pill.
  riderBanner: {
    position: 'absolute', top: 0, right: 0, zIndex: 1,
    flexDirection: 'row', alignItems: 'baseline',
    backgroundColor: colors.ink,
    paddingLeft: 14, paddingRight: 18, paddingTop: 8, paddingBottom: 9,
    borderBottomLeftRadius: 20,
  },
  riderBannerHash: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '700' },
  riderBannerId: {
    color: colors.white, fontSize: 16, fontWeight: '800',
    letterSpacing: 0.3, fontVariant: ['tabular-nums'],
  },
  riderBody: { paddingLeft: 20, paddingRight: 16, paddingTop: 16, paddingBottom: 16 },

  riderAddressRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    // Clear of the banner so a long address never runs under it.
    paddingRight: 84,
  },
  riderAddress: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.ink, lineHeight: 22 },
  riderChipRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  riderStatusChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingVertical: 4, paddingHorizontal: 10,
    borderRadius: radius.pill, borderWidth: 1,
  },
  riderStatusDot: { width: 6, height: 6, borderRadius: 3 },
  riderStatusText: { fontSize: 12, fontWeight: '800' },

  riderContactRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  riderPhone: {
    flex: 1, fontSize: 14, color: colors.textSecondary,
    fontWeight: '700', letterSpacing: 0.3, fontVariant: ['tabular-nums'],
  },
  riderContactBtn: {
    width: 40, height: 40, borderRadius: radius.md,
    alignItems: 'center', justifyContent: 'center',
  },
  riderCallBtn: { backgroundColor: colors.primary },
  riderWaBtn: { backgroundColor: colors.whatsapp },

  riderNoteBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    marginTop: 12, padding: 12, borderRadius: radius.md,
    backgroundColor: colors.warningBg, borderWidth: 1, borderColor: colors.warningLine,
  },
  riderNoteText: { flex: 1, fontSize: 14, color: colors.warningText, lineHeight: 20 },

  riderItemsBox: {
    marginTop: 12, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: colors.surfaceTint, borderWidth: 1, borderColor: colors.line,
  },
  riderItemRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  riderQtyPill: {
    minWidth: 28, height: 24, borderRadius: radius.sm, paddingHorizontal: 6,
    backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center',
  },
  riderQtyText: { fontSize: 12, fontWeight: '800', color: colors.primaryDark },
  riderItemName: { flex: 1, fontSize: 14, color: colors.textSecondary },
  riderItemPrice: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  riderTotalRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 8, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: colors.line,
  },
  riderTotalLabel: { fontSize: 14, color: colors.textSecondary, fontWeight: '700' },
  riderTotalValue: { fontSize: 20, fontWeight: '800', color: colors.ink },

  riderFooterRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', gap: 8, marginTop: 14,
  },
  riderDateWrap: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  riderDate: { fontSize: 12, color: colors.muted, fontWeight: '600' },
  riderReceivedWrap: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  riderReceivedLabel: { fontSize: 12, color: colors.muted, fontWeight: '600' },
  riderReceivedValue: { fontSize: 16, fontWeight: '800', color: colors.muted },
  riderReceivedPaid: { color: colors.success },

  riderDoneRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 14, minHeight: 46, paddingHorizontal: 12, borderRadius: radius.md,
    backgroundColor: colors.successBg,
  },
  riderDoneText: { fontSize: 14, fontWeight: '800', color: colors.success },
  riderManageBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.primary, height: 50, borderRadius: radius.md, marginTop: 14,
  },
  updateButtonText: {
    color: colors.white,
    fontWeight: '800',
    fontSize: 16,
  },
});
