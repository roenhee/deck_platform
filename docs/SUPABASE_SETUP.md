# Supabase 셋업 가이드 (사용자 직접 수행)

이 앱은 Supabase Postgres(메타데이터) + Storage(파일 본체)를 쓰고, 모든 접근을 서버에서 **service role 키**로만 한다. 아래를 마치면 4개 값이 나오고, 그걸 `.env.local`에 넣으면 로컬 실행 준비 끝.

> 계정 로그인·프로젝트 생성은 보안상 사용자가 직접 해야 한다. **service role 키는 채팅에 붙여넣지 말 것** — 로컬 `.env.local`에만 직접 입력한다.

---

## 1) 프로젝트 생성

1. https://supabase.com 로그인 → **New project**
2. 이름/리전/DB 비밀번호 설정 후 생성 (프로비저닝 1~2분)

## 2) 스키마 SQL 실행

좌측 **SQL Editor** → 새 쿼리 → 아래 전체 붙여넣고 **Run**:

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

## 3) Storage 버킷 생성 (private)

**Storage → New bucket**:

- **Name**: `decks` (정확히 이 이름)
- **Public bucket**: **끄기 (off)** ← 필수
- **Additional configuration**(있으면):
  - **File size limit**: `50MB` (또는 `52428800` bytes)
  - **Allowed MIME types**: `text/html`

> 버킷 정책(RLS policy)은 **추가하지 않는다**. 정책이 없으면 service role만 접근 가능 = 우리가 원하는 상태.
> 앱 서버도 확장자·크기를 검사하지만, 실제 강제는 이 버킷 설정이 담당한다(직접 업로드 방식이라 본문이 서버를 안 거침).

## 4) 키 확보

**Project Settings → API**:

- **Project URL** → `NEXT_PUBLIC_SUPABASE_URL` (공개돼도 무방)
- **Project API keys → `service_role` (secret)** → `SUPABASE_SERVICE_ROLE_KEY`
  - ⚠️ 이 키는 RLS를 무시하는 **관리자 키**. 절대 클라이언트/깃/채팅에 노출 금지. `.env.local`(gitignore됨)에만.

> Supabase 최신 UI는 키를 "Publishable / Secret"으로 부르기도 한다. 그 경우 **Secret key**가 service role에 해당한다. `anon`/`publishable` 키는 이 앱에서 쓰지 않는다.

## 5) AUTH_SECRET 생성 (로컬 터미널)

```bash
openssl rand -base64 32
```

출력값을 `AUTH_SECRET`으로 쓴다.

---

## 6) `.env.local` 작성 (프로젝트 루트)

프로젝트 루트에 `.env.local` 파일을 만들고 위 값들을 채운다:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...(service role secret)
APP_PASSWORD=원하는_접속_비밀번호
AUTH_SECRET=openssl로_생성한_값
```

- `APP_PASSWORD`: 앱 로그인에 쓸 비밀번호(직접 정함).
- `.env.local`은 `.gitignore`에 포함돼 커밋되지 않는다.

---

## 완료 후

`.env.local`을 만든 뒤 알려주면, 로컬에서 `npm run dev`로 띄워 **Task 15(라이브 검증)**을 진행한다:
- 로그인 → 폴더/업로드/뷰어/다운로드/이동/삭제 E2E
- 업로드 왕복(직접 PUT) 실제 확인
- 미인증 상태에서 `/api/decks/<id>/raw` 직접 접근 차단 확인

이후 GitHub 푸시 → Vercel 배포(환경변수 4개 등록) 단계로 넘어간다.
