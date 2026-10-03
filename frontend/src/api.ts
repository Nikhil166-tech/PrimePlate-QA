import axios from 'axios';
import type { AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { navigate } from './router';

// Strict production API URL validation
const isProd = import.meta.env.PROD;
const rawApiUrl = import.meta.env.VITE_API_URL;

if (isProd && !rawApiUrl) {
  throw new Error('[PRIMEPLATE CONFIG ERROR] VITE_API_URL environment variable is required in production mode!');
}

const apiBaseUrl = (rawApiUrl || '/api/v1').replace(/\/+$/, '');

const api: AxiosInstance = axios.create({
  baseURL: apiBaseUrl,
  timeout: 60000,
});

// Attach JWT access token if present
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  return config;
});

// Normalise responses and handle 401 refresh token rotation safely
api.interceptors.response.use(
  (response: AxiosResponse) => {
    return response.data?.data !== undefined ? response.data.data : response.data;
  },
  async (error) => {
    const { response, config } = error;
    const isRefreshEndpoint = config?.url?.includes('/auth/refresh');
    const isAuthEndpoint =
      config?.url?.includes('/auth/login') ||
      config?.url?.includes('/auth/register');

    // Handle 401 Unauthorized (expired access token -> attempt refresh token rotation ONCE)
    if (
      response?.status === 401 &&
      config &&
      !config._retry401 &&
      !isRefreshEndpoint &&
      !isAuthEndpoint
    ) {
      config._retry401 = true;
      const refreshToken = localStorage.getItem('refreshToken');

      if (refreshToken) {
        try {
          const refreshRes = await axios.post(`${api.defaults.baseURL}/auth/refresh`, { refreshToken });
          const data = refreshRes.data?.data !== undefined ? refreshRes.data.data : refreshRes.data;
          const newAccessToken = data?.accessToken;
          const newRefreshToken = data?.refreshToken;

          if (newAccessToken) {
            localStorage.setItem('accessToken', newAccessToken);
            if (newRefreshToken) {
              localStorage.setItem('refreshToken', newRefreshToken);
            }
            config.headers.set('Authorization', `Bearer ${newAccessToken}`);
            return api(config);
          }
        } catch (_) {
          // Token refresh failed or revoked
        }
      }

      // Clear authentication session if token refresh failed or token is missing
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('userRole');
      localStorage.removeItem('userEmail');
      sessionStorage.removeItem('pendingPaymentOrderId');
      sessionStorage.removeItem('pendingPaymentPlanId');

      if (!window.location.pathname.includes('/login')) {
        navigate('/login');
      }
    } else if (response?.status === 401 && isRefreshEndpoint) {
      // Direct liquidation if /auth/refresh itself returned 401 (prevent infinite loop)
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('userRole');
      localStorage.removeItem('userEmail');
      sessionStorage.removeItem('pendingPaymentOrderId');
      sessionStorage.removeItem('pendingPaymentPlanId');

      if (!window.location.pathname.includes('/login')) {
        navigate('/login');
      }
    }

    const err = {
      success: false,
      message: response?.data?.message || error.message || 'Request failed',
      errors: response?.data?.errors || [],
    };
    return Promise.reject(err);
  },
);

export const getProviderEarningsSummary = (kitchenId?: string) =>
  api.get(`/payouts/provider/summary${kitchenId ? `?kitchenId=${encodeURIComponent(kitchenId)}` : ''}`);
export const getProviderEarningsHistory = (kitchenId?: string) =>
  api.get(`/payouts/provider/history${kitchenId ? `?kitchenId=${encodeURIComponent(kitchenId)}` : ''}`);

export const getAdminProviderEarningsSummaryAndList = (params?: { search?: string; status?: string }) => {
  const query = new URLSearchParams();
  if (params?.search) query.append('search', params.search);
  if (params?.status) query.append('status', params.status);
  const qStr = query.toString();
  return api.get(`/admin/provider-earnings${qStr ? `?${qStr}` : ''}`);
};

export const getAdminProviderEarningsDetail = (providerId: string, params?: { status?: string }) => {
  const query = new URLSearchParams();
  if (params?.status) query.append('status', params.status);
  const qStr = query.toString();
  return api.get(`/admin/provider-earnings/${encodeURIComponent(providerId)}${qStr ? `?${qStr}` : ''}`);
};

export const markAdminProviderEarningPaid = (earningId: string, payload?: { settlementReference?: string }) =>
  api.patch(`/admin/provider-earnings/${encodeURIComponent(earningId)}/mark-paid`, payload || {});


