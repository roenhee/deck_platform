# Deck Manager — 구현 문서

HTML 덱을 업로드/보관/열람하는 개인용 웹 도구.

## 0. 결정 사항 요약

| 항목 | 선택 |
|---|---|
| 덱 형식 | HTML 단일 파일 (self-contained) |
| 인증 | 단일 비밀번호 + HttpOnly 서명 쿠키 |
| 파일 보안 | Storage private, 모든 접근을 서버 라우트 경유 |
| 폴더 | `parent_id` 자기참조 무한 중첩 트리 |
| 호스팅 | Vercel |
| 데이터 | Supabase Postgres + Supabase Storage |

---

## 1. 스택

- **Next.js 15 (App Router) + TypeScript**
- **Tailwind CSS**
- **Supabase**: Postgres(메타데이터), Storage(파일 본체)
- **jose**: 세션 쿠키 JWT 서명/검증 (Edge Middleware 호환)
- 상태관리: 별도 라이브러리 없이 Server Component + `router.refresh()`

### 환경 변수

```
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=     # 서버 전용. 절대 클라이언트 노출 금지
APP_PASSWORD=                  # 접속 비밀번호 (평문)
AUTH_SECRET=                   # JWT 서명용 랜덤 32바이트 이상
```

> anon key는 쓰지 않는다. 모든 DB/Storage 접근은 service role로 서버에서만.

---

## 2. 데이터 모델

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
  storage_path      text not null unique,   -- 예: decks/{uuid}.html
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

- 버킷 이름: `decks`, **Public = off**
- 정책 없음 (service role만 접근)
- 경로 규칙: `{deck_id}.html`

### 폴더 트리 처리

폴더 개수가 수백 개 이하일 것이므로 **전체를 한 번에 조회해 클라이언트에서 트리 구성**한다. 재귀 CTE 불필요.

폴더 이동 시 **순환 참조 검사**는 필수:

```sql
-- target_id 가 moving_id 의 자손인지 확인
with recursive descendants as (
  select id from folders where id = $moving_id
  union all
  select f.id from folders f join descendants d on f.parent_id = d.id
)
select exists (select 1 from descendants where id = $target_id);
-- true 면 400 반환
```

---

## 3. 인증

### 흐름

1. `/login`에서 비밀번호 POST
2. `crypto.timingSafeEqual`로 `APP_PASSWORD`와 비교 (타이밍 공격 방어)
3. 성공 시 `jose`로 JWT 발급 → `session` 쿠키에 저장
   - `httpOnly: true, secure: true, sameSite: 'lax', maxAge: 60*60*24*30`
4. 실패 시 IP 기준 간단한 시도 제한 (메모리 Map 또는 Upstash. MVP는 생략 가능)

### Middleware

`middleware.ts` — 다음을 제외한 **모든 경로**에서 쿠키 검증, 실패 시 `/login` 리다이렉트:

```ts
export const config = {
  matcher: ['/((?!login|api/auth/login|_next/static|_next/image|favicon.ico).*)'],
};
```

**중요**: `/api/decks/[id]/raw`와 `/download`도 반드시 이 보호 범위 안에 있어야 한다. 파일 URL만 알아도 못 열리게 하는 게 이번 요구사항의 핵심.

---

## 4. API 라우트

| Method | Path | 설명 |
|---|---|---|
| POST | `/api/auth/login` | 비밀번호 검증, 쿠키 발급 |
| POST | `/api/auth/logout` | 쿠키 삭제 |
| GET | `/api/folders` | 전체 폴더 목록 (플랫 배열) |
| POST | `/api/folders` | 생성 `{ name, parentId }` |
| PATCH | `/api/folders/[id]` | 이름 변경 / 이동 `{ name?, parentId? }` — 순환 검사 |
| DELETE | `/api/folders/[id]` | 삭제 (하위 폴더 cascade, 덱은 루트로 이동) |
| GET | `/api/decks?folderId=` | 해당 폴더 덱 목록 (`folderId` 없으면 루트) |
| POST | `/api/decks/upload-url` | 업로드용 signed URL 발급 |
| POST | `/api/decks` | 업로드 완료 후 메타데이터 등록 |
| PATCH | `/api/decks/[id]` | 제목 변경 / 폴더 이동 |
| DELETE | `/api/decks/[id]` | DB 행 + Storage 객체 함께 삭제 |
| GET | `/api/decks/[id]/raw` | HTML 스트리밍 (뷰어 iframe용) |
| GET | `/api/decks/[id]/download` | `Content-Disposition: attachment`로 다운로드 |

### 업로드 방식 (중요)

Vercel 서버리스 함수는 **요청 본문 4.5MB 제한**이 있다. 이미지를 base64로 인라인한 HTML 덱은 이걸 쉽게 넘긴다. 따라서 API 라우트로 파일을 통과시키지 않고 **직접 업로드** 방식을 쓴다:

1. 클라이언트 → `POST /api/decks/upload-url` (파일명, 크기 전달)
2. 서버: 쿠키 검증 → 확장자 `.html` 확인 → 크기 상한(예: 50MB) 확인 → `deck_id` 발급 → `supabase.storage.from('decks').createSignedUploadUrl(path)` 반환
3. 클라이언트 → 반환된 signed URL로 Supabase에 직접 PUT
4. 클라이언트 → `POST /api/decks`로 메타데이터 등록

> signed URL은 로그인한 사람에게만, 지정한 경로에 대해서만, 짧은 시간 발급되므로 보안 요구사항을 해치지 않는다.

