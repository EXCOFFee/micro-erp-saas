import { TransactionRow } from './TransactionRow';
import { Card } from '@/components/ui/card';

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
            <div className="text-center py-6 text-muted-foreground text-sm">
                No hay movimientos recientes.
            </div>
        );
    }

    return (
        <Card className="p-5">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2 px-1">Últimos Movimientos</h3>
            <div className="divide-y divide-border">
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
        </Card>
    );
}