export const uploadProviderHostelImage = (
  formData: FormData,
  providerId?: string,
  onUploadProgress?: (progressEvent: any) => void,
) =>
  api.post(
    `/providers/me/images${providerId ? `?providerId=${encodeURIComponent(providerId)}` : ''}`,
    formData,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress,
    },
  );

export const replaceProviderHostelImage = (
  imageId: string,
  formData: FormData,
  onUploadProgress?: (progressEvent: any) => void,
) =>
  api.put(
    `/providers/me/images/${encodeURIComponent(imageId)}`,
    formData,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress,
    },
  );

export const getMyHostelImages = (providerId?: string) =>
  api.get(
    `/providers/me/images${providerId ? `?providerId=${encodeURIComponent(providerId)}` : ''}`,
  );

export const deleteProviderHostelImage = (imageId: string) =>
  api.delete(`/providers/me/images/${encodeURIComponent(imageId)}`);

export const getPublicHostelImages = (providerId: string) =>
  api.get(`/providers/${encodeURIComponent(providerId)}/images`);

export const getPaymentHistory = () => api.get('/payments/history');
export const getPaymentDetails = (orderId: string) => api.get(`/payments/${encodeURIComponent(orderId)}/details`);
export const checkPaymentStatus = (orderId: string) => api.get(`/payments/${encodeURIComponent(orderId)}/status`);
export const recoverPendingPayments = () => api.post('/payments/recover-pending');

export const createSupportTicket = (data: {
  razorpayOrderId: string;
  issueType: string;
  description: string;
  utrReference?: string;
}) => api.post('/support/payment-issues', data);

export const getSupportTickets = () => api.get('/support/payment-issues');
export const getSupportTicketByOrderId = (orderId: string) =>
  api.get(`/support/payment-issues/order/${encodeURIComponent(orderId)}`);

// Meal QR & Daily Check-in APIs
export const getProviderMealQr = (providerId?: string) =>
  api.get(`/meal-usage/provider/qr${providerId ? `?providerId=${encodeURIComponent(providerId)}` : ''}`);

export const scanMealCheckIn = (qrToken: string) =>
  api.post('/meal-usage/check-in', { qrToken });

export const getMyMealHistory = () =>
  api.get('/meal-usage/my-history');

export const getProviderTodayCheckIns = (providerId?: string) =>
  api.get(`/meal-usage/provider/today${providerId ? `?providerId=${encodeURIComponent(providerId)}` : ''}`);

export const getProviderSubscriberAttendanceHistory = (subscriptionId: string, providerId?: string) =>
  api.get(`/meal-usage/provider/subscriber/${encodeURIComponent(subscriptionId)}/history${providerId ? `?providerId=${encodeURIComponent(providerId)}` : ''}`);

export const correctProviderCheckIn = (providerId: string, subscriptionId: string, reason: string) =>
  api.post('/meal-usage/provider/correct', { providerId, subscriptionId, reason });

// Meal Recovery APIs
export const getMyRecoveryBalance = (providerId?: string) =>
  api.get(`/meal-recovery/my-balance${providerId ? `?providerId=${encodeURIComponent(providerId)}` : ''}`);

export const getProviderRecoveryStats = (providerId?: string) =>
  api.get(`/meal-recovery/provider/stats${providerId ? `?providerId=${encodeURIComponent(providerId)}` : ''}`);

export const getProviderRecoveryAudit = (providerId?: string) =>
  api.get(`/meal-recovery/provider/audit${providerId ? `?providerId=${encodeURIComponent(providerId)}` : ''}`);

export const processSubscriptionRecovery = (subscriptionId: string, providerId?: string) =>
  api.post(`/meal-recovery/process/${encodeURIComponent(subscriptionId)}${providerId ? `?providerId=${encodeURIComponent(providerId)}` : ''}`);

export const updateProviderRecoveryPercentage = (providerId: string, percentage: number) =>
  api.patch(`/providers/${encodeURIComponent(providerId)}/recovery-percentage`, { percentage });

export const updateProviderMealRecoveryEnabled = (providerId: string, enabled: boolean) =>
  api.patch(`/providers/${encodeURIComponent(providerId)}/recovery-toggle`, { enabled });

// Platform Fee Settings APIs
export interface PublicFeeSettings {
  enabled: boolean;
  type: string;
  amount: number;
  label: string;
}

