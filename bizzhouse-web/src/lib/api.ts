import axios from 'axios';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token from localStorage to every request
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('bizzhouse_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// Handle 401 — redirect to login
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('bizzhouse_token');
      localStorage.removeItem('bizzhouse_user');
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);

// ─── Auth ──────────────────────────────────────────────
export const authApi = {
  register: (data: {
    email: string;
    password: string;
    name: string;
    businessName: string;
    category?: string;
  }) => api.post('/auth/register', data),

  login: (data: { email: string; password: string }) =>
    api.post('/auth/login', data),

  getProfile: () => api.get('/auth/profile'),
};

// ─── Shops ─────────────────────────────────────────────
export const shopsApi = {
  getMyShop: () => api.get('/shops/me'),
  myStats: () => api.get('/shops/me/stats'),
  myAnalytics: (days = 7) => api.get('/shops/me/analytics', { params: { days } }),
  updateMyShop: (data: { businessName?: string; category?: string }) =>
    api.patch('/shops/me', data),
  // Admin
  listAll: (page = 1, limit = 20) =>
    api.get('/shops/admin/all', { params: { page, limit } }),
  getShop: (id: string) => api.get(`/shops/admin/${id}`),
  updateStatus: (id: string, status: string) =>
    api.patch(`/shops/admin/${id}/status`, { status }),
  platformStats: () => api.get('/shops/admin/stats'),
};

// ─── Wallet ────────────────────────────────────────────
export const walletApi = {
  getBalance: () => api.get('/wallet/balance'),
  getTransactions: (page = 1, limit = 20) =>
    api.get('/wallet/transactions', { params: { page, limit } }),
  recharge: (amountPaise: number) =>
    api.post('/wallet/recharge', { amountPaise }),
  // Admin
  credit: (shopId: string, amountPaise: number, description?: string) =>
    api.post('/wallet/admin/credit', { shopId, amountPaise, description }),
  debit: (shopId: string, amountPaise: number, description?: string) =>
    api.post('/wallet/admin/debit', { shopId, amountPaise, description }),
};

// ─── Messages ──────────────────────────────────────────
export const messagesApi = {
  send: (data: {
    contactWaId: string;
    type: string;
    text?: string;
    contactName?: string;
    templateName?: string;
    templateLanguage?: string;
    templateValues?: string[];
  }) => api.post('/messages/send', data),

  getConversations: (page = 1, limit = 30) =>
    api.get('/messages/conversations', { params: { page, limit } }),

  getConversation: (contactId: string, page = 1, limit = 50) =>
    api.get(`/messages/conversation/${contactId}`, { params: { page, limit } }),

  assign: (contactId: string, assignedUserId: string | null) =>
    api.patch(`/messages/conversation/${contactId}/assign`, { assignedUserId }),
};

// ─── Contacts ──────────────────────────────────────────
export const contactsApi = {
  list: (page = 1, limit = 30, search?: string, tag?: string) =>
    api.get('/contacts', { params: { page, limit, search, tag } }),
  get: (id: string) => api.get(`/contacts/${id}`),
  create: (data: { waId: string; name?: string; tags?: string[] }) =>
    api.post('/contacts', data),
  update: (id: string, data: { name?: string; tags?: string[]; optedIn?: boolean }) =>
    api.patch(`/contacts/${id}`, data),
  import: (contacts: Array<{ waId: string; name?: string; tags?: string[] }>) =>
    api.post('/contacts/import', { contacts }),
};

// ─── Templates ─────────────────────────────────────────
export interface CarouselCardInput {
  headerType: 'IMAGE' | 'VIDEO';
  mediaId: string;
  body: string;
  sampleText?: string;
  buttons?: Array<{ type: 'URL' | 'QUICK_REPLY'; text: string; url?: string }>;
}

