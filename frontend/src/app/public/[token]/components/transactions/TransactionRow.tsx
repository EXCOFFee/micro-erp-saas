import { formatCents } from '@/lib/format';

interface TransactionRowProps {
    type: 'DEBT' | 'PAYMENT';
    amountCents: number;
    date: string;
    description?: string | null;
}

export function TransactionRow({ type, amountCents, date, description }: TransactionRowProps) {
    const isDebt = type === 'DEBT';
    
    return (
        <div className="flex items-center justify-between py-4">
            <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isDebt ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success-text'}`}>
                    {isDebt ? (
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                        </svg>
                    ) : (
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                        </svg>
                    )}
                </div>
                <div>
                    <p className="text-sm font-semibold text-foreground">
                        {isDebt ? (description || 'Compra a cuenta') : 'Pago entregado'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                        {new Date(date).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}
                    </p>
                </div>
            </div>
            <div className="text-right">
                <p className={`font-mono-ledger text-base font-bold ${isDebt ? 'text-destructive' : 'text-success-text'}`}>
                    {isDebt ? '-' : '+'}{formatCents(amountCents)}
                </p>
            </div>
        </div>
    );
}
