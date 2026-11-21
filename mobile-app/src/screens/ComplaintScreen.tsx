import { useKeyboardHeight } from '../hooks/useKeyboardHeight';
import { colors, radius, card, pagePadding } from '../theme';
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';
import { Complaint, ComplaintService } from '../services/complaintService';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLanguage } from '../context/LanguageContext';
import { LoadingScreen } from '../components/LoadingScreen';
import { MultiImagePicker } from '../components/MultiImagePicker';
import { KeyboardAwareScrollView, SheetScrollView } from '../components/KeyboardAwareScrollView';
import { PickedImage } from '../constants/imageLimits';
import { FieldError } from '../components/FormField';
import { ErrorState, EmptyState, StatusPill, Tone, friendlyError } from '../components/ui';

type Props = NativeStackScreenProps<RootStackParamList, 'Complaints'>;

/** A complaint's status as a pill colour and a readable word. */
const statusPill = (status: string): { tone: Tone; label: string } => {
  switch (status) {
    case 'PENDING': return { tone: 'warning', label: 'Pending' };
    case 'IN_PROGRESS': return { tone: 'primary', label: 'In progress' };
    case 'RESOLVED': return { tone: 'success', label: 'Resolved' };
    default: return { tone: 'neutral', label: status.replace('_', ' ') };
  }
};

