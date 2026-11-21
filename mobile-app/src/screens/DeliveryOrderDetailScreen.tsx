import { colors, radius, shadow } from '../theme';
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Keyboard, Platform,
} from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { getDeliveryOrder, updateOrderStatus } from '../services/orderService';
import { useDialog } from '../components/AppDialog';
import { startRiderTracking } from '../services/locationService';
import { OrderLocationMap } from '../components/OrderLocationMap';
import { KeyboardAwareScrollView } from '../components/KeyboardAwareScrollView';
import { canWhatsApp, openWhatsApp, orderDispatchMessage } from '../utils/whatsapp';
import { callNumber, canCall } from '../utils/phone';

interface RouteParams {
  order: any;
}

type PaymentMode = 'none' | 'cash' | 'online';

const PAYMENT_OPTIONS: { key: PaymentMode; label: string; sub: string; icon: string; color: string; bg: string }[] = [
  { key: 'cash',   label: 'Cash',   sub: 'received',          icon: 'cash-outline',            color: colors.success, bg: colors.successBg },
  { key: 'online', label: 'Online', sub: 'office will check', icon: 'phone-portrait-outline',  color: colors.primaryDark, bg: colors.primaryTint },
  { key: 'none',   label: 'Credit', sub: 'unpaid',            icon: 'alert-circle-outline',    color: colors.danger, bg: colors.dangerBg },
];

