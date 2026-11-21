import { API_URL } from '../constants/config';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PickedImage, appendImages } from '../constants/imageLimits';

export interface ComplaintImage {
  id: number;
  image: string;
}

export interface Complaint {
  id: number;
  subject: string;
  description: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'RESOLVED';
  admin_reply: string | null;
  admin_reply_at: string | null;
  created_at: string;
  images?: ComplaintImage[];
}

export const ComplaintService = {
  getComplaints: async (): Promise<Complaint[]> => {
    try {
      const token = await AsyncStorage.getItem('auth_token');
      const response = await fetch(`${API_URL}/support/complaints/`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch complaints (error ${response.status})`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching complaints:', error);
      throw error;
    }
  },

  createComplaint: async (
    subject: string,
    description: string,
    images: PickedImage[] = [],
  ): Promise<Complaint> => {
    try {
      const token = await AsyncStorage.getItem('auth_token');
      // Send multipart so we can attach images. Do NOT set Content-Type
      // manually — React Native sets the multipart boundary for FormData.
      const fd = new FormData();
      fd.append('subject', subject);
      fd.append('description', description);
      if (images.length) appendImages(fd, images);

      const response = await fetch(`${API_URL}/support/complaints/`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: fd,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to create complaint');
      }
      return await response.json();
    } catch (error) {
      console.error('Error creating complaint:', error);
      throw error;
    }
  },
};
