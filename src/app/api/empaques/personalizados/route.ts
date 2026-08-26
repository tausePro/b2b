import { createHmac, randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { normalizeLandingConfig } from '@/lib/empaques/landing-config-shared';
import {
  EMPAQUES_PERSONALIZADOS_FILE_TYPES,
  EMPAQUES_PERSONALIZADOS_MAX_FILE_BYTES,
  EMPAQUES_PERSONALIZADOS_MAX_FILES,
  EMPAQUES_PERSONALIZADOS_MAX_TOTAL_BYTES,
  type EmpaquesPersonalizadosArchivo,
  type EmpaquesPersonalizadosFileType,
} from '@/lib/empaques/personalizados-shared';

const BUCKET = 'empaques-solicitudes';
const ATTRIBUTION_KEYS = [
  'gclid',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'referrer',
  'landing_url',
] as const;

function getSupabaseAdmin() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function getRequestHash(request: NextRequest) {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const address = forwarded || request.headers.get('x-real-ip') || 'unknown';
  const userAgent = request.headers.get('user-agent') || 'unknown';
  return createHmac('sha256', process.env.SUPABASE_SERVICE_ROLE_KEY!)
    .update(`${address}|${userAgent}`)
    .digest('hex');
}

function getText(formData: FormData, key: string, maxLength: number) {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function getOptionalNumber(formData: FormData, key: string) {
  const raw = getText(formData, key, 30);
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function sanitizeFileName(name: string) {
  return name.trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 180) || 'archivo';
}

function extensionFor(type: EmpaquesPersonalizadosFileType) {
  if (type === 'image/jpeg') return 'jpg';
  if (type === 'image/png') return 'png';
  if (type === 'image/webp') return 'webp';
  return 'pdf';
}

function parseAttribution(raw: string) {
  let source: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') source = parsed as Record<string, unknown>;
  } catch {
    source = {};
  }

  const attribution: Record<string, string | null> = {};
  for (const key of ATTRIBUTION_KEYS) {
    const value = source[key];
    attribution[key] = typeof value === 'string' && value.trim()
      ? value.trim().slice(0, 500)
      : null;
  }

  const clickRaw = source.click_at;
  const clickDate = typeof clickRaw === 'string' ? new Date(clickRaw) : null;
  const clickAt = clickDate && !Number.isNaN(clickDate.getTime()) && clickDate.getTime() <= Date.now() + 5 * 60 * 1000
    ? clickDate.toISOString()
    : null;

  return { ...attribution, click_at: clickAt };
}

function buildSummary(input: {
  tipoEmpaque: string;
  usoProducto: string;
  largo: number | null;
  ancho: number | null;
  alto: number | null;
  unidad: string;
  material: string;
  impresion: string;
  cantidad: number;
  ciudad: string;
  fecha: string;
  comentarios: string;
  files: number;
}) {
  const dimensions = [input.largo, input.ancho, input.alto].some((value) => value !== null)
    ? [input.largo ?? '—', input.ancho ?? '—', input.alto ?? '—'].join(' × ') + ` ${input.unidad}`
    : null;
  return [
    'Solicitud de empaque personalizado',
    `Tipo: ${input.tipoEmpaque}`,
    `Uso: ${input.usoProducto}`,
    dimensions ? `Medidas: ${dimensions}` : null,
    input.material ? `Material: ${input.material}` : null,
    input.impresion ? `Impresión: ${input.impresion}` : null,
    `Cantidad estimada: ${input.cantidad}`,
    input.ciudad ? `Ciudad de entrega: ${input.ciudad}` : null,
    input.fecha ? `Fecha requerida: ${input.fecha}` : null,
    input.comentarios ? `Comentarios: ${input.comentarios}` : null,
    input.files > 0 ? `Archivos adjuntos: ${input.files}` : null,
  ].filter(Boolean).join('\n');
}

export async function POST(request: NextRequest) {
  const admin = getSupabaseAdmin();
  let leadId: string | null = null;
  const uploadedPaths: string[] = [];

  try {
    const formData = await request.formData();
    if (getText(formData, 'sitio_web', 200)) {
      return NextResponse.json({ ok: true, whatsapp_url: null });
    }

    const nombre = getText(formData, 'nombre', 120);
    const empresa = getText(formData, 'empresa', 160);
    const email = getText(formData, 'email', 180);
    const telefono = getText(formData, 'telefono', 50);
    const tipoEmpaque = getText(formData, 'tipo_empaque', 120);
    const usoProducto = getText(formData, 'uso_producto', 500);
    const material = getText(formData, 'material', 120);
    const impresion = getText(formData, 'impresion', 120);
    const ciudad = getText(formData, 'ciudad_entrega', 120);
    const fecha = getText(formData, 'fecha_requerida', 10);
    const comentarios = getText(formData, 'comentarios', 2000);
    const unidad = getText(formData, 'unidad_medida', 2) === 'mm' ? 'mm' : 'cm';
    const largo = getOptionalNumber(formData, 'medida_largo');
    const ancho = getOptionalNumber(formData, 'medida_ancho');
    const alto = getOptionalNumber(formData, 'medida_alto');
    const cantidad = Number.parseInt(getText(formData, 'cantidad', 12), 10);

    if (nombre.length < 2 || tipoEmpaque.length < 2 || usoProducto.length < 2) {
      return NextResponse.json({ error: 'Completa nombre, tipo de empaque y uso del producto.' }, { status: 400 });
    }
    if (!email && !telefono) {
      return NextResponse.json({ error: 'Ingresa un correo o teléfono de contacto.' }, { status: 400 });
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'El correo no tiene un formato válido.' }, { status: 400 });
    }
    if (!Number.isInteger(cantidad) || cantidad <= 0 || cantidad > 10_000_000) {
      return NextResponse.json({ error: 'La cantidad debe ser un entero mayor a cero.' }, { status: 400 });
    }
    const invalidDimension = ['medida_largo', 'medida_ancho', 'medida_alto'].some((key) =>
      Boolean(getText(formData, key, 30)) && getOptionalNumber(formData, key) === null,
    );
    if (invalidDimension) {
      return NextResponse.json({ error: 'Las medidas deben ser números mayores a cero.' }, { status: 400 });
    }
    if (fecha) {
      const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? new Date(`${fecha}T00:00:00Z`) : null;
      if (!parsedDate || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== fecha) {
        return NextResponse.json({ error: 'La fecha requerida no es válida.' }, { status: 400 });
      }
      if (fecha < new Date().toISOString().slice(0, 10)) {
        return NextResponse.json({ error: 'La fecha requerida no puede estar en el pasado.' }, { status: 400 });
      }
    }

    const files = formData.getAll('archivos').filter((value): value is File => value instanceof File && value.size > 0);
    if (files.length > EMPAQUES_PERSONALIZADOS_MAX_FILES) {
      return NextResponse.json({ error: `Puedes adjuntar máximo ${EMPAQUES_PERSONALIZADOS_MAX_FILES} archivos.` }, { status: 400 });
    }
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    if (totalBytes > EMPAQUES_PERSONALIZADOS_MAX_TOTAL_BYTES) {
      return NextResponse.json({ error: 'Los archivos superan el límite total de 4 MB.' }, { status: 400 });
    }
    for (const file of files) {
      if (!(EMPAQUES_PERSONALIZADOS_FILE_TYPES as readonly string[]).includes(file.type)) {
        return NextResponse.json({ error: 'Solo se permiten imágenes JPG, PNG, WEBP o archivos PDF.' }, { status: 400 });
      }
      if (file.size > EMPAQUES_PERSONALIZADOS_MAX_FILE_BYTES) {
        return NextResponse.json({ error: 'Cada archivo debe pesar máximo 3 MB.' }, { status: 400 });
      }
    }

    const [{ data: storefront, error: storefrontError }, { data: whatsappRow, error: whatsappError }] = await Promise.all([
      admin
        .from('storefront_configs')
        .select('id, activo, configuracion_extra')
        .eq('slug', 'empaques')
        .maybeSingle(),
      admin
        .from('landing_contenido')
        .select('contenido')
        .eq('id', 'config_whatsapp')
        .maybeSingle(),
    ]);
    if (storefrontError) throw storefrontError;
    if (whatsappError) throw whatsappError;
    if (!storefront?.id || !storefront.activo) {
      return NextResponse.json({ error: 'El configurador no está disponible.' }, { status: 404 });
    }

    const config = normalizeLandingConfig(storefront.configuracion_extra).personalizados;
    if (!config.activo) {
      return NextResponse.json({ error: 'El configurador no está disponible.' }, { status: 404 });
    }
    if (config.tipos_empaque.length > 0 && !config.tipos_empaque.includes(tipoEmpaque)) {
      return NextResponse.json({ error: 'El tipo de empaque seleccionado no está disponible.' }, { status: 400 });
    }
    if (material && config.materiales.length > 0 && !config.materiales.includes(material)) {
      return NextResponse.json({ error: 'El material seleccionado no está disponible.' }, { status: 400 });
    }
    if (impresion && config.impresiones.length > 0 && !config.impresiones.includes(impresion)) {
      return NextResponse.json({ error: 'La impresión seleccionada no está disponible.' }, { status: 400 });
    }

    const requestHash = getRequestHash(request);
    const rateLimitSince = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { count: recentRequests, error: rateLimitError } = await admin
      .from('lead_empaques_personalizados')
      .select('id', { count: 'exact', head: true })
      .eq('request_hash', requestHash)
      .gte('created_at', rateLimitSince);
    if (rateLimitError) throw rateLimitError;
    if ((recentRequests ?? 0) >= 5) {
      return NextResponse.json(
        { error: 'Alcanzaste el límite temporal de solicitudes. Intenta nuevamente más tarde.' },
        { status: 429 },
      );
    }

    const summary = buildSummary({
      tipoEmpaque,
      usoProducto,
      largo,
      ancho,
      alto,
      unidad,
      material,
      impresion,
      cantidad,
      ciudad,
      fecha,
      comentarios,
      files: files.length,
    });
    const attribution = parseAttribution(getText(formData, 'attribution', 5000));
    const whatsapp = whatsappRow?.contenido && typeof whatsappRow.contenido === 'object'
      ? whatsappRow.contenido as Record<string, unknown>
      : {};
    const numeroWhatsapp = typeof whatsapp.numero === 'string' ? whatsapp.numero.replace(/\D/g, '') : '';

    const { data: lead, error: leadError } = await admin
      .from('leads')
      .insert({
        nombre,
        empresa: empresa || null,
        email: email || null,
        telefono: telefono || null,
        mensaje: summary,
        fuente: 'empaques_personalizados',
        estado: 'nuevo',
        whatsapp_enviado: Boolean(numeroWhatsapp),
        ...attribution,
      })
      .select('id')
      .single();
    if (leadError) throw leadError;
    leadId = lead.id;

    const archivos: EmpaquesPersonalizadosArchivo[] = [];
    for (const file of files) {
      const type = file.type as EmpaquesPersonalizadosFileType;
      const path = `${lead.id}/${randomUUID()}.${extensionFor(type)}`;
      const { error: uploadError } = await admin.storage
        .from(BUCKET)
        .upload(path, Buffer.from(await file.arrayBuffer()), {
          contentType: type,
          upsert: false,
        });
      if (uploadError) throw uploadError;
      uploadedPaths.push(path);
      archivos.push({
        path,
        nombre: sanitizeFileName(file.name),
        tipo: type,
        tamano: file.size,
      });
    }

    const { error: detailError } = await admin
      .from('lead_empaques_personalizados')
      .insert({
        lead_id: lead.id,
        storefront_config_id: storefront.id,
        tipo_empaque: tipoEmpaque,
        uso_producto: usoProducto,
        medida_largo: largo,
        medida_ancho: ancho,
        medida_alto: alto,
        unidad_medida: unidad,
        material: material || null,
        impresion: impresion || null,
        cantidad,
        ciudad_entrega: ciudad || null,
        fecha_requerida: fecha || null,
        comentarios: comentarios || null,
        request_hash: requestHash,
        archivos,
      });
    if (detailError) throw detailError;

    const whatsappText = `${config.mensaje_whatsapp} Referencia: ${lead.id.slice(0, 8)}.`;
    const whatsappUrl = numeroWhatsapp
      ? `https://wa.me/${numeroWhatsapp}?text=${encodeURIComponent(whatsappText)}`
      : null;

    return NextResponse.json({ ok: true, lead_id: lead.id, whatsapp_url: whatsappUrl });
  } catch (error) {
    if (uploadedPaths.length > 0) {
      await admin.storage.from(BUCKET).remove(uploadedPaths);
    }
    if (leadId) {
      await admin.from('leads').delete().eq('id', leadId);
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No se pudo registrar la solicitud.' },
      { status: 500 },
    );
  }
}
