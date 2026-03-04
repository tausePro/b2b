-- ============================================
-- Imprima B2B - Esquema Multitenant
-- Base de datos compartida con aislamiento lógico
-- mediante empresa_id + Row Level Security (RLS)
-- Ejecutar en Supabase SQL Editor
-- ============================================

-- ============================================
-- 1. Estructura Corporativa (Tenant = Empresa)
-- ============================================

-- Empresas (refleja res.partner de Odoo donde is_company = True)
-- Esta es la entidad TENANT principal del sistema.
CREATE TABLE public.empresas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  odoo_partner_id BIGINT NOT NULL UNIQUE,
  odoo_comercial_id INTEGER,
  odoo_comercial_nombre TEXT,
  nombre TEXT NOT NULL,
  nit TEXT UNIQUE,
  presupuesto_global_mensual NUMERIC(14,2),
  requiere_aprobacion BOOLEAN NOT NULL DEFAULT true,
  usa_sedes BOOLEAN NOT NULL DEFAULT true,
  config_aprobacion JSONB DEFAULT '{"niveles": 1, "monto_auto_aprobacion": null}'::jsonb,
  activa BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.empresas IS 'Entidad TENANT principal. Cada empresa cliente es un tenant aislado.';
COMMENT ON COLUMN public.empresas.odoo_comercial_id IS 'ID del comercial (res.users) asignado en Odoo al partner matriz.';
COMMENT ON COLUMN public.empresas.odoo_comercial_nombre IS 'Nombre del comercial asignado en Odoo al momento de la importación/sincronización.';
COMMENT ON COLUMN public.empresas.requiere_aprobacion IS 'Si es false, los pedidos se crean directamente como aprobados (sin pasar por aprobador).';
COMMENT ON COLUMN public.empresas.usa_sedes IS 'Si es false, la empresa puede operar sin sedes y los pedidos no requieren sede_id.';
COMMENT ON COLUMN public.empresas.config_aprobacion IS 'Define niveles de aprobación, montos de auto-aprobación, etc.';

-- Configuración visual y funcional por empresa (personalización multitenant)
CREATE TABLE public.empresa_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL UNIQUE REFERENCES public.empresas(id) ON DELETE CASCADE,
  slug TEXT UNIQUE,
  logo_url TEXT,
  color_primario TEXT DEFAULT '#9CBB06',
  color_secundario TEXT,
  modulos_activos JSONB DEFAULT '{"presupuestos": true, "aprobaciones": true, "trazabilidad": true}'::jsonb,
  configuracion_extra JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.empresa_configs IS 'Personalización por tenant: branding, módulos activos, URLs personalizadas.';
COMMENT ON COLUMN public.empresa_configs.slug IS 'URL personalizada: imprima.com.co/{slug}';
COMMENT ON COLUMN public.empresa_configs.modulos_activos IS 'Activa/desactiva funciones según contrato: presupuestos, aprobaciones, trazabilidad, etc.';

-- Sedes (refleja direcciones de envío o contactos hijos en Odoo)
CREATE TABLE public.sedes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  odoo_address_id INTEGER,
  nombre_sede TEXT NOT NULL,
  direccion TEXT,
  ciudad TEXT,
  contacto_nombre TEXT,
  contacto_telefono TEXT,
  presupuesto_asignado NUMERIC(14,2) NOT NULL DEFAULT 0,
  presupuesto_alerta_threshold INTEGER NOT NULL DEFAULT 90,
  activa BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON COLUMN public.sedes.presupuesto_alerta_threshold IS 'Porcentaje para avisar cuando esté cerca del límite (ej: 90)';

-- ============================================
-- 2. Usuarios (perfil extendido vinculado a auth.users)
-- ============================================
-- Roles del CLIENTE: comprador, aprobador (empresa_id NOT NULL)
-- Roles de IMPRIMA: asesor, direccion (empresa_id NULL, acceso multi-empresa)
-- Super Admin: super_admin (empresa_id NULL, acceso TOTAL, gestiona toda la plataforma)

