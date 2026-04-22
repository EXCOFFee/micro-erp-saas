'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';

/**
 * Layout autenticado — Protege todas las rutas dentro de (app).
 * Combina el Sidebar estricto y el Header modular.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
    const { user, loading } = useAuth();
    const router = useRouter();
    const [sidebarOpen, setSidebarOpen] = useState(false);

    useEffect(() => {
        if (!loading && !user) {
            router.push('/login');
        }
    }, [loading, user, router]);

    // Renderiza un esqueleto minimalista durante la validación inicial del JWT
    if (loading) {
       return (
           <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center">
               <svg className="animate-spin h-8 w-8 text-indigo-400" viewBox="0 0 24 24">
                   <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                   <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
               </svg>
           </div>
       );
    }

    if (!user) return null;

    return (
        <div className="min-h-screen bg-slate-950 flex">
            <Sidebar open={sidebarOpen} setOpen={setSidebarOpen} />
            <main className="flex-1 lg:ml-64 flex flex-col min-h-screen w-full">
                <Header onMenuClick={() => setSidebarOpen(true)} />
                <div className="flex-1 p-4 lg:p-8 max-w-7xl mx-auto w-full">
                    {children}
                </div>
            </main>
        </div>
    );
}
