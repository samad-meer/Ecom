import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Alert, Switch, TextInput, ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { adminService, AdminOrder, DeliveryBoy } from '../../services/adminService';
import { OrderLocationMap } from '../../components/OrderLocationMap';
import { KeyboardAwareScrollView } from '../../components/KeyboardAwareScrollView';
import { canWhatsApp, openWhatsApp } from '../../utils/whatsapp';
import { callNumber, canCall } from '../../utils/phone';

interface RouteParams {
  order: AdminOrder;
  deliveryBoys: DeliveryBoy[];
}

const ORDER_STATUSES = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];

const STATUS_COLORS: Record<string, string> = {
  Pending: '#FF9500',
  Processing: '#5856D6',
  Shipped: '#32ADE6',
  Delivered: '#34C759',
  Cancelled: '#FF3B30',
};

export const AdminOrderDetailScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { order: initial, deliveryBoys } = route.params as RouteParams;

  const [order, setOrder] = useState<AdminOrder>(initial);
  const [saving, setSaving] = useState<string | null>(null);
  const [notes, setNotes] = useState(order.delivery_notes || '');
  const [editingNotes, setEditingNotes] = useState(false);

  const patch = async (field: string, data: object) => {
    setSaving(field);
    try {
      const updated = await adminService.updateOrder(order.id, data);
      setOrder(updated);
      if (field === 'notes') setEditingNotes(false);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Update failed.');
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
        <View style={styles.cardHeader}>
          <Text style={styles.orderTitle}>Order #{order.id}</Text>
          <View style={[
            styles.statusPill,
            { backgroundColor: (STATUS_COLORS[order.status] || '#888') + '20' }
          ]}>
            <Text style={[styles.statusPillText, { color: STATUS_COLORS[order.status] || '#888' }]}>
              {order.status}
            </Text>
          </View>
        </View>
        <Text style={styles.metaText}>{dateStr}</Text>
        {order.is_hidden && (
          <View style={styles.hiddenBanner}>
            <Ionicons name="eye-off" size={14} color="#FF9500" />
            <Text style={styles.hiddenBannerText}>Hidden from default list</Text>
          </View>
        )}
      </View>

      {/* Delivery address — first thing after the header, because "where does
          this go" is what an admin opens an order to answer. */}
      <View style={styles.card}>
        <View style={styles.addressHeader}>
          <Text style={[styles.sectionTitle, styles.addressTitle]}>Delivery Address</Text>
          {!!order.shipping_label && (
            <View style={styles.labelChip}>
              <Ionicons name="bookmark" size={11} color="#007AFF" />
              <Text style={styles.labelChipText}>{order.shipping_label}</Text>
            </View>
          )}
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
        {order.guest_name && <InfoRow label="Type" value="📞 Guest / Call-in" />}
        {order.customer_phone && <InfoRow label="Phone" value={order.customer_phone} />}
        {order.customer_email && <InfoRow label="Email" value={order.customer_email} />}
        {order.customer_balance !== null && (
          <InfoRow
            label="Balance"
            value={`PKR ${order.customer_balance}`}
            valueColor={order.customer_balance < 0 ? '#FF3B30' : '#34C759'}
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
                <Ionicons name="call" size={16} color="#fff" />
                <Text style={styles.contactBtnText}>Call</Text>
              </TouchableOpacity>
            )}
            {canWhatsApp(order.customer_phone) && (
              <TouchableOpacity
                style={[styles.contactBtn, styles.waBtn]}
                onPress={() => openWhatsApp(
                  order.customer_phone,
                  `Hello ${order.customer_name}, regarding your order #${order.id}.`,
                )}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={`WhatsApp ${order.customer_name}`}
              >
                <Ionicons name="logo-whatsapp" size={16} color="#fff" />
                <Text style={styles.contactBtnText}>WhatsApp</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {/* Items */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Items</Text>
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
        {order.payment_number && <InfoRow label="Number" value={order.payment_number} />}
        <InfoRow label="Cash Received" value={order.cash_amount ? `PKR ${order.cash_amount}` : '—'} />
        <View style={styles.switchRow}>
          <Text style={styles.infoLabel}>Paid</Text>
          {saving === 'paid' ? (
            <ActivityIndicator size="small" color="#007AFF" />
          ) : (
            <Switch
              value={order.is_paid}
              onValueChange={(v) => patch('paid', { is_paid: v })}
              trackColor={{ false: '#ccc', true: '#34C759' }}
            />
          )}
        </View>
      </View>

      {/* Status update */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Update Status</Text>
        <View style={styles.statusGrid}>
          {ORDER_STATUSES.map((s) => (
            <TouchableOpacity
              key={s}
              style={[
                styles.statusBtn,
                { borderColor: STATUS_COLORS[s] || '#ccc' },
                order.status === s && { backgroundColor: (STATUS_COLORS[s] || '#007AFF') + '20' },
              ]}
              onPress={() => order.status !== s && patch('status', { status: s })}
              disabled={saving === 'status'}
            >
              {saving === 'status' && order.status === s ? (
                <ActivityIndicator size="small" color={STATUS_COLORS[s]} />
              ) : (
                <Text style={[styles.statusBtnText, { color: STATUS_COLORS[s] || '#888' }]}>
                  {order.status === s ? '✓ ' : ''}{s}
                </Text>
              )}
            </TouchableOpacity>
          ))}
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
              <Text style={styles.riderBtnText}>
                {db.name}{!db.is_available ? ' 🔴' : ' 🟢'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {saving === 'rider' && <ActivityIndicator size="small" color="#007AFF" style={{ marginTop: 8 }} />}
      </View>

      {/* Notes */}
      <View style={styles.card}>
        <View style={styles.notesHeader}>
          <Text style={styles.sectionTitle}>Note for the rider</Text>
          {!editingNotes && (
            <TouchableOpacity onPress={() => setEditingNotes(true)}>
              <Ionicons name="pencil" size={16} color="#007AFF" />
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
              placeholderTextColor="#000"
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
                  <ActivityIndicator size="small" color="white" />
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
        <TouchableOpacity
          style={[styles.hideBtn, order.is_hidden && styles.unhideBtn]}
          onPress={() => patch('hidden', { is_hidden: !order.is_hidden })}
          disabled={saving === 'hidden'}
        >
          {saving === 'hidden' ? (
            <ActivityIndicator size="small" color={order.is_hidden ? '#34C759' : '#FF9500'} />
          ) : (
            <>
              <Ionicons
                name={order.is_hidden ? 'eye' : 'eye-off'}
                size={16}
                color={order.is_hidden ? '#34C759' : '#FF9500'}
              />
              <Text style={[styles.hideBtnText, { color: order.is_hidden ? '#34C759' : '#FF9500' }]}>
                {order.is_hidden ? 'Unhide Order' : 'Hide Order'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

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
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  // Room to scroll the notes box clear of the keyboard. Replaces the spacer
  // View that used to sit at the bottom of the scroll.
  scrollContent: { paddingBottom: 48 },
  card: {
    backgroundColor: 'white', margin: 12, marginBottom: 0,
    borderRadius: 12, padding: 16,
    elevation: 1, shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  orderTitle: { fontSize: 20, fontWeight: 'bold', color: '#1a1a1a' },
  statusPill: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 },
  statusPillText: { fontSize: 13, fontWeight: '700' },
  metaText: { fontSize: 13, color: '#888', marginTop: 2 },
  hiddenBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#FF950015', borderRadius: 8, padding: 8, marginTop: 8,
  },
  hiddenBannerText: { fontSize: 12, color: '#FF9500', fontWeight: '500' },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#1a1a1a', marginBottom: 12 },
  addressHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  addressTitle: { marginBottom: 0 },
  labelChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#007AFF15', borderRadius: 20,
    paddingHorizontal: 9, paddingVertical: 3,
  },
  labelChipText: { fontSize: 11, fontWeight: '700', color: '#007AFF' },
  addressText: { fontSize: 15, color: '#1a1a1a', fontWeight: '600', lineHeight: 21, marginTop: 8 },
  addressMap: { marginTop: 12 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  infoLabel: { fontSize: 13, color: '#888', flex: 1 },
  infoValue: { fontSize: 13, color: '#1a1a1a', fontWeight: '500', flex: 2, textAlign: 'right' },
  itemRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  itemName: { flex: 1, fontSize: 14, color: '#333' },
  itemQty: { fontSize: 14, color: '#888', marginHorizontal: 12 },
  itemPrice: { fontSize: 14, fontWeight: '600', color: '#1a1a1a' },
  totalRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    borderTopWidth: 1, borderTopColor: '#f0f0f0', paddingTop: 10, marginTop: 4,
  },
  totalLabel: { fontSize: 15, fontWeight: '700', color: '#333' },
  totalValue: { fontSize: 15, fontWeight: '700', color: '#007AFF' },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  statusGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statusBtn: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
    borderWidth: 1.5, borderColor: '#ccc', backgroundColor: 'white',
  },
  statusBtnText: { fontSize: 13, fontWeight: '600' },
  currentRider: { fontSize: 14, color: '#555', marginBottom: 10 },
  riderGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  riderBtn: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
    borderWidth: 1, borderColor: '#ddd', backgroundColor: 'white',
  },
  riderBtnActive: { backgroundColor: '#007AFF20', borderColor: '#007AFF' },
  riderBtnText: { fontSize: 13, color: '#333' },
  notesHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  notesText: { fontSize: 14, color: '#555', lineHeight: 20 },
  notesInput: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 8,
    padding: 10, fontSize: 14, color: '#000', minHeight: 80,
    textAlignVertical: 'top',
  },
  notesHint: { fontSize: 11.5, color: '#8a929b', marginTop: 6, lineHeight: 16 },

  // ── Customer contact ──────────────────────────────────────────────────────
  contactActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  contactBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 7, paddingVertical: 11, borderRadius: 10,
  },
  callBtn: { backgroundColor: '#0A84FF' },
  waBtn: { backgroundColor: '#25D366' },
  contactBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  notesActions: { flexDirection: 'row', gap: 10, marginTop: 10 },
  saveBtn: {
    flex: 1, backgroundColor: '#007AFF', borderRadius: 8,
    paddingVertical: 10, alignItems: 'center',
  },
  saveBtnText: { color: 'white', fontWeight: '600', fontSize: 14 },
  cancelBtn: {
    flex: 1, backgroundColor: '#f0f0f0', borderRadius: 8,
    paddingVertical: 10, alignItems: 'center',
  },
  cancelBtnText: { color: '#555', fontWeight: '600', fontSize: 14 },
  hideBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 12, borderRadius: 10,
    borderWidth: 1, borderColor: '#FF950050',
  },
  unhideBtn: { borderColor: '#34C75950' },
  hideBtnText: { fontSize: 14, fontWeight: '600' },
});
