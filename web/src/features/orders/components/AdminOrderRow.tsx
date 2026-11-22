"use client";

import { useState } from "react";
import { Eye, EyeOff, Check, X, Pin } from "lucide-react";
import type { AdminOrder, DeliveryBoy, OrderStatus } from "@/lib/types";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/cn";
import { ordersApi } from "@/lib/api";
import { useToast } from "@/components/ui";

const ORDER_STATUSES: OrderStatus[] = [
  "Pending", "Processing", "Shipped", "Delivered", "Cancelled",
];

interface AdminOrderRowProps {
  order: AdminOrder;
  index: number;
  deliveryBoys: DeliveryBoy[];
  onUpdated: (updated: AdminOrder) => void;
  onViewDetails: (order: AdminOrder) => void;
}

export function AdminOrderRow({
  order,
  index,
  deliveryBoys,
  onUpdated,
  onViewDetails,
}: AdminOrderRowProps) {
  const notify = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const patch = async (field: string, data: Record<string, unknown>) => {
    setBusy(field);
    try {
      const updated = await ordersApi.adminUpdate(order.id, data);
      onUpdated(updated as AdminOrder);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Update failed.", "error");
    } finally {
      setBusy(null);
    }
  };

  const dateStr = new Date(order.created_at).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <tr
      className={cn(
        "border-b border-white/5 transition hover:bg-white/5",
        order.is_hidden && "opacity-50",
        order.is_pinned && "bg-amber-500/[0.04]"
      )}
    >
      <td className="px-3 py-2.5 text-sm text-mist/40">
        <span className="flex items-center gap-1.5">
          {order.is_pinned && (
            <span title="Pinned: Deliver First">
              <Pin size={13} className="text-amber-400 fill-amber-400 shrink-0" />
            </span>
          )}
          {index + 1}
        </span>
      </td>

      <td className="px-3 py-2.5 text-sm text-mist/70">{dateStr}</td>

      <td className="px-3 py-2.5">
        <p className="text-sm font-medium leading-tight text-mist">
          {order.customer_name}
          {order.guest_name && (
            <span className="ml-1.5 rounded bg-amber-400/15 px-1 py-0.5 text-[10px] text-amber-300">
              guest
            </span>
          )}
        </p>
        {order.customer_phone && (
          <p className="text-xs text-mist/50">{order.customer_phone}</p>
        )}
      </td>

      <td className="px-3 py-2.5">
        <span className="rounded-full bg-wave/15 px-2 py-0.5 text-xs text-wave">
          {order.items.length}×
        </span>
      </td>

      <td className="px-3 py-2.5 text-sm font-medium text-mist">
        {formatPrice(order.total_price)}
      </td>

      {/* Inline status selector */}
      <td className="px-3 py-2.5">
        <select
          value={order.status}
          disabled={busy === "status"}
          onChange={(e) => patch("status", { status: e.target.value as OrderStatus })}
          className={cn("input w-auto py-1 text-xs", busy === "status" && "opacity-50")}
        >
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </td>

      {/* Inline delivery boy selector & rider visibility toggle */}
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <select
            value={order.assigned_delivery_boy ?? ""}
            disabled={busy === "rider"}
            onChange={(e) =>
              patch("rider", {
                assigned_delivery_boy: e.target.value ? Number(e.target.value) : null,
              })
            }
            className={cn("input w-auto py-1 text-xs", busy === "rider" && "opacity-50")}
          >
            <option value="">— None —</option>
            {deliveryBoys.map((db) => (
              <option key={db.id} value={db.id}>
                {db.name}{db.is_available ? "" : " (busy)"}
              </option>
            ))}
          </select>
          {order.assigned_delivery_boy && (
            <button
              type="button"
              disabled={busy === "show_to_rider"}
              onClick={() => patch("show_to_rider", { show_to_rider: order.show_to_rider === false })}
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded transition shrink-0 cursor-pointer",
                order.show_to_rider === false
                  ? "bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 border border-rose-500/30"
                  : "bg-white/5 text-mist/40 hover:bg-white/10 hover:text-mist",
                busy === "show_to_rider" && "opacity-50"
              )}
              title={order.show_to_rider === false ? "Hidden from rider app (click to show)" : "Visible in rider app (click to hide)"}
            >
              {order.show_to_rider === false ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
          )}
        </div>
      </td>

      {/* Pin for Rider toggle */}
      <td className="px-3 py-2.5 text-center">
        <button
          disabled={busy === "is_pinned"}
          onClick={() => patch("is_pinned", { is_pinned: !order.is_pinned })}
          className={cn(
            "mx-auto flex h-7 w-7 items-center justify-center rounded-lg transition cursor-pointer",
            order.is_pinned
              ? "bg-amber-400/20 text-amber-300 hover:bg-amber-400/30"
              : "text-mist/30 hover:bg-white/10 hover:text-mist",
            busy === "is_pinned" && "opacity-50"
          )}
          title={order.is_pinned ? "Pinned (Deliver First) — click to unpin" : "Pin for rider (Deliver First)"}
        >
          <Pin size={14} className={cn(order.is_pinned && "fill-amber-300")} />
        </button>
      </td>

      {/* Paid toggle */}
      <td className="px-3 py-2.5 text-center">
        <button
          disabled={busy === "paid"}
          onClick={() => patch("paid", { is_paid: !order.is_paid })}
          className={cn(
            "mx-auto flex h-7 w-7 items-center justify-center rounded-full transition",
            order.is_paid
              ? "bg-emerald-400/20 text-emerald-300 hover:bg-emerald-400/30"
              : "bg-white/5 text-mist/30 hover:bg-white/10",
            busy === "paid" && "opacity-50"
          )}
          title={order.is_paid ? "Mark unpaid" : "Mark paid"}
        >
          {order.is_paid ? <Check size={14} /> : <X size={14} />}
        </button>
      </td>

      {/* Hide toggle */}
      <td className="px-3 py-2.5 text-center">
        <button
          disabled={busy === "hidden"}
          onClick={() => patch("hidden", { is_hidden: !order.is_hidden })}
          className={cn(
            "mx-auto flex h-7 w-7 items-center justify-center rounded-lg transition",
            order.is_hidden
              ? "text-amber-300 hover:bg-amber-400/10"
              : "text-mist/40 hover:bg-white/10 hover:text-mist",
            busy === "hidden" && "opacity-50"
          )}
          title={order.is_hidden ? "Unhide order" : "Hide order"}
        >
          {order.is_hidden ? <Eye size={15} /> : <EyeOff size={15} />}
        </button>
      </td>

      {/* Details */}
      <td className="px-3 py-2.5 text-center">
        <button
          onClick={() => onViewDetails(order)}
          className="mx-auto flex h-7 w-7 items-center justify-center rounded-lg text-mist/50 transition hover:bg-white/10 hover:text-wave"
          title="View details"
        >
          <Eye size={15} />
        </button>
      </td>
    </tr>
  );
}
