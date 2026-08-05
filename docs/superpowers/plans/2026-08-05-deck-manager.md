# Deck Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 단일 사용자용 HTML 덱 매니저 — 로그인 뒤 self-contained HTML 프레젠테이션을 업로드/폴더정리/열람/다운로드하는 Next.js 15 앱.

**Architecture:** App Router. `middleware.ts`가 Edge에서 세션 쿠키(JWT)를 검증해 `/login` 외 모든 경로를 보호한다. 모든 `/api/*`는 Node 런타임에서 Supabase service role 클라이언트로만 DB/Storage에 접근한다. 파일은 Storage(private)에 있고 URL만으로는 못 열리며, 뷰어는 서버가 스트리밍한 HTML을 `sandbox allow-scripts` iframe으로 띄운다. 슬라이드 내비게이션은 덱 자체에 위임한다.

**Tech Stack:** Next.js 15, TypeScript, Tailwind CSS, `@supabase/supabase-js` (service role), `jose` (JWT), `server-only`, Vitest (단위 테스트: `lib/tree.ts`, `lib/auth.ts`).

---

## 파일 구조

**설정/공용**
- `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `.gitignore` — create-next-app 생성
- `.env.example` (커밋), `.env.local` (gitignore, 키 확보 후 작성)
- `vitest.config.ts` — 단위 테스트 러너
- `lib/types.ts` — `Folder`, `Deck`, `TreeNode` 타입
- `lib/supabase.ts` — service role 클라이언트 (lazy, `server-only`)
- `lib/auth.ts` — jose JWT 서명/검증 + 쿠키 상수 (**Edge-safe, jose만**)
- `lib/password.ts` — timing-safe 비밀번호 비교 (**Node `crypto`만**)
- `lib/ratelimit.ts` — 로그인 시도 제한 (메모리 Map)
- `lib/tree.ts` — 플랫→트리, 순환 검사, breadcrumb 경로

**미들웨어**
- `middleware.ts`

**API 라우트** (전부 `export const runtime = 'nodejs'`)
- `app/api/auth/login/route.ts`, `app/api/auth/logout/route.ts`
- `app/api/folders/route.ts`, `app/api/folders/[id]/route.ts`
- `app/api/decks/route.ts`, `app/api/decks/upload-url/route.ts`
- `app/api/decks/[id]/route.ts`, `app/api/decks/[id]/raw/route.ts`, `app/api/decks/[id]/download/route.ts`

**페이지/컴포넌트**
- `app/layout.tsx`(create-next-app), `app/globals.css`(create-next-app)
- `app/login/page.tsx`
- `app/page.tsx` — 목록 (Server Component)
- `app/deck/[id]/page.tsx` — 뷰어 (Server Component 껍데기)
- `components/FolderTree.tsx` — 좌측 트리 사이드바 (client)
- `components/DeckGrid.tsx` — 덱 카드 그리드 (client)
- `components/UploadButton.tsx` — 업로드 (client)
- `components/MoveDialog.tsx` — 폴더 선택 이동 모달 (client)
- `components/DeckViewer.tsx` — iframe 뷰어 + 상단바 (client)

**테스트**
- `lib/tree.test.ts`, `lib/auth.test.ts`

> **설계 결정 반영 (설계문서 3장)**: `lib/auth.ts`(Edge-safe, jose)와 `lib/password.ts`(Node crypto)를 분리한다 — middleware가 Edge에서 auth.ts만 import 하므로 node `crypto`가 Edge 번들에 새면 안 된다. middleware는 API 미인증 시 리다이렉트 대신 401 JSON을 반환한다(원본 스펙 대비 개선).

---

## Task 1: 스캐폴딩 + 설정 + 공용 모듈

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts` 등 (create-next-app)
- Create: `.env.example`, `vitest.config.ts`, `lib/types.ts`, `lib/supabase.ts`
- Modify: `.gitignore` (create-next-app 생성분 확인)

- [ ] **Step 1: 임시 디렉토리에 Next.js 스캐폴딩** (프로젝트 루트에 `docs/`·`.git`이 있어 직접 스캐폴딩 불가 → 임시 생성 후 병합)

```bash
SCAFFOLD="/private/tmp/claude-501/-Users-roen-axz-pc-Desktop-projects-deck-platform/08a70585-cfa2-41bf-90a0-a7914358ee64/scratchpad/scaffold"
rm -rf "$SCAFFOLD" && mkdir -p "$SCAFFOLD"
cd "$SCAFFOLD"
npx create-next-app@latest deckapp --ts --tailwind --app --no-src-dir --eslint --import-alias "@/*" --use-npm --skip-install --yes
```

Expected: `$SCAFFOLD/deckapp/`에 `app/`, `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `.gitignore` 생성.

- [ ] **Step 2: 생성물을 프로젝트 루트로 병합 (.git 제외)**

```bash
PROJ="/Users/roen.axz-pc/Desktop/projects/deck_platform"
rsync -a --exclude '.git' "$SCAFFOLD/deckapp/" "$PROJ/"
cd "$PROJ" && npm install
```

Expected: 루트에 `app/`, `package.json`, `node_modules/` 생성. 기존 `docs/`, `.git` 보존.

- [ ] **Step 3: 런타임 의존성 설치**

```bash
cd /Users/roen.axz-pc/Desktop/projects/deck_platform
npm install @supabase/supabase-js jose server-only
npm install -D vitest
```

Expected: 설치 성공.

- [ ] **Step 4: `vitest.config.ts` 작성**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
  },
});
```

- [ ] **Step 5: `package.json`에 test 스크립트 추가** (`scripts`에 아래 한 줄 추가)

```json
"test": "vitest run"
```

- [ ] **Step 6: `.env.example` 작성** (커밋됨)

```
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
APP_PASSWORD=
AUTH_SECRET=
```

- [ ] **Step 7: `.gitignore`에 `.env*.local` 포함 확인** — create-next-app 기본 `.gitignore`에 `.env*` 계열이 있는지 확인. 없으면 `.env*.local` 한 줄 추가. (`.env.example`은 무시되지 않아야 하므로 `.env*`가 아니라 `.env*.local` 패턴이어야 함 — 다르면 수정.)

