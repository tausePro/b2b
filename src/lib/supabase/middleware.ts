import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { RUTAS_MARKDOWN } from '@/lib/landing/getMarkdown';

/** True si el header Accept indica preferencia por Markdown. */
function prefiereMarkdown(accept: string | null): boolean {
  if (!accept) return false;
  // Acepta text/markdown o text/x-markdown, con o sin q=
  return /text\/(x-)?markdown/i.test(accept);
}

export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const hostname = request.headers.get('host') || '';

  // ── Content negotiation: Markdown for Agents ──
  // Si el request pide Markdown y la ruta es pública + soportada,
  // rewrite interno a /api/md/<path> sin cambiar la URL del cliente.
  if (request.method === 'GET' && prefiereMarkdown(request.headers.get('accept'))) {
    const canonico = pathname.length > 1 && pathname.endsWith('/')
      ? pathname.slice(0, -1)
      : pathname;
    if (RUTAS_MARKDOWN.has(canonico)) {
      const url = request.nextUrl.clone();
      // El catch-all /api/md/[...path] requiere al menos un segmento;
      // para el home usamos 'home' como sentinel reconocido por el handler.
      url.pathname = canonico === '/' ? '/api/md/home' : '/api/md' + canonico;
      const response = NextResponse.rewrite(url);
      // Refuerzo de cache keying: decirle al CDN que la respuesta depende
      // del Accept header. next.config.ts ya setea Vary globalmente, pero
      // lo repetimos aquí para respuestas generadas vía rewrite.
      response.headers.set('Vary', 'Accept');
      return response;
    }
  }

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

  const publicPaths = [
    '/login', '/auth/callback',
    '/api/odoo', '/api/auth', '/api/internal', '/api/landing', '/api/leads', '/api/md', '/api/health', '/api/mcp',
    '/catalogo', '/nosotros', '/contacto', '/faq', '/terminos', '/privacidad',
    // Agent-readiness / SEO: siempre deben ser públicos
    '/robots.txt', '/sitemap.xml', '/llms.txt', '/.well-known',
  ];
  const landingPaths = ['/', '/servicios'];

  // b2b.imprima.com.co → subdominio B2B, redirigir raíz a /login
  const isB2BSubdomain = hostname.startsWith('b2b.');
  if (isB2BSubdomain && landingPaths.includes(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  const isPublicPath = publicPaths.some((path) => pathname.startsWith(path));
  const isLandingPath = landingPaths.includes(pathname);

  try {
    const { data: { user } } = await supabase.auth.getUser();

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
  } catch {
    // Falla silenciosa para evitar trabar la app, el cliente maneja el fallback
    return supabaseResponse;
  }

  return supabaseResponse;
}
