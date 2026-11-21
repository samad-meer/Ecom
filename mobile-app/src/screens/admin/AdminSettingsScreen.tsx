import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, radius, space, fontSize, card, pagePadding } from '../../theme';
import { ErrorState, StatusPill, friendlyError } from '../../components/ui';
import { KeyboardAwareScrollView } from '../../components/KeyboardAwareScrollView';
import { adminService, PricedType, PlantSettings } from '../../services/adminService';
import { PaymentAccountsSection } from './PaymentAccountsSection';
import { LanguageSection } from './LanguageSection';
import { BusinessNameSection } from './BusinessNameSection';
import { RootStackParamList } from '../../types/navigation';

/** Soft tint behind each section's icon. */
const TONES = {
  primary: { fg: colors.primary, bg: colors.primaryTint },
  info: { fg: colors.info, bg: colors.infoBg },
  success: { fg: colors.success, bg: colors.successBg },
  warning: { fg: colors.warningText, bg: colors.warningBg },
  mint: { fg: colors.mintText, bg: colors.mint },
} as const;

type ToneKey = keyof typeof TONES;

/** One on/off look for every switch on this screen. */
function Toggle({
  value, onValueChange, disabled, style,
}: {
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  style?: React.ComponentProps<typeof Switch>['style'];
}) {
  return (
    <Switch
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      style={style}
      trackColor={{ false: colors.line, true: colors.primarySoft }}
      thumbColor={value ? colors.primary : colors.disabled}
    />
  );
}

