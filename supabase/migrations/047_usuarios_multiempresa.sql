CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_email_lower_unique
  ON public.usuarios(lower(email));

CREATE TABLE IF NOT EXISTS public.usuario_empresas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  rol TEXT NOT NULL CHECK (rol IN ('comprador', 'aprobador')),
  activo BOOLEAN NOT NULL DEFAULT true,
  es_principal BOOLEAN NOT NULL DEFAULT false,
  creado_por UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(usuario_id, empresa_id)
);

CREATE TABLE IF NOT EXISTS public.usuario_empresa_sedes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_empresa_id UUID NOT NULL REFERENCES public.usuario_empresas(id) ON DELETE CASCADE,
  sede_id UUID NOT NULL REFERENCES public.sedes(id) ON DELETE CASCADE,
  activa BOOLEAN NOT NULL DEFAULT true,
  es_predeterminada BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(usuario_empresa_id, sede_id)
);

CREATE INDEX IF NOT EXISTS idx_usuario_empresas_usuario
  ON public.usuario_empresas(usuario_id) WHERE activo = true;
CREATE INDEX IF NOT EXISTS idx_usuario_empresas_empresa
  ON public.usuario_empresas(empresa_id) WHERE activo = true;
CREATE UNIQUE INDEX IF NOT EXISTS idx_usuario_empresas_principal
  ON public.usuario_empresas(usuario_id)
  WHERE activo = true AND es_principal = true;
CREATE INDEX IF NOT EXISTS idx_usuario_empresa_sedes_asignacion
  ON public.usuario_empresa_sedes(usuario_empresa_id) WHERE activa = true;
CREATE INDEX IF NOT EXISTS idx_usuario_empresa_sedes_sede
  ON public.usuario_empresa_sedes(sede_id) WHERE activa = true;
CREATE UNIQUE INDEX IF NOT EXISTS idx_usuario_empresa_sedes_predeterminada
  ON public.usuario_empresa_sedes(usuario_empresa_id)
  WHERE activa = true AND es_predeterminada = true;

DROP TRIGGER IF EXISTS trigger_usuario_empresas_updated_at ON public.usuario_empresas;
CREATE TRIGGER trigger_usuario_empresas_updated_at
  BEFORE UPDATE ON public.usuario_empresas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS trigger_usuario_empresa_sedes_updated_at ON public.usuario_empresa_sedes;
CREATE TRIGGER trigger_usuario_empresa_sedes_updated_at
  BEFORE UPDATE ON public.usuario_empresa_sedes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE FUNCTION public.validar_usuario_empresa_sede()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_empresa_asignada UUID;
  v_empresa_sede UUID;
BEGIN
  SELECT empresa_id INTO v_empresa_asignada
  FROM public.usuario_empresas
  WHERE id = NEW.usuario_empresa_id
    AND activo = true;

  SELECT empresa_id INTO v_empresa_sede
  FROM public.sedes
  WHERE id = NEW.sede_id
    AND activa = true;

  IF v_empresa_asignada IS NULL OR v_empresa_sede IS NULL OR v_empresa_asignada <> v_empresa_sede THEN
    RAISE EXCEPTION 'La sede no pertenece a la empresa asignada al usuario';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_validar_usuario_empresa_sede ON public.usuario_empresa_sedes;
CREATE TRIGGER trigger_validar_usuario_empresa_sede
  BEFORE INSERT OR UPDATE OF usuario_empresa_id, sede_id
  ON public.usuario_empresa_sedes
  FOR EACH ROW EXECUTE FUNCTION public.validar_usuario_empresa_sede();

INSERT INTO public.usuario_empresas (usuario_id, empresa_id, rol, activo, es_principal)
SELECT id, empresa_id, rol, true, true
FROM public.usuarios
WHERE empresa_id IS NOT NULL
  AND rol IN ('comprador', 'aprobador')
ON CONFLICT (usuario_id, empresa_id) DO NOTHING;

