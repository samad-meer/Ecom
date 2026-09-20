"use client";

import { useEffect, useRef, useState } from "react";
import { Landmark, Plus, Trash2, Upload, X } from "lucide-react";
import { ledgerApi, type PaymentAccount } from "@/lib/api/ledger";
import { Button, Input, Skeleton, useToast } from "@/components/ui";
import { cn } from "@/lib/cn";
import { SettingsSection } from "../SettingsSection";

/**
 * The accounts a customer can transfer money into.
 *
 * More than one, because a customer who banks with the same institution
 * transfers instantly and for free — so the rider needs to show whichever
 * account matches, not just the one that happened to be configured first.
 *
 * Turning an account off hides it from riders and customers without deleting
 * it, so a closed account keeps its history. That is almost always what you
 * want rather than Delete.
 */

const BLANK = {
  bank_name: "",
  account_title: "",
  account_number: "",
  iban: "",
  instructions: "",
  is_active: true,
  sort_order: 0,
};

export function PaymentAccountsSettings() {
  const notify = useToast();
  const [accounts, setAccounts] = useState<PaymentAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ ...BLANK });
  const [qr, setQr] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = () =>
    ledgerApi
      .paymentAccounts()
      .then(setAccounts)
      .catch(() => notify("Failed to load payment accounts.", "error"))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The server enforces this too; checking here saves a round trip and says why.
  const payable = form.account_number.trim() || form.iban.trim() || qr;
  const canSave = form.bank_name.trim() && form.account_title.trim() && payable;

  const reset = () => {
    setForm({ ...BLANK });
    setQr(null);
    setAdding(false);
    if (fileInput.current) fileInput.current.value = "";
  };

  const create = async () => {
    setSaving(true);
    try {
      await ledgerApi.createPaymentAccount({ ...form, qr });
      notify("Payment account added.");
      reset();
      await load();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Failed to add account.", "error");
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (account: PaymentAccount) => {
    setBusyId(account.id);
    try {
      await ledgerApi.updatePaymentAccount(account.id, { is_active: !account.is_active });
      await load();
    } catch {
      notify("Failed to update account.", "error");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (account: PaymentAccount) => {
    const label = `${account.bank_name} — ${account.account_title}`;
    if (
      !window.confirm(
        `Delete ${label}?\n\nCustomers will no longer see it. Turning it off ` +
          `instead does the same thing and can be undone.`,
      )
    ) {
      return;
    }
    setBusyId(account.id);
    try {
      await ledgerApi.deletePaymentAccount(account.id);
      notify("Payment account deleted.");
      await load();
    } catch {
      notify("Failed to delete account.", "error");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <SettingsSection
      id="payment-accounts"
      icon={Landmark}
      title="Payment Accounts"
      description="Where customers send online transfers. Riders show these at the door."
    >
      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {accounts.length === 0 && !adding && (
            <p className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-mist/50">
              No payment accounts yet. Customers cannot pay by transfer until you add one.
            </p>
          )}

          {accounts.map((a) => (
            <div
              key={a.id}
              className={cn(
                "flex flex-wrap items-start gap-4 rounded-xl border border-white/10 bg-white/5 p-4",
                !a.is_active && "opacity-55",
              )}
            >
              {a.qr ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={a.qr}
                  alt={`${a.bank_name} QR`}
                  className="h-20 w-20 rounded-lg bg-white object-contain p-1"
                />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-lg border border-dashed border-white/15 text-[11px] text-mist/35">
                  No QR
                </div>
              )}

              <div className="min-w-[200px] flex-1">
                <p className="text-sm font-semibold text-mist">{a.bank_name}</p>
                <p className="text-sm text-mist/70">{a.account_title}</p>
                {!!a.account_number && (
                  <p className="mt-1 font-mono text-xs text-mist/60">{a.account_number}</p>
                )}
                {!!a.iban && <p className="font-mono text-xs text-mist/45">{a.iban}</p>}
                {!!a.instructions && (
                  <p className="mt-1 text-xs text-mist/40">{a.instructions}</p>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => toggle(a)}
                  disabled={busyId === a.id}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                    a.is_active
                      ? "bg-emerald-400/15 text-emerald-300 hover:bg-emerald-400/25"
                      : "bg-white/10 text-mist/50 hover:bg-white/15",
                  )}
                >
                  {a.is_active ? "Active" : "Off"}
                </button>
                <button
                  onClick={() => remove(a)}
                  disabled={busyId === a.id}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-mist/40 transition hover:bg-rose-400/10 hover:text-rose-300"
                  title="Delete"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}

          {adding ? (
            <div className="flex flex-col gap-3 rounded-xl border border-wave/25 bg-wave/5 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  label="Bank or wallet"
                  placeholder="Meezan Bank"
                  value={form.bank_name}
                  onChange={(e) => setForm({ ...form, bank_name: e.target.value })}
                />
                <Input
                  label="Account title"
                  placeholder="Century Sip"
                  value={form.account_title}
                  onChange={(e) => setForm({ ...form, account_title: e.target.value })}
                />
                <Input
                  label="Account number"
                  placeholder="0258 0108357297"
                  value={form.account_number}
                  onChange={(e) => setForm({ ...form, account_number: e.target.value })}
                />
                <Input
                  label="IBAN"
                  placeholder="PK13MEZN0002580108357297"
                  value={form.iban}
                  onChange={(e) => setForm({ ...form, iban: e.target.value })}
                />
              </div>

              <Input
                label="Instructions (optional)"
                placeholder="Please share the payment screenshot."
                value={form.instructions}
                onChange={(e) => setForm({ ...form, instructions: e.target.value })}
              />

              <div>
                <label className="label">QR code (optional)</label>
                <div className="flex items-center gap-3">
                  <input
                    ref={fileInput}
                    type="file"
                    accept="image/*"
                    onChange={(e) => setQr(e.target.files?.[0] ?? null)}
                    className="hidden"
                  />
                  <Button variant="ghost" onClick={() => fileInput.current?.click()}>
                    <Upload size={14} /> {qr ? "Change image" : "Choose image"}
                  </Button>
                  {qr && (
                    <span className="flex items-center gap-2 text-xs text-mist/60">
                      {qr.name}
                      <button
                        onClick={() => {
                          setQr(null);
                          if (fileInput.current) fileInput.current.value = "";
                        }}
                        className="text-mist/40 hover:text-rose-300"
                      >
                        <X size={13} />
                      </button>
                    </span>
                  )}
                </div>
              </div>

              {!payable && (
                <p className="text-xs text-amber-300">
                  Give an account number, an IBAN, or a QR — otherwise the customer has
                  nothing to pay into.
                </p>
              )}

              <div className="flex gap-3 pt-1">
                <Button onClick={create} loading={saving} disabled={!canSave}>
                  Add account
                </Button>
                <Button variant="ghost" onClick={reset} disabled={saving}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="ghost" onClick={() => setAdding(true)}>
              <Plus size={15} /> Add payment account
            </Button>
          )}
        </div>
      )}
    </SettingsSection>
  );
}
