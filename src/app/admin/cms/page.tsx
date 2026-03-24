'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Save, Loader2, Upload, Trash2, Plus, ChevronDown, ChevronRight,
  Globe, FileText, Layout, Image as ImageIcon, AlertCircle, Check, MessageCircle,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────
interface Seccion {
  id: string;
  titulo: string | null;
  subtitulo: string | null;
  contenido: Record<string, unknown>;
  imagen_url: string | null;
  orden: number;
  activo: boolean;
  updated_at: string;
}

type TabId = 'landing' | 'seo' | 'paginas';

const LANDING_IDS = ['hero', 'categorias', 'eficiencia', 'clientes', 'testimonios', 'cta', 'footer'];
const PAGE_IDS = ['pagina_nosotros', 'pagina_contacto', 'pagina_faq', 'pagina_terminos', 'pagina_privacidad'];

const SECTION_LABELS: Record<string, string> = {
  hero: 'Hero Principal',
  categorias: 'Categorías',
  eficiencia: 'Eficiencia Operativa',
  clientes: 'Logos Clientes',
  testimonios: 'Testimonios',
  cta: 'Call to Action Final',
  footer: 'Footer',
  seo: 'SEO / Schema / AEO',
  pagina_nosotros: 'Sobre Nosotros',
  pagina_contacto: 'Contacto',
  pagina_faq: 'Preguntas Frecuentes',
  pagina_terminos: 'Términos y Condiciones',
  pagina_privacidad: 'Política de Privacidad',
  config_whatsapp: 'WhatsApp / Asesor',
};

