import React, { useEffect, useState, useContext } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator, RefreshControl, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LoadingScreen } from '../components/LoadingScreen';
import { TrackingStatusBanner } from '../components/TrackingStatusBanner';
import { toMapPin } from '../utils/maps';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { MainTabParamList } from '../types/navigation';
import { getOrders, getDeliveryOrders, getDeliveryStatuses, Order, DeliveryStatus } from '../services/orderService';
import { useLanguage } from '../context/LanguageContext';
import { AuthContext } from '../context/AuthContext';
import { useFocusEffect } from '@react-navigation/native';
import { canWhatsApp, openWhatsApp } from '../utils/whatsapp';
import { callNumber, canCall } from '../utils/phone';

type Props = BottomTabScreenProps<MainTabParamList, 'Orders'>;

const STATUS_FILTERS = ['All', 'Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'] as const;
type StatusFilter = typeof STATUS_FILTERS[number];

export const OrderHistoryScreen: React.FC<Props> = ({ navigation }) => {
  const { t } = useLanguage();
  const { user } = useContext(AuthContext);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deliveryStatuses, setDeliveryStatuses] = useState<DeliveryStatus[]>([]);
  const [selectedFilter, setSelectedFilter] = useState<StatusFilter>('All');
  const isDeliveryBoy = user?.user_type === 'delivery_boy';

  const fetchOrders = async () => {
    try {
      const data = isDeliveryBoy ? await getDeliveryOrders() : await getOrders();
      setOrders(data);
    } catch (error) {
      console.error('Error fetching orders:', error);
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Pending': return '#f39c12';
      case 'Processing': return '#3498db';
      case 'Shipped': return '#9b59b6';
      case 'Delivered': return '#2ecc71';
      case 'Cancelled': return '#e74c3c';
      default: return '#95a5a6';
    }
  };

  const getDeliveryStatusColor = (deliveryStatusName: string) => {
    const status = deliveryStatuses.find(s => s.name === deliveryStatusName);
    if (status) {
      return { bg: status.background_color, text: status.color, border: status.border_color };
    }
    return { bg: '#f0f8ff', text: '#007AFF', border: '#007AFF' };
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
        {STATUS_FILTERS.map(filter => (
          <TouchableOpacity
            key={filter}
            style={[
              styles.filterChip,
              selectedFilter === filter && styles.filterChipActive,
              selectedFilter === filter && filter !== 'All' && { backgroundColor: getStatusColor(filter), borderColor: getStatusColor(filter) },
            ]}
            onPress={() => setSelectedFilter(filter)}
          >
            <Text
              style={[
                styles.filterChipText,
                selectedFilter === filter && styles.filterChipTextActive,
              ]}
            >
              {filter}
              {filter !== 'All' && orders.filter(o => o.status === filter).length > 0
                ? ` (${orders.filter(o => o.status === filter).length})`
                : ''}
            </Text>
          </TouchableOpacity>
        ))}
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
            { backgroundColor: isDelivered ? '#34C759' : statusColor?.border || '#0A84FF' },
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
            <Ionicons name="location" size={17} color="#0A84FF" style={{ marginTop: 2 }} />
            <Text style={styles.riderAddress} numberOfLines={3}>
              {item.shipping_address || t('no_address', 'No address on this order')}
            </Text>
          </View>

          {/* Whether an exact pin exists changes how a rider plans the stop. */}
          <View style={styles.riderChipRow}>
            {!!pin && (
              <View style={styles.pinnedBadge}>
                <Ionicons name="location" size={11} color="#34C759" />
                <Text style={styles.pinnedText}>Pinned</Text>
              </View>
            )}
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

          {/* Contact. A rider standing at a locked gate needs the number in one
              tap, without opening the order. Which app is not ours to decide —
              WhatsApp is free but the customer may not have it or be online, so
              the SIM is always offered too. */}
          {(canCall(customerPhone) || canWhatsApp(customerPhone)) && (
            <View style={styles.riderContactRow}>
              <Ionicons name="call-outline" size={13} color="#8a929b" />
              <Text style={styles.riderPhone}>{customerPhone}</Text>
              {canCall(customerPhone) && (
                <TouchableOpacity
                  style={[styles.riderContactBtn, styles.riderCallBtn]}
                  onPress={() => callNumber(customerPhone)}
                  accessibilityRole="button"
                  accessibilityLabel={`Call ${customerName}`}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Ionicons name="call" size={14} color="#fff" />
                </TouchableOpacity>
              )}
              {canWhatsApp(customerPhone) && (
                <TouchableOpacity
                  style={[styles.riderContactBtn, styles.riderWaBtn]}
                  onPress={() => openWhatsApp(
                    customerPhone,
                    `Hello ${customerName}, I am on my way with your order #${item.id}.`,
                  )}
                  accessibilityRole="button"
                  accessibilityLabel={`WhatsApp ${customerName}`}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Ionicons name="logo-whatsapp" size={14} color="#fff" />
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* 3 — What the office told the rider about this drop. */}
          {!!item.delivery_notes && (
            <View style={styles.riderNoteBox}>
              <Ionicons name="chatbubble-ellipses" size={13} color="#8a6100" />
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
              <Ionicons name="calendar-outline" size={12} color="#8a929b" />
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
              <Ionicons name="checkmark-circle" size={15} color="#34C759" />
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
              <Ionicons name="navigate" size={16} color="#fff" />
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
        <Text style={styles.orderId}>{t('order_number', 'Order #')}{item.id}</Text>
        <Text style={[styles.orderStatus, { color: getStatusColor(item.status) }]}>
          {t(`status_${item.status.toLowerCase()}`, item.status)}
        </Text>
      </View>

      <Text style={styles.orderDate}>{new Date(item.created_at).toLocaleDateString()}</Text>

      <View style={styles.divider} />

      {item.items.map((product) => (
        <View key={product.id} style={styles.productRow}>
          <Text style={styles.productText}>
            {product.quantity} x {product.product_details?.name || t('unknown_product', 'Unknown Product')}
          </Text>
          <Text style={styles.productPrice}>PKR {product.price}</Text>
        </View>
      ))}

      <View style={styles.divider} />

      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>{t('total_amount', 'Total Amount')}</Text>
        <Text style={styles.totalAmount}>PKR {item.total_price}</Text>
      </View>

    </View>
  );

  const renderOrder = ({ item }: { item: Order }) =>
    isDeliveryBoy ? renderRiderOrder({ item }) : renderCustomerOrder({ item });

  if (loading && orders.length === 0) {
    return <LoadingScreen message="Loading orders…" />;
  }

  const showEmpty = filteredOrders.length === 0;

  return (
    <View style={styles.container}>
      {renderFilterChips()}

      {/* Riders are tracked in the background, so they get told so on the very
          screen they work from — not buried in a settings page. */}
      {isDeliveryBoy && <TrackingStatusBanner />}

      {showEmpty ? (
        <ScrollView
          contentContainerStyle={styles.emptyContainer}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#007AFF']} tintColor="#007AFF" />
          }
        >
          <Text style={styles.emptyText}>
            {orders.length === 0
              ? isDeliveryBoy
                ? t('no_delivery_orders', 'No delivery orders assigned')
                : t('no_orders', 'No orders found')
              : `No ${selectedFilter.toLowerCase()} orders`}
          </Text>
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
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={['#007AFF']}
              tintColor="#007AFF"
              title="Pull to refresh"
              titleColor="#666"
            />
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterBar: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    flexGrow: 0,
  },
  filterBarContent: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#ddd',
    backgroundColor: '#f9f9f9',
  },
  filterChipActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  filterChipText: {
    fontSize: 13,
    color: '#555',
    fontWeight: '500',
  },
  filterChipTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  listContent: {
    padding: 16,
  },
  orderCard: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.41,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  orderId: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  orderStatus: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  orderDate: {
    fontSize: 12,
    color: '#888',
    marginBottom: 12,
  },
  divider: {
    height: 1,
    backgroundColor: '#eee',
    marginVertical: 8,
  },
  productRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  productText: {
    fontSize: 14,
    color: '#666',
    flex: 1,
  },
  productPrice: {
    fontSize: 14,
    color: '#333',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 8,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  totalAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2ecc71',
  },
  emptyContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    fontSize: 18,
    color: '#666',
    marginBottom: 20,
  },
  shopNowButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  shopNowText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
  clearFilterButton: {
    marginTop: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  clearFilterText: {
    color: '#007AFF',
    fontWeight: '600',
    fontSize: 14,
  },
  // ── Rider card ────────────────────────────────────────────────────────────
  riderCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginBottom: 14,
    // Clips the spine and the banner to the rounded corners.
    overflow: 'hidden',
    shadowColor: '#0D1B2A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.09,
    shadowRadius: 10,
    elevation: 3,
  },
  riderSpine: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  // Welded to the top-right corner: square where it meets the card edges,
  // rounded only on the inward corner, so it reads as a banner rather than a
  // floating pill.
  riderBanner: {
    position: 'absolute', top: 0, right: 0, zIndex: 1,
    flexDirection: 'row', alignItems: 'baseline',
    backgroundColor: '#0D1B2A',
    paddingLeft: 12, paddingRight: 14, paddingTop: 7, paddingBottom: 8,
    borderBottomLeftRadius: 14,
  },
  riderBannerHash: { color: 'rgba(255,255,255,0.45)', fontSize: 12, fontWeight: '700' },
  riderBannerId: {
    color: '#fff', fontSize: 15, fontWeight: '800',
    letterSpacing: 0.3, fontVariant: ['tabular-nums'],
  },
  riderBody: { paddingLeft: 18, paddingRight: 14, paddingTop: 14, paddingBottom: 14 },

  riderAddressRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    // Clear of the banner so a long address never runs under it.
    paddingRight: 62,
  },
  riderAddress: { flex: 1, fontSize: 15.5, fontWeight: '700', color: '#1a2530', lineHeight: 22 },
  riderChipRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  riderStatusChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    marginTop: 8, paddingVertical: 5, paddingHorizontal: 10,
    borderRadius: 6, borderWidth: 1,
  },
  riderStatusDot: { width: 6, height: 6, borderRadius: 3 },
  riderStatusText: { fontSize: 11.5, fontWeight: '700' },

  riderContactRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 12 },
  riderPhone: {
    flex: 1, fontSize: 13.5, color: '#374857',
    fontWeight: '600', letterSpacing: 0.3, fontVariant: ['tabular-nums'],
  },
  riderContactBtn: {
    width: 32, height: 32, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
  },
  riderCallBtn: { backgroundColor: '#0A84FF' },
  riderWaBtn: { backgroundColor: '#25D366' },

  riderNoteBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 7,
    marginTop: 12, padding: 10, borderRadius: 10,
    backgroundColor: '#FFF8E5', borderWidth: 1, borderColor: '#FFE2A8',
  },
  riderNoteText: { flex: 1, fontSize: 13, color: '#8a6100', lineHeight: 18 },

  riderItemsBox: {
    marginTop: 12, borderRadius: 12, padding: 10,
    backgroundColor: '#f7f9fb', borderWidth: 1, borderColor: '#eef2f5',
  },
  riderItemRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 4 },
  riderQtyPill: {
    minWidth: 24, height: 22, borderRadius: 6, paddingHorizontal: 5,
    backgroundColor: '#e4ebf2', alignItems: 'center', justifyContent: 'center',
  },
  riderQtyText: { fontSize: 12, fontWeight: '800', color: '#4a5a6a' },
  riderItemName: { flex: 1, fontSize: 13.5, color: '#374857' },
  riderItemPrice: { fontSize: 13, fontWeight: '600', color: '#5b6b7c' },
  riderTotalRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 6, paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#dde5ec',
  },
  riderTotalLabel: { fontSize: 12, color: '#8a929b', fontWeight: '600' },
  riderTotalValue: { fontSize: 15, fontWeight: '800', color: '#1a2530' },

  riderFooterRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', gap: 8, marginTop: 12,
  },
  riderDateWrap: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  riderDate: { fontSize: 12, color: '#8a929b', fontWeight: '600' },
  riderReceivedWrap: { flexDirection: 'row', alignItems: 'baseline', gap: 7 },
  riderReceivedLabel: { fontSize: 12, color: '#8a929b', fontWeight: '600' },
  riderReceivedValue: { fontSize: 16, fontWeight: '800', color: '#c2c8ce' },
  riderReceivedPaid: { color: '#34C759' },

  riderDoneRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginTop: 12, paddingVertical: 11, borderRadius: 10,
    backgroundColor: '#34C75912',
  },
  riderDoneText: { fontSize: 13, fontWeight: '700', color: '#2a9d4e' },
  riderManageBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    backgroundColor: '#007AFF', paddingVertical: 12, borderRadius: 11, marginTop: 12,
    shadowColor: '#007AFF', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28, shadowRadius: 8, elevation: 4,
  },

  updateButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginTop: 12,
    alignItems: 'center',
  },
  updateButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  pinnedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 8,
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#34C75950',
    backgroundColor: '#34C75915',
  },
  pinnedText: {
    color: '#34C759',
    fontSize: 11,
    fontWeight: '700',
  },
  deliveryStatusBadge: {
    backgroundColor: '#f0f8ff',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  deliveryStatusText: {
    color: '#007AFF',
    fontSize: 12,
    fontWeight: '600',
  },
});
