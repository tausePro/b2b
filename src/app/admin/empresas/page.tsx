'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Building2,
  Plus,
  Search,
  Loader2,
  Settings,
  Users,
  MapPin,
  Download,
} from 'lucide-react';
import Link from 'next/link';

interface EmpresaListItem {
  id: string;
  nombre: string;
  nit: string | null;
  odoo_partner_id: number;
  activa: boolean;
  presupuesto_global_mensual: number | null;
  created_at: string;
  config?: {
    slug: string | null;
    logo_url: string | null;
    color_primario: string;
  } | null;
}

const supabase = createClient();

export default function EmpresasPage() {
  const [empresas, setEmpresas] = useState<EmpresaListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');

  useEffect(() => {
    const fetchEmpresas = async () => {
      setLoading(true);
      try {
        const { data, error, status } = await supabase
          .from('empresas')
          .select('id, nombre, nit, odoo_partner_id, activa, presupuesto_global_mensual, created_at')
          .order('nombre');

        console.log('[Empresas] status:', status, 'error:', error, 'data count:', data?.length);

        if (error) {
          console.error('Error fetching empresas:', error);
        } else {
          setEmpresas((data as unknown as EmpresaListItem[]) || []);
        }
      } catch (err) {
        console.error('Error inesperado:', err);
      }
      setLoading(false);
    };

    fetchEmpresas();
  }, []);

  const empresasFiltradas = busqueda.trim()
    ? empresas.filter(
        (e) =>
          e.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
          e.nit?.toLowerCase().includes(busqueda.toLowerCase())
      )
    : empresas;

  const formatCOP = (value: number | null) => {
    if (!value) return '—';
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(value);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Empresas</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {empresas.length} empresa{empresas.length !== 1 ? 's' : ''} registrada{empresas.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/empresas/importar"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-border rounded-lg text-sm font-medium transition-colors shadow-sm"
          >
            <Download className="w-4 h-4" />
            Importar desde Odoo
          </Link>
          <Link
            href="/admin/empresas/nueva"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary-dark text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Nueva Empresa
          </Link>
        </div>
      </div>

      {/* Búsqueda */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          placeholder="Buscar por nombre o NIT..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-border rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
        />
      </div>

      {/* Lista de empresas */}
      {empresasFiltradas.length === 0 ? (
        <div className="bg-white border border-border rounded-xl p-12 text-center shadow-sm">
          <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-900 mb-2">
            {busqueda ? 'Sin resultados' : 'No hay empresas'}
          </h3>
          <p className="text-slate-500 text-sm mb-4">
            {busqueda
              ? 'Intenta con otro término de búsqueda.'
              : 'Crea tu primera empresa cliente para comenzar.'}
          </p>
          {!busqueda && (
            <Link
              href="/admin/empresas/nueva"
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-dark transition-colors"
            >
              <Plus className="w-4 h-4" />
              Crear empresa
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {empresasFiltradas.map((empresa) => (
            <Link
              key={empresa.id}
              href={`/admin/empresas/${empresa.id}`}
              className="bg-white border border-border rounded-xl p-5 hover:border-primary/30 hover:shadow-md transition-all group shadow-sm"
            >
              {/* Header de la card */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                    {empresa.nombre.substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900 group-hover:text-primary transition-colors">
                      {empresa.nombre}
                    </h3>
                    <p className="text-xs text-slate-500">{empresa.nit || 'Sin NIT'}</p>
                  </div>
                </div>
                <div className="flex items-center">
                  <div className={`h-2.5 w-2.5 rounded-full mr-1.5 ${empresa.activa ? 'bg-primary' : 'bg-slate-300'}`} />
                  <span className="text-xs font-medium text-slate-600">
                    {empresa.activa ? 'Activa' : 'Inactiva'}
                  </span>
                </div>
              </div>

              {/* Info */}
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Presupuesto mensual</span>
                  <span className="text-slate-900 font-medium">
                    {formatCOP(empresa.presupuesto_global_mensual)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Odoo Partner ID</span>
                  <span className="text-slate-600 font-mono text-xs">{empresa.odoo_partner_id}</span>
                </div>
              </div>

              {/* Footer */}
              <div className="mt-4 pt-3 border-t border-border flex items-center gap-4 text-xs text-slate-400">
                <span className="inline-flex items-center gap-1">
                  <Settings className="w-3 h-3" />
                  Configurar
                </span>
                <span className="inline-flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  Sedes
                </span>
                <span className="inline-flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  Usuarios
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
