import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { KeyboardAwareScrollView } from '../../components/KeyboardAwareScrollView';
import { adminService, PricedType, PlantSettings } from '../../services/adminService';
import { PaymentAccountsSection } from './PaymentAccountsSection';
import { LanguageSection } from './LanguageSection';

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
        <Text style={[styles.typeName, !item.is_active && styles.typeNameInactive]}>
          {item.name}
        </Text>
        <Text style={styles.typePrice}>{price}</Text>
      </View>
      <Switch
        value={item.is_active}
        onValueChange={onToggle}
        disabled={busy}
        trackColor={{ false: '#e0e0e0', true: '#34C75940' }}
        thumbColor={item.is_active ? '#34C759' : '#ccc'}
      />
      <TouchableOpacity onPress={onDelete} disabled={busy} style={styles.deleteBtn}>
        <Ionicons name="trash-outline" size={17} color={busy ? '#ddd' : '#FF3B30'} />
      </TouchableOpacity>
    </View>
  );
}

// ─── TypeList – generic CRUD block ───────────────────────────────────────────

function TypeList({
  title,
  icon,
  color,
  load,
  create,
  update,
  remove,
  namePlaceholder,
  showPrice = true,
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
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
  const [busyId, setBusyId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [adding, setAdding] = useState(false);

  const reload = useCallback(async () => {
    try { setItems(await load()); } catch { /* silent */ }
    finally { setLoading(false); }
  }, [load]);

  useEffect(() => { reload(); }, [reload]);

  const handleAdd = async () => {
    if (!name.trim()) return;
    setAdding(true);
    try {
      await create(name.trim(), price ? parseFloat(price) : null);
      setName('');
      setPrice('');
      reload();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to add.');
    } finally {
      setAdding(false);
    }
  };

  const handleToggle = async (item: PricedType) => {
    setBusyId(item.id);
    try { await update(item.id, { is_active: !item.is_active }); reload(); }
    catch { Alert.alert('Error', 'Failed to update.'); }
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
            catch { Alert.alert('Error', 'Failed to delete.'); }
            finally { setBusyId(null); }
          },
        },
      ],
    );
  };

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={[styles.sectionIcon, { backgroundColor: color + '18' }]}>
          <Ionicons name={icon} size={18} color={color} />
        </View>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>

      {/* Add row */}
      <View style={styles.addRow}>
        <TextInput
          style={[styles.addInput, { flex: 2 }]}
          placeholder={namePlaceholder}
          placeholderTextColor="#000"
          value={name}
          onChangeText={setName}
        />
        {showPrice && (
          <TextInput
            style={[styles.addInput, { flex: 1 }]}
            placeholder="Price (opt.)"
            placeholderTextColor="#000"
            value={price}
            onChangeText={setPrice}
            keyboardType="decimal-pad"
          />
        )}
        <TouchableOpacity
          style={[styles.addBtn, (!name.trim() || adding) && { opacity: 0.5 }]}
          onPress={handleAdd}
          disabled={!name.trim() || adding}
        >
          {adding
            ? <ActivityIndicator size="small" color="white" />
            : <Ionicons name="add" size={20} color="white" />
          }
        </TouchableOpacity>
      </View>

      {/* List */}
      {loading ? (
        <ActivityIndicator size="small" color="#007AFF" style={{ marginVertical: 12 }} />
      ) : items.length === 0 ? (
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
    </View>
  );
}

// ─── Pricing section ──────────────────────────────────────────────────────────

