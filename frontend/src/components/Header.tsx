'use client';

import { useAuth } from '@/contexts/AuthContext';
import { ThemeToggle } from '@/components/ThemeToggle';

export default function Header({ onMenuClick }: { onMenuClick: () => void }) {
    const { user, logout } = useAuth();

    return (
        <header className="sticky top-0 z-40 bg-surface/80 backdrop-blur-xl border-b border-border px-4 h-16 flex items-center justify-between lg:justify-end shrink-0">
            <div className="flex items-center gap-3">
                <button
                    onClick={onMenuClick}
                    className="lg:hidden p-2 -ml-2 text-muted-foreground hover:text-foreground rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label="Menú"
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
                </button>
                <div className="lg:hidden font-display font-bold text-foreground">
                    Micro ERP
                </div>
            </div>

            <div className="flex items-center gap-2">
                <div className="hidden sm:block text-right mr-2">
                    <p className="text-sm font-medium text-foreground">{user?.email}</p>
                    <p className="text-xs text-warning-text capitalize">{user?.role?.toLowerCase() || 'Admin'}</p>
                </div>
                <div className="h-8 w-px bg-border hidden sm:block"></div>
                <ThemeToggle />
                <button
                    onClick={logout}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                    <span className="hidden sm:inline">Cerrar Sesión</span>
                </button>
            </div>
        </header>
    );
}