function SectionHeader({ icon, tone, title }: { icon: keyof typeof Ionicons.glyphMap; tone: ToneKey; title: string }) {
  const t = TONES[tone];
  return (
    <View style={styles.sectionHeader}>
      <View style={[styles.sectionIcon, { backgroundColor: t.bg }]}>
        <Ionicons name={icon} size={20} color={t.fg} />
      </View>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

/** A failed refresh keeps the last good data visible, with the reason above it. */
function ErrorNote({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={styles.errorNote}>
      <Ionicons name="cloud-offline-outline" size={20} color={colors.danger} />
      <Text style={styles.errorNoteText}>{friendlyError(message)}</Text>
      <TouchableOpacity onPress={onRetry} accessibilityLabel="Try again">
        <Text style={styles.errorNoteRetry}>Retry</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Reusable TypeRow ─────────────────────────────────────────────────────────

function TypeRow({
  item,
  onToggle,
  onDelete,
  busy,
}: {
  item: PricedType;
  onToggle: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const price = item.default_price
    ? `PKR ${parseFloat(item.default_price).toLocaleString()}`
    : 'standard price';

  return (
    <View style={styles.typeRow}>
      <View style={styles.typeInfo}>
        <Text style={[styles.typeName, !item.is_active && styles.typeNameInactive]} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.typePrice}>{price}</Text>
        {!item.is_active && <StatusPill label="Off" tone="neutral" style={styles.offPill} />}
      </View>
      <Toggle value={item.is_active} onValueChange={onToggle} disabled={busy} />
      <TouchableOpacity
        onPress={onDelete}
        disabled={busy}
        style={styles.deleteBtn}
        accessibilityLabel={`Delete ${item.name}`}
      >
        <Ionicons name="trash-outline" size={20} color={busy ? colors.disabled : colors.danger} />
      </TouchableOpacity>
    </View>
  );
}

// ─── TypeList – generic CRUD block ───────────────────────────────────────────

function TypeList({
  title,
  icon,
  tone,
  load,
  create,
  update,
  remove,
  namePlaceholder,
  showPrice = true,
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone: ToneKey;
  load: () => Promise<PricedType[]>;
  create: (name: string, price: number | null) => Promise<PricedType>;
  update: (id: number, data: { is_active?: boolean }) => Promise<PricedType>;
  remove: (id: number) => Promise<void>;
  namePlaceholder: string;
  /** Areas have no price; every other list does. */
  showPrice?: boolean;
}) {
  const [items, setItems] = useState<PricedType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [adding, setAdding] = useState(false);

  const reload = useCallback(async () => {
    setError(null);
    try { setItems(await load()); }
    catch (e: any) { setError(e?.message || 'Could not load this list.'); }
    finally { setLoading(false); }
  }, [load]);

  useEffect(() => { reload(); }, [reload]);

  const retry = () => { setLoading(true); reload(); };

  const handleAdd = async () => {
    if (!name.trim()) return;
    setAdding(true);
    try {
      await create(name.trim(), price ? parseFloat(price) : null);
      setName('');
      setPrice('');
      reload();
    } catch (e: any) {
      Alert.alert('Error', `Could not add: ${friendlyError(e?.message)}`);
    } finally {
      setAdding(false);
    }
  };

  const handleToggle = async (item: PricedType) => {
    setBusyId(item.id);
    try { await update(item.id, { is_active: !item.is_active }); reload(); }
    catch (e: any) { Alert.alert('Error', `Failed to update: ${friendlyError(e?.message)}`); }
    finally { setBusyId(null); }
  };

  const handleDelete = (item: PricedType) => {
    Alert.alert(
      `Delete "${item.name}"?`,
      `It will no longer be offered when creating new records.

Turning it off does the same thing and can be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            setBusyId(item.id);
            try { await remove(item.id); reload(); }
            catch (e: any) { Alert.alert('Error', `Failed to delete: ${friendlyError(e?.message)}`); }
            finally { setBusyId(null); }
          },
        },
      ],
    );
  };

  return (
    <View style={styles.section}>
      <SectionHeader icon={icon} tone={tone} title={title} />

      {/* Add row */}
      <View style={styles.addRow}>
        <TextInput
          style={[styles.input, { flex: 2 }]}
          placeholder={namePlaceholder}
          placeholderTextColor={colors.muted}
          value={name}
          onChangeText={setName}
        />
        {showPrice && (
          <TextInput
            style={[styles.input, { flex: 1 }]}
            placeholder="Price (opt.)"
            placeholderTextColor={colors.muted}
            value={price}
            onChangeText={setPrice}
            keyboardType="decimal-pad"
          />
        )}
        <TouchableOpacity
          style={[styles.addBtn, (!name.trim() || adding) && { opacity: 0.5 }]}
          onPress={handleAdd}
          disabled={!name.trim() || adding}
          accessibilityLabel={`Add to ${title}`}
        >
          {adding
            ? <ActivityIndicator size="small" color={colors.white} />
            : <Ionicons name="add" size={22} color={colors.white} />
          }
        </TouchableOpacity>
      </View>

      {/* List */}
      {loading ? (
        <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 12 }} />
      ) : error && items.length === 0 ? (
        <ErrorState title={`Could not load ${title.toLowerCase()}`} message={error} onRetry={retry} style={styles.errorState} />
      ) : (
        <>
          {!!error && <ErrorNote message={error} onRetry={retry} />}
          {items.length === 0 ? (
            <Text style={styles.emptyText}>No {title.toLowerCase()} yet.</Text>
          ) : (
            items.map(item => (
              <TypeRow
                key={item.id}
                item={item}
                onToggle={() => handleToggle(item)}
                onDelete={() => handleDelete(item)}
                busy={busyId === item.id}
              />
            ))
          )}
        </>
      )}
    </View>
  );
}

// ─── Pricing section ──────────────────────────────────────────────────────────

function PricingSection() {
  const [settings, setSettings] = useState<PlantSettings | null>(null);
  const [price, setPrice] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoadError(null);
    return adminService.getPlantSettings()
      .then(s => { setSettings(s); setPrice(String(s.standard_unit_price)); })
      .catch((e: any) => setLoadError(e?.message || 'Could not load the standard price.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    const val = parseFloat(price);
    if (isNaN(val) || val < 0) { Alert.alert('Invalid price'); return; }
    setSaving(true);
    try {
      const updated = await adminService.updatePlantSettings(val);
      setSettings(updated);
      Alert.alert('Saved', 'Standard price updated.');
    } catch (e: any) {
      Alert.alert('Error', `Could not save the price: ${friendlyError(e?.message)}`);
    } finally {
      setSaving(false);
    }
  };

  const dirty = settings !== null && parseFloat(price) !== settings.standard_unit_price;

  return (
    <View style={styles.section}>
      <SectionHeader icon="pricetag" tone="warning" title="Standard Pricing" />
      <Text style={styles.sectionDesc}>
        Default price per bottle. Customers with a custom price override this.
      </Text>

      {loading ? (
        <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 12 }} />
      ) : loadError && !settings ? (
        <ErrorState
          title="Could not load the price"
          message={loadError}
          onRetry={() => { setLoading(true); load(); }}
          style={styles.errorState}
        />
      ) : (
        <View style={styles.priceRow}>
          <Text style={styles.priceLabel}>PKR</Text>
          <TextInput
            style={styles.priceInput}
            value={price}
            onChangeText={setPrice}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor={colors.muted}
          />
          <TouchableOpacity
            style={[styles.saveBtn, (!dirty || saving) && { opacity: 0.4 }]}
            onPress={save}
            disabled={!dirty || saving}
          >
            {saving
              ? <ActivityIndicator size="small" color={colors.white} />
              : <Text style={styles.saveBtnText}>Save</Text>
            }
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ─── Mobile profile field config section ─────────────────────────────────────

type FieldConfig = { visible: boolean; editable: boolean; label: string };
type ProfileConfigs = Record<string, Record<string, FieldConfig>>;
type UserTypeKey = 'delivery_boy' | 'staff';

const USER_TYPE_TABS: { key: UserTypeKey; label: string }[] = [
  { key: 'delivery_boy', label: 'Rider' },
  { key: 'staff',        label: 'Staff' },
];

const FIELD_GROUPS: { label: string; keys: string[] }[] = [
  { label: 'Personal',   keys: ['first_name', 'last_name', 'phone_number', 'address', 'emergency_contact'] },
  { label: 'Employment', keys: ['employee_id', 'designation', 'department', 'cnic_number', 'date_of_birth', 'date_of_joining', 'salary', 'remarks'] },
  { label: 'Rider',      keys: ['vehicle_type', 'vehicle_number'] },
];

function MobileProfileSection() {
  const [configs, setConfigs] = useState<ProfileConfigs | null>(null);
  const [dirty, setDirty] = useState<Record<string, { visible?: boolean; editable?: boolean }>>({});
  const [activeTab, setActiveTab] = useState<UserTypeKey>('delivery_boy');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoadError(null);
    return adminService.getMobileProfileConfig()
      .then(setConfigs)
      .catch((e: any) => setLoadError(e?.message || 'Could not load the profile fields.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const switchTab = (t: UserTypeKey) => { setDirty({}); setActiveTab(t); };

  const merged = (key: string): FieldConfig | null => {
    const base = configs?.[activeTab]?.[key];
    if (!base) return null;
    return { ...base, ...(dirty[key] ?? {}) } as FieldConfig;
  };

  const setField = (key: string, prop: 'visible' | 'editable', val: boolean) => {
    setDirty(prev => {
      const entry = { ...(prev[key] ?? {}), [prop]: val };
      if (prop === 'visible' && !val) entry.editable = false;
      return { ...prev, [key]: entry };
    });
  };

  const save = async () => {
    if (!Object.keys(dirty).length) return;
    setSaving(true);
    try {
      const result = await adminService.updateMobileProfileConfig(activeTab, dirty);
      setConfigs(prev => ({ ...prev, [activeTab]: result.fields }));
      setDirty({});
      Alert.alert('Saved', `${activeTab === 'delivery_boy' ? 'Rider' : 'Staff'} profile config updated.`);
    } catch (e: any) {
      Alert.alert('Error', `Save failed: ${friendlyError(e?.message)}`);
    } finally {
      setSaving(false);
    }
  };

  const hasDirty = Object.keys(dirty).length > 0;

  return (
    <View style={styles.section}>
      <SectionHeader icon="phone-portrait" tone="mint" title="Mobile Profile Fields" />
      <Text style={styles.sectionDesc}>
        Control which fields riders and staff can see and edit on their mobile profile.
      </Text>

      {/* Tabs */}
      <View style={mps.tabRow}>
        {USER_TYPE_TABS.map(t => (
          <TouchableOpacity
            key={t.key}
            style={[mps.tab, activeTab === t.key && mps.tabActive]}
            onPress={() => switchTab(t.key)}
          >
            <Text style={[mps.tabText, activeTab === t.key && mps.tabTextActive]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 16 }} />
      ) : loadError && !configs ? (
        <ErrorState
          title="Could not load the profile fields"
          message={loadError}
          onRetry={() => { setLoading(true); load(); }}
          style={styles.errorState}
        />
      ) : (
        <>
          {/* Legend */}
          <View style={mps.legend}>
            <Text style={mps.legendField}>Field</Text>
            <Text style={mps.legendToggle}><Ionicons name="eye-outline" size={12} /> Show</Text>
            <Text style={mps.legendToggle}><Ionicons name="create-outline" size={12} /> Edit</Text>
          </View>

          {FIELD_GROUPS.map(group => {
            if (group.label === 'Rider' && activeTab === 'staff') return null;
            const groupFields = group.keys.filter(k => merged(k) !== null);
            if (!groupFields.length) return null;
            return (
              <View key={group.label} style={mps.group}>
                <Text style={mps.groupLabel}>{group.label}</Text>
                {groupFields.map(key => {
                  const field = merged(key)!;
                  const isDirty = key in dirty;
                  return (
                    <View key={key} style={[mps.fieldRow, isDirty && mps.fieldRowDirty]}>
                      <Text style={[mps.fieldLabel, !field.visible && mps.fieldLabelDim]}>
                        {field.label}
                        {isDirty && <Text style={mps.unsaved}> •</Text>}
                      </Text>
                      {/* Visible toggle */}
                      <Toggle
                        value={field.visible}
                        onValueChange={v => setField(key, 'visible', v)}
                        style={mps.toggle}
                      />
                      {/* Editable toggle */}
                      <Toggle
                        value={field.editable && field.visible}
                        onValueChange={v => setField(key, 'editable', v)}
                        disabled={!field.visible}
                        style={mps.toggle}
                      />
                    </View>
                  );
                })}
              </View>
            );
          })}

          <View style={mps.actions}>
            <TouchableOpacity
              style={[mps.saveBtn, (!hasDirty || saving) && { opacity: 0.4 }]}
              onPress={save}
              disabled={!hasDirty || saving}
            >
              {saving
                ? <ActivityIndicator size="small" color={colors.white} />
                : <Text style={mps.saveBtnText}>
                    Save {activeTab === 'delivery_boy' ? 'Rider' : 'Staff'} Config
                  </Text>
              }
            </TouchableOpacity>
            {hasDirty && (
              <TouchableOpacity onPress={() => setDirty({})} style={mps.discardBtn}>
                <Text style={mps.discardText}>Discard</Text>
              </TouchableOpacity>
            )}
          </View>
        </>
      )}
    </View>
  );
}

const mps = StyleSheet.create({
  tabRow: { flexDirection: 'row', gap: 8, marginBottom: space.lg },
  tab: {
    flex: 1, minHeight: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line,
  },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.ink },
  tabTextActive: { color: colors.white },
  // Padded to line up with the switches, which sit inside the group card.
  legend: { flexDirection: 'row', paddingHorizontal: 17, marginBottom: 6 },
  legendField: { flex: 1, fontSize: fontSize.xs, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  legendToggle: { width: 60, fontSize: fontSize.xs, fontWeight: '700', color: colors.muted, textAlign: 'center' },
  group: {
    backgroundColor: colors.surfaceTint, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line,
    padding: space.md, marginBottom: space.md,
  },
  groupLabel: {
    fontSize: fontSize.xs, fontWeight: '800', color: colors.muted,
    textTransform: 'uppercase', letterSpacing: 0.7,
    marginBottom: 4, paddingHorizontal: 4,
  },
  fieldRow: {
    flexDirection: 'row', alignItems: 'center', minHeight: 44,
    paddingVertical: 4, paddingHorizontal: 4,
    borderRadius: radius.sm,
  },
  fieldRowDirty: { backgroundColor: colors.primaryTint },
  fieldLabel: { flex: 1, fontSize: fontSize.sm, fontWeight: '600', color: colors.ink },
  fieldLabelDim: { color: colors.muted, fontWeight: '400' },
  unsaved: { color: colors.primary, fontWeight: '800' },
  toggle: { width: 60, transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  saveBtn: {
    flex: 1, height: 50, backgroundColor: colors.primary,
    borderRadius: radius.md, alignItems: 'center', justifyContent: 'center',
  },
  saveBtnText: { color: colors.white, fontWeight: '800', fontSize: fontSize.sm },
  discardBtn: {
    height: 50, paddingHorizontal: 18, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.muted,
    alignItems: 'center', justifyContent: 'center',
  },
  discardText: { color: colors.ink, fontSize: fontSize.sm, fontWeight: '700' },
});

// ─── Message Templates Navigation Section ───────────────────────────────────

function MessageTemplatesSection() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  return (
    <View style={styles.section}>
      <SectionHeader icon="chatbubbles" tone="success" title="Message Templates" />
      <Text style={styles.templateDesc}>
        Build and customize WhatsApp and SMS message templates for order dispatch, customer notifications, and payment reminders.
      </Text>
      <TouchableOpacity
        style={styles.templateNavBtn}
        onPress={() => navigation.navigate('AdminMessageTemplates')}
        activeOpacity={0.85}
      >
        <View style={styles.templateNavLeft}>
          <Ionicons name="logo-whatsapp" size={20} color={colors.white} />
          <Text style={styles.templateNavText}>Manage Message Templates</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.white} />
      </TouchableOpacity>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export const AdminSettingsScreen: React.FC = () => (
  <KeyboardAwareScrollView style={styles.container} contentContainerStyle={styles.content} extraBottomSpace={24}>
    <BusinessNameSection />

    <PricingSection />

    <MessageTemplatesSection />

    <PaymentAccountsSection />

    <LanguageSection />

    <TypeList
      title="Bottle Types"
      icon="water"
      tone="info"
      load={() => adminService.getBottleTypes()}
      create={(n, p) => adminService.createBottleType(n, p)}
      update={(id, d) => adminService.updateBottleType(id, d)}
      remove={id => adminService.deleteBottleType(id)}
      namePlaceholder="e.g. Labelled, Nestlé"
    />

    <TypeList
      title="Customer Types"
      icon="people"
      tone="primary"
      load={() => adminService.getCustomerTypes()}
      create={(n, p) => adminService.createCustomerType(n, p)}
      update={(id, d) => adminService.updateCustomerType(id, d)}
      remove={id => adminService.deleteCustomerType(id)}
      namePlaceholder="e.g. Residential, Office"
    />

    <TypeList
      title="Delivery Areas"
      icon="location"
      tone="warning"
      load={() => adminService.getAreas()}
      create={n => adminService.createArea(n)}
      update={(id, d) => adminService.updateArea(id, d)}
      remove={id => adminService.deleteArea(id)}
      namePlaceholder="e.g. Johar Town, Wapda Town"
      showPrice={false}
    />

    <TypeList
      title="Delivery Statuses"
      icon="checkmark-done"
      tone="success"
      load={() => adminService.getDeliveryStatusOptions()}
      create={n => adminService.createDeliveryStatusOption(n)}
      update={(id, d) => adminService.updateDeliveryStatusOption(id, d)}
      remove={id => adminService.deleteDeliveryStatusOption(id)}
      namePlaceholder="e.g. Gate locked, Not responding"
      showPrice={false}
    />

    <MobileProfileSection />
  </KeyboardAwareScrollView>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingTop: space.xs, paddingBottom: space.xxl },
  section: {
    ...card,
    marginHorizontal: pagePadding,
    marginBottom: space.lg,
    padding: space.lg,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.md },
  sectionIcon: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  sectionTitle: { flex: 1, fontSize: fontSize.md, fontWeight: '800', color: colors.ink },
  sectionDesc: { fontSize: fontSize.sm, color: colors.muted, marginBottom: space.md, lineHeight: 20 },
  errorState: { paddingVertical: space.sm },
  errorNote: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.md, padding: space.md,
    backgroundColor: colors.dangerBg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.dangerLine,
  },
  errorNoteText: { flex: 1, fontSize: fontSize.sm, color: colors.danger, lineHeight: 19 },
  errorNoteRetry: { fontSize: fontSize.sm, fontWeight: '800', color: colors.danger, paddingHorizontal: space.sm, paddingVertical: space.sm },
  input: {
    height: 48, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md,
    paddingHorizontal: 12, fontSize: fontSize.sm, color: colors.ink, backgroundColor: colors.surfaceTint,
  },
  // Pricing
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  priceLabel: { fontSize: fontSize.md, fontWeight: '700', color: colors.textSecondary },
  priceInput: {
    flex: 1, height: 52, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md,
    paddingHorizontal: 14, fontSize: fontSize.lg,
    fontWeight: '800', color: colors.ink, backgroundColor: colors.surfaceTint,
  },
  saveBtn: {
    height: 52, backgroundColor: colors.primary, borderRadius: radius.md,
    paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center',
  },
  saveBtnText: { color: colors.white, fontWeight: '800', fontSize: fontSize.sm },
  // Add row
  addRow: { flexDirection: 'row', gap: space.sm, marginBottom: space.md },
  addBtn: {
    width: 48, height: 48, borderRadius: radius.md,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  // TypeRow
  typeRow: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm,
    minHeight: 60, paddingVertical: space.sm, paddingLeft: space.md, paddingRight: space.sm, marginBottom: space.sm,
    backgroundColor: colors.surfaceTint, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line,
  },
  typeInfo: { flex: 1, gap: 2 },
  typeName: { fontSize: fontSize.md, fontWeight: '700', color: colors.ink },
  typeNameInactive: { color: colors.muted },
  typePrice: { fontSize: fontSize.xs, color: colors.muted },
  offPill: { marginTop: 2 },
  deleteBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.dangerBg, alignItems: 'center', justifyContent: 'center',
  },
  emptyText: { fontSize: fontSize.sm, color: colors.muted, marginTop: 4, marginBottom: 4 },
  templateDesc: {
    fontSize: fontSize.xs,
    color: colors.muted,
    lineHeight: 18,
    marginTop: 4,
    marginBottom: 4,
  },
  templateNavBtn: {
    marginTop: 12,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.success,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  templateNavLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  templateNavText: {
    color: colors.white,
    fontWeight: '800',
    fontSize: fontSize.sm,
  },
});
