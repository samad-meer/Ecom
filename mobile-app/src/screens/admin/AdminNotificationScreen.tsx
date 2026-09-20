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
  KeyboardAvoidingView,
  Platform,
  Modal,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '../../constants/config';
import { getAuthToken } from '../../services/authService';

type RecipientType = 'all' | 'customers' | 'riders';
type TabType = 'compose' | 'history' | 'templates';

interface Recipient {
  key: RecipientType;
  label: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
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

const RECIPIENTS: Recipient[] = [
  {
    key: 'all',
    label: 'Everyone',
    description: 'All customers and delivery staff',
    icon: 'people',
    color: '#007AFF',
  },
  {
    key: 'customers',
    label: 'Customers Only',
    description: 'All registered customers',
    icon: 'person',
    color: '#34C759',
  },
  {
    key: 'riders',
    label: 'Delivery Boys Only',
    description: 'All delivery staff members',
    icon: 'bicycle',
    color: '#FF9500',
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
        throw new Error(
          res.status === 401 || res.status === 403
            ? 'You do not have permission to view history.'
            : `Could not load history (${res.status}).`,
        );
      }
      setHistory(await res.json());
    } catch (e: any) {
      console.error('Error loading history:', e);
      setHistoryError(e?.message || 'Could not load history.');
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
              const data = await res.json();
              if (!res.ok) throw new Error(JSON.stringify(data));

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
              Alert.alert('Error', 'Failed to send notification. Check your connection.');
            } finally {
              setSending(false);
            }
          },
        },
      ],
    );
  };

  return (
    <View style={{ flex: 1 }}>
      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'compose' && styles.tabActive]}
          onPress={() => setActiveTab('compose')}
        >
          <Ionicons
            name="create-outline"
            size={20}
            color={activeTab === 'compose' ? '#007AFF' : '#999'}
          />
          <Text style={[styles.tabText, activeTab === 'compose' && styles.tabTextActive]}>
            Compose
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'templates' && styles.tabActive]}
          onPress={() => setActiveTab('templates')}
        >
          <Ionicons
            name="documents-outline"
            size={20}
            color={activeTab === 'templates' ? '#007AFF' : '#999'}
          />
          <Text style={[styles.tabText, activeTab === 'templates' && styles.tabTextActive]}>
            Templates
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'history' && styles.tabActive]}
          onPress={() => setActiveTab('history')}
        >
          <Ionicons
            name="time-outline"
            size={20}
            color={activeTab === 'history' ? '#007AFF' : '#999'}
          />
          <Text style={[styles.tabText, activeTab === 'history' && styles.tabTextActive]}>
            History
          </Text>
        </TouchableOpacity>
      </View>

      {/* Compose Tab */}
      {activeTab === 'compose' && (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            style={styles.container}
            contentContainerStyle={{ paddingBottom: 40 }}
            keyboardShouldPersistTaps="handled"
          >
            {/* Quick Actions */}
            <View style={styles.quickActions}>
              <TouchableOpacity
                style={[styles.quickActionBtn, testMode && styles.quickActionBtnActive]}
                onPress={() => setTestMode(!testMode)}
              >
                <Ionicons name="flask" size={18} color={testMode ? '#007AFF' : '#666'} />
                <Text style={[styles.quickActionText, testMode && styles.quickActionTextActive]}>
                  Test Mode
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.quickActionBtn}
                onPress={() => setShowTemplates(true)}
              >
                <Ionicons name="copy" size={18} color="#666" />
                <Text style={styles.quickActionText}>Use Template</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.quickActionBtn} onPress={saveDraft}>
                <Ionicons name="save" size={18} color="#666" />
                <Text style={styles.quickActionText}>Save Draft</Text>
              </TouchableOpacity>
            </View>

            {/* Recipients */}
            {!testMode && (
              <>
                <Text style={styles.sectionLabel}>SEND TO</Text>
                <View style={styles.card}>
                  {RECIPIENTS.map((r, idx) => (
                    <TouchableOpacity
                      key={r.key}
                      style={[
                        styles.recipientRow,
                        idx < RECIPIENTS.length - 1 && styles.rowDivider,
                        recipient === r.key && styles.recipientRowActive,
                      ]}
                      onPress={() => setRecipient(r.key)}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.recipientIcon, { backgroundColor: r.color + '18' }]}>
                        <Ionicons name={r.icon} size={20} color={r.color} />
                      </View>
                      <View style={styles.recipientText}>
                        <Text style={styles.recipientLabel}>{r.label}</Text>
                        <Text style={styles.recipientDesc}>{r.description}</Text>
                      </View>
                      <View style={[styles.radio, recipient === r.key && { borderColor: r.color }]}>
                        {recipient === r.key && (
                          <View style={[styles.radioDot, { backgroundColor: r.color }]} />
                        )}
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {testMode && (
              <View style={styles.testModeCard}>
                <Ionicons name="information-circle" size={20} color="#007AFF" />
                <Text style={styles.testModeText}>
                  Test mode: Notification will only be sent to your device
                </Text>
              </View>
            )}

            {/* Message composer */}
            <Text style={styles.sectionLabel}>MESSAGE</Text>
            <View style={styles.card}>
              <View style={styles.inputRow}>
                <Text style={styles.inputLabel}>Title</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. New offer available!"
                  placeholderTextColor="#000"
                  value={title}
                  onChangeText={setTitle}
                  maxLength={80}
                  returnKeyType="next"
                />
                <Text style={styles.charCount}>{title.length}/80</Text>
              </View>
              <View style={styles.inputDivider} />
              <View style={styles.inputRow}>
                <Text style={styles.inputLabel}>Message</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="Enter notification message…"
                  placeholderTextColor="#000"
                  value={body}
                  onChangeText={setBody}
                  multiline
                  maxLength={300}
                  textAlignVertical="top"
                />
                <Text style={styles.charCount}>{body.length}/300</Text>
              </View>
              <View style={styles.inputDivider} />
              <View style={styles.inputRow}>
                <Text style={styles.inputLabel}>Image URL (Optional)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="https://example.com/image.png"
                  placeholderTextColor="#000"
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
                <Text style={styles.sectionLabel}>PREVIEW</Text>
                <View style={styles.previewCard}>
                  <View style={styles.previewHeader}>
                    <Ionicons name="notifications" size={16} color="#007AFF" />
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
                      <Ionicons name="image" size={24} color="#999" />
                      <Text style={styles.previewImageText}>Image will be displayed here</Text>
                    </View>
                  ) : null}
                </View>
              </>
            ) : null}

            {/* Send button */}
            <TouchableOpacity
              style={[
                styles.sendBtn,
                { backgroundColor: testMode ? '#FF9500' : selectedRecipient.color },
                sending && styles.sendBtnDisabled,
              ]}
              onPress={handleSend}
              disabled={sending}
              activeOpacity={0.85}
            >
              {sending ? (
                <ActivityIndicator color="white" />
              ) : (
                <>
                  <Ionicons name="send" size={18} color="white" />
                  <Text style={styles.sendBtnText}>
                    {testMode ? 'Send Test' : `Send to ${selectedRecipient.label}`}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      {/* Templates Tab */}
      {activeTab === 'templates' && (
        <ScrollView style={styles.container}>
          <Text style={styles.sectionLabel}>SELECT A TEMPLATE</Text>
          <View style={styles.templateList}>
            {TEMPLATES.map((template) => (
              <TouchableOpacity
                key={template.id}
                style={styles.templateCard}
                onPress={() => applyTemplate(template)}
                activeOpacity={0.7}
              >
                <View style={styles.templateIcon}>
                  <Ionicons name={template.icon} size={24} color="#007AFF" />
                </View>
                <View style={styles.templateContent}>
                  <Text style={styles.templateCategory}>{template.category}</Text>
                  <Text style={styles.templateTitle}>{template.title}</Text>
                  <Text style={styles.templateBody} numberOfLines={2}>
                    {template.body}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#ccc" />
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <View style={{ flex: 1 }}>
          {loadingHistory ? (
            <View style={styles.centerContainer}>
              <ActivityIndicator size="large" color="#007AFF" />
            </View>
          ) : historyError ? (
            <View style={styles.centerContainer}>
              <Ionicons name="alert-circle-outline" size={56} color="#FF3B30" />
              <Text style={[styles.emptyText, { color: '#FF3B30' }]}>{historyError}</Text>
              <TouchableOpacity onPress={loadHistory}>
                <Text style={{ color: '#007AFF', fontWeight: '700', marginTop: 8 }}>
                  Try again
                </Text>
              </TouchableOpacity>
            </View>
          ) : history.length === 0 ? (
            <View style={styles.centerContainer}>
              <Ionicons name="time-outline" size={64} color="#ddd" />
              <Text style={styles.emptyText}>No notifications sent yet</Text>
              <Text style={styles.emptySubtext}>Your notification history will appear here</Text>
            </View>
          ) : (
            <FlatList
              data={history}
              keyExtractor={(item) => item.id.toString()}
              contentContainerStyle={{ padding: 16 }}
              renderItem={({ item }) => (
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
                    <View style={styles.historyBadge}>
                      <Ionicons name="people" size={12} color="#666" />
                      <Text style={styles.historyBadgeText}>
                        {item.recipient_type === 'all'
                          ? 'Everyone'
                          : item.recipient_type === 'customers'
                          ? 'Customers'
                          : 'Riders'}
                      </Text>
                    </View>
                    <View style={styles.historyStats}>
                      <Text style={styles.historyStatsText}>
                        {item.sent_count} of {item.total_devices} sent
                      </Text>
                      <Text style={styles.historySuccessRate}>
                        {item.total_devices > 0
                          ? `(${Math.round((item.sent_count / item.total_devices) * 100)}%)`
                          : '(0%)'}
                      </Text>
                    </View>
                  </View>
                </View>
              )}
            />
          )}
        </View>
      )}

      {/* Template Modal */}
      <Modal visible={showTemplates} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Choose Template</Text>
            <TouchableOpacity onPress={() => setShowTemplates(false)}>
              <Ionicons name="close" size={28} color="#666" />
            </TouchableOpacity>
          </View>
          <ScrollView>
            {TEMPLATES.map((template) => (
              <TouchableOpacity
                key={template.id}
                style={styles.modalTemplateCard}
                onPress={() => applyTemplate(template)}
              >
                <View style={styles.modalTemplateIcon}>
                  <Ionicons name={template.icon} size={24} color="#007AFF" />
                </View>
                <View style={styles.modalTemplateContent}>
                  <Text style={styles.modalTemplateCategory}>{template.category}</Text>
                  <Text style={styles.modalTemplateTitle}>{template.title}</Text>
                  <Text style={styles.modalTemplateBody}>{template.body}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  tabs: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: '#007AFF',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#999',
  },
  tabTextActive: {
    color: '#007AFF',
  },
  quickActions: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  quickActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'white',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e5e5',
  },
  quickActionBtnActive: {
    backgroundColor: '#e8f4ff',
    borderColor: '#007AFF',
  },
  quickActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  quickActionTextActive: {
    color: '#007AFF',
  },
  testModeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 16,
    padding: 14,
    backgroundColor: '#e8f4ff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  testModeText: {
    flex: 1,
    fontSize: 13,
    color: '#007AFF',
    fontWeight: '500',
  },
  scheduleCard: {
    marginHorizontal: 16,
    marginTop: 16,
    padding: 14,
    backgroundColor: 'white',
    borderRadius: 12,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  scheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  scheduleLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    padding: 12,
    backgroundColor: '#f8f9ff',
    borderRadius: 8,
  },
  dateButtonText: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '500',
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#999',
    letterSpacing: 0.8,
    marginTop: 24,
    marginBottom: 8,
    marginHorizontal: 16,
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 14,
    marginHorizontal: 16,
    overflow: 'hidden',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  recipientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  recipientRowActive: {
    backgroundColor: '#f8f9ff',
  },
  rowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  recipientIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recipientText: { flex: 1 },
  recipientLabel: { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
  recipientDesc: { fontSize: 12, color: '#888', marginTop: 1 },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#ddd',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  inputRow: { padding: 14 },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#999',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  input: { fontSize: 15, color: '#000', minHeight: 24 },
  textArea: { minHeight: 80 },
  charCount: { fontSize: 11, color: '#ccc', textAlign: 'right', marginTop: 4 },
  inputDivider: { height: 1, backgroundColor: '#f5f5f5', marginHorizontal: 14 },
  previewCard: {
    backgroundColor: 'white',
    borderRadius: 14,
    marginHorizontal: 16,
    padding: 14,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  previewApp: { flex: 1, fontSize: 12, fontWeight: '700', color: '#555' },
  previewTime: { fontSize: 11, color: '#bbb' },
  previewTitle: { fontSize: 14, fontWeight: '700', color: '#1a1a1a', marginBottom: 3 },
  previewBody: { fontSize: 13, color: '#555', lineHeight: 18 },
  previewImagePlaceholder: {
    marginTop: 10,
    padding: 20,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewImageText: {
    marginTop: 6,
    fontSize: 11,
    color: '#999',
  },
  sendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 24,
    paddingVertical: 16,
    borderRadius: 14,
  },
  sendBtnDisabled: { opacity: 0.6 },
  sendBtnText: { fontSize: 16, fontWeight: '700', color: 'white' },
  templateList: {
    padding: 16,
    gap: 12,
  },
  templateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    backgroundColor: 'white',
    borderRadius: 12,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  templateIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#e8f4ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  templateContent: {
    flex: 1,
  },
  templateCategory: {
    fontSize: 10,
    fontWeight: '700',
    color: '#007AFF',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  templateTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  templateBody: {
    fontSize: 12,
    color: '#666',
    lineHeight: 16,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 6,
    textAlign: 'center',
  },
  historyCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  historyTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#1a1a1a',
    marginRight: 10,
  },
  historyDate: {
    fontSize: 11,
    color: '#999',
  },
  historyBody: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
    marginBottom: 10,
  },
  historyFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  historyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#f5f5f5',
    borderRadius: 6,
  },
  historyBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#666',
  },
  historyStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  historyStatsText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#34C759',
  },
  historySuccessRate: {
    fontSize: 11,
    color: '#999',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  modalTemplateCard: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: 'white',
    borderRadius: 12,
  },
  modalTemplateIcon: {
    width: 52,
    height: 52,
    borderRadius: 12,
    backgroundColor: '#e8f4ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTemplateContent: {
    flex: 1,
  },
  modalTemplateCategory: {
    fontSize: 10,
    fontWeight: '700',
    color: '#007AFF',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  modalTemplateTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 6,
  },
  modalTemplateBody: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
});
