import { colors, radius, shadow, card, pagePadding } from '../theme';
import React, { useState, useEffect } from 'react';
import { View, Text, Image, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';
import { useCart } from '../context/CartContext';
import { useLanguage } from '../context/LanguageContext';
import { StatusPill } from '../components/ui';

type Props = NativeStackScreenProps<RootStackParamList, 'ProductDetail'>;

export const ProductDetailScreen: React.FC<Props> = ({ route, navigation }) => {
  const { product } = route.params;
  const { addToCart } = useCart();
  const { t } = useLanguage();
  const [quantity, setQuantity] = useState(1);

  const price = Number(product.price);
  const priceText = Number.isFinite(price)
    ? price.toLocaleString('en-PK', { maximumFractionDigits: 2 })
    : String(product.price);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    setImageError(false);
  }, [product.image]);

  const handleAddToCart = () => {
    addToCart(product, quantity);
    Alert.alert(t('success', 'Success'), t('added_to_cart_success', 'Added to cart!'), [
      { text: t('keep_shopping', 'Keep Shopping'), style: 'cancel' },
      { text: t('go_to_cart', 'Go to Cart'), onPress: () => navigation.navigate('Cart') }
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.imageCard}>
          {product.image && !imageError ? (
            <Image
              source={{ uri: product.image }}
              style={styles.image}
              resizeMode="cover"
              onError={() => setImageError(true)}
            />
          ) : (
            <View style={[styles.image, styles.placeholder]}>
              <Ionicons name="water" size={72} color={colors.primary} />
              <Text style={styles.placeholderText}>{t('no_img', 'No Image Available')}</Text>
            </View>
          )}
        </View>

        <View style={styles.detailsCard}>
          <View style={styles.statusContainer}>
            {product.is_active ? (
              <StatusPill label={t('in_stock', 'In Stock')} tone="success" icon="checkmark-circle" />
            ) : (
              <StatusPill label={t('out_of_stock', 'Out of Stock')} tone="danger" icon="close-circle" />
            )}
          </View>

          <Text style={styles.name}>{product.name}</Text>
          <View style={styles.priceRow}>
            <Text style={styles.priceUnit}>PKR</Text>
            <Text style={styles.price}>{priceText}</Text>
          </View>

          <View style={styles.divider} />

          <Text style={styles.sectionTitle}>{t('description_title', 'Description')}</Text>
          <Text style={styles.description}>
            {product.description || t('no_description', 'No description available for this product.')}
          </Text>
        </View>
      </ScrollView>

      {/* Sits below the scroll area rather than floating over it, so the last
          lines of the description are never hidden behind the button. The
          stack already pads every screen by the bottom inset, so none is added. */}
      <View style={styles.footer}>
        <View style={styles.quantityRow}>
          <Text style={styles.quantityLabel}>{t('quantity', 'Quantity')}</Text>
          <View style={styles.quantityControls}>
            <TouchableOpacity
              style={[styles.qtyButton, styles.qtyButtonOutline, quantity <= 1 && styles.qtyButtonDisabled]}
              onPress={() => setQuantity(q => Math.max(1, q - 1))}
              disabled={quantity <= 1}
              accessibilityLabel={`Remove one ${product.name}`}
            >
              <Ionicons name="remove" size={22} color={quantity <= 1 ? colors.disabled : colors.primary} />
            </TouchableOpacity>
            <Text style={styles.qtyValue}>{quantity}</Text>
            <TouchableOpacity
              style={[styles.qtyButton, styles.qtyButtonFilled]}
              onPress={() => setQuantity(q => q + 1)}
              accessibilityLabel={`Add one more ${product.name}`}
            >
              <Ionicons name="add" size={22} color={colors.white} />
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.addToCartButton, !product.is_active && styles.disabledButton]}
          disabled={!product.is_active}
          onPress={handleAddToCart}
          accessibilityLabel={`${t('add_to_cart', 'Add to Cart')}, ${product.name}`}
        >
          <Ionicons name="cart" size={20} color={product.is_active ? colors.white : colors.textSecondary} />
          <Text style={[styles.addToCartText, !product.is_active && styles.addToCartTextDisabled]}>
            {t('add_to_cart', 'Add to Cart')}
            {quantity > 1 ? ` (${quantity})` : ''}
          </Text>
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
  scrollContent: {
    padding: pagePadding,
    paddingBottom: 24,
  },
  imageCard: {
    ...card,
    borderRadius: radius.xl,
    overflow: 'hidden',
    marginBottom: 12,
  },
  image: {
    width: '100%',
    height: 300,
    backgroundColor: colors.primaryTint,
  },
  placeholder: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  placeholderText: {
    color: colors.muted,
    fontSize: 14,
  },
  detailsCard: {
    ...card,
    padding: 20,
  },
  statusContainer: {
    marginBottom: 12,
  },
  name: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.ink,
    lineHeight: 30,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginTop: 6,
  },
  priceUnit: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.textSecondary,
  },
  price: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: -0.5,
  },
  divider: {
    height: 1,
    backgroundColor: colors.lineSoft,
    marginVertical: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 8,
    color: colors.ink,
  },
  description: {
    fontSize: 16,
    lineHeight: 24,
    color: colors.textSecondary,
  },
  // A rounded sheet that rises from the bottom, like the cart's.
  footer: {
    backgroundColor: colors.surface,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    ...shadow.float,
  },
  quantityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  quantityLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
  },
  quantityControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  qtyButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyButtonOutline: { borderWidth: 1.8, borderColor: colors.primary },
  qtyButtonFilled: { backgroundColor: colors.primary },
  qtyButtonDisabled: {
    borderColor: colors.disabled,
  },
  qtyValue: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.ink,
    minWidth: 44,
    textAlign: 'center',
  },
  addToCartButton: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: colors.primary,
    height: 54,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledButton: {
    backgroundColor: colors.disabled,
  },
  addToCartText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '800',
  },
  // White on the pale disabled fill is unreadable.
  addToCartTextDisabled: {
    color: colors.textSecondary,
  },
});