INSERT INTO public.usuario_empresa_sedes (usuario_empresa_id, sede_id, activa, es_predeterminada)
SELECT ue.id, u.sede_id, true, true
FROM public.usuarios u
JOIN public.usuario_empresas ue
  ON ue.usuario_id = u.id
 AND ue.empresa_id = u.empresa_id
WHERE u.sede_id IS NOT NULL
  AND u.rol IN ('comprador', 'aprobador')
ON CONFLICT (usuario_empresa_id, sede_id) DO NOTHING;

INSERT INTO public.usuario_empresa_sedes (usuario_empresa_id, sede_id, activa, es_predeterminada)
SELECT ue.id, s.id, true, false
FROM public.usuario_empresas ue
JOIN public.usuarios u ON u.id = ue.usuario_id
JOIN public.sedes s ON s.empresa_id = ue.empresa_id AND s.activa = true
WHERE ue.rol = 'aprobador'
ON CONFLICT (usuario_empresa_id, sede_id) DO NOTHING;

ALTER TABLE public.usuario_empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuario_empresa_sedes ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.usuario_pertenece_a_empresa(
  p_usuario_id UUID,
  p_empresa_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_usuario_id IS NULL OR p_empresa_id IS NULL THEN
    RETURN false;
  END IF;

  IF EXISTS (SELECT 1 FROM public.usuario_empresas WHERE usuario_id = p_usuario_id) THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.usuario_empresas
      WHERE usuario_id = p_usuario_id
        AND empresa_id = p_empresa_id
        AND activo = true
    );
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.usuarios
    WHERE id = p_usuario_id
      AND empresa_id = p_empresa_id
      AND activo = true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.usuario_tiene_rol_en_empresa(
  p_usuario_id UUID,
  p_empresa_id UUID,
  p_rol TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_usuario_id IS NULL OR p_empresa_id IS NULL OR p_rol NOT IN ('comprador', 'aprobador') THEN
    RETURN false;
  END IF;

  IF EXISTS (SELECT 1 FROM public.usuario_empresas WHERE usuario_id = p_usuario_id) THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.usuario_empresas
      WHERE usuario_id = p_usuario_id
        AND empresa_id = p_empresa_id
        AND rol = p_rol
        AND activo = true
    );
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.usuarios
    WHERE id = p_usuario_id
      AND empresa_id = p_empresa_id
      AND rol = p_rol
      AND activo = true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.usuario_tiene_acceso_sede(
  p_usuario_id UUID,
  p_empresa_id UUID,
  p_sede_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_asignacion_id UUID;
BEGIN
  IF p_usuario_id IS NULL OR p_empresa_id IS NULL OR p_sede_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT id INTO v_asignacion_id
  FROM public.usuario_empresas
  WHERE usuario_id = p_usuario_id
    AND empresa_id = p_empresa_id
    AND activo = true
  LIMIT 1;

  IF v_asignacion_id IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.usuario_empresa_sedes ues
      JOIN public.sedes s ON s.id = ues.sede_id
      WHERE ues.usuario_empresa_id = v_asignacion_id
        AND ues.sede_id = p_sede_id
        AND ues.activa = true
        AND s.empresa_id = p_empresa_id
        AND s.activa = true
    );
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.usuarios u
    JOIN public.sedes s ON s.id = u.sede_id
    WHERE u.id = p_usuario_id
      AND u.empresa_id = p_empresa_id
      AND u.sede_id = p_sede_id
      AND u.activo = true
      AND s.empresa_id = p_empresa_id
      AND s.activa = true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_mis_empresa_ids()
RETURNS UUID[]
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(array_agg(ue.empresa_id ORDER BY ue.es_principal DESC, ue.created_at), ARRAY[]::UUID[])
  FROM public.usuario_empresas ue
  JOIN public.usuarios u ON u.id = ue.usuario_id
  WHERE u.auth_id = auth.uid()
    AND u.activo = true
    AND ue.activo = true;
$$;

