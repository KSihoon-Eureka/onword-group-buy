# Onword Group Buy — Product Requirements Document (PRD)

> **단일 진실 공급원 (Single Source of Truth).** 모든 Claude Code 세션이 이 한 파일만으로 작업할 수 있도록 설계됨. 이 PRD에 없는 정보가 필요하면 코파운더(Sihoon)에게 즉시 확인. 추측 금지.
>
> 마지막 갱신: 2026-05-13 (sprint 2)
> 작성자: Sihoon Kim + Claude (Opus 4.7)
>
> **변경 시 규칙:** 이 PRD를 수정하면 향후 task에 영향이 있을 수 있다. CLAUDE.md §15 (Cascading Change Warning)에 따라 변경 전 영향 분석 + 코파운더 승인.

---

## §0. 빠른 참조 (Quick Reference)

### 0.1 프로젝트 한 줄 정의
> 한국 오프라인 매장 사장님이 발주 정보 1회 입력 → AI 에이전트가 11단계 공동구매 워크플로우를 자동 실행 → 매장 카카오톡으로 복사 / 도매업자 이메일 / 포스터 이미지 자동 생성. **사장님 1명이 여러 매장 운영 가능.**

### 0.2 핵심 결정 사항 (locked, 변경 시 cascading change 경고 필수)

| ID | 결정 |
|---|---|
| **A1** | 인증: Supabase Auth + email/password + 수동 가입 |
| **A2** | 멀티 매장: `store_members` 조인, 매장 스위처 UI |
| **A3** | 에러 정책: chain 실패 시 **중단** (계속 시도 안 함) |
| **A4** | 데이터: 영구 보관. PIPA phone만 1년/30일 자동 삭제 |
| **A5** | PIPA: 완전 준수, phone 끝 4자리만, 동의 시각 기록 |
| **A6** | 성능: 사전 timeout 없음. 측정 후 결정 |
| **A7** | 로깅: Vercel + Supabase `agent_traces.error_message` |
| **A8** | 환경: dev + prod 2개 (Vercel + Supabase 각 2개) |
| **A9** | 시니어 UI: 고객용(`apps/order-web`)만, dashboard는 일반 |
| **A10** | Idempotency: 확인 후 교체 (`superseded_at` 마킹) |
| **A11** | 브랜드 설정: DB(`stores`)에 보관. env 아님 |
| **A12** | 포맷: `8,900원` (콤마), `MM월 DD일(요일)` |
| **A13** | 5-slot 메뉴 + 7-feature action surface (hybrid) |
| **A14** | `apps/order-web` dormant (이번 sprint 미개발) |
| **A15** | 자동 no_show: 매일 cron 처리 (Step 10) |
| **A16** | 한국어 우선, 영문은 기술 식별자만 |

### 0.3 빠른 인덱스

| 찾는 정보 | 섹션 |
|---|---|
| 클라이언트 요구사항 | §1 |
| 데이터베이스 스키마 | §4 |
| 로그인 + 멀티매장 + RLS | §5 |
| Korean PIPA 규칙 | §6 |
| 11단계 워크플로우 | §7 |
| 카카오톡 텍스트 템플릿 | §8 |
| UI 디자인 / 메뉴 구조 | §9 |
| Agent Tool 명세 (10개) | §10 |
| 네이버 크롤링 (이미지/가격) | §11 |
| 포스터 합성 | §12 |
| 수령일 비교 테이블 | §13 |
| AI 비서 saved flows | §14 |
| 환경 변수 전체 목록 | §16 |
| 모든 [높음] 위험 한곳에 | §17 |
| 한글-영문 용어 매핑 | §18 |

---

# §1. 비전 & 클라이언트 요구사항

## 1.1 클라이언트 프로필

- **업종:** 한국 오프라인 매장 (유통 / 리테일, 식품 / 생활용품 등)
- **사장님 (dashboard 사용자):** 일반 디지털 친화도. 한 명이 여러 매장 운영.
- **고객 (order web 사용자, 미래):** 시니어층 (디지털 친화도 낮음). 카톡 오픈채팅 → 링크 클릭 → 모바일 주문.
- **현재 운영:** 카톡 오픈채팅 + 엑셀 + 수기. 다 수동.

## 1.2 핵심 가치 제안

> "사장님이 발주 정보 1번만 입력 → AI가 모든 워크플로우 자동 실행."
> "대화로 사장님이 업무 상황 / 일정 / 할 일을 보고받음."

human input 최소화: 유일한 수동 입력 = 상품 발주 정보(§7.1). 그 외 자동.

## 1.3 우선순위 (Must / Should / Won't)

### Must (이번 sprint 안에)
- 사장님 로그인 (email + password)
- 멀티 매장 + 매장 스위처
- 상품 등록 → DB
- 이미지 자동 크롤 (네이버, multi-image)
- AI 공고① (Stage 1) 생성 + 복사
- 네이버 가격 크롤 + 스크린샷
- 가격 강조 짧은 카톡 텍스트
- 포스터 합성 (Sharp, 800×950 PNG)
- 수령일 비교 테이블 (이미지)
- 도매업자 이메일 자동 (phone 제외, PIPA)
- 수령 안내 공고 (Stage 3)
- 자동 no_show 처리 (cron, Step 10)
- AI 비서 (자연어 명령)
- Saved flows (저장된 명령)
- 자산 갤러리
- PIPA 준수 (phone 끝 4자리, 동의, 보유, 접근 로그)

### Should
- 마감 임박 공고 (Stage 2, P1)
- Audit log per product
- Notification center
- Today summary card

