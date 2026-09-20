import { API_URL } from '../constants/config';
import { getAuthToken } from './authService';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AdminOrderItem {
  id: number;
  product_details: { id: number; name: string; price: number; image: string | null };
  quantity: number;
  price: number;
}

export interface AdminOrder {
  id: number;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  customer_balance: number | null;
  guest_name: string | null;
  guest_phone: string | null;
  items: AdminOrderItem[];
  total_price: number;
  status: string;
  shipping_address: string;
  /** Snapshot of the map pin taken when the order was placed; 6dp strings. */
  shipping_latitude: string | null;
  shipping_longitude: string | null;
  /** Which saved address it came from ("Home", "Shop", …); '' when unnamed. */
  shipping_label: string;
  payment_method: string;
  payment_number: string | null;
  is_paid: boolean;
  is_hidden: boolean;
  created_at: string;
  assigned_delivery_boy: number | null;
  assigned_delivery_boy_name: string | null;
  delivery_notes: string | null;
  number_of_bottles: number;
  delivery_status: string;
  cash_received: boolean;
  cash_amount: number;
}

export interface AdminSummary {
  total: number;
  pending: number;
  processing: number;
  shipped: number;
  delivered: number;
  cancelled: number;
  paid_count: number;
  unpaid_count: number;
  /** Revenue over the requested period; all-time when no range is sent. */
  revenue: number;
  /** Always literally today, whatever period is selected. */
  today_orders: number;
  today_revenue: number;
}

export interface DeliveryBoy {
  id: number;
  name: string;
  is_available: boolean;
}

export interface AdminCustomer {
  id: number;
  username: string;
  name: string;
  /** Composed line, built server-side from the parts below. Send the parts and
   *  let the server recompose it rather than writing this directly. */
  address: string | null;
  house_number?: string | null;
  /** Canonical portion key (`ground`, `first_floor`, …) or null. */
  portion?: string | null;
  block?: string | null;
  area?: string | null;
  phone: string | null;
  price: number;
}

export interface CustomerStats {
  total_orders: number;
  delivered_count: number;
  total_bottles: number;
  last_order_date: string | null;
  account_balance: number | null;
}

export interface AdminStaff {
  id: number;          // UserProfile pk
  user_id: number;     // User pk
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  is_active: boolean;
  last_login: string | null;
  date_joined: string;
  created_by_name: string | null;
  phone_number: string | null;
  address: string | null;
  is_rider: boolean;
  is_available: boolean;
  vehicle_type: string | null;
  vehicle_number: string | null;
  working_status: string;
  department: string | null;
  designation: string | null;
  employee_id: string | null;
  profile_picture_url: string | null;
}

export interface PlantSettings {
  standard_unit_price: number;
}

export interface PricedType {
  id: number;
  name: string;
  default_price: string | null;
  is_active: boolean;
}

export interface PlantRecord {
  id: number;
  date: string;
  house: string;
  bottles: number;
  unit_price: string;
  amount: string;
  paid_amount: string;
  pending: string;
  paid: boolean;
  payment_status: string;
  notes: string;
  customer: number | null;
  customer_name: string | null;
  customer_type: number | null;
  customer_type_name: string | null;
  bottle_type: number | null;
  bottle_type_name: string | null;
}

export interface PlantSummary {
  records: number;
  bottles: number;
  amount: string;
  paid_amount: string;
  pending: string;
  houses: number;
}

export interface PlantAnalytics {
  totals: PlantSummary;
  daily: { date: string; bottles: number; amount: string; paid_amount: string; records: number }[];
  top_houses: { house: string; bottles: number; amount: string }[];
}

export interface PlantRecordInput {
  date: string;
  house: string;
  bottles: number;
  unit_price?: number;
  paid_amount?: number;
  notes?: string;
  customer?: number | null;
  customer_type?: number | null;
  bottle_type?: number | null;
}

