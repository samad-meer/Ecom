"use client";

import { useEffect, useId, useState } from "react";
import { cn } from "@/lib/cn";
import { areasApi } from "@/lib/api/areas";
import type { Area } from "@/lib/types";
import { FieldLabel, type Requirement } from "./FieldLabel";
import { Input } from "./Input";

/**
 * The four-part delivery address, collected exactly the way customer signup
 * collects it (see RegisterForm). Admin forms used to take one free-text line,
 * so a staff-created record could never be grouped by area or matched against a
 * customer's own address — the parts are the shape the backend stores.
 */

export interface AddressParts {
  house_number: string;
  portion: string;
  block: string;
  area: string;
}

export type AddressErrors = Partial<Record<keyof AddressParts, string>>;

/**
 * Portion is a fixed list rather than free text, so the field can be grouped and
 * reported on later — the same floor used to arrive as "Ground", "ground floor",
 * "GF" and "g". Keys mirror backend/core/address.py exactly: the API stores the
 * key and composes the label into the one-line address.
 */
export const PORTION_OPTIONS: { value: string; label: string }[] = [
  { value: "ground", label: "Ground" },
  { value: "upper", label: "Upper" },
  { value: "lower", label: "Lower" },
  { value: "first_floor", label: "1st Floor" },
  { value: "second_floor", label: "2nd Floor" },
  { value: "basement", label: "Basement" },
];

