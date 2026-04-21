-- 034_landing_hero_stats_chips.sql
--
-- Extiende la seccion `hero` de landing_contenido con nuevos campos
-- editables desde CMS para el rediseño del banner del home:
--
--   contenido.stats_items          JSONB[] — barra de indicadores de confianza
--     Cada item: { label: string, valor: string, suffix?: string, dinamico?: string }
--     `dinamico` permite que el front lo reemplace por un conteo real
--     (ej: 'productos_total' → count productos publicos). Si dinamico es
--     string vacio/null, se usa `valor` tal cual.
--
--   contenido.chips_items          JSONB[] — chips de propuesta de valor
--     Cada item: { texto: string, icono?: string }
--
--   contenido.glass_card_titulo    string — texto destacado en la card glass
--     que flota sobre la imagen del hero (ej: "+500 empresas confian").
--   contenido.glass_card_subtitulo string — linea secundaria de la card.
--
-- Idempotente: solo agrega las llaves que no existan en el JSONB. No
-- sobreescribe configuracion manual ya cargada por el admin.

UPDATE landing_contenido
SET
  contenido = contenido
    || (CASE WHEN contenido ? 'stats_items' THEN '{}'::jsonb
             ELSE jsonb_build_object('stats_items', jsonb_build_array(
               jsonb_build_object('label', 'Empresas atendidas', 'valor', '500', 'suffix', '+', 'dinamico', ''),
               jsonb_build_object('label', 'Productos',          'valor', '',    'suffix', '+', 'dinamico', 'productos_total'),
               jsonb_build_object('label', 'Años de experiencia','valor', '10',  'suffix', '+', 'dinamico', ''),
               jsonb_build_object('label', 'Entrega en Bogotá',  'valor', '24h', 'suffix', '',  'dinamico', '')
             )) END)
    || (CASE WHEN contenido ? 'chips_items' THEN '{}'::jsonb
             ELSE jsonb_build_object('chips_items', jsonb_build_array(
               jsonb_build_object('texto', 'Crédito empresarial'),
               jsonb_build_object('texto', 'Asesor dedicado'),
               jsonb_build_object('texto', 'Facturación electrónica'),
               jsonb_build_object('texto', 'Pedidos recurrentes')
             )) END)
    || (CASE WHEN contenido ? 'glass_card_titulo' THEN '{}'::jsonb
             ELSE jsonb_build_object('glass_card_titulo', '+500 empresas confían') END)
    || (CASE WHEN contenido ? 'glass_card_subtitulo' THEN '{}'::jsonb
             ELSE jsonb_build_object('glass_card_subtitulo', 'en nuestro modelo B2B') END),
  updated_at = NOW()
WHERE id = 'hero';
