'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export const DebtForgivenessSchema = z.object({
  reason: z.string().min(10, "Debe proveer una justificación detallada (mín. 10 caracteres) para la auditoría."),
  action_type: z.enum(['WRITEOFF', 'EXCHANGE', 'DISCOUNT']),
});

export type DebtForgivenessFormValues = z.infer<typeof DebtForgivenessSchema>;

interface DebtForgivenessModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (payload: { reason: string; action_type: 'WRITEOFF' | 'EXCHANGE' | 'DISCOUNT' }, idempotencyKey: string) => Promise<void>;
  isLoading: boolean;
  currentDebtCents: number;
}

export function DebtForgivenessModal({ isOpen, onClose, onSubmit, isLoading, currentDebtCents }: DebtForgivenessModalProps) {
  const { register, handleSubmit, formState: { errors, isValid } } = useForm<DebtForgivenessFormValues>({
    resolver: zodResolver(DebtForgivenessSchema),
    defaultValues: { reason: '', action_type: 'WRITEOFF' },
    mode: 'onChange',
  });

  if (!isOpen) return null;

  const handleFormSubmit = async (data: DebtForgivenessFormValues) => {
    const idempotencyKey = uuidv4();
    await onSubmit({ reason: data.reason, action_type: data.action_type }, idempotencyKey);
  };

  const currentDebtAmount = currentDebtCents / 100;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-surface rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden border border-destructive/30">
        <div className="p-6">
          <div className="flex items-center gap-2 mb-4 text-destructive">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            <h2 className="text-xl font-bold">Condonación de Deuda</h2>
          </div>
          
          <div className="bg-destructive/10 p-4 rounded-lg mb-4 text-sm text-foreground">
            Estás a punto de anular una deuda de <strong className="text-destructive">${currentDebtAmount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</strong>. Esta acción quedará registrada en auditoría.
          </div>

          <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="action_type">Tipo de Condonación</Label>
              <select
                id="action_type"
                {...register('action_type')}
                disabled={isLoading}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="WRITEOFF">Incobrable (Pérdida)</option>
                <option value="EXCHANGE">Canje (Intercambio de bienes/servicios)</option>
                <option value="DISCOUNT">Descuento Especial</option>
              </select>
              {errors.action_type && <p className="text-xs text-destructive">{errors.action_type.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="reason">Justificación (Auditoría) *</Label>
              <textarea
                id="reason"
                {...register('reason')}
                disabled={isLoading}
                placeholder="Explique el motivo detalladamente..."
                rows={4}
                className={`flex w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${errors.reason ? 'border-destructive focus-visible:ring-destructive' : 'border-input'}`}
              />
              {errors.reason && <p className="text-xs text-destructive">{errors.reason.message}</p>}
            </div>

            <div className="pt-4 border-t border-border flex gap-3">
              <Button 
                type="submit" 
                disabled={isLoading || !isValid} 
                variant="destructive"
                className="flex-1"
              >
                {isLoading ? 'Ejecutando...' : 'Condonar Deuda'}
              </Button>
              <Button 
                type="button" 
                variant="secondary" 
                onClick={onClose} 
                disabled={isLoading}
              >
                Cancelar
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
