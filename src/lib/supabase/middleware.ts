import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const publicPaths = ['/login', '/auth/callback', '/api/odoo', '/api/auth', '/api/internal', '/api/landing', '/catalogo'];
  const landingPaths = ['/', '/nosotros', '/servicios', '/contacto', '/faq'];
  const pathname = request.nextUrl.pathname;

  const isPublicPath = publicPaths.some((path) => pathname.startsWith(path));
  const isLandingPath = landingPaths.includes(pathname);

  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    // Usuario autenticado en landing o login → redirigir a dashboard
    if (user && (isLandingPath || pathname === '/login')) {
      const url = request.nextUrl.clone();
      url.pathname = '/dashboard';
      return NextResponse.redirect(url);
    }

    // Usuario NO autenticado en ruta protegida → redirigir a login
    if (!user && !isPublicPath && !isLandingPath) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      return NextResponse.redirect(url);
    }
  } catch (err) {
    // Falla silenciosa para evitar trabar la app, el cliente maneja el fallback
    return supabaseResponse;
  }

  return supabaseResponse;
}
