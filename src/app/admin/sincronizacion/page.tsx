'use client';

import { useState, useEffect } from 'react';
import {
  CloudCog,
  Key,
  GitBranch,
  History,
  Check,
  AlertTriangle,
  Eye,
  EyeOff,
  Building2,
  Package,
  Receipt,
  ArrowRight,
  Loader2,
  Wifi,
  WifiOff,
  Save,
  Users,
  ShoppingCart,
  FileText,
} from 'lucide-react';

interface TestResult {
  success: boolean;
  version?: { server_version?: string };
  uid?: number;
  partners_count?: number;
  products_count?: number;
  sample_partners?: Record<string, unknown>[];
  sample_products?: Record<string, unknown>[];
  sale_orders_count?: number;
  sample_orders?: Record<string, unknown>[];
  error?: string;
}

interface OdooConfigSummary {
  id: string;
  odoo_url: string;
  odoo_db: string;
  odoo_username: string;
  odoo_version: string;
  has_password: boolean;
  ultimo_test_exitoso: boolean | null;
  ultimo_test_fecha: string | null;
  ultimo_test_mensaje: string | null;
}

export default function SincronizacionOdooPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [configId, setConfigId] = useState<string | null>(null);
  const [hasStoredPassword, setHasStoredPassword] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [form, setForm] = useState({
    odoo_url: '',
    odoo_db: '',
    odoo_username: '',
    odoo_password: '',
    odoo_version: '16.0',
  });

  const [lastTest, setLastTest] = useState<{
    exitoso: boolean;
    fecha: string | null;
    mensaje: string | null;
  } | null>(null);

  // Cargar config existente de BD
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const response = await fetch('/api/odoo/config', {
          cache: 'no-store',
        });
        const payload = await response.json();
        const config = (payload.config ?? null) as OdooConfigSummary | null;

        if (response.ok && config) {
          setConfigId(config.id);
          setHasStoredPassword(config.has_password);
          setForm({
            odoo_url: config.odoo_url || '',
            odoo_db: config.odoo_db || '',
            odoo_username: config.odoo_username || '',
            odoo_password: '',
            odoo_version: config.odoo_version || '16.0',
          });
          setLastTest(
            config.ultimo_test_exitoso !== null || config.ultimo_test_fecha || config.ultimo_test_mensaje
              ? {
                  exitoso: Boolean(config.ultimo_test_exitoso),
                  fecha: config.ultimo_test_fecha,
                  mensaje: config.ultimo_test_mensaje,
                }
              : null
          );
        }
      } catch (error) {
        console.error('Error cargando config Odoo:', error);
      }
      setLoading(false);
    };
    loadConfig();
  }, []);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 5000);
  };

  // Guardar configuración
  const handleSave = async () => {
    if (!form.odoo_url || !form.odoo_db || !form.odoo_username || (!form.odoo_password && !hasStoredPassword)) {
      showToast('error', 'Todos los campos son requeridos');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/odoo/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();

      if (!res.ok) {
        showToast('error', data.error || 'Error al guardar');
      } else {
        setConfigId(data.config?.id || configId);
        setHasStoredPassword(Boolean(data.config?.has_password));
        setForm((current) => ({
          ...current,
          odoo_url: data.config?.odoo_url || current.odoo_url,
          odoo_db: data.config?.odoo_db || current.odoo_db,
          odoo_username: data.config?.odoo_username || current.odoo_username,
          odoo_password: '',
          odoo_version: data.config?.odoo_version || current.odoo_version,
        }));
        showToast('success', 'Configuración guardada correctamente');
      }
    } catch {
      showToast('error', 'Error de red al guardar');
    }
    setSaving(false);
  };

  // Test de conexión
  const handleTest = async () => {
    if (!form.odoo_url || !form.odoo_db || !form.odoo_username || (!form.odoo_password && !hasStoredPassword)) {
      showToast('error', 'Completa todos los campos antes de probar');
      return;
    }

    setTesting(true);
    setTestResult(null);
    const startTime = Date.now();

    try {
      const res = await fetch('/api/odoo/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

      setTestResult(data);

      if (data.success) {
        setLastTest({
          exitoso: true,
          fecha: new Date().toISOString(),
          mensaje: `Conectado en ${elapsed}s. UID: ${data.uid}`,
        });
        showToast('success', `Conexión exitosa en ${elapsed}s`);
      } else {
        setLastTest({
          exitoso: false,
          fecha: new Date().toISOString(),
          mensaje: data.error || 'Error desconocido',
        });
        showToast('error', data.error || 'Error de conexión');
      }
    } catch {
      showToast('error', 'Error de red al probar conexión');
    }
    setTesting(false);
  };

  const connectionStatus = lastTest
    ? lastTest.exitoso
      ? 'connected'
      : 'error'
    : configId
    ? 'configured'
    : 'unconfigured';

  const statusBadge = {
    unconfigured: { label: 'Sin configurar', className: 'bg-slate-100 text-slate-600 border-slate-200' },
    configured: { label: 'Configurado', className: 'bg-blue-50 text-blue-600 border-blue-200' },
    connected: { label: 'Conectado', className: 'bg-green-50 text-green-600 border-green-200' },
    error: { label: 'Error', className: 'bg-red-50 text-red-600 border-red-200' },
  };

  const badge = statusBadge[connectionStatus];

  const mappings = [
    { label: 'Clientes (Empresas)', description: 'res.partner → empresas', icon: Building2, color: 'bg-blue-100 text-blue-600', model: 'res.partner' },
    { label: 'Productos', description: 'product.template → catálogo', icon: Package, color: 'bg-amber-100 text-amber-600', model: 'product.template' },
    { label: 'Órdenes de Venta', description: 'sale.order → pedidos', icon: Receipt, color: 'bg-emerald-100 text-emerald-600', model: 'sale.order' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium flex items-center gap-2 ${
          toast.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          {toast.type === 'success' ? <Check className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {toast.message}
        </div>
      )}

      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
          <span className="p-2 bg-purple-100 rounded-lg text-purple-600">
            <CloudCog className="w-5 h-5" />
          </span>
          Configuración de Integración Odoo v16
        </h1>
        <p className="text-sm text-slate-500 mt-0.5 ml-14">Administre la conexión JSON-RPC con su instancia ERP corporativa.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Credenciales de Conexión */}
          <div className="bg-white rounded-xl shadow-sm border border-border p-6">
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Key className="w-5 h-5 text-primary" />
                Credenciales de Conexión
              </h2>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${badge.className}`}>
                {connectionStatus === 'connected' && <Wifi className="w-3 h-3 mr-1" />}
                {connectionStatus === 'error' && <WifiOff className="w-3 h-3 mr-1" />}
                {badge.label}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">URL del Servidor</label>
                <input
                  className="block w-full px-3 py-2.5 text-sm border border-border rounded-lg bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                  placeholder="https://tu-empresa.odoo.com"
                  value={form.odoo_url}
                  onChange={(e) => setForm({ ...form, odoo_url: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nombre de la Base de Datos</label>
                <input
                  className="block w-full px-3 py-2.5 text-sm border border-border rounded-lg bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                  placeholder="nombre_base_datos"
                  value={form.odoo_db}
                  onChange={(e) => setForm({ ...form, odoo_db: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nombre de Usuario (Email)</label>
                <input
                  className="block w-full px-3 py-2.5 text-sm border border-border rounded-lg bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                  placeholder="admin@empresa.com"
                  type="email"
                  value={form.odoo_username}
                  onChange={(e) => setForm({ ...form, odoo_username: e.target.value })}
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Contraseña</label>
                <div className="relative">
                  <input
                    className="block w-full px-3 py-2.5 pr-10 text-sm border border-border rounded-lg bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                    type={showPassword ? 'text' : 'password'}
                    placeholder={hasStoredPassword ? 'Contraseña guardada. Déjala vacía para conservarla' : 'Contraseña de acceso a la API'}
                    value={form.odoo_password}
                    onChange={(e) => setForm({ ...form, odoo_password: e.target.value })}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {hasStoredPassword
                    ? 'Por seguridad, la contraseña guardada no se expone al navegador. Solo escribe una nueva si deseas reemplazarla.'
                    : 'La contraseña solo se usa del lado servidor para autenticar contra Odoo.'}
                </p>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-border">
              <button
                onClick={handleTest}
                disabled={testing}
                className="px-4 py-2 border border-border shadow-sm text-sm font-medium rounded-lg text-slate-700 bg-white hover:bg-slate-50 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
                {testing ? 'Probando...' : 'Probar Conexión'}
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-lg text-white bg-primary hover:bg-primary-dark transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            </div>
          </div>

          {/* Resultado del Test */}
          {testResult && (
            <div className={`bg-white rounded-xl shadow-sm border p-6 ${
              testResult.success ? 'border-green-200' : 'border-red-200'
            }`}>
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-4">
                {testResult.success ? (
                  <Check className="w-5 h-5 text-green-500" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-red-500" />
                )}
                Resultado del Test de Conexión
              </h2>

              {testResult.success ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 p-3 rounded-lg">
                    <Wifi className="w-4 h-4" />
                    Conectado a Odoo {(testResult.version as Record<string, string>)?.server_version || ''} — UID: {testResult.uid}
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-slate-50 rounded-lg p-4 text-center">
                      <Users className="w-5 h-5 text-blue-500 mx-auto mb-1" />
                      <div className="text-2xl font-bold text-slate-900">{testResult.partners_count}</div>
                      <div className="text-xs text-slate-500">Clientes</div>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-4 text-center">
                      <Package className="w-5 h-5 text-amber-500 mx-auto mb-1" />
                      <div className="text-2xl font-bold text-slate-900">{testResult.products_count}</div>
                      <div className="text-xs text-slate-500">Productos</div>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-4 text-center">
                      <ShoppingCart className="w-5 h-5 text-emerald-500 mx-auto mb-1" />
                      <div className="text-2xl font-bold text-slate-900">{testResult.sale_orders_count}</div>
                      <div className="text-xs text-slate-500">Pedidos</div>
                    </div>
                  </div>

                  {/* Muestra de Partners */}
                  {testResult.sample_partners && testResult.sample_partners.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-slate-700 mb-2">Muestra de Clientes</h3>
                      <div className="bg-slate-50 rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border">
                              <th className="text-left px-3 py-2 text-xs font-medium text-slate-500">ID</th>
                              <th className="text-left px-3 py-2 text-xs font-medium text-slate-500">Nombre</th>
                              <th className="text-left px-3 py-2 text-xs font-medium text-slate-500">Email</th>
                              <th className="text-left px-3 py-2 text-xs font-medium text-slate-500">NIT</th>
                            </tr>
                          </thead>
                          <tbody>
                            {testResult.sample_partners.map((p) => (
                              <tr key={String(p.id)} className="border-b border-border last:border-0">
                                <td className="px-3 py-2 text-slate-600 font-mono text-xs">{String(p.id)}</td>
                                <td className="px-3 py-2 text-slate-900 font-medium">{String(p.name)}</td>
                                <td className="px-3 py-2 text-slate-500">{String(p.email || '—')}</td>
                                <td className="px-3 py-2 text-slate-500 font-mono text-xs">{String(p.vat || '—')}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Muestra de Productos */}
                  {testResult.sample_products && testResult.sample_products.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-slate-700 mb-2">Muestra de Productos</h3>
                      <div className="bg-slate-50 rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border">
                              <th className="text-left px-3 py-2 text-xs font-medium text-slate-500">ID</th>
                              <th className="text-left px-3 py-2 text-xs font-medium text-slate-500">Nombre</th>
                              <th className="text-left px-3 py-2 text-xs font-medium text-slate-500">Ref</th>
                              <th className="text-right px-3 py-2 text-xs font-medium text-slate-500">Precio</th>
                            </tr>
                          </thead>
                          <tbody>
                            {testResult.sample_products.map((p) => (
                              <tr key={String(p.id)} className="border-b border-border last:border-0">
                                <td className="px-3 py-2 text-slate-600 font-mono text-xs">{String(p.id)}</td>
                                <td className="px-3 py-2 text-slate-900 font-medium">{String(p.name)}</td>
                                <td className="px-3 py-2 text-slate-500 font-mono text-xs">{String(p.default_code || '—')}</td>
                                <td className="px-3 py-2 text-slate-900 text-right">${Number(p.list_price).toLocaleString()}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-red-50 p-4 rounded-lg">
                  <p className="text-sm text-red-700 font-medium">Error de conexión</p>
                  <p className="text-sm text-red-600 mt-1">{testResult.error}</p>
                </div>
              )}
            </div>
          )}

          {/* Mapeo de Entidades */}
          <div className="bg-white rounded-xl shadow-sm border border-border p-6">
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <GitBranch className="w-5 h-5 text-primary" />
                Mapeo de Entidades
              </h2>
              <span className="text-xs text-slate-500">Configuración fija</span>
            </div>

            <div className="space-y-3">
              {mappings.map((mapping) => {
                const Icon = mapping.icon;
                return (
                  <div key={mapping.label} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-border">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded ${mapping.color}`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-medium text-slate-900">{mapping.label}</h4>
                        <p className="text-xs text-slate-500">{mapping.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <ArrowRight className="w-4 h-4 text-slate-400" />
                      <span className="text-sm font-mono text-slate-600 bg-white px-3 py-1.5 rounded border border-border">{mapping.model}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          {/* Estado de Conexión */}
          <div className="bg-white rounded-xl shadow-sm border border-border p-6">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-4">
              <History className="w-5 h-5 text-primary" />
              Estado de Conexión
            </h2>

            {lastTest ? (
              <div className="space-y-3">
                <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
                  lastTest.exitoso ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                }`}>
                  {lastTest.exitoso ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
                  {lastTest.exitoso ? 'Conexión activa' : 'Error de conexión'}
                </div>
                {lastTest.fecha && (
                  <p className="text-xs text-slate-500">
                    Último test: {new Date(lastTest.fecha).toLocaleString('es-CO')}
                  </p>
                )}
                {lastTest.mensaje && (
                  <p className="text-xs text-slate-500">{lastTest.mensaje}</p>
                )}
              </div>
            ) : (
              <div className="text-center py-6">
                <WifiOff className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm text-slate-500">Sin test de conexión aún.</p>
                <p className="text-xs text-slate-400 mt-1">Configura las credenciales y prueba la conexión.</p>
              </div>
            )}
          </div>

          {/* Info rápida */}
          <div className="bg-white rounded-xl shadow-sm border border-border p-6">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-4">
              <FileText className="w-5 h-5 text-primary" />
              Información
            </h2>
            <div className="space-y-3 text-sm text-slate-600">
              <p>La integración con Odoo permite:</p>
              <ul className="space-y-2 ml-1">
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                  <span>Leer clientes y sus datos de contacto</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                  <span>Consultar catálogo de productos y precios</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                  <span>Verificar estado de pedidos de venta</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                  <span>Sincronizar datos entre plataformas</span>
                </li>
              </ul>
              <p className="text-xs text-slate-400 mt-3">Conexión via JSON-RPC 2.0 (solo lectura)</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
