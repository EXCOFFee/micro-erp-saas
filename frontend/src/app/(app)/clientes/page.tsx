'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { AxiosError } from 'axios';
import { api } from '@/lib/api';
import { formatCents } from '@/lib/format';
import type { Customer } from '@/types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Lista de Clientes — Muestra todos los deudores del comercio.
 *
 * Features:
 * - Búsqueda en tiempo real (filtra por nombre o teléfono)
 * - Badge de estado (activo/bloqueado)
 * - Deuda resaltada en rojo
 * - Botón para agregar nuevo cliente
 * - Click en fila → detalle del cliente
 */
export default function ClientesPage() {
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [showForm, setShowForm] = useState(false);

    // Form state para nuevo cliente
    const [formName, setFormName] = useState('');
    const [formPhone, setFormPhone] = useState('');
    const [formDni, setFormDni] = useState('');
    const [formCreditLimit, setFormCreditLimit] = useState('');
    const [creating, setCreating] = useState(false);

    useEffect(() => {
        loadCustomers();
    }, []);

    async function loadCustomers() {
        try {
            setLoading(true);
            const response = await api.get<Customer[]>('/customers');
            setCustomers(response.data);
        } catch (err) {
            if (err instanceof AxiosError && err.response?.data?.message) {
                 setError(err.response.data.message);
            } else {
                 setError(err instanceof Error ? err.message : 'Error al cargar clientes');
            }
        } finally {
            setLoading(false);
        }
    }

    // Búsqueda client-side (filtra por nombre o teléfono)
    const filtered = useMemo(() => {
        if (!search.trim()) return customers;
        const q = search.toLowerCase();
        return customers.filter(
            (c) =>
                c.full_name.toLowerCase().includes(q) ||
                (c.phone && c.phone.includes(q)) ||
                (c.dni && c.dni.includes(q)),
        );
    }, [customers, search]);

    async function handleCreate(e: React.FormEvent) {
        e.preventDefault();
        setCreating(true);
        try {
            await api.post<Customer>('/customers', {
                full_name: formName.trim(),
                phone: formPhone.trim() || undefined,
                dni: formDni.trim() || undefined,
                // Convertir pesos a centavos (Regla de Oro III: cero floats en BD)
                credit_limit_cents: formCreditLimit
                    ? Math.round(parseFloat(formCreditLimit) * 100)
                    : 0,
            });
            setShowForm(false);
            setFormName('');
            setFormPhone('');
            setFormDni('');
            setFormCreditLimit('');
            await loadCustomers();
        } catch (err) {
            if (err instanceof AxiosError && err.response?.data?.message) {
                 alert(err.response.data.message);
            } else {
                 alert(err instanceof Error ? err.message : 'Error al crear');
            }
        } finally {
            setCreating(false);
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <svg className="animate-spin h-8 w-8 text-primary" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-destructive/10 border border-destructive/30 rounded-2xl p-6 text-center">
                <p className="text-destructive mb-3">{error}</p>
                <Button onClick={loadCustomers} variant="secondary">
                    Reintentar
                </Button>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Clientes</h1>
                    <p className="text-muted-foreground text-sm mt-1">{customers.length} registrados</p>
                </div>
                <Button
                    onClick={() => setShowForm(!showForm)}
                    className="flex items-center gap-2"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Nuevo cliente
                </Button>
            </div>

            {/* Form alta de cliente */}
            {showForm && (
                <Card className="p-6">
                    <h3 className="text-foreground font-semibold mb-4">Alta de cliente</h3>
                    <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <Label htmlFor="form-name">Nombre completo *</Label>
                            <Input id="form-name" type="text" value={formName} onChange={(e) => setFormName(e.target.value)} required placeholder="Nombre del cliente" />
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="form-phone">Teléfono</Label>
                            <Input id="form-phone" type="text" value={formPhone} onChange={(e) => setFormPhone(e.target.value)} placeholder="Ej: 1123456789" />
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="form-dni">DNI / Cédula</Label>
                            <Input id="form-dni" type="text" value={formDni} onChange={(e) => setFormDni(e.target.value)} placeholder="Ej: 35123456" />
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="form-limit">Límite de crédito ($)</Label>
                            <Input id="form-limit" type="number" min="0" step="0.01" value={formCreditLimit} onChange={(e) => setFormCreditLimit(e.target.value)} placeholder="Ej: 5000" />
                        </div>
                        <div className="sm:col-span-2 flex gap-2">
                            <Button type="submit" disabled={creating}>{creating ? 'Creando...' : 'Crear cliente'}</Button>
                            <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>Cancelar</Button>
                        </div>
                    </form>
                </Card>
            )}

            {/* Search bar */}
            <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <Input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar por nombre, teléfono o DNI..."
                    className="pl-10"
                />
            </div>

            {/* Tabla */}
            <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-border bg-muted/10">
                                <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-3">Nombre</th>
                                <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-3 hidden sm:table-cell">Teléfono</th>
                                <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-3">Deuda</th>
                                <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-3 hidden md:table-cell">Límite</th>
                                <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-3">Estado</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {filtered.map((c) => (
                                <tr key={c.id} className="hover:bg-muted/30 transition-colors cursor-pointer group">
                                    <td className="px-6 py-3.5">
                                        <Link href={`/clientes/${c.id}`} className="block">
                                            <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">{c.full_name}</span>
                                            {c.next_payment_promise && (
                                                <p className="text-xs text-primary/80 mt-0.5">
                                                    Promesa: {new Date(c.next_payment_promise).toLocaleDateString('es-AR')}
                                                </p>
                                            )}
                                        </Link>
                                    </td>
                                    <td className="px-6 py-3.5 text-sm text-muted-foreground hidden sm:table-cell">{c.phone || '—'}</td>
                                    <td className="px-6 py-3.5 text-right">
                                        <span className={`text-sm font-semibold ${c.balance_cents > 0 ? 'text-destructive' : 'text-primary'}`}>
                                            {formatCents(c.balance_cents)}
                                        </span>
                                    </td>
                                    <td className="px-6 py-3.5 text-right text-sm text-muted-foreground hidden md:table-cell">{formatCents(c.credit_limit_cents)}</td>
                                    <td className="px-6 py-3.5 text-center">
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium ${c.is_active ? 'bg-primary/20 text-primary' : 'bg-destructive/20 text-destructive'
                                            }`}>
                                            {c.is_active ? 'Activo' : 'Bloqueado'}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                            {filtered.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground text-sm">
                                        {search ? 'Sin resultados' : 'No hay clientes registrados.'}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
}
