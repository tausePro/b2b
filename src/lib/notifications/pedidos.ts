import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import type { NivelNotificacion, TipoNotificacion } from '@/types';

type PedidoNotificationEvent = TipoNotificacion;

type PedidoContext = {
  id: string;
  numero: string;
  estado: string;
  empresa_id: string;
  odoo_sale_order_id: number | null;
  valor_total_cop: number;
  total_items: number;
  empresa: { nombre: string | null } | null;
  sede: { nombre_sede: string | null } | null;
  creador: {
    id: string;
    email: string | null;
    nombre: string | null;
    apellido: string | null;
  } | null;
};

type Recipient = {
  id: string;
  email: string | null;
  nombre: string | null;
  apellido: string | null;
  rol: string | null;
  empresa_id: string | null;
};

type NotificationTemplate = {
  nivel: NivelNotificacion;
  titulo: string;
  descripcion: string;
  asunto: string;
  ruta: string;
  metadata: Record<string, unknown>;
};

type EnqueuePedidoNotificationsInput = {
  actorUserId?: string | null;
  event: PedidoNotificationEvent;
  pedidoId: string;
};

function getSupabaseAdmin() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function normalizeSingle<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function getNombreCompleto(persona: {
  nombre: string | null;
  apellido: string | null;
} | null | undefined): string {
  return [persona?.nombre, persona?.apellido].filter(Boolean).join(' ').trim() || 'Usuario';
}

function formatCOP(valor: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(valor);
}

async function loadPedidoContext(pedidoId: string): Promise<PedidoContext> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('pedidos')
    .select(`
      id, numero, estado, empresa_id, odoo_sale_order_id, valor_total_cop, total_items,
      empresa:empresas(nombre),
      sede:sedes(nombre_sede),
      creador:usuarios!pedidos_usuario_creador_id_fkey(id, email, nombre, apellido)
    `)
    .eq('id', pedidoId)
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'No se pudo cargar el pedido para notificaciones.');
  }

  const empresa = normalizeSingle(data.empresa as { nombre: string | null } | { nombre: string | null }[] | null);
  const sede = normalizeSingle(data.sede as { nombre_sede: string | null } | { nombre_sede: string | null }[] | null);
  const creador = normalizeSingle(
    data.creador as
      | { id: string; email: string | null; nombre: string | null; apellido: string | null }
      | { id: string; email: string | null; nombre: string | null; apellido: string | null }[]
      | null
  );

  return {
    id: String(data.id),
    numero: String(data.numero),
    estado: String(data.estado),
    empresa_id: String(data.empresa_id),
    odoo_sale_order_id: data.odoo_sale_order_id == null ? null : Number(data.odoo_sale_order_id),
    valor_total_cop: Number(data.valor_total_cop || 0),
    total_items: Number(data.total_items || 0),
    empresa: empresa ? { nombre: empresa.nombre ?? null } : null,
    sede: sede ? { nombre_sede: sede.nombre_sede ?? null } : null,
    creador: creador
      ? {
          id: String(creador.id),
          email: creador.email ?? null,
          nombre: creador.nombre ?? null,
          apellido: creador.apellido ?? null,
        }
      : null,
  };
}

async function loadActor(actorUserId?: string | null): Promise<Recipient | null> {
  if (!actorUserId) return null;

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('usuarios')
    .select('id, email, nombre, apellido, rol, empresa_id')
    .eq('id', actorUserId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return {
    id: String(data.id),
    email: data.email ?? null,
    nombre: data.nombre ?? null,
    apellido: data.apellido ?? null,
    rol: data.rol ?? null,
    empresa_id: data.empresa_id ?? null,
  };
}

async function loadApprovers(empresaId: string): Promise<Recipient[]> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('usuarios')
    .select('id, email, nombre, apellido, rol, empresa_id')
    .eq('empresa_id', empresaId)
    .eq('rol', 'aprobador')
    .eq('activo', true);

  if (error || !data) {
    return [];
  }

  return data.map((item) => ({
    id: String(item.id),
    email: item.email ?? null,
    nombre: item.nombre ?? null,
    apellido: item.apellido ?? null,
    rol: item.rol ?? null,
    empresa_id: item.empresa_id ?? null,
  }));
}

