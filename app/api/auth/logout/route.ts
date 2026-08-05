import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE } from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST() {
  const c = await cookies();
  c.delete(SESSION_COOKIE);
  return NextResponse.json({ ok: true });
}
