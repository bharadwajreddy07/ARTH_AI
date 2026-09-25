import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({ baseURL: API_URL });

// Attach token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('arth_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Handle 401
api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('arth_token');
      localStorage.removeItem('arth_user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// Auth
export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  me: () => api.get('/auth/me'),
  updateProfile: (data) => api.put('/auth/profile', data),
};

// Stocks
export const stockAPI = {
  search: (q) => api.get('/stocks/search', { params: { q } }),
  quote: (symbol) => api.get(`/stocks/quote/${symbol}`),
  quoteBoth: (symbol) => api.get(`/stocks/quote-both/${symbol}`),
  deep: (symbol) => api.get(`/stocks/deep/${symbol}`),
  fno: () => api.get('/stocks/fno'),
  bonds: () => api.get('/stocks/bonds'),
  ipos: () => api.get('/stocks/ipos'),
  history: (symbol, period, interval) => api.get(`/stocks/history/${symbol}`, { params: { period, interval } }),
  gainers: () => api.get('/stocks/gainers'),
  losers: () => api.get('/stocks/losers'),
  indices: () => api.get('/stocks/indices'),
  popular: () => api.get('/stocks/popular'),
};

// Mutual Funds
export const mfAPI = {
  search: (q) => api.get('/mutual-funds/search', { params: { q } }),
  popular: () => api.get('/mutual-funds/popular'),
  details: (code) => api.get(`/mutual-funds/${code}`),
  compare: (codes) => api.post('/mutual-funds/compare', { codes }),
};

// News
export const newsAPI = {
  market: (category) => api.get('/news/market', { params: { category } }),
  stock: (symbol) => api.get(`/news/stock/${symbol}`),
  search: (query, category = 'india', limit = 12) => api.get('/news/search', { params: { query, category, limit } }),
};

// AI
export const aiAPI = {
  chat: (message, context) => api.post('/ai/chat', { message, context }),
  analyze: (symbol) => api.get(`/ai/analyze/${symbol}`),
  analyzeRealtime: (symbol) => api.get(`/ai/analyze-realtime/${symbol}`),
  analyzeMutualFund: (schemeCode) => api.get(`/ai/analyze-mf/${schemeCode}`),
  compare: (symbols) => api.post('/ai/compare', { symbols }),
  forecast: (symbol, scenario) => api.post('/ai/forecast', { symbol, scenario }),
  status: () => api.get('/ai/status'),
  diagnostics: () => api.get('/ai/diagnostics'),
  ragStatus: () => api.get('/ai/rag/status'),
  ragDocuments: (limit = 25) => api.get('/ai/rag/documents', { params: { limit } }),
  ragIngest: (documents, replace = false, source = 'frontend') => api.post('/ai/rag/ingest', { documents, replace, source }),
  ragClear: () => api.delete('/ai/rag/documents'),
};

export const providerAPI = {
  status: () => api.get('/providers/status')
};

// Portfolio
export const portfolioAPI = {
  get: () => api.get('/portfolio'),
  analytics: () => api.get('/portfolio/analytics'),
  addHolding: (data) => api.post('/portfolio/holding', data),
  removeHolding: (symbol) => api.delete(`/portfolio/holding/${symbol}`),
};

// Watchlist
export const watchlistAPI = {
  get: () => api.get('/watchlist'),
  add: (data) => api.post('/watchlist/add', data),
  remove: (symbol) => api.delete(`/watchlist/remove/${symbol}`),
};

export default api;
