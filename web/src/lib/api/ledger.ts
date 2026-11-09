import { apiDownload, apiFetch, apiShare } from "./client";
import type {
  BusinessInfo,
  LedgerEntry,
  LedgerStatement,
  LedgerSummary,
  ManualEntryInput,
  PaymentClaim,
  PaymentClaimList,
  PaymentClaimStatus,
  Receivable,
  RecordPaymentInput,
  StatementFilters,
} from "../types";

function query(filters: StatementFilters = {}): string {
  const params = new URLSearchParams();
  if (filters.start) params.set("start", filters.start);
  if (filters.end) params.set("end", filters.end);
  if (filters.source) params.set("source", filters.source);
  if (filters.entry_type) params.set("entry_type", filters.entry_type);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/**
 * Customer ledger.
 *
 * Every `balance` returned here is **owed-positive** — a positive number means
 * the customer owes money. That is the opposite of the stored account_balance
 * and matches the printed statement, so never mix the two.
 */

/** One bank account or wallet a customer can transfer to. */
export interface PaymentAccount {
  id: number;
  bank_name: string;
  account_title: string;
  account_number: string;
  iban: string;
  qr: string | null;
  instructions: string;
  is_active: boolean;
  sort_order: number;
}

export type PaymentAccountInput = Omit<PaymentAccount, "id" | "qr"> & {
  /** A file when the admin picks one, null to leave the existing QR alone. */
  qr?: File | null;
};

export const ledgerApi = {
  // ── Payment accounts ──────────────────────────────────────────────────────
  // Sent as multipart because the QR is a file upload; the API accepts JSON
  // too, but one code path is easier to keep correct than two.

  paymentAccounts(): Promise<PaymentAccount[]> {
    return apiFetch<PaymentAccount[]>("/ledger/admin/payment-accounts/", { auth: true });
  },

  createPaymentAccount(input: PaymentAccountInput) {
    return apiFetch<PaymentAccount>("/ledger/admin/payment-accounts/", {
      method: "POST",
      auth: true,
      body: toPaymentForm(input),
    });
  },

  updatePaymentAccount(id: number, input: Partial<PaymentAccountInput>) {
    return apiFetch<PaymentAccount>(`/ledger/admin/payment-accounts/${id}/`, {
      method: "PATCH",
      auth: true,
      body: toPaymentForm(input),
    });
  },

  deletePaymentAccount(id: number) {
    return apiFetch<void>(`/ledger/admin/payment-accounts/${id}/`, {
      method: "DELETE",
      auth: true,
    });
  },

  /** Business identity. Readable signed-out — it is what the storefront's
   *  "contact us" button uses — so no `auth` here. */
  business() {
    return apiFetch<BusinessInfo>("/ledger/business/");
  },

  /** Admin-only; the server 403s anyone else on the same URL. */
  updateBusiness(patch: Partial<Pick<BusinessInfo, "share_location_label">>) {
    return apiFetch<BusinessInfo>("/ledger/business/", {
      method: "PATCH",
      body: patch,
      auth: true,
    });
  },

  receivables(opts: { search?: string; only_owing?: boolean } = {}) {
    const params = new URLSearchParams();
    if (opts.search) params.set("search", opts.search);
    if (opts.only_owing) params.set("only_owing", "true");
    const qs = params.toString();
    return apiFetch<{ count: number; results: Receivable[] }>(
      `/ledger/customers/${qs ? `?${qs}` : ""}`,
      { auth: true }
    );
  },

  statement(userId: number, filters: StatementFilters = {}) {
    return apiFetch<LedgerStatement>(
      `/ledger/customers/${userId}/statement/${query(filters)}`,
      { auth: true }
    );
  },

  summary(userId: number) {
    return apiFetch<LedgerSummary>(`/ledger/customers/${userId}/summary/`, {
      auth: true,
    });
  },

  recordPayment(payload: RecordPaymentInput) {
    return apiFetch<LedgerEntry>("/ledger/payments/", {
      method: "POST",
      auth: true,
      body: payload,
    });
  },

  postEntry(payload: ManualEntryInput) {
    return apiFetch<LedgerEntry>("/ledger/entries/", {
      method: "POST",
      auth: true,
      body: payload,
    });
  },

  voidEntry(entryId: number, reason: string) {
    return apiFetch<LedgerEntry>(`/ledger/entries/${entryId}/void/`, {
      method: "POST",
      auth: true,
      body: { reason },
    });
  },

  // ── Online payment claims ─────────────────────────────────────────────────

  paymentClaims(opts: { status?: PaymentClaimStatus; search?: string; limit?: number } = {}) {
    const params = new URLSearchParams();
    if (opts.status) params.set("status", opts.status);
    if (opts.search) params.set("search", opts.search);
    if (opts.limit) params.set("limit", String(opts.limit));
    const qs = params.toString();
    return apiFetch<PaymentClaimList>(`/ledger/claims/${qs ? `?${qs}` : ""}`, { auth: true });
  },

  confirmClaim(claimId: number, reference: string) {
    return apiFetch<PaymentClaim>(`/ledger/claims/${claimId}/confirm/`, {
      method: "POST",
      auth: true,
      body: { reference },
    });
  },

  markClaimNotFound(claimId: number) {
    return apiFetch<PaymentClaim>(`/ledger/claims/${claimId}/not-found/`, {
      method: "POST",
      auth: true,
      body: {},
    });
  },

  downloadReceipt(entryId: number, receiptNumber?: string | null) {
    return apiDownload(
      `/ledger/entries/${entryId}/receipt/`,
      `receipt-${receiptNumber || entryId}.pdf`
    );
  },

  downloadStatement(userId: number, username: string, filters: StatementFilters = {}) {
    return apiDownload(
      `/ledger/customers/${userId}/statement.pdf${query(filters)}`,
      `statement-${username}.pdf`
    );
  },

  /**
   * Offer the statement to the OS share sheet (WhatsApp, email, anything).
   * Falls back to a download where the browser cannot share files, which is
   * most desktops — see apiShare.
   */
  shareStatement(
    userId: number,
    username: string,
    customerName: string,
    filters: StatementFilters = {}
  ) {
    return apiShare(
      `/ledger/customers/${userId}/statement.pdf${query(filters)}`,
      `statement-${username}.pdf`,
      `Statement — ${customerName}`,
      `Account statement for ${customerName}.`
    );
  },
};

/**
 * Build the multipart body for a payment account.
 *
 * `qr` is omitted entirely when it is null or undefined — sending an empty
 * value would clear a QR the admin never touched.
 */
function toPaymentForm(input: Partial<PaymentAccountInput>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null) continue;
    if (key === "qr") {
      form.append("qr", value as File);
    } else if (typeof value === "boolean") {
      form.append(key, value ? "true" : "false");
    } else {
      form.append(key, String(value));
    }
  }
  return form;
}
