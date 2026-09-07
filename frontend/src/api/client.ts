import axios from 'axios';

// Na Vercel, as API routes ficam no mesmo domínio em /api
// Se VITE_API_URL não estiver definido, usa caminho relativo (funciona em produção e dev com proxy)
const baseURL = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace(/\/$/, '') + '/api'
  : '/api';

const api = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
});

// Timestamp do último login bem-sucedido (proteção contra reload imediato)
let lastLoginAt = 0;
export function markLoginSuccess() {
  lastLoginAt = Date.now();
}

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('bmfarm.token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const url = err.config?.url || '';
    const isAuthRoute = url.includes('/auth/login') || url.includes('/auth/register');
    
    // NUNCA intercepta rotas de autenticação
    if (isAuthRoute) {
      return Promise.reject(err);
    }

    // Não desloga nos primeiros 3 segundos após login (protege contra race conditions)
    if (Date.now() - lastLoginAt < 3000) {
      return Promise.reject(err);
    }

    const isOurApi = url.startsWith('/') || url.includes('/api/');
    const errMsg = typeof err.response?.data?.error === 'string' ? err.response.data.error : '';
    const isTokenError = errMsg.includes('Token') || errMsg.includes('token') || errMsg.includes('expirado');
    const isNotExternalError = !errMsg.includes('Worker') && !errMsg.includes('Cloudflare');
    
    if (err.response?.status === 401 && isOurApi && isNotExternalError && isTokenError) {
      localStorage.removeItem('bmfarm.token');
      localStorage.removeItem('bmfarm.user');
      window.location.reload();
    }
    return Promise.reject(err);
  }
);

export default api;