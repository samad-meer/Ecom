"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BookOpen, MessageCircle, Search, Wallet } from "lucide-react";
import type { Receivable } from "@/lib/types";
import { formatPrice } from "@/lib/format";
import { Card, EmptyState, PageHeader, Skeleton } from "@/components/ui";
import { balanceReminderMessage, canWhatsApp, openWhatsApp } from "@/lib/whatsapp";
import { cn } from "@/lib/cn";
import { useReceivables, useWaitingClaimCount } from "../hooks/useLedger";
import { CustomerStatement } from "./CustomerStatement";
import { PaymentClaimsPanel } from "./PaymentClaimsPanel";

function ReceivablesTable({ onOpen }: { onOpen: (id: number) => void }) {
  const [search, setSearch] = useState("");
  const [onlyOwing, setOnlyOwing] = useState(true);
  const { data, loading, error } = useReceivables(search, onlyOwing);

  const rows = data?.results ?? [];
  const totalOwed = rows.reduce((sum, r) => sum + Math.max(Number(r.balance), 0), 0);

  const message = (r: Receivable) =>
    balanceReminderMessage({
      customerName: r.name,
      balance: Number(r.balance),
      bottlesHeld: r.bottles_held,
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-mist/40" />
          <input
            className="input w-full pl-10"
            placeholder="Search name, code, phone or address…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button
          onClick={() => setOnlyOwing((v) => !v)}
          className={cn(
            "rounded-full border px-4 py-2 text-sm font-medium transition",
            onlyOwing
              ? "border-rose-400/40 bg-rose-400/15 text-rose-200"
              : "border-white/10 text-mist/60 hover:text-mist"
          )}
        >
          {onlyOwing ? "Showing customers who owe" : "Showing everyone"}
        </button>
      </div>

      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14" />)}
        </div>
      ) : error ? (
        <Card className="border-rose-400/30 p-6 text-center text-rose-200">{error}</Card>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title={onlyOwing ? "Nobody owes anything" : "No customers found"}
          description={onlyOwing ? "Every account is settled or in credit." : undefined}
        />
      ) : (
        <>
          <p className="text-sm text-mist/50">
            {rows.length} customer{rows.length === 1 ? "" : "s"} ·{" "}
            <span className="font-semibold text-rose-300">{formatPrice(totalOwed)}</span> outstanding
          </p>
          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-white/10 bg-white/5 text-left text-xs uppercase tracking-wide text-mist/40">
                    <th className="px-3 py-2.5 font-medium">Code</th>
                    <th className="px-3 py-2.5 font-medium">Customer</th>
                    <th className="px-3 py-2.5 font-medium">Phone</th>
                    <th className="px-3 py-2.5 text-right font-medium">Bottles</th>
                    <th className="px-3 py-2.5 font-medium">Last payment</th>
                    <th className="px-3 py-2.5 text-right font-medium">Balance</th>
                    <th className="px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const balance = Number(r.balance);
                    return (
                      <tr
                        key={r.id}
                        onClick={() => onOpen(r.id)}
                        className="cursor-pointer border-b border-white/5 hover:bg-white/5"
                      >
                        <td className="px-3 py-2.5 text-mist/40">{r.customer_code || "–"}</td>
                        <td className="px-3 py-2.5">
                          <p className="font-medium text-mist">{r.name}</p>
                          <p className="text-xs text-mist/40">@{r.username}</p>
                        </td>
                        <td className="px-3 py-2.5 text-mist/60">{r.phone || "–"}</td>
                        <td className="px-3 py-2.5 text-right text-mist/60">
                          {r.bottles_held || <span className="text-mist/25">–</span>}
                        </td>
                        <td className="px-3 py-2.5 text-mist/50">{r.last_payment_date || "Never"}</td>
                        <td className={cn(
                          "px-3 py-2.5 text-right font-bold",
                          balance > 0 ? "text-rose-300" : balance < 0 ? "text-emerald-300" : "text-mist/40"
                        )}>
                          {balance === 0 ? "Settled" : formatPrice(Math.abs(balance))}
                        </td>
                        <td className="px-3 py-2.5">
                          {canWhatsApp(r.phone) && (
                            <button
                              onClick={(e) => { e.stopPropagation(); openWhatsApp(r.phone, message(r)); }}
                              className="rounded p-1.5 text-mist/40 transition hover:bg-white/10 hover:text-emerald-300"
                              title="Send a balance reminder on WhatsApp"
                            >
                              <MessageCircle size={15} />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function LedgerLanding({ onOpen }: { onOpen: (id: number) => void }) {
  const [view, setView] = useState<"balances" | "online">("balances");
  const waiting = useWaitingClaimCount();
  const waitingCount = waiting.data?.count ?? 0;

  const tabClass = (active: boolean) => cn(
    "rounded-full border px-4 py-2 text-sm font-medium transition",
    active
      ? "border-sky-400/40 bg-sky-400/15 text-sky-200"
      : "border-white/10 text-mist/60 hover:text-mist"
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setView("balances")} className={tabClass(view === "balances")}>
          Balances
        </button>
        <button onClick={() => setView("online")} className={tabClass(view === "online")}>
          Online payments
          {waitingCount > 0 && (
            <span className="ml-2 rounded-full bg-amber-400/20 px-2 py-0.5 text-xs text-amber-200">
              {waitingCount}
            </span>
          )}
        </button>
      </div>
      {view === "balances" ? (
        <ReceivablesTable onOpen={onOpen} />
      ) : (
        <PaymentClaimsPanel onOpen={onOpen} onChanged={waiting.reload} />
      )}
    </div>
  );
}

function LedgerPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const selected = params.get("customer");
  const userId = selected ? Number(selected) : null;

  // Deep-linked via ?customer=<id> rather than a dynamic route, so the
  // receivables list stays the landing page and the URL is still shareable.
  const open = (id: number) => router.push(`/manage/ledger?customer=${id}`);
  const back = () => router.push("/manage/ledger");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={BookOpen}
        title="Customer Ledger"
        subtitle="Balances, statements, payments and receipts"
      />
      {userId ? (
        <CustomerStatement userId={userId} onBack={back} />
      ) : (
        <LedgerLanding onOpen={open} />
      )}
    </div>
  );
}

export function LedgerPage() {
  // useSearchParams needs a Suspense boundary under static export.
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <LedgerPageInner />
    </Suspense>
  );
}
