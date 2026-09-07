import { NextRequest } from 'next/server';
import { getEmpaquesCaras, getEmpaquesImpresionSku, type EmpaquesModalidad } from '@/lib/empaques/personalizados-shared';
import {
  PersonalizadosError, UUID_PATTERN, TOKEN_PATTERN, hashArteToken, hashPersonalizacionRequest,
  loadPersonalizacionProductImage, loadPersonalizacionReferencia, personalizacionAdmin, personalizacionError,
  personalizacionJson, readPersonalizacionJson,
} from '@/lib/empaques/personalizados.server';

const ATTRIBUTION_KEYS = ['gclid', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'referrer', 'landing_url'] as const;

function text(body: Record<string, unknown>, key: string, maxLength: number): string {
  const value = typeof body[key] === 'string' ? body[key].trim() : '';
  if (value.length > maxLength) throw new PersonalizadosError(400, `El campo ${key} supera el tamaño permitido.`);
  return value;
}

function attributionFor(raw: unknown) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const result: Record<string, string | null> = {};
  for (const key of ATTRIBUTION_KEYS) {
    result[key] = typeof source[key] === 'string' ? source[key].trim().slice(0, 500) || null : null;
  }
  const clickDate = typeof source.click_at === 'string' ? new Date(source.click_at) : null;
  result.click_at = clickDate && Number.isFinite(clickDate.getTime()) && clickDate.getTime() <= Date.now() + 300000 ? clickDate.toISOString() : null;
  return result;
}

