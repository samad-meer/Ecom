import React, { useContext } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AuthContext } from '../context/AuthContext';
import { useBrand } from '../context/BrandContext';
import { colors, radius, shadow } from '../theme';

/**
 * The admin's top bar: a deep-blue block with soft overlapping circles for
 * depth and rounded bottom corners. A white avatar ringed in sunny yellow sits
 * beside the greeting, a frosted bell opens notifications, and a chip row
 * names the business and the role.
 *
 * The app is edge-to-edge, so this paints its own status-bar strip: the clock
 * and battery sit on blue instead of crowding the title.
 */
export const AdminHeader = ({ navigation }: { navigation: any }) => {
  const insets = useSafeAreaInsets();
  const { user } = useContext(AuthContext);
  const { name: brandName } = useBrand();
  // Light status-bar icons only while this bar is the one on screen; screens
  // pushed on top have a pale header and need the dark icons back.
  const focused = useIsFocused();

  const name = user?.first_name || user?.username || 'Admin';
  const initial = name.trim().charAt(0).toUpperCase() || 'A';

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 14 }]}>
      {focused && <StatusBar style="light" />}

      {/* Decoration only: clipped to the rounded block, never touchable. */}
      <View style={styles.clip} pointerEvents="none">
        <View style={styles.circleBig} />
        <View style={styles.circleSmall} />
        <View style={styles.circleSun} />
      </View>

      <View style={styles.topRow}>
        <TouchableOpacity
          style={styles.avatarRing}
          onPress={() => navigation.navigate('Profile')}
          accessibilityRole="button"
          accessibilityLabel="Open profile"
        >
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
        </TouchableOpacity>

        <View style={styles.textCol}>
          <Text style={styles.greeting}>Assalamu alaikum</Text>
          <Text style={styles.name} numberOfLines={1}>{name}</Text>
        </View>

        <TouchableOpacity
          style={styles.bell}
          onPress={() => navigation.navigate('AdminNotification')}
          accessibilityRole="button"
          accessibilityLabel="Open notifications"
        >
          <Ionicons name="notifications-outline" size={22} color={colors.white} />
        </TouchableOpacity>
      </View>

      <View style={styles.chipRow}>
        <View style={[styles.chip, styles.brandChip]}>
          <Ionicons name="water" size={14} color={colors.sun} />
          <Text style={styles.chipText} numberOfLines={1}>{brandName}</Text>
        </View>
        <View style={styles.roleBadge}>
          <Ionicons name="shield-checkmark" size={13} color={colors.ink} />
          <Text style={styles.roleText}>Admin</Text>
        </View>
      </View>
    </View>
  );
};

const GLASS = 'rgba(255,255,255,0.16)';

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: colors.primary,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    ...shadow.float,
  },
  clip: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  circleBig: {
    position: 'absolute', right: -50, top: -70, width: 220, height: 220, borderRadius: 110,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  circleSmall: {
    position: 'absolute', right: 70, bottom: -50, width: 120, height: 120, borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  circleSun: {
    position: 'absolute', left: -28, bottom: -34, width: 90, height: 90, borderRadius: 45,
    backgroundColor: 'rgba(255,210,63,0.22)',
  },

  topRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatarRing: {
    width: 54, height: 54, borderRadius: 27,
    borderWidth: 2.5, borderColor: colors.sun,
    alignItems: 'center', justifyContent: 'center',
  },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.white,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 21, fontWeight: '800', color: colors.primary },
  textCol: { flex: 1, minWidth: 0 },
  greeting: { fontSize: 13, fontWeight: '700', color: colors.primarySoft, letterSpacing: 0.3 },
  name: { fontSize: 24, fontWeight: '800', color: colors.white, marginTop: 1, letterSpacing: -0.3 },
  bell: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: GLASS,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.24)',
    alignItems: 'center', justifyContent: 'center',
  },

  chipRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    height: 30, paddingHorizontal: 12, borderRadius: radius.pill,
    backgroundColor: GLASS,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.24)',
  },
  brandChip: { flexShrink: 1 },
  chipText: { flexShrink: 1, fontSize: 13, fontWeight: '700', color: colors.white },
  roleBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    height: 30, paddingHorizontal: 12, borderRadius: radius.pill,
    backgroundColor: colors.sun,
  },
  roleText: { fontSize: 12, fontWeight: '800', color: colors.ink, textTransform: 'uppercase', letterSpacing: 0.6 },
});
