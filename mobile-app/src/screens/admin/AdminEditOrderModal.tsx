import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, Modal, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, fontSize, card, pagePadding } from '../../theme';
import { friendlyError } from '../../components/ui';
import { adminService, AdminOrder, DeliveryBoy } from '../../services/adminService';
import {
  AddressFields, AddressParts, EMPTY_ADDRESS, splitAddress, validateAddress,
} from '../../components/AddressFields';
import { FieldLabel } from '../../components/FormField';

interface Props {
  visible: boolean;
  order: AdminOrder;
  deliveryBoys: DeliveryBoy[];
  onClose: () => void;
  onSaved: (updatedOrder: AdminOrder) => void;
}

interface CartItem {
  id: number;
  name: string;
  price: number;
  quantity: number;
}

export const AdminEditOrderModal: React.FC<Props> = ({
  visible,
  order,
  deliveryBoys,
  onClose,
  onSaved,
}) => {
  const [products, setProducts] = useState<{ id: number; name: string; price: string; is_active: boolean }[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);

  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [address, setAddress] = useState<AddressParts>(EMPTY_ADDRESS);
  const [addressErrors, setAddressErrors] = useState<Partial<Record<keyof AddressParts, string>>>({});
  const [selectedRiderId, setSelectedRiderId] = useState<number | null>(null);
  const [showToRider, setShowToRider] = useState(true);
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [showProductPicker, setShowProductPicker] = useState(false);

  useEffect(() => {
    if (visible) {
      setGuestName(order.guest_name || '');
      setGuestPhone(order.guest_phone || '');
      if (order.shipping_address) {
        setAddress(splitAddress(order.shipping_address));
      } else {
        setAddress(EMPTY_ADDRESS);
      }
      setAddressErrors({});
      setSelectedRiderId(order.assigned_delivery_boy);
      setShowToRider(order.show_to_rider !== false);
      setDeliveryNotes(order.delivery_notes || '');

      const initialCart: CartItem[] = (order.items || []).map((it) => ({
        id: it.product_details?.id ?? it.id,
        name: it.product_details?.name ?? `Product #${it.id}`,
        price: Number(it.product_details?.price ?? it.price),
        quantity: it.quantity,
      }));
      setCart(initialCart);

      setLoadingProducts(true);
      adminService.getProducts()
        .then((all) => setProducts(all.filter((p) => p.is_active)))
        .catch(() => null)
        .finally(() => setLoadingProducts(false));
    }
  }, [visible, order]);

  const addToCart = (product: { id: number; name: string; price: string }) => {
    const unitPrice = parseFloat(product.price) || 0;
    setCart((prev) => {
      const existing = prev.find((c) => c.id === product.id);
      if (existing) {
        return prev.map((c) => (c.id === product.id ? { ...c, quantity: c.quantity + 1 } : c));
      }
      return [...prev, { id: product.id, name: product.name, price: unitPrice, quantity: 1 }];
    });
    setShowProductPicker(false);
  };

  const changeQty = (productId: number, delta: number) => {
    setCart((prev) =>
      prev
        .map((c) => (c.id === productId ? { ...c, quantity: c.quantity + delta } : c))
        .filter((c) => c.quantity > 0)
    );
  };

  const removeItem = (productId: number) => {
    setCart((prev) => prev.filter((c) => c.id !== productId));
  };

  const total = cart.reduce((sum, c) => sum + c.price * c.quantity, 0);

  const save = async () => {
    if (cart.length === 0) {
      Alert.alert('Error', 'An order must contain at least one product.');
      return;
    }

    const addrErrors = validateAddress(address);
    if (Object.keys(addrErrors).length) {
      setAddressErrors(addrErrors);
      Alert.alert('Error', 'Please complete the required address fields (House and Area).');
      return;
    }
    setAddressErrors({});

    const payload: any = {
      items: cart.map((c) => ({ product_id: c.id, quantity: c.quantity })),
      house_number: address.house_number.trim(),
      portion: address.portion.trim() || undefined,
      block: address.block.trim() || undefined,
      area: address.area.trim(),
      assigned_delivery_boy: selectedRiderId,
      show_to_rider: showToRider,
      delivery_notes: deliveryNotes || '',
    };

    if (order.guest_name !== null && order.guest_name !== undefined) {
      payload.guest_name = guestName.trim();
      payload.guest_phone = guestPhone.trim();
    }

    setSaving(true);
    try {
      const updated = await adminService.updateOrder(order.id, payload);
      Alert.alert('Success', `Order #${order.id} updated successfully.`);
      onSaved(updated);
      onClose();
    } catch (e: any) {
      Alert.alert('Error', e?.message ? friendlyError(e.message) : 'Failed to update order.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={24} color={colors.ink} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Edit Order #{order.id}</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {/* Customer section */}
          {order.guest_name !== null && order.guest_name !== undefined ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Customer Details (Call-in / Guest)</Text>
              <FieldLabel text="Customer Name" required />
              <TextInput
                style={styles.input}
                value={guestName}
                onChangeText={setGuestName}
                placeholder="e.g. Ali Ahmed"
              />
              <FieldLabel text="Phone Number" />
              <TextInput
                style={styles.input}
                value={guestPhone}
                onChangeText={setGuestPhone}
                placeholder="03xx-xxxxxxx"
                keyboardType="phone-pad"
              />
            </View>
          ) : (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Customer</Text>
              <Text style={styles.customerAccountText}>
                {order.customer_name} <Text style={styles.badgeText}>(Registered Customer)</Text>
              </Text>
              {order.customer_phone && <Text style={styles.metaText}>{order.customer_phone}</Text>}
            </View>
          )}

          {/* Delivery Address */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Delivery Address</Text>
            <AddressFields value={address} onChange={setAddress} errors={addressErrors} />
          </View>

          {/* Items & Quantities */}
          <View style={styles.section}>
            <View style={styles.rowBetween}>
              <Text style={styles.sectionTitle}>Order Items</Text>
              <TouchableOpacity
                style={styles.addProductBtn}
                onPress={() => setShowProductPicker(!showProductPicker)}
              >
                <Ionicons name={showProductPicker ? 'chevron-up' : 'add-circle'} size={18} color={colors.primary} />
                <Text style={styles.addProductBtnText}>{showProductPicker ? 'Close' : 'Add Product'}</Text>
              </TouchableOpacity>
            </View>

            {/* Product Picker Drawer */}
            {showProductPicker && (
              <View style={styles.pickerBox}>
                <Text style={styles.pickerTitle}>Choose a product to add:</Text>
                {loadingProducts ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  products.map((p) => (
                    <TouchableOpacity
                      key={p.id}
                      style={styles.pickerItem}
                      onPress={() => addToCart(p)}
                    >
                      <Text style={styles.pickerItemName}>{p.name}</Text>
                      <Text style={styles.pickerItemPrice}>PKR {Number(p.price).toLocaleString()}</Text>
                    </TouchableOpacity>
                  ))
                )}
              </View>
            )}

            {/* Cart Items */}
            {cart.map((item) => (
              <View key={item.id} style={styles.itemRow}>
                <View style={styles.itemInfo}>
                  <Text style={styles.itemName}>{item.name}</Text>
                  <Text style={styles.itemSub}>PKR {Number(item.price).toLocaleString()} each</Text>
                </View>
                <View style={styles.qtyControls}>
                  <TouchableOpacity style={styles.qtyBtn} onPress={() => changeQty(item.id, -1)}>
                    <Ionicons name="remove" size={16} color={colors.ink} />
                  </TouchableOpacity>
                  <Text style={styles.qtyText}>{item.quantity}</Text>
                  <TouchableOpacity style={styles.qtyBtn} onPress={() => changeQty(item.id, 1)}>
                    <Ionicons name="add" size={16} color={colors.ink} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.deleteBtn} onPress={() => removeItem(item.id)}>
                    <Ionicons name="trash-outline" size={18} color={colors.danger} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}

            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Updated Total</Text>
              <Text style={styles.totalValue}>PKR {total.toLocaleString()}</Text>
            </View>
          </View>

          {/* Rider Assignment */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Assign Rider</Text>
            <View style={styles.riderGrid}>
              <TouchableOpacity
                style={[styles.riderPill, selectedRiderId === null && styles.riderPillActive]}
                onPress={() => setSelectedRiderId(null)}
              >
                <Text style={[styles.riderPillText, selectedRiderId === null && styles.riderPillTextActive]}>
                  Unassigned
                </Text>
              </TouchableOpacity>
              {deliveryBoys.map((db) => (
                <TouchableOpacity
                  key={db.id}
                  style={[styles.riderPill, selectedRiderId === db.id && styles.riderPillActive]}
                  onPress={() => setSelectedRiderId(db.id)}
                >
                  <Text style={[styles.riderPillText, selectedRiderId === db.id && styles.riderPillTextActive]}>
                    {db.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Show to rider toggle */}
            <View style={styles.riderVisibilityRow}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons
                    name={showToRider ? 'eye' : 'eye-off'}
                    size={18}
                    color={showToRider ? colors.primary : colors.muted}
                  />
                  <Text style={styles.riderVisibilityTitle}>Show to Rider</Text>
                </View>
                <Text style={styles.riderVisibilitySubtitle}>
                  {showToRider
                    ? 'Visible in the assigned rider’s mobile app'
                    : 'Hidden from the rider’s mobile app'}
                </Text>
              </View>
              <Switch
                value={showToRider}
                onValueChange={setShowToRider}
                trackColor={{ false: colors.line, true: colors.primary }}
                thumbColor={colors.white}
              />
            </View>
          </View>

          {/* Delivery Notes */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Delivery Notes</Text>
            <TextInput
              style={styles.notesInput}
              value={deliveryNotes}
              onChangeText={setDeliveryNotes}
              placeholder="Instructions for rider (e.g. Call before coming, gate code...)"
              multiline
              numberOfLines={3}
            />
          </View>
        </ScrollView>

        {/* Footer Actions */}
        <View style={styles.footer}>
          <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={saving}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={saving}>
            {saving ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <Text style={styles.saveBtnText}>Save Changes</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: pagePadding, paddingVertical: 14,
    borderBottomWidth: 1, borderColor: colors.line, backgroundColor: colors.surface,
  },
  closeBtn: { padding: 4 },
  headerTitle: { fontSize: fontSize.md, fontWeight: '800', color: colors.ink },
  scroll: { flex: 1 },
  scrollContent: { padding: pagePadding, gap: 14, paddingBottom: 40 },
  section: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: 16, borderWidth: 1, borderColor: colors.line, gap: 10,
  },
  sectionTitle: { fontSize: fontSize.sm, fontWeight: '800', color: colors.ink },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  customerAccountText: { fontSize: fontSize.md, fontWeight: '700', color: colors.ink },
  badgeText: { fontSize: fontSize.xs, color: colors.primary, fontWeight: '600' },
  metaText: { fontSize: fontSize.sm, color: colors.muted },
  input: {
    borderWidth: 1, borderColor: colors.line, borderRadius: radius.md,
    backgroundColor: colors.surfaceTint, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: fontSize.sm, color: colors.ink,
  },
  addProductBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addProductBtnText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.primary },
  pickerBox: {
    backgroundColor: colors.surfaceTint, borderRadius: radius.md,
    padding: 12, gap: 8, borderWidth: 1, borderColor: colors.primaryTint,
  },
  pickerTitle: { fontSize: fontSize.xs, fontWeight: '700', color: colors.muted },
  pickerItem: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 8, borderBottomWidth: 1, borderColor: colors.line,
  },
  pickerItemName: { fontSize: fontSize.sm, fontWeight: '600', color: colors.ink },
  pickerItemPrice: { fontSize: fontSize.xs, fontWeight: '700', color: colors.primary },
  itemRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 10, borderBottomWidth: 1, borderColor: colors.line,
  },
  itemInfo: { flex: 1, paddingRight: 8 },
  itemName: { fontSize: fontSize.sm, fontWeight: '700', color: colors.ink },
  itemSub: { fontSize: fontSize.xs, color: colors.muted, marginTop: 2 },
  qtyControls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyBtn: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: colors.line,
    alignItems: 'center', justifyContent: 'center',
  },
  qtyText: { fontSize: fontSize.md, fontWeight: '800', color: colors.ink, minWidth: 20, textAlign: 'center' },
  deleteBtn: { padding: 4, marginLeft: 4 },
  totalRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 10, marginTop: 4,
  },
  totalLabel: { fontSize: fontSize.sm, fontWeight: '700', color: colors.muted },
  totalValue: { fontSize: fontSize.lg, fontWeight: '900', color: colors.primary },
  riderGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  riderPill: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface,
  },
  riderPillActive: { backgroundColor: colors.primaryTint, borderColor: colors.primary },
  riderPillText: { fontSize: fontSize.xs, fontWeight: '700', color: colors.ink },
  riderPillTextActive: { color: colors.primaryDark },
  riderVisibilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  riderVisibilityTitle: { fontSize: fontSize.sm, fontWeight: '700', color: colors.ink },
  riderVisibilitySubtitle: { fontSize: fontSize.xs, color: colors.muted, marginTop: 2 },
  notesInput: {
    borderWidth: 1, borderColor: colors.line, borderRadius: radius.md,
    backgroundColor: colors.surfaceTint, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: fontSize.sm, color: colors.ink, minHeight: 70, textAlignVertical: 'top',
  },
  footer: {
    flexDirection: 'row', gap: 12, padding: pagePadding,
    backgroundColor: colors.surface, borderTopWidth: 1, borderColor: colors.line,
  },
  cancelBtn: {
    flex: 1, height: 48, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line,
    alignItems: 'center', justifyContent: 'center',
  },
  cancelBtnText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.ink },
  saveBtn: {
    flex: 2, height: 48, borderRadius: radius.md, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  saveBtnText: { fontSize: fontSize.sm, fontWeight: '800', color: colors.white },
});
