import { Product } from './product';

export type StaffRoleFilter = 'all' | 'riders' | 'staff';

export type MainTabParamList = {
  Home: undefined;
  Orders: undefined;
  /** Riders only — the account customers can transfer into. */
  RiderPayment: undefined;
  Profile: undefined;
};

export type AdminTabParamList = {
  Dashboard: undefined;
  AdminOrders: { initialStatus?: string; initialPaid?: boolean } | undefined;
  AdminCustomers: undefined;
  AdminManage: undefined;
  Profile: undefined;
};

export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  MainTabs: { screen?: keyof MainTabParamList } | undefined;
  AdminTabs: { screen?: keyof AdminTabParamList; params?: Record<string, unknown> } | undefined;
  ProductDetail: { product: Product };
  Cart: undefined;
  Checkout: undefined;
  /** The customer's saved delivery addresses, opened from Profile. */
  AddressBook: undefined;
  Complaints: undefined;
  OrderSuccess: { orderId: number; total: number; paymentMethod: string };
  DeliveryOrderDetail: { order: any };
  AdminOrderDetail: { order: any; deliveryBoys: any[] };
  AdminCreateOrder: undefined;
  /** `role` preselects the list filter — e.g. deep-link straight to riders. */
  AdminStaff: { role?: StaffRoleFilter } | undefined;
  AdminSettings: undefined;
  AdminActivity: undefined;
  AdminNotification: undefined;
  AdminPlant: undefined;
  AdminShop: undefined;
  /** Opens straight to a customer's statement when a customer is supplied. */
  AdminLedger: { customerId?: number; customerName?: string } | undefined;
  /** Rider Online taps waiting for the office to match against the bank. */
  AdminPaymentClaims: undefined;
  /** `riderId` is the Django user id — selects one rider instead of fitting all. */
  AdminRiderMap: { riderId?: number } | undefined;
};
