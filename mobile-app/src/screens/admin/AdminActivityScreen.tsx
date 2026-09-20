import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { API_URL } from '../../constants/config';
import { getAuthToken } from '../../services/authService';
import { LoadingScreen } from '../../components/LoadingScreen';

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

const CATEGORY_COLORS: Record<string, string> = {
  order: '#007AFF',
  rider: '#34C759',
  customer: '#AF52DE',
  user: '#FF9500',
  settings: '#8E8E93',
  // Red because this segment is a to-do list, not a history: a number already
  // on file, a number that is not one, an address a rider cannot find.
  data: '#FF3B30',
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

const CATEGORIES = [
  { label: 'All', value: '' },
  { label: 'Orders', value: 'order' },
  { label: 'Riders', value: 'rider' },
  { label: 'Customers', value: 'customer' },
  { label: 'Users', value: 'user' },
  { label: 'Settings', value: 'settings' },
  { label: 'Issues', value: 'data' },
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

function detailsText(details: Record<string, unknown>): string {
  return Object.entries(details)
    .map(([k, v]) => `${k}: ${v}`)
    .join(' · ');
}

// ─── Row component ────────────────────────────────────────────────────────────

function ActivityRow({ item }: { item: ActivityEntry }) {
  const color = CATEGORY_COLORS[item.category] ?? '#888';
  const extra = detailsText(item.details);
  return (
    <View style={row.container}>
      <View style={[row.dot, { backgroundColor: color }]} />
      <View style={row.body}>
        <View style={row.top}>
          <Text style={row.action}>{item.action}</Text>
          <Text style={row.time}>{formatTs(item.timestamp)}</Text>
        </View>
        {item.target_label ? (
          <Text style={row.target}>{item.target_label}</Text>
        ) : null}
        {extra ? <Text style={row.details}>{extra}</Text> : null}
        <Text style={row.actor}>by {item.actor_name || 'System'}</Text>
      </View>
    </View>
  );
}

const row = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    gap: 12,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 5,
    flexShrink: 0,
  },
  body: { flex: 1 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  action: { fontSize: 14, fontWeight: '600', color: '#1a1a1a', flex: 1, marginRight: 8 },
  time: { fontSize: 11, color: '#aaa', marginTop: 1 },
  target: { fontSize: 12, color: '#555', marginTop: 2 },
  details: { fontSize: 11, color: '#aaa', marginTop: 2 },
  actor: { fontSize: 11, color: '#bbb', marginTop: 3 },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export const AdminActivityScreen: React.FC = () => {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const [range, setRange] = useState<RangeKey>('all');
  const [category, setCategory] = useState('');
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [totalAll, setTotalAll] = useState(0);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');

  const load = useCallback(
    async (reset = false) => {
      const off = reset ? 0 : offset;
      if (!reset && !hasMore) return;
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
        if (!res.ok) throw new Error('Failed');
        const data: {
          count: number;
          counts?: Record<string, number>;
          total_all?: number;
          results: ActivityEntry[];
        } = await res.json();
        setTotal(data.count);
        // Counted before the category filter, so switching segment does not
        // zero every other badge.
        setCounts(data.counts ?? {});
        setTotalAll(data.total_all ?? data.count);
        if (reset) {
          setEntries(data.results);
        } else {
          setEntries((prev) => [...prev, ...data.results]);
        }
        setHasMore(off + LIMIT < data.count);
        if (!reset) setOffset(off + LIMIT);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [offset, hasMore, category, search, range],
  );

  useEffect(() => {
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, search, range]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load(true);
  }, [load]);

  if (loading && entries.length === 0) {
    return <LoadingScreen message="Loading activity log…" />;
  }

  return (
    <View style={styles.container}>
      {/* Quick date ranges — what an admin filters by most often */}
      <View style={styles.rangeRow}>
        {RANGES.map(r => {
          const active = range === r.key;
          return (
            <TouchableOpacity
              key={r.key}
              style={[styles.rangeChip, active && styles.rangeChipActive]}
              onPress={() => setRange(r.key)}
            >
              <Text style={[styles.rangeChipText, active && styles.rangeChipTextActive]}>
                {r.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Category segments. The count rides on the chip so the admin can see
          there is something in Issues without opening it. */}
      <View style={styles.chips}>
        {CATEGORIES.map((c) => {
          const active = category === c.value;
          const tint = CATEGORY_COLORS[c.value] ?? '#1a1a1a';
          const n = c.value === '' ? totalAll : (counts[c.value] ?? 0);
          const urgent = c.value === 'data' && n > 0;
          return (
            <TouchableOpacity
              key={c.value}
              style={[
                styles.chip,
                active && { backgroundColor: tint + '22', borderColor: tint },
                urgent && !active && { borderColor: tint + '88' },
              ]}
              onPress={() => setCategory(c.value)}
            >
              <Text
                style={[
                  styles.chipText,
                  active && { color: tint, fontWeight: '700' },
                  urgent && !active && { color: tint },
                ]}
              >
                {c.label}
              </Text>
              <View style={[styles.chipCount, urgent && { backgroundColor: tint + '22' }]}>
                <Text style={[styles.chipCountText, urgent && { color: tint }]}>{n}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Search */}
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search actions..."
          placeholderTextColor="#000"
          value={searchInput}
          onChangeText={setSearchInput}
          onSubmitEditing={() => setSearch(searchInput)}
          returnKeyType="search"
        />
        {search ? (
          <TouchableOpacity
            onPress={() => {
              setSearch('');
              setSearchInput('');
            }}
            style={styles.clearBtn}
          >
            <Text style={styles.clearBtnText}>Clear</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Count */}
      <Text style={styles.countText}>{total.toLocaleString()} records</Text>

      {/* List */}
      <FlatList
        data={entries}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => <ActivityRow item={item} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        onEndReached={() => load(false)}
        onEndReachedThreshold={0.3}
        ListFooterComponent={
          loading && !refreshing ? (
            <ActivityIndicator style={{ padding: 20 }} color="#007AFF" />
          ) : null
        }
        ListEmptyComponent={
          !loading ? (
            <Text style={styles.empty}>No activity records found.</Text>
          ) : null
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    backgroundColor: 'white',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    backgroundColor: '#f5f5f5',
  },
  chipCount: {
    minWidth: 20,
    alignItems: 'center',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 9,
    backgroundColor: '#e6e8eb',
  },
  chipCountText: { fontSize: 11, fontWeight: '700', color: '#6b7280' },
  rangeRow: {
    flexDirection: 'row', gap: 8,
    paddingHorizontal: 12, paddingTop: 10, paddingBottom: 2,
    backgroundColor: 'white',
  },
  rangeChip: {
    flex: 1, paddingVertical: 7, borderRadius: 10,
    borderWidth: 1, borderColor: '#e4e6ea', backgroundColor: 'white',
    alignItems: 'center',
  },
  rangeChipActive: { backgroundColor: '#007AFF', borderColor: '#007AFF' },
  rangeChipText: { fontSize: 12, fontWeight: '600', color: '#666' },
  rangeChipTextActive: { color: 'white' },
  chipText: { fontSize: 13, color: '#666' },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  searchInput: {
    flex: 1,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#000',
  },
  clearBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  clearBtnText: { fontSize: 13, color: '#007AFF' },
  countText: {
    fontSize: 11,
    color: '#aaa',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  empty: {
    textAlign: 'center',
    color: '#bbb',
    fontSize: 14,
    paddingTop: 60,
  },
});