async function loadAdvisors(empresaId: string): Promise<Recipient[]> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('asesor_empresas')
    .select('usuario:usuarios!asesor_empresas_usuario_id_fkey(id, email, nombre, apellido, rol, empresa_id, activo)')
    .eq('empresa_id', empresaId)
    .eq('activo', true);

  if (error || !data) {
    return [];
  }

  return data
    .map((item) => normalizeSingle(item.usuario as Recipient | Recipient[] | null))
    .filter((item): item is Recipient => Boolean(item));
}

function dedupeRecipients(recipients: Recipient[]): Recipient[] {
  const map = new Map<string, Recipient>();

  for (const recipient of recipients) {
    if (!recipient.id) continue;
    if (!map.has(recipient.id)) {
      map.set(recipient.id, recipient);
    }
  }

  return Array.from(map.values());
}

async function resolveRecipients(event: PedidoNotificationEvent, pedido: PedidoContext): Promise<Recipient[]> {
  const creator = pedido.creador
    ? [
        {
          id: pedido.creador.id,
          email: pedido.creador.email,
          nombre: pedido.creador.nombre,
          apellido: pedido.creador.apellido,
          rol: 'comprador',
          empresa_id: pedido.empresa_id,
        } satisfies Recipient,
      ]
    : [];

  switch (event) {
    case 'pedido_creado_en_aprobacion':
      return dedupeRecipients(await loadApprovers(pedido.empresa_id));
    case 'pedido_creado_autoaprobado':
      return dedupeRecipients([...creator, ...(await loadAdvisors(pedido.empresa_id))]);
    case 'pedido_aprobado':
      return dedupeRecipients([...creator, ...(await loadAdvisors(pedido.empresa_id))]);
    case 'pedido_rechazado':
      return dedupeRecipients(creator);
    case 'pedido_validado':
      return dedupeRecipients(creator);
    case 'pedido_procesado_odoo':
      return dedupeRecipients([...creator, ...(await loadAdvisors(pedido.empresa_id))]);
    default:
      return [];
  }
}

function buildTemplate(
  event: PedidoNotificationEvent,
  pedido: PedidoContext,
  actor: Recipient | null
): NotificationTemplate {
  const actorName = actor ? getNombreCompleto(actor) : 'Usuario';
  const sede = pedido.sede?.nombre_sede || 'Sin sede';
  const empresa = pedido.empresa?.nombre || 'tu empresa';
  const ruta = `/dashboard/pedidos/${pedido.id}`;
  const metadata = {
    pedido_id: pedido.id,
    pedido_numero: pedido.numero,
    pedido_estado: pedido.estado,
    odoo_sale_order_id: pedido.odoo_sale_order_id,
    sede,
    empresa,
    actor_nombre: actor ? actorName : null,
    valor_total_cop: pedido.valor_total_cop,
    valor_total_label: formatCOP(pedido.valor_total_cop),
    total_items: pedido.total_items,
    ruta,
  } satisfies Record<string, unknown>;

  switch (event) {
    case 'pedido_creado_en_aprobacion':
      return {
        nivel: 'warning',
        titulo: `Pedido ${pedido.numero} pendiente de aprobación`,
        descripcion: `Se creó un nuevo pedido para ${sede} y requiere aprobación.`,
        asunto: `Nuevo pedido ${pedido.numero} pendiente de aprobación`,
        ruta,
        metadata,
      };
    case 'pedido_creado_autoaprobado':
      return {
        nivel: 'success',
        titulo: `Pedido ${pedido.numero} creado con aprobación automática`,
        descripcion: `El pedido fue creado sin requerir aprobación en ${empresa}.`,
        asunto: `Pedido ${pedido.numero} creado con aprobación automática`,
        ruta,
        metadata,
      };
    case 'pedido_aprobado':
      return {
        nivel: 'success',
        titulo: `Pedido ${pedido.numero} aprobado`,
        descripcion: `${actorName} aprobó el pedido${pedido.odoo_sale_order_id ? ' y fue enviado a Odoo' : ''}.`,
        asunto: `Pedido ${pedido.numero} aprobado`,
        ruta,
        metadata,
      };
    case 'pedido_rechazado':
      return {
        nivel: 'danger',
        titulo: `Pedido ${pedido.numero} rechazado`,
        descripcion: `${actorName} rechazó el pedido de ${sede}.`,
        asunto: `Pedido ${pedido.numero} rechazado`,
        ruta,
        metadata,
      };
    case 'pedido_validado':
      return {
        nivel: 'info',
        titulo: `Pedido ${pedido.numero} en validación Imprima`,
        descripcion: `${actorName} tomó el pedido para validación comercial.`,
        asunto: `Pedido ${pedido.numero} en validación Imprima`,
        ruta,
        metadata,
      };
    case 'pedido_procesado_odoo':
      return {
        nivel: 'success',
        titulo: `Pedido ${pedido.numero} procesado en Odoo`,
        descripcion: `El pedido fue procesado en Odoo y ya quedó sincronizado.`,
        asunto: `Pedido ${pedido.numero} procesado en Odoo`,
        ruta,
        metadata,
      };
  }
}

