import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Alert, Switch, TextInput, ActivityIndicator, Modal, ScrollView,
} from 'react-native';
import { useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, fontSize, card, pagePadding } from '../../theme';
import { StatusPill, orderStatusTone, friendlyError } from '../../components/ui';
import { adminService, AdminOrder, DeliveryBoy, MessageTemplate } from '../../services/adminService';
import { OrderLocationMap } from '../../components/OrderLocationMap';
import { KeyboardAwareScrollView } from '../../components/KeyboardAwareScrollView';
import { canWhatsApp, openWhatsApp, orderDispatchMessage } from '../../utils/whatsapp';
import { callNumber, canCall } from '../../utils/phone';
import { AdminEditOrderModal } from './AdminEditOrderModal';

interface RouteParams {
  order: AdminOrder;
  deliveryBoys: DeliveryBoy[];
}

const ORDER_STATUSES = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];

// Fill colour of the selected status button, matching orderStatusTone's pills.
const STATUS_FILL: Record<string, string> = {
  Pending: colors.warning,
  Processing: colors.primary,
  Shipped: colors.info,
  Delivered: colors.success,
  Cancelled: colors.danger,
};

export const AdminOrderDetailScreen: React.FC = () => {
  const route = useRoute();
  const { order: initial, deliveryBoys } = route.params as RouteParams;

  const [order, setOrder] = useState<AdminOrder>(initial);
  const [saving, setSaving] = useState<string | null>(null);
  const [notes, setNotes] = useState(order.delivery_notes || '');
  const [editingNotes, setEditingNotes] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [templatePickerVisible, setTemplatePickerVisible] = useState(false);

  useEffect(() => {
    adminService.getMessageTemplates().then(setTemplates).catch(() => {});
  }, []);

  const sendWhatsApp = (chosenTemplate?: MessageTemplate) => {
    const tpl =
      chosenTemplate ||
      templates.find((t) => t.is_default && t.category === 'order_info') ||
      templates.find((t) => t.is_default) ||
      templates[0];

    openWhatsApp(
      order.customer_phone,
      orderDispatchMessage({
        customerName: order.customer_name,
        orderId: order.id,
        items: order.items,
        orderTotal: order.total_price,
        previousBalance: order.customer_balance,
        isPaid: order.is_paid,
        shippingAddress: order.shipping_address,
        mode: 'info',
        template: tpl?.content,
      })
    );
    setTemplatePickerVisible(false);
  };

  const patch = async (field: string, data: object) => {
    setSaving(field);
    try {
      const updated = await adminService.updateOrder(order.id, data);
      setOrder(updated);
      if (field === 'notes') setEditingNotes(false);
    } catch (e: any) {
      Alert.alert('Error', e?.message ? friendlyError(e.message) : 'Update failed.');
    } finally {
      setSaving(null);
    }
  };

  const dateStr = new Date(order.created_at).toLocaleString('en-PK', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  return (
    <KeyboardAwareScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      extraBottomSpace={32}
    >
      {/* Header card */}
      <View style={styles.card}>
        <View style={styles.headerTopRow}>
          <Text style={styles.orderTitle}>Order #{order.id}</Text>
          <TouchableOpacity
            style={styles.editOrderHeaderBtn}
            onPress={() => setEditModalVisible(true)}
            activeOpacity={0.8}
          >
            <Ionicons name="create-outline" size={15} color={colors.primary} />
            <Text style={styles.editOrderHeaderBtnText}>Edit Order</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.metaText}>{dateStr}</Text>
        <View style={styles.headerPills}>
          {order.is_pinned && (
            <StatusPill label="Pinned (Deliver First)" tone="warning" icon="pin" />
          )}
          <StatusPill label={order.status} tone={orderStatusTone(order.status)} />
          <StatusPill
            label={order.is_paid ? 'Paid' : 'Unpaid'}
            tone={order.is_paid ? 'success' : 'danger'}
            icon={order.is_paid ? 'checkmark-circle' : 'alert-circle'}
          />
        </View>
        {order.is_hidden && (
          <View style={styles.hiddenBanner}>
            <Ionicons name="eye-off" size={16} color={colors.warningText} />
            <Text style={styles.hiddenBannerText}>Hidden from default list</Text>
          </View>
        )}
      </View>

      {/* Delivery address — first thing after the header, because "where does
          this go" is what an admin opens an order to answer. */}
      <View style={styles.card}>
        <View style={styles.addressHeader}>
          <Text style={[styles.sectionTitle, styles.addressTitle]}>Delivery Address</Text>
          <View style={styles.addressActions}>
            {!!order.shipping_label && (
              <View style={styles.labelChip}>
                <Ionicons name="bookmark" size={12} color={colors.primaryDark} />
                <Text style={styles.labelChipText}>{order.shipping_label}</Text>
              </View>
            )}
            <TouchableOpacity
              style={styles.editInlineBtn}
              onPress={() => setEditModalVisible(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="pencil" size={13} color={colors.primary} />
              <Text style={styles.editInlineBtnText}>Edit</Text>
            </TouchableOpacity>
          </View>
        </View>
        <Text style={styles.addressText}>{order.shipping_address || '—'}</Text>
        <OrderLocationMap
          orderId={order.id}
          latitude={order.shipping_latitude}
          longitude={order.shipping_longitude}
          label={order.shipping_label}
          style={styles.addressMap}
        />
      </View>

      {/* Customer */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Customer</Text>
        <InfoRow label="Name" value={order.customer_name} />
        {!!order.guest_name && <InfoRow label="Type" value="📞 Guest / Call-in" />}
        {!!order.customer_phone && <InfoRow label="Phone" value={order.customer_phone} />}
        {!!order.customer_email && <InfoRow label="Email" value={order.customer_email} />}
        {order.customer_balance !== null && (
          <InfoRow
            label="Balance"
            value={`PKR ${order.customer_balance}`}
            valueColor={order.customer_balance < 0 ? colors.danger : colors.success}
          />
        )}

        {/* Two ways to reach them, side by side. Which one is right is not
            ours to decide: WhatsApp is free but the customer may not have it
            or be online, so the SIM is always offered alongside it. */}
        {(canCall(order.customer_phone) || canWhatsApp(order.customer_phone)) && (
          <View style={styles.contactActions}>
            {canCall(order.customer_phone) && (
              <TouchableOpacity
                style={[styles.contactBtn, styles.callBtn]}
                onPress={() => callNumber(order.customer_phone)}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={`Call ${order.customer_name}`}
              >
                <Ionicons name="call" size={18} color={colors.white} />
                <Text style={styles.callBtnText}>Call</Text>
              </TouchableOpacity>
            )}
            {canWhatsApp(order.customer_phone) && (
              <View style={[styles.contactBtn, styles.waBtnWrap]}>
                <TouchableOpacity
                  style={styles.waBtnMain}
                  onPress={() => sendWhatsApp()}
                  onLongPress={() => setTemplatePickerVisible(true)}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel={`WhatsApp ${order.customer_name}`}
                >
                  <Ionicons name="logo-whatsapp" size={18} color={colors.ink} />
                  <Text style={styles.waBtnText}>WhatsApp</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.waBtnChevron}
                  onPress={() => setTemplatePickerVisible(true)}
                  accessibilityLabel="Choose WhatsApp template"
                >
                  <Ionicons name="chevron-down" size={14} color={colors.ink} />
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      </View>

      {/* Items */}
      <View style={styles.card}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Items</Text>
          <TouchableOpacity
            style={styles.editInlineBtn}
            onPress={() => setEditModalVisible(true)}
            activeOpacity={0.85}
          >
            <Ionicons name="pencil" size={13} color={colors.primary} />
            <Text style={styles.editInlineBtnText}>Edit Items</Text>
          </TouchableOpacity>
        </View>
        {order.items.map((item) => (
          <View key={item.id} style={styles.itemRow}>
            <Text style={styles.itemName}>{item.product_details.name}</Text>
            <Text style={styles.itemQty}>×{item.quantity}</Text>
            <Text style={styles.itemPrice}>PKR {Number(item.price).toLocaleString()}</Text>
          </View>
        ))}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>PKR {Number(order.total_price).toLocaleString()}</Text>
        </View>
      </View>

      {/* Payment */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Payment</Text>
        <InfoRow label="Method" value={order.payment_method} />
        {!!order.payment_number && <InfoRow label="Number" value={order.payment_number} />}
        <InfoRow label="Cash Received" value={order.cash_amount ? `PKR ${order.cash_amount}` : '—'} />
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Paid</Text>
          {saving === 'paid' ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Switch
              value={order.is_paid}
              onValueChange={(v) => patch('paid', { is_paid: v })}
              trackColor={{ false: colors.disabled, true: colors.success }}
            />
          )}
        </View>
      </View>

      {/* Status update */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Update Status</Text>
        <View style={styles.statusGrid}>
          {ORDER_STATUSES.map((s) => {
            const selected = order.status === s;
            return (
              <TouchableOpacity
                key={s}
                style={[
                  styles.statusBtn,
                  selected && { backgroundColor: STATUS_FILL[s] || colors.primary, borderColor: STATUS_FILL[s] || colors.primary },
                ]}
                onPress={() => order.status !== s && patch('status', { status: s })}
                disabled={saving === 'status'}
              >
                {saving === 'status' && selected ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <Text style={[styles.statusBtnText, selected && styles.statusBtnTextSelected]}>
                    {selected ? '✓ ' : ''}{s}
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Rider assignment */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Assigned Rider</Text>
        <Text style={styles.currentRider}>
          {order.assigned_delivery_boy_name || '— Not assigned —'}
        </Text>
        <View style={styles.riderGrid}>
          <TouchableOpacity
            style={[
              styles.riderBtn,
              !order.assigned_delivery_boy && styles.riderBtnActive,
            ]}
            onPress={() => patch('rider', { assigned_delivery_boy: null })}
            disabled={saving === 'rider'}
          >
            <Text style={styles.riderBtnText}>None</Text>
          </TouchableOpacity>
          {deliveryBoys.map((db) => (
            <TouchableOpacity
              key={db.id}
              style={[
                styles.riderBtn,
                order.assigned_delivery_boy === db.id && styles.riderBtnActive,
              ]}
              onPress={() => patch('rider', { assigned_delivery_boy: db.id })}
              disabled={saving === 'rider'}
            >
              <Text style={styles.riderBtnText}>{db.name}</Text>
              <View style={styles.riderState}>
                <View style={[styles.riderDot, { backgroundColor: db.is_available ? colors.success : colors.danger }]} />
                <Text style={styles.riderBtnSub}>{db.is_available ? 'Available' : 'Unavailable'}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
        {saving === 'rider' && <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 10 }} />}

        {/* Rider visibility toggle */}
        <View style={styles.riderVisibilityRow}>
          <View style={{ flex: 1, marginRight: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons
                name={order.show_to_rider !== false ? 'eye' : 'eye-off'}
                size={18}
                color={order.show_to_rider !== false ? colors.primary : colors.muted}
              />
              <Text style={styles.riderVisibilityTitle}>Show to Rider</Text>
            </View>
            <Text style={styles.riderVisibilitySubtitle}>
              {order.show_to_rider !== false
                ? 'Visible in the assigned rider’s mobile app'
                : 'Hidden from the rider’s mobile app'}
            </Text>
          </View>
          <Switch
            value={order.show_to_rider !== false}
            onValueChange={(val) => patch('show_to_rider', { show_to_rider: val })}
            disabled={saving === 'show_to_rider'}
            trackColor={{ false: colors.line, true: colors.primary }}
            thumbColor={colors.white}
          />
        </View>

        {/* Pin Order / Deliver First Priority toggle */}
        <View style={styles.riderVisibilityRow}>
          <View style={{ flex: 1, marginRight: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons
                name="pin"
                size={18}
                color={order.is_pinned ? '#D97706' : colors.muted}
              />
              <Text style={styles.riderVisibilityTitle}>Pin Order (Deliver First)</Text>
            </View>
            <Text style={styles.riderVisibilitySubtitle}>
              {order.is_pinned
                ? 'Pinned at the very top of the rider’s list with Deliver First priority'
                : 'Standard order priority'}
            </Text>
          </View>
          <Switch
            value={Boolean(order.is_pinned)}
            onValueChange={(val) => patch('is_pinned', { is_pinned: val })}
            disabled={saving === 'is_pinned'}
            trackColor={{ false: colors.line, true: '#F59E0B' }}
            thumbColor={colors.white}
          />
        </View>
      </View>

      {/* Notes */}
      <View style={styles.card}>
        <View style={styles.notesHeader}>
          <Text style={[styles.sectionTitle, styles.notesTitle]}>Note for the rider</Text>
          {!editingNotes && (
            <TouchableOpacity
              style={styles.editBtn}
              onPress={() => setEditingNotes(true)}
              accessibilityLabel="Edit note for the rider"
            >
              <Ionicons name="pencil" size={18} color={colors.primary} />
            </TouchableOpacity>
          )}
        </View>
        {editingNotes ? (
          <>
            <TextInput
              style={styles.notesInput}
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={3}
              placeholder="Gate code 1234 · Call on arrival · Leave with the guard"
              placeholderTextColor={colors.muted}
              maxLength={500}
            />
            <Text style={styles.notesHint}>
              Shown only to the rider delivering this order. The customer never sees it.
            </Text>
            <View style={styles.notesActions}>
              <TouchableOpacity
                style={styles.saveBtn}
                onPress={() => patch('notes', { delivery_notes: notes })}
                disabled={saving === 'notes'}
              >
                {saving === 'notes' ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <Text style={styles.saveBtnText}>Save</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => { setNotes(order.delivery_notes || ''); setEditingNotes(false); }}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <Text style={styles.notesText}>
            {order.delivery_notes || 'No notes'}
          </Text>
        )}
      </View>

      {/* Hide/Unhide */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Visibility</Text>
        <TouchableOpacity
          style={[styles.hideBtn, order.is_hidden && styles.unhideBtn]}
          onPress={() => patch('hidden', { is_hidden: !order.is_hidden })}
          disabled={saving === 'hidden'}
        >
          {saving === 'hidden' ? (
            <ActivityIndicator size="small" color={order.is_hidden ? colors.success : colors.warningText} />
          ) : (
            <>
              <Ionicons
                name={order.is_hidden ? 'eye' : 'eye-off'}
                size={18}
                color={order.is_hidden ? colors.success : colors.warningText}
              />
              <Text style={[styles.hideBtnText, { color: order.is_hidden ? colors.success : colors.warningText }]}>
                {order.is_hidden ? 'Unhide Order' : 'Hide Order'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <AdminEditOrderModal
        visible={editModalVisible}
        order={order}
        deliveryBoys={deliveryBoys}
        onClose={() => setEditModalVisible(false)}
        onSaved={(updated) => setOrder(updated)}
      />

      {/* Template picker bottom sheet modal */}
      <Modal
        visible={templatePickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setTemplatePickerVisible(false)}
      >
        <TouchableOpacity
          style={styles.sheetOverlay}
          activeOpacity={1}
          onPress={() => setTemplatePickerVisible(false)}
        >
          <View style={styles.sheetCard}>
            <View style={styles.sheetHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetTitle}>Send WhatsApp Message</Text>
                <Text style={styles.sheetSubtitle}>Choose a message template</Text>
              </View>
              <TouchableOpacity onPress={() => setTemplatePickerVisible(false)}>
                <Ionicons name="close" size={22} color={colors.ink} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 340 }}>
              {templates.map((tpl) => (
                <TouchableOpacity
                  key={tpl.id}
                  style={styles.templateOption}
                  onPress={() => sendWhatsApp(tpl)}
                >
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.templateOptionName}>{tpl.name}</Text>
                      {tpl.is_default && (
                        <View style={styles.templateDefaultPill}>
                          <Text style={styles.templateDefaultPillText}>Default</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.templateOptionCat}>{tpl.category_display}</Text>
                  </View>
                  <Ionicons name="paper-plane-outline" size={18} color={colors.primary} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

    </KeyboardAwareScrollView>
  );
};

function InfoRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, valueColor ? { color: valueColor } : {}]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  // Room to scroll the notes box clear of the keyboard. Replaces the spacer
  // View that used to sit at the bottom of the scroll.
  scrollContent: { paddingHorizontal: pagePadding, paddingTop: 4, paddingBottom: 48 },
  card: { ...card, padding: 16, marginBottom: 12 },
  headerTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  editOrderHeaderBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill,
    backgroundColor: colors.primaryTint, borderWidth: 1, borderColor: colors.primary,
  },
  editOrderHeaderBtnText: { fontSize: fontSize.xs, fontWeight: '800', color: colors.primaryDark },
  orderTitle: { fontSize: fontSize.lg, fontWeight: '800', color: colors.ink },
  metaText: { fontSize: fontSize.sm, color: colors.muted, marginTop: 4 },
  headerPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  hiddenBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.warningBg, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.warningLine,
    paddingHorizontal: 12, paddingVertical: 10, marginTop: 12,
  },
  hiddenBannerText: { fontSize: fontSize.sm, color: colors.warningText, fontWeight: '700' },

  sectionTitle: { fontSize: fontSize.md, fontWeight: '800', color: colors.ink, marginBottom: 12 },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  addressHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' },
  addressTitle: { marginBottom: 0 },
  addressActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  editInlineBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.sm,
    backgroundColor: colors.primaryTint,
  },
  editInlineBtnText: { fontSize: fontSize.xs, fontWeight: '700', color: colors.primaryDark },
  labelChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.primaryTint, borderRadius: radius.pill,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  labelChipText: { fontSize: fontSize.xs, fontWeight: '800', color: colors.primaryDark },
  addressText: { fontSize: fontSize.md, color: colors.ink, fontWeight: '700', lineHeight: 22, marginTop: 10 },
  addressMap: { marginTop: 12 },

  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    gap: 12, marginBottom: 10,
  },
  infoLabel: { fontSize: fontSize.sm, color: colors.muted, flex: 1 },
  infoValue: { fontSize: fontSize.sm, color: colors.ink, fontWeight: '700', flex: 2, textAlign: 'right' },

  itemRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  itemName: { flex: 1, fontSize: fontSize.sm, color: colors.ink, fontWeight: '600' },
  itemQty: { fontSize: fontSize.sm, color: colors.muted, marginHorizontal: 12 },
  itemPrice: { fontSize: fontSize.sm, fontWeight: '700', color: colors.ink },
  totalRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 12, marginTop: 4,
  },
  totalLabel: { fontSize: fontSize.md, fontWeight: '700', color: colors.ink },
  totalValue: { fontSize: fontSize.lg, fontWeight: '800', color: colors.ink },

  switchRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    minHeight: 44, marginTop: 2,
  },
  switchLabel: { fontSize: fontSize.md, fontWeight: '700', color: colors.ink },

  statusGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statusBtn: {
    minHeight: 40, minWidth: 96, paddingHorizontal: 16, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  statusBtnText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.ink },
  statusBtnTextSelected: { color: colors.white, fontWeight: '800' },

  currentRider: { fontSize: fontSize.md, fontWeight: '700', color: colors.ink, marginBottom: 12 },
  riderGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  riderBtn: {
    minHeight: 48, justifyContent: 'center',
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface,
  },
  riderBtnActive: { backgroundColor: colors.primaryTint, borderColor: colors.primary },
  riderBtnText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.ink },
  riderState: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  riderDot: { width: 8, height: 8, borderRadius: 4 },
  riderBtnSub: { fontSize: fontSize.xs, color: colors.muted },

  riderVisibilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  riderVisibilityTitle: { fontSize: fontSize.sm, fontWeight: '700', color: colors.ink },
  riderVisibilitySubtitle: { fontSize: fontSize.xs, color: colors.muted, marginTop: 2 },

  notesHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  notesTitle: { marginBottom: 0 },
  editBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center',
  },
  notesText: { fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 20 },
  notesInput: {
    borderWidth: 1, borderColor: colors.line, borderRadius: radius.md,
    backgroundColor: colors.surfaceTint,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: fontSize.sm, color: colors.ink, minHeight: 96,
    textAlignVertical: 'top',
  },
  notesHint: { fontSize: fontSize.xs, color: colors.muted, marginTop: 8, lineHeight: 16 },
  notesActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  saveBtn: {
    flex: 2, height: 46, backgroundColor: colors.primary, borderRadius: radius.md,
    alignItems: 'center', justifyContent: 'center',
  },
  saveBtnText: { color: colors.white, fontWeight: '800', fontSize: fontSize.md },
  cancelBtn: {
    flex: 1, height: 46, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.muted,
    alignItems: 'center', justifyContent: 'center',
  },
  cancelBtnText: { color: colors.ink, fontWeight: '700', fontSize: fontSize.sm },

  // ── Customer contact ──────────────────────────────────────────────────────
  contactActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  contactBtn: {
    flex: 1, height: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: radius.md,
  },
  callBtn: { backgroundColor: colors.primary },
  callBtnText: { color: colors.white, fontSize: fontSize.sm, fontWeight: '800' },
  // White text on this green is only 2.0:1, so the WhatsApp button is navy on green.
  waBtn: { backgroundColor: colors.whatsapp },
  waBtnText: { color: colors.ink, fontSize: fontSize.sm, fontWeight: '800' },
  waBtnWrap: {
    backgroundColor: colors.whatsapp,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 0,
    overflow: 'hidden',
  },
  waBtnMain: {
    flex: 1,
    height: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  waBtnChevron: {
    width: 32,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(10,31,68,0.15)',
  },

  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(10,31,68,0.6)',
    justifyContent: 'flex-end',
  },
  sheetCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: pagePadding,
    paddingBottom: 32,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    marginBottom: 8,
  },
  sheetTitle: { fontSize: fontSize.md, fontWeight: '800', color: colors.ink },
  sheetSubtitle: { fontSize: fontSize.xs, color: colors.muted, marginTop: 2 },
  templateOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.lineSoft,
  },
  templateOptionName: { fontSize: fontSize.sm, fontWeight: '700', color: colors.ink },
  templateOptionCat: { fontSize: 11, color: colors.muted, marginTop: 2 },
  templateDefaultPill: {
    backgroundColor: colors.warningBg,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.warningLine,
  },
  templateDefaultPillText: { fontSize: 9, fontWeight: '800', color: colors.warningText },

  hideBtn: {
    height: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: radius.md,
    backgroundColor: colors.warningBg, borderWidth: 1, borderColor: colors.warningLine,
  },
  unhideBtn: { backgroundColor: colors.successBg, borderColor: colors.success },
  hideBtnText: { fontSize: fontSize.sm, fontWeight: '800' },
});