- [ ] **Step 8: `lib/types.ts` 작성**

```ts
export type Folder = {
  id: string;
  name: string;
  parent_id: string | null;
  created_at: string;
};

export type Deck = {
  id: string;
  title: string;
  folder_id: string | null;
  storage_path: string;
  original_filename: string | null;
  file_size: number | null;
  created_at: string;
  updated_at: string;
};

export type TreeNode = Folder & { children: TreeNode[] };
```

- [ ] **Step 9: `lib/supabase.ts` 작성** (lazy 싱글턴 — import 시점에 env 없어도 크래시 안 남)

```ts
import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env vars are not set');
  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

export const DECKS_BUCKET = 'decks';
export const storagePathFor = (deckId: string) => `${deckId}.html`;
```

- [ ] **Step 10: 빌드/타입 확인**

Run: `cd /Users/roen.axz-pc/Desktop/projects/deck_platform && npx tsc --noEmit`
Expected: 에러 없음 (아직 미사용 export 경고 없음).

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "chore: Next.js 스캐폴딩 + Supabase 클라이언트 + 공용 타입/설정"
```

---

## Task 2: 인증 코어 — `lib/auth.ts` + `lib/password.ts` (TDD)

**Files:**
- Create: `lib/auth.ts`, `lib/password.ts`
- Test: `lib/auth.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성** (`lib/auth.test.ts`)

```ts
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
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run lib/auth.test.ts`
Expected: FAIL — `Cannot find module './auth'` / `'./password'`.

- [ ] **Step 3: `lib/auth.ts` 작성** (jose만 — Edge-safe)

```ts
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
    await jwtVerify(token, secret());
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: `lib/password.ts` 작성** (Node crypto만)

```ts
import { createHash, timingSafeEqual } from 'crypto';