CREATE OR REPLACE FUNCTION public.tiene_acceso_empresa(p_empresa_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rol TEXT;
  v_usuario_id UUID;
BEGIN
  SELECT id, rol INTO v_usuario_id, v_rol
  FROM public.usuarios
  WHERE auth_id = auth.uid()
    AND activo = true;

  IF v_usuario_id IS NULL THEN
    RETURN false;
  END IF;

  IF v_rol IN ('super_admin', 'direccion') THEN
    RETURN true;
  END IF;

  IF v_rol = 'asesor' THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.asesor_empresas
      WHERE usuario_id = v_usuario_id
        AND empresa_id = p_empresa_id
        AND activo = true
    );
  END IF;

  RETURN public.usuario_pertenece_a_empresa(v_usuario_id, p_empresa_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_mi_perfil()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result JSON;
BEGIN
  SELECT row_to_json(profile) INTO v_result
  FROM (
    SELECT
      u.id,
      u.auth_id,
      u.email,
      u.nombre,
      u.apellido,
      u.rol,
      u.empresa_id,
      u.sede_id,
      u.avatar,
      u.activo,
      u.created_at,
      COALESCE(
        (
          SELECT array_agg(ure.rol ORDER BY ure.rol)
          FROM public.usuario_roles_extra ure
          WHERE ure.usuario_id = u.id
            AND ure.activo = true
        ),
        ARRAY[]::TEXT[]
      ) AS roles_extra,
      COALESCE(
        (
          SELECT json_agg(
            json_build_object(
              'id', ue.id,
              'empresa_id', ue.empresa_id,
              'empresa_nombre', e.nombre,
              'rol', ue.rol,
              'activo', ue.activo,
              'es_principal', ue.es_principal,
              'odoo_partner_id', e.odoo_partner_id,
              'requiere_aprobacion', e.requiere_aprobacion,
              'usa_sedes', e.usa_sedes,
              'logo_url', ec.logo_url,
              'color_primario', ec.color_primario,
              'slug', ec.slug,
              'configuracion_extra', ec.configuracion_extra,
              'sede_ids', COALESCE(
                (
                  SELECT json_agg(ues.sede_id ORDER BY ues.es_predeterminada DESC, s.nombre_sede)
                  FROM public.usuario_empresa_sedes ues
                  JOIN public.sedes s ON s.id = ues.sede_id
                  WHERE ues.usuario_empresa_id = ue.id
                    AND ues.activa = true
                    AND s.activa = true
                ),
                '[]'::json
              ),
              'sedes', COALESCE(
                (
                  SELECT json_agg(
                    json_build_object(
                      'id', s.id,
                      'nombre', s.nombre_sede,
                      'ciudad', s.ciudad,
                      'es_predeterminada', ues.es_predeterminada
                    )
                    ORDER BY ues.es_predeterminada DESC, s.nombre_sede
                  )
                  FROM public.usuario_empresa_sedes ues
                  JOIN public.sedes s ON s.id = ues.sede_id
                  WHERE ues.usuario_empresa_id = ue.id
                    AND ues.activa = true
                    AND s.activa = true
                ),
                '[]'::json
              )
            )
            ORDER BY ue.es_principal DESC, e.nombre
          )
          FROM public.usuario_empresas ue
          JOIN public.empresas e ON e.id = ue.empresa_id
          LEFT JOIN public.empresa_configs ec ON ec.empresa_id = ue.empresa_id
          WHERE ue.usuario_id = u.id
            AND ue.activo = true
            AND e.activa = true
        ),
        '[]'::json
      ) AS empresas_asignadas
    FROM public.usuarios u
    WHERE u.auth_id = auth.uid()
    LIMIT 1
  ) profile;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.configurar_usuario_empresa(
  p_usuario_id UUID,
  p_empresa_id UUID,
  p_rol TEXT,
  p_sede_ids UUID[],
  p_es_principal BOOLEAN,
  p_creado_por UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_asignacion_id UUID;
  v_sede_count INTEGER;
BEGIN
  SELECT COALESCE(array_agg(site_id ORDER BY first_position), ARRAY[]::UUID[])
  INTO p_sede_ids
  FROM (
    SELECT site_id, min(position) AS first_position
    FROM unnest(COALESCE(p_sede_ids, ARRAY[]::UUID[])) WITH ORDINALITY AS sites(site_id, position)
    GROUP BY site_id
  ) unique_sites;

  IF p_rol NOT IN ('comprador', 'aprobador') THEN
    RAISE EXCEPTION 'Rol de empresa inválido';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.empresas WHERE id = p_empresa_id AND activa = true) THEN
    RAISE EXCEPTION 'Empresa inválida o inactiva';
  END IF;

  SELECT count(*) INTO v_sede_count
  FROM public.sedes
  WHERE id = ANY(COALESCE(p_sede_ids, ARRAY[]::UUID[]))
    AND empresa_id = p_empresa_id
    AND activa = true;

  IF v_sede_count <> cardinality(COALESCE(p_sede_ids, ARRAY[]::UUID[])) THEN
    RAISE EXCEPTION 'Una o más sedes no pertenecen a la empresa';
  END IF;

  IF p_es_principal THEN
    UPDATE public.usuario_empresas
    SET es_principal = false
    WHERE usuario_id = p_usuario_id;
  END IF;

  INSERT INTO public.usuario_empresas (
    usuario_id,
    empresa_id,
    rol,
    activo,
    es_principal,
    creado_por
  )
  VALUES (
    p_usuario_id,
    p_empresa_id,
    p_rol,
    true,
    p_es_principal,
    p_creado_por
  )
  ON CONFLICT (usuario_id, empresa_id) DO UPDATE SET
    rol = EXCLUDED.rol,
    activo = true,
    es_principal = CASE
      WHEN EXCLUDED.es_principal THEN true
      ELSE usuario_empresas.es_principal
    END,
    creado_por = COALESCE(EXCLUDED.creado_por, usuario_empresas.creado_por)
  RETURNING id INTO v_asignacion_id;

  DELETE FROM public.usuario_empresa_sedes
  WHERE usuario_empresa_id = v_asignacion_id;

  INSERT INTO public.usuario_empresa_sedes (
    usuario_empresa_id,
    sede_id,
    activa,
    es_predeterminada
  )
  SELECT
    v_asignacion_id,
    site.sede_id,
    true,
    site.ordinality = 1
  FROM unnest(COALESCE(p_sede_ids, ARRAY[]::UUID[])) WITH ORDINALITY AS site(sede_id, ordinality);

  IF p_es_principal THEN
    UPDATE public.usuarios
    SET empresa_id = p_empresa_id,
        rol = p_rol,
        sede_id = CASE WHEN p_rol = 'comprador' THEN p_sede_ids[1] ELSE NULL END,
        activo = true
    WHERE id = p_usuario_id;
  END IF;

  RETURN v_asignacion_id;
END;
$$;

REVOKE ALL ON FUNCTION public.configurar_usuario_empresa(UUID, UUID, TEXT, UUID[], BOOLEAN, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.configurar_usuario_empresa(UUID, UUID, TEXT, UUID[], BOOLEAN, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.configurar_usuario_empresa(UUID, UUID, TEXT, UUID[], BOOLEAN, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.configurar_usuario_empresa(UUID, UUID, TEXT, UUID[], BOOLEAN, UUID) TO service_role;

DROP POLICY IF EXISTS "usuario_empresas_select" ON public.usuario_empresas;
CREATE POLICY "usuario_empresas_select" ON public.usuario_empresas
  FOR SELECT TO authenticated
  USING (
    usuario_id = public.get_mi_usuario_id()
    OR public.get_mi_rol() IN ('super_admin', 'direccion')
  );

DROP POLICY IF EXISTS "usuario_empresas_manage" ON public.usuario_empresas;
CREATE POLICY "usuario_empresas_manage" ON public.usuario_empresas
  FOR ALL TO authenticated
  USING (public.get_mi_rol() IN ('super_admin', 'direccion'))
  WITH CHECK (public.get_mi_rol() IN ('super_admin', 'direccion'));

DROP POLICY IF EXISTS "usuario_empresa_sedes_select" ON public.usuario_empresa_sedes;
CREATE POLICY "usuario_empresa_sedes_select" ON public.usuario_empresa_sedes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.usuario_empresas ue
      WHERE ue.id = usuario_empresa_id
        AND (
          ue.usuario_id = public.get_mi_usuario_id()
          OR public.get_mi_rol() IN ('super_admin', 'direccion')
        )
    )
  );

DROP POLICY IF EXISTS "usuario_empresa_sedes_manage" ON public.usuario_empresa_sedes;
CREATE POLICY "usuario_empresa_sedes_manage" ON public.usuario_empresa_sedes
  FOR ALL TO authenticated
  USING (public.get_mi_rol() IN ('super_admin', 'direccion'))
  WITH CHECK (public.get_mi_rol() IN ('super_admin', 'direccion'));

DROP POLICY IF EXISTS "usuarios_select" ON public.usuarios;
CREATE POLICY "usuarios_select" ON public.usuarios
  FOR SELECT TO authenticated
  USING (
    auth_id = auth.uid()
    OR public.get_mi_rol() IN ('super_admin', 'direccion')
    OR (
      empresa_id IS NOT NULL
      AND public.tiene_acceso_empresa(empresa_id)
    )
    OR EXISTS (
      SELECT 1
      FROM public.usuario_empresas target_membership
      WHERE target_membership.usuario_id = usuarios.id
        AND target_membership.activo = true
        AND public.tiene_acceso_empresa(target_membership.empresa_id)
    )
  );

DROP POLICY IF EXISTS "sedes_select" ON public.sedes;
CREATE POLICY "sedes_select" ON public.sedes
  FOR SELECT TO authenticated
  USING (
    public.get_mi_rol() IN ('super_admin', 'direccion')
    OR (
      public.get_mi_rol() = 'asesor'
      AND public.tiene_acceso_empresa(empresa_id)
    )
    OR public.usuario_tiene_acceso_sede(public.get_mi_usuario_id(), empresa_id, id)
  );

DROP POLICY IF EXISTS "pedidos_select" ON public.pedidos;
CREATE POLICY "pedidos_select" ON public.pedidos
  FOR SELECT TO authenticated
  USING (
    public.get_mi_rol() IN ('super_admin', 'direccion')
    OR (
      public.get_mi_rol() = 'asesor'
      AND public.tiene_acceso_empresa(empresa_id)
    )
    OR (
      public.usuario_tiene_rol_en_empresa(public.get_mi_usuario_id(), empresa_id, 'comprador')
      AND usuario_creador_id = public.get_mi_usuario_id()
    )
    OR (
      public.usuario_tiene_rol_en_empresa(public.get_mi_usuario_id(), empresa_id, 'aprobador')
      AND (
        sede_id IS NULL
        OR public.usuario_tiene_acceso_sede(public.get_mi_usuario_id(), empresa_id, sede_id)
      )
    )
  );

DROP POLICY IF EXISTS "pedidos_insert" ON public.pedidos;
CREATE POLICY "pedidos_insert" ON public.pedidos
  FOR INSERT TO authenticated
  WITH CHECK (
    usuario_creador_id = public.get_mi_usuario_id()
    AND public.usuario_tiene_rol_en_empresa(public.get_mi_usuario_id(), empresa_id, 'comprador')
    AND (
      CASE
        WHEN COALESCE((SELECT e.usa_sedes FROM public.empresas e WHERE e.id = empresa_id), true) THEN
          public.usuario_tiene_acceso_sede(public.get_mi_usuario_id(), empresa_id, sede_id)
        ELSE
          sede_id IS NULL
          OR public.usuario_tiene_acceso_sede(public.get_mi_usuario_id(), empresa_id, sede_id)
      END
    )
  );

DROP POLICY IF EXISTS "pedidos_update" ON public.pedidos;
CREATE POLICY "pedidos_update" ON public.pedidos
  FOR UPDATE TO authenticated
  USING (
    public.get_mi_rol() IN ('super_admin', 'direccion')
    OR (
      public.get_mi_rol() = 'asesor'
      AND public.tiene_acceso_empresa(empresa_id)
    )
    OR (
      public.usuario_tiene_rol_en_empresa(public.get_mi_usuario_id(), empresa_id, 'comprador')
      AND usuario_creador_id = public.get_mi_usuario_id()
    )
    OR (
      public.usuario_tiene_rol_en_empresa(public.get_mi_usuario_id(), empresa_id, 'aprobador')
      AND (
        sede_id IS NULL
        OR public.usuario_tiene_acceso_sede(public.get_mi_usuario_id(), empresa_id, sede_id)
      )
    )
  )
  WITH CHECK (
    public.tiene_acceso_empresa(empresa_id)
    AND (
      sede_id IS NULL
      OR public.get_mi_rol() IN ('super_admin', 'direccion')
      OR (
        public.get_mi_rol() = 'asesor'
        AND public.tiene_acceso_empresa(empresa_id)
      )
      OR public.usuario_tiene_acceso_sede(public.get_mi_usuario_id(), empresa_id, sede_id)
    )
  );

DROP POLICY IF EXISTS "pedido_items_insert" ON public.pedido_items;
CREATE POLICY "pedido_items_insert" ON public.pedido_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.pedidos p
      LEFT JOIN public.empresa_configs ec ON ec.empresa_id = p.empresa_id
      WHERE p.id = pedido_id
        AND p.usuario_creador_id = public.get_mi_usuario_id()
        AND public.usuario_tiene_rol_en_empresa(public.get_mi_usuario_id(), p.empresa_id, 'comprador')
        AND (
          public.pedido_items.tipo_item = 'especial'
          OR NOT COALESCE(
            CASE
              WHEN jsonb_typeof(ec.configuracion_extra -> 'restringir_catalogo_portal') = 'boolean'
                THEN (ec.configuracion_extra ->> 'restringir_catalogo_portal')::boolean
              ELSE false
            END,
            false
          )
          OR EXISTS (
            SELECT 1
            FROM public.productos_autorizados pa
            WHERE pa.empresa_id = p.empresa_id
              AND pa.odoo_product_id = public.pedido_items.odoo_product_id
              AND pa.activo = true
          )
        )
    )
  );