export async function enqueuePedidoNotifications(input: EnqueuePedidoNotificationsInput) {
  const admin = getSupabaseAdmin();
  const [pedido, actor] = await Promise.all([
    loadPedidoContext(input.pedidoId),
    loadActor(input.actorUserId),
  ]);
  const recipients = await resolveRecipients(input.event, pedido);

  if (recipients.length === 0) {
    return { emailCount: 0, inAppCount: 0 };
  }

  const template = buildTemplate(input.event, pedido, actor);

  const inAppRows = recipients.map((recipient) => ({
    usuario_id: recipient.id,
    actor_usuario_id: input.actorUserId ?? null,
    empresa_id: pedido.empresa_id,
    tipo: input.event,
    nivel: template.nivel,
    titulo: template.titulo,
    descripcion: template.descripcion,
    ruta: template.ruta,
    entidad_tipo: 'pedido',
    entidad_id: pedido.id,
    metadata: {
      ...template.metadata,
      destinatario_usuario_id: recipient.id,
      destinatario_rol: recipient.rol,
    },
  }));

  const emailRows = recipients
    .filter((recipient) => Boolean(recipient.email))
    .map((recipient) => ({
      usuario_id: recipient.id,
      actor_usuario_id: input.actorUserId ?? null,
      empresa_id: pedido.empresa_id,
      tipo: input.event,
      email_destino: recipient.email!,
      nombre_destino: getNombreCompleto(recipient),
      asunto: template.asunto,
      payload: {
        ...template.metadata,
        titulo: template.titulo,
        descripcion: template.descripcion,
        destinatario_usuario_id: recipient.id,
        destinatario_nombre: getNombreCompleto(recipient),
        destinatario_email: recipient.email,
      },
      entidad_tipo: 'pedido',
      entidad_id: pedido.id,
    }));

  const inAppPromise = inAppRows.length > 0
    ? admin.from('notificaciones').insert(inAppRows)
    : Promise.resolve({ error: null });
  const emailPromise = emailRows.length > 0
    ? admin.from('notificaciones_email').insert(emailRows)
    : Promise.resolve({ error: null });

  const [inAppRes, emailRes] = await Promise.all([inAppPromise, emailPromise]);

  if (inAppRes.error) {
    throw new Error(inAppRes.error.message);
  }

  if (emailRes.error) {
    throw new Error(emailRes.error.message);
  }

  return {
    inAppCount: inAppRows.length,
    emailCount: emailRows.length,
  };
}

export async function safeEnqueuePedidoNotifications(input: EnqueuePedidoNotificationsInput) {
  try {
    return {
      error: null,
      result: await enqueuePedidoNotifications(input),
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'No se pudieron encolar notificaciones.',
      result: null,
    };
  }
}