### 조회 방식

`raw`/`download`는 signed **download** URL로 리다이렉트하지 말고 **서버가 직접 스트리밍**한다. 리다이렉트하면 그 URL이 브라우저 히스토리/공유로 새어나가기 때문.

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

---

## 5. 화면

### `/login`
비밀번호 입력 하나. 실패 메시지.

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
- 좌측: 폴더 트리 (접기/펼치기, 우클릭 또는 ⋯ 메뉴로 생성·이름변경·삭제)
- 우측: 현재 폴더의 덱 카드 그리드. 카드마다 열기 / 다운로드 / 이동 / 이름변경 / 삭제
- **이동**: HTML5 drag & drop으로 덱 카드 → 좌측 폴더에 드롭. 폴더끼리 드롭도 동일 처리
  - 드래그가 부담되면 "이동" 메뉴 → 폴더 선택 모달로 대체 가능 (MVP는 모달만 만들고 D&D는 나중에 얹어도 됨)

### `/deck/[id]` — 뷰어

**슬라이드 내비게이션은 전부 덱에 위임한다. 부모는 키 핸들러를 만들지 않는다.**

ppt-html 스킬의 프레젠테이션 프레임이 이미 아래를 내장하고 있기 때문:

- 키보드 `←` `→` `Space` `Home` `End`, `f`(전체화면)
- hover 시 뜨는 nav-bar: 처음 / 이전 / `3 / 24` 페이지 입력창 / 다음 / 마지막
- `resizePresentation()`이 창 크기에 맞춰 자동 스케일 (960×540 기준)

부모에 같은 걸 만들면 중복이고, 애초에 `allow-same-origin` 없는 sandbox라 부모가 덱 내부 상태를 읽지도 못한다.

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

#### 반드시 챙길 것

1. **`allow="fullscreen"` 필수.** 없으면 덱의 `f` 키가 조용히 안 먹는다. sandbox iframe은 opaque origin이라 Permissions Policy를 명시 위임해야 함
2. **포커스 관리.** 방향키는 포커스를 가진 문서로만 가고 iframe 밖으로 버블링되지 않는다. 포커스가 부모에 있으면 아무 반응이 없음
   - `onLoad`에서 `iframe.focus()`
   - 뷰어 컨테이너 클릭 시에도 `iframe.focus()`
   - 상단바 버튼에 `onMouseDown={e => e.preventDefault()}` → 클릭해도 포커스를 안 뺏김
3. **iframe은 뷰포트 전체 크기로.** 덱이 알아서 스케일하므로 부모가 스케일링하지 말 것

#### 상단바

뒤로가기 / 덱 제목 / 다운로드 / **전체화면 버튼** — 이 4개만. 이전·다음·페이지 표시는 덱에 있으므로 넣지 않는다. 마우스 정지 2초 후 자동 숨김.

전체화면 버튼은 부모가 iframe 엘리먼트에 직접 `ref.current.requestFullscreen()`을 호출한다. `/raw` 응답의 CSP `sandbox` 지시자가 브라우저에 따라 덱 내부 `f` 키를 막을 수 있어서, 이 버튼이 확실한 우회로가 된다.

#### 감수할 점

ESC로 목록 복귀는 불가능하다 (ESC도 iframe 안에 갇힘). 다만 `f`/버튼으로 전체화면에 들어간 상태에서는 ESC가 브라우저 차원에서 전체화면을 빠져나오므로 체감상 크게 아쉽지 않다. 목록으로 돌아갈 때는 상단바 뒤로가기를 쓴다.

#### 나중에 필요해지면

덱 템플릿(`slide-patterns.md`)에 `message` 리스너를 몇 줄 넣으면 부모가 덱을 제어할 수 있게 된다. 지금은 필요 없지만, 여러 덱 연속 재생이나 발표자 노트 같은 게 생기면 그때 얹는다.

---

## 6. 디렉토리 구조

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
  auth.ts                       # JWT 발급/검증
  tree.ts                       # 플랫 배열 → 트리, 순환 검사
middleware.ts
```

`lib/supabase.ts` 최상단에 `import 'server-only';` 를 넣어 클라이언트 번들 유입을 컴파일 타임에 차단할 것.

---

## 7. 구현 순서

1. Supabase 프로젝트 생성 → 위 SQL 실행 → `decks` 버킷(private) 생성
2. Next.js 스캐폴딩 + 환경변수 + `lib/supabase.ts`
3. **인증 먼저**: `/login` + `middleware.ts` + `lib/auth.ts`. 여기가 뚫리면 나머지가 무의미
4. 폴더 CRUD + 트리 렌더링
5. 업로드(signed URL) + 덱 목록
6. 뷰어 (`raw` 라우트 + sandbox iframe)
7. 다운로드
8. 이동(모달) → 여유 되면 드래그 앤 드롭
9. Vercel 배포, 환경변수 등록

---

## 8. 체크리스트

- [ ] `SUPABASE_SERVICE_ROLE_KEY`가 클라이언트 번들에 없는가 (`NEXT_PUBLIC_` 접두어 금지)
- [ ] Storage 버킷이 정말 private인가
- [ ] `/api/decks/*` 전부 middleware matcher에 포함되는가
- [ ] 업로드 시 확장자·MIME·크기 검증
- [ ] 폴더 이동 순환 참조 검사
- [ ] 덱 삭제 시 Storage 객체도 지워지는가 (고아 파일 방지)
- [ ] iframe에 `allow-same-origin`이 없는가
- [ ] 비밀번호 비교가 timing-safe인가
