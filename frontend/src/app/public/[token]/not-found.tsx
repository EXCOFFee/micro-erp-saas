import Link from 'next/link';

export default function PublicNotFound() {
    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
            <div className="w-20 h-20 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center mb-6 shadow-sm">
                <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-3">Enlace Inválido o Expirado</h2>
            <p className="text-slate-500 text-base max-w-sm">
                Por tu seguridad, este enlace ha caducado o no existe. Si necesitas consultar tu saldo, por favor solicita un nuevo enlace a tu comercio.
            </p>
        </div>
    );
}