export const ComplaintScreen: React.FC<Props> = ({ navigation }) => {
  const keyboardHeight = useKeyboardHeight();
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // Why the last load failed. Separate from the list so a failed refresh keeps
  // the complaints already on screen.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [images, setImages] = useState<PickedImage[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ subject?: string; description?: string }>({});
  const { t } = useLanguage();

  const fetchComplaints = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await ComplaintService.getComplaints();
      setComplaints(data);
      setLoadError(null);
    } catch (error: any) {
      console.error(error);
      setLoadError(error?.message || t('fetch_complaints_failed', 'Failed to fetch complaints'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchComplaints();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchComplaints(true);
  };

  const handleSubmit = async () => {
    // Marked on the field itself rather than in a dialog that covers the form
    // and leaves the person hunting for the empty box.
    const missing: { subject?: string; description?: string } = {};
    if (!subject.trim()) missing.subject = t('subject_required', 'Add a short subject');
    if (!description.trim()) missing.description = t('description_required', 'Describe what went wrong');
    setFieldErrors(missing);
    if (missing.subject || missing.description) return;

    setSubmitting(true);
    try {
      await ComplaintService.createComplaint(subject, description, images);
      setModalVisible(false);
      setSubject('');
      setDescription('');
      setImages([]);
      fetchComplaints(true);
      Alert.alert(t('success', 'Success'), t('complaint_success', 'Complaint submitted successfully'));
    } catch (error: any) {
      Alert.alert(
        t('error', 'Error'),
        `${t('complaint_failed', 'Failed to submit complaint')}: ${friendlyError(error?.message)}`,
      );
    } finally {
      setSubmitting(false);
    }
  };

  const renderItem = ({ item }: { item: Complaint }) => {
    const pill = statusPill(item.status);
    return (
      <View style={styles.card}>
        {/* Header row */}
        <View style={styles.cardHeader}>
          <Text style={styles.subject} numberOfLines={2}>{item.subject}</Text>
          <StatusPill label={pill.label} tone={pill.tone} />
        </View>

        <Text style={styles.date}>{new Date(item.created_at).toLocaleDateString()}</Text>

        {/* Customer description */}
        <View style={styles.messageBox}>
          <Text style={styles.messageLabel}>Your message</Text>
          <Text style={styles.description}>{item.description}</Text>
        </View>

        {/* Admin reply — shown only when present */}
        {item.admin_reply ? (
          <View style={styles.replyBox}>
            <View style={styles.replyHeader}>
              <Ionicons name="chatbubble-ellipses" size={16} color={colors.primary} />
              <Text style={styles.replyLabel}>Support reply</Text>
              {!!item.admin_reply_at && (
                <Text style={styles.replyDate}>
                  {new Date(item.admin_reply_at).toLocaleDateString()}
                </Text>
              )}
            </View>
            <Text style={styles.replyText}>{item.admin_reply}</Text>
          </View>
        ) : item.status !== 'RESOLVED' ? (
          <View style={styles.pendingRow}>
            <Ionicons name="time-outline" size={16} color={colors.muted} />
            <Text style={styles.pendingReply}>Waiting for support response…</Text>
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.roundButton}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={22} color={colors.ink} />
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>{t('my_complaints', 'My Complaints')}</Text>
        <TouchableOpacity
          onPress={() => setModalVisible(true)}
          style={[styles.roundButton, styles.addButton]}
          accessibilityRole="button"
          accessibilityLabel={t('new_complaint', 'New Complaint')}
        >
          <Ionicons name="add" size={24} color={colors.white} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <LoadingScreen message="Loading complaints…" />
      ) : (
        <FlatList
          data={complaints}
          renderItem={renderItem}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
          ListHeaderComponent={
            // A failed refresh keeps the complaints below and says why they may be old.
            !!loadError && complaints.length > 0 ? (
              <View style={styles.errorBanner}>
                <Ionicons name="cloud-offline-outline" size={18} color={colors.danger} />
                <View style={styles.errorBannerBody}>
                  <Text style={styles.errorBannerText}>{friendlyError(loadError)}</Text>
                  <TouchableOpacity onPress={onRefresh} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={styles.errorBannerLink}>Try again</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null
          }
          ListEmptyComponent={
            loadError ? (
              <ErrorState
                title="Could not load your complaints"
                message={loadError}
                onRetry={() => fetchComplaints()}
              />
            ) : (
              <EmptyState
                icon="chatbubbles-outline"
                title={t('no_complaints', 'No complaints yet')}
                text="Tap + to submit a new complaint"
              />
            )
          }
        />
      )}

      {/* New Complaint Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={[styles.modalOverlay, { paddingBottom: keyboardHeight }]}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t('new_complaint', 'New Complaint')}</Text>

            {/* The fields scroll, the title and the buttons do not: with the
                keypad up the card has little room left, and Submit staying put
                is worth more than seeing one extra line of the form. */}
            <SheetScrollView
              style={styles.modalScroll}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <TextInput
                style={[styles.input, !!fieldErrors.subject && styles.inputInvalid]}
                placeholder={t('subject_placeholder', 'Subject')}
                placeholderTextColor={colors.muted}
                value={subject}
                onChangeText={(v) => {
                  setSubject(v);
                  if (fieldErrors.subject) setFieldErrors((e) => ({ ...e, subject: undefined }));
                }}
              />
              <FieldError message={fieldErrors.subject} />

              <TextInput
                style={[styles.input, styles.textArea, !!fieldErrors.description && styles.inputInvalid]}
                placeholder={t('description_placeholder', 'Describe your issue in detail…')}
                placeholderTextColor={colors.muted}
                value={description}
                onChangeText={(v) => {
                  setDescription(v);
                  if (fieldErrors.description) setFieldErrors((e) => ({ ...e, description: undefined }));
                }}
                multiline
                numberOfLines={4}
              />
              <FieldError message={fieldErrors.description} />

              <MultiImagePicker
                label={t('attach_photos', 'Attach photos (optional)')}
                value={images}
                onChange={setImages}
              />
            </SheetScrollView>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.button, styles.cancelButton]}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.buttonText}>{t('cancel_btn', 'Cancel')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.button, styles.submitButton, submitting && styles.buttonBusy]}
                onPress={handleSubmit}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Text style={[styles.buttonText, { color: colors.white }]}>{t('submit_btn', 'Submit')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  // Sits straight on the page: round back and add buttons around the title,
  // not a white band with a line under it.
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: pagePadding,
    paddingVertical: 12,
  },
  roundButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  addButton: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  title: {
    flex: 1,
    fontSize: 20,
    fontWeight: '800',
    color: colors.ink,
  },
  list: {
    paddingHorizontal: pagePadding,
    paddingTop: 4,
    paddingBottom: 24,
    flexGrow: 1,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 12,
    marginBottom: 12,
    borderRadius: radius.md,
    backgroundColor: colors.dangerBg,
    borderWidth: 1,
    borderColor: colors.dangerLine,
  },
  errorBannerBody: { flex: 1, gap: 4 },
  errorBannerText: { fontSize: 14, color: colors.danger, lineHeight: 20 },
  errorBannerLink: { fontSize: 14, fontWeight: '800', color: colors.primaryDark },

  card: {
    ...card,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 4,
  },
  subject: {
    fontSize: 16,
    fontWeight: '800',
    flex: 1,
    color: colors.ink,
  },
  date: {
    fontSize: 12,
    color: colors.muted,
    marginBottom: 12,
  },
  messageBox: {
    backgroundColor: colors.surfaceTint,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    marginBottom: 10,
  },
  messageLabel: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  description: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  replyBox: {
    backgroundColor: colors.primaryTint,
    borderRadius: radius.md,
    padding: 12,
  },
  replyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 6,
  },
  replyLabel: {
    fontSize: 12,
    color: colors.primaryDark,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    flex: 1,
  },
  replyDate: {
    fontSize: 12,
    color: colors.muted,
  },
  replyText: {
    fontSize: 14,
    color: colors.ink,
    lineHeight: 20,
  },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  pendingReply: {
    fontSize: 14,
    color: colors.muted,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(10,31,68,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    ...card,
    borderRadius: radius.xl,
    padding: 20,
    // A definite height is what lets the field area shrink and scroll instead
    // of the card growing until the buttons are pushed off screen.
    maxHeight: '85%',
  },
  modalScroll: {
    flexShrink: 1,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.ink,
    marginBottom: 16,
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    fontSize: 16,
    // Without an explicit colour the device theme picks one, and on a
    // dark-mode phone that is white — invisible on this white modal.
    color: colors.ink,
    backgroundColor: colors.surfaceTint,
  },
  inputInvalid: {
    borderColor: colors.danger,
    backgroundColor: colors.dangerBg,
  },
  textArea: {
    height: 120,
    textAlignVertical: 'top',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  button: {
    flex: 1,
    height: 50,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.muted,
  },
  submitButton: {
    backgroundColor: colors.primary,
  },
  buttonBusy: {
    opacity: 0.7,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.ink,
  },
});
