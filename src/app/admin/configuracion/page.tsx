'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Inbox,
  Loader2,
  Mail,
  RefreshCw,
  Send,
  ServerCog,
  Settings,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import type { NotificationEmailTemplatePreview, TipoNotificacion } from '@/types';

type DiagnosticsResponse = {
  configuration: {
    appBaseUrl: string;
    apiKeyConfigured: boolean;
    cronSecretConfigured: boolean;
    fromEmail: string | null;
    fromName: string;
    internalProcessorSecretConfigured: boolean;
    resendConfigured: boolean;
  };
  outbox: {
    error: number;
    oldestPendingAt: string | null;
    pendiente: number;
    procesando: number;
    sent: number;
    total: number;
  };
  recentEmails: {
    id: string;
    tipo: string;
    email_destino: string;
    nombre_destino: string | null;
    asunto: string;
    payload: Record<string, unknown> | null;
    estado: 'pendiente' | 'procesando' | 'enviado' | 'error';
    intentos: number;
    provider: string | null;
    provider_message_id: string | null;
    last_error: string | null;
    created_at: string;
    sent_at: string | null;
    preview_html: string | null;
    preview_text: string | null;
  }[];
  templates: NotificationEmailTemplatePreview[];
};

type ToastState = {
  message: string;
  type: 'error' | 'success';
};

type TemplateFormState = {
  tipo: TipoNotificacion;
  nombre: string;
  descripcion_operativa: string;
  asunto_template: string;
  titulo_template: string;
  intro_template: string;
  descripcion_template: string;
  cta_label: string;
};

function createTemplateFormState(template: NotificationEmailTemplatePreview): TemplateFormState {
  return {
    tipo: template.tipo,
    nombre: template.nombre,
    descripcion_operativa: template.descripcion_operativa,
    asunto_template: template.asunto_template,
    titulo_template: template.titulo_template,
    intro_template: template.intro_template,
    descripcion_template: template.descripcion_template,
    cta_label: template.cta_label,
  };
}

function hasTemplateChanges(
  draft: TemplateFormState | null,
  template: NotificationEmailTemplatePreview | null
) {
  if (!draft || !template) return false;

  return (
    draft.nombre !== template.nombre
    || draft.descripcion_operativa !== template.descripcion_operativa
    || draft.asunto_template !== template.asunto_template
    || draft.titulo_template !== template.titulo_template
    || draft.intro_template !== template.intro_template
    || draft.descripcion_template !== template.descripcion_template
    || draft.cta_label !== template.cta_label
  );
}

