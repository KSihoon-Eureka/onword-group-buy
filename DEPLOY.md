# 배포 가이드 (Phase F.4, F.5)

> Vercel + Cloudflare 외부 계정 작업. 코드 외 단계.

---

## 1. Vercel 배포 (F.4)

### 1.1 프로젝트 2개 생성 (dev + prod)

Vercel 대시보드에서:
- `onword-dashboard-dev` — `dev` 또는 별도 branch
- `onword-dashboard-prod` — `main` branch

**Root Directory:** `apps/dashboard`
**Build Command:** `cd ../.. && pnpm install && pnpm --filter=@onword/dashboard build`
**Output Directory:** `apps/dashboard/.next` (자동)
**Install Command:** `pnpm install`
**Framework Preset:** Next.js

### 1.2 환경변수

각 프로젝트 Settings > Environment Variables 에 등록 (`.env.example` 참고):

| Key | dev | prod | 용도 |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | dev Supabase URL | prod Supabase URL | DB |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | dev anon | prod anon | DB client |
| `SUPABASE_SERVICE_ROLE_KEY` | dev service | prod service | Cron + service role |
| `ANTHROPIC_API_KEY` | sandbox | 실서비스 | Claude API |
| `RESEND_API_KEY` | test mode | live | 도매업자 이메일 |
| `WHOLESALE_DEFAULT_RECIPIENT` | 본인 이메일 | 실 도매 이메일 | fallback recipient |
| `CRON_SECRET` | random 32+ 자 | random 32+ 자 (별개) | Vercel Cron 인증 |
| `NEXT_PUBLIC_APP_URL` | dev URL | prod URL | 메타데이터 |

**`CRON_SECRET` 생성 예시:**
```bash
openssl rand -hex 32
```

### 1.3 Vercel Cron 자동 등록

`apps/dashboard/vercel.json` 의 `crons` 가 deploy 시 자동 등록:
- `/api/cron/auto-no-show` — `0 15 * * *` (KST 00:00)
- `/api/cron/pipa-retention` — `0 15 * * *` (KST 00:00)

Vercel 대시보드 > Settings > Cron Jobs 에서 확인.
`CRON_SECRET` 미설정 시 cron 호출이 401 반환되므로 *반드시* 등록 후 deploy.

### 1.4 Supabase 마이그레이션

prod Supabase 에 모든 migration 순서대로 적용 (Supabase Dashboard > SQL Editor):

```
supabase/migrations/0001_init.sql
supabase/migrations/0002_multi_tenant.sql
supabase/migrations/0003_new_tables.sql
supabase/migrations/0004_supersede_assets.sql
supabase/migrations/0005_action_free_text.sql
supabase/migrations/0006_service_role_grants.sql
supabase/migrations/0007_tool_list_recent_activity.sql
```

### 1.5 첫 배포 후 검증

- [ ] `https://<prod>/login` 접속 정상
- [ ] `https://<prod>/privacy` 미인증 접근 OK
- [ ] 로그인 → 대시보드 진입
- [ ] AI 비서 메시지 보내기 → Claude 응답
- [ ] Cron 수동 호출 (`curl -H "Authorization: Bearer <CRON_SECRET>" https://<prod>/api/cron/auto-no-show`) → 200

---

## 2. Cloudflare Turnstile (F.5)

`/login` 페이지 brute-force 방어. Supabase 자체 rate limit 도 있지만 Turnstile 추가 권장 (PRD §5.2).

### 2.1 Cloudflare 계정 + 사이트 등록

1. cloudflare.com 가입 (무료)
2. Turnstile > Add Site
   - Sitename: `onword-prod`
   - Domain: `<your-prod-domain>.vercel.app`
   - Widget Mode: Managed
3. Site Key + Secret Key 발급

### 2.2 환경변수 추가

```
NEXT_PUBLIC_TURNSTILE_SITE_KEY=0x4AAAAAAA...
TURNSTILE_SECRET_KEY=0x4AAAAAAA...
```

### 2.3 코드 통합 (별도 task)

> 본 phase 에서는 환경변수 + Cloudflare 등록만. 코드 통합은 Phase G+ 또는 별도 PR.

통합 시 작업:
- `apps/dashboard/app/login/page.tsx` 에 `<Turnstile siteKey={...} />` widget
- form submit 시 token 받음
- server action 에서 token verify (Cloudflare API)
- 실패 시 로그인 차단

라이브러리: `@marsidev/react-turnstile` 또는 `next-turnstile`

---

## 3. E2E test (F.6)

Phase F.6 의 Playwright e2e 는 별도 PR. 시나리오:

- [ ] 로그인 → 대시보드 진입
- [ ] 상품 등록 (form submit)
- [ ] 공구 시작 (start_campaign action 실행)
- [ ] 공고/포스터 자산 생성 확인
- [ ] 매장 스위처 — 2매장 사이 이동
- [ ] 미인증 시 /campaigns → /login redirect

**구현 시 주의:**
- 실제 Supabase 호출 → test DB 별도 또는 fixture
- 실제 Anthropic 호출 → 비용. mock 권장 (`vi.mock` 또는 nock)
- Playwright 는 이미 `packages/agent` 에 dep 있음

---

## 4. Production 운영 체크리스트

- [ ] PIPA 동의 폼 (apps/order-web, future)
- [ ] 자동 cron 실행 확인 (다음날 Vercel Logs)
- [ ] Privacy policy 검토 (법무 검토 권장)
- [ ] Supabase 백업 활성화
- [ ] Sentry / 에러 모니터링 (별도)
- [ ] 도메인 + SSL (Vercel 자동)
