import { apiFetch, unwrapList } from "./client";
import type { Category, Paginated, Product } from "../types";

export interface ProductQuery {
  category?: number | null;
  search?: string;
}

export interface AdminProductQuery {
  search?: string;
  category?: number | null;
  is_active?: boolean;
}

export interface ProductInput {
  name: string;
  description?: string;
  price: string | number;
  is_active?: boolean;
  is_refill?: boolean;
  category?: number | null;
  /** New gallery images to upload (replaces existing on update). Max 3. */
  images?: File[];
}

function toFormData(data: ProductInput): FormData {
  const fd = new FormData();
  fd.append("name", data.name);
  if (data.description !== undefined) fd.append("description", data.description);
  fd.append("price", String(data.price));
  fd.append("is_active", String(data.is_active ?? true));
  if (data.is_refill !== undefined) fd.append("is_refill", String(data.is_refill));
  if (data.category != null) fd.append("category", String(data.category));
  if (data.images?.length) {
    for (const file of data.images) fd.append("uploaded_images", file);
  }
  return fd;
}

export const productsApi = {
  list(query: ProductQuery = {}): Promise<Product[]> {
    const sp = new URLSearchParams();
    if (query.category) sp.set("category", String(query.category));
    if (query.search) sp.set("search", query.search);
    sp.set("is_active", "true");
    const qs = sp.toString();
    return apiFetch<Product[] | Paginated<Product>>(
      `/products/${qs ? `?${qs}` : ""}`
    ).then(unwrapList);
  },

  get(id: string | number): Promise<Product> {
    return apiFetch<Product>(`/products/${id}/`);
  },
};

export const adminProductsApi = {
  list(query: AdminProductQuery = {}): Promise<Product[]> {
    const sp = new URLSearchParams();
    if (query.search) sp.set("search", query.search);
    if (query.category != null) sp.set("category", String(query.category));
    if (query.is_active !== undefined) sp.set("is_active", String(query.is_active));
    const qs = sp.toString();
    return apiFetch<Product[] | Paginated<Product>>(
      `/products/${qs ? `?${qs}` : ""}`,
      { auth: true }
    ).then(unwrapList);
  },

  create(data: ProductInput): Promise<Product> {
    return apiFetch<Product>("/products/", {
      method: "POST",
      auth: true,
      body: toFormData(data),
    });
  },

  update(id: number, data: ProductInput): Promise<Product> {
    return apiFetch<Product>(`/products/${id}/`, {
      method: "PATCH",
      auth: true,
      body: toFormData(data),
    });
  },

  delete(id: number): Promise<void> {
    return apiFetch<void>(`/products/${id}/`, {
      method: "DELETE",
      auth: true,
    });
  },
};

export interface CategoryQuery {
  /**
   * Ask for active categories only. Non-staff callers always get active-only,
   * so this is a no-op for them; staff get every category by default and need
   * this to narrow the list (e.g. a product form that must not offer a
   * retired category). Pass it explicitly wherever the answer must not depend
   * on who is signed in.
   */
  active?: boolean;
}

export const categoriesApi = {
  list(query: CategoryQuery = {}): Promise<Category[]> {
    const sp = new URLSearchParams();
    if (query.active) sp.set("active", "true");
    const qs = sp.toString();
    return apiFetch<Category[] | Paginated<Category>>(
      `/categories/${qs ? `?${qs}` : ""}`
    ).then(unwrapList);
  },
};

export interface CategoryInput {
  name: string;
  /** Expo Vector Icons name (consumed by the mobile app). */
  icon?: string;
  /** false = hidden from customers; products keep the category. */
  is_active?: boolean;
}

export const adminCategoriesApi = {
  create(data: CategoryInput): Promise<Category> {
    return apiFetch<Category>("/categories/", {
      method: "POST",
      auth: true,
      body: data,
    });
  },

  update(id: number, data: Partial<CategoryInput>): Promise<Category> {
    return apiFetch<Category>(`/categories/${id}/`, {
      method: "PATCH",
      auth: true,
      body: data,
    });
  },

  delete(id: number): Promise<void> {
    return apiFetch<void>(`/categories/${id}/`, {
      method: "DELETE",
      auth: true,
    });
  },
};
