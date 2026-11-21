import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, Switch, Image,
  Modal, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, space, fontSize, card, pagePadding } from '../../theme';
import { ErrorState, EmptyState, StatusPill, friendlyError } from '../../components/ui';
import { adminService, AdminProduct, AdminCategory } from '../../services/adminService';
import { API_URL } from '../../constants/config';
import { MultiImagePicker } from '../../components/MultiImagePicker';
import { PickedImage, appendImages } from '../../constants/imageLimits';
import { KeyboardAwareScrollView, SheetScrollView } from '../../components/KeyboardAwareScrollView';

const money = (value: string | number | null | undefined) => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n.toLocaleString('en-PK', { maximumFractionDigits: 2 }) : String(value ?? '');
};

/** One on/off look for every switch on this screen. */
function Toggle({ value, onValueChange, disabled }: { value: boolean; onValueChange: () => void; disabled?: boolean }) {
  return (
    <Switch
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      trackColor={{ false: colors.line, true: colors.primarySoft }}
      thumbColor={value ? colors.primary : colors.disabled}
    />
  );
}

// ─── Product form modal ───────────────────────────────────────────────────────

interface FormModalProps {
  visible: boolean;
  product: AdminProduct | null;
  /** The FULL list; the modal narrows it to what may be picked. */
  categories: AdminCategory[];
  onClose: () => void;
  onSaved: () => void;
}