function PricingSection() {
  const [settings, setSettings] = useState<PlantSettings | null>(null);
  const [price, setPrice] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    adminService.getPlantSettings()
      .then(s => { setSettings(s); setPrice(String(s.standard_unit_price)); })
      .catch(() => null)
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    const val = parseFloat(price);
    if (isNaN(val) || val < 0) { Alert.alert('Invalid price'); return; }
    setSaving(true);
    try {
      const updated = await adminService.updatePlantSettings(val);
      setSettings(updated);
      Alert.alert('Saved', 'Standard price updated.');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  const dirty = settings !== null && parseFloat(price) !== settings.standard_unit_price;

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={[styles.sectionIcon, { backgroundColor: '#FF950018' }]}>
          <Ionicons name="pricetag" size={18} color="#FF9500" />
        </View>
        <Text style={styles.sectionTitle}>Standard Pricing</Text>
      </View>
      <Text style={styles.sectionDesc}>
        Default price per bottle. Customers with a custom price override this.
      </Text>

      {loading ? (
        <ActivityIndicator size="small" color="#007AFF" style={{ marginVertical: 12 }} />
      ) : (
        <View style={styles.priceRow}>
          <Text style={styles.priceLabel}>PKR</Text>
          <TextInput
            style={styles.priceInput}
            value={price}
            onChangeText={setPrice}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor="#000"
          />
          <TouchableOpacity
            style={[styles.saveBtn, (!dirty || saving) && { opacity: 0.4 }]}
            onPress={save}
            disabled={!dirty || saving}
          >
            {saving
              ? <ActivityIndicator size="small" color="white" />
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
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    adminService.getMobileProfileConfig()
      .then(setConfigs)
      .catch(() => Alert.alert('Error', 'Failed to load profile config.'))
      .finally(() => setLoading(false));
  }, []);

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
      Alert.alert('Error', e.message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const hasDirty = Object.keys(dirty).length > 0;

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={[styles.sectionIcon, { backgroundColor: '#34C75918' }]}>
          <Ionicons name="phone-portrait" size={18} color="#34C759" />
        </View>
        <Text style={styles.sectionTitle}>Mobile Profile Fields</Text>
      </View>
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
        <ActivityIndicator size="small" color="#007AFF" style={{ marginVertical: 16 }} />
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
                      <Switch
                        value={field.visible}
                        onValueChange={v => setField(key, 'visible', v)}
                        style={mps.toggle}
                        trackColor={{ false: '#e0e0e0', true: '#34C75940' }}
                        thumbColor={field.visible ? '#34C759' : '#ccc'}
                      />
                      {/* Editable toggle */}
                      <Switch
                        value={field.editable && field.visible}
                        onValueChange={v => setField(key, 'editable', v)}
                        disabled={!field.visible}
                        style={mps.toggle}
                        trackColor={{ false: '#e0e0e0', true: '#007AFF40' }}
                        thumbColor={field.editable && field.visible ? '#007AFF' : '#ccc'}
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
                ? <ActivityIndicator size="small" color="white" />
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
  tabRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  tab: {
    flex: 1, paddingVertical: 8, borderRadius: 10,
    backgroundColor: '#f5f5f5', alignItems: 'center',
  },
  tabActive: { backgroundColor: '#007AFF15' },
  tabText: { fontSize: 13, fontWeight: '600', color: '#888' },
  tabTextActive: { color: '#007AFF' },
  legend: {
    flexDirection: 'row', paddingHorizontal: 4,
    marginBottom: 6,
  },
  legendField: { flex: 1, fontSize: 11, color: '#bbb', textTransform: 'uppercase', letterSpacing: 0.5 },
  legendToggle: { width: 60, fontSize: 11, color: '#bbb', textAlign: 'center' },
  group: { marginBottom: 10 },
  groupLabel: {
    fontSize: 11, fontWeight: '700', color: '#aaa',
    textTransform: 'uppercase', letterSpacing: 0.7,
    marginBottom: 4, paddingHorizontal: 4,
  },
  fieldRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 8, paddingHorizontal: 4,
    borderRadius: 8,
  },
  fieldRowDirty: { backgroundColor: '#007AFF08' },
  fieldLabel: { flex: 1, fontSize: 14, color: '#333' },
  fieldLabelDim: { color: '#bbb' },
  unsaved: { color: '#007AFF', fontWeight: '800' },
  toggle: { width: 60, transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] },
  actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  saveBtn: {
    flex: 1, backgroundColor: '#007AFF',
    paddingVertical: 12, borderRadius: 10, alignItems: 'center',
  },
  saveBtnText: { color: 'white', fontWeight: '700', fontSize: 14 },
  discardBtn: { paddingHorizontal: 16, justifyContent: 'center' },
  discardText: { color: '#888', fontSize: 13 },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export const AdminSettingsScreen: React.FC = () => (
  <KeyboardAwareScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
    <PricingSection />

    <PaymentAccountsSection />

    <LanguageSection />

    <TypeList
      title="Bottle Types"
      icon="water"
      color="#32ADE6"
      load={() => adminService.getBottleTypes()}
      create={(n, p) => adminService.createBottleType(n, p)}
      update={(id, d) => adminService.updateBottleType(id, d)}
      remove={id => adminService.deleteBottleType(id)}
      namePlaceholder="e.g. Labelled, Nestlé"
    />

    <TypeList
      title="Customer Types"
      icon="people"
      color="#5856D6"
      load={() => adminService.getCustomerTypes()}
      create={(n, p) => adminService.createCustomerType(n, p)}
      update={(id, d) => adminService.updateCustomerType(id, d)}
      remove={id => adminService.deleteCustomerType(id)}
      namePlaceholder="e.g. Residential, Office"
    />

    <TypeList
      title="Delivery Areas"
      icon="location"
      color="#FF9500"
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
      color="#34C759"
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
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  section: {
    backgroundColor: 'white',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 14,
    padding: 16,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  sectionIcon: {
    width: 34, height: 34, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1a1a1a' },
  sectionDesc: { fontSize: 13, color: '#888', marginBottom: 12, lineHeight: 18 },
  // Pricing
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  priceLabel: { fontSize: 15, fontWeight: '600', color: '#555' },
  priceInput: {
    flex: 1, borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 18,
    fontWeight: '700', color: '#000',
  },
  saveBtn: {
    backgroundColor: '#007AFF', borderRadius: 10,
    paddingHorizontal: 18, paddingVertical: 12,
  },
  saveBtnText: { color: 'white', fontWeight: '700', fontSize: 14 },
  // Add row
  addRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  addInput: {
    borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 9, fontSize: 13, color: '#000',
  },
  addBtn: {
    width: 40, height: 40, borderRadius: 10,
    backgroundColor: '#007AFF', alignItems: 'center', justifyContent: 'center',
  },
  // TypeRow
  typeRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: '#f5f5f5',
  },
  typeInfo: { flex: 1 },
  typeName: { fontSize: 14, fontWeight: '600', color: '#1a1a1a' },
  typeNameInactive: { color: '#aaa' },
  typePrice: { fontSize: 12, color: '#888', marginTop: 1 },
  deleteBtn: {
    width: 34, height: 34, borderRadius: 8,
    backgroundColor: '#FF3B3010', alignItems: 'center', justifyContent: 'center',
  },
  emptyText: { fontSize: 13, color: '#aaa', marginTop: 4, marginBottom: 4 },
});