CREATE TABLE public.usuarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  odoo_user_id INTEGER,
  email TEXT NOT NULL,
  nombre TEXT NOT NULL,
  apellido TEXT NOT NULL,
  rol TEXT NOT NULL CHECK (rol IN ('super_admin', 'comprador', 'aprobador', 'asesor', 'direccion')),
  empresa_id UUID REFERENCES public.empresas(id),
  sede_id UUID REFERENCES public.sedes(id),
  avatar TEXT,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  -- Roles cliente DEBEN tener empresa_id
  CONSTRAINT chk_empresa_requerida CHECK (
    CASE WHEN rol IN ('comprador', 'aprobador') THEN empresa_id IS NOT NULL
         ELSE true
    END
  )
);

COMMENT ON TABLE public.usuarios IS 'Roles cliente (comprador/aprobador) tienen empresa_id obligatorio. Roles Imprima (super_admin/asesor/direccion) tienen empresa_id NULL.';
COMMENT ON COLUMN public.usuarios.odoo_user_id IS 'ID de res.users en Odoo para mapear asesores locales con comerciales del ERP.';

-- ============================================
-- 2b. Asignación Asesor → Empresas
-- Un asesor Imprima puede gestionar múltiples empresas.
-- Esto controla qué datos puede ver cada asesor.
-- ============================================

CREATE TABLE public.asesor_empresas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(usuario_id, empresa_id)
);

COMMENT ON TABLE public.asesor_empresas IS 'Tabla de asignación: qué empresas puede gestionar cada asesor Imprima.';

-- ============================================
-- 3. Productos Autorizados (Listas Blancas por Empresa)
-- ============================================

CREATE TABLE public.productos_autorizados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  odoo_product_id INTEGER NOT NULL,
  categoria TEXT NOT NULL CHECK (categoria IN ('aseo', 'papeleria', 'cafeteria', 'personalizados')),
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(empresa_id, odoo_product_id)
);

COMMENT ON TABLE public.productos_autorizados IS 'Lista blanca de productos por empresa. Los detalles del producto se obtienen de Odoo.';

-- ============================================
-- 4. Control de Presupuestos (Ciclos Mensuales)
-- Aislado por sede → empresa (cadena de tenant)
-- ============================================

CREATE TABLE public.presupuestos_mensuales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sede_id UUID NOT NULL REFERENCES public.sedes(id) ON DELETE CASCADE,
  mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  anio INTEGER NOT NULL,
  monto_inicial NUMERIC(14,2) NOT NULL DEFAULT 0,
  monto_consumido NUMERIC(14,2) NOT NULL DEFAULT 0,
  monto_disponible NUMERIC(14,2) GENERATED ALWAYS AS (monto_inicial - monto_consumido) STORED,
  estado TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'cerrado', 'excedido')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(sede_id, mes, anio)
);

COMMENT ON COLUMN public.presupuestos_mensuales.monto_disponible IS 'Calculado automáticamente: monto_inicial - monto_consumido';

-- ============================================
-- 5. Gestión de Pedidos y Trazabilidad
-- empresa_id NOT NULL en pedidos = aislamiento directo
-- ============================================

CREATE TABLE public.pedidos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero TEXT NOT NULL UNIQUE,
  odoo_sale_order_id INTEGER,
  empresa_id UUID NOT NULL REFERENCES public.empresas(id),
  sede_id UUID REFERENCES public.sedes(id),
  usuario_creador_id UUID NOT NULL REFERENCES public.usuarios(id),
  estado TEXT NOT NULL DEFAULT 'en_aprobacion' CHECK (estado IN (
    'borrador',
    'en_aprobacion',
    'aprobado',
    'rechazado',
    'en_validacion_imprima',
    'procesado_odoo'
  )),
  valor_total_cop NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_items INTEGER NOT NULL DEFAULT 0,
  comentarios_sede TEXT,
  comentarios_aprobador TEXT,
  excede_presupuesto BOOLEAN DEFAULT false,
  justificacion_exceso TEXT,
  aprobado_por UUID REFERENCES public.usuarios(id),
  fecha_aprobacion TIMESTAMPTZ,
  validado_por UUID REFERENCES public.usuarios(id),
  fecha_validacion TIMESTAMPTZ,
  fecha_creacion TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON COLUMN public.pedidos.odoo_sale_order_id IS 'Null hasta que se cree la sale.order en Odoo';
