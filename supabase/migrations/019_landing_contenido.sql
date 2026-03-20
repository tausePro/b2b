-- Tabla para CMS del landing page imprima.com.co
CREATE TABLE IF NOT EXISTS public.landing_contenido (
  id TEXT PRIMARY KEY,                    -- 'hero', 'servicios', 'categorias', 'eficiencia', 'testimonios', 'cta', 'footer'
  titulo TEXT,
  subtitulo TEXT,
  contenido JSONB DEFAULT '{}',           -- items de servicios, testimonios, categorías, etc.
  imagen_url TEXT,
  orden INT DEFAULT 0,
  activo BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS: lectura pública, escritura solo admin
ALTER TABLE public.landing_contenido ENABLE ROW LEVEL SECURITY;

CREATE POLICY "landing_contenido_lectura_publica"
  ON public.landing_contenido
  FOR SELECT
  USING (true);

CREATE POLICY "landing_contenido_escritura_admin"
  ON public.landing_contenido
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios
      WHERE usuarios.auth_id = auth.uid()
        AND usuarios.rol IN ('super_admin', 'direccion')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuarios
      WHERE usuarios.auth_id = auth.uid()
        AND usuarios.rol IN ('super_admin', 'direccion')
    )
  );

-- Seed inicial con estructura del prototipo 2
INSERT INTO public.landing_contenido (id, titulo, subtitulo, contenido, imagen_url, orden, activo) VALUES
(
  'hero',
  'Simplificamos las compras de tu empresa',
  'Soluciones integrales de suministros para su compañía con tecnología de vanguardia. Eficiencia, control y ahorro en un solo lugar.',
  '{"badge": "Soluciones Corporativas 2025", "cta_primario": "Ver Catálogo de Productos", "cta_secundario": "Hablar con un Asesor", "cta_primario_url": "/login", "cta_secundario_url": "/contacto"}'::jsonb,
  NULL,
  1,
  true
),
(
  'categorias',
  'Nuestras Categorías',
  'Todo lo que su empresa necesita para operar al 100%.',
  '{"items": [
    {"titulo": "Papelería y Oficina", "descripcion": "Todo para su escritorio y productividad.", "icono": "edit_note", "imagen_url": null},
    {"titulo": "Aseo y Desinfección", "descripcion": "Ambientes limpios, seguros y certificados.", "icono": "sanitizer", "imagen_url": null},
    {"titulo": "Cafetería y Snacks", "descripcion": "Insumos de alta calidad para su equipo.", "icono": "coffee", "imagen_url": null},
    {"titulo": "Productos Personalizados", "descripcion": "Marca propia, dotación y merchandising.", "icono": "loyalty", "imagen_url": null}
  ], "cta_texto": "Ver todo el catálogo", "cta_url": "/login"}'::jsonb,
  NULL,
  2,
  true
),
(
  'eficiencia',
  'Eficiencia Operativa en Suministros',
  'Nuestra plataforma se integra perfectamente con su flujo de trabajo corporativo. Olvídese de los procesos manuales y tome el control total de sus suministros con datos precisos en tiempo real.',
  '{"items": [
    {"titulo": "Automatización", "descripcion": "Sincronización directa de pedidos y facturación corporativa.", "icono": "sync"},
    {"titulo": "Control de Gastos", "descripcion": "Visibilidad total de consumos por centro de costo.", "icono": "analytics"},
    {"titulo": "Soporte Dedicado", "descripcion": "Atención personalizada y técnica para empresas.", "icono": "live_help"}
  ]}'::jsonb,
  NULL,
  3,
  true
),
(
  'clientes',
  'Empresas que confían en nosotros',
  NULL,
  '{"logos": []}'::jsonb,
  NULL,
  4,
  true
),
(
  'testimonios',
  'Voces de Confianza',
  'Descubra por qué los líderes de compras en Colombia eligen nuestra plataforma para su operación diaria.',
  '{"items": [
    {"nombre": "Ana María Restrepo", "cargo": "Gerente de Compras", "empresa": "TechCorp", "texto": "La gestión por sedes cambió por completo nuestra logística. Ahora cada oficina pide lo que necesita bajo un presupuesto controlado.", "estrellas": 5},
    {"nombre": "Carlos Eduardo Gómez", "cargo": "Director Administrativo", "empresa": "Servicob", "texto": "El catálogo autorizado nos asegura que el logo y los colores corporativos sean exactos en cada impresión, sin importar la ciudad.", "estrellas": 5},
    {"nombre": "Patricia Vélez", "cargo": "Jefa de Suministros", "empresa": "Insercol", "texto": "Poder ver el gasto en tiempo real nos ha permitido optimizar recursos y reducir desperdicios en un 15% durante el primer semestre.", "estrellas": 5}
  ]}'::jsonb,
  NULL,
  5,
  true
),
(
  'cta',
  '¿Listo para optimizar sus suministros?',
  'Únase a cientos de empresas que ya automatizaron su gestión de insumos con Imprima.',
  '{"cta_primario": "Crear Cuenta Corporativa", "cta_secundario": "Hablar con un Consultor", "cta_primario_url": "/login", "cta_secundario_url": "/contacto"}'::jsonb,
  NULL,
  6,
  true
),
(
  'footer',
  'Imprima',
  'Líderes en soluciones integrales de suministros para el sector corporativo en Colombia. Tecnología y logística al servicio de su empresa.',
  '{"columnas": [
    {"titulo": "Compañía", "links": [
      {"texto": "Sobre Nosotros", "url": "/nosotros"},
      {"texto": "Nuestros Clientes", "url": "/clientes"},
      {"texto": "Trabaja con nosotros", "url": "/contacto"}
    ]},
    {"titulo": "Soporte", "links": [
      {"texto": "Centro de Ayuda", "url": "/soporte"},
      {"texto": "Contacto Ventas", "url": "/contacto"},
      {"texto": "Preguntas Frecuentes", "url": "/faq"}
    ]}
  ], "redes_sociales": [], "copyright": "© 2025 Imprima S.A.S. Todos los derechos reservados."}'::jsonb,
  NULL,
  7,
  true
)
ON CONFLICT (id) DO NOTHING;
