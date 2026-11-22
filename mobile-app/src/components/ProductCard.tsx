import React from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, shadow } from '../theme';
import { Product } from '../types/product';

interface ProductCardProps {
  product: Product;
  /** How many are already in the cart. Zero shows an "Add" button instead of the stepper. */
  quantity?: number;
  /** Open the product page. */
  onPress?: (product: Product) => void;
  onAdd?: (product: Product) => void;
  onChangeQuantity?: (product: Product, quantity: number) => void;
}

/**
 * One product as a row: a customer can add bottles without opening a page.
 * Out-of-stock products say so in words, not just by looking greyed out.
 */
export const ProductCard: React.FC<ProductCardProps> = ({
  product, quantity = 0, onPress, onAdd, onChangeQuantity,
}) => {
  const inStock = product.is_active;
  const price = Number(product.price);
  const [imageError, setImageError] = React.useState(false);

  React.useEffect(() => {
    setImageError(false);
  }, [product.image]);

  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.main}
        onPress={() => onPress && onPress(product)}
        activeOpacity={0.8}
        accessibilityLabel={`${product.name}, PKR ${product.price}`}
      >
        {product.image && !imageError ? (
          <Image
            source={{ uri: product.image }}
            style={styles.image}
            resizeMode="cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <View style={[styles.image, styles.placeholder]}>
            <Ionicons name="water" size={28} color={colors.primary} />
          </View>
        )}
        <View style={styles.info}>
          <Text style={[styles.name, !inStock && styles.nameOff]} numberOfLines={2}>{product.name}</Text>
          <Text style={styles.price}>PKR {Number.isFinite(price) ? price.toLocaleString('en-PK', { maximumFractionDigits: 0 }) : product.price}</Text>
          {!inStock && (
            <View style={styles.offChip}><Text style={styles.offChipText}>Out of stock</Text></View>
          )}
        </View>
      </TouchableOpacity>

      {inStock && (
        quantity > 0 ? (
          <View style={styles.stepper}>
            <TouchableOpacity
              style={[styles.round, styles.roundOutline]}
              onPress={() => onChangeQuantity && onChangeQuantity(product, quantity - 1)}
              accessibilityLabel={`Remove one ${product.name}`}
              hitSlop={6}
            >
              <Ionicons name="remove" size={18} color={colors.primary} />
            </TouchableOpacity>
            <Text style={styles.qty}>{quantity}</Text>
            <TouchableOpacity
              style={[styles.round, styles.roundFilled]}
              onPress={() => onChangeQuantity && onChangeQuantity(product, quantity + 1)}
              accessibilityLabel={`Add one more ${product.name}`}
              hitSlop={6}
            >
              <Ionicons name="add" size={18} color={colors.white} />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => onAdd && onAdd(product)}
            accessibilityLabel={`Add ${product.name} to cart`}
          >
            <Text style={styles.addText}>Add</Text>
          </TouchableOpacity>
        )
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: radius.lg + 4,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.line,
    ...shadow.card,
  },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  image: { width: 68, height: 68, borderRadius: radius.md },
  placeholder: { backgroundColor: colors.primaryTint, justifyContent: 'center', alignItems: 'center' },
  info: { flex: 1, gap: 3 },
  name: { fontSize: 16, fontWeight: '700', color: colors.ink },
  nameOff: { color: colors.muted },
  price: { fontSize: 16, fontWeight: '800', color: colors.ink },
  offChip: {
    alignSelf: 'flex-start', backgroundColor: colors.lineSoft,
    paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.pill,
  },
  offChipText: { fontSize: 12, fontWeight: '700', color: colors.textSecondary },

  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  round: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  roundOutline: { borderWidth: 1.8, borderColor: colors.primary },
  roundFilled: { backgroundColor: colors.primary },
  qty: { fontSize: 16, fontWeight: '800', color: colors.ink, minWidth: 18, textAlign: 'center' },

  addBtn: {
    paddingHorizontal: 18, height: 40, borderRadius: radius.pill, borderWidth: 1.8, borderColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  addText: { fontSize: 14, fontWeight: '800', color: colors.primary },
});
