'use client';

import { createContext, useContext, useState, useCallback, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { getToken, setToken, removeToken } from '@/lib/api';
import type { JwtPayload, UserRole } from '@/types';

/**
 * Shape del contexto de autenticación.
 */
interface AuthContextType {
    /** Usuario actual decodificado del JWT (null si no logueado) */
    user: AuthUser | null;
    /** True mientras se verifica el token al cargar la app */
    loading: boolean;
    /** Guarda el token y actualiza el estado */
    login: (token: string) => void;
    /** Limpia el token y redirige a /login */
    logout: () => void;
    /** True si el usuario es ADMIN */
    isAdmin: boolean;
}

interface AuthUser {
    id: string;
    tenant_id: string;
    email: string;
    role: UserRole;
}

const AuthContext = createContext<AuthContextType | null>(null);

/**
 * Decodifica un JWT sin verificar la firma (solo para UI).
 * La verificación real la hace el backend en cada request.
 */
function decodeJwt(token: string): JwtPayload | null {
    try {
        const payload = token.split('.')[1];
        const decoded = JSON.parse(atob(payload));
        return decoded as JwtPayload;
    } catch {
        return null;
    }
}

/** Extrae un AuthUser del token actual (si válido). */
function getUserFromToken(): AuthUser | null {
    const token = getToken();
    if (!token) return null;
    const payload = decodeJwt(token);
    if (!payload || payload.exp * 1000 <= Date.now()) {
        removeToken();
        return null;
    }
    return {
        id: payload.sub,
        tenant_id: payload.tenant_id,
        email: payload.email,
        role: payload.role,
    };
}

/** SSR-safe check — loading is true during server-side render. */
function subscribe() { return () => { }; }
function getSnapshot() { return false; }
function getServerSnapshot() { return true; }

/**
 * AuthProvider — Envuelve la app con el contexto de autenticación.
 *
 * Usa useSyncExternalStore para detectar SSR vs client (loading).
 * Usa useState initializer para parsear JWT (no useEffect).
 */
export function AuthProvider({ children }: { children: ReactNode }) {
    // loading = true en SSR, false en client
    const loading = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

    const [user, setUser] = useState<AuthUser | null>(() => getUserFromToken());

    const login = useCallback((token: string) => {
        setToken(token);
        const payload = decodeJwt(token);
        if (payload) {
            setUser({
                id: payload.sub,
                tenant_id: payload.tenant_id,
                email: payload.email,
                role: payload.role,
            });
        }
    }, []);

    const logout = useCallback(() => {
        removeToken();
        setUser(null);
        window.location.href = '/login';
    }, []);

    const isAdmin = user?.role === 'ADMIN';

    return (
        <AuthContext.Provider value={{ user, loading, login, logout, isAdmin }}>
            {children}
        </AuthContext.Provider>
    );
}

/**
 * Hook para acceder al contexto de autenticación.
 * Lanza error si se usa fuera del AuthProvider.
 */
export function useAuth(): AuthContextType {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth debe usarse dentro de un AuthProvider');
    }
    return context;
}
