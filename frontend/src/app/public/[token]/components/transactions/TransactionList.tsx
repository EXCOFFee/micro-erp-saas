import { TransactionRow } from './TransactionRow';

interface TransactionListProps {
    debts: Array<{ amount_cents: number; description: string | null; created_at: string }>;
    payments: Array<{ amount_cents: number; created_at: string }>;
}

export function TransactionList({ debts, payments }: TransactionListProps) {
    // Unificar y ordenar por fecha (más reciente primero)
    const all = [
        ...debts.map(d => ({ type: 'DEBT' as const, amountCents: d.amount_cents, description: d.description, date: d.created_at })),
        ...payments.map(p => ({ type: 'PAYMENT' as const, amountCents: p.amount_cents, description: null, date: p.created_at }))
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    if (all.length === 0) {
        return (
            <div className="text-center py-6 text-slate-400 text-sm">
                No hay movimientos recientes.
            </div>
        );
    }

    return (
        <div className="bg-white rounded-3xl p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100/50">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2 px-1">Últimos Movimientos</h3>
            <div className="divide-y divide-slate-100">
                {all.map((tx, idx) => (
                    <TransactionRow
                        key={idx}
                        type={tx.type}
                        amountCents={tx.amountCents}
                        date={tx.date}
                        description={tx.description}
                    />
                ))}
            </div>
        </div>
    );
}
