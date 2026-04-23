'use client';

export default function PublicError({
    error,
}: {
    error: Error & { digest?: string };
}) {
    // Verificamos si es un error de rate limit (429) por el mensaje
    const isRateLimit = error.message.includes('429');
    
    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
            <div className="w-20 h-20 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mb-6 shadow-sm">
                <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8V7a4 4 0 00-8 0v4h8z" />
                </svg>
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-3">
                {isRateLimit ? 'Acceso Pausado' : 'No se pudo cargar el resumen'}
            </h2>
            <p className="text-slate-500 text-base max-w-sm mb-8">
                {isRateLimit 
                    ? 'Por razones de seguridad, hemos pausado temporalmente la carga de este enlace debido a múltiples intentos recientes. Por favor, vuelve a intentarlo en unos minutos.'
                    : 'Hubo un problema al intentar conectar con el sistema. Intenta refrescar la página más tarde.'}
            </p>
            {/* Sin botón de reintento en caso de 429 para frenar polling */}
        </div>
    );
}