DROP POLICY IF EXISTS "pedido_items_update_aprobador" ON public.pedido_items;
CREATE POLICY "pedido_items_update_aprobador" ON public.pedido_items
  FOR UPDATE TO authenticated
  USING (
    public.get_mi_rol() = 'super_admin'
    OR EXISTS (
      SELECT 1
      FROM public.pedidos p
      WHERE p.id = pedido_id
        AND p.estado = 'en_aprobacion'
        AND public.usuario_tiene_rol_en_empresa(public.get_mi_usuario_id(), p.empresa_id, 'aprobador')
    )
  )
  WITH CHECK (
    public.get_mi_rol() = 'super_admin'
    OR EXISTS (
      SELECT 1
      FROM public.pedidos p
      WHERE p.id = pedido_id
        AND p.estado = 'en_aprobacion'
        AND public.usuario_tiene_rol_en_empresa(public.get_mi_usuario_id(), p.empresa_id, 'aprobador')
    )
  );

DROP POLICY IF EXISTS "pedido_items_delete_super_admin" ON public.pedido_items;
CREATE POLICY "pedido_items_delete_super_admin" ON public.pedido_items
  FOR DELETE TO authenticated
  USING (
    public.get_mi_rol() = 'super_admin'
    OR EXISTS (
      SELECT 1
      FROM public.pedidos p
      WHERE p.id = pedido_id
        AND p.estado = 'en_aprobacion'
        AND public.usuario_tiene_rol_en_empresa(public.get_mi_usuario_id(), p.empresa_id, 'aprobador')
    )
  );

