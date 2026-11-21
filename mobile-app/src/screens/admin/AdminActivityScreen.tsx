import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  StyleSheet,
  RefreshControl,
  ScrollView,
  Modal,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, space, fontSize, card, pagePadding } from '../../theme';
import { API_URL } from '../../constants/config';
import { getAuthToken } from '../../services/authService';
import { LoadingScreen } from '../../components/LoadingScreen';
import { EmptyState, ErrorState, StatusPill, Tone, friendlyError } from '../../components/ui';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ActivityEntry {
  id: number;
  timestamp: string;
  actor_name: string;
  category: string;
  action: string;
  target_type: string;
  target_id: number | null;
  target_label: string;
  details: Record<string, unknown>;
}

// ─── Config ───────────────────────────────────────────────────────────────────

interface CategoryLook {
  tone: Tone;
  icon: keyof typeof Ionicons.glyphMap;
  fg: string;
  bg: string;
}

const CATEGORY_LOOK: Record<string, CategoryLook> = {
  order: { tone: 'primary', icon: 'receipt-outline', fg: colors.primaryDark, bg: colors.primaryTint },
  rider: { tone: 'success', icon: 'bicycle-outline', fg: colors.success, bg: colors.successBg },
  customer: { tone: 'info', icon: 'person-outline', fg: colors.info, bg: colors.infoBg },
  user: { tone: 'warning', icon: 'person-circle-outline', fg: colors.warningText, bg: colors.warningBg },
  settings: { tone: 'neutral', icon: 'settings-outline', fg: colors.textSecondary, bg: colors.lineSoft },
  data: { tone: 'danger', icon: 'alert-circle-outline', fg: colors.danger, bg: colors.dangerBg },
};

const FALLBACK_LOOK: CategoryLook = {
  tone: 'neutral',
  icon: 'ellipse-outline',
  fg: colors.textSecondary,
  bg: colors.lineSoft,
};

const LIMIT = 40;

/** Local-date ISO string — toISOString() would shift by timezone. */
const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

type RangeKey = 'today' | 'week' | 'month' | 'all';

const RANGES: { key: RangeKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'all', label: 'All' },
];

function rangeToDates(key: RangeKey): { from: string; to: string } {
  const now = new Date();
  const today = isoDate(now);
  if (key === 'today') return { from: today, to: today };
  if (key === 'week') {
    const day = (now.getDay() + 6) % 7;   // week starts Monday
    const monday = new Date(now);
    monday.setDate(now.getDate() - day);
    return { from: isoDate(monday), to: today };
  }
  if (key === 'month') {
    return { from: isoDate(new Date(now.getFullYear(), now.getMonth(), 1)), to: today };
  }
  return { from: '', to: '' };
}

