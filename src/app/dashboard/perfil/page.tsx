'use client';

import { useAuth } from '@/contexts/AuthContext';
import { ROLE_CONFIG } from '@/types';
import { User, Mail, Building2, MapPin } from 'lucide-react';

export default function PerfilPage() {
  const { user } = useAuth();

  if (!user) return null;

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
    </div>
  );
}