export const templatesApi = {
  list: () => api.get('/templates'),
  get: (id: string) => api.get(`/templates/${id}`),
  create: (data: {
    elementName: string;
    category: string;
    body: string;
    language?: string;
    templateType?: 'TEXT' | 'CAROUSEL';
    cards?: CarouselCardInput[];
    vertical?: string;
    headerText?: string;
    footerText?: string;
    example?: string;
    buttons?: Array<string | { type?: string; text: string; url?: string }>;
  }) => api.post('/templates', data),
  /** Pull the real template list from Gupshup (statuses + imports) */
  sync: () => api.post('/templates/sync'),
  /** Edit a not-yet-approved text template */
  update: (
    id: string,
    data: { body?: string; headerText?: string; footerText?: string; example?: string },
  ) => api.put(`/templates/${id}`, data),
  /**
   * Upload an image and get a REAL Gupshup mediaId — mandatory before
   * creating a carousel card (spec §3.3.5).
   */
  uploadMedia: async (file: File): Promise<{ mediaId: string; mediaIds: Record<string, string> }> => {
    const form = new FormData();
    form.append('file', file);
    form.append('fileType', file.type || 'image/jpeg');
    const { data } = await api.post('/templates/media', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
  },
};

// ─── Broadcasts ────────────────────────────────────────
export const broadcastsApi = {
  list: (page = 1, limit = 20) =>
    api.get('/broadcasts', { params: { page, limit } }),
  get: (id: string) => api.get(`/broadcasts/${id}`),
  create: (data: {
    name: string;
    templateName: string;
    templateLanguage?: string;
    templateComponents?: unknown[];
    bodyVariables?: string[];
    audienceTag?: string;
    /** Pin the sending number; omit to let the health-aware router pick */
    gupshupAppId?: string;
    /** Required confirmation to broadcast on a RED/flagged pinned number */
    confirmUnhealthyNumber?: boolean;
  }) => api.post('/broadcasts', data),
  estimate: (tag?: string, templateName?: string) =>
    api.get('/broadcasts/estimate', { params: { tag, templateName } }),
};

// ─── Pricing (platform admin) ──────────────────────────
export const pricingApi = {
  get: () => api.get('/pricing'),
  update: (prices: Record<string, number>) => api.patch('/pricing', { prices }),
};

// ─── Team (shop owner) ─────────────────────────────────
export const teamApi = {
  list: () => api.get('/team'),
  invite: (data: { email: string; password: string; name: string }) =>
    api.post('/team', data),
  remove: (id: string) => api.delete(`/team/${id}`),
};

// ─── Automation rules ──────────────────────────────────
export const automationApi = {
  list: () => api.get('/automation'),
  create: (data: {
    name: string;
    keyword: string;
    matchType?: string;
    replyText: string;
  }) => api.post('/automation', data),
  update: (
    id: string,
    data: {
      name?: string;
      keyword?: string;
      matchType?: string;
      replyText?: string;
      enabled?: boolean;
    },
  ) => api.patch(`/automation/${id}`, data),
  remove: (id: string) => api.delete(`/automation/${id}`),
};

// ─── Gupshup Onboarding ────────────────────────────────
export interface NumberHealth {
  light: 'green' | 'yellow' | 'red';
  qualityRating: 'GREEN' | 'YELLOW' | 'RED' | null;
  messagingTier: string | null;
  dailyCeiling: number;
  sentLast24h: number;
  usageRatio: number;
  failureRateLast24h: number;
  reasons: string[];
}

export interface ConnectedNumber {
  id: string;
  gupshupAppId: string;
  phoneNumber: string | null;
  wabaStatus: 'pending' | 'live' | 'rejected';
  onboardingType: 'new_number' | 'existing_number';
  health: NumberHealth;
}

export const gupshupApi = {
  getStatus: () => api.get('/gupshup/status'),
  getQuality: () => api.get('/gupshup/quality'),
  /** Every connected number + its composite health traffic light (spec §2.3) */
  getNumbers: () => api.get<{ numbers: ConnectedNumber[] }>('/gupshup/numbers'),
  refreshRatings: () => api.post('/gupshup/numbers/ratings/refresh'),
  startOnboarding: (data: {
    onboardingType: 'new_number' | 'existing_number';
    phoneNumber?: string;
  }) => api.post('/gupshup/onboard', data),
};

export default api;
