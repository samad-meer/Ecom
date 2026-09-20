import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, Switch, Image,
  Modal, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { adminService, AdminProduct, AdminCategory } from '../../services/adminService';
import { API_URL } from '../../constants/config';
import { MultiImagePicker } from '../../components/MultiImagePicker';
import { PickedImage, appendImages } from '../../constants/imageLimits';
import { KeyboardAwareScrollView } from '../../components/KeyboardAwareScrollView';

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
      Alert.alert('Error', e.message || 'Failed to save product.');
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
          <TouchableOpacity onPress={onClose} style={fm.closeBtn}>
            <Ionicons name="close" size={22} color="#555" />
          </TouchableOpacity>
        </View>

        <KeyboardAwareScrollView contentContainerStyle={fm.body} extraBottomSpace={28}>
          <Text style={fm.label}>Product Name *</Text>
          <TextInput style={fm.input} value={name} onChangeText={setName} placeholder="e.g. 20L Water Bottle" placeholderTextColor="#000" />

          <Text style={fm.label}>Description</Text>
          <TextInput
            style={[fm.input, { height: 80, textAlignVertical: 'top' }]}
            value={description} onChangeText={setDescription}
            placeholder="Short description…" placeholderTextColor="#000" multiline
          />

          <Text style={fm.label}>Price (PKR) *</Text>
          <TextInput style={fm.input} value={price} onChangeText={setPrice} placeholder="0.00" placeholderTextColor="#000" keyboardType="decimal-pad" />

          <Text style={fm.label}>Category</Text>
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
                style={[fm.catChip, categoryId === c.id && fm.catChipActive, !c.is_active && fm.catChipHidden]}
                onPress={() => setCategoryId(c.id)}
              >
                <Text style={[fm.catText, categoryId === c.id && fm.catTextActive]}>
                  {c.name}{!c.is_active && ' · Hidden'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {inHiddenCategory && (
            <Text style={fm.hint}>
              This category is hidden. It stays on this product until you pick another one.
            </Text>
          )}

          <MultiImagePicker
            label="Product images"
            value={images}
            onChange={setImages}
            existing={existingImages}
          />

          <View style={fm.activeRow}>
            <View>
              <Text style={fm.label}>Active</Text>
              <Text style={fm.hint}>Visible to customers in the shop</Text>
            </View>
            <Switch
              value={isActive}
              onValueChange={setIsActive}
              trackColor={{ false: '#e0e0e0', true: '#34C75940' }}
              thumbColor={isActive ? '#34C759' : '#ccc'}
            />
          </View>

          <TouchableOpacity
            style={[fm.submitBtn, saving && { opacity: 0.5 }]}
            onPress={submit}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator size="small" color="white" />
              : <Text style={fm.submitText}>{isEdit ? 'Save Changes' : 'Create Product'}</Text>
            }
          </TouchableOpacity>
        </KeyboardAwareScrollView>
      </View>
    </Modal>
  );
}

