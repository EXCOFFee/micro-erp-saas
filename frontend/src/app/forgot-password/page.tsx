'use client';

import { useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { AuthShell } from '@/components/AuthShell';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setFeedback(null);

    try {
      const response = await api.post<{ message: string }>('/auth/forgot-password', {
        email,
      });

      setFeedback(response.data.message);
    } catch {
      setFeedback(
        'Si el correo existe en nuestro sistema, recibirás instrucciones para restablecer tu contraseña.',
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthShell>
      <Card>
        <CardHeader className="text-center space-y-2">
          <CardTitle className="text-2xl">Micro ERP</CardTitle>
          <CardDescription>
            Ingresá tu email y te mandamos un link para recuperar tu contraseña.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label htmlFor="email">Correo Electrónico</Label>
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                disabled={isLoading}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="usuario@comercio.com"
              />
            </div>

            {feedback && (
              <div role="status" aria-live="polite" className="rounded-md bg-success/10 border border-success/20 p-3 text-sm text-success-text">
                {feedback}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? 'Procesando solicitud...' : 'Enviar enlace de recuperación'}
            </Button>
          </form>

          <div className="mt-4 text-center text-sm text-muted-foreground">
            <Link href="/login" className="text-primary underline-offset-4 hover:underline">
              Volver al inicio de sesión
            </Link>
            {' · '}
            <Link href="/register" className="text-primary underline-offset-4 hover:underline">
              Registrar comercio
            </Link>
          </div>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
