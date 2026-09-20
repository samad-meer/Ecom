import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
} from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { getDeliveryOrder, updateOrderStatus } from '../services/orderService';
import { useDialog } from '../components/AppDialog';
import { startRiderTracking } from '../services/locationService';
import { OrderLocationMap } from '../components/OrderLocationMap';
import { KeyboardAwareScrollView } from '../components/KeyboardAwareScrollView';
import { canWhatsApp, openWhatsApp } from '../utils/whatsapp';
import { callNumber, canCall } from '../utils/phone';

interface RouteParams {
  order: any;
}

type PaymentMode = 'none' | 'cash' | 'online';

const PAYMENT_OPTIONS: { key: PaymentMode; label: string; icon: string; color: string; bg: string }[] = [
  { key: 'none',   label: 'No Payment',    icon: 'remove-circle-outline', color: '#999',    bg: '#f5f5f5' },
  { key: 'cash',   label: 'Cash',          icon: 'cash-outline',          color: '#2ecc71', bg: '#eafaf1' },
  { key: 'online', label: 'Online / Transfer', icon: 'phone-portrait-outline', color: '#007AFF', bg: '#e8f0fe' },
];

export const DeliveryOrderDetailScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute();
  // The row the rider tapped is a SNAPSHOT. It cannot know the order has since
  // been delivered — by this rider a minute ago, or by the office — so every
  // lock below would be decided from stale data and the form would come up
  // fully editable on an order that is already closed. Render the snapshot for
  // an instant screen, then correct it from the server.
  const { order: snapshot } = route.params as RouteParams;
  const [order, setOrder] = useState<any>(snapshot);

  const reload = useCallback(async () => {
    try {
      const fresh = await getDeliveryOrder(snapshot.id);
      if (fresh?.id) setOrder(fresh);
    } catch {
      // Offline or the request failed. Keep showing the snapshot — the server
      // still refuses a second write, so the worst case is a wasted tap.
    }
  }, [snapshot.id]);

  useFocusEffect(useCallback(() => { void reload(); }, [reload]));

  // Submitting completes the delivery, and a completed delivery is final: the
  // server rejects every write to it, so the screen must not offer any. Orders
  // submitted under the older flow carry a non-Delivered status but are locked
  // just the same, which is why the timestamp — not the status — is the test.
  const isSubmitted = !!order.delivery_status_updated_at
    || order.delivery_status === 'Delivered'
    || order.status === 'Delivered';
  const totalBottles = order.items?.reduce((sum: number, item: any) => sum + item.quantity, 0) || 0;

  // The rider serializer sends a `customer` block — name, phone, balance —
  // built for exactly this screen. Fall back to the bare username for anything
  // served by an older build that predates it.
  const customerName: string = order.customer?.name || order.user || 'Customer';
  const customerPhone: string | null = order.customer?.phone_number ?? order.guest_phone ?? null;

  // Payment
  const initPaymentMode = (): PaymentMode => {
    if (order.is_paid && !order.cash_received) return 'online';
    if (order.cash_received) return 'cash';
    return 'none';
  };
  const [paymentMode, setPaymentMode] = useState<PaymentMode>(initPaymentMode);
  // What the rider actually asks for at the door: everything the customer owes,
  // not just today's bottles.
  //
  // `customer.account_balance` arrives owed-positive from the rider serializer —
  // that is its documented purpose. It does NOT include this order, because the
  // ledger charge only posts once the order reaches Delivered, so the doorstep
  // figure is the old balance PLUS today's total.
  //
  // Clamped at zero: a customer in credit is owed money, not asked for a
  // negative amount.
  const orderTotal = Number(order.total_price ?? 0);
  const previousDue = Number(order.customer?.account_balance ?? 0);
  const totalDue = Math.max(0, previousDue + orderTotal);

  // Pre-filled and editable. `cash_amount` is a DRF decimal STRING, so an order
  // with nothing collected sends "0.00" — truthy — and the old `||` chain never
  // fell through, pre-filling "0.00" so a rider typing 165 recorded PKR 0.00165.
  // Compare numerically instead, and select on focus so the first keystroke
  // replaces the figure rather than appending to it.
  const alreadyCollected = Number(order.cash_amount ?? 0);
  const [amount, setAmount] = useState(
    String(alreadyCollected > 0 ? alreadyCollected : totalDue || ''),
  );

  const { confirm, notify } = useDialog();
  const [notes, setNotes] = useState(order.delivery_notes || '');

  useEffect(() => {
    if (!isSubmitted) return;
    // Read-only from here, so this cannot clobber anything the rider is typing.
    setNotes(order.delivery_notes || '');
    const collected = Number(order.cash_amount ?? 0);
    if (collected > 0) setAmount(String(collected));
  }, [isSubmitted, order]);
  const [loading, setLoading] = useState(false);

  /**
   * Submitting completes the delivery and cannot be undone from the app, so it
   * is always confirmed first — with the payment spelled out, because that is
   * the part the office reconciles and the rider cannot come back and fix.
   */
  const confirmSubmit = async () => {
    const paymentLine =
      paymentMode === 'cash'   ? `Cash collected: PKR ${parseFloat(amount) || 0}`
      : paymentMode === 'online' ? `Paid online: PKR ${parseFloat(amount) || 0}`
      : 'No payment collected';

    const ok = await confirm({
      title: `Deliver order #${order.id}?`,
      message: `${paymentLine}

Nothing on this order can be changed afterwards — the office will have to correct it.`,
      confirmLabel: 'Yes, deliver',
      tone: 'success',
    });
    if (ok) void submitUpdate();
  };

  const submitUpdate = async () => {
    setLoading(true);
    try {
      // `delivery_status` is deliberately not sent: the server sets Delivered
      // itself, so the two can never disagree.
      const updateData = {
        number_of_bottles: totalBottles,
        delivery_notes: notes,
        cash_received: paymentMode === 'cash',
        cash_amount: (paymentMode === 'cash' || paymentMode === 'online') ? (parseFloat(amount) || 0) : 0,
        is_paid: paymentMode === 'online',
      };
      await updateOrderStatus(order.id, order.status, updateData);
      // In 'active_delivery' mode the rider's last open order is what keeps
      // tracking alive — closing it here should stop it now, not whenever the
      // app next happens to be resumed.
      void startRiderTracking();
      const recorded =
        paymentMode === 'none'
          ? 'No payment recorded.'
          : `${paymentMode === 'cash' ? 'Cash' : 'Online'} received: PKR ${parseFloat(amount) || 0}.`;
      await notify({
        title: `Order #${order.id} delivered`,
        message: `${recorded}

The office can see it now. You cannot change it from here.`,
        tone: 'success',
      });
      navigation.goBack();
    } catch (error: any) {
      void notify({
        title: 'Could not submit',
        message: error?.message || 'Failed to update order.',
        tone: 'destructive',
      });
      setLoading(false);
    }
  };

  return (
    <KeyboardAwareScrollView style={styles.container} extraBottomSpace={32}>
      {/* ── Address hero ─────────────────────────────────────────── */}
      <View style={styles.addressCard}>
        <View style={styles.addressIconWrap}>
          <Ionicons name="location" size={22} color="#fff" />
        </View>
        <View style={styles.addressBody}>
          <View style={styles.addressLabelRow}>
            <Text style={styles.addressLabel}>Delivery Address</Text>
            {!!order.shipping_label && (
              <View style={styles.labelChip}>
                <Text style={styles.labelChipText}>{order.shipping_label}</Text>
              </View>
            )}
          </View>
          <Text style={styles.addressText}>{order.shipping_address || '—'}</Text>
        </View>
      </View>

      {/* ── Map pin ───────────────────────────────────────────────
          A rider at the gate needs the pin, not the wording of the address, so
          the map and Navigate sit directly under the hero — above the order
          details they only read once they have arrived. */}
      <View style={styles.card}>
        <OrderLocationMap
          orderId={order.id}
          latitude={order.shipping_latitude}
          longitude={order.shipping_longitude}
          label={order.shipping_label}
          variant="rider"
        />
      </View>

      {/* ── Order summary ─────────────────────────────────────────── */}
      <View style={styles.card}>
        <View style={styles.orderHeaderRow}>
          <Text style={styles.orderId}>Order #{order.id}</Text>
          <Text style={styles.orderAmount}>PKR {order.total_price}</Text>
        </View>
        <Text style={styles.customerText}>
          <Ionicons name="person-outline" size={13} color="#999" /> {customerName}
        </Text>
      </View>

      {/* ── Contact ───────────────────────────────────────────────────
          A rider at a locked gate needs the number in one tap, and which app
          to use is not ours to decide: WhatsApp is free but the customer may
          not have it or may not be online, so the SIM is always offered too.
          Guest phone-in orders carry their number here as well. */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Customer</Text>
        <View style={styles.contactRow}>
          <View style={styles.contactBody}>
            <Text style={styles.contactName}>{customerName}</Text>
            <Text style={[styles.contactPhone, !customerPhone && styles.contactPhoneMissing]}>
              {customerPhone || 'No phone number on this order'}
            </Text>
          </View>
        </View>

        {canCall(customerPhone) || canWhatsApp(customerPhone) ? (
          <View style={styles.contactActions}>
            {canCall(customerPhone) && (
              <TouchableOpacity
                style={[styles.contactBtn, styles.callBtn]}
                onPress={() => callNumber(customerPhone)}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={`Call ${customerName}`}
              >
                <Ionicons name="call" size={17} color="#fff" />
                <Text style={styles.contactBtnText}>Call</Text>
              </TouchableOpacity>
            )}
            {canWhatsApp(customerPhone) && (
              <TouchableOpacity
                style={[styles.contactBtn, styles.waBtn]}
                onPress={() => openWhatsApp(
                  customerPhone,
                  `Hello ${customerName}, I am on my way with your order #${order.id}.`,
                )}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={`WhatsApp ${customerName}`}
              >
                <Ionicons name="logo-whatsapp" size={17} color="#fff" />
                <Text style={styles.contactBtnText}>WhatsApp</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <Text style={styles.contactHint}>
            Ask the office for a number if you cannot find the address.
          </Text>
        )}
      </View>

      {/* ── Products ─────────────────────────────────────────────── */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Products</Text>
        {order.items?.map((item: any, idx: number) => (
          <View key={idx} style={styles.productRow}>
            <Text style={styles.productText}>
              {item.quantity}× {item.product_details?.name || 'Unknown'}
            </Text>
            <Text style={styles.productPrice}>PKR {item.price}</Text>
          </View>
        ))}
        <View style={styles.divider} />
        <View style={styles.productRow}>
          <Text style={styles.totalLabel}>Total Bottles</Text>
          <Text style={styles.totalValue}>{totalBottles}</Text>
        </View>
      </View>

      {/* ── Delivery form ─────────────────────────────────────────── */}
      <View style={styles.formCard}>
        <Text style={styles.sectionTitle}>Delivery Details</Text>

        {/* Locked warning */}
        {isSubmitted ? (
          <View style={styles.warningBox}>
            <Text style={styles.warningIcon}>✅</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.warningTitle}>
                {order.delivery_status === 'Delivered' || order.status === 'Delivered'
                  ? 'Delivered'
                  : 'Already submitted'}
              </Text>
              <Text style={styles.warningText}>
                This delivery is complete. Nothing on it can be changed now —
                contact the office if something needs correcting.
              </Text>
            </View>
          </View>
        ) : null}

        {/* Delivery status. There is nothing to pick: submitting this form is
            what delivers the order, so the screen states the outcome instead of
            offering a choice that only ever had one right answer. */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Delivery Status</Text>
          <View style={styles.lockedStatus}>
            <Text style={styles.lockedStatusText}>
              {isSubmitted ? (order.delivery_status || 'Delivered') : 'Delivered on submit'}
            </Text>
          </View>
        </View>

        {/* Payment mode */}
        {!isSubmitted && (
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Payment Received</Text>
            <View style={styles.paymentRow}>
              {PAYMENT_OPTIONS.map((opt) => {
                const active = paymentMode === opt.key;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    style={[
                      styles.paymentOption,
                      active && { backgroundColor: opt.bg, borderColor: opt.color, borderWidth: 2 },
                    ]}
                    onPress={() => setPaymentMode(opt.key)}
                  >
                    <Ionicons name={opt.icon as any} size={20} color={active ? opt.color : '#aaa'} />
                    <Text style={[styles.paymentLabel, active && { color: opt.color, fontWeight: '700' }]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* Amount — shown for cash or online */}
        {!isSubmitted && paymentMode !== 'none' && (
          <View style={styles.inputGroup}>
            <Text style={styles.label}>
              {paymentMode === 'cash' ? 'Cash Amount (PKR)' : 'Transfer Amount (PKR)'}
            </Text>
            <TextInput
              style={styles.input}
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder="Enter amount"
              placeholderTextColor="#000"
              // Re-editing an amount replaces it rather than appending.
              selectTextOnFocus
            />
            {(previousDue !== 0 || orderTotal > 0) && (
              <View style={styles.dueBox}>
                <View style={styles.dueRow}>
                  <Text style={styles.dueLabel}>Previous balance</Text>
                  <Text style={styles.dueValue}>
                    {previousDue < 0
                      ? `PKR ${Math.abs(previousDue).toLocaleString('en-PK')} in credit`
                      : `PKR ${previousDue.toLocaleString('en-PK')}`}
                  </Text>
                </View>
                <View style={styles.dueRow}>
                  <Text style={styles.dueLabel}>This order</Text>
                  <Text style={styles.dueValue}>PKR {orderTotal.toLocaleString('en-PK')}</Text>
                </View>
                <View style={[styles.dueRow, styles.dueTotalRow]}>
                  <Text style={styles.dueTotalLabel}>Total due</Text>
                  <Text style={styles.dueTotalValue}>PKR {totalDue.toLocaleString('en-PK')}</Text>
                </View>
                {Number(amount || 0) !== totalDue && (
                  <TouchableOpacity
                    style={styles.fullAmountBtn}
                    onPress={() => setAmount(String(totalDue))}
                    accessibilityRole="button"
                    accessibilityLabel={`Reset to the full due amount, ${totalDue} rupees`}
                  >
                    <Text style={styles.fullAmountText}>Reset to full due</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        )}

        {/* Delivery note — shared with the office both ways: their instructions
            for this drop arrive here, and what the rider types goes back to
            them. The customer never sees either. */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Delivery note</Text>
          <Text style={styles.hint}>
            {isSubmitted
              ? 'This is what was recorded at the door.'
              : 'Instructions from the office appear here. Add what happened at the door — you cannot change it after submitting.'}
          </Text>
          <TextInput
            style={[styles.input, styles.textArea, isSubmitted && styles.inputReadOnly]}
            value={notes}
            onChangeText={setNotes}
            editable={!isSubmitted}
            placeholder="Left with the guard · Customer not home · Paid in cash"
            placeholderTextColor="#000"
            multiline
            numberOfLines={3}
            maxLength={500}
          />
          <Text style={styles.hintBelow}>Only you and the office can see this.</Text>
        </View>

        {/* No submit once delivered — the server rejects every write to a
            completed delivery, so offering the button would only produce an
            error the rider can do nothing about. */}
        {!isSubmitted && (
          <TouchableOpacity
            style={[
              styles.submitButton,
              styles.deliverButton,
              loading && styles.submitButtonDisabled,
            ]}
            onPress={confirmSubmit}
            disabled={loading}
          >
            {!loading && <Ionicons name="checkmark-circle" size={19} color="#fff" />}
            <Text style={styles.submitButtonText}>
              {loading ? 'Submitting…' : 'Mark as Delivered'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </KeyboardAwareScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f4f8' },

  // Address hero
  addressCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#007AFF',
    margin: 16,
    marginBottom: 8,
    borderRadius: 14,
    padding: 16,
    gap: 12,
    elevation: 3,
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  addressIconWrap: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center', alignItems: 'center',
    marginTop: 2,
  },
  addressBody: { flex: 1 },
  addressLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  addressLabel: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: 0.8 },
  labelChip: {
    backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 20,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  labelChipText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  addressText: { fontSize: 16, fontWeight: '700', color: '#fff', lineHeight: 22 },

  // Cards
  card: { backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 8, borderRadius: 12, padding: 16, elevation: 1 },
  formCard: { backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 24, borderRadius: 12, padding: 16, elevation: 1 },

  orderHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  orderId: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  orderAmount: { fontSize: 18, fontWeight: 'bold', color: '#2ecc71' },
  customerText: { fontSize: 13, color: '#888', marginTop: 2 },

  // ── Customer contact ──────────────────────────────────────────────────────
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  contactBody: { flex: 1 },
  contactName: { fontSize: 15, fontWeight: '700', color: '#1a2530' },
  // Tabular figures so a rider reading a number aloud does not lose their place.
  contactPhone: {
    fontSize: 15, color: '#374857', marginTop: 3,
    letterSpacing: 0.4, fontVariant: ['tabular-nums'],
  },
  contactPhoneMissing: { fontSize: 13, color: '#a0a8b0', letterSpacing: 0 },
  contactActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  contactBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 7, paddingVertical: 12, borderRadius: 11,
  },
  callBtn: { backgroundColor: '#0A84FF' },
  waBtn: { backgroundColor: '#25D366' },
  contactBtnText: { color: '#fff', fontSize: 14.5, fontWeight: '700' },
  contactHint: { fontSize: 12.5, color: '#8a929b', marginTop: 10, lineHeight: 17 },

  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 14 },

  productRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  productText: { fontSize: 14, color: '#444', flex: 1 },
  productPrice: { fontSize: 14, fontWeight: '600', color: '#333' },
  divider: { height: 1, backgroundColor: '#eee', marginVertical: 8 },
  totalLabel: { fontSize: 15, fontWeight: '600', color: '#333' },
  totalValue: { fontSize: 15, fontWeight: 'bold', color: '#007AFF' },

  inputGroup: { marginBottom: 18 },
  dueBox: {
    marginTop: 10, backgroundColor: '#f7f9fc', borderRadius: 10,
    borderWidth: 1, borderColor: '#e4e9ee', padding: 12, gap: 6,
  },
  dueRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dueLabel: { fontSize: 13, color: '#5b6672' },
  dueValue: { fontSize: 13, color: '#1a2530', fontWeight: '600' },
  dueTotalRow: { borderTopWidth: 1, borderTopColor: '#e4e9ee', paddingTop: 7, marginTop: 1 },
  dueTotalLabel: { fontSize: 14, color: '#1a2530', fontWeight: '700' },
  dueTotalValue: { fontSize: 15, color: '#0A84FF', fontWeight: '800' },
  fullAmountBtn: {
    alignSelf: 'flex-start', marginTop: 4,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
    backgroundColor: '#eaf2ff', borderWidth: 1, borderColor: '#b9d4ff',
  },
  fullAmountText: { fontSize: 13, fontWeight: '700', color: '#0A84FF' },
  label: { fontSize: 14, fontWeight: '600', color: '#444', marginBottom: 8 },
  hint: { fontSize: 12, color: '#8a929b', marginBottom: 8, lineHeight: 17 },
  hintBelow: { fontSize: 12, color: '#8a929b', marginTop: 8, lineHeight: 17 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 12, fontSize: 16, backgroundColor: '#fafafa', color: '#000' },
  textArea: { height: 80, textAlignVertical: 'top' },
  inputReadOnly: { backgroundColor: '#f0f0f0', color: '#000', borderColor: 'transparent' },

  // Payment options
  paymentRow: { flexDirection: 'row', gap: 8 },
  paymentOption: {
    flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12,
    borderWidth: 1, borderColor: '#ddd', backgroundColor: '#fafafa', gap: 6,
  },
  paymentLabel: { fontSize: 11, fontWeight: '600', color: '#888', textAlign: 'center' },

  lockedStatus: { backgroundColor: '#e9ecef', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#ced4da' },
  lockedStatusText: { fontSize: 15, color: '#495057', fontWeight: '600' },

  warningBox: {
    backgroundColor: '#fff8e1', borderWidth: 1, borderColor: '#ffc107',
    borderRadius: 10, padding: 12, marginBottom: 16, flexDirection: 'row', alignItems: 'flex-start', gap: 10,
  },
  warningIcon: { fontSize: 22 },
  warningTitle: { fontSize: 13, fontWeight: 'bold', color: '#856404', marginBottom: 2 },
  warningText: { fontSize: 12, color: '#856404', lineHeight: 17 },

  submitButton: {
    backgroundColor: '#007AFF', paddingVertical: 16, borderRadius: 10,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, marginTop: 4,
  },
  deliverButton: { backgroundColor: '#2ecc71' },
  submitButtonDisabled: { backgroundColor: '#a0c4ff' },
  submitButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});