COMMENT ON COLUMN public.pedidos.valor_total_cop IS 'Solo visible para roles Aprobador/Asesor/Dirección';
COMMENT ON COLUMN public.pedidos.excede_presupuesto IS 'True si el pedido supera el monto_disponible de la sede';
COMMENT ON COLUMN public.pedidos.justificacion_exceso IS 'Justificación del Gerente si autoriza un pedido que excede presupuesto';

-- Items del pedido
CREATE TABLE public.pedido_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id UUID NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  odoo_product_id INTEGER NOT NULL,
  nombre_producto TEXT NOT NULL,
  cantidad INTEGER NOT NULL DEFAULT 1,
  precio_unitario_cop NUMERIC(12,2) NOT NULL DEFAULT 0,
  subtotal_cop NUMERIC(14,2) GENERATED ALWAYS AS (cantidad * precio_unitario_cop) STORED,
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON COLUMN public.pedido_items.precio_unitario_cop IS 'Capturado al momento del pedido desde Odoo';

-- Log de Trazabilidad
CREATE TABLE public.logs_trazabilidad (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id UUID NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  accion TEXT NOT NULL,
  descripcion TEXT,
  usuario_id UUID NOT NULL REFERENCES public.usuarios(id),
  usuario_nombre TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- Índices
-- ============================================
CREATE INDEX idx_usuarios_auth_id ON public.usuarios(auth_id);
CREATE INDEX idx_usuarios_empresa ON public.usuarios(empresa_id);
CREATE INDEX idx_usuarios_rol ON public.usuarios(rol);
CREATE UNIQUE INDEX idx_usuarios_asesor_odoo_user_unique ON public.usuarios(odoo_user_id)
  WHERE rol = 'asesor' AND odoo_user_id IS NOT NULL;
CREATE INDEX idx_sedes_empresa ON public.sedes(empresa_id);
CREATE INDEX idx_sedes_odoo ON public.sedes(odoo_address_id);
CREATE INDEX idx_empresa_configs_slug ON public.empresa_configs(slug);
CREATE INDEX idx_asesor_empresas_usuario ON public.asesor_empresas(usuario_id);
CREATE INDEX idx_asesor_empresas_empresa ON public.asesor_empresas(empresa_id);
CREATE INDEX idx_productos_auth_empresa ON public.productos_autorizados(empresa_id);
CREATE INDEX idx_productos_auth_odoo ON public.productos_autorizados(odoo_product_id);
CREATE INDEX idx_presupuestos_sede ON public.presupuestos_mensuales(sede_id);
CREATE INDEX idx_presupuestos_periodo ON public.presupuestos_mensuales(anio, mes);
CREATE INDEX idx_pedidos_empresa ON public.pedidos(empresa_id);
CREATE INDEX idx_pedidos_sede ON public.pedidos(sede_id);
CREATE INDEX idx_pedidos_estado ON public.pedidos(estado);
CREATE INDEX idx_pedidos_creador ON public.pedidos(usuario_creador_id);
CREATE INDEX idx_pedidos_odoo ON public.pedidos(odoo_sale_order_id);
CREATE INDEX idx_pedido_items_pedido ON public.pedido_items(pedido_id);
CREATE INDEX idx_logs_pedido ON public.logs_trazabilidad(pedido_id);

-- ============================================
-- Funciones Helper para RLS Multitenant
-- Se crean DESPUÉS de las tablas para evitar errores de referencia.
-- ============================================

-- Función RPC para obtener el perfil completo del usuario autenticado
-- BYPASEA RLS porque es SECURITY DEFINER. Se usa desde el AuthContext.
CREATE OR REPLACE FUNCTION public.get_mi_perfil()
RETURNS JSON AS $$
DECLARE
  v_result JSON;
BEGIN
  SELECT row_to_json(u) INTO v_result FROM (
    SELECT id, auth_id, email, nombre, apellido, rol, empresa_id, sede_id, avatar, activo, created_at
    FROM public.usuarios
    WHERE auth_id = auth.uid()
    LIMIT 1
  ) u;
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Obtiene el empresa_id del usuario autenticado
CREATE OR REPLACE FUNCTION public.get_mi_empresa_id()
RETURNS UUID AS $$
DECLARE
  v_empresa_id UUID;
BEGIN
  SELECT empresa_id INTO v_empresa_id FROM public.usuarios WHERE auth_id = auth.uid();
  RETURN v_empresa_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Obtiene el rol del usuario autenticado
CREATE OR REPLACE FUNCTION public.get_mi_rol()
RETURNS TEXT AS $$
DECLARE
  v_rol TEXT;
BEGIN
  SELECT rol INTO v_rol FROM public.usuarios WHERE auth_id = auth.uid();
  RETURN v_rol;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Obtiene el id interno del usuario autenticado
CREATE OR REPLACE FUNCTION public.get_mi_usuario_id()
RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  SELECT id INTO v_id FROM public.usuarios WHERE auth_id = auth.uid();
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Verifica si el usuario Imprima (asesor/direccion) tiene acceso a una empresa
CREATE OR REPLACE FUNCTION public.tiene_acceso_empresa(p_empresa_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_rol TEXT;
  v_usuario_id UUID;
BEGIN
  SELECT id, rol INTO v_usuario_id, v_rol
  FROM public.usuarios WHERE auth_id = auth.uid();

  -- Super Admin y Dirección Imprima: acceso global a todas las empresas
  IF v_rol IN ('super_admin', 'direccion') THEN
    RETURN true;
  END IF;

  -- Asesor Imprima: solo empresas asignadas
  IF v_rol = 'asesor' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.asesor_empresas
      WHERE usuario_id = v_usuario_id
        AND empresa_id = p_empresa_id
        AND activo = true
    );
  END IF;

  -- Roles cliente (comprador/aprobador): solo su propia empresa
  RETURN p_empresa_id = public.get_mi_empresa_id();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================
-- RLS (Row Level Security) - MULTITENANT
-- ============================================
-- Principio: La BD NUNCA confía en el código del frontend.
-- Cada tabla filtra automáticamente por empresa_id del usuario.
-- Roles Imprima (asesor/direccion) tienen políticas especiales.
-- ============================================

ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empresa_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sedes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asesor_empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.productos_autorizados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.presupuestos_mensuales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedido_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logs_trazabilidad ENABLE ROW LEVEL SECURITY;

-- ============================================
-- EMPRESAS: Cada quien ve solo su empresa.
-- Dirección ve todas. Asesor ve las asignadas.
-- ============================================
CREATE POLICY "empresas_select" ON public.empresas
  FOR SELECT TO authenticated
  USING (public.tiene_acceso_empresa(id));

-- Super Admin: CRUD completo en empresas
CREATE POLICY "empresas_insert_admin" ON public.empresas
  FOR INSERT TO authenticated
  WITH CHECK (public.get_mi_rol() = 'super_admin');

CREATE POLICY "empresas_update_admin" ON public.empresas
  FOR UPDATE TO authenticated
  USING (public.get_mi_rol() = 'super_admin')
  WITH CHECK (public.get_mi_rol() = 'super_admin');

CREATE POLICY "empresas_delete_admin" ON public.empresas
  FOR DELETE TO authenticated
  USING (public.get_mi_rol() = 'super_admin');

-- ============================================
-- EMPRESA_CONFIGS: Misma lógica que empresas
-- ============================================
CREATE POLICY "empresa_configs_select" ON public.empresa_configs
  FOR SELECT TO authenticated
  USING (public.tiene_acceso_empresa(empresa_id));

CREATE POLICY "empresa_configs_insert_admin" ON public.empresa_configs
  FOR INSERT TO authenticated
  WITH CHECK (public.get_mi_rol() = 'super_admin');

CREATE POLICY "empresa_configs_update_admin" ON public.empresa_configs
  FOR UPDATE TO authenticated
  USING (public.get_mi_rol() = 'super_admin')
  WITH CHECK (public.get_mi_rol() = 'super_admin');

CREATE POLICY "empresa_configs_delete_admin" ON public.empresa_configs
  FOR DELETE TO authenticated
  USING (public.get_mi_rol() = 'super_admin');

-- ============================================
-- SEDES: Solo sedes de empresas a las que tengo acceso
-- ============================================
CREATE POLICY "sedes_select" ON public.sedes
  FOR SELECT TO authenticated
  USING (public.tiene_acceso_empresa(empresa_id));

CREATE POLICY "sedes_insert_admin" ON public.sedes
  FOR INSERT TO authenticated
  WITH CHECK (public.get_mi_rol() = 'super_admin');

CREATE POLICY "sedes_update_admin" ON public.sedes
  FOR UPDATE TO authenticated
  USING (public.get_mi_rol() = 'super_admin')
  WITH CHECK (public.get_mi_rol() = 'super_admin');

CREATE POLICY "sedes_delete_admin" ON public.sedes
  FOR DELETE TO authenticated
  USING (public.get_mi_rol() = 'super_admin');

-- ============================================
-- USUARIOS: Cada quien ve usuarios de su empresa.
-- Asesor/Dirección ven usuarios de empresas asignadas.
-- Todos pueden ver su propio perfil.
-- ============================================
-- Las funciones helper (get_mi_rol, get_mi_empresa_id, get_mi_usuario_id) son
-- SECURITY DEFINER plpgsql, por lo que bypasean RLS y no causan recursión.
CREATE POLICY "usuarios_select" ON public.usuarios
  FOR SELECT TO authenticated
  USING (
    auth_id = auth.uid()
    OR public.get_mi_rol() IN ('super_admin', 'direccion')
    OR (
      empresa_id IS NOT NULL
      AND empresa_id = public.get_mi_empresa_id()
    )
    OR (
      empresa_id IS NOT NULL
      AND public.get_mi_rol() = 'asesor'
      AND EXISTS (
        SELECT 1 FROM public.asesor_empresas ae
        WHERE ae.usuario_id = public.get_mi_usuario_id()
          AND ae.empresa_id = usuarios.empresa_id
          AND ae.activo = true
      )
    )
  );

CREATE POLICY "usuarios_insert_admin" ON public.usuarios
  FOR INSERT TO authenticated
  WITH CHECK (public.get_mi_rol() = 'super_admin');

CREATE POLICY "usuarios_update_admin" ON public.usuarios
  FOR UPDATE TO authenticated
  USING (public.get_mi_rol() = 'super_admin')
  WITH CHECK (public.get_mi_rol() = 'super_admin');

CREATE POLICY "usuarios_delete_admin" ON public.usuarios
  FOR DELETE TO authenticated
  USING (public.get_mi_rol() = 'super_admin');

-- ============================================
-- ASESOR_EMPRESAS: Solo el propio asesor o dirección
-- ============================================
CREATE POLICY "asesor_empresas_select" ON public.asesor_empresas
  FOR SELECT TO authenticated
  USING (
    usuario_id = public.get_mi_usuario_id()
    OR public.get_mi_rol() IN ('super_admin', 'direccion')
  );

CREATE POLICY "asesor_empresas_insert_admin" ON public.asesor_empresas
  FOR INSERT TO authenticated
  WITH CHECK (public.get_mi_rol() = 'super_admin');

CREATE POLICY "asesor_empresas_update_admin" ON public.asesor_empresas
  FOR UPDATE TO authenticated
  USING (public.get_mi_rol() = 'super_admin')
  WITH CHECK (public.get_mi_rol() = 'super_admin');

CREATE POLICY "asesor_empresas_delete_admin" ON public.asesor_empresas
  FOR DELETE TO authenticated
  USING (public.get_mi_rol() = 'super_admin');

-- ============================================
-- PRODUCTOS_AUTORIZADOS: Solo productos de mi empresa
-- Asesor/Dirección ven productos de empresas asignadas
-- ============================================
CREATE POLICY "productos_auth_select" ON public.productos_autorizados
  FOR SELECT TO authenticated
  USING (
    activo = true
    AND public.tiene_acceso_empresa(empresa_id)
  );

CREATE POLICY "productos_auth_insert_admin" ON public.productos_autorizados
  FOR INSERT TO authenticated
  WITH CHECK (public.get_mi_rol() = 'super_admin');

CREATE POLICY "productos_auth_update_admin" ON public.productos_autorizados
  FOR UPDATE TO authenticated
  USING (public.get_mi_rol() = 'super_admin')
  WITH CHECK (public.get_mi_rol() = 'super_admin');

CREATE POLICY "productos_auth_delete_admin" ON public.productos_autorizados
  FOR DELETE TO authenticated
  USING (public.get_mi_rol() = 'super_admin');

-- ============================================
-- PRESUPUESTOS_MENSUALES: Via sede → empresa
-- ============================================
CREATE POLICY "presupuestos_select" ON public.presupuestos_mensuales
  FOR SELECT TO authenticated
  USING (
    public.tiene_acceso_empresa(
      (SELECT s.empresa_id FROM public.sedes s WHERE s.id = sede_id)
    )
  );

CREATE POLICY "presupuestos_update" ON public.presupuestos_mensuales
  FOR UPDATE TO authenticated
  USING (
    public.tiene_acceso_empresa(
      (SELECT s.empresa_id FROM public.sedes s WHERE s.id = sede_id)
    )
  )
  WITH CHECK (
    public.tiene_acceso_empresa(
      (SELECT s.empresa_id FROM public.sedes s WHERE s.id = sede_id)
    )
  );

CREATE POLICY "presupuestos_insert_admin" ON public.presupuestos_mensuales
  FOR INSERT TO authenticated
  WITH CHECK (public.get_mi_rol() = 'super_admin');

CREATE POLICY "presupuestos_delete_admin" ON public.presupuestos_mensuales
  FOR DELETE TO authenticated
  USING (public.get_mi_rol() = 'super_admin');

-- ============================================
-- PEDIDOS: Aislamiento directo por empresa_id
-- Comprador: solo sus propios pedidos
-- Aprobador: todos los de su empresa
-- Asesor: empresas asignadas
-- Dirección: todos
-- ============================================
CREATE POLICY "pedidos_select" ON public.pedidos
  FOR SELECT TO authenticated
  USING (
    CASE public.get_mi_rol()
      WHEN 'comprador' THEN
        usuario_creador_id = public.get_mi_usuario_id()
      ELSE
        public.tiene_acceso_empresa(empresa_id)
    END
  );

CREATE POLICY "pedidos_insert" ON public.pedidos
  FOR INSERT TO authenticated
  WITH CHECK (
    -- Solo puede crear pedidos en su propia empresa
    empresa_id = public.get_mi_empresa_id()
    AND usuario_creador_id = public.get_mi_usuario_id()
    AND (
      CASE
        WHEN COALESCE((SELECT e.usa_sedes FROM public.empresas e WHERE e.id = empresa_id), true) THEN
          EXISTS (
            SELECT 1
            FROM public.sedes s
            WHERE s.id = sede_id
              AND s.empresa_id = empresa_id
          )
        ELSE
          (
            sede_id IS NULL
            OR EXISTS (
              SELECT 1
              FROM public.sedes s
              WHERE s.id = sede_id
                AND s.empresa_id = empresa_id
            )
          )
      END
    )
  );

CREATE POLICY "pedidos_update" ON public.pedidos
  FOR UPDATE TO authenticated
  USING (
    public.tiene_acceso_empresa(empresa_id)
  )
  WITH CHECK (
    public.tiene_acceso_empresa(empresa_id)
  );

-- ============================================
-- PEDIDO_ITEMS: Hereda acceso del pedido padre
-- ============================================
CREATE POLICY "pedido_items_select" ON public.pedido_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.pedidos p
      WHERE p.id = pedido_id
      -- La política de pedidos ya filtra por empresa
    )
  );

