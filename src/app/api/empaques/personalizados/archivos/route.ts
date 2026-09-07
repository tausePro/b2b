import { randomBytes, randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import {
  EMPAQUES_TIFF_MAX_BYTES,
  type EmpaquesArteValidacion,
  type EmpaquesCara,
} from '@/lib/empaques/personalizados-shared';
import { inspectEmpaquesTiff } from '@/lib/empaques/tiff.server';
import {
  EMPAQUES_ART_BUCKET, PersonalizadosError, UUID_PATTERN,
  hashArteToken, hashPersonalizacionRequest, loadPersonalizacionReferencia,
  personalizacionAdmin, personalizacionError, personalizacionJson,
  readPersonalizacionJson, validArteToken,
} from '@/lib/empaques/personalizados.server';

export const runtime = 'nodejs';
export const maxDuration = 60;

type Carga = {
  id: string;
  token_hash: string;
  referencia_sku: string;
  cara: EmpaquesCara;
  nombre: string;
  tamano_declarado: number;
  original_path: string;
  preview_path: string | null;
  estado: string;
  area_alto_cm: number;
  area_ancho_cm: number;
  validacion: EmpaquesArteValidacion | null;
  expires_at: string;
};

async function cleanupExpired(admin: ReturnType<typeof personalizacionAdmin>) {
  const cutoff = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
  const { data, error } = await admin.from('empaques_tiff_cargas')
    .select('id').is('lead_id', null).neq('estado', 'usado').lt('created_at', cutoff).lt('expires_at', cutoff).limit(10);
  if (error || !data?.length) return;
  const ids = data.map((row) => String(row.id)).filter((id) => UUID_PATTERN.test(id));
  if (!ids.length) return;
  const { error: removalError } = await admin.storage.from(EMPAQUES_ART_BUCKET)
    .remove(ids.flatMap((id) => [`tiff/${id}/original.tiff`, `tiff/${id}/preview.png`]));
  if (removalError) return;
  await admin.from('empaques_tiff_cargas').delete().in('id', ids).is('lead_id', null).neq('estado', 'usado').lt('expires_at', cutoff);
}

async function responseForCarga(admin: ReturnType<typeof personalizacionAdmin>, carga: Carga) {
  const expectedPath = `tiff/${carga.id}/preview.png`;
  if (carga.preview_path !== expectedPath || !carga.validacion) throw new PersonalizadosError(409, 'La vista previa no está disponible. Vuelve a subir el archivo.');
  const seconds = Math.max(1, Math.min(7200, Math.floor((Date.parse(carga.expires_at) - Date.now()) / 1000)));
  const { data, error } = await admin.storage.from(EMPAQUES_ART_BUCKET).createSignedUrl(expectedPath, seconds);
  if (error || !data) throw new Error('PREVIEW_SIGNING_FAILED');
  return personalizacionJson({
    id: carga.id, cara: carga.cara, sku: carga.referencia_sku, nombre: carga.nombre,
    tamano: Number(carga.tamano_declarado), expires_at: carga.expires_at,
    preview_url: data.signedUrl, validacion: carga.validacion,
  });
}

export async function POST(request: NextRequest) {
  let claimed: Carga | null = null;
  const admin = personalizacionAdmin();
  try {
    const body = await readPersonalizacionJson(request);
    if (body.action === 'iniciar') {
      const { referencia } = await loadPersonalizacionReferencia(admin, body.sku);
      if (body.cara !== 'frente' && body.cara !== 'reverso') throw new PersonalizadosError(400, 'La cara del empaque no es válida.');
      const nombre = typeof body.nombre === 'string' ? body.nombre.trim() : '';
      if (!nombre || nombre.length > 180 || /[\u0000-\u001f\u007f/\\]/.test(nombre) || !/\.tiff?$/i.test(nombre)) {
        throw new PersonalizadosError(400, 'Selecciona un archivo con extensión .tif o .tiff y un nombre válido.');
      }
      if (typeof body.tamano !== 'number' || !Number.isSafeInteger(body.tamano) || body.tamano < 8 || body.tamano > EMPAQUES_TIFF_MAX_BYTES) {
        throw new PersonalizadosError(400, 'Cada TIFF debe pesar entre 8 bytes y 100 MB.');
      }
      await cleanupExpired(admin);
      const id = randomUUID();
      const token = randomBytes(32).toString('hex');
      const { error } = await admin.rpc('reservar_empaques_tiff', {
        p_id: id, p_token_hash: hashArteToken(token), p_request_hash: hashPersonalizacionRequest(request),
        p_sku: referencia.sku, p_cara: body.cara, p_nombre: nombre, p_tamano: body.tamano,
        p_alto_cm: referencia.alto_cm, p_ancho_cm: referencia.ancho_cm,
      });
      if (error) throw error;
      const { data: row, error: rowError } = await admin.from('empaques_tiff_cargas').select('expires_at').eq('id', id).single();
      if (rowError) throw rowError;
      const { data: signed, error: signError } = await admin.storage.from(EMPAQUES_ART_BUCKET)
        .createSignedUploadUrl(`tiff/${id}/original.tiff`, { upsert: false });
      if (signError || !signed) throw new Error('UPLOAD_SIGNING_FAILED');
      return personalizacionJson({ id, token, upload_url: signed.signedUrl, expires_at: row.expires_at });
    }
    if (body.action !== 'validar' || typeof body.id !== 'string' || !UUID_PATTERN.test(body.id)) {
      throw new PersonalizadosError(400, 'La solicitud de archivo no es válida.');
    }
    const { data, error } = await admin.from('empaques_tiff_cargas').select('*').eq('id', body.id).maybeSingle();
    if (error) throw error;
    if (!data || !validArteToken(body.token, data.token_hash)) throw new PersonalizadosError(403, 'No se pudo autorizar el archivo. Vuelve a subirlo.');
    const carga = data as Carga;
    if (Date.parse(carga.expires_at) <= Date.now()) throw new PersonalizadosError(410, 'La carga expiró. Vuelve a subir el TIFF.');
    const { referencia } = await loadPersonalizacionReferencia(admin, carga.referencia_sku);
    if (Number(carga.area_alto_cm) !== referencia.alto_cm || Number(carga.area_ancho_cm) !== referencia.ancho_cm) {
      throw new PersonalizadosError(409, 'El área imprimible cambió. Actualiza la página y vuelve a subir el arte.');
    }
    if (carga.estado === 'validado') return responseForCarga(admin, carga);
    if (carga.estado !== 'pendiente') throw new PersonalizadosError(409, 'El archivo ya se está procesando o no puede reutilizarse.');
    const originalPath = `tiff/${carga.id}/original.tiff`;
    if (carga.original_path !== originalPath) throw new PersonalizadosError(403, 'La ruta del archivo no es válida.');
    const { data: info, error: infoError } = await admin.storage.from(EMPAQUES_ART_BUCKET).info(originalPath);
    if (infoError || !info) throw new PersonalizadosError(409, 'El TIFF todavía no se ha cargado completamente. Reintenta la carga.');
    const bytes = Number(info.size ?? info.metadata?.size);
    if (!Number.isSafeInteger(bytes) || bytes !== Number(carga.tamano_declarado) || bytes > EMPAQUES_TIFF_MAX_BYTES) {
      throw new PersonalizadosError(422, 'El tamaño almacenado no coincide con el archivo autorizado. Vuelve a subirlo.');
    }
    const { data: claim, error: claimError } = await admin.from('empaques_tiff_cargas')
      .update({ estado: 'validando', claim_at: new Date().toISOString() })
      .eq('id', carga.id).eq('estado', 'pendiente').gt('expires_at', new Date().toISOString()).select('id').maybeSingle();
    if (claimError) throw claimError;
    if (!claim) throw new PersonalizadosError(409, 'El TIFF ya se está validando. Espera a que termine.');
    claimed = carga;
    const { data: blob, error: downloadError } = await admin.storage.from(EMPAQUES_ART_BUCKET).download(originalPath);
    if (downloadError || !blob) throw new Error('TIFF_DOWNLOAD_FAILED');
    if (blob.size !== bytes) throw new PersonalizadosError(422, 'El TIFF almacenado está incompleto.');
    let inspected: Awaited<ReturnType<typeof inspectEmpaquesTiff>>;
    try {
      inspected = await inspectEmpaquesTiff(Buffer.from(await blob.arrayBuffer()), referencia);
    } catch (decodeError) {
      throw new PersonalizadosError(422, decodeError instanceof Error ? decodeError.message : 'El TIFF no se puede procesar.');
    }
    const previewPath = `tiff/${carga.id}/preview.png`;
    const { error: previewError } = await admin.storage.from(EMPAQUES_ART_BUCKET)
      .upload(previewPath, inspected.preview, { contentType: 'image/png', upsert: false, cacheControl: '3600' });
    if (previewError) throw new Error('PREVIEW_UPLOAD_FAILED');
    const { data: validated, error: validationError } = await admin.from('empaques_tiff_cargas')
      .update({ estado: 'validado', preview_path: previewPath, validacion: inspected.validacion, sha256: inspected.sha256 })
      .eq('id', carga.id).eq('estado', 'validando').gt('expires_at', new Date().toISOString()).select('*').maybeSingle();
    if (validationError) throw validationError;
    if (!validated) throw new PersonalizadosError(410, 'La carga expiró durante la validación.');
    claimed = null;
    return responseForCarga(admin, validated as Carga);
  } catch (error) {
    if (claimed) await admin.from('empaques_tiff_cargas').update({ estado: 'rechazado' }).eq('id', claimed.id).eq('estado', 'validando');
    return personalizacionError(error);
  }
}