### Won't (이번 sprint 제외 — 다음 sprint로 이월)
- `apps/order-web` 고객 주문 폼 (대시보드 우선)
- `apps/lookup-web` 카운터용 조회
- 카카오 API 자동 전송 (영구 Won't, 텍스트 복사로 대체)
- 결제 시스템
- 사장님 셀프 가입 + 이메일 verification
- 2FA
- Magic-link 비밀번호 재설정
- 직원 초대 (한 매장 다중 user)
- 다국어
- 모바일 앱
- Stage 4+ 카톡 (배송 지연, 환불 등)

## 1.4 변경 관리

이 PRD 변경 시:
1. 변경 사유를 commit 메시지에 명시
2. CLAUDE.md §15에 따라 cascading change 분석
3. 영향받는 작업이 진행 중이면 즉시 중단 → 재plan
4. PLAN.md 우선순위 재검토

**클라이언트가 도중 변경 요청 시:** Won't 항목은 *이번 sprint 거부*. Should/Must 변경은 *영향도 분석 후 응답*.

---

# §2. 결정 사항 로그 (모든 X / Q 결정)

> §0.2 한 줄 요약. 이 섹션은 *왜* 그렇게 결정했는지 상세.

## 2.1 인증 (A1)

**결정:** Supabase Auth + email/password + 수동 가입
**대안:** NextAuth (탈락, 외부 의존 추가), magic link (탈락, 사장님 매일 로그인 시 friction)
**이유:** Supabase 스택에 내장, RLS 통합, 무료 티어 충분, 사장님 매일 사용 적합

## 2.2 멀티 매장 (A2)

**결정:** 사장님 1명이 여러 매장 운영. `stores` + `store_members` 조인 테이블.
**대안:** 단일 매장 + 별 도메인 (탈락, 사장님 입장에서 매장 전환 불편)
**이유:** 클라이언트 명시적 요구. 미래 직원 초대 패턴 호환.

## 2.3 Chain 에러 정책 (A3)

**결정:** `start_campaign` 등의 chained action에서 한 tool 실패하면 전체 중단. partial 결과는 저장하되 다음 tool 진행 안 함.
**대안:** continue siblings — 다음 tool 시도 (탈락, 결과 불완전, 사장님 혼란)
**이유:** "포스터에 가격비교 빈칸"보다 "실패 명확 + 재시도" 가 UX 명료.

## 2.4 데이터 보유 (A4)

**결정:** 영구 보관. 예외: PIPA `orders.customer_phone` (픽업 완료 1년 / 취소 30일 후 NULL).
**대안:** 90일 후 archive (탈락, 사장님이 과거 데이터 참조 필요)
**이유:** Supabase 무료 500MB 충분 (예상 사용량 < 100MB/년/매장). 초과 시 paid upgrade.

## 2.5 PIPA 준수 (A5)

**결정:** 완전 준수. 상세 §6.
**근거:** 한국 개인정보보호법. 위반 시 형사처벌 + 과징금 + 사업 정지. 사장님 책임 → 시스템이 강제.

## 2.6 성능 (A6)

**결정:** 사전 timeout 없음. tool 실행 시간을 `trace_steps.duration_ms`로 측정. p95 데이터 쌓이면 결정.
**왜 sprint에서 결정 안 하나:** 실제 네이버 응답시간 / Sharp 렌더링 시간 변동 큼. premature decision은 false positive 가능성.

## 2.7 로깅 (A7)

**결정:** Vercel runtime logs + Supabase `agent_traces.error_message`. Sentry 다음 sprint.
**이유:** Sentry 셋업 시간 절약. Supabase로 도메인 에러는 충분히 추적.

## 2.8 환경 (A8)

**결정:** 2개. `dev.dashboard.onword.kr` + `dashboard.onword.kr`. 각 다른 Supabase 프로젝트 + 다른 API keys.
**대안:** 1개 (탈락, 테스트 중 프로덕션 영향 위험). 3개 staging 포함 (탈락, sprint 오버킬).
**비용:** Vercel preview는 무료. Supabase 추가 프로젝트는 무료 티어 가능.

## 2.9 시니어 친화 UI (A9)

**결정:** `apps/order-web` (고객용)만. `apps/dashboard` (사장님용)는 일반 데이터 밀도.
**이유:** 사장님은 디지털 친화도 일반. 고객은 시니어 다수. 두 앱 별도 UI 시스템.
**구체:** order-web — min 16px body, 44×44 tap target, WCAG AA contrast. dashboard — text-[12px] 메타 가능.

## 2.10 Idempotency (A10)

**결정:** 사장님이 같은 action 재실행 시 → 확인 dialog → 승인하면 새 버전 생성 + 이전을 `superseded_at` 마킹 (hard delete X).
**대안:** A duplicate (탈락, 자산 갤러리 오염). B silent replace (탈락, 사장님 의도 명확하지 않음).
**이유:** 사고 방지 + audit / undo 보존.

## 2.11 브랜드 설정 (A11)

**결정:** `stores` 테이블 컬럼. 매장별 다름 (판다팜 🐼, 토끼마트 🐰 등).
**대안:** env 변수 (탈락, A2 멀티매장에서 동작 안 함).
**컬럼:** `leading_emoji`, `brand_name`, `short_name`, `primary_color`, `accent_color`.

## 2.12 포맷 (A12)

**결정:** 금액 `8,900원` (콤마 + 원). 날짜 `MM월 DD일(요일)`.
**시간:** `오전/오후 H시` 또는 `H시 M분` 한국식.

## 2.13 메뉴 구조 (A13)

**결정:** Hybrid.
- **5-slot 상위 사이드바**: AI 비서 / 공구 현황 / 주문 관리 / 자산 / 상품 등록
- **상품 상세 화면 안**: 7-feature action surface (공고 / 이미지 크롤 / 가격 / 포스터 / 수령표 / 도매전송 / 수령안내)
- **하단 추가**: 알림 (Notification center), 감사 로그 (선택)

**이유:** 5-slot은 데이터 중심 navigation, 7-feature는 상품별 자동화 실행. 둘 다 가치 있음 → hybrid.

## 2.14 Order-web Dormant (A14)

**결정:** `apps/order-web` 스켈레톤만 유지. 이번 sprint 안 만듦. 다음 sprint.
**이유:** 코파운더 결정 — dashboard 완성도 우선. order-web은 별도 sprint.
**Side effect:** `orders` 테이블에 실제 row 없음. 주문 관리 view는 empty state placeholder.

## 2.15 자동 no_show (A15)

**결정:** 매일 00:00 cron. `pickup_deadline < today` AND status in (pending, confirmed) → no_show 마킹.
**구현:** Supabase pg_cron 또는 Vercel Cron. F.1에서 결정.
**Idempotent:** 이미 no_show면 skip. 안전.

## 2.16 한국어 우선 (A16)

**결정:** UI 라벨 한국어 default. 영문 예외:
- 기술 식별자 (Status, Tool Call, Result)
- 코드 내부 (state, function, variable, type name)

---

# §3. 아키텍처 & 기술 스택

## 3.1 시스템 다이어그램

```
┌─ Customers (Future) ──┐    ┌─ 사장님 (Now) ──────┐
│ apps/order-web        │    │ apps/dashboard      │
│ (mobile, senior UX)   │    │ (desktop primary)   │
│ [DORMANT 이번 sprint] │    │                     │
└────────┬──────────────┘    └─────────┬───────────┘
         │                              │
         │ (POST orders)                │ (Login + workflow)
         ▼                              ▼
┌─ Supabase ────────────────────────────────────┐
│ - PostgreSQL (multi-tenant RLS)              │
│ - Auth (email + password)                    │
│ - Storage (assets bucket)                    │
│ - Realtime (orders, trace_steps)             │
└──────────────────────────────────────────────┘
         ▲                              ▲
         │ (write via service_role)     │ (orchestrate)
         │                              ▼
┌─ Vercel Cron ───────────┐  ┌─ Anthropic API ───┐
│ - auto_no_show (daily)  │  │ Claude 4.6/4.7    │
│ - pipa_retention (daily)│  │ Tool use loop     │
└─────────────────────────┘  └─────────┬─────────┘
                                       │
                       ┌───────────────┼───────────────┐
                       ▼               ▼               ▼
              ┌─ Playwright ──┐ ┌─ Sharp ──┐  ┌─ Resend ──┐
              │ Naver crawl   │ │ Poster   │  │ 도매업자  │
              │ (images+price)│ │ + pickup │  │ 이메일    │
              └───────────────┘ │ table PNG │  └───────────┘
                                └──────────┘
```

## 3.2 기술 스택

| 영역 | 기술 | 버전 | 비고 |
|---|---|---|---|
| 프런트엔드 | Next.js | 14 (App Router) | RSC + Server Actions |
| 언어 | TypeScript | 5.x | strict mode |
| 스타일 | Tailwind CSS | 3.x | + clsx + tailwind-merge |
| UI | lucide-react, framer-motion | latest | Sidebar/BottomNav/AgentStep |
| 백엔드 (대부분) | Next.js API routes | — | Edge or Node runtime |
| DB | Supabase (PostgreSQL 15) | — | RLS, Realtime, Storage |
| Auth | Supabase Auth | — | email+pw, cookie session |
| AI | Anthropic Claude | 4.6/4.7 | tool use loop |
| 크롤링 | Playwright | latest | chromium headless |
| 이미지 | Sharp | latest | + Pretendard 폰트 |
| 이메일 | Resend | — | 도매업자만 |
| 모노레포 | Turborepo + pnpm | latest | workspaces |
| 배포 | Vercel | — | dev + prod |

## 3.3 디렉토리 구조

```
onword-group-buy/
├── apps/
│   ├── dashboard/        ← 사장님 대시보드 (메인)
│   ├── order-web/        ← 고객 주문 (DORMANT, skeleton만)
│   └── lookup-web/       ← 카운터 주문 조회 (DORMANT)
├── packages/
│   ├── agent/            ← Orchestrator + 10 tools
│   │   ├── orchestrator.ts
│   │   ├── tools/
│   │   │   ├── generate-announcement.ts
│   │   │   ├── generate-price-emphasis-text.ts
│   │   │   ├── crawl-naver-images.ts
│   │   │   ├── crawl-naver-price.ts
│   │   │   ├── compose-poster.ts
│   │   │   ├── generate-pickup-table.ts
│   │   │   ├── get-orders.ts
│   │   │   ├── notify-wholesaler.ts
│   │   │   └── __tests__/
│   │   ├── cron/
│   │   │   ├── auto-no-show.ts
│   │   │   └── pipa-retention.ts
│   │   └── __fixtures__/  ← 슈미트 베개커버 등
│   ├── db/               ← Supabase 클라이언트 + 타입
│   ├── types/            ← 공통 TS 타입 (도메인 entity + tool I/O)
│   └── ui/               ← 재사용 UI (Sidebar, BottomNav, AgentStepBlock, StoreSwitcher, SavedFlows, ProductCard, OrderRow)
├── supabase/
│   └── migrations/
│       ├── 0001_init.sql
│       ├── 0002_multi_tenant.sql
│       ├── 0003_new_tables.sql
│       └── 0004_constraints.sql
├── PRD.md                ← 이 파일 (single source of truth)
├── CLAUDE.md             ← 운영 규칙 (auto-load)
├── PLAN.md               ← Phase 진행 추적
├── ONBOARDING.md         ← 새 세션 진입 가이드
├── methodology.md        ← 깊은 코드 방법론 (on-demand)
├── AI_DOCS/
│   ├── task-execution.md ← 프롬프트 템플릿 + cascading 규칙
│   └── sihoon-guide.md   ← Sihoon용 Git/터미널/세션 가이드
├── README.md
├── package.json (workspace root)
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
└── .env.example
```

## 3.4 환경 (Dev / Prod)

| 항목 | Dev | Prod |
|---|---|---|
| URL | `dev.dashboard.onword.kr` | `dashboard.onword.kr` |
| Supabase 프로젝트 | `onword-dev` | `onword-prod` |
| Anthropic API key | dev key (낮은 quota) | prod key |
| Resend mode | test (no real email) | live |
| 환경변수 source | Vercel dev branch | Vercel main branch |
| DB seed | mock 사장님 + 1 매장 + 1 상품 | 실서비스 사장님 |

---

# §4. 데이터 모델

> 모든 Agent tool, API route, UI 컴포넌트는 이 스키마 기준. 변경 시 cascading change (CLAUDE.md §15).

## 4.1 테이블 일람

```
auth.users               ← Supabase Auth (관리됨)
stores                   ← 매장
store_members            ← (store_id, user_id) 멤버십 n:m
products                 ← 상품
orders                   ← 고객 주문 (DORMANT)
agent_traces             ← AI 실행 세션
trace_steps              ← 각 tool 호출 단계
generated_assets         ← AI 생성 자산 (텍스트/이미지)
saved_flows              ← AI 비서 저장 플로우
audit_log                ← 도메인 객체 변경 이력
phone_access_log         ← PIPA 접근 기록
```

## 4.2 stores

```sql
create table stores (
  id uuid primary key default gen_random_uuid(),
  
  -- 기본
  name text not null,                          -- "판다팜"
  brand_name text,                             -- "산타"
  short_name text,                             -- "산타가족"
  
  -- 브랜드 (A11)
  leading_emoji text default '🎁',             -- "🐼"
  primary_color text default '#5B2E91',        -- 포스터 배너
  accent_color text default '#E53E3E',         -- 포스터 가격
  
  -- 도매 이메일
  wholesale_email text,
  wholesale_from_email text default 'noreply@onword.kr',
  
  -- 메타
  owner_id uuid references auth.users(id) not null,
  
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_stores_owner on stores(owner_id);
```

## 4.3 store_members

```sql
create table store_members (
  store_id uuid references stores(id) not null,
  user_id uuid references auth.users(id) not null,
  role text not null check (role in ('owner', 'staff')),
  joined_at timestamptz default now(),
  primary key (store_id, user_id)
);

create index idx_store_members_user on store_members(user_id);
```

`role = 'owner'` 추가 시 trigger로 default saved_flows 4개 자동 insert (§14).

## 4.4 products

```sql
create table products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references stores(id) not null,
  
  -- 기본
  name text not null,
  description text,
  category text,
  
  -- 가격
  price integer not null,
  compare_price integer,
  
  -- 수량
  stock_quantity integer not null,
  ordered_quantity integer default 0,
  
  -- 일정
  expiry_date date,
  order_deadline timestamptz,
  pickup_date date,
  pickup_deadline date,
  
  -- 이미지
  source_image_urls text[],
  primary_image_url text,                      -- 포스터 메인
  
  -- 상태
  flow_stage text default 'product_registered',
  -- product_registered → announcement_1 → order_open → order_closed 
  -- → stock_confirmed → warehouse_notified → arrived → pickup_ready → completed
  
  status text default 'active',
  -- active | closed | cancelled
  
  -- 메타
  urgency_banner text,
  archived_at timestamptz,                     -- soft delete (hard delete 금지)
  
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_products_store on products(store_id);
create index idx_products_flow_stage on products(store_id, flow_stage);
create index idx_products_pickup_date on products(store_id, pickup_date);
```

## 4.5 orders (DORMANT)

```sql
create table orders (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references stores(id) not null,    -- trigger로 자동 복제
  product_id uuid references products(id) not null,
  
  -- 고객 정보 (PIPA — §6)
  customer_name text not null,
  customer_phone text check (length(customer_phone) = 4),  -- 끝 4자리만
  phone_consent_at timestamptz not null,
  
  -- 주문
  quantity integer not null check (quantity > 0),
  total_price integer not null,
  
  -- 상태
  status text default 'pending',
  -- pending | confirmed | picked_up | cancelled | no_show
  
  -- 메타
  anomaly_detected boolean default false,
  anomaly_reason text,
  notes text,
  
  picked_up_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_orders_store on orders(store_id);
create index idx_orders_product on orders(product_id);
create index idx_orders_status on orders(store_id, status);
```

### store_id 자동 복제 trigger
```sql
create function copy_store_id_to_order() returns trigger as $$
begin
  new.store_id := (select store_id from products where id = new.product_id);
  return new;
end;
$$ language plpgsql security definer;

create trigger orders_set_store_id 
  before insert on orders 
  for each row execute function copy_store_id_to_order();
```

## 4.6 agent_traces

```sql
create table agent_traces (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references stores(id) not null,
  product_id uuid references products(id),
  user_id uuid references auth.users(id),       -- 누가 실행
  
  action text not null,
  -- start_campaign | close_orders | notify_warehouse | announce_pickup | urgent_alert | free_text
  -- free_text = ChatView 자유 텍스트 메시지 (Claude dynamic tool_use loop, Phase D에서 활성)
  
  status text default 'running',
  -- running | completed | failed | cancelled (A3: failed 시 chain 중단)
  
  summary text,
  error_message text,
  
  started_at timestamptz default now(),
  completed_at timestamptz
);

create index idx_traces_store on agent_traces(store_id, started_at desc);
create index idx_traces_product on agent_traces(product_id);
create index idx_traces_status on agent_traces(status);
```

## 4.7 trace_steps

```sql
create table trace_steps (
  id uuid primary key default gen_random_uuid(),
  trace_id uuid references agent_traces(id) not null,
  
  step_order integer not null,
  
  tool_name text not null,
  status text default 'pending',
  -- pending | running | done | error
  
  input jsonb,
  output jsonb,
  
  summary text,
  
  started_at timestamptz default now(),
  completed_at timestamptz,
  duration_ms integer
);

create index idx_steps_trace on trace_steps(trace_id, step_order);
```

RLS: trace_id → agent_traces.store_id 경유.

## 4.8 generated_assets

```sql
create table generated_assets (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references stores(id) not null,
  product_id uuid references products(id),
  trace_step_id uuid references trace_steps(id),
  
  type text not null,
  -- announcement_stage1 | announcement_stage2 | announcement_stage3
  -- | price_emphasis_text | price_compare_image | price_compare_data
  -- | product_image | poster | pickup_table_image | pickup_table_text 
  -- | wholesale_email
  
  stage text,
  
  -- 콘텐츠
  content text,                                 -- 텍스트 자산
  asset_url text,                               -- 이미지 / 파일
  metadata jsonb,
  
  -- 사용 상태
  copied_at timestamptz,
  used_at timestamptz,
  
  -- Idempotency (A10)
  superseded_at timestamptz,
  superseded_by uuid references generated_assets(id),
  
  created_at timestamptz default now()
);

create index idx_assets_store on generated_assets(store_id, created_at desc);
create index idx_assets_product on generated_assets(product_id);
create index idx_assets_type on generated_assets(type);
create index idx_assets_active on generated_assets(store_id, type) where superseded_at is null;
```

## 4.9 saved_flows

```sql
create table saved_flows (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references stores(id) not null,
  user_id uuid references auth.users(id) not null,
  
  name text not null check (length(name) <= 40),
  prompt text not null,
  icon text,                                   -- lucide icon name
  display_order integer default 0,
  
  run_count integer default 0,
  last_run_at timestamptz,
  
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_saved_flows on saved_flows(store_id, user_id, display_order);
```

Default flows 4개 자동 생성 trigger (§14).

## 4.10 audit_log

```sql
create table audit_log (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references stores(id) not null,
  user_id uuid references auth.users(id),       -- null = system
  
  entity_type text not null,
  -- product | order | asset | flow | store
  entity_id uuid not null,
  
  action text not null,
  -- create | update | archive | restore | flow_stage_change | asset_supersede | auto_no_show
  
  changes jsonb,                                -- { before, after } or { field: new_value }
  
  created_at timestamptz default now()
);

create index idx_audit_store_entity on audit_log(store_id, entity_type, entity_id, created_at desc);
create index idx_audit_store_time on audit_log(store_id, created_at desc);
```

## 4.11 phone_access_log (PIPA — §6.4)

```sql
create table phone_access_log (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references stores(id) not null,
  user_id uuid references auth.users(id),       -- null = system
  order_id uuid references orders(id),
  
  action text not null,
  -- view | edit | export | delete
  reason text,
  
  ip_address inet,
  user_agent text,
  
  created_at timestamptz default now()
);

create index idx_pal_store on phone_access_log(store_id, created_at desc);
create index idx_pal_order on phone_access_log(order_id);
```

## 4.12 마이그레이션 순서

```
0001_init.sql            ← 기존 5 tables (products, orders, traces, steps, assets)
0002_multi_tenant.sql    ← stores + store_members + store_id FK + RLS 활성화
0003_new_tables.sql      ← saved_flows + audit_log + phone_access_log + triggers
0004_constraints.sql     ← phone constraint + supersede 컬럼 + primary_image_url
```

각 migration은 idempotent. 재실행 안전.

## 4.13 RLS 정책 표준 패턴

모든 도메인 테이블에 RLS 활성화 + 4개 정책 (SELECT/INSERT/UPDATE/DELETE).

```sql
-- 예: products
alter table products enable row level security;

create policy "members can read"
on products for select to authenticated
using (
  exists (
    select 1 from store_members 
    where store_members.store_id = products.store_id 
      and store_members.user_id = auth.uid()
  )
);

create policy "members can insert"
on products for insert to authenticated
with check (
  exists (
    select 1 from store_members 
    where store_members.store_id = products.store_id 
      and store_members.user_id = auth.uid()
  )
);

create policy "members can update"
on products for update to authenticated
using (...) with check (...);

-- DELETE는 비활성 (archive만 허용)
create policy "no direct delete"
on products for delete to authenticated
using (false);
```

`trace_steps`는 부모 trace 경유:
```sql
create policy "members can read steps"
on trace_steps for select to authenticated
using (
  exists (
    select 1 from agent_traces 
    join store_members on store_members.store_id = agent_traces.store_id
    where agent_traces.id = trace_steps.trace_id
      and store_members.user_id = auth.uid()
  )
);
```

## 4.14 데이터 보유 정책

| 테이블 | 보존 | 예외 |
|---|---|---|
| stores | 영구 | 사장님 탈퇴 시 archive |
| products | 영구 | archive만 |
| orders | 영구 | phone만 PIPA (§6.5) |
| agent_traces | 영구 | 디스크 압박 시 90일 후 압축 검토 |
| trace_steps | 영구 | 동일 |
| generated_assets | 영구 | superseded는 검색 제외 |
| saved_flows | 사용자 삭제까지 | hard delete |
| audit_log | 영구 | 법적 의무 |
| phone_access_log | 3년 | PIPA 권장 |

## 4.15 TypeScript 타입 매핑

`packages/types/index.ts`에 모든 entity + tool I/O 1:1 대응.

```typescript
export interface Store { ... }
export interface StoreMember { ... }
export interface Product { ... }
export interface Order { ... }
export interface AgentTrace { ... }
export interface TraceStep { ... }
export interface GeneratedAsset { ... }
export interface SavedFlow { ... }
export interface AuditLogEntry { ... }
export interface PhoneAccessLogEntry { ... }

export type FlowStage = 'product_registered' | 'announcement_1' | ...
export type AssetType = 'announcement_stage1' | 'announcement_stage2' | ...
export type ToolName = 'generate_announcement' | 'crawl_naver_images' | ...
export type ActionName = 'start_campaign' | 'close_orders' | ...
```

전체는 `packages/types/index.ts` 파일 참조.

## 4.16 Realtime 채널

```typescript
// Trace 진행 상황
supabase.channel(`trace:${traceId}`)
  .on('postgres_changes', { event: '*', schema: 'public', table: 'trace_steps', filter: `trace_id=eq.${traceId}` }, ...)
  .subscribe()

// 새 주문 (Future, dormant)
supabase.channel(`orders:${storeId}`)
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders', filter: `store_id=eq.${storeId}` }, ...)
  .subscribe()

// Notification feed
supabase.channel(`audit:${storeId}`)
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'audit_log', filter: `store_id=eq.${storeId}` }, ...)
  .subscribe()
```

---

# §5. 인증 & 멀티 매장

## 5.1 인증 결정 (locked)

| 항목 | 값 |
|---|---|
| Provider | Supabase Auth |
| Method | Email + password |
| 가입 | **수동** — Sihoon이 Supabase Dashboard에서 직접 |
| 비밀번호 정책 | 최소 8자 |
| Email verification | 비활성 (수동 생성) |
| 세션 | 쿠키, 30일, httpOnly + secure |
| 비밀번호 재설정 | Sprint 수동, post-sprint magic link |
| RLS | 모든 도메인 테이블, 4 action 정책 |

## 5.2 로그인 흐름

```
1. /login → email + password
2. Supabase Auth 인증
3. /(dashboard) 리다이렉트
4. 미들웨어가 store_members 조회:
   - 0 stores → "매장이 없습니다" 안내
   - 1 store → 자동 진입 + cookie active_store_id
   - 2+ stores → /select-store 화면
5. URL 구조: 쿠키 기반 (URL에 storeId 노출 안 함)
```

## 5.3 매장 스위처

위치: 좌측 사이드바 최상단.

```
┌────────────────────────┐
│ 🐼 판다팜          ▼  │  ← 클릭 시 dropdown
└────────────────────────┘
   ├ 🐼 판다팜 (현재)
   ├ 🐰 토끼마트
   └ ─────────────────
   └ + 매장 추가 (owner만, 추후)
```

스위치 동작:
1. 쿠키 `active_store_id` 변경
2. 페이지 reload (또는 React Query invalidate)
3. AI 비서 chat history는 (store_id, user_id) 별로 분리

매장 1개: dropdown 비활성, 라벨만.

## 5.4 사용자 생성 절차 (수동)

1. **Supabase Dashboard** → Authentication → Users → "Add user" → email + initial password
2. **SQL Editor**:
   ```sql
   insert into stores (name, brand_name, short_name, leading_emoji, primary_color, wholesale_email)
   values ('판다팜', '산타', '산타가족', '🐼', '#5B2E91', 'wholesaler@example.com')
   returning id;
   
   insert into store_members (store_id, user_id, role)
   values ('<store_id>', '<user_id>', 'owner');
   ```
3. **사장님에게 로그인 정보 전달** — 안전한 채널 (KakaoTalk 1:1). 평문 이메일 금지.

Post-sprint: 셀프 가입 UI 추가.

## 5.5 Service Role 사용 규칙

`SUPABASE_SERVICE_ROLE_KEY`는 RLS 우회. 서버 전용.

### 허용
- order-web 서버 라우트 (고객 익명 insert)
- cron job (auto_no_show, pipa_retention)
- Agent orchestrator API route

모든 service role query에 **store_id 명시적 필터 코드 작성** 필수. RLS가 보호 안 함.

### 금지
- 클라이언트 (브라우저) JavaScript
- `NEXT_PUBLIC_*` 접두사 (Next.js가 브라우저 노출)
- console.log
- 에러 메시지

### 노출 시 대응
1. Supabase Dashboard → Settings → API → Reset service_role JWT
2. Vercel env 업데이트
3. 새 키 재배포
4. audit 검토

## 5.6 위험 경고

[높음] **RLS 누락은 가장 흔한 보안 사고.**
- 새 테이블 추가 시 `enable row level security` 잊지 말 것
- 4개 action 정책 각각 작성
- 통합 테스트: 다른 store의 user로 cross-store 접근 차단 검증 (Phase A.9)

[높음] **Service Role Key 노출**
- `.env.local`이 `.gitignore`에 있는지 매 push 전 확인
- Vercel "Sensitive" 마킹
- lint rule 추가 가능 (client 컴포넌트에서 import 금지)

[중간] **Brute-force 로그인 방어 부족**
- Supabase Auth 기본 시도 제한 없음
- Sprint demo OK. Launch 전 Cloudflare Turnstile 필수.

[중간] **세션 도난**
- httpOnly + secure 기본 → JS에서 못 읽음, HTTPS만 전송
- localhost dev는 평문. Production HTTPS 강제.

[낮음] **이메일 enumeration**
- Supabase 로그인 실패 일관 "invalid credentials" → 안전.
- 비밀번호 재설정 수동이므로 leak 없음.

---

# §6. PIPA 준수 (Korean 개인정보보호법)

## 6.1 적용 범위

`orders.customer_phone` 컬럼 (끝 4자리). `customer_name`도 개인정보지만 PIPA에서 식별자 단독으로는 덜 민감.

## 6.2 핵심 의무

### 6.2.1 명시적 동의 (Article 15)

주문 폼 (apps/order-web, Future):
```
[ ] 개인정보(휴대전화 번호) 수집 / 이용에 동의합니다.
    ▸ 수집 목적: 상품 픽업 안내 및 주문 처리
    ▸ 보유 기간: 픽업 완료 후 1년 (이후 자동 삭제)
    ▸ 제3자 제공: 도매업자에게는 제공되지 않음
```

미체크 시 submit 비활성. `orders.phone_consent_at` (timestamptz) NOT NULL에 동의 시각 기록.

### 6.2.2 최소 수집 (Article 16)

- 기본: 끝 4자리만 저장 (`check (length = 4)`)
- 전체 번호: 별도 동의 필요 — sprint 1 안 함
- 카톡 오픈채팅 관행상 "베개커버 1세트 + 1234"로 식별 가능 → 풀 번호 불필요

### 6.2.3 저장 보안 (Article 29)

- 끝 4자리만 → 단독으로 식별 불가, 별도 암호화 불필요
- Supabase 기본 백업 암호화 사용
- `SUPABASE_SERVICE_ROLE_KEY` 절대 클라이언트 노출 금지

### 6.2.4 접근 로그 (Article 29.3)

`phone_access_log` 테이블 (§4.11). 기록 시점:
- 사장님이 dashboard에서 phone 보임 (`view`)
- phone 수정 (`edit`)
- 도매업자 이메일 발송 (`export` — 실제론 phone 안 보냄, audit 자체는 기록)
- PIPA 보유기간 만료 자동 삭제 (`delete`, user_id=null)

### 6.2.5 보유 기간 (Article 21)

자동 삭제 cron (`packages/agent/cron/pipa-retention.ts`, 매일 00:00):

```typescript
// 1. 픽업 완료 후 1년 경과
update orders set customer_phone = null
where status = 'picked_up' 
  and picked_up_at < now() - interval '1 year'
  and customer_phone is not null;

// 2. 취소 후 30일 경과
update orders set customer_phone = null
where status in ('cancelled', 'no_show')
  and updated_at < now() - interval '30 days'
  and customer_phone is not null;

// 각 행에 phone_access_log 'delete' 기록
```

### 6.2.6 제3자 제공 금지 (Article 17)

**도매업자에게 customer_phone 절대 제공 금지.**

`notify_wholesaler` tool:
- ✅ 보냄: 상품명, 총 수량, 매장 정보, 입고 희망일
- ❌ 안 보냄: customer_name, customer_phone, 개별 주문 분리

도매업자 입장 = "총 200개 발주" 만 알면 됨.

### 6.2.7 고객 권리 (Article 35-38)

- **열람**: phone 끝 4자리로 본인 주문 조회 (apps/lookup-web, future)
- **삭제**: 매장 연락 → 매니저가 dashboard에서 phone NULL 처리
- **이용 정지**: phone NULL = 사실상 정지

삭제 요청 처리:
```sql
update orders set customer_phone = null where id = $1;
insert into phone_access_log (store_id, user_id, order_id, action, reason)
values ($store_id, $user_id, $1, 'delete', '고객 삭제 요청');
```

## 6.3 구현 체크리스트 (Launch 전 100%)

- [ ] `orders.customer_phone` constraint length = 4
- [ ] `orders.phone_consent_at` NOT NULL
- [ ] 주문 폼 동의 체크박스 + 안내 (apps/order-web, future)
- [ ] `phone_access_log` 테이블 생성
- [ ] 사장님이 phone 보는 모든 view에 access log hook
- [ ] cron `pipa-retention.ts`
- [ ] 도매업자 이메일에 phone 포함 안 됨 단위 테스트
- [ ] 삭제 요청 처리 UI
- [ ] privacy policy 페이지 `/privacy` (한국어)

## 6.4 위반 위험

| 조항 | 위반 시 |
|---|---|
| Article 17 (3rd party 동의 없이) | 5년 이하 징역 + 5천만원 벌금 |
| Article 29 (보안 미흡) | 3년 이하 징역 + 3천만원 벌금 |
| Article 21 (보유 초과) | 3천만원 이하 과태료 |
| Article 15 (동의 없이) | 5천만원 이하 과태료 |

위 체크리스트는 launch 전 100% 완료 필수. Sprint 내부 demo (사장님 본인 데이터만)는 일부 유보 가능.

---

# §7. 워크플로우 (11단계)

## 7.1 Step 1 — 상품 발주 정보 기입 (수동)

**누가:** 매장 관리자 (사장님 / 직원)
**위치:** `apps/dashboard/app/(dashboard)/new/page.tsx`

**입력 필드:**
- 매장 (자동: active_store_id, 스위처로 변경)
- 상품명, 설명, 카테고리
- 가격, 시중가
- 수량
- 일정 (마감, 입고, 픽업 시작, 픽업 마감)
- 이미지 (자동 크롤 → 선택 또는 직접 업로드)

**필수 / 선택 필드:**
- 필수: name, price, stock_quantity, order_deadline, pickup_date, pickup_deadline
- 선택: description, category, compare_price, expiry_date, urgency_banner

**검증:**
- price > 0, stock_quantity > 0
- order_deadline > now + 1h
- pickup_date >= order_deadline (날짜 기준)
- pickup_deadline >= pickup_date

**DB:** `products` insert (store_id 자동)
**Audit:** `audit_log` action='create'
**트리거:** "공구 시작" 버튼 → Step 2~4 chain (A10 — 즉시 자동 실행 안 함)

## 7.2 Step 2 — 오픈채팅 공고① (Stage 1)

**Tool:** `generate_announcement({ productId, stage: 1 })`
**입력:**
- products 모든 정보
- stores 브랜드 (leading_emoji, brand_name, short_name)
- 카테고리별 emoji theme (§8.3)

**자동 수행:**
1. Claude API + §8.1 템플릿 + store config 주입
2. 감성 설명 3-4줄 AI 생성
3. 길이 1,000자 이내 검증

**출력:** 카톡 텍스트
**DB:** `generated_assets` type='announcement_stage1'
**UI:** 대시보드 "복사" 버튼 (카카오 API 없음, 텍스트만)

## 7.3 Step 3a — 상품 이미지 크롤

**Tool:** `crawl_naver_images({ productId, productName, maxImages: 6 })`

**자동:**
1. 네이버 쇼핑 검색
2. 첫 결과 상품 상세 페이지
3. 갤러리 + 본문 이미지 max 6장 추출
4. Supabase Storage 업로드 (`product-images/{productId}/{n}.jpg`)
5. 메타 (width, height, type) 기록

**출력:** 이미지 URL 배열 (type: product / detail / lifestyle)
**상세 명세:** §11.1

**UI:** 사장님이 6장 중 메인 + 부가 선택 → `products.primary_image_url`, `source_image_urls` 업데이트

## 7.4 Step 3b — 상품 가격 크롤 + 가격 강조 텍스트

### 3b-1: 가격 크롤
**Tool:** `crawl_naver_price({ productName })`
**자동:**
1. 네이버 쇼핑 가격비교 페이지
2. 최저가, 모델명, 판매처 추출
3. 스크린샷 캡처

**DB:**
- `generated_assets` type='price_compare_data' (metadata = JSON)
- `generated_assets` type='price_compare_image' (asset_url = 스크린샷)

**상세 명세:** §11.2

### 3b-2: 가격 강조 텍스트
**Tool:** `generate_price_emphasis_text({ productId, priceCompareAssetId })`
**자동:**
1. 가격 데이터 + 상품 가격 비교 → 절약 금액 계산
2. 100자 이내 짧은 카톡 텍스트 생성

**출력:** 텍스트
**DB:** `generated_assets` type='price_emphasis_text'
**용도:** 사장님이 (1) 네이버 스크린샷 + (2) 가격 강조 텍스트 함께 카톡 올림

**형식:** §8.4

## 7.5 Step 4 — 포스터 합성

**Tool:** `compose_poster({ productId })`
**입력:**
- `products.primary_image_url`
- store brand (primary_color, accent_color)
- 텍스트 (상품명, 가격, 마감일)

**자동:**
1. 메인 이미지 리사이즈
2. 상단 배너 (입고/수령 마감일)
3. 하단 영역 (상품명, 가격 강조)
4. 800×950 PNG 합성
5. Supabase Storage 업로드

**DB:** `generated_assets` type='poster'
**상세 명세:** §12

**중요:** 생성 AI 사용 금지. *기존 이미지 + 텍스트 합성*만.

## 7.6 Step 5 — 고객 주문 수집 (DORMANT)

**상태:** 이번 sprint 미개발. `apps/order-web/` 스켈레톤만.

**계획 (next sprint):**
- 프론트: Next.js, mobile-first, senior UX
- 입력: 고객 이름, 끝 4자리, PIPA 동의
- 자동: `orders` insert (store_id trigger)
- Realtime: 대시보드 실시간 반영

**현재:** 주문 데이터 없음. 주문 관리 view는 empty state placeholder.

## 7.7 Step 6a — 수령일 비교 테이블

**Tool:** `generate_pickup_table({ storeId, rangeDays: 5 })`
**자동:**
1. 진행 중 상품 쿼리
2. 상태 분류 (마감 임박 / 수령 가능 / 상품 준비)
3. SVG → Sharp 렌더링 → 800×가변 PNG
4. Storage 업로드

**DB:**
- `generated_assets` type='pickup_table_image'
- `generated_assets` type='pickup_table_text' (동반 안내)

**상세 명세:** §13

## 7.8 Step 6b — 마감 임박 안내 (Stage 2)

**Tool:** `generate_announcement({ productId | productIds, stage: 2 })`
**트리거:**
- 사장님 수동 클릭
- Step 6a 결과에서 마감 임박 발견 시 자동 동반

**출력:** 짧은 카톡 (단일 200자 / 다중 500자 이내)
**DB:** `generated_assets` type='announcement_stage2'
**형식:** §8.2

## 7.9 Step 7 — 재고 / 주문 / 누락 검수

**Dashboard view:** `공구 현황` + `주문 관리`
**Tool:** `get_orders({ storeId, productId?, includeAnomalies: true })`

**Anomaly rules (sprint 시작 시 채울 빈자리):**
- 결제됨인데 데이터 없음
- 동일 phone + product 중복
- order_deadline 이후 들어옴
- customer_name 빈 값

**현재:** orders dormant → 검수 로직 단위 테스트만 작성.

## 7.10 Step 8 — 도매업자 이메일

**Tool:** `notify_wholesaler({ productId, recipientOverride? })`
**자동:**
1. `get_orders` → 수량 집계 (phone 절대 제외 — PIPA)
2. 이메일 본문 (HTML + 텍스트):
   - 매장명, 상품명, 총 수량, 입고 희망일, 매장 주소
3. Resend API 전송
4. `phone_access_log` action='export'
5. `products.flow_stage = 'warehouse_notified'`

**받는 이메일:**
1. `recipientOverride` (있으면)
2. `stores.wholesale_email`
3. `WHOLESALE_DEFAULT_RECIPIENT` env (fallback)

**보내는 이메일:** `stores.wholesale_from_email` (default `noreply@onword.kr`)

**DB:**
- `generated_assets` type='wholesale_email' (content = body)
- `audit_log` action='flow_stage_change'

## 7.11 Step 9 — 수령 안내 공고 (Stage 3)

**Tool:** `generate_announcement({ storeId, stage: 3 })`
**조회:**
```sql
select name from products 
where store_id = $1
  and pickup_date = current_date
  and status = 'active'
  and flow_stage in ('arrived', 'pickup_ready');
```

**빈 결과:** 메시지 생성 안 함.
**DB:** `generated_assets` type='announcement_stage3'
**형식:** §8.3

## 7.12 Step 10 — 자동 no_show 처리 (Cron)

**위치:** `packages/agent/cron/auto-no-show.ts`
**실행:** 매일 00:00

```sql
update orders
set status = 'no_show', updated_at = now()
where status in ('pending', 'confirmed')
  and exists (
    select 1 from products
    where products.id = orders.product_id
      and products.pickup_deadline < current_date
  );
```

**Audit:** 각 변경 row에 `audit_log` action='auto_no_show'
**Idempotent:** 이미 no_show면 skip.

## 7.13 Action 그룹 (Orchestrator)

대시보드 "한 번에 실행" 버튼:

| Action | Tool 순서 (A3: 실패 시 chain 중단) |
|---|---|
| `start_campaign` | `generate_announcement(1)` → `crawl_naver_images` → `crawl_naver_price` → `generate_price_emphasis_text` → `compose_poster` |
| `close_orders` | `get_orders(anomalies=true)` → `generate_pickup_table` |
| `notify_warehouse` | `get_orders` → `notify_wholesaler` |
| `announce_pickup` | `generate_announcement(3)` |
| `urgent_alert` | `generate_announcement(2)` |

---

# §8. 카카오톡 텍스트 포맷

> `generate_announcement` (Stage 1/2/3) + `generate_price_emphasis_text` tool 출력 표준.
> 매장별 리딩 이모지는 `stores.leading_emoji` 치환.

## 8.1 §Stage 1 — 모집 시작 공고

### 템플릿

```
{store.leading_emoji} {store.name} & {store.brand_name} 오늘의상품 {price}원
🎁 {product.fullName}

❌ 시중가: {comparePrice}원대
🌈 {store.shortName} 특가 👉 {price}원 🔥

{emojiLine1} {감성 설명 1 — 사용 상황/계절감}
{emojiLine2} {감성 설명 2 — 사용감 강조}
{emojiLine3} {감성 설명 3 — 필요성 강조}
{emojiLine4} {추가 — 세트 구성}
📐 {규격 정보}
🧊 {핵심 소재}
🧶 {추가 소재}

😍 역대급 가격으로 {productCategory} 득템!

❌ 수량소진시 조기 마감 ❌

⏳ 예약 마감일 : {orderDeadline format="MM월 DD일(요일) 오전/오후 H시"}
🚚 입고 예정일 : {pickupDate format="MM월 DD일(요일)"}
▶️ 수령 마감일 : {pickupDeadline format="MM월 DD일(요일)"} 까지
📌 수령 마감일이 지나면 자동 취소됨을 알려드립니다.

🔴 예약시 상품명 적어주세요 🔴
✅ 예시) {productShortName} 1세트 + 휴대번호 4자리
```

### 실제 예시 (판다팜)

```
🐼 판다팜 & 산타 오늘의상품 8,900원
🎁 슈미트 냉감 쿨 베개커버 세트(2장)

❌ 시중가: 40,000원대
🌈 산타가족 특가 👉 8,900원 🔥

😴 이제 쿨하게 숙면하는 여름밤!
😪 머리에 땀 안 차는 시원한 잠!
🧺 여름철 베개커버 위생관리 필수!
🛏 2장 세트 번갈아 세탁 사용!
📐 66×40cm 표준 베개 사이즈!
🧊 폴리에틸렌 51% 냉감 핵심소재!
🧶 폴리에스터 49% 부드러운 촉감!

😍 역대급 가격으로 냉감베개 커버 득템!

❌ 수량소진시 조기 마감 ❌

⏳ 예약 마감일 : 05월 07일(목) 오후 2시
🚚 입고 예정일 : 05월 09일(토)
▶️ 수령 마감일 : 05월 13일(수) 까지
📌 수령 마감일이 지나면 자동 취소됨을 알려드립니다.

🔴 예약시 상품명 적어주세요 🔴
✅ 예시) 베개커버 1세트 + 휴대번호 4자리
```

### 변수 매핑

| 변수 | DB 출처 | 비고 |
|---|---|---|
| `{store.leading_emoji}` | stores.leading_emoji | 매장별 |
| `{store.name}` | stores.name | "판다팜" |
| `{store.brand_name}` | stores.brand_name | "산타" |
| `{store.shortName}` | stores.short_name | "산타가족" |
| `{price}`, `{comparePrice}` | products | 천단위 콤마 |
| `{product.fullName}` | products.name | 단위 포함 |
| `{감성 설명}` | AI 생성 | 3-4줄 |
| `{emojiLine N}` | AI 선택 | 카테고리 기반 |
| `{orderDeadline}` 등 | products + date-fns 한국어 locale | A12 포맷 |
| `{productShortName}` | AI 생성 | 짧게 |

### 검증
- [ ] 첫 줄: leading_emoji + 매장명 + 가격
- [ ] 이모지 각 줄 의미 연결
- [ ] 모든 날짜 한국어 포맷
- [ ] 예약 방법 안내
- [ ] 1,000자 이내

## 8.2 Stage 2 — 마감 임박 공고 (단일)

```
⏰ 곧 마감되는 공구 상품이에요!

🎁 {product.fullName}
👉 {price}원 (시중가 {comparePrice}원)

⏳ 예약 마감 : {orderDeadline format="오늘 오후 H시" 또는 "내일 오전 H시"}

🔥 이번이 마지막 기회입니다!

🔴 예약시 상품명 적어주세요 🔴
✅ 예시) {productShortName} 1세트 + 휴대번호 4자리
```

### 다중 상품

```
⏰ 곧 마감되는 공구 상품들이에요!

🎁 {p1.name} ({p1.price}원)
🎁 {p2.name} ({p2.price}원)
🎁 {p3.name} ({p3.price}원)

⏳ 모두 오늘 오후 2시까지!

🔥 놓치지 마세요!
```

### 길이
- 단일: 200자 이내
- 다중: 500자 이내

## 8.3 Stage 3 — 수령 안내 공고

```
📢 오늘 수령 가능 상품 안내

🎁 {p1.name}
🎁 {p2.name}
🎁 {p3.name}
🎁 {pN.name}

늦지 않게 방문해 주세요! 🏃 💨
감사합니다! 🥰
```

빈 결과: 메시지 생성 안 함.

## 8.4 가격 강조 짧은 텍스트

```
🌈 네이버 최저가 {naverPrice}원 ❌
🔥 {store.shortName} 특가 {ourPrice}원 ✅

💰 {savings}원 절약!
지금이 살 때 🛒
```

100자 이내. naverPrice ≤ ourPrice 시 생성 안 함.

## 8.5 이모지 가이드 (AI 선택용)

| 카테고리 / 의미 | 이모지 후보 |
|---|---|
| 시원함 / 냉감 | 🧊 ❄️ 💦 😴 |
| 잠 / 숙면 | 💤 😪 🛏 🛌 |
| 음식 | 🍳 🥘 🍚 🍙 🍜 |
| 위생 / 청결 | 🧺 🧼 ✨ |
| 부드러움 / 촉감 | 🧶 🪶 |
| 따뜻함 | 🔥 ☀️ |
| 신선함 | 🥬 🍃 🌿 |
| 시간 / 마감 | ⏳ ▶️ 📌 |
| 배송 | 🚚 📦 |
| 강조 | 🔥 😍 ❌ ✅ 🌈 |

AI가 description 키워드 + 카테고리 보고 선택. 매칭 못 하면 default 🎁.

---

# §9. UI 디자인 시스템

## 9.1 디자인 철학

**Apple-like minimalism:**
- 흰 배경 (`#FFFFFF`) + 회색 페이지 (`#F3F3F3`)
- 검정 텍스트
- 무거운 그림자 대신 얇은 보더
- 강한 라운드 (rounded-full, rounded-[32px])
- 색상은 상태 표시에만

## 9.2 디자인 토큰

### 색상
```
배경: bg-[#F3F3F3] (페이지), bg-white (카드), hover:bg-black/[0.04], bg-black text-white (활성)
텍스트: text-zinc-900 / 700 / 500 / 400 / 300
보더: border-black/[0.04] | border-black/5 | border-black/[0.02]
상태: emerald (성공) | red (오류) | amber (경고) | zinc (진행)
```

### 라운드
```
rounded-full: 버튼, 네비
rounded-3xl (24px): 에이전트 스텝, 채팅 버블
rounded-[32px]: 큰 카드
rounded-2xl (16px): 작은 카드
rounded-xl (12px): 입력 / 작은 버튼
```

### 그림자
```
shadow-[0_2px_12px_rgba(0,0,0,0.02)] - 카드 기본
shadow-[0_2px_12px_rgba(0,0,0,0.03)] - 활성 스텝
shadow-sm - 활성 버튼
shadow-none - 비활성
```

### 폰트
```
text-2xl font-bold      - 페이지 타이틀
text-[17px] font-semibold - 카드 타이틀
text-[14px] font-medium - 메뉴, 버튼
text-[13px]             - 본문
text-[12px]             - 보조 (대시보드 OK, order-web 금지)
text-[11px]             - 푸터
text-[10px]/[9px] uppercase tracking-wider - 라벨
```

### 간격
```
사이드바: w-[280px]
페이지 패딩: pt-8 pb-6 pl-8 pr-4 (사이드바)
카드 패딩: p-6 ~ p-8
카드 간격: gap-6
섹션 간격: mb-10
```

## 9.3 메뉴 구조 — Hybrid (A13)

### 상위 5-slot 사이드바
```
┌────────────────────────┐
│ 🐼 판다팜          ▼  │  ← StoreSwitcher
├────────────────────────┤
│ 🤖 AI 비서             │
│ 📊 공구 현황           │
│ 🗂️ 주문 관리           │  ← empty state (A14)
│ 📁 자산                │
│ ➕ 상품 등록           │
│ ─────────────         │
│ 🔔 알림 (3)           │  ← NotificationCenter
│ 📜 감사 로그           │  ← (선택)
└────────────────────────┘
```

### 하위 7-feature action surface (상품 상세 화면 안)
```
공구 현황 → 카드 클릭 → 상품 상세:
[✓ 공고①] [✓ 이미지] [○ 가격] [— 포스터]
[— 수령표] [— 도매주문] [— 수령안내]

상태: ✓ 완료 / ○ 진행 중 / — 미실행 / ✗ 실패
+ AI 비서 (상품 컨텍스트 자동 주입)
+ 자산 목록 (복사 버튼)
```

## 9.4 한국어 라벨 (A16)

| 영문 | 한글 |
|---|---|
| Agent Chat | AI 비서 |
| Dashboards | 공구 현황 |
| Orders | 주문 관리 |
| Reports / Assets | 자산 |
| New Product | 상품 등록 |
| Send | 보내기 |
| Thinking | 생각 중 |
| Tool Call | 도구 실행 |
| Result | 결과 |
| How can I help you? | 무엇을 도와드릴까요? |
| Save flow | 플로우 저장 |
| Switch store | 매장 전환 |
| Log out | 로그아웃 |
| Status | 상태 |

코드 내부 (state, function, type, 변수) = 영문 유지.

## 9.5 핵심 컴포넌트

### Sidebar (`packages/ui/Sidebar.tsx`)
- 매장 스위처 + 5-slot 메뉴 + 하단 알림/사용자
- 활성: `bg-black text-white shadow-sm`
- 비활성: `text-zinc-500 hover:bg-black/[0.04]`

### StoreSwitcher (`packages/ui/StoreSwitcher.tsx`)
```typescript
interface StoreSwitcherProps {
  currentStore: Store
  availableStores: Store[]
  onSwitch: (storeId: string) => void
}
```
매장 1개: dropdown 비활성. 2+: 활성.

### BottomNav (`packages/ui/BottomNav.tsx`)
`md:hidden`. 4 items (자산 제외, `mobileVisible: false`).

### AgentStepBlock (`packages/ui/AgentStepBlock.tsx`) ⭐
3 상태: `streaming` / `completed` / `error`
```typescript
interface AgentStep {
  id: string
  type: 'text' | 'tool'
  content?: string
  toolName?: string
  toolArgs?: Record<string, any>
  result?: { message?: string }
  status: 'pending' | 'streaming' | 'completed' | 'error'
  latencyMs?: number
}
```

### ChatView (`apps/dashboard/components/views/ChatView.tsx`)
- 메시지 input + history
- Empty state: SavedFlows 렌더
- 옆 패널: ExecutionTracePanel (활성 trace 있을 때)
- "새 대화" 버튼

### SavedFlows (`packages/ui/SavedFlows.tsx`) — §14
Grid + "+ 새 플로우" + (•••) 메뉴

### ProductCard (`packages/ui/ProductCard.tsx`)
```
[primary_image]
상품명
[✓][✓][✓][○][—][—][—][—] ← 8-stage progress dots
가격 · 참여 수
마감일
```

### ProductDetail (`apps/dashboard/app/(dashboard)/p/[id]/page.tsx`)
Hybrid: 7-feature action grid + AI 비서 + 자산 목록.

### SummaryCard (AI 비서 default landing)
```
오늘 마감 5개 · 신규 주문 12
수령 가능 8 · 마감 임박 3
```

### NotificationCenter (`packages/ui/NotificationCenter.tsx`)
좌측 🔔 클릭 → dropdown:
- audit_log 최근 10건
- 새 주문 (Realtime, future)
- tool 실패 (`agent_traces.status='failed'`)
- 읽음: localStorage `last_read_at`

### AuditLogPanel
시간 역순 표시:
```
2026-05-13 14:23  Sihoon  공고① 재생성 (superseded)
2026-05-13 09:15  Sihoon  flow_stage: order_open → order_closed
2026-05-13 09:14  system  auto_no_show (3건)
```

### EmptyOrderManagement (A14)
```
🗂️
주문 데이터가 곧 추가될 예정입니다

apps/order-web (고객 주문 페이지)이 출시되면 
여기에 실시간 주문 목록이 표시됩니다.
```

## 9.6 Framer Motion 패턴

```tsx
// 새 스텝 등장
<motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>

// 진행 바
<motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }}/>

// AnimatePresence
<AnimatePresence>
  {steps.map(s => <AgentStepBlock key={s.id} step={s}/>)}
</AnimatePresence>
```

## 9.7 모바일 / 데스크탑

```tsx
// 사이드바
hidden md:flex
// BottomNav
md:hidden

// 메인 영역
className="flex-1 flex flex-col overflow-hidden 
  px-4 pb-4 pt-2 md:pt-6 md:pb-6 md:pr-6 md:pl-2"

// 모바일 헤더
<div className="md:hidden flex items-center px-6 pt-6 pb-2 shrink-0">
  <button className="text-2xl font-bold">공구 관리 대시보드</button>
</div>
```

A9: 대시보드 일반 밀도. 시니어 친화는 order-web만.

## 9.8 라이브러리

```json
{
  "framer-motion": "^12.x",
  "lucide-react": "^0.546.x",
  "react-markdown": "^10.x",
  "clsx": "^2.x",
  "tailwind-merge": "^3.x",
  "date-fns": "^4.x"
}
```

`cn()`:
```typescript
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

---

# §10. Agent Tool 명세

> 각 tool은 TDD 강제 (CLAUDE.md §3). 시그니처 변경 = cascading change (CLAUDE.md §15).

## 10.1 generate_announcement

```typescript
interface GenerateAnnouncementInput {
  productId?: string             // stage 1/2 단일
  productIds?: string[]          // stage 2 다중
  storeId: string                // stage 3 (오늘 픽업)
  stage: 1 | 2 | 3
}

interface GenerateAnnouncementOutput {
  content: string
  assetId: string
}
```

**구현 위치:** `packages/agent/tools/generate-announcement.ts`
**의존:** Anthropic SDK + store config + §8 템플릿
**DB:** `generated_assets` type='announcement_stage{1|2|3}'
**에러:**
- Stage 1: products 미존재 → throw
- Stage 3: 빈 결과 → return null content + 안내
- Claude API 429 → 재시도 (exponential backoff)

**테스트:**
- 슈미트 베개커버 fixture로 Stage 1 정확 출력
- Stage 2 단일/다중 분기
- Stage 3 빈 결과 처리

## 10.2 generate_price_emphasis_text

```typescript
interface GeneratePriceEmphasisTextInput {
  productId: string
  priceCompareAssetId: string    // crawl_naver_price 결과
}

interface GeneratePriceEmphasisTextOutput {
  content: string                // 100자 이내
  assetId: string
}
```

**위치:** `packages/agent/tools/generate-price-emphasis-text.ts`
**에러:**
- price_compare_data 없음 → throw
- naverPrice ≤ ourPrice → throw "할인 효과 없음" (생성 안 함)

## 10.3 crawl_naver_images

```typescript
interface CrawlNaverImagesInput {
  productId: string
  productName: string
  maxImages?: number             // default 6
}

interface CrawlNaverImagesOutput {
  images: Array<{
    url: string                  // Supabase Storage
    sourceUrl: string            // 네이버 원본 (audit)
    width: number
    height: number
    type: 'product' | 'detail' | 'lifestyle'
  }>
  productPageUrl: string | null
  assetIds: string[]
}
```

**위치:** `packages/agent/tools/crawl-naver-images.ts`
**상세:** §11.1

## 10.4 crawl_naver_price

```typescript
interface CrawlNaverPriceInput {
  productName: string
}

interface CrawlNaverPriceOutput {
  data: {
    title: string | null
    lowestPrice: string | null
    modelName: string | null
    sellers: Array<{ name: string; price: string }>
  }
  imageUrl: string               // 스크린샷
  assetIds: {
    dataId: string
    imageId: string
  }
}
```

**위치:** `packages/agent/tools/crawl-naver-price.ts`
**상세:** §11.2

## 10.5 compose_poster

```typescript
interface ComposePosterInput {
  productId: string
  baseImageUrl?: string          // 미지정 시 products.primary_image_url
  textOverlay?: {
    category?: string
    spec?: string
  }
}

interface ComposePosterOutput {
  posterUrl: string
  assetId: string
}
```

**위치:** `packages/agent/tools/compose-poster.ts`
**상세:** §12

## 10.6 generate_pickup_table

```typescript
interface GeneratePickupTableInput {
  storeId: string
  rangeDays?: number             // default 5, 3-7 범위
  productIds?: string[]
}

interface GeneratePickupTableOutput {
  imageUrl: string
  imageAssetId: string
  textAssetId: string            // 동반 카톡 텍스트
  productCount: number
}
```

**위치:** `packages/agent/tools/generate-pickup-table.ts`
**상세:** §13

## 10.7 get_orders

```typescript
interface GetOrdersInput {
  storeId: string
  productId?: string
  includeAnomalies?: boolean
}

interface GetOrdersOutput {
  orders: Order[]
  totalQuantity: number
  anomalies: Order[]
}
```

**위치:** `packages/agent/tools/get-orders.ts`
**현재:** orders dormant → 빈 array 반환.

## 10.8 notify_wholesaler

```typescript
interface NotifyWholesalerInput {
  productId: string
  recipientOverride?: string
}

interface NotifyWholesalerOutput {
  sent: boolean
  recipientCount: number
  emailId?: string
  // customer_phone 절대 제외 — PIPA
}
```

**위치:** `packages/agent/tools/notify-wholesaler.ts`
**의존:** Resend API + email template
**테스트:** customer_phone 포함 안 됨 확인 (단위 테스트 필수)

## 10.9 Cron — auto_no_show

위치: `packages/agent/cron/auto-no-show.ts`
설정: Vercel Cron 또는 Supabase pg_cron (F.1에서 결정)
실행: 매일 00:00 KST

```typescript
export async function autoNoShow() {
  const result = await db.query(`
    update orders set status = 'no_show', updated_at = now()
    where status in ('pending', 'confirmed')
      and exists (
        select 1 from products
        where products.id = orders.product_id
          and products.pickup_deadline < current_date
      )
    returning id, store_id
  `)
  
  for (const row of result.rows) {
    await db.insert('audit_log', {
      store_id: row.store_id,
      user_id: null,
      entity_type: 'order',
      entity_id: row.id,
      action: 'auto_no_show'
    })
  }
}
```

## 10.10 Cron — pipa_retention

위치: `packages/agent/cron/pipa-retention.ts`
실행: 매일 00:00 KST

```typescript
// 1. 픽업 완료 1년 → phone NULL
// 2. 취소 30일 → phone NULL
// 각 행에 phone_access_log 'delete' 기록
```

상세: §6.2.5

---

# §11. 외부 데이터 수집

## 11.1 네이버 이미지 크롤 (crawl_naver_images)

### 흐름
1. 네이버 쇼핑 검색 (`https://search.shopping.naver.com/search/all?query=...`)
2. 가장 관련성 높은 결과 → 상품 상세 페이지
3. `networkidle` 대기
4. 메인 갤러리 + 본문 이미지 추출 (max 6)
5. 각 이미지 fetch → Supabase Storage 업로드
6. Sharp metadata 측정 → type 분류
7. `generated_assets` 생성

### 저장 구조
```
assets/
└── product-images/
    └── {productId}/
        ├── 1.jpg
        ├── 2.jpg
        └── ...
```

### 유형 분류 (휴리스틱)
- `product`: 1:1 + < 200KB → 깨끗한 단독 컷
- `lifestyle`: 4:3 또는 16:9 + width > 800px → 모델 / 라이프스타일
- `detail`: 그 외 → 스펙 정보

### 등록 UX
```
상품명: [...]
[📷 이미지 자동 가져오기] → 5-10초 로딩
┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐
│ 1*│ │ 2 │ │ 3*│ │ 4 │ │ 5 │ │ 6 │
└──┘ └──┘ └──┘ └──┘ └──┘ └──┘
 (별표 = 선택. 1*는 메인 = 포스터용)

[📤 직접 업로드]  (자동 실패 시)
```

- 클릭: 선택 토글
- 우클릭 / 길게: "메인 이미지로 지정"
- 선택 안 한 이미지도 DB 보관 (자산 갤러리)

### 실패 처리
| 케이스 | 대응 |
|---|---|
| 검색 결과 0 | 빈 배열, UI: "결과 없음 — 직접 업로드" |
| selector 깨짐 | 빈 배열, UI: "자동 추출 실패" |
| 일부 다운로드 실패 | 성공만 반환 + metadata 실패 카운트 |
| 차단 (CAPTCHA) | throw, trace error, UI 토스트 |
| Storage 업로드 실패 | 1회 재시도, 실패 시 throw |

**절대 금지:** 빈 결과를 placeholder 이미지로 채우기.

### 법적 주의
[중간] 네이버 이미지 = 판매자 / 제조사 저작권. 공구 홍보 사용은 제35조의5 공정이용 가능성. 분쟁 대비:
- `metadata.source_url` 기록 필수
- 분쟁 시 즉시 삭제 admin UI 필요

[높음] 도매업자와의 관계에 따라 위험도 다름. 사장님이 도매업자와 OK한 경우만 사용.

## 11.2 네이버 가격 크롤 (crawl_naver_price)

### 흐름
1. 가격비교 페이지 검색
2. 최저가, 모델명, 판매처 추출
3. 스크린샷 (가격비교 영역)
4. Storage 업로드

### 구현 패턴
```typescript
const browser = await chromium.launch({ 
  headless: true,
  args: ['--disable-blink-features=AutomationControlled']
})

const context = await browser.newContext({
  userAgent: getRandomUserAgent(),
  locale: 'ko-KR',
  viewport: { width: 1280, height: 800 }
})

// page.evaluate로 셀렉터 데이터 추출
// page.screenshot 캡처
```

### Rate Limiting (이미지 + 가격 공통)

[높음] 한 IP 시간당 50+ 요청 → 차단.

대응:
1. **UA rotation** (USER_AGENTS 배열에서 random)
2. **요청 간 지연**: 3-7초 random
3. **Cache First**: 동일 productName 24h 캐시 (DB `generated_assets.created_at` 확인)
4. **Fallback**: 차단 감지 시 즉시 멈춤, 사람에게 토스트
5. **절대 추측 데이터 채움 금지** (CLAUDE.md §1)

```typescript
const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)...',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64)...',
  // ...
]

await page.waitForTimeout(3000 + Math.random() * 4000)
```

### 함정
- 모바일 vs 데스크탑 UA에 따라 HTML 다름 → 데스크탑 통일
- 일부 상품 가격비교 페이지 없음 → null 처리 필수
- 한글 인코딩 (encodeURIComponent)
- 페이지 구조 자주 변경 → selector 깨질 위험. 별도 manual override 플로우 필요.

---

# §12. 포스터 합성

## 12.1 사양

| 속성 | 값 |
|---|---|
| 포맷 | PNG |
| 너비 | 800px |
| 높이 | 950px (50 banner + 600 image + 300 bottom) |
| 폰트 | Pretendard 또는 Noto Sans KR |
| 색상 | store.primary_color (배너), store.accent_color (가격) |

## 12.2 레이아웃

```
┌─────────────────────────────────────────┐
│ [상단 배너 - store.primary_color]       │
│ 입고예정일 X.X(X), 수령마감일 X.X(X)   │
├─────────────────────────────────────────┤
│                                          │
│       [메인 상품 이미지]                 │
│       (products.primary_image_url)       │
│                                          │
├─────────────────────────────────────────┤
│ [상품 카테고리 라벨 - primary_color]     │
│ {category}                              │
│                                          │
│ 🎁  [큰 가격 - accent_color]            │
│     {price}원                            │
│                                          │
│ [추가 정보 - primary_color 바]           │
│ 사이즈: ... │ ...                       │
└─────────────────────────────────────────┘
```

## 12.3 구현 (Sharp)

```typescript
import sharp from 'sharp'

export async function composePoster(input) {
  const baseImage = await sharp(input.baseImageBuffer)
    .resize(800, 600, { fit: 'cover' })
    .toBuffer()
  
  const topBanner = await renderBanner({ 
    text: `입고예정일 ${pickupDate}, 수령 마감일 ${pickupDeadline}까지`,
    width: 800, height: 50,
    bgColor: store.primary_color, 
    textColor: '#FFFFFF'
  })
  
  const bottomSection = await renderBottomSection({ ... })
  
  const finalImage = await sharp({
    create: { width: 800, height: 950, channels: 4, background: '#FFFFFF' }
  })
    .composite([
      { input: topBanner, top: 0, left: 0 },
      { input: baseImage, top: 50, left: 0 },
      { input: bottomSection, top: 650, left: 0 }
    ])
    .png()
    .toBuffer()
  
  const url = await uploadToSupabase(`posters/${productId}-${Date.now()}.png`, finalImage)
  return { posterUrl: url, assetId }
}
```

## 12.4 한글 폰트 (SVG)

```typescript
async function renderBanner({ text, ... }) {
  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="${bgColor}"/>
      <text x="50%" y="50%" 
        font-family="Pretendard, 'Noto Sans KR', sans-serif"
        font-size="20" font-weight="bold" fill="${textColor}"
        text-anchor="middle" dominant-baseline="middle"
      >${text}</text>
    </svg>
  `
  return sharp(Buffer.from(svg)).png().toBuffer()
}
```

**셋업:**
- Pretendard 또는 Noto Sans KR 서버 설치
- Vercel: `public/fonts/`에 폰트 파일 포함
- Dockerfile: `fc-cache` 실행 (필요 시)

## 12.5 입력 검증
- baseImageBuffer: 100KB ~ 10MB
- 포맷: JPEG, PNG, WebP
- 너비: 최소 600px
- 가격 < 0 → throw

## 12.6 테스트

```typescript
describe('compose_poster', () => {
  it('produces 800x950 PNG', async () => {
    const result = await composePoster({
      productId: 'test',
      baseImageBuffer: await fs.readFile('fixtures/pillow.jpg'),
      // ...
    })
    const meta = await sharp(result.buffer).metadata()
    expect(meta.width).toBe(800)
    expect(meta.height).toBe(950)
    expect(meta.format).toBe('png')
  })
  
  it('rejects oversized', async () => {
    const huge = Buffer.alloc(15 * 1024 * 1024)
    await expect(composePoster({ baseImageBuffer: huge, ... }))
      .rejects.toThrow(/Image too large/)
  })
})
```

Fixture: `packages/agent/__fixtures__/pillow.jpg`

## 12.7 V2 (다음 sprint)
- 카테고리별 색상 자동 선택
- 가격 강조 위치 동적
- 다중 상품 콜라주
- 동영상 포스터

---

# §13. 수령일 비교 테이블

## 13.1 콘텐츠 (reference 흡수, 시각화는 우리 톤)

| 컬럼 | 데이터 | 비고 |
|---|---|---|
| 상품명 | products.name | 좌측, 14px |
| 진행 상태 | flow_stage + pickup_deadline 계산 | pill |
| 날짜 N개 | 오늘 + N-1일 | `MM.DD\n(요일)` |
| 수령 마감일 | products.pickup_deadline | 우측 |

기본 N=5 (3~7 조정 가능).

## 13.2 진행 상태 라벨

| 라벨 | 조건 | 색 |
|---|---|---|
| 마감 임박 | flow_stage in (arrived, pickup_ready) AND (pickup_deadline - today) ≤ 1d | `bg-red-50 text-red-600` |
| 수령 가능 | flow_stage in (arrived, pickup_ready) AND > 1d | `bg-emerald-50 text-emerald-600` |
| 상품 준비 | flow_stage in (order_open, order_closed, warehouse_notified) | `bg-zinc-50 text-zinc-600` |
| 표시 X | flow_stage in (completed, cancelled) | — |

레퍼런스의 gradient bar 사용 안 함 (우리 톤 안 맞음). 단순 색 채움 또는 ✓.

## 13.3 출력 사양

| 속성 | 값 |
|---|---|
| 포맷 | PNG |
| 너비 | 800px |
| 높이 | 가변: 80 (header) + rowCount × 60 + 40 (footer) |
| 폰트 | Pretendard / Noto Sans KR |
| 배경 | 흰색 |

## 13.4 데이터 쿼리

```sql
select 
  id, name, flow_stage, pickup_date, pickup_deadline,
  case 
    when flow_stage in ('arrived', 'pickup_ready') 
         and pickup_deadline - current_date <= 1 then 'imminent'
    when flow_stage in ('arrived', 'pickup_ready') then 'available'
    when flow_stage in ('order_open', 'order_closed', 'warehouse_notified') then 'preparing'
  end as status_label
