// ============================================
// Tipos principales de Imprima B2B
// Esquema Multitenant con aislamiento por empresa_id
// ============================================

export type UserRole = 'super_admin' | 'comprador' | 'aprobador' | 'asesor' | 'direccion';

export interface User {
  id: string;
  auth_id: string;
  odoo_user_id?: number | null;
  email: string;
  nombre: string;
  apellido: string;
  rol: UserRole;
  empresa_id: string | null; // NULL para roles Imprima (asesor, direccion)
  sede_id?: string | null;
  avatar?: string;
  activo: boolean;
  created_at: string;
}

// Helper: ¿Es un usuario interno de Imprima?
export function isRolImprima(rol: UserRole): boolean {
  return rol === 'super_admin' || rol === 'asesor' || rol === 'direccion';
}

// ============================================
// Entidad TENANT principal
// ============================================

// Refleja res.partner de Odoo (is_company = True)
export interface Empresa {
  id: string;
  odoo_partner_id: number;
  odoo_comercial_id?: number | null;
  odoo_comercial_nombre?: string | null;
  nombre: string;
  nit?: string;
  presupuesto_global_mensual?: number;
  requiere_aprobacion: boolean;
  usa_sedes: boolean;
  config_aprobacion?: ConfigAprobacion;
  activa: boolean;
}

export interface ConfigAprobacion {
  niveles: number;
  monto_auto_aprobacion?: number | null;
}

// Personalización visual y funcional por tenant
export interface EmpresaConfig {
  id: string;
  empresa_id: string;
  slug?: string;
  logo_url?: string;
  color_primario: string;
  color_secundario?: string;
  modulos_activos: ModulosActivos;
  configuracion_extra?: Record<string, unknown>;
}

export interface PortalBranding {
  empresa_id: string;
  empresa_nombre: string;
  slug: string | null;
  logo_url: string | null;
  color_primario: string | null;
}

export interface ModulosActivos {
  presupuestos: boolean;
  aprobaciones: boolean;
  trazabilidad: boolean;
  [key: string]: boolean; // Extensible para futuros módulos
}

// ============================================
// Asignación Asesor → Empresas (multitenant)
// ============================================

export interface AsesorEmpresa {
  id: string;
  usuario_id: string;
  empresa_id: string;
  activo: boolean;
  empresa?: Empresa; // Relación para UI
}

// Refleja direcciones de envío / contactos hijos en Odoo
export interface Sede {
  id: string;
  empresa_id: string;
  odoo_address_id?: number;
  nombre_sede: string;
  direccion?: string;
  ciudad?: string;
  contacto_nombre?: string;
  contacto_telefono?: string;
  presupuesto_asignado: number;
  presupuesto_alerta_threshold: number;
  activa: boolean;
}

export type CategoriaProducto = 'cafeteria' | 'papeleria' | 'aseo' | 'personalizados';

// Lista blanca: solo IDs de Odoo. Los detalles se consultan en Odoo en tiempo real.
export interface ProductoAutorizado {
  id: string;
  empresa_id: string;
  odoo_product_id: number;
  categoria: CategoriaProducto;
  activo: boolean;
}

// Producto enriquecido con datos de Odoo (para la UI)
export interface ProductoOdoo {
  odoo_product_id: number;
  nombre: string;
  descripcion?: string;
  categoria: string; // Viene de Odoo: categ_id[1], no es enum fijo
  precio_unitario: number;
  unidad: string;
  disponible: boolean;
  imagen_url?: string;
  referencia?: string;
}

// Ciclos mensuales de presupuesto por sede
export type EstadoPresupuesto = 'activo' | 'cerrado' | 'excedido';

export interface PresupuestoMensual {
  id: string;
  sede_id: string;
  mes: number;
  anio: number;
  monto_inicial: number;
  monto_consumido: number;
  monto_disponible: number; // Calculado: inicial - consumido
  estado: EstadoPresupuesto;
  sede?: Sede;
}

// Estados del pedido según flujo definido
export type EstadoPedido =
  | 'borrador'
  | 'en_aprobacion'
  | 'aprobado'
  | 'rechazado'
  | 'en_validacion_imprima'
  | 'procesado_odoo';

export interface PedidoItem {
  id: string;
  pedido_id: string;
  odoo_product_id: number;
  nombre_producto: string;
  cantidad: number;
  precio_unitario_cop: number;
  subtotal_cop: number; // Calculado: cantidad * precio_unitario_cop
}

