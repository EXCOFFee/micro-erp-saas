'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AxiosError } from 'axios';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import type { LoginResponse, RegisterPayload } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Página de Registro — Onboarding de nuevo comercio (CU-SAAS-01).
 *
 * Crea un Tenant + User ADMIN en una sola transacción ACID (backend).
 * Después del registro, loguea automáticamente al usuario.
 */
export default function RegisterPage() {
    const router = useRouter();
    const { login } = useAuth();

    const [tenantName, setTenantName] = useState('');
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const payload: RegisterPayload = {
                tenant_name: tenantName,
                name,
                email,
                password,
            };
            const response = await api.post<LoginResponse>('/auth/register', payload);

            login(response.data.access_token);
            router.push('/dashboard');
        } catch (err) {
            if (err instanceof AxiosError && err.response?.data?.message) {
                 setError(err.response.data.message);
            } else {
                 setError(err instanceof Error ? err.message : 'Error al registrar');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4">
            <Card className="w-full max-w-md">
                <CardHeader className="text-center space-y-2 pb-6">
                    <CardTitle className="text-3xl text-primary">Micro ERP</CardTitle>
                    <CardDescription>Registrá tu comercio en 30 segundos</CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="tenantName">Nombre del comercio</Label>
                            <Input
                                id="tenantName"
                                type="text"
                                value={tenantName}
                                onChange={(e) => setTenantName(e.target.value)}
                                required
                                placeholder="Kiosco Carlitos"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="name">Tu nombre (Administrador)</Label>
                            <Input
                                id="name"
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                required
                                minLength={2}
                                placeholder="Juan Pérez"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="email">Email</Label>
                            <Input
                                id="email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                placeholder="admin@micomercio.com"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="password">Contraseña</Label>
                            <Input
                                id="password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                minLength={8}
                                placeholder="Mínimo 8 caracteres"
                            />
                        </div>

                        {error && (
                            <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 text-destructive text-sm font-medium animate-fade-in">
                                {error}
                            </div>
                        )}

                        <div className="pt-2">
                          <Button
                              type="submit"
                              className="w-full"
                              disabled={loading}
                          >
                              {loading ? (
                                  <span className="flex items-center justify-center gap-2">
                                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                      </svg>
                                      Registrando...
                                  </span>
                              ) : (
                                  'Crear comercio'
                              )}
                          </Button>
                        </div>
                    </form>
                </CardContent>
                <CardFooter className="flex justify-center border-t border-border pt-6">
                    <p className="text-sm text-muted-foreground">
                        ¿Ya tenés cuenta?{' '}
                        <Link href="/login" className="text-primary hover:underline underline-offset-4 transition-all">
                            Iniciá sesión
                        </Link>
                    </p>
                </CardFooter>
            </Card>
        </div>
    );
}
