import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { verifyPassword } from '@/lib/password';
import { createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE } from '@/lib/auth';
import { checkRateLimit } from '@/lib/ratelimit';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: 'too many attempts' }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const password = body?.password;
  if (typeof password !== 'string' || !verifyPassword(password)) {
    return NextResponse.json({ error: 'invalid password' }, { status: 401 });
  }

  const token = await createSessionToken();
  const c = await cookies();
  c.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });
  return NextResponse.json({ ok: true });
}
