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
import { KeyboardAwareScrollView } from '../components/KeyboardAwareScrollView';
import { PickedImage } from '../constants/imageLimits';
import { FieldError } from '../components/FormField';

type Props = NativeStackScreenProps<RootStackParamList, 'Complaints'>;

export const ComplaintScreen: React.FC<Props> = ({ navigation }) => {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
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
    } catch (error) {
      console.error(error);
      Alert.alert(t('error', 'Error'), t('fetch_complaints_failed', 'Failed to fetch complaints'));
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
    } catch (error) {
      Alert.alert(t('error', 'Error'), t('complaint_failed', 'Failed to submit complaint'));
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PENDING': return '#f39c12';
      case 'IN_PROGRESS': return '#3498db';
      case 'RESOLVED': return '#2ecc71';
      default: return '#95a5a6';
    }
  };

  const renderItem = ({ item }: { item: Complaint }) => (
    <View style={styles.card}>
      {/* Header row */}
      <View style={styles.cardHeader}>
        <Text style={styles.subject} numberOfLines={2}>{item.subject}</Text>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
          <Text style={styles.statusText}>{item.status.replace('_', ' ')}</Text>
        </View>
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
            <Ionicons name="chatbubble-ellipses" size={14} color="#007AFF" />
            <Text style={styles.replyLabel}>Support reply</Text>
            {item.admin_reply_at && (
              <Text style={styles.replyDate}>
                {new Date(item.admin_reply_at).toLocaleDateString()}
              </Text>
            )}
          </View>
          <Text style={styles.replyText}>{item.admin_reply}</Text>
        </View>
      ) : item.status !== 'RESOLVED' ? (
        <Text style={styles.pendingReply}>Waiting for support response…</Text>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.title}>{t('my_complaints', 'My Complaints')}</Text>
        <TouchableOpacity onPress={() => setModalVisible(true)} style={styles.addButton}>
          <Ionicons name="add" size={24} color="#007AFF" />
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
              colors={['#007AFF']}
              tintColor="#007AFF"
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="chatbubbles-outline" size={48} color="#ccc" />
              <Text style={styles.emptyText}>{t('no_complaints', 'No complaints yet')}</Text>
              <Text style={styles.emptySubtext}>Tap + to submit a new complaint</Text>
            </View>
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
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t('new_complaint', 'New Complaint')}</Text>

            {/* The fields scroll, the title and the buttons do not: with the
                keypad up the card has little room left, and Submit staying put
                is worth more than seeing one extra line of the form. */}
            <KeyboardAwareScrollView
              style={styles.modalScroll}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <TextInput
                style={[styles.input, !!fieldErrors.subject && styles.inputInvalid]}
                placeholder={t('subject_placeholder', 'Subject')}
                placeholderTextColor="#000"
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
                placeholderTextColor="#000"
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
            </KeyboardAwareScrollView>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.button, styles.cancelButton]}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.buttonText}>{t('cancel_btn', 'Cancel')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.button, styles.submitButton]}
                onPress={handleSubmit}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={[styles.buttonText, { color: '#fff' }]}>{t('submit_btn', 'Submit')}</Text>
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
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  backButton: {
    padding: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  addButton: {
    padding: 4,
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
  },
  list: {
    padding: 16,
    paddingBottom: 32,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  subject: {
    fontSize: 16,
    fontWeight: 'bold',
    flex: 1,
    marginRight: 8,
    color: '#222',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  date: {
    fontSize: 12,
    color: '#999',
    marginBottom: 12,
  },
  messageBox: {
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#ddd',
  },
  messageLabel: {
    fontSize: 11,
    color: '#999',
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  description: {
    fontSize: 14,
    color: '#444',
    lineHeight: 20,
  },
  replyBox: {
    backgroundColor: '#EBF4FF',
    borderRadius: 8,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#007AFF',
  },
  replyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 4,
  },
  replyLabel: {
    fontSize: 11,
    color: '#007AFF',
    fontWeight: '700',
    textTransform: 'uppercase',
    flex: 1,
    marginLeft: 4,
  },
  replyDate: {
    fontSize: 11,
    color: '#888',
  },
  replyText: {
    fontSize: 14,
    color: '#1a1a2e',
    lineHeight: 20,
  },
  pendingReply: {
    fontSize: 12,
    color: '#aaa',
    fontStyle: 'italic',
    marginTop: 4,
  },
  emptyContainer: {
    alignItems: 'center',
    marginTop: 60,
    gap: 8,
  },
  emptyText: {
    color: '#555',
    fontSize: 17,
    fontWeight: '600',
    marginTop: 8,
  },
  emptySubtext: {
    color: '#aaa',
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    elevation: 5,
    // A definite height is what lets the field area shrink and scroll instead
    // of the card growing until the buttons are pushed off screen.
    maxHeight: '85%',
  },
  modalScroll: {
    flexShrink: 1,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    fontSize: 16,
    // Without an explicit colour the device theme picks one, and on a
    // dark-mode phone that is white — invisible on this white modal.
    color: '#000',
    backgroundColor: '#fff',
  },
  inputInvalid: {
    borderColor: '#D93025',
    backgroundColor: '#FFF7F7',
  },
  textArea: {
    height: 110,
    textAlignVertical: 'top',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  button: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 6,
  },
  cancelButton: {
    backgroundColor: '#eee',
  },
  submitButton: {
    backgroundColor: '#007AFF',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
});