export async function GET(request: NextRequest) {
  try {
    const image = await loadPersonalizacionProductImage(personalizacionAdmin(), request.nextUrl.searchParams.get('sku'));
    return personalizacionJson(image);
  } catch (error) {
    return personalizacionError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await readPersonalizacionJson(request);
    if (text(body, 'sitio_web', 200)) throw new PersonalizadosError(400, 'No se pudo registrar la solicitud.');
    if (typeof body.solicitud_id !== 'string' || !UUID_PATTERN.test(body.solicitud_id)) {
      throw new PersonalizadosError(400, 'Actualiza la página antes de enviar la solicitud.');
    }
    if ((body.modalidad !== 'produccion' && body.modalidad !== 'muestra') || (body.caras !== 1 && body.caras !== 2)) {
      throw new PersonalizadosError(400, 'Selecciona producción o muestra y una o dos caras.');
    }
    const modalidad: EmpaquesModalidad = body.modalidad;
    const caras = getEmpaquesCaras(body.caras);
    const archivos = body.archivos;
    if (!Array.isArray(archivos) || archivos.length !== caras.length) {
      throw new PersonalizadosError(400, `Debes cargar y validar exactamente ${caras.length} TIFF, uno por cara.`);
    }
    const ids = new Set<string>();
    const suppliedCaras = new Set<string>();
    const tokens = archivos.map((raw) => {
      if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !UUID_PATTERN.test(raw.id)
        || typeof raw.token !== 'string' || !TOKEN_PATTERN.test(raw.token) || !caras.includes(raw.cara)
        || ids.has(raw.id.toLowerCase()) || suppliedCaras.has(raw.cara)) {
        throw new PersonalizadosError(400, 'Los archivos no corresponden a las caras seleccionadas.');
      }
      ids.add(raw.id.toLowerCase());
      suppliedCaras.add(raw.cara);
      return { id: raw.id.toLowerCase(), token_hash: hashArteToken(raw.token) };
    });
    const nombre = text(body, 'nombre', 120);
    const uso = text(body, 'uso_producto', 500);
    const email = text(body, 'email', 180);
    const telefono = text(body, 'telefono', 50);
    if (nombre.length < 2 || uso.length < 2 || (!email && !telefono)) throw new PersonalizadosError(400, 'Completa nombre, uso del producto y un correo o teléfono.');
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new PersonalizadosError(400, 'El correo no tiene un formato válido.');
    if (typeof body.cantidad !== 'number' || !Number.isInteger(body.cantidad) || body.cantidad <= 0 || body.cantidad > 10_000_000) {
      throw new PersonalizadosError(400, 'La cantidad debe ser un entero mayor a cero.');
    }
    const fecha = text(body, 'fecha_requerida', 10);
    if (fecha) {
      const parsed = /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? new Date(`${fecha}T00:00:00Z`) : null;
      if (!parsed || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== fecha) {
        throw new PersonalizadosError(400, 'La fecha requerida no es válida.');
      }
    }
    const admin = personalizacionAdmin();
    const { referencia, storefrontId, config } = await loadPersonalizacionReferencia(admin, body.sku);
    const impresionSku = getEmpaquesImpresionSku(modalidad, body.caras);
    const impresion = modalidad === 'muestra' ? `Muestra de impresión CMYK, ${body.caras} cara(s), tarifa única` : `Impresión CMYK, ${body.caras} cara(s)`;
    const ciudad = text(body, 'ciudad_entrega', 120);
    const comentarios = text(body, 'comentarios', 2000);
    const summary = [
      'Solicitud de impresión personalizada sobre empaque kraft',
      `Empaque: ${referencia.nombre} · SKU ${referencia.sku}`,
      `Área imprimible: alto ${referencia.alto_cm} × ancho ${referencia.ancho_cm} cm`,
      `Servicio: ${impresion} · SKU ${impresionSku}`,
      `Cantidad: ${body.cantidad}`, `Uso: ${uso}`,
      ciudad ? `Ciudad: ${ciudad}` : null, fecha ? `Fecha requerida: ${fecha}` : null,
      comentarios ? `Comentarios: ${comentarios}` : null,
      `Artes TIFF validados: ${caras.join(' y ')}`,
    ].filter(Boolean).join('\n');
    const { data: whatsappRow, error: whatsappError } = await admin.from('landing_contenido')
      .select('contenido').eq('id', 'config_whatsapp').maybeSingle();
    if (whatsappError) throw whatsappError;
    const contenido = whatsappRow?.contenido;
    const numero = contenido && typeof contenido === 'object' && typeof contenido.numero === 'string' ? contenido.numero.replace(/\D/g, '') : '';
    const { data: leadId, error } = await admin.rpc('registrar_empaques_tiff', {
      p_solicitud_id: body.solicitud_id,
      p_payload: {
        nombre, empresa: text(body, 'empresa', 160) || null, email: email || null, telefono: telefono || null,
        mensaje: summary, storefront_config_id: storefrontId, tipo_empaque: referencia.nombre,
        uso_producto: uso, material: 'Papel kraft', impresion, cantidad: body.cantidad,
        ciudad_entrega: ciudad || null, fecha_requerida: fecha || null, comentarios: comentarios || null,
        referencia_sku: referencia.sku, impresion_sku: impresionSku, modalidad, caras: body.caras,
        area_alto_cm: referencia.alto_cm, area_ancho_cm: referencia.ancho_cm,
        request_hash: hashPersonalizacionRequest(request), whatsapp_enviado: Boolean(numero), attribution: attributionFor(body.attribution),
      },
      p_archivos: tokens,
    });
    if (error) throw error;
    if (typeof leadId !== 'string' || !UUID_PATTERN.test(leadId)) throw new Error('INVALID_LEAD_RESPONSE');
    const whatsappText = `${config.mensaje_whatsapp} Referencia: ${leadId.slice(0, 8)}. ${referencia.nombre}; ${impresion}.`;
    const whatsappUrl = numero ? `https://wa.me/${numero}?text=${encodeURIComponent(whatsappText)}` : null;
    return personalizacionJson({ ok: true, lead_id: leadId, whatsapp_url: whatsappUrl });
  } catch (error) {
    return personalizacionError(error);
  }
}