from products
where store_id = $1
  and status = 'active'
  and flow_stage in ('order_open', 'order_closed', 'warehouse_notified', 'arrived', 'pickup_ready')
  and pickup_deadline >= current_date
order by 
  case when flow_stage in ('arrived', 'pickup_ready') then 0 else 1 end,
  pickup_deadline asc;
```

## 13.5 동반 카톡 텍스트

```
🗓️ 이번 주 수령 가능 상품 안내

수령 가능한 상품과 마감일을 정리했어요!
빨간색은 *마감 임박*이니 빨리 찾으러 와주세요. 🏃

(이미지 첨부)

문의 사항은 매장으로 연락주세요. 🙏
```

별도 asset (`type='pickup_table_text'`).

## 13.6 빈 상태
0건이면 이미지 생성 안 함. 사장님 메시지: "표시할 상품 없음".

## 13.7 비범위
- 인터랙티브 (PNG 정적)
- 사장님 커스터마이즈 (default만)
- HTML 버전 (추후)

---

# §14. Saved Flows

## 14.1 데이터 모델
§4.9 참조.

## 14.2 UI — AI 비서 Empty State

```
┌─ AI 비서 ─────────────────────────────────┐
│                  🤖                        │
│        무엇을 도와드릴까요?                │
│                                            │
│  [⟳  오늘 마감 상품 공고글 다시 만들기]   │
│  [📧 도매업자에게 주문 전송]              │
│  [📅 수령일 비교 테이블 생성]             │
│  [📢 오늘 수령 안내 공고 작성]            │
│                                            │
│         [+ 새 플로우 저장]                 │
└────────────────────────────────────────────┘
[메시지 입력...                            ▶]
```

대화 시작 후 → 버튼 숨김. "새 대화" → 다시 표시.

## 14.3 동작

### Flow 클릭 (실행)
1. 버튼 `prompt`을 chat input **자동 채움** (전송 X)
2. 사용자 Enter / Send → 전송
3. `run_count += 1`, `last_run_at = now()`

**자동 전송 안 하는 이유:** prompt에 `{상품ID}` placeholder 있을 수 있어 사용자가 채워야 함.

### 새 Flow 저장 (2가지 진입)
**(a) 대화 중:** 메시지 옆 💾 → 이름 + 아이콘 → 저장
**(b) Empty state:** [+ 새 플로우 저장] → 모달

### 편집 / 삭제
(•••) 메뉴: 이름 / prompt / 순서 / 삭제 (hard delete)

## 14.4 Prompt 권장 패턴
- 명령형 ("~해줘")
- 구체적 ("오늘 마감인 상품" > "마감 상품")
- placeholder: `{상품ID}`, `{날짜}` 등

## 14.5 Default Flows (시드)

새 store_member owner 추가 시 trigger 자동 insert:

```sql
insert into saved_flows (store_id, user_id, name, prompt, icon, display_order)
values
  ($store, $user, '오늘 마감 상품 공고글 다시 만들기', 
   '오늘 마감인 모든 상품의 공고글을 다시 생성해줘', 'RefreshCcw', 1),
  ($store, $user, '도매업자에게 주문 전송',
   '오늘 주문 마감된 상품들의 주문 내역을 도매업자에게 이메일로 전송해줘', 'Mail', 2),
  ($store, $user, '수령일 비교 테이블 생성',
   '이번 주 수령 가능한 상품들의 수령일 비교 테이블 만들어줘', 'Calendar', 3),
  ($store, $user, '오늘 수령 안내 공고 작성',
   '오늘 수령 가능한 상품 안내 카톡 텍스트 만들어줘', 'Megaphone', 4);
