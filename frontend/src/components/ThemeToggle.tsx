'use client';

import { useSyncExternalStore } from 'react';
import { THEME_STORAGE_KEY } from '@/lib/theme-script';

type Theme = 'light' | 'dark';

/**
 * Puente entre el estado externo (atributo data-theme en <html>, mutado por
 * este mismo componente y por el script inline de theme-script.ts) y React,
 * vía useSyncExternalStore — no useEffect+setState, que dispara cascading
 * renders y la regla react-hooks/set-state-in-effect. getServerSnapshot
 * devuelve "light" (lo que el server efectivamente renderiza); React
 * reconcilia solo con el snapshot real del cliente después de hidratar, sin
 * warning de mismatch.
 */
const listeners = new Set<() => void>();

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function getSnapshot(): Theme {
  return (document.documentElement.getAttribute('data-theme') as Theme | null) ?? 'light';
}

function getServerSnapshot(): Theme {
  return 'light';
}

function applyTheme(next: Theme) {
  document.documentElement.setAttribute('data-theme', next);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    // localStorage puede fallar en modo privado/incógnito — el toggle sigue
    // funcionando en memoria durante la sesión, solo no persiste.
  }
  listeners.forEach((cb) => cb());
}

/**
 * Toggle de tema claro/oscuro (Fase 1 — Auditoría de diseño).
 *
 * Ícono propio: sol/luna en trazo de tinta (mismo lenguaje visual que el
 * resto de los "elementos firma" del sistema — círculo de "vencido",
 * sello de "al día") en vez de un ícono de librería genérico.
 */
export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const isDark = theme === 'dark';

  const toggle = () => applyTheme(isDark ? 'light' : 'dark');

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-foreground transition-colors hover:bg-muted"
    >
      <SunMoonIcon isDark={isDark} />
    </button>
  );
}

function SunMoonIcon({ isDark }: { isDark: boolean }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <g style={{ opacity: isDark ? 0 : 1, transition: 'opacity 250ms ease' }}>
        <circle cx="12" cy="12" r="4.3" />
        <path d="M12 2.5v2.3M12 19.2v2.3M4.3 12H2M22 12h-2.3M5.4 5.4l1.6 1.6M17 17l1.6 1.6M18.6 5.4 17 7M7 17l-1.6 1.6" />
      </g>
      <g style={{ opacity: isDark ? 1 : 0, transition: 'opacity 250ms ease' }}>
        <path d="M20 14.2A8.5 8.5 0 1 1 9.8 4a6.7 6.7 0 0 0 10.2 10.2Z" />
      </g>
    </svg>
  );
}
