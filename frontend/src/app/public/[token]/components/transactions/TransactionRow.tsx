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
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isDebt ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'}`}>
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
                    <p className="text-sm font-semibold text-slate-800">
                        {isDebt ? (description || 'Compra a cuenta') : 'Pago entregado'}
                    </p>
                    <p className="text-xs text-slate-400">
                        {new Date(date).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}
                    </p>
                </div>
            </div>
            <div className="text-right">
                <p className={`text-base font-bold ${isDebt ? 'text-rose-600' : 'text-emerald-500'}`}>
                    {isDebt ? '-' : '+'}{formatCents(amountCents)}
                </p>
            </div>
        </div>
    );
}