const fm = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#eee' },
  title: { fontSize: 17, fontWeight: '700', color: '#1a1a1a' },
  closeBtn: { padding: 4 },
  body: { padding: 16, gap: 4, paddingBottom: 40 },
  label: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 6, marginTop: 12 },
  hint: { fontSize: 11, color: '#aaa' },
  input: { borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#000', backgroundColor: 'white' },
  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: '#e0e0e0', backgroundColor: 'white' },
  catChipActive: { borderColor: '#007AFF', backgroundColor: '#007AFF15' },
  catChipHidden: { borderStyle: 'dashed', backgroundColor: '#fafafa' },
  catText: { fontSize: 13, color: '#555' },
  catTextActive: { color: '#007AFF', fontWeight: '600' },
  activeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'white', borderRadius: 12, padding: 14, marginTop: 12 },
  submitBtn: { backgroundColor: '#007AFF', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 20 },
  submitText: { color: 'white', fontWeight: '700', fontSize: 15 },
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
    } catch {
      Alert.alert('Error', 'Failed to update.');
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
          catch { Alert.alert('Error', 'Failed to delete.'); }
        },
      },
    ]);
  };

  const imageUri = product.image
    ? (product.image.startsWith('http') ? product.image : `${API_URL}${product.image}`)
    : null;

  return (
    <View style={pr.row}>
      {imageUri ? (
        <Image source={{ uri: imageUri }} style={pr.image} />
      ) : (
        <View style={pr.imagePlaceholder}>
          <Ionicons name="image-outline" size={20} color="#ccc" />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={pr.name} numberOfLines={1}>{product.name}</Text>
        <Text style={pr.price}>PKR {parseFloat(product.price).toLocaleString()}</Text>
        {product.category_name && <Text style={pr.category}>{product.category_name}</Text>}
      </View>
      <Switch
        value={product.is_active}
        onValueChange={handleToggle}
        disabled={toggling}
        trackColor={{ false: '#e0e0e0', true: '#34C75940' }}
        thumbColor={product.is_active ? '#34C759' : '#ccc'}
        style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
      />
      <TouchableOpacity onPress={() => onEdit(product)} style={pr.iconBtn}>
        <Ionicons name="create-outline" size={18} color="#007AFF" />
      </TouchableOpacity>
      <TouchableOpacity onPress={handleDelete} style={pr.iconBtn}>
        <Ionicons name="trash-outline" size={17} color="#FF3B30" />
      </TouchableOpacity>
    </View>
  );
}

const pr = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  image: { width: 44, height: 44, borderRadius: 8 },
  imagePlaceholder: { width: 44, height: 44, borderRadius: 8, backgroundColor: '#f0f0f0', alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 14, fontWeight: '600', color: '#1a1a1a' },
  price: { fontSize: 12, color: '#555', marginTop: 1 },
  category: { fontSize: 11, color: '#aaa', marginTop: 1 },
  iconBtn: { padding: 6 },
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
      Alert.alert('Error', e.message || 'Failed to update category.');
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
      Alert.alert('Error', e.message || 'Failed to update category.');
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
            catch (e: any) { Alert.alert('Error', e.message || 'Failed to delete.'); }
          },
        },
      ],
    );
  };

  if (editing) {
    return (
      <View style={cm.editRow}>
        <TextInput style={[cm.input, { flex: 1 }]} value={name} onChangeText={setName} placeholder="Name" placeholderTextColor="#000" autoFocus />
        <TextInput style={[cm.input, { width: 84 }]} value={icon} onChangeText={setIcon} placeholder="icon" placeholderTextColor="#000" />
        <TouchableOpacity onPress={save} disabled={saving} style={cm.iconBtn}>
          {saving ? <ActivityIndicator size="small" color="#34C759" /> : <Ionicons name="checkmark" size={20} color="#34C759" />}
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setEditing(false)} disabled={saving} style={cm.iconBtn}>
          <Ionicons name="close" size={20} color="#999" />
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[cm.row, !category.is_active && cm.rowHidden]}>
      <View style={{ flex: 1 }}>
        <View style={cm.nameRow}>
          <Text style={[cm.name, !category.is_active && cm.nameHidden]}>{category.name}</Text>
          {!category.is_active && (
            <View style={cm.pill}><Text style={cm.pillText}>Hidden</Text></View>
          )}
        </View>
        {!!category.icon && <Text style={cm.sub}>icon: {category.icon}</Text>}
      </View>
      <Switch
        value={category.is_active}
        onValueChange={toggleActive}
        disabled={toggling}
        trackColor={{ false: '#e0e0e0', true: '#34C75940' }}
        thumbColor={category.is_active ? '#34C759' : '#ccc'}
        style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
      />
      <TouchableOpacity onPress={startEdit} style={cm.iconBtn}>
        <Ionicons name="create-outline" size={18} color="#007AFF" />
      </TouchableOpacity>
      <TouchableOpacity onPress={remove} style={cm.iconBtn}>
        <Ionicons name="trash-outline" size={17} color="#FF3B30" />
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
      Alert.alert('Error', e.message || 'Failed to create category.');
    } finally {
      setAdding(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={fm.container}>
        <View style={fm.header}>
          <Text style={fm.title}>Manage Categories</Text>
          <TouchableOpacity onPress={onClose} style={fm.closeBtn}>
            <Ionicons name="close" size={22} color="#555" />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={cm.container} keyboardShouldPersistTaps="handled">
          {/* Add new category */}
          <View style={cm.addCard}>
            <Text style={cm.addTitle}>Add category</Text>
            <View style={cm.addRow}>
              <TextInput style={[cm.input, { flex: 1 }]} value={newName} onChangeText={setNewName} placeholder="e.g. Water Bottles" placeholderTextColor="#000" />
              <TextInput style={[cm.input, { width: 84 }]} value={newIcon} onChangeText={setNewIcon} placeholder="icon" placeholderTextColor="#000" />
              <TouchableOpacity style={[cm.addBtn, adding && { opacity: 0.5 }]} onPress={add} disabled={adding}>
                {adding ? <ActivityIndicator size="small" color="white" /> : <Ionicons name="add" size={20} color="white" />}
              </TouchableOpacity>
            </View>
            <Text style={cm.hint}>Icon (optional) is an Expo Vector Icons name.</Text>
          </View>

          {/* Existing categories */}
          <View style={cm.listCard}>
            {categories.length === 0 ? (
              <View style={cm.empty}>
                <Ionicons name="pricetags-outline" size={32} color="#ddd" />
                <Text style={cm.emptyText}>No categories yet — add your first above.</Text>
              </View>
            ) : (
              categories.map((c) => <CategoryRow key={c.id} category={c} onChanged={onChanged} />)
            )}
          </View>

          <Text style={cm.footNote}>
            Switch a category off to hide it from the shop and from the product form —
            its products keep it. Deleting is permanent: those products become uncategorised.
          </Text>
        </ScrollView>
      </View>
    </Modal>
  );
}

