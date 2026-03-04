'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  ArrowLeft,
  Building2,
  Loader2,
  Save,
  Palette,
  Settings,
  Globe,
} from 'lucide-react';
import Link from 'next/link';

const supabase = createClient();

export default function NuevaEmpresaPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Datos empresa
  const [nombre, setNombre] = useState('');
  const [nit, setNit] = useState('');
  const [odooPartnerId, setOdooPartnerId] = useState('');
  const [presupuestoGlobal, setPresupuestoGlobal] = useState('');
  const [usaSedes, setUsaSedes] = useState(true);

  // Config empresa
  const [slug, setSlug] = useState('');
  const [colorPrimario, setColorPrimario] = useState('#9CBB06');
  const [colorSecundario, setColorSecundario] = useState('');
  const [logoUrl, setLogoUrl] = useState('');

  // Módulos activos
  const [modPresupuestos, setModPresupuestos] = useState(true);
  const [modAprobaciones, setModAprobaciones] = useState(true);
  const [modTrazabilidad, setModTrazabilidad] = useState(true);

  // Config aprobación
  const [nivelesAprobacion, setNivelesAprobacion] = useState(1);
  const [montoAutoAprobacion, setMontoAutoAprobacion] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);

    try {
      if (!nombre.trim() || !odooPartnerId.trim()) {
        setError('Nombre y Odoo Partner ID son obligatorios.');
        setSaving(false);
        return;
      }

      // Verificar sesión activa antes de intentar INSERT
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Sesión expirada. Por favor cierra sesión y vuelve a ingresar.');
        setSaving(false);
        return;
      }

      console.log('[NuevaEmpresa] Sesión activa:', session.user.email);
      console.log('[NuevaEmpresa] Token expira:', new Date(session.expires_at! * 1000).toISOString());

      // 1. Crear empresa
      const { data: empresa, error: empresaError } = await supabase
        .from('empresas')
        .insert({
          nombre: nombre.trim(),
          nit: nit.trim() || null,
          odoo_partner_id: parseInt(odooPartnerId),
          presupuesto_global_mensual: presupuestoGlobal ? parseFloat(presupuestoGlobal) : null,
          requiere_aprobacion: modAprobaciones,
          usa_sedes: usaSedes,
          config_aprobacion: {
            niveles: nivelesAprobacion,
            monto_auto_aprobacion: montoAutoAprobacion ? parseFloat(montoAutoAprobacion) : null,
          },
        })
        .select()
        .single();

      if (empresaError) {
        console.error('Error creando empresa:', JSON.stringify(empresaError));
        if (empresaError.code === '23505') {
          setError('Ya existe una empresa con ese Odoo Partner ID o NIT.');
        } else if (empresaError.code === '42501') {
          setError('Sin permisos. Verifica que tu usuario tenga rol super_admin en la tabla usuarios.');
        } else {
          setError(`Error: ${empresaError.message} (código: ${empresaError.code})`);
        }
        setSaving(false);
        return;
      }

      // 2. Crear config de empresa
      const { error: configError } = await supabase
        .from('empresa_configs')
        .insert({
          empresa_id: empresa.id,
          slug: slug.trim() || null,
          color_primario: colorPrimario,
          color_secundario: colorSecundario.trim() || null,
          logo_url: logoUrl.trim() || null,
          modulos_activos: {
            presupuestos: modPresupuestos,
            aprobaciones: modAprobaciones,
            trazabilidad: modTrazabilidad,
          },
        });

      if (configError) {
        console.error('Error creando config:', JSON.stringify(configError));
      }

      router.push(`/admin/empresas/${empresa.id}`);
    } catch (err) {
      console.error('Error inesperado:', err);
      setError('Error inesperado al crear la empresa.');
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/admin/empresas"
          className="p-2 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Nueva Empresa</h1>
          <p className="text-slate-500 text-sm mt-0.5">Registrar un nuevo cliente en la plataforma</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-3">
            {error}
          </div>
        )}

        {/* Datos básicos */}
        <div className="bg-white border border-border rounded-xl p-5 shadow-sm">
          <h2 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-slate-400" />
            Datos de la Empresa
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Nombre de la Empresa *
              </label>
              <input
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej: Ragged S.A.S"
                required
                className="w-full px-3 py-2.5 bg-white border border-border rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                NIT
              </label>
              <input
                type="text"
                value={nit}
                onChange={(e) => setNit(e.target.value)}
                placeholder="Ej: 900123456-1"
                className="w-full px-3 py-2.5 bg-white border border-border rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Odoo Partner ID *
              </label>
              <input
                type="number"
                value={odooPartnerId}
                onChange={(e) => setOdooPartnerId(e.target.value)}
                placeholder="ID del partner en Odoo"
                required
                className="w-full px-3 py-2.5 bg-white border border-border rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Presupuesto Global Mensual (COP)
              </label>
              <input
                type="number"
                value={presupuestoGlobal}
                onChange={(e) => setPresupuestoGlobal(e.target.value)}
                placeholder="Ej: 50000000"
                className="w-full px-3 py-2.5 bg-white border border-border rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
              />
            </div>
            <div className="md:col-span-2">
              <label className="flex items-center justify-between p-3 bg-slate-50 border border-border rounded-lg cursor-pointer hover:bg-slate-100 transition-colors">
                <div>
                  <p className="text-sm font-medium text-slate-900">La empresa opera con sedes</p>
                  <p className="text-xs text-slate-500">Si está activo, los compradores deben tener sede para crear pedidos.</p>
                </div>
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={usaSedes}
                    onChange={(e) => setUsaSedes(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-10 h-5 bg-slate-300 rounded-full peer-checked:bg-primary transition-colors" />
                  <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-5" />
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* Personalización visual */}
        <div className="bg-white border border-border rounded-xl p-5 shadow-sm">
          <h2 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <Palette className="w-4 h-4 text-slate-400" />
            Personalización Visual
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Slug (URL personalizada)
              </label>
              <div className="flex items-center">
                <span className="text-xs text-slate-500 mr-1">imprima.com.co/</span>
                <input
                  type="text"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  placeholder="ragged"
                  className="flex-1 px-3 py-2.5 bg-white border border-border rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary font-mono"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Logo URL
              </label>
              <input
                type="url"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://..."
                className="w-full px-3 py-2.5 bg-white border border-border rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Color Primario
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={colorPrimario}
                  onChange={(e) => setColorPrimario(e.target.value)}
                  className="w-10 h-10 rounded-lg border border-border cursor-pointer bg-transparent"
                />
                <input
                  type="text"
                  value={colorPrimario}
                  onChange={(e) => setColorPrimario(e.target.value)}
                  className="flex-1 px-3 py-2.5 bg-white border border-border rounded-lg text-sm text-slate-900 font-mono focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Color Secundario
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={colorSecundario || '#333333'}
                  onChange={(e) => setColorSecundario(e.target.value)}
                  className="w-10 h-10 rounded-lg border border-border cursor-pointer bg-transparent"
                />
                <input
                  type="text"
                  value={colorSecundario}
                  onChange={(e) => setColorSecundario(e.target.value)}
                  placeholder="Opcional"
                  className="flex-1 px-3 py-2.5 bg-white border border-border rounded-lg text-sm text-slate-900 font-mono placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                />
              </div>
            </div>
          </div>
          {/* Preview */}
          <div className="mt-4 p-3 bg-slate-50 border border-border rounded-lg flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-xs"
              style={{ backgroundColor: colorPrimario }}
            >
              {nombre ? nombre.substring(0, 2).toUpperCase() : 'AB'}
            </div>
            <div>
              <p className="text-sm font-medium text-slate-900">{nombre || 'Nombre Empresa'}</p>
              <p className="text-xs text-slate-500">Vista previa del branding</p>
            </div>
          </div>
        </div>

        {/* Módulos activos */}
        <div className="bg-white border border-border rounded-xl p-5 shadow-sm">
          <h2 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <Settings className="w-4 h-4 text-slate-400" />
            Módulos Activos
          </h2>
          <p className="text-xs text-slate-500 mb-4">
            Activa o desactiva funcionalidades según el contrato con este cliente.
          </p>
          <div className="space-y-3">
            {[
              { key: 'presupuestos', label: 'Control de Presupuestos', desc: 'Límites mensuales por sede con alertas', value: modPresupuestos, setter: setModPresupuestos },
              { key: 'aprobaciones', label: 'Flujo de Aprobaciones', desc: 'Requiere aprobación del gerente antes de procesar', value: modAprobaciones, setter: setModAprobaciones },
              { key: 'trazabilidad', label: 'Trazabilidad y Logs', desc: 'Historial detallado de cada pedido', value: modTrazabilidad, setter: setModTrazabilidad },
            ].map((mod) => (
              <label
                key={mod.key}
                className="flex items-center justify-between p-3 bg-slate-50 border border-border rounded-lg cursor-pointer hover:bg-slate-100 transition-colors"
              >
                <div>
                  <p className="text-sm font-medium text-slate-900">{mod.label}</p>
                  <p className="text-xs text-slate-500">{mod.desc}</p>
                </div>
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={mod.value}
                    onChange={(e) => mod.setter(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-10 h-5 bg-slate-300 rounded-full peer-checked:bg-primary transition-colors" />
                  <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-5" />
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Config aprobación */}
        {modAprobaciones && (
          <div className="bg-white border border-border rounded-xl p-5 shadow-sm">
            <h2 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <Globe className="w-4 h-4 text-slate-400" />
              Configuración de Aprobación
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Niveles de Aprobación
                </label>
                <select
                  value={nivelesAprobacion}
                  onChange={(e) => setNivelesAprobacion(parseInt(e.target.value))}
                  className="w-full px-3 py-2.5 bg-white border border-border rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                >
                  <option value={1}>1 nivel (Gerente aprueba)</option>
                  <option value={2}>2 niveles (Gerente + Dirección)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Monto Auto-Aprobación (COP)
                </label>
                <input
                  type="number"
                  value={montoAutoAprobacion}
                  onChange={(e) => setMontoAutoAprobacion(e.target.value)}
                  placeholder="Dejar vacío = siempre requiere aprobación"
                  className="w-full px-3 py-2.5 bg-white border border-border rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Pedidos por debajo de este monto se aprueban automáticamente.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Botones */}
        <div className="flex items-center justify-end gap-3">
          <Link
            href="/admin/empresas"
            className="px-4 py-2.5 text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-primary hover:bg-primary/90 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Creando...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Crear Empresa
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
