import { colors, radius, card, pagePadding } from '../theme';
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'OrderSuccess'>;

/**
 * Short labels, because this is the value column of a narrow two-column row.
 * "Cash on Delivery" ran off the edge of the card and rendered as
 * "Cash on Deliv". The row can shrink now too (see styles.value), but the
 * abbreviation is the right thing to show regardless — the customer picked
 * this a screen ago and does not need it spelled out again.
 */
const PAYMENT_LABELS: Record<string, string> = {
  COD: 'COD',
};

export const OrderSuccessScreen: React.FC<Props> = ({ route, navigation }) => {
  // paymentMethod was already being passed in and then ignored — the row said
  // "Cash on Delivery" no matter what was actually chosen. Unknown values fall
  // through to the server's own wording rather than being mislabelled as cash.
  const { orderId, total, paymentMethod } = route.params;
  const paymentLabel = PAYMENT_LABELS[paymentMethod] ?? paymentMethod ?? 'COD';

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.iconContainer}>
          <Ionicons name="checkmark-circle" size={80} color={colors.success} />
        </View>

        <Text style={styles.title}>Order Placed!</Text>
        <Text style={styles.subtitle}>
          Your order has been received and is being processed.
        </Text>

        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.label}>Order ID</Text>
            <Text style={styles.value}>#{orderId}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.label}>Total Amount</Text>
            <Text style={[styles.value, styles.totalValue]}>
              PKR {total.toFixed(2)}
            </Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.label}>Payment Method</Text>
            <Text style={styles.value} numberOfLines={1}>{paymentLabel}</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() =>
            navigation.reset({
              index: 0,
              routes: [{ name: 'MainTabs', params: { screen: 'Orders' } }],
            })
          }
        >
          <Ionicons name="receipt-outline" size={20} color={colors.white} />
          <Text style={styles.primaryButtonText}>View My Orders</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() =>
            navigation.reset({
              index: 0,
              routes: [{ name: 'MainTabs', params: { screen: 'Home' } }],
            })
          }
        >
          <Text style={styles.secondaryButtonText}>Continue Shopping</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: pagePadding + 4,
    paddingBottom: 24,
  },
  iconContainer: {
    width: 128,
    height: 128,
    borderRadius: 64,
    backgroundColor: colors.mint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.ink,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 28,
    lineHeight: 24,
  },
  card: {
    ...card,
    paddingHorizontal: 20,
    paddingVertical: 8,
    width: '100%',
    marginBottom: 24,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
  },
  label: {
    fontSize: 14,
    color: colors.textSecondary,
    // The label is short and fixed; the value is the side that must give way.
    flexShrink: 0,
    marginRight: 12,
  },
  value: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.ink,
    // Without these the row could not shrink either column, so a long value
    // simply ran past the edge of the card and was clipped mid-word.
    flexShrink: 1,
    textAlign: 'right',
  },
  totalValue: {
    color: colors.ink,
    fontSize: 24,
  },
  divider: {
    height: 1,
    backgroundColor: colors.lineSoft,
  },
  primaryButton: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: colors.primary,
    height: 54,
    borderRadius: radius.md,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  primaryButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '800',
  },
  secondaryButton: {
    height: 54,
    borderRadius: radius.md,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  secondaryButtonText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '800',
  },
});
