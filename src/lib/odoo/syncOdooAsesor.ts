import 'server-only';

import { authenticate, read, type OdooConfig, type OdooSession } from '@/lib/odoo/client';
import { getServerOdooConfig } from '@/lib/odoo/serverConfig';

const USER_SELECT = 'id, auth_id, email, nombre, apellido, rol, empresa_id, sede_id, activo, created_at, odoo_user_id';

type SupabaseAdminClient = any;

type LocalAsesorRow = {
  id: string;
  auth_id: string | null;
  email: string;
  nombre: string;
  apellido: string;
  rol: string;
  empresa_id: string | null;
  sede_id: string | null;
  activo: boolean;
  created_at: string;
  odoo_user_id: number | null;
};

type OdooUserRow = {
  id: number;
  name?: string | false;
  login?: string | false;
  partner_id?: [number, string] | false;
  active?: boolean;
};

type OdooPartnerRow = {
  id: number;
  name?: string | false;
  email?: string | false;
};

export interface SyncOdooAsesorParams {
  autoCreateIfMissing?: boolean;
  comercialOdooId: number | null;
  comercialOdooNombre?: string | null;
  empresaId?: string | null;
  odooConfig?: OdooConfig | null;
  session?: OdooSession;
  supabaseAdmin: SupabaseAdminClient;
}

export interface SyncOdooAsesorResult {
  asesor: LocalAsesorRow | null;
  asesorAsignadoId: string | null;
  aviso: string | null;
  mode:
    | 'assigned_existing'
    | 'linked_by_email'
    | 'linked_by_name'
    | 'created'
    | 'missing_comercial'
    | 'missing_email'
    | 'conflict_email'
    | 'conflict_role'
    | 'not_found';
  odooSalesperson: {
    email: string | null;
    id: number;
    login: string | null;
    name: string | null;
    partnerId: number | null;
  } | null;
}

function normalizarTexto(value: string | null | undefined): string {
  return (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizarEmail(value: string | null | undefined): string | null {
  const email = (value || '').trim().toLowerCase();

  if (!email || !email.includes('@')) {
    return null;
  }

  return email;
}

function dividirNombreCompleto(fullName: string | null | undefined): { apellido: string; nombre: string } {
  const parts = (fullName || '').trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return { nombre: '', apellido: '' };
  }

  if (parts.length === 1) {
    return { nombre: parts[0], apellido: '' };
  }

  if (parts.length === 2) {
    return { nombre: parts[0], apellido: parts[1] };
  }

  if (parts.length === 3) {
    return {
      nombre: `${parts[0]} ${parts[1]}`,
      apellido: parts[2],
    };
  }

  return {
    nombre: `${parts[0]} ${parts[1]}`,
    apellido: parts.slice(2).join(' '),
  };
}

async function fetchOdooSalesperson(
  comercialOdooId: number,
  options: { odooConfig?: OdooConfig | null; session?: OdooSession } = {}
) {
  const config = options.odooConfig ?? (await getServerOdooConfig());

  if (!config) {
    throw new Error('Configuración Odoo no encontrada.');
  }

  const session = options.session ?? (await authenticate(config));
  const userRows = await read('res.users', [comercialOdooId], ['id', 'name', 'login', 'partner_id', 'active'], session);

  if (!userRows.length) {
    return { data: null, session };
  }

  const odooUser = userRows[0] as OdooUserRow;
  const partnerId = Array.isArray(odooUser.partner_id) ? Number(odooUser.partner_id[0]) : null;
  let partner: OdooPartnerRow | null = null;

  if (partnerId) {
    const partnerRows = await read('res.partner', [partnerId], ['id', 'name', 'email'], session);
    partner = (partnerRows[0] as OdooPartnerRow | undefined) ?? null;
  }

  const emailDesdePartner = normalizarEmail(typeof partner?.email === 'string' ? partner.email : null);
  const emailDesdeLogin = normalizarEmail(typeof odooUser.login === 'string' ? odooUser.login : null);

  return {
    data: {
      active: odooUser.active !== false,
      email: emailDesdePartner || emailDesdeLogin,
      id: Number(odooUser.id),
      login: typeof odooUser.login === 'string' ? odooUser.login : null,
      name:
        (typeof partner?.name === 'string' && partner.name.trim()) ||
        (typeof odooUser.name === 'string' && odooUser.name.trim()) ||
        null,
      partnerId,
    },
    session,
  };
}

async function assignEmpresaIfNeeded(
  supabaseAdmin: SupabaseAdminClient,
  asesorId: string,
  empresaId?: string | null
): Promise<string | null> {
  if (!empresaId) {
    return null;
  }

  const { error } = await supabaseAdmin
    .from('asesor_empresas')
    .upsert(
      {
        usuario_id: asesorId,
        empresa_id: empresaId,
        activo: true,
      },
      { onConflict: 'usuario_id,empresa_id' }
    );

  if (error) {
    throw new Error(`No se pudo asignar el asesor a la empresa: ${error.message}`);
  }

  return asesorId;
}

async function findAsesorByEmail(supabaseAdmin: SupabaseAdminClient, email: string) {
  const { data, error } = await supabaseAdmin
    .from('usuarios')
    .select(USER_SELECT)
    .ilike('email', email);

  if (error) {
    throw new Error(`No se pudo validar el email del asesor: ${error.message}`);
  }

  return ((data as LocalAsesorRow[] | null) ?? []).filter(Boolean);
}

async function updateAsesor(
  supabaseAdmin: SupabaseAdminClient,
  asesorId: string,
  values: Partial<LocalAsesorRow>
): Promise<LocalAsesorRow> {
  const { data, error } = await supabaseAdmin
    .from('usuarios')
    .update({
      ...values,
      updated_at: new Date().toISOString(),
    })
    .eq('id', asesorId)
    .select(USER_SELECT)
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'No se pudo actualizar el asesor local.');
  }

  return data as LocalAsesorRow;
}

