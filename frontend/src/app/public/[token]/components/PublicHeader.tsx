interface PublicHeaderProps {
    businessName: string;
    customerName: string;
}

export function PublicHeader({ businessName, customerName }: PublicHeaderProps) {
    return (
        <div className="text-center mb-8">
            <div className="w-12 h-12 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
            </div>
            <h1 className="text-slate-500 text-sm font-medium uppercase tracking-widest mb-1">{businessName}</h1>
            <p className="text-slate-900 text-xl font-semibold">Resumen de {customerName}</p>
        </div>
    );
}
