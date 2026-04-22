import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Micro ERP — Gestión de Créditos",
  description: "Sistema de gestión de créditos y cobranzas para comercios. Control de deudores, caja y facturación.",
};

/**
 * RootLayout — Layout raíz de la aplicación.
 *
 * Provee:
 * - Font Inter (tipografía premium)
 * - AuthProvider (contexto de autenticación global)
 * - Dark mode por defecto via clase bg
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased bg-background text-foreground`} suppressHydrationWarning>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