// sha256으로 고정 길이 다이제스트를 만들어 길이 노출과 timingSafeEqual 길이 예외를 동시에 피한다.
export function verifyPassword(input: string): boolean {
  const expected = process.env.APP_PASSWORD;
  if (!expected) throw new Error('APP_PASSWORD is not set');
  const a = createHash('sha256').update(input).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run lib/auth.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/auth.ts lib/password.ts lib/auth.test.ts
git commit -m "feat: 세션 JWT + timing-safe 비밀번호 검증 (TDD)"
```

---

## Task 3: 로그인 시도 제한 — `lib/ratelimit.ts`

**Files:**
- Create: `lib/ratelimit.ts`

- [ ] **Step 1: 작성**

```ts
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
```

> 서버리스 인스턴스별 메모리라 완벽하진 않지만 단일 사용자 MVP엔 충분(설계문서 5장).

- [ ] **Step 2: Commit**

```bash
git add lib/ratelimit.ts
git commit -m "feat: 로그인 시도 제한 (메모리 기반)"
```

---

## Task 4: 로그인/로그아웃 API 라우트

**Files:**
- Create: `app/api/auth/login/route.ts`, `app/api/auth/logout/route.ts`

- [ ] **Step 1: `app/api/auth/login/route.ts` 작성**

```ts
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
```

- [ ] **Step 2: `app/api/auth/logout/route.ts` 작성**

```ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE } from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST() {
  const c = await cookies();
  c.delete(SESSION_COOKIE);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: 타입 확인**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 4: Commit**

```bash
git add app/api/auth
git commit -m "feat: 로그인/로그아웃 API 라우트"
```

---

## Task 5: 미들웨어

**Files:**
- Create: `middleware.ts`

- [ ] **Step 1: `middleware.ts` 작성**

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth';

export async function middleware(req: NextRequest) {
  const ok = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (ok) return NextResponse.next();

  // API는 401 JSON, 페이지는 /login 리다이렉트
  if (req.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return NextResponse.redirect(new URL('/login', req.url));
}

export const config = {
  matcher: ['/((?!login|api/auth/login|_next/static|_next/image|favicon.ico).*)'],
};
```

> 검증: `/api/decks/[id]/raw`, `/download`가 matcher에 포함됨(제외 목록에 없음). `import 'server-only'` 계열이 middleware 번들에 없어야 함 — auth.ts는 jose만 쓰므로 OK.

- [ ] **Step 2: 타입 확인 & 미들웨어 로드**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 3: Commit**

```bash
git add middleware.ts
git commit -m "feat: 세션 검증 미들웨어 (Edge)"
```

---

## Task 6: 로그인 페이지

**Files:**
- Create: `app/login/page.tsx`

- [ ] **Step 1: `app/login/page.tsx` 작성** (client)

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    setLoading(false);
    if (res.ok) {
      router.replace('/');
      router.refresh();
    } else if (res.status === 429) {
      setError('시도가 너무 많습니다. 잠시 후 다시 시도하세요.');
    } else {
      setError('비밀번호가 올바르지 않습니다.');
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <form onSubmit={onSubmit} className="w-80 space-y-4 rounded-lg border bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold">Deck Manager</h1>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="비밀번호"
          className="w-full rounded border px-3 py-2"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded bg-black py-2 text-white disabled:opacity-50"
        >
          {loading ? '확인 중…' : '로그인'}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: 타입 확인**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 3: Commit**

```bash
git add app/login
git commit -m "feat: 로그인 페이지"
```

---

## Task 7: `lib/tree.ts` (TDD)

**Files:**
- Create: `lib/tree.ts`
- Test: `lib/tree.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성** (`lib/tree.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import { buildTree, wouldCreateCycle, pathToRoot } from './tree';
import type { Folder } from './types';

const f = (id: string, parent_id: string | null, name = id): Folder => ({
  id, name, parent_id, created_at: '2026-01-01',
});

// A(root) → B → C ,  D(root)
const folders: Folder[] = [f('A', null), f('B', 'A'), f('C', 'B'), f('D', null)];

describe('buildTree', () => {
  it('nests children under parents and returns roots', () => {
    const tree = buildTree(folders);
    expect(tree.map((n) => n.id).sort()).toEqual(['A', 'D']);
    const a = tree.find((n) => n.id === 'A')!;
    expect(a.children.map((n) => n.id)).toEqual(['B']);
    expect(a.children[0].children.map((n) => n.id)).toEqual(['C']);
  });

  it('treats orphan (missing parent) as root', () => {
    const tree = buildTree([f('X', 'GHOST')]);
    expect(tree.map((n) => n.id)).toEqual(['X']);
  });
});

describe('wouldCreateCycle', () => {
  it('true when moving into itself', () => {
    expect(wouldCreateCycle(folders, 'B', 'B')).toBe(true);
  });
  it('true when moving into a descendant', () => {
    expect(wouldCreateCycle(folders, 'A', 'C')).toBe(true);
  });
  it('false when moving into an unrelated folder', () => {
    expect(wouldCreateCycle(folders, 'B', 'D')).toBe(false);
  });
  it('false when moving to root (null)', () => {
    expect(wouldCreateCycle(folders, 'B', null)).toBe(false);
  });
});

describe('pathToRoot', () => {
  it('returns ancestors root-first including self', () => {
    expect(pathToRoot(folders, 'C').map((n) => n.id)).toEqual(['A', 'B', 'C']);
  });
  it('returns empty for null (root view)', () => {
    expect(pathToRoot(folders, null)).toEqual([]);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run lib/tree.test.ts`
Expected: FAIL — `Cannot find module './tree'`.

- [ ] **Step 3: `lib/tree.ts` 작성**

```ts
import type { Folder, TreeNode } from './types';

export function buildTree(folders: Folder[]): TreeNode[] {
  const byId = new Map<string, TreeNode>();
  for (const folder of folders) byId.set(folder.id, { ...folder, children: [] });

  const roots: TreeNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parent_id ? byId.get(node.parent_id) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  const sortRec = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    for (const n of nodes) sortRec(n.children);
  };
  sortRec(roots);
  return roots;
}

// movingId 폴더를 newParentId 아래로 옮기면 순환이 생기는가?
// newParentId에서 위로 거슬러 올라가다 movingId를 만나면 순환.
export function wouldCreateCycle(
  folders: Folder[],
  movingId: string,
  newParentId: string | null,
): boolean {
  if (newParentId === null) return false;
  const byId = new Map(folders.map((f) => [f.id, f]));
  let cur: string | null = newParentId;
  const seen = new Set<string>();
  while (cur) {
    if (cur === movingId) return true;
    if (seen.has(cur)) break; // 기존 데이터 손상 방어
    seen.add(cur);
    cur = byId.get(cur)?.parent_id ?? null;
  }
  return false;
}

// breadcrumb용: 루트부터 id까지 (자기 자신 포함)
export function pathToRoot(folders: Folder[], id: string | null): Folder[] {
  if (!id) return [];
  const byId = new Map(folders.map((f) => [f.id, f]));
  const path: Folder[] = [];
  let cur: string | null = id;
  const seen = new Set<string>();
  while (cur && byId.has(cur) && !seen.has(cur)) {
    seen.add(cur);
    const folder = byId.get(cur)!;
    path.unshift(folder);
    cur = folder.parent_id;
  }
  return path;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run lib/tree.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/tree.ts lib/tree.test.ts
git commit -m "feat: 폴더 트리 구성 + 순환 검사 + breadcrumb 경로 (TDD)"
```

---

## Task 8: 폴더 API 라우트

**Files:**
- Create: `app/api/folders/route.ts`, `app/api/folders/[id]/route.ts`

- [ ] **Step 1: `app/api/folders/route.ts` 작성**

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

export async function GET() {
  const { data, error } = await supabaseAdmin().from('folders').select('*').order('name');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ folders: data });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const name = body?.name;
  if (typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'name required' }, { status: 400 });
  }
  const { data, error } = await supabaseAdmin()
    .from('folders')
    .insert({ name: name.trim(), parent_id: body?.parentId ?? null })
    .select()
    .single();
  if (error) {
    const status = error.code === '23505' ? 409 : 500; // unique_violation
    return NextResponse.json({ error: error.message }, { status });
  }
  return NextResponse.json({ folder: data }, { status: 201 });
}
```

- [ ] **Step 2: `app/api/folders/[id]/route.ts` 작성** (Next 15 — `params`는 Promise)

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { wouldCreateCycle } from '@/lib/tree';
import type { Folder } from '@/lib/types';

export const runtime = 'nodejs';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};

  if (typeof body?.name === 'string') {
    if (!body.name.trim()) return NextResponse.json({ error: 'name empty' }, { status: 400 });
    patch.name = body.name.trim();
  }

  if ('parentId' in (body ?? {})) {
    const newParent: string | null = body.parentId ?? null;
    const { data: folders, error } = await supabaseAdmin().from('folders').select('*');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (wouldCreateCycle(folders as Folder[], id, newParent)) {
      return NextResponse.json({ error: 'circular move' }, { status: 400 });
    }
    patch.parent_id = newParent;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin().from('folders').update(patch).eq('id', id).select().single();
  if (error) {
    const status = error.code === '23505' ? 409 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
  return NextResponse.json({ folder: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // 하위 폴더는 DB cascade, 소속 덱은 on delete set null(=루트)로 자동 이동
  const { error } = await supabaseAdmin().from('folders').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: 타입 확인**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 4: Commit**

```bash
git add app/api/folders
git commit -m "feat: 폴더 CRUD API (순환 검사 포함)"
```

---

## Task 9: 목록 페이지 + 폴더 트리 사이드바 (읽기 + 폴더 액션)

**Files:**
- Create: `app/page.tsx`, `components/FolderTree.tsx`

- [ ] **Step 1: `components/FolderTree.tsx` 작성** (client — 트리 렌더 + 생성/이름변경/삭제)

```tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Folder, TreeNode } from '@/lib/types';
import { buildTree } from '@/lib/tree';

