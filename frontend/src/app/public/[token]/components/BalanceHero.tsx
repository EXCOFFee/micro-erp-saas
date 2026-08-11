import { formatCents } from '@/lib/format';
import { InkCircle, InkStamp } from '@/components/ledger/InkAccents';

interface BalanceHeroProps {
    balanceCents: number;
}

export function BalanceHero({ balanceCents }: BalanceHeroProps) {
    const isDebt = balanceCents > 0;

    return (
        <div className="text-center py-8">
            <p className="text-sm font-medium text-muted-foreground mb-2">Saldo Actual</p>
            <h2
                className={`font-display text-5xl font-extrabold tracking-tighter ${isDebt ? 'text-destructive' : 'text-success-text'}`}
                aria-label={isDebt ? `Saldo pendiente: ${formatCents(balanceCents)}` : undefined}
            >
                {isDebt ? <InkCircle>{formatCents(balanceCents)}</InkCircle> : formatCents(balanceCents)}
            </h2>
            <div className="mt-3 flex items-center justify-center gap-2">
                <p className="text-xs font-medium text-muted-foreground">
                    {isDebt ? 'Pendiente de pago' : 'Cuenta al día'}
                </p>
                {!isDebt && <InkStamp />}
            </div>
        </div>
    );
}
