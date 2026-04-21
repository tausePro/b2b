-- 032_landing_contenido_catalogo_banner.sql
--
-- Inserta la sección 'catalogo_banner' en landing_contenido como fila editable
-- desde el CMS. Es el banner que se muestra en la vista pública /catalogo
-- cuando no hay categoría ni búsqueda activa (estado "browse").
--
-- Modelo:
--   titulo      → headline principal del banner
--   subtitulo   → copy secundario
--   imagen_url  → imagen de fondo (recomendado ratio 3:1 o 21:9)
--   contenido   → { cta_texto, cta_url } opcionales
--   activo      → si false, /catalogo cae al hero de texto por defecto
--
-- Idempotente: si la fila ya existe no se modifica (preserva edits del admin).

INSERT INTO landing_contenido (
  id,
  titulo,
  subtitulo,
  contenido,
  imagen_url,
  orden,
  activo,
  updated_at
) VALUES (
  'catalogo_banner',
  'Portafolio Imprima',
  'Explore todo el catálogo por categorías reales o búsquelo al instante',
  jsonb_build_object('cta_texto', '', 'cta_url', ''),
  NULL,
  100,
  true,
  NOW()
)
ON CONFLICT (id) DO NOTHING;
