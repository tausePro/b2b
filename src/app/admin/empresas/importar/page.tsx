'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft,
  Download,
  Building2,
  Loader2,
  RefreshCw,
  Search,
  AlertTriangle,
  CheckCircle2,
  Users,
  Tag,
} from 'lucide-react';
import Link from 'next/link';

interface ClienteOdoo {
  odoo_id: number;
  nombre: string;
  email: string | null;
  telefono: string | null;
  nit: string | null;
  ciudad: string | null;
  es_empresa: boolean;
  tipo_partner: string | null;
  parent_odoo_id: number | null;
  parent_nombre: string | null;
  empresa_padre_local_id: string | null;
  comercial_odoo_id: number | null;
  comercial_nombre: string | null;
  total_sucursales_odoo: number;
  etiquetas: [number, string][];
  customer_rank: number;
  ya_importado: boolean;
  empresa_local_id: string | null;
}

interface EmpresaLocal {
  id: string;
  nombre: string;
  odoo_partner_id: number;
}

interface ImportStateItem {
  status: 'idle' | 'loading' | 'done' | 'error';
  modo?: 'empresa' | 'sede';
  mensaje?: string;
}

interface ImportState {
  [odooId: number]: ImportStateItem;
}

export default function ImportarClientesPage() {
  const [clientes, setClientes] = useState<ClienteOdoo[]>([]);
  const [empresasLocales, setEmpresasLocales] = useState<EmpresaLocal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notaListado, setNotaListado] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [importState, setImportState] = useState<ImportState>({});
  const [empresaDestinoPorPartner, setEmpresaDestinoPorPartner] = useState<Record<number, string>>({});
  const [soloEmpresas, setSoloEmpresas] = useState(false);
  const [mostrarContactos, setMostrarContactos] = useState(false);
  const [soloNoImportados, setSoloNoImportados] = useState(true);
  const [requiereAprobacionImport, setRequiereAprobacionImport] = useState(true);
  const [usaSedesImport, setUsaSedesImport] = useState(true);

  const cargarClientes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = mostrarContactos ? '?include_contacts=true' : '';
      const res = await fetch(`/api/odoo/importar-clientes${query}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error cargando clientes');
      setClientes(data.clientes || []);
      setEmpresasLocales(data.empresas_locales || []);
      setNotaListado(data.nota || null);
      setEmpresaDestinoPorPartner((prev) => {
        const next = { ...prev };
        (data.clientes || []).forEach((cliente: ClienteOdoo) => {
          if (!next[cliente.odoo_id] && cliente.empresa_padre_local_id) {
            next[cliente.odoo_id] = cliente.empresa_padre_local_id;
          }
        });
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    }
    setLoading(false);
  }, [mostrarContactos]);

  useEffect(() => {
    cargarClientes();
  }, [cargarClientes]);

  const importar = async (cliente: ClienteOdoo, modo: 'empresa' | 'sede' = 'empresa') => {
    const targetEmpresaId = empresaDestinoPorPartner[cliente.odoo_id] || cliente.empresa_padre_local_id || '';

    if (modo === 'sede' && !targetEmpresaId) {
      setImportState((prev) => ({
        ...prev,
        [cliente.odoo_id]: {
          status: 'error',
          modo,
          mensaje: 'Selecciona una empresa destino para importar como sede.',
        },
      }));
      return;
    }

    setImportState((prev) => ({ ...prev, [cliente.odoo_id]: { status: 'loading', modo } }));

    try {
      const res = await fetch('/api/odoo/importar-clientes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modo_importacion: modo,
          odoo_partner_id: cliente.odoo_id,
          target_empresa_id: modo === 'sede' ? targetEmpresaId : null,
          nombre: cliente.nombre,
          nit: cliente.nit,
          ciudad: cliente.ciudad,
          requiere_aprobacion: requiereAprobacionImport,
          usa_sedes: usaSedesImport,
        }),
      });

      const data = await res.json();
      if (!res.ok && res.status !== 409) {
        throw new Error(data.error || 'Error importando');
      }

      const mensajes: string[] = [
        data.mensaje || (modo === 'sede' ? 'Importado como sede' : 'Empresa importada'),
      ];

      if (data.comercial_odoo && data.asesor_asignado_id) {
        mensajes.push('Comercial Odoo sincronizado y asesor asignado automáticamente.');
      }

      if (data.aviso_comercial) {
        mensajes.push(data.aviso_comercial);
      }

      setImportState((prev) => ({
        ...prev,
        [cliente.odoo_id]: {
          status: 'done',
          modo,
          mensaje: mensajes.join(' '),
        },
      }));

      if (modo === 'empresa') {
        setClientes((prev) =>
          prev.map((c) =>
            c.odoo_id === cliente.odoo_id
              ? { ...c, ya_importado: true, empresa_local_id: data.empresa?.id || c.empresa_local_id }
              : c
          )
        );

        if (data.empresa?.id) {
          setEmpresasLocales((prev) => {
            if (prev.some((e) => e.id === data.empresa.id)) {
              return prev;
            }
            return [
              ...prev,
              {
                id: data.empresa.id,
                nombre: data.empresa.nombre || cliente.nombre,
                odoo_partner_id: cliente.odoo_id,
              },
            ].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
          });
        }
      }
    } catch (err) {
      setImportState((prev) => ({
        ...prev,
        [cliente.odoo_id]: {
          status: 'error',
          modo,
          mensaje: err instanceof Error ? err.message : 'Error importando partner',
        },
      }));
    }
  };

  const clientesFiltrados = clientes.filter((c) => {
    if (soloEmpresas && !c.es_empresa) return false;
    if (soloNoImportados && (c.ya_importado || importState[c.odoo_id]?.status === 'done')) return false;
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase();
      return (
        c.nombre.toLowerCase().includes(q) ||
        c.nit?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.ciudad?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const totalGestionados = clientes.filter(
    (c) => c.ya_importado || importState[c.odoo_id]?.status === 'done'
  ).length;
  const totalPendientes = Math.max(clientes.length - totalGestionados, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/admin/empresas"
          className="p-2 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Importar Clientes desde Odoo</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Selecciona los partners de Odoo que quieres registrar como empresas en la plataforma
          </p>
        </div>

        {notaListado && (
          <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
            {notaListado}
          </div>
        )}
      </div>

      {/* KPIs */}
      {!loading && !error && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white border border-border rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-50 rounded-lg">
                <Users className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{clientes.length}</p>
                <p className="text-xs text-slate-500">Partners en Odoo</p>
              </div>
            </div>
          </div>
          <div className="bg-white border border-border rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-50 rounded-lg">
                <CheckCircle2 className="w-5 h-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{totalGestionados}</p>
                <p className="text-xs text-slate-500">Gestionados</p>
              </div>
            </div>
          </div>
          <div className="bg-white border border-border rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-50 rounded-lg">
                <Download className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{totalPendientes}</p>
                <p className="text-xs text-slate-500">Pendientes</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="bg-white border border-border rounded-xl p-4 shadow-sm">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por nombre, NIT, email o ciudad..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-border rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
            />
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={soloEmpresas}
                onChange={(e) => setSoloEmpresas(e.target.checked)}
                className="rounded border-border text-primary focus:ring-primary"
              />
              Solo empresas
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={mostrarContactos}
                onChange={(e) => setMostrarContactos(e.target.checked)}
                className="rounded border-border text-primary focus:ring-primary"
              />
              Mostrar contactos
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={soloNoImportados}
                onChange={(e) => setSoloNoImportados(e.target.checked)}
                className="rounded border-border text-primary focus:ring-primary"
              />
              Solo pendientes
            </label>
            <button
              onClick={cargarClientes}
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
              title="Recargar desde Odoo"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-border flex flex-col sm:flex-row sm:items-center gap-3">
          <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold">Parámetros al importar</p>
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={requiereAprobacionImport}
              onChange={(e) => setRequiereAprobacionImport(e.target.checked)}
              className="rounded border-border text-primary focus:ring-primary"
            />
            Requiere aprobación
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={usaSedesImport}
              onChange={(e) => setUsaSedesImport(e.target.checked)}
              className="rounded border-border text-primary focus:ring-primary"
            />
            Usa sedes
          </label>
        </div>
      </div>

      {/* Estado */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-3" />
            <p className="text-sm text-slate-500">Consultando Odoo...</p>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-5 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-800">Error conectando con Odoo</p>
            <p className="text-sm text-red-600 mt-1">{error}</p>
            <button
              onClick={cargarClientes}
              className="mt-3 text-sm text-red-700 underline hover:no-underline"
            >
              Reintentar
            </button>
          </div>
        </div>
      )}

      {/* Tabla */}
      {!loading && !error && (
        <>
          <p className="text-xs text-slate-500">
            Mostrando {clientesFiltrados.length} de {clientes.length} partners
          </p>
          <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden">
            {clientesFiltrados.length === 0 ? (
              <div className="text-center py-16">
                <Building2 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 text-sm">No hay partners que coincidan con los filtros.</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-border">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Partner</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden sm:table-cell">Tipo</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">NIT / Email</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden lg:table-cell">Comercial Odoo</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden lg:table-cell">Etiquetas</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {clientesFiltrados.map((cliente) => {
                    const estadoItem = importState[cliente.odoo_id] || { status: 'idle' as const };
                    const estado = estadoItem.status;
                    const importado = cliente.ya_importado || estado === 'done';
                    const empresaDestinoId =
                      empresaDestinoPorPartner[cliente.odoo_id] || cliente.empresa_padre_local_id || '';

                    return (
                      <tr key={cliente.odoo_id} className={`hover:bg-slate-50 transition-colors ${importado ? 'opacity-60' : ''}`}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-xs shrink-0">
                              {cliente.nombre.substring(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-medium text-slate-900">{cliente.nombre}</p>
                              <p className="text-xs text-slate-400 font-mono">ID Odoo: {cliente.odoo_id}</p>
                              <p className="text-xs text-slate-400">Sucursales Odoo: {cliente.total_sucursales_odoo}</p>
                              {cliente.parent_nombre && (
                                <p className="text-xs text-slate-400">Pertenece a: {cliente.parent_nombre}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                            cliente.es_empresa
                              ? 'bg-blue-50 text-blue-700'
                              : 'bg-amber-50 text-amber-700'
                          }`}>
                            {cliente.es_empresa ? 'Empresa' : 'Contacto'}
                          </span>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <p className="text-slate-700 font-mono text-xs">{cliente.nit || '—'}</p>
                          <p className="text-slate-400 text-xs">{cliente.email || '—'}</p>
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell">
                          {cliente.comercial_odoo_id ? (
                            <div>
                              <p className="text-slate-700 text-xs font-medium">{cliente.comercial_nombre || 'Comercial sin nombre'}</p>
                              <p className="text-slate-400 text-xs font-mono">ID: {cliente.comercial_odoo_id}</p>
                            </div>
                          ) : (
                            <span className="text-slate-400 text-xs">Sin comercial asignado</span>
                          )}
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell">
                          {cliente.etiquetas.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {cliente.etiquetas.map(([id, nombre]) => (
                                <span
                                  key={id}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary rounded-full text-xs font-medium"
                                >
                                  <Tag className="w-2.5 h-2.5" />
                                  {nombre}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-slate-400 text-xs">Sin etiquetas</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {importado ? (
                            <div className="flex flex-col items-end gap-2">
                              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-600">
                                <CheckCircle2 className="w-4 h-4" />
                                {cliente.ya_importado ? 'Empresa importada' : 'Gestionado'}
                              </span>
                              {cliente.ya_importado && cliente.es_empresa && (
                                <button
                                  onClick={() => importar(cliente, 'empresa')}
                                  disabled={estado === 'loading'}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-border bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                                >
                                  {estado === 'loading' ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <RefreshCw className="w-3 h-3" />
                                  )}
                                  Sincronizar comercial
                                </button>
                              )}
                            </div>
                          ) : estado === 'error' ? (
                            <button
                              onClick={() => importar(cliente, estadoItem.modo || (cliente.es_empresa ? 'empresa' : 'sede'))}
                              className="text-xs text-red-600 underline hover:no-underline"
                            >
                              Error — Reintentar
                            </button>
                          ) : (
                            <div className="flex flex-col items-end gap-2">
                              {cliente.es_empresa && (
                                <button
                                  onClick={() => importar(cliente, 'empresa')}
                                  disabled={estado === 'loading'}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary/90 text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                                >
                                  {estado === 'loading' && estadoItem.modo === 'empresa' ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <Download className="w-3 h-3" />
                                  )}
                                  {estado === 'loading' && estadoItem.modo === 'empresa'
                                    ? 'Importando empresa...'
                                    : 'Importar empresa'}
                                </button>
                              )}

                              {mostrarContactos && (
                                <div className="flex items-center gap-2">
                                  <select
                                    value={empresaDestinoId}
                                    onChange={(e) =>
                                      setEmpresaDestinoPorPartner((prev) => ({
                                        ...prev,
                                        [cliente.odoo_id]: e.target.value,
                                      }))
                                    }
                                    className="min-w-[170px] rounded-lg border border-border bg-white px-2 py-1 text-xs text-slate-700"
                                  >
                                    <option value="">Empresa destino...</option>
                                    {empresasLocales.map((empresa) => (
                                      <option key={empresa.id} value={empresa.id}>
                                        {empresa.nombre}
                                      </option>
                                    ))}
                                  </select>
                                  <button
                                    onClick={() => importar(cliente, 'sede')}
                                    disabled={estado === 'loading' || !empresaDestinoId}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-800 text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                                  >
                                    {estado === 'loading' && estadoItem.modo === 'sede' ? (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                      <Download className="w-3 h-3" />
                                    )}
                                    {estado === 'loading' && estadoItem.modo === 'sede'
                                      ? 'Importando sede...'
                                      : 'Importar como sede'}
                                  </button>
                                </div>
                              )}
                            </div>
                          )}

                          {estadoItem.mensaje && (
                            <p className={`mt-2 text-xs ${estado === 'error' ? 'text-red-600' : 'text-slate-500'}`}>
                              {estadoItem.mensaje}
                            </p>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
