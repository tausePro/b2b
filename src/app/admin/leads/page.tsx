'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Loader2, UserPlus, Filter, MessageCircle, Mail, Phone,
  Building2, Calendar, ChevronDown, Check, AlertCircle, Target,
  Trash2,
} from 'lucide-react';

interface Lead {
  id: string;
  nombre: string;
  empresa: string | null;
  email: string | null;
  telefono: string | null;
  mensaje: string | null;
  fuente: string;
  estado: string;
  whatsapp_enviado: boolean;
  notas: string | null;
  created_at: string;
  updated_at: string;
  // Atribución (migración 036). Opcionales porque leads anteriores
  // a la migración no tienen estos campos.
  gclid: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  referrer: string | null;
  landing_url: string | null;
  click_at: string | null;
}

const ESTADOS = [
  { value: 'todos', label: 'Todos', color: 'bg-slate-100 text-slate-600' },
  { value: 'nuevo', label: 'Nuevo', color: 'bg-blue-100 text-blue-700' },
  { value: 'contactado', label: 'Contactado', color: 'bg-amber-100 text-amber-700' },
  { value: 'convertido', label: 'Convertido', color: 'bg-green-100 text-green-700' },
  { value: 'descartado', label: 'Descartado', color: 'bg-red-100 text-red-700' },
];

// Catalogo completo de fuentes emitidas hoy por el codigo. Mantener
// sincronizado con los `fuente` que usan los <LeadButton> y formularios
// publicos. Si agregas un nuevo canal, registralo aca para que sea
// filtrable en este dashboard.
//
// `mode: 'prefix'` indica que el filtro debe hacer LIKE en vez de eq,
// util para fuentes dinamicas como `producto_{id}` y `producto_{id}_cta`.
const FUENTES: Array<{ value: string; label: string; mode?: 'prefix' }> = [
  { value: 'todos', label: 'Todas las fuentes' },
  { value: 'landing_hero', label: 'Home — Hero' },
  { value: 'landing_cta', label: 'Home — CTA final' },
  { value: 'whatsapp_bubble', label: 'Burbuja WhatsApp (global)' },
  { value: 'catalogo_banner', label: 'Catálogo — Banner' },
  { value: 'catalogo_publico_sin_resultados', label: 'Catálogo — Sin resultados' },
  { value: 'catalogo_publico_cta', label: 'Catálogo — CTA final' },
  { value: 'producto_', label: 'Producto (detalle)', mode: 'prefix' },
  { value: 'contacto_formulario', label: 'Contacto — Formulario' },
  { value: 'contacto_whatsapp', label: 'Contacto — WhatsApp' },
  // Prefix: matchea contacto_comercial_<slug> para cada comercial
  // del equipo configurado en CMS. Permite ver el total de leads que
  // entraron via tarjetas del equipo comercial en /contacto.
  {
    value: 'contacto_comercial_',
    label: 'Contacto — Equipo comercial (todas)',
    mode: 'prefix',
  },
];

// Filtros de atribución publicitaria (derivados en cliente a partir de
// gclid y utm_source). Complementan el filtro por `fuente` (que es el
// CTA / sección del sitio que disparó el lead); aquí agrupamos por
// origen del tráfico externo para medir ROI de pauta.
const ATRIBUCION_OPCIONES = [
  { value: 'todos', label: 'Toda la atribución' },
  { value: 'google_ads', label: 'Google Ads (gclid)' },
  { value: 'utm', label: 'Con UTM (campaña/email)' },
  { value: 'organico_o_directo', label: 'Orgánico / directo' },
];

function matchesAtribucion(lead: Lead, filtro: string): boolean {
  if (filtro === 'todos') return true;
  const hasGclid = Boolean(lead.gclid);
  const hasUtm = Boolean(
    lead.utm_source || lead.utm_medium || lead.utm_campaign,
  );
  if (filtro === 'google_ads') return hasGclid;
  if (filtro === 'utm') return hasUtm && !hasGclid;
  if (filtro === 'organico_o_directo') return !hasGclid && !hasUtm;
  return true;
}

function getEstadoStyle(estado: string) {
  return ESTADOS.find((e) => e.value === estado)?.color || 'bg-slate-100 text-slate-600';
}

