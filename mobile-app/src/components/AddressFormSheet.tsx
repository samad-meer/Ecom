import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  AddressFields,
  AddressParts,
  EMPTY_ADDRESS,
  validateAddress,
} from './AddressFields';
import { FieldLabel } from './FormField';
import { AddressPinMap } from './AddressPinMap';
import {
  ADDRESS_LABEL_OPTIONS,
  AddressLabel,
  AddressPayload,
  CustomerAddress,
  Pin,
  addressService,
  formatPin,
  pinOf,
  pinPayload,
} from '../services/addressService';
import { getCurrentPin, openAppSettings } from '../utils/deviceLocation';

/**
 * The one address form in the customer app — used by checkout to add an
 * address mid-order and by the address book to add or edit one.
 *
 * It owns the API call rather than handing a payload back, so both callers get
 * identical validation, identical error copy and identical "first address
 * becomes the default" behaviour without duplicating any of it.
 */

type Props = {
  visible: boolean;
  /** Existing entry to edit; omit or pass null to create a new one. */
  address?: CustomerAddress | null;
  /** Pin to pre-fill on a NEW address — checkout may already have a GPS fix. */
  initialPin?: Pin | null;
  onClose: () => void;
  onSaved: (saved: CustomerAddress) => void;
  /** Overrides the primary button copy, e.g. 'Use this address' at checkout. */
  submitLabel?: string;
};