DROP POLICY IF EXISTS "presupuestos_select" ON public.presupuestos_mensuales;
CREATE POLICY "presupuestos_select" ON public.presupuestos_mensuales
  FOR SELECT TO authenticated
  USING (
    public.get_mi_rol() IN ('super_admin', 'direccion')
    OR (
      public.get_mi_rol() = 'asesor'
      AND public.tiene_acceso_empresa((SELECT s.empresa_id FROM public.sedes s WHERE s.id = sede_id))
    )
    OR EXISTS (
      SELECT 1
      FROM public.sedes s
      WHERE s.id = sede_id
        AND public.usuario_tiene_rol_en_empresa(public.get_mi_usuario_id(), s.empresa_id, 'aprobador')
        AND public.usuario_tiene_acceso_sede(public.get_mi_usuario_id(), s.empresa_id, s.id)
    )
  );

DROP POLICY IF EXISTS "presupuestos_update" ON public.presupuestos_mensuales;
DROP POLICY IF EXISTS "presupuestos_update_aprobador" ON public.presupuestos_mensuales;
DROP POLICY IF EXISTS "presupuestos_insert_aprobador" ON public.presupuestos_mensuales;
DROP POLICY IF EXISTS "presupuestos_select_aprobador" ON public.presupuestos_mensuales;

