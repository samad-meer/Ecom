/* ---------- Domain models ---------- */

export interface Category {
  id: number;
  name: string;
  slug: string;
  icon: string;
  /**
   * Hidden categories (`false`) are retired rather than deleted: products
   * already filed under one keep it, but customers never see it. The server
   * hides them from non-staff callers; staff get every category by default.
   */
  is_active: boolean;
}

export interface ImageRef {
  id: number;
  image: string;
}

export interface Product {
  id: number;
  name: string;
  description: string;
  price: string;
  is_active: boolean;
  image: string | null;
  images: ImageRef[];
  category_details: Category | null;
  created_at: string;
  updated_at: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface OrderItem {
  id?: number;
  product_id?: number;
  product_details?: Product;
  quantity: number;
  price: string;
}

export type OrderStatus =
  | "Pending"
  | "Processing"
  | "Shipped"
  | "Delivered"
  | "Cancelled";

/** Cash on delivery only — the business does not accept mobile wallets. */
export type PaymentMethod = "COD";

export interface Order {
  id: number;
  user?: string | null;
  guest_name?: string | null;
  guest_phone?: string | null;
  items: OrderItem[];
  total_price: string;
  status: OrderStatus;
  shipping_address: string;
  /** Structured copy of the address, snapshotted when the order was placed. */
  house_number?: string;
  portion?: string;
  block?: string;
  area?: string;
  /** Delivery pin, as decimal strings. Null when the customer never dropped one. */
  shipping_latitude?: string | null;
  shipping_longitude?: string | null;
  /** Resolved name of the address book entry used ("Home", "Warehouse", …). */
  shipping_label?: string | null;
  payment_method: PaymentMethod;
  payment_number?: string | null;
  is_paid: boolean;
  is_hidden?: boolean;
  created_at: string;
  assigned_delivery_boy?: number | null;
  assigned_delivery_boy_name?: string | null;
  delivery_notes?: string | null;
  number_of_bottles?: number;
  delivery_status?: string;
  delivery_status_updated_at?: string | null;
  delivery_assigned_at?: string | null;
  delivery_completed_at?: string | null;
  cash_received?: boolean;
  cash_amount?: string;
}

export type ComplaintStatus = "PENDING" | "IN_PROGRESS" | "RESOLVED";

export interface Complaint {
  id: number;
  subject: string;
  description: string;
  status: ComplaintStatus;
  admin_reply?: string | null;
  admin_reply_at?: string | null;
  created_at: string;
  images?: ImageRef[];
}

export interface AdminComplaint extends Complaint {
  user_name: string;
  user_email: string;
}

export interface UserProfile {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  user_type: "customer" | "delivery_boy" | "admin";
  phone_number: string | null;
  address: string | null;
  is_available: boolean;
  vehicle_type: string | null;
  vehicle_number: string | null;
  account_balance: string; // decimal string from API, positive = credit, negative = owes
  is_staff: boolean;
  can_manage_plant: boolean;
}

/* ---------- Customer address book ---------- */

/** Fixed set the backend stores; `other` is named by `custom_label`. */
export type AddressLabel = "home" | "office" | "shop" | "warehouse" | "other";

export interface CustomerAddress {
  id: number;
  label: AddressLabel;
  custom_label: string;
  /** Resolved name — `custom_label` when the label is "other", else its display text. */
  display_label: string;
  house_number: string;
  /** Canonical PORTION_OPTIONS key (e.g. "first_floor"), not free text. */
  portion: string;
  block: string;
  area: string;
  /** Composed by the server from the parts above — read-only, never sent back. */
  address: string;
  /** Delivery pin as decimal strings, or null when none was dropped. */
  latitude: string | null;
  longitude: string | null;
  has_pin: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface CustomerAddressInput {
  label?: AddressLabel;
  custom_label?: string;
  house_number: string;
  portion?: string;
  block?: string;
  area: string;
  /**
   * The pin must travel as a pair — sending one half without the other is a
   * 400. Send both as `null` to clear it.
   */
  latitude?: string | null;
  longitude?: string | null;
  is_default?: boolean;
}

/* ---------- Plant management ---------- */

/** A named, optionally-priced lookup (customer types and bottle types). */
export interface PricedType {
  id: number;
  name: string;
  default_price: string | null;
  order: number;
  is_active: boolean;
}
export type CustomerType = PricedType;
export type BottleType = PricedType;

export interface PlantRecord {
  id: number;
  date: string;
  customer_id?: number | null;
  customer_name: string | null;
  customer_type_id?: number | null;
  customer_type_name: string | null;
  bottle_type_id?: number | null;
  bottle_type_name: string | null;
  house: string;
  bottles: number;
  unit_price: string;
  amount: string;
  paid: boolean;
  paid_amount: string;
  pending: string;
  payment_status: "paid" | "partial" | "unpaid";
  notes: string;
  created_at: string;
}

export interface PlantSummary {
  records: number;
  bottles: number;
  amount: number;
  paid_amount: number;
  pending: number;
  unpaid_amount?: number;
  houses: number;
}

export interface PlantCustomer {
  id: number;
  username: string;
  name: string;
  address: string | null;
  phone: string | null;
  price: number;
  has_custom_price: boolean;
}

export interface PlantSettings {
  standard_unit_price: number;
}

export interface PlantDaily {
  date: string;
  bottles: number;
  amount: number;
  paid_amount?: number;
  records: number;
}

export interface PlantTopHouse {
  house: string;
  bottles: number;
  amount: number;
}

export interface PlantAnalytics {
  totals: {
    records: number;
    bottles: number;
    amount: number;
    paid_amount: number;
    pending: number;
    unpaid_amount?: number;
  };
  daily: PlantDaily[];
  top_houses: PlantTopHouse[];
}

export interface PlantDateRange {
  date?: string;
  start?: string;
  end?: string;
}

export interface PlantFilters extends PlantDateRange {
  payment_status?: "paid" | "partial" | "unpaid" | "";
  customer_type?: number | "";
  bottle_type?: number | "";
}

export interface CreatePlantRecordInput {
  date?: string;
  customer_id?: number | null;
  customer_type_id?: number | null;
  bottle_type_id?: number | null;
  house: string;
  bottles: number;
  unit_price?: number | string;
  paid_amount?: number | string;
  notes?: string;
}

export interface PricedTypeInput {
  name: string;
  default_price?: number | null;
  order?: number;
  is_active?: boolean;
}
export type CustomerTypeInput = PricedTypeInput;
export type BottleTypeInput = PricedTypeInput;

/* ---------- API payloads ---------- */

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface RegisterPayload {
  username: string;
  email: string;
  password: string;
  password_confirm: string;
  first_name?: string;
  last_name?: string;
  phone_number: string;
  /** Structured delivery address — the backend composes these into `address`. */
  house_number: string;
  /** One of the canonical keys in PORTION_OPTIONS (e.g. "first_floor"), not
   *  free text — the backend composes the matching label into `address`. */
  portion?: string;
  block?: string;
  area: string;
}

export interface UpdateProfilePayload {
  username?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone_number?: string | null;
  address?: string | null;
}

export interface ChangePasswordPayload {
  old_password: string;
  new_password: string;
}

export interface CreateOrderItemInput {
  product_id: number;
  quantity: number;
  price: string;
}

export interface CreateOrderPayload {
  items: CreateOrderItemInput[];
  total_price: string;
  /**
   * A saved address book entry. The server copies its text, parts and pin onto
   * the order, so `shipping_address` need not be sent alongside it. Sending
   * neither this nor `shipping_address` is rejected.
   */
  address_id?: number;
  /** Free-text fallback for a customer checking out without a saved address. */
  shipping_address?: string;
  payment_method: PaymentMethod;
  payment_number?: string | null;
}

export interface ComplaintInput {
  subject: string;
  description: string;
  images?: File[];
}

/* ---------- Admin order management ---------- */

export interface AdminOrder extends Order {
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  customer_balance: number | null; // account balance of linked user, null for guests
}

export interface AdminOrderSummary {
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

export interface AdminOrderFilters {
  status?: string;
  search?: string;
  date_from?: string;
  date_to?: string;
  is_paid?: boolean | "";
  show_hidden?: boolean;
}

export interface AdminOrderUpdatePayload {
  status?: OrderStatus;
  is_paid?: boolean;
  is_hidden?: boolean;
  assigned_delivery_boy?: number | null;
  delivery_notes?: string;
  cash_amount?: string | number;
  cash_received?: boolean;
  delivery_status?: string;
}

export interface DeliveryStatusOption {
  id: number;
  name: string;
  color: string;
  background_color: string;
  border_color: string;
  order: number;
}

export interface CreateAdminOrderPayload {
  user_id?: number | null;
  guest_name?: string;
  guest_phone?: string;
  /** Composed line. Optional when the structured parts below are sent — the
   *  backend rebuilds it from them, exactly as signup does. */
  shipping_address?: string;
  house_number?: string;
  /** Canonical PORTION_OPTIONS key, not free text. */
  portion?: string;
  block?: string;
  area?: string;
  payment_method: PaymentMethod;
  payment_number?: string;
  assigned_delivery_boy?: number | null;
  delivery_notes?: string;
  status?: OrderStatus;
  items: { product_id: number; quantity: number }[];
}

export interface DeliveryBoy {
  id: number;
  name: string;
  is_available: boolean;
}

export interface CustomerOrderStats {
  total_orders: number;
  delivered_count: number;
  total_bottles: number;
  last_order_date: string | null;
  account_balance: number | null;
}

export interface AdminCustomer {
  id: number;
  username: string;
  name: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  /** Composed line, built by the server from the parts below. Read-only in
   *  practice — send the parts and let the server recompose it. */
  address: string | null;
  house_number: string | null;
  /** Canonical portion key (`ground`, `first_floor`, …) or null. */
  portion: string | null;
  block: string | null;
  area: string | null;
  date_joined: string;
  is_active: boolean;
}

export interface CreateCustomerPayload {
  username: string;
  /** Optional for internal customers. Omitting it stores an unusable password:
   *  the record works for orders and the ledger but cannot be signed into
   *  until an admin sets one. */
  password?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone_number?: string;
  house_number?: string;
  /** Canonical PORTION_OPTIONS key, not free text. */
  portion?: string;
  block?: string;
  area?: string;
  address?: string;
}

export interface CreatedCustomer {
  id: number;
  username: string;
  name: string;
  phone: string | null;
  address: string | null;
  can_sign_in: boolean;
}

export type WorkingStatus = 'Active' | 'Inactive' | 'Resigned' | 'Terminated' | 'On Leave';

export interface StaffProfile {
  id: number;          // UserProfile.id
  user_id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  is_active: boolean;
  phone_number: string | null;
  address: string | null;
  is_available: boolean;
  // Rider
  is_rider: boolean;
  vehicle_type: string | null;
  vehicle_number: string | null;
  // HR
  employee_id: string | null;
  cnic_number: string | null;
  date_of_birth: string | null;
  age: number | null;
  date_of_joining: string | null;
  working_status: WorkingStatus;
  emergency_contact: string | null;
  department: string | null;
  designation: string | null;
  salary: string | null;
  remarks: string | null;
  // Media URLs
  profile_picture_url: string | null;
  cnic_front_url: string | null;
  cnic_back_url: string | null;
  driving_license_url: string | null;
  // Stats (riders only)
  total_deliveries: number | null;
  delivered_count: number | null;
}

export interface CreateStaffPayload {
  username: string;
  email?: string;
  password: string;
  first_name?: string;
  last_name?: string;
  phone_number?: string;
  address?: string;
  is_rider?: boolean;
  vehicle_type?: string;
  vehicle_number?: string;
  employee_id?: string;
  cnic_number?: string;
  date_of_birth?: string;
  date_of_joining?: string;
  working_status?: WorkingStatus;
  emergency_contact?: string;
  department?: string;
  designation?: string;
  salary?: number;
  remarks?: string;
}

export interface UpdateStaffPayload {
  username?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  is_active?: boolean;
  phone_number?: string | null;
  address?: string | null;
  is_rider?: boolean;
  is_available?: boolean;
  vehicle_type?: string | null;
  vehicle_number?: string | null;
  employee_id?: string | null;
  cnic_number?: string | null;
  date_of_birth?: string | null;
  date_of_joining?: string | null;
  working_status?: WorkingStatus;
  emergency_contact?: string | null;
  department?: string | null;
  designation?: string | null;
  salary?: number | null;
  remarks?: string | null;
}

export interface MobileProfileFieldConfig {
  visible: boolean;
  editable: boolean;
  label: string;
}

export type MobileProfileConfig = Record<string, MobileProfileFieldConfig>;

// Legacy alias
export type RiderProfile = StaffProfile;
export type CreateRiderPayload = CreateStaffPayload;
export type UpdateRiderPayload = UpdateStaffPayload;

/* ---------- Rider location tracking ---------- */

/**
 * The tracking endpoints page with limit/offset and no next/previous links,
 * so they don't fit `Paginated<T>` and must not be run through `unwrapList`.
 */
export interface OffsetPaginated<T> {
  count: number; // total BEFORE slicing
  limit: number;
  offset: number;
  results: T[];
}

/** A rider's current pin from /auth/admin/riders/locations/. */
export interface RiderLocation {
  /** Django User id — this is what the trail endpoint takes. */
  rider_id: number;
  /** UserProfile id — this is what every other ridersApi path takes. */
  profile_id: number;
  username: string;
  name: string;
  phone: string | null;
  vehicle_number: string | null;
  is_available: boolean;
  /**
   * Real JSON numbers, not DRF's usual quoted decimals. A Google Maps
   * LatLngLiteral silently refuses to draw a pin for a stringy coordinate,
   * so don't "helpfully" widen these to `string | number`.
   */
  latitude: number;
  longitude: number;
  accuracy_m: number | null;
  speed_kmh: number | null;
  heading: number | null;
  battery_level: number | null;
  is_moving: boolean;
  /** Device clock — what staleness and ordering are judged on. */
  recorded_at: string;
  /** Server clock — later than recorded_at by the upload delay. */
  received_at: string;
  is_stale: boolean;
  minutes_ago: number;
  active_orders: number;
}

/** One breadcrumb from /auth/admin/riders/<user_id>/trail/. */
export interface RiderTrailPoint {
  id: number;
  latitude: number;
  longitude: number;
  accuracy_m: number | null;
  recorded_at: string;
}

export type TrackingMode = "always" | "active_delivery" | "foreground";

/** Read-only singleton; edited from Django admin, there is no write endpoint. */
export interface TrackingConfig {
  tracking_enabled: boolean;
  tracking_mode: TrackingMode;
  ping_interval_seconds: number;
  ping_distance_meters: number;
  trail_retention_days: number;
  stale_after_minutes: number;
  updated_at: string;
}

/* ---------- Customer ledger ---------- */

export type LedgerEntryType =
  | "opening"
  | "order_charge"
  | "order_payment"
  | "plant_charge"
  | "plant_payment"
  | "payment"
  | "adjustment"
  | "refund";

/** "Online" entries only appear once the office confirms a transfer. */
export type LedgerPaymentMethod = "Cash" | "Online";

export interface LedgerEntry {
  id: number;
  entry_date: string;
  entry_type: LedgerEntryType;
  entry_type_display: string;
  description: string;
  item_label: string;
  quantity: string | null;
  unit_price: string | null;
  document_number: string;
  document_label: string;
  /** Stored sign: positive = credit to the customer. */
  amount: string;
  debit: string | null;
  credit: string | null;
  /** Statement rows only — recomputed, owed-positive. */
  running_balance?: string;
  /** Frozen at insert time, stored credit-positive. Negate for "owed". */
  balance_after: string | null;
  bottles_out: number;
  bottles_in: number;
  stock_after?: number;
  payment_method: string;
  reference: string;
  receipt_number: string | null;
  source: "shop" | "plant" | "manual";
  is_reversal: boolean;
  is_reversed: boolean;
  can_void: boolean;
  void_reason: string;
  customer: number;
  customer_name: string;
  created_by_name: string | null;
  created_at: string;
  notes: string;
}

export type PaymentClaimStatus = "waiting" | "confirmed" | "not_found";

/** Someone saying an online payment was made. Not money until confirmed. */
export interface PaymentClaim {
  id: number;
  status: PaymentClaimStatus;
  amount: string;
  reference: string;
  note: string;
  order: number | null;
  order_total: string | null;
  /** Null on a guest order, which has no ledger. */
  customer: number | null;
  customer_name: string;
  customer_code: string | null;
  phone: string | null;
  claimed_by_name: string | null;
  created_at: string;
  resolved_by_name: string | null;
  resolved_at: string | null;
  entry: number | null;
  receipt_number: string | null;
}

export interface PaymentClaimList {
  count: number;
  total_amount: string | number;
  results: PaymentClaim[];
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
  /** All balances below are owed-positive. */
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
  limit: number;
  offset: number;
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
  last_payment: {
    date: string;
    amount: string;
    receipt_number: string | null;
  } | null;
}

/** Business identity from `/ledger/business/` — the same record printed on
 *  receipts. Only `share_location_label` is editable over the API; the rest is
 *  managed in the Django admin. */
export interface BusinessInfo {
  name: string;
  phone: string | null;
  address: string | null;
  /** Default name attached when an admin shares a work-place location. Blank
   *  means "<name> — work place". */
  share_location_label: string;
}

/** A delivery status as staff manage it, colours and all. */
export interface AdminDeliveryStatus {
  id: number;
  name: string;
  /** 6-digit hex, e.g. #2ecc71. */
  color: string;
  background_color: string;
  border_color: string;
  order: number;
  /** Retired statuses stay on past orders but leave the rider's picker. */
  is_active: boolean;
}

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

export interface StatementFilters {
  start?: string;
  end?: string;
  source?: "shop" | "plant" | "manual";
  entry_type?: LedgerEntryType;
}

export interface RecordPaymentInput {
  customer_id: number;
  amount: string;
  payment_method?: LedgerPaymentMethod;
  entry_date?: string;
  reference?: string;
  notes?: string;
}

export interface ManualEntryInput {
  customer_id: number;
  entry_type: "opening" | "adjustment" | "refund";
  amount: string;
  description: string;
  entry_date?: string;
  bottles_out?: number;
  bottles_in?: number;
  notes?: string;
}

/** Admin-managed delivery locality offered on the signup form. */
export interface Area {
  id: number;
  name: string;
  is_active: boolean;
  order: number;
}

export interface AuthTokens {
  access: string;
  refresh: string;
}
