import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, Linking, RefreshControl,
} from 'react-native';
import { useFocusEffect, useRoute, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, space, fontSize, shadow, card, pagePadding } from '../../theme';
import { LoadingScreen } from '../../components/LoadingScreen';
import { EmptyState, ErrorState, StatusPill, Tone, friendlyError } from '../../components/ui';
import { RiderMapView, RiderMapMarker } from '../../components/RiderMapView';
import { IS_MAPS_CONFIGURED } from '../../constants/mapsConfig';
import {
  adminService,
  RiderLocation,
  RiderTrailPoint,
  TrackingConfig,
} from '../../services/adminService';
import { RootStackParamList } from '../../types/navigation';

// ─── Config ───────────────────────────────────────────────────────────────────

/** Fast enough to feel live, slow enough not to melt a dispatcher's data plan. */
const REFRESH_MS = 20000;
/**
 * Past this a pin is history rather than a position. `stale` comes from the
 * server (stale_after_minutes); only "how far gone is gone" is a client call.
 */
const OFFLINE_AFTER_MINUTES = 60;

type Freshness = 'live' | 'stale' | 'offline';

/** Map pins and the dots on the summary tiles. */
const FRESHNESS_COLORS: Record<Freshness, string> = {
  live: colors.success,
  stale: colors.warning,
  offline: colors.muted,
};

const FRESHNESS_LABELS: Record<Freshness, string> = {
  live: 'Live',
  stale: 'Stale',
  offline: 'Offline',
};

const FRESHNESS_TONES: Record<Freshness, Tone> = {
  live: 'success',
  stale: 'warning',
  offline: 'neutral',
};

/** Initial-letter avatar: soft fill with a readable letter on it. */
const AVATAR_LOOK: Record<Freshness, { bg: string; fg: string }> = {
  live: { bg: colors.successBg, fg: colors.success },
  stale: { bg: colors.warningBg, fg: colors.warningText },
  offline: { bg: colors.lineSoft, fg: colors.textSecondary },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Local calendar day — toISOString() would roll over five hours early in PKT. */
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Riders are judged on freshness, so a pin never shows a wall-clock time. */
function agoLabel(minutes: number | null | undefined) {
  if (minutes == null || !Number.isFinite(minutes)) return '—';
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${Math.round(minutes)} min ago`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.round(hours)} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

/** Numeric detail with a unit; '—' rather than a misleading 0 when unknown. */
function fmt(value: number | null | undefined, unit: string, digits = 0) {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value.toFixed(digits)}${unit}`;
}

function freshnessOf(rider: RiderLocation, staleAfterMinutes: number): Freshness {
  const minutes = Number.isFinite(rider.minutes_ago) ? rider.minutes_ago : Number.MAX_SAFE_INTEGER;
  if (minutes <= staleAfterMinutes) return 'live';
  if (minutes <= OFFLINE_AFTER_MINUTES) return 'stale';
  return 'offline';
}

// ─── Summary cards ────────────────────────────────────────────────────────────

function SummaryCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={sc.card}>
      <Text style={sc.value}>{value}</Text>
      <View style={sc.labelRow}>
        <View style={[sc.dot, { backgroundColor: color }]} />
        <Text style={sc.label} numberOfLines={1}>{label}</Text>
      </View>
    </View>
  );
}

const sc = StyleSheet.create({
  card: {
    ...card,
    flex: 1,
    borderRadius: radius.lg,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
  },
  value: { fontSize: fontSize.lg, fontWeight: '800', color: colors.ink },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: { flexShrink: 1, fontSize: fontSize.xs, color: colors.muted },
});

// ─── Rider row ────────────────────────────────────────────────────────────────