const CLAIM_LABELS: Record<string, string> = {
  waiting: 'Waiting for the office',
  confirmed: 'Confirmed by the office',
  not_found: 'Not found in the bank',
};

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

  // Delivery settings set by admin: whether rider can call or WhatsApp customer
  const riderCanCall = order.delivery_settings?.rider_can_call ?? true;
  const riderCanWhatsApp = order.delivery_settings?.rider_can_whatsapp ?? true;

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
  // Already left out of account_balance, so nobody collects it a second time.
  const onlineWaiting = Number(order.customer?.online_waiting ?? 0);

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

  // The pinned footer steps aside while the keypad is up. Whether the window
  // resizes for the keypad varies by device, and a footer riding above it would
  // sit on top of the field being typed into. Dragging the form dismisses the
  // keypad (see KeyboardAwareScrollView), which brings the footer straight back.
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setKeyboardOpen(true),
    );
    const hide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardOpen(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  /**
   * Submitting completes the delivery and cannot be undone from the app, so it
   * is always confirmed first — with the payment spelled out, because that is
   * the part the office reconciles and the rider cannot come back and fix.
   */
  const confirmSubmit = async () => {
    const paymentLine =
      paymentMode === 'cash'   ? `Cash collected: PKR ${parseFloat(amount) || 0}`
      : paymentMode === 'online' ? `Online payment for the office to check: PKR ${parseFloat(amount) || 0}`
      : `Credit (Unpaid): PKR ${orderTotal.toLocaleString('en-PK')} added to balance`;

    const defaultDeliveryNote = 'Once marked as delivered, this order is locked. Any changes or corrections must be handled by the office.';
    const confirmationNote = order.delivery_settings?.delivery_confirmation_note?.trim() || defaultDeliveryNote;

    const ok = await confirm({
      title: `Deliver order #${order.id}?`,
      message: `${paymentLine}\n\n${confirmationNote}`,
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
          ? `Delivered on Credit (unpaid). PKR ${orderTotal.toLocaleString('en-PK')} added to customer balance.`
          : paymentMode === 'cash'
            ? `Cash received: PKR ${parseFloat(amount) || 0}.`
            : `Online payment noted: PKR ${parseFloat(amount) || 0}. The office will check it against the bank.`;
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
    <View style={styles.screen}>
    <KeyboardAwareScrollView style={styles.container} extraBottomSpace={32}>
      {/* ── Order summary (Customer name and order details on top) ──── */}
      <View style={styles.card}>
        <View style={styles.orderHeaderRow}>
          <Text style={styles.orderId}>Order #{order.id}</Text>
          <Text style={styles.orderAmount}>PKR {order.total_price}</Text>
        </View>
        <Text style={styles.customerText}>
          <Ionicons name="person-outline" size={13} color={colors.primary} /> {customerName}
        </Text>
      </View>

      {/* ── Contact ───────────────────────────────────────────────────
          Shows Call and WhatsApp buttons according to admin settings.
          If disabled by admin, contact options are hidden. */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Customer</Text>
        <View style={styles.contactRow}>
          <View style={styles.contactBody}>
            <Text style={styles.contactName}>{customerName}</Text>
            <Text style={[styles.contactPhone, (!customerPhone || (!riderCanCall && !riderCanWhatsApp)) && styles.contactPhoneMissing]}>
              {!riderCanCall && !riderCanWhatsApp
                ? 'Contact details hidden by admin'
                : customerPhone || 'No phone number on this order'}
            </Text>
          </View>
        </View>

        {(canCall(customerPhone) && riderCanCall) || (canWhatsApp(customerPhone) && riderCanWhatsApp) ? (
          <View style={styles.contactActions}>
            {canCall(customerPhone) && riderCanCall && (
              <TouchableOpacity
                style={[styles.contactBtn, styles.callBtn]}
                onPress={() => callNumber(customerPhone)}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={`Call ${customerName}`}
              >
                <Ionicons name="call" size={17} color={colors.white} />
                <Text style={styles.contactBtnText}>Call</Text>
              </TouchableOpacity>
            )}
            {canWhatsApp(customerPhone) && riderCanWhatsApp && (
              <TouchableOpacity
                style={[styles.contactBtn, styles.waBtn]}
                onPress={() => openWhatsApp(
                  customerPhone,
                  orderDispatchMessage({
                    customerName,
                    orderId: order.id,
                    items: order.items,
                    orderTotal,
                    previousBalance: previousDue,
                    isPaid: order.is_paid,
                    shippingAddress: order.shipping_address,
                  }),
                )}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={`WhatsApp ${customerName}`}
              >
                <Ionicons name="logo-whatsapp" size={17} color={colors.ink} />
                <Text style={[styles.contactBtnText, styles.waText]}>WhatsApp</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : !riderCanCall && !riderCanWhatsApp ? (
          <Text style={styles.contactHint}>
            Customer calling and WhatsApp options are disabled by admin. Ask the office if you cannot find the address.
          </Text>
        ) : (
          <Text style={styles.contactHint}>
            Ask the office for a number if you cannot find the address.
          </Text>
        )}
      </View>

      {/* ── Products (Order Details) ────────────────────────────────── */}
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

      {/* ── Address hero ─────────────────────────────────────────── */}
      <View style={styles.addressCard}>
        <View style={styles.addressIconWrap}>
          <Ionicons name="location" size={22} color={colors.white} />
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

      {/* ── Map pin ─────────────────────────────────────────────── */}
      <View style={styles.card}>
        <OrderLocationMap
          orderId={order.id}
          latitude={order.shipping_latitude}
          longitude={order.shipping_longitude}
          label={order.shipping_label}
          variant="rider"
        />
      </View>

      {/* ── Delivery form ─────────────────────────────────────────── */}
      <View style={styles.formCard}>
        <Text style={styles.sectionTitle}>Delivery Details</Text>

        {/* The one number a rider needs at the door, shown large. */}
        {!isSubmitted && (
          <View style={styles.collectTile}>
            <View style={styles.collectCircle} />
            <Text style={styles.collectLabel}>COLLECT</Text>
            <Text style={styles.collectAmount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
              PKR {totalDue.toLocaleString('en-PK')}
            </Text>
            <Text style={styles.collectSub}>
              {previousDue > 0
                ? `This order ${orderTotal.toLocaleString('en-PK')} + earlier ${previousDue.toLocaleString('en-PK')}`
                : previousDue < 0
                  ? `This order ${orderTotal.toLocaleString('en-PK')} − credit ${Math.abs(previousDue).toLocaleString('en-PK')}`
                  : `This order ${orderTotal.toLocaleString('en-PK')}`}
            </Text>
          </View>
        )}

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
            <Text style={styles.label}>How did they pay?</Text>
            <View style={styles.paymentRow}>
              {PAYMENT_OPTIONS.map((opt) => {
                const active = paymentMode === opt.key;
                const isCredit = opt.key === 'none';
                return (
                  <TouchableOpacity
                    key={opt.key}
                    style={[
                      styles.paymentOption,
                      isCredit && !active && styles.creditOptionInactive,
                      active && { backgroundColor: opt.bg, borderColor: opt.color, borderWidth: 2 },
                    ]}
                    onPress={() => setPaymentMode(opt.key)}
                  >
                    <Ionicons
                      name={opt.icon as any}
                      size={24}
                      color={active ? opt.color : isCredit ? colors.danger : colors.muted}
                    />
                    <Text
                      style={[
                        styles.paymentLabel,
                        isCredit && !active && { color: colors.danger },
                        active && { color: opt.color, fontWeight: '800' },
                      ]}
                    >
                      {opt.label}
                    </Text>
                    <Text
                      style={[
                        styles.paymentSub,
                        isCredit && { color: colors.danger, opacity: active ? 0.9 : 0.7 },
                      ]}
                    >
                      {opt.sub}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {!isSubmitted && paymentMode === 'none' && (
              <View style={styles.creditNoticeBox}>
                <Ionicons name="alert-circle" size={18} color={colors.danger} />
                <Text style={styles.creditNoticeText}>
                  Delivering on Credit: PKR {orderTotal.toLocaleString('en-PK')} will be added to the customer's outstanding balance.
                </Text>
              </View>
            )}
          </View>
        )}

        {/* An Online tap is only a report until the office sees the money. */}
        {isSubmitted && !!order.online_claim && (
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Online payment</Text>
            <View style={styles.lockedStatus}>
              <Text style={styles.lockedStatusText}>
                PKR {Number(order.online_claim.amount).toLocaleString('en-PK')}
                {' · '}
                {CLAIM_LABELS[order.online_claim.status] ?? order.online_claim.status}
              </Text>
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
              placeholderTextColor={colors.muted}
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
                {onlineWaiting > 0 && (
                  <View style={styles.dueRow}>
                    <Text style={styles.dueLabel}>Online, office checking (not included)</Text>
                    <Text style={styles.dueValue}>PKR {onlineWaiting.toLocaleString('en-PK')}</Text>
                  </View>
                )}
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
            placeholderTextColor={colors.muted}
            multiline
            numberOfLines={3}
            maxLength={500}
          />
          <Text style={styles.hintBelow}>Only you and the office can see this.</Text>
        </View>

        {/* No submit once delivered — the server rejects every write to a
            completed delivery, so offering the button would only produce an
            error the rider can do nothing about. */}
      </View>
    </KeyboardAwareScrollView>

    {/* Pinned to the bottom, always in reach of a thumb. */}
    {!isSubmitted && !keyboardOpen && (
      <View style={styles.footer}>
        <TouchableOpacity
          style={[
            styles.submitButton,
            styles.deliverButton,
            loading && styles.submitButtonDisabled,
          ]}
          onPress={confirmSubmit}
          disabled={loading}
        >
          {!loading && <Ionicons name="checkmark-circle" size={22} color={colors.white} />}
          <Text style={styles.submitButtonText}>
            {loading ? 'Submitting…' : 'Mark as Delivered'}
          </Text>
        </TouchableOpacity>
      </View>
    )}
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, backgroundColor: colors.bg },

  collectTile: {
    backgroundColor: colors.primary, borderRadius: radius.xl, padding: 20, marginBottom: 18,
    overflow: 'hidden', ...shadow.card,
  },
  collectCircle: {
    position: 'absolute', right: -40, top: -50, width: 170, height: 170, borderRadius: 85,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  collectLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 1.2, color: 'rgba(255,255,255,0.92)' },
  collectAmount: { fontSize: 42, fontWeight: '800', color: colors.white, letterSpacing: -1, marginTop: 2 },
  collectSub: { fontSize: 14, color: 'rgba(255,255,255,0.92)', marginTop: 2 },

  footer: {
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    ...shadow.float,
  },

  // Address hero
  addressCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.primary,
    margin: 16,
    marginBottom: 10,
    borderRadius: radius.xl,
    padding: 18,
    gap: 12,
    ...shadow.card,
  },
  addressIconWrap: {
    width: 40, height: 40, borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center', alignItems: 'center',
    marginTop: 2,
  },
  addressBody: { flex: 1 },
  addressLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  addressLabel: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.92)', textTransform: 'uppercase', letterSpacing: 0.8 },
  // Solid white: white text on a see-through white chip over blue is only ~3:1.
  labelChip: {
    backgroundColor: colors.white, borderRadius: 24,
    paddingHorizontal: 10, paddingVertical: 3, flexShrink: 1,
  },
  labelChipText: { fontSize: 12, fontWeight: '800', color: colors.primaryDark },
  addressText: { fontSize: 20, fontWeight: '800', color: colors.white, lineHeight: 26 },

  // Cards
  card: {
    backgroundColor: colors.surface, marginHorizontal: 16, marginBottom: 10, borderRadius: radius.xl - 4, padding: 18,
    borderWidth: 1, borderColor: colors.line, ...shadow.card,
  },
  formCard: {
    backgroundColor: colors.surface, marginHorizontal: 16, marginBottom: 24, borderRadius: radius.xl - 4, padding: 18,
    borderWidth: 1, borderColor: colors.line, ...shadow.card,
  },

  orderHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  orderId: { fontSize: 18, fontWeight: 'bold', color: colors.ink },
  orderAmount: { fontSize: 20, fontWeight: '800', color: colors.ink },
  customerText: { fontSize: 13, color: colors.muted, marginTop: 2 },

  // ── Customer contact ──────────────────────────────────────────────────────
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  contactBody: { flex: 1 },
  contactName: { fontSize: 15, fontWeight: '700', color: colors.ink },
  // Tabular figures so a rider reading a number aloud does not lose their place.
  contactPhone: {
    fontSize: 15, color: colors.textSecondary, marginTop: 3,
    letterSpacing: 0.4, fontVariant: ['tabular-nums'],
  },
  contactPhoneMissing: { fontSize: 13, color: colors.muted, letterSpacing: 0 },
  contactActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  contactBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 7, paddingVertical: 14, borderRadius: radius.md,
  },
  callBtn: { backgroundColor: colors.primary },
  waBtn: { backgroundColor: colors.whatsapp },
  waText: { color: colors.ink },
  contactBtnText: { color: colors.white, fontSize: 15, fontWeight: '800' },
  contactHint: { fontSize: 12.5, color: colors.muted, marginTop: 10, lineHeight: 17 },

  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: colors.ink, marginBottom: 14 },

  productRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  productText: { fontSize: 14, color: colors.textSecondary, flex: 1 },
  productPrice: { fontSize: 14, fontWeight: '600', color: colors.ink },
  divider: { height: 1, backgroundColor: colors.lineSoft, marginVertical: 8 },
  totalLabel: { fontSize: 15, fontWeight: '600', color: colors.ink },
  totalValue: { fontSize: 15, fontWeight: 'bold', color: colors.primary },

  inputGroup: { marginBottom: 18 },
  dueBox: {
    marginTop: 10, backgroundColor: colors.bg, borderRadius: 14,
    borderWidth: 1, borderColor: colors.line, padding: 12, gap: 6,
  },
  dueRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dueLabel: { fontSize: 13, color: colors.textSecondary, flex: 1, marginRight: 8 },
  dueValue: { fontSize: 13, color: colors.ink, fontWeight: '600' },
  dueTotalRow: { borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 7, marginTop: 1 },
  dueTotalLabel: { fontSize: 14, color: colors.ink, fontWeight: '700' },
  dueTotalValue: { fontSize: 15, color: colors.primaryDark, fontWeight: '800' },
  fullAmountBtn: {
    alignSelf: 'flex-start', marginTop: 4,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12,
    backgroundColor: colors.primaryTint, borderWidth: 1, borderColor: colors.primarySoft,
  },
  fullAmountText: { fontSize: 13, fontWeight: '700', color: colors.primaryDark },
  label: { fontSize: 14, fontWeight: '600', color: colors.textSecondary, marginBottom: 8 },
  hint: { fontSize: 12, color: colors.muted, marginBottom: 8, lineHeight: 17 },
  hintBelow: { fontSize: 12, color: colors.muted, marginTop: 8, lineHeight: 17 },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 12, fontSize: 16, backgroundColor: colors.surfaceTint, color: colors.ink },
  textArea: { height: 80, textAlignVertical: 'top' },
  inputReadOnly: { backgroundColor: colors.lineSoft, color: colors.ink, borderColor: 'transparent' },

  // Payment options
  paymentRow: { flexDirection: 'row', gap: 8 },
  paymentOption: {
    flex: 1, alignItems: 'center', paddingVertical: 16, paddingHorizontal: 4, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surfaceTint, gap: 4,
  },
  creditOptionInactive: {
    borderColor: colors.dangerLine,
    backgroundColor: '#FFF8F8',
  },
  paymentLabel: { fontSize: 17, fontWeight: '700', color: colors.ink, textAlign: 'center' },
  paymentSub: { fontSize: 12, color: colors.muted, textAlign: 'center' },
  creditNoticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.dangerBg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.dangerLine,
  },
  creditNoticeText: {
    flex: 1,
    fontSize: 13,
    color: colors.danger,
    fontWeight: '600',
    lineHeight: 18,
  },

  lockedStatus: { backgroundColor: colors.lineSoft, padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line },
  lockedStatusText: { fontSize: 15, color: colors.ink, fontWeight: '600' },

  warningBox: {
    backgroundColor: colors.warningBg, borderWidth: 1, borderColor: colors.warningLine,
    borderRadius: radius.lg, padding: 12, marginBottom: 16, flexDirection: 'row', alignItems: 'flex-start', gap: 10,
  },
  warningIcon: { fontSize: 22 },
  warningTitle: { fontSize: 13, fontWeight: 'bold', color: colors.warningText, marginBottom: 2 },
  warningText: { fontSize: 12, color: colors.warningText, lineHeight: 17 },

  submitButton: {
    backgroundColor: colors.primary, height: 58, borderRadius: radius.md + 2,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8,
  },
  deliverButton: { backgroundColor: colors.success },
  // Keeps the green and the white label readable while the request is in flight.
  submitButtonDisabled: { opacity: 0.7 },
  submitButtonText: { color: colors.white, fontSize: 18, fontWeight: '800' },
});
