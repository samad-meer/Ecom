export interface Category {
  id: number;
  name: string;
  slug: string;
  icon: string;
  /** Always true for customers — they are only ever served active categories. */
  is_active: boolean;
}

export interface Product {
  id: number;
  name: string;
  description: string;
  price: string;
  is_active: boolean;
  is_refill?: boolean;
  image: string | null;
  category: number | null;
  category_details?: Category;
  created_at: string;
  updated_at: string;
}
