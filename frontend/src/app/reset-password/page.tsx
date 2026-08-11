'use client';

import { Suspense, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import api from '@/lib/api';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { AuthShell } from '@/components/AuthShell';
import Link from 'next/link';

const ResetPasswordSchema = z
  .object({
    new_password: z
      .string()
      .min(8, 'Debe tener al menos 8 caracteres')
      .regex(/[A-Z]/, 'Debe contener al menos una mayúscula')
      .regex(/[0-9]/, 'Debe contener al menos un número'),
    confirm_password: z.string(),
  })
  .refine((data) => data.new_password === data.confirm_password, {
    message: 'Las contraseñas no coinciden',
    path: ['confirm_password'],
  });

type ResetPasswordFormValues = z.infer<typeof ResetPasswordSchema>;

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');

  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(ResetPasswordSchema),
  });

  if (!token) {
    return (
      <AuthShell>
        <Card>
          <CardHeader>
            <CardTitle className="text-destructive!">Enlace inválido o vencido</CardTitle>
            <CardDescription>
              Este link ya no sirve. Pedí uno nuevo para recuperar tu contraseña.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/forgot-password">
              <Button className="w-full">Pedir un link nuevo</Button>
            </Link>
            <div className="mt-4 text-center text-sm text-muted-foreground">
              <Link href="/login" className="text-primary underline-offset-4 hover:underline">
                Volver al inicio de sesión
              </Link>
            </div>
          </CardContent>
        </Card>
      </AuthShell>
    );
  }

  const onSubmit = async (data: ResetPasswordFormValues) => {
    setIsLoading(true);
    setFeedback(null);
    const idempotencyKey = uuidv4();

    try {
      await api.post(
        '/auth/reset-password',
        {
          token,
          new_password: data.new_password,
        },
        {
          headers: {
            'Idempotency-Key': idempotencyKey,
          },
        },
      );

      setFeedback({
        type: 'success',
        message: 'Contraseña actualizada. Redirigiendo al login...',
      });
      setTimeout(() => router.push('/login'), 3000);
    } catch (error: unknown) {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response
          ?.data?.message || 'Error al procesar la solicitud.';

      setFeedback({
        type: 'error',
        message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthShell>
      <Card>
        <CardHeader className="text-center space-y-2">
          <CardTitle className="text-2xl">Micro ERP</CardTitle>
          <CardDescription>Elegí tu nueva contraseña.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new_password">Nueva Contraseña</Label>
              <Input
                id="new_password"
                type="password"
                disabled={isLoading || feedback?.type === 'success'}
                error={errors.new_password?.message}
                {...register('new_password')}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm_password">Confirmar Contraseña</Label>
              <Input
                id="confirm_password"
                type="password"
                disabled={isLoading || feedback?.type === 'success'}
                error={errors.confirm_password?.message}
                {...register('confirm_password')}
              />
            </div>

            {feedback && (
              <div
                role="alert"
                aria-live="polite"
                className={
                  feedback.type === 'success'
                    ? 'rounded-md border border-success/20 bg-success/10 p-3 text-sm text-success-text'
                    : 'rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive'
                }
              >
                {feedback.message}
              </div>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={isLoading || feedback?.type === 'success'}
            >
              {isLoading ? 'Guardando...' : 'Guardar Contraseña'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </AuthShell>
  );
}

function ResetPasswordFallback() {
  return (
    <AuthShell>
      <Card>
        <CardHeader className="text-center space-y-2">
          <CardTitle className="text-2xl">Micro ERP</CardTitle>
          <CardDescription>Cargando...</CardDescription>
        </CardHeader>
      </Card>
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<ResetPasswordFallback />}>
      <ResetPasswordContent />
    </Suspense>
  );
}
