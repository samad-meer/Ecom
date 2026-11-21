import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
  FlatList,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, space, fontSize, card, pagePadding } from '../../theme';
import { API_URL } from '../../constants/config';
import { getAuthToken } from '../../services/authService';
import { EmptyState, ErrorState, StatusPill, Tone, friendlyError } from '../../components/ui';
import { KeyboardAwareScrollView } from '../../components/KeyboardAwareScrollView';

type RecipientType = 'all' | 'customers' | 'riders';
type TabType = 'compose' | 'history' | 'templates';

interface Recipient {
  key: RecipientType;
  label: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  /** Soft fill behind the icon. */
  tint: string;
}

interface NotificationTemplate {
  id: string;
  title: string;
  body: string;
  category: string;
  icon: keyof typeof Ionicons.glyphMap;
}

interface NotificationHistory {
  id: number;
  title: string;
  body: string;
  recipient_type: string;
  sent_count: number;
  total_devices: number;
  created_at: string;
  scheduled_for?: string;
}

const TABS: { key: TabType; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'compose', label: 'Compose', icon: 'create-outline' },
  { key: 'templates', label: 'Templates', icon: 'documents-outline' },
  { key: 'history', label: 'History', icon: 'time-outline' },
];

const RECIPIENTS: Recipient[] = [
  {
    key: 'all',
    label: 'Everyone',
    description: 'All customers and delivery staff',
    icon: 'people',
    color: colors.primary,
    tint: colors.primaryTint,
  },
  {
    key: 'customers',
    label: 'Customers Only',
    description: 'All registered customers',
    icon: 'person',
    color: colors.success,
    tint: colors.successBg,
  },
  {
    key: 'riders',
    label: 'Delivery Boys Only',
    description: 'All delivery staff members',
    icon: 'bicycle',
    color: colors.warning,
    tint: colors.warningBg,
  },
];

const TEMPLATES: NotificationTemplate[] = [
  {
    id: '1',
    title: 'Special Offer Alert',
    body: 'Enjoy 20% off on all products today! Limited time offer.',
    category: 'Promotions',
    icon: 'pricetag',
  },
  {
    id: '2',
    title: 'New Products Available',
    body: 'Check out our latest collection of premium products just added!',
    category: 'Updates',
    icon: 'basket',
  },
  {
    id: '3',
    title: 'Order Update',
    body: 'Your order is on the way! Track your delivery in real-time.',
    category: 'Orders',
    icon: 'location',
  },
  {
    id: '4',
    title: 'Weekend Sale',
    body: 'This weekend only: Get up to 50% off on selected items!',
    category: 'Promotions',
    icon: 'gift',
  },
  {
    id: '5',
    title: 'Delivery Reminder',
    body: 'You have new deliveries assigned. Please check the app.',
    category: 'Riders',
    icon: 'bicycle',
  },
  {
    id: '6',
    title: 'System Maintenance',
    body: 'We will be performing maintenance on [date]. Service may be briefly interrupted.',
    category: 'Announcements',
    icon: 'construct',
  },
];

/** The server's own wording when it gave one; the raw body only as a last resort. */
const reasonFrom = (data: any): string => {
  if (!data) return '';
  if (typeof data === 'string') return data;
  if (typeof data.detail === 'string') return data.detail;
  if (typeof data.error === 'string') return data.error;
  if (typeof data.message === 'string') return data.message;
  return JSON.stringify(data);
};

const recipientLabel = (type: string): string => {
  if (type === 'all') return 'Everyone';
  if (type === 'customers') return 'Customers';
  if (type === 'riders') return 'Riders';
  if (type === 'test') return 'Test';
  return type ? type.charAt(0).toUpperCase() + type.slice(1) : 'Unknown';
};

/** How much of the send actually landed: the tone carries it, the words say it. */
const deliveryTone = (sent: number, total: number): Tone => {
  if (total <= 0) return 'neutral';
  if (sent >= total) return 'success';
  if (sent <= 0) return 'danger';
  return 'warning';
};

// ─── Template card ────────────────────────────────────────────────────────────

