import { colors, radius, shadow } from '../theme';
import React from 'react';
import { View, Text, FlatList, StyleSheet, Image, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';
import { useCart } from '../context/CartContext';
import { CartItem } from '../types/cart';
import { useLanguage } from '../context/LanguageContext';
import { EmptyState } from '../components/ui';

type Props = NativeStackScreenProps<RootStackParamList, 'Cart'>;

// Annotated `number` rather than inferred as the literal 0, or the "fee > 0"
// branch below narrows to `never` and stops compiling the moment a fee exists.
const DELIVERY_FEE: number = 0; // Free delivery

export const CartScreen: React.FC<Props> = ({ navigation }) => {
  const { items, removeFromCart, updateQuantity, getCartTotal } = useCart();
  const { t } = useLanguage();

  const subtotal = getCartTotal();
  const grandTotal = subtotal + DELIVERY_FEE;

  const renderItem = ({ item }: { item: CartItem }) => (
    <View style={styles.cartItem}>
      {item.image ? (
        <Image source={{ uri: item.image }} style={styles.itemImage} />
      ) : (
        <View style={[styles.itemImage, styles.placeholder]}>
          <Ionicons name="water" size={26} color={colors.primary} />
        </View>
      )}

      <View style={styles.itemDetails}>
        <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.itemPrice}>PKR {parseFloat(item.price).toFixed(2)}</Text>

        <View style={styles.quantityContainer}>
          <TouchableOpacity
            style={[styles.quantityButton, styles.quantityButtonOutline]}
            onPress={() => updateQuantity(item.id, item.quantity - 1)}
            accessibilityLabel={`Remove one ${item.name}`}
            hitSlop={8}
          >
            <Ionicons name="remove" size={18} color={colors.primary} />
          </TouchableOpacity>

          <Text style={styles.quantityText}>{item.quantity}</Text>

          <TouchableOpacity
            style={[styles.quantityButton, styles.quantityButtonFilled]}
            onPress={() => updateQuantity(item.id, item.quantity + 1)}
            accessibilityLabel={`Add one more ${item.name}`}
            hitSlop={8}
          >
            <Ionicons name="add" size={18} color={colors.white} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.itemRightCol}>
        <TouchableOpacity style={styles.removeButton} onPress={() => removeFromCart(item.id)} accessibilityLabel={`Remove ${item.name} from cart`} hitSlop={10}>
          <Ionicons name="trash-outline" size={20} color={colors.danger} />
        </TouchableOpacity>
        <Text style={styles.itemSubtotal}>
          PKR {(parseFloat(item.price) * item.quantity).toFixed(2)}
        </Text>
      </View>
    </View>
  );

  if (items.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <EmptyState icon="cart-outline" title={t('your_cart_empty', 'Your cart is empty')} />
        <TouchableOpacity
          style={styles.browseButton}
          onPress={() => navigation.navigate('MainTabs')}
          accessibilityRole="button"
        >
          <Text style={styles.browseButtonText}>Browse products</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <FlatList
        data={items}
        renderItem={renderItem}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.listContent}
      />

      <View style={styles.footer}>
        {/* Subtotal */}
        <View style={styles.feeRow}>
          <Text style={styles.feeLabel}>Subtotal</Text>
          <Text style={styles.feeValue}>PKR {subtotal.toFixed(2)}</Text>
        </View>

        {/* Delivery fee */}
        <View style={styles.feeRow}>
          <Text style={styles.feeLabel}>Delivery Fee</Text>
          {DELIVERY_FEE === 0 ? (
            <Text style={styles.freeTag}>Free</Text>
          ) : (
            <Text style={styles.feeValue}>PKR {DELIVERY_FEE.toFixed(2)}</Text>
          )}
        </View>

        <View style={styles.divider} />

        {/* Grand total */}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>{t('cart_total', 'Total')}</Text>
          <Text style={styles.totalAmount}>PKR {grandTotal.toFixed(2)}</Text>
        </View>

        <TouchableOpacity
          style={styles.checkoutButton}
          onPress={() => navigation.navigate('Checkout')}
        >
          <Text style={styles.checkoutButtonText}>{t('checkout_btn', 'Proceed to Checkout')}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  listContent: {
    padding: 16,
    paddingBottom: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.bg,
  },
  browseButton: {
    backgroundColor: colors.primary,
    height: 50,
    paddingHorizontal: 28,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  browseButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '800',
  },
  cartItem: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.lg + 4,
    padding: 12,
    marginBottom: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.line,
    ...shadow.card,
  },
  itemImage: {
    width: 68,
    height: 68,
    borderRadius: radius.md,
    backgroundColor: colors.lineSoft,
  },
  placeholder: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.primaryTint,
  },
  placeholderText: {
    fontSize: 12,
    color: colors.muted,
  },
  itemDetails: {
    flex: 1,
    marginLeft: 12,
  },
  itemName: {
    fontSize: 15,
    fontWeight: 'bold',
    marginBottom: 4,
    color: colors.ink,
  },
  itemPrice: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  quantityContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  quantityButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quantityButtonOutline: { borderWidth: 1.8, borderColor: colors.primary },
  quantityButtonFilled: { backgroundColor: colors.primary },
  quantityButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.ink,
  },
  quantityText: {
    marginHorizontal: 12,
    fontSize: 16,
    fontWeight: '800',
    color: colors.ink,
  },
  itemRightCol: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    paddingLeft: 8,
  },
  removeButton: {
    padding: 4,
  },
  itemSubtotal: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.ink,
  },
  // A rounded sheet that rises from the bottom, holding the total and the button.
  footer: {
    backgroundColor: colors.surface,
    padding: 20,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    ...shadow.float,
  },
  feeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  feeLabel: {
    fontSize: 15,
    color: colors.textSecondary,
  },
  feeValue: {
    fontSize: 15,
    color: colors.ink,
    fontWeight: '500',
  },
  freeTag: {
    fontSize: 14,
    color: colors.success,
    fontWeight: '700',
    backgroundColor: colors.successBg,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  divider: {
    height: 1,
    backgroundColor: colors.lineSoft,
    marginVertical: 10,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.ink,
  },
  totalAmount: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.ink,
  },
  checkoutButton: {
    backgroundColor: colors.primary,
    height: 54,
    borderRadius: radius.md + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkoutButtonText: {
    color: colors.white,
    fontSize: 17,
    fontWeight: '800',
  },
});
