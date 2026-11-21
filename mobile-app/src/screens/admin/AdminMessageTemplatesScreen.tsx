import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Modal,
  FlatList,
  RefreshControl,
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, radius, space, fontSize, card, pagePadding } from '../../theme';
import { EmptyState, ErrorState, StatusPill, friendlyError } from '../../components/ui';
import { KeyboardAwareScrollView } from '../../components/KeyboardAwareScrollView';
import { useDialog } from '../../components/AppDialog';
import {
  adminService,
  MessageTemplate,
  MessageTemplateCategory,
} from '../../services/adminService';
import {
  TEMPLATE_VARIABLES,
  renderTemplate,
  sampleTemplateContext,
} from '../../utils/whatsapp';
import { RootStackParamList } from '../../types/navigation';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const CATEGORY_LABELS: Record<MessageTemplateCategory, string> = {
  order_info: 'Order Info',
  order_dispatch: 'Dispatch',
  payment_reminder: 'Reminder',
  custom: 'Custom',
};

const CATEGORIES: { key: MessageTemplateCategory; label: string }[] = [
  { key: 'order_info', label: 'Order Info / Confirmation' },
  { key: 'order_dispatch', label: 'Order Dispatch / On The Way' },
  { key: 'payment_reminder', label: 'Payment Reminder / Due' },
  { key: 'custom', label: 'Custom Message' },
];

