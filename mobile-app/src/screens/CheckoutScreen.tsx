import { colors, radius, shadow } from '../theme';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Modal,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../types/navigation';
import { useCart } from '../context/CartContext';
import { createOrder } from '../services/orderService';
import { useLanguage } from '../context/LanguageContext';
import { Ionicons } from '@expo/vector-icons';
import {
  CustomerAddress,
  Pin,
  addressService,
  formatPin,
  pinOf,
  pinsDiffer,
  toCoordinateString,
} from '../services/addressService';
import { AddressPinMap } from '../components/AddressPinMap';
import { AddressFormSheet } from '../components/AddressFormSheet';
import { getCurrentPin, openAppSettings } from '../utils/deviceLocation';

type Props = NativeStackScreenProps<RootStackParamList, 'Checkout'>;

/** Icon per address label, so the picker is scannable without reading. */
const LABEL_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  home: 'home',
  office: 'business',
  shop: 'storefront',
  warehouse: 'cube',
  other: 'location',
};

export const CheckoutScreen: React.FC<Props> = ({ navigation }) => {
  const { items, getCartTotal, clearCart } = useCart();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();

  // Cash-only business: the method is fixed, kept as a constant so the
  // existing option renderer and the success screen keep working unchanged.
  const paymentMethod = 'COD';

  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loadingAddresses, setLoadingAddresses] = useState(true);
  const [addressError, setAddressError] = useState<string | null>(null);

  /**
   * The pin this order will use. Seeded from the selected address and then
   * free to diverge — a customer standing at a gate the pin does not match
   * should be able to correct it for this order without a detour through the
   * address book.
   */
  const [pin, setPin] = useState<Pin | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<
    { message: string; canOpenSettings?: boolean } | null
  >(null);

  const [showPicker, setShowPicker] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [placing, setPlacing] = useState(false);

  const total = getCartTotal();
  const selected = addresses.find(a => a.id === selectedId) ?? null;
  const savedPin = pinOf(selected);
  // "Moved but not saved": what we hold differs from what the server holds.
  const pinMoved = pinsDiffer(pin, savedPin);

  // A customer with an empty address book gets the form opened for them once,
  // rather than staring at a checkout they cannot complete. Only once — if
  // they close it deliberately, respect that.
  const autoOpenedForm = useRef(false);

  const loadAddresses = useCallback(async () => {
    setLoadingAddresses(true);
    setAddressError(null);
    try {
      const list = await addressService.list();
      setAddresses(list);
      // The list arrives default-first, so [0] is the default when one exists.
      const preferred = list.find(a => a.is_default) ?? list[0] ?? null;
      setSelectedId(preferred?.id ?? null);
      setPin(pinOf(preferred));
      if (list.length === 0 && !autoOpenedForm.current) {
        autoOpenedForm.current = true;
        setShowForm(true);
      }
    } catch (error: any) {
      // Never silent: without an address there is no order, so the customer
      // has to know the load failed and be able to retry it.
      setAddressError(error?.message || 'Could not load your saved addresses.');
    } finally {
      setLoadingAddresses(false);
    }
  }, []);

  useEffect(() => {
    loadAddresses();
  }, [loadAddresses]);

  const selectAddress = (address: CustomerAddress) => {
    setSelectedId(address.id);
    // Switching address abandons any pin nudge — it belonged to the old one.
    setPin(pinOf(address));
    setLocationError(null);
    setShowPicker(false);
  };

  const handleUseCurrentLocation = async () => {
    setLocating(true);
    setLocationError(null);
    const result = await getCurrentPin();
    setLocating(false);
    if (result.ok) setPin(result.pin);
    else setLocationError({ message: result.message, canOpenSettings: result.canOpenSettings });
  };

  const handleSavedAddress = (saved: CustomerAddress) => {
    setShowForm(false);
    // Saving may have moved the default, so re-read rather than patching the
    // list by hand and letting two addresses both claim it.
    setAddresses(prev => {
      const others = prev
        .filter(a => a.id !== saved.id)
        .map(a => (saved.is_default ? { ...a, is_default: false } : a));
      return [saved, ...others];
    });
    setSelectedId(saved.id);
    setPin(pinOf(saved));
  };

  const handlePlaceOrder = async () => {
    if (!selected) {
      Alert.alert(
        t('error', 'Error'),
        'Add a delivery address before placing your order.',
      );
      setShowForm(true);
      return;
    }
    if (items.length === 0) {
      Alert.alert(t('error', 'Error'), t('error_cart_empty', 'Your cart is empty'));
      return;
    }

    setPlacing(true);
    try {
      /**
       * A moved pin is persisted to the address BEFORE the order is created.
       *
       * The order serializer copies shipping_latitude/longitude from the saved
       * address whenever address_id is present — anything the client sends
       * alongside it is overwritten. So sending the corrected pin on the order
       * would silently lose it. Writing it to the address first means the
       * snapshot the server takes is already the corrected one, and the
       * correction sticks for next time as a bonus.
       */
      if (pinMoved && pin) {
        try {
          const updated = await addressService.updatePin(selected.id, pin);
          setAddresses(prev => prev.map(a => (a.id === updated.id ? updated : a)));
        } catch (error: any) {
          Alert.alert(
            'Could not save the map pin',
            `${error?.message || 'The pin could not be saved.'}\n\n`
            + 'Your order has not been placed. Try again, or reset the pin to the saved one.',
          );
          return;
        }
      }

      const createdOrder = await createOrder({
        items: items.map(item => ({
          product_id: item.id,
          quantity: item.quantity,
          price: parseFloat(item.price),
        })),
        total_price: total,
        // The server copies the address text, parts, pin and label from this.
        address_id: selected.id,
        payment_method: 'COD',
        payment_number: null,
      });
      clearCart();

      navigation.replace('OrderSuccess', {
        orderId: createdOrder.id,
        total,
        paymentMethod,
      });
    } catch (error: any) {
      Alert.alert(t('error', 'Error'), error?.message || 'Failed to place order');
    } finally {
      setPlacing(false);
    }
  };

  /** Single, always-selected option — there is nothing else to pick. */
  const renderPaymentOption = (id: string, label: string, color: string) => (
    <View
      key={id}
      style={[styles.paymentOption, styles.selectedPaymentOption, { borderColor: color }]}
    >
      <View style={[styles.radio, { borderColor: color }]}>
        <View style={[styles.radioInner, { backgroundColor: color }]} />
      </View>
      <Text style={[styles.paymentLabel, { fontWeight: '700' }]}>{label}</Text>
    </View>
  );

  const renderAddressBody = () => {
    if (loadingAddresses) {
      return (
        <View style={styles.stateBox}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.stateText}>Loading your saved addresses…</Text>
        </View>
      );
    }

    if (addressError) {
      return (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle" size={18} color={colors.danger} />
          <View style={styles.flex}>
            <Text style={styles.errorText}>{addressError}</Text>
            <TouchableOpacity onPress={loadAddresses}>
              <Text style={styles.errorLink}>Try again</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    if (!selected) {
      return (
        <View style={styles.stateBox}>
          <Ionicons name="location-outline" size={30} color={colors.muted} />
          <Text style={styles.stateText}>
            You have no saved addresses yet. Add one to place this order.
          </Text>
          <TouchableOpacity style={styles.primaryOutlineButton} onPress={() => setShowForm(true)}>
            <Ionicons name="add" size={17} color={colors.primary} />
            <Text style={styles.primaryOutlineText}>Add delivery address</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <>
        <View style={styles.selectedCard}>
          <View style={styles.selectedIcon}>
            <Ionicons name={LABEL_ICONS[selected.label] ?? 'location'} size={20} color={colors.primary} />
          </View>
          <View style={styles.flex}>
            <View style={styles.selectedTitleRow}>
              <Text style={styles.selectedLabel}>{selected.display_label}</Text>
              {selected.is_default && (
                <View style={styles.defaultBadge}>
                  <Text style={styles.defaultBadgeText}>Default</Text>
                </View>
              )}
            </View>
            <Text style={styles.selectedAddress}>{selected.address}</Text>
            {/* Coordinates spelled out rather than only pinned on the map —
                customers read them back to support over the phone. */}
            <Text style={styles.coordinates}>
              {pin
                ? `Lat ${toCoordinateString(pin.latitude)}   Lng ${toCoordinateString(pin.longitude)}`
                : 'No map pin on this address'}
            </Text>
          </View>
        </View>

        <View style={styles.addressActions}>
          <TouchableOpacity style={styles.secondaryButton} onPress={() => setShowPicker(true)}>
            <Ionicons name="swap-horizontal" size={16} color={colors.primary} />
            <Text style={styles.secondaryButtonText}>Change address</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={() => setShowForm(true)}>
            <Ionicons name="add" size={16} color={colors.primary} />
            <Text style={styles.secondaryButtonText}>Add new address</Text>
          </TouchableOpacity>
        </View>
      </>
    );
  };

  return (
    <ScrollView style={styles.container}>
      {/* Order Summary */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('order_summary', 'Order Summary')}</Text>
        {items.map(item => (
          <View key={item.id} style={styles.itemRow}>
            <Text style={styles.itemText}>{item.quantity} × {item.name}</Text>
            <Text style={styles.itemPrice}>PKR {(parseFloat(item.price) * item.quantity).toFixed(2)}</Text>
          </View>
        ))}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>{t('cart_total', 'Total')}</Text>
          <Text style={styles.totalAmount}>PKR {total.toFixed(2)}</Text>
        </View>
      </View>

      {/* Shipping Address — chosen from the saved address book */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('shipping_address', 'Shipping Address')}</Text>
        {renderAddressBody()}
      </View>

      {/* Map location. Only meaningful once an address is chosen, since the pin
          belongs to that address. */}
      {!!selected && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Map Location</Text>
          <Text style={styles.sectionHint}>
            Drag the marker (or tap the map) to point the rider at your exact gate.
          </Text>

          <AddressPinMap pin={pin} onChange={setPin} style={styles.map} />

          <Text style={styles.pinValue}>
            {pin ? `Pin: ${formatPin(pin)}` : 'No pin set — the rider will use the address text only.'}
          </Text>

          {pinMoved && (
            <View style={styles.noticeBox}>
              <Ionicons name="information-circle" size={17} color={colors.warningText} />
              <Text style={styles.noticeText}>
                Pin moved. It is saved to “{selected.display_label}” when you place the order, so
                this order — and the next one — go to the new spot.
              </Text>
            </View>
          )}

          <View style={styles.pinActions}>
            <TouchableOpacity
              style={[styles.secondaryButton, locating && styles.buttonBusy]}
              onPress={handleUseCurrentLocation}
              disabled={locating}
            >
              {locating ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons name="locate" size={16} color={colors.primary} />
              )}
              <Text style={styles.secondaryButtonText}>
                {locating ? 'Finding you…' : 'Use Current Location'}
              </Text>
            </TouchableOpacity>

            {pinMoved && (
              <TouchableOpacity style={styles.resetButton} onPress={() => setPin(savedPin)}>
                <Ionicons name="refresh" size={15} color={colors.muted} />
                <Text style={styles.resetText}>Reset to saved</Text>
              </TouchableOpacity>
            )}
          </View>

          {!!locationError && (
            <View style={styles.noticeBox}>
              <Ionicons name="warning" size={17} color={colors.warningText} />
              <View style={styles.flex}>
                <Text style={styles.noticeText}>{locationError.message}</Text>
                {locationError.canOpenSettings && (
                  <TouchableOpacity onPress={openAppSettings}>
                    <Text style={styles.noticeLink}>Open Settings</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}
        </View>
      )}

      {/* Payment Method */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('payment_method', 'Payment Method')}</Text>

        {/* Cash only — nothing to choose */}
        {renderPaymentOption('COD', t('cod_label', 'Cash on Delivery'), colors.primary)}
        <Text style={styles.helperText}>
          {t('cod_only_note', 'Pay the rider in cash when your order arrives.')}
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.placeOrderButton, !selected && styles.disabledButton, placing && styles.buttonBusy]}
        onPress={handlePlaceOrder}
        disabled={placing || !selected}
      >
        {placing ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <Text style={[styles.placeOrderText, !selected && styles.placeOrderTextDisabled]}>
            {t('place_order', 'Place Order')}
          </Text>
        )}
      </TouchableOpacity>

      <View style={styles.spacer} />

      {/* Saved address picker */}
      <Modal
        visible={showPicker}
        animationType="slide"
        transparent
        onRequestClose={() => setShowPicker(false)}
      >
        <View style={styles.modalOverlay}>
          {/* A Modal is its own window: the stack's bottom inset does not reach it. */}
          <View style={[styles.modalCard, { paddingBottom: 24 + insets.bottom }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Choose an address</Text>
              <TouchableOpacity
                onPress={() => setShowPicker(false)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={24} color={colors.ink} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.pickerList}>
              {addresses.map(address => {
                const active = address.id === selectedId;
                return (
                  <TouchableOpacity
                    key={address.id}
                    style={[styles.pickerRow, active && styles.pickerRowActive]}
                    onPress={() => selectAddress(address)}
                  >
                    <Ionicons
                      name={LABEL_ICONS[address.label] ?? 'location'}
                      size={19}
                      color={active ? colors.primary : colors.muted}
                    />
                    <View style={styles.flex}>
                      <View style={styles.selectedTitleRow}>
                        <Text style={[styles.pickerLabel, active && styles.pickerLabelActive]}>
                          {address.display_label}
                        </Text>
                        {address.is_default && (
                          <View style={styles.defaultBadge}>
                            <Text style={styles.defaultBadgeText}>Default</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.pickerAddress}>{address.address}</Text>
                      {address.has_pin && (
                        <Text style={styles.pickerPin}>
                          <Ionicons name="location" size={11} color={colors.muted} /> pin saved
                        </Text>
                      )}
                    </View>
                    {active && <Ionicons name="checkmark-circle" size={20} color={colors.primary} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <TouchableOpacity
              style={styles.pickerAddRow}
              onPress={() => {
                setShowPicker(false);
                setShowForm(true);
              }}
            >
              <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
              <Text style={styles.pickerAddText}>Add new address</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Add-new form. Saving selects the new address for this checkout. */}
      <AddressFormSheet
        visible={showForm}
        initialPin={pin}
        onClose={() => setShowForm(false)}
        onSaved={handleSavedAddress}
        submitLabel="Save and use this address"
      />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    padding: 16,
  },
  flex: { flex: 1 },
  section: {
    backgroundColor: colors.surface,
    padding: 18,
    borderRadius: radius.xl - 4,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.line,
    ...shadow.card,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
    color: colors.ink,
  },
  sectionHint: {
    fontSize: 12,
    color: colors.muted,
    marginTop: -6,
    marginBottom: 12,
    lineHeight: 17,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  itemText: {
    fontSize: 14,
    color: colors.textSecondary,
    flex: 1,
    marginRight: 8,
  },
  itemPrice: {
    fontSize: 14,
    color: colors.ink,
    fontWeight: '600',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.ink,
  },
  totalAmount: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.ink,
  },

  // Address states
  stateBox: { alignItems: 'center', gap: 10, paddingVertical: 18 },
  stateText: { fontSize: 13, color: colors.muted, textAlign: 'center', lineHeight: 19 },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.dangerBg,
    borderWidth: 1,
    borderColor: colors.dangerLine,
  },
  errorText: { fontSize: 13, color: colors.danger, lineHeight: 18 },
  errorLink: { fontSize: 13, fontWeight: '700', color: colors.primaryDark, marginTop: 6 },

  // Selected address card
  selectedCard: {
    flexDirection: 'row',
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: colors.primaryTint,
  },
  selectedIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  selectedLabel: { fontSize: 15, fontWeight: '700', color: colors.ink, flexShrink: 1 },
  defaultBadge: {
    backgroundColor: colors.primary,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  defaultBadgeText: { fontSize: 12, fontWeight: '800', color: colors.white, letterSpacing: 0.3 },
  selectedAddress: { fontSize: 13, color: colors.textSecondary, lineHeight: 19, marginTop: 3 },
  coordinates: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 5,
    fontVariant: ['tabular-nums'],
  },
  addressActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },

  // Map
  map: { height: 220, borderRadius: 14, overflow: 'hidden' },
  pinValue: { fontSize: 13, color: colors.textSecondary, marginTop: 10, fontVariant: ['tabular-nums'] },
  pinActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginTop: 12 },
  noticeBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.warningBg,
    borderWidth: 1,
    borderColor: colors.warningLine,
  },
  noticeText: { flex: 1, fontSize: 12, color: colors.warningText, lineHeight: 18 },
  noticeLink: { fontSize: 13, fontWeight: '700', color: colors.primaryDark, marginTop: 6 },

  // Buttons
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primaryTint,
  },
  buttonBusy: { opacity: 0.7 },
  secondaryButtonText: { fontSize: 13, fontWeight: '700', color: colors.primaryDark },
  primaryOutlineButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: colors.primaryTint,
  },
  primaryOutlineText: { fontSize: 14, fontWeight: '700', color: colors.primaryDark },
  resetButton: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 12 },
  resetText: { fontSize: 13, color: colors.muted, fontWeight: '600' },

  // Picker modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: 24,
    paddingBottom: 34,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: colors.ink },
  pickerList: { flexGrow: 0 },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.surfaceTint,
    marginBottom: 10,
  },
  pickerRowActive: { borderColor: colors.primary, backgroundColor: colors.primaryTint },
  pickerLabel: { fontSize: 14, fontWeight: '700', color: colors.textSecondary },
  pickerLabelActive: { color: colors.primaryDark },
  pickerAddress: { fontSize: 12, color: colors.textSecondary, lineHeight: 17, marginTop: 2 },
  pickerPin: { fontSize: 12, color: colors.muted, marginTop: 4 },
  pickerAddRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 14,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  pickerAddText: { fontSize: 15, fontWeight: '700', color: colors.primary },

  // Payment
  paymentOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderWidth: 2,
    borderRadius: radius.lg,
    marginBottom: 10,
    backgroundColor: colors.surfaceTint,
  },
  selectedPaymentOption: {
    backgroundColor: colors.primaryTint,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  paymentLabel: {
    fontSize: 16,
    color: colors.ink,
  },
  helperText: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 6,
    lineHeight: 17,
  },
  placeOrderButton: {
    backgroundColor: colors.primary,
    height: 56,
    borderRadius: radius.md + 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 30,
    ...shadow.card,
  },
  // White on this pale blue would be unreadable, so the label darkens with it.
  disabledButton: {
    backgroundColor: colors.line,
  },
  placeOrderTextDisabled: {
    color: colors.muted,
  },
  placeOrderText: {
    color: colors.white,
    fontSize: 18,
    fontWeight: '800',
  },
  spacer: {
    height: 40,
  },
});
