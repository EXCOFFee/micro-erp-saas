"use client";

import { useState } from 'react';
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);

    try {
      const response = await authService.login(formData);
      login(response.access_token);
      // Login exitoso: Redirección limpia al dashboard
      router.push('/dashboard');
    } catch (error) {
      setLoading(false);
      // Manejo de Errores UI: Atrapamos el error que sube desde api.ts
      if (error instanceof AxiosError) {
        if (error.response?.status === 401 || error.response?.status === 404) {
          setErrorMsg('Credenciales inválidas. Verifica tu correo electrónico y contraseña.');
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
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
