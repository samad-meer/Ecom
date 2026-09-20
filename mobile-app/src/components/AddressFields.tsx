import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { API_URL } from '../constants/config';
import { FieldLabel, FieldError } from './FormField';

/**
 * The four-part delivery address — house / portion / block / area.
 *
 * Extracted from the signup form so staff capture an address the same way a
 * customer does when they register. The backend composes these into the single
 * `address` / `shipping_address` line that search, PDFs and the rider app read,
 * so the parts are what gets typed and the composed line is what gets stored.
 */

export type AddressParts = {
  house_number: string;
  portion: string;
  block: string;
  area: string;
};

/**
 * Portion is a fixed list, not free text, so the field can be grouped and
 * reported on later. Keys mirror backend/core/address.py exactly — the API
 * stores the key and composes the label into the one-line address.
 */
export const PORTION_OPTIONS: { value: string; label: string }[] = [
  { value: 'ground', label: 'Ground' },
  { value: 'upper', label: 'Upper' },
  { value: 'lower', label: 'Lower' },
  { value: 'first_floor', label: '1st Floor' },
  { value: 'second_floor', label: '2nd Floor' },
  { value: 'basement', label: 'Basement' },
];

export const portionLabel = (value: string): string =>
  PORTION_OPTIONS.find(o => o.value === value)?.label ?? value;

export const EMPTY_ADDRESS: AddressParts = {
  house_number: '',
  portion: '',
  block: '',
  area: '',
};

/** Mirrors the backend's compose_address() so previews match what gets saved. */
export const composeAddress = (parts: AddressParts): string =>
  [parts.house_number, portionLabel(parts.portion), parts.block, parts.area]
    .map(value => (value || '').trim())
    .filter(Boolean)
    .join(', ');

/** House and area are mandatory, matching the signup form and the serializer. */
export const validateAddress = (
  parts: AddressParts,
): Partial<Record<keyof AddressParts, string>> => {
  const errors: Partial<Record<keyof AddressParts, string>> = {};
  if (!parts.house_number.trim()) errors.house_number = 'House number is required.';
  if (!parts.area.trim()) errors.area = 'Area is required.';
  return errors;
};

/**
 * Best-effort split of a stored one-line address back into parts, used when a
 * form pre-fills from a record saved before the split existed. Only a 4-part
 * comma-separated value maps cleanly; anything else goes into `area` so the
 * text survives rather than being silently dropped.
 */
export const splitAddress = (address?: string | null): AddressParts => {
  const chunks = (address || '').split(',').map(c => c.trim()).filter(Boolean);
  if (chunks.length === 4) {
    // The stored line holds the portion's LABEL, so map it back to the key the
    // picker and the API both work in. An unrecognised value is dropped rather
    // than guessed — a wrong floor sends a rider to the wrong door.
    const portion = PORTION_OPTIONS.find(
      o => o.label.toLowerCase() === chunks[1].toLowerCase(),
    );
    return {
      house_number: chunks[0],
      portion: portion?.value ?? '',
      block: chunks[2],
      area: chunks[3],
    };
  }
  return { ...EMPTY_ADDRESS, area: (address || '').trim() };
};

type Props = {
  value: AddressParts;
  onChange: (next: AddressParts) => void;
  errors?: Partial<Record<keyof AddressParts, string>>;
  /** Shown under the area picker; omit for no hint. */
  hint?: string;
};

