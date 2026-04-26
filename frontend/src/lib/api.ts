import axios, { AxiosError } from 'axios';
import Cookies from 'js-cookie';

/**
 * Cliente API (Axios) — Micro ERP SaaS
 *
 * Configuración Core:
 * - baseURL apunta a process.env.NEXT_PUBLIC_API_URL
 * - Timeout estricto de 30 segundos mitigando el Cold Start de Render
 */
export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

/** Clave usada para guardar el JWT en las cookies */
export const TOKEN_COOKIE_KEY = 'micro_erp_auth_token';

/**
 * Interceptor de Request:
 * Antes de que la petición salga, inyecta el token JWT desde las cookies
 * en el header Authorization: Bearer <token>.
 */
api.interceptors.request.use(
  (config) => {
    // Si estamos en entorno servidor, js-cookie fallará, validamos que estemos en el cliente
    if (typeof window !== 'undefined') {
      const token = Cookies.get(TOKEN_COOKIE_KEY);
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error),
);

/**
 * Interceptor de Response:
 * Procesa errores de red o servidor. En específico, atrapa los 401 Unauthorized
 * y expulsa al usuario al instante hacia el portal de login.
 */
api.interceptors.response.use(
  (response) => {
    // La petición fue exitosa (2xx)
    return response;
  },
  (error: AxiosError) => {
    // Si la API responde con 401 (Token expirado, inválido o Kill Switch activado)
    if (error.response?.status === 401) {
      if (typeof window !== 'undefined') {
        // Purgamos el token localmente para prevenir bucles de redirección
        Cookies.remove(TOKEN_COOKIE_KEY);

        // Forzamos una redirección limpia a la ruta de inicio de sesión
        window.location.href = '/login';
      }
    }

    // Retorna el error original para que el componente React pueda manejarlo
    return Promise.reject(error);
  },
);

/**
 * Funciones Helper para manejo local del token (compatibilidad temporal con AuthContext antiguo)
 */
export function setToken(token: string): void {
  Cookies.set(TOKEN_COOKIE_KEY, token, {
    expires: 1, // 1 día
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  });
}

export function getToken(): string | null {
  return Cookies.get(TOKEN_COOKIE_KEY) || null;
}

export function removeToken(): void {
  Cookies.remove(TOKEN_COOKIE_KEY);
}

/**
 * Fetch especial para descargar archivos (CSV export).
 * Devuelve un Blob en lugar de un JSON usando Axios.
 */
export async function apiBlob(endpoint: string): Promise<Blob> {
  const response = await api.get(endpoint, {
    responseType: 'blob',
  });
  return response.data;
}

export default api;
