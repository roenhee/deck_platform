import { beforeAll, describe, expect, it } from 'vitest';
import { createSessionToken, verifySessionToken } from './auth';
import { verifyPassword } from './password';

beforeAll(() => {
  process.env.AUTH_SECRET = 'test-secret-at-least-32-bytes-long-xxxxx';
  process.env.APP_PASSWORD = 'hunter2';
});

describe('session token', () => {
  it('round-trips a valid token', async () => {
    const token = await createSessionToken();
    expect(await verifySessionToken(token)).toBe(true);
  });

  it('rejects undefined', async () => {
    expect(await verifySessionToken(undefined)).toBe(false);
  });

  it('rejects a tampered token', async () => {
    const token = await createSessionToken();
    expect(await verifySessionToken(token + 'x')).toBe(false);
  });

  it('rejects a token signed with a different secret (forgery)', async () => {
    const token = await createSessionToken();
    const prev = process.env.AUTH_SECRET;
    process.env.AUTH_SECRET = 'a-totally-different-secret-value-1234567890';
    const result = await verifySessionToken(token);
    process.env.AUTH_SECRET = prev;
    expect(result).toBe(false);
  });
});

describe('password', () => {
  it('accepts the correct password', () => {
    expect(verifyPassword('hunter2')).toBe(true);
  });
  it('rejects a wrong password', () => {
    expect(verifyPassword('nope')).toBe(false);
  });
  it('rejects a wrong-length password without throwing', () => {
    expect(verifyPassword('short')).toBe(false);
  });
});
