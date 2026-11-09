"use client";

import { useAsync } from "@/hooks/useAsync";
import { ledgerApi } from "@/lib/api";
import type { PaymentClaimStatus, StatementFilters } from "@/lib/types";

/** Serialize filters so a fresh object identity doesn't re-trigger the fetch. */
const filterKey = (f: StatementFilters) =>
  `${f.start ?? ""}|${f.end ?? ""}|${f.source ?? ""}|${f.entry_type ?? ""}`;

export function useReceivables(search: string, onlyOwing: boolean) {
  return useAsync(
    () => ledgerApi.receivables({ search, only_owing: onlyOwing }),
    [search, onlyOwing]
  );
}

export function usePaymentClaims(status: PaymentClaimStatus, search: string) {
  return useAsync(
    () => ledgerApi.paymentClaims({ status, search }),
    [status, search]
  );
}

/** Just the count, for the badge that says there is checking to do. */
export function useWaitingClaimCount() {
  return useAsync(() => ledgerApi.paymentClaims({ limit: 1 }), []);
}

export function useStatement(userId: number | null, filters: StatementFilters) {
  return useAsync(
    () => (userId ? ledgerApi.statement(userId, filters) : Promise.resolve(null)),
    [userId, filterKey(filters)]
  );
}

export function useLedgerSummary(userId: number | null) {
  return useAsync(
    () => (userId ? ledgerApi.summary(userId) : Promise.resolve(null)),
    [userId]
  );
}
