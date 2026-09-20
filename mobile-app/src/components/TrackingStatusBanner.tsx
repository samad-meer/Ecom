import React, { useCallback, useEffect, useSyncExternalStore } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import {
  TrackingState,
  getTrackingStatus,
  refreshTrackingStatus,
  retryRiderTracking,
  subscribeTrackingStatus,
} from '../services/locationService';

/**
 * The rider's honest indicator that dispatch can see them. Tracking staff
 * without telling them is both a Play policy violation and simply wrong, so
 * this sits at the top of the Deliveries tab — the screen a rider lives on —
 * and says what is actually happening, including when nothing is being sent.
 */

interface Look {
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  /** Label for the action button; omitted when there is nothing to fix. */
  action?: string;
}

const LOOKS: Record<TrackingState, Look | null> = {
  // Nothing to say when it is simply working: the rider is told at sign-in
  // that dispatch can see them, the OS shows its own persistent notification
  // while background location runs, and RiderLocationGate does not let them
  // reach this screen at all unless sharing is on. A permanent green banner
  // on top of the delivery list was just noise.
  active: null,
  foreground_only: {
    color: '#FF9500',
    icon: 'navigate-circle-outline',
    title: 'Sharing only while the app is open',
    action: 'Fix',
  },
  needs_permission: {
    color: '#FF3B30',
    icon: 'location-outline',
    title: 'Location sharing is OFF',
    action: 'Allow',
  },
  services_off: {
    color: '#FF3B30',
    icon: 'warning-outline',
    title: 'Phone location is switched off',
    action: 'Retry',
  },
  disabled_by_admin: {
    color: '#8E8E93',
    icon: 'eye-off-outline',
    title: 'Location sharing is OFF',
  },
  unsupported: { color: '#8E8E93', icon: 'phone-portrait-outline', title: 'Location sharing is OFF' },
  starting: { color: '#007AFF', icon: 'sync-outline', title: 'Starting location sharing…' },
  off: { color: '#8E8E93', icon: 'location-outline', title: 'Location sharing is OFF' },
};

export const TrackingStatusBanner: React.FC = () => {
  const status = useSyncExternalStore(subscribeTrackingStatus, getTrackingStatus);

  useEffect(() => {
    void refreshTrackingStatus();
  }, []);

  // The queue is drained by a background task with its own module state, so the
  // count on screen is only trustworthy if it is re-read when the rider looks.
  useFocusEffect(
    useCallback(() => {
      void refreshTrackingStatus();
    }, []),
  );

  const look = LOOKS[status.state];
  if (!look) return null;

  const onAction = () => {
    // Once the OS has stopped asking, only the settings screen can help.
    if (!status.canAskAgain && status.state === 'needs_permission') {
      void Linking.openSettings();
      return;
    }
    void retryRiderTracking();
  };

  return (
    <View style={[styles.banner, { borderLeftColor: look.color }]}>
      <View style={[styles.iconWrap, { backgroundColor: look.color + '18' }]}>
        <Ionicons name={look.icon} size={18} color={look.color} />
      </View>

      <View style={styles.text}>
        <Text style={[styles.title, { color: look.color }]}>{look.title}</Text>
        {status.detail ? <Text style={styles.detail}>{status.detail}</Text> : null}
        {status.queued > 0 ? (
          <Text style={styles.queued}>
            {status.queued} location{status.queued === 1 ? '' : 's'} saved offline — they will send
            when you have signal.
          </Text>
        ) : null}
      </View>

      {look.action ? (
        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: look.color }]} onPress={onAction}>
          <Text style={styles.actionText}>{look.action}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'white', borderRadius: 12, borderLeftWidth: 3,
    marginHorizontal: 16, marginTop: 12, padding: 12,
    elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 3,
  },
  iconWrap: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1 },
  title: { fontSize: 13, fontWeight: '700' },
  detail: { fontSize: 11, color: '#888', marginTop: 2, lineHeight: 15 },
  queued: { fontSize: 11, color: '#FF9500', marginTop: 4, lineHeight: 15 },
  actionBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 },
  actionText: { color: 'white', fontSize: 12, fontWeight: '700' },
});
