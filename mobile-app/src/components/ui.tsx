import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, space } from '../theme';

/**
 * Small pieces every screen shares, so a failed load, an empty list and a
 * status read the same everywhere.
 */

/** The reason a load failed, in words a person can act on. */
export const friendlyError = (message?: string | null): string => {
  const raw = (message || '').trim();
  if (!raw) return 'Something went wrong. Please try again.';
  if (/network request failed|failed to fetch|timeout|aborted/i.test(raw)) {
    return 'Cannot reach the server. Check your internet connection and try again.';
  }
  if (/not valid for any token|token.*expired|credentials were not provided/i.test(raw)) {
    return 'Your session has expired. Please sign out and sign in again.';
  }
  return raw;
};

interface ErrorStateProps {
  /** The real error text. It is shown, not hidden behind a generic line. */
  message?: string | null;
  onRetry?: () => void;
  title?: string;
  style?: StyleProp<ViewStyle>;
}

export const ErrorState: React.FC<ErrorStateProps> = ({ message, onRetry, title = 'Could not load this', style }) => (
  <View style={[styles.stateBox, style]}>
    <View style={[styles.stateIcon, { backgroundColor: colors.dangerBg }]}>
      <Ionicons name="cloud-offline-outline" size={30} color={colors.danger} />
    </View>
    <Text style={styles.stateTitle}>{title}</Text>
    <Text style={styles.stateText}>{friendlyError(message)}</Text>
    {onRetry ? (
      <TouchableOpacity style={styles.retryBtn} onPress={onRetry} accessibilityLabel="Try again">
        <Ionicons name="refresh" size={17} color={colors.white} />
        <Text style={styles.retryText}>Try again</Text>
      </TouchableOpacity>
    ) : null}
  </View>
);

interface EmptyStateProps {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  text?: string;
  style?: StyleProp<ViewStyle>;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon = 'file-tray-outline', title, text, style }) => (
  <View style={[styles.stateBox, style]}>
    <View style={[styles.stateIcon, { backgroundColor: colors.primaryTint }]}>
      <Ionicons name={icon} size={30} color={colors.primary} />
    </View>
    <Text style={styles.stateTitle}>{title}</Text>
    {text ? <Text style={styles.stateText}>{text}</Text> : null}
  </View>
);

export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'primary' | 'neutral';

const TONES: Record<Tone, { bg: string; fg: string }> = {
  success: { bg: colors.successBg, fg: colors.success },
  warning: { bg: colors.warningBg, fg: colors.warningText },
  danger: { bg: colors.dangerBg, fg: colors.danger },
  info: { bg: colors.infoBg, fg: colors.info },
  primary: { bg: colors.primaryTint, fg: colors.primaryDark },
  neutral: { bg: colors.lineSoft, fg: colors.textSecondary },
};

/** A status as a coloured pill that always carries a word. */
export const StatusPill: React.FC<{ label: string; tone?: Tone; icon?: keyof typeof Ionicons.glyphMap; style?: StyleProp<ViewStyle> }> = ({
  label, tone = 'neutral', icon, style,
}) => {
  const t = TONES[tone];
  return (
    <View style={[styles.pill, { backgroundColor: t.bg }, style]}>
      {icon ? <Ionicons name={icon} size={13} color={t.fg} /> : null}
      <Text style={[styles.pillText, { color: t.fg }]} numberOfLines={1}>{label}</Text>
    </View>
  );
};

/** Order status words to a pill colour. */
export const orderStatusTone = (status: string): Tone => {
  switch (status) {
    case 'Pending': return 'warning';
    case 'Processing': return 'primary';
    case 'Shipped': return 'info';
    case 'Delivered': return 'success';
    case 'Cancelled': return 'danger';
    default: return 'neutral';
  }
};

const styles = StyleSheet.create({
  stateBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48, paddingHorizontal: space.xxl, gap: 8 },
  stateIcon: { width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  stateTitle: { fontSize: 18, fontWeight: '800', color: colors.ink, textAlign: 'center' },
  stateText: { fontSize: 14, color: colors.muted, textAlign: 'center', lineHeight: 20 },
  retryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10,
    height: 46, paddingHorizontal: 22, borderRadius: radius.md, backgroundColor: colors.primary,
  },
  retryText: { color: colors.white, fontSize: 15, fontWeight: '800' },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill,
  },
  pillText: { fontSize: 12, fontWeight: '800' },
});
