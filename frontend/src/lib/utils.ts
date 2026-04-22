/**
 * Utilidad central para procesar clases de Tailwind.
 * (Versión nativa fallback construida sin dependencias externas)
 */
export function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(' ');
}
