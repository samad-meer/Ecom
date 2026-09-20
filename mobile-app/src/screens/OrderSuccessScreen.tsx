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
          <Ionicons name="checkmark-circle" size={88} color="#2ecc71" />
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
    backgroundColor: '#f5f5f5',
  },
  content: {
    flexGrow: 1,
    alignItems: 'center',
    padding: 24,
    paddingTop: 48,
  },
  iconContainer: {
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 22,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    width: '100%',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  label: {
    fontSize: 15,
    color: '#666',
    // The label is short and fixed; the value is the side that must give way.
    flexShrink: 0,
    marginRight: 12,
  },
  value: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
    // Without these the row could not shrink either column, so a long value
    // simply ran past the edge of the card and was clipped mid-word.
    flexShrink: 1,
    textAlign: 'right',
  },
  totalValue: {
    color: '#2ecc71',
    fontSize: 17,
  },
  divider: {
    height: 1,
    backgroundColor: '#f0f0f0',
  },
  paymentNote: {
    marginTop: 12,
    fontSize: 13,
    color: '#888',
    textAlign: 'center',
    lineHeight: 20,
  },
  primaryButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 16,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  secondaryButton: {
    paddingVertical: 16,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#007AFF',
  },
  secondaryButtonText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