export interface AdminFeeSettingsResponse {
  settings: {
    enabled: boolean;
    amount: number;
    type: string;
    label: string;
  };
  analytics: {
    platformFeesCollected?: number;
    thisMonthPlatformFees?: number;
    subscriptionsWithFee?: number;
    averagePlatformFee?: number;
    totalCollected?: number;
    thisMonthCollected?: number;
    transactionsWithFeeCount?: number;
    averageFee?: number;
  };
  audits: Array<{
    id: string;
    adminEmail: string;
    settingKey: string;
    previousValue: string;
    newValue: string;
    createdAt: string;
  }>;
}

export const getPublicFeeSettings = (): Promise<PublicFeeSettings> =>
  api.get('/settings/public/fees');

export const getAdminFeeSettings = (): Promise<AdminFeeSettingsResponse> =>
  api.get('/settings/fees');

export const updateAdminFeeSettings = (data: {
  enabled?: boolean;
  amount?: number;
  label?: string;
}) => api.put('/settings/fees', data);

// Production Data Import APIs
export interface ValidationTableSummary {
  name: string;
  file: string;
  declaredCount: number;
  parsedCount: number;
  validCount: number;
  invalidCount: number;
  errors: string[];
}

export interface ForbiddenFieldSummary {
  table: string;
  field: string;
  count: number;
}

export interface ValidationReport {
  valid: boolean;
  packageToken: string;
  exportId: string;
  source: string;
  formatVersion: string;
  exportedAt: string;
  tableSummaries: ValidationTableSummary[];
  foreignKeyCheck: {
    status: 'PASS' | 'FAIL';
    errors: string[];
  };
  forbiddenFieldsFound: ForbiddenFieldSummary[];
  warnings: string[];
  errors: string[];
}

export interface PreviewReport {
  packageToken: string;
  exportId: string;
  source: string;
  exportedAt: string;
  mode: 'REPLACE' | 'MERGE';
  estimatedCounts: {
    users: number;
    providers: number;
    mealPlans: number;
    subscriptions: number;
    mealUsages: number;
    reviews: number;
    providerEarnings: number;
    total: number;
  };
  sampleSanitizedRecords: {
    users?: Array<{ email: string; name: string; role: string }>;
    providers?: Array<{ name: string; city?: string; monthlyPrice?: number }>;
  };
  forbiddenFieldsExcluded: ForbiddenFieldSummary[];
  warnings: string[];
  requiredConfirmationPhrase: string;
}

export interface ExecutionReport {
  importId: string;
  exportId: string;
  source: string;
  mode: 'REPLACE' | 'MERGE';
  status: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  recordCounts: Record<string, number>;
  sanitizedCount: number;
  insertedCount: number;
  updatedCount: number;
  skippedCount: number;
  conflictCount: number;
  forbiddenFieldsCount: number;
  forbiddenFieldsExcluded: ForbiddenFieldSummary[];
  warningCount: number;
  warnings: string[];
  errorSummary?: string | null;
}

export interface ImportHistoryItem {
  id: string;
  importId: string;
  exportId: string;
  source: string;
  mode: 'REPLACE' | 'MERGE';
  status: string;
  initiatedBy: string;
  recordCountsJson?: string;
  sanitizedCount: number;
  insertedCount: number;
  updatedCount: number;
  skippedCount: number;
  conflictCount: number;
  forbiddenFieldsCount: number;
  warningCount: number;
  errorSummary?: string;
  startedAt: string;
  completedAt?: string;
}

export const validateImportPackage = (
  formData: FormData,
  onUploadProgress?: (progressEvent: any) => void,
): Promise<ValidationReport> =>
  api.post('/admin/data-import/validate', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress,
  });

export const previewDataImport = (data: {
  packageToken: string;
  mode: 'REPLACE' | 'MERGE';
}): Promise<PreviewReport> =>
  api.post('/admin/data-import/preview', data);

export const executeDataImport = (data: {
  packageToken: string;
  mode: 'REPLACE' | 'MERGE';
  confirmationPhrase: string;
}): Promise<ExecutionReport> =>
  api.post('/admin/data-import/execute', data);

export const getDataImportProgress = (token: string): Promise<{ stage: string; percent: number; details?: string }> =>
  api.get(`/admin/data-import/progress/${encodeURIComponent(token)}`);

export const getDataImportHistory = (params?: { limit?: number; offset?: number }): Promise<{ items: ImportHistoryItem[]; total: number }> =>
  api.get(`/admin/data-import?limit=${params?.limit || 20}&offset=${params?.offset || 0}`);

export const getDataImportById = (id: string): Promise<ImportHistoryItem> =>
  api.get(`/admin/data-import/${encodeURIComponent(id)}`);

export default api;



