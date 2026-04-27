import Cookies from 'js-cookie';
import { AxiosError } from 'axios';
import { api, TOKEN_COOKIE_KEY } from './api';

export interface LoginDto {
  email: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  user: {
    id: string;
    email: string;
    role: string;
    tenant_id: string;
  };
}

const LOGIN_TIMEOUT_MS = 90000;
const LOGIN_RETRY_DELAY_MS = 1500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isRetryableLoginError(error: unknown): boolean {
  if (!(error instanceof AxiosError)) {
    return false;
  }

  // Cold-start y problemas transitorios de red/tiempo en infraestructura free tier.
  return error.code === 'ECONNABORTED' || error.code === 'ERR_NETWORK';
}

/**
 * Servicio de Autenticación
 *
 * Maneja la lógica de comunicación con el backend para la gestión de sesiones.
 */
export const authService = {
  /**
   * Warm-up silencioso para despertar el backend en planes free.
   * Nunca bloquea la UI ni muestra error al usuario.
   */
  async warmup(): Promise<void> {
    try {
      await api.get('/health', { timeout: 25000 });
    } catch {
      // Intencionalmente ignorado: el warm-up es best-effort.
    }
  },

  /**
   * Inicia sesión en el sistema.
   *
   * @param credentials Email y contraseña del operador
   * @returns La promesa con la respuesta del backend
   */
  async login(credentials: LoginDto): Promise<LoginResponse> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const response = await api.post<LoginResponse>('/auth/login', credentials, {
          timeout: LOGIN_TIMEOUT_MS,
        });

        // Extraemos el token y lo guardamos de forma segura en las cookies.
        // Al guardarlo aquí, el interceptor de api.ts lo inyectará automáticamente
        // en todas las peticiones futuras.
        const token = response.data.access_token;
        if (token) {
          Cookies.set(TOKEN_COOKIE_KEY, token, {
            expires: 1, // 1 día de expiración local
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
          });
        }

        return response.data;
      } catch (error) {
        lastError = error;

        if (!isRetryableLoginError(error) || attempt === 2) {
          throw error;
        }

        await sleep(LOGIN_RETRY_DELAY_MS);
      }
    }
    
    throw lastError;
  },

  /**
   * Cierra sesión purgando el token local y redirigiendo al login.
   */
  logout(): void {
    Cookies.remove(TOKEN_COOKIE_KEY);
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  }
};