async function createAsesor(
  supabaseAdmin: SupabaseAdminClient,
  values: {
    apellido: string;
    email: string;
    nombre: string;
    odoo_user_id: number;
  }
): Promise<LocalAsesorRow> {
  const { data, error } = await supabaseAdmin
    .from('usuarios')
    .insert({
      auth_id: null,
      odoo_user_id: values.odoo_user_id,
      email: values.email,
      nombre: values.nombre,
      apellido: values.apellido,
      rol: 'asesor',
      empresa_id: null,
      sede_id: null,
      activo: true,
    })
    .select(USER_SELECT)
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'No se pudo crear el asesor local.');
  }

  return data as LocalAsesorRow;
}

export async function syncOdooAsesor(params: SyncOdooAsesorParams): Promise<SyncOdooAsesorResult> {
  const {
    autoCreateIfMissing = false,
    comercialOdooId,
    comercialOdooNombre,
    empresaId,
    odooConfig,
    session,
    supabaseAdmin,
  } = params;

  if (!comercialOdooId && !comercialOdooNombre) {
    return {
      asesor: null,
      asesorAsignadoId: null,
      aviso: 'La empresa no tiene comercial Odoo asociado.',
      mode: 'missing_comercial',
      odooSalesperson: null,
    };
  }

  let salespersonData: {
    active: boolean;
    email: string | null;
    id: number;
    login: string | null;
    name: string | null;
    partnerId: number | null;
  } | null = null;

  if (comercialOdooId) {
    const { data } = await fetchOdooSalesperson(comercialOdooId, { odooConfig, session });
    salespersonData = data;
  }

  const normalizedEmail = salespersonData?.email ?? null;
  const resolvedName = salespersonData?.name || comercialOdooNombre || null;
  const { nombre, apellido } = dividirNombreCompleto(resolvedName);

  if (salespersonData && !salespersonData.active) {
    return {
      asesor: null,
      asesorAsignadoId: null,
      aviso: `El comercial Odoo ${salespersonData.name || comercialOdooNombre || comercialOdooId} está inactivo.`,
      mode: 'not_found',
      odooSalesperson: salespersonData,
    };
  }

  if (comercialOdooId) {
    const { data: asesorPorId, error: asesorPorIdError } = await supabaseAdmin
      .from('usuarios')
      .select(USER_SELECT)
      .eq('rol', 'asesor')
      .eq('odoo_user_id', comercialOdooId)
      .maybeSingle();

    if (asesorPorIdError) {
      throw new Error(`No se pudo buscar el asesor por odoo_user_id: ${asesorPorIdError.message}`);
    }

    if (asesorPorId) {
      const asesorActualizado = await updateAsesor(supabaseAdmin, asesorPorId.id, {
        activo: true,
        apellido: apellido || asesorPorId.apellido,
        email: normalizedEmail || asesorPorId.email,
        empresa_id: null,
        nombre: nombre || asesorPorId.nombre,
        odoo_user_id: comercialOdooId,
      });

      const asesorAsignadoId = await assignEmpresaIfNeeded(supabaseAdmin, asesorActualizado.id, empresaId);

      return {
        asesor: asesorActualizado,
        asesorAsignadoId,
        aviso: null,
        mode: 'assigned_existing',
        odooSalesperson: salespersonData,
      };
    }
  }

  if (normalizedEmail) {
    const perfilesPorEmail = await findAsesorByEmail(supabaseAdmin, normalizedEmail);

    if (perfilesPorEmail.length > 1) {
      return {
        asesor: null,
        asesorAsignadoId: null,
        aviso: 'Existe más de un perfil local con ese email. Debes depurarlo antes de sincronizar el asesor.',
        mode: 'conflict_email',
        odooSalesperson: salespersonData,
      };
    }

    const perfilPorEmail = perfilesPorEmail[0] ?? null;

    if (perfilPorEmail) {
      if (perfilPorEmail.rol !== 'asesor') {
        return {
          asesor: null,
          asesorAsignadoId: null,
          aviso: `El email ${normalizedEmail} ya pertenece a un usuario con rol ${perfilPorEmail.rol}.`,
          mode: 'conflict_role',
          odooSalesperson: salespersonData,
        };
      }

      const asesorActualizado = await updateAsesor(supabaseAdmin, perfilPorEmail.id, {
        activo: true,
        apellido: apellido || perfilPorEmail.apellido,
        email: normalizedEmail,
        empresa_id: null,
        nombre: nombre || perfilPorEmail.nombre,
        odoo_user_id: comercialOdooId,
      });

      const asesorAsignadoId = await assignEmpresaIfNeeded(supabaseAdmin, asesorActualizado.id, empresaId);

      return {
        asesor: asesorActualizado,
        asesorAsignadoId,
        aviso: null,
        mode: 'linked_by_email',
        odooSalesperson: salespersonData,
      };
    }
  }

  if (resolvedName) {
    const nombreNormalizado = normalizarTexto(resolvedName);
    const { data: asesoresLocales, error: asesoresLocalesError } = await supabaseAdmin
      .from('usuarios')
      .select(USER_SELECT)
      .eq('rol', 'asesor');

    if (asesoresLocalesError) {
      throw new Error(`No se pudo buscar el asesor por nombre: ${asesoresLocalesError.message}`);
    }

    const coincidencias = ((asesoresLocales as LocalAsesorRow[] | null) ?? []).filter((asesor) => {
      return normalizarTexto(`${asesor.nombre || ''} ${asesor.apellido || ''}`) === nombreNormalizado;
    });

    if (coincidencias.length === 1) {
      const asesorActualizado = await updateAsesor(supabaseAdmin, coincidencias[0].id, {
        activo: true,
        apellido: apellido || coincidencias[0].apellido,
        email: normalizedEmail || coincidencias[0].email,
        empresa_id: null,
        nombre: nombre || coincidencias[0].nombre,
        odoo_user_id: comercialOdooId,
      });

      const asesorAsignadoId = await assignEmpresaIfNeeded(supabaseAdmin, asesorActualizado.id, empresaId);

      return {
        asesor: asesorActualizado,
        asesorAsignadoId,
        aviso: normalizedEmail
          ? null
          : `Se vinculó el asesor por nombre (${resolvedName}). Completa el email en Odoo o localmente para activar acceso.`,
        mode: 'linked_by_name',
        odooSalesperson: salespersonData,
      };
    }
  }

  if (!autoCreateIfMissing) {
    return {
      asesor: null,
      asesorAsignadoId: null,
      aviso: comercialOdooId
        ? `No existe asesor local activo con odoo_user_id=${comercialOdooId}.`
        : `No existe asesor local con nombre "${resolvedName || comercialOdooNombre || ''}".`,
      mode: 'not_found',
      odooSalesperson: salespersonData,
    };
  }

  if (!normalizedEmail) {
    return {
      asesor: null,
      asesorAsignadoId: null,
      aviso: `No pude crear el asesor local porque el comercial Odoo ${resolvedName || comercialOdooId || ''} no tiene un email válido.`,
      mode: 'missing_email',
      odooSalesperson: salespersonData,
    };
  }

  if (!nombre) {
    return {
      asesor: null,
      asesorAsignadoId: null,
      aviso: `No pude crear el asesor local porque el comercial Odoo ${comercialOdooId || ''} no devolvió nombre válido.`,
      mode: 'not_found',
      odooSalesperson: salespersonData,
    };
  }

  const asesorCreado = await createAsesor(supabaseAdmin, {
    apellido,
    email: normalizedEmail,
    nombre,
    odoo_user_id: Number(comercialOdooId),
  });

  const asesorAsignadoId = await assignEmpresaIfNeeded(supabaseAdmin, asesorCreado.id, empresaId);

  return {
    asesor: asesorCreado,
    asesorAsignadoId,
    aviso: null,
    mode: 'created',
    odooSalesperson: salespersonData,
  };
}
