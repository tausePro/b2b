-- ============================================================
-- Migración 043: Storage para storefronts (imágenes + PDFs editoriales)
--                + columna ficha_tecnica_url en producto editorial.
--
-- Idempotente. Se aparta del bucket `landing` para evitar mezclar
-- contenido de la home institucional con assets de los storefronts
-- (Empaques y futuros). Mismas políticas de rol: lectura pública,
-- escritura sólo super_admin/direccion/editor_contenido.
-- ============================================================

-- 1. Bucket público para imágenes y fichas técnicas de storefronts.
--    Permitimos PDFs porque el caso de uso explícito es subir la
--    ficha técnica de un producto y dejar un link descargable.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'storefronts',
  'storefronts',
  true,
  10485760, -- 10 MB (las fichas técnicas pesan más que un logo)
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/svg+xml',
    'image/webp',
    'image/gif',
    'application/pdf'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- 2. Políticas storage.objects para el bucket `storefronts`.
DROP POLICY IF EXISTS "storefronts_storage_public_read" ON storage.objects;
CREATE POLICY "storefronts_storage_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'storefronts');

DROP POLICY IF EXISTS "storefronts_storage_admin_insert" ON storage.objects;
CREATE POLICY "storefronts_storage_admin_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'storefronts'
    AND EXISTS (
      SELECT 1 FROM public.usuarios
      WHERE usuarios.auth_id = auth.uid()
        AND usuarios.rol IN ('super_admin', 'direccion', 'editor_contenido')
        AND usuarios.activo = true
    )
  );

DROP POLICY IF EXISTS "storefronts_storage_admin_update" ON storage.objects;
CREATE POLICY "storefronts_storage_admin_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'storefronts'
    AND EXISTS (
      SELECT 1 FROM public.usuarios
      WHERE usuarios.auth_id = auth.uid()
        AND usuarios.rol IN ('super_admin', 'direccion', 'editor_contenido')
        AND usuarios.activo = true
    )
  );

DROP POLICY IF EXISTS "storefronts_storage_admin_delete" ON storage.objects;
CREATE POLICY "storefronts_storage_admin_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'storefronts'
    AND EXISTS (
      SELECT 1 FROM public.usuarios
      WHERE usuarios.auth_id = auth.uid()
        AND usuarios.rol IN ('super_admin', 'direccion', 'editor_contenido')
        AND usuarios.activo = true
    )
  );

-- 3. Columna ficha_tecnica_url en el override editorial de productos.
--    Sólo en `storefront_product_overrides`; las categorías no llevan
--    ficha técnica adjunta (se decidió en este sprint para no inflar
--    el modelo: si en el futuro hace falta, se agrega allí también).
ALTER TABLE public.storefront_product_overrides
  ADD COLUMN IF NOT EXISTS ficha_tecnica_url TEXT;

COMMENT ON COLUMN public.storefront_product_overrides.ficha_tecnica_url IS
  'URL pública (bucket storefronts) del PDF con la ficha técnica del producto, opcional.';
