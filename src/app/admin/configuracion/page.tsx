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
    asunto: string;
    estado: 'pendiente' | 'procesando' | 'enviado' | 'error';
    intentos: number;
    provider: string | null;
    provider_message_id: string | null;
    last_error: string | null;
    created_at: string;
    sent_at: string | null;
  }[];
};

type ToastState = {
  message: string;
  type: 'error' | 'success';
};

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
  const [refreshing, setRefreshing] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [processingOutbox, setProcessingOutbox] = useState(false);
  const [testEmail, setTestEmail] = useState('felipe@tause.co');
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
        throw new Error(data.error || data.details || 'No se pudo cargar el diagnóstico de correo.');
      }

      setDiagnostics(data);
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'No se pudo cargar la configuración de correo.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showToast]);

  useEffect(() => {
    void loadDiagnostics();
  }, [loadDiagnostics]);

  const pendingWorkLabel = useMemo(() => {
    if (!diagnostics?.outbox.oldestPendingAt) {
      return 'Sin pendientes programados';
    }

    return `Más antiguo pendiente: ${formatDateTime(diagnostics.outbox.oldestPendingAt)}`;
  }, [diagnostics?.outbox.oldestPendingAt]);

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
        body: JSON.stringify({ action: 'send-test', to: email }),
      });
      const data = (await response.json()) as { diagnostics?: DiagnosticsResponse; error?: string; messageId?: string };

      if (!response.ok) {
        throw new Error(data.error || 'No se pudo enviar el correo de prueba.');
      }

      if (data.diagnostics) {
        setDiagnostics(data.diagnostics);
      }

      showToast('success', `Correo de prueba enviado a ${email}${data.messageId ? ` · ID ${data.messageId}` : ''}`);
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
        throw new Error(data.error || 'No se pudo procesar la cola de correos.');
      }

      if (data.diagnostics) {
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
              <p className="text-sm text-slate-500">Visibilidad del outbox real para no depender de configuración invisible.</p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">
              <Clock3 className="h-3.5 w-3.5" />
              Total registrados: {diagnostics?.outbox.total ?? 0}
            </div>
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