function formatFecha(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Formatea el dominio del referrer (o de una landing_url) en algo compacto. */
function formatHost(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return url.slice(0, 40);
  }
}

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [filtroFuente, setFiltroFuente] = useState('todos');
  // Filtro por atribución externa (tráfico). Se aplica en cliente sobre
  // la lista ya traída del backend porque es una dimensión derivada
  // (gclid presente / utm presente / ninguno) y el volumen es bajo
  // (el endpoint ya limita a 100 resultados por página).
  const [filtroAtribucion, setFiltroAtribucion] = useState('todos');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  // IDs seleccionados por el checkbox de cada fila. Se usa para el
  // borrado masivo desde el botón "Eliminar seleccionados".
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [borrando, setBorrando] = useState(false);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filtroEstado !== 'todos') params.set('estado', filtroEstado);
      if (filtroFuente !== 'todos') {
        // Si la fuente seleccionada fue registrada como prefix (ej:
        // 'producto_'), el backend espera fuente_prefix en lugar de fuente.
        const fuenteDef = FUENTES.find((f) => f.value === filtroFuente);
        if (fuenteDef?.mode === 'prefix') {
          params.set('fuente_prefix', filtroFuente);
        } else {
          params.set('fuente', filtroFuente);
        }
      }
      params.set('limit', '100');

      const res = await fetch(`/api/leads?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setLeads(data.leads || []);
      setTotal(data.total || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando leads');
    } finally {
      setLoading(false);
    }
  }, [filtroEstado, filtroFuente]);

  useEffect(() => { void fetchLeads(); }, [fetchLeads]);

  const actualizarEstado = async (id: string, estado: string) => {
    setSaving(id);
    try {
      const res = await fetch('/api/leads', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, estado }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, estado } : l)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error actualizando');
    } finally {
      setSaving(null);
    }
  };

  const eliminarLeads = async (ids: string[]) => {
    if (ids.length === 0) return;
    const pregunta =
      ids.length === 1
        ? '¿Eliminar este lead? Esta acción no se puede deshacer.'
        : `¿Eliminar ${ids.length} leads? Esta acción no se puede deshacer.`;
    if (!window.confirm(pregunta)) return;

    setBorrando(true);
    try {
      let res: Response;
      if (ids.length === 1) {
        res = await fetch(`/api/leads?id=${encodeURIComponent(ids[0])}`, {
          method: 'DELETE',
        });
      } else {
        res = await fetch('/api/leads', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids }),
        });
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo eliminar');

      // Actualizamos la lista local quitando los eliminados, en vez de
      // re-fetch, para feedback instantáneo. El contador total del
      // endpoint se desactualiza hasta el próximo refresh; es aceptable.
      const borradosSet = new Set(ids);
      setLeads((prev) => prev.filter((l) => !borradosSet.has(l.id)));
      setSeleccionados(new Set());
      setTotal((prev) => Math.max(0, prev - (data.eliminados ?? ids.length)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar');
    } finally {
      setBorrando(false);
    }
  };

  const toggleSeleccion = (id: string) => {
    setSeleccionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const guardarNotas = async (id: string, notas: string) => {
    setSaving(id);
    try {
      const res = await fetch('/api/leads', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, notas }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, notas } : l)));
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error guardando notas');
    } finally {
      setSaving(null);
    }
  };

  // Lista ya filtrada por atribución (derivada en cliente).
  const leadsVisibles = leads.filter((l) => matchesAtribucion(l, filtroAtribucion));

  // Stats. Incluimos el contador de leads con gclid (Google Ads) para
  // que dirección vea de un vistazo qué porcentaje del pipeline viene
  // de pauta. Se calcula sobre la lista completa traída del backend
  // (no sobre la filtrada) para que el número sea comparable entre
  // filtros.
  const stats = {
    total: leads.length,
    nuevos: leads.filter((l) => l.estado === 'nuevo').length,
    contactados: leads.filter((l) => l.estado === 'contactado').length,
    convertidos: leads.filter((l) => l.estado === 'convertido').length,
    googleAds: leads.filter((l) => Boolean(l.gclid)).length,
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Leads</h1>
        <p className="text-sm text-muted mt-1">Gestiona los contactos recibidos desde el sitio público</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
          <button onClick={() => setError(null)} className="ml-auto text-red-500 font-bold text-xs">Cerrar</button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {[
          { label: 'Total', value: stats.total, color: 'text-slate-800', bg: 'bg-white' },
          { label: 'Nuevos', value: stats.nuevos, color: 'text-blue-700', bg: 'bg-blue-50' },
          { label: 'Contactados', value: stats.contactados, color: 'text-amber-700', bg: 'bg-amber-50' },
          { label: 'Convertidos', value: stats.convertidos, color: 'text-green-700', bg: 'bg-green-50' },
          { label: 'Google Ads', value: stats.googleAds, color: 'text-fuchsia-700', bg: 'bg-fuchsia-50' },
        ].map((s) => (
          <div key={s.label} className={`${s.bg} rounded-xl border border-border p-4`}>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{s.label}</p>
            <p className={`text-2xl font-bold ${s.color} mt-1`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <Filter className="w-4 h-4 text-slate-400" />
        <select
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value)}
          className="px-3 py-2 border border-border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
        >
          {ESTADOS.map((e) => (
            <option key={e.value} value={e.value}>{e.label}</option>
          ))}
        </select>
        <select
          value={filtroFuente}
          onChange={(e) => setFiltroFuente(e.target.value)}
          className="px-3 py-2 border border-border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
        >
          {FUENTES.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
        <select
          value={filtroAtribucion}
          onChange={(e) => setFiltroAtribucion(e.target.value)}
          className="px-3 py-2 border border-border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
          title="Filtrar por origen del tráfico externo"
        >
          {ATRIBUCION_OPCIONES.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <span className="text-xs text-slate-400 ml-auto">
          {leadsVisibles.length} visibles · {total} totales
        </span>
      </div>

      {/* Barra de acciones masivas: aparece solo cuando hay selección.
          Uso principal: limpiar leads de prueba generados durante QA. */}
      {seleccionados.size > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm">
          <span className="font-semibold text-red-700">
            {seleccionados.size} seleccionado{seleccionados.size === 1 ? '' : 's'}
          </span>
          <button
            onClick={() => setSeleccionados(new Set())}
            className="text-xs text-slate-500 hover:text-slate-700"
          >
            Limpiar selección
          </button>
          <button
            onClick={() => eliminarLeads(Array.from(seleccionados))}
            disabled={borrando}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-red-700 disabled:opacity-50"
          >
            {borrando ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
            Eliminar seleccionados
          </button>
        </div>
      )}

      {/* Tabla */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : leadsVisibles.length === 0 ? (
        <div className="bg-white rounded-xl border border-border p-12 text-center">
          <UserPlus className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">
            No hay leads
            {filtroEstado !== 'todos' ||
            filtroFuente !== 'todos' ||
            filtroAtribucion !== 'todos'
              ? ' con estos filtros'
              : ' aún'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-slate-50">
                  <th className="px-3 py-3 w-8">
                    <input
                      type="checkbox"
                      aria-label="Seleccionar todos"
                      checked={
                        leadsVisibles.length > 0 &&
                        leadsVisibles.every((l) => seleccionados.has(l.id))
                      }
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSeleccionados(new Set(leadsVisibles.map((l) => l.id)));
                        } else {
                          setSeleccionados(new Set());
                        }
                      }}
                      className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary/20 cursor-pointer"
                    />
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Contacto</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Fuente</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Atribución</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Estado</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Fecha</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider w-48">Notas</th>
                  <th className="px-3 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {leadsVisibles.map((lead) => (
                  <tr
                    key={lead.id}
                    className={`hover:bg-slate-50 transition-colors ${
                      seleccionados.has(lead.id) ? 'bg-red-50/40' : ''
                    }`}
                  >
                    <td className="px-3 py-3 align-top">
                      <input
                        type="checkbox"
                        aria-label={`Seleccionar lead de ${lead.nombre}`}
                        checked={seleccionados.has(lead.id)}
                        onChange={() => toggleSeleccion(lead.id)}
                        className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary/20 cursor-pointer mt-1"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-800">{lead.nombre}</div>
                      {lead.empresa && (
                        <div className="flex items-center gap-1 text-xs text-slate-400 mt-0.5">
                          <Building2 className="w-3 h-3" /> {lead.empresa}
                        </div>
                      )}
                      <div className="flex items-center gap-3 mt-1">
                        {lead.email && (
                          <a href={`mailto:${lead.email}`} className="flex items-center gap-1 text-xs text-slate-400 hover:text-primary">
                            <Mail className="w-3 h-3" /> {lead.email}
                          </a>
                        )}
                        {lead.telefono && (
                          <a href={`tel:${lead.telefono}`} className="flex items-center gap-1 text-xs text-slate-400 hover:text-primary">
                            <Phone className="w-3 h-3" /> {lead.telefono}
                          </a>
                        )}
                      </div>
                      {lead.mensaje && (
                        <p className="text-xs text-slate-400 mt-1 italic max-w-xs truncate">&ldquo;{lead.mensaje}&rdquo;</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-slate-500">{lead.fuente}</span>
                      {lead.whatsapp_enviado && (
                        <span className="flex items-center gap-1 text-xs text-green-600 mt-0.5">
                          <MessageCircle className="w-3 h-3" /> WhatsApp
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">
                      {lead.gclid ? (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-fuchsia-100 text-fuchsia-700 text-[11px] font-semibold"
                          title={`gclid: ${lead.gclid}`}
                        >
                          <Target className="w-3 h-3" /> Google Ads
                        </span>
                      ) : lead.utm_source || lead.utm_campaign ? (
                        <span className="inline-block px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-[11px] font-semibold">
                          UTM
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-400">Directo / orgánico</span>
                      )}
                      {(lead.utm_source || lead.utm_campaign || lead.utm_medium) && (
                        <div className="mt-1 text-[11px] text-slate-500 leading-tight space-y-0.5">
                          {lead.utm_source && (
                            <div>
                              <span className="text-slate-400">src:</span> {lead.utm_source}
                            </div>
                          )}
                          {lead.utm_medium && (
                            <div>
                              <span className="text-slate-400">med:</span> {lead.utm_medium}
                            </div>
                          )}
                          {lead.utm_campaign && (
                            <div>
                              <span className="text-slate-400">cmp:</span> {lead.utm_campaign}
                            </div>
                          )}
                        </div>
                      )}
                      {!lead.gclid && !lead.utm_source && lead.referrer && (
                        <div
                          className="mt-1 text-[11px] text-slate-400 truncate max-w-[140px]"
                          title={lead.referrer}
                        >
                          ref: {formatHost(lead.referrer)}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="relative">
                        <select
                          value={lead.estado}
                          onChange={(e) => actualizarEstado(lead.id, e.target.value)}
                          disabled={saving === lead.id}
                          className={`appearance-none px-3 py-1.5 rounded-full text-xs font-bold pr-7 cursor-pointer border-0 focus:outline-none focus:ring-2 focus:ring-primary/20 ${getEstadoStyle(lead.estado)}`}
                        >
                          {ESTADOS.filter((e) => e.value !== 'todos').map((e) => (
                            <option key={e.value} value={e.value}>{e.label}</option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none" />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1 text-xs text-slate-400">
                        <Calendar className="w-3 h-3" /> {formatFecha(lead.created_at)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {editingId === lead.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            autoFocus
                            defaultValue={lead.notas || ''}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') guardarNotas(lead.id, (e.target as HTMLInputElement).value);
                              if (e.key === 'Escape') setEditingId(null);
                            }}
                            className="w-full px-2 py-1 border border-border rounded text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
                            placeholder="Agregar nota..."
                          />
                          <button
                            onClick={(e) => {
                              const input = (e.currentTarget.previousElementSibling as HTMLInputElement);
                              guardarNotas(lead.id, input.value);
                            }}
                            className="text-primary hover:text-primary/80"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setEditingId(lead.id)}
                          className="text-xs text-slate-400 hover:text-slate-600 cursor-pointer text-left w-full"
                        >
                          {lead.notas || 'Agregar nota...'}
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-3 align-top">
                      <button
                        onClick={() => eliminarLeads([lead.id])}
                        disabled={borrando}
                        aria-label={`Eliminar lead de ${lead.nombre}`}
                        title="Eliminar lead"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition disabled:opacity-40"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
