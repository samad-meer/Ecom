import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { colors, space, fontSize, card, pagePadding } from '../../theme';
import { RootStackParamList } from '../../types/navigation';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** Soft tint behind each icon so the tiles are told apart at a glance. */
const TONES = {
  primary: { fg: colors.primary, bg: colors.primaryTint },
  info: { fg: colors.info, bg: colors.infoBg },
  success: { fg: colors.success, bg: colors.successBg },
  mint: { fg: colors.mintText, bg: colors.mint },
  warning: { fg: colors.warningText, bg: colors.warningBg },
  sun: { fg: colors.ink, bg: colors.sun },
  neutral: { fg: colors.textSecondary, bg: colors.lineSoft },
} as const;

type ToneKey = keyof typeof TONES;

interface MenuItemProps {
  icon: keyof typeof Ionicons.glyphMap;
  tone: ToneKey;
  label: string;
  description: string;
  onPress: () => void;
}

function MenuItem({ icon, tone, label, description, onPress }: MenuItemProps) {
  const t = TONES[tone];
  return (
    <TouchableOpacity
      style={styles.item}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${description}`}
    >
      <View style={[styles.iconWrap, { backgroundColor: t.bg }]}>
        <Ionicons name={icon} size={24} color={t.fg} />
      </View>
      <View style={styles.itemText}>
        <Text style={styles.itemLabel}>{label}</Text>
        <Text style={styles.itemDesc}>{description}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.muted} />
    </TouchableOpacity>
  );
}

function SectionHeader({ title }: { title: string }) {
  return <Text style={styles.sectionHeader}>{title}</Text>;
}

export const AdminManageScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <SectionHeader title="PEOPLE" />
      <MenuItem
        icon="people"
        tone="primary"
        label="Staff Management"
        description="View, add, and update staff & riders"
        onPress={() => navigation.navigate('AdminStaff', { role: 'all' })}
      />
      <MenuItem
        icon="bicycle"
        tone="info"
        label="Riders"
        description="Delivery riders — profiles and password resets"
        onPress={() => navigation.navigate('AdminStaff', { role: 'riders' })}
      />

      <SectionHeader title="MONEY" />
      <MenuItem
        icon="wallet"
        tone="success"
        label="Customer Ledger"
        description="Balances, statements, payments & receipts"
        onPress={() => navigation.navigate('AdminLedger')}
      />

      <SectionHeader title="OPERATIONS" />
      <MenuItem
        icon="water"
        tone="mint"
        label="Plant / Deliveries"
        description="Ledger, daily records, and analytics"
        onPress={() => navigation.navigate('AdminPlant')}
      />
      <MenuItem
        icon="bag"
        tone="warning"
        label="Shop Management"
        description="Add, edit, and manage products"
        onPress={() => navigation.navigate('AdminShop')}
      />

      <SectionHeader title="CONFIGURATION" />
      <MenuItem
        icon="settings"
        tone="sun"
        label="Settings"
        description="Pricing, bottle types, customer types"
        onPress={() => navigation.navigate('AdminSettings')}
      />

      <SectionHeader title="COMMUNICATIONS" />
      <MenuItem
        icon="notifications"
        tone="primary"
        label="Push Notifications"
        description="Send alerts to customers or delivery staff"
        onPress={() => navigation.navigate('AdminNotification')}
      />

      <SectionHeader title="MONITORING" />
      <MenuItem
        icon="map"
        tone="info"
        label="Live Rider Map"
        description="Where every rider is right now, and today's routes"
        onPress={() => navigation.navigate('AdminRiderMap')}
      />
      <MenuItem
        icon="pulse"
        tone="neutral"
        label="Activity Log"
        description="Track every important action in the system"
        onPress={() => navigation.navigate('AdminActivity')}
      />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: pagePadding, paddingTop: space.xs, paddingBottom: space.xxl },
  sectionHeader: {
    fontSize: fontSize.xs,
    fontWeight: '800',
    color: colors.muted,
    letterSpacing: 0.8,
    marginTop: space.xl,
    marginBottom: space.sm,
    marginLeft: space.xs,
  },
  item: {
    ...card,
    flexDirection: 'row',
    alignItems: 'center',
    padding: space.lg,
    gap: 14,
    minHeight: 84,
    marginBottom: space.md,
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemText: { flex: 1, gap: 2 },
  itemLabel: { fontSize: fontSize.md, fontWeight: '800', color: colors.ink },
  itemDesc: { fontSize: fontSize.sm, color: colors.muted, lineHeight: 19 },
});
