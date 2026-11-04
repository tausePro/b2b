import { createBrowserClient } from '@supabase/ssr';
import { isViewAsSupabaseRequestAllowed, readViewAsUiCookie, VIEW_AS_READ_ONLY_MESSAGE } from '@/lib/auth/viewAs';

const readOnlyAwareFetch: typeof fetch = (input, init) => {
  if (typeof document !== 'undefined' && readViewAsUiCookie(document.cookie)) {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
    if (!isViewAsSupabaseRequestAllowed(url, method, process.env.NEXT_PUBLIC_SUPABASE_URL!)) {
      return Promise.resolve(new Response(JSON.stringify({ message: VIEW_AS_READ_ONLY_MESSAGE, code: 'VIEW_AS_READ_ONLY' }), {
        status: 403, headers: { 'Content-Type': 'application/json' },
      }));
    }
  }
  return fetch(input, init);
};

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { fetch: readOnlyAwareFetch } }
  );
}