function RiderRow({
  rider,
  freshness,
  selected,
  onPress,
}: {
  rider: RiderLocation;
  freshness: Freshness;
  selected: boolean;
  onPress: () => void;
}) {
  const look = AVATAR_LOOK[freshness];
  return (
    <TouchableOpacity
      style={[row.card, selected && row.cardSelected]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={[row.avatar, { backgroundColor: look.bg }]}>
        <Text style={[row.avatarText, { color: look.fg }]}>
          {(rider.name || rider.username).charAt(0).toUpperCase()}
        </Text>
      </View>
      <View style={row.info}>
        <Text style={row.name} numberOfLines={1}>{rider.name || rider.username}</Text>
        <Text style={row.sub} numberOfLines={1}>
          {agoLabel(rider.minutes_ago)}
          {rider.vehicle_number ? ` · ${rider.vehicle_number}` : ''}
        </Text>
        <View style={row.pillRow}>
          <StatusPill label={FRESHNESS_LABELS[freshness]} tone={FRESHNESS_TONES[freshness]} />
          {rider.active_orders > 0 && (
            <StatusPill
              label={`${rider.active_orders} order${rider.active_orders === 1 ? '' : 's'}`}
              tone="info"
            />
          )}
          {rider.is_moving && <StatusPill label="Moving" tone="primary" icon="navigate" />}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </TouchableOpacity>
  );
}

const row = StyleSheet.create({
  card: {
    ...card,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    marginBottom: space.md,
    borderWidth: 1.5,
  },
  cardSelected: { backgroundColor: colors.primaryTint, borderColor: colors.primary },
  avatar: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: fontSize.md, fontWeight: '800' },
  info: { flex: 1, gap: 2 },
  name: { fontSize: fontSize.md, fontWeight: '800', color: colors.ink },
  sub: { fontSize: fontSize.sm, color: colors.muted },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
});

// ─── Selected rider card ──────────────────────────────────────────────────────

