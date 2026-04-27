"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AxiosError } from 'axios';
import { authService, LoginDto } from '@/lib/auth.service';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();

  const [formData, setFormData] = useState<LoginDto>({
    email: '',
    password: '',
  });
  
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isWarmingUp, setIsWarmingUp] = useState(false);
  const [showColdStartHint, setShowColdStartHint] = useState(false);

  useEffect(() => {
    let isMounted = true;

    setIsWarmingUp(true);
    void authService.warmup().finally(() => {
      if (isMounted) {
        setIsWarmingUp(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setShowColdStartHint(false);
    setLoading(true);
    const slowResponseTimer = window.setTimeout(() => {
      setShowColdStartHint(true);
    }, 6000);

    try {
      const response = await authService.login(formData);
      login(response.access_token);
      // Login exitoso: Redirección limpia al dashboard
      router.push('/dashboard');
    } catch (error) {
      // Manejo de Errores UI: Atrapamos el error que sube desde api.ts
      if (error instanceof AxiosError) {
        if (error.response?.status === 401 || error.response?.status === 404) {
          setErrorMsg('Credenciales inválidas. Verifica tu correo electrónico y contraseña.');
        } else if (
          error.code === 'ECONNABORTED' ||
          error.code === 'ERR_NETWORK'
        ) {
          setErrorMsg(
            'El backend demo puede estar iniciando en Render Free Tier. Espera unos segundos e intenta nuevamente.',
          );
        } else {
          // Errores de validación (400, 422) o de servidor (500)
          setErrorMsg(
            error.response?.data?.message || 
            'Ocurrió un error inesperado al conectar con el servidor.'
          );
        }
      } else {
        // Errores de red (Timeout de 30s) u otros no capturados por Axios propiamente
        setErrorMsg((error as Error).message);
      }
    } finally {
      window.clearTimeout(slowResponseTimer);
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <Card className="w-full max-w-sm border-border bg-card">
        <CardHeader className="text-center space-y-2">
          <CardTitle className="text-2xl">Micro ERP</CardTitle>
          <CardDescription>Acceso corporativo seguro</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            
            {/* Mensaje de Error (Feedback Visual) */}
            {errorMsg && (
              <div className="p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md animate-fade-in font-medium">
                {errorMsg}
              </div>
            )}

            {loading && showColdStartHint && (
              <div className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                Activando servidor de demo en infraestructura free tier. La primera solicitud puede tardar entre 30 y 90 segundos.
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Correo Electrónico</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                disabled={loading}
                value={formData.email}
                onChange={handleChange}
                placeholder="usuario@comercio.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                disabled={loading}
                value={formData.password}
                onChange={handleChange}
                placeholder="••••••••"
              />
            </div>

            <div className="text-right text-sm">
              <Link
                href="/forgot-password"
                className="text-primary underline-offset-4 hover:underline"
              >
                ¿Olvidaste tu contraseña?
              </Link>
            </div>

            <div className="pt-4">
              <Button
                type="submit"
                className="w-full"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Conectando...
                  </>
                ) : (
                  'Iniciar Sesión'
                )}
              </Button>
            </div>

            <div className="pt-2 text-center text-sm text-muted-foreground">
              ¿Aún no tienes cuenta?{' '}
              <Link
                href="/register"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Registrar comercio
              </Link>
            </div>

            <div className="rounded-md border border-border/70 bg-muted/20 p-3 text-xs text-muted-foreground">
              Modo demo: usamos Vercel + Render Free Tier. Si el backend estuvo inactivo, el primer login puede demorar mientras se reactiva.
              {isWarmingUp ? ' Preparando conexión...' : ''}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
