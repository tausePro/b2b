'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';
import {
  Building2,
  ShoppingCart,
  Loader2,
  Plus,
  ArrowRight,
  TrendingUp,
  MoreVertical,
  Filter,
  CloudCog,
} from 'lucide-react';
import Link from 'next/link';

interface AdminStats {
  totalEmpresas: number;
  totalPedidos: number;
}

interface EmpresaActiva {
  id: string;
  nombre: string;
  nit: string | null;
  activa: boolean;
  created_at: string;
}

const supabase = createClient();

export default function AdminDashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<AdminStats>({
    totalEmpresas: 0,
    totalPedidos: 0,
  });
  const [empresas, setEmpresas] = useState<EmpresaActiva[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [empresasCount, pedidosCount, empresasList] = await Promise.allSettled([
          supabase.from('empresas').select('id', { count: 'exact', head: true }),
          supabase.from('pedidos').select('id', { count: 'exact', head: true }),
          supabase.from('empresas').select('id, nombre, nit, activa, created_at').order('created_at', { ascending: false }).limit(10),
        ]);

        setStats({
          totalEmpresas: empresasCount.status === 'fulfilled' ? (empresasCount.value.count ?? 0) : 0,
          totalPedidos: pedidosCount.status === 'fulfilled' ? (pedidosCount.value.count ?? 0) : 0,
        });

        if (empresasList.status === 'fulfilled' && empresasList.value.data) {
          setEmpresas(empresasList.value.data as EmpresaActiva[]);
        }
      } catch (err) {
        console.error('[AdminDashboard] Error cargando datos:', err);
      }
      setLoading(false);
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div>
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Panel de Control Maestro</h1>
        <p className="text-sm text-slate-500 mt-0.5">Visión general de integraciones corporativas y estado del sistema.</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Empresas Activas */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-border relative overflow-hidden">
          <div className="absolute right-0 top-0 h-full w-1 bg-primary" />
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-sm font-medium text-slate-500 uppercase tracking-wide">Empresas Activas</p>
              <h3 className="text-3xl font-bold text-slate-900 mt-1">{stats.totalEmpresas}</h3>
            </div>
            <div className="p-2 bg-primary/10 rounded-lg text-primary">
              <Building2 className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-center text-sm">
            <span className="text-primary flex items-center font-medium">
              <TrendingUp className="w-4 h-4 mr-0.5" />
              0%
            </span>
            <span className="text-slate-400 ml-2">vs mes pasado</span>
          </div>
        </div>

        {/* Pedidos Totales */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-border">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-sm font-medium text-slate-500 uppercase tracking-wide">Pedidos Totales (Hoy)</p>
              <h3 className="text-3xl font-bold text-slate-900 mt-1">{stats.totalPedidos}</h3>
            </div>
            <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
              <ShoppingCart className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-center text-sm">
            <span className="text-primary flex items-center font-medium">
              <TrendingUp className="w-4 h-4 mr-0.5" />
              0%
            </span>
            <span className="text-slate-400 ml-2">vs ayer</span>
          </div>
        </div>

        {/* Estado Sync Odoo */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-border">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-sm font-medium text-slate-500 uppercase tracking-wide">Estado Sync Odoo</p>
              <h3 className="text-xl font-bold text-slate-900 mt-2 flex items-center gap-2">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary/60 opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-primary" />
                </span>
                Sistemas Operativos
              </h3>
            </div>
            <div className="p-2 bg-purple-100 rounded-lg text-purple-600">
              <CloudCog className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-center text-sm">
            <span className="text-slate-500">Última sync: <span className="text-slate-900 font-medium">—</span></span>
          </div>
        </div>
      </div>

      {/* Empresas Activas Table */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Empresas Activas</h2>
          <p className="text-sm text-slate-500">Gestionar integraciones y flujos de trabajo de clientes.</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="inline-flex items-center justify-center px-4 py-2 border border-border rounded-lg shadow-sm text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 transition-colors">
            <Filter className="w-4 h-4 mr-2" />
            Filtrar
          </button>
          <Link
            href="/admin/empresas/nueva"
            className="inline-flex items-center justify-center px-4 py-2 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary-dark transition-all"
          >
            <Plus className="w-4 h-4 mr-2" />
            Conectar Nueva Empresa
          </Link>
        </div>
      </div>

      <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden">
        {empresas.length === 0 ? (
          <div className="p-12 text-center">
            <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <h3 className="text-base font-semibold text-slate-900 mb-1">Sin empresas registradas</h3>
            <p className="text-sm text-slate-500 mb-4">Comienza conectando tu primera empresa cliente.</p>
            <Link
              href="/admin/empresas/nueva"
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-dark transition-colors"
            >
              <Plus className="w-4 h-4" />
              Crear primera empresa
            </Link>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Nombre de Empresa</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">NIT</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Estado</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Fecha Registro</th>
                    <th className="relative px-6 py-4"><span className="sr-only">Acciones</span></th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-border">
                  {empresas.map((empresa) => {
                    const initials = empresa.nombre.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
                    return (
                      <tr key={empresa.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="flex-shrink-0 h-10 w-10 bg-primary/10 rounded-lg flex items-center justify-center text-primary font-bold text-sm">
                              {initials}
                            </div>
                            <div className="ml-4">
                              <div className="text-sm font-medium text-slate-900">{empresa.nombre}</div>
                              <div className="text-xs text-slate-500">ID: #{empresa.id.slice(0, 8)}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                          {empresa.nit || '—'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className={`h-2.5 w-2.5 rounded-full mr-2 ${empresa.activa ? 'bg-primary' : 'bg-slate-300'}`} />
                            <span className="text-sm text-slate-600">{empresa.activa ? 'Activa' : 'Inactiva'}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                          {new Date(empresa.created_at).toLocaleDateString('es-CO')}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <Link href={`/admin/empresas/${empresa.id}`} className="text-slate-400 hover:text-primary transition-colors">
                            <MoreVertical className="w-5 h-5" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-border sm:px-6">
              <div className="text-sm text-slate-700">
                Mostrando <span className="font-medium text-slate-900">1</span> a <span className="font-medium text-slate-900">{empresas.length}</span> de <span className="font-medium text-slate-900">{stats.totalEmpresas}</span> resultados
              </div>
              <Link href="/admin/empresas" className="text-sm text-primary hover:text-primary-dark font-medium inline-flex items-center gap-1">
                Ver todas <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
