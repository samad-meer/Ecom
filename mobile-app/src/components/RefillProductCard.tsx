import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, shadow } from '../theme';
import { Product } from '../types/product';

interface RefillProductCardProps {
  product: Product;
  quantity?: number;
  onPress?: (product: Product) => void;
  onAdd?: (product: Product) => void;
  onChangeQuantity?: (product: Product, quantity: number) => void;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/**
 * Featured Refill Product Card:
 * Pinned at the top of the shop with a distinctive luxury water design,
 * ambient water ripple aura, glowing live badge, and interactive counter.
 */
export const RefillProductCard: React.FC<RefillProductCardProps> = ({
  product,
  quantity = 0,
  onPress,
  onAdd,
  onChangeQuantity,
}) => {
  const inStock = product.is_active;
  const price = Number(product.price);
  const [imageError, setImageError] = useState(false);

  // Animation values
  const ripple1 = useRef(new Animated.Value(0)).current;
  const ripple2 = useRef(new Animated.Value(0)).current;
  const pulseDot = useRef(new Animated.Value(1)).current;
  const shimmer = useRef(new Animated.Value(0)).current;
  const counterScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    setImageError(false);
  }, [product.image]);

  // Continuous ambient water ripple animation
  useEffect(() => {
    const createRipple = (val: Animated.Value, delay: number) => {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(val, {
            toValue: 1,
            duration: 2600,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(val, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
      );
    };

    const anim1 = createRipple(ripple1, 0);
    const anim2 = createRipple(ripple2, 1300);

    // Glowing badge live pulse
    const pulseAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseDot, {
          toValue: 1.3,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseDot, {
          toValue: 1,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );

    // Light sheen shimmer sweep
    const shimmerAnim = Animated.loop(
      Animated.sequence([
        Animated.delay(1500),
        Animated.timing(shimmer, {
          toValue: 1,
          duration: 1800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );

    anim1.start();
    anim2.start();
    pulseAnim.start();
    shimmerAnim.start();

    return () => {
      anim1.stop();
      anim2.stop();
      pulseAnim.stop();
      shimmerAnim.stop();
    };
  }, [ripple1, ripple2, pulseDot, shimmer]);

  // Bounce animation when quantity changes
  useEffect(() => {
    if (quantity > 0) {
      Animated.sequence([
        Animated.timing(counterScale, {
          toValue: 1.25,
          duration: 120,
          useNativeDriver: true,
        }),
        Animated.spring(counterScale, {
          toValue: 1,
          friction: 4,
          tension: 100,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [quantity, counterScale]);

  const handleIncrement = () => {
    if (onChangeQuantity) {
      onChangeQuantity(product, quantity + 1);
    } else if (onAdd && quantity === 0) {
      onAdd(product);
    }
  };

  const handleDecrement = () => {
    if (onChangeQuantity && quantity > 0) {
      onChangeQuantity(product, quantity - 1);
    }
  };

  const handleQuickAdd = (amount: number) => {
    if (onChangeQuantity) {
      onChangeQuantity(product, quantity + amount);
    } else if (onAdd) {
      onAdd(product);
    }
  };

  // Interpolated ripple styles
  const rippleScale1 = ripple1.interpolate({
    inputRange: [0, 1],
    outputRange: [0.9, 1.45],
  });
  const rippleOpacity1 = ripple1.interpolate({
    inputRange: [0, 0.4, 1],
    outputRange: [0.65, 0.35, 0],
  });

  const rippleScale2 = ripple2.interpolate({
    inputRange: [0, 1],
    outputRange: [0.9, 1.45],
  });
  const rippleOpacity2 = ripple2.interpolate({
    inputRange: [0, 0.4, 1],
    outputRange: [0.65, 0.35, 0],
  });

  const shimmerTranslateX = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [-SCREEN_WIDTH, SCREEN_WIDTH * 1.2],
  });

  return (
    <View style={styles.cardWrapper}>
      {/* Glow highlight backdrop */}
      <View style={styles.cardGlow} />

      <View style={styles.container}>
        {/* Shimmer sweep effect */}
        <Animated.View
          style={[
            styles.shimmerBar,
            { transform: [{ translateX: shimmerTranslateX }, { rotate: '25deg' }] },
          ]}
        />

        {/* Top Feature Header Bar */}
        <View style={styles.topBar}>
          <View style={styles.pillBadge}>
            <Animated.View
              style={[
                styles.liveDot,
                { transform: [{ scale: pulseDot }] },
              ]}
            />
            <Text style={styles.pillBadgeText}>DAILY ESSENTIAL</Text>
          </View>

          <View style={styles.ratingBadge}>
            <Ionicons name="sparkles" size={12} color="#0369A1" />
            <Text style={styles.ratingText}>Most Ordered</Text>
          </View>
        </View>

        {/* Main interactive area */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => onPress && onPress(product)}
          style={styles.mainContent}
          accessibilityLabel={`${product.name}, PKR ${product.price}`}
        >
          {/* Animated Bottle / Water Visual with Water Wave Aura */}
          <View style={styles.imageZone}>
            {/* Ambient Water Ripples */}
            <Animated.View
              style={[
                styles.rippleRing,
                {
                  transform: [{ scale: rippleScale1 }],
                  opacity: rippleOpacity1,
                },
              ]}
            />
            <Animated.View
              style={[
                styles.rippleRing,
                {
                  transform: [{ scale: rippleScale2 }],
                  opacity: rippleOpacity2,
                },
              ]}
            />

            {/* Inner Bottle Container */}
            <View style={styles.bottleCircle}>
              {product.image && !imageError ? (
                <Image
                  source={{ uri: product.image }}
                  style={styles.bottleImage}
                  resizeMode="contain"
                  onError={() => setImageError(true)}
                />
              ) : (
                <View style={styles.bottlePlaceholder}>
                  <Ionicons name="water" size={42} color={colors.primary} />
                  <Text style={styles.bottleLitres}>19L</Text>
                </View>
              )}
            </View>
          </View>

          {/* Details & Specs */}
          <View style={styles.infoCol}>
            <View style={styles.titleRow}>
              <Text style={styles.productName} numberOfLines={2}>
                {product.name}
              </Text>
            </View>

            <Text style={styles.subTitle} numberOfLines={1}>
              {product.description?.trim() || 'Pure RO Mineral Water · Deep Underground'}
            </Text>

            {/* Price section */}
            <View style={styles.priceRow}>
              <Text style={styles.currency}>PKR</Text>
              <Text style={styles.priceAmount}>
                {Number.isFinite(price)
                  ? price.toLocaleString('en-PK', { maximumFractionDigits: 0 })
                  : product.price}
              </Text>
              <Text style={styles.perBottleText}>/ refill</Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* Action Controls & Fast Multi-Bottle Presets */}
        <View style={styles.actionRow}>
          {/* Quick Preset Pills */}
          <View style={styles.quickPills}>
            <TouchableOpacity
              style={styles.presetPill}
              onPress={() => handleQuickAdd(1)}
              activeOpacity={0.75}
            >
              <Text style={styles.presetPillText}>+1</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.presetPill}
              onPress={() => handleQuickAdd(2)}
              activeOpacity={0.75}
            >
              <Text style={styles.presetPillText}>+2</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.presetPill}
              onPress={() => handleQuickAdd(4)}
              activeOpacity={0.75}
            >
              <Text style={styles.presetPillText}>+4</Text>
            </TouchableOpacity>
          </View>

          {/* Main Add/Quantity Stepper */}
          {quantity > 0 ? (
            <View style={styles.stepperContainer}>
              <TouchableOpacity
                style={styles.stepperBtn}
                onPress={handleDecrement}
                hitSlop={8}
                activeOpacity={0.7}
              >
                <Ionicons name="remove" size={18} color={colors.white} />
              </TouchableOpacity>

              <Animated.View style={{ transform: [{ scale: counterScale }] }}>
                <Text style={styles.stepperValue}>{quantity}</Text>
              </Animated.View>

              <TouchableOpacity
                style={styles.stepperBtn}
                onPress={handleIncrement}
                hitSlop={8}
                activeOpacity={0.7}
              >
                <Ionicons name="add" size={18} color={colors.white} />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.addRefillBtn}
              onPress={() => onAdd && onAdd(product)}
              activeOpacity={0.85}
            >
              <Ionicons name="water-outline" size={18} color={colors.white} style={styles.btnIcon} />
              <Text style={styles.addRefillBtnText}>Order Refill</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  cardWrapper: {
    marginHorizontal: 0,
    marginBottom: 16,
    position: 'relative',
  },
  cardGlow: {
    position: 'absolute',
    top: 4,
    left: 8,
    right: 8,
    bottom: -2,
    borderRadius: radius.xl,
    backgroundColor: '#0284C7',
    opacity: 0.14,
    ...shadow.float,
  },
  container: {
    backgroundColor: '#F0F9FF',
    borderRadius: radius.xl,
    borderWidth: 1.5,
    borderColor: '#BAE6FD',
    overflow: 'hidden',
    padding: 14,
    position: 'relative',
    ...shadow.card,
  },
  shimmerBar: {
    position: 'absolute',
    top: -50,
    bottom: -50,
    width: 60,
    backgroundColor: 'rgba(255, 255, 255, 0.45)',
    zIndex: 1,
    pointerEvents: 'none',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    zIndex: 2,
  },
  pillBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: '#7DD3FC',
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#0284C7',
    marginRight: 6,
  },
  pillBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0369A1',
    letterSpacing: 0.6,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: '#E0F2FE',
    gap: 4,
  },
  ratingText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#0369A1',
  },
  mainContent: {
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 2,
  },
  imageZone: {
    width: 86,
    height: 86,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginRight: 14,
  },
  rippleRing: {
    position: 'absolute',
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 2,
    borderColor: '#38BDF8',
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
  },
  bottleCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#7DD3FC',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: '#0284C7',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  bottleImage: {
    width: 66,
    height: 66,
  },
  bottlePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottleLitres: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.primary,
    marginTop: -4,
  },
  infoCol: {
    flex: 1,
    justifyContent: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  productName: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.ink,
    letterSpacing: -0.2,
  },
  subTitle: {
    fontSize: 12,
    color: '#0369A1',
    fontWeight: '500',
    marginTop: 2,
    marginBottom: 6,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  currency: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
    marginRight: 3,
  },
  priceAmount: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.ink,
    letterSpacing: -0.5,
  },
  perBottleText: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: '600',
    marginLeft: 4,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#E0F2FE',
    zIndex: 2,
  },
  quickPills: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  presetPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  presetPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0284C7',
  },
  addRefillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0284C7',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: radius.md,
    shadowColor: '#0284C7',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  btnIcon: {
    marginRight: 6,
  },
  addRefillBtnText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0284C7',
    borderRadius: radius.md,
    paddingHorizontal: 4,
    paddingVertical: 3,
    gap: 8,
    shadowColor: '#0284C7',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  stepperBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
  },
  stepperValue: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.white,
    minWidth: 20,
    textAlign: 'center',
  },
});
