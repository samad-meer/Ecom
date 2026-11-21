"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, RotateCcw, Smartphone, Check } from "lucide-react";
import { ledgerApi } from "@/lib/api/ledger";
import { Button, Input, Skeleton, useToast } from "@/components/ui";
import { SettingsSection } from "../SettingsSection";

const DEFAULT_MESSAGE = "Your order is under process";

export function OrderConfirmationSettings() {
  const notify = useToast();
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [saved, setSaved] = useState(DEFAULT_MESSAGE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    ledgerApi
      .business()
      .then((data) => {
        const val = data.order_success_message?.trim() || DEFAULT_MESSAGE;
        setMessage(val);
        setSaved(val);
      })
      .catch(() => notify("Failed to load order confirmation settings.", "error"))
      .finally(() => setLoading(false));
  }, []);

  const isDirty = message.trim() !== saved;
  const effective = message.trim() || DEFAULT_MESSAGE;

  const save = async () => {
    setSaving(true);
    try {
      const result = await ledgerApi.updateBusiness({
        order_success_message: message.trim() || DEFAULT_MESSAGE,
      });
      const updated = result.order_success_message?.trim() || message.trim() || DEFAULT_MESSAGE;
      setSaved(updated);
      setMessage(updated);
      notify("Order confirmation message saved successfully.");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Save failed.", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefault = () => {
    setMessage(DEFAULT_MESSAGE);
  };

  return (
    <SettingsSection
      id="order-confirmation"
      icon={CheckCircle2}
      title="Order Confirmation Message"
      description="Customize the subtitle message displayed to customers immediately after they place an order in the mobile app."
    >
      {loading ? (
        <Skeleton className="h-44" />
      ) : (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label
                htmlFor="order-success-message"
                className="text-sm font-medium text-mist/80"
              >
                Subtitle Text on Order Placed Screen
              </label>
              <span className="text-xs text-mist/40 font-mono">
                {message.length} / 255
              </span>
            </div>
            <Input
              id="order-success-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={DEFAULT_MESSAGE}
              maxLength={255}
            />
            <p className="text-xs text-mist/50">
              Default: “{DEFAULT_MESSAGE}”. This text reflects in real time for all customer apps.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3">
            <Button
              onClick={save}
              disabled={!isDirty || saving}
              className="px-5"
            >
              <Check className="mr-1.5 h-4 w-4" />
              {saving ? "Saving..." : "Save Changes"}
            </Button>
            {message !== DEFAULT_MESSAGE && (
              <Button
                variant="ghost"
                onClick={handleResetDefault}
                disabled={saving}
                className="text-xs text-mist/70 hover:text-mist"
              >
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                Reset to Default
              </Button>
            )}
          </div>

          {/* Mobile Screen Live Preview */}
          <div className="rounded-2xl border border-white/10 bg-night/60 p-5 backdrop-blur-md">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Smartphone className="h-4 w-4 text-wave" />
                <span className="text-xs font-semibold uppercase tracking-wider text-mist/60">
                  Customer Mobile App Preview
                </span>
              </div>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-medium">
                Live Simulation
              </span>
            </div>

            <div className="mx-auto max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl border border-slate-100">
              {/* Checkmark circle icon */}
              <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-500">
                <CheckCircle2 className="h-10 w-10 text-emerald-500" />
              </div>

              <h4 className="text-lg font-bold text-slate-800 tracking-tight">
                Order Placed!
              </h4>
              <p className="mt-1 text-sm font-medium text-slate-500 transition-all duration-200">
                {effective}
              </p>

              <div className="mt-5 rounded-xl bg-slate-50 p-3 text-left border border-slate-100/80">
                <div className="flex justify-between py-1 text-xs text-slate-500">
                  <span>Order ID</span>
                  <span className="font-semibold text-slate-700">#123</span>
                </div>
                <div className="flex justify-between py-1 text-xs text-slate-500">
                  <span>Total Amount</span>
                  <span className="font-bold text-slate-900">PKR 360.00</span>
                </div>
                <div className="flex justify-between py-1 text-xs text-slate-500">
                  <span>Payment Method</span>
                  <span className="font-semibold text-slate-700">COD</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </SettingsSection>
  );
}
