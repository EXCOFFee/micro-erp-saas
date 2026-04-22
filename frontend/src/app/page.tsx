import { redirect } from 'next/navigation';

/**
 * Página raíz — Redirige al dashboard.
 * Si el usuario no tiene JWT, el middleware de auth lo mandará a /login.
 */
export default function HomePage() {
  redirect('/dashboard');
}
