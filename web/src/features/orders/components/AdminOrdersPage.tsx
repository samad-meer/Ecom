"use client";

import { useState, useCallback } from "react";
import {
  ClipboardList,
  Clock,
  Package,
  Truck,
  CheckCircle2,
  Wallet,
  ShoppingBag,
  Plus,
} from "lucide-react";
import type { AdminOrder, AdminOrderFilters, AdminOrderSummary } from "@/lib/types";
import { formatPrice } from "@/lib/format";
import { ordersApi } from "@/lib/api";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { Button, Card, PageHeader, Skeleton } from "@/components/ui";
import {
  useAdminOrders,
  useAdminSummary,
  useDeliveryBoys,
} from "../hooks/useAdminOrders";
import { AdminOrdersFilters } from "./AdminOrdersFilters";
import { AdminOrderRow } from "./AdminOrderRow";
import { AdminOrderDetailModal } from "./AdminOrderDetailModal";
import { CreateOrderModal } from "./CreateOrderModal";

// ─── Summary stat cards ───────────────────────────────────────────────────────

interface StatProps {
  icon: typeof Clock;
  label: string;
  value: string | number;
  tint: string;
}

function Stat({ icon: Icon, label, value, tint }: StatProps) {
  return (
    <Card className="flex items-center gap-3 p-4">
      <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${tint}`}>
        <Icon size={20} />
      </span>
      <div>
        <p className="text-xs uppercase tracking-wide text-mist/50">{label}</p>
        <p className="text-lg font-bold text-mist">{value}</p>
      </div>
    </Card>
  );
}

function SummaryRow({ summary, loading }: { summary: AdminOrderSummary | null; loading: boolean }) {
  if (loading || !summary) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <Stat icon={ClipboardList} label="Total" value={summary.total} tint="bg-sky-400/15 text-sky-300" />
      <Stat icon={Clock} label="Pending" value={summary.pending} tint="bg-amber-400/15 text-amber-300" />
      <Stat icon={Package} label="Processing" value={summary.processing} tint="bg-sky-400/15 text-sky-300" />
      <Stat icon={Truck} label="Shipped" value={summary.shipped} tint="bg-wave/15 text-wave" />
      <Stat icon={CheckCircle2} label="Delivered" value={summary.delivered} tint="bg-emerald-400/15 text-emerald-300" />
      <Stat icon={Wallet} label="Today Revenue" value={formatPrice(summary.today_revenue)} tint="bg-indigo-400/15 text-indigo-300" />
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function AdminOrdersPage() {
  const [filters, setFilters] = useState<AdminOrderFilters>({});
  const [detailOrder, setDetailOrder] = useState<AdminOrder | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const summary = useAdminSummary();
  const deliveryBoys = useDeliveryBoys();
  const orders = useAdminOrders(filters);

  const { setData: setOrdersData } = orders;
  const { setData: setSummaryData } = summary;

  /**
   * Pick up rider-side changes (an order going Delivered) without the admin
   * hitting refresh. Writes straight to the data, rather than `reload()`, so
   * the table doesn't flash back to skeletons every poll.
   */
  const refreshQuietly = useCallback(async () => {
    try {
      const [nextOrders, nextSummary] = await Promise.all([
        ordersApi.adminList(filters),
        ordersApi.adminSummary(),
      ]);
      setOrdersData(nextOrders);
      setSummaryData(nextSummary);
    } catch {
      // A failed background poll must not disturb what's already on screen.
    }
  }, [filters, setOrdersData, setSummaryData]);

  useAutoRefresh(refreshQuietly);

  const handleUpdated = useCallback((updated?: AdminOrder) => {
    orders.reload();
    summary.reload();
    if (updated) setDetailOrder((prev) => (prev?.id === updated.id ? updated : prev));
  }, [orders, summary]);

  const handleCreated = useCallback(() => {
    orders.reload();
    summary.reload();
  }, [orders, summary]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          icon={ShoppingBag}
          title="Orders Management"
          subtitle="View and manage all customer orders"
        />
        <Button onClick={() => setCreateOpen(true)}>
          <Plus size={16} /> New Order
        </Button>
      </div>

      <SummaryRow summary={summary.data} loading={summary.loading} />

      <AdminOrdersFilters filters={filters} onChange={setFilters} />

      {/* Table */}
      {orders.loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
        </div>
      ) : orders.error ? (
        <Card className="border-rose-400/30 p-6 text-center text-rose-200">{orders.error}</Card>
      ) : !orders.data || orders.data.length === 0 ? (
        <Card className="p-10 text-center text-mist/50">
          <ClipboardList size={36} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No orders match the selected filters.</p>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-white/5 text-left text-xs text-mist/50">
                <th className="px-3 py-2.5 font-medium">#</th>
                <th className="px-3 py-2.5 font-medium">Date</th>
                <th className="px-3 py-2.5 font-medium">Customer</th>
                <th className="px-3 py-2.5 font-medium">Items</th>
                <th className="px-3 py-2.5 font-medium">Total</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="px-3 py-2.5 font-medium">Rider</th>
                <th className="px-3 py-2.5 text-center font-medium">Pin</th>
                <th className="px-3 py-2.5 text-center font-medium">Paid</th>
                <th className="px-3 py-2.5 text-center font-medium">Hide</th>
                <th className="px-3 py-2.5 text-center font-medium">Details</th>
              </tr>
            </thead>
            <tbody>
              {orders.data.map((order, idx) => (
                <AdminOrderRow
                  key={order.id}
                  order={order}
                  index={idx}
                  deliveryBoys={deliveryBoys.data ?? []}
                  onUpdated={handleUpdated}
                  onViewDetails={setDetailOrder}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AdminOrderDetailModal
        order={detailOrder}
        onClose={() => setDetailOrder(null)}
        onUpdated={handleUpdated}
      />

      <CreateOrderModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={handleCreated}
      />
    </div>
  );
}
