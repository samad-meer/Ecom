import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, StyleSheet, TextInput, RefreshControl, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, shadow } from '../theme';
import { useProducts } from '../hooks/useProducts';
import { ProductCard } from '../components/ProductCard';
import { RefillProductCard } from '../components/RefillProductCard';
import { LoadingScreen } from '../components/LoadingScreen';
import { Product } from '../types/product';
import { RootStackParamList } from '../types/navigation';
import { useLanguage } from '../context/LanguageContext';
import { useCart } from '../context/CartContext';
import { AuthContext } from '../context/AuthContext';
import { getOrders, Order } from '../services/orderService';
import { authService, getAuthToken } from '../services/authService';
import { friendlyError, StatusPill, orderStatusTone } from '../components/ui';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const money = (n: number) => n.toLocaleString('en-PK', { maximumFractionDigits: 0 });

const formatOrderTime = (dateStr: string) => {
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const isToday = d.toDateString() === now.toDateString();
    const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (isToday) return `Today, ${timeStr}`;
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + `, ${timeStr}`;
  } catch {
    return '';
  }
};

export const HomeScreen: React.FC = () => {
  const { products, categories, selectedCategory, setSelectedCategory, loading, error, refetch } = useProducts();
  const [searchQuery, setSearchQuery] = useState('');
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { t } = useLanguage();
  const { user } = useContext(AuthContext);
  const { items, addToCart, updateQuantity, getCartCount, getCartTotal } = useCart();

  const [orders, setOrders] = useState<Order[]>([]);
  // Owed-positive. Null until the server has been asked: a stale or guessed
  // figure here would tell a customer they are settled when they are not.
  const [owed, setOwed] = useState<number | null>(null);

  const fetchOrdersAndBalance = useCallback(async () => {
    try {
      const data = await getOrders();
      if (Array.isArray(data)) setOrders(data);
    } catch {
      // No history is fine: the usual order simply does not appear.
    }
    try {
      const token = await getAuthToken();
      if (!token) return;
      const profile = await authService.getProfile(token);
      const stored = Number(profile?.account_balance);
      // The stored balance is credit-positive, so what is owed is its negative.
      if (profile?.account_balance != null && Number.isFinite(stored)) setOwed(-stored);
    } catch {
      setOwed(null);
    }
  }, []);

  // Re-read on every visit, so active orders, "your usual" and the balance are never a day old.
  useFocusEffect(useCallback(() => {
    fetchOrdersAndBalance();
  }, [fetchOrdersAndBalance]));

  // Active / in-progress orders placed by the customer
  const activeOrders = useMemo(() => {
    return orders
      .filter((o) => o.status !== 'Delivered' && o.status !== 'Cancelled')
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [orders]);

  const latestActiveOrder = activeOrders[0] || null;

  const activeOrderSummary = useMemo(() => {
    if (!latestActiveOrder || !Array.isArray(latestActiveOrder.items) || latestActiveOrder.items.length === 0) {
      return 'Order Placed';
    }
    const first = latestActiveOrder.items[0];
    const firstName = first.product_details?.name || 'Item';
    const text = `${first.quantity} × ${firstName}`;
    return latestActiveOrder.items.length > 1 ? `${text} + ${latestActiveOrder.items.length - 1} more` : text;
  }, [latestActiveOrder]);

  const quantityOf = (productId: number) => items.find((i) => i.id === productId)?.quantity ?? 0;

  const isRefillProduct = (p: Product) => {
    return Boolean(p.is_refill || (p.name && /refill/i.test(p.name)));
  };

  const filteredProducts = useMemo(() => {
    const list = products.filter((product) =>
      product.name.toLowerCase().includes(searchQuery.toLowerCase()),
    );
    // Refill products (e.g. 19L Refill) are ALWAYS pinned to the top
    return list.slice().sort((a, b) => {
      const aRefill = isRefillProduct(a) ? 1 : 0;
      const bRefill = isRefillProduct(b) ? 1 : 0;
      if (aRefill !== bRefill) return bRefill - aRefill;
      return 0;
    });
  }, [products, searchQuery]);

  // The customer's last real order, limited to what is still on sale.
  const usual = useMemo(() => {
    const past = orders
      .filter((o) => o.status !== 'Cancelled' && Array.isArray(o.items) && o.items.length > 0)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
    if (!past) return null;
    const lines = past.items
      .map((line) => ({
        product: products.find((p) => p.id === line.product_details?.id && p.is_active),
        quantity: line.quantity,
      }))
      .filter((l): l is { product: Product; quantity: number } => !!l.product);
    if (lines.length === 0) return null;
    const total = lines.reduce((sum, l) => sum + Number(l.product.price) * l.quantity, 0);
    const first = lines[0];
    const summary = `${first.quantity} × ${first.product.name}` + (lines.length > 1 ? ` + ${lines.length - 1} more` : '');
    return { lines, total, summary, day: DAYS[new Date(past.created_at).getDay()] };
  }, [orders, products]);

  const orderAgain = () => {
    if (!usual) return;
    usual.lines.forEach((l) => addToCart(l.product, l.quantity));
    navigation.navigate('Cart');
  };

  const handleProductPress = (product: Product) => {
    navigation.navigate('ProductDetail', { product });
  };

  const handleQuantity = (product: Product, quantity: number) => updateQuantity(product.id, quantity);

  if (loading && products.length === 0) {
    return <LoadingScreen message="Loading products…" />;
  }

  // A failed refresh must not throw away a catalogue that is already on screen
  // (and the cart bar with it): the full-screen error is only for a first load
  // that brought nothing. Otherwise the failure shows as a banner in the list.
  if (error && products.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>{friendlyError(error)}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={refetch}>
          <Text style={styles.retryText}>{t('tap_retry', 'Tap to retry')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const name = user?.first_name || user?.username || '';
  const cartCount = getCartCount();
  const [pullRefreshing, setPullRefreshing] = useState(false);

  const handlePullRefresh = useCallback(async () => {
    setPullRefreshing(true);
    try {
      await Promise.allSettled([refetch(), fetchOrdersAndBalance()]);
    } finally {
      setPullRefreshing(false);
    }
  }, [refetch, fetchOrdersAndBalance]);

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.headerRightRow}>
          <TouchableOpacity
            style={styles.headerRefreshBtn}
            onPress={handlePullRefresh}
            disabled={pullRefreshing}
            accessibilityRole="button"
            accessibilityLabel="Refresh products and orders"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            {pullRefreshing ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Ionicons name="refresh" size={20} color={colors.ink} />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => navigation.navigate('Cart')}
            style={styles.headerCartButton}
            accessibilityLabel="Open cart"
          >
            <Ionicons name="cart-outline" size={22} color={colors.ink} />
            {cartCount > 0 && (
              <View style={styles.headerBadge}>
                <Text style={styles.headerBadgeText}>{cartCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      ),
    });
  }, [navigation, handlePullRefresh, pullRefreshing, cartCount]);

  const header = (
    <View>
      <View style={styles.greetingRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{(name[0] || 'C').toUpperCase()}</Text>
        </View>
        <View style={styles.greetingText}>
          <Text style={styles.greetingSmall}>Assalam o Alaikum</Text>
          <Text style={styles.greeting} numberOfLines={1}>{name ? `Hi, ${name}` : 'Welcome'}</Text>
        </View>
        <TouchableOpacity
          style={styles.greetingRefreshBtn}
          onPress={handlePullRefresh}
          disabled={pullRefreshing}
          accessibilityRole="button"
          accessibilityLabel="Refresh page"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          {pullRefreshing ? (
            <ActivityIndicator size="small" color={colors.primaryDark} />
          ) : (
            <>
              <Ionicons name="refresh" size={15} color={colors.primaryDark} />
              <Text style={styles.greetingRefreshText}>Refresh</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {!!error && (
        <View style={styles.errorBanner}>
          <Ionicons name="cloud-offline-outline" size={18} color={colors.danger} />
          <View style={styles.flex}>
            <Text style={styles.errorBannerText}>{friendlyError(error)}</Text>
            <TouchableOpacity onPress={refetch} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.errorBannerLink}>{t('tap_retry', 'Tap to retry')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── Active Order Banner (shown on top when an order is placed) ── */}
      {latestActiveOrder && (
        <TouchableOpacity
          style={styles.activeOrderCard}
          onPress={() => (navigation as any).navigate('Orders')}
          activeOpacity={0.9}
          accessibilityRole="button"
          accessibilityLabel={`Active order number ${latestActiveOrder.id}`}
        >
          <View style={styles.activeOrderCircleBig} />
          <View style={styles.activeOrderDropWrap}>
            <Ionicons
              name={latestActiveOrder.status === 'Shipped' ? 'bicycle' : 'receipt-outline'}
              size={54}
              color="rgba(255, 255, 255, 0.12)"
            />
          </View>

          <View style={styles.activeOrderHeader}>
            <View style={styles.activeOrderBadge}>
              <View style={styles.activeOrderDot} />
              <Text style={styles.activeOrderBadgeText}>
                ORDER PLACED · #{latestActiveOrder.id}
              </Text>
            </View>
            <StatusPill
              label={t(`status_${latestActiveOrder.status.toLowerCase()}`, latestActiveOrder.status)}
              tone={orderStatusTone(latestActiveOrder.status)}
            />
          </View>

          <Text style={styles.activeOrderSummary} numberOfLines={2}>
            {activeOrderSummary}
          </Text>

          <View style={styles.activeOrderMetaRow}>
            <Ionicons name="time-outline" size={14} color="rgba(255, 255, 255, 0.85)" />
            <Text style={styles.activeOrderSub}>
              PKR {money(latestActiveOrder.total_price)} · {formatOrderTime(latestActiveOrder.created_at)}
            </Text>
          </View>

          {activeOrders.length > 1 && (
            <Text style={styles.activeOrderExtra}>
              +{activeOrders.length - 1} more active order{activeOrders.length > 2 ? 's' : ''}
            </Text>
          )}

          <View style={styles.activeOrderFooter}>
            <View style={styles.activeOrderBtn}>
              <Text style={styles.activeOrderBtnText}>View Details & Track</Text>
              <Ionicons name="arrow-forward" size={16} color={colors.ink} />
            </View>
          </View>
        </TouchableOpacity>
      )}

      {/* Only when there is no active order and the cart is empty: adding a whole order on top of a half-built
          cart would double the quantities. */}
      {!latestActiveOrder && usual && cartCount === 0 && (
        <View style={styles.usualCard}>
          <View style={styles.usualCircleBig} />
          <View style={styles.usualDropWrap}>
            <Ionicons name="water" size={54} color={colors.white} />
          </View>
          <Text style={styles.usualLabel}>YOUR USUAL</Text>
          <Text style={styles.usualSummary} numberOfLines={2}>{usual.summary}</Text>
          <Text style={styles.usualSub}>PKR {money(usual.total)} · last ordered {usual.day}</Text>
          <TouchableOpacity style={styles.usualBtn} onPress={orderAgain} accessibilityLabel="Order again">
            <Text style={styles.usualBtnText}>Order again</Text>
            <Ionicons name="arrow-forward" size={18} color={colors.primary} />
          </TouchableOpacity>
        </View>
      )}

      {owed != null && (
        <View style={[styles.balanceTile, owed > 0 ? styles.balanceDue : styles.balanceOk]}>
          <View style={styles.balanceBody}>
            <Text style={[styles.balanceLabel, owed > 0 ? { color: colors.warningText } : { color: colors.mintText }]}>BALANCE</Text>
            <Text style={styles.balanceValue}>
              {owed > 0 ? `PKR ${money(owed)} due` : owed < 0 ? `PKR ${money(-owed)} in credit` : 'PKR 0'}
            </Text>
          </View>
          {owed <= 0 && (
            <View style={styles.balanceChip}>
              <Ionicons name="checkmark" size={15} color={colors.success} />
              <Text style={styles.balanceChipText}>All settled</Text>
            </View>
          )}
        </View>
      )}

      <View style={styles.searchBox}>
        <Ionicons name="search" size={18} color={colors.muted} />
        <TextInput
          style={styles.searchInput}
          placeholder={t('search_placeholder', 'Search products...')}
          placeholderTextColor={colors.muted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        <TouchableOpacity
          style={[styles.chip, selectedCategory === undefined && styles.chipActive]}
          onPress={() => setSelectedCategory(undefined)}
        >
          <Text style={[styles.chipText, selectedCategory === undefined && styles.chipTextActive]}>{t('category_all', 'All')}</Text>
        </TouchableOpacity>
        {categories.map((cat) => {
          const active = selectedCategory === cat.id;
          return (
            <TouchableOpacity
              key={cat.id}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => setSelectedCategory(active ? undefined : cat.id)}
            >
              <Ionicons name={(cat.icon as any) || 'pricetag'} size={16} color={active ? colors.white : colors.ink} style={{ marginRight: 5 }} />
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{t(`category_${cat.slug}`, cat.name)}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={filteredProducts}
        renderItem={({ item }) => {
          if (isRefillProduct(item)) {
            return (
              <RefillProductCard
                product={item}
                quantity={quantityOf(item.id)}
                onPress={handleProductPress}
                onAdd={(p) => addToCart(p, 1)}
                onChangeQuantity={handleQuantity}
              />
            );
          }
          return (
            <ProductCard
              product={item}
              quantity={quantityOf(item.id)}
              onPress={handleProductPress}
              onAdd={(p) => addToCart(p, 1)}
              onChangeQuantity={handleQuantity}
            />
          );
        }}
        keyExtractor={(item) => item.id.toString()}
        ListHeaderComponent={header}
        contentContainerStyle={[styles.listContent, cartCount > 0 && { paddingBottom: 92 }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={loading || pullRefreshing} onRefresh={handlePullRefresh} colors={[colors.primary]} tintColor={colors.primary} />}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Ionicons name="water-outline" size={36} color={colors.disabled} />
            <Text style={styles.emptyText}>{t('no_products_found', 'No products found.')}</Text>
            {searchQuery ? (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Text style={styles.emptyLink}>Clear search</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        }
      />

      {cartCount > 0 && (
        <TouchableOpacity style={styles.cartBar} onPress={() => navigation.navigate('Cart')} activeOpacity={0.9} accessibilityLabel="View cart">
          <Text style={styles.cartBarText} numberOfLines={1}>{cartCount} {cartCount === 1 ? 'item' : 'items'} · PKR {money(getCartTotal())}</Text>
          <View style={styles.cartBarRight}>
            <Text style={styles.cartBarAction}>View cart</Text>
            <Ionicons name="arrow-forward" size={18} color={colors.sun} />
          </View>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  listContent: { paddingHorizontal: 20, paddingBottom: 24 },

  greetingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 4, paddingBottom: 16 },
  avatar: {
    width: 46, height: 46, borderRadius: radius.md, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: colors.white, fontSize: 19, fontWeight: '800' },
  greetingText: { flex: 1 },
  greetingSmall: { fontSize: 13, color: colors.muted },
  greeting: { fontSize: 24, fontWeight: '800', color: colors.ink, letterSpacing: -0.3 },

  greetingRefreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryTint,
    borderWidth: 1,
    borderColor: colors.primarySoft,
  },
  greetingRefreshText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.primaryDark,
  },

  headerRightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 14,
    gap: 8,
  },
  headerRefreshBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCartButton: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  headerBadge: {
    position: 'absolute',
    right: -5,
    top: -5,
    backgroundColor: colors.danger,
    borderRadius: 12,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
  },
  headerBadgeText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '800',
  },

  activeOrderCard: {
    backgroundColor: colors.ink,
    borderRadius: radius.xl,
    padding: 20,
    marginBottom: 12,
    overflow: 'hidden',
    ...shadow.card,
  },
  activeOrderCircleBig: {
    position: 'absolute',
    right: -30,
    top: -40,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  activeOrderDropWrap: {
    position: 'absolute',
    right: 20,
    top: 22,
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeOrderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  activeOrderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 210, 63, 0.18)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  activeOrderDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.sun,
  },
  activeOrderBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: colors.sun,
  },
  activeOrderSummary: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.white,
    marginTop: 2,
    marginRight: 80,
    lineHeight: 28,
  },
  activeOrderMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  activeOrderSub: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.88)',
    fontWeight: '600',
  },
  activeOrderExtra: {
    fontSize: 12,
    color: colors.sun,
    fontWeight: '700',
    marginTop: 6,
  },
  activeOrderFooter: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  activeOrderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    height: 42,
    paddingHorizontal: 18,
    borderRadius: radius.md,
    backgroundColor: colors.sun,
  },
  activeOrderBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.ink,
  },

  usualCard: {
    backgroundColor: colors.primary, borderRadius: radius.xl, padding: 20, marginBottom: 12,
    overflow: 'hidden', ...shadow.card,
  },
  usualCircleBig: {
    position: 'absolute', right: -40, top: -50, width: 170, height: 170, borderRadius: 85,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  usualDropWrap: {
    position: 'absolute', right: 22, top: 20, width: 84, height: 84, borderRadius: 42,
    backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center',
  },
  usualLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 1, color: 'rgba(255,255,255,0.92)' },
  usualSummary: { fontSize: 26, fontWeight: '800', color: colors.white, marginTop: 4, marginRight: 100, lineHeight: 31 },
  usualSub: { fontSize: 14, color: 'rgba(255,255,255,0.92)', marginTop: 4 },
  usualBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start',
    marginTop: 16, height: 44, paddingHorizontal: 20, borderRadius: radius.md, backgroundColor: colors.white,
  },
  usualBtnText: { fontSize: 15, fontWeight: '800', color: colors.primary },

  balanceTile: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: radius.xl - 4, paddingVertical: 14, paddingHorizontal: 18, marginBottom: 12,
  },
  balanceBody: { flexShrink: 1, marginRight: 8 },
  balanceOk: { backgroundColor: colors.mint },
  balanceDue: { backgroundColor: colors.warningBg, borderWidth: 1, borderColor: colors.warningLine },
  balanceLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 0.8 },
  balanceValue: { fontSize: 20, fontWeight: '800', color: colors.ink, marginTop: 1 },
  balanceChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.white,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill,
  },
  balanceChipText: { fontSize: 13, fontWeight: '800', color: colors.success },

  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10, height: 50, paddingHorizontal: 16,
    backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line,
  },
  searchInput: { flex: 1, fontSize: 16, color: colors.ink },

  chips: { paddingVertical: 12, gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, height: 40, borderRadius: radius.pill,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 14, fontWeight: '700', color: colors.ink },
  chipTextActive: { color: colors.white },

  cartBar: {
    position: 'absolute', left: 20, right: 20, bottom: 12, height: 56, borderRadius: radius.lg,
    backgroundColor: colors.ink, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, ...shadow.float,
  },
  cartBarText: { flex: 1, color: colors.white, fontSize: 15, fontWeight: '800', marginRight: 8 },
  cartBarRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cartBarAction: { color: colors.sun, fontSize: 15, fontWeight: '800' },

  flex: { flex: 1 },
  errorBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12, marginBottom: 12,
    borderRadius: radius.md, backgroundColor: colors.dangerBg, borderWidth: 1, borderColor: colors.dangerLine,
  },
  errorBannerText: { fontSize: 14, color: colors.danger, lineHeight: 20 },
  errorBannerLink: { fontSize: 14, fontWeight: '800', color: colors.primaryDark, marginTop: 6 },

  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: colors.bg },
  errorText: { color: colors.danger, fontSize: 16, marginBottom: 12, textAlign: 'center' },
  retryBtn: { paddingHorizontal: 22, height: 44, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  retryText: { color: colors.white, fontWeight: '800', fontSize: 15 },
  emptyBox: { alignItems: 'center', paddingTop: 36, gap: 8 },
  emptyText: { fontSize: 15, color: colors.muted },
  emptyLink: { fontSize: 15, fontWeight: '800', color: colors.primary },
});
