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
    // Só faz logout se o 401 vier da NOSSA API de autenticação (token JWT expirado)
    // NÃO desloga por erros de Cloudflare, SMS ou outros serviços
    const url = err.config?.url || '';
    const isOurApi = url.includes('/api/') || url.startsWith('/');
    const isNotExternalError = !err.response?.data?.error?.includes('Worker') && !err.response?.data?.error?.includes('Cloudflare');
    const isAuthRoute = !url.includes('/auth/register') && !url.includes('/auth/login');
    
    if (err.response?.status === 401 && isOurApi && isNotExternalError && isAuthRoute) {
      // Verifica se a mensagem é realmente sobre token expirado
      const msg = err.response?.data?.error || '';
      if (msg.includes('Token') || msg.includes('token') || msg.includes('autorização')) {
        localStorage.removeItem('bmfarm.token');
        localStorage.removeItem('bmfarm.user');
        window.location.reload();
      }
    }
    return Promise.reject(err);
  }
);

export default api;