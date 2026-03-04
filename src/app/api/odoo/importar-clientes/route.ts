import { NextResponse, NextRequest } from 'next/server';
import { authenticate, getClientes, getConfigFromEnv } from '@/lib/odoo/client';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

async function getSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        },
      },
    }
  );
}

// Cliente con permisos de admin para bypasear RLS en importación masiva
function getSupabaseAdmin() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function normalizarTexto(value: string | null | undefined): string {
  return (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function resolverAsesorLocal(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  comercialOdooId: number | null,
  comercialOdooNombre: string | null
): Promise<{ asesorId: string | null; aviso: string | null }> {
  if (comercialOdooId) {
    const { data: asesorPorId, error: asesorPorIdError } = await supabaseAdmin
      .from('usuarios')
      .select('id')
      .eq('rol', 'asesor')
      .eq('activo', true)
      .eq('odoo_user_id', comercialOdooId)
      .maybeSingle();

    if (asesorPorIdError) {
      console.error('[API /odoo/importar-clientes] Error buscando asesor por odoo_user_id:', asesorPorIdError.message);
    }

    if (asesorPorId?.id) {
      return { asesorId: asesorPorId.id, aviso: null };
    }
  }

  const comercialNormalizado = normalizarTexto(comercialOdooNombre);
  if (comercialNormalizado) {
    const { data: asesoresActivos, error: asesoresActivosError } = await supabaseAdmin
      .from('usuarios')
      .select('id, nombre, apellido')
      .eq('rol', 'asesor')
      .eq('activo', true);

    if (asesoresActivosError) {
      console.error('[API /odoo/importar-clientes] Error listando asesores para fallback por nombre:', asesoresActivosError.message);
    } else {
      const asesorMatch = (asesoresActivos || []).find((asesor) => {
        const nombreCompleto = normalizarTexto(`${asesor.nombre || ''} ${asesor.apellido || ''}`);
        return nombreCompleto === comercialNormalizado;
      });

      if (asesorMatch?.id) {
        return {
          asesorId: asesorMatch.id,
          aviso: comercialOdooId
            ? `Se asignó por coincidencia de nombre (${comercialOdooNombre}); actualiza odoo_user_id en el asesor para evitar ambigüedades.`
            : null,
        };
      }
    }
  }

  if (comercialOdooId || comercialOdooNombre) {
    return {
      asesorId: null,
      aviso: comercialOdooId
        ? `No existe asesor local activo con odoo_user_id=${comercialOdooId}.`
        : `No existe asesor local activo con nombre "${comercialOdooNombre}".`,
    };
  }

  return { asesorId: null, aviso: null };
}

async function sincronizarComercialYAsesor(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  empresaId: string,
  comercialOdooId: number | null,
  comercialOdooNombre: string | null
): Promise<{ asesorAsignadoId: string | null; avisoComercial: string | null }> {
  if (!comercialOdooId && !comercialOdooNombre) {
    return { asesorAsignadoId: null, avisoComercial: null };
  }

  const { asesorId, aviso } = await resolverAsesorLocal(supabaseAdmin, comercialOdooId, comercialOdooNombre);

  if (!asesorId) {
    return { asesorAsignadoId: null, avisoComercial: aviso };
  }

  const { error: asignacionError } = await supabaseAdmin
    .from('asesor_empresas')
    .upsert(
      {
        usuario_id: asesorId,
        empresa_id: empresaId,
        activo: true,
      },
      { onConflict: 'usuario_id,empresa_id' }
    );

  if (asignacionError) {
    console.error('[API /odoo/importar-clientes] Error asignando asesor automáticamente:', asignacionError.message);
    return {
      asesorAsignadoId: null,
      avisoComercial: 'La empresa se importó, pero falló la asignación automática del asesor.',
    };
  }

  return {
    asesorAsignadoId: asesorId,
    avisoComercial: aviso,
  };
}

// GET: Listar partners de Odoo disponibles para importar
export async function GET(request: NextRequest) {
  try {
    const includeContacts = request.nextUrl.searchParams.get('include_contacts') === 'true';
    const config = getConfigFromEnv();
    if (!config) {
      return NextResponse.json({ error: 'Configuración Odoo no encontrada' }, { status: 500 });
    }

    const session = await authenticate(config);
    const clientes = await getClientes(session, { limit: 200 });
    
    // Traer las etiquetas de Odoo para poder mapear los nombres
    const { getEtiquetasCliente } = await import('@/lib/odoo/client');
    const etiquetas = await getEtiquetasCliente(session);
    const etiquetasMap = new Map(etiquetas.map(e => [e.id, e.name]));

    // Obtener los odoo_partner_id ya importados en Supabase
    const supabase = await getSupabaseServer();
    const { data: empresasExistentes } = await supabase
      .from('empresas')
      .select('id, nombre, odoo_partner_id')
      .order('nombre');

    const empresasMap = new Map(
      (empresasExistentes || []).map((e) => [Number(e.odoo_partner_id), { id: e.id, nombre: e.nombre }])
    );

    const partnerMap = new Map(clientes.map((partner) => [partner.id, partner]));

    const partnersVisibles = includeContacts
      ? clientes
      : clientes.filter((c) => c.is_company);

    const resultado = partnersVisibles.map((c) => {
      const parentOdooId = Array.isArray(c.parent_id) ? c.parent_id[0] : null;
      const parentPartner = parentOdooId ? partnerMap.get(parentOdooId) : null;
      const empresaLocal = empresasMap.get(c.id) || null;
      const empresaPadreLocal = parentOdooId ? empresasMap.get(parentOdooId) || null : null;

      return {
      odoo_id: c.id,
      nombre: c.name,
      email: c.email || null,
      telefono: c.phone || null,
      nit: c.vat || null,
      ciudad: c.city || null,
      es_empresa: c.is_company,
      tipo_partner: c.type || (c.is_company ? 'company' : 'contact'),
      parent_odoo_id: parentOdooId,
      parent_nombre: parentPartner?.name || (Array.isArray(c.parent_id) ? c.parent_id[1] : null),
      empresa_padre_local_id: empresaPadreLocal?.id || null,
      comercial_odoo_id: Array.isArray(c.user_id) ? c.user_id[0] : null,
      comercial_nombre: Array.isArray(c.user_id) ? c.user_id[1] : null,
      total_sucursales_odoo: Array.isArray(c.child_ids) ? c.child_ids.length : 0,
      etiquetas: (c.category_id || []).map(id => [id, etiquetasMap.get(id) || `Etiqueta ${id}`]),
      customer_rank: c.customer_rank,
      ya_importado: Boolean(empresaLocal),
      empresa_local_id: empresaLocal?.id || null,
    };
    });

    return NextResponse.json({
      clientes: resultado,
      total: resultado.length,
      include_contacts: includeContacts,
      total_partners_odoo: clientes.length,
      empresas_locales: (empresasExistentes || []).map((e) => ({
        id: e.id,
        nombre: e.nombre,
        odoo_partner_id: Number(e.odoo_partner_id),
      })),
      nota: includeContacts
        ? 'Se listan empresas y contactos. Los contactos pueden importarse como sedes de una empresa existente.'
        : 'Se listan únicamente partners corporativos (is_company=true). Activa include_contacts para gestionar contactos/sucursales desde esta vista.'
    });
  } catch (err) {
    console.error('[API /odoo/importar-clientes GET]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error interno' },
      { status: 500 }
    );
  }
}

// POST: Importar un partner de Odoo como empresa en Supabase
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      modo_importacion = 'empresa',
      odoo_partner_id,
      target_empresa_id,
      nombre,
      nit,
      ciudad,
      color_primario,
      presupuesto_global,
      requiere_aprobacion = true,
      usa_sedes = true,
    } = body;

    if (!odoo_partner_id) {
      return NextResponse.json({ error: 'odoo_partner_id es requerido' }, { status: 400 });
    }

    if (!['empresa', 'sede'].includes(modo_importacion)) {
      return NextResponse.json({ error: 'modo_importacion inválido. Usa "empresa" o "sede".' }, { status: 400 });
    }

    if (modo_importacion === 'sede' && !target_empresa_id) {
      return NextResponse.json({ error: 'target_empresa_id es requerido para importar como sede' }, { status: 400 });
    }

    const odooPartnerId = Number(odoo_partner_id);
    if (!Number.isFinite(odooPartnerId) || odooPartnerId <= 0) {
      return NextResponse.json({ error: 'odoo_partner_id inválido' }, { status: 400 });
    }

    const configOdoo = getConfigFromEnv();
    if (!configOdoo) {
      return NextResponse.json({ error: 'Configuración Odoo no encontrada' }, { status: 500 });
    }

    const sessionOdoo = await authenticate(configOdoo);
    const { read } = await import('@/lib/odoo/client');

    // Validar el partner directamente en Odoo para evitar importar contactos/sucursales como empresa
    const partnerRows = await read(
      'res.partner',
      [odooPartnerId],
      ['id', 'name', 'email', 'phone', 'vat', 'city', 'is_company', 'parent_id', 'user_id', 'child_ids'],
      sessionOdoo
    );

    if (!partnerRows.length) {
      return NextResponse.json({ error: 'Partner no encontrado en Odoo' }, { status: 404 });
    }

    const partner = partnerRows[0] as {
      id: number;
      name?: string;
      email?: string | false;
      vat?: string | false;
      city?: string | false;
      is_company?: boolean;
      parent_id?: [number, string] | false;
      user_id?: [number, string] | false;
      child_ids?: number[];
    };

    if (modo_importacion === 'empresa' && !partner.is_company) {
      const parentName = Array.isArray(partner.parent_id) ? partner.parent_id[1] : null;
      return NextResponse.json(
        {
          error: 'El partner seleccionado es un contacto/sucursal. Importa la empresa matriz; las sucursales se crearán como sedes automáticamente.',
          parent_name: parentName,
        },
        { status: 400 }
      );
    }

    const nombreEmpresa = partner.name || nombre;
    const nitEmpresa = partner.vat || nit || null;
    const ciudadEmpresa = partner.city || ciudad || null;
    const comercialOdooId = Array.isArray(partner.user_id) ? Number(partner.user_id[0]) : null;
    const comercialOdooNombre = Array.isArray(partner.user_id) ? partner.user_id[1] : null;

    const supabaseAdmin = getSupabaseAdmin();

    if (modo_importacion === 'sede') {
      const { data: empresaDestino, error: empresaDestinoError } = await supabaseAdmin
        .from('empresas')
        .select('id, nombre, odoo_partner_id')
        .eq('id', target_empresa_id)
        .single();

      if (empresaDestinoError || !empresaDestino) {
        return NextResponse.json({ error: 'No se encontró la empresa destino para crear la sede' }, { status: 404 });
      }

      if (Number(empresaDestino.odoo_partner_id) === odooPartnerId) {
        return NextResponse.json({
          error: 'No puedes importar el mismo partner de la empresa como sede de sí misma.',
        }, { status: 400 });
      }

      const { data: sedeExistente } = await supabaseAdmin
        .from('sedes')
        .select('id')
        .eq('empresa_id', target_empresa_id)
        .eq('odoo_address_id', odooPartnerId)
        .maybeSingle();

      if (sedeExistente) {
        return NextResponse.json(
          {
            error: 'Este partner ya está asociado como sede en la empresa destino.',
            sede_id: sedeExistente.id,
          },
          { status: 409 }
        );
      }

      const { data: sede, error: sedeError } = await supabaseAdmin
        .from('sedes')
        .insert({
          empresa_id: target_empresa_id,
          odoo_address_id: odooPartnerId,
          nombre_sede: partner.name || nombre || `Sede ${odooPartnerId}`,
          direccion: null,
          ciudad: partner.city || ciudad || null,
          contacto_nombre: partner.name || nombre || null,
          contacto_telefono: null,
          presupuesto_asignado: 0,
          presupuesto_alerta_threshold: 90,
          activa: true,
        })
        .select('id, empresa_id, nombre_sede, odoo_address_id')
        .single();

      if (sedeError) {
        return NextResponse.json({ error: sedeError.message }, { status: 500 });
      }

      let asesorAsignadoId: string | null = null;
      let avisoComercial: string | null = null;

      if (comercialOdooId || comercialOdooNombre) {
        const { error: updateEmpresaDestinoError } = await supabaseAdmin
          .from('empresas')
          .update({
            odoo_comercial_id: comercialOdooId,
            odoo_comercial_nombre: comercialOdooNombre,
          })
          .eq('id', target_empresa_id);

        if (updateEmpresaDestinoError) {
          console.error('[API /odoo/importar-clientes] Error sincronizando comercial en empresa destino:', updateEmpresaDestinoError.message);
        }

        const syncComercial = await sincronizarComercialYAsesor(
          supabaseAdmin,
          target_empresa_id,
          comercialOdooId,
          comercialOdooNombre
        );
        asesorAsignadoId = syncComercial.asesorAsignadoId;
        avisoComercial = syncComercial.avisoComercial;
      }

      return NextResponse.json({
        success: true,
        modo_importacion,
        sede,
        comercial_odoo: comercialOdooId
          ? { id: comercialOdooId, nombre: comercialOdooNombre }
          : null,
        asesor_asignado_id: asesorAsignadoId,
        aviso_comercial: avisoComercial,
        mensaje: 'Contacto/partner importado como sede correctamente.',
      });
    }

    // Verificar que no exista ya
    const { data: existente, error: existenteError } = await supabaseAdmin
      .from('empresas')
      .select('id, nombre')
      .eq('odoo_partner_id', odooPartnerId)
      .maybeSingle();

    if (existenteError) {
      return NextResponse.json({ error: existenteError.message }, { status: 500 });
    }

    if (existente) {
      if (comercialOdooId || comercialOdooNombre) {
        const { error: updateExistenteError } = await supabaseAdmin
          .from('empresas')
          .update({
            odoo_comercial_id: comercialOdooId,
            odoo_comercial_nombre: comercialOdooNombre,
          })
          .eq('id', existente.id);

        if (updateExistenteError) {
          console.error('[API /odoo/importar-clientes] Error actualizando comercial en empresa existente:', updateExistenteError.message);
        }
      }

      const syncExistente = await sincronizarComercialYAsesor(
        supabaseAdmin,
        existente.id,
        comercialOdooId,
        comercialOdooNombre
      );

      return NextResponse.json({
        success: true,
        empresa: {
          id: existente.id,
          nombre: existente.nombre,
        },
        comercial_odoo: comercialOdooId
          ? { id: comercialOdooId, nombre: comercialOdooNombre }
          : null,
        asesor_asignado_id: syncExistente.asesorAsignadoId,
        aviso_comercial: syncExistente.avisoComercial,
        mensaje: 'Empresa ya importada. Se sincronizó comercial y asignación de asesor.',
      });
    }

    // Crear empresa
    const { data: empresa, error: empresaError } = await supabaseAdmin
      .from('empresas')
      .insert({
        odoo_partner_id: odooPartnerId,
        odoo_comercial_id: comercialOdooId,
        odoo_comercial_nombre: comercialOdooNombre,
        nombre: nombreEmpresa || nombre,
        nit: nitEmpresa,
        presupuesto_global_mensual: presupuesto_global || null,
        requiere_aprobacion,
        usa_sedes,
        config_aprobacion: { niveles: 1, monto_auto_aprobacion: null },
        activa: true,
      })
      .select()
      .single();

    if (empresaError) {
      return NextResponse.json({ error: empresaError.message }, { status: 500 });
    }

    // Crear config visual básica
    const slug = nombreEmpresa
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 50);

    const { error: configError } = await supabaseAdmin
      .from('empresa_configs')
      .insert({
        empresa_id: empresa.id,
        slug,
        color_primario: color_primario || '#9CBB06',
        modulos_activos: { presupuestos: true, aprobaciones: true, trazabilidad: true },
      });

    if (configError) {
      console.error('[API /odoo/importar-clientes] Error creando config:', configError.message);
    }

    // Intentar asignar automáticamente asesor local según comercial Odoo
    const syncComercialNueva = await sincronizarComercialYAsesor(
      supabaseAdmin,
      empresa.id,
      comercialOdooId,
      comercialOdooNombre
    );
    const asesorAsignadoId = syncComercialNueva.asesorAsignadoId;
    const avisoComercial = syncComercialNueva.avisoComercial;

    // --- IMPORTAR SUCURSALES (SEDES) ---
    // Solo si la empresa operará con sedes
    if (usa_sedes) {
      let totalSedesInsertadas = 0;
      try {
        const childIds = Array.isArray(partner.child_ids) ? partner.child_ids : [];

        if (childIds.length > 0) {
          // Leer los datos de las sucursales
          const sucursales = await read('res.partner', childIds, ['id', 'name', 'street', 'city', 'phone', 'type', 'active'], sessionOdoo);

          type OdooSucursal = {
            id: number;
            name?: string;
            street?: string | false;
            city?: string | false;
            phone?: string | false;
            type?: string | false;
            active?: boolean;
          };

          // Filtrar solo las que están activas y mapearlas a formato de inserción
          const sedesToInsert = (sucursales as OdooSucursal[])
            .filter((s) => s.active !== false)
            .map((s) => ({
              empresa_id: empresa.id,
              odoo_address_id: s.id,
              nombre_sede: s.name || `Sede ${s.id}`,
              direccion: s.street || null,
              ciudad: s.city || ciudadEmpresa || null,
              contacto_nombre: s.name || null,
              contacto_telefono: s.phone || null,
              presupuesto_asignado: 0,
              presupuesto_alerta_threshold: 90,
              activa: true,
            }));

          if (sedesToInsert.length > 0) {
            const { error: sedesError } = await supabaseAdmin
              .from('sedes')
              .insert(sedesToInsert);

            if (sedesError) {
              console.error('[API /odoo/importar-clientes] Error creando sedes:', sedesError.message);
            } else {
              totalSedesInsertadas = sedesToInsert.length;
            }
          }
        }
      } catch (sucursalesError) {
        console.error('[API /odoo/importar-clientes] Error importando sucursales:', sucursalesError);
        // No fallar la importación principal si fallan las sucursales
      }

      // Si la empresa usa sedes pero Odoo no trajo sucursales, crear sede principal por defecto
      if (totalSedesInsertadas === 0) {
        const { error: sedePrincipalError } = await supabaseAdmin
          .from('sedes')
          .insert({
            empresa_id: empresa.id,
            odoo_address_id: null,
            nombre_sede: 'Sede Principal',
            direccion: null,
            ciudad: ciudadEmpresa || null,
            contacto_nombre: nombreEmpresa,
            contacto_telefono: null,
            presupuesto_asignado: 0,
            presupuesto_alerta_threshold: 90,
            activa: true,
          });

        if (sedePrincipalError) {
          console.error('[API /odoo/importar-clientes] Error creando sede principal:', sedePrincipalError.message);
        }
      }
    }

    return NextResponse.json({
      success: true,
      empresa,
      comercial_odoo: comercialOdooId
        ? { id: comercialOdooId, nombre: comercialOdooNombre }
        : null,
      asesor_asignado_id: asesorAsignadoId,
      aviso_comercial: avisoComercial,
      mensaje: 'Empresa (y sus sucursales, si aplica) importada correctamente'
    });
  } catch (err) {
    console.error('[API /odoo/importar-clientes POST]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error interno' },
      { status: 500 }
    );
  }
}
