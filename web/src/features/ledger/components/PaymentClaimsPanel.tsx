"use client";

import { useState } from "react";
import { Check, Search, Smartphone, X } from "lucide-react";
import type { PaymentClaim, PaymentClaimStatus } from "@/lib/types";
import { ledgerApi } from "@/lib/api";
import { formatPrice } from "@/lib/format";
import { Card, EmptyState, Skeleton, useToast } from "@/components/ui";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { cn } from "@/lib/cn";
import { usePaymentClaims } from "../hooks/useLedger";

const TABS: { key: PaymentClaimStatus; label: string; empty: string }[] = [
  { key: "waiting", label: "Waiting", empty: "Nothing to check right now." },
  { key: "not_found", label: "Not found", empty: "No payments are missing from the bank." },
  { key: "confirmed", label: "Confirmed", empty: "No online payments have been confirmed yet." },
];

const dateTime = (value: string) =>
  new Date(value).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });

function ClaimRow({ claim, onOpen, onChanged }: {
  claim: PaymentClaim;
  onOpen: (customerId: number) => void;
  onChanged: () => void;
}) {
  const notify = useToast();
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState<"confirm" | "not_found" | null>(null);

  const act = async (action: "confirm" | "not_found") => {
    setBusy(action);
    try {
      if (action === "confirm") {
        const updated = await ledgerApi.confirmClaim(claim.id, reference.trim());
        notify(updated.receipt_number
          ? `Confirmed — receipt ${updated.receipt_number}`
          : "Confirmed — order marked paid");
      } else {
        await ledgerApi.markClaimNotFound(claim.id);
        notify("Marked not found. It is due again and can still be confirmed.");
      }
      onChanged();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Could not update this payment.", "error");
      setBusy(null);
    }
  };

  const customerId = claim.customer;

  return (
    <tr className="border-b border-white/5 align-top">
      <td className="px-3 py-2.5 whitespace-nowrap text-mist/50">{dateTime(claim.created_at)}</td>
      <td className="px-3 py-2.5">
        {customerId ? (
          <button
            onClick={() => onOpen(customerId)}
            className="text-left font-medium text-mist hover:text-sky-200"
          >
            {claim.customer_name}
          </button>
        ) : (
          <p className="font-medium text-mist">
            {claim.customer_name} <span className="text-xs font-normal text-mist/40">guest</span>
          </p>
        )}
        <p className="text-xs text-mist/40">
          {[claim.customer_code, claim.phone].filter(Boolean).join(" · ") || "–"}
        </p>
      </td>
      <td className="px-3 py-2.5 text-mist/60">
        <p>{claim.order ? `#${claim.order}` : "–"}</p>
        {claim.order_total && (
          <p className="text-xs text-mist/40">{formatPrice(claim.order_total)}</p>
        )}
      </td>
      <td className="px-3 py-2.5 text-mist/60">{claim.claimed_by_name || "–"}</td>
      <td className="px-3 py-2.5 text-right font-bold text-mist">{formatPrice(claim.amount)}</td>
      <td className="px-3 py-2.5">
        {claim.status === "confirmed" ? (
          <div className="text-xs text-mist/50">
            <p className="font-medium text-emerald-300">
              {claim.receipt_number || "Order marked paid"}
            </p>
            {claim.reference && <p>Transaction {claim.reference}</p>}
            {claim.resolved_at && (
              <p>{claim.resolved_by_name || "Office"}, {dateTime(claim.resolved_at)}</p>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5">
              <input
                className="input h-8 w-36 px-2 py-1 text-xs"
                placeholder="Transaction ID"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                disabled={busy !== null}
              />
              <button
                onClick={() => act("confirm")}
                disabled={busy !== null}
                title="The money is in the bank"
                className="flex items-center gap-1 rounded-full border border-emerald-400/40 bg-emerald-400/15 px-3 py-1.5 text-xs font-medium text-emerald-200 transition hover:bg-emerald-400/25 disabled:opacity-50"
              >
                <Check size={13} /> {busy === "confirm" ? "Saving…" : "Confirm"}
              </button>
              {claim.status === "waiting" && (
                <button
                  onClick={() => act("not_found")}
                  disabled={busy !== null}
                  title="The bank does not show this payment"
                  className="flex items-center gap-1 rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-mist/60 transition hover:text-rose-200 disabled:opacity-50"
                >
                  <X size={13} /> Not found
                </button>
              )}
            </div>
            {claim.note && <p className="text-xs text-rose-200/80">{claim.note}</p>}
          </div>
        )}
      </td>
    </tr>
  );
}

interface PaymentClaimsPanelProps {
  onOpen: (customerId: number) => void;
  /** Keeps the waiting badge on the page tabs in step with this list. */
  onChanged: () => void;
}

export function PaymentClaimsPanel({ onOpen, onChanged }: PaymentClaimsPanelProps) {
  const [status, setStatus] = useState<PaymentClaimStatus>("waiting");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const { data, loading, error, reload } = usePaymentClaims(status, debouncedSearch);

  const rows = data?.results ?? [];
  const empty = TABS.find((t) => t.key === status)?.empty;

  const changed = () => {
    reload();
    onChanged();
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-mist/50">
        A rider&apos;s Online tap does not change a balance. Check the bank or wallet, then
        confirm. A transaction ID stops the same transfer being used twice.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-2">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setStatus(tab.key)}
              className={cn(
                "rounded-full border px-4 py-2 text-sm font-medium transition",
                status === tab.key
                  ? "border-sky-400/40 bg-sky-400/15 text-sky-200"
                  : "border-white/10 text-mist/60 hover:text-mist"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="relative min-w-[220px] flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-mist/40" />
          <input
            className="input w-full pl-10"
            placeholder="Search name, code or phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {loading && !data ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14" />)}
        </div>
      ) : error ? (
        <Card className="border-rose-400/30 p-6 text-center text-rose-200">{error}</Card>
      ) : rows.length === 0 ? (
        <EmptyState icon={Smartphone} title="No payments here" description={empty} />
      ) : (
        <>
          <p className="text-sm text-mist/50">
            {data?.count} payment{data?.count === 1 ? "" : "s"} ·{" "}
            <span className="font-semibold text-mist">{formatPrice(data?.total_amount ?? 0)}</span>
          </p>
          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead>
                  <tr className="border-b border-white/10 bg-white/5 text-left text-xs uppercase tracking-wide text-mist/40">
                    <th className="px-3 py-2.5 font-medium">Reported</th>
                    <th className="px-3 py-2.5 font-medium">Customer</th>
                    <th className="px-3 py-2.5 font-medium">Order</th>
                    <th className="px-3 py-2.5 font-medium">Rider</th>
                    <th className="px-3 py-2.5 text-right font-medium">Amount</th>
                    <th className="px-3 py-2.5 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((claim) => (
                    <ClaimRow key={claim.id} claim={claim} onOpen={onOpen} onChanged={changed} />
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