export default function FolderTree({
  folders,
  currentId,
}: {
  folders: Folder[];
  currentId: string | null;
}) {
  const router = useRouter();
  const tree = buildTree(folders);

  async function createFolder(parentId: string | null) {
    const name = window.prompt('새 폴더 이름');
    if (!name?.trim()) return;
    const res = await fetch('/api/folders', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, parentId }),
    });
    if (!res.ok) alert('생성 실패 (이름 중복일 수 있음)');
    router.refresh();
  }

  async function renameFolder(folder: Folder) {
    const name = window.prompt('폴더 이름 변경', folder.name);
    if (!name?.trim() || name === folder.name) return;
    const res = await fetch(`/api/folders/${folder.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) alert('변경 실패');
    router.refresh();
  }

  async function deleteFolder(folder: Folder) {
    if (!window.confirm(`"${folder.name}" 폴더를 삭제할까요? 하위 폴더도 함께 삭제되고, 덱은 루트로 이동합니다.`)) return;
    const res = await fetch(`/api/folders/${folder.id}`, { method: 'DELETE' });
    if (!res.ok) alert('삭제 실패');
    router.refresh();
  }

  return (
    <aside className="w-64 shrink-0 overflow-y-auto border-r bg-gray-50 p-2 text-sm">
      <div className="flex items-center justify-between px-2 py-1">
        <Link href="/" className={`font-medium ${currentId === null ? 'text-black' : 'text-gray-600'}`}>
          📁 루트
        </Link>
        <button onClick={() => createFolder(null)} title="새 폴더" className="text-gray-500 hover:text-black">＋</button>
      </div>
      <ul>
        {tree.map((node) => (
          <FolderRow
            key={node.id}
            node={node}
            depth={0}
            currentId={currentId}
            onCreate={createFolder}
            onRename={renameFolder}
            onDelete={deleteFolder}
          />
        ))}
      </ul>
    </aside>
  );
}

function FolderRow({
  node,
  depth,
  currentId,
  onCreate,
  onRename,
  onDelete,
}: {
  node: TreeNode;
  depth: number;
  currentId: string | null;
  onCreate: (parentId: string | null) => void;
  onRename: (folder: Folder) => void;
  onDelete: (folder: Folder) => void;
}) {
  const [open, setOpen] = useState(true);
  const hasChildren = node.children.length > 0;

  return (
    <li>
      <div
        className={`group flex items-center gap-1 rounded px-2 py-1 hover:bg-gray-200 ${
          currentId === node.id ? 'bg-gray-200 font-medium' : ''
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        <button
          onClick={() => setOpen((v) => !v)}
          className={`w-4 text-gray-400 ${hasChildren ? '' : 'invisible'}`}
        >
          {open ? '▾' : '▸'}
        </button>
        <Link href={`/?folderId=${node.id}`} className="flex-1 truncate">
          {node.name}
        </Link>
        <span className="hidden gap-1 text-gray-400 group-hover:flex">
          <button onClick={() => onCreate(node.id)} title="하위 폴더">＋</button>
          <button onClick={() => onRename(node)} title="이름 변경">✎</button>
          <button onClick={() => onDelete(node)} title="삭제">🗑</button>
        </span>
      </div>
      {open && hasChildren && (
        <ul>
          {node.children.map((child) => (
            <FolderRow
              key={child.id}
              node={child}
              depth={depth + 1}
              currentId={currentId}
              onCreate={onCreate}
              onRename={onRename}
              onDelete={onDelete}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
```

- [ ] **Step 2: `app/page.tsx` 작성** (Server Component — 폴더+덱 조회, breadcrumb 인라인)

```tsx
import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase';
import { pathToRoot } from '@/lib/tree';
import type { Deck, Folder } from '@/lib/types';
import FolderTree from '@/components/FolderTree';
import DeckGrid from '@/components/DeckGrid';
import UploadButton from '@/components/UploadButton';

export const dynamic = 'force-dynamic';

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ folderId?: string }>;
}) {
  const { folderId } = await searchParams;
  const current = folderId ?? null;
  const sb = supabaseAdmin();

  const foldersQuery = sb.from('folders').select('*').order('name');
  const decksQuery = current
    ? sb.from('decks').select('*').eq('folder_id', current).order('created_at', { ascending: false })
    : sb.from('decks').select('*').is('folder_id', null).order('created_at', { ascending: false });

  const [{ data: folders }, { data: decks }] = await Promise.all([foldersQuery, decksQuery]);
  const allFolders = (folders ?? []) as Folder[];
  const deckList = (decks ?? []) as Deck[];
  const crumbs = pathToRoot(allFolders, current);

  return (
    <div className="flex h-screen">
      <FolderTree folders={allFolders} currentId={current} />
      <main className="flex flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-2 border-b px-4">
          <nav className="flex min-w-0 items-center gap-1 truncate text-sm text-gray-600">
            <Link href="/" className="hover:underline">루트</Link>
            {crumbs.map((c) => (
              <span key={c.id} className="flex items-center gap-1">
                <span className="text-gray-300">/</span>
                <Link href={`/?folderId=${c.id}`} className="hover:underline">{c.name}</Link>
              </span>
            ))}
          </nav>
          <div className="flex-1" />
          <UploadButton folderId={current} />
        </header>
        <DeckGrid decks={deckList} folders={allFolders} currentId={current} />
      </main>
    </div>
  );
}
```

> 이 시점엔 `DeckGrid`, `UploadButton`이 아직 없어 빌드가 깨진다. Task 10에서 채운다. 임시로 placeholder를 만들지 말고 Task 10과 이어서 진행 후 함께 빌드 검증한다.

- [ ] **Step 3: Commit** (Task 10과 함께 빌드 검증하므로 여기선 트리/페이지만 커밋)

```bash
git add components/FolderTree.tsx app/page.tsx
git commit -m "feat: 폴더 트리 사이드바 + 목록 페이지 골격"
```

---

## Task 10: 덱 API 라우트 + 덱 그리드 + 업로드

**Files:**
- Create: `app/api/decks/route.ts`, `app/api/decks/upload-url/route.ts`
- Create: `components/DeckGrid.tsx`, `components/UploadButton.tsx`

- [ ] **Step 1: `app/api/decks/route.ts` 작성** (GET 목록 / POST 메타 등록)

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const folderId = req.nextUrl.searchParams.get('folderId');
  const base = supabaseAdmin().from('decks').select('*').order('created_at', { ascending: false });
  const { data, error } = await (folderId ? base.eq('folder_id', folderId) : base.is('folder_id', null));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ decks: data });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { title, folderId, deckId, storagePath, originalFilename, fileSize } = body ?? {};
  if (
    typeof title !== 'string' || !title.trim() ||
    typeof deckId !== 'string' ||
    typeof storagePath !== 'string'
  ) {
    return NextResponse.json({ error: 'invalid payload' }, { status: 400 });
  }
  const { data, error } = await supabaseAdmin()
    .from('decks')
    .insert({
      id: deckId,
      title: title.trim(),
      folder_id: folderId ?? null,
      storage_path: storagePath,
      original_filename: originalFilename ?? null,
      file_size: fileSize ?? null,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deck: data }, { status: 201 });
}
```

- [ ] **Step 2: `app/api/decks/upload-url/route.ts` 작성** (확장자·크기 검증 → signed upload URL)

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { randomUUID } from 'crypto';
import { supabaseAdmin, DECKS_BUCKET, storagePathFor } from '@/lib/supabase';

export const runtime = 'nodejs';

const MAX_SIZE = 50 * 1024 * 1024; // 50MB

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { filename, size } = body ?? {};

  if (typeof filename !== 'string' || !filename.toLowerCase().endsWith('.html')) {
    return NextResponse.json({ error: 'only .html allowed' }, { status: 400 });
  }
  if (typeof size !== 'number' || size <= 0 || size > MAX_SIZE) {
    return NextResponse.json({ error: 'invalid size (max 50MB)' }, { status: 400 });
  }

  const deckId = randomUUID();
  const path = storagePathFor(deckId);
  const { data, error } = await supabaseAdmin()
    .storage.from(DECKS_BUCKET)
    .createSignedUploadUrl(path);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // data.signedUrl은 경로. 절대 URL로 만들어 클라이언트가 raw PUT 할 수 있게 한다(anon key 불필요).
  const uploadUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}${data.signedUrl}`;
  return NextResponse.json({ deckId, path, uploadUrl });
}
```

- [ ] **Step 3: `components/UploadButton.tsx` 작성** (client)

```tsx
'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function UploadButton({ folderId }: { folderId: string | null }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // 같은 파일 재선택 허용
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.html')) {
      alert('.html 파일만 업로드할 수 있습니다.');
      return;
    }
    setBusy(true);
    try {
      // 1) signed upload URL 발급
      const urlRes = await fetch('/api/decks/upload-url', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ filename: file.name, size: file.size }),
      });
      if (!urlRes.ok) {
        alert('업로드 URL 발급 실패: ' + (await urlRes.json()).error);
        return;
      }
      const { deckId, path, uploadUrl } = await urlRes.json();

      // 2) Storage로 직접 PUT
      const putRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'content-type': 'text/html' },
        body: file,
      });
      if (!putRes.ok) {
        alert('파일 업로드 실패 (' + putRes.status + ')');
        return;
      }

      // 3) 메타데이터 등록
      const title = file.name.replace(/\.html$/i, '');
      const metaRes = await fetch('/api/decks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title,
          folderId,
          deckId,
          storagePath: path,
          originalFilename: file.name,
          fileSize: file.size,
        }),
      });
      if (!metaRes.ok) {
        alert('메타데이터 등록 실패');
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <input ref={inputRef} type="file" accept=".html,text/html" onChange={onFile} className="hidden" />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="rounded bg-black px-3 py-1.5 text-sm text-white disabled:opacity-50"
      >
        {busy ? '업로드 중…' : '＋ 업로드'}
      </button>
    </>
  );
}
```

- [ ] **Step 4: `components/DeckGrid.tsx` 작성** (client — 카드 + 열기/다운로드/이름변경/삭제, 이동은 Task 12에서 MoveDialog 연결)

```tsx
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Deck, Folder } from '@/lib/types';

export default function DeckGrid({
  decks,
  folders,
  currentId,
}: {
  decks: Deck[];
  folders: Folder[];
  currentId: string | null;
}) {
  const router = useRouter();

  async function rename(deck: Deck) {
    const title = window.prompt('제목 변경', deck.title);
    if (!title?.trim() || title === deck.title) return;
    const res = await fetch(`/api/decks/${deck.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    if (!res.ok) alert('변경 실패');
    router.refresh();
  }

  async function remove(deck: Deck) {
    if (!window.confirm(`"${deck.title}" 덱을 삭제할까요?`)) return;
    const res = await fetch(`/api/decks/${deck.id}`, { method: 'DELETE' });
    if (!res.ok) alert('삭제 실패');
    router.refresh();
  }

  if (decks.length === 0) {
    return <div className="flex flex-1 items-center justify-center text-gray-400">이 폴더에 덱이 없습니다.</div>;
  }

  return (
    <div className="grid flex-1 grid-cols-[repeat(auto-fill,minmax(200px,1fr))] content-start gap-4 overflow-y-auto p-4">
      {decks.map((deck) => (
        <div key={deck.id} className="group flex flex-col rounded-lg border bg-white p-3 shadow-sm">
          <Link href={`/deck/${deck.id}`} className="mb-2 flex h-24 items-center justify-center rounded bg-gray-100 text-3xl">
            🖥
          </Link>
          <div className="truncate text-sm font-medium" title={deck.title}>{deck.title}</div>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-500">
            <Link href={`/deck/${deck.id}`} className="hover:text-black">열기</Link>
            <a href={`/api/decks/${deck.id}/download`} className="hover:text-black">다운로드</a>
            <button onClick={() => rename(deck)} className="hover:text-black">이름변경</button>
            <button onClick={() => remove(deck)} className="hover:text-black">삭제</button>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: 빌드 검증** (Task 9 페이지 포함 전체 빌드)

Run: `npm run build`
Expected: 빌드 성공. (env 없이 빌드되며, `dynamic = 'force-dynamic'`이라 홈페이지는 요청 시 렌더 → 빌드 시 Supabase 호출 안 함.)

- [ ] **Step 6: Commit**

```bash
git add app/api/decks components/DeckGrid.tsx components/UploadButton.tsx
git commit -m "feat: 덱 목록/업로드 API + 그리드 + 업로드 버튼"
```

---

## Task 11: 뷰어 — raw 라우트 + `/deck/[id]` + DeckViewer

**Files:**
- Create: `app/api/decks/[id]/raw/route.ts`, `app/deck/[id]/page.tsx`, `components/DeckViewer.tsx`

- [ ] **Step 1: `app/api/decks/[id]/raw/route.ts` 작성** (스트리밍, sandbox CSP)

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin, DECKS_BUCKET } from '@/lib/supabase';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = supabaseAdmin();

  const { data: deck, error } = await sb.from('decks').select('storage_path').eq('id', id).single();
  if (error || !deck) return new NextResponse('Not found', { status: 404 });

  const { data, error: dlErr } = await sb.storage.from(DECKS_BUCKET).download(deck.storage_path);
  if (dlErr || !data) return new NextResponse('Not found', { status: 404 });

  return new NextResponse(data, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': "sandbox allow-scripts;",
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    },
  });
}
```

- [ ] **Step 2: `components/DeckViewer.tsx` 작성** (client — iframe + 자동숨김 상단바)

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function DeckViewer({ id, title }: { id: string; title: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const router = useRouter();
  const [barVisible, setBarVisible] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const focusDeck = () => ref.current?.focus();

  const scheduleHide = () => {
    setBarVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setBarVisible(false), 2000);
  };

  useEffect(() => {
    scheduleHide();
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  const goFullscreen = () => ref.current?.requestFullscreen?.();
  const noFocusSteal = (e: React.MouseEvent) => e.preventDefault();

  return (
    <div className="fixed inset-0 bg-black" onMouseMove={scheduleHide} onClick={focusDeck}>
      <iframe
        ref={ref}
        src={`/api/decks/${id}/raw`}
        sandbox="allow-scripts"
        allow="fullscreen"
        onLoad={focusDeck}
        className="h-full w-full border-0"
      />
      <div
        className={`fixed inset-x-0 top-0 flex h-12 items-center gap-4 bg-black/70 px-4 text-white transition-opacity ${
          barVisible ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        <button onMouseDown={noFocusSteal} onClick={() => router.push('/')} className="hover:underline">← 뒤로</button>
        <span className="min-w-0 flex-1 truncate text-sm">{title}</span>
        <a onMouseDown={noFocusSteal} href={`/api/decks/${id}/download`} className="hover:underline">다운로드</a>
        <button onMouseDown={noFocusSteal} onClick={goFullscreen} className="hover:underline">전체화면</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: `app/deck/[id]/page.tsx` 작성** (Server Component)

```tsx
import { notFound } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase';
import DeckViewer from '@/components/DeckViewer';

export const dynamic = 'force-dynamic';

export default async function DeckPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: deck } = await supabaseAdmin().from('decks').select('id, title').eq('id', id).single();
  if (!deck) notFound();
  return <DeckViewer id={deck.id} title={deck.title} />;
}
```

- [ ] **Step 4: 빌드 검증**

Run: `npm run build`
Expected: 빌드 성공.

- [ ] **Step 5: Commit**

```bash
git add app/api/decks/\[id\]/raw app/deck components/DeckViewer.tsx
git commit -m "feat: 덱 뷰어 (raw 스트리밍 + sandbox iframe + 상단바)"
```

---

## Task 12: 덱 수정/삭제/다운로드 API + 이동 모달

**Files:**
- Create: `app/api/decks/[id]/route.ts`, `app/api/decks/[id]/download/route.ts`, `components/MoveDialog.tsx`
- Modify: `components/DeckGrid.tsx` (이동 버튼 → MoveDialog 연결)

- [ ] **Step 1: `app/api/decks/[id]/route.ts` 작성** (PATCH 제목/이동, DELETE 행+Storage)

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin, DECKS_BUCKET } from '@/lib/supabase';

export const runtime = 'nodejs';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (typeof body?.title === 'string') {
    if (!body.title.trim()) return NextResponse.json({ error: 'title empty' }, { status: 400 });
    patch.title = body.title.trim();
  }
  if ('folderId' in (body ?? {})) patch.folder_id = body.folderId ?? null;

  if (Object.keys(patch).length === 1) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin().from('decks').update(patch).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deck: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = supabaseAdmin();

  const { data: deck, error: e1 } = await sb.from('decks').select('storage_path').eq('id', id).single();
  if (e1 || !deck) return NextResponse.json({ error: 'not found' }, { status: 404 });

  // Storage 먼저 지워 고아 파일 방지. 실패 시 행은 남긴다(일관성).
  const { error: e2 } = await sb.storage.from(DECKS_BUCKET).remove([deck.storage_path]);
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });

  const { error: e3 } = await sb.from('decks').delete().eq('id', id);
  if (e3) return NextResponse.json({ error: e3.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: `app/api/decks/[id]/download/route.ts` 작성** (attachment)

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin, DECKS_BUCKET } from '@/lib/supabase';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = supabaseAdmin();

  const { data: deck, error } = await sb
    .from('decks')
    .select('storage_path, original_filename, title')
    .eq('id', id)
    .single();
  if (error || !deck) return new NextResponse('Not found', { status: 404 });

  const { data, error: dlErr } = await sb.storage.from(DECKS_BUCKET).download(deck.storage_path);
  if (dlErr || !data) return new NextResponse('Not found', { status: 404 });

  const rawName = deck.original_filename || `${deck.title}.html`;
  const asciiName = rawName.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '');
  const encoded = encodeURIComponent(rawName);

  return new NextResponse(data, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': `attachment; filename="${asciiName}"; filename*=UTF-8''${encoded}`,
      'Cache-Control': 'private, no-store',
    },
  });
}
```

- [ ] **Step 3: `components/MoveDialog.tsx` 작성** (client — 폴더 선택 모달)

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Folder, TreeNode } from '@/lib/types';
import { buildTree } from '@/lib/tree';

export default function MoveDialog({
  deckId,
  folders,
  onClose,
}: {
  deckId: string;
  folders: Folder[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const tree = buildTree(folders);

  async function moveTo(folderId: string | null) {
    setSaving(true);
    const res = await fetch(`/api/decks/${deckId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ folderId }),
    });
    setSaving(false);
    if (!res.ok) {
      alert('이동 실패');
      return;
    }
    onClose();
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="max-h-[70vh] w-80 overflow-y-auto rounded-lg bg-white p-4 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-3 text-sm font-semibold">이동할 폴더 선택</h2>
        <button
          onClick={() => moveTo(null)}
          disabled={saving}
          className="mb-1 block w-full rounded px-2 py-1 text-left text-sm hover:bg-gray-100"
        >
          📁 루트
        </button>
        <MoveTree nodes={tree} depth={0} onPick={moveTo} disabled={saving} />
        <button onClick={onClose} className="mt-3 w-full rounded border py-1 text-sm">취소</button>
      </div>
    </div>
  );
}

