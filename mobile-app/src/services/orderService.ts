import { API_URL } from '../constants/config';
import { getAuthToken } from './authService';
import { CartItem } from '../types/cart';

export interface OrderItem {
  id: number;
  product_details: {
    id: number;
    name: string;
    price: number;
    image: string | null;
  };
  quantity: number;
  price: number;
}

export interface Order {
  id: number;
  user: string;
  items: OrderItem[];
  total_price: number;
  status: string;
  shipping_address: string;
  /**
   * Map pin snapshotted at checkout — 6dp decimal strings, null when the
   * customer never dropped one. Optional so older cached shapes still parse.
   */
  shipping_latitude?: string | null;
  shipping_longitude?: string | null;
  /** Saved-address name the order was placed from; '' when unnamed. */
  shipping_label?: string;
  payment_method: string;
  created_at: string;
  // Delivery fields
  number_of_bottles?: number;
  delivery_status?: string;
  delivery_status_updated_at?: string | null;
  cash_received?: boolean;
  cash_amount?: number;
  delivery_notes?: string;
}

export interface DeliveryStatus {
  id: number;
  name: string;
  color: string;
  background_color: string;
  border_color: string;
  order: number;
}

export interface CreateOrderPayload {
  items: {
    product_id: number;
    quantity: number;
    price: number;
  }[];
  total_price: number;
  /**
   * The chosen address book entry. The server copies its text, parts, pin and
   * label onto the order, so a later edit or delete of the entry cannot change
   * where a past order went.
   *
   * Note there is no shipping_latitude/longitude here on purpose: the order
   * serializer's create() overwrites both from the saved address whenever
   * address_id is present, so a pin sent alongside it would be discarded.
   * Checkout PATCHes the address instead — see CheckoutScreen.
   */
  address_id?: number;
  /** Only needed when no address_id is sent; the API 400s if both are absent. */
  shipping_address?: string;
  payment_method: string;
  payment_number?: string | null;
}

export const createOrder = async (orderData: CreateOrderPayload) => {
  const token = await getAuthToken();
  try {
    const response = await fetch(`${API_URL}/orders/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(orderData),
    });

    if (!response.ok) {
      let detail = 'Failed to place order';
      try {
        const errorData = await response.json();
        detail = errorData.detail || JSON.stringify(errorData);
      } catch {
        detail = `Server error ${response.status}`;
      }
      throw new Error(detail);
    }

    return await response.json();
  } catch (error) {
    console.error('Create order error:', error);
    throw error;
  }
};

export const getOrders = async () => {
  const token = await getAuthToken();
  try {
    const response = await fetch(`${API_URL}/orders/`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch orders');
    }

    return await response.json();
  } catch (error) {
    console.error('Get orders error:', error);
    throw error;
  }
};

// Delivery Boy Functions
export const getDeliveryOrders = async () => {
  const token = await getAuthToken();
  try {
    const response = await fetch(`${API_URL}/orders/delivery/orders/`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch delivery orders');
    }

    const data = await response.json();
    // Backend returns {value: [...], Count: n}, extract the array
    return data.value || data;
  } catch (error) {
    console.error('Get delivery orders error:', error);
    throw error;
  }
};

/**
 * One order, straight from the server.
 *
 * The detail screen is opened with a snapshot captured when the rider tapped
 * the row, and a snapshot cannot know that the order has since been delivered,
 * cancelled by the office, or closed on another device. Everything that screen
 * locks depends on the CURRENT state, so it re-reads it here.
 */
export const getDeliveryOrder = async (orderId: number) => {
  const token = await getAuthToken();
  const response = await fetch(`${API_URL}/orders/delivery/orders/${orderId}/`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`Failed to fetch order ${orderId}`);
  return response.json();
};

export const updateOrderStatus = async (orderId: number, status: string, additionalData?: any) => {
  const token = await getAuthToken();
  try {
    const body = { 
      status, 
      ...additionalData
    };
    
    console.log('🔄 Updating order:', orderId);
    console.log('📦 Update payload:', JSON.stringify(body, null, 2));
    
    const response = await fetch(`${API_URL}/orders/delivery/orders/${orderId}/`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    console.log('📡 Response status:', response.status);
    
    if (!response.ok) {
      const errorData = await response.text();
      console.error('❌ Update failed:', errorData);
      // The server explains WHY it refused — "This delivery is complete and can
      // no longer be changed." Throwing a generic message instead made a
      // deliberate refusal look like a network fault, so the rider would stand
      // at the gate retrying something that will never succeed.
      let message = 'Failed to update order status';
      try {
        const parsed = JSON.parse(errorData);
        message = parsed?.error || parsed?.detail || message;
      } catch {
        // Not JSON — a proxy error page or an empty body. Keep the generic text.
      }
      throw new Error(message);
    }

    const result = await response.json();
    console.log('✅ Update successful:', JSON.stringify(result, null, 2));
    return result;
  } catch (error) {
    console.error('❌ Update order status error:', error);
    throw error;
  }
};

export const getDeliveryStats = async () => {
  const token = await getAuthToken();
  try {
    const response = await fetch(`${API_URL}/orders/delivery/stats/`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch delivery stats');
    }

    return await response.json();
  } catch (error) {
    console.error('Get delivery stats error:', error);
    throw error;
  }
};

export const updateAvailability = async (isAvailable: boolean) => {
  const token = await getAuthToken();
  try {
    const response = await fetch(`${API_URL}/orders/delivery/availability/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ is_available: isAvailable }),
    });

    if (!response.ok) {
      throw new Error('Failed to update availability');
    }

    return await response.json();
  } catch (error) {
    console.error('Update availability error:', error);
    throw error;
  }
};

export const getDeliveryStatuses = async (): Promise<DeliveryStatus[]> => {
  const token = await getAuthToken();
  try {
    const response = await fetch(`${API_URL}/orders/delivery/statuses/`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch delivery statuses');
    }

    const data = await response.json();
    // Backend might return {value: [...]} or just [...], handle both
    return Array.isArray(data) ? data : (data.value || []);
  } catch (error) {
    console.error('Get delivery statuses error:', error);
    throw error;
  }
};
