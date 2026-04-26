import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:4000/api',
  timeout: 15000,
  withCredentials: true,
});

const refreshClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:4000/api',
  timeout: 15000,
  withCredentials: true,
});

let refreshPromise = null;

async function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = refreshClient.post('/auth/refresh')
      .then((res) => {
        const token = res.data?.accessToken || res.data?.token;
        if (token) {
          localStorage.setItem('token', token);
        }
        if (res.data?.user) {
          localStorage.setItem('user', JSON.stringify(res.data.user));
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('auth:updated', { detail: { user: res.data.user, token } }));
          }
        }
        return res.data;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.code === 'ECONNABORTED') {
      error.response = {
        data: { error: 'Request timeout. Server terlalu lama merespons.' }
      };
    }

    const status = error.response?.status;
    const originalRequest = error.config || {};
    const isAuthRoute = typeof originalRequest.url === 'string' && originalRequest.url.includes('/auth/');

    if (status === 401 && !originalRequest._retry && !isAuthRoute) {
      originalRequest._retry = true;
      try {
        await refreshAccessToken();
        const token = localStorage.getItem('token');
        if (token) {
          originalRequest.headers = originalRequest.headers || {};
          originalRequest.headers.Authorization = `Bearer ${token}`;
        }
        return api(originalRequest);
      } catch {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        if (typeof window !== 'undefined') {
          window.location.href = '/';
        }
      }
    }

    if (status === 403 || status === 401) {
      if (typeof window !== 'undefined' && localStorage.getItem('token')) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
