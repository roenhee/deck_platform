# Deck Manager — 설계 문서

작성일: 2026-08-05
원본 스펙: `deck-manager-spec.md` (사용자 제공)
상태: 브레인스토밍 확정 → 구현 계획 대기

HTML 덱(self-contained)을 업로드/보관/열람하는 **단일 사용자** 웹 도구. 이 문서는 원본 스펙에 브레인스토밍에서 확정한 기술 결정을 합친 최종 설계다.

---

## 1. 목표와 범위

- **목표**: 이미지가 base64로 인라인된 self-contained HTML 프레젠테이션 덱을 업로드하고, 폴더 트리로 정리하고, 브라우저에서 바로 열람/다운로드한다.
- **핵심 보안 요구**: 파일 URL만 알아도 로그인 없이는 못 연다. 모든 Storage 접근은 서버 라우트를 경유하고, service role 키는 서버에만 존재한다.
- **1차 범위**: 스펙 전체를 한 번에 구현한다 (D&D 이동, 로그인 시도 제한 포함).
- **비목표(YAGNI)**: 다중 사용자/권한, 덱 간 연속 재생, 발표자 노트, 부모↔덱 postMessage 제어.

---

## 2. 스택

- **Next.js 15 (App Router) + TypeScript**
- **Tailwind CSS**
- **Supabase**: Postgres(메타데이터), Storage(파일 본체) — service role만 사용, anon key 미사용
- **jose**: 세션 쿠키 JWT 서명/검증 (Edge Middleware 호환)
- **패키지 매니저**: npm
- 상태관리: 별도 라이브러리 없이 Server Component + `router.refresh()`
- 배포: Vercel

### 환경 변수

```
NEXT_PUBLIC_SUPABASE_URL=      # 프로젝트 URL (공개돼도 무방)
SUPABASE_SERVICE_ROLE_KEY=     # 서버 전용. 절대 클라이언트 노출 금지 (NEXT_PUBLIC_ 접두어 금지)
APP_PASSWORD=                  # 접속 비밀번호 (평문)
AUTH_SECRET=                   # JWT 서명용 랜덤 32바이트 이상
```

---

## 3. 확정한 기술 결정 (브레인스토밍 델타)

원본 스펙이 암묵적으로 남겨둔 부분을 다음과 같이 확정한다.

1. **런타임 분리**
   - `middleware.ts` → **Edge 런타임** (jose Edge 호환, 모든 요청 쿠키 검증).
   - 모든 `/api/*` 라우트 → **Node.js 런타임** (`export const runtime = 'nodejs'`). service role 클라이언트 + 파일 스트리밍 안정성 확보.

2. **업로드 검증의 현실적 한계**
   - Storage 직접 업로드라 파일 본문이 서버를 거치지 않음 → **실제 바이트 MIME 스니핑 불가**.
   - 대신 `/upload-url` 발급 시 **확장자(`.html`) + 크기(≤50MB)를 서버에서 검증**하고, 서명 업로드에 `content-type: text/html` 고정.
   - 감수 근거: 단일 사용자 + 모든 덱을 `allow-same-origin` 없는 `CSP sandbox allow-scripts`로만 서빙.
   - 체크리스트의 "MIME 검증"은 **"확장자 + content-type 강제"**로 대체.

3. **폴더 삭제는 DB 제약으로 처리 (앱 로직 없음)**
   - 하위 폴더 `on delete cascade`, 덱 `on delete set null`(→ 루트). 폴더 서브트리 삭제 시 영향받은 덱은 자동으로 루트 이동.

4. **`updated_at`** 은 PATCH 시 앱 코드에서 명시적으로 `now()` 갱신 (DB 트리거 없음).

5. **`storage_path`** 는 버킷 내 키 `{deck_id}.html` 로 저장 (버킷명 = `decks`). 업로드는 supabase-js `createSignedUploadUrl` → 클라이언트 `uploadToSignedUrl`.

6. **테스트 범위 (경량)**
   - 단위 테스트: `lib/tree.ts`(플랫→트리 구성, 순환 검사), `lib/auth.ts`(JWT 서명/검증, 타이밍 안전 비교).
   - 나머지(UI/업로드/뷰어)는 수동 E2E. 풀 Playwright 하네스는 도입하지 않음.
   - 러너: Vitest (Next 15 + TS와 가볍게 통합).

---

## 4. 데이터 모델

