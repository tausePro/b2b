-- ============================================================
-- Migración 022: Rol editor_contenido
-- SEGURA: solo UPDATE de políticas RLS existentes para
-- permitir al rol editor_contenido gestionar CMS y leads.
-- No se modifica la tabla usuarios ni se elimina nada.
-- ============================================================

-- 1. Agregar editor_contenido a políticas de landing_contenido
DROP POLICY IF EXISTS "Admins pueden modificar contenido" ON public.landing_contenido;
CREATE POLICY "Admins pueden modificar contenido"
  ON public.landing_contenido FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios
      WHERE usuarios.auth_id = auth.uid()
        AND usuarios.rol IN ('super_admin', 'direccion', 'editor_contenido')
    )
  );

-- 2. Agregar editor_contenido a políticas de leads
DROP POLICY IF EXISTS "leads_select_admin" ON public.leads;
CREATE POLICY "leads_select_admin"
  ON public.leads FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios
      WHERE usuarios.auth_id = auth.uid()
        AND usuarios.rol IN ('super_admin', 'direccion', 'editor_contenido')
    )
  );

DROP POLICY IF EXISTS "leads_update_admin" ON public.leads;
CREATE POLICY "leads_update_admin"
  ON public.leads FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios
      WHERE usuarios.auth_id = auth.uid()
        AND usuarios.rol IN ('super_admin', 'direccion', 'editor_contenido')
    )
  );

-- 3. Política de storage para que editor_contenido pueda subir imágenes
CREATE POLICY "editor_contenido_upload_landing"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'landing'
    AND EXISTS (
      SELECT 1 FROM public.usuarios
      WHERE usuarios.auth_id = auth.uid()
        AND usuarios.rol IN ('super_admin', 'direccion', 'editor_contenido')
    )
  );
