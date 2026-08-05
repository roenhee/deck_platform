import { createHash, timingSafeEqual } from 'crypto';

// sha256으로 고정 길이 다이제스트를 만들어 길이 노출과 timingSafeEqual 길이 예외를 동시에 피한다.
export function verifyPassword(input: string): boolean {
  const expected = process.env.APP_PASSWORD;
  if (!expected) throw new Error('APP_PASSWORD is not set');
  const a = createHash('sha256').update(input).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}