```sql
create extension if not exists "pgcrypto";

create table folders (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  parent_id   uuid references folders(id) on delete cascade,
  created_at  timestamptz not null default now()
);

-- 같은 부모 안에서 이름 중복 방지 (루트 = parent_id null 포함)
create unique index folders_unique_name
  on folders (coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), name);

create table decks (
  id                uuid primary key default gen_random_uuid(),
  title             text not null,
  folder_id         uuid references folders(id) on delete set null,  -- null = 루트
  storage_path      text not null unique,   -- 버킷 내 키: {deck_id}.html
  original_filename text,
  file_size         bigint,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index decks_folder_idx on decks (folder_id);

-- RLS는 켜되 정책을 만들지 않는다 → anon/authenticated 전부 차단, service role만 통과
alter table folders enable row level security;
alter table decks   enable row level security;
```

### Storage
- 버킷명: `decks`, **Public = off**, 정책 없음 (service role만 접근)
- 경로 규칙: `{deck_id}.html`

### 폴더 트리 처리
- 폴더 수백 개 이하 가정 → 전체를 한 번에 조회해 클라이언트에서 트리 구성. 재귀 CTE 불필요.
- 폴더 이동 시 **순환 참조 검사 필수** (target이 moving의 자손이면 400):

```sql
with recursive descendants as (
  select id from folders where id = $moving_id
  union all
  select f.id from folders f join descendants d on f.parent_id = d.id
)
select exists (select 1 from descendants where id = $target_id);
```

---

## 5. 인증

1. `/login`에서 비밀번호 POST
2. `crypto.timingSafeEqual`로 `APP_PASSWORD`와 비교 (타이밍 공격 방어)
3. 성공 시 `jose`로 JWT 발급 → `session` 쿠키
   - `httpOnly: true, secure: true, sameSite: 'lax', maxAge: 60*60*24*30`
4. 실패 시 IP 기준 간단한 시도 제한 (MVP: 메모리 Map)

### Middleware

`middleware.ts` — 아래를 제외한 **모든 경로**에서 쿠키 검증, 실패 시 `/login` 리다이렉트:

```ts
export const config = {
  matcher: ['/((?!login|api/auth/login|_next/static|_next/image|favicon.ico).*)'],
};
```

**중요**: `/api/decks/[id]/raw`와 `/download`도 이 보호 범위 안에 있어야 한다. 파일 URL만 알아도 못 열리게 하는 게 핵심 요구사항.

---

## 6. API 라우트

| Method | Path | 설명 |
|---|---|---|
| POST | `/api/auth/login` | 비밀번호 검증, 쿠키 발급 |
| POST | `/api/auth/logout` | 쿠키 삭제 |
| GET | `/api/folders` | 전체 폴더 목록 (플랫 배열) |
| POST | `/api/folders` | 생성 `{ name, parentId }` |
| PATCH | `/api/folders/[id]` | 이름 변경 / 이동 `{ name?, parentId? }` — 순환 검사 |
| DELETE | `/api/folders/[id]` | 삭제 (하위 cascade, 덱은 루트로) |
| GET | `/api/decks?folderId=` | 해당 폴더 덱 목록 (`folderId` 없으면 루트) |
| POST | `/api/decks/upload-url` | 업로드용 signed URL 발급 (확장자·크기 검증) |
| POST | `/api/decks` | 업로드 완료 후 메타데이터 등록 |
| PATCH | `/api/decks/[id]` | 제목 변경 / 폴더 이동 |
| DELETE | `/api/decks/[id]` | DB 행 + Storage 객체 함께 삭제 |
| GET | `/api/decks/[id]/raw` | HTML 스트리밍 (뷰어 iframe용) |
| GET | `/api/decks/[id]/download` | `Content-Disposition: attachment` 다운로드 |

### 업로드 방식 (Vercel 4.5MB 본문 제한 우회)

1. 클라이언트 → `POST /api/decks/upload-url` (파일명, 크기 전달)
2. 서버: 쿠키 검증 → `.html` 확인 → 크기 상한(50MB) 확인 → `deck_id` 발급 → `createSignedUploadUrl(path)` 반환
3. 클라이언트 → 반환된 signed URL로 Supabase에 직접 PUT (`uploadToSignedUrl`, `content-type: text/html`)
4. 클라이언트 → `POST /api/decks`로 메타데이터 등록

### 조회 방식 (스트리밍, 리다이렉트 금지)

```ts
const { data } = await supabase.storage.from('decks').download(path);
return new Response(data, {
  headers: {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy': "sandbox allow-scripts;",
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, no-store',
  },
});
```

리다이렉트하면 signed URL이 히스토리/공유로 새어나가므로 **서버가 직접 스트리밍**한다.

---

## 7. 화면

### `/login`
비밀번호 입력 하나 + 실패 메시지.

