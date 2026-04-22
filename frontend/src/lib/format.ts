/**
 * Utilidades de formato para el frontend.
 * Centraliza la conversión de centavos a moneda y otras transformaciones.
 */

/**
 * Convierte centavos a formato de moneda argentino.
 * Ej: 1500050 → "$15.000,50"
 *
 * Regla de Oro III: El backend SIEMPRE envía centavos (INT).
 * La conversión visual se hace SOLO en el frontend.
 */
export function formatCents(cents: number): string {
    const amount = cents / 100;
    return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
        minimumFractionDigits: 2,
    }).format(amount);
}

/**
 * Formatea una fecha ISO a formato legible argentino.
 * Ej: "2024-03-15T14:30:00Z" → "15/03/2024 14:30"
 */
export function formatDate(isoDate: string): string {
    return new Intl.DateTimeFormat('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(new Date(isoDate));
}

/**
 * Formatea solo la fecha sin hora.
 * Ej: "2024-03-15" → "15/03/2024"
 */
export function formatDateShort(isoDate: string): string {
    return new Intl.DateTimeFormat('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    }).format(new Date(isoDate));
}
