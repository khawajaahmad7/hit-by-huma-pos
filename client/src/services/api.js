import axios from 'axios';
import { useAuthStore } from '../stores/authStore';

// Same-origin API: SPA + /api serverless functions served from one domain.
// VITE_API_URL only needed if the API lives on a different host.
const API_BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api/v1`
  : '/api/v1';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    const { accessToken } = useAuthStore.getState();
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Handle 401 errors (token expired)
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const newToken = await useAuthStore.getState().refreshAccessToken();
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        // Refresh failed, logout user
        useAuthStore.getState().logout();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default api;

// API service functions
export const authService = {
  login: (employeeCode, password) => api.post('/auth/login', { employeeCode, password }),
  refresh: (refreshToken) => api.post('/auth/refresh', { refreshToken }),
  me: () => api.get('/auth/me'),
  verifyPin: (pin) => api.post('/auth/verify-pin', { pin }),
  changePassword: (currentPassword, newPassword) =>
    api.post('/auth/change-password', { currentPassword, newPassword }),
};

export const productService = {
  getAll: (params) => api.get('/products', { params }),
  getById: (id) => api.get(`/products/${id}`),
  create: (data) => api.post('/products', data),
  update: (id, data) => api.put(`/products/${id}`, data),
  quickSearch: (q, locationId) => api.get('/products/search/quick', { params: { q, locationId } }),
  getCategories: () => api.get('/products/categories/list'),
  getAttributes: () => api.get('/products/attributes/list'),
};

export const inventoryService = {
  getAll: (params) => api.get('/inventory', { params }),
  checkOtherLocations: (variantId, currentLocationId) =>
    api.get(`/inventory/check-other-locations/${variantId}`, { params: { currentLocationId } }),
  adjust: (data) => api.post('/inventory/adjust', data),
  receive: (data) => api.post('/inventory/receive', data),
  getTransactions: (params) => api.get('/inventory/transactions', { params }),
  getLocations: () => api.get('/inventory/locations'),
  createTransfer: (data) => api.post('/inventory/transfers', data),
};

export const salesService = {
  getAll: (params) => api.get('/sales', { params }),
  getById: (id) => api.get(`/sales/${id}`),
  create: (data) => api.post('/sales', data),
  park: (data) => api.post('/sales/park', data),
  getParked: (locationId) => api.get('/sales/parked/list', { params: { locationId } }),
  getParkedById: (id) => api.get(`/sales/parked/${id}`),
  deleteParked: (id) => api.delete(`/sales/parked/${id}`),
  void: (id, managerPIN, reason) => api.post(`/sales/${id}/void`, { managerPIN, reason }),
  getPaymentMethods: () => api.get('/sales/payment-methods/list'),
  applyDiscount: (data) => api.post('/sales/apply-discount', data),
};

export const customerService = {
  getAll: (params) => api.get('/customers', { params }),
  lookup: (phone) => api.get(`/customers/lookup/${phone}`),
  getById: (id) => api.get(`/customers/${id}`),
  create: (data) => api.post('/customers', data),
  update: (id, data) => api.put(`/customers/${id}`, data),
  addCredit: (id, data) => api.post(`/customers/${id}/wallet/credit`, data),
  useWallet: (id, data) => api.post(`/customers/${id}/wallet/debit`, data),
  getPurchaseItems: (customerId, saleId) => api.get(`/customers/${customerId}/purchases/${saleId}/items`),
};

export const shiftService = {
  getCurrent: () => api.get('/shifts/current'),
  clockIn: (data) => api.post('/shifts/clock-in', data),
  clockOut: (data) => api.post('/shifts/clock-out', data),
  getHistory: (params) => api.get('/shifts/history', { params }),
  getById: (id) => api.get(`/shifts/${id}`),
  reconcile: (id, notes) => api.post(`/shifts/${id}/reconcile`, { notes }),
};

export const reportService = {
  getDashboard: (locationId) => api.get('/reports/dashboard', { params: { locationId } }),
  getSales: (params) => api.get('/reports/sales', { params }),
  getSalesByCategory: (params) => api.get('/reports/sales-by-category', { params }),
  getSalesByEmployee: (params) => api.get('/reports/sales-by-employee', { params }),
  generateZReport: (data) => api.post('/reports/z-report', data),
  getZReports: (params) => api.get('/reports/z-reports', { params }),
};

export const settingsService = {
  getAll: () => api.get('/settings'),
  get: (key) => api.get(`/settings/${key}`),
  update: (key, value) => api.put(`/settings/${key}`, { value }),
  getLocations: () => api.get('/settings/locations/all'),
  createLocation: (data) => api.post('/settings/locations', data),
  getUsers: () => api.get('/settings/users/all'),
  createUser: (data) => api.post('/settings/users', data),
  getRoles: () => api.get('/settings/roles/all'),
};
