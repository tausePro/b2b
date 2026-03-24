'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Users,
  Plus,
  Loader2,
  Shield,
  Briefcase,
  Eye,
  X,
  Check,
  Pencil,
  Key,
  UserCheck,
  UserX,
  Building2,
} from 'lucide-react';

type InternalRole = 'super_admin' | 'asesor' | 'direccion' | 'editor_contenido';

interface AdminUser {
  id: string;
  auth_id: string | null;
  odoo_user_id: number | null;
  email: string;
  nombre: string;
  apellido: string;
  rol: InternalRole;
  activo: boolean;
  created_at: string;
  updated_at: string;
  empresas_asignadas: { empresa_id: string; empresa_nombre: string }[];
}

const ROLE_LABELS: Record<InternalRole, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  super_admin: { label: 'Super Admin', color: 'bg-red-100 text-red-700', icon: Shield },
  asesor: { label: 'Asesor Comercial', color: 'bg-blue-100 text-blue-700', icon: Briefcase },
  direccion: { label: 'Dirección', color: 'bg-purple-100 text-purple-700', icon: Eye },
  editor_contenido: { label: 'Editor Contenido', color: 'bg-emerald-100 text-emerald-700', icon: Briefcase },
};

export default function AdministradoresPage() {
  const [usuarios, setUsuarios] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal crear
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({
    nombre: '',
    apellido: '',
    email: '',
    password: '',
    rol: 'asesor' as InternalRole,
  });
  const [createError, setCreateError] = useState<string | null>(null);

  // Modal editar
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [editForm, setEditForm] = useState({ nombre: '', apellido: '', rol: 'asesor' as InternalRole });
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Modal reset password
  const [resetUser, setResetUser] = useState<AdminUser | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState(false);

  // Toggle activo
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchUsuarios = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/administradores');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error cargando usuarios');
      setUsuarios(data.usuarios ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsuarios();
  }, [fetchUsuarios]);

  const handleCreate = async () => {
    setCreateError(null);
    if (!createForm.nombre || !createForm.apellido || !createForm.email || !createForm.password) {
      setCreateError('Todos los campos son obligatorios.');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/admin/administradores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error creando usuario');
      setUsuarios((prev) => [data.usuario, ...prev]);
      setShowCreate(false);
      setCreateForm({ nombre: '', apellido: '', email: '', password: '', rol: 'asesor' });
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setCreating(false);
    }
  };

  const handleEdit = async () => {
    if (!editUser) return;
    setEditError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/administradores/${editUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error actualizando usuario');
      setUsuarios((prev) =>
        prev.map((u) => (u.id === editUser.id ? { ...u, ...data.usuario } : u))
      );
      setEditUser(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (usuario: AdminUser) => {
    setTogglingId(usuario.id);
    try {
      const res = await fetch(`/api/admin/administradores/${usuario.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activo: !usuario.activo }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error');
      setUsuarios((prev) =>
        prev.map((u) => (u.id === usuario.id ? { ...u, ...data.usuario } : u))
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error');
    } finally {
      setTogglingId(null);
    }
  };

  const handleResetPassword = async () => {
    if (!resetUser) return;
    setResetError(null);
    setResetting(true);
    try {
      const res = await fetch(`/api/admin/administradores/${resetUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_password: newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error');
      setResetSuccess(true);
      setTimeout(() => {
        setResetUser(null);
        setNewPassword('');
        setResetSuccess(false);
      }, 2000);
    } catch (err) {
      setResetError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setResetting(false);
    }
  };

  const openEdit = (u: AdminUser) => {
    setEditUser(u);
    setEditForm({ nombre: u.nombre, apellido: u.apellido, rol: u.rol });
    setEditError(null);
  };

  const stats = {
    total: usuarios.length,
    activos: usuarios.filter((u) => u.activo).length,
    superAdmins: usuarios.filter((u) => u.rol === 'super_admin').length,
    asesores: usuarios.filter((u) => u.rol === 'asesor').length,
    direccion: usuarios.filter((u) => u.rol === 'direccion').length,
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Administradores</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Gestión de usuarios internos de Imprima.
          </p>
        </div>
        <button
          onClick={() => {
            setShowCreate(true);
            setCreateError(null);
          }}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-dark transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nuevo Usuario
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-border p-4">
          <p className="text-xs text-slate-500 font-medium uppercase">Total</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{stats.total}</p>
        </div>
        <div className="bg-white rounded-xl border border-border p-4">
          <p className="text-xs text-slate-500 font-medium uppercase">Activos</p>
          <p className="text-2xl font-bold text-primary mt-1">{stats.activos}</p>
        </div>
        <div className="bg-white rounded-xl border border-border p-4">
          <p className="text-xs text-slate-500 font-medium uppercase">Super Admin</p>
          <p className="text-2xl font-bold text-red-600 mt-1">{stats.superAdmins}</p>
        </div>
        <div className="bg-white rounded-xl border border-border p-4">
          <p className="text-xs text-slate-500 font-medium uppercase">Asesores</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">{stats.asesores}</p>
        </div>
        <div className="bg-white rounded-xl border border-border p-4">
          <p className="text-xs text-slate-500 font-medium uppercase">Dirección</p>
          <p className="text-2xl font-bold text-purple-600 mt-1">{stats.direccion}</p>
        </div>
      </div>

      {/* Tabla */}
      {loading ? (
        <div className="bg-white rounded-xl border border-border p-12 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
          <p className="mt-2 text-sm text-slate-500">Cargando usuarios...</p>
        </div>
      ) : error ? (
        <div className="bg-white rounded-xl border border-red-200 p-12 text-center">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      ) : usuarios.length === 0 ? (
        <div className="bg-white rounded-xl border border-border p-12 text-center">
          <Users className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-base font-semibold text-slate-900 mb-1">Sin usuarios internos</h3>
          <p className="text-sm text-slate-500">Crea el primer usuario para comenzar.</p>
        </div>
      ) : (
        <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Usuario
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Rol
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Estado
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Empresas Asignadas
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Creado
                  </th>
                  <th className="relative px-6 py-4">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {usuarios.map((u) => {
                  const roleInfo = ROLE_LABELS[u.rol];
                  const RoleIcon = roleInfo.icon;
                  const initials = `${u.nombre[0] ?? ''}${u.apellido[0] ?? ''}`.toUpperCase();

                  return (
                    <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-bold shrink-0">
                            {initials}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-slate-900">
                              {u.nombre} {u.apellido}
                            </p>
                            <p className="text-xs text-slate-500">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${roleInfo.color}`}
                        >
                          <RoleIcon className="w-3 h-3" />
                          {roleInfo.label}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div
                            className={`h-2.5 w-2.5 rounded-full ${
                              u.activo ? 'bg-green-500' : 'bg-slate-300'
                            }`}
                          />
                          <span className="text-sm text-slate-600">
                            {u.activo ? 'Activo' : 'Inactivo'}
                          </span>
                          {!u.auth_id && (
                            <span className="text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                              Sin acceso
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {u.rol === 'asesor' && u.empresas_asignadas.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {u.empresas_asignadas.slice(0, 3).map((e) => (
                              <span
                                key={e.empresa_id}
                                className="inline-flex items-center gap-1 text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full"
                              >
                                <Building2 className="w-3 h-3" />
                                {e.empresa_nombre}
                              </span>
                            ))}
                            {u.empresas_asignadas.length > 3 && (
                              <span className="text-xs text-slate-400">
                                +{u.empresas_asignadas.length - 3}
                              </span>
                            )}
                          </div>
                        ) : u.rol === 'asesor' ? (
                          <span className="text-xs text-slate-400">Sin empresas</span>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                        {new Date(u.created_at).toLocaleDateString('es-CO')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEdit(u)}
                            title="Editar"
                            className="p-2 rounded-lg text-slate-400 hover:text-primary hover:bg-primary/10 transition-colors"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          {u.auth_id && (
                            <button
                              onClick={() => {
                                setResetUser(u);
                                setNewPassword('');
                                setResetError(null);
                                setResetSuccess(false);
                              }}
                              title="Restablecer contraseña"
                              className="p-2 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                            >
                              <Key className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => handleToggleActive(u)}
                            disabled={togglingId === u.id}
                            title={u.activo ? 'Desactivar' : 'Activar'}
                            className={`p-2 rounded-lg transition-colors disabled:opacity-50 ${
                              u.activo
                                ? 'text-slate-400 hover:text-red-600 hover:bg-red-50'
                                : 'text-slate-400 hover:text-green-600 hover:bg-green-50'
                            }`}
                          >
                            {togglingId === u.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : u.activo ? (
                              <UserX className="w-4 h-4" />
                            ) : (
                              <UserCheck className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Crear */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowCreate(false)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-slate-900">Nuevo Usuario Interno</h2>
              <button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nombre</label>
                  <input
                    type="text"
                    value={createForm.nombre}
                    onChange={(e) => setCreateForm((f) => ({ ...f, nombre: e.target.value }))}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Apellido</label>
                  <input
                    type="text"
                    value={createForm.apellido}
                    onChange={(e) => setCreateForm((f) => ({ ...f, apellido: e.target.value }))}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                <input
                  type="email"
                  value={createForm.email}
                  onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Contraseña Temporal</label>
                <input
                  type="text"
                  value={createForm.password}
                  onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder="Mínimo 8 caracteres"
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Rol</label>
                <select
                  value={createForm.rol}
                  onChange={(e) => setCreateForm((f) => ({ ...f, rol: e.target.value as InternalRole }))}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="asesor">Asesor Comercial</option>
                  <option value="direccion">Dirección</option>
                  <option value="editor_contenido">Editor Contenido</option>
                  <option value="super_admin">Super Admin</option>
                </select>
              </div>

              {createError && (
                <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{createError}</p>
              )}
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreate}
                disabled={creating}
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-dark disabled:opacity-50"
              >
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Crear Usuario
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Editar */}
      {editUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setEditUser(null)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-slate-900">Editar Usuario</h2>
              <button onClick={() => setEditUser(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <p className="text-sm text-slate-500">{editUser.email}</p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nombre</label>
                  <input
                    type="text"
                    value={editForm.nombre}
                    onChange={(e) => setEditForm((f) => ({ ...f, nombre: e.target.value }))}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Apellido</label>
                  <input
                    type="text"
                    value={editForm.apellido}
                    onChange={(e) => setEditForm((f) => ({ ...f, apellido: e.target.value }))}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Rol</label>
                <select
                  value={editForm.rol}
                  onChange={(e) => setEditForm((f) => ({ ...f, rol: e.target.value as InternalRole }))}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="asesor">Asesor Comercial</option>
                  <option value="direccion">Dirección</option>
                  <option value="editor_contenido">Editor Contenido</option>
                  <option value="super_admin">Super Admin</option>
                </select>
              </div>

              {editError && (
                <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{editError}</p>
              )}
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setEditUser(null)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900"
              >
                Cancelar
              </button>
              <button
                onClick={handleEdit}
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-dark disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Guardar Cambios
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Reset Password */}
      {resetUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setResetUser(null)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-slate-900">Restablecer Contraseña</h2>
              <button onClick={() => setResetUser(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {resetSuccess ? (
              <div className="text-center py-4">
                <Check className="w-10 h-10 text-green-500 mx-auto mb-2" />
                <p className="text-sm font-medium text-green-700">Contraseña actualizada correctamente</p>
              </div>
            ) : (
              <>
                <p className="text-sm text-slate-500 mb-4">
                  Usuario: <strong>{resetUser.nombre} {resetUser.apellido}</strong> ({resetUser.email})
                </p>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nueva Contraseña</label>
                  <input
                    type="text"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Mínimo 8 caracteres"
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                {resetError && (
                  <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg mt-3">{resetError}</p>
                )}

                <div className="flex justify-end gap-3 mt-6">
                  <button
                    onClick={() => setResetUser(null)}
                    className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleResetPassword}
                    disabled={resetting || newPassword.length < 8}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 disabled:opacity-50"
                  >
                    {resetting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
                    Restablecer
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