### `/` — 목록
```
┌──────────────┬────────────────────────────────┐
│ 폴더 트리     │  Breadcrumb   [＋폴더] [업로드] │
│  ▸ 2024      ├────────────────────────────────┤
│  ▾ 2025      │  ▤ deck A    ▤ deck B          │
│    ▸ Q1      │  ▤ deck C                      │
│  ▸ 아카이브   │                                │
└──────────────┴────────────────────────────────┘
```
- 좌측: 폴더 트리 (접기/펼치기, ⋯ 메뉴로 생성·이름변경·삭제)
- 우측: 현재 폴더 덱 카드 그리드. 카드마다 열기 / 다운로드 / 이동 / 이름변경 / 삭제
- 이동: MoveDialog(폴더 선택 모달) 기본 + HTML5 D&D(덱 카드/폴더 → 좌측 폴더 드롭)

### `/deck/[id]` — 뷰어

**슬라이드 내비게이션은 전부 덱에 위임. 부모는 키 핸들러를 만들지 않는다.** (덱 자체가 ←/→/Space/Home/End/f, hover nav-bar, 자동 스케일 내장)

```tsx
<iframe
  ref={ref}
  src={`/api/decks/${id}/raw`}
  sandbox="allow-scripts"
  allow="fullscreen"
  onLoad={() => ref.current?.focus()}
  className="w-full h-full border-0"
/>
```

**반드시 챙길 것:**
1. `allow="fullscreen"` 필수 (없으면 덱 `f` 키가 조용히 안 먹음 — sandbox opaque origin).
2. 포커스 관리: `onLoad`/컨테이너 클릭 시 `iframe.focus()`, 상단바 버튼은 `onMouseDown={e => e.preventDefault()}`로 포커스 뺏김 방지.
3. iframe은 뷰포트 전체 크기 (부모는 스케일링하지 않음 — 덱이 알아서 스케일).

**상단바** (4개만): 뒤로가기 / 덱 제목 / 다운로드 / 전체화면 버튼. 마우스 정지 2초 후 자동 숨김. 전체화면은 부모가 `ref.current.requestFullscreen()` 직접 호출(덱 `f` 키의 확실한 우회로).

**감수**: ESC로 목록 복귀 불가(ESC도 iframe에 갇힘). 전체화면 상태에선 ESC가 브라우저 차원에서 빠져나옴. 목록 복귀는 상단바 뒤로가기.

---

## 8. 디렉토리 구조

```
app/
  login/page.tsx
  page.tsx                      # 목록 (Server Component)
  deck/[id]/page.tsx            # 뷰어
  api/
    auth/login/route.ts
    auth/logout/route.ts
    folders/route.ts
    folders/[id]/route.ts
    decks/route.ts
    decks/upload-url/route.ts
    decks/[id]/route.ts
    decks/[id]/raw/route.ts
    decks/[id]/download/route.ts
components/
  FolderTree.tsx
  DeckGrid.tsx
  UploadButton.tsx
  MoveDialog.tsx
  DeckViewer.tsx
lib/
  supabase.ts                   # service role 클라이언트 (server-only)
  auth.ts                       # JWT 발급/검증, timing-safe 비교
  tree.ts                       # 플랫 배열 → 트리, 순환 검사
  ratelimit.ts                  # 로그인 시도 제한 (메모리 Map)
middleware.ts
```

`lib/supabase.ts` 최상단에 `import 'server-only';` — 클라이언트 번들 유입을 컴파일 타임에 차단.

---

## 9. 구현 순서

1. Next.js 스캐폴딩 + 환경변수 + `lib/supabase.ts` + Vitest 설정
2. **인증 먼저**: `/login` + `middleware.ts` + `lib/auth.ts` + `lib/ratelimit.ts` (여기가 뚫리면 나머지 무의미)
3. 폴더 CRUD + `lib/tree.ts` + 트리 렌더링
4. 업로드(signed URL) + 덱 목록
5. 뷰어 (`raw` 라우트 + sandbox iframe)
6. 다운로드
7. 이동(모달) → D&D
8. 단위 테스트 (`tree.ts`, `auth.ts`)
9. Vercel 배포, 환경변수 등록

> **외부 작업(사용자 직접)**: Supabase 계정/프로젝트 생성 → SQL 실행 → `decks` 버킷(private) 생성 → 키 확보. 별도 가이드 제공. 코드 개발과 병렬 진행, 실제 실행은 키 확보 후.

---

## 10. 완료 체크리스트

- [ ] `SUPABASE_SERVICE_ROLE_KEY`가 클라이언트 번들에 없는가 (`NEXT_PUBLIC_` 금지)
- [ ] Storage 버킷이 정말 private인가
- [ ] `/api/decks/*` 전부 middleware matcher에 포함되는가
- [ ] 업로드 시 확장자 + 크기 검증, content-type 강제
- [ ] 폴더 이동 순환 참조 검사
- [ ] 덱 삭제 시 Storage 객체도 지워지는가 (고아 파일 방지)
- [ ] iframe에 `allow-same-origin`이 없는가
- [ ] 비밀번호 비교가 timing-safe인가