CREATE POLICY "pedido_items_insert" ON public.pedido_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.pedidos p
      WHERE p.id = pedido_id
        AND p.empresa_id = public.get_mi_empresa_id()
        AND p.usuario_creador_id = public.get_mi_usuario_id()
    )
  );

-- ============================================
-- LOGS_TRAZABILIDAD: Hereda acceso del pedido padre
-- ============================================
CREATE POLICY "logs_select" ON public.logs_trazabilidad
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.pedidos p
      WHERE p.id = pedido_id
    )
  );

CREATE POLICY "logs_insert" ON public.logs_trazabilidad
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.pedidos p
      WHERE p.id = pedido_id
        AND public.tiene_acceso_empresa(p.empresa_id)
    )
  );

-- ============================================
-- Función: Estado inicial del pedido según empresa
-- ============================================
CREATE OR REPLACE FUNCTION public.set_estado_pedido_inicial()
RETURNS TRIGGER AS $$
DECLARE
  v_requiere_aprobacion BOOLEAN;
BEGIN
  SELECT e.requiere_aprobacion
  INTO v_requiere_aprobacion
  FROM public.empresas e
  WHERE e.id = NEW.empresa_id;

  IF COALESCE(v_requiere_aprobacion, true) THEN
    IF NEW.estado IS NULL OR NEW.estado = '' OR NEW.estado = 'borrador' THEN
      NEW.estado := 'en_aprobacion';
    END IF;
  ELSE
    NEW.estado := 'aprobado';
    NEW.fecha_aprobacion := COALESCE(NEW.fecha_aprobacion, now());
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_set_estado_pedido_inicial
  BEFORE INSERT ON public.pedidos
  FOR EACH ROW
  EXECUTE FUNCTION public.set_estado_pedido_inicial();

