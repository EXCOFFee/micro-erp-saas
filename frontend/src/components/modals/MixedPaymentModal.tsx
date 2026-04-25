'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export const MixedPaymentSchema = z.object({
  cash_amount: z.coerce.number().min(0, "El monto no puede ser negativo"),
  transfer_amount: z.coerce.number().min(0, "El monto no puede ser negativo"),
  description: z.string().optional(),
}).refine((data) => data.cash_amount > 0 || data.transfer_amount > 0, {
  message: "Debe ingresar al menos un monto mayor a 0",
  path: ["cash_amount"], 
});

export type MixedPaymentFormValues = z.infer<typeof MixedPaymentSchema>;

interface MixedPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (payload: { cash_cents: number; transfer_cents: number; description?: string }, idempotencyKey: string) => Promise<void>;
  isLoading: boolean;
}

export function MixedPaymentModal({ isOpen, onClose, onSubmit, isLoading }: MixedPaymentModalProps) {
  const { register, handleSubmit, watch, formState: { errors, isValid } } = useForm<MixedPaymentFormValues>({
    resolver: zodResolver(MixedPaymentSchema),
    defaultValues: { cash_amount: 0, transfer_amount: 0, description: '' },
    mode: 'onChange',
  });

  const cashAmount = watch('cash_amount') || 0;
  const transferAmount = watch('transfer_amount') || 0;
  const totalAmount = Number(cashAmount) + Number(transferAmount);

  if (!isOpen) return null;

  const handleFormSubmit = async (data: MixedPaymentFormValues) => {
    const cash_cents = Math.round(data.cash_amount * 100);
    const transfer_cents = Math.round(data.transfer_amount * 100);
    
    if (isNaN(cash_cents) || isNaN(transfer_cents)) {
      alert('Error en el cálculo de montos. Verifique los valores ingresados.');
      return;
    }

    const idempotencyKey = uuidv4();
    await onSubmit({ cash_cents, transfer_cents, description: data.description }, idempotencyKey);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-surface rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden border border-border">
        <div className="p-6">
          <h2 className="text-xl font-bold text-foreground mb-4">Registrar Pago Mixto</h2>
          
          <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cash_amount">Efectivo ($)</Label>
              <Input
                id="cash_amount"
                type="number"
                step="0.01"
                min="0"
                {...register('cash_amount')}
                disabled={isLoading}
                className={errors.cash_amount ? 'border-destructive' : ''}
              />
              {errors.cash_amount && <p className="text-xs text-destructive">{errors.cash_amount.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="transfer_amount">Transferencia ($)</Label>
              <Input
                id="transfer_amount"
                type="number"
                step="0.01"
                min="0"
                {...register('transfer_amount')}
                disabled={isLoading}
                className={errors.transfer_amount ? 'border-destructive' : ''}
              />
              {errors.transfer_amount && <p className="text-xs text-destructive">{errors.transfer_amount.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descripción (Opcional)</Label>
              <Input
                id="description"
                {...register('description')}
                disabled={isLoading}
                placeholder="Ej: Pago de cuota mensual"
              />
            </div>

            <div className="pt-4 border-t border-border flex flex-col gap-4">
              <div className="flex justify-between items-center text-lg font-semibold text-foreground">
                <span>Total a Cobrar:</span>
                <span className={totalAmount > 0 ? 'text-primary' : ''}>
                  ${totalAmount.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              
              <div className="flex gap-3">
                <Button 
                  type="submit" 
                  disabled={isLoading || !isValid} 
                  className="flex-1"
                >
                  {isLoading ? 'Procesando...' : 'Confirmar Pago'}
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
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
