/**
 * Shell compartido de las 4 páginas de autenticación (login, register,
 * forgot-password, reset-password) — Fase 2d del rediseño.
 *
 * Antes no existía: cada página repetía su propio contenedor con
 * variaciones reales (bg-gray-50 vs bg-background, h-screen vs
 * min-h-screen, max-w-sm vs max-w-md, shadow-md vs shadow-lg vs ninguna)
 * — no solo inconsistente, con un bug real (h-screen en vez de
 * min-h-screen podía cortar contenido en pantallas chicas con varios
 * mensajes de error apilados). Un solo componente elimina la deriva.
 */
export function AuthShell({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4">
            <div className="w-full max-w-md">{children}</div>
        </div>
    );
}
