import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, Keyboard, Platform,
} from 'react-native';
import { LoadingScreen } from '../../components/LoadingScreen';
import { KeyboardAwareScrollView } from '../../components/KeyboardAwareScrollView';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, fontSize, shadow, card, pagePadding } from '../../theme';
import { ErrorState, friendlyError } from '../../components/ui';
import { adminService, AdminCustomer, DeliveryBoy } from '../../services/adminService';
import {
  AddressFields, AddressParts, EMPTY_ADDRESS, splitAddress, validateAddress,
} from '../../components/AddressFields';
import { FieldLabel } from '../../components/FormField';

type CustomerMode = 'existing' | 'guest';

interface CartItem {
  product: { id: number; name: string; price: string };
  quantity: number;
}

/** A white card with a short bold title; every group of fields on this form uses one. */
const Section: React.FC<{
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  children: React.ReactNode;
}> = ({ title, icon, children }) => (
  <View style={styles.section}>
    <View style={styles.sectionHeader}>
      <View style={styles.sectionIcon}>
        <Ionicons name={icon} size={18} color={colors.primary} />
      </View>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
    {children}
  </View>
);

export const AdminCreateOrderScreen: React.FC = () => {
  const navigation = useNavigation();

  const [mode, setMode] = useState<CustomerMode>('existing');
  const [customers, setCustomers] = useState<AdminCustomer[]>([]);
  const [products, setProducts] = useState<{ id: number; name: string; price: string; is_active: boolean }[]>([]);
  const [deliveryBoys, setDeliveryBoys] = useState<DeliveryBoy[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [address, setAddress] = useState<AddressParts>(EMPTY_ADDRESS);
  const [addressErrors, setAddressErrors] = useState<Partial<Record<keyof AddressParts, string>>>({});
  // Cash-only business — no picker needed.
  const paymentMethod = 'COD';
  const [selectedRiderId, setSelectedRiderId] = useState<number | null>(null);
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  const loadData = useCallback(() => {
    setLoadError(null);
    setLoadingData(true);
    Promise.all([
      adminService.getCustomers(),
      adminService.getProducts(),
      adminService.getDeliveryBoys(),
    ]).then(([c, p, d]) => {
      setCustomers(c);
      setProducts(p.filter(pr => pr.is_active));
      setDeliveryBoys(d);
    }).catch((e: any) => {
      setLoadError(e?.message || 'Could not load customers, products and riders.');
    }).finally(() => setLoadingData(false));
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // The pinned Create Order bar steps aside while typing, so the keyboard does
  // not squeeze the form into a thin strip.
  useEffect(() => {
    const showSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardOpen(true));
    const hideSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardOpen(false));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  // Auto-fill address when customer selected. The customer list only carries the
  // composed line, so split it back into parts — a best-effort match beats making
  // staff retype an address that is already on file.
  useEffect(() => {
    if (selectedCustomerId) {
      const c = customers.find(c => c.id === selectedCustomerId);
      if (c?.address) {
        setAddress(splitAddress(c.address));
        setAddressErrors({});
      }
    }
  }, [selectedCustomerId, customers]);

  const changeAddress = (next: AddressParts) => {
    setAddress(next);
    // Only re-validate once errors are on screen, so typing never raises new ones.
    if (Object.keys(addressErrors).length) setAddressErrors(validateAddress(next));
  };

  const addToCart = (product: typeof products[0]) => {
    setCart(prev => {
      const existing = prev.find(c => c.product.id === product.id);
      if (existing) return prev.map(c => c.product.id === product.id ? { ...c, quantity: c.quantity + 1 } : c);
      return [...prev, { product, quantity: 1 }];
    });
  };

  const changeQty = (productId: number, delta: number) => {
    setCart(prev => prev.map(c => c.product.id === productId ? { ...c, quantity: c.quantity + delta } : c).filter(c => c.quantity > 0));
  };

  const total = cart.reduce((sum, c) => sum + parseFloat(c.product.price) * c.quantity, 0);

  const filteredCustomers = customerSearch
    ? customers.filter(c =>
        c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
        (c.phone && c.phone.includes(customerSearch)) ||
        (c.address && c.address.toLowerCase().includes(customerSearch.toLowerCase()))
      )
    : customers;

  const submit = async () => {
    if (cart.length === 0) { Alert.alert('Error', 'Add at least one product.'); return; }

    const addrErrors = validateAddress(address);
    if (Object.keys(addrErrors).length) {
      setAddressErrors(addrErrors);
      Alert.alert('Error', 'Complete the delivery address.');
      return;
    }
    setAddressErrors({});

    if (mode === 'guest' && !guestName.trim()) { Alert.alert('Error', 'Guest name is required.'); return; }

    // Parts, not a composed line: the backend rebuilds the address so an order
    // and a customer record are always formatted the same way.
    const payload: any = {
      house_number: address.house_number.trim(),
      portion: address.portion.trim() || undefined,
      block: address.block.trim() || undefined,
      area: address.area.trim(),
      payment_method: 'COD',
      assigned_delivery_boy: selectedRiderId || null,
      delivery_notes: deliveryNotes || undefined,
      status: 'Processing',
      items: cart.map(c => ({ product_id: c.product.id, quantity: c.quantity })),
    };

    if (mode === 'existing' && selectedCustomerId) {
      payload.user_id = selectedCustomerId;
    } else {
      payload.guest_name = guestName;
      payload.guest_phone = guestPhone || undefined;
    }

    setSaving(true);
    try {
      const created = await adminService.createOrder(payload);
      Alert.alert(
        created?.id ? `Order #${created.id} created` : 'Order created',
        'It is now in the orders list, ready to assign to a rider.',
        [{ text: 'Done', onPress: () => navigation.goBack() }],
      );
    } catch (e: any) {
      Alert.alert('Error', e?.message ? friendlyError(e.message) : 'Failed to create order.');
    } finally {
      setSaving(false);
    }
  };

  if (loadingData) {
    return (
      <LoadingScreen message="Loading data…" />
    );
  }

  if (loadError) {
    return (
      <View style={styles.container}>
        <ErrorState title="Could not load the order form" message={loadError} onRetry={loadData} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <KeyboardAwareScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        extraBottomSpace={24}
      >

        {/* Customer mode toggle */}
        <Section title="Customer" icon="person-outline">
          <View style={styles.modeRow}>
            {(['existing', 'guest'] as CustomerMode[]).map(m => (
              <TouchableOpacity
                key={m}
                style={[styles.modeBtn, mode === m && styles.modeBtnActive]}
                onPress={() => setMode(m)}
              >
                <Ionicons name={m === 'existing' ? 'person' : 'call'} size={16} color={mode === m ? colors.white : colors.ink} />
                <Text style={[styles.modeBtnText, mode === m && styles.modeBtnTextActive]}>
                  {m === 'existing' ? 'Registered User' : 'Guest / Call-in'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {mode === 'existing' ? (
            <View>
              <FieldLabel text="Pick a customer" required />
              <TextInput
                style={[styles.input, styles.searchInput]}
                placeholder="Search by name, phone, or address…"
                value={customerSearch}
                onChangeText={setCustomerSearch}
                placeholderTextColor={colors.muted}
              />
              <ScrollView style={styles.customerList} nestedScrollEnabled>
                {filteredCustomers.map(c => (
                  <TouchableOpacity
                    key={c.id}
                    style={[styles.customerItem, selectedCustomerId === c.id && styles.customerItemSelected]}
                    onPress={() => setSelectedCustomerId(c.id)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.customerItemName}>{c.name}</Text>
                      {!!c.phone && <Text style={styles.customerItemSub}>{c.phone}</Text>}
                      {!!c.address && <Text style={styles.customerItemSub} numberOfLines={1}>{c.address}</Text>}
                    </View>
                    {selectedCustomerId === c.id && (
                      <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
                    )}
                  </TouchableOpacity>
                ))}
                {filteredCustomers.length === 0 && (
                  <Text style={styles.emptyText}>No customers found</Text>
                )}
              </ScrollView>
            </View>
          ) : (
            <View style={styles.guestFields}>
              <View>
                <FieldLabel text="Customer name" required />
                <TextInput
                  style={styles.input}
                  placeholder="Who is the order for?"
                  value={guestName}
                  onChangeText={setGuestName}
                  placeholderTextColor={colors.muted}
                />
              </View>
              <View>
                <FieldLabel text="Phone number" />
                <TextInput
                  style={styles.input}
                  placeholder="03xx-xxxxxxx"
                  value={guestPhone}
                  onChangeText={setGuestPhone}
                  keyboardType="phone-pad"
                  placeholderTextColor={colors.muted}
                />
              </View>
            </View>
          )}
        </Section>

        {/* Address — outside the mode branches because a rider needs one either way */}
        <Section title="Delivery Address" icon="location-outline">
          <AddressFields
            value={address}
            onChange={changeAddress}
            errors={addressErrors}
            hint="This is what the rider sees on the delivery list."
          />
        </Section>

        {/* Products */}
        <Section title="Products" icon="cart-outline">
          <FieldLabel text="Pick at least one" required />
          {products.length === 0 && (
            <Text style={styles.emptyText}>No active products to order yet.</Text>
          )}
          <View style={styles.productGrid}>
            {products.map(p => {
              const inCart = cart.find(c => c.product.id === p.id);
              return (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.productCard, inCart && styles.productCardSelected]}
                  onPress={() => addToCart(p)}
                >
                  <Text style={styles.productName} numberOfLines={2}>{p.name}</Text>
                  <Text style={styles.productPrice}>PKR {parseFloat(p.price).toLocaleString()}</Text>
                  {inCart && <Text style={styles.inCartLabel}>×{inCart.quantity} added</Text>}
                </TouchableOpacity>
              );
            })}
          </View>

          {cart.length > 0 && (
            <View style={styles.cart}>
              <Text style={styles.cartTitle}>Cart</Text>
              {cart.map(({ product, quantity }) => (
                <View key={product.id} style={styles.cartRow}>
                  {/* Name and line price stack, so a long product name keeps
                      most of the row instead of what the stepper leaves. */}
                  <View style={styles.cartItemInfo}>
                    <Text style={styles.cartItemName} numberOfLines={2}>{product.name}</Text>
                    <Text style={styles.cartItemPrice}>
                      PKR {(parseFloat(product.price) * quantity).toLocaleString()}
                    </Text>
                  </View>
                  <View style={styles.qtyRow}>
                    <TouchableOpacity
                      style={styles.qtyBtn}
                      onPress={() => changeQty(product.id, -1)}
                      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                      accessibilityLabel={`Remove one ${product.name}`}
                    >
                      <Ionicons name="remove" size={18} color={colors.ink} />
                    </TouchableOpacity>
                    <Text style={styles.qtyText}>{quantity}</Text>
                    <TouchableOpacity
                      style={styles.qtyBtn}
                      onPress={() => changeQty(product.id, 1)}
                      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                      accessibilityLabel={`Add one ${product.name}`}
                    >
                      <Ionicons name="add" size={18} color={colors.ink} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
              <View style={styles.cartTotal}>
                <Text style={styles.cartTotalLabel}>Total</Text>
                <Text style={styles.cartTotalValue}>PKR {total.toLocaleString()}</Text>
              </View>
            </View>
          )}
        </Section>

        {/* Payment */}
        <Section title="Payment" icon="cash-outline">
          <View style={[styles.paymentBtn, styles.paymentBtnActive]}>
            <Ionicons name="checkmark-circle" size={18} color={colors.white} />
            <Text style={[styles.paymentBtnText, styles.paymentBtnTextActive]}>
              Cash on Delivery
            </Text>
          </View>
        </Section>

        {/* Rider */}
        <Section title="Rider" icon="bicycle-outline">
          <FieldLabel text="Assign rider" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.riderRow}>
              <TouchableOpacity
                style={[styles.riderChip, !selectedRiderId && styles.riderChipActive]}
                onPress={() => setSelectedRiderId(null)}
              >
                <Text style={[styles.riderChipText, !selectedRiderId && styles.riderChipTextActive]}>
                  Assign later
                </Text>
              </TouchableOpacity>
              {deliveryBoys.map(db => (
                <TouchableOpacity
                  key={db.id}
                  style={[styles.riderChip, selectedRiderId === db.id && styles.riderChipActive]}
                  onPress={() => setSelectedRiderId(db.id)}
                >
                  <View style={[styles.riderDot, { backgroundColor: db.is_available ? colors.success : colors.danger }]} />
                  <Text style={[styles.riderChipText, selectedRiderId === db.id && styles.riderChipTextActive]}>
                    {db.name}{db.is_available ? '' : ' · Unavailable'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </Section>

        {/* Note for the rider. Named for its audience rather than "Delivery
            notes", which read like something the customer might see — and the API
            no longer sends it to them, so the label should say so. */}
        <Section title="Note for the rider" icon="document-text-outline">
          <FieldLabel text="What should the rider know?" />
          <TextInput
            style={[styles.input, styles.textarea]}
            placeholder="Gate code 1234 · Call on arrival · Leave with the guard"
            value={deliveryNotes}
            onChangeText={setDeliveryNotes}
            multiline
            placeholderTextColor={colors.muted}
            maxLength={500}
          />
          <Text style={styles.fieldHint}>
            Shown only to the rider delivering this order. The customer never sees it.
          </Text>
        </Section>

      </KeyboardAwareScrollView>

      {/* Submit, pinned so it is always one tap away on this long form. */}
      {!keyboardOpen && (
        <View style={styles.footer}>
          <View style={styles.footerTotal}>
            <Text style={styles.footerLabel}>Total</Text>
            <Text style={styles.footerAmount} numberOfLines={1}>PKR {total.toLocaleString()}</Text>
          </View>
          <TouchableOpacity
            style={[styles.submitBtn, saving && styles.submitBtnDisabled]}
            onPress={submit}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel="Create order"
          >
            {saving ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={20} color={colors.white} />
                <Text style={styles.submitBtnText}>Create Order</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: pagePadding, paddingTop: 4 },

  section: { ...card, padding: 16, marginBottom: 12 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  sectionIcon: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center',
  },
  sectionTitle: { fontSize: fontSize.md, fontWeight: '800', color: colors.ink },

  modeRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  modeBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, height: 44, paddingHorizontal: 8, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface,
  },
  modeBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  modeBtnText: { flexShrink: 1, fontSize: fontSize.sm, color: colors.ink, fontWeight: '700' },
  modeBtnTextActive: { color: colors.white },

  input: {
    height: 48, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md,
    paddingHorizontal: 14, fontSize: fontSize.sm, color: colors.ink, backgroundColor: colors.surfaceTint,
  },
  searchInput: { marginBottom: 10 },
  textarea: { height: 96, paddingTop: 12, textAlignVertical: 'top' },
  fieldHint: { fontSize: fontSize.xs, color: colors.muted, marginTop: 8, lineHeight: 16 },

  customerList: { maxHeight: 240 },
  customerItem: {
    flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 56,
    paddingVertical: 10, paddingHorizontal: 12, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, marginBottom: 8,
  },
  customerItemSelected: { borderColor: colors.primary, backgroundColor: colors.primaryTint },
  customerItemName: { fontSize: fontSize.sm, fontWeight: '700', color: colors.ink },
  customerItemSub: { fontSize: fontSize.xs, color: colors.muted, marginTop: 2 },
  guestFields: { gap: 14 },

  productGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 },
  productCard: {
    width: '48%', minHeight: 80, borderRadius: radius.md, borderWidth: 1,
    borderColor: colors.line, padding: 12, backgroundColor: colors.surface,
  },
  productCardSelected: { borderColor: colors.primary, borderWidth: 2, backgroundColor: colors.primaryTint },
  productName: { fontSize: fontSize.sm, fontWeight: '700', color: colors.ink, marginBottom: 4 },
  productPrice: { fontSize: fontSize.sm, fontWeight: '800', color: colors.textSecondary },
  inCartLabel: { fontSize: fontSize.xs, color: colors.primaryDark, fontWeight: '800', marginTop: 4 },

  cart: {
    marginTop: 16, padding: 12, borderRadius: radius.md,
    backgroundColor: colors.surfaceTint, borderWidth: 1, borderColor: colors.line,
  },
  cartTitle: { fontSize: fontSize.sm, fontWeight: '800', color: colors.ink, marginBottom: 10 },
  cartRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 },
  cartItemInfo: { flex: 1 },
  cartItemName: { fontSize: fontSize.sm, color: colors.ink, fontWeight: '600' },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  qtyBtn: {
    width: 36, height: 36, borderRadius: 12,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line,
    alignItems: 'center', justifyContent: 'center',
  },
  qtyText: { fontSize: fontSize.md, fontWeight: '800', color: colors.ink, width: 28, textAlign: 'center' },
  cartItemPrice: { fontSize: fontSize.sm, fontWeight: '700', color: colors.textSecondary, marginTop: 2 },
  cartTotal: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 12, marginTop: 2,
  },
  cartTotalLabel: { fontSize: fontSize.md, fontWeight: '700', color: colors.ink },
  cartTotalValue: { fontSize: fontSize.lg, fontWeight: '800', color: colors.ink },

  paymentBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    height: 46, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface,
  },
  paymentBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  paymentBtnText: { fontSize: fontSize.sm, color: colors.ink, fontWeight: '700' },
  paymentBtnTextActive: { color: colors.white },

  riderRow: { flexDirection: 'row', gap: 8, paddingBottom: 4 },
  riderChip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    height: 40, paddingHorizontal: 16, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface,
  },
  riderChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  riderChipText: { fontSize: fontSize.sm, color: colors.ink, fontWeight: '700' },
  riderChipTextActive: { color: colors.white },
  riderDot: { width: 8, height: 8, borderRadius: 4 },

  footer: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    // The stack already keeps the system navigation bar's height clear below
    // this screen, so no extra bottom inset is added here.
    paddingHorizontal: pagePadding, paddingTop: 12, paddingBottom: 12,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    borderTopWidth: 1, borderColor: colors.line,
    ...shadow.card, shadowOffset: { width: 0, height: -6 },
  },
  footerTotal: { flexShrink: 1 },
  footerLabel: { fontSize: fontSize.xs, color: colors.muted, fontWeight: '700' },
  footerAmount: { fontSize: fontSize.lg, fontWeight: '800', color: colors.ink },
  submitBtn: {
    flex: 1, height: 54, borderRadius: radius.md, backgroundColor: colors.primary,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: colors.white, fontSize: fontSize.md, fontWeight: '800' },
  emptyText: { textAlign: 'center', color: colors.muted, paddingVertical: 12, fontSize: fontSize.sm },
});
