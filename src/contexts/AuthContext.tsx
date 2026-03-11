'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { type User, type UserRole, ROLE_CONFIG } from '@/types';

interface AuthContextType {
  user: User | null;
  supabaseUser: SupabaseUser | null;
  loading: boolean;
  showPrices: boolean;
  permissions: typeof ROLE_CONFIG[UserRole] | null;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function mapProfileToUser(data: Record<string, unknown>): User {
  return {
    id: data.id as string,
    auth_id: data.auth_id as string,
    email: data.email as string,
    nombre: data.nombre as string,
    apellido: data.apellido as string,
    rol: data.rol as UserRole,
    empresa_id: (data.empresa_id as string) || null,
    sede_id: (data.sede_id as string) || null,
    avatar: data.avatar as string | undefined,
    activo: data.activo as boolean,
    created_at: data.created_at as string,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [supabaseUser, setSupabaseUser] = useState<SupabaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPricesOverride, setShowPricesOverride] = useState<boolean | null>(null);
  
  // Instanciar el cliente dentro de useState (recomendado en App Router para evitar re-creación en cada render)
  const [supabase] = useState(() => createClient());

  useEffect(() => {
    let mounted = true;
    let initialResolved = false;
    let sessionSyncId = 0;

    const fetchServerProfile = async (): Promise<User | null> => {
      try {
        const response = await fetch('/api/auth/perfil', {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
        });

        const result = (await response.json()) as {
          profile?: Record<string, unknown>;
          error?: string;
          details?: unknown;
        };

        if (response.ok && result.profile) {
          return mapProfileToUser(result.profile);
        }

        console.warn('[Auth] Fallback server-side de perfil falló:', result.error, result.details ?? null);
      } catch (e) {
        console.warn('[Auth] Excepción en fallback server-side de perfil:', e);
      }

      return null;
    };

    const fetchProfile = async (authId: string): Promise<User | null> => {
      try {
        const { data, error } = await supabase.rpc('get_mi_perfil');
        if (!error && data) {
          return mapProfileToUser(data as Record<string, unknown>);
        }
        console.warn('[Auth] RPC get_mi_perfil falló:', error?.message);
      } catch (e) {
        console.warn('[Auth] RPC get_mi_perfil excepción:', e);
      }

      try {
        const { data, error } = await supabase
          .from('usuarios')
          .select('*')
          .eq('auth_id', authId)
          .maybeSingle();

        if (!error && data) {
          return mapProfileToUser(data as Record<string, unknown>);
        }
        console.warn('[Auth] Query directa falló:', error?.message);
      } catch (e) {
        console.warn('[Auth] Query directa excepción:', e);
      }

      const serverProfile = await fetchServerProfile();
      if (serverProfile) {
        return serverProfile;
      }

      // Recuperación automática: si existe un usuario con el mismo email en public.usuarios
      // pero auth_id quedó desincronizado, intentamos relinkearlo desde una RPC SECURITY DEFINER.
      try {
        const { data, error } = await supabase.rpc('enlazar_mi_usuario_por_email');
        if (!error && data) {
          console.warn('[Auth] Perfil recuperado por auto-enlace de auth_id/email');
          return mapProfileToUser(data as Record<string, unknown>);
        }
        if (error) {
          console.warn('[Auth] Auto-enlace de perfil no aplicado:', error.message);
        }
      } catch (e) {
        console.warn('[Auth] Excepción en auto-enlace de perfil:', e);
      }

      return null;
    };

    const resolveShowPricesByCompany = async (profile: User | null): Promise<boolean | null> => {
      if (!profile?.empresa_id) return null;
      if (profile.rol !== 'comprador' && profile.rol !== 'aprobador') return null;

      try {
        const { data, error } = await supabase
          .from('empresa_configs')
          .select('configuracion_extra')
          .eq('empresa_id', profile.empresa_id)
          .maybeSingle();

        if (error) {
          console.warn('[Auth] No se pudo cargar configuración de precios por empresa:', error.message);
          return null;
        }

        const extra =
          data?.configuracion_extra && typeof data.configuracion_extra === 'object'
            ? (data.configuracion_extra as Record<string, unknown>)
            : {};

        if (profile.rol === 'comprador' && typeof extra.mostrar_precios_comprador === 'boolean') {
          return extra.mostrar_precios_comprador;
        }

        if (profile.rol === 'aprobador' && typeof extra.mostrar_precios_aprobador === 'boolean') {
          return extra.mostrar_precios_aprobador;
        }
      } catch (e) {
        console.warn('[Auth] Excepción cargando configuración de precios por empresa:', e);
      }

      return null;
    };

    const handleSession = async (
      session: { user: SupabaseUser } | null,
      options: { allowServerFallback?: boolean } = {}
    ) => {
      const { allowServerFallback = true } = options;
      const currentSyncId = ++sessionSyncId;

      if (!mounted) return;

      if (session?.user) {
        // getSession/get storage pueden traer sesiones viejas; validamos contra Auth server.
        const { data: validUserData, error: validUserError } = await supabase.auth.getUser();
        const activeUser = validUserData?.user ?? session.user;

        if (validUserError) {
          console.warn('[Auth] Validación getUser falló en cliente. Se usará la sesión disponible.', validUserError.message);
        }

        console.log('[Auth] Sesión activa:', activeUser.email, '| auth_id:', activeUser.id);
        const profile = await fetchProfile(activeUser.id);
        const showPricesEmpresa = await resolveShowPricesByCompany(profile);
        if (mounted && currentSyncId === sessionSyncId) {
          setSupabaseUser(activeUser);
          setUser(profile);
          setShowPricesOverride(showPricesEmpresa);
          if (!profile) {
            console.error(
              '[Auth] ⚠️ PERFIL NO ENCONTRADO para auth_id:', activeUser.id,
              '\n→ Ejecuta el seed SQL en Supabase SQL Editor para crear el registro en public.usuarios'
            );
          } else {
            console.log('[Auth] Perfil cargado:', profile.email, '| rol:', profile.rol);
          }
        }
      } else {
        if (!allowServerFallback) {
          console.log('[Auth] Sin sesión activa');
          if (mounted && currentSyncId === sessionSyncId) {
            setSupabaseUser(null);
            setUser(null);
            setShowPricesOverride(null);
          }
        } else {
          const serverProfile = await fetchServerProfile();
          const showPricesEmpresa = await resolveShowPricesByCompany(serverProfile);

          if (mounted && currentSyncId === sessionSyncId) {
            if (serverProfile) {
              console.log('[Auth] Perfil resuelto desde sesión server-side');
              setSupabaseUser(null);
              setUser(serverProfile);
              setShowPricesOverride(showPricesEmpresa);
            } else {
              console.log('[Auth] Sin sesión activa');
              setSupabaseUser(null);
              setUser(null);
              setShowPricesOverride(null);
            }
          }
        }
      }

      if (mounted && currentSyncId === sessionSyncId) setLoading(false);
    };

    const bootstrapSession = async () => {
      if (initialResolved || !mounted) return;

      try {
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();

        if (error) {
          console.warn('[Auth] No se pudo resolver sesión inicial con getSession:', error.message);
        }

        if (!mounted || initialResolved) return;

        initialResolved = true;
        await handleSession(session);
      } catch (e) {
        console.warn('[Auth] Excepción resolviendo sesión inicial con getSession:', e);

        if (!mounted || initialResolved) return;

        initialResolved = true;
        setLoading(false);
      }
    };

    // onAuthStateChange dispara INITIAL_SESSION sincrónicamente al suscribirse
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;
        console.log('[Auth] Evento:', event);

        if (event === 'INITIAL_SESSION') {
          if (session?.user) {
            initialResolved = true;
            await handleSession(session);
          }
        } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          initialResolved = true;
          await handleSession(session);
        } else if (event === 'SIGNED_OUT') {
          initialResolved = true;
          await handleSession(null, { allowServerFallback: false });
        }
      }
    );

    void bootstrapSession();

    // Fallback: si INITIAL_SESSION no dispara en 5s, forzar loading=false
    const timeout = setTimeout(() => {
      if (mounted && !initialResolved) {
        console.warn('[Auth] Timeout: INITIAL_SESSION no disparó, forzando loading=false');
        setLoading(false);
      }
    }, 5000);

    return () => {
      mounted = false;
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, [supabase]);

  const signIn = async (email: string, password: string) => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    
    // Si hay error, quitamos el loading. Si hay éxito, onAuthStateChange lo manejará
    if (error) {
      setLoading(false);
    }
    
    return { error: error ? error.message : null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSupabaseUser(null);
  };

  const roleConfig = user ? ROLE_CONFIG[user.rol] : null;

  return (
    <AuthContext.Provider
      value={{
        user,
        supabaseUser,
        loading,
        showPrices: showPricesOverride ?? roleConfig?.showPrices ?? false,
        permissions: roleConfig ?? null,
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth debe usarse dentro de un AuthProvider');
  }
  return context;
}