function RiderCard({
  rider,
  freshness,
  showTrail,
  trailLoading,
  trailCount,
  onToggleTrail,
  onClose,
}: {
  rider: RiderLocation;
  freshness: Freshness;
  showTrail: boolean;
  trailLoading: boolean;
  trailCount: number;
  onToggleTrail: () => void;
  onClose: () => void;
}) {
  const color = FRESHNESS_COLORS[freshness];
  const look = AVATAR_LOOK[freshness];

  const call = () => {
    if (!rider.phone) {
      Alert.alert('No phone number', 'This rider has no phone number on file.');
      return;
    }
    Linking.openURL(`tel:${rider.phone}`).catch(() =>
      Alert.alert('Error', 'Could not open the dialler.'),
    );
  };

  return (
    <View style={panel.card}>
      <View style={panel.header}>
        <View style={[panel.avatar, { backgroundColor: look.bg }]}>
          <Text style={[panel.avatarText, { color: look.fg }]}>
            {(rider.name || rider.username).charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={panel.name} numberOfLines={1}>{rider.name || rider.username}</Text>
          <Text style={panel.sub} numberOfLines={1}>
            {rider.vehicle_number || `@${rider.username}`} · {rider.is_available ? 'Available' : 'Busy'}
          </Text>
        </View>
        <StatusPill label={FRESHNESS_LABELS[freshness]} tone={FRESHNESS_TONES[freshness]} />
        <TouchableOpacity onPress={onClose} style={panel.closeBtn} accessibilityLabel="Close rider details">
          <Ionicons name="close" size={20} color={colors.muted} />
        </TouchableOpacity>
      </View>

      <View style={panel.statRow}>
        <View style={panel.stat}>
          <Text
            style={[panel.statValue, { color }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.85}
          >
            {agoLabel(rider.minutes_ago)}
          </Text>
          <Text style={panel.statLabel}>Last seen</Text>
        </View>
        <View style={panel.stat}>
          <Text style={panel.statValue}>{rider.active_orders}</Text>
          <Text style={panel.statLabel}>Active orders</Text>
        </View>
        <View style={panel.stat}>
          <Text style={panel.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
            {fmt(rider.speed_kmh, ' km/h')}
          </Text>
          <Text style={panel.statLabel}>Speed</Text>
        </View>
        <View style={panel.stat}>
          <Text style={panel.statValue}>{fmt(rider.battery_level, '%')}</Text>
          <Text style={panel.statLabel}>Battery</Text>
        </View>
      </View>

      <Text style={panel.meta}>
        Accuracy {fmt(rider.accuracy_m, ' m')} · {rider.latitude.toFixed(5)}, {rider.longitude.toFixed(5)}
      </Text>

      <View style={panel.actionBar}>
        <TouchableOpacity style={[panel.actionBtn, panel.callBtn]} onPress={call}>
          <Ionicons name="call" size={18} color={colors.white} />
          <Text style={panel.actionText} numberOfLines={1}>{rider.phone || 'No phone'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            panel.actionBtn,
            showTrail ? panel.trailBtnOn : panel.trailBtnOff,
            !IS_MAPS_CONFIGURED && panel.disabled,
          ]}
          onPress={onToggleTrail}
          disabled={!IS_MAPS_CONFIGURED}
        >
          {trailLoading ? (
            <ActivityIndicator size="small" color={showTrail ? colors.white : colors.primary} />
          ) : (
            <Ionicons name="git-branch" size={18} color={showTrail ? colors.white : colors.primary} />
          )}
          <Text style={[panel.actionText, !showTrail && { color: colors.primary }]} numberOfLines={1}>
            {showTrail ? `Route · ${trailCount} pts` : "Today's route"}
          </Text>
        </TouchableOpacity>
      </View>

      {!IS_MAPS_CONFIGURED && (
        <Text style={panel.note}>The route needs a map to draw on — add a Maps key to use it.</Text>
      )}
    </View>
  );
}

const panel = StyleSheet.create({
  card: {
    ...card,
    ...shadow.float,
    marginHorizontal: pagePadding,
    marginTop: space.sm,
    marginBottom: space.md,
    padding: space.lg,
    gap: space.md,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  avatar: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: fontSize.md, fontWeight: '800' },
  name: { fontSize: fontSize.md, fontWeight: '800', color: colors.ink },
  sub: { fontSize: fontSize.xs, color: colors.muted, marginTop: 2 },
  closeBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginRight: -space.sm },
  statRow: { flexDirection: 'row', gap: space.sm },
  stat: {
    flex: 1, backgroundColor: colors.surfaceTint, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.line,
    paddingVertical: 10, paddingHorizontal: 4, alignItems: 'center',
  },
  statValue: { fontSize: fontSize.sm, fontWeight: '800', color: colors.ink },
  statLabel: { fontSize: fontSize.xs, color: colors.muted, marginTop: 2 },
  meta: { fontSize: fontSize.xs, color: colors.muted },
  actionBar: { flexDirection: 'row', gap: 10 },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, height: 46, paddingHorizontal: space.sm, borderRadius: radius.md,
  },
  callBtn: { backgroundColor: colors.success },
  trailBtnOn: { backgroundColor: colors.primary },
  trailBtnOff: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.primary },
  disabled: { opacity: 0.5 },
  actionText: { flexShrink: 1, fontSize: fontSize.sm, fontWeight: '800', color: colors.white },
  note: { fontSize: fontSize.xs, color: colors.warningText },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

type Tab = 'map' | 'list';

export const AdminRiderMapScreen: React.FC = () => {
  const route = useRoute<RouteProp<RootStackParamList, 'AdminRiderMap'>>();

  const [riders, setRiders] = useState<RiderLocation[]>([]);
  const [config, setConfig] = useState<TrackingConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Without a key the map tab can only ever show a placeholder, so open on the
  // list instead of a dead end.
  const [tab, setTab] = useState<Tab>(IS_MAPS_CONFIGURED ? 'map' : 'list');
  const [selectedId, setSelectedId] = useState<number | null>(route.params?.riderId ?? null);
  const [showTrail, setShowTrail] = useState(false);
  const [trail, setTrail] = useState<RiderTrailPoint[]>([]);
  const [trailLoading, setTrailLoading] = useState(false);

  const staleAfter = config?.stale_after_minutes ?? 10;

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await adminService.getRiderLocations({ limit: 500 });
      setRiders(data.results || []);
      setError(null);
    } catch (e: any) {
      // Keep whatever is on screen — one dropped poll must not blank the map
      // and lose the dispatcher's place. The reason is shown above it instead.
      setError(friendlyError(e?.message));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // stale_after_minutes is a server constant, not live data, so it is read once
  // rather than on every poll.
  useEffect(() => {
    adminService.getTrackingConfig().then(setConfig).catch(() => undefined);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      const timer = setInterval(() => load(true), REFRESH_MS);
      // A timer left running on a blurred screen keeps hitting the API from a
      // phone in someone's pocket.
      return () => clearInterval(timer);
    }, [load]),
  );

  useEffect(() => {
    if (!showTrail || selectedId == null) {
      setTrail([]);
      return;
    }
    let cancelled = false;
    setTrailLoading(true);
    // 2000 is the server cap and a whole day is 1,440 points at the 60s default.
    adminService
      .getRiderTrail(selectedId, { date: today(), limit: 2000 })
      .then((data) => { if (!cancelled) setTrail(data.results || []); })
      .catch((e: any) => {
        if (cancelled) return;
        setTrail([]);
        Alert.alert('Error', `Failed to load the rider trail: ${friendlyError(e?.message)}`);
      })
      .finally(() => { if (!cancelled) setTrailLoading(false); });

    return () => { cancelled = true; };
  }, [showTrail, selectedId]);

  const selected = useMemo(
    () => riders.find((r) => r.rider_id === selectedId) ?? null,
    [riders, selectedId],
  );

  const counts = useMemo(() => {
    const tally = { live: 0, stale: 0, offline: 0 };
    riders.forEach((rider) => { tally[freshnessOf(rider, staleAfter)] += 1; });
    return tally;
  }, [riders, staleAfter]);

  const markers: RiderMapMarker[] = useMemo(
    () => riders.map((rider) => ({
      id: rider.rider_id,
      latitude: rider.latitude,
      longitude: rider.longitude,
      title: rider.name || rider.username,
      description: `${agoLabel(rider.minutes_ago)} · ${rider.active_orders} active`,
      color: FRESHNESS_COLORS[freshnessOf(rider, staleAfter)],
    })),
    [riders, staleAfter],
  );

  const trailPath = useMemo(
    () => trail.map((point) => ({ latitude: point.latitude, longitude: point.longitude })),
    [trail],
  );

  const select = (riderId: number) => {
    if (riderId === selectedId) return;
    setSelectedId(riderId);
    // The drawn trail belongs to the rider being replaced, so it has to go
    // before the new one's fetch lands or the line reads as theirs.
    setShowTrail(false);
  };

  const clearSelection = () => {
    setSelectedId(null);
    setShowTrail(false);
  };

  const renderContent = () => {
    if (loading && riders.length === 0) return <LoadingScreen message="Loading rider positions…" />;

    // Nothing to fall back on, so the failure takes the place of the content.
    if (error && riders.length === 0) {
      return (
        <View style={styles.stateWrap}>
          <ErrorState
            title="Could not load rider positions"
            message={error}
            onRetry={() => load()}
          />
        </View>
      );
    }

    if (tab === 'map') {
      return (
        <View style={styles.mapFrame}>
          <RiderMapView
            style={{ flex: 1 }}
            markers={markers}
            trail={showTrail ? trailPath : []}
            selectedId={selectedId}
            onSelectRider={select}
            onDeselect={clearSelection}
          />
        </View>
      );
    }

    return (
      <FlatList
        data={riders}
        keyExtractor={(rider) => String(rider.rider_id)}
        renderItem={({ item }) => (
          <RiderRow
            rider={item}
            freshness={freshnessOf(item, staleAfter)}
            selected={item.rider_id === selectedId}
            onPress={() => select(item.rider_id)}
          />
        )}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(true); }}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          <EmptyState
            icon="bicycle-outline"
            title="No rider has reported a position yet"
            text="Riders appear here once they sign in and allow location sharing."
          />
        }
        contentContainerStyle={riders.length === 0 ? styles.listEmpty : styles.list}
      />
    );
  };

  const showSummary = !(error && riders.length === 0);

  return (
    <View style={styles.container}>
      {/* Tab bar */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, tab === 'map' && styles.tabActive]}
          onPress={() => IS_MAPS_CONFIGURED && setTab('map')}
          disabled={!IS_MAPS_CONFIGURED}
        >
          <Ionicons
            name="map-outline"
            size={18}
            color={tab === 'map' ? colors.white : IS_MAPS_CONFIGURED ? colors.muted : colors.disabled}
          />
          <Text
            style={[
              styles.tabText,
              tab === 'map' && styles.tabTextActive,
              !IS_MAPS_CONFIGURED && { color: colors.disabled },
            ]}
          >
            Map
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'list' && styles.tabActive]}
          onPress={() => setTab('list')}
        >
          <Ionicons name="list" size={18} color={tab === 'list' ? colors.white : colors.muted} />
          <Text style={[styles.tabText, tab === 'list' && styles.tabTextActive]}>List</Text>
        </TouchableOpacity>
      </View>

      {!IS_MAPS_CONFIGURED && (
        <View style={styles.banner}>
          <Ionicons name="information-circle-outline" size={18} color={colors.warning} />
          <Text style={styles.bannerText}>
            Map key not configured — showing the rider list. Set GOOGLE_MAPS_API_KEY and rebuild.
          </Text>
        </View>
      )}

      {showSummary && (
        <View style={styles.summaryRow}>
          <SummaryCard label="Riders" value={String(riders.length)} color={colors.primary} />
          <SummaryCard label="Live" value={String(counts.live)} color={FRESHNESS_COLORS.live} />
          <SummaryCard label="Stale" value={String(counts.stale)} color={FRESHNESS_COLORS.stale} />
          <SummaryCard label="Offline" value={String(counts.offline)} color={FRESHNESS_COLORS.offline} />
        </View>
      )}

      {/* A failed poll keeps the last known positions and says why here. */}
      {!!error && riders.length > 0 && (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={20} color={colors.danger} />
          <View style={styles.errorBannerBody}>
            <Text style={styles.errorBannerTitle}>Showing the last known positions</Text>
            <Text style={styles.errorBannerText}>{error}</Text>
          </View>
          <TouchableOpacity onPress={() => load()} style={styles.errorRetry}>
            <Text style={styles.errorRetryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.content}>{renderContent()}</View>

      {selected && (
        <RiderCard
          rider={selected}
          freshness={freshnessOf(selected, staleAfter)}
          showTrail={showTrail}
          trailLoading={trailLoading}
          trailCount={trail.length}
          onToggleTrail={() => setShowTrail((on) => !on)}
          onClose={clearSelection}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  // Pill toggle on the page itself, like the filters on the other admin screens.
  tabBar: {
    flexDirection: 'row',
    gap: space.sm,
    paddingHorizontal: pagePadding,
    paddingTop: space.sm,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 40,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.ink },
  tabTextActive: { color: colors.white },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: pagePadding,
    marginTop: space.md,
    padding: space.md,
    backgroundColor: colors.warningBg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.warningLine,
  },
  bannerText: { flex: 1, fontSize: fontSize.xs, color: colors.warningText, lineHeight: 17 },
  summaryRow: { flexDirection: 'row', gap: space.sm, marginHorizontal: pagePadding, marginVertical: space.md },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: pagePadding,
    marginBottom: space.md,
    padding: space.md,
    backgroundColor: colors.dangerBg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.dangerLine,
  },
  errorBannerBody: { flex: 1 },
  errorBannerTitle: { fontSize: fontSize.sm, fontWeight: '800', color: colors.danger },
  errorBannerText: { fontSize: fontSize.xs, color: colors.danger, lineHeight: 17, marginTop: 2 },
  errorRetry: { minHeight: 40, paddingHorizontal: space.sm, justifyContent: 'center' },
  errorRetryText: { fontSize: fontSize.sm, fontWeight: '800', color: colors.primary },
  content: { flex: 1 },
  // A native map is not reliably clipped by a rounded parent on Android
  // (overflow: hidden can leave square corners or blank the map). So the map
  // stays square and the roundness belongs to the frame around it: with 6px of
  // padding the map's corners sit inside the frame's 20px arc, so nothing pokes out.
  mapFrame: {
    flex: 1,
    marginHorizontal: pagePadding,
    marginBottom: space.md,
    padding: 6,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  stateWrap: { flex: 1, justifyContent: 'center' },
  list: { paddingHorizontal: pagePadding, paddingBottom: space.xxl },
  listEmpty: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: pagePadding },
});