const cm = StyleSheet.create({
  container: { padding: 16, paddingBottom: 40 },
  addCard: { backgroundColor: 'white', borderRadius: 12, padding: 12, marginBottom: 16 },
  addTitle: { fontSize: 12, fontWeight: '700', color: '#888', textTransform: 'uppercase', marginBottom: 8 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: { borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, color: '#000', backgroundColor: 'white' },
  addBtn: { backgroundColor: '#007AFF', width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  hint: { fontSize: 11, color: '#aaa', marginTop: 8 },
  listCard: { backgroundColor: 'white', borderRadius: 12, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  rowHidden: { backgroundColor: '#fafafa' },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f5f5f5', backgroundColor: '#007AFF08' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 14, fontWeight: '600', color: '#1a1a1a' },
  nameHidden: { color: '#aaa' },
  pill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20, backgroundColor: '#FF950015' },
  pillText: { fontSize: 10, fontWeight: '700', color: '#FF9500' },
  sub: { fontSize: 11, color: '#aaa', marginTop: 1 },
  iconBtn: { padding: 6 },
  empty: { alignItems: 'center', padding: 32, gap: 8 },
  emptyText: { color: '#bbb', fontSize: 14 },
  footNote: { fontSize: 11, color: '#aaa', marginTop: 12, textAlign: 'center' },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export const AdminShopScreen: React.FC = () => {
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');
  const [modalVisible, setModalVisible] = useState(false);
  const [editProduct, setEditProduct] = useState<AdminProduct | null>(null);
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);

  const load = useCallback(async () => {
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
    } catch {
      Alert.alert('Error', 'Failed to load products.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

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

  const openCreate = () => { setEditProduct(null); setModalVisible(true); };
  const openEdit = (p: AdminProduct) => { setEditProduct(p); setModalVisible(true); };

  return (
    <View style={styles.container}>
      {/* Stats bar */}
      <View style={styles.statsBar}>
        <View style={styles.statChip}>
          <Text style={styles.statVal}>{total}</Text>
          <Text style={styles.statLabel}>Total</Text>
        </View>
        <View style={[styles.statChip, { borderLeftWidth: 1, borderLeftColor: '#f0f0f0' }]}>
          <Text style={[styles.statVal, { color: '#34C759' }]}>{activeCount}</Text>
          <Text style={styles.statLabel}>Active</Text>
        </View>
        <View style={[styles.statChip, { borderLeftWidth: 1, borderLeftColor: '#f0f0f0' }]}>
          <Text style={[styles.statVal, { color: '#FF9500' }]}>{total - activeCount}</Text>
          <Text style={styles.statLabel}>Inactive</Text>
        </View>
        <TouchableOpacity style={styles.catBtn} onPress={() => setCategoryModalVisible(true)}>
          <Ionicons name="pricetags-outline" size={18} color="#007AFF" />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.addBtn, { marginLeft: 8 }]} onPress={openCreate}>
          <Ionicons name="add" size={20} color="white" />
        </TouchableOpacity>
      </View>

      {/* Filters */}
      <View style={styles.filterRow}>
        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={14} color="#aaa" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search products…"
            placeholderTextColor="#000"
            value={search}
            onChangeText={setSearch}
          />
        </View>
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
      </View>

      {/* List */}
      {loading ? (
        <ActivityIndicator size="large" color="#007AFF" style={{ marginTop: 48 }} />
      ) : (
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        >
          <View style={styles.card}>
            {filtered.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="bag-outline" size={36} color="#ddd" />
                <Text style={styles.emptyText}>No products found.</Text>
                <TouchableOpacity onPress={openCreate}>
                  <Text style={styles.emptyLink}>Add your first product →</Text>
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
          </View>
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
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  statsBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
  statChip: { paddingHorizontal: 12, alignItems: 'center' },
  statVal: { fontSize: 18, fontWeight: '800', color: '#1a1a1a' },
  statLabel: { fontSize: 10, color: '#aaa', marginTop: 1 },
  addBtn: { marginLeft: 'auto', backgroundColor: '#007AFF', width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  catBtn: { marginLeft: 'auto', backgroundColor: '#007AFF15', width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  filterRow: { padding: 12, gap: 8, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#eee' },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#f5f5f5', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  searchInput: { flex: 1, fontSize: 13, color: '#000' },
  segmentRow: { flexDirection: 'row', gap: 6 },
  segment: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: '#f5f5f5' },
  segmentActive: { backgroundColor: '#007AFF15' },
  segmentText: { fontSize: 12, fontWeight: '600', color: '#888' },
  segmentTextActive: { color: '#007AFF' },
  card: { margin: 16, backgroundColor: 'white', borderRadius: 14, overflow: 'hidden', elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3 },
  empty: { alignItems: 'center', padding: 40, gap: 8 },
  emptyText: { color: '#bbb', fontSize: 14 },
  emptyLink: { color: '#007AFF', fontSize: 13, marginTop: 4 },
});