function formatDateTime(value: string | null) {
  if (!value) return '—';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  return date.toLocaleString('es-CO', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

function getStatusBadgeClass(status: DiagnosticsResponse['recentEmails'][number]['estado']) {
  switch (status) {
    case 'enviado':
      return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    case 'procesando':
      return 'bg-blue-100 text-blue-700 border-blue-200';
    case 'error':
      return 'bg-red-100 text-red-700 border-red-200';
    default:
      return 'bg-amber-100 text-amber-700 border-amber-200';
  }
}

function StatusDot({ active }: { active: boolean }) {
  return (
    <span className={`inline-flex h-2.5 w-2.5 rounded-full ${active ? 'bg-emerald-500' : 'bg-slate-300'}`} />
  );
}

export default function ConfiguracionAdminPage() {
  const [diagnostics, setDiagnostics] = useState<DiagnosticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [processingOutbox, setProcessingOutbox] = useState(false);
  const [selectedTemplateType, setSelectedTemplateType] = useState<TipoNotificacion | null>(null);
  const [testEmail, setTestEmail] = useState('felipe@tause.co');
  const [testTemplateType, setTestTemplateType] = useState<TipoNotificacion | ''>('');
  const [templateForm, setTemplateForm] = useState<TemplateFormState | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  const showToast = useCallback((type: ToastState['type'], message: string) => {
    setToast({ type, message });
    window.setTimeout(() => setToast(null), 5000);
  }, []);

  const loadDiagnostics = useCallback(async (silent = false) => {
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const response = await fetch('/api/admin/configuracion/email', {
        cache: 'no-store',
      });
      const data = (await response.json()) as DiagnosticsResponse & { error?: string; details?: string | null };

      if (!response.ok) {
        throw new Error(data.details || data.error || 'No se pudo cargar el diagnóstico de correo.');
      }

      setLoadError(null);
      setDiagnostics(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo cargar la configuración de correo.';
      setLoadError(message);
      showToast('error', message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showToast]);

  useEffect(() => {
    void loadDiagnostics();
  }, [loadDiagnostics]);

  useEffect(() => {
    if (!diagnostics?.templates.length) {
      setSelectedTemplateType(null);
      setTemplateForm(null);
      return;
    }

    setSelectedTemplateType((current) => {
      if (current && diagnostics.templates.some((template) => template.tipo === current)) {
        return current;
      }

      return diagnostics.templates[0].tipo;
    });
  }, [diagnostics?.templates]);

  const selectedTemplate = useMemo(() => {
    if (!diagnostics?.templates.length) {
      return null;
    }

    return diagnostics.templates.find((template) => template.tipo === selectedTemplateType) ?? diagnostics.templates[0];
  }, [diagnostics?.templates, selectedTemplateType]);

  useEffect(() => {
    if (!selectedTemplate) {
      setTemplateForm(null);
      return;
    }

    setTemplateForm(createTemplateFormState(selectedTemplate));
  }, [selectedTemplate]);

  const pendingWorkLabel = useMemo(() => {
    if (!diagnostics?.outbox.oldestPendingAt) {
      return 'Sin pendientes programados';
    }

    return `Más antiguo pendiente: ${formatDateTime(diagnostics.outbox.oldestPendingAt)}`;
  }, [diagnostics?.outbox.oldestPendingAt]);

  const selectedTestTemplate = useMemo(() => {
    if (!testTemplateType || !diagnostics?.templates.length) {
      return null;
    }

    return diagnostics.templates.find((template) => template.tipo === testTemplateType) ?? null;
  }, [diagnostics?.templates, testTemplateType]);

  const templateHasChanges = useMemo(() => hasTemplateChanges(templateForm, selectedTemplate), [selectedTemplate, templateForm]);

  const handleTemplateFieldChange = <K extends keyof TemplateFormState>(field: K, value: TemplateFormState[K]) => {
    setTemplateForm((current) => {
      if (!current) return current;
      return {
        ...current,
        [field]: value,
      };
    });
  };

  const handleResetTemplate = () => {
    if (!selectedTemplate) return;
    setTemplateForm(createTemplateFormState(selectedTemplate));
  };

  const handleSaveTemplate = async () => {
    if (!templateForm) return;

    setSavingTemplate(true);
    try {
      const response = await fetch('/api/admin/configuracion/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'save-template',
          ...templateForm,
        }),
      });
      const data = (await response.json()) as {
        diagnostics?: DiagnosticsResponse;
        details?: string | null;
        error?: string;
        ok?: boolean;
      };

      if (!response.ok || !data.ok) {
        throw new Error(data.details || data.error || 'No se pudo guardar la plantilla de correo.');
      }

      if (data.diagnostics) {
        setLoadError(null);
        setDiagnostics(data.diagnostics);
      }

      showToast('success', 'Plantilla de correo guardada correctamente.');
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'No se pudo guardar la plantilla de correo.');
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleSendTest = async () => {
    const email = testEmail.trim().toLowerCase();
    if (!email) {
      showToast('error', 'Debes indicar un correo destino para la prueba.');
      return;
    }

    setSendingTest(true);
    try {
      const response = await fetch('/api/admin/configuracion/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'send-test',
          to: email,
          ...(testTemplateType ? { tipo: testTemplateType } : {}),
        }),
      });
      const data = (await response.json()) as { diagnostics?: DiagnosticsResponse; details?: string | null; error?: string; messageId?: string };

      if (!response.ok) {
        throw new Error(data.details || data.error || 'No se pudo enviar el correo de prueba.');
      }

      if (data.diagnostics) {
        setLoadError(null);
        setDiagnostics(data.diagnostics);
      }

      showToast(
        'success',
        `${selectedTestTemplate ? `Plantilla "${selectedTestTemplate.nombre}" enviada` : 'Correo de prueba enviado'} a ${email}${data.messageId ? ` · ID ${data.messageId}` : ''}`
      );
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'No se pudo enviar el correo de prueba.');
    } finally {
      setSendingTest(false);
    }
  };

  const handleProcessOutbox = async () => {
    setProcessingOutbox(true);
    try {
      const response = await fetch('/api/admin/configuracion/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'process-outbox', limit: 20 }),
      });
      const data = (await response.json()) as {
        diagnostics?: DiagnosticsResponse;
        details?: string | null;
        error?: string;
        ok?: boolean;
        result?: {
          failed: number;
          processed: number;
          sent: number;
          skipped: number;
          totalCandidates: number;
          configurationError: string | null;
        };
      };

      if (!response.ok) {
        throw new Error(data.details || data.error || 'No se pudo procesar la cola de correos.');
      }

      if (data.diagnostics) {
        setLoadError(null);
        setDiagnostics(data.diagnostics);
      }

      const summary = data.result
        ? `Procesados ${data.result.processed}, enviados ${data.result.sent}, fallidos ${data.result.failed}, omitidos ${data.result.skipped}.`
        : 'Cola procesada.';

      if (data.ok) {
        showToast('success', summary);
      } else {
        showToast('error', data.result?.configurationError || summary);
      }
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'No se pudo procesar la cola de correos.');
    } finally {
      setProcessingOutbox(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Configuración de Correo</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Diagnóstico operativo de Resend, remitente activo y estado real del outbox transaccional.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => void loadDiagnostics(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Actualizar
          </button>
          <button
            type="button"
            onClick={handleProcessOutbox}
            disabled={processingOutbox}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {processingOutbox ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            Procesar cola
          </button>
        </div>
      </div>

      {toast && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${toast.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'}`}>
          {toast.message}
        </div>
      )}

      {loadError && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <div>
              <p className="font-medium">No se pudo leer el diagnóstico real del correo.</p>
              <p className="mt-1 text-amber-700">{loadError}</p>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-2 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Plantillas de correos de notificación</h2>
            <p className="text-sm text-slate-500">Aquí defines lo que recibe cada usuario por correo cuando ocurre un evento en su cuenta o en sus pedidos.</p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">
            <Mail className="h-3.5 w-3.5" />
            Tipos configurados: {diagnostics?.templates.length ?? 0}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-3">
            {diagnostics?.templates.map((template) => {
              const isSelected = template.tipo === selectedTemplate?.tipo;

              return (
                <button
                  key={template.tipo}
                  type="button"
                  onClick={() => setSelectedTemplateType(template.tipo)}
                  className={`w-full rounded-xl border px-4 py-4 text-left transition ${isSelected ? 'border-primary bg-primary/5 shadow-sm' : 'border-border bg-white hover:border-slate-300 hover:bg-slate-50'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900">{template.nombre}</p>
                      <p className="mt-1 break-all text-xs text-slate-500">{template.tipo}</p>
                    </div>
                    <StatusDot active={isSelected} />
                  </div>
                  <p className="mt-3 text-xs text-slate-600">{template.descripcion_operativa}</p>
                  <p className="mt-3 text-[11px] text-slate-500">
                    {template.updated_at ? `Última actualización: ${formatDateTime(template.updated_at)}` : 'Plantilla base todavía no persistida en BD'}
                  </p>
                </button>
              );
            })}
          </div>

          <div className="space-y-6">
            {selectedTemplate && templateForm ? (
              <>
                {!selectedTemplate.updated_at && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    Esta plantilla se está leyendo desde la base por defecto del código. Para persistir cambios en Supabase debes aplicar la migración `017_notificaciones_email_templates.sql`.
                  </div>
                )}

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <label className="mb-2 block text-sm font-medium text-slate-700">Nombre interno</label>
                    <input
                      type="text"
                      value={templateForm.nombre}
                      onChange={(event) => handleTemplateFieldChange('nombre', event.target.value)}
                      className="w-full rounded-lg border border-border px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="mb-2 block text-sm font-medium text-slate-700">Descripción operativa</label>
                    <textarea
                      value={templateForm.descripcion_operativa}
                      onChange={(event) => handleTemplateFieldChange('descripcion_operativa', event.target.value)}
                      rows={2}
                      className="w-full rounded-lg border border-border px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="mb-2 block text-sm font-medium text-slate-700">Asunto</label>
                    <textarea
                      value={templateForm.asunto_template}
                      onChange={(event) => handleTemplateFieldChange('asunto_template', event.target.value)}
                      rows={2}
                      className="w-full rounded-lg border border-border px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="mb-2 block text-sm font-medium text-slate-700">Título visible</label>
                    <textarea
                      value={templateForm.titulo_template}
                      onChange={(event) => handleTemplateFieldChange('titulo_template', event.target.value)}
                      rows={2}
                      className="w-full rounded-lg border border-border px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="mb-2 block text-sm font-medium text-slate-700">Intro del correo</label>
                    <textarea
                      value={templateForm.intro_template}
                      onChange={(event) => handleTemplateFieldChange('intro_template', event.target.value)}
                      rows={3}
                      className="w-full rounded-lg border border-border px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="mb-2 block text-sm font-medium text-slate-700">Descripción principal</label>
                    <textarea
                      value={templateForm.descripcion_template}
                      onChange={(event) => handleTemplateFieldChange('descripcion_template', event.target.value)}
                      rows={4}
                      className="w-full rounded-lg border border-border px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="mb-2 block text-sm font-medium text-slate-700">Texto del botón CTA</label>
                    <input
                      type="text"
                      value={templateForm.cta_label}
                      onChange={(event) => handleTemplateFieldChange('cta_label', event.target.value)}
                      className="w-full rounded-lg border border-border px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10"
                    />
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Variables disponibles</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedTemplate.variables.map((variable) => (
                      <div key={variable.key} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                        <p className="text-xs font-semibold text-slate-900">{`{{${variable.key}}}`}</p>
                        <p className="mt-1 text-[11px] text-slate-500">{variable.description}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={handleResetTemplate}
                    disabled={!templateHasChanges || savingTemplate}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Restaurar
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveTemplate}
                    disabled={!templateHasChanges || savingTemplate}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {savingTemplate ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                    Guardar plantilla
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Vista previa HTML guardada</p>
                    <iframe
                      title={`template-preview-${selectedTemplate.tipo}`}
                      srcDoc={selectedTemplate.preview_html}
                      className="mt-2 h-[420px] w-full rounded-lg border border-slate-200 bg-white"
                    />
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Versión texto guardada</p>
                    <pre className="mt-2 h-[420px] overflow-auto rounded-lg border border-slate-200 bg-slate-950/95 p-4 text-xs leading-6 text-slate-100 whitespace-pre-wrap">
                      {selectedTemplate.preview_text}
                    </pre>
                  </div>
                </div>
              </>
            ) : (
              <div className="rounded-xl border border-dashed border-border bg-slate-50 p-10 text-center">
                <Settings className="mx-auto h-10 w-10 text-slate-300" />
                <h3 className="mt-4 text-base font-semibold text-slate-900">Sin plantillas cargadas</h3>
                <p className="mt-1 text-sm text-slate-500">No fue posible cargar las plantillas editables de notificación.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-4">
        <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">Resend operativo</p>
              <p className="mt-2 flex items-center gap-2 text-lg font-semibold text-slate-900">
                <StatusDot active={diagnostics?.configuration.resendConfigured ?? false} />
                {diagnostics?.configuration.resendConfigured ? 'Configurado' : 'Incompleto'}
              </p>
            </div>
            <div className="rounded-lg bg-primary/10 p-2 text-primary">
              <Mail className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-4 text-xs text-slate-500">
            API key, remitente y runtime listos para envío transaccional.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">Remitente activo</p>
              <p className="mt-2 text-lg font-semibold text-slate-900">{diagnostics?.configuration.fromEmail || 'No definido'}</p>
            </div>
            <div className="rounded-lg bg-emerald-100 p-2 text-emerald-700">
              <ShieldCheck className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-4 text-xs text-slate-500">Nombre visible: {diagnostics?.configuration.fromName || 'Imprima B2B'}</p>
        </div>

        <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">Pendientes en cola</p>
              <p className="mt-2 text-3xl font-bold text-slate-900">{diagnostics?.outbox.pendiente ?? 0}</p>
            </div>
            <div className="rounded-lg bg-amber-100 p-2 text-amber-700">
              <Inbox className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-4 text-xs text-slate-500">{pendingWorkLabel}</p>
        </div>

        <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">Enviados acumulados</p>
              <p className="mt-2 text-3xl font-bold text-slate-900">{diagnostics?.outbox.sent ?? 0}</p>
            </div>
            <div className="rounded-lg bg-blue-100 p-2 text-blue-700">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-4 text-xs text-slate-500">Errores registrados: {diagnostics?.outbox.error ?? 0}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_1.8fr]">
        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2 text-primary">
                <ServerCog className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-900">Diagnóstico de entorno</h2>
                <p className="text-sm text-slate-500">Visibilidad directa de lo que realmente está configurado para correo.</p>
              </div>
            </div>

            <div className="mt-5 space-y-3 text-sm">
              <div className="flex items-center justify-between rounded-lg border border-border bg-slate-50 px-4 py-3">
                <span className="text-slate-600">API key de Resend</span>
                <span className="flex items-center gap-2 font-medium text-slate-900">
                  <StatusDot active={diagnostics?.configuration.apiKeyConfigured ?? false} />
                  {(diagnostics?.configuration.apiKeyConfigured ?? false) ? 'Configurada' : 'Faltante'}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border bg-slate-50 px-4 py-3">
                <span className="text-slate-600">Secret interno</span>
                <span className="flex items-center gap-2 font-medium text-slate-900">
                  <StatusDot active={diagnostics?.configuration.internalProcessorSecretConfigured ?? false} />
                  {(diagnostics?.configuration.internalProcessorSecretConfigured ?? false) ? 'Configurado' : 'Faltante'}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border bg-slate-50 px-4 py-3">
                <span className="text-slate-600">Secret de cron</span>
                <span className="flex items-center gap-2 font-medium text-slate-900">
                  <StatusDot active={diagnostics?.configuration.cronSecretConfigured ?? false} />
                  {(diagnostics?.configuration.cronSecretConfigured ?? false) ? 'Configurado' : 'Faltante'}
                </span>
              </div>
              <div className="rounded-lg border border-border bg-slate-50 px-4 py-3">
                <p className="text-slate-600">App URL activa</p>
                <p className="mt-1 break-all font-medium text-slate-900">{diagnostics?.configuration.appBaseUrl || 'No definida'}</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-emerald-100 p-2 text-emerald-700">
                <Send className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-900">Prueba manual</h2>
                <p className="text-sm text-slate-500">Envía un correo real con la configuración actual de Resend.</p>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <label htmlFor="test-template" className="mb-2 block text-sm font-medium text-slate-700">
                  Plantilla para la prueba
                </label>
                <select
                  id="test-template"
                  value={testTemplateType}
                  onChange={(event) => setTestTemplateType(event.target.value as TipoNotificacion | '')}
                  className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10"
                >
                  <option value="">Prueba genérica de conexión</option>
                  {diagnostics?.templates.map((template) => (
                    <option key={template.tipo} value={template.tipo}>
                      {template.nombre}
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-xs text-slate-500">
                  {selectedTestTemplate
                    ? 'Se enviará el preview real de la plantilla seleccionada usando variables visibles como placeholders.'
                    : 'Envía un correo simple para validar únicamente la conexión con Resend.'}
                </p>
              </div>

              <div>
                <label htmlFor="test-email" className="mb-2 block text-sm font-medium text-slate-700">
                  Correo destino
                </label>
                <input
                  id="test-email"
                  type="email"
                  value={testEmail}
                  onChange={(event) => setTestEmail(event.target.value)}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10"
                  placeholder="correo@dominio.com"
                />
              </div>
              <button
                type="button"
                onClick={handleSendTest}
                disabled={sendingTest}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {sendingTest ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                Enviar prueba de correo
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-2 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Historial reciente de correos</h2>
              <p className="text-sm text-slate-500">Visibilidad del outbox real, incluyendo preview reconstruido desde el `payload` del correo.</p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">
              <Clock3 className="h-3.5 w-3.5" />
              Total registrados: {diagnostics?.outbox.total ?? 0}
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
            Esta vista previa se reconstruye con el asunto y el `payload` almacenado en `notificaciones_email`. Hoy no guardamos un snapshot HTML persistente del envío final.
          </div>

          <div className="mt-4 space-y-3">
            {diagnostics?.recentEmails.length ? diagnostics.recentEmails.map((email) => (
              <div key={email.id} className="rounded-xl border border-border px-4 py-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold text-slate-900">{email.asunto}</p>
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${getStatusBadgeClass(email.estado)}`}>
                        {email.estado}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">{email.email_destino}</p>
                    {email.nombre_destino && <p className="mt-1 text-xs text-slate-500">Destinatario: {email.nombre_destino}</p>}
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                      <span>Tipo: {email.tipo}</span>
                      <span>Intentos: {email.intentos}</span>
                      <span>Creado: {formatDateTime(email.created_at)}</span>
                      <span>Enviado: {formatDateTime(email.sent_at)}</span>
                    </div>
                  </div>
                  <div className="text-xs text-slate-500 lg:text-right">
                    <p>Provider: {email.provider || '—'}</p>
                    <p className="mt-1 break-all">Message ID: {email.provider_message_id || '—'}</p>
                  </div>
                </div>

                <details className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                  <summary className="cursor-pointer text-sm font-medium text-slate-900">
                    Ver contenido renderizado y payload
                  </summary>

                  <div className="mt-4 space-y-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Vista previa HTML</p>
                      {email.preview_html ? (
                        <iframe
                          title={`preview-${email.id}`}
                          srcDoc={email.preview_html}
                          className="mt-2 h-[420px] w-full rounded-lg border border-slate-200 bg-white"
                        />
                      ) : (
                        <div className="mt-2 rounded-lg border border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-500">
                          No fue posible reconstruir la vista HTML de este correo.
                        </div>
                      )}
                    </div>

                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Versión texto</p>
                      <pre className="mt-2 overflow-x-auto rounded-lg border border-slate-200 bg-slate-950/95 p-4 text-xs leading-6 text-slate-100 whitespace-pre-wrap">
                        {email.preview_text || 'No fue posible reconstruir la versión texto de este correo.'}
                      </pre>
                    </div>

                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Payload almacenado</p>
                      <pre className="mt-2 overflow-x-auto rounded-lg border border-slate-200 bg-white p-4 text-xs leading-6 text-slate-700 whitespace-pre-wrap">
                        {JSON.stringify(email.payload ?? {}, null, 2)}
                      </pre>
                    </div>
                  </div>
                </details>

                {email.last_error && (
                  <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                      <span>{email.last_error}</span>
                    </div>
                  </div>
                )}
              </div>
            )) : (
              <div className="rounded-xl border border-dashed border-border bg-slate-50 p-10 text-center">
                <Settings className="mx-auto h-10 w-10 text-slate-300" />
                <h3 className="mt-4 text-base font-semibold text-slate-900">Sin correos registrados todavía</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Cuando se encolen o envíen notificaciones, aquí verás el detalle operativo del correo.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
