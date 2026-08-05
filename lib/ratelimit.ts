type Bucket = { count: number; resetAt: number };

const attempts = new Map<string, Bucket>();
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000; // 15 min

// true = 허용, false = 제한 초과
export function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const b = attempts.get(key);
  if (!b || now > b.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (b.count >= MAX_ATTEMPTS) return false;
  b.count += 1;
  return true;
}