CREATE POLICY "presupuestos_update_multiempresa" ON public.presupuestos_mensuales
  FOR UPDATE TO authenticated
  USING (
    public.get_mi_rol() IN ('super_admin', 'direccion')
    OR EXISTS (
      SELECT 1
      FROM public.sedes s
      WHERE s.id = sede_id
        AND public.usuario_tiene_rol_en_empresa(public.get_mi_usuario_id(), s.empresa_id, 'aprobador')
        AND public.usuario_tiene_acceso_sede(public.get_mi_usuario_id(), s.empresa_id, s.id)
    )
  )
  WITH CHECK (
    public.get_mi_rol() IN ('super_admin', 'direccion')
    OR EXISTS (
      SELECT 1
      FROM public.sedes s
      WHERE s.id = sede_id
        AND public.usuario_tiene_rol_en_empresa(public.get_mi_usuario_id(), s.empresa_id, 'aprobador')
        AND public.usuario_tiene_acceso_sede(public.get_mi_usuario_id(), s.empresa_id, s.id)
    )
  );

CREATE POLICY "presupuestos_insert_multiempresa" ON public.presupuestos_mensuales
  FOR INSERT TO authenticated
  WITH CHECK (
    public.get_mi_rol() IN ('super_admin', 'direccion')
    OR EXISTS (
      SELECT 1
      FROM public.sedes s
      WHERE s.id = sede_id
        AND public.usuario_tiene_rol_en_empresa(public.get_mi_usuario_id(), s.empresa_id, 'aprobador')
        AND public.usuario_tiene_acceso_sede(public.get_mi_usuario_id(), s.empresa_id, s.id)
    )
  );

