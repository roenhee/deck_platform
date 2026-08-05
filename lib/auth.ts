import { SignJWT, jwtVerify } from 'jose';

export const SESSION_COOKIE = 'session';
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days (seconds)

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error('AUTH_SECRET is not set');
  return new TextEncoder().encode(s);
}

export async function createSessionToken(): Promise<string> {
  return new SignJWT({ role: 'owner' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(secret());
}

export async function verifySessionToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  try {
    await jwtVerify(token, secret(), { algorithms: ['HS256'] });
    return true;
  } catch {
    return false;
  }
}
