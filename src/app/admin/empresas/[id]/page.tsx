'use client';

import { useState, useEffect, useMemo, useCallback, type ChangeEvent } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import {
  Building2,
  Loader2,
  Palette,
  Scale,
  RefreshCw,
  Users,
  Search,
  Package,
  Tag as TagIcon,
  Upload,
  Info,
  Pencil,
  Trash2,
  Plus,
  ArrowLeft,
  Save,
  X,
  Percent,
} from 'lucide-react';

interface Empresa {
  id: string;
  nombre: string;
  nit: string | null;
  odoo_partner_id: number | null;
  odoo_comercial_id: number | null;
  odoo_comercial_nombre: string | null;
  activa: boolean;
  usa_sedes: boolean;
  requiere_aprobacion: boolean;
  slug: string | null;
  created_at: string;
}

interface EmpresaConfig {
  id: string;
  empresa_id: string;
  color_primario: string | null;
  logo_url: string | null;
  monto_aprobacion: number | null;
  control_presupuesto: boolean;
  odoo_partner_id: string | null;
  odoo_pricelist_id: string | null;
  modulos_activos: string[];
  configuracion_extra?: Record<string, unknown>;
}

interface Usuario {
  id: string;
  nombre: string;
  apellido: string;
  email: string;
  rol: string;
  activo: boolean;
  sede_id?: string | null;
}

interface Sede {
  id: string;
  nombre: string;
  ciudad: string | null;
}

interface Asesor {
  id: string;
  nombre: string;
  apellido: string;
  email: string | null;
  activo: boolean;
  odoo_user_id: number | null;
  auth_id: string | null;
}

interface AsesorAsignacion {
  usuario_id: string;
}

interface ProductoEmpresaOdoo {
  id: number;
  name: string;
  description_sale: string | false;
  list_price: number;
  uom_name: string;
  categ_id: [number, string] | false;
  product_tag_ids: number[];
  product_tags?: [number, string][];
  image_128: string | false;
  default_code: string | false;
  active: boolean;
  sale_ok: boolean;
}

interface OdooPartnerContext {
  id: number;
  name: string;
  tag_ids: number[];
  partner_tags: Array<{
    id: number;
    name: string;
    color: number;
  }>;
  pricelist: {
    id: number;
    name: string;
  } | null;
}

interface OdooProductTagOption {
  id: number;
  name: string;
  color: number;
}

type CategoriaAutorizada = 'aseo' | 'papeleria' | 'cafeteria' | 'personalizados';
type UserRoleCliente = 'comprador' | 'aprobador';

interface UserFormState {
  nombre: string;
  apellido: string;
  email: string;
  rol: UserRoleCliente;
  sede_id: string;
  password: string;
}

interface ActivateAsesorAccessFormState {
  password: string;
}

const initialUserFormState: UserFormState = {
  nombre: '',
  apellido: '',
  email: '',
  rol: 'comprador',
  sede_id: '',
  password: '',
};

const initialActivateAsesorAccessFormState: ActivateAsesorAccessFormState = {
  password: '',
};

const LOGOS_BUCKET = 'logos-empresas';
const LOGO_MAX_SIZE_BYTES = 2 * 1024 * 1024;
const LOGO_ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
]);

function getLogoFileExtension(file: File) {
  const extensionFromName = file.name.split('.').pop()?.trim().toLowerCase();

  if (extensionFromName) {
    return extensionFromName === 'jpeg' ? 'jpg' : extensionFromName;
  }

  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/jpeg') return 'jpg';
  if (file.type === 'image/webp') return 'webp';
  if (file.type === 'image/svg+xml') return 'svg';

  return 'bin';
}

function normalizeEmpresaConfig(rawConfig: Record<string, unknown>): EmpresaConfig {
  let modulosArray: string[] = [];

  if (Array.isArray(rawConfig.modulos_activos)) {
    modulosArray = rawConfig.modulos_activos.filter((value): value is string => typeof value === 'string');
  } else if (typeof rawConfig.modulos_activos === 'object' && rawConfig.modulos_activos !== null) {
    modulosArray = Object.entries(rawConfig.modulos_activos)
      .filter(([, isActive]) => Boolean(isActive))
      .map(([key]) => key);
  }

  return {
    ...(rawConfig as unknown as EmpresaConfig),
    modulos_activos: modulosArray,
    configuracion_extra:
      rawConfig.configuracion_extra && typeof rawConfig.configuracion_extra === 'object'
        ? (rawConfig.configuracion_extra as Record<string, unknown>)
        : {},
  };
}

function getAsesorAccessMeta(asesor: Asesor) {
  const email = asesor.email?.trim() ?? '';

  if (!email) {
    return {
      label: 'Sin email',
      badgeClassName: 'bg-amber-100 text-amber-800 border-amber-200',
      description: 'Debe tener un email válido para activar acceso al portal.',
    };
  }

  if (asesor.auth_id) {
    return {
      label: 'Acceso activo',
      badgeClassName: 'bg-green-100 text-green-800 border-green-200',
      description: 'El asesor ya puede ingresar al portal con su correo.',
    };
  }

  return {
    label: 'Sin acceso',
    badgeClassName: 'bg-slate-100 text-slate-700 border-slate-200',
    description: 'Perfil sincronizado desde Odoo pendiente de credenciales.',
  };
}

function mapCategoriaAutorizada(nombreCategoria: string | null | undefined): CategoriaAutorizada {
  const categoria = (nombreCategoria || '').toLowerCase();

  if (categoria.includes('aseo') || categoria.includes('limpieza') || categoria.includes('hig')) {
    return 'aseo';
  }
  if (categoria.includes('papel') || categoria.includes('escrit') || categoria.includes('oficina')) {
    return 'papeleria';
  }
  if (categoria.includes('cafe') || categoria.includes('cafeter') || categoria.includes('alimento')) {
    return 'cafeteria';
  }

  return 'personalizados';
}

const supabase = createClient();

const sectionNav = [
  { id: 'branding', label: 'Marca Visual', icon: Palette },
  { id: 'logic', label: 'Reglas de Negocio', icon: Scale },
  { id: 'odoo', label: 'Integración Odoo', icon: RefreshCw },
  { id: 'productos', label: 'Productos Odoo', icon: Package },
  { id: 'estructura', label: 'Empresas y Sucursales', icon: Building2 },
  { id: 'asesores', label: 'Asesores y Clientes', icon: Users },
  { id: 'users', label: 'Gestión de Usuarios', icon: Users },
  { id: 'margenes', label: 'Márgenes de Venta', icon: Percent },
];

