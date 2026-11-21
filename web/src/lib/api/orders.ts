import { apiFetch, unwrapList } from "./client";
import type {
  AdminDeliveryStatus,
  AdminOrder,
  AdminOrderFilters,
  AdminOrderSummary,
  AdminOrderUpdatePayload,
  CreateAdminOrderPayload,
  CreateMessageTemplatePayload,
  CreateOrderPayload,
  CustomerOrderStats,
  DeliveryBoy,
  DeliveryStatusOption,
  MessageTemplate,
  Order,
  Paginated,
  UpdateMessageTemplatePayload,
} from "../types";

function buildAdminQuery(filters: AdminOrderFilters = {}): string {
  const sp = new URLSearchParams();
  if (filters.status) sp.set("status", filters.status);
  if (filters.search) sp.set("search", filters.search);
  if (filters.date_from) sp.set("date_from", filters.date_from);
  if (filters.date_to) sp.set("date_to", filters.date_to);
  if (filters.is_paid !== "" && filters.is_paid !== undefined)
    sp.set("is_paid", String(filters.is_paid));
  if (filters.show_hidden) sp.set("show_hidden", "true");
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

export const ordersApi = {
  list(): Promise<Order[]> {
    return apiFetch<Order[] | Paginated<Order>>("/orders/", {
      auth: true,
    }).then(unwrapList);
  },

  get(id: string | number): Promise<Order> {
    return apiFetch<Order>(`/orders/${id}/`, { auth: true });
  },

  create(payload: CreateOrderPayload): Promise<Order> {
    return apiFetch<Order>("/orders/", {
      method: "POST",
      auth: true,
      body: payload,
    });
  },

  adminCreate(payload: CreateAdminOrderPayload): Promise<AdminOrder> {
    return apiFetch<AdminOrder>("/orders/admin/", {
      method: "POST",
      auth: true,
      body: payload,
    });
  },

  adminList(filters: AdminOrderFilters = {}): Promise<AdminOrder[]> {
    return apiFetch<AdminOrder[] | Paginated<AdminOrder>>(
      `/orders/admin/${buildAdminQuery(filters)}`,
      { auth: true }
    ).then(unwrapList);
  },

  adminUpdate(id: number, data: AdminOrderUpdatePayload): Promise<AdminOrder> {
    return apiFetch<AdminOrder>(`/orders/admin/${id}/`, {
      method: "PATCH",
      auth: true,
      body: data,
    });
  },

  /**
   * Headline stats. Passing a range scopes every figure to it; passing nothing
   * keeps the all-time totals the summary row showed before the period filter.
   */
  adminSummary(range: { date_from?: string; date_to?: string } = {}): Promise<AdminOrderSummary> {
    const sp = new URLSearchParams();
    if (range.date_from) sp.set("date_from", range.date_from);
    if (range.date_to) sp.set("date_to", range.date_to);
    const qs = sp.toString();
    return apiFetch<AdminOrderSummary>(
      `/orders/admin/summary/${qs ? `?${qs}` : ""}`,
      { auth: true }
    );
  },

  adminDeliveryBoys(): Promise<DeliveryBoy[]> {
    return apiFetch<DeliveryBoy[]>("/orders/admin/delivery-boys/", { auth: true });
  },

  deliveryStatuses(): Promise<DeliveryStatusOption[]> {
    return apiFetch<DeliveryStatusOption[]>("/orders/delivery/statuses/", { auth: true });
  },

  addressSuggestions(q: string): Promise<string[]> {
    return apiFetch<string[]>(`/orders/admin/address-suggestions/?q=${encodeURIComponent(q)}`, { auth: true });
  },

  customerStats(userId: number): Promise<CustomerOrderStats> {
    return apiFetch<CustomerOrderStats>(`/orders/admin/customer-stats/${userId}/`, { auth: true });
  },
};

/**
 * Delivery statuses the rider app offers when closing a drop.
 *
 * `adminList` includes retired ones; the rider's own endpoint is filtered to
 * active. Retiring is `is_active = false` rather than a delete — orders store
 * the status by name, so removing the row would leave historic deliveries
 * labelled with something nothing can explain. The server refuses to delete
 * one that any order already uses.
 */
export const deliveryStatusesApi = {
  adminList(): Promise<AdminDeliveryStatus[]> {
    return apiFetch<AdminDeliveryStatus[]>("/orders/admin/delivery-statuses/", { auth: true });
  },

  create(payload: Omit<AdminDeliveryStatus, "id">): Promise<AdminDeliveryStatus> {
    return apiFetch<AdminDeliveryStatus>("/orders/admin/delivery-statuses/", {
      method: "POST",
      auth: true,
      body: payload,
    });
  },

  update(id: number, payload: Partial<Omit<AdminDeliveryStatus, "id">>): Promise<AdminDeliveryStatus> {
    return apiFetch<AdminDeliveryStatus>(`/orders/admin/delivery-statuses/${id}/`, {
      method: "PATCH",
      auth: true,
      body: payload,
    });
  },

  remove(id: number): Promise<void> {
    return apiFetch<void>(`/orders/admin/delivery-statuses/${id}/`, { method: "DELETE", auth: true });
  },
};

export const messageTemplatesApi = {
  list(category?: string): Promise<MessageTemplate[]> {
    const qs = category ? `?category=${category}` : "";
    return apiFetch<MessageTemplate[] | Paginated<MessageTemplate>>(
      `/orders/templates/${qs}`,
      { auth: true }
    ).then(unwrapList);
  },

  get(id: number): Promise<MessageTemplate> {
    return apiFetch<MessageTemplate>(`/orders/templates/${id}/`, { auth: true });
  },

  create(payload: CreateMessageTemplatePayload): Promise<MessageTemplate> {
    return apiFetch<MessageTemplate>("/orders/templates/", {
      method: "POST",
      auth: true,
      body: payload,
    });
  },

  update(id: number, payload: UpdateMessageTemplatePayload): Promise<MessageTemplate> {
    return apiFetch<MessageTemplate>(`/orders/templates/${id}/`, {
      method: "PATCH",
      auth: true,
      body: payload,
    });
  },

  remove(id: number): Promise<void> {
    return apiFetch<void>(`/orders/templates/${id}/`, {
      method: "DELETE",
      auth: true,
    });
  },

  setDefault(id: number): Promise<MessageTemplate> {
    return apiFetch<MessageTemplate>(`/orders/templates/${id}/set-default/`, {
      method: "POST",
      auth: true,
    });
  },
};

export interface DeliverySettings {
  id?: number;
  rider_can_call: boolean;
  rider_can_whatsapp: boolean;
  delivery_confirmation_note?: string;
  updated_at?: string;
}

export const deliverySettingsApi = {
  get(): Promise<DeliverySettings> {
    return apiFetch<DeliverySettings>("/orders/delivery/settings/", { auth: true });
  },

  update(payload: Partial<DeliverySettings>): Promise<DeliverySettings> {
    return apiFetch<DeliverySettings>("/orders/delivery/settings/", {
      method: "PATCH",
      auth: true,
      body: payload,
    });
  },
};


