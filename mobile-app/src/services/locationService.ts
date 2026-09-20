import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { AppState, NativeEventSubscription } from 'react-native';
import { API_URL } from '../constants/config';
import { getAuthToken } from './authService';
import { getDeliveryOrders } from './orderService';
import type { TrackingConfig, TrackingMode } from './adminService';

/* ============================================================================
 *  Rider background location
 *  ---------------------------------------------------------------------------
 *  Riders share their position with dispatch. Customers and admins never do —
 *  every entry point here is gated on the caller having already checked
 *  user_type === 'delivery_boy'.
 *
 *  The task below is defined at MODULE scope on purpose. Android can kill the
 *  app and later restart the JS bundle headlessly to deliver a location batch;
 *  if the task were defined inside a component it would not exist in that
 *  restarted context and the batch would be dropped. index.ts imports this
 *  module so the definition runs before anything renders.
 * ==========================================================================*/

export const LOCATION_TASK_NAME = 'century-sip-rider-location';

const QUEUE_KEY = '@location_queue';
const CONFIG_KEY = '@tracking_config';
const CONFIG_FETCHED_KEY = '@tracking_config_at';
const LAST_SENT_KEY = '@location_last_sent';

/** Server rejects a batch over 200 fixes. */
const MAX_BATCH = 200;
/**
 * Roughly two days of breadcrumbs at the 60s default. Past this the oldest
 * fixes are dropped: an unbounded queue on a rider who is permanently out of
 * credit eventually fills the device and takes the whole app down with it.
 */
const MAX_QUEUE = 2000;
/** Drain a backlog over several requests instead of one 2,000-fix burst. */
const MAX_FLUSH_BATCHES = 5;
/** Server rejects fixes more than 5 minutes ahead; leave a minute of margin. */
const MAX_CLOCK_SKEW_MS = 4 * 60 * 1000;
/** Below this a van is parked, not driving. */
const MOVING_KMH = 3;
/**
 * How stale a cached config may get before the background task re-fetches it.
 * This is what makes tracking_enabled=false a real kill switch for a phone
 * whose owner never opens the app.
 */
const CONFIG_MAX_AGE_MS = 60 * 60 * 1000;

const DEFAULT_CONFIG: TrackingConfig = {
  tracking_enabled: true,
  tracking_mode: 'always',
  ping_interval_seconds: 60,
  ping_distance_meters: 50,
  trail_retention_days: 7,
  stale_after_minutes: 10,
  updated_at: '',
};

interface LocationPing {
  latitude: number;
  longitude: number;
  accuracy_m?: number | null;
  speed_kmh?: number | null;
  heading?: number | null;
  is_moving?: boolean;
  recorded_at?: string;
}

// ─── Status store ─────────────────────────────────────────────────────────────

export type TrackingState =
  | 'off'
  | 'starting'
  /** Background updates are running — position is shared even with the app closed. */
  | 'active'
  /** Only the foreground watcher is running; the pin freezes when the app closes. */
  | 'foreground_only'
  | 'needs_permission'
  | 'services_off'
  | 'disabled_by_admin'
  | 'unsupported';

export interface TrackingStatus {
  state: TrackingState;
  mode: TrackingMode | null;
  /** Fixes waiting for signal. Non-zero is normal in a basement, not an error. */
  queued: number;
  lastSentAt: string | null;
  /** One line the rider can act on, shown verbatim in the banner. */
  detail: string;
  /** False when the OS will no longer show a prompt — the fix is in Settings. */
  canAskAgain: boolean;
}

let status: TrackingStatus = {
  state: 'off',
  mode: null,
  queued: 0,
  lastSentAt: null,
  detail: '',
  canAskAgain: true,
};

const listeners = new Set<(next: TrackingStatus) => void>();

const setStatus = (patch: Partial<TrackingStatus>) => {
  status = { ...status, ...patch };
  listeners.forEach((listener) => listener(status));
};

export const getTrackingStatus = (): TrackingStatus => status;