```

사장님 자유롭게 수정 / 삭제.

## 14.6 비범위
- 조건부 실행 (if/then)
- 스케줄링 (자동 실행)
- Tool call 직접 지정
- 다른 사장님 공유

---

# §15. API & 라우팅

## 15.1 API Routes (apps/dashboard)

| Route | Method | Body | 동작 |
|---|---|---|---|
| `/api/agent/run` | POST | `{ storeId, productId?, action, productIds? }` | Orchestrator 실행 |
| `/api/products` | POST | `CreateProductInput` | 상품 등록 |
| `/api/products/[id]` | PATCH | partial product | 수정 |
| `/api/products/[id]/archive` | POST | — | archive |
| `/api/saved-flows` | GET | — | 본인 store 목록 |
| `/api/saved-flows` | POST | `{ name, prompt, icon? }` | 추가 |
| `/api/saved-flows/[id]` | PATCH | partial | 수정 |
| `/api/saved-flows/[id]` | DELETE | — | 삭제 |
| `/api/upload` | POST | FormData | 이미지 직접 업로드 |
| `/api/cron/auto-no-show` | POST | — | Vercel Cron entry |
| `/api/cron/pipa-retention` | POST | — | Vercel Cron entry |

모든 라우트: 세션 확인 → store_id 추출 → RLS 의존.

## 15.2 URL 구조 (dashboard)

```
/login                          ← 로그인
/select-store                   ← 매장 선택 (멤버 2+)
/                               ← AI 비서 (default)
/campaigns                      ← 공구 현황
/p/[productId]                  ← 상품 상세 (7-feature surface)
/orders                         ← 주문 관리 (empty, A14)
/assets                         ← 자산 갤러리
/new                            ← 상품 등록
/audit                          ← 감사 로그 (선택)
/privacy                        ← Privacy policy (PIPA)
```

storeId는 URL에 없음 — 쿠키 `active_store_id`.

## 15.3 Realtime

§4.16 참조. ChatView가 활성 trace 구독, NotificationCenter가 audit_log 구독.

## 15.4 Webhooks (없음, sprint 1)

Resend 전송 결과 확인은 polling (단순). Bounce / spam 처리는 다음 sprint.

---

# §16. 환경 변수

## 16.1 전체 목록

| 변수 | Dev | Prod | 출처 | 필수 |
|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✓ | ✓ | Supabase Settings → API | P0 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✓ | ✓ | Supabase Settings → API | P0 |
| `SUPABASE_SERVICE_ROLE_KEY` | ✓ | ✓ | Supabase Settings → API (Sensitive) | P0 |
| `ANTHROPIC_API_KEY` | ✓ (낮은 quota) | ✓ | console.anthropic.com | P0 |
| `RESEND_API_KEY` | test mode | live | resend.com | P0 |
| `WHOLESALE_DEFAULT_RECIPIENT` | dev email | 실제 이메일 | 클라이언트 확인 | P0 |
| `CRON_SECRET` | ✓ | ✓ | 임의 생성 (Vercel Cron 인증) | P0 |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | `https://dashboard.onword.kr` | — | P1 |

