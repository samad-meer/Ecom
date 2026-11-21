"use client";

import { useState, useEffect } from "react";
import { Truck, Phone, MessageSquare, Check, RotateCcw, Smartphone, CheckCircle } from "lucide-react";
import { deliverySettingsApi, type DeliverySettings } from "@/lib/api";
import { Button, Skeleton, useToast } from "@/components/ui";
import { SettingsSection } from "../SettingsSection";

export const DEFAULT_DELIVERY_CONFIRMATION_NOTE =
  "Once marked as delivered, this order is locked. Any changes or corrections must be handled by the office.";

export function RiderContactSettings() {
  const notify = useToast();
  const [canCall, setCanCall] = useState(true);
  const [canWhatsApp, setCanWhatsApp] = useState(true);
  const [note, setNote] = useState(DEFAULT_DELIVERY_CONFIRMATION_NOTE);

  const [savedCall, setSavedCall] = useState(true);
  const [savedWhatsApp, setSavedWhatsApp] = useState(true);
  const [savedNote, setSavedNote] = useState(DEFAULT_DELIVERY_CONFIRMATION_NOTE);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    deliverySettingsApi
      .get()
      .then((data: DeliverySettings) => {
        setCanCall(data.rider_can_call);
        setSavedCall(data.rider_can_call);
        setCanWhatsApp(data.rider_can_whatsapp);
        setSavedWhatsApp(data.rider_can_whatsapp);
        const fetchedNote = data.delivery_confirmation_note?.trim() || DEFAULT_DELIVERY_CONFIRMATION_NOTE;
        setNote(fetchedNote);
        setSavedNote(fetchedNote);
      })
      .catch(() => notify("Failed to load delivery settings.", "error"))
      .finally(() => setLoading(false));
  }, []);

  const isDirty =
    canCall !== savedCall ||
    canWhatsApp !== savedWhatsApp ||
    note.trim() !== savedNote.trim();

  const effectiveNote = note.trim() || DEFAULT_DELIVERY_CONFIRMATION_NOTE;

  const save = async () => {
    setSaving(true);
    try {
      const result = await deliverySettingsApi.update({
        rider_can_call: canCall,
        rider_can_whatsapp: canWhatsApp,
        delivery_confirmation_note: note.trim() || DEFAULT_DELIVERY_CONFIRMATION_NOTE,
      });
      setCanCall(result.rider_can_call);
      setSavedCall(result.rider_can_call);
      setCanWhatsApp(result.rider_can_whatsapp);
      setSavedWhatsApp(result.rider_can_whatsapp);
      const updatedNote = result.delivery_confirmation_note?.trim() || DEFAULT_DELIVERY_CONFIRMATION_NOTE;
      setNote(updatedNote);
      setSavedNote(updatedNote);
      notify("Delivery and rider settings saved successfully.");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Save failed.", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setCanCall(savedCall);
    setCanWhatsApp(savedWhatsApp);
    setNote(savedNote);
  };

  const handleResetNoteDefault = () => {
    setNote(DEFAULT_DELIVERY_CONFIRMATION_NOTE);
  };

  return (
    <SettingsSection
      id="rider-contact"
      icon={Truck}
      title="Rider & Delivery Settings"
      description="Manage rider customer communication channels and customize the confirmation warning shown to riders before completing a delivery."
    >
      {loading ? (
        <Skeleton className="h-60" />
      ) : (
        <div className="flex flex-col gap-6">
          {/* Communication Toggles */}
          <div>
            <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-mist/60">
              Customer Contact Permissions
            </h4>
            <div className="grid gap-4 sm:grid-cols-2">
              {/* Call Toggle Tile */}
              <div
                onClick={() => setCanCall(!canCall)}
                className={`glass flex cursor-pointer items-start gap-4 rounded-xl border p-4 transition ${
                  canCall
                    ? "border-emerald-500/40 bg-emerald-500/5 hover:border-emerald-500/60"
                    : "border-white/10 opacity-70 hover:opacity-100"
                }`}
              >
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                    canCall ? "bg-emerald-500/20 text-emerald-400" : "bg-white/5 text-mist/40"
                  }`}
                >
                  <Phone size={20} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-mist">Customer Call Option</span>
                    <input
                      type="checkbox"
                      checked={canCall}
                      onChange={(e) => setCanCall(e.target.checked)}
                      className="h-4 w-4 rounded border-white/20 bg-white/5 text-emerald-500 focus:ring-emerald-500/40"
                    />
                  </div>
                  <p className="mt-1 text-xs text-mist/60 leading-relaxed">
                    Shows the Call button in the delivery screen, allowing the rider to phone the customer directly.
                  </p>
                  <div className="mt-2.5">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        canCall
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : "bg-white/5 text-mist/40 border border-white/10"
                      }`}
                    >
                      {canCall ? "Enabled for Riders" : "Disabled"}
                    </span>
                  </div>
                </div>
              </div>

              {/* WhatsApp Toggle Tile */}
              <div
                onClick={() => setCanWhatsApp(!canWhatsApp)}
                className={`glass flex cursor-pointer items-start gap-4 rounded-xl border p-4 transition ${
                  canWhatsApp
                    ? "border-emerald-500/40 bg-emerald-500/5 hover:border-emerald-500/60"
                    : "border-white/10 opacity-70 hover:opacity-100"
                }`}
              >
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                    canWhatsApp ? "bg-emerald-500/20 text-emerald-400" : "bg-white/5 text-mist/40"
                  }`}
                >
                  <MessageSquare size={20} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-mist">Customer WhatsApp Option</span>
                    <input
                      type="checkbox"
                      checked={canWhatsApp}
                      onChange={(e) => setCanWhatsApp(e.target.checked)}
                      className="h-4 w-4 rounded border-white/20 bg-white/5 text-emerald-500 focus:ring-emerald-500/40"
                    />
                  </div>
                  <p className="mt-1 text-xs text-mist/60 leading-relaxed">
                    Shows the WhatsApp button in the delivery screen, allowing the rider to message the customer.
                  </p>
                  <div className="mt-2.5">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        canWhatsApp
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : "bg-white/5 text-mist/40 border border-white/10"
                      }`}
                    >
                      {canWhatsApp ? "Enabled for Riders" : "Disabled"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {!canCall && !canWhatsApp && (
              <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3.5 text-xs text-amber-200">
                <strong>Notice:</strong> When both Call and WhatsApp options are disabled, customer contact buttons will be hidden from riders. Riders will be instructed to contact the office if they cannot locate an address.
              </div>
            )}
          </div>

          {/* Delivery Confirmation Warning Note */}
          <div className="flex flex-col gap-2 pt-2 border-t border-white/10">
            <div className="flex items-center justify-between">
              <div>
                <label
                  htmlFor="delivery-confirmation-note"
                  className="text-sm font-medium text-mist/90"
                >
                  Delivery Confirmation Popup Notice
                </label>
                <p className="text-xs text-mist/50 mt-0.5">
                  Displayed in the confirmation dialog on the rider app when tapping “Mark as Delivered”.
                </p>
              </div>
              <span className="text-xs text-mist/40 font-mono">
                {note.length} / 500
              </span>
            </div>

            <textarea
              id="delivery-confirmation-note"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={DEFAULT_DELIVERY_CONFIRMATION_NOTE}
              maxLength={500}
              className="w-full rounded-xl border border-white/10 bg-white/5 p-3.5 text-sm text-mist placeholder-mist/30 focus:border-wave/60 focus:outline-none focus:ring-1 focus:ring-wave/60 leading-relaxed"
            />

            <div className="flex items-center justify-between">
              <p className="text-xs text-mist/40">
                Default: “{DEFAULT_DELIVERY_CONFIRMATION_NOTE}”
              </p>
              {note !== DEFAULT_DELIVERY_CONFIRMATION_NOTE && (
                <button
                  type="button"
                  onClick={handleResetNoteDefault}
                  className="flex items-center gap-1 text-xs text-mist/60 hover:text-mist transition"
                >
                  <RotateCcw size={12} /> Reset to Default
                </button>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3">
            <Button
              onClick={save}
              disabled={!isDirty || saving}
              className="flex items-center gap-2"
            >
              <Check size={16} /> {saving ? "Saving…" : "Save Delivery Settings"}
            </Button>
            {isDirty && (
              <Button
                variant="ghost"
                onClick={handleReset}
                disabled={saving}
              >
                Discard
              </Button>
            )}
          </div>

          {/* Live Mobile Dialog Preview */}
          <div className="rounded-2xl border border-white/10 bg-night/60 p-5 backdrop-blur-md">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Smartphone className="h-4 w-4 text-wave" />
                <span className="text-xs font-semibold uppercase tracking-wider text-mist/60">
                  Rider App Delivery Dialog Preview
                </span>
              </div>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-medium">
                Live Simulation
              </span>
            </div>

            <div className="mx-auto max-w-xs rounded-2xl bg-white p-5 text-center shadow-2xl border border-slate-100">
              {/* Checkmark circle icon */}
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50">
                <CheckCircle className="h-8 w-8 text-emerald-600" />
              </div>

              <h4 className="text-base font-extrabold text-slate-900 tracking-tight">
                Deliver order #9?
              </h4>
              <p className="mt-1 text-xs font-semibold text-slate-600">
                No payment collected
              </p>

              <div className="my-3 border-t border-slate-100" />

              <p className="text-xs leading-relaxed text-slate-500 font-medium transition-all duration-200">
                {effectiveNote}
              </p>

              <div className="mt-4 flex gap-2">
                <div className="flex-1 rounded-xl bg-slate-100 py-2.5 text-center text-xs font-bold text-slate-700">
                  Cancel
                </div>
                <div className="flex-1 rounded-xl bg-emerald-700 py-2.5 text-center text-xs font-bold text-white shadow-sm">
                  Yes, deliver
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </SettingsSection>
  );
}
