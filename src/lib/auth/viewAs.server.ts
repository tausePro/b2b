import 'server-only';

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { createServerClient } from '@supabase/ssr';
import type { NextRequest, NextResponse } from 'next/server';
import { VIEW_AS_COOKIE, VIEW_AS_EXPIRES_COOKIE, VIEW_AS_UI_COOKIE } from './viewAs';

export interface ViewAsSession {
  actorId: string;
  targetId: string;
  targetName: string;
  auditId: string;
  startedAt: number;
  adminRefreshToken: string;
}

const COOKIE_MAX_AGE = 400 * 24 * 60 * 60;

function encryptionKey(): Buffer {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error('Falta la configuración del servidor para el modo ver como.');
  return createHash('sha256').update(`ver-como:${secret}`).digest();
}

export function sealViewAs(session: ViewAsSession): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(session), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map(part => part.toString('base64url')).join('.');
}

export function openViewAs(value: string | undefined): ViewAsSession | null {
  if (!value) return null;
  try {
    const parts = value.split('.');
    if (parts.length !== 3) return null;
    const [iv, tag, data] = parts.map(part => Buffer.from(part, 'base64url'));
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv);
    decipher.setAuthTag(tag);
    const parsed = JSON.parse(Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')) as Partial<ViewAsSession>;
    const valid = ['actorId', 'targetId', 'targetName', 'auditId', 'adminRefreshToken'].every(key => typeof parsed[key as keyof ViewAsSession] === 'string' && parsed[key as keyof ViewAsSession])
      && typeof parsed.startedAt === 'number' && Number.isFinite(parsed.startedAt);
    return valid ? parsed as ViewAsSession : null;
  } catch {
    return null;
  }
}

export function createResponseSupabaseClient(request: NextRequest, response: NextResponse) {
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
}

export function setViewAsCookies(response: NextResponse, session: ViewAsSession, expiresAt: number) {
  const secure = process.env.NODE_ENV === 'production';
  const base = { path: '/', sameSite: 'lax' as const, secure, maxAge: COOKIE_MAX_AGE };
  response.cookies.set(VIEW_AS_COOKIE, sealViewAs(session), { ...base, httpOnly: true });
  response.cookies.set(VIEW_AS_EXPIRES_COOKIE, String(expiresAt), { ...base, httpOnly: true });
  response.cookies.set(VIEW_AS_UI_COOKIE, encodeURIComponent(session.targetName), { ...base, httpOnly: false });
}

export function clearViewAsCookies(response: NextResponse) {
  for (const name of [VIEW_AS_COOKIE, VIEW_AS_EXPIRES_COOKIE, VIEW_AS_UI_COOKIE]) {
    response.cookies.set(name, '', { path: '/', maxAge: 0 });
  }
}
