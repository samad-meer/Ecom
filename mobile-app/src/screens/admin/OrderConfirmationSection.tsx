import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, space, fontSize, card, pagePadding } from '../../theme';
import { friendlyError } from '../../components/ui';
import { useDialog } from '../../components/AppDialog';
import { useBrand, DEFAULT_ORDER_SUCCESS_MESSAGE } from '../../context/BrandContext';

/**
 * Lets the admin customize the order confirmation subtitle shown to customers
 * right after placing an order on their app.
 */
export function OrderConfirmationSection() {
  const { notify } = useDialog();
  const { orderSuccessMessage, updateOrderSuccessMessage } = useBrand();
  const [draft, setDraft] = useState(orderSuccessMessage || DEFAULT_ORDER_SUCCESS_MESSAGE);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(orderSuccessMessage || DEFAULT_ORDER_SUCCESS_MESSAGE);
  }, [orderSuccessMessage]);

  const dirty = draft.trim() !== (orderSuccessMessage || DEFAULT_ORDER_SUCCESS_MESSAGE).trim() && draft.trim().length > 0;

  const save = async () => {
    setSaving(true);
    try {
      await updateOrderSuccessMessage(draft);
      void notify({
        title: 'Saved',
        message: 'Order confirmation message updated for all users.',
      });
    } catch (e: any) {
      void notify({
        title: 'Could not save',
        message: `The message was not changed. ${friendlyError(e?.message)}`,
        tone: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const resetToDefault = () => {
    setDraft(DEFAULT_ORDER_SUCCESS_MESSAGE);
  };

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionIcon}>
          <Ionicons name="checkmark-done-circle" size={22} color={colors.success} />
        </View>
        <Text style={styles.sectionTitle}>Order Confirmation Message</Text>
      </View>

      <Text style={styles.desc}>
        Displayed under “Order Placed!” on customer phones immediately after checkout.
        Updates reflect instantly across all customer devices.
      </Text>

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          maxLength={255}
          placeholder={DEFAULT_ORDER_SUCCESS_MESSAGE}
          placeholderTextColor={colors.muted}
          multiline
        />
      </View>

      <View style={styles.actionRow}>
        {draft.trim() !== DEFAULT_ORDER_SUCCESS_MESSAGE && (
          <TouchableOpacity
            style={styles.resetBtn}
            onPress={resetToDefault}
            disabled={saving}
          >
            <Ionicons name="refresh-outline" size={15} color={colors.muted} />
            <Text style={styles.resetText}>Reset default</Text>
          </TouchableOpacity>
        )}

        <View style={styles.spacer} />

        <TouchableOpacity
          style={[styles.saveBtn, (!dirty || saving) && { opacity: 0.4 }]}
          onPress={save}
          disabled={!dirty || saving}
          accessibilityLabel="Save order confirmation message"
        >
          {saving ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Text style={styles.saveText}>Save Message</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Live Preview Card */}
      <View style={styles.previewCard}>
        <View style={styles.previewHeader}>
          <Ionicons name="phone-portrait-outline" size={14} color={colors.primary} />
          <Text style={styles.previewTitle}>Customer App Preview</Text>
        </View>
        <View style={styles.previewBox}>
          <Ionicons name="checkmark-circle" size={32} color={colors.success} />
          <Text style={styles.previewHeading}>Order Placed!</Text>
          <Text style={styles.previewSubtitle}>
            {draft.trim() || DEFAULT_ORDER_SUCCESS_MESSAGE}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { ...card, padding: space.lg, marginHorizontal: pagePadding, marginBottom: space.lg },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.sm },
  sectionIcon: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.successBg,
    alignItems: 'center', justifyContent: 'center',
  },
  sectionTitle: { flex: 1, fontSize: fontSize.md, fontWeight: '800', color: colors.ink },
  desc: { fontSize: fontSize.sm, color: colors.muted, lineHeight: 20, marginBottom: space.md },
  inputContainer: { marginBottom: space.sm },
  input: {
    minHeight: 52, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: fontSize.md, fontWeight: '600',
    color: colors.ink, backgroundColor: colors.surfaceTint,
  },
  actionRow: { flexDirection: 'row', alignItems: 'center', marginBottom: space.md },
  spacer: { flex: 1 },
  resetBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 4 },
  resetText: { fontSize: fontSize.xs, color: colors.muted, fontWeight: '600' },
  saveBtn: {
    height: 44, backgroundColor: colors.primary, borderRadius: radius.md,
    paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center',
  },
  saveText: { color: colors.white, fontWeight: '800', fontSize: fontSize.sm },
  previewCard: {
    marginTop: space.xs,
    padding: space.md,
    backgroundColor: colors.surfaceTint,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: space.sm,
  },
  previewTitle: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.ink,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  previewBox: {
    backgroundColor: colors.white,
    borderRadius: radius.sm,
    padding: space.md,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  previewHeading: {
    fontSize: fontSize.md,
    fontWeight: '800',
    color: colors.ink,
    marginTop: space.xs,
    marginBottom: 2,
  },
  previewSubtitle: {
    fontSize: fontSize.xs,
    color: colors.muted,
    textAlign: 'center',
  },
});