export interface AdminProduct {
  id: number;
  name: string;
  description: string;
  price: string;
  is_active: boolean;
  image: string | null;
  images?: { id: number; image: string }[];
  category: number | null;
  category_name: string | null;
}

export interface AdminCategory {
  id: number;
  name: string;
  slug?: string;
  /** Expo Vector Icons name (optional). */
  icon?: string;
  /** Hidden categories stay on their existing products but are offered nowhere. */
  is_active: boolean;
}

// ─── Helper ───────────────────────────────────────────────────────────────────

/** Turn an error response into a human-readable message, unwrapping DRF's
 *  `{ field: ["message", …] }` / `{ detail: "…" }` shapes when present. */
async function errorMessage(res: Response, fallback: string): Promise<string> {
  let text = '';
  try { text = await res.text(); } catch { /* body already consumed / empty */ }
  if (!text) return fallback;
  try {
    const data = JSON.parse(text);
    if (typeof data === 'string') return data;
    if (data.detail) return data.detail;
    const first = Object.values(data)[0];
    if (Array.isArray(first)) return String(first[0]);
    if (typeof first === 'string') return first;
  } catch {
    // Response body wasn't JSON — fall through to the raw text.
  }
  return text;
}

async function adminFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getAuthToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    throw new Error(await errorMessage(res, `Request failed: ${res.status}`));
  }
  if (res.status === 204) return undefined as unknown as T;
  return res.json();
}

// ─── API ──────────────────────────────────────────────────────────────────────

/** A bank account or wallet a customer can transfer to. */
export interface PaymentAccount {
  id: number;
  bank_name: string;
  account_title: string;
  account_number: string;
  iban: string;
  /** Absolute URL, or null when no QR has been uploaded. */
  qr: string | null;
  instructions: string;
  is_active: boolean;
  sort_order: number;
}

