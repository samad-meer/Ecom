import { API_URL } from '../constants/config';
import { Product, Category } from '../types/product';

/** The shared host sometimes answers a read with a 500 that works a second later. */
const fetchWithRetry = async (url: string, init?: RequestInit): Promise<Response> => {
  let res = await fetch(url, init);
  for (const wait of [600, 1500]) {
    if (res.status < 500) break;
    await new Promise((resolve) => setTimeout(resolve, wait));
    res = await fetch(url, init);
  }
  return res;
};

export const ProductService = {
  getAllProducts: async (categoryId?: number): Promise<Product[]> => {
    try {
      let url = `${API_URL}/products/`;
      if (categoryId) {
        url += `?category=${categoryId}`;
      }
      console.log(`Fetching products from ${url}`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);

      try {
        const response = await fetchWithRetry(url, {
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        console.log('Response status:', response.status);
        if (!response.ok) {
          throw new Error(`Network response was not ok: ${response.status}`);
        }
        const data = await response.json();
        return data;
      } catch (error) {
        clearTimeout(timeoutId);
        throw error;
      }
    } catch (error) {
      console.error('Error fetching products:', error);
      throw error;
    }
  },

  // `?active=true` is sent explicitly rather than leaning on the server default:
  // the default already hides inactive categories from customers, but a staff
  // member browsing the shop while signed in would otherwise be handed the
  // hidden ones too. Being explicit makes this deterministic for every caller.
  getCategories: async (): Promise<Category[]> => {
    try {
      const response = await fetchWithRetry(`${API_URL}/categories/?active=true`);
      if (!response.ok) {
        throw new Error('Failed to fetch categories');
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching categories:', error);
      return [];
    }
  },

  getProductById: async (id: number): Promise<Product> => {
    try {
      const response = await fetchWithRetry(`${API_URL}/products/${id}/`);
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      const data = await response.json();
      return data;
    } catch (error) {
      console.error(`Error fetching product ${id}:`, error);
      throw error;
    }
  }
};