export default function EmpresaConfigPage() {
  const params = useParams();
  const empresaId = params.id as string;

  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [config, setConfig] = useState<EmpresaConfig | null>(null);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [asesores, setAsesores] = useState<Asesor[]>([]);
  const [asesoresAsignados, setAsesoresAsignados] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoUploadError, setLogoUploadError] = useState<string | null>(null);
  const [savingAsesores, setSavingAsesores] = useState(false);
  const [productosOdoo, setProductosOdoo] = useState<ProductoEmpresaOdoo[]>([]);
  const [loadingProductosOdoo, setLoadingProductosOdoo] = useState(false);
  const [errorProductosOdoo, setErrorProductosOdoo] = useState<string | null>(null);
  const [avisoProductosOdoo, setAvisoProductosOdoo] = useState<string | null>(null);
  const [partnerOdooContext, setPartnerOdooContext] = useState<OdooPartnerContext | null>(null);
  const [etiquetasProductoOdoo, setEtiquetasProductoOdoo] = useState<OdooProductTagOption[]>([]);
  const [productosAutorizadosSeleccionados, setProductosAutorizadosSeleccionados] = useState<Set<number>>(new Set());
  const [savingProductosPortal, setSavingProductosPortal] = useState(false);
  const [restringirCatalogoPortal, setRestringirCatalogoPortal] = useState(false);
  const [mostrarPreciosCompradorPortal, setMostrarPreciosCompradorPortal] = useState(false);
  const [mostrarPreciosAprobadorPortal, setMostrarPreciosAprobadorPortal] = useState(true);
  const [busquedaProducto, setBusquedaProducto] = useState('');
  const [categoriaProductoFiltro, setCategoriaProductoFiltro] = useState<number | 'todos'>('todos');
  const [etiquetaProductoFiltro, setEtiquetaProductoFiltro] = useState<number | 'todos'>('todos');
  const [activeSection, setActiveSection] = useState('branding');
  const [toast, setToast] = useState<string | null>(null);

  // Márgenes de venta
  const [margenes, setMargenes] = useState<{ id: string; odoo_categ_id: number | null; margen_porcentaje: number }[]>([]);
  const [loadingMargenes, setLoadingMargenes] = useState(false);
  const [savingMargen, setSavingMargen] = useState(false);
  const [nuevoMargenCategId, setNuevoMargenCategId] = useState<string>('');
  const [nuevoMargenPorcentaje, setNuevoMargenPorcentaje] = useState<string>('20');
  const [showCreateUserModal, setShowCreateUserModal] = useState(false);
  const [creatingUser, setCreatingUser] = useState(false);
  const [createUserError, setCreateUserError] = useState<string | null>(null);
  const [newUserForm, setNewUserForm] = useState<UserFormState>(initialUserFormState);
  const [showActivateAsesorAccessModal, setShowActivateAsesorAccessModal] = useState(false);
  const [activateAsesorAccessError, setActivateAsesorAccessError] = useState<string | null>(null);
  const [activatingAsesorId, setActivatingAsesorId] = useState<string | null>(null);
  const [syncingOdooAsesor, setSyncingOdooAsesor] = useState(false);
  const [pricelistsOdoo, setPricelistsOdoo] = useState<{ id: number; name: string; currency: string | null }[]>([]);
  const [loadingPricelists, setLoadingPricelists] = useState(false);
  const [selectedAsesorForAccess, setSelectedAsesorForAccess] = useState<Asesor | null>(null);
  const [activateAsesorAccessForm, setActivateAsesorAccessForm] = useState<ActivateAsesorAccessFormState>(
    initialActivateAsesorAccessFormState
  );

  const partnerIdProductos = useMemo(() => {
    const partnerDesdeConfig = Number(config?.odoo_partner_id);
    if (Number.isFinite(partnerDesdeConfig) && partnerDesdeConfig > 0) {
      return partnerDesdeConfig;
    }
    return empresa?.odoo_partner_id ?? null;
  }, [config?.odoo_partner_id, empresa?.odoo_partner_id]);

  const fetchData = useCallback(async () => {
    setLoading(true);

    const [empresaRes, configRes, usuariosRes, sedesRes, asesoresRes, asignacionesRes, productosAuthRes] = await Promise.allSettled([
      supabase.from('empresas').select('*').eq('id', empresaId).single(),
      supabase.from('empresa_configs').select('*').eq('empresa_id', empresaId).single(),
      supabase.from('usuarios').select('id, nombre, apellido, email, rol, activo, sede_id').eq('empresa_id', empresaId),
      supabase.from('sedes').select('id, nombre_sede, ciudad').eq('empresa_id', empresaId),
      supabase
        .from('usuarios')
        .select('id, nombre, apellido, email, activo, odoo_user_id, auth_id')
        .eq('rol', 'asesor')
        .eq('activo', true)
        .order('nombre'),
      supabase
        .from('asesor_empresas')
        .select('usuario_id')
        .eq('empresa_id', empresaId)
        .eq('activo', true),
      supabase
        .from('productos_autorizados')
        .select('odoo_product_id, activo')
        .eq('empresa_id', empresaId),
    ]);

    if (empresaRes.status === 'fulfilled' && empresaRes.value.data) {
      setEmpresa(empresaRes.value.data as Empresa);
    }
    if (configRes.status === 'fulfilled' && configRes.value.data) {
      const rawConfig = configRes.value.data as Record<string, unknown>;
      const normalizedConfig = normalizeEmpresaConfig(rawConfig);

      setConfig(normalizedConfig);

      const extra =
        normalizedConfig.configuracion_extra && typeof normalizedConfig.configuracion_extra === 'object'
          ? normalizedConfig.configuracion_extra
          : {};
      setRestringirCatalogoPortal(Boolean(extra.restringir_catalogo_portal));
      setMostrarPreciosCompradorPortal(
        typeof extra.mostrar_precios_comprador === 'boolean' ? extra.mostrar_precios_comprador : false
      );
      setMostrarPreciosAprobadorPortal(
        typeof extra.mostrar_precios_aprobador === 'boolean' ? extra.mostrar_precios_aprobador : true
      );
    }
    if (usuariosRes.status === 'fulfilled' && usuariosRes.value.data) {
      setUsuarios(usuariosRes.value.data as Usuario[]);
    }
    if (sedesRes.status === 'fulfilled' && sedesRes.value.data) {
      const sedesData = sedesRes.value.data.map((s: { id: string; nombre_sede: string; ciudad: string | null }) => ({
        id: s.id,
        nombre: s.nombre_sede,
        ciudad: s.ciudad,
      }));
      setSedes(sedesData);
    }

    if (asesoresRes.status === 'fulfilled' && asesoresRes.value.data) {
      setAsesores(asesoresRes.value.data as Asesor[]);
    }

    if (asignacionesRes.status === 'fulfilled' && asignacionesRes.value.data) {
      setAsesoresAsignados(
        (asignacionesRes.value.data as AsesorAsignacion[]).map((asignacion) => asignacion.usuario_id)
      );
    }

    if (productosAuthRes.status === 'fulfilled' && productosAuthRes.value.data) {
      const idsActivos = (productosAuthRes.value.data as { odoo_product_id: number; activo: boolean }[])
        .filter((item) => item.activo)
        .map((item) => item.odoo_product_id);
      setProductosAutorizadosSeleccionados(new Set(idsActivos));
    }

    setLoading(false);
  }, [empresaId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    const fetchMargenes = async () => {
      setLoadingMargenes(true);
      try {
        const res = await fetch(`/api/admin/empresas/${empresaId}/margenes`);
        const data = await res.json();
        if (res.ok && Array.isArray(data.margenes)) {
          setMargenes(data.margenes);
        }
      } catch {
        // silencioso
      } finally {
        setLoadingMargenes(false);
      }
    };
    void fetchMargenes();
  }, [empresaId]);

  useEffect(() => {
    const fetchPricelists = async () => {
      setLoadingPricelists(true);
      try {
        const res = await fetch('/api/odoo/pricelists');
        const data = await res.json();
        if (res.ok && Array.isArray(data.pricelists)) {
          setPricelistsOdoo(data.pricelists);
        }
      } catch {
        // silencioso
      } finally {
        setLoadingPricelists(false);
      }
    };
    void fetchPricelists();
  }, []);

  const handleLogoUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    if (!LOGO_ALLOWED_MIME_TYPES.has(file.type)) {
      setLogoUploadError('Formato no permitido. Usa PNG, JPG, WEBP o SVG.');
      return;
    }

    if (file.size > LOGO_MAX_SIZE_BYTES) {
      setLogoUploadError('El archivo supera el límite de 2MB.');
      return;
    }

    setUploadingLogo(true);
    setLogoUploadError(null);

    try {
      const extension = getLogoFileExtension(file);
      const filePath = `${empresaId}/logo-${Date.now()}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from(LOGOS_BUCKET)
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
          contentType: file.type || undefined,
        });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      const { data: publicUrlData } = supabase.storage
        .from(LOGOS_BUCKET)
        .getPublicUrl(filePath);

      const publicUrl = publicUrlData.publicUrl;

      if (!publicUrl) {
        throw new Error('No se pudo obtener la URL pública del logo.');
      }

      const { data: updatedConfig, error: configError } = await supabase
        .from('empresa_configs')
        .upsert(
          {
            empresa_id: empresaId,
            logo_url: publicUrl,
          },
          { onConflict: 'empresa_id' }
        )
        .select('*')
        .single();

      if (configError || !updatedConfig) {
        throw new Error(configError?.message || 'No se pudo guardar el logo en la configuración.');
      }

      setConfig(normalizeEmpresaConfig(updatedConfig as Record<string, unknown>));
      setToast('Logo cargado y asociado correctamente.');
      setTimeout(() => setToast(null), 3000);
    } catch (error) {
      setLogoUploadError(error instanceof Error ? error.message : 'No se pudo subir el logo.');
    } finally {
      setUploadingLogo(false);
    }
  };

  const closeCreateUserModal = () => {
    setShowCreateUserModal(false);
    setCreateUserError(null);
    setNewUserForm(initialUserFormState);
  };

  const closeActivateAsesorAccessModal = () => {
    setShowActivateAsesorAccessModal(false);
    setActivateAsesorAccessError(null);
    setSelectedAsesorForAccess(null);
    setActivateAsesorAccessForm(initialActivateAsesorAccessFormState);
  };

  const openActivateAsesorAccessModal = (asesor: Asesor) => {
    setSelectedAsesorForAccess(asesor);
    setActivateAsesorAccessError(null);
    setActivateAsesorAccessForm(initialActivateAsesorAccessFormState);
    setShowActivateAsesorAccessModal(true);
  };

  const handleCreateUser = async () => {
    if (!empresa) return;

    const nombre = newUserForm.nombre.trim();
    const apellido = newUserForm.apellido.trim();
    const email = newUserForm.email.trim().toLowerCase();
    const password = newUserForm.password;
    const requiereSede = newUserForm.rol === 'comprador' && empresa.usa_sedes;

    if (!nombre || !apellido || !email || !password) {
      setCreateUserError('Completa nombre, apellido, email y contraseña temporal.');
      return;
    }

    if (password.length < 8) {
      setCreateUserError('La contraseña temporal debe tener al menos 8 caracteres.');
      return;
    }

    if (requiereSede && !newUserForm.sede_id) {
      setCreateUserError('Debes asignar una sede al usuario comprador.');
      return;
    }

    setCreatingUser(true);
    setCreateUserError(null);

    try {
      const response = await fetch(`/api/admin/empresas/${empresaId}/usuarios`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          nombre,
          apellido,
          email,
          password,
          rol: newUserForm.rol,
          sede_id: newUserForm.rol === 'comprador' ? (newUserForm.sede_id || null) : null,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        setCreateUserError(result.error || 'No se pudo crear el usuario.');
        return;
      }

      await fetchData();
      closeCreateUserModal();
      setToast(`Usuario ${result.usuario?.email || email} creado correctamente.`);
      setTimeout(() => setToast(null), 3000);
    } catch (error) {
      setCreateUserError(error instanceof Error ? error.message : 'No se pudo crear el usuario.');
    } finally {
      setCreatingUser(false);
    }
  };

  const handleActivarAccesoAsesor = async () => {
    if (!selectedAsesorForAccess) return;

    const password = activateAsesorAccessForm.password;

    if (password.length < 8) {
      setActivateAsesorAccessError('La contraseña temporal debe tener al menos 8 caracteres.');
      return;
    }

    setActivatingAsesorId(selectedAsesorForAccess.id);
    setActivateAsesorAccessError(null);

    try {
      const response = await fetch(
        `/api/admin/empresas/${empresaId}/asesores/${selectedAsesorForAccess.id}/activar-acceso`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            password,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        setActivateAsesorAccessError(result.error || 'No se pudo activar el acceso del asesor.');
        return;
      }

      await fetchData();
      closeActivateAsesorAccessModal();
      setToast(result.message || `Acceso actualizado para ${selectedAsesorForAccess.email || 'el asesor'}.`);
      setTimeout(() => setToast(null), 3000);
    } catch (error) {
      setActivateAsesorAccessError(
        error instanceof Error ? error.message : 'No se pudo activar el acceso del asesor.'
      );
    } finally {
      setActivatingAsesorId(null);
    }
  };

  const handleSincronizarAsesorOdoo = async () => {
    setSyncingOdooAsesor(true);

    try {
      const response = await fetch(`/api/admin/empresas/${empresaId}/asesores/sincronizar-odoo`, {
        method: 'POST',
      });

      const result = await response.json();

      if (!response.ok) {
        setToast(result.error || 'No se pudo sincronizar el asesor desde Odoo.');
        setTimeout(() => setToast(null), 5000);
        return;
      }

      await fetchData();

      const asesorSincronizado = result.asesor as Asesor | undefined;

      if (asesorSincronizado && !asesorSincronizado.auth_id) {
        openActivateAsesorAccessModal(asesorSincronizado);
      }

      setToast(result.warning ? `${result.message} ${result.warning}` : result.message || 'Asesor sincronizado correctamente.');
      setTimeout(() => setToast(null), 5000);
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'No se pudo sincronizar el asesor desde Odoo.');
      setTimeout(() => setToast(null), 5000);
    } finally {
      setSyncingOdooAsesor(false);
    }
  };

  const fetchProductosOdoo = useCallback(async () => {
    const partnerId = partnerIdProductos;

    if (!partnerId) {
      setProductosOdoo([]);
      setErrorProductosOdoo(null);
      setAvisoProductosOdoo(null);
      setPartnerOdooContext(null);
      setEtiquetasProductoOdoo([]);
      return;
    }

    setLoadingProductosOdoo(true);
    setErrorProductosOdoo(null);
    setAvisoProductosOdoo(null);

    try {
      const paramsPartner = new URLSearchParams({
        partner_id: String(partnerId),
        limit: '500',
        include_tag_names: 'true',
      });

      const pricelistOverride = config?.odoo_pricelist_id ? parseInt(config.odoo_pricelist_id, 10) : NaN;
      if (Number.isFinite(pricelistOverride) && pricelistOverride > 0) {
        paramsPartner.set('pricelist_id', String(pricelistOverride));
      }

      const resPartner = await fetch(`/api/odoo/productos?${paramsPartner.toString()}`);
      const dataPartner = await resPartner.json();

      if (!resPartner.ok) {
        throw new Error(dataPartner.error || 'No se pudieron cargar productos desde Odoo');
      }

      setPartnerOdooContext((dataPartner.partner_context || null) as OdooPartnerContext | null);
      setEtiquetasProductoOdoo(
        Array.isArray(dataPartner.etiquetas_producto)
          ? (dataPartner.etiquetas_producto as OdooProductTagOption[])
          : []
      );

      const productosPartner = (dataPartner.productos || []) as ProductoEmpresaOdoo[];

      if (productosPartner.length > 0) {
        setProductosOdoo(productosPartner);
        return;
      }

      const paramsGeneral = new URLSearchParams({
        limit: '500',
        include_tag_names: 'true',
      });

      const resGeneral = await fetch(`/api/odoo/productos?${paramsGeneral.toString()}`);
      const dataGeneral = await resGeneral.json();

      if (!resGeneral.ok) {
        throw new Error(dataGeneral.error || 'No se pudo cargar catálogo general desde Odoo');
      }

      const productosGenerales = (dataGeneral.productos || []) as ProductoEmpresaOdoo[];
      setEtiquetasProductoOdoo(
        Array.isArray(dataGeneral.etiquetas_producto)
          ? (dataGeneral.etiquetas_producto as OdooProductTagOption[])
          : []
      );
      setProductosOdoo(productosGenerales);
      if (productosGenerales.length > 0) {
        setAvisoProductosOdoo(
          `El partner Odoo ${partnerId} no devolvió coincidencias por etiquetas. Se muestra catálogo general para diagnóstico.`
        );
      }
    } catch (err) {
      setPartnerOdooContext(null);
      setEtiquetasProductoOdoo([]);
      setErrorProductosOdoo(err instanceof Error ? err.message : 'Error cargando productos Odoo');
    } finally {
      setLoadingProductosOdoo(false);
    }
  }, [partnerIdProductos, config?.odoo_pricelist_id]);

  useEffect(() => {
    void fetchProductosOdoo();
  }, [fetchProductosOdoo]);

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);

    const configuracionExtraBase =
      config.configuracion_extra && typeof config.configuracion_extra === 'object'
        ? config.configuracion_extra
        : {};
    const configuracionExtraPortal = {
      ...configuracionExtraBase,
      restringir_catalogo_portal: restringirCatalogoPortal,
      mostrar_precios_comprador: mostrarPreciosCompradorPortal,
      mostrar_precios_aprobador: mostrarPreciosAprobadorPortal,
    };

    const { error } = await supabase
      .from('empresa_configs')
      .update({
        color_primario: config.color_primario,
        logo_url: config.logo_url,
        monto_aprobacion: config.monto_aprobacion,
        control_presupuesto: config.control_presupuesto,
        odoo_partner_id: config.odoo_partner_id,
        odoo_pricelist_id: config.odoo_pricelist_id,
        modulos_activos: config.modulos_activos,
        configuracion_extra: configuracionExtraPortal,
      })
      .eq('empresa_id', empresaId);

    // Guardar requiere_aprobacion directamente en empresas (el trigger de pedidos lee de ahí)
    const { error: empresaSyncError } = await supabase
      .from('empresas')
      .update({ requiere_aprobacion: empresa?.requiere_aprobacion ?? true })
      .eq('id', empresaId);

    let partnerUpdateError: string | null = null;
    const partnerDesdeConfig = Number(config.odoo_partner_id);
    if (Number.isFinite(partnerDesdeConfig) && partnerDesdeConfig > 0) {
      const { error: empresaUpdateError } = await supabase
        .from('empresas')
        .update({ odoo_partner_id: partnerDesdeConfig })
        .eq('id', empresaId);

      if (empresaUpdateError) {
        partnerUpdateError = empresaUpdateError.message;
      } else {
        setEmpresa((prev) => (prev ? { ...prev, odoo_partner_id: partnerDesdeConfig } : prev));
      }
    }

    setSaving(false);

    if (!error && !partnerUpdateError && !empresaSyncError) {
      setConfig((prev) => (prev ? { ...prev, configuracion_extra: configuracionExtraPortal } : prev));
      setToast('Cambios guardados correctamente.');
    } else {
      setToast(empresaSyncError?.message || partnerUpdateError || error?.message || 'No se pudieron guardar todos los cambios.');
    }
    setTimeout(() => setToast(null), 3000);
  };

  const handleGuardarAsesores = async () => {
    setSavingAsesores(true);

    const { data: actuales, error: actualesError } = await supabase
      .from('asesor_empresas')
      .select('usuario_id, activo')
      .eq('empresa_id', empresaId);

    if (actualesError) {
      setSavingAsesores(false);
      setToast('No se pudieron cargar las asignaciones actuales de asesores.');
      setTimeout(() => setToast(null), 3000);
      return;
    }

    const selectedSet = new Set(asesoresAsignados);

    if (asesoresAsignados.length > 0) {
      const payload = asesoresAsignados.map((asesorId) => ({
        usuario_id: asesorId,
        empresa_id: empresaId,
        activo: true,
      }));

      const { error: upsertError } = await supabase
        .from('asesor_empresas')
        .upsert(payload, { onConflict: 'usuario_id,empresa_id' });

      if (upsertError) {
        setSavingAsesores(false);
        setToast('No se pudo guardar la asignación de asesores.');
        setTimeout(() => setToast(null), 3000);
        return;
      }
    }

    const activosNoSeleccionados = (actuales || [])
      .filter((row: { usuario_id: string; activo: boolean }) => row.activo && !selectedSet.has(row.usuario_id))
      .map((row: { usuario_id: string; activo: boolean }) => row.usuario_id);

    if (activosNoSeleccionados.length > 0) {
      const { error: deactivateError } = await supabase
        .from('asesor_empresas')
        .update({ activo: false })
        .eq('empresa_id', empresaId)
        .in('usuario_id', activosNoSeleccionados);

      if (deactivateError) {
        setSavingAsesores(false);
        setToast('No se pudo actualizar la desasignación de asesores.');
        setTimeout(() => setToast(null), 3000);
        return;
      }
    }

    setSavingAsesores(false);
    setToast('Asignación de asesores actualizada correctamente.');
    setTimeout(() => setToast(null), 3000);
  };

  const handleToggleProductoAutorizado = (productoId: number) => {
    setProductosAutorizadosSeleccionados((prev) => {
      const next = new Set(prev);
      if (next.has(productoId)) {
        next.delete(productoId);
      } else {
        next.add(productoId);
      }
      return next;
    });
  };

  const handleGuardarReglasPortal = async () => {
    if (!config) return;

    setSavingProductosPortal(true);

    const configuracionExtraBase =
      config.configuracion_extra && typeof config.configuracion_extra === 'object'
        ? config.configuracion_extra
        : {};
    const configuracionExtraPortal = {
      ...configuracionExtraBase,
      restringir_catalogo_portal: restringirCatalogoPortal,
      mostrar_precios_comprador: mostrarPreciosCompradorPortal,
      mostrar_precios_aprobador: mostrarPreciosAprobadorPortal,
    };

    const seleccionados = Array.from(productosAutorizadosSeleccionados);

    const { data: existentes, error: existentesError } = await supabase
      .from('productos_autorizados')
      .select('odoo_product_id, activo')
      .eq('empresa_id', empresaId);

    if (existentesError) {
      setSavingProductosPortal(false);
      setToast('No se pudieron cargar los productos autorizados actuales.');
      setTimeout(() => setToast(null), 3000);
      return;
    }

    const payload = seleccionados.map((productId) => {
      const producto = productosOdoo.find((item) => item.id === productId);
      const categoriaNombre = Array.isArray(producto?.categ_id) ? producto.categ_id[1] : null;

      return {
        empresa_id: empresaId,
        odoo_product_id: productId,
        categoria: mapCategoriaAutorizada(categoriaNombre),
        activo: true,
      };
    });

    if (payload.length > 0) {
      const { error: upsertError } = await supabase
        .from('productos_autorizados')
        .upsert(payload, { onConflict: 'empresa_id,odoo_product_id' });

      if (upsertError) {
        setSavingProductosPortal(false);
        setToast('No se pudieron guardar los productos visibles en portal.');
        setTimeout(() => setToast(null), 3000);
        return;
      }
    }

    const seleccionSet = new Set(seleccionados);
    const desactivarIds = (existentes || [])
      .filter((item: { odoo_product_id: number; activo: boolean }) => item.activo && !seleccionSet.has(item.odoo_product_id))
      .map((item: { odoo_product_id: number; activo: boolean }) => item.odoo_product_id);

    if (desactivarIds.length > 0) {
      const { error: desactivarError } = await supabase
        .from('productos_autorizados')
        .update({ activo: false })
        .eq('empresa_id', empresaId)
        .in('odoo_product_id', desactivarIds);

      if (desactivarError) {
        setSavingProductosPortal(false);
        setToast('No se pudieron desactivar productos fuera de la selección.');
        setTimeout(() => setToast(null), 3000);
        return;
      }
    }

    const { error: configError } = await supabase
      .from('empresa_configs')
      .update({ configuracion_extra: configuracionExtraPortal })
      .eq('empresa_id', empresaId);

    setSavingProductosPortal(false);

    if (configError) {
      setToast('Productos guardados, pero falló la actualización de reglas de precios del portal.');
      setTimeout(() => setToast(null), 3000);
      return;
    }

    setConfig((prev) => (prev ? { ...prev, configuracion_extra: configuracionExtraPortal } : prev));
    setToast('Reglas del portal actualizadas correctamente.');
    setTimeout(() => setToast(null), 3000);
  };

  const categoriasMap = new Map<number, string>();
  productosOdoo.forEach((producto) => {
    if (Array.isArray(producto.categ_id)) {
      categoriasMap.set(producto.categ_id[0], producto.categ_id[1]);
    }
  });
  const categoriasProductoDisponibles = Array.from(categoriasMap.entries());

  const etiquetasProductoDisponibles =
    etiquetasProductoOdoo.length > 0
      ? etiquetasProductoOdoo.map((tag) => [tag.id, tag.name] as [number, string])
      : Array.from(
          new Map(
            productosOdoo.flatMap((producto) => {
              if (Array.isArray(producto.product_tags) && producto.product_tags.length > 0) {
                return producto.product_tags;
              }
              return (producto.product_tag_ids || []).map((tagId) => [tagId, `Etiqueta ${tagId}`] as [number, string]);
            })
          ).entries()
        );

  const productosFiltrados = productosOdoo.filter((producto) => {
    const q = busquedaProducto.trim().toLowerCase();
    if (q) {
      const matchEtiquetas =
        Array.isArray(producto.product_tags) &&
        producto.product_tags.some(([, tagName]) => tagName.toLowerCase().includes(q));
      const matchBusqueda =
        producto.name.toLowerCase().includes(q) ||
        (typeof producto.default_code === 'string' && producto.default_code.toLowerCase().includes(q)) ||
        (typeof producto.description_sale === 'string' && producto.description_sale.toLowerCase().includes(q)) ||
        matchEtiquetas;

      if (!matchBusqueda) return false;
    }

    if (categoriaProductoFiltro !== 'todos') {
      if (!Array.isArray(producto.categ_id) || producto.categ_id[0] !== categoriaProductoFiltro) {
        return false;
      }
    }

    if (etiquetaProductoFiltro !== 'todos') {
      if (!(producto.product_tag_ids || []).includes(etiquetaProductoFiltro)) {
        return false;
      }
    }

    return true;
  });

  const asesorCoincideComercial = Boolean(
    empresa?.odoo_comercial_id && asesores.some((asesor) => asesor.odoo_user_id === empresa.odoo_comercial_id)
  );

  const totalSeleccionadosPortal = productosAutorizadosSeleccionados.size;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!empresa) {
    return (
      <div className="text-center py-20">
        <p className="text-slate-500">Empresa no encontrada.</p>
        <Link href="/admin/empresas" className="text-primary text-sm font-medium mt-2 inline-block">Volver a empresas</Link>
      </div>
    );
  }

  return (
    <div>
      {/* Top Header */}
      <div className="flex flex-wrap justify-between items-center gap-4 mb-8">
        <div>
          <nav className="flex text-xs font-medium text-slate-400 mb-1">
            <Link href="/admin/empresas" className="hover:text-primary transition">Clientes</Link>
            <span className="mx-2">/</span>
            <span className="hover:text-primary cursor-pointer transition">{empresa.nombre}</span>
            <span className="mx-2">/</span>
            <span className="text-primary">Configuración</span>
          </nav>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            Configuración de Cliente: {empresa.nombre}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/admin/empresas" className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-900 transition flex items-center gap-1">
            <ArrowLeft className="w-4 h-4" />
            Volver
          </Link>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 bg-primary hover:bg-primary-dark text-white px-5 py-2 rounded-lg text-sm font-semibold shadow-md shadow-primary/20 transition-all active:scale-95 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Guardar Cambios
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Sidebar Navigation */}
        <aside className="hidden lg:block lg:col-span-3">
          <nav className="sticky top-24 space-y-1">
            {sectionNav.map((section) => {
              const Icon = section.icon;
              return (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  onClick={() => setActiveSection(section.id)}
                  className={`group flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                    activeSection === section.id
                      ? 'bg-primary/10 text-primary'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  {section.label}
                </a>
              );
            })}
          </nav>
        </aside>

        {/* Configuration Forms */}
        <div className="col-span-1 lg:col-span-9 space-y-8">
          {/* Section 1: Marca Visual */}
          <section id="branding" className="scroll-mt-24 bg-white rounded-xl shadow-sm border border-border overflow-hidden">
            <div className="px-6 py-5 border-b border-border bg-slate-50/50 flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Marca Visual</h2>
                <p className="text-sm text-slate-500 mt-1">Personalice la apariencia del portal del cliente.</p>
              </div>
              <Palette className="w-5 h-5 text-slate-400" />
            </div>
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Logo Upload */}
              <div className="space-y-4">
                <label className="block text-sm font-medium text-slate-700">Logotipo de la Empresa</label>
                <label
                  htmlFor="empresa-logo-upload"
                  className={`mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-slate-300 border-dashed rounded-lg hover:border-primary transition-colors group bg-slate-50 ${uploadingLogo ? 'cursor-wait opacity-80' : 'cursor-pointer'}`}
                >
                  <input
                    id="empresa-logo-upload"
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    className="sr-only"
                    onChange={handleLogoUpload}
                    disabled={uploadingLogo}
                  />
                  <div className="space-y-2 text-center">
                    <div className="mx-auto h-16 w-16 bg-white rounded-full flex items-center justify-center shadow-sm">
                      {uploadingLogo ? (
                        <Loader2 className="w-6 h-6 text-primary animate-spin" />
                      ) : config?.logo_url ? (
                        <img
                          src={config.logo_url}
                          alt={`Logo de ${empresa?.nombre || 'la empresa'}`}
                          className="h-10 w-auto max-w-full object-contain opacity-90 group-hover:opacity-100 transition-opacity"
                        />
                      ) : (
                        <Upload className="w-6 h-6 text-slate-400" />
                      )}
                    </div>
                    <div className="flex text-sm text-slate-600 justify-center">
                      <span className="font-medium text-primary hover:text-primary-dark">
                        {uploadingLogo ? 'Subiendo logo...' : config?.logo_url ? 'Reemplazar archivo' : 'Subir un archivo'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">PNG, JPG, WEBP o SVG hasta 2MB</p>
                  </div>
                </label>
                {logoUploadError && (
                  <p className="text-xs text-red-600">{logoUploadError}</p>
                )}
                {config?.logo_url && (
                  <div className="rounded-lg border border-border bg-slate-50 px-3 py-2">
                    <p className="text-xs font-medium text-slate-600">Logo publicado</p>
                    <a
                      href={config.logo_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 block truncate text-xs text-primary hover:underline"
                    >
                      {config.logo_url}
                    </a>
                  </div>
                )}
              </div>

              {/* Color Picker */}
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Color Primario</label>
                  <div className="flex items-center gap-3">
                    <div
                      className="h-10 w-10 rounded-lg border border-border shadow-inner"
                      style={{ backgroundColor: config?.color_primario || '#000000' }}
                    />
                    <input
                      className="flex-1 rounded-lg border border-border bg-white text-slate-900 focus:ring-primary focus:border-primary text-sm p-2.5"
                      type="text"
                      value={config?.color_primario || '#000000'}
                      onChange={(e) => config && setConfig({ ...config, color_primario: e.target.value })}
                    />
                  </div>
                  <p className="text-xs text-slate-500 mt-2">Este color se usará para botones y elementos activos.</p>
                </div>
                {/* Preview */}
                <div className="p-4 rounded-lg bg-slate-100 border border-border">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Vista Previa</p>
                  <button
                    className="w-full text-white px-4 py-2 rounded text-sm font-medium shadow-sm hover:opacity-90 transition"
                    style={{ backgroundColor: config?.color_primario || '#000000' }}
                  >
                    Botón de Ejemplo
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* Section 2: Reglas de Negocio */}
          <section id="logic" className="scroll-mt-24 bg-white rounded-xl shadow-sm border border-border overflow-hidden">
            <div className="px-6 py-5 border-b border-border bg-slate-50/50 flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Reglas de Negocio</h2>
                <p className="text-sm text-slate-500 mt-1">Defina los flujos de aprobación y límites.</p>
              </div>
              <Scale className="w-5 h-5 text-slate-400" />
            </div>
            <div className="divide-y divide-border">
              {/* Aprobación de Gerente */}
              <div className="p-6 flex items-start justify-between gap-4">
                <div className="flex-1">
                  <h3 className="text-base font-semibold text-slate-900">Requerir Aprobación de Gerente</h3>
                  <p className="text-sm text-slate-500 mt-1">Los pedidos superiores a cierto monto requerirán aprobación manual.</p>
                  {empresa?.requiere_aprobacion && (
                    <div className="mt-4 flex items-center gap-3">
                      <span className="text-sm font-medium text-slate-600">Monto mínimo: $</span>
                      <input
                        className="w-40 rounded-lg border border-border bg-white text-slate-900 focus:ring-primary focus:border-primary text-sm p-2"
                        type="number"
                        value={config?.monto_aprobacion || 0}
                        onChange={(e) => config && setConfig({ ...config, monto_aprobacion: Number(e.target.value) })}
                      />
                    </div>
                  )}
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={empresa?.requiere_aprobacion || false}
                    onChange={(e) => empresa && setEmpresa({ ...empresa, requiere_aprobacion: e.target.checked })}
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary" />
                </label>
              </div>

              {/* Control de Presupuesto */}
              <div className="p-6 flex items-start justify-between gap-4">
                <div className="flex-1">
                  <h3 className="text-base font-semibold text-slate-900">Control de Presupuesto Mensual</h3>
                  <p className="text-sm text-slate-500 mt-1">Impedir compras si se excede el presupuesto asignado a la sucursal.</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={config?.control_presupuesto || false}
                    onChange={(e) => config && setConfig({ ...config, control_presupuesto: e.target.checked })}
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary" />
                </label>
              </div>
            </div>
          </section>

          {/* Section 3: Integración Odoo */}
          <section id="odoo" className="scroll-mt-24 bg-white rounded-xl shadow-sm border border-border overflow-hidden">
            <div className="px-6 py-5 border-b border-border bg-slate-50/50 flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Integración Odoo</h2>
                <p className="text-sm text-slate-500 mt-1">Conexión con el sistema ERP para sincronización.</p>
              </div>
              <RefreshCw className="w-5 h-5 text-slate-400" />
            </div>
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="col-span-1 md:col-span-2 bg-blue-50 border border-blue-200 rounded-lg p-4 flex gap-3">
                <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-bold text-blue-800">Estado de Conexión</h4>
                  <p className="text-xs text-blue-700 mt-1">Sin configurar para esta empresa.</p>
                </div>
                <button className="ml-auto text-xs font-semibold text-blue-700 hover:text-blue-900 underline whitespace-nowrap">Probar Conexión</button>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Odoo Partner ID</label>
                <div className="relative rounded-md shadow-sm">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <span className="text-slate-500 text-sm">#</span>
                  </div>
                  <input
                    className="block w-full rounded-lg border border-border pl-7 py-2.5 bg-white text-slate-900 focus:ring-primary focus:border-primary text-sm"
                    type="number"
                    placeholder="10452"
                    value={config?.odoo_partner_id || ''}
                    onChange={(e) => config && setConfig({ ...config, odoo_partner_id: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Lista de Precios</label>
                <select
                  className="block w-full rounded-lg border border-border py-2.5 px-3 bg-white text-slate-900 focus:ring-primary focus:border-primary text-sm"
                  value={config?.odoo_pricelist_id || ''}
                  onChange={(e) => config && setConfig({ ...config, odoo_pricelist_id: e.target.value || null })}
                  disabled={loadingPricelists}
                >
                  <option value="">
                    {partnerOdooContext?.pricelist
                      ? `— Automática: ${partnerOdooContext.pricelist.name} (ID ${partnerOdooContext.pricelist.id}) —`
                      : '— Sin lista asignada en Odoo —'}
                  </option>
                  {pricelistsOdoo.map((pl) => (
                    <option key={pl.id} value={String(pl.id)}>
                      {pl.name}{pl.currency ? ` (${pl.currency})` : ''}
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-xs text-slate-500">
                  {loadingPricelists
                    ? 'Cargando listas de precios desde Odoo...'
                    : partnerOdooContext?.pricelist
                      ? `Pricelist del partner en Odoo: ${partnerOdooContext.pricelist.name} (ID ${partnerOdooContext.pricelist.id})`
                      : 'Si no seleccionas ninguna, se usa la asignada al partner en Odoo.'}
                </p>
              </div>

              <div className="col-span-1 md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-2">Comercial asignado en Odoo</label>
                <div className="rounded-lg border border-border bg-slate-50 p-3">
                  {empresa.odoo_comercial_id ? (
                    <>
                      <p className="text-sm font-medium text-slate-900">{empresa.odoo_comercial_nombre || 'Comercial sin nombre'}</p>
                      <p className="text-xs text-slate-500 font-mono mt-1">ID Odoo: {empresa.odoo_comercial_id}</p>
                    </>
                  ) : (
                    <p className="text-sm text-slate-500">Sin comercial asignado desde Odoo.</p>
                  )}
                </div>
              </div>

              <div className="col-span-1 md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-2">Categorías Autorizadas</label>
                <div className="p-3 border border-border rounded-lg bg-white min-h-[80px]">
                  <div className="flex flex-wrap gap-2">
                    {(config?.modulos_activos || []).map((mod) => (
                      <span key={mod} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary border border-primary/20">
                        {mod}
                        <button
                          onClick={() => config && setConfig({ ...config, modulos_activos: config.modulos_activos.filter(m => m !== mod) })}
                          className="group relative -mr-1 h-3.5 w-3.5 rounded-sm hover:bg-primary/20"
                        >
                          <X className="h-3.5 w-3.5 stroke-primary/70" />
                        </button>
                      </span>
                    ))}
                    <input
                      className="border-0 bg-transparent p-0 text-sm placeholder:text-slate-400 focus:ring-0 w-32"
                      placeholder="+ Agregar categoría"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && e.currentTarget.value.trim() && config) {
                          setConfig({ ...config, modulos_activos: [...config.modulos_activos, e.currentTarget.value.trim()] });
                          e.currentTarget.value = '';
                        }
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Section 4: Empresas y Sucursales */}
          <section id="productos" className="scroll-mt-24 bg-white rounded-xl shadow-sm border border-border overflow-hidden">
            <div className="px-6 py-5 border-b border-border bg-slate-50/50 flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Productos Odoo disponibles</h2>
                <p className="text-sm text-slate-500 mt-1">
                  Catálogo filtrado por partner Odoo del cliente, con imagen, categoría y etiquetas.
                </p>
              </div>
              <Package className="w-5 h-5 text-slate-400" />
            </div>

            <div className="p-6 space-y-4">
              <div className="rounded-lg border border-border bg-slate-50 p-4 space-y-3">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Reglas de visualización del portal cliente</p>
                    <p className="text-xs text-slate-500 mt-1">
                      Define si el catálogo se restringe a selección y quién ve precios en el portal de esta empresa.
                    </p>
                  </div>
                  <button
                    onClick={handleGuardarReglasPortal}
                    disabled={savingProductosPortal || loadingProductosOdoo}
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
                  >
                    {savingProductosPortal ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    Guardar reglas portal
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                  <label className="flex items-center justify-between rounded-lg border border-border bg-white px-3 py-2">
                    <span className="text-slate-700">Restringir catálogo a selección</span>
                    <input
                      type="checkbox"
                      checked={restringirCatalogoPortal}
                      onChange={(e) => setRestringirCatalogoPortal(e.target.checked)}
                    />
                  </label>
                  <label className="flex items-center justify-between rounded-lg border border-border bg-white px-3 py-2">
                    <span className="text-slate-700">Precios visibles para sucursales</span>
                    <input
                      type="checkbox"
                      checked={mostrarPreciosCompradorPortal}
                      onChange={(e) => setMostrarPreciosCompradorPortal(e.target.checked)}
                    />
                  </label>
                  <label className="flex items-center justify-between rounded-lg border border-border bg-white px-3 py-2">
                    <span className="text-slate-700">Precios visibles para aprobador</span>
                    <input
                      type="checkbox"
                      checked={mostrarPreciosAprobadorPortal}
                      onChange={(e) => setMostrarPreciosAprobadorPortal(e.target.checked)}
                    />
                  </label>
                </div>

                <p className="text-xs text-slate-500">
                  Seleccionados para portal: <strong>{totalSeleccionadosPortal}</strong>. Si no activas la restricción,
                  el portal seguirá mostrando todo el catálogo.
                </p>
              </div>

              <div className="rounded-lg border border-border bg-white p-4 space-y-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Contexto del cliente en Odoo</p>
                    <p className="text-xs text-slate-500 mt-1">
                      Aquí ves la lista de precios y las etiquetas activas del partner. Estas etiquetas son las que se usan
                      para filtrar el catálogo del cliente; el selector inferior filtra etiquetas de producto.
                    </p>
                  </div>
                  <button
                    onClick={() => void fetchProductosOdoo()}
                    disabled={!partnerIdProductos || loadingProductosOdoo}
                    className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-primary hover:text-primary disabled:opacity-50"
                  >
                    {loadingProductosOdoo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    Actualizar desde Odoo
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="rounded-lg border border-border bg-slate-50 px-4 py-3">
                    <p className="text-xs text-slate-500 uppercase tracking-wide">Partner Odoo</p>
                    <p className="text-sm font-semibold text-slate-900 mt-1">
                      {partnerOdooContext?.name || (partnerIdProductos ? `ID ${partnerIdProductos}` : 'Sin configurar')}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border bg-slate-50 px-4 py-3">
                    <p className="text-xs text-slate-500 uppercase tracking-wide">Lista de precios actual</p>
                    <p className="text-sm font-semibold text-slate-900 mt-1">
                      {partnerOdooContext?.pricelist ? partnerOdooContext.pricelist.name : 'Sin lista asignada'}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      {partnerOdooContext?.pricelist ? `ID Odoo: ${partnerOdooContext.pricelist.id}` : 'Se consulta directo en Odoo'}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border bg-slate-50 px-4 py-3">
                    <p className="text-xs text-slate-500 uppercase tracking-wide">Etiquetas del cliente</p>
                    <p className="text-sm font-semibold text-slate-900 mt-1">
                      {partnerOdooContext?.partner_tags.length || 0}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">Pulsa actualizar para releerlas desde Odoo.</p>
                  </div>
                </div>

                <div className="rounded-lg border border-dashed border-border bg-slate-50 px-4 py-3">
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Etiquetas activas del cliente en Odoo</p>
                  {partnerOdooContext?.partner_tags.length ? (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {partnerOdooContext.partner_tags.map((tag) => (
                        <span
                          key={tag.id}
                          className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"
                        >
                          <TagIcon className="w-3 h-3" />
                          {tag.name}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-slate-500">
                      {partnerIdProductos
                        ? 'Este partner no tiene etiquetas asignadas en Odoo o todavía no se han recargado.'
                        : 'Configura primero el partner Odoo para consultar sus etiquetas.'}
                    </p>
                  )}
                </div>
              </div>

              {!partnerIdProductos ? (
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center">
                  <p className="text-sm text-slate-500">Esta empresa no tiene configurado Odoo Partner ID.</p>
                </div>
              ) : loadingProductosOdoo ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              ) : errorProductosOdoo ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {errorProductosOdoo}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                    <div className="relative lg:col-span-1">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={busquedaProducto}
                        onChange={(e) => setBusquedaProducto(e.target.value)}
                        placeholder="Buscar por nombre, referencia o descripción"
                        className="w-full rounded-lg border border-border bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900"
                      />
                    </div>

                    <select
                      value={categoriaProductoFiltro}
                      onChange={(e) => setCategoriaProductoFiltro(e.target.value === 'todos' ? 'todos' : Number(e.target.value))}
                      className="rounded-lg border border-border bg-white py-2.5 px-3 text-sm text-slate-700"
                    >
                      <option value="todos">Todas las categorías</option>
                      {categoriasProductoDisponibles.map(([categoriaId, categoriaNombre]) => (
                        <option key={categoriaId} value={categoriaId}>
                          {categoriaNombre}
                        </option>
                      ))}
                    </select>

                    <select
                      value={etiquetaProductoFiltro}
                      onChange={(e) => setEtiquetaProductoFiltro(e.target.value === 'todos' ? 'todos' : Number(e.target.value))}
                      className="rounded-lg border border-border bg-white py-2.5 px-3 text-sm text-slate-700"
                    >
                      <option value="todos">Todas las etiquetas de producto</option>
                      {etiquetasProductoDisponibles.map(([etiquetaId, etiquetaNombre]) => (
                        <option key={etiquetaId} value={etiquetaId}>
                          {etiquetaNombre}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>Partner Odoo: {partnerIdProductos}</span>
                    <span>
                      Mostrando {productosFiltrados.length} de {productosOdoo.length} productos
                    </span>
                  </div>

                  {avisoProductosOdoo && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                      {avisoProductosOdoo}
                    </div>
                  )}

                  {productosFiltrados.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center">
                      <p className="text-sm text-slate-500">No hay productos que cumplan los filtros actuales.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                      {productosFiltrados.map((producto) => (
                        <article key={producto.id} className="rounded-xl border border-border bg-white overflow-hidden relative">
                          <div className="h-40 bg-slate-50 flex items-center justify-center border-b border-border">
                            <label className="absolute z-10 right-2 top-2 inline-flex items-center gap-1 rounded-full bg-white/95 px-2 py-1 text-[11px] font-medium text-slate-700 border border-border">
                              <input
                                type="checkbox"
                                checked={productosAutorizadosSeleccionados.has(producto.id)}
                                onChange={() => handleToggleProductoAutorizado(producto.id)}
                              />
                              Portal
                            </label>

                            {producto.image_128 ? (
                              <img
                                src={`data:image/png;base64,${producto.image_128}`}
                                alt={producto.name}
                                className="h-full w-full object-contain p-3"
                              />
                            ) : (
                              <div className="text-xs text-slate-400">Sin imagen</div>
                            )}
                          </div>

                          <div className="p-4 space-y-2">
                            <div className="flex items-start justify-between gap-3">
                              <h3 className="text-sm font-semibold text-slate-900 leading-5">{producto.name}</h3>
                              <span className="text-xs font-medium text-primary whitespace-nowrap">
                                {new Intl.NumberFormat('es-CO', {
                                  style: 'currency',
                                  currency: 'COP',
                                  maximumFractionDigits: 0,
                                }).format(producto.list_price || 0)}
                              </span>
                            </div>

                            <p className="text-xs text-slate-500">
                              Ref: {typeof producto.default_code === 'string' ? producto.default_code : '—'}
                            </p>

                            {Array.isArray(producto.categ_id) && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">
                                <Package className="w-3 h-3" />
                                {producto.categ_id[1]}
                              </span>
                            )}

                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {(Array.isArray(producto.product_tags) ? producto.product_tags : []).map(([tagId, tagName]) => (
                                <span
                                  key={`${producto.id}-${tagId}`}
                                  className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"
                                >
                                  <TagIcon className="w-3 h-3" />
                                  {tagName}
                                </span>
                              ))}
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </section>

          {/* Section 4: Empresas y Sucursales */}
          <section id="estructura" className="scroll-mt-24 bg-white rounded-xl shadow-sm border border-border overflow-hidden">
            <div className="px-6 py-5 border-b border-border bg-slate-50/50 flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Empresas y Sucursales</h2>
                <p className="text-sm text-slate-500 mt-1">
                  Visualiza cómo quedó estructurado el cliente en la plataforma (aunque en Odoo venga como contactos o empresas separadas).
                </p>
              </div>
              <Building2 className="w-5 h-5 text-slate-400" />
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-lg border border-border bg-slate-50 px-4 py-3">
                  <p className="text-xs text-slate-500 uppercase tracking-wide">Empresa</p>
                  <p className="text-sm font-semibold text-slate-900 mt-1">{empresa.nombre}</p>
                </div>
                <div className="rounded-lg border border-border bg-slate-50 px-4 py-3">
                  <p className="text-xs text-slate-500 uppercase tracking-wide">NIT</p>
                  <p className="text-sm font-semibold text-slate-900 mt-1">{empresa.nit || '—'}</p>
                </div>
                <div className="rounded-lg border border-border bg-slate-50 px-4 py-3">
                  <p className="text-xs text-slate-500 uppercase tracking-wide">Sedes registradas</p>
                  <p className="text-sm font-semibold text-slate-900 mt-1">{sedes.length}</p>
                </div>
              </div>

              {sedes.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center">
                  <p className="text-sm text-slate-500">No hay sedes asociadas todavía.</p>
                  <p className="text-xs text-slate-400 mt-1">
                    Puedes importarlas desde Odoo en la vista de importar clientes usando el modo &quot;Importar como sede&quot;.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="min-w-full divide-y divide-border text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Sede</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Ciudad</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border bg-white">
                      {sedes.map((sede) => (
                        <tr key={sede.id}>
                          <td className="px-4 py-3 font-medium text-slate-900">{sede.nombre}</td>
                          <td className="px-4 py-3 text-slate-600">{sede.ciudad || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>

          {/* Section 5: Asesores y Clientes */}
          <section id="asesores" className="scroll-mt-24 bg-white rounded-xl shadow-sm border border-border overflow-hidden">
            <div className="px-6 py-5 border-b border-border bg-slate-50/50 flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Asesores y Clientes</h2>
                <p className="text-sm text-slate-500 mt-1">
                  Gestiona manualmente qué asesores atienden esta empresa, incluso si Odoo no está perfectamente organizado.
                </p>
              </div>
              <Users className="w-5 h-5 text-slate-400" />
            </div>

            <div className="p-6 space-y-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-sm text-slate-700">
                  Los asesores se sincronizan desde Odoo como perfiles internos. Desde aquí puedes asignarlos a la
                  empresa y activar su acceso al portal con una contraseña temporal.
                </p>
              </div>

              {empresa.odoo_comercial_id && !asesorCoincideComercial && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="text-sm text-amber-800">
                        Comercial Odoo detectado: <strong>{empresa.odoo_comercial_nombre || 'Sin nombre'}</strong> (ID {empresa.odoo_comercial_id}).
                      </p>
                      <p className="text-xs text-amber-700 mt-1">
                        No existe un asesor local activo con ese <code>odoo_user_id</code>. Puedes sincronizarlo ahora mismo desde Odoo y luego activar sus credenciales.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleSincronizarAsesorOdoo}
                      disabled={syncingOdooAsesor}
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-semibold text-amber-800 transition hover:border-amber-400 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {syncingOdooAsesor ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                      Sincronizar asesor Odoo
                    </button>
                  </div>
                </div>
              )}

              {asesores.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center">
                  <p className="text-sm text-slate-500">No hay asesores activos disponibles para asignar.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {asesores.map((asesor) => {
                    const selected = asesoresAsignados.includes(asesor.id);
                    const accessMeta = getAsesorAccessMeta(asesor);
                    const isOdooCommercial = Boolean(empresa.odoo_comercial_id && asesor.odoo_user_id === empresa.odoo_comercial_id);
                    const hasValidEmail = Boolean(asesor.email?.trim());
                    return (
                      <div
                        key={asesor.id}
                        className={`rounded-lg border px-4 py-3 transition-colors ${
                          selected ? 'border-primary bg-primary/5' : 'border-border bg-white hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">
                              {asesor.nombre} {asesor.apellido}
                            </p>
                            <p className="text-xs text-slate-500">{asesor.email || 'Sin email registrado'}</p>
                            <p className="text-xs text-slate-400 mt-0.5">
                              {asesor.odoo_user_id ? `Odoo user: ${asesor.odoo_user_id}` : 'Sin odoo_user_id'}
                            </p>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <span className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold ${accessMeta.badgeClassName}`}>
                                {accessMeta.label}
                              </span>
                              {selected && (
                                <span className="inline-flex rounded-full border border-primary/20 bg-primary/10 px-2 py-1 text-[11px] font-semibold text-primary">
                                  Asignado a esta empresa
                                </span>
                              )}
                              {isOdooCommercial && (
                                <span className="inline-flex rounded-full border border-blue-200 bg-blue-100 px-2 py-1 text-[11px] font-semibold text-blue-800">
                                  Comercial Odoo detectado
                                </span>
                              )}
                            </div>
                            <p className="mt-2 text-xs text-slate-500">{accessMeta.description}</p>
                          </div>

                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                            <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setAsesoresAsignados((prev) => (prev.includes(asesor.id) ? prev : [...prev, asesor.id]));
                                  } else {
                                    setAsesoresAsignados((prev) => prev.filter((id) => id !== asesor.id));
                                  }
                                }}
                                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                              />
                              Asignado
                            </label>

                            <button
                              type="button"
                              onClick={() => openActivateAsesorAccessModal(asesor)}
                              disabled={!hasValidEmail || Boolean(activatingAsesorId)}
                              className="inline-flex items-center justify-center rounded-lg border border-border bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {asesor.auth_id ? 'Restablecer acceso' : 'Activar acceso'}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="flex justify-end">
                <button
                  onClick={handleGuardarAsesores}
                  disabled={savingAsesores}
                  className="inline-flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                >
                  {savingAsesores ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Guardar Asesores
                </button>
              </div>
            </div>
          </section>

          {/* Section 6: Gestión de Usuarios */}
          <section id="users" className="scroll-mt-24 bg-white rounded-xl shadow-sm border border-border overflow-hidden">
            <div className="px-6 py-5 border-b border-border bg-slate-50/50 flex flex-wrap justify-between items-center gap-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Gestión de Usuarios</h2>
                <p className="text-sm text-slate-500 mt-1">Administre el acceso de gerentes y personal de sucursal.</p>
              </div>
              <button
                onClick={() => {
                  setCreateUserError(null);
                  setShowCreateUserModal(true);
                }}
                className="flex items-center gap-2 bg-white border border-border hover:border-primary text-slate-700 px-4 py-2 rounded-lg text-sm font-semibold transition hover:text-primary shadow-sm"
              >
                <Plus className="w-4 h-4" />
                Agregar Usuario
              </button>
            </div>

            {usuarios.length === 0 ? (
              <div className="p-12 text-center">
                <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="text-sm text-slate-500">No hay usuarios registrados para esta empresa.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-border">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Usuario</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Rol</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Estado</th>
                      <th className="relative px-6 py-3"><span className="sr-only">Acciones</span></th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-border">
                    {usuarios.map((usuario) => {
                      const initials = `${usuario.nombre[0]}${usuario.apellido[0]}`.toUpperCase();
                      return (
                        <tr key={usuario.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm">
                                {initials}
                              </div>
                              <div className="ml-4">
                                <div className="text-sm font-bold text-slate-900">{usuario.nombre} {usuario.apellido}</div>
                                <div className="text-sm text-slate-500">{usuario.email}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-slate-900 font-medium capitalize">{usuario.rol.replace('_', ' ')}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full border ${
                              usuario.activo
                                ? 'bg-green-100 text-green-800 border-green-200'
                                : 'bg-slate-100 text-slate-800 border-slate-200'
                            }`}>
                              {usuario.activo ? 'Activo' : 'Pendiente'}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <button className="text-slate-400 hover:text-primary transition-colors mx-2">
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button className="text-slate-400 hover:text-red-600 transition-colors mx-2">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Section 7: Márgenes de Venta */}
          <section id="margenes" className="scroll-mt-24 bg-white rounded-xl shadow-sm border border-border overflow-hidden">
            <div className="px-6 py-5 border-b border-border bg-slate-50/50 flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Márgenes de Venta</h2>
                <p className="text-sm text-slate-500 mt-1">Porcentaje de ganancia sobre el costo de compra (Odoo) para calcular el precio de venta al cliente.</p>
              </div>
              <Percent className="w-5 h-5 text-slate-400" />
            </div>
            <div className="p-6 space-y-6">
              <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                <strong>Margen por defecto:</strong> aplica a <strong>todos los productos</strong> de la lista de precios del cliente.
                Si necesita un margen distinto para una categoría específica, agréguela por separado.
                <br />
                <span className="text-xs text-blue-600 mt-1 block">Fórmula: precio de venta = costo de compra × (1 + margen% / 100)</span>
              </div>

              {/* Formulario agregar margen */}
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[200px]">
                  <label className="block text-xs font-medium text-slate-600 mb-1">Categoría</label>
                  <select
                    value={nuevoMargenCategId}
                    onChange={(e) => setNuevoMargenCategId(e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-primary/30"
                  >
                    <option value="">Todas las categorías (por defecto)</option>
                    {categoriasProductoDisponibles.map(([id, name]) => (
                      <option key={id} value={String(id)}>{name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Margen %</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="999"
                    value={nuevoMargenPorcentaje}
                    onChange={(e) => setNuevoMargenPorcentaje(e.target.value)}
                    className="w-24 px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary/30"
                  />
                </div>
                <button
                  disabled={savingMargen}
                  onClick={async () => {
                    setSavingMargen(true);
                    try {
                      const catId = nuevoMargenCategId.trim();
                      const res = await fetch(`/api/admin/empresas/${empresaId}/margenes`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          odoo_categ_id: catId === '' ? null : Number(catId),
                          margen_porcentaje: Number(nuevoMargenPorcentaje),
                        }),
                      });
                      if (!res.ok) {
                        const d = await res.json();
                        throw new Error(d.error || 'Error guardando margen');
                      }
                      setNuevoMargenCategId('');
                      setNuevoMargenPorcentaje('20');
                      const r2 = await fetch(`/api/admin/empresas/${empresaId}/margenes`);
                      const d2 = await r2.json();
                      setMargenes(d2.margenes || []);
                      setToast('Margen guardado correctamente.');
                    } catch (err) {
                      alert(err instanceof Error ? err.message : 'Error');
                    } finally {
                      setSavingMargen(false);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50"
                >
                  {savingMargen ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Guardar
                </button>
              </div>

              {categoriasProductoDisponibles.length === 0 && productosOdoo.length === 0 && (
                <p className="text-xs text-amber-600">Las categorías se cargan desde los productos Odoo del cliente. Vaya a la sección &quot;Productos Odoo&quot; para cargarlos primero.</p>
              )}

              {/* Tabla de márgenes */}
              {loadingMargenes ? (
                <div className="text-center py-6">
                  <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto" />
                </div>
              ) : margenes.length === 0 ? (
                <div className="text-center py-6">
                  <Percent className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-500">No hay márgenes configurados. Se usará <strong>20%</strong> por defecto para todos los productos.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-border">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Categoría</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Margen %</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Aplica a</th>
                        <th className="px-4 py-3"><span className="sr-only">Acciones</span></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {margenes.map((m) => {
                        const categName = m.odoo_categ_id !== null ? categoriasMap.get(m.odoo_categ_id) : null;
                        return (
                          <tr key={m.id} className="hover:bg-slate-50">
                            <td className="px-4 py-3 text-sm text-slate-900">
                              {m.odoo_categ_id === null ? (
                                <span className="text-primary font-medium">Por defecto</span>
                              ) : (
                                <span>{categName || `Categoría #${m.odoo_categ_id}`}</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm font-semibold text-slate-900">{m.margen_porcentaje}%</td>
                            <td className="px-4 py-3 text-xs text-slate-500">
                              {m.odoo_categ_id === null
                                ? 'Todos los productos de la lista'
                                : `Solo productos de esta categoría`}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <button
                                onClick={async () => {
                                  if (!confirm('¿Eliminar este margen?')) return;
                                  await fetch(`/api/admin/empresas/${empresaId}/margenes?margen_id=${m.id}`, { method: 'DELETE' });
                                  setMargenes((prev) => prev.filter((x) => x.id !== m.id));
                                  setToast('Margen eliminado.');
                                }}
                                className="text-slate-400 hover:text-red-600 transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>

          <div className="h-12" />
        </div>
      </div>

      {showCreateUserModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4">
          <div className="w-full max-w-2xl rounded-2xl border border-border bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Crear usuario cliente</h3>
                <p className="mt-1 text-sm text-slate-500">
                  El usuario se creará en autenticación y quedará asociado a {empresa.nombre}.
                </p>
              </div>
              <button
                onClick={closeCreateUserModal}
                disabled={creatingUser}
                className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-50 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-5 px-6 py-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Nombre</label>
                  <input
                    type="text"
                    value={newUserForm.nombre}
                    onChange={(e) => setNewUserForm((prev) => ({ ...prev, nombre: e.target.value }))}
                    className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    placeholder="Nombre"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Apellido</label>
                  <input
                    type="text"
                    value={newUserForm.apellido}
                    onChange={(e) => setNewUserForm((prev) => ({ ...prev, apellido: e.target.value }))}
                    className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    placeholder="Apellido"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Email</label>
                  <input
                    type="email"
                    value={newUserForm.email}
                    onChange={(e) => setNewUserForm((prev) => ({ ...prev, email: e.target.value }))}
                    className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    placeholder="usuario@empresa.com"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Rol</label>
                  <select
                    value={newUserForm.rol}
                    onChange={(e) => {
                      const rol = e.target.value as UserRoleCliente;
                      setNewUserForm((prev) => ({
                        ...prev,
                        rol,
                        sede_id: rol === 'comprador' ? prev.sede_id : '',
                      }));
                    }}
                    className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="comprador">Comprador</option>
                    <option value="aprobador">Aprobador</option>
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Contraseña temporal</label>
                  <input
                    type="password"
                    value={newUserForm.password}
                    onChange={(e) => setNewUserForm((prev) => ({ ...prev, password: e.target.value }))}
                    className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    placeholder="Mínimo 8 caracteres"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Sede {empresa.usa_sedes && newUserForm.rol === 'comprador' ? '(obligatoria)' : '(opcional)'}
                  </label>
                  <select
                    value={newUserForm.sede_id}
                    onChange={(e) => setNewUserForm((prev) => ({ ...prev, sede_id: e.target.value }))}
                    disabled={newUserForm.rol !== 'comprador' || sedes.length === 0}
                    className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    <option value="">
                      {sedes.length === 0
                        ? 'Sin sedes disponibles'
                        : newUserForm.rol === 'comprador'
                          ? 'Selecciona una sede'
                          : 'No aplica para este rol'}
                    </option>
                    {sedes.map((sede) => (
                      <option key={sede.id} value={sede.id}>
                        {sede.nombre}{sede.ciudad ? ` · ${sede.ciudad}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                <p>
                  La empresa {empresa.usa_sedes ? 'opera con sedes' : 'no exige sedes'}.
                  {newUserForm.rol === 'comprador'
                    ? ' Los compradores quedan listos para operar en su sede asignada.'
                    : ' Los aprobadores se crean a nivel empresa.'}
                </p>
              </div>

              {createUserError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {createUserError}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 border-t border-border px-6 py-4">
              <button
                onClick={closeCreateUserModal}
                disabled={creatingUser}
                className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateUser}
                disabled={creatingUser}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-dark disabled:opacity-50"
              >
                {creatingUser ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Crear usuario
              </button>
            </div>
          </div>
        </div>
      )}

      {showActivateAsesorAccessModal && selectedAsesorForAccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4">
          <div className="w-full max-w-xl rounded-2xl border border-border bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {selectedAsesorForAccess.auth_id ? 'Restablecer acceso del asesor' : 'Activar acceso del asesor'}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Se actualizarán las credenciales del perfil interno sincronizado desde Odoo.
                </p>
              </div>
              <button
                onClick={closeActivateAsesorAccessModal}
                disabled={Boolean(activatingAsesorId)}
                className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-50 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-5 px-6 py-6">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-sm font-semibold text-slate-900">
                  {selectedAsesorForAccess.nombre} {selectedAsesorForAccess.apellido}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {selectedAsesorForAccess.email || 'Sin email registrado'}
                </p>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Contraseña temporal</label>
                <input
                  type="password"
                  value={activateAsesorAccessForm.password}
                  onChange={(e) =>
                    setActivateAsesorAccessForm((prev) => ({
                      ...prev,
                      password: e.target.value,
                    }))
                  }
                  className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="Mínimo 8 caracteres"
                />
                <p className="mt-2 text-xs text-slate-500">
                  {selectedAsesorForAccess.auth_id
                    ? 'Se actualizará la contraseña actual y se mantendrá el mismo perfil interno.'
                    : 'Se creará o enlazará el acceso del asesor usando este correo y el perfil interno existente.'}
                </p>
              </div>

              {activateAsesorAccessError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {activateAsesorAccessError}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 border-t border-border px-6 py-4">
              <button
                onClick={closeActivateAsesorAccessModal}
                disabled={Boolean(activatingAsesorId)}
                className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleActivarAccesoAsesor}
                disabled={Boolean(activatingAsesorId)}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-dark disabled:opacity-50"
              >
                {activatingAsesorId === selectedAsesorForAccess.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                {selectedAsesorForAccess.auth_id ? 'Actualizar acceso' : 'Activar acceso'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50">
          <div className="bg-white border-l-4 border-primary shadow-lg rounded-r-lg p-4 flex items-start gap-3 max-w-sm">
            <Save className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="text-sm font-bold text-slate-900">Cambios Guardados</h4>
              <p className="text-xs text-slate-500 mt-1">{toast}</p>
            </div>
            <button onClick={() => setToast(null)} className="text-slate-400 hover:text-slate-600">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
