-- ============================================================
-- Migración 044: usuario_roles_extra (multi-rol por composición)
--
-- Contexto:
--   El campo `usuarios.rol` sigue siendo el ROL PRIMARIO del usuario
--   (determina dashboard inicial, branding, RLS base). Esta tabla
--   agrega ROLES SECUNDARIOS / CAPACIDADES ADICIONALES sin tocar el
--   esquema existente, evitando refactorizar todas las RLS y guards.
--
--   Caso de uso disparador: Vanesa es asesora (rol primario) y también
--   gestiona contenido editorial de Empaques (rol secundario
--   `editor_contenido`).
--
-- Diseño:
--   - Tabla relacional (vs columna text[]) para auditar quién asigna y
--     permitir activar/desactivar capacidades sin perder histórico.
--   - Idempotente: ON CONFLICT DO NOTHING en seeds.
--   - RLS: solo super_admin y direccion gestionan; cada usuario puede
--     leer sus propios roles extra.
--   - Helper SQL `usuario_tiene_rol_o_extra` para componibilidad futura
--     en políticas RLS de otras tablas.
--   - Extiende `get_mi_perfil()` para devolver `roles_extra TEXT[]` en
--     el JSON, así el AuthContext lo recibe en la misma RPC.
-- ============================================================

-- 1. Tabla principal
CREATE TABLE IF NOT EXISTS public.usuario_roles_extra (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  rol TEXT NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT true,
  asignado_por UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT usuario_roles_extra_unique UNIQUE (usuario_id, rol),
  CONSTRAINT usuario_roles_extra_rol_valido CHECK (
    rol IN ('super_admin', 'comprador', 'aprobador', 'asesor', 'direccion', 'editor_contenido')
  )
);

CREATE INDEX IF NOT EXISTS usuario_roles_extra_usuario_idx
  ON public.usuario_roles_extra (usuario_id)
  WHERE activo = true;

-- 2. Trigger updated_at (reusamos el patrón de las demás tablas).
CREATE OR REPLACE FUNCTION public.tg_usuario_roles_extra_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS usuario_roles_extra_set_updated_at ON public.usuario_roles_extra;
CREATE TRIGGER usuario_roles_extra_set_updated_at
  BEFORE UPDATE ON public.usuario_roles_extra
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_usuario_roles_extra_set_updated_at();

-- 3. RLS
ALTER TABLE public.usuario_roles_extra ENABLE ROW LEVEL SECURITY;

-- Lectura: el propio usuario (para que el AuthContext en cliente pueda
-- leer sus roles extra) + super_admin/direccion (para administración).
DROP POLICY IF EXISTS "usuario_roles_extra_select" ON public.usuario_roles_extra;
CREATE POLICY "usuario_roles_extra_select"
  ON public.usuario_roles_extra
  FOR SELECT
  TO authenticated
  USING (
    usuario_id IN (SELECT id FROM public.usuarios WHERE auth_id = auth.uid())
    OR
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.auth_id = auth.uid()
        AND u.rol IN ('super_admin', 'direccion')
    )
  );

-- Insert/update/delete: solo super_admin y direccion.
DROP POLICY IF EXISTS "usuario_roles_extra_insert" ON public.usuario_roles_extra;
CREATE POLICY "usuario_roles_extra_insert"
  ON public.usuario_roles_extra
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.auth_id = auth.uid()
        AND u.rol IN ('super_admin', 'direccion')
    )
  );

DROP POLICY IF EXISTS "usuario_roles_extra_update" ON public.usuario_roles_extra;
CREATE POLICY "usuario_roles_extra_update"
  ON public.usuario_roles_extra
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.auth_id = auth.uid()
        AND u.rol IN ('super_admin', 'direccion')
    )
  );

DROP POLICY IF EXISTS "usuario_roles_extra_delete" ON public.usuario_roles_extra;
CREATE POLICY "usuario_roles_extra_delete"
  ON public.usuario_roles_extra
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.auth_id = auth.uid()
        AND u.rol IN ('super_admin', 'direccion')
    )
  );

-- 4. Helper: ¿el usuario tiene cierto rol como primario o como extra activo?
--    Útil para futuras políticas RLS que quieran chequear capacidades.
CREATE OR REPLACE FUNCTION public.usuario_tiene_rol_o_extra(
  p_usuario_id UUID,
  p_rol TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_match BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.id = p_usuario_id AND u.rol = p_rol AND u.activo = true
  ) OR EXISTS (
    SELECT 1 FROM public.usuario_roles_extra ure
    WHERE ure.usuario_id = p_usuario_id
      AND ure.rol = p_rol
      AND ure.activo = true
  )
  INTO v_match;

  RETURN COALESCE(v_match, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 5. Extender get_mi_perfil() para devolver `roles_extra TEXT[]`.
--    Mantenemos la misma signatura (RETURNS JSON) para no romper a quien
--    ya la consume; solo agregamos un campo más.
CREATE OR REPLACE FUNCTION public.get_mi_perfil()
RETURNS JSON AS $$
DECLARE
  v_result JSON;
BEGIN
  SELECT row_to_json(u) INTO v_result FROM (
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
          WHERE ure.usuario_id = u.id AND ure.activo = true
        ),
        ARRAY[]::TEXT[]
      ) AS roles_extra
    FROM public.usuarios u
    WHERE u.auth_id = auth.uid()
    LIMIT 1
  ) u;
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 6. Notas operativas
-- ----------------------------------------------------------------
-- Para asignar el rol extra editor_contenido a Vanesa, ejecutar en
-- el SQL editor (reemplazar el email):
--
--   INSERT INTO public.usuario_roles_extra (usuario_id, rol, asignado_por)
--   SELECT u.id, 'editor_contenido', (SELECT id FROM public.usuarios WHERE rol = 'super_admin' AND activo = true LIMIT 1)
--   FROM public.usuarios u
--   WHERE u.email = 'vanesa@imprima.com.co'
--   ON CONFLICT (usuario_id, rol) DO UPDATE SET activo = true, updated_at = NOW();
--
-- Para revocar:
--   UPDATE public.usuario_roles_extra
--   SET activo = false
--   WHERE usuario_id = (SELECT id FROM public.usuarios WHERE email = 'vanesa@imprima.com.co')
--     AND rol = 'editor_contenido';
-- ----------------------------------------------------------------
