import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export const api = axios.create({
  baseURL: `${API_URL}/api`,
  withCredentials: true,
  timeout: 35000,
});

// Attach access token
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('fitprice_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auto-refresh on 401
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        const { data } = await axios.post(`${API_URL}/api/auth/refresh`, {}, { withCredentials: true });
        localStorage.setItem('fitprice_token', data.accessToken);
        original.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(original);
      } catch {
        localStorage.removeItem('fitprice_token');
        window.location.href = '/auth/login';
      }
    }
    return Promise.reject(error);
  }
);

// Basket API
export const basketApi = {
  optimize: (data: any) => api.post('/basket/optimize', data),
  replace: (product_id: number, excluded_ids: number[]) =>
    api.post('/basket/replace', { product_id, excluded_ids }),
  categories: () => api.get('/basket/categories'),
  promos: () => api.get('/basket/promos'),
};

// Nutrition API
export const nutritionApi = {
  calculate: (data: any) => api.post('/nutrition/calculate', data),
  recipe: (basket: any[], meal_name?: string, calories_target?: number) =>
    api.post('/nutrition/recipe', { basket, meal_name, calories_target }),
  history: () => api.get('/nutrition/history'),
  profile: () => api.get('/nutrition/profile'),
};

// Auth API
export const authApi = {
  login: (email: string, password: string) => api.post('/auth/login', { email, password }),
  register: (email: string, password: string, name: string) =>
    api.post('/auth/register', { email, password, name }),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
};

// Ads API
export const adsApi = {
  list: () => api.get('/ads'),
};