DROP POLICY IF EXISTS "margenes_venta_select" ON public.margenes_venta;
CREATE POLICY "margenes_venta_select" ON public.margenes_venta
  FOR SELECT TO authenticated
  USING (
    public.get_mi_rol() IN ('super_admin', 'direccion')
    OR (
      public.get_mi_rol() = 'asesor'
      AND public.tiene_acceso_empresa(empresa_id)
    )
  );

DROP POLICY IF EXISTS "precios_empresa_producto_select" ON public.precios_empresa_producto;
CREATE POLICY "precios_empresa_producto_select" ON public.precios_empresa_producto
  FOR SELECT TO authenticated
  USING (
    public.get_mi_rol() IN ('super_admin', 'direccion')
    OR (
      public.get_mi_rol() = 'asesor'
      AND public.tiene_acceso_empresa(empresa_id)
    )
  );

REVOKE ALL ON public.usuario_empresas FROM anon;
REVOKE ALL ON public.usuario_empresa_sedes FROM anon;
REVOKE ALL ON public.usuario_empresas FROM authenticated;
REVOKE ALL ON public.usuario_empresa_sedes FROM authenticated;
GRANT SELECT ON public.usuario_empresas TO authenticated;
GRANT SELECT ON public.usuario_empresa_sedes TO authenticated;
GRANT EXECUTE ON FUNCTION public.usuario_pertenece_a_empresa(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.usuario_tiene_rol_en_empresa(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.usuario_tiene_acceso_sede(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_mis_empresa_ids() TO authenticated;