export const AddressFormSheet: React.FC<Props> = ({
  visible,
  address,
  initialPin,
  onClose,
  onSaved,
  submitLabel,
}) => {
  const isEditing = !!address;

  const [label, setLabel] = useState<AddressLabel>('home');
  const [customLabel, setCustomLabel] = useState('');
  const [parts, setParts] = useState<AddressParts>(EMPTY_ADDRESS);
  const [pin, setPin] = useState<Pin | null>(null);
  const [makeDefault, setMakeDefault] = useState(false);

  const [errors, setErrors] = useState<Partial<Record<keyof AddressParts, string>>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<
    { message: string; canOpenSettings?: boolean } | null
  >(null);

  // Re-seed on the closed → open transition only. Keeping stale state between
  // openings would let a half-typed new address bleed into an edit of a real
  // one; re-seeding on every render of an OPEN sheet would wipe what the
  // customer is typing whenever the caller re-renders with a new `initialPin`.
  const wasVisible = useRef(false);
  useEffect(() => {
    if (!visible) {
      wasVisible.current = false;
      return;
    }
    if (wasVisible.current) return;
    wasVisible.current = true;

    setLabel(address?.label ?? 'home');
    setCustomLabel(address?.custom_label ?? '');
    setParts(
      address
        ? {
            house_number: address.house_number ?? '',
            portion: address.portion ?? '',
            block: address.block ?? '',
            area: address.area ?? '',
          }
        : EMPTY_ADDRESS,
    );
    setPin(address ? pinOf(address) : initialPin ?? null);
    setMakeDefault(address?.is_default ?? false);
    setErrors({});
    setSaveError(null);
    setLocationError(null);
  }, [visible, address, initialPin]);

  const handleUseCurrentLocation = async () => {
    setLocating(true);
    setLocationError(null);
    const result = await getCurrentPin();
    setLocating(false);
    if (result.ok) setPin(result.pin);
    else setLocationError({ message: result.message, canOpenSettings: result.canOpenSettings });
  };

  const handleSave = async () => {
    const nextErrors = validateAddress(parts);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setSaveError('Fix the highlighted fields before saving.');
      return;
    }

    // `address` is read-only server-side; only the parts are sent. The pin goes
    // as a pair or not at all — pinPayload() enforces that.
    const payload: AddressPayload = {
      label,
      custom_label: label === 'other' ? customLabel.trim() : '',
      house_number: parts.house_number.trim(),
      portion: parts.portion,
      block: parts.block.trim(),
      area: parts.area.trim(),
      ...pinPayload(pin),
    };
    // Never send is_default:false on an address that already holds it — the
    // model has no concept of "no default", and the only sane way to move it is
    // to promote a different one.
    if (makeDefault && !address?.is_default) payload.is_default = true;

    setSaving(true);
    setSaveError(null);
    try {
      const saved = address
        ? await addressService.update(address.id, payload)
        : await addressService.create(payload);
      onSaved(saved);
    } catch (error: any) {
      setSaveError(error?.message || 'Could not save this address. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>
            {isEditing ? 'Edit address' : 'Add new address'}
          </Text>
          <TouchableOpacity onPress={onClose} disabled={saving} accessibilityLabel="Close">
            <Ionicons name="close" size={26} color={saving ? '#ccc' : '#333'} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
        >
          {/* Label — what the customer calls this place. */}
          <View style={styles.block}>
            <FieldLabel text="Label" required />
            <View style={styles.chips}>
              {ADDRESS_LABEL_OPTIONS.map(option => {
                const active = label === option.value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setLabel(option.value)}
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
            {label === 'other' && (
              <TextInput
                style={[styles.input, styles.customLabelInput]}
                placeholder="Name this place — Farmhouse, Mum's, …"
                placeholderTextColor="#000"
                value={customLabel}
                onChangeText={setCustomLabel}
                maxLength={50}
              />
            )}
          </View>

          {/* The shared four-part address — same component signup uses. */}
          <View style={styles.block}>
            <AddressFields
              value={parts}
              onChange={setParts}
              errors={errors}
              hint="This is the line printed on the rider's delivery sheet."
            />
          </View>

          {/* Optional pin. House numbering is unreliable here, so a pin is
              worth more to a rider than the text — but an address with no pin
              is still a perfectly deliverable address. */}
          <View style={styles.block}>
            <FieldLabel text="Map location" />
            <AddressPinMap pin={pin} onChange={setPin} style={styles.map} />
            <Text style={styles.pinValue}>
              {pin ? `Pin: ${formatPin(pin)}` : 'No pin yet — tap the map or use your location.'}
            </Text>

            <View style={styles.pinActions}>
              <TouchableOpacity
                style={[styles.secondaryButton, locating && styles.buttonBusy]}
                onPress={handleUseCurrentLocation}
                disabled={locating}
              >
                {locating ? (
                  <ActivityIndicator size="small" color="#0A84FF" />
                ) : (
                  <Ionicons name="locate" size={17} color="#0A84FF" />
                )}
                <Text style={styles.secondaryButtonText}>
                  {locating ? 'Finding you…' : 'Use current location'}
                </Text>
              </TouchableOpacity>

              {!!pin && (
                <TouchableOpacity style={styles.clearPinButton} onPress={() => setPin(null)}>
                  <Ionicons name="trash-outline" size={16} color="#8a8a8a" />
                  <Text style={styles.clearPinText}>Clear pin</Text>
                </TouchableOpacity>
              )}
            </View>

            {!!locationError && (
              <View style={styles.warningBox}>
                <Text style={styles.warningText}>{locationError.message}</Text>
                {locationError.canOpenSettings && (
                  <TouchableOpacity onPress={openAppSettings}>
                    <Text style={styles.warningLink}>Open Settings</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>

          {/* Default toggle. Already-default addresses show it locked on: the
              way to move the default is to promote another address. */}
          <TouchableOpacity
            style={styles.defaultRow}
            onPress={() => !address?.is_default && setMakeDefault(v => !v)}
            disabled={address?.is_default}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: makeDefault, disabled: address?.is_default }}
          >
            <Ionicons
              name={makeDefault ? 'checkbox' : 'square-outline'}
              size={22}
              color={address?.is_default ? '#9bc7f5' : '#0A84FF'}
            />
            <View style={styles.flex}>
              <Text style={styles.defaultLabel}>Set as default address</Text>
              <Text style={styles.defaultHint}>
                {address?.is_default
                  ? 'This is already your default. Promote another address to move it.'
                  : 'Checkout pre-selects your default address.'}
              </Text>
            </View>
          </TouchableOpacity>

          {!!saveError && (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={18} color="#D93025" />
              <Text style={styles.errorText}>{saveError}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.primaryButton, saving && styles.primaryButtonDisabled]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryButtonText}>
                {submitLabel ?? (isEditing ? 'Save changes' : 'Save address')}
              </Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    backgroundColor: '#fff',
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1a1a1a' },
  body: { padding: 18, paddingBottom: 48, backgroundColor: '#fff' },
  block: { marginBottom: 22 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
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
  customLabelInput: { marginTop: 10 },
  map: { height: 220, borderRadius: 10, overflow: 'hidden' },
  pinValue: { fontSize: 13, color: '#555', marginTop: 10, fontVariant: ['tabular-nums'] },
  pinActions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#0A84FF',
    backgroundColor: '#F2F8FF',
  },
  buttonBusy: { opacity: 0.7 },
  secondaryButtonText: { fontSize: 13, fontWeight: '700', color: '#0A84FF' },
  clearPinButton: { flexDirection: 'row', alignItems: 'center', gap: 5, padding: 8 },
  clearPinText: { fontSize: 13, color: '#8a8a8a', fontWeight: '600' },
  warningBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#FFF8E5',
    borderWidth: 1,
    borderColor: '#FFE2A8',
    gap: 6,
  },
  warningText: { fontSize: 13, color: '#8a6100', lineHeight: 18 },
  warningLink: { fontSize: 13, fontWeight: '700', color: '#0A84FF' },
  defaultRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 22 },
  defaultLabel: { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
  defaultHint: { fontSize: 12, color: '#888', marginTop: 2, lineHeight: 17 },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#FFF7F7',
    borderWidth: 1,
    borderColor: '#F3C2C2',
    marginBottom: 16,
  },
  errorText: { flex: 1, fontSize: 13, color: '#D93025', lineHeight: 18 },
  primaryButton: {
    backgroundColor: '#0A84FF',
    padding: 16,
    borderRadius: 10,
    alignItems: 'center',
  },
  primaryButtonDisabled: { backgroundColor: '#a0c4ff' },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