-- ============================================
-- Función: Generar número de pedido automático
-- ============================================
CREATE OR REPLACE FUNCTION public.generar_numero_pedido()
RETURNS TRIGGER AS $$
DECLARE
  next_num INTEGER;
  year_str TEXT;
BEGIN
  year_str := to_char(now(), 'YYYY');
  SELECT COALESCE(MAX(CAST(SPLIT_PART(numero, '-', 3) AS INTEGER)), 0) + 1
  INTO next_num
  FROM public.pedidos
  WHERE numero LIKE 'PED-' || year_str || '-%';

  NEW.numero := 'PED-' || year_str || '-' || LPAD(next_num::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_generar_numero_pedido
  BEFORE INSERT ON public.pedidos
  FOR EACH ROW
  WHEN (NEW.numero IS NULL OR NEW.numero = '')
  EXECUTE FUNCTION public.generar_numero_pedido();

-- ============================================
-- Función: updated_at automático
-- ============================================
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_updated_at_empresas BEFORE UPDATE ON public.empresas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER trigger_updated_at_empresa_configs BEFORE UPDATE ON public.empresa_configs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER trigger_updated_at_sedes BEFORE UPDATE ON public.sedes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER trigger_updated_at_usuarios BEFORE UPDATE ON public.usuarios FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER trigger_updated_at_pedidos BEFORE UPDATE ON public.pedidos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER trigger_updated_at_presupuestos BEFORE UPDATE ON public.presupuestos_mensuales FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================
-- Función: Descontar presupuesto al aprobar pedido
-- Si el pedido excede el disponible, marca excede_presupuesto = true
-- pero permite al Gerente autorizarlo con justificación.
-- ============================================
CREATE OR REPLACE FUNCTION public.descontar_presupuesto_al_aprobar()
RETURNS TRIGGER AS $$
DECLARE
  presupuesto_record RECORD;
  mes_actual INTEGER;
  anio_actual INTEGER;
BEGIN
  -- Solo actuar cuando el estado cambia a 'aprobado'
  IF NEW.estado = 'aprobado' AND OLD.estado != 'aprobado' THEN
    mes_actual := EXTRACT(MONTH FROM now());
    anio_actual := EXTRACT(YEAR FROM now());

    -- Buscar presupuesto mensual activo de la sede
    SELECT * INTO presupuesto_record
    FROM public.presupuestos_mensuales
    WHERE sede_id = NEW.sede_id
      AND mes = mes_actual
      AND anio = anio_actual
      AND estado = 'activo'
    FOR UPDATE;

    IF presupuesto_record IS NOT NULL THEN
      -- Verificar si excede presupuesto
      IF NEW.valor_total_cop > presupuesto_record.monto_inicial - presupuesto_record.monto_consumido THEN
        NEW.excede_presupuesto := true;
      END IF;

      -- Descontar del presupuesto
      UPDATE public.presupuestos_mensuales
      SET monto_consumido = monto_consumido + NEW.valor_total_cop
      WHERE id = presupuesto_record.id;

      -- Marcar como excedido si el nuevo consumido supera el inicial
      IF (presupuesto_record.monto_consumido + NEW.valor_total_cop) > presupuesto_record.monto_inicial THEN
        UPDATE public.presupuestos_mensuales
        SET estado = 'excedido'
        WHERE id = presupuesto_record.id;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_descontar_presupuesto
  BEFORE UPDATE ON public.pedidos
  FOR EACH ROW
  EXECUTE FUNCTION public.descontar_presupuesto_al_aprobar();
