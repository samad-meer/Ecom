import { colors } from '../theme';
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useBrand } from '../context/BrandContext';

interface Props {
  message?: string;
}

export const LoadingScreen: React.FC<Props> = ({ message }) => {
  const { name: brandName } = useBrand();
  const pulse = useRef(new Animated.Value(1)).current;
  const dot1 = useRef(new Animated.Value(0.3)).current;
  const dot2 = useRef(new Animated.Value(0.3)).current;
  const dot3 = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    // Icon pulse
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.15, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    ).start();

    // Bouncing dots
    const dotAnim = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: 1, duration: 350, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0.3, duration: 350, useNativeDriver: true }),
          Animated.delay(700 - delay),
        ])
      );

    Animated.parallel([
      dotAnim(dot1, 0),
      dotAnim(dot2, 200),
      dotAnim(dot3, 400),
    ]).start();
  }, []);

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.iconRing, { transform: [{ scale: pulse }] }]}>
        <Ionicons name="water" size={44} color={colors.primary} />
      </Animated.View>

      <Text style={styles.brand}>{brandName}</Text>

      <View style={styles.dotsRow}>
        <Animated.View style={[styles.dot, { opacity: dot1 }]} />
        <Animated.View style={[styles.dot, { opacity: dot2 }]} />
        <Animated.View style={[styles.dot, { opacity: dot3 }]} />
      </View>

      {message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  iconRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.primaryTint,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  brand: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.ink,
    letterSpacing: 0.5,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 6,
    backgroundColor: colors.primary,
  },
  message: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 4,
  },
});