function MoveTree({
  nodes,
  depth,
  onPick,
  disabled,
}: {
  nodes: TreeNode[];
  depth: number;
  onPick: (id: string) => void;
  disabled: boolean;
}) {
  return (
    <>
      {nodes.map((node) => (
        <div key={node.id}>
          <button
            onClick={() => onPick(node.id)}
            disabled={disabled}
            className="block w-full truncate rounded px-2 py-1 text-left text-sm hover:bg-gray-100"
            style={{ paddingLeft: `${depth * 12 + 8}px` }}
          >
            {node.name}
          </button>
          {node.children.length > 0 && (
            <MoveTree nodes={node.children} depth={depth + 1} onPick={onPick} disabled={disabled} />
          )}
        </div>
      ))}
    </>
  );
}
```

- [ ] **Step 4: `components/DeckGrid.tsx` 수정** — 이동 버튼 + MoveDialog 상태 연결. 파일 상단 import와 컴포넌트 본문을 아래로 교체.

`import` 부분에 추가:
```tsx
import { useState } from 'react';
import MoveDialog from '@/components/MoveDialog';
```

`DeckGrid` 함수 본문에서 `const router = useRouter();` 아래에 상태 추가:
```tsx
const [movingDeck, setMovingDeck] = useState<Deck | null>(null);
```

카드의 액션 줄(`<div className="mt-2 flex flex-wrap ...">`)에서 `삭제` 버튼 앞에 이동 버튼 추가:
```tsx
<button onClick={() => setMovingDeck(deck)} className="hover:text-black">이동</button>
```

그리드 컨테이너 `</div>` 닫기 **직전**에 모달 추가:
```tsx
{movingDeck && (
  <MoveDialog deckId={movingDeck.id} folders={folders} onClose={() => setMovingDeck(null)} />
)}
```

(주의: 빈 폴더일 때 early-return 하는 분기에서는 모달을 안 띄워도 됨 — 이동은 카드가 있을 때만 발생.)

- [ ] **Step 5: 빌드 검증**

Run: `npm run build`
Expected: 빌드 성공.

- [ ] **Step 6: Commit**

```bash
git add app/api/decks/\[id\] components/MoveDialog.tsx components/DeckGrid.tsx
git commit -m "feat: 덱 수정/삭제/다운로드 API + 이동 모달"
```

---

## Task 13: 드래그 앤 드롭 이동

**Files:**
- Modify: `components/DeckGrid.tsx` (카드 draggable)
- Modify: `components/FolderTree.tsx` (폴더 행 drop 타겟)

- [ ] **Step 1: `components/DeckGrid.tsx` — 카드에 draggable 추가.** 각 덱 카드 최상위 `<div key={deck.id} ...>`에 아래 속성 추가:

```tsx
draggable
onDragStart={(e) => {
  e.dataTransfer.setData('application/x-deck-id', deck.id);
  e.dataTransfer.effectAllowed = 'move';
}}
```

- [ ] **Step 2: `components/FolderTree.tsx` — 드롭 처리 함수 추가.** `FolderTree` 컴포넌트 안, `deleteFolder` 아래에 추가:

```tsx
async function handleDropOnFolder(deckId: string, folderId: string | null) {
  const res = await fetch(`/api/decks/${deckId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ folderId }),
  });
  if (!res.ok) alert('이동 실패');
  router.refresh();
}
```

- [ ] **Step 3: 루트 링크와 각 폴더 행을 drop 타겟으로.**

루트 줄(`<div className="flex items-center justify-between ...">`)에 추가:
```tsx
onDragOver={(e) => e.preventDefault()}
onDrop={(e) => {
  const deckId = e.dataTransfer.getData('application/x-deck-id');
  if (deckId) handleDropOnFolder(deckId, null);
}}
```

`FolderRow`에 `onDropDeck` prop을 넘겨 각 행이 자기 폴더로 드롭을 받게 한다. `FolderRow` 호출부(2곳: `tree.map`과 재귀 `node.children.map`)에 prop 추가:
```tsx
onDropDeck={onDropDeck}
```

`FolderTree`의 `tree.map` 렌더에 `onDropDeck={handleDropOnFolder}` 추가. `FolderRow` 타입/시그니처에 prop 추가:
```tsx
onDropDeck: (deckId: string, folderId: string | null) => void;
```

`FolderRow`의 행 `<div className="group flex items-center ...">`에 추가:
```tsx
onDragOver={(e) => e.preventDefault()}
onDrop={(e) => {
  const deckId = e.dataTransfer.getData('application/x-deck-id');
  if (deckId) onDropDeck(deckId, node.id);
}}
```

- [ ] **Step 4: 빌드 검증**

Run: `npm run build`
Expected: 빌드 성공.

- [ ] **Step 5: Commit**

```bash
git add components/DeckGrid.tsx components/FolderTree.tsx
git commit -m "feat: 덱 카드 → 폴더 드래그 앤 드롭 이동"
```

---

## Task 14: 전체 단위 테스트 + 최종 점검

**Files:** 없음 (검증만)

- [ ] **Step 1: 전체 단위 테스트 실행**

Run: `npm test`
Expected: `lib/auth.test.ts`(6) + `lib/tree.test.ts`(8) 전부 PASS.

- [ ] **Step 2: 타입/린트/빌드 최종 확인**

Run: `npx tsc --noEmit && npm run build`
Expected: 에러 없음.

- [ ] **Step 3: 설계문서 10장 체크리스트 코드 레벨 확인** (수동, 코드 grep)
  - `SUPABASE_SERVICE_ROLE_KEY`가 `NEXT_PUBLIC_` 없이만 쓰이는지: `grep -rn "SERVICE_ROLE" app components lib` → `lib/supabase.ts`에서만.
  - 클라이언트 컴포넌트에서 `@/lib/supabase` import 없는지: `grep -rn "lib/supabase" components` → 결과 없음이어야 함.
  - `/api/decks/*`가 middleware 제외 목록에 없는지: `middleware.ts` matcher 확인.
  - iframe에 `allow-same-origin` 없는지: `grep -n "sandbox" components/DeckViewer.tsx` → `allow-scripts`만.

- [ ] **Step 4: Commit** (변경 없으면 skip)

```bash
git add -A && git commit -m "test: 전체 단위 테스트 통과 및 최종 점검" || echo "no changes"
```

---

## Task 15: 실제 연동 검증 (Supabase 키 확보 후) + 배포

> 이 태스크는 사용자가 Supabase 셋업을 마치고 `.env.local`에 키를 넣은 뒤 진행한다. 코드 개발과 병렬이 아니라 **순차 의존**.

- [ ] **Step 1: `.env.local` 작성** (사용자 제공 값으로)

```
NEXT_PUBLIC_SUPABASE_URL=<프로젝트 URL>
SUPABASE_SERVICE_ROLE_KEY=<service role 키>
APP_PASSWORD=<접속 비밀번호>
AUTH_SECRET=<openssl rand -base64 32 결과>
```

- [ ] **Step 2: 로컬 실행 & 인증 확인**

Run: `npm run dev`
검증: `http://localhost:3000` 접속 시 `/login` 리다이렉트 → 틀린 비번 거부 → 맞는 비번으로 목록 진입.

- [ ] **Step 3: 업로드 왕복 검증** (raw PUT 방식 확인 지점)
  - 샘플 `.html` 덱 업로드 → 카드 생성 확인.
  - **만약 2단계 PUT이 400/401로 실패하면**: signed upload 엔드포인트가 헤더 인증을 요구하는 것. 대응책 — `upload-url` 라우트를 `{ deckId, path, token }` 반환으로 바꾸고, 클라이언트에서 `@supabase/supabase-js` 브라우저 클라이언트(`createClient(NEXT_PUBLIC_SUPABASE_URL, '<anon key>')`)의 `storage.from('decks').uploadToSignedUrl(path, token, file, { contentType: 'text/html' })` 사용. 이 경우에만 anon key를 `NEXT_PUBLIC_SUPABASE_ANON_KEY`로 추가(설계문서 예외로 기록). RLS 정책이 없으므로 anon key로는 signed 업로드 외 아무것도 못 함.

- [ ] **Step 4: 뷰어/다운로드/이동/삭제 수동 E2E**
  - 뷰어: 카드 열기 → 슬라이드 방향키/`f` 전체화면 동작, 상단바 자동 숨김, 전체화면 버튼 동작.
  - 다운로드: attachment로 원본 파일명 저장.
  - 폴더 생성/이름변경/삭제, 덱 이동(모달+D&D), 삭제 시 Storage 객체도 사라지는지 Supabase 대시보드에서 확인.
  - 보안: 로그아웃 상태(다른 시크릿창)에서 `/api/decks/<id>/raw` 직접 접근 → 401.

- [ ] **Step 5: GitHub 푸시 & Vercel 배포**
  - 푸시: `git push -u origin main` (저장소 공개 여부 사용자 확인 후).
  - Vercel: 저장소 임포트 → 환경변수 4개 등록(`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `APP_PASSWORD`, `AUTH_SECRET`) → 배포.
  - 배포 URL에서 Step 2~4 재확인.

---

## 부록: Supabase 셋업 가이드 (사용자 직접 수행)

> 코드와 병렬로 진행 가능. 완료 후 4개 값(`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `APP_PASSWORD`용 비번, `AUTH_SECRET`)을 확보한다.

1. **프로젝트 생성**: supabase.com 로그인 → New project → 리전/DB 비번 설정.
2. **SQL 실행**: 대시보드 SQL Editor에서 설계문서 4장의 SQL(확장 + `folders`/`decks` 테이블 + 인덱스 + RLS enable, 정책 없음) 실행.
3. **Storage 버킷**: Storage → New bucket → 이름 `decks`, **Public 체크 해제(off)**, 정책 추가하지 않음.
4. **키 확보**: Project Settings → API → `Project URL`(= `NEXT_PUBLIC_SUPABASE_URL`), `service_role` secret(= `SUPABASE_SERVICE_ROLE_KEY`). service_role 키는 절대 클라이언트/깃에 노출 금지.
5. **AUTH_SECRET 생성**: 로컬에서 `openssl rand -base64 32`.

---

## Self-Review (작성자 점검 결과)

- **Spec coverage**: 설계문서 4~9장 전 항목이 Task에 매핑됨 — 데이터모델(부록/Task15 SQL), 인증(2·4·5·6), 폴더(7·8·9), 업로드(10), 뷰어(11), 수정/삭제/다운로드/이동(12), D&D(13), 테스트(2·7·14), 배포(15). 10장 체크리스트는 Task 14 Step 3에 확인 절차로 반영.
- **Placeholder scan**: 각 코드 단계에 완전한 코드 포함. "적절히 처리" 류 없음. Task 15의 raw-PUT 폴백만 조건부 분기로 명시(플레이스홀더 아님).
- **Type consistency**: `Folder`/`Deck`/`TreeNode`(types.ts) 일관. `SESSION_COOKIE`/`SESSION_MAX_AGE`(auth.ts) 라우트/미들웨어 일치. upload-url 반환 `{ deckId, path, uploadUrl }` ↔ UploadButton 소비 키 일치. `/api/decks` POST 페이로드(`title,folderId,deckId,storagePath,originalFilename,fileSize`) ↔ 라우트 파싱 일치. `buildTree`/`wouldCreateCycle`/`pathToRoot` 시그니처 호출부 일치.
