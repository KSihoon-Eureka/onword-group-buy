# Onword Group Buy

> 한국 오프라인 매장용 공동구매 운영 자동화. AI 에이전틱 대시보드 중심.

## 무엇인가

매장 관리자가 *상품 발주 정보 한 번만* 입력하면, AI 에이전트가:
- 카카오톡 공고 텍스트 자동 생성
- 네이버 가격비교 자동 크롤링
- 포스터 자동 합성
- 도매업자 자동 통지
- 수령 안내 자동 생성

모든 작업이 **1클릭**에 자동으로 연결되는 *agentic dashboard*.

## 개발 방식

**파트너 1명 + AI 에이전트 4-6 병렬 세션**. Boris Cherny 패턴.

- 사람 = Architect + Reviewer
- AI 에이전트 = Builder (병렬)
- 매 작업이 별도 브랜치, 별도 컨텍스트

자세한 방법: `CLAUDE.md §13`

## 기술 스택

- **Frontend:** Next.js 14 (App Router) + TypeScript + Tailwind
- **Backend:** Next.js API Routes + Supabase (Postgres + Auth + Storage + RLS)
- **AI:** Claude API (claude-sonnet-4) — tool_use dynamic loop + 정적 chain
- **Monorepo:** Turborepo + pnpm workspaces
- **Crawling:** Playwright (rate-limit + UA rotation)
- **Image:** Sharp + Pretendard 폰트 (생성 AI 미사용)
- **Email:** Resend
- **Cron:** Vercel Cron (auto_no_show + pipa_retention 매일 00:00 KST)

## 시작하기

### 매장 사장님 → `SHOP_OWNER_GUIDE.md`

대시보드 사용법 1페이지. 로그인 → 상품 등록 → 공구 시작 → 카톡 paste → 픽업.

### 코파운더로 처음 합류한 경우 → `ONBOARDING.md`

이 파일은 Claude Code 세션이 *읽고 따라할 수 있도록* AI 친화적 형식으로 작성됐다.
첫 세션에서 `ONBOARDING.md`를 Claude Code에게 보여주고 시작하면 됨.

### 1. 환경 설정

```bash
# 의존성 설치
pnpm install

# 환경변수 (.env.local)
cp .env.example .env.local
# 다음 채우기:
# - NEXT_PUBLIC_SUPABASE_URL
# - NEXT_PUBLIC_SUPABASE_ANON_KEY
# - SUPABASE_SERVICE_ROLE_KEY
# - ANTHROPIC_API_KEY
# - RESEND_API_KEY

# Supabase 마이그레이션
pnpm db:migrate

# 개발 서버 (3개 앱 동시)
pnpm dev
```

### 2. Claude Code 세션 시작

```bash
claude
```

첫 프롬프트:
```
PLAN.md의 Day 0 항목을 확인하고 현재 상태를 보고해.
미완료 항목 중 첫 번째에 대해 6슬롯 컨텍스트를 작성해.
```

## 디렉토리 구조

```
.
├── CLAUDE.md                   # AI 에이전트 진입점 (매 세션 자동 로드)
├── methodology.md              # 코드 작업 깊은 참조
├── PLAN.md                     # 2일 스프린트 살아있는 plan
├── AI_DOCS/                    # 도메인 지식 (LLM-consumable)
│   ├── workflow-9-steps.md     ← 9단계 워크플로우 전체
│   ├── kakao-text-format.md    ← 카카오 공고 표준 형식
│   ├── naver-crawl-strategy.md ← 네이버 크롤링 방식
│   ├── poster-composition.md   ← 포스터 합성 방식
│   ├── data-model.md           ← DB 스키마
│   └── client-requirements.md  ← 클라이언트 결정사항
├── apps/
│   ├── order-web/              ← 상품 주문 웹 (고객용)
│   ├── lookup-web/             ← 주문조회 웹 (카운터용)
│   └── dashboard/              ← AI 에이전틱 대시보드 (관리자용)
├── packages/
│   ├── types/                  ← 공통 타입
│   ├── ui/                     ← 공통 컴포넌트
│   ├── db/                     ← Supabase 클라이언트
│   └── agent/                  ← AI 에이전트 코어
│       ├── tools/              ← 각 tool 구현
│       ├── tools.ts            ← Tool 정의 (Claude API용)
│       └── orchestrator.ts     ← Tool use 루프
├── .claude/
│   └── commands/               ← 슬래시 명령
│       ├── new-feature.md      ← /new-feature
│       ├── add-tool.md         ← /add-tool
│       ├── review.md           ← /review
│       ├── commit-push.md      ← /commit-push
│       └── update-docs.md      ← /update-docs
└── planning/                   ← 작업별 plan 문서
    ├── current/                ← 진행 중
    └── archive/                ← 완료
```

## 핵심 워크플로

### A. 새 기능 추가
```bash
claude
> /new-feature 1A.2
```
→ 에이전트가 PLAN.md를 읽고, 6슬롯 컨텍스트 작성 후, 브랜치 생성, 구현, 테스트, 커밋.

### B. Agent Tool 추가
```bash
claude
> /add-tool generate-announcement
```
→ tools.ts 정의 추가 → types 정의 → TDD → 구현 → orchestrator 등록.

### C. PR 리뷰 (Reviewer agent)
```bash
# 별도 터미널
claude
> /review feat/order-landing
```

### D. 학습 영속화
```bash
> /update-docs 네이버 셀렉터 .priceCompare → .compare_price로 변경됨
```

## 4-6 병렬 세션 패턴

```
터미널 1 (메인, 너):       Architect 작업, plan 검토
터미널 2 (Claude Code):    Track A 작업
터미널 3 (Claude Code):    Track B 작업
터미널 4 (Claude Code):    Track C 작업
터미널 5 (Claude Code):    Track D 작업
터미널 6 (Claude Code):    Reviewer agent (별도 세션)
```

각 터미널이 *독립된 브랜치*에서 작업. 충돌 방지.

## 주의

- 작업 전 *AI_DOCS 반드시 Read*
- 6슬롯 컨텍스트 안 채우고 코딩 금지
- 한 브랜치에 한 기능
- 테스트 없이 머지 금지
- main 직접 푸시 금지

## 출처

이 시스템의 기반:
- onword-agent: PM 사고 + Claude Code 운영체제 (../onword-agent)
- 『클로드 코드 마스터』 Ch.3 (methodology.md)
- Boris Cherny patterns (병렬 에이전트, 슬래시 명령)