export const subscribeTrackingStatus = (listener: (next: TrackingStatus) => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/**
 * Re-read the counters the background task writes. The task may have run in a
 * headless JS context with its own module state, so the in-memory status can be
 * behind what actually happened on disk.
 */
export const refreshTrackingStatus = async (): Promise<void> => {
  try {
    const [queue, lastSent] = await Promise.all([readQueue(), AsyncStorage.getItem(LAST_SENT_KEY)]);
    setStatus({ queued: queue.length, lastSentAt: lastSent });
  } catch (error) {
    console.error('❌ Tracking status refresh failed:', error);
  }
};

// ─── Tracking config ──────────────────────────────────────────────────────────

const readCachedConfig = async (): Promise<TrackingConfig> => {
  try {
    const raw = await AsyncStorage.getItem(CONFIG_KEY);
    if (!raw) return DEFAULT_CONFIG;
    return { ...DEFAULT_CONFIG, ...(JSON.parse(raw) as Partial<TrackingConfig>) };
  } catch {
    return DEFAULT_CONFIG;
  }
};

/**
 * Pull the live config, falling back to the last cached copy. Never throws —
 * a rider with no signal keeps tracking on yesterday's settings rather than
 * stopping because a config fetch failed.
 */
export const fetchTrackingConfig = async (): Promise<TrackingConfig> => {
  const token = await getAuthToken();
  if (!token) return readCachedConfig();

  try {
    const res = await fetch(`${API_URL}/auth/tracking-config/`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      console.warn('⚠️ Tracking config fetch failed:', res.status);
      return readCachedConfig();
    }
    const config = { ...DEFAULT_CONFIG, ...((await res.json()) as Partial<TrackingConfig>) };
    await AsyncStorage.multiSet([
      [CONFIG_KEY, JSON.stringify(config)],
      [CONFIG_FETCHED_KEY, String(Date.now())],
    ]);
    return config;
  } catch (error) {
    console.error('❌ Tracking config error:', error);
    return readCachedConfig();
  }
};

/** Config refresh from inside the background task, at most hourly. */
const configForTask = async (): Promise<TrackingConfig> => {
  try {
    const fetchedAt = Number(await AsyncStorage.getItem(CONFIG_FETCHED_KEY)) || 0;
    if (Date.now() - fetchedAt < CONFIG_MAX_AGE_MS) return readCachedConfig();
  } catch {
    // Unreadable timestamp — treat it as due for a refresh.
  }
  return fetchTrackingConfig();
};

// ─── Offline queue ────────────────────────────────────────────────────────────

const readQueue = async (): Promise<LocationPing[]> => {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as LocationPing[]) : [];
  } catch {
    return [];
  }
};

const writeQueue = async (pings: LocationPing[]): Promise<void> => {
  try {
    // Keep the NEWEST when over the cap — an old fix nobody has seen is worth
    // less than the one that tells dispatch where the van is now.
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(pings.slice(-MAX_QUEUE)));
  } catch (error) {
    console.error('❌ Location queue write failed:', error);
  }
};

// ─── Posting ──────────────────────────────────────────────────────────────────

/**
 * `drop` means the batch will never be accepted, so it must leave the queue —
 * otherwise one malformed fix wedges every fix behind it forever.
 */
type PostResult = 'sent' | 'drop' | 'retry';

