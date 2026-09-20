import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  TextInput, ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { LoadingScreen } from '../../components/LoadingScreen';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { adminService, AdminOrder, DeliveryBoy } from '../../services/adminService';
import { useRefetchOnFocus } from '../../hooks/useRefetchOnFocus';
import { RootStackParamList, AdminTabParamList } from '../../types/navigation';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const STATUS_FILTERS = ['All', 'Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];

const STATUS_COLORS: Record<string, string> = {
  Pending: '#FF9500',
  Processing: '#5856D6',
  Shipped: '#32ADE6',
  Delivered: '#34C759',
  Cancelled: '#FF3B30',
};

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] || '#888';
  return (
    <View style={[styles.badge, { backgroundColor: color + '20', borderColor: color + '50' }]}>
      <Text style={[styles.badgeText, { color }]}>{status}</Text>
    </View>
  );
}

function OrderRow({ order, onPress }: { order: AdminOrder; onPress: () => void }) {
  const date = new Date(order.created_at).toLocaleDateString('en-PK', {
    day: 'numeric', month: 'short',
  });
  return (
    <TouchableOpacity
      style={[styles.orderRow, order.is_hidden && styles.orderRowHidden]}
      onPress={onPress}
    >
      <View style={styles.orderRowLeft}>
        <Text style={styles.orderId}>#{order.id}</Text>
        <Text style={styles.orderDate}>{date}</Text>
      </View>
      <View style={styles.orderRowMid}>
        <Text style={styles.customerName} numberOfLines={1}>
          {order.customer_name}
          {order.guest_name ? ' 📞' : ''}
        </Text>
        <Text style={styles.orderAddress} numberOfLines={1}>{order.shipping_address}</Text>
      </View>
      <View style={styles.orderRowRight}>
        <Text style={styles.orderTotal}>PKR {Number(order.total_price).toLocaleString()}</Text>
        <StatusBadge status={order.status} />
        {order.is_paid ? (
          <Text style={styles.paidTag}>✓ Paid</Text>
        ) : (
          <Text style={styles.unpaidTag}>Unpaid</Text>
        )}
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
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(route.params?.initialStatus ?? 'All');
  const [paidFilter, setPaidFilter] = useState<boolean | null>(
    route.params?.initialPaid !== undefined ? (route.params.initialPaid ?? null) : null,
  );
  const [showHidden, setShowHidden] = useState(false);

  // Sync when navigated from dashboard with new params
  useEffect(() => {
    if (route.params?.initialStatus !== undefined) {
      setStatusFilter(route.params.initialStatus ?? 'All');
    }
    if (route.params?.initialPaid !== undefined) {
      setPaidFilter(route.params.initialPaid ?? null);
    }
  }, [route.params]);

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const [orderData, riders] = await Promise.all([
        adminService.getOrders({
          status: statusFilter !== 'All' ? statusFilter : undefined,
          search: search || undefined,
          is_paid: paidFilter !== null ? paidFilter : undefined,
          show_hidden: showHidden,
        }),
        adminService.getDeliveryBoys(),
      ]);
      setOrders(orderData);
      setDeliveryBoys(riders);
    } catch (e) {
      Alert.alert('Error', 'Failed to load orders.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter, search, paidFilter, showHidden]);

  useEffect(() => { load(); }, [load]);

  // Coming back from a detail screen that changed something must show the
  // change. Silent refetch — load(true) skips the full-screen spinner, so the
  // list updates in place instead of flashing blank.
  useRefetchOnFocus(() => load(true));

  const onRefresh = () => { setRefreshing(true); load(true); };

  return (
    <View style={styles.container}>
      {/* Search */}
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={16} color="#888" />
          <TextInput
            style={styles.searchInput}
            placeholder="Customer, phone, address…"
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
            onSubmitEditing={() => load()}
            placeholderTextColor="#000"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={16} color="#888" />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          style={[styles.hiddenBtn, showHidden && styles.hiddenBtnActive]}
          onPress={() => setShowHidden(v => !v)}
        >
          <Ionicons name={showHidden ? 'eye' : 'eye-off'} size={18} color={showHidden ? '#FF9500' : '#888'} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.newOrderBtn}
          onPress={() => navigation.navigate('AdminCreateOrder')}
        >
          <Ionicons name="add" size={20} color="white" />
        </TouchableOpacity>
      </View>

      {/* Status filter chips + paid filter */}
      <View style={styles.filterRow}>
        <FlatList
          data={STATUS_FILTERS}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={s => s}
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
        {/* Paid / Unpaid toggle */}
        <View style={styles.paidFilterRow}>
          <TouchableOpacity
            style={[styles.paidChip, paidFilter === true && styles.paidChipActive]}
            onPress={() => setPaidFilter(v => v === true ? null : true)}
          >
            <Ionicons name="card" size={12} color={paidFilter === true ? 'white' : '#34C759'} />
            <Text style={[styles.paidChipText, paidFilter === true && { color: 'white' }]}>Paid</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.unpaidChip, paidFilter === false && styles.unpaidChipActive]}
            onPress={() => setPaidFilter(v => v === false ? null : false)}
          >
            <Ionicons name="alert-circle" size={12} color={paidFilter === false ? 'white' : '#FF3B30'} />
            <Text style={[styles.unpaidChipText, paidFilter === false && { color: 'white' }]}>Unpaid</Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <LoadingScreen message="Loading orders…" />
      ) : orders.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="clipboard-outline" size={48} color="#ccc" />
          <Text style={styles.emptyText}>No orders found</Text>
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={o => String(o.id)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          renderItem={({ item }) => (
            <OrderRow
              order={item}
              onPress={() => navigation.navigate('AdminOrderDetail', { order: item, deliveryBoys })}
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          contentContainerStyle={{ paddingBottom: 24 }}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: 'white',
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 38,
    gap: 6,
  },
  searchInput: { flex: 1, fontSize: 14, color: '#000' },
  hiddenBtn: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: '#f0f0f0', alignItems: 'center', justifyContent: 'center',
  },
  hiddenBtnActive: { backgroundColor: '#FF950015' },
  newOrderBtn: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: '#007AFF', alignItems: 'center', justifyContent: 'center',
  },
  filterRow: { backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  chipList: { paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  paidFilterRow: {
    flexDirection: 'row', gap: 8,
    paddingHorizontal: 12, paddingBottom: 8,
  },
  paidChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14,
    borderWidth: 1, borderColor: '#34C759',
  },
  paidChipActive: { backgroundColor: '#34C759' },
  paidChipText: { fontSize: 12, fontWeight: '600', color: '#34C759' },
  unpaidChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14,
    borderWidth: 1, borderColor: '#FF3B30',
  },
  unpaidChipActive: { backgroundColor: '#FF3B30' },
  unpaidChipText: { fontSize: 12, fontWeight: '600', color: '#FF3B30' },
  chip: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
    backgroundColor: 'white', borderWidth: 1, borderColor: '#e0e0e0',
  },
  chipActive: { backgroundColor: '#007AFF', borderColor: '#007AFF' },
  chipText: { fontSize: 13, color: '#555', fontWeight: '500' },
  chipTextActive: { color: 'white' },
  orderRow: {
    flexDirection: 'row',
    backgroundColor: 'white',
    padding: 12,
    gap: 10,
    alignItems: 'center',
  },
  orderRowHidden: { opacity: 0.5 },
  orderRowLeft: { width: 44, alignItems: 'center' },
  orderId: { fontSize: 13, fontWeight: 'bold', color: '#007AFF' },
  orderDate: { fontSize: 11, color: '#999', marginTop: 2 },
  orderRowMid: { flex: 1 },
  customerName: { fontSize: 14, fontWeight: '600', color: '#1a1a1a' },
  orderAddress: { fontSize: 12, color: '#888', marginTop: 2 },
  orderRowRight: { alignItems: 'flex-end', gap: 4 },
  orderTotal: { fontSize: 13, fontWeight: 'bold', color: '#1a1a1a' },
  badge: {
    paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: 6, borderWidth: 1,
  },
  badgeText: { fontSize: 11, fontWeight: '600' },
  paidTag: { fontSize: 11, color: '#34C759', fontWeight: '600' },
  unpaidTag: { fontSize: 11, color: '#FF3B30' },
  separator: { height: 1, backgroundColor: '#f0f0f0' },
  emptyText: { fontSize: 15, color: '#aaa' },
});
