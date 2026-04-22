import Cookies from 'js-cookie';
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

/**
 * Servicio de Autenticación
 *
 * Maneja la lógica de comunicación con el backend para la gestión de sesiones.
 */
export const authService = {
  /**
   * Inicia sesión en el sistema.
   *
   * @param credentials Email y contraseña del operador
   * @returns La promesa con la respuesta del backend
   */
  async login(credentials: LoginDto): Promise<LoginResponse> {
    const response = await api.post<LoginResponse>('/auth/login', credentials);
    
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