const postPings = async (pings: LocationPing[]): Promise<PostResult> => {
  const token = await getAuthToken();
  if (!token) {
    console.warn('⚠️ Location ping not sent: no auth token.');
    return 'retry';
  }

  try {
    const res = await fetch(`${API_URL}/auth/rider/location/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ pings }),
    });

    if (res.ok) {
      console.log('📡 Location pings accepted:', pings.length);
      return 'sent';
    }
    if (res.status === 400) {
      console.warn('❌ Location batch rejected, discarding:', await res.text());
      return 'drop';
    }
    if (res.status === 403) {
      // The account is not (or is no longer) a rider. Keep pushing and it would
      // 403 forever, so shut the whole thing down instead.
      console.warn('❌ Location tracking forbidden for this account — stopping.');
      void stopRiderTracking('This account is not set up as a rider.');
      return 'drop';
    }
    console.warn('❌ Location ping failed:', res.status);
    return 'retry';
  } catch (error) {
    console.error('❌ Location ping error:', error);
    return 'retry';
  }
};

const runFlush = async (fresh: LocationPing[]): Promise<boolean> => {
  let pending = [...(await readQueue()), ...fresh];
  if (pending.length === 0) return true;

  let drained = true;
  for (let attempt = 0; attempt < MAX_FLUSH_BATCHES && pending.length > 0; attempt++) {
    const batch = pending.slice(0, MAX_BATCH);
    const result = await postPings(batch);
    if (result === 'retry') {
      drained = false;
      break;
    }
    pending = pending.slice(batch.length);
    if (result === 'sent') {
      const sentAt = new Date().toISOString();
      await AsyncStorage.setItem(LAST_SENT_KEY, sentAt).catch(() => undefined);
      setStatus({ lastSentAt: sentAt });
    }
  }

  await writeQueue(pending);
  setStatus({ queued: Math.min(pending.length, MAX_QUEUE) });
  return drained;
};

/**
 * Serialised entry point. The delivered batch, the foreground watcher and the
 * logout flush can all land at once, and a queue is a read-modify-write — two
 * of them interleaved silently lose or duplicate breadcrumbs.
 *
 * `fresh` is sent together with whatever is already queued, oldest first. The
 * server rejects a whole batch if any one fix is invalid, so a retry re-sends
 * the batch intact rather than guessing which fix upset it.
 */
let flushChain: Promise<unknown> = Promise.resolve();

const flushQueue = (fresh: LocationPing[]): Promise<boolean> => {
  const next = flushChain.then(() => runFlush(fresh), () => runFlush(fresh));
  flushChain = next.catch(() => undefined);
  return next;
};

/** Push anything still queued. Used on logout, while the token is still valid. */
export const flushPendingPings = (): Promise<boolean> => flushQueue([]);

const toPing = (fix: Location.LocationObject): LocationPing => {
  const { coords, timestamp } = fix;
  // expo reports -1 for "unknown"; the server maps negatives to null itself,
  // but speed still has to be converted from m/s to km/h on the way out.
  const speedKmh = coords.speed != null && coords.speed >= 0 ? coords.speed * 3.6 : null;

  const ping: LocationPing = {
    latitude: coords.latitude,
    longitude: coords.longitude,
    accuracy_m: coords.accuracy,
    speed_kmh: speedKmh,
    heading: coords.heading,
    is_moving: speedKmh != null && speedKmh >= MOVING_KMH,
  };

  // A phone whose clock runs fast would have its recorded_at rejected, and one
  // bad fix rejects every fix batched with it. Omitting the field lets the
  // server stamp the row instead — worse ordering, but the fix survives.
  if (timestamp && timestamp <= Date.now() + MAX_CLOCK_SKEW_MS) {
    ping.recorded_at = new Date(timestamp).toISOString();
  }
  return ping;
};

// ─── Background task ──────────────────────────────────────────────────────────

TaskManager.defineTask<{ locations: Location.LocationObject[] }>(
  LOCATION_TASK_NAME,
  async ({ data, error }) => {
    if (error) {
      console.error('❌ Location task error:', error.message);
      return;
    }

    const fixes = data?.locations ?? [];
    if (fixes.length === 0) return;

    const config = await configForTask();
    if (!config.tracking_enabled || config.tracking_mode === 'foreground') {
      // The kill switch was thrown while this device was offline. Push what is
      // already queued, then take the service down.
      await flushQueue(fixes.map(toPing));
      await stopBackgroundUpdates();
      return;
    }

    await flushQueue(fixes.map(toPing));
  },
);

// ─── Permissions ──────────────────────────────────────────────────────────────

interface TrackingPermissions {
  foreground: boolean;
  background: boolean;
  /** False once the rider has picked "Don't ask again" — only Settings helps. */
  canAskAgain: boolean;
}

/**
 * Foreground first, then background as a SEPARATE second prompt. Android hard-
 * denies "Allow all the time" if it is bundled into the same request as the
 * initial grant, and the rider is then stuck with no way back except the system
 * settings screen.
 *
 * `prompt` is false on app resume: re-asking on every resume trains riders to
 * dismiss the dialog, and a denied permission would raise it forever.
 */
const resolvePermissions = async (
  needBackground: boolean,
  prompt: boolean,
): Promise<TrackingPermissions> => {
  const foreground = prompt
    ? await Location.requestForegroundPermissionsAsync()
    : await Location.getForegroundPermissionsAsync();

  if (foreground.status !== 'granted') {
    return { foreground: false, background: false, canAskAgain: foreground.canAskAgain };
  }
  if (!needBackground) return { foreground: true, background: false, canAskAgain: true };

  const background = prompt
    ? await Location.requestBackgroundPermissionsAsync()
    : await Location.getBackgroundPermissionsAsync();

  return {
    foreground: true,
    background: background.status === 'granted',
    canAskAgain: background.canAskAgain,
  };
};

// ─── Start / stop ─────────────────────────────────────────────────────────────

let foregroundWatch: Location.LocationSubscription | null = null;
let appStateSub: NativeEventSubscription | null = null;
/** Restarting the service flickers the notification, so only do it on a change. */
let runningKey: string | null = null;

const stopBackgroundUpdates = async (): Promise<void> => {
  runningKey = null;
  try {
    if (await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME)) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
    }
  } catch (error) {
    console.error('❌ Failed to stop location updates:', error);
  }
};

const stopForegroundWatch = () => {
  foregroundWatch?.remove();
  foregroundWatch = null;
};

const startForegroundWatch = async (config: TrackingConfig): Promise<void> => {
  stopForegroundWatch();
  foregroundWatch = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: config.ping_interval_seconds * 1000,
      distanceInterval: config.ping_distance_meters,
    },
    (fix) => {
      void flushQueue([toPing(fix)]);
    },
  );
};

const startBackgroundUpdates = async (config: TrackingConfig): Promise<void> => {
  const key = `${config.ping_interval_seconds}|${config.ping_distance_meters}`;
  if (runningKey === key && (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME))) {
    return;
  }
  await stopBackgroundUpdates();

  await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
    // High/Highest keeps the GPS chip hot and will not survive a 10-hour shift.
    // Balanced is cell+wifi assisted and is well inside the accuracy a street
    // address needs.
    accuracy: Location.Accuracy.Balanced,
    timeInterval: config.ping_interval_seconds * 1000,
    distanceInterval: config.ping_distance_meters,
    deferredUpdatesInterval: config.ping_interval_seconds * 1000,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      // Android requires a foreground service for continuous background
      // location, and requires that service to show a permanent notification —
      // an app is not allowed to track someone invisibly. It cannot be hidden,
      // so the wording is kept neutral rather than announcing location on the
      // rider's lock screen all day. The OS still discloses tracking through
      // the status-bar location indicator, which is where that belongs.
      notificationTitle: 'Century Sip',
      notificationBody: 'On shift',
      notificationColor: '#0A84FF',
      // Survive a swipe-away: a rider who clears their recents is not asking
      // to go dark, and Android would otherwise never restart the service.
      killServiceOnDestroy: false,
    },
  });
  runningKey = key;
};

/**
 * Whether the rider currently has work. Only consulted in 'active_delivery'
 * mode — 'always' (the default) does not care.
 */
const hasActiveDelivery = async (): Promise<boolean> => {
  try {
    const orders = await getDeliveryOrders();
    const list = Array.isArray(orders) ? orders : [];
    return list.some((order: any) => order?.status !== 'Delivered' && order?.status !== 'Cancelled');
  } catch {
    // Can't tell. Assume there is work rather than going dark on a rider who is
    // mid-round with bad signal.
    return true;
  }
};

/**
 * Bring tracking in line with the server's config. Safe to call repeatedly —
 * on login, on app resume, and after the rider taps the banner.
 *
 * Callers must already have established that the signed-in user is a rider.
 * Pass `prompt` only for a deliberate user action; a resume must not raise a
 * permission dialog the rider did not ask for.
 */
export const startRiderTracking = async (
  { prompt = false }: { prompt?: boolean } = {},
): Promise<void> => {
  if (!Device.isDevice) {
    console.log('Must use physical device for location tracking');
    setStatus({
      state: 'unsupported',
      detail: 'Location sharing needs a real phone — it is off on this simulator.',
    });
    return;
  }

  setStatus({ state: 'starting', detail: 'Checking location settings…' });
  await refreshTrackingStatus();

  const config = await fetchTrackingConfig();
  setStatus({ mode: config.tracking_mode });

  if (!config.tracking_enabled) {
    await stopBackgroundUpdates();
    stopForegroundWatch();
    // Still listen for resume, or switching tracking back on in Django admin
    // would need every rider to log out and back in.
    watchAppState();
    setStatus({
      state: 'disabled_by_admin',
      detail: 'The office has switched location sharing off. Nothing is being sent.',
    });
    return;
  }

  const wantsBackground = config.tracking_mode !== 'foreground';
  const permissions = await resolvePermissions(wantsBackground, prompt);
  setStatus({ canAskAgain: permissions.canAskAgain });

  if (!permissions.foreground) {
    await stopBackgroundUpdates();
    stopForegroundWatch();
    watchAppState();
    setStatus({
      state: 'needs_permission',
      detail: 'Location permission is off, so dispatch cannot see you. Deliveries still work.',
    });
    return;
  }

  if (!(await Location.hasServicesEnabledAsync())) {
    await stopBackgroundUpdates();
    stopForegroundWatch();
    watchAppState();
    setStatus({
      state: 'services_off',
      detail: "Your phone's location is switched off. Turn it on to share your position.",
    });
    return;
  }

  if (config.tracking_mode === 'active_delivery' && !(await hasActiveDelivery())) {
    await stopBackgroundUpdates();
    stopForegroundWatch();
    watchAppState();
    setStatus({
      state: 'off',
      detail: 'Sharing starts automatically when a delivery is assigned to you.',
    });
    return;
  }

  try {
    if (!wantsBackground || !permissions.background) {
      // Either the server asked for foreground-only, or the rider granted
      // "While using the app". Both give a watcher that stops with the app.
      await stopBackgroundUpdates();
      await startForegroundWatch(config);
      setStatus({
        state: 'foreground_only',
        detail: wantsBackground
          ? 'Only shared while this app is open. Set location to "Allow all the time" to share on shift.'
          : 'Shared only while this app is open — that is what the office has set.',
      });
    } else {
      stopForegroundWatch();
      await startBackgroundUpdates(config);
      setStatus({
        state: 'active',
        detail: 'Dispatch can see your van. Sharing continues while the app is closed.',
      });
    }
    watchAppState();
    void flushQueue([]);
  } catch (error) {
    console.error('❌ Failed to start location tracking:', error);
    setStatus({
      state: 'off',
      detail: 'Location sharing could not start. Deliveries are unaffected.',
    });
  }
};

/**
 * Tear everything down. `reason` replaces the banner text when tracking is
 * stopped by something the rider should know about rather than by logging out.
 */
export const stopRiderTracking = async (reason?: string): Promise<void> => {
  stopForegroundWatch();
  appStateSub?.remove();
  appStateSub = null;
  await stopBackgroundUpdates();
  try {
    if (await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME)) {
      await TaskManager.unregisterTaskAsync(LOCATION_TASK_NAME);
    }
  } catch (error) {
    console.error('❌ Failed to unregister location task:', error);
  }
  setStatus({ state: 'off', detail: reason ?? '' });
};

/**
 * Logout variant. The queue holds fixes belonging to the rider who is leaving,
 * and the next person to sign in on this phone would have them filed under
 * THEIR account — so flush while the token is still valid, then bin the rest.
 */
export const stopRiderTrackingForLogout = async (): Promise<void> => {
  await stopRiderTracking();
  try {
    await flushPendingPings();
  } catch (error) {
    console.error('❌ Final location flush failed:', error);
  }
  try {
    await AsyncStorage.multiRemove([QUEUE_KEY, CONFIG_KEY, CONFIG_FETCHED_KEY, LAST_SENT_KEY]);
  } catch (error) {
    console.error('❌ Failed to clear location storage:', error);
  }
  setStatus({ state: 'off', mode: null, queued: 0, lastSentAt: null, detail: '' });
};

/**
 * Re-evaluate on resume. Catches a permission granted in system settings, a
 * config change made in Django admin, and — in 'active_delivery' mode — an
 * order that was assigned while the app was in the background.
 */
const watchAppState = () => {
  if (appStateSub) return;
  appStateSub = AppState.addEventListener('change', (next) => {
    if (next === 'active') void startRiderTracking();
  });
};

/**
 * Re-run start with a live permission prompt. Wired to the rider's banner so a
 * denied grant is recoverable without a reinstall.
 */
export const retryRiderTracking = (): Promise<void> => startRiderTracking({ prompt: true });
