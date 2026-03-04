'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  
  // Extraemos supabaseUser también, porque si existe en Auth pero no tiene perfil,
  // debemos redirigirlo igual al dashboard para que vea el error de "Perfil no encontrado".
  const { signIn, user, supabaseUser, loading: authLoading } = useAuth();
  const router = useRouter();

  // Redirigir automáticamente si el usuario ya está autenticado (ya sea completo o solo auth)
  useEffect(() => {
    let mounted = true;
    if (!authLoading && (user || supabaseUser)) {
      setRedirecting(true);
      const timer = setTimeout(() => {
        if (mounted) window.location.href = '/dashboard';
      }, 100);
      return () => {
        mounted = false;
        clearTimeout(timer);
      };
    }
  }, [user, supabaseUser, authLoading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { error: signInError } = await signIn(email, password);

      if (signInError) {
        setError('Credenciales inválidas. Verifica tu correo y contraseña.');
        setLoading(false);
        return;
      }
      
      // No hacemos setLoading(false) si hubo éxito para que muestre "Ingresando..." 
      // hasta que el AuthContext atrape el cambio de sesión y dispare el useEffect de arriba
    } catch (err) {
      console.error('[Login] Error:', err);
      setError('Error de conexión. Intenta de nuevo.');
      setLoading(false);
    }
  };

  // Mostrar spinner si AuthContext está cargando sesión inicial, o si ya determinamos que vamos a redirigir
  if (authLoading || redirecting) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background-light">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-slate-500 font-medium">Validando credenciales...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      {/* Panel izquierdo - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-primary items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 w-64 h-64 rounded-full bg-white/20" />
          <div className="absolute bottom-32 right-16 w-48 h-48 rounded-full bg-white/15" />
          <div className="absolute top-1/2 left-1/3 w-32 h-32 rounded-full bg-white/10" />
        </div>
        <div className="relative z-10 text-center px-12">
          <div className="mb-8">
            <h1 className="text-5xl font-bold text-white tracking-tight">Imprima</h1>
            <p className="text-xl text-white/80 mt-1 font-light">B2B Platform</p>
          </div>
          <p className="text-white/70 text-lg max-w-md leading-relaxed">
            Plataforma de gestión de pedidos corporativos. Simplifica tus compras empresariales.
          </p>
        </div>
      </div>

      {/* Panel derecho - Formulario */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 bg-white">
        <div className="w-full max-w-md">
          {/* Logo móvil */}
          <div className="lg:hidden text-center mb-10">
            <h1 className="text-3xl font-bold text-primary">Imprima</h1>
            <p className="text-muted text-sm">B2B Platform</p>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-foreground">Iniciar Sesión</h2>
            <p className="text-muted mt-2">Ingresa tus credenciales corporativas para acceder</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="bg-danger/10 border border-danger/20 text-danger text-sm rounded-lg px-4 py-3">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-foreground mb-1.5">
                Correo Corporativo
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="usuario@empresa.com"
                required
                className="w-full px-4 py-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-foreground mb-1.5">
                Contraseña
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full px-4 py-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
              />
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 rounded border-border text-primary focus:ring-primary/30" />
                <span className="text-sm text-muted">Recordarme</span>
              </label>
              <button type="button" className="text-sm text-primary hover:text-primary-dark font-medium transition-colors">
                ¿Olvidaste tu contraseña?
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary hover:bg-primary-dark text-white font-semibold py-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Ingresando...
                </>
              ) : (
                'Ingresar'
              )}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-border text-center">
            <p className="text-xs text-muted">
              ¿Problemas para acceder? Contacta a{' '}
              <button type="button" className="text-primary hover:text-primary-dark font-medium">
                soporte TI
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
