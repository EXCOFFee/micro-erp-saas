import type { Metadata } from "next";
import { Bitter, Public_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { THEME_INIT_SCRIPT } from "@/lib/theme-script";

const bitter = Bitter({
  variable: "--font-bitter",
  subsets: ["latin"],
  display: "swap",
});

const publicSans = Public_Sans({
  variable: "--font-public-sans",
  subsets: ["latin"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Micro ERP — Gestión de Créditos",
  description: "Sistema de gestión de créditos y cobranzas para comercios. Control de deudores, caja y facturación.",
};

/**
 * RootLayout — Layout raíz de la aplicación.
 *
 * Provee:
 * - Tipografía: Bitter (display/cifras), Public Sans (UI), IBM Plex Mono (tablas de montos)
 * - AuthProvider (contexto de autenticación global)
 * - Tema claro por defecto, con variante oscura vía toggle (data-theme en <html>).
 *   El script inline corre ANTES de hidratar para evitar flash del tema incorrecto —
 *   por eso suppressHydrationWarning en <html>.
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${bitter.variable} ${publicSans.variable} ${plexMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="font-sans antialiased bg-background text-foreground" suppressHydrationWarning>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