export const adminService = {
  /**
   * Headline stats. Passing a range scopes every figure to it; passing nothing
   * keeps the all-time totals the dashboard showed before the period filter.
   */
  getSummary(params: { date_from?: string; date_to?: string } = {}): Promise<AdminSummary> {
    const sp = new URLSearchParams();
    if (params.date_from) sp.set('date_from', params.date_from);
    if (params.date_to) sp.set('date_to', params.date_to);
    const qs = sp.toString();
    return adminFetch(`/orders/admin/summary/${qs ? `?${qs}` : ''}`);
  },

  getOrders(params: {
    status?: string;
    search?: string;
    is_paid?: boolean;
    show_hidden?: boolean;
    date_from?: string;
    date_to?: string;
  } = {}): Promise<AdminOrder[]> {
    const sp = new URLSearchParams();
    if (params.status) sp.set('status', params.status);
    if (params.search) sp.set('search', params.search);
    if (params.is_paid !== undefined) sp.set('is_paid', String(params.is_paid));
    if (params.show_hidden) sp.set('show_hidden', 'true');
    if (params.date_from) sp.set('date_from', params.date_from);
    if (params.date_to) sp.set('date_to', params.date_to);
    const qs = sp.toString();
    return adminFetch(`/orders/admin/${qs ? `?${qs}` : ''}`);
  },

  createOrder(payload: {
    user_id?: number | null;
    guest_name?: string;
    guest_phone?: string;
    /** Composed line; the backend rebuilds it from the parts when they are sent. */
    shipping_address?: string;
    house_number?: string;
    portion?: string;
    block?: string;
    area?: string;
    payment_method: string;
    payment_number?: string;
    assigned_delivery_boy?: number | null;
    delivery_notes?: string;
    status?: string;
    items: { product_id: number; quantity: number }[];
  }): Promise<AdminOrder> {
    return adminFetch('/orders/admin/', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  updateOrder(id: number, data: Partial<{
    status: string;
    is_paid: boolean;
    is_hidden: boolean;
    assigned_delivery_boy: number | null;
    delivery_notes: string;
    cash_amount: number;
    cash_received: boolean;
    delivery_status: string;
  }>): Promise<AdminOrder> {
    return adminFetch(`/orders/admin/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  getDeliveryBoys(): Promise<DeliveryBoy[]> {
    return adminFetch('/orders/admin/delivery-boys/');
  },

  getCustomers(): Promise<AdminCustomer[]> {
    return adminFetch('/plant/customers/');
  },

  getCustomerStats(userId: number): Promise<CustomerStats> {
    return adminFetch(`/orders/admin/customer-stats/${userId}/`);
  },

  getStaff(): Promise<AdminStaff[]> {
    return adminFetch('/auth/admin/staff/');
  },

  // Send the structured parts, not `address` — the server recomposes the line
  // from them. Sending both makes the explicit `address` win and the parts
  // silently disagree with it.
  updateCustomer(userId: number, data: {
    first_name?: string;
    last_name?: string;
    phone_number?: string;
    address?: string;
    house_number?: string;
    portion?: string;
    block?: string;
    area?: string;
  }): Promise<{ id: number; username: string; name: string; first_name: string; last_name: string; phone: string | null; address: string | null }> {
    return adminFetch(`/auth/admin/customers/${userId}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  /**
   * Create an internal customer. `password` is optional: omitting it stores an
   * unusable password, so the record exists for orders and the ledger but
   * cannot be signed into until an admin sets one.
   */
  createCustomer(payload: {
    username: string;
    password?: string;
    first_name?: string;
    last_name?: string;
    email?: string;
    phone_number?: string;
    house_number?: string;
    portion?: string;
    block?: string;
    area?: string;
    address?: string;
  }): Promise<{
    id: number; username: string; name: string;
    phone: string | null; address: string | null; can_sign_in: boolean;
  }> {
    return adminFetch('/auth/admin/customers/create/', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  // ─── Staff ────────────────────────────────────────────────────────────────

  createStaff(payload: {
    username: string;
    password: string;
    first_name?: string;
    last_name?: string;
    phone_number?: string;
    is_rider: boolean;
    vehicle_type?: string;
    vehicle_number?: string;
    working_status?: string;
    department?: string;
    designation?: string;
  }): Promise<AdminStaff> {
    return adminFetch('/auth/admin/staff/', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  updateStaff(id: number, data: Partial<{
    first_name: string;
    last_name: string;
    phone_number: string;
    department: string;
    designation: string;
    working_status: string;
    is_active: boolean;
    is_rider: boolean;
    vehicle_type: string;
    vehicle_number: string;
  }>): Promise<AdminStaff> {
    return adminFetch(`/auth/admin/staff/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  resetPassword(userId: number, newPassword: string): Promise<{ detail: string }> {
    return adminFetch(`/auth/admin/reset-password/${userId}/`, {
      method: 'POST',
      body: JSON.stringify({ new_password: newPassword }),
    });
  },

  generateTempPassword(userId: number): Promise<{ detail: string; new_password: string }> {
    return adminFetch(`/auth/admin/reset-password/${userId}/`, {
      method: 'POST',
      body: JSON.stringify({ generate: true }),
    });
  },

  uploadStaffPhoto(id: number, formData: FormData): Promise<AdminStaff> {
    return getAuthToken().then((token) =>
      fetch(`${API_URL}/auth/admin/staff/${id}/documents/`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      }).then((res) => {
        if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
        return res.json();
      }),
    );
  },

  // ─── Plant settings ───────────────────────────────────────────────────────

  getPlantSettings(): Promise<PlantSettings> {
    return adminFetch('/plant/settings/');
  },

  updatePlantSettings(standard_unit_price: number): Promise<PlantSettings> {
    return adminFetch('/plant/settings/', {
      method: 'PATCH',
      body: JSON.stringify({ standard_unit_price }),
    });
  },

  // ─── Bottle types ─────────────────────────────────────────────────────────

  getBottleTypes(): Promise<PricedType[]> {
    return adminFetch('/plant/bottle-types/');
  },

  createBottleType(name: string, default_price?: number | null): Promise<PricedType> {
    return adminFetch('/plant/bottle-types/', {
      method: 'POST',
      body: JSON.stringify({ name, default_price: default_price ?? null }),
    });
  },

  updateBottleType(id: number, data: { name?: string; default_price?: number | null; is_active?: boolean }): Promise<PricedType> {
    return adminFetch(`/plant/bottle-types/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  deleteBottleType(id: number): Promise<void> {
    return adminFetch(`/plant/bottle-types/${id}/`, { method: 'DELETE' });
  },

  // ─── Customer types ───────────────────────────────────────────────────────

  getCustomerTypes(): Promise<PricedType[]> {
    return adminFetch('/plant/customer-types/');
  },

  createCustomerType(name: string, default_price?: number | null): Promise<PricedType> {
    return adminFetch('/plant/customer-types/', {
      method: 'POST',
      body: JSON.stringify({ name, default_price: default_price ?? null }),
    });
  },

  updateCustomerType(id: number, data: { name?: string; default_price?: number | null; is_active?: boolean }): Promise<PricedType> {
    return adminFetch(`/plant/customer-types/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  deleteCustomerType(id: number): Promise<void> {
    return adminFetch(`/plant/customer-types/${id}/`, { method: 'DELETE' });
  },

  // ─── Mobile profile field config ─────────────────────────────────────────

  getMobileProfileConfig(): Promise<Record<string, Record<string, { visible: boolean; editable: boolean; label: string }>>> {
    return adminFetch('/auth/admin/mobile-profile-config/');
  },

  updateMobileProfileConfig(
    userType: string,
    fields: Record<string, { visible?: boolean; editable?: boolean }>,
  ): Promise<{ user_type: string; fields: Record<string, { visible: boolean; editable: boolean; label: string }> }> {
    return adminFetch(`/auth/admin/mobile-profile-config/${userType}/`, {
      method: 'PATCH',
      body: JSON.stringify({ fields }),
    });
  },

  // ─── Plant records ────────────────────────────────────────────────────────

  getPlantRecords(params: { date?: string; start?: string; end?: string } = {}): Promise<PlantRecord[]> {
    const sp = new URLSearchParams();
    if (params.date) sp.set('date', params.date);
    if (params.start) sp.set('start', params.start);
    if (params.end) sp.set('end', params.end);
    const qs = sp.toString();
    return adminFetch(`/plant/records/${qs ? `?${qs}` : ''}`);
  },

  createPlantRecord(data: PlantRecordInput): Promise<PlantRecord> {
    return adminFetch('/plant/records/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updatePlantRecord(id: number, data: Partial<PlantRecordInput>): Promise<PlantRecord> {
    return adminFetch(`/plant/records/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  deletePlantRecord(id: number): Promise<void> {
    return adminFetch(`/plant/records/${id}/`, { method: 'DELETE' });
  },

  getPlantSummary(params: { date?: string; start?: string; end?: string } = {}): Promise<PlantSummary> {
    const sp = new URLSearchParams();
    if (params.date) sp.set('date', params.date);
    if (params.start) sp.set('start', params.start);
    if (params.end) sp.set('end', params.end);
    const qs = sp.toString();
    return adminFetch(`/plant/summary/${qs ? `?${qs}` : ''}`);
  },

  getPlantAnalytics(): Promise<PlantAnalytics> {
    return adminFetch('/plant/analytics/');
  },

  // ─── Shop / Products ──────────────────────────────────────────────────────

  // ── Payment accounts ──────────────────────────────────────────────────────
  // Multipart throughout, because the QR is a file upload and one code path is
  // easier to keep correct than two.

  getPaymentAccounts(): Promise<PaymentAccount[]> {
    return adminFetch('/ledger/admin/payment-accounts/');
  },

  createPaymentAccount(formData: FormData): Promise<PaymentAccount> {
    return getAuthToken().then((token) =>
      fetch(`${API_URL}/ledger/admin/payment-accounts/`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      }).then(async (res) => {
        if (!res.ok) throw new Error(await errorMessage(res, 'Failed to add the account.'));
        return res.json();
      }),
    );
  },

  updatePaymentAccount(id: number, formData: FormData): Promise<PaymentAccount> {
    return getAuthToken().then((token) =>
      fetch(`${API_URL}/ledger/admin/payment-accounts/${id}/`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      }).then(async (res) => {
        if (!res.ok) throw new Error(await errorMessage(res, 'Failed to update the account.'));
        return res.json();
      }),
    );
  },

  deletePaymentAccount(id: number): Promise<void> {
    return adminFetch(`/ledger/admin/payment-accounts/${id}/`, { method: 'DELETE' });
  },

  getProducts(): Promise<AdminProduct[]> {
    return adminFetch('/products/');
  },

  createProduct(formData: FormData): Promise<AdminProduct> {
    return getAuthToken().then((token) =>
      fetch(`${API_URL}/products/`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      }).then(async (res) => {
        if (!res.ok) throw new Error(await errorMessage(res, `Failed to create product: ${res.status}`));
        return res.json();
      }),
    );
  },

  updateProduct(id: number, formData: FormData): Promise<AdminProduct> {
    return getAuthToken().then((token) =>
      fetch(`${API_URL}/products/${id}/`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      }).then(async (res) => {
        if (!res.ok) throw new Error(await errorMessage(res, `Failed to update product: ${res.status}`));
        return res.json();
      }),
    );
  },

  deleteProduct(id: number): Promise<void> {
    return adminFetch(`/products/${id}/`, { method: 'DELETE' });
  },

  /**
   * Staff get every category by default — that is deliberate, it is the only way
   * the manager screen can reach a hidden one to switch it back on. Pass
   * `{ active: true }` when the list is going to be offered as a choice.
   */
  getCategories(params: { active?: boolean } = {}): Promise<AdminCategory[]> {
    return adminFetch(`/categories/${params.active ? '?active=true' : ''}`);
  },

  createCategory(data: { name: string; icon?: string; is_active?: boolean }): Promise<AdminCategory> {
    return adminFetch('/categories/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateCategory(id: number, data: { name?: string; icon?: string; is_active?: boolean }): Promise<AdminCategory> {
    return adminFetch(`/categories/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  deleteCategory(id: number): Promise<void> {
    return adminFetch(`/categories/${id}/`, { method: 'DELETE' });
  },

  // ── Customer ledger ────────────────────────────────────────────────────────
  // Note every `balance` here is owed-positive: a positive number means the
  // customer owes money. That is the opposite of the stored account_balance,
  // and matches the printed statement.

  getReceivables(params: { search?: string; only_owing?: boolean } = {}):
    Promise<{ count: number; results: Receivable[] }> {
    const qs = new URLSearchParams();
    if (params.search) qs.set('search', params.search);
    if (params.only_owing) qs.set('only_owing', 'true');
    const query = qs.toString();
    return adminFetch(`/ledger/customers/${query ? `?${query}` : ''}`);
  },

  getStatement(
    userId: number,
    params: { start?: string; end?: string; source?: string } = {},
  ): Promise<LedgerStatement> {
    const qs = new URLSearchParams();
    if (params.start) qs.set('start', params.start);
    if (params.end) qs.set('end', params.end);
    if (params.source) qs.set('source', params.source);
    const query = qs.toString();
    return adminFetch(`/ledger/customers/${userId}/statement/${query ? `?${query}` : ''}`);
  },

  getLedgerSummary(userId: number): Promise<LedgerSummary> {
    return adminFetch(`/ledger/customers/${userId}/summary/`);
  },

  recordPayment(data: {
    customer_id: number;
    amount: string;
    payment_method?: string;
    entry_date?: string;
    reference?: string;
    notes?: string;
  }): Promise<LedgerEntry> {
    return adminFetch('/ledger/payments/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  getAreas(): Promise<PricedType[]> {
    return adminFetch('/auth/admin/areas/');
  },

  createArea(name: string): Promise<PricedType> {
    return adminFetch('/auth/admin/areas/', {
      method: 'POST', body: JSON.stringify({ name }),
    });
  },

  updateArea(id: number, data: { name?: string; is_active?: boolean; order?: number }): Promise<PricedType> {
    return adminFetch(`/auth/admin/areas/${id}/`, {
      method: 'PATCH', body: JSON.stringify(data),
    });
  },

  deleteArea(id: number): Promise<void> {
    return adminFetch(`/auth/admin/areas/${id}/`, { method: 'DELETE' });
  },

  /**
   * Delivery statuses a rider picks from when closing a drop.
   *
   * Typed as PricedType so the shared TypeList settings UI can render them —
   * they carry no price, hence `showPrice={false}` at the call site. Their
   * colours are edited in the web admin panel, which has proper colour pickers.
   *
   * Retiring one is `is_active: false`, not a delete: orders record the status
   * by name, so removing the row would leave past deliveries labelled with
   * something nothing can explain. The server refuses to delete one in use.
   */
  getDeliveryStatusOptions(): Promise<PricedType[]> {
    return adminFetch('/orders/admin/delivery-statuses/');
  },

  createDeliveryStatusOption(name: string): Promise<PricedType> {
    return adminFetch('/orders/admin/delivery-statuses/', {
      method: 'POST', body: JSON.stringify({ name }),
    });
  },

  updateDeliveryStatusOption(
    id: number,
    data: { name?: string; is_active?: boolean; order?: number },
  ): Promise<PricedType> {
    return adminFetch(`/orders/admin/delivery-statuses/${id}/`, {
      method: 'PATCH', body: JSON.stringify(data),
    });
  },

  deleteDeliveryStatusOption(id: number): Promise<void> {
    return adminFetch(`/orders/admin/delivery-statuses/${id}/`, { method: 'DELETE' });
  },

  voidLedgerEntry(entryId: number, reason: string): Promise<LedgerEntry> {
    return adminFetch(`/ledger/entries/${entryId}/void/`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  // ─── Rider tracking ───────────────────────────────────────────────────────
  // Riders that have never reported are absent from the list entirely, which is
  // a different thing from is_stale — they have no known position at all.

  getRiderLocations(params: { limit?: number; offset?: number } = {}):
    Promise<{ count: number; limit: number; offset: number; results: RiderLocation[] }> {
    const sp = new URLSearchParams();
    if (params.limit != null) sp.set('limit', String(params.limit));
    if (params.offset != null) sp.set('offset', String(params.offset));
    const qs = sp.toString();
    return adminFetch(`/auth/admin/riders/locations/${qs ? `?${qs}` : ''}`);
  },

  /** `userId` is `rider_id` from the locations list, NOT `profile_id`. */
  getRiderTrail(
    userId: number,
    params: { date?: string; since?: string; limit?: number; offset?: number } = {},
  ): Promise<{ count: number; limit: number; offset: number; results: RiderTrailPoint[] }> {
    const sp = new URLSearchParams();
    if (params.date) sp.set('date', params.date);
    if (params.since) sp.set('since', params.since);
    if (params.limit != null) sp.set('limit', String(params.limit));
    if (params.offset != null) sp.set('offset', String(params.offset));
    const qs = sp.toString();
    return adminFetch(`/auth/admin/riders/${userId}/trail/${qs ? `?${qs}` : ''}`);
  },

  getTrackingConfig(): Promise<TrackingConfig> {
    return adminFetch('/auth/tracking-config/');
  },
};

// ── Ledger types ─────────────────────────────────────────────────────────────

export interface Receivable {
  id: number;
  username: string;
  name: string;
  customer_code: string | null;
  phone: string | null;
  address: string | null;
  balance: string;
  bottles_held: number;
  last_entry_date: string | null;
  last_payment_date: string | null;
}

export interface LedgerEntry {
  id: number;
  entry_date: string;
  entry_type: string;
  entry_type_display: string;
  description: string;
  item_label: string;
  quantity: string | null;
  unit_price: string | null;
  document_number: string;
  document_label: string;
  amount: string;
  debit: string | null;
  credit: string | null;
  /** Only present on statement rows; recomputed and owed-positive. */
  running_balance?: string;
  /** Frozen snapshot at insert time, stored credit-positive. Negate for "owed". */
  balance_after: string | null;
  bottles_out: number;
  bottles_in: number;
  stock_after?: number;
  payment_method: string;
  reference: string;
  receipt_number: string | null;
  source: 'shop' | 'plant' | 'manual';
  is_reversal: boolean;
  is_reversed: boolean;
  can_void: boolean;
  created_by_name: string | null;
  created_at: string;
}

export interface LedgerStatement {
  customer: {
    id: number;
    name: string;
    username: string;
    customer_code: string | null;
    phone: string | null;
    address: string | null;
  };
  period: { start: string | null; end: string | null };
  opening_balance: string;
  closing_balance: string;
  opening_stock: number;
  closing_stock: number;
  totals: {
    debit: string;
    credit: string;
    quantity: string;
    bottles_out: number;
    bottles_in: number;
  };
  count: number;
  results: LedgerEntry[];
}

export interface LedgerSummary {
  customer_id: number;
  customer_name: string;
  customer_code: string | null;
  phone: string | null;
  address: string | null;
  balance: string;
  bottles_held: number;
  total_charged: string;
  total_paid: string;
  entry_count: number;
  last_entry_date: string | null;
  last_payment: { date: string; amount: string; receipt_number: string | null } | null;
}

// ── Rider tracking types ─────────────────────────────────────────────────────

/**
 * How hard the app tracks a rider. Set from Django admin, not from here — it
 * is the kill switch that changes behaviour without shipping a new build.
 */
export type TrackingMode = 'always' | 'active_delivery' | 'foreground';

export interface TrackingConfig {
  tracking_enabled: boolean;
  tracking_mode: TrackingMode;
  ping_interval_seconds: number;
  ping_distance_meters: number;
  trail_retention_days: number;
  /** Server-owned staleness threshold — never hard-code a number instead. */
  stale_after_minutes: number;
  updated_at: string;
}

/**
 * A rider's CURRENT pin. Note the two ids: `rider_id` is the Django user id and
 * is what the trail endpoint takes, while `profile_id` is the UserProfile id
 * used by the staff endpoints. They are different numbers for the same person.
 *
 * Coordinates arrive as JSON numbers (not DRF's usual quoted decimals) so they
 * drop straight into a map coordinate without parsing.
 */
export interface RiderLocation {
  rider_id: number;
  profile_id: number;
  username: string;
  name: string;
  phone: string | null;
  vehicle_number: string | null;
  is_available: boolean;
  latitude: number;
  longitude: number;
  accuracy_m: number | null;
  speed_kmh: number | null;
  heading: number | null;
  battery_level: number | null;
  is_moving: boolean;
  /** Device clock — what staleness and ordering are judged on. */
  recorded_at: string;
  /** Server clock — later than recorded_at after an offline flush. */
  received_at: string;
  is_stale: boolean;
  minutes_ago: number;
  active_orders: number;
}

export interface RiderTrailPoint {
  id: number;
  latitude: number;
  longitude: number;
  accuracy_m: number | null;
  recorded_at: string;
}