// ─── Main Component ──────────────────────────────────────────
export default function CMSPage() {
  const [secciones, setSecciones] = useState<Record<string, Seccion>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('landing');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  const fetchSecciones = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/landing/contenido?all=true');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSecciones(data.contenido || {});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando contenido');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchSecciones(); }, [fetchSecciones]);

  const toggleSection = (id: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const updateLocal = (id: string, changes: Partial<Seccion>) => {
    setSecciones((prev) => ({
      ...prev,
      [id]: { ...prev[id], ...changes },
    }));
  };

  const updateContenido = (id: string, key: string, value: unknown) => {
    setSecciones((prev) => {
      const sec = prev[id];
      if (!sec) return prev;
      return {
        ...prev,
        [id]: { ...sec, contenido: { ...sec.contenido, [key]: value } },
      };
    });
  };

  const guardarSeccion = async (id: string) => {
    const sec = secciones[id];
    if (!sec) return;

    setSaving(id);
    setError(null);
    try {
      const res = await fetch('/api/landing/contenido', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          titulo: sec.titulo,
          subtitulo: sec.subtitulo,
          contenido: sec.contenido,
          imagen_url: sec.imagen_url,
          orden: sec.orden,
          activo: sec.activo,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSaved(id);
      setTimeout(() => setSaved(null), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error guardando');
    } finally {
      setSaving(null);
    }
  };

  const subirImagen = async (file: File, folder: string): Promise<string | null> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('folder', folder);
    try {
      const res = await fetch('/api/landing/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      return data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error subiendo imagen');
      return null;
    }
  };

  // ─── Render helpers ──────────────────────────────────────────
  const renderInput = (label: string, value: string, onChange: (v: string) => void, opts?: { placeholder?: string; type?: string }) => (
    <div>
      <label className="block text-xs font-semibold text-slate-500 mb-1">{label}</label>
      <input
        type={opts?.type || 'text'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={opts?.placeholder}
        className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
      />
    </div>
  );

  const renderTextarea = (label: string, value: string, onChange: (v: string) => void, rows = 3) => (
    <div>
      <label className="block text-xs font-semibold text-slate-500 mb-1">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-y"
      />
    </div>
  );

  const renderImageUpload = (label: string, currentUrl: string | null, onUpload: (url: string) => void, folder: string) => (
    <div>
      <label className="block text-xs font-semibold text-slate-500 mb-1">{label}</label>
      <div className="flex items-center gap-3">
        {currentUrl && (
          <img src={currentUrl} alt={label} className="w-16 h-16 object-contain rounded-lg border border-border bg-slate-50" />
        )}
        <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-2 border border-border rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors">
          <Upload className="w-4 h-4" />
          {currentUrl ? 'Cambiar' : 'Subir imagen'}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const url = await subirImagen(file, folder);
              if (url) onUpload(url);
            }}
          />
        </label>
        {currentUrl && (
          <button onClick={() => onUpload('')} className="text-red-500 hover:text-red-700 text-xs">
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );

  const renderSaveButton = (id: string) => (
    <button
      onClick={() => guardarSeccion(id)}
      disabled={saving === id}
      className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-slate-900 font-bold text-sm px-5 py-2.5 rounded-lg transition-all disabled:opacity-50"
    >
      {saving === id ? <Loader2 className="w-4 h-4 animate-spin" /> : saved === id ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
      {saving === id ? 'Guardando...' : saved === id ? 'Guardado' : 'Guardar'}
    </button>
  );

  const renderToggle = (id: string) => {
    const sec = secciones[id];
    if (!sec) return null;
    return (
      <button
        onClick={(e) => { e.stopPropagation(); updateLocal(id, { activo: !sec.activo }); }}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${sec.activo ? 'bg-primary' : 'bg-slate-300'}`}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${sec.activo ? 'translate-x-6' : 'translate-x-1'}`} />
      </button>
    );
  };

  // ─── Section wrapper ─────────────────────────────────────────
  const renderSectionCard = (id: string, children: React.ReactNode) => {
    const expanded = expandedSections.has(id);
    return (
      <div key={id} className="bg-white rounded-xl border border-border overflow-hidden">
        <div
          role="button"
          tabIndex={0}
          onClick={() => toggleSection(id)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggleSection(id); }}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors cursor-pointer select-none"
        >
          <div className="flex items-center gap-3">
            {expanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
            <span className="text-sm font-semibold text-slate-800">{SECTION_LABELS[id] || id}</span>
            {secciones[id] && !secciones[id].activo && (
              <span className="text-[10px] bg-slate-200 text-slate-500 px-2 py-0.5 rounded-full font-medium">Inactivo</span>
            )}
          </div>
          <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
            {renderToggle(id)}
          </div>
        </div>
        {expanded && (
          <div className="px-5 pb-5 border-t border-border space-y-4 pt-4">
            {children}
            <div className="flex justify-end pt-2">{renderSaveButton(id)}</div>
          </div>
        )}
      </div>
    );
  };

  // ─── Section-specific editors ─────────────────────────────────
  const renderHero = () => {
    const s = secciones.hero;
    if (!s) return null;
    const c = s.contenido;
    return renderSectionCard('hero', <>
      {renderInput('Título', s.titulo || '', (v) => updateLocal('hero', { titulo: v }))}
      {renderTextarea('Subtítulo', s.subtitulo || '', (v) => updateLocal('hero', { subtitulo: v }))}
      {renderInput('Badge', (c.badge as string) || '', (v) => updateContenido('hero', 'badge', v), { placeholder: 'Ej: Soluciones Corporativas 2025' })}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {renderInput('Texto CTA primario', (c.cta_primario as string) || '', (v) => updateContenido('hero', 'cta_primario', v))}
        {renderInput('URL CTA primario', (c.cta_primario_url as string) || '', (v) => updateContenido('hero', 'cta_primario_url', v))}
        {renderInput('Texto CTA secundario', (c.cta_secundario as string) || '', (v) => updateContenido('hero', 'cta_secundario', v))}
        {renderInput('URL CTA secundario', (c.cta_secundario_url as string) || '', (v) => updateContenido('hero', 'cta_secundario_url', v))}
      </div>
      {renderImageUpload('Imagen Hero', s.imagen_url, (url) => updateLocal('hero', { imagen_url: url || null }), 'hero')}
    </>);
  };

  const renderCategorias = () => {
    const s = secciones.categorias;
    if (!s) return null;
    const items = (s.contenido.items || []) as Array<{ titulo: string; descripcion: string; icono: string; imagen_url: string | null }>;
    return renderSectionCard('categorias', <>
      {renderInput('Título', s.titulo || '', (v) => updateLocal('categorias', { titulo: v }))}
      {renderInput('Subtítulo', s.subtitulo || '', (v) => updateLocal('categorias', { subtitulo: v }))}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {renderInput('Texto CTA', (s.contenido.cta_texto as string) || '', (v) => updateContenido('categorias', 'cta_texto', v))}
        {renderInput('URL CTA', (s.contenido.cta_url as string) || '', (v) => updateContenido('categorias', 'cta_url', v))}
      </div>
      <label className="block text-xs font-semibold text-slate-500">Categorías ({items.length})</label>
      {items.map((item, i) => (
        <div key={i} className="bg-slate-50 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">Categoría {i + 1}</span>
            <button onClick={() => {
              const next = [...items];
              next.splice(i, 1);
              updateContenido('categorias', 'items', next);
            }} className="text-red-500 hover:text-red-700"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {renderInput('Título', item.titulo, (v) => { const next = [...items]; next[i] = { ...next[i], titulo: v }; updateContenido('categorias', 'items', next); })}
            {renderInput('Ícono', item.icono, (v) => { const next = [...items]; next[i] = { ...next[i], icono: v }; updateContenido('categorias', 'items', next); })}
          </div>
          {renderInput('Descripción', item.descripcion, (v) => { const next = [...items]; next[i] = { ...next[i], descripcion: v }; updateContenido('categorias', 'items', next); })}
          {renderImageUpload('Imagen', item.imagen_url, (url) => { const next = [...items]; next[i] = { ...next[i], imagen_url: url || null }; updateContenido('categorias', 'items', next); }, 'categorias')}
        </div>
      ))}
      <button onClick={() => updateContenido('categorias', 'items', [...items, { titulo: '', descripcion: '', icono: '', imagen_url: null }])}
        className="inline-flex items-center gap-1 text-sm text-primary font-semibold hover:underline"><Plus className="w-4 h-4" /> Agregar categoría</button>
    </>);
  };

  const renderEficiencia = () => {
    const s = secciones.eficiencia;
    if (!s) return null;
    const items = (s.contenido.items || []) as Array<{ titulo: string; descripcion: string; icono: string }>;
    return renderSectionCard('eficiencia', <>
      {renderInput('Título', s.titulo || '', (v) => updateLocal('eficiencia', { titulo: v }))}
      {renderTextarea('Subtítulo', s.subtitulo || '', (v) => updateLocal('eficiencia', { subtitulo: v }))}
      <label className="block text-xs font-semibold text-slate-500">Items ({items.length})</label>
      {items.map((item, i) => (
        <div key={i} className="bg-slate-50 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">Item {i + 1}</span>
            <button onClick={() => { const next = [...items]; next.splice(i, 1); updateContenido('eficiencia', 'items', next); }}
              className="text-red-500 hover:text-red-700"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {renderInput('Título', item.titulo, (v) => { const next = [...items]; next[i] = { ...next[i], titulo: v }; updateContenido('eficiencia', 'items', next); })}
            {renderInput('Ícono', item.icono, (v) => { const next = [...items]; next[i] = { ...next[i], icono: v }; updateContenido('eficiencia', 'items', next); })}
          </div>
          {renderInput('Descripción', item.descripcion, (v) => { const next = [...items]; next[i] = { ...next[i], descripcion: v }; updateContenido('eficiencia', 'items', next); })}
        </div>
      ))}
      <button onClick={() => updateContenido('eficiencia', 'items', [...items, { titulo: '', descripcion: '', icono: '' }])}
        className="inline-flex items-center gap-1 text-sm text-primary font-semibold hover:underline"><Plus className="w-4 h-4" /> Agregar item</button>
    </>);
  };

  const renderClientes = () => {
    const s = secciones.clientes;
    if (!s) return null;
    const logos = (s.contenido.logos || []) as Array<{ nombre: string; logo_url?: string }>;
    return renderSectionCard('clientes', <>
      {renderInput('Título', s.titulo || '', (v) => updateLocal('clientes', { titulo: v }))}
      <label className="block text-xs font-semibold text-slate-500">Logos ({logos.length})</label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {logos.map((logo, i) => (
          <div key={i} className="bg-slate-50 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500">{logo.nombre || `Logo ${i + 1}`}</span>
              <button onClick={() => { const next = [...logos]; next.splice(i, 1); updateContenido('clientes', 'logos', next); }}
                className="text-red-500 hover:text-red-700"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
            {renderInput('Nombre empresa', logo.nombre, (v) => { const next = [...logos]; next[i] = { ...next[i], nombre: v }; updateContenido('clientes', 'logos', next); })}
            {renderImageUpload('Logo', logo.logo_url || null, (url) => { const next = [...logos]; next[i] = { ...next[i], logo_url: url || undefined }; updateContenido('clientes', 'logos', next); }, 'clientes')}
          </div>
        ))}
      </div>
      <button onClick={() => updateContenido('clientes', 'logos', [...logos, { nombre: '' }])}
        className="inline-flex items-center gap-1 text-sm text-primary font-semibold hover:underline"><Plus className="w-4 h-4" /> Agregar logo</button>
    </>);
  };

  const renderTestimonios = () => {
    const s = secciones.testimonios;
    if (!s) return null;
    const items = (s.contenido.items || []) as Array<{ nombre: string; cargo: string; empresa: string; texto: string; estrellas: number }>;
    return renderSectionCard('testimonios', <>
      {renderInput('Título', s.titulo || '', (v) => updateLocal('testimonios', { titulo: v }))}
      {renderInput('Subtítulo', s.subtitulo || '', (v) => updateLocal('testimonios', { subtitulo: v }))}
      <label className="block text-xs font-semibold text-slate-500">Testimonios ({items.length})</label>
      {items.map((item, i) => (
        <div key={i} className="bg-slate-50 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">{item.nombre || `Testimonio ${i + 1}`}</span>
            <button onClick={() => { const next = [...items]; next.splice(i, 1); updateContenido('testimonios', 'items', next); }}
              className="text-red-500 hover:text-red-700"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {renderInput('Nombre', item.nombre, (v) => { const next = [...items]; next[i] = { ...next[i], nombre: v }; updateContenido('testimonios', 'items', next); })}
            {renderInput('Cargo', item.cargo, (v) => { const next = [...items]; next[i] = { ...next[i], cargo: v }; updateContenido('testimonios', 'items', next); })}
            {renderInput('Empresa', item.empresa, (v) => { const next = [...items]; next[i] = { ...next[i], empresa: v }; updateContenido('testimonios', 'items', next); })}
          </div>
          {renderTextarea('Texto', item.texto, (v) => { const next = [...items]; next[i] = { ...next[i], texto: v }; updateContenido('testimonios', 'items', next); }, 2)}
          {renderInput('Estrellas (1-5)', String(item.estrellas), (v) => { const next = [...items]; next[i] = { ...next[i], estrellas: Math.min(5, Math.max(1, parseInt(v) || 5)) }; updateContenido('testimonios', 'items', next); }, { type: 'number' })}
        </div>
      ))}
      <button onClick={() => updateContenido('testimonios', 'items', [...items, { nombre: '', cargo: '', empresa: '', texto: '', estrellas: 5 }])}
        className="inline-flex items-center gap-1 text-sm text-primary font-semibold hover:underline"><Plus className="w-4 h-4" /> Agregar testimonio</button>
    </>);
  };

  const renderCtaFinal = () => {
    const s = secciones.cta;
    if (!s) return null;
    const c = s.contenido;
    return renderSectionCard('cta', <>
      {renderInput('Título', s.titulo || '', (v) => updateLocal('cta', { titulo: v }))}
      {renderInput('Subtítulo', s.subtitulo || '', (v) => updateLocal('cta', { subtitulo: v }))}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {renderInput('Texto CTA primario', (c.cta_primario as string) || '', (v) => updateContenido('cta', 'cta_primario', v))}
        {renderInput('URL CTA primario', (c.cta_primario_url as string) || '', (v) => updateContenido('cta', 'cta_primario_url', v))}
        {renderInput('Texto CTA secundario', (c.cta_secundario as string) || '', (v) => updateContenido('cta', 'cta_secundario', v))}
        {renderInput('URL CTA secundario', (c.cta_secundario_url as string) || '', (v) => updateContenido('cta', 'cta_secundario_url', v))}
      </div>
    </>);
  };

  const renderFooter = () => {
    const s = secciones.footer;
    if (!s) return null;
    const c = s.contenido;
    const columnas = (c.columnas || []) as Array<{ titulo: string; links: Array<{ texto: string; url: string }> }>;
    return renderSectionCard('footer', <>
      {renderInput('Título', s.titulo || '', (v) => updateLocal('footer', { titulo: v }))}
      {renderTextarea('Subtítulo', s.subtitulo || '', (v) => updateLocal('footer', { subtitulo: v }))}
      {renderInput('Copyright', (c.copyright as string) || '', (v) => updateContenido('footer', 'copyright', v))}
      <label className="block text-xs font-semibold text-slate-500">Columnas del footer ({columnas.length})</label>
      {columnas.map((col, ci) => (
        <div key={ci} className="bg-slate-50 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            {renderInput('Título columna', col.titulo, (v) => {
              const next = [...columnas]; next[ci] = { ...next[ci], titulo: v }; updateContenido('footer', 'columnas', next);
            })}
            <button onClick={() => { const next = [...columnas]; next.splice(ci, 1); updateContenido('footer', 'columnas', next); }}
              className="text-red-500 hover:text-red-700 ml-3"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
          {col.links.map((link, li) => (
            <div key={li} className="flex items-center gap-2">
              <input value={link.texto} onChange={(e) => {
                const next = [...columnas]; const links = [...next[ci].links]; links[li] = { ...links[li], texto: e.target.value }; next[ci] = { ...next[ci], links }; updateContenido('footer', 'columnas', next);
              }} placeholder="Texto" className="flex-1 px-3 py-1.5 border border-border rounded-lg text-sm" />
              <input value={link.url} onChange={(e) => {
                const next = [...columnas]; const links = [...next[ci].links]; links[li] = { ...links[li], url: e.target.value }; next[ci] = { ...next[ci], links }; updateContenido('footer', 'columnas', next);
              }} placeholder="URL" className="flex-1 px-3 py-1.5 border border-border rounded-lg text-sm" />
              <button onClick={() => {
                const next = [...columnas]; const links = [...next[ci].links]; links.splice(li, 1); next[ci] = { ...next[ci], links }; updateContenido('footer', 'columnas', next);
              }} className="text-red-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
          <button onClick={() => {
            const next = [...columnas]; next[ci] = { ...next[ci], links: [...next[ci].links, { texto: '', url: '' }] }; updateContenido('footer', 'columnas', next);
          }} className="text-xs text-primary font-semibold hover:underline flex items-center gap-1"><Plus className="w-3 h-3" /> Link</button>
        </div>
      ))}
      <button onClick={() => updateContenido('footer', 'columnas', [...columnas, { titulo: '', links: [] }])}
        className="inline-flex items-center gap-1 text-sm text-primary font-semibold hover:underline"><Plus className="w-4 h-4" /> Agregar columna</button>
    </>);
  };

  // ─── SEO Editor ──────────────────────────────────────────────
  const renderSEO = () => {
    const s = secciones.seo;
    if (!s) return <p className="text-sm text-slate-500">Ejecuta la migración 020 para habilitar SEO.</p>;
    const c = s.contenido;
    const org = (c.organization || {}) as Record<string, unknown>;
    const addr = (org.address || {}) as Record<string, string>;
    const faqs = (c.faqs || []) as Array<{ pregunta: string; respuesta: string }>;

    return (
      <div className="space-y-4">
        {renderSectionCard('seo', <>
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Meta Tags</h4>
          {renderInput('Meta Title', s.titulo || '', (v) => updateLocal('seo', { titulo: v }))}
          {renderTextarea('Meta Description', s.subtitulo || '', (v) => updateLocal('seo', { subtitulo: v }))}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {renderInput('OG Title', (c.og_title as string) || '', (v) => updateContenido('seo', 'og_title', v))}
            {renderInput('OG Description', (c.og_description as string) || '', (v) => updateContenido('seo', 'og_description', v))}
          </div>
          {renderImageUpload('OG Image', (c.og_image as string) || null, (url) => updateContenido('seo', 'og_image', url || null), 'seo')}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {renderInput('Canonical URL', (c.canonical_url as string) || '', (v) => updateContenido('seo', 'canonical_url', v))}
            {renderInput('Robots', (c.robots as string) || 'index, follow', (v) => updateContenido('seo', 'robots', v))}
          </div>

          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-6">Organización (Schema.org)</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {renderInput('Nombre empresa', (org.name as string) || '', (v) => updateContenido('seo', 'organization', { ...org, name: v }))}
            {renderInput('URL sitio web', (org.url as string) || '', (v) => updateContenido('seo', 'organization', { ...org, url: v }))}
            {renderInput('Teléfono', (org.telephone as string) || '', (v) => updateContenido('seo', 'organization', { ...org, telephone: v }))}
            {renderInput('Email', (org.email as string) || '', (v) => updateContenido('seo', 'organization', { ...org, email: v }))}
          </div>
          {renderImageUpload('Logo empresa', (org.logo as string) || null, (url) => updateContenido('seo', 'organization', { ...org, logo: url || null }), 'brand')}

          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-4">Dirección (GEO)</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {renderInput('Dirección', addr.streetAddress || '', (v) => updateContenido('seo', 'organization', { ...org, address: { ...addr, streetAddress: v } }))}
            {renderInput('Ciudad', addr.addressLocality || '', (v) => updateContenido('seo', 'organization', { ...org, address: { ...addr, addressLocality: v } }))}
            {renderInput('Departamento/Región', addr.addressRegion || '', (v) => updateContenido('seo', 'organization', { ...org, address: { ...addr, addressRegion: v } }))}
            {renderInput('Código postal', addr.postalCode || '', (v) => updateContenido('seo', 'organization', { ...org, address: { ...addr, postalCode: v } }))}
          </div>

          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-6">FAQs (AEO)</h4>
          <p className="text-xs text-slate-400">Estas preguntas generan schema FAQPage para buscadores e IAs</p>
          {faqs.map((faq, i) => (
            <div key={i} className="bg-slate-50 rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500">Pregunta {i + 1}</span>
                <button onClick={() => { const next = [...faqs]; next.splice(i, 1); updateContenido('seo', 'faqs', next); }}
                  className="text-red-500 hover:text-red-700"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
              {renderInput('Pregunta', faq.pregunta, (v) => { const next = [...faqs]; next[i] = { ...next[i], pregunta: v }; updateContenido('seo', 'faqs', next); })}
              {renderTextarea('Respuesta', faq.respuesta, (v) => { const next = [...faqs]; next[i] = { ...next[i], respuesta: v }; updateContenido('seo', 'faqs', next); }, 2)}
            </div>
          ))}
          <button onClick={() => updateContenido('seo', 'faqs', [...faqs, { pregunta: '', respuesta: '' }])}
            className="inline-flex items-center gap-1 text-sm text-primary font-semibold hover:underline"><Plus className="w-4 h-4" /> Agregar FAQ</button>
        </>)}
      </div>
    );
  };

  // ─── Pages Editor ────────────────────────────────────────────
  const renderPaginas = () => {
    return (
      <div className="space-y-4">
        {PAGE_IDS.map((id) => {
          const s = secciones[id];
          if (!s) return null;
          const c = s.contenido;

          if (id === 'pagina_faq') {
            const items = (c.items || []) as Array<{ pregunta: string; respuesta: string }>;
            return renderSectionCard(id, <>
              {renderInput('Título', s.titulo || '', (v) => updateLocal(id, { titulo: v }))}
              {renderInput('Subtítulo', s.subtitulo || '', (v) => updateLocal(id, { subtitulo: v }))}
              <label className="block text-xs font-semibold text-slate-500">Preguntas ({items.length})</label>
              {items.map((item, i) => (
                <div key={i} className="bg-slate-50 rounded-lg p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500">Pregunta {i + 1}</span>
                    <button onClick={() => { const next = [...items]; next.splice(i, 1); updateContenido(id, 'items', next); }}
                      className="text-red-500 hover:text-red-700"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                  {renderInput('Pregunta', item.pregunta, (v) => { const next = [...items]; next[i] = { ...next[i], pregunta: v }; updateContenido(id, 'items', next); })}
                  {renderTextarea('Respuesta', item.respuesta, (v) => { const next = [...items]; next[i] = { ...next[i], respuesta: v }; updateContenido(id, 'items', next); }, 3)}
                </div>
              ))}
              <button onClick={() => updateContenido(id, 'items', [...items, { pregunta: '', respuesta: '' }])}
                className="inline-flex items-center gap-1 text-sm text-primary font-semibold hover:underline"><Plus className="w-4 h-4" /> Agregar pregunta</button>
            </>);
          }

          if (id === 'pagina_contacto') {
            return renderSectionCard(id, <>
              {renderInput('Título', s.titulo || '', (v) => updateLocal(id, { titulo: v }))}
              {renderInput('Subtítulo', s.subtitulo || '', (v) => updateLocal(id, { subtitulo: v }))}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {renderInput('Teléfono', (c.telefono as string) || '', (v) => updateContenido(id, 'telefono', v))}
                {renderInput('Email', (c.email as string) || '', (v) => updateContenido(id, 'email', v))}
                {renderInput('Dirección', (c.direccion as string) || '', (v) => updateContenido(id, 'direccion', v))}
                {renderInput('Ciudad', (c.ciudad as string) || '', (v) => updateContenido(id, 'ciudad', v))}
                {renderInput('Horario', (c.horario as string) || '', (v) => updateContenido(id, 'horario', v))}
                {renderInput('URL Mapa', (c.mapa_url as string) || '', (v) => updateContenido(id, 'mapa_url', v))}
              </div>
            </>);
          }

          if (id === 'pagina_nosotros') {
            return renderSectionCard(id, <>
              {renderInput('Título', s.titulo || '', (v) => updateLocal(id, { titulo: v }))}
              {renderInput('Subtítulo', s.subtitulo || '', (v) => updateLocal(id, { subtitulo: v }))}
              {renderTextarea('Contenido principal', (c.cuerpo as string) || '', (v) => updateContenido(id, 'cuerpo', v), 6)}
              {renderTextarea('Misión', (c.mision as string) || '', (v) => updateContenido(id, 'mision', v), 3)}
              {renderTextarea('Visión', (c.vision as string) || '', (v) => updateContenido(id, 'vision', v), 3)}
              {renderImageUpload('Imagen', s.imagen_url, (url) => updateLocal(id, { imagen_url: url || null }), 'paginas')}
            </>);
          }

          // Términos y Privacidad (texto largo)
          return renderSectionCard(id, <>
            {renderInput('Título', s.titulo || '', (v) => updateLocal(id, { titulo: v }))}
            {renderTextarea('Contenido (soporta Markdown)', (c.cuerpo as string) || '', (v) => updateContenido(id, 'cuerpo', v), 12)}
          </>);
        })}
      </div>
    );
  };

  // ─── WhatsApp Config Editor ───────────────────────────────────
  const renderWhatsApp = () => {
    const s = secciones.config_whatsapp;
    if (!s) return null;
    const c = s.contenido;
    return renderSectionCard('config_whatsapp', <>
      {renderInput('Número WhatsApp (con código país, ej: 573001234567)', (c.numero as string) || '', (v) => updateContenido('config_whatsapp', 'numero', v), { placeholder: '573001234567' })}
      {renderInput('Texto del botón CTA', (c.cta_texto as string) || '', (v) => updateContenido('config_whatsapp', 'cta_texto', v))}
      {renderTextarea('Mensaje por defecto', (c.mensaje_default as string) || '', (v) => updateContenido('config_whatsapp', 'mensaje_default', v), 2)}
    </>);
  };

  // ─── Main Render ─────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'landing', label: 'Landing', icon: <Layout className="w-4 h-4" /> },
    { id: 'seo', label: 'SEO / Schema', icon: <Globe className="w-4 h-4" /> },
    { id: 'paginas', label: 'Páginas', icon: <FileText className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">CMS Landing</h1>
        <p className="text-sm text-muted mt-1">Administra el contenido del sitio público de Imprima</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
          <button onClick={() => setError(null)} className="ml-auto text-red-500 font-bold text-xs">Cerrar</button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-white rounded-xl border border-border p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.id ? 'bg-primary/10 text-primary' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'landing' && (
        <div className="space-y-4">
          {renderHero()}
          {renderCategorias()}
          {renderEficiencia()}
          {renderClientes()}
          {renderTestimonios()}
          {renderCtaFinal()}
          {renderFooter()}
          {renderWhatsApp()}
        </div>
      )}

      {activeTab === 'seo' && renderSEO()}
      {activeTab === 'paginas' && renderPaginas()}
    </div>
  );
}
