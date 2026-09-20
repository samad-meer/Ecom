"use client";

import { useState, useEffect } from "react";
import { Languages, Check, Power } from "lucide-react";
import { localizationApi } from "@/lib/api/localization";
import { Button, Skeleton, useToast } from "@/components/ui";
import { SettingsSection } from "../SettingsSection";

const USER_TYPES = [
  { value: "customer",     label: "Customer" },
  { value: "delivery_boy", label: "Rider / Delivery Boy" },
  { value: "staff",        label: "Staff" },
  { value: "admin",        label: "Admin" },
];

export function LanguageSettings() {
  const notify = useToast();
  const [allowed, setAllowed] = useState<string[]>([]);
  const [saved, setSaved] = useState<string[]>([]);
  const [urduEnabled, setUrduEnabled] = useState(true);
  const [savedUrdu, setSavedUrdu] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    localizationApi.getLanguageAccess()
      .then((data) => {
        setAllowed(data.allowed_user_types);
        setSaved(data.allowed_user_types);
        setUrduEnabled(data.urdu_enabled);
        setSavedUrdu(data.urdu_enabled);
      })
      .catch(() => notify("Failed to load language access settings.", "error"))
      .finally(() => setLoading(false));
  }, []);

  const toggle = (value: string) => {
    setAllowed((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  };

  const isDirty =
    JSON.stringify([...allowed].sort()) !== JSON.stringify([...saved].sort()) ||
    urduEnabled !== savedUrdu;

  const save = async () => {
    setSaving(true);
    try {
      const result = await localizationApi.updateLanguageAccess({
        urdu_enabled: urduEnabled,
        allowed_user_types: allowed,
      });
      setSaved(result.allowed_user_types);
      setSavedUrdu(result.urdu_enabled);
      notify("Language access settings saved.");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Save failed.", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsSection
      id="language"
      icon={Languages}
      title="Language Access"
      description="Turn Urdu on or off for the whole app, and choose which user types may switch to it."
    >
      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {/* The master switch. Off means English-only for everyone, so the
              per-type list below is dimmed rather than hidden — the office can
              still see and edit who gets Urdu when it comes back on. */}
          <button
            onClick={() => setUrduEnabled((v) => !v)}
            className={`flex items-center justify-between rounded-xl border px-4 py-3.5 text-left transition ${
              urduEnabled
                ? "border-emerald-400/40 bg-emerald-400/10"
                : "border-white/10 bg-white/5"
            }`}
          >
            <div className="flex items-center gap-3">
              <Power size={17} className={urduEnabled ? "text-emerald-300" : "text-mist/40"} />
              <div>
                <p className="text-sm font-semibold text-mist">Urdu (اردو)</p>
                <p className="mt-0.5 text-xs text-mist/45">
                  {urduEnabled
                    ? "Available in the app, to the user types ticked below."
                    : "Turned off — the app is English-only for everyone."}
                </p>
              </div>
            </div>
            <span
              className={`relative h-6 w-11 shrink-0 rounded-full transition ${
                urduEnabled ? "bg-emerald-400" : "bg-white/15"
              }`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
                  urduEnabled ? "left-[22px]" : "left-0.5"
                }`}
              />
            </span>
          </button>

          <p className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wide text-mist/35">
            Who can switch
          </p>

          <div className={urduEnabled ? "" : "pointer-events-none opacity-40"}>
          {USER_TYPES.map(({ value, label }) => {
            const active = allowed.includes(value);
            return (
              <button
                key={value}
                onClick={() => toggle(value)}
                className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left transition ${
                  active
                    ? "border-wave/40 bg-wave/10 text-mist"
                    : "border-white/10 bg-white/5 text-mist/60 hover:bg-white/10"
                }`}
              >
                <div>
                  <p className="text-sm font-medium">{label}</p>
                  <p className="text-xs text-mist/40 mt-0.5">
                    {active ? "Can switch language on mobile" : "Sees app in English only"}
                  </p>
                </div>
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full border transition ${
                    active ? "border-wave bg-wave text-white" : "border-white/20 bg-white/5"
                  }`}
                >
                  {active && <Check size={11} strokeWidth={3} />}
                </span>
              </button>
            );
          })}
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button onClick={save} loading={saving} disabled={!isDirty}>
              <Check size={15} /> Save
            </Button>
            {isDirty && (
              <button
                onClick={() => { setAllowed(saved); setUrduEnabled(savedUrdu); }}
                className="text-sm text-mist/50 hover:text-mist transition"
              >
                Discard changes
              </button>
            )}
          </div>
        </div>
      )}
    </SettingsSection>
  );
}
