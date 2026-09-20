"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  Activity, RefreshCw, Filter, Search, Calendar, Loader2, AlertTriangle,
} from "lucide-react";
import { apiFetch } from "@/lib/api/client";
import { Button, Card, Skeleton } from "@/components/ui";
import { LoadingState } from "@/components/ui/LoadingState";
import { cn } from "@/lib/cn";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ActivityLogEntry {
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

interface ActivityResponse {
  count: number;
  /** Per-category totals for the current date/search filters — the tab badges. */
  counts: Record<string, number>;
  total_all: number;
  results: ActivityLogEntry[];
}

/** Tabs, in the order an admin scans them. `data` last because it is the one
 *  they act on rather than read past — it carries a badge of its own. */
const TABS: { key: string; label: string }[] = [
  { key: "",         label: "All" },
  { key: "order",    label: "Orders" },
  { key: "rider",    label: "Riders" },
  { key: "customer", label: "Customers" },
  { key: "user",     label: "Users" },
  { key: "settings", label: "Settings" },
  { key: "data",     label: "Data Issues" },
];

// ─── Config ───────────────────────────────────────────────────────────────────

/** Local-date ISO string — using toISOString() here would shift by timezone. */
function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type RangeKey = "today" | "week" | "month" | "all";

/** Presets the admin reaches for constantly; `all` clears the date filter. */
const RANGES: { key: RangeKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
  { key: "all", label: "All Time" },
];

function rangeToDates(key: RangeKey): { from: string; to: string } {
  const now = new Date();
  const today = isoDate(now);
  if (key === "today") return { from: today, to: today };
  if (key === "week") {
    // Week starts Monday — Sunday is 0, so shift it to the end.
    const day = (now.getDay() + 6) % 7;
    const monday = new Date(now);
    monday.setDate(now.getDate() - day);
    return { from: isoDate(monday), to: today };
  }
  if (key === "month") {
    return { from: isoDate(new Date(now.getFullYear(), now.getMonth(), 1)), to: today };
  }
  return { from: "", to: "" };
}

const CATEGORY_COLORS: Record<string, string> = {
  order:    "bg-blue-400/15 text-blue-300",
  rider:    "bg-emerald-400/15 text-emerald-300",
  customer: "bg-purple-400/15 text-purple-300",
  user:     "bg-amber-400/15 text-amber-300",
  settings: "bg-slate-400/15 text-slate-300",
  plant:    "bg-teal-400/15 text-teal-300",
  data:     "bg-rose-400/15 text-rose-300",
};

const ACTION_COLORS: Record<string, string> = {
  "Order Created":       "text-emerald-400",
  "Order Delivered":     "text-emerald-400",
  "Order Cancelled":     "text-rose-400",
  "Order Hidden":        "text-mist/50",
  "Order Unhidden":      "text-mist/70",
  "Rider Assigned":      "text-sky-400",
  "Delivery Completed":  "text-emerald-400",
  "Customer Created":    "text-purple-400",
  "Customer Updated":    "text-purple-300",
  "Staff Created":       "text-amber-400",
  "Password Changed":    "text-amber-300",
  "Password Reset by Admin": "text-rose-300",
  // Data issues — these are the rows that mean "go and fix something".
  "Duplicate Phone Blocked":           "text-rose-400",
  "Existing Customer Tried To Sign Up": "text-amber-400",
  "Invalid Phone Rejected":            "text-rose-300",
  "Incomplete Customer Record":        "text-amber-300",
};

const LIMIT = 50;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTs(ts: string) {
  return new Date(ts).toLocaleString("en-PK", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function CategoryBadge({ category }: { category: string }) {
  const cls = CATEGORY_COLORS[category] ?? "bg-white/10 text-mist/60";
  return (
    <span className={cn("inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide", cls)}>
      {category}
    </span>
  );
}

function DetailsBlock({ details }: { details: Record<string, unknown> }) {
  const entries = Object.entries(details);
  if (!entries.length) return null;
  return (
    <span className="ml-2 text-xs text-mist/35">
      {entries.map(([k, v]) => `${k}: ${v}`).join(" · ")}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ActivityLogPage() {
  const [entries, setEntries] = useState<ActivityLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [totalAll, setTotalAll] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);

  const [range, setRange] = useState<RangeKey>("all");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterSearch, setFilterSearch] = useState("");

  const load = useCallback(
    async (off: number, { append = false }: { append?: boolean } = {}) => {
      // Two separate flags so appending never blanks the rows already on screen.
      if (append) setLoadingMore(true);
      else setLoading(true);
      try {
        const sp = new URLSearchParams({ limit: String(LIMIT), offset: String(off) });
        if (filterCategory) sp.set("category", filterCategory);
        if (filterDateFrom) sp.set("date_from", filterDateFrom);
        if (filterDateTo) sp.set("date_to", filterDateTo);
        if (filterSearch) sp.set("action", filterSearch);
        const data = await apiFetch<ActivityResponse>(`/activities/?${sp}`, { auth: true });
        setEntries((prev) => (append ? [...prev, ...data.results] : data.results));
        setTotal(data.count);
        setCounts(data.counts ?? {});
        setTotalAll(data.total_all ?? data.count);
        setOffset(off);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [filterCategory, filterDateFrom, filterDateTo, filterSearch],
  );

  useEffect(() => {
    load(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterCategory, filterDateFrom, filterDateTo]);

  const hasMore = entries.length < total;

  const applyRange = (key: RangeKey) => {
    const { from, to } = rangeToDates(key);
    setRange(key);
    setFilterDateFrom(from);
    setFilterDateTo(to);
  };

  // Auto-load the next page when the sentinel scrolls into view. The button
  // stays as a fallback for keyboard users and when the observer is unavailable.
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore || loading || loadingMore) return;
    const io = new IntersectionObserver(
      (es) => es[0]?.isIntersecting && load(offset + LIMIT, { append: true }),
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loading, loadingMore, offset, load]);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-mist">
            <Activity size={22} className="text-wave" />
            Activity Log
          </h1>
          <p className="mt-0.5 text-sm text-mist/50">
            {total > 0
              ? `Showing ${entries.length.toLocaleString()} of ${total.toLocaleString()} records`
              : "All system events"}
          </p>
        </div>
        <Button variant="ghost" onClick={() => load(0)} disabled={loading}>
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Refresh
        </Button>
      </div>

      {/* Segments. A tab is one click where the dropdown was three, and the
          badge means the admin can see there is something in Data Issues
          without going and looking. */}
      <div className="-mb-2 flex flex-wrap gap-1 border-b border-white/10">
        {TABS.map((t) => {
          const active = filterCategory === t.key;
          const n = t.key === "" ? totalAll : (counts[t.key] ?? 0);
          const isIssues = t.key === "data";
          return (
            <button
              key={t.key || "all"}
              onClick={() => setFilterCategory(t.key)}
              className={cn(
                "relative flex items-center gap-2 rounded-t-lg px-4 py-2.5 text-sm font-medium transition",
                active
                  ? "bg-white/10 text-mist"
                  : "text-mist/50 hover:bg-white/5 hover:text-mist/80",
              )}
            >
              {isIssues && <AlertTriangle size={13} className={n > 0 ? "text-rose-400" : "text-mist/30"} />}
              {t.label}
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
                  isIssues && n > 0
                    ? "bg-rose-400/20 text-rose-300"
                    : "bg-white/10 text-mist/50",
                )}
              >
                {n.toLocaleString()}
              </span>
              {active && (
                <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-wave" />
              )}
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <Card className="p-4">
        {/* Quick ranges — what an admin reaches for most of the time, so they
            sit above the manual date pickers rather than behind them. */}
        <div className="mb-3 flex flex-wrap gap-2">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => applyRange(r.key)}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-sm font-medium transition",
                range === r.key
                  ? "border-wave bg-wave/20 text-wave"
                  : "border-white/10 text-mist/60 hover:text-mist",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-end gap-3">
          {/* Date from */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-mist/50">From</label>
            <div className="relative">
              <Calendar size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-mist/40" />
              <input
                type="date"
                value={filterDateFrom}
                onChange={(e) => { setFilterDateFrom(e.target.value); setRange("all"); }}
                className="input py-2 pl-8 text-sm"
              />
            </div>
          </div>

          {/* Date to */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-mist/50">To</label>
            <div className="relative">
              <Calendar size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-mist/40" />
              <input
                type="date"
                value={filterDateTo}
                onChange={(e) => { setFilterDateTo(e.target.value); setRange("all"); }}
                className="input py-2 pl-8 text-sm"
              />
            </div>
          </div>

          {/* Action search */}
          <div className="flex min-w-[200px] flex-1 flex-col gap-1">
            <label className="text-xs text-mist/50">Search action</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-mist/40" />
                <input
                  type="text"
                  value={filterSearch}
                  onChange={(e) => setFilterSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && load(0)}
                  placeholder="e.g. Order Created"
                  className="input w-full py-2 pl-8 text-sm"
                />
              </div>
              <Button onClick={() => load(0)}>
                <Filter size={13} /> Search
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-white/5 text-left text-xs uppercase tracking-wide text-mist/40">
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Target</th>
                <th className="px-4 py-3">By</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-white/5">
                    <td colSpan={5} className="px-4 py-3">
                      <Skeleton className="h-4 w-full" style={{ animationDelay: `${i * 90}ms` }} />
                    </td>
                  </tr>
                ))
              ) : entries.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-16 text-center text-mist/30">
                    <Activity size={32} className="mx-auto mb-3 opacity-20" />
                    <p className="text-sm">No activity records found.</p>
                  </td>
                </tr>
              ) : (
                entries.map((e) => (
                  <tr
                    key={e.id}
                    className="border-b border-white/5 transition-colors hover:bg-white/5"
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-mist/50">
                      {formatTs(e.timestamp)}
                    </td>
                    <td className="px-4 py-3">
                      <CategoryBadge category={e.category} />
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("font-medium", ACTION_COLORS[e.action] ?? "text-mist")}>
                        {e.action}
                      </span>
                      <DetailsBlock details={e.details} />
                    </td>
                    <td className="px-4 py-3 text-mist/70">
                      {e.target_label || "—"}
                    </td>
                    <td className="px-4 py-3 text-mist/60">
                      {e.actor_name || "System"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Infinite scroll — the sentinel triggers the next page as it nears
            the viewport; the button is the fallback for keyboard users. */}
        {!loading && (
          <div
            ref={sentinel}
            className="flex items-center justify-center gap-3 border-t border-white/10 px-4 py-4"
          >
            {loadingMore ? (
              <span className="flex items-center gap-2 text-xs text-mist/50">
                <Loader2 size={14} className="animate-spin text-wave" />
                Loading more…
              </span>
            ) : hasMore ? (
              <Button
                variant="ghost"
                onClick={() => load(offset + LIMIT, { append: true })}
              >
                Load more
              </Button>
            ) : entries.length > 0 ? (
              <span className="text-xs text-mist/30">
                All {total.toLocaleString()} records loaded
              </span>
            ) : null}
          </div>
        )}
      </Card>
    </div>
  );
}