function ProductFormModal({ visible, product, categories, onClose, onSaved }: FormModalProps) {
  const isEdit = !!product;
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [isActive, setIsActive] = useState(true);
  const [images, setImages] = useState<PickedImage[]>([]);
  const [existingImages, setExistingImages] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  /**
   * Only active categories may be picked, so a retired one is never filed onto
   * a product. The one exception is the category the edited product is already
   * in: if it has since been hidden it stays in the list, because dropping it
   * would leave nothing selected and quietly wipe the product's category the
   * next time someone opened and saved it.
   */
  const pickable = useMemo(() => {
    const active = categories.filter((c) => c.is_active);
    const current = categories.find((c) => c.id === product?.category);
    return current && !current.is_active ? [...active, current] : active;
  }, [categories, product]);

  const inHiddenCategory = !!categoryId && !pickable.find((c) => c.id === categoryId)?.is_active;

  useEffect(() => {
    if (product) {
      setName(product.name);
      setDescription(product.description || '');
      setPrice(product.price);
      setCategoryId(product.category);
      setIsActive(product.is_active);
      const urls = product.images?.length
        ? product.images.map((i) => i.image)
        : product.image
          ? [product.image]
          : [];
      setExistingImages(urls);
    } else {
      setName(''); setDescription(''); setPrice('');
      setCategoryId(null); setIsActive(true);
      setExistingImages([]);
    }
    setImages([]);
  }, [product, visible]);

  const submit = async () => {
    if (!name.trim()) { Alert.alert('Name required'); return; }
    const p = parseFloat(price);
    if (!price || isNaN(p) || p < 0) { Alert.alert('Enter a valid price'); return; }

    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('name', name.trim());
      fd.append('description', description.trim());
      fd.append('price', price);
      fd.append('is_active', String(isActive));
      if (categoryId !== null) fd.append('category', String(categoryId));
      // Only send images when new ones were picked; otherwise keep existing.
      if (images.length) appendImages(fd, images);

      if (isEdit && product) {
        await adminService.updateProduct(product.id, fd);
      } else {
        await adminService.createProduct(fd);
      }
      onSaved();
      onClose();
    } catch (e: any) {
      Alert.alert('Error', `Could not save the product: ${friendlyError(e?.message)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={fm.container}>
        {/* Header */}
        <View style={fm.header}>
          <Text style={fm.title}>{isEdit ? 'Edit Product' : 'New Product'}</Text>
          <TouchableOpacity onPress={onClose} style={fm.closeBtn} accessibilityLabel="Close">
            <Ionicons name="close" size={22} color={colors.ink} />
          </TouchableOpacity>
        </View>

        <SheetScrollView contentContainerStyle={fm.body} extraBottomSpace={28}>
          <View style={fm.card}>
            <Text style={fm.cardTitle}>Details</Text>
            <Text style={fm.label}>Product Name *</Text>
            <TextInput style={fm.input} value={name} onChangeText={setName} placeholder="e.g. 20L Water Bottle" placeholderTextColor={colors.muted} />

            <Text style={fm.label}>Description</Text>
            <TextInput
              style={[fm.input, fm.inputMulti]}
              value={description} onChangeText={setDescription}
              placeholder="Short description…" placeholderTextColor={colors.muted} multiline
            />

            <Text style={fm.label}>Price (PKR) *</Text>
            <TextInput style={fm.input} value={price} onChangeText={setPrice} placeholder="0.00" placeholderTextColor={colors.muted} keyboardType="decimal-pad" />
          </View>

          <View style={fm.card}>
            <Text style={fm.cardTitle}>Category</Text>
            <View style={fm.categoryRow}>
              <TouchableOpacity
                style={[fm.catChip, categoryId === null && fm.catChipActive]}
                onPress={() => setCategoryId(null)}
              >
                <Text style={[fm.catText, categoryId === null && fm.catTextActive]}>None</Text>
              </TouchableOpacity>
              {pickable.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={[fm.catChip, !c.is_active && fm.catChipHidden, categoryId === c.id && fm.catChipActive]}
                  onPress={() => setCategoryId(c.id)}
                >
                  <Text style={[fm.catText, categoryId === c.id && fm.catTextActive]}>
                    {c.name}{!c.is_active && ' · Hidden'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {inHiddenCategory && (
              <Text style={[fm.hint, { marginTop: space.sm }]}>
                This category is hidden. It stays on this product until you pick another one.
              </Text>
            )}
          </View>

          <View style={fm.card}>
            <MultiImagePicker
              label="Product images"
              value={images}
              onChange={setImages}
              existing={existingImages}
            />
          </View>

          <View style={[fm.card, fm.activeRow]}>
            <View style={{ flex: 1 }}>
              <Text style={fm.cardTitleInline}>Active</Text>
              <Text style={fm.hint}>Visible to customers in the shop</Text>
            </View>
            <Toggle value={isActive} onValueChange={() => setIsActive((v) => !v)} />
          </View>

          <TouchableOpacity
            style={[fm.submitBtn, saving && { opacity: 0.5 }]}
            onPress={submit}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator size="small" color={colors.white} />
              : <Text style={fm.submitText}>{isEdit ? 'Save Changes' : 'Create Product'}</Text>
            }
          </TouchableOpacity>
        </SheetScrollView>
      </View>
    </Modal>
  );
}

const fm = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: pagePadding, paddingTop: space.xl, paddingBottom: space.md,
  },
  title: { fontSize: fontSize.lg, fontWeight: '800', color: colors.ink },
  closeBtn: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line,
  },
  body: { paddingHorizontal: pagePadding, paddingTop: space.xs, paddingBottom: 40 },
  card: { ...card, padding: space.lg, marginBottom: space.md },
  cardTitle: { fontSize: fontSize.md, fontWeight: '800', color: colors.ink },
  cardTitleInline: { fontSize: fontSize.md, fontWeight: '800', color: colors.ink, marginBottom: 2 },
  label: { fontSize: fontSize.sm, fontWeight: '700', color: colors.textSecondary, marginBottom: 6, marginTop: space.md },
  hint: { fontSize: fontSize.xs, color: colors.muted },
  input: {
    height: 48, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md,
    paddingHorizontal: 14, fontSize: fontSize.sm, color: colors.ink, backgroundColor: colors.surfaceTint,
  },
  inputMulti: { height: 88, paddingTop: 12, textAlignVertical: 'top' },
  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: space.md },
  catChip: {
    minHeight: 40, paddingVertical: 6, paddingHorizontal: 16, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line,
    backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center',
  },
  catChipActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  catChipHidden: { borderStyle: 'dashed', backgroundColor: colors.surfaceTint },
  catText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.ink },
  catTextActive: { color: colors.white },
  activeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  submitBtn: {
    height: 52, backgroundColor: colors.primary, borderRadius: radius.md,
    alignItems: 'center', justifyContent: 'center', marginTop: space.sm,
  },
  submitText: { color: colors.white, fontWeight: '800', fontSize: fontSize.md },
});

// ─── Product row ──────────────────────────────────────────────────────────────

interface ProductRowProps {
  product: AdminProduct;
  onEdit: (p: AdminProduct) => void;
  onDeleted: () => void;
  onToggled: () => void;
}

function ProductRow({ product, onEdit, onDeleted, onToggled }: ProductRowProps) {
  const [toggling, setToggling] = useState(false);

  const handleToggle = async () => {
    setToggling(true);
    try {
      const fd = new FormData();
      fd.append('is_active', String(!product.is_active));
      await adminService.updateProduct(product.id, fd);
      onToggled();
    } catch (e: any) {
      Alert.alert('Error', `Failed to update: ${friendlyError(e?.message)}`);
    } finally {
      setToggling(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      `Delete "${product.name}"?`,
      `Every past order that included this product loses that line — the order total stays but the item disappears from its history.

Turning the product off instead stops you selling it and keeps the records intact.`,
      [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete anyway', style: 'destructive', onPress: async () => {
          try { await adminService.deleteProduct(product.id); onDeleted(); }
          catch (e: any) { Alert.alert('Error', `Failed to delete: ${friendlyError(e?.message)}`); }
        },
      },
    ]);
  };

  const imageUri = product.image
    ? (product.image.startsWith('http') ? product.image : `${API_URL}${product.image}`)
    : null;

  return (
    <View style={pr.card}>
      <View style={pr.top}>
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={pr.image} resizeMode="cover" />
        ) : (
          <View style={[pr.image, pr.imagePlaceholder]}>
            <Ionicons name="image-outline" size={26} color={colors.primary} />
          </View>
        )}
        <View style={pr.info}>
          <Text style={[pr.name, !product.is_active && pr.nameOff]} numberOfLines={2}>{product.name}</Text>
          <Text style={pr.price}>PKR {money(product.price)}</Text>
          <View style={pr.metaRow}>
            <StatusPill
              label={product.is_active ? 'Active' : 'Hidden'}
              tone={product.is_active ? 'success' : 'neutral'}
            />
            {!!product.category_name && <Text style={pr.category} numberOfLines={1}>{product.category_name}</Text>}
          </View>
        </View>
      </View>

      <View style={pr.footer}>
        <Toggle value={product.is_active} onValueChange={handleToggle} disabled={toggling} />
        <Text style={pr.footerLabel}>Show in shop</Text>
        <TouchableOpacity onPress={() => onEdit(product)} style={[pr.iconBtn, pr.editBtn]} accessibilityLabel={`Edit ${product.name}`}>
          <Ionicons name="create-outline" size={20} color={colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={handleDelete} style={[pr.iconBtn, pr.deleteBtn]} accessibilityLabel={`Delete ${product.name}`}>
          <Ionicons name="trash-outline" size={20} color={colors.danger} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const pr = StyleSheet.create({
  card: { ...card, padding: space.md, marginBottom: space.md },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  image: { width: 72, height: 72, borderRadius: radius.md },
  imagePlaceholder: { backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, gap: 3 },
  name: { fontSize: fontSize.md, fontWeight: '700', color: colors.ink },
  nameOff: { color: colors.muted },
  price: { fontSize: fontSize.md, fontWeight: '800', color: colors.ink },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.sm, marginTop: 2 },
  category: { flexShrink: 1, fontSize: fontSize.sm, color: colors.muted },
  footer: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.md,
    paddingLeft: space.sm, paddingRight: space.sm, paddingVertical: space.xs,
    backgroundColor: colors.surfaceTint, borderRadius: radius.md,
  },
  footerLabel: { flex: 1, fontSize: fontSize.sm, color: colors.textSecondary },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  editBtn: { backgroundColor: colors.primaryTint },
  deleteBtn: { backgroundColor: colors.dangerBg },
});

// ─── Category management ────────────────────────────────────────────────────────

function CategoryRow({ category, onChanged }: { category: AdminCategory; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(category.name);
  const [icon, setIcon] = useState(category.icon || '');
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);

  const startEdit = () => {
    setName(category.name);
    setIcon(category.icon || '');
    setEditing(true);
  };

  const save = async () => {
    if (!name.trim()) { Alert.alert('Name required'); return; }
    setSaving(true);
    try {
      await adminService.updateCategory(category.id, { name: name.trim(), icon: icon.trim() });
      setEditing(false);
      onChanged();
    } catch (e: any) {
      Alert.alert('Error', `Could not update the category: ${friendlyError(e?.message)}`);
    } finally {
      setSaving(false);
    }
  };

  /** Hiding is the reversible alternative to deleting: products keep the
   *  category, it simply stops being offered anywhere. */
  const toggleActive = async () => {
    setToggling(true);
    try {
      await adminService.updateCategory(category.id, { is_active: !category.is_active });
      onChanged();
    } catch (e: any) {
      Alert.alert('Error', `Could not update the category: ${friendlyError(e?.message)}`);
    } finally {
      setToggling(false);
    }
  };

  const remove = () => {
    Alert.alert(
      `Delete "${category.name}"?`,
      'Products in this category will remain but become uncategorised. Hide it instead to keep the link.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive', onPress: async () => {
            try { await adminService.deleteCategory(category.id); onChanged(); }
            catch (e: any) { Alert.alert('Error', `Failed to delete: ${friendlyError(e?.message)}`); }
          },
        },
      ],
    );
  };

  if (editing) {
    return (
      <View style={[cm.row, cm.rowEditing]}>
        <TextInput style={[cm.input, { flex: 1 }]} value={name} onChangeText={setName} placeholder="Name" placeholderTextColor={colors.muted} autoFocus />
        <TextInput style={[cm.input, { width: 84 }]} value={icon} onChangeText={setIcon} placeholder="icon" placeholderTextColor={colors.muted} />
        <TouchableOpacity onPress={save} disabled={saving} style={[cm.iconBtn, cm.saveBtn]} accessibilityLabel="Save category">
          {saving ? <ActivityIndicator size="small" color={colors.success} /> : <Ionicons name="checkmark" size={22} color={colors.success} />}
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setEditing(false)} disabled={saving} style={[cm.iconBtn, cm.cancelBtn]} accessibilityLabel="Cancel editing">
          <Ionicons name="close" size={22} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[cm.row, !category.is_active && cm.rowHidden]}>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={[cm.name, !category.is_active && cm.nameHidden]} numberOfLines={1}>{category.name}</Text>
        {!category.is_active && <StatusPill label="Hidden" tone="warning" />}
        {!!category.icon && <Text style={cm.sub}>icon: {category.icon}</Text>}
      </View>
      <Toggle value={category.is_active} onValueChange={toggleActive} disabled={toggling} />
      <TouchableOpacity onPress={startEdit} style={[cm.iconBtn, cm.editBtn]} accessibilityLabel={`Edit ${category.name}`}>
        <Ionicons name="create-outline" size={20} color={colors.primary} />
      </TouchableOpacity>
      <TouchableOpacity onPress={remove} style={[cm.iconBtn, cm.deleteBtn]} accessibilityLabel={`Delete ${category.name}`}>
        <Ionicons name="trash-outline" size={20} color={colors.danger} />
      </TouchableOpacity>
    </View>
  );
}

interface CategoryModalProps {
  visible: boolean;
  categories: AdminCategory[];
  onClose: () => void;
  onChanged: () => void;
}

function CategoryManagerModal({ visible, categories, onClose, onChanged }: CategoryModalProps) {
  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState('');
  const [adding, setAdding] = useState(false);

  const add = async () => {
    if (!newName.trim()) { Alert.alert('Name required'); return; }
    setAdding(true);
    try {
      await adminService.createCategory({ name: newName.trim(), icon: newIcon.trim() || undefined });
      setNewName('');
      setNewIcon('');
      onChanged();
    } catch (e: any) {
      Alert.alert('Error', `Could not create the category: ${friendlyError(e?.message)}`);
    } finally {
      setAdding(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={fm.container}>
        <View style={fm.header}>
          <Text style={fm.title}>Manage Categories</Text>
          <TouchableOpacity onPress={onClose} style={fm.closeBtn} accessibilityLabel="Close">
            <Ionicons name="close" size={22} color={colors.ink} />
          </TouchableOpacity>
        </View>

        <SheetScrollView contentContainerStyle={cm.container} keyboardShouldPersistTaps="handled">
          {/* Add new category */}
          <View style={cm.addCard}>
            <Text style={cm.addTitle}>Add category</Text>
            <View style={cm.addRow}>
              <TextInput style={[cm.input, { flex: 1 }]} value={newName} onChangeText={setNewName} placeholder="e.g. Water Bottles" placeholderTextColor={colors.muted} />
              <TextInput style={[cm.input, { width: 84 }]} value={newIcon} onChangeText={setNewIcon} placeholder="icon" placeholderTextColor={colors.muted} />
              <TouchableOpacity style={[cm.addBtn, adding && { opacity: 0.5 }]} onPress={add} disabled={adding} accessibilityLabel="Add category">
                {adding ? <ActivityIndicator size="small" color={colors.white} /> : <Ionicons name="add" size={22} color={colors.white} />}
              </TouchableOpacity>
            </View>
            <Text style={cm.hint}>Icon (optional) is an Expo Vector Icons name.</Text>
          </View>

          {/* Existing categories */}
          {categories.length === 0 ? (
            <EmptyState
              icon="pricetags-outline"
              title="No categories yet"
              text="Add your first one above."
            />
          ) : (
            categories.map((c) => <CategoryRow key={c.id} category={c} onChanged={onChanged} />)
          )}

          <Text style={cm.footNote}>
            Switch a category off to hide it from the shop and from the product form —
            its products keep it. Deleting is permanent: those products become uncategorised.
          </Text>
        </SheetScrollView>
      </View>
    </Modal>
  );
}

const cm = StyleSheet.create({
  container: { paddingHorizontal: pagePadding, paddingTop: space.xs, paddingBottom: 40 },
  addCard: { ...card, padding: space.lg, marginBottom: space.lg },
  addTitle: { fontSize: fontSize.md, fontWeight: '800', color: colors.ink, marginBottom: space.md },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    height: 46, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md,
    paddingHorizontal: 12, fontSize: fontSize.sm, color: colors.ink, backgroundColor: colors.surfaceTint,
  },
  addBtn: { backgroundColor: colors.primary, width: 46, height: 46, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  hint: { fontSize: fontSize.xs, color: colors.muted, marginTop: space.sm },
  row: { ...card, flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md, marginBottom: space.md },
  rowHidden: { backgroundColor: colors.surfaceTint },
  rowEditing: { borderColor: colors.primarySoft },
  name: { fontSize: fontSize.md, fontWeight: '700', color: colors.ink },
  nameHidden: { color: colors.muted },
  sub: { fontSize: fontSize.xs, color: colors.muted },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  editBtn: { backgroundColor: colors.primaryTint },
  deleteBtn: { backgroundColor: colors.dangerBg },
  saveBtn: { backgroundColor: colors.successBg },
  cancelBtn: { backgroundColor: colors.lineSoft },
  footNote: { fontSize: fontSize.xs, color: colors.muted, marginTop: space.xs, textAlign: 'center', lineHeight: 17 },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export const AdminShopScreen: React.FC = () => {
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');
  const [modalVisible, setModalVisible] = useState(false);
  const [editProduct, setEditProduct] = useState<AdminProduct | null>(null);
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      // The full list (staff default) — the manager section needs the hidden
      // ones to switch them back on, and the product form filters in memory
      // rather than costing a second request.
      const [prods, cats] = await Promise.all([
        adminService.getProducts(),
        adminService.getCategories(),
      ]);
      setProducts(prods);
      setCategories(cats);
    } catch (e: any) {
      setError(e?.message || 'Could not load products.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const retry = () => { setLoading(true); load(); };

  const filtered = products.filter((p) => {
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase());
    const matchActive =
      filterActive === 'all' ||
      (filterActive === 'active' && p.is_active) ||
      (filterActive === 'inactive' && !p.is_active);
    return matchSearch && matchActive;
  });

  const total = products.length;
  const activeCount = products.filter(p => p.is_active).length;
  // A failed refresh keeps the last good list on screen with the reason above it.
  const failedWithNothing = !!error && products.length === 0;

  const openCreate = () => { setEditProduct(null); setModalVisible(true); };
  const openEdit = (p: AdminProduct) => { setEditProduct(p); setModalVisible(true); };

  return (
    <View style={styles.container}>
      {/* Stats */}
      {!failedWithNothing && (
        <View style={styles.statsRow}>
          <View style={styles.statTile}>
            <Text style={styles.statVal}>{total}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>
          <View style={styles.statTile}>
            <Text style={[styles.statVal, { color: colors.success }]}>{activeCount}</Text>
            <Text style={styles.statLabel}>Active</Text>
          </View>
          <View style={styles.statTile}>
            <Text style={[styles.statVal, { color: colors.warningText }]}>{total - activeCount}</Text>
            <Text style={styles.statLabel}>Inactive</Text>
          </View>
        </View>
      )}

      {/* Search and actions */}
      <View style={styles.searchRow}>
        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={18} color={colors.muted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search products…"
            placeholderTextColor={colors.muted}
            value={search}
            onChangeText={setSearch}
          />
        </View>
        <TouchableOpacity style={styles.catBtn} onPress={() => setCategoryModalVisible(true)} accessibilityLabel="Manage categories">
          <Ionicons name="pricetags-outline" size={22} color={colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.addBtn} onPress={openCreate} accessibilityLabel="Add product">
          <Ionicons name="add" size={24} color={colors.white} />
        </TouchableOpacity>
      </View>

      {/* Filters */}
      <View style={styles.segmentRow}>
        {(['all', 'active', 'inactive'] as const).map((v) => (
          <TouchableOpacity
            key={v}
            style={[styles.segment, filterActive === v && styles.segmentActive]}
            onPress={() => setFilterActive(v)}
          >
            <Text style={[styles.segmentText, filterActive === v && styles.segmentTextActive]}>
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* List */}
      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 48 }} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} colors={[colors.primary]} tintColor={colors.primary} />}
        >
          {failedWithNothing ? (
            <ErrorState title="Could not load products" message={error} onRetry={retry} />
          ) : (
            <>
              {!!error && (
                <View style={styles.errorBanner}>
                  <Ionicons name="cloud-offline-outline" size={20} color={colors.danger} />
                  <Text style={styles.errorBannerText}>{friendlyError(error)}</Text>
                  <TouchableOpacity onPress={retry} accessibilityLabel="Try again">
                    <Text style={styles.errorBannerRetry}>Retry</Text>
                  </TouchableOpacity>
                </View>
              )}
              {filtered.length === 0 ? (
                <View>
                  <EmptyState
                    icon="bag-outline"
                    title={products.length === 0 ? 'No products yet' : 'No products found'}
                    text={products.length === 0
                      ? 'Add your first product and customers will see it in the shop.'
                      : 'Try a different search or filter.'}
                  />
                  <TouchableOpacity style={styles.emptyBtn} onPress={openCreate}>
                    <Ionicons name="add" size={20} color={colors.white} />
                    <Text style={styles.emptyBtnText}>{products.length === 0 ? 'Add your first product' : 'Add a product'}</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                filtered.map((p) => (
                  <ProductRow
                    key={p.id}
                    product={p}
                    onEdit={openEdit}
                    onDeleted={load}
                    onToggled={load}
                  />
                ))
              )}
            </>
          )}
        </ScrollView>
      )}

      {/* Product create / edit modal */}
      <ProductFormModal
        visible={modalVisible}
        product={editProduct}
        categories={categories}
        onClose={() => setModalVisible(false)}
        onSaved={load}
      />

      {/* Category management modal */}
      <CategoryManagerModal
        visible={categoryModalVisible}
        categories={categories}
        onClose={() => setCategoryModalVisible(false)}
        onChanged={load}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  statsRow: { flexDirection: 'row', gap: space.md, paddingHorizontal: pagePadding, paddingTop: space.xs, paddingBottom: space.md },
  statTile: { ...card, flex: 1, alignItems: 'center', paddingVertical: space.md },
  statVal: { fontSize: fontSize.xl, fontWeight: '800', color: colors.ink },
  statLabel: { fontSize: fontSize.xs, fontWeight: '700', color: colors.muted, marginTop: 1 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: pagePadding, marginBottom: space.md },
  searchWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, height: 48, paddingHorizontal: 14,
    backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line,
  },
  searchInput: { flex: 1, fontSize: fontSize.sm, color: colors.ink },
  catBtn: {
    width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.primaryTint, borderWidth: 1, borderColor: colors.primarySoft,
  },
  addBtn: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  segmentRow: { flexDirection: 'row', gap: space.sm, paddingHorizontal: pagePadding, marginBottom: space.md },
  segment: {
    minHeight: 40, paddingHorizontal: 18, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line,
  },
  segmentActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  segmentText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.ink },
  segmentTextActive: { color: colors.white },
  list: { paddingHorizontal: pagePadding, paddingBottom: space.xxl, flexGrow: 1 },
  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.md, padding: space.md,
    backgroundColor: colors.dangerBg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.dangerLine,
  },
  errorBannerText: { flex: 1, fontSize: fontSize.sm, color: colors.danger, lineHeight: 19 },
  errorBannerRetry: { fontSize: fontSize.sm, fontWeight: '800', color: colors.danger, paddingHorizontal: space.sm, paddingVertical: space.sm },
  emptyBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, alignSelf: 'center',
    height: 48, paddingHorizontal: 22, borderRadius: radius.md, backgroundColor: colors.primary,
  },
  emptyBtnText: { color: colors.white, fontSize: fontSize.sm, fontWeight: '800' },
});
