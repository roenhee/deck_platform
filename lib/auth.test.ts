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
