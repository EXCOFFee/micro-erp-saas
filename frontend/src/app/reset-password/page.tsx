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
      <div className="flex h-screen items-center justify-center bg-gray-100">
        <Card className="w-full max-w-md border-t-4 border-red-500 shadow-lg">
          <CardHeader>
            <CardTitle className="text-red-600">Enlace Inválido</CardTitle>
            <CardDescription>
              No se encontró el token de seguridad en la URL.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
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
        message: 'Credenciales actualizadas. Redirigiendo al login...',
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
    <div className="flex h-screen items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md shadow-md">
        <CardHeader>
          <CardTitle>Restablecer Contraseña</CardTitle>
          <CardDescription>
            Ingresa tu nueva credencial de acceso corporativo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new_password">Nueva Contraseña</Label>
              <Input
                id="new_password"
                type="password"
                disabled={isLoading || feedback?.type === 'success'}
                {...register('new_password')}
              />
              {errors.new_password && (
                <p className="text-xs text-red-500">
                  {errors.new_password.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm_password">Confirmar Contraseña</Label>
              <Input
                id="confirm_password"
                type="password"
                disabled={isLoading || feedback?.type === 'success'}
                {...register('confirm_password')}
              />
              {errors.confirm_password && (
                <p className="text-xs text-red-500">
                  {errors.confirm_password.message}
                </p>
              )}
            </div>

            {feedback && (
              <div
                className={`rounded p-3 text-sm ${feedback.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}
              >
                {feedback.message}
              </div>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={isLoading || feedback?.type === 'success'}
            >
              {isLoading ? 'Asegurando credenciales...' : 'Guardar Contraseña'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function ResetPasswordFallback() {
  return (
    <div className="flex h-screen items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md shadow-md">
        <CardHeader>
          <CardTitle>Restablecer Contraseña</CardTitle>
          <CardDescription>Cargando token de seguridad...</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<ResetPasswordFallback />}>
      <ResetPasswordContent />
    </Suspense>
  );
}