export interface Pedido {
  id: string;
  numero: string;
  odoo_sale_order_id?: number;
  empresa_id: string;
  sede_id: string;
  usuario_creador_id: string;
  estado: EstadoPedido;
  valor_total_cop: number;
  total_items: number;
  comentarios_sede?: string;
  comentarios_aprobador?: string;
  excede_presupuesto: boolean;
  justificacion_exceso?: string;
  aprobado_por?: string;
  fecha_aprobacion?: string;
  validado_por?: string;
  fecha_validacion?: string;
  fecha_creacion: string;
  updated_at: string;
  // Relaciones
  empresa?: Empresa;
  sede?: Sede;
  creador?: User;
  items?: PedidoItem[];
}

export interface LogTrazabilidad {
  id: string;
  pedido_id: string;
  accion: string;
  descripcion: string;
  usuario_id: string;
  usuario_nombre: string;
  created_at: string;
  metadata?: Record<string, unknown>;
}

export type TipoNotificacion =
  | 'pedido_creado_en_aprobacion'
  | 'pedido_creado_autoaprobado'
  | 'pedido_aprobado'
  | 'pedido_rechazado'
  | 'pedido_validado'
  | 'pedido_procesado_odoo';

export type NivelNotificacion = 'info' | 'success' | 'warning' | 'danger';

export interface NotificacionApp {
  id: string;
  usuario_id: string;
  actor_usuario_id?: string | null;
  empresa_id?: string | null;
  tipo: TipoNotificacion;
  nivel: NivelNotificacion;
  titulo: string;
  descripcion: string;
  ruta?: string | null;
  entidad_tipo?: string | null;
  entidad_id?: string | null;
  metadata?: Record<string, unknown>;
  leida: boolean;
  leida_at?: string | null;
  created_at: string;
}

export interface NotificacionEmail {
  id: string;
  usuario_id?: string | null;
  actor_usuario_id?: string | null;
  empresa_id?: string | null;
  tipo: TipoNotificacion;
  email_destino: string;
  nombre_destino?: string | null;
  asunto: string;
  payload?: Record<string, unknown>;
  entidad_tipo?: string | null;
  entidad_id?: string | null;
  estado: 'pendiente' | 'procesando' | 'enviado' | 'error';
  intentos: number;
  provider?: string | null;
  provider_message_id?: string | null;
  last_error?: string | null;
  scheduled_at: string;
  sent_at?: string | null;
  created_at: string;
  updated_at: string;
}

// Permisos por rol
export const ROLE_CONFIG: Record<UserRole, {
  label: string;
  showPrices: boolean;
  canCreateOrders: boolean;
  canApproveOrders: boolean;
  canValidateOrders: boolean;
  canViewDashboard: boolean;
  canManageBudgets: boolean;
  canViewTraceability: boolean;
  isImprima: boolean; // true = empleado Imprima, false = empleado cliente
}> = {
  super_admin: {
    label: 'Super Admin (Imprima)',
    showPrices: true,
    canCreateOrders: false,
    canApproveOrders: false,
    canValidateOrders: false,
    canViewDashboard: true,
    canManageBudgets: true,
    canViewTraceability: true,
    isImprima: true,
  },
  comprador: {
    label: 'Comprador (Sede)',
    showPrices: false,
    canCreateOrders: true,
    canApproveOrders: false,
    canValidateOrders: false,
    canViewDashboard: false,
    canManageBudgets: false,
    canViewTraceability: false,
    isImprima: false,
  },
  aprobador: {
    label: 'Aprobador (Gerente)',
    showPrices: true,
    canCreateOrders: false,
    canApproveOrders: true,
    canValidateOrders: false,
    canViewDashboard: true,
    canManageBudgets: true,
    canViewTraceability: true,
    isImprima: false,
  },
  asesor: {
    label: 'Asesor Comercial (Imprima)',
    showPrices: true,
    canCreateOrders: false,
    canApproveOrders: false,
    canValidateOrders: true,
    canViewDashboard: true,
    canManageBudgets: false,
    canViewTraceability: true,
    isImprima: true,
  },
  direccion: {
    label: 'Dirección',
    showPrices: true,
    canCreateOrders: false,
    canApproveOrders: false,
    canValidateOrders: false,
    canViewDashboard: true,
    canManageBudgets: true,
    canViewTraceability: true,
    isImprima: true,
  },
};
