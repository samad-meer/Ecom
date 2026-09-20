import React, { useCallback, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import {
  ActivityIndicator, AppState, Linking, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AuthContext } from '../context/AuthContext';
import {
  TrackingState,
  getTrackingStatus,
  refreshTrackingStatus,
  retryRiderTracking,
  subscribeTrackingStatus,
} from '../services/locationService';

/**
 * A rider cannot use the app unless dispatch can see their van.
 *
 * The business runs on knowing where the water is, so a rider working with
 * sharing switched off is not a degraded state to warn about — it is a state
 * the app refuses to operate in. This stands in front of the rider's whole
 * navigator, so there is nothing behind it to reach.
 *
 * THE RULE: block only when the RIDER'S PHONE is withholding location. Never
 * block because the SERVER'S POLICY asked for less than continuous background
 * sharing. Getting this backwards turns a settings dropdown into a kill switch
 * for the whole fleet, and two of the three tracking modes do exactly that if
 * you simply block everything that is not 'active':
 *
 *   active_delivery — an idle rider with no open order lands on 'off' BY
 *     DESIGN ("sharing starts when a delivery is assigned to you"). Blocking it
 *     walls out every rider at shift start, between rounds, and the moment they
 *     close their last job — the app restarts tracking right after a delivery,
 *     so they get ejected while the success alert is still up.
 *   foreground — the server sets wantsBackground=false, so the state is always
 *     'foreground_only'. Blocking it locks out the entire fleet with a button
 *     telling them to grant a permission that cannot help, because the phone
 *     was never the thing refusing.
 *
 * Also never blocked: 'disabled_by_admin' (the office turned tracking off on
 * purpose), 'starting' (transient — a spinner, not a wall), and 'unsupported'
 * (the rider can do nothing about it, so a wall would strand them for good;
 * the office can see they are not reporting).
 *
 * Signing out is always reachable. A rider stopped by a phone problem must
 * still be able to hand the device over or switch accounts.
 */

/**
 * Is the phone the obstacle, and can the rider clear it?
 *
 * Anything that is a consequence of the office's own tracking_mode is allowed
 * through — the rider cannot fix a server-side policy from a settings screen.
 */
const isBlocked = (state: TrackingState, mode: string | null): boolean => {
  switch (state) {
    // The rider denied location, or the phone's GPS is switched off. Both are
    // theirs to fix, and both mean dispatch genuinely cannot see them.
    case 'needs_permission':
    case 'services_off':
      return true;

    // Only a problem when the office actually asked for background sharing.
    // Under mode 'foreground' this IS the requested state.
    case 'foreground_only':
      return mode !== 'foreground';

    // 'off' is the normal resting state for an idle rider under
    // 'active_delivery'. It only means something is wrong when the office
    // asked for continuous sharing and it is not running. A null mode means
    // the config has not loaded yet — fail open rather than strand anyone.
    case 'off':
      return mode === 'always';

    default:
      // active, disabled_by_admin, starting, unsupported
      return false;
  }
};

interface Copy {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  action: string | null;
}

const COPY: Record<TrackingState, Copy> = {
  needs_permission: {
    icon: 'location-outline',
    title: 'Location sharing is required',
    body: 'Dispatch needs to see your van to send you deliveries. Allow location access to start work.',
    action: 'Allow location',
  },
  foreground_only: {
    icon: 'navigate-circle-outline',
    title: 'Background location is required',
    body: 'Right now your location stops the moment the app closes. Set location access to "Allow all the time" to start work.',
    action: 'Fix permission',
  },
  services_off: {
    icon: 'warning-outline',
    title: 'Phone location is switched off',
    body: 'Turn on Location in your phone settings, then try again.',
    action: 'Try again',
  },
  off: {
    icon: 'location-outline',
    title: 'Location sharing is off',
    body: 'Sharing has not started yet. Try again to begin your shift.',
    action: 'Start sharing',
  },
  unsupported: {
    icon: 'phone-portrait-outline',
    title: 'This phone cannot share location',
    body: 'Background location is not available on this device, so deliveries cannot be assigned to it. Please contact the office.',
    action: null,
  },
  // Present for exhaustiveness; isBlocked() never returns true for these.
  active: { icon: 'navigate-circle', title: '', body: '', action: null },
  disabled_by_admin: { icon: 'eye-off-outline', title: '', body: '', action: null },
  starting: { icon: 'sync-outline', title: '', body: '', action: null },
};

export const RiderLocationGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const status = useSyncExternalStore(subscribeTrackingStatus, getTrackingStatus);
  const { logout } = useContext(AuthContext);
  const [busy, setBusy] = useState(false);
  // locationService starts every launch at state 'off' and only learns the
  // truth once refreshTrackingStatus() resolves. Rendering the block screen
  // before that would flash a red "sharing is off" wall at a rider whose
  // sharing is perfectly fine, every single cold start.
  const [checked, setChecked] = useState(false);

  // The rider fixes this in the OS settings app and comes back, so the state
  // has to be re-read on resume or they would return to the same wall.
  useEffect(() => {
    void refreshTrackingStatus().finally(() => setChecked(true));
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void refreshTrackingStatus();
    });
    return () => sub.remove();
  }, []);

  const onFix = useCallback(async () => {
    setBusy(true);
    try {
      // Once the OS has stopped asking, only the settings screen can help.
      if (status.state === 'needs_permission' && !status.canAskAgain) {
        await Linking.openSettings();
        return;
      }
      if (status.state === 'foreground_only') {
        await Linking.openSettings();
        return;
      }
      await retryRiderTracking();
    } finally {
      setBusy(false);
    }
  }, [status.state, status.canAskAgain]);

  if (!isBlocked(status.state, status.mode)) return <>{children}</>;

  if (!checked || status.state === 'starting') {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.starting}>
          {checked ? 'Starting location sharing…' : 'Checking location sharing…'}
        </Text>
      </SafeAreaView>
    );
  }

  const copy = COPY[status.state];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.iconWrap}>
        <Ionicons name={copy.icon} size={38} color="#FF3B30" />
      </View>

      <Text style={styles.title}>{copy.title}</Text>
      <Text style={styles.body}>{copy.body}</Text>
      {status.detail ? <Text style={styles.detail}>{status.detail}</Text> : null}

      {copy.action ? (
        <TouchableOpacity
          style={[styles.primary, busy && styles.primaryDisabled]}
          onPress={onFix}
          disabled={busy}
          accessibilityRole="button"
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryText}>{copy.action}</Text>
          )}
        </TouchableOpacity>
      ) : null}

      <TouchableOpacity style={styles.signOut} onPress={() => void logout()}>
        <Text style={styles.signOutText}>Sign out</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: '#f5f7fa',
    alignItems: 'center', justifyContent: 'center', padding: 28, gap: 4,
  },
  iconWrap: {
    width: 78, height: 78, borderRadius: 39, backgroundColor: '#FF3B3014',
    alignItems: 'center', justifyContent: 'center', marginBottom: 18,
  },
  title: { fontSize: 20, fontWeight: '700', color: '#1a2530', textAlign: 'center' },
  body: {
    fontSize: 14.5, color: '#5b6672', textAlign: 'center',
    lineHeight: 21, marginTop: 10,
  },
  detail: { fontSize: 12.5, color: '#8a929b', textAlign: 'center', marginTop: 10, lineHeight: 18 },
  starting: { fontSize: 14.5, color: '#5b6672', marginTop: 14 },
  primary: {
    marginTop: 26, backgroundColor: '#007AFF', borderRadius: 12,
    paddingVertical: 15, paddingHorizontal: 34, minWidth: 220, alignItems: 'center',
  },
  primaryDisabled: { backgroundColor: '#a0c4ff' },
  primaryText: { color: '#fff', fontSize: 15.5, fontWeight: '700' },
  signOut: { marginTop: 18, padding: 10 },
  signOutText: { fontSize: 14, fontWeight: '600', color: '#8a929b' },
});
