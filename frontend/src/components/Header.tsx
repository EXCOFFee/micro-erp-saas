'use client';

import { useAuth } from '@/contexts/AuthContext';

export default function Header({ onMenuClick }: { onMenuClick: () => void }) {
    const { user, logout } = useAuth();
    
    return (
        <header className="sticky top-0 z-40 bg-slate-900/80 backdrop-blur-xl border-b border-slate-800 px-4 h-16 flex items-center justify-between lg:justify-end shrink-0">
            <div className="flex items-center gap-3">
                <button
                    onClick={onMenuClick}
                    className="lg:hidden p-2 -ml-2 text-slate-400 hover:text-white rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    aria-label="Menú"
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
                </button>
                <div className="lg:hidden font-bold bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">
                    Micro ERP
                </div>
            </div>

            <div className="flex items-center gap-4">
                <div className="hidden sm:block text-right">
                    <p className="text-sm font-medium text-white">{user?.email}</p>
                    <p className="text-xs text-indigo-400 capitalize">{user?.role?.toLowerCase() || 'Admin'}</p>
                </div>
                <div className="h-8 w-px bg-slate-700 hidden sm:block"></div>
                <button
                    onClick={logout}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                    <span className="hidden sm:inline">Cerrar Sesión</span>
                </button>
            </div>
        </header>
    );
}