`STORE_NAME`, `BRAND_NAME`, `STORE_SHORTNAME` env는 A11에 따라 **DB(stores 테이블)로 이전**. env 제거.

## 16.2 .env.example

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...        # SENSITIVE
ANTHROPIC_API_KEY=sk-ant-...
RESEND_API_KEY=re_...
WHOLESALE_DEFAULT_RECIPIENT=wholesaler@example.com
CRON_SECRET=...random...
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## 16.3 보안 규칙

- `.env.local` → gitignore 필수 (`grep ".env" .gitignore` 확인)
- `git check-ignore .env.local` → 결과 있어야 정상
- Vercel "Sensitive" 마킹: `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `CRON_SECRET`
- 노출 시 즉시 rotate

---

# §17. 위험 & 경고 한곳 모음

## [높음] (Launch 차단)

1. **RLS 누락** — §5.6
   - 새 테이블에 `enable row level security` 잊지 말 것
   - 4 action 정책 (SELECT/INSERT/UPDATE/DELETE) 각각
   - cross-store leak 통합 테스트 필수

2. **Service Role Key 노출** — §5.6
   - `.env.local` gitignore
   - 클라이언트 코드 import 금지
   - Vercel Sensitive 마킹

3. **PIPA 위반** — §6.4
   - 동의 없이 phone 저장 → 5천만원 과태료
   - 도매업자에 phone 제공 → 5년 이하 징역
   - 보유기간 초과 → 3천만원 과태료

4. **네이버 차단 → 추측 데이터 채움** — §11.2
   - 절대 금지. 차단 감지 시 사장님에게 명확히 알림.

## [중간] (Launch 전 권장)

5. **Brute-force 로그인** — §5.6
   - Supabase Auth 기본 제한 없음
   - Cloudflare Turnstile 필수

6. **세션 도난** — §5.6
   - HTTPS 강제 (Vercel 기본)
   - httpOnly + secure 쿠키 (Supabase 기본)

7. **이미지 저작권 분쟁** — §11.1
   - source_url 기록
   - 삭제 admin UI

8. **AI 환각 (가격 / 텍스트)** — Anthropic 응답 검증
   - 가격 강조 텍스트: naverPrice > ourPrice 검증
   - 공고: 길이 / 형식 검증

## [낮음]

9. 이메일 enumeration — Supabase 기본 안전
10. localhost 평문 세션 — dev 한정 OK

## Launch 체크리스트

- [ ] 위 [높음] 4개 모두 해결
- [ ] §6.3 PIPA 구현 체크리스트 100%
- [ ] §5.1 RLS 통합 테스트 통과
- [ ] `.env.local` gitignore 확인
- [ ] HTTPS 강제 (Vercel)
- [ ] Privacy policy 페이지 (`/privacy`)
- [ ] 비밀번호 8자 이상 강제
- [ ] CRON_SECRET 설정 + Vercel Cron 등록

---

# §18. 용어집

## 18.1 도메인 용어 (한↔영)

| 한글 | 영문 식별자 | 비고 |
|---|---|---|
| 매장 | store / stores | 사장님이 운영하는 단위 |
| 사장님 | owner | store_members.role='owner' |
| 직원 | staff | store_members.role='staff' (future) |
| 공구 | campaign | 한 product의 모집-수령 사이클 |
| 상품 | product / products | 1 발주 = 1 product |
| 발주 | order request (관리자→도매) | products row 생성 시점 |
| 주문 | order / orders | 고객이 product에 신청 |
| 픽업 | pickup | 매장에서 상품 받기 |
| 공고 | announcement | 카톡 텍스트 |
| 모집 시작 | stage 1 | flow_stage='announcement_1' |
| 마감 임박 | stage 2 | sprint P1 |
| 수령 안내 | stage 3 | flow_stage='pickup_ready' |
| 자산 | asset / generated_assets | AI 생성물 |
| 도매업자 | wholesaler | stores.wholesale_email |
| 자동화 | automation / action | start_campaign 등 |
| 진행 단계 | flow_stage | 9 단계 |
| 워크플로우 | workflow | §7 11 steps |

## 18.2 기술 용어

| 용어 | 의미 |
|---|---|
| RLS | Row Level Security (Supabase 멀티테넌트 격리) |
| service role | RLS 우회 권한 키 (server only) |
| trace | 1번의 action 실행 단위 (agent_traces row) |
| step | trace 내의 1 tool 호출 (trace_steps row) |
| chain | 한 action 내 여러 tool 순차 실행 |
| supersede | 새 버전이 나와 이전을 마킹 (A10) |
| idempotent | 같은 입력 → 같은 결과 (재실행 안전) |
| flow_stage | products의 라이프사이클 단계 |
| anomaly | 주문 검수 시 발견된 이상 (§7.9) |
| PIPA | Korean 개인정보보호법 |

## 18.3 약어

| 약어 | 풀이 |
|---|---|
| PRD | Product Requirements Document (이 파일) |
| ADR | Architecture Decision Record |
| TDD | Test-Driven Development |
| MVP | Minimum Viable Product |
| RSC | React Server Component |
| FK | Foreign Key |
| RLS | Row Level Security |
| UA | User Agent (HTTP) |
| PII | Personally Identifiable Information |

---

# 부록 A — 결정 변경 이력

| 날짜 | 결정 | 사유 | 영향 |
|---|---|---|---|
| 2025-05-13 | 카카오 자동 전송 안 함 | 공식 API 없음 | 텍스트 복사 UI 필수 |
| 2025-05-13 | 네이버 크롤링 자동 | 클라이언트 명시 | rate limit 전략 필수 |
| 2025-05-13 | 이미지 합성 (생성 X) | 브랜드 톤 일치 | Sharp + 한글 폰트 |
| 2026-05-13 | 멀티 매장 | 클라이언트 명시 | store_id 모든 테이블 |
| 2026-05-13 | Supabase Auth + email/pw | Sihoon 위임 | RLS 정책 필수 |
| 2026-05-13 | PIPA 완전 준수 | 법적 의무 | phone 4자리 + 동의 + 보유 + 로그 |
| 2026-05-13 | 이미지 크롤 분리 (multi) | 클라이언트 명시 | crawl_naver_images NEW |
| 2026-05-13 | Stage 2 카톡 추가 | 워크플로우 명세 | generate_announcement stage=2 |
| 2026-05-13 | 자동 no_show cron | 워크플로우 명세 | Step 10 NEW |
| 2026-05-13 | Saved flows | 클라이언트 명시 | AI 비서 기능 |
| 2026-05-13 | order-web dormant | 코파운더 결정 | 주문관리 view empty state |
| 2026-05-13 | Hybrid 메뉴 | 클라이언트 + 레퍼런스 융합 | 5-slot + 7-feature surface |
| 2026-05-13 | PRD 단일화 | 코파운더 — 효율성 | 13 docs → 1 docs |

새 결정 추가 시 위 표에 추가 + commit.

---

**끝. 이 문서가 PRD의 전부다. 추가 도메인 정보가 필요하면 이 파일에 새 섹션 추가, 외부 파일 만들지 말 것.**