const CATEGORIES: { label: string; value: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { label: 'All', value: '', icon: 'apps-outline' },
  { label: 'Orders', value: 'order', icon: 'receipt-outline' },
  { label: 'Riders', value: 'rider', icon: 'bicycle-outline' },
  { label: 'Customers', value: 'customer', icon: 'person-outline' },
  { label: 'Users', value: 'user', icon: 'person-circle-outline' },
  { label: 'Settings', value: 'settings', icon: 'settings-outline' },
  { label: 'Issues', value: 'data', icon: 'alert-circle-outline' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTs(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleString('en-PK', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatFullTs(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleString('en-PK', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function detailsText(details: Record<string, unknown> | null | undefined): string {
  return Object.entries(details ?? {})
    .map(([k, v]) => `${k}: ${v !== null && typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
    .join(' · ');
}

function categoryLabel(category: string): string {
  const known = CATEGORIES.find((c) => c.value === category && c.value !== '');
  if (known) return known.label;
  return category ? category.charAt(0).toUpperCase() + category.slice(1) : '';
}

function formatKey(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Row component ────────────────────────────────────────────────────────────

function ActivityRow({ item, onPress }: { item: ActivityEntry; onPress: () => void }) {
  const look = CATEGORY_LOOK[item.category] ?? FALLBACK_LOOK;
  const extra = detailsText(item.details);
  const label = categoryLabel(item.category);
  return (
    <TouchableOpacity
      style={row.card}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`Activity log: ${item.action}`}
    >
      <View style={[row.iconCircle, { backgroundColor: look.bg }]}>
        <Ionicons name={look.icon} size={22} color={look.fg} />
      </View>
      <View style={row.body}>
        <View style={row.headerRow}>
          <Text style={row.action} numberOfLines={1}>{item.action}</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.muted} />
        </View>
        {item.target_label ? (
          <Text style={row.target} numberOfLines={1}>{item.target_label}</Text>
        ) : null}
        {extra ? <Text style={row.details} numberOfLines={2}>{extra}</Text> : null}
        <View style={row.footer}>
          {label ? <StatusPill label={label} tone={look.tone} style={row.pill} /> : null}
          <Text style={row.meta}>
            by {item.actor_name || 'System'} · {formatTs(item.timestamp)}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const row = StyleSheet.create({
  card: {
    ...card,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    padding: space.lg,
    marginBottom: space.md,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  action: { flex: 1, fontSize: fontSize.md, fontWeight: '800', color: colors.ink },
  target: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  details: { fontSize: fontSize.xs, color: colors.muted, marginTop: 4, lineHeight: 17 },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: space.sm,
    rowGap: space.xs,
    marginTop: space.sm,
  },
  pill: { alignSelf: 'center' },
  meta: { fontSize: fontSize.xs, color: colors.muted },
});

// ─── Detail Modal Component ───────────────────────────────────────────────────

function ActivityDetailModal({
  item,
  onClose,
}: {
  item: ActivityEntry | null;
  onClose: () => void;
}) {
  if (!item) return null;
  const look = CATEGORY_LOOK[item.category] ?? FALLBACK_LOOK;
  const label = categoryLabel(item.category);
  const detailEntries = Object.entries(item.details ?? {});

  return (
    <Modal
      visible={Boolean(item)}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={detailModal.overlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity
          style={detailModal.sheet}
          activeOpacity={1}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={detailModal.handle} />

          {/* Header */}
          <View style={detailModal.header}>
            <View style={[detailModal.iconCircle, { backgroundColor: look.bg }]}>
              <Ionicons name={look.icon} size={24} color={look.fg} />
            </View>
            <View style={detailModal.headerTextCol}>
              <Text style={detailModal.title}>{item.action}</Text>
              <Text style={detailModal.subtitle}>
                Logged by {item.actor_name || 'System'}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={detailModal.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={20} color={colors.ink} />
            </TouchableOpacity>
          </View>

          <ScrollView style={detailModal.scroll} contentContainerStyle={detailModal.scrollContent} showsVerticalScrollIndicator={false}>
            {/* Meta info card */}
            <View style={detailModal.card}>
              <View style={detailModal.metaRow}>
                <Text style={detailModal.metaLabel}>Category</Text>
                {label ? <StatusPill label={label} tone={look.tone} /> : <Text style={detailModal.metaValue}>General</Text>}
              </View>

              <View style={detailModal.divider} />

              <View style={detailModal.metaRow}>
                <Text style={detailModal.metaLabel}>Date & Time</Text>
                <Text style={detailModal.metaValue}>{formatFullTs(item.timestamp)}</Text>
              </View>

              {item.target_label ? (
                <>
                  <View style={detailModal.divider} />
                  <View style={detailModal.metaRow}>
                    <Text style={detailModal.metaLabel}>Target Reference</Text>
                    <Text style={[detailModal.metaValue, { fontWeight: '700' }]}>{item.target_label}</Text>
                  </View>
                </>
              ) : null}

              {item.target_type ? (
                <>
                  <View style={detailModal.divider} />
                  <View style={detailModal.metaRow}>
                    <Text style={detailModal.metaLabel}>Target Type</Text>
                    <Text style={detailModal.metaValue}>{item.target_type}</Text>
                  </View>
                </>
              ) : null}

              {item.target_id ? (
                <>
                  <View style={detailModal.divider} />
                  <View style={detailModal.metaRow}>
                    <Text style={detailModal.metaLabel}>Target ID</Text>
                    <Text style={detailModal.metaValue}>#{item.target_id}</Text>
                  </View>
                </>
              ) : null}
            </View>

            {/* Details Section */}
            <View style={detailModal.card}>
              <Text style={detailModal.sectionTitle}>Details & Metadata</Text>
              {detailEntries.length === 0 ? (
                <Text style={detailModal.emptyDetailsText}>No additional metadata recorded for this action.</Text>
              ) : (
                detailEntries.map(([k, v]) => {
                  const valStr = typeof v === 'object' && v !== null ? JSON.stringify(v, null, 2) : String(v ?? '—');
                  const isLong = valStr.length > 35 || valStr.includes('\n');
                  return (
                    <View key={k} style={detailModal.detailItem}>
                      <Text style={detailModal.detailKey}>{formatKey(k)}</Text>
                      {isLong ? (
                        <View style={detailModal.detailLongBox}>
                          <Text style={detailModal.detailLongText} selectable>{valStr}</Text>
                        </View>
                      ) : (
                        <Text style={detailModal.detailValue} selectable>{valStr}</Text>
                      )}
                    </View>
                  );
                })
              )}
            </View>
          </ScrollView>

          {/* Close button */}
          <View style={detailModal.footer}>
            <TouchableOpacity style={detailModal.actionBtn} onPress={onClose} activeOpacity={0.8}>
              <Text style={detailModal.actionBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const detailModal = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(10,31,68,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
    maxHeight: '85%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.line,
    alignSelf: 'center',
    marginBottom: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextCol: {
    flex: 1,
  },
  title: {
    fontSize: fontSize.md,
    fontWeight: '800',
    color: colors.ink,
  },
  subtitle: {
    fontSize: fontSize.xs,
    color: colors.muted,
    marginTop: 2,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.lineSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flexGrow: 0,
  },
  scrollContent: {
    gap: 14,
    paddingBottom: 16,
  },
  card: {
    backgroundColor: colors.surfaceTint,
    borderRadius: radius.md,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.line,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  metaLabel: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  metaValue: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.ink,
  },
  divider: {
    height: 1,
    backgroundColor: colors.line,
    marginVertical: 8,
  },
  sectionTitle: {
    fontSize: fontSize.sm,
    fontWeight: '800',
    color: colors.ink,
    marginBottom: 10,
  },
  emptyDetailsText: {
    fontSize: fontSize.xs,
    color: colors.muted,
    fontStyle: 'italic',
  },
  detailItem: {
    marginBottom: 10,
  },
  detailKey: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: 3,
  },
  detailValue: {
    fontSize: fontSize.sm,
    color: colors.ink,
    fontWeight: '600',
  },
  detailLongBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 10,
    marginTop: 2,
  },
  detailLongText: {
    fontSize: fontSize.xs,
    color: colors.ink,
    lineHeight: 18,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  footer: {
    paddingTop: 10,
  },
  actionBtn: {
    height: 46,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnText: {
    fontSize: fontSize.sm,
    fontWeight: '800',
    color: colors.white,
  },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export const AdminActivityScreen: React.FC = () => {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const requestId = useRef(0);
  const busy = useRef(false);

  const [range, setRange] = useState<RangeKey>('all');
  const [category, setCategory] = useState('');
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [totalAll, setTotalAll] = useState(0);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [selectedEntry, setSelectedEntry] = useState<ActivityEntry | null>(null);

  const load = useCallback(
    async (reset = false) => {
      const off = reset ? 0 : offset;
      if (!reset && (!hasMore || error || busy.current)) return;
      const id = ++requestId.current;
      busy.current = true;
      if (reset) {
        setOffset(0);
        setHasMore(true);
      }
      setLoading(true);
      try {
        const token = await getAuthToken();
        const sp = new URLSearchParams({ limit: String(LIMIT), offset: String(off) });
        if (category) sp.set('category', category);
        if (search) sp.set('action', search);
        const { from, to } = rangeToDates(range);
        if (from) sp.set('date_from', from);
        if (to) sp.set('date_to', to);
        const res = await fetch(`${API_URL}/activities/?${sp}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          let detail = '';
          try {
            const body = await res.json();
            if (typeof body?.detail === 'string') detail = body.detail;
          } catch {
            // Not JSON: status code fallback
          }
          throw new Error(
            detail ||
              (res.status === 401 || res.status === 403
                ? 'You do not have permission to view the activity log.'
                : `The server could not load the activity log (error ${res.status}).`),
          );
        }
        const data: {
          count: number;
          counts?: Record<string, number>;
          total_all?: number;
          results: ActivityEntry[];
        } = await res.json();
        if (id !== requestId.current) return;
        setError(null);
        setTotal(data.count);
        setCounts(data.counts ?? {});
        setTotalAll(data.total_all ?? data.count);
        if (reset) {
          setEntries(data.results);
        } else {
          setEntries((prev) => [...prev, ...data.results]);
        }
        setHasMore(off + LIMIT < data.count);
        setOffset(off + LIMIT);
      } catch (e: any) {
        if (id !== requestId.current) return;
        console.error(e);
        setError(friendlyError(e?.message));
      } finally {
        if (id === requestId.current) {
          busy.current = false;
          setLoading(false);
          setLoadedOnce(true);
          setRefreshing(false);
        }
      }
    },
    [offset, hasMore, error, category, search, range],
  );

  useEffect(() => {
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, search, range]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load(true);
  }, [load]);

  if (loading && !loadedOnce) {
    return <LoadingScreen message="Loading activity log…" />;
  }

  const hasActiveFilters = category !== '' || search !== '' || range !== 'all';

  return (
    <View style={styles.container}>
      {/* ── Polished Unified Filter Header ── */}
      <View style={styles.headerContainer}>
        {/* Quick Date Range Segmented Bar */}
        <View style={styles.segmentedControl}>
          {RANGES.map((r) => {
            const active = range === r.key;
            return (
              <TouchableOpacity
                key={r.key}
                style={[styles.segmentBtn, active && styles.segmentBtnActive]}
                onPress={() => setRange(r.key)}
                activeOpacity={0.8}
              >
                <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                  {r.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Categories: Smooth Single-Row Horizontal Scroll (Replaces 3-row wrapping) */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryScroll}
        >
          {CATEGORIES.map((c) => {
            const active = category === c.value;
            const n = c.value === '' ? totalAll : (counts[c.value] ?? 0);
            const urgent = c.value === 'data' && n > 0;
            return (
              <TouchableOpacity
                key={c.value}
                style={[
                  styles.categoryChip,
                  active && styles.categoryChipActive,
                  urgent && !active && styles.categoryChipUrgent,
                  urgent && active && styles.categoryChipActiveUrgent,
                ]}
                onPress={() => setCategory(c.value)}
                activeOpacity={0.75}
              >
                <Ionicons
                  name={c.icon}
                  size={15}
                  color={active ? colors.white : urgent ? colors.danger : colors.muted}
                />
                <Text
                  style={[
                    styles.categoryChipText,
                    active && styles.categoryChipTextActive,
                    urgent && !active && styles.categoryChipTextUrgent,
                  ]}
                >
                  {c.label}
                </Text>
                <View
                  style={[
                    styles.categoryCountBadge,
                    active && styles.categoryCountBadgeActive,
                    urgent && !active && styles.categoryCountBadgeUrgent,
                  ]}
                >
                  <Text
                    style={[
                      styles.categoryCountText,
                      active && styles.categoryCountTextActive,
                      urgent && !active && styles.categoryCountTextUrgent,
                    ]}
                  >
                    {n}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Search Bar */}
        <View style={styles.searchRow}>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={17} color={colors.muted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search actions or targets..."
              placeholderTextColor={colors.muted}
              value={searchInput}
              onChangeText={setSearchInput}
              onSubmitEditing={() => setSearch(searchInput.trim())}
              returnKeyType="search"
            />
            {searchInput.length > 0 ? (
              <TouchableOpacity
                onPress={() => {
                  setSearch('');
                  setSearchInput('');
                }}
                style={styles.clearIconBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close-circle" size={18} color={colors.muted} />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {/* Record Count & Reset Filters Bar */}
        <View style={styles.countRow}>
          <View style={styles.countBadgeWrap}>
            <Ionicons name="document-text-outline" size={13} color={colors.primary} />
            <Text style={styles.countText}>{total.toLocaleString()} records</Text>
          </View>
          {hasActiveFilters && (
            <TouchableOpacity
              style={styles.resetFiltersBtn}
              onPress={() => {
                setCategory('');
                setSearch('');
                setSearchInput('');
                setRange('all');
              }}
            >
              <Ionicons name="refresh-outline" size={12} color={colors.primary} />
              <Text style={styles.resetFiltersText}>Reset filters</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Error banner */}
      {error && entries.length > 0 ? (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={20} color={colors.danger} />
          <Text style={styles.errorBannerText}>{error}</Text>
          <TouchableOpacity onPress={() => load(true)} style={styles.errorRetry}>
            <Text style={styles.errorRetryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* List */}
      <FlatList
        data={entries}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <ActivityRow item={item} onPress={() => setSelectedEntry(item)} />
        )}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
        onEndReached={() => load(false)}
        onEndReachedThreshold={0.3}
        ListFooterComponent={
          loading && !refreshing && entries.length > 0 ? (
            <ActivityIndicator style={{ padding: 20 }} color={colors.primary} />
          ) : null
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator style={styles.emptySpinner} color={colors.primary} />
          ) : error ? (
            <ErrorState
              title="Could not load the activity log"
              message={error}
              onRetry={() => load(true)}
            />
          ) : (
            <EmptyState
              icon="document-text-outline"
              title="No activity records found"
              text="Nothing was recorded for this period or filter. Try a wider date range or another category."
            />
          )
        }
      />

      {/* Detailed Inspection Modal */}
      <ActivityDetailModal
        item={selectedEntry}
        onClose={() => setSelectedEntry(null)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  // Unified top header container
  headerContainer: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingTop: 8,
    paddingBottom: 8,
    gap: 8,
  },

  // Segmented date range bar
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: colors.bg,
    borderRadius: radius.pill,
    padding: 3,
    marginHorizontal: pagePadding,
    borderWidth: 1,
    borderColor: colors.line,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentBtnActive: {
    backgroundColor: colors.primary,
  },
  segmentText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  segmentTextActive: {
    color: colors.white,
    fontWeight: '800',
  },

  // Horizontal category scroll
  categoryScroll: {
    paddingHorizontal: pagePadding,
    gap: 8,
    alignItems: 'center',
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingLeft: 12,
    paddingRight: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surfaceTint,
  },
  categoryChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  categoryChipUrgent: {
    backgroundColor: colors.dangerBg,
    borderColor: colors.dangerLine,
  },
  categoryChipActiveUrgent: {
    backgroundColor: colors.danger,
    borderColor: colors.danger,
  },
  categoryChipText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.ink,
  },
  categoryChipTextActive: {
    color: colors.white,
  },
  categoryChipTextUrgent: {
    color: colors.danger,
  },
  categoryCountBadge: {
    minWidth: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.line,
  },
  categoryCountBadgeActive: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  categoryCountBadgeUrgent: {
    backgroundColor: colors.surface,
  },
  categoryCountText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textSecondary,
  },
  categoryCountTextActive: {
    color: colors.white,
  },
  categoryCountTextUrgent: {
    color: colors.danger,
  },

  // Search row
  searchRow: {
    paddingHorizontal: pagePadding,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 42,
    paddingHorizontal: 12,
    backgroundColor: colors.bg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.ink,
    paddingVertical: 0,
  },
  clearIconBtn: {
    padding: 2,
  },

  // Records & filter reset row
  countRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: pagePadding + 4,
    paddingTop: 2,
  },
  countBadgeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  countText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.muted,
  },
  resetFiltersBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryTint,
  },
  resetFiltersText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primaryDark,
  },

  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: pagePadding,
    marginTop: space.sm,
    marginBottom: space.sm,
    padding: space.md,
    backgroundColor: colors.dangerBg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.dangerLine,
  },
  errorBannerText: { flex: 1, fontSize: fontSize.xs, color: colors.danger, lineHeight: 17 },
  errorRetry: { minHeight: 40, paddingHorizontal: space.sm, justifyContent: 'center' },
  errorRetryText: { fontSize: fontSize.sm, fontWeight: '800', color: colors.primary },

  list: { paddingHorizontal: pagePadding, paddingTop: space.md, paddingBottom: space.xxl, flexGrow: 1 },
  emptySpinner: { paddingTop: 48 },
});