export const AddressFields = ({ value, onChange, errors = {}, hint }: Props) => {
  const [areas, setAreas] = useState<{ id: number; name: string }[]>([]);
  const [customArea, setCustomArea] = useState(false);

  // Admin-defined localities. Failure is non-fatal: the field falls back to
  // free text so an address can always be captured.
  useEffect(() => {
    let cancelled = false;
    fetch(`${API_URL}/auth/areas/`)
      .then(res => (res.ok ? res.json() : []))
      .then(data => {
        if (cancelled) return;
        if (Array.isArray(data) && data.length) setAreas(data);
        else setCustomArea(true);
      })
      .catch(() => !cancelled && setCustomArea(true));
    return () => {
      cancelled = true;
    };
  }, []);

  // An area that came from a saved record but is not in the list must still be
  // editable, so drop straight to the free-text input for it.
  useEffect(() => {
    if (value.area && areas.length && !areas.some(a => a.name === value.area)) {
      setCustomArea(true);
    }
  }, [value.area, areas]);

  const set = (key: keyof AddressParts) => (text: string) =>
    onChange({ ...value, [key]: text });

  return (
    <View>
      {/* One Required badge for the address as a whole. Per-field badges used
          to sit beside each of House / Portion / Block, and in a third of the
          screen width the label and the badge overlapped. The individual
          fields carry plain captions instead. */}
      <FieldLabel text="Delivery address" required />

      {/* House and Block share a row — both are short and belong together.
          Portion moved to its own row below to make space for its options. */}
      <View style={styles.row}>
        <View style={styles.col}>
          <Text style={styles.caption}>House</Text>
          <TextInput
            style={[styles.input, errors.house_number && styles.inputInvalid]}
            placeholder="12"
            placeholderTextColor="#000"
            value={value.house_number}
            onChangeText={set('house_number')}
            maxLength={50}
          />
          {/* House numbers here are written several ways, and a single
              placeholder read as "type H-12". Showing the range stops people
              inventing a format the rider then has to interpret. */}
          <Text style={styles.example}>e.g. 12 · 12-B · 762/10 · 293A</Text>
        </View>
        <View style={styles.col}>
          <Text style={styles.caption}>Block</Text>
          <TextInput
            style={styles.input}
            placeholder="Block 6"
            placeholderTextColor="#000"
            value={value.block}
            onChangeText={set('block')}
            maxLength={100}
          />
        </View>
      </View>
      <FieldError message={errors.house_number} />

      {/* A fixed list rather than free text, so "which portion" stays a
          question the data can answer later. Tapping the active chip clears
          it, since the field is optional. */}
      <View style={styles.portionBlock}>
        <Text style={styles.caption}>Portion — optional</Text>
        <View style={styles.chips}>
          {PORTION_OPTIONS.map(option => {
            const active = value.portion === option.value;
            return (
              <TouchableOpacity
                key={option.value}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => onChange({ ...value, portion: active ? '' : option.value })}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={styles.areaBlock}>
        <Text style={styles.caption}>Town / Mohala</Text>
        {areas.length > 0 && (
          <View style={styles.areaChips}>
            {areas.map(a => {
              const active = value.area === a.name && !customArea;
              return (
                <TouchableOpacity
                  key={a.id}
                  style={[styles.areaChip, active && styles.areaChipActive]}
                  onPress={() => {
                    setCustomArea(false);
                    onChange({ ...value, area: a.name });
                  }}
                >
                  <Text style={[styles.areaChipText, active && styles.areaChipTextActive]}>
                    {a.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              style={[styles.areaChip, customArea && styles.areaChipActive]}
              onPress={() => {
                setCustomArea(true);
                onChange({ ...value, area: '' });
              }}
            >
              <Text style={[styles.areaChipText, customArea && styles.areaChipTextActive]}>
                Other…
              </Text>
            </TouchableOpacity>
          </View>
        )}
        {(customArea || areas.length === 0) && (
          <TextInput
            style={[styles.input, errors.area && styles.inputInvalid]}
            placeholder="Type the town or mohala"
            placeholderTextColor="#000"
            value={value.area}
            onChangeText={set('area')}
            maxLength={150}
          />
        )}
        <FieldError message={errors.area} />
        {!!hint && <Text style={styles.hint}>{hint}</Text>}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  col: { flex: 1 },
  example: {
    fontSize: 11, color: '#8a929b', marginTop: 5, lineHeight: 15,
  },
  caption: {
    fontSize: 12,
    fontWeight: '600',
    color: '#777',
    marginBottom: 6,
  },
  portionBlock: { marginTop: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#fafafa',
  },
  chipActive: { backgroundColor: '#0A84FF', borderColor: '#0A84FF' },
  chipText: { fontSize: 13, fontWeight: '600', color: '#666' },
  chipTextActive: { color: '#fff' },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: '#000',
    backgroundColor: '#f9f9f9',
  },
  inputInvalid: { borderColor: '#D93025', backgroundColor: '#FFF7F7' },
  areaBlock: { marginTop: 14 },
  areaChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  areaChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#fafafa',
  },
  areaChipActive: { backgroundColor: '#0A84FF', borderColor: '#0A84FF' },
  areaChipText: { fontSize: 13, fontWeight: '600', color: '#666' },
  areaChipTextActive: { color: '#fff' },
  hint: { fontSize: 12, color: '#888', marginTop: 5 },
});
