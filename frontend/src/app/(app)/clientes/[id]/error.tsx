'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error('Client Details Error:', error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center bg-destructive/10 rounded-2xl border border-destructive/20">
      <div className="text-destructive mb-4">
        <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
      </div>
      <h2 className="text-2xl font-bold text-foreground mb-2">¡Ups! Algo salió mal</h2>
      <p className="text-muted-foreground mb-6 max-w-md">
        Hubo un problema al cargar el perfil de este cliente. Puede deberse a una inconsistencia de datos o un error temporal de red.
      </p>
      <div className="flex gap-4">
        <Button onClick={() => reset()}>
          Intentar de nuevo
        </Button>
        <Button variant="secondary" onClick={() => window.location.href = '/clientes'}>
          Volver a clientes
        </Button>
      </div>
      {process.env.NODE_ENV !== 'production' && (
        <pre className="mt-8 p-4 bg-black/80 text-red-400 text-xs text-left overflow-auto max-w-full rounded">
          {error.message}
        </pre>
      )}
    </div>
  );
}
