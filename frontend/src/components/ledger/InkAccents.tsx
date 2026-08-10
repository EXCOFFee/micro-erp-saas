/**
 * Elementos firma del sistema de diseño "libreta de fiado" (Fase 0 del brief).
 *
 * No existían en el código — se introducen acá por primera vez, aplicados
 * al detalle de cliente (Fase 2b), pensados para reutilizarse en cualquier
 * otra página que muestre estado de deuda (lista de clientes, caja, etc.).
 *
 * Ambos son decorativos: el estado real siempre se comunica también por
 * texto/aria-label en el punto de uso (nunca dependen solo de la forma).
 */

/**
 * Trazo de "círculo a mano" alrededor de un monto — para balances vencidos.
 * El color lo hereda de `currentColor`: aplicar la clase de color (ej.
 * `text-destructive`) en el elemento que envuelve a `InkCircle`.
 */
export function InkCircle({
    children,
    className = '',
}: {
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <span className={`relative inline-block ${className}`}>
            <svg
                className="pointer-events-none absolute"
                style={{
                    left: '-0.9rem',
                    right: '-0.9rem',
                    top: '-0.6rem',
                    bottom: '-0.6rem',
                    width: 'calc(100% + 1.8rem)',
                    height: 'calc(100% + 1.2rem)',
                }}
                viewBox="0 0 200 90"
                preserveAspectRatio="none"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                aria-hidden="true"
            >
                <path d="M22 14 C 4 20, 2 45, 14 62 C 30 82, 90 86, 140 80 C 178 76, 198 60, 194 40 C 190 18, 150 4, 100 6 C 60 7, 30 10, 22 14 Z" />
            </svg>
            <span className="relative">{children}</span>
        </span>
    );
}

/**
 * Sello tipo "tampón" — para clientes al día (sin deuda). Borde en vez de
 * relleno sólido (registro de sello de tinta, no un badge de UI genérico),
 * con una leve rotación como si se hubiera estampado a mano.
 */
export function InkStamp({
    label = 'Al día',
    className = '',
}: {
    label?: string;
    className?: string;
}) {
    return (
        <span
            className={`inline-flex items-center rounded-full border-2 border-success px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-success-text ${className}`}
            style={{ transform: 'rotate(-3deg)' }}
        >
            {label}
        </span>
    );
}
