-- 035_landing_contenido_comerciales.sql
--
-- Inserta la seccion `contacto_comerciales` en landing_contenido para
-- administrar el equipo comercial que se muestra en la pagina publica
-- /contacto como grilla de tarjetas (foto, nombre, cargo, telefono,
-- email, mensaje de WhatsApp pre-llenado).
--
-- Modelo:
--   titulo        → encabezado de la seccion en /contacto
--   subtitulo     → copy secundario
--   activo        → si false, /contacto no renderiza la grilla
--   contenido.comerciales: JSONB[]
--     Cada item: {
--       id: string (slug estable; se usa en la fuente del lead como
--                   `contacto_comercial_<id>` para trazabilidad por persona),
--       nombre: string,
--       cargo: string,
--       foto_url: string | null,
--       telefono: string,                -- formato libre; se sanitiza en front
--       email: string,
--       mensaje_prefill: string          -- prellena el textarea del modal
--     }
--
-- Idempotente: si la fila ya existe no se modifica.

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
  'contacto_comerciales',
  'Nuestro equipo comercial',
  'Contáctate directamente con la asesora que pueda resolver tu necesidad.',
  jsonb_build_object(
    'comerciales', jsonb_build_array()
  ),
  NULL,
  110,
  true,
  NOW()
)
ON CONFLICT (id) DO NOTHING;
