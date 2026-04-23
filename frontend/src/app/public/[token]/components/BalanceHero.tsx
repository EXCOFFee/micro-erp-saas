import { formatCents } from '@/lib/format';

interface BalanceHeroProps {
    balanceCents: number;
}

export function BalanceHero({ balanceCents }: BalanceHeroProps) {
    const isDebt = balanceCents > 0;
    
    return (
        <div className="text-center py-8">
            <p className="text-sm font-medium text-slate-500 mb-2">Saldo Actual</p>
            <h2 className={`text-5xl font-extrabold tracking-tighter ${isDebt ? 'text-rose-600' : 'text-emerald-500'}`}>
                {formatCents(balanceCents)}
            </h2>
            <p className="text-xs font-medium text-slate-400 mt-3">
                {isDebt ? 'Pendiente de pago' : 'Cuenta al día'}
            </p>
        </div>
    );
}
