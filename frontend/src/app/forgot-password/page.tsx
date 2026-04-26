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
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md shadow-md">
        <CardHeader>
          <CardTitle>Recuperar Contraseña</CardTitle>
          <CardDescription>
            Ingresa tu correo corporativo para recibir un enlace seguro de recuperación.
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
              <div className="rounded bg-blue-50 p-3 text-sm text-blue-800">
                {feedback}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? 'Procesando solicitud...' : 'Enviar enlace de recuperación'}
            </Button>
          </form>

          <div className="mt-4 text-center text-sm text-muted-foreground">
            <Link className="underline" href="/login">
              Volver al inicio de sesión
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