/** Display text for a stored portion key; unknown values pass through as-is. */
export function portionLabel(value: string): string {
  return PORTION_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

export const EMPTY_ADDRESS: AddressParts = {
  house_number: "",
  portion: "",
  block: "",
  area: "",
};

/**
 * Join the filled parts into the one-line address the backend displays. Portion
 * contributes its LABEL, matching the backend's compose_address(), so a preview
 * reads the same as the stored line.
 */
export function composeAddress(parts: AddressParts): string {
  return [
    parts.house_number,
    portionLabel(parts.portion),
    parts.block,
    parts.area,
  ]
    .map((p) => p.trim())
    .filter(Boolean)
    .join(", ");
}

/**
 * Map a stored one-line address back onto the fields.
 *
 * Only a clean four-part split is unambiguous. Anything else came from a client
 * that sent free text, and guessing which fragment is the house number would
 * quietly rewrite someone's address — so the whole string lands in `area`,
 * where it stays visible and editable instead of being dropped.
 */
export function splitAddress(address: string | null | undefined): AddressParts {
  const raw = (address ?? "").trim();
  const parts = raw.split(",").map((p) => p.trim());
  if (parts.length === 4 && parts.every(Boolean)) {
    const [house_number, portionText, block, area] = parts;
    // The stored line carries the portion's LABEL, while the picker and the API
    // both work in keys. An unrecognised value is dropped rather than guessed —
    // a wrong floor sends a rider to the wrong door.
    const portion = PORTION_OPTIONS.find(
      (o) => o.label.toLowerCase() === portionText.toLowerCase()
    );
    return { house_number, portion: portion?.value ?? "", block, area };
  }
  return { ...EMPTY_ADDRESS, area: raw };
}

/** True once the operator has typed anything at all into the address. */
export function hasAddressInput(parts: AddressParts): boolean {
  return composeAddress(parts).length > 0;
}

/**
 * House and area are the two parts a rider cannot deliver without, so both the
 * signup serializer and the admin order serializer reject an address missing
 * either. Returns an empty object when the address is usable.
 */
export function validateAddress(parts: AddressParts): AddressErrors {
  const errors: AddressErrors = {};
  if (!parts.house_number.trim()) errors.house_number = "House number is required.";
  if (!parts.area.trim()) errors.area = "Area is required.";
  return errors;
}

interface AddressFieldsProps {
  value: AddressParts;
  onChange: (next: AddressParts) => void;
  errors?: AddressErrors;
  /**
   * False when the address may be left entirely blank — the single pill then
   * reads Optional. House and area are still required *together* once any part
   * is filled; that pairing is the caller's to enforce with `validateAddress`.
   */
  required?: boolean;
}

export function AddressFields({
  value,
  onChange,
  errors,
  required = true,
}: AddressFieldsProps) {
  const areaId = useId();
  const [areas, setAreas] = useState<Area[]>([]);
  const [customArea, setCustomArea] = useState(false);

  // Admin-defined localities, the same list signup offers. A failure is
  // non-fatal: the field falls back to free text rather than blocking the form.
  useEffect(() => {
    areasApi.list().then(setAreas).catch(() => setCustomArea(true));
  }, []);

  // A pre-filled address (a customer record, an older order) may name a
  // locality that is no longer on the list. Drop to free text so the value
  // stays editable instead of sitting there with no chip selected. Only ever
  // switches *into* free text, so it cannot yank the input away mid-typing.
  useEffect(() => {
    if (!value.area || areas.length === 0) return;
    if (!areas.some((a) => a.name === value.area)) setCustomArea(true);
  }, [value.area, areas]);

  const set =
    (k: keyof AddressParts) => (e: React.ChangeEvent<HTMLInputElement>) =>
      onChange({ ...value, [k]: e.target.value });

  const addressRequirement: Requirement = required ? "required" : "optional";

  return (
    <div className="flex flex-col gap-3">
      {/* One pill for the address as a whole. Per-field pills sat beside each of
          House / Portion / Block, and in a narrow three-column row the label and
          its pill overlapped — the fields carry plain captions instead. */}
      <FieldLabel requirement={addressRequirement} className="mb-0">
        Delivery address
      </FieldLabel>

      {/* House and Block share a row — both are short and belong together.
          Portion sits on its own row below, where its options have space. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          label="House"
          value={value.house_number}
          onChange={set("house_number")}
          error={errors?.house_number}
          placeholder="H-12"
          maxLength={50}
        />
        <Input
          label="Block"
          value={value.block}
          onChange={set("block")}
          placeholder="Block 6"
          maxLength={100}
        />
      </div>

      {/* A fixed list, so "which portion" stays a question the data can answer
          later. Clicking the active chip clears it, since the field is
          optional. */}
      <div>
        <FieldLabel>Portion — optional</FieldLabel>
        <div className="flex flex-wrap gap-2">
          {PORTION_OPTIONS.map((option) => {
            const active = value.portion === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={active}
                onClick={() =>
                  onChange({ ...value, portion: active ? "" : option.value })
                }
                className={cn(
                  "rounded-full border px-3.5 py-1.5 text-sm transition",
                  active
                    ? "border-wave bg-wave/20 text-wave"
                    : "border-white/10 text-mist/60 hover:text-mist"
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <FieldLabel htmlFor={areaId}>Town / Mohala</FieldLabel>
        {areas.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {areas.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => {
                  onChange({ ...value, area: a.name });
                  setCustomArea(false);
                }}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 text-sm transition",
                  value.area === a.name && !customArea
                    ? "border-wave bg-wave/20 text-wave"
                    : "border-white/10 text-mist/60 hover:text-mist"
                )}
              >
                {a.name}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setCustomArea(true);
                onChange({ ...value, area: "" });
              }}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-sm transition",
                customArea
                  ? "border-wave bg-wave/20 text-wave"
                  : "border-white/10 text-mist/60 hover:text-mist"
              )}
            >
              Other…
            </button>
          </div>
        )}
        {(customArea || areas.length === 0) && (
          <input
            id={areaId}
            className="input w-full"
            value={value.area}
            onChange={set("area")}
            placeholder="Type the town or mohala"
            maxLength={150}
          />
        )}
        {errors?.area && <p className="mt-1 text-sm text-rose-300">{errors.area}</p>}
      </div>
    </div>
  );
}
