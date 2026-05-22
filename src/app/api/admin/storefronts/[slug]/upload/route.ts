import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { authorizeApiRoles } from '@/lib/auth/apiRouteGuards';

// Reutilizamos el bucket dedicado `storefronts` (migración 043), separado
// del bucket `landing` para no mezclar assets institucionales con material
// editorial de cada storefront. Mismo conjunto de roles que en CMS.
const EDITOR_ROLES = ['super_admin', 'direccion', 'editor_contenido'] as const;
const BUCKET = 'storefronts';

const IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/svg+xml',
  'image/webp',
  'image/gif',
]);

const PDF_MIME_TYPES = new Set(['application/pdf']);

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_PDF_BYTES = 10 * 1024 * 1024; // 10 MB (coincide con file_size_limit del bucket)

function getSupabaseAdmin() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function inferKind(file: File, hint: string | null): 'imagen' | 'pdf' | null {
  const fromHint = hint?.toLowerCase().trim();
  if (fromHint === 'imagen' || fromHint === 'pdf') return fromHint;

  if (IMAGE_MIME_TYPES.has(file.type)) return 'imagen';
  if (PDF_MIME_TYPES.has(file.type)) return 'pdf';
  return null;
}

function pickExtension(file: File, kind: 'imagen' | 'pdf') {
  const fromName = file.name.split('.').pop()?.trim().toLowerCase();
  if (fromName && fromName.length <= 5) {
    return fromName === 'jpeg' ? 'jpg' : fromName;
  }
  if (kind === 'pdf') return 'pdf';
  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/jpeg') return 'jpg';
  if (file.type === 'image/webp') return 'webp';
  if (file.type === 'image/svg+xml') return 'svg';
  if (file.type === 'image/gif') return 'gif';
  return 'bin';
}

// POST /api/admin/storefronts/[slug]/upload
//
// Multipart form fields:
//   file:   File (requerido)
//   kind:   'imagen' | 'pdf' (opcional; si falta se infiere del MIME)
//   folder: subcarpeta libre dentro del slug (e.g. 'productos', 'categorias').
//
// Respuesta: { url, path }
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;

  const auth = await authorizeApiRoles(EDITOR_ROLES);
  if (auth instanceof NextResponse) return auth;

  // Validamos que el storefront referenciado en la URL realmente exista.
  // Evita que alguien suba archivos a un slug arbitrario.
  const { data: storefront, error: storefrontError } = await auth.admin
    .from('storefront_configs')
    .select('id, slug')
    .eq('slug', slug)
    .maybeSingle();

  if (storefrontError) {
    return NextResponse.json({ error: storefrontError.message }, { status: 500 });
  }
  if (!storefront?.id) {
    return NextResponse.json({ error: 'STOREFRONT_NOT_FOUND' }, { status: 404 });
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: 'multipart/form-data esperado.' }, { status: 400 });
  }

  const file = formData.get('file') as File | null;
  const kindHint = formData.get('kind');
  const folderHint = formData.get('folder');

  if (!file) {
    return NextResponse.json({ error: 'Archivo requerido.' }, { status: 400 });
  }

  const kind = inferKind(file, typeof kindHint === 'string' ? kindHint : null);
  if (!kind) {
    return NextResponse.json(
      { error: 'Tipo de archivo no permitido. Sólo imágenes (jpg/png/svg/webp/gif) o PDF.' },
      { status: 400 }
    );
  }

  if (kind === 'imagen' && !IMAGE_MIME_TYPES.has(file.type)) {
    return NextResponse.json({ error: 'El archivo no es una imagen válida.' }, { status: 400 });
  }
  if (kind === 'pdf' && !PDF_MIME_TYPES.has(file.type)) {
    return NextResponse.json({ error: 'El archivo no es un PDF válido.' }, { status: 400 });
  }

  const maxBytes = kind === 'imagen' ? MAX_IMAGE_BYTES : MAX_PDF_BYTES;
  if (file.size > maxBytes) {
    const limitMb = Math.round(maxBytes / (1024 * 1024));
    return NextResponse.json(
      { error: `El archivo excede el límite de ${limitMb} MB para ${kind === 'imagen' ? 'imágenes' : 'PDFs'}.` },
      { status: 400 }
    );
  }

  const folder = typeof folderHint === 'string' && folderHint.trim()
    ? folderHint.trim().replace(/[^a-z0-9_-]/gi, '').toLowerCase().slice(0, 32)
    : kind === 'pdf' ? 'fichas' : 'imagenes';

  const ext = pickExtension(file, kind);
  // Estructura: storefronts/<slug>/<folder>/<timestamp>_<rand>.<ext>
  const path = `${slug}/${folder}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const supabaseAdmin = getSupabaseAdmin();

  const { error: uploadError } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, buffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json(
      { error: uploadError.message ?? 'No se pudo subir el archivo.' },
      { status: 500 }
    );
  }

  const { data: publicUrlData } = supabaseAdmin.storage
    .from(BUCKET)
    .getPublicUrl(path);

  return NextResponse.json({
    url: publicUrlData.publicUrl,
    path,
    kind,
    bucket: BUCKET,
  });
}
