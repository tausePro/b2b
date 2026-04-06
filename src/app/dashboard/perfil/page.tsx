'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';
import { ROLE_CONFIG } from '@/types';
import { User, Mail, Building2, MapPin, Key, Loader2, Check, Eye, EyeOff } from 'lucide-react';

export default function PerfilPage() {
  const { user } = useAuth();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState(false);

  if (!user) return null;

  const handleChangePassword = async () => {
    setPwError(null);
    setPwSuccess(false);

    if (newPassword.length < 8) {
      setPwError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError('Las contraseñas no coinciden.');
      return;
    }

    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setPwSuccess(true);
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPwSuccess(false), 4000);
    } catch (err) {
      setPwError(err instanceof Error ? err.message : 'Error al cambiar la contraseña.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Mi Perfil</h1>
        <p className="text-muted text-sm mt-1">Información de tu cuenta corporativa</p>
      </div>

      <div className="bg-white rounded-xl border border-border p-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-2xl font-bold text-primary">
              {user.nombre[0]}{user.apellido[0]}
            </span>
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">{user.nombre} {user.apellido}</h2>
            <span className="inline-block mt-1 text-xs bg-primary/10 text-primary px-2.5 py-1 rounded-full font-medium">
              {ROLE_CONFIG[user.rol].label}
            </span>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-3 py-3 border-b border-border">
            <Mail className="w-4 h-4 text-muted" />
            <div>
              <p className="text-xs text-muted">Correo Corporativo</p>
              <p className="text-sm font-medium text-foreground">{user.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 py-3 border-b border-border">
            <User className="w-4 h-4 text-muted" />
            <div>
              <p className="text-xs text-muted">Rol en la Plataforma</p>
              <p className="text-sm font-medium text-foreground">{ROLE_CONFIG[user.rol].label}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 py-3 border-b border-border">
            <Building2 className="w-4 h-4 text-muted" />
            <div>
              <p className="text-xs text-muted">Empresa</p>
              <p className="text-sm font-medium text-foreground">{user.empresa_id}</p>
            </div>
          </div>
          {user.sede_id && (
            <div className="flex items-center gap-3 py-3">
              <MapPin className="w-4 h-4 text-muted" />
              <div>
                <p className="text-xs text-muted">Sede</p>
                <p className="text-sm font-medium text-foreground">{user.sede_id}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Cambiar contraseña */}
      <div className="bg-white rounded-xl border border-border p-6">
        <div className="flex items-center gap-3 mb-4">
          <Key className="w-5 h-5 text-muted" />
          <h3 className="text-base font-semibold text-foreground">Cambiar Contraseña</h3>
        </div>

        <div className="space-y-4 max-w-sm">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Nueva Contraseña</label>
            <div className="relative">
              <input
                type={showNew ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                className="w-full px-3 py-2.5 pr-10 border border-border rounded-lg text-sm text-foreground placeholder-muted focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary"
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
              >
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Confirmar Contraseña</label>
            <div className="relative">
              <input
                type={showConfirm ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repite la contraseña"
                className="w-full px-3 py-2.5 pr-10 border border-border rounded-lg text-sm text-foreground placeholder-muted focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary"
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
              >
                {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {pwError && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{pwError}</p>
          )}

          {pwSuccess && (
            <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 px-3 py-2 rounded-lg">
              <Check className="w-4 h-4" />
              Contraseña actualizada correctamente
            </div>
          )}

          <button
            onClick={handleChangePassword}
            disabled={saving || newPassword.length < 8 || confirmPassword.length < 8}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
            Cambiar Contraseña
          </button>
        </div>
      </div>
    </div>
  );
}
