-- 033_landing_contenido_catalogo_banner_prefill.sql
--
-- Agrega la llave `mensaje_prefill` al jsonb `contenido` de la fila
-- 'catalogo_banner' en `landing_contenido`. Este campo se usa para
-- prellenar el textarea del modal de leads cuando el visitante abre el
-- CTA del banner en /catalogo, y se propaga al WhatsApp final (mismo
-- flujo que los demás LeadButton del sitio).
--
-- `cta_url` queda en el jsonb por compatibilidad pero ya no se renderiza
-- en PublicCatalogClient (el CTA siempre abre el modal de leads).
--
-- Idempotente:
--   - Si la fila no existe → no hace nada (la 032 ya debería haberla creado).
--   - Si mensaje_prefill ya existe → lo preserva (no sobreescribe edits del admin).
--   - Si mensaje_prefill falta → lo inserta con el default recomendado.

UPDATE landing_contenido
SET
  contenido = contenido || jsonb_build_object(
    'mensaje_prefill',
    'Quiero solicitar una cotización para mi empresa'
  ),
  updated_at = NOW()
WHERE id = 'catalogo_banner'
  AND (contenido ? 'mensaje_prefill') IS NOT TRUE;
