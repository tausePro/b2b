-- ============================================================
-- Migración 020: CMS — SEO, páginas informativas, bucket imágenes
-- SEGURA: solo INSERT y CREATE, todos con ON CONFLICT DO NOTHING
-- No hay ALTER, DROP ni cambios destructivos
-- ============================================================

-- 1. Bucket de Storage para imágenes del landing (logo, hero, categorías, logos clientes)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'landing',
  'landing',
  true,
  5242880, -- 5 MB
  ARRAY['image/jpeg', 'image/png', 'image/svg+xml', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- 2. Políticas de Storage: lectura pública, escritura admin
CREATE POLICY "landing_storage_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'landing');

CREATE POLICY "landing_storage_admin_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'landing' AND
    EXISTS (
      SELECT 1 FROM public.usuarios
      WHERE usuarios.auth_id = auth.uid()
        AND usuarios.rol IN ('super_admin', 'direccion')
    )
  );

CREATE POLICY "landing_storage_admin_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'landing' AND
    EXISTS (
      SELECT 1 FROM public.usuarios
      WHERE usuarios.auth_id = auth.uid()
        AND usuarios.rol IN ('super_admin', 'direccion')
    )
  );

CREATE POLICY "landing_storage_admin_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'landing' AND
    EXISTS (
      SELECT 1 FROM public.usuarios
      WHERE usuarios.auth_id = auth.uid()
        AND usuarios.rol IN ('super_admin', 'direccion')
    )
  );

-- 3. Fila de configuración SEO / Schema / AEO / GEO
INSERT INTO public.landing_contenido (id, titulo, subtitulo, contenido, imagen_url, orden, activo) VALUES
(
  'seo',
  'Imprima | Suministros Corporativos B2B',
  'Soluciones integrales de suministros para el sector corporativo en Colombia. Eficiencia, control y ahorro en un solo lugar.',
  '{
    "og_title": "Imprima | Suministros Corporativos B2B",
    "og_description": "Soluciones integrales de suministros para el sector corporativo en Colombia.",
    "og_image": null,
    "canonical_url": "https://imprima.com.co",
    "robots": "index, follow",
    "organization": {
      "name": "Imprima S.A.S",
      "url": "https://imprima.com.co",
      "logo": null,
      "telephone": "",
      "email": "",
      "address": {
        "streetAddress": "",
        "addressLocality": "",
        "addressRegion": "",
        "postalCode": "",
        "addressCountry": "CO"
      }
    },
    "social_profiles": [],
    "faqs": []
  }'::jsonb,
  NULL,
  0,
  true
)
ON CONFLICT (id) DO NOTHING;

-- 4. Páginas informativas
INSERT INTO public.landing_contenido (id, titulo, subtitulo, contenido, imagen_url, orden, activo) VALUES
(
  'pagina_nosotros',
  'Sobre Nosotros',
  'Conozca nuestra historia y misión.',
  '{"cuerpo": "", "mision": "", "vision": "", "valores": []}'::jsonb,
  NULL,
  10,
  true
),
(
  'pagina_contacto',
  'Contacto',
  'Estamos aquí para ayudarle.',
  '{"telefono": "", "email": "", "direccion": "", "ciudad": "", "horario": "", "mapa_url": "", "formulario_activo": true}'::jsonb,
  NULL,
  11,
  true
),
(
  'pagina_faq',
  'Preguntas Frecuentes',
  'Encuentre respuestas a las dudas más comunes.',
  '{"items": []}'::jsonb,
  NULL,
  12,
  true
),
(
  'pagina_terminos',
  'Términos y Condiciones',
  NULL,
  '{"cuerpo": ""}'::jsonb,
  NULL,
  13,
  true
),
(
  'pagina_privacidad',
  'Política de Privacidad',
  NULL,
  '{"cuerpo": ""}'::jsonb,
  NULL,
  14,
  true
)
ON CONFLICT (id) DO NOTHING;