function TemplateCard({
  template,
  onPress,
  compact,
}: {
  template: NotificationTemplate;
  onPress: () => void;
  /** The tab shows a two-line teaser and a chevron; the sheet shows it all. */
  compact?: boolean;
}) {
  return (
    <TouchableOpacity style={styles.templateCard} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.templateIcon}>
        <Ionicons name={template.icon} size={24} color={colors.primary} />
      </View>
      <View style={styles.templateContent}>
        <StatusPill label={template.category} tone="primary" />
        <Text style={styles.templateTitle}>{template.title}</Text>
        <Text style={styles.templateBody} numberOfLines={compact ? 2 : undefined}>
          {template.body}
        </Text>
      </View>
      {compact ? <Ionicons name="chevron-forward" size={20} color={colors.muted} /> : null}
    </TouchableOpacity>
  );
}

export const AdminNotificationScreen: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('compose');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [recipient, setRecipient] = useState<RecipientType>('all');
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState<NotificationHistory[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [testMode, setTestMode] = useState(false);

  useEffect(() => {
    if (activeTab === 'history') {
      loadHistory();
    }
  }, [activeTab]);

  const loadHistory = async () => {
    setLoadingHistory(true);
    setHistoryError(null);
    try {
      const token = await getAuthToken();
      const res = await fetch(`${API_URL}/auth/admin/notifications/history/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        // Without this a failed request looked exactly like "nothing sent yet".
        let detail = '';
        try {
          detail = reasonFrom(await res.json());
        } catch {
          // Not JSON: the status code below is all there is to report.
        }
        throw new Error(
          res.status === 401 || res.status === 403
            ? 'You do not have permission to view history.'
            : detail || `Could not load history (${res.status}).`,
        );
      }
      setHistory(await res.json());
    } catch (e: any) {
      console.error('Error loading history:', e);
      setHistoryError(friendlyError(e?.message));
    } finally {
      setLoadingHistory(false);
    }
  };

  const selectedRecipient = RECIPIENTS.find((r) => r.key === recipient)!;

  const applyTemplate = (template: NotificationTemplate) => {
    setTitle(template.title);
    setBody(template.body);
    setShowTemplates(false);
    setActiveTab('compose');
  };

  const saveDraft = () => {
    // Save to AsyncStorage or similar
    Alert.alert('Draft Saved', 'Your notification has been saved as a draft.');
  };

  const handleSend = async () => {
    const trimmedTitle = title.trim();
    const trimmedBody = body.trim();

    if (!trimmedTitle) {
      Alert.alert('Missing Title', 'Please enter a notification title.');
      return;
    }
    if (!trimmedBody) {
      Alert.alert('Missing Message', 'Please enter a notification message.');
      return;
    }

    const confirmMessage = testMode
      ? `Send test notification to yourself?`
      : `Send "${trimmedTitle}" to ${selectedRecipient.label}?`;

    Alert.alert(
      testMode ? 'Send Test' : 'Send Notification',
      confirmMessage,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: testMode ? 'Send Test' : 'Send',
          style: 'default',
          onPress: async () => {
            setSending(true);
            try {
              const token = await getAuthToken();
              const payload: any = {
                title: trimmedTitle,
                body: trimmedBody,
                recipient_type: testMode ? 'test' : recipient,
              };

              if (imageUrl.trim()) {
                payload.image_url = imageUrl.trim();
              }

              const res = await fetch(`${API_URL}/auth/admin/notifications/send/`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(payload),
              });
              // A server error page is not JSON; the status is still worth showing.
              const data = await res.json().catch(() => null);
              if (!res.ok) throw new Error(reasonFrom(data) || `The server returned error ${res.status}.`);

              const { sent, total_tokens } = data as { sent: number; total_tokens: number };

              if (testMode) {
                Alert.alert('Test Sent', 'Test notification sent to your device.');
              } else {
                Alert.alert(
                  'Notification Sent',
                  total_tokens === 0
                    ? 'No devices found with push notifications enabled.'
                    : `Sent to ${sent} of ${total_tokens} device${total_tokens !== 1 ? 's' : ''}.`,
                  [{ text: 'OK', onPress: () => {
                    setTitle('');
                    setBody('');
                    setImageUrl('');
                  }}],
                );
              }
            } catch (e: any) {
              Alert.alert('Error', `Failed to send notification: ${friendlyError(e?.message)}`);
            } finally {
              setSending(false);
            }
          },
        },
      ],
    );
  };

  return (
    <View style={styles.root}>
      {/* Tabs */}
      <View style={styles.tabs}>
        {TABS.map((t) => {
          const active = activeTab === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              style={[styles.tab, active && styles.tabActive]}
              onPress={() => setActiveTab(t.key)}
            >
              <Ionicons name={t.icon} size={18} color={active ? colors.white : colors.muted} />
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Compose Tab */}
      {activeTab === 'compose' && (
        <KeyboardAwareScrollView
          style={styles.container}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Scrolls the focused field above the keyboard on both platforms,
              which KeyboardAvoidingView does not do on Android. */}
          <View>
            {/* Quick Actions */}
            <View style={styles.quickActions}>
              <TouchableOpacity
                style={[styles.quickActionBtn, testMode && styles.quickActionBtnActive]}
                onPress={() => setTestMode(!testMode)}
              >
                <Ionicons name="flask" size={16} color={testMode ? colors.white : colors.textSecondary} />
                <Text style={[styles.quickActionText, testMode && styles.quickActionTextActive]}>
                  Test Mode
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.quickActionBtn}
                onPress={() => setShowTemplates(true)}
              >
                <Ionicons name="copy" size={16} color={colors.textSecondary} />
                <Text style={styles.quickActionText}>Use Template</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.quickActionBtn} onPress={saveDraft}>
                <Ionicons name="save" size={16} color={colors.textSecondary} />
                <Text style={styles.quickActionText}>Save Draft</Text>
              </TouchableOpacity>
            </View>

            {/* Recipients */}
            {!testMode && (
              <>
                <Text style={styles.sectionTitle}>Send to</Text>
                <View style={styles.recipientList}>
                  {RECIPIENTS.map((r) => {
                    const selected = recipient === r.key;
                    return (
                      <TouchableOpacity
                        key={r.key}
                        style={[styles.recipientRow, selected && styles.recipientRowActive]}
                        onPress={() => setRecipient(r.key)}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.recipientIcon, { backgroundColor: r.tint }]}>
                          <Ionicons name={r.icon} size={22} color={r.color} />
                        </View>
                        <View style={styles.recipientText}>
                          <Text style={styles.recipientLabel}>{r.label}</Text>
                          <Text style={styles.recipientDesc}>{r.description}</Text>
                        </View>
                        <View style={[styles.radio, selected && styles.radioActive]}>
                          {selected && <View style={styles.radioDot} />}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}

            {testMode && (
              <View style={styles.testModeCard}>
                <Ionicons name="information-circle" size={22} color={colors.primaryDark} />
                <Text style={styles.testModeText}>
                  Test mode: Notification will only be sent to your device
                </Text>
              </View>
            )}

            {/* Message composer */}
            <Text style={styles.sectionTitle}>Message</Text>
            <View style={styles.composer}>
              <View style={styles.field}>
                <View style={styles.labelRow}>
                  <Text style={styles.inputLabel}>Title</Text>
                  <Text style={styles.charCount}>{title.length}/80</Text>
                </View>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. New offer available!"
                  placeholderTextColor={colors.muted}
                  value={title}
                  onChangeText={setTitle}
                  maxLength={80}
                  returnKeyType="next"
                />
              </View>
              <View style={styles.field}>
                <View style={styles.labelRow}>
                  <Text style={styles.inputLabel}>Message</Text>
                  <Text style={styles.charCount}>{body.length}/300</Text>
                </View>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="Enter notification message…"
                  placeholderTextColor={colors.muted}
                  value={body}
                  onChangeText={setBody}
                  multiline
                  maxLength={300}
                  textAlignVertical="top"
                />
              </View>
              <View style={styles.field}>
                <View style={styles.labelRow}>
                  <Text style={styles.inputLabel}>Image URL (Optional)</Text>
                </View>
                <TextInput
                  style={styles.input}
                  placeholder="https://example.com/image.png"
                  placeholderTextColor={colors.muted}
                  value={imageUrl}
                  onChangeText={setImageUrl}
                  keyboardType="url"
                  autoCapitalize="none"
                />
              </View>
            </View>

            {/* Preview */}
            {(title.trim() || body.trim()) ? (
              <>
                <Text style={styles.sectionTitle}>Preview</Text>
                <View style={styles.previewCard}>
                  <View style={styles.previewHeader}>
                    <Ionicons name="notifications" size={16} color={colors.primary} />
                    <Text style={styles.previewApp}>Century Sip</Text>
                    <Text style={styles.previewTime}>now</Text>
                  </View>
                  {title.trim() ? <Text style={styles.previewTitle}>{title.trim()}</Text> : null}
                  {body.trim() ? (
                    <Text style={styles.previewBody} numberOfLines={3}>
                      {body.trim()}
                    </Text>
                  ) : null}
                  {imageUrl.trim() ? (
                    <View style={styles.previewImagePlaceholder}>
                      <Ionicons name="image" size={24} color={colors.muted} />
                      <Text style={styles.previewImageText}>Image will be displayed here</Text>
                    </View>
                  ) : null}
                </View>
              </>
            ) : null}

            {/* Send button */}
            <TouchableOpacity
              style={[styles.sendBtn, sending && styles.sendBtnDisabled]}
              onPress={handleSend}
              disabled={sending}
              activeOpacity={0.85}
            >
              {sending ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <>
                  <Ionicons name="send" size={18} color={colors.white} />
                  <Text style={styles.sendBtnText}>
                    {testMode ? 'Send Test' : `Send to ${selectedRecipient.label}`}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAwareScrollView>
      )}

      {/* Templates Tab */}
      {activeTab === 'templates' && (
        <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
          <Text style={[styles.sectionTitle, styles.sectionTitleFirst]}>Select a template</Text>
          <View style={styles.templateList}>
            {TEMPLATES.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                onPress={() => applyTemplate(template)}
                compact
              />
            ))}
          </View>
        </ScrollView>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <View style={{ flex: 1 }}>
          {loadingHistory && history.length === 0 ? (
            <View style={styles.centerContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : historyError && history.length === 0 ? (
            <View style={styles.centerContainer}>
              <ErrorState
                title="Could not load history"
                message={historyError}
                onRetry={loadHistory}
              />
            </View>
          ) : history.length === 0 ? (
            <View style={styles.centerContainer}>
              <EmptyState
                icon="time-outline"
                title="No notifications sent yet"
                text="Your notification history will appear here."
              />
            </View>
          ) : (
            <>
              {/* A failed refresh keeps the list already loaded and says why here. */}
              {historyError ? (
                <View style={styles.errorBanner}>
                  <Ionicons name="alert-circle" size={20} color={colors.danger} />
                  <Text style={styles.errorBannerText}>{historyError}</Text>
                  <TouchableOpacity onPress={loadHistory} style={styles.errorRetry}>
                    <Text style={styles.errorRetryText}>Try again</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
              <FlatList
                data={history}
                keyExtractor={(item) => item.id.toString()}
                contentContainerStyle={styles.historyList}
                refreshControl={
                  <RefreshControl
                    refreshing={loadingHistory}
                    onRefresh={loadHistory}
                    colors={[colors.primary]}
                    tintColor={colors.primary}
                  />
                }
                renderItem={({ item }) => {
                  const pct =
                    item.total_devices > 0
                      ? Math.round((item.sent_count / item.total_devices) * 100)
                      : 0;
                  return (
                    <View style={styles.historyCard}>
                      <View style={styles.historyHeader}>
                        <Text style={styles.historyTitle}>{item.title}</Text>
                        <Text style={styles.historyDate}>
                          {new Date(item.created_at).toLocaleDateString()}
                        </Text>
                      </View>
                      <Text style={styles.historyBody} numberOfLines={2}>
                        {item.body}
                      </Text>
                      <View style={styles.historyFooter}>
                        <StatusPill
                          label={recipientLabel(item.recipient_type)}
                          tone="neutral"
                          icon="people"
                        />
                        <View style={styles.historyStats}>
                          <StatusPill
                            label={`${item.sent_count} of ${item.total_devices} sent`}
                            tone={deliveryTone(item.sent_count, item.total_devices)}
                          />
                          <Text style={styles.historySuccessRate}>({pct}%)</Text>
                        </View>
                      </View>
                    </View>
                  );
                }}
              />
            </>
          )}
        </View>
      )}

      {/* Template Modal */}
      <Modal visible={showTemplates} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowTemplates(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Choose Template</Text>
            <TouchableOpacity onPress={() => setShowTemplates(false)} style={styles.modalClose}>
              <Ionicons name="close" size={28} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.modalList}>
            {TEMPLATES.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                onPress={() => applyTemplate(template)}
              />
            ))}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, backgroundColor: colors.bg },
  scrollContent: { paddingHorizontal: pagePadding, paddingBottom: space.xxl },

  // Pill tabs sit on the page itself, like the filters on the other admin screens.
  tabs: {
    flexDirection: 'row',
    gap: space.sm,
    paddingHorizontal: pagePadding,
    paddingTop: space.sm,
    paddingBottom: space.xs,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 40,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.ink },
  tabTextActive: { color: colors.white },

  quickActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    paddingTop: space.md,
  },
  quickActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 14,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
  },
  quickActionBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  quickActionText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.ink,
  },
  quickActionTextActive: {
    color: colors.white,
  },
  testModeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: space.lg,
    padding: space.lg,
    backgroundColor: colors.primaryTint,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.primarySoft,
  },
  testModeText: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.primaryDark,
    fontWeight: '700',
    lineHeight: 20,
  },
  sectionTitle: {
    fontSize: fontSize.md,
    fontWeight: '800',
    color: colors.ink,
    marginTop: space.xl,
    marginBottom: space.md,
  },
  sectionTitleFirst: { marginTop: space.lg },

  recipientList: { gap: space.sm },
  recipientRow: {
    ...card,
    flexDirection: 'row',
    alignItems: 'center',
    padding: space.md,
    gap: space.md,
    borderWidth: 1.5,
  },
  recipientRowActive: {
    backgroundColor: colors.primaryTint,
    borderColor: colors.primary,
  },
  recipientIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recipientText: { flex: 1 },
  recipientLabel: { fontSize: fontSize.md, fontWeight: '800', color: colors.ink },
  recipientDesc: { fontSize: fontSize.sm, color: colors.muted, marginTop: 2 },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActive: { borderColor: colors.primary },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.primary },

  composer: {
    ...card,
    padding: space.lg,
    gap: space.lg,
  },
  field: { gap: 6 },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  inputLabel: { fontSize: fontSize.sm, fontWeight: '700', color: colors.ink },
  input: {
    height: 48,
    paddingHorizontal: 14,
    fontSize: fontSize.md,
    color: colors.ink,
    backgroundColor: colors.surfaceTint,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
  },
  textArea: { height: 120, paddingTop: 12, paddingBottom: 12 },
  charCount: { fontSize: fontSize.xs, color: colors.muted },

  previewCard: {
    ...card,
    padding: space.lg,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  previewApp: { flex: 1, fontSize: fontSize.xs, fontWeight: '800', color: colors.textSecondary },
  previewTime: { fontSize: fontSize.xs, color: colors.muted },
  previewTitle: { fontSize: fontSize.md, fontWeight: '800', color: colors.ink, marginBottom: 4 },
  previewBody: { fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 20 },
  previewImagePlaceholder: {
    marginTop: 12,
    padding: 20,
    backgroundColor: colors.surfaceTint,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewImageText: {
    marginTop: 6,
    fontSize: fontSize.xs,
    color: colors.muted,
  },
  sendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: space.xl,
    height: 54,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  sendBtnDisabled: { opacity: 0.6 },
  sendBtnText: { fontSize: fontSize.md, fontWeight: '800', color: colors.white },

  templateList: { gap: space.md },
  templateCard: {
    ...card,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
  },
  templateIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  templateContent: {
    flex: 1,
    gap: 4,
  },
  templateTitle: {
    fontSize: fontSize.md,
    fontWeight: '800',
    color: colors.ink,
  },
  templateBody: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },

  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xl,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: pagePadding,
    marginTop: space.md,
    padding: space.md,
    backgroundColor: colors.dangerBg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.dangerLine,
  },
  errorBannerText: { flex: 1, fontSize: fontSize.xs, color: colors.danger, lineHeight: 17 },
  errorRetry: { minHeight: 40, paddingHorizontal: space.sm, justifyContent: 'center' },
  errorRetryText: { fontSize: fontSize.sm, fontWeight: '800', color: colors.primary },

  historyList: { paddingHorizontal: pagePadding, paddingTop: space.md, paddingBottom: space.xxl },
  historyCard: {
    ...card,
    padding: space.lg,
    marginBottom: space.md,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: space.sm,
  },
  historyTitle: {
    flex: 1,
    fontSize: fontSize.md,
    fontWeight: '800',
    color: colors.ink,
    marginRight: 10,
  },
  historyDate: {
    fontSize: fontSize.xs,
    color: colors.muted,
    marginTop: 3,
  },
  historyBody: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: space.md,
  },
  historyFooter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    rowGap: space.sm,
  },
  historyStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  historySuccessRate: {
    fontSize: fontSize.xs,
    color: colors.muted,
  },

  modalContainer: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: pagePadding,
    paddingTop: space.lg,
    paddingBottom: space.sm,
  },
  modalTitle: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: colors.ink,
  },
  modalClose: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalList: {
    paddingHorizontal: pagePadding,
    paddingBottom: space.xxl,
    gap: space.md,
  },
});