export const AdminMessageTemplatesScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const { notify } = useDialog();

  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Modal / Editor state
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<MessageTemplateCategory>('order_info');
  const [content, setContent] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'editor' | 'preview'>('editor');

  const contentInputRef = useRef<TextInput>(null);
  const sampleContext = useMemo(() => sampleTemplateContext(), []);

  const previewText = useMemo(() => {
    if (!content.trim()) return 'Your message preview will appear here…';
    return renderTemplate(content, sampleContext);
  }, [content, sampleContext]);

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    setError(null);
    try {
      const data = await adminService.getMessageTemplates();
      setTemplates(data);
    } catch (e: any) {
      setError(e?.message || 'Could not load message templates.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load(true);
  };

  const openCreateModal = () => {
    setEditingId(null);
    setName('');
    setCategory('order_info');
    setContent(
      '{business_name}\n\nHello {customer_name},\nRegarding your order #{order_id}:\n\n📦 Order Items:\n{items_list}\n\n📍 Delivery Address:\n{delivery_address}\n\n💰 Payment Summary:\n• This Order: {order_total}\n{previous_balance_line}\n─────────────────\nTotal Payable: {total_payable}\n{payment_instruction}\n\nThank you for choosing us! 💧'
    );
    setIsDefault(false);
    setActiveTab('editor');
    setModalVisible(true);
  };

  const openEditModal = (tpl: MessageTemplate) => {
    setEditingId(tpl.id);
    setName(tpl.name);
    setCategory(tpl.category);
    setContent(tpl.content);
    setIsDefault(tpl.is_default);
    setActiveTab('editor');
    setModalVisible(true);
  };

  const insertTag = (tag: string) => {
    setContent((prev) => (prev ? `${prev} ${tag}` : tag));
  };

  const handleSave = async () => {
    if (!name.trim()) {
      void notify({ title: 'Name Required', message: 'Please enter a template name.', tone: 'destructive' });
      return;
    }
    if (!content.trim()) {
      void notify({ title: 'Content Required', message: 'Please enter message content.', tone: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        await adminService.updateMessageTemplate(editingId, {
          name: name.trim(),
          category,
          content: content.trim(),
          is_default: isDefault,
        });
        void notify({ title: 'Template Saved', message: `Updated "${name.trim()}".` });
      } else {
        await adminService.createMessageTemplate({
          name: name.trim(),
          category,
          content: content.trim(),
          is_default: isDefault,
        });
        void notify({ title: 'Template Created', message: `Created "${name.trim()}".` });
      }
      setModalVisible(false);
      load(true);
    } catch (e: any) {
      void notify({
        title: 'Could Not Save',
        message: friendlyError(e?.message),
        tone: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (tpl: MessageTemplate) => {
    try {
      await adminService.deleteMessageTemplate(tpl.id);
      void notify({ title: 'Deleted', message: `Removed "${tpl.name}".` });
      load(true);
    } catch (e: any) {
      void notify({ title: 'Failed to Delete', message: friendlyError(e?.message), tone: 'destructive' });
    }
  };

  const handleSetDefault = async (tpl: MessageTemplate) => {
    try {
      await adminService.setDefaultMessageTemplate(tpl.id);
      void notify({ title: 'Default Updated', message: `"${tpl.name}" is now the default template.` });
      load(true);
    } catch (e: any) {
      void notify({ title: 'Could Not Set Default', message: friendlyError(e?.message), tone: 'destructive' });
    }
  };

  const filtered = useMemo(() => {
    if (selectedCategory === 'all') return templates;
    return templates.filter((t) => t.category === selectedCategory);
  }, [templates, selectedCategory]);

  return (
    <View style={styles.container}>
      {/* Header bar */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={22} color={colors.ink} />
        </TouchableOpacity>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle}>Message Templates</Text>
          <Text style={styles.headerSubtitle}>WhatsApp & SMS Order Alerts</Text>
        </View>
        <TouchableOpacity
          style={styles.createBtn}
          onPress={openCreateModal}
          accessibilityLabel="Add new template"
        >
          <Ionicons name="add" size={22} color={colors.white} />
        </TouchableOpacity>
      </View>

      {/* Category Filter Chips */}
      <View style={styles.filterBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChips}>
          <TouchableOpacity
            style={[styles.filterChip, selectedCategory === 'all' && styles.filterChipActive]}
            onPress={() => setSelectedCategory('all')}
          >
            <Text style={[styles.filterChipText, selectedCategory === 'all' && styles.filterChipTextActive]}>
              All ({templates.length})
            </Text>
          </TouchableOpacity>
          {(['order_info', 'order_dispatch', 'payment_reminder', 'custom'] as MessageTemplateCategory[]).map(
            (cat) => {
              const count = templates.filter((t) => t.category === cat).length;
              const active = selectedCategory === cat;
              return (
                <TouchableOpacity
                  key={cat}
                  style={[styles.filterChip, active && styles.filterChipActive]}
                  onPress={() => setSelectedCategory(cat)}
                >
                  <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                    {CATEGORY_LABELS[cat]} ({count})
                  </Text>
                </TouchableOpacity>
              );
            }
          )}
        </ScrollView>
      </View>

      {/* Main List */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading templates…</Text>
        </View>
      ) : error && templates.length === 0 ? (
        <ErrorState title="Could not load templates" message={error} onRetry={() => load()} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <View style={[styles.card, item.is_default && styles.cardDefault]}>
              <View style={styles.cardHeader}>
                <View style={styles.cardInfo}>
                  <View style={styles.nameRow}>
                    <Text style={styles.cardTitle} numberOfLines={1}>
                      {item.name}
                    </Text>
                    {item.is_default && (
                      <View style={styles.defaultBadge}>
                        <Ionicons name="star" size={11} color={colors.warningText} />
                        <Text style={styles.defaultBadgeText}>Default</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.categoryBadge}>{item.category_display}</Text>
                </View>

                {/* Actions */}
                <View style={styles.cardActions}>
                  {!item.is_default && (
                    <TouchableOpacity
                      style={styles.iconActionBtn}
                      onPress={() => handleSetDefault(item)}
                      accessibilityLabel="Make default"
                    >
                      <Ionicons name="star-outline" size={18} color={colors.muted} />
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={styles.iconActionBtn}
                    onPress={() => openEditModal(item)}
                    accessibilityLabel="Edit template"
                  >
                    <Ionicons name="pencil" size={18} color={colors.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.iconActionBtn}
                    onPress={() => handleDelete(item)}
                    accessibilityLabel="Delete template"
                  >
                    <Ionicons name="trash-outline" size={18} color={colors.danger} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Snippet */}
              <View style={styles.contentSnippet}>
                <Text style={styles.snippetText} numberOfLines={4}>
                  {item.content}
                </Text>
              </View>

              {/* Bottom footer */}
              <TouchableOpacity
                style={styles.previewFooterBtn}
                onPress={() => openEditModal(item)}
              >
                <Ionicons name="eye-outline" size={14} color={colors.primary} />
                <Text style={styles.previewFooterText}>Tap to preview or edit template</Text>
              </TouchableOpacity>
            </View>
          )}
          ListEmptyComponent={
            <EmptyState
              icon="chatbubbles-outline"
              title="No templates found"
              text="Tap + above to build a custom WhatsApp template for order notifications."
            />
          }
        />
      )}

      {/* Editor & Preview Modal */}
      <Modal visible={modalVisible} animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalContainer}>
          {/* Modal Header */}
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.modalCloseBtn}>
              <Ionicons name="close" size={24} color={colors.ink} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>{editingId ? 'Edit Template' : 'New Template'}</Text>
            <TouchableOpacity
              onPress={handleSave}
              disabled={saving}
              style={[styles.modalSaveBtn, saving && { opacity: 0.6 }]}
            >
              {saving ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Text style={styles.modalSaveText}>Save</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Tab Switcher (Editor vs Live Preview) */}
          <View style={styles.tabSwitcher}>
            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'editor' && styles.tabBtnActive]}
              onPress={() => setActiveTab('editor')}
            >
              <Ionicons
                name="create-outline"
                size={16}
                color={activeTab === 'editor' ? colors.white : colors.muted}
              />
              <Text style={[styles.tabText, activeTab === 'editor' && styles.tabTextActive]}>
                Edit Template
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'preview' && styles.tabBtnActive]}
              onPress={() => setActiveTab('preview')}
            >
              <Ionicons
                name="logo-whatsapp"
                size={16}
                color={activeTab === 'preview' ? colors.white : colors.muted}
              />
              <Text style={[styles.tabText, activeTab === 'preview' && styles.tabTextActive]}>
                WhatsApp Preview
              </Text>
            </TouchableOpacity>
          </View>

          {/* Modal Body */}
          {activeTab === 'editor' ? (
            <KeyboardAwareScrollView style={styles.modalScrollView} contentContainerStyle={styles.modalFormContent}>
              {/* Template Name */}
              <Text style={styles.inputLabel}>Template Name</Text>
              <TextInput
                style={styles.textInput}
                value={name}
                onChangeText={setName}
                placeholder="e.g. Standard Order Dispatch"
                placeholderTextColor={colors.muted}
              />

              {/* Category Picker */}
              <Text style={styles.inputLabel}>Category</Text>
              <View style={styles.categoryGrid}>
                {CATEGORIES.map((c) => {
                  const selected = category === c.key;
                  return (
                    <TouchableOpacity
                      key={c.key}
                      style={[styles.categoryCard, selected && styles.categoryCardSelected]}
                      onPress={() => setCategory(c.key)}
                    >
                      <Ionicons
                        name={selected ? 'radio-button-on' : 'radio-button-off'}
                        size={16}
                        color={selected ? colors.primary : colors.muted}
                      />
                      <Text style={[styles.categoryCardText, selected && styles.categoryCardTextSelected]}>
                        {c.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Make Default Switch */}
              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.switchTitle}>Set as Default Template</Text>
                  <Text style={styles.switchSubtitle}>
                    Automatically used when clicking WhatsApp on an order
                  </Text>
                </View>
                <Switch
                  value={isDefault}
                  onValueChange={setIsDefault}
                  trackColor={{ false: colors.line, true: colors.primarySoft }}
                  thumbColor={isDefault ? colors.primary : colors.disabled}
                />
              </View>

              {/* Variable Chips Toolbar */}
              <Text style={styles.inputLabel}>Insert Variables (Tap to add)</Text>
              <Text style={styles.hintText}>
                Tap any placeholder tag to insert it into your message:
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.variableChipsContainer}
              >
                {TEMPLATE_VARIABLES.map((v) => (
                  <TouchableOpacity
                    key={v.key}
                    style={styles.tagChip}
                    onPress={() => insertTag(v.key)}
                    accessibilityRole="button"
                    accessibilityLabel={`Insert ${v.label}`}
                  >
                    <Ionicons name="add-circle" size={14} color={colors.primary} />
                    <Text style={styles.tagChipText}>{v.key}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Content Input */}
              <View style={styles.labelCountRow}>
                <Text style={styles.inputLabel}>Message Content</Text>
                <Text style={styles.counterText}>{content.length} chars</Text>
              </View>
              <TextInput
                ref={contentInputRef}
                style={styles.textArea}
                value={content}
                onChangeText={setContent}
                placeholder="Enter template with placeholders e.g. {customer_name}"
                placeholderTextColor={colors.muted}
                multiline
                numberOfLines={10}
                textAlignVertical="top"
              />
            </KeyboardAwareScrollView>
          ) : (
            /* Live WhatsApp Preview */
            <ScrollView style={styles.modalScrollView} contentContainerStyle={styles.previewContainer}>
              <View style={styles.phoneMockup}>
                {/* Chat Top Bar */}
                <View style={styles.waHeader}>
                  <View style={styles.waAvatar}>
                    <Text style={styles.waAvatarText}>CS</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.waName}>Century Sip Delivery</Text>
                    <Text style={styles.waSub}>Official Business Account</Text>
                  </View>
                  <Ionicons name="call" size={16} color={colors.white} />
                </View>

                {/* WhatsApp Chat Bubble */}
                <View style={styles.waChatArea}>
                  <View style={styles.waBubble}>
                    <Text style={styles.waMessageText}>{previewText}</Text>
                    <View style={styles.waMeta}>
                      <Text style={styles.waTime}>11:45 AM</Text>
                      <Ionicons name="checkmark-done" size={14} color="#53bdeb" />
                    </View>
                  </View>
                </View>
              </View>

              <Text style={styles.previewNote}>
                This is a live preview using sample order #9, customer Hiba, and Century Sip details.
              </Text>
            </ScrollView>
          )}
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: pagePadding,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    gap: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceTint,
  },
  headerTitleWrap: { flex: 1 },
  headerTitle: { fontSize: fontSize.lg, fontWeight: '800', color: colors.ink },
  headerSubtitle: { fontSize: fontSize.xs, color: colors.muted },
  createBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },

  filterBar: {
    backgroundColor: colors.surface,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  filterChips: { paddingHorizontal: pagePadding, gap: 8 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceTint,
    borderWidth: 1,
    borderColor: colors.line,
  },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterChipText: { fontSize: fontSize.xs, fontWeight: '700', color: colors.muted },
  filterChipTextActive: { color: colors.white },

  listContent: { padding: pagePadding, gap: 12, paddingBottom: 40 },
  card: { ...card, padding: 16, marginBottom: 0 },
  cardDefault: { borderColor: colors.success, borderWidth: 1.5 },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  cardInfo: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.ink, flexShrink: 1 },
  defaultBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.warningBg,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.warningLine,
  },
  defaultBadgeText: { fontSize: 10, fontWeight: '800', color: colors.warningText },
  categoryBadge: { fontSize: fontSize.xs, color: colors.primary, fontWeight: '600', marginTop: 3 },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  iconActionBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceTint,
    alignItems: 'center',
    justifyContent: 'center',
  },

  contentSnippet: {
    marginTop: 10,
    backgroundColor: colors.surfaceTint,
    padding: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
  },
  snippetText: { fontSize: fontSize.xs, color: colors.textSecondary, fontFamily: 'monospace', lineHeight: 18 },

  previewFooterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.lineSoft,
  },
  previewFooterText: { fontSize: fontSize.xs, fontWeight: '700', color: colors.primary },

  centerContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: fontSize.sm, color: colors.muted },

  // Modal styles
  modalContainer: { flex: 1, backgroundColor: colors.bg },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: pagePadding,
    paddingTop: 16,
    paddingBottom: 14,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  modalCloseBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  modalTitle: { fontSize: fontSize.md, fontWeight: '800', color: colors.ink },
  modalSaveBtn: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
  },
  modalSaveText: { color: colors.white, fontSize: fontSize.sm, fontWeight: '800' },

  tabSwitcher: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    padding: 8,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceTint,
  },
  tabBtnActive: { backgroundColor: colors.primary },
  tabText: { fontSize: fontSize.xs, fontWeight: '700', color: colors.muted },
  tabTextActive: { color: colors.white },

  modalScrollView: { flex: 1 },
  modalFormContent: { padding: pagePadding, gap: 12, paddingBottom: 40 },
  inputLabel: { fontSize: fontSize.xs, fontWeight: '800', color: colors.ink, textTransform: 'uppercase' },
  hintText: { fontSize: fontSize.xs, color: colors.muted, marginTop: -4 },
  textInput: {
    height: 46,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 12,
    fontSize: fontSize.sm,
    color: colors.ink,
  },

  categoryGrid: { gap: 6 },
  categoryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
  },
  categoryCardSelected: { borderColor: colors.primary, backgroundColor: colors.primaryTint },
  categoryCardText: { fontSize: fontSize.xs, fontWeight: '600', color: colors.ink },
  categoryCardTextSelected: { color: colors.primary, fontWeight: '800' },

  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 8,
  },
  switchTitle: { fontSize: fontSize.sm, fontWeight: '700', color: colors.ink },
  switchSubtitle: { fontSize: 11, color: colors.muted, marginTop: 2 },

  variableChipsContainer: { gap: 6, paddingVertical: 4 },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primaryTint,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.primarySoft,
  },
  tagChipText: { fontSize: 11, fontWeight: '700', color: colors.primaryDark, fontFamily: 'monospace' },

  labelCountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  counterText: { fontSize: 11, color: colors.muted },
  textArea: {
    minHeight: 180,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    fontSize: fontSize.xs,
    fontFamily: 'monospace',
    lineHeight: 20,
    color: colors.ink,
  },

  // WhatsApp preview mockup
  previewContainer: { padding: pagePadding, alignItems: 'center' },
  phoneMockup: {
    width: '100%',
    backgroundColor: '#0c1317',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#202c33',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  waHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#202c33',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
  },
  waAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#00a884',
    alignItems: 'center',
    justifyContent: 'center',
  },
  waAvatarText: { color: colors.white, fontWeight: '800', fontSize: 13 },
  waName: { color: colors.white, fontSize: 13, fontWeight: '700' },
  waSub: { color: '#00a884', fontSize: 10 },
  waChatArea: { padding: 14, minHeight: 250, backgroundColor: '#0b141a' },
  waBubble: {
    backgroundColor: '#005c4b',
    borderRadius: 12,
    borderTopRightRadius: 2,
    padding: 12,
    alignSelf: 'flex-end',
    maxWidth: '92%',
  },
  waMessageText: { color: colors.white, fontSize: 12, lineHeight: 18 },
  waMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 6 },
  waTime: { fontSize: 10, color: 'rgba(255,255,255,0.6)' },
  previewNote: { fontSize: fontSize.xs, color: colors.muted, textAlign: 'center', marginTop: 14 },
});
