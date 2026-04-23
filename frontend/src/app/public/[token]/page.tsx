import { notFound } from 'next/navigation';
import { PublicHeader } from './components/PublicHeader';
import { BalanceHero } from './components/BalanceHero';
import { TransactionList } from './components/transactions/TransactionList';

export const dynamic = 'force-dynamic'; // Ensures this page is never statically cached
export const fetchCache = 'force-no-store'; // Bypass Next.js fetch cache completely

export default async function PublicSummaryPage({ params }: { params: { token: string } }) {
    const { token } = params;

    // Fetch al backend SSR (el token expira en 72h)
    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    
    let res;
    try {
        res = await fetch(`${API_URL}/public/summary/${token}`, {
            cache: 'no-store', // No guardar en caché para ver siempre el saldo real
            headers: {
                'Content-Type': 'application/json',
            }
        });
    } catch (e) {
        throw new Error('Error interno del servidor al conectar con la API.');
    }

    if (res.status === 404 || res.status === 400) {
        notFound();
    }

    if (res.status === 429) {
        throw new Error('429 Rate Limit Exceeded'); // Lo atrapa error.tsx
    }

    if (!res.ok) {
        throw new Error('Error interno del servidor');
    }

    const data = await res.json();

    // 6.2 Ofuscación de Datos PII del Cliente (ejecutada en el Servidor)
    let obfuscatedName = data.customer_name;
    if (obfuscatedName) {
        const parts = obfuscatedName.split(' ');
        if (parts.length > 1) {
            obfuscatedName = `${parts[0]} ${parts[1].charAt(0)}.`;
        }
    } else {
        obfuscatedName = 'Cliente';
    }

    return (
        <div className="min-h-screen bg-slate-50 selection:bg-rose-100 selection:text-rose-900 font-sans">
            <main className="max-w-md mx-auto px-5 py-12">
                <PublicHeader 
                    businessName={data.business_name || 'Comercio Local'} 
                    customerName={obfuscatedName} 
                />
                
                <div className="bg-white rounded-3xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] mb-6 border border-slate-100/50">
                    <BalanceHero balanceCents={data.balance_cents} />
                    
                    {data.payment_alias && (
                        <div className="mt-6 pt-6 border-t border-slate-100 text-center">
                            <p className="text-[10px] text-slate-400 uppercase tracking-widest mb-1">Alias / CVU para pagos</p>
                            <p className="text-sm font-semibold text-slate-700 select-all">{data.payment_alias}</p>
                        </div>
                    )}
                </div>

                <TransactionList debts={data.recent_debts || []} payments={data.recent_payments || []} />
                
                <div className="mt-12 text-center opacity-70">
                    <p className="text-[11px] text-slate-400 font-medium">
                        Información cifrada y procesada de forma segura.
                    </p>
                </div>
            </main>
        </div>
    );
}
