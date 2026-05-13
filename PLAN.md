# 2-Day Sprint Plan

> 살아있는 문서. 매 작업 완료 시 체크박스 업데이트.
> 변경 시 commit + push 필수.

**시작:** 2025-05-13
**종료:** 2025-05-15
**개발 형태:** 파트너 1명 + AI 에이전트 4-6 병렬

---

## Day 0 — 부트스트랩 (4시간, 오늘)

이 단계가 안 끝나면 Day 1이 카오스. 단축 금지.

- [ ] **0.1** GitHub repo 생성 (onword-group-buy, private)
- [ ] **0.2** Turborepo + Next.js 14 + TypeScript 셋업
- [ ] **0.3** Supabase 프로젝트 생성 + 스키마 적용 (`AI_DOCS/data-model.md` 그대로)
- [ ] **0.4** 환경변수 셋업 (`.env.local`):
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `ANTHROPIC_API_KEY`
  - `RESEND_API_KEY` (도매업자 이메일)
- [ ] **0.5** 공통 타입 정의 (`packages/types/index.ts`)
- [ ] **0.6** Supabase 클라이언트 (`packages/db/`)
- [ ] **0.7** Tailwind 셋업 + 디자인 토큰
- [ ] **0.8** `.claude/commands/` 슬래시 명령 5개 작성
- [ ] **0.9** First commit + GitHub push

---

## Day 1 — Builder Mode (8시간)

### 오전 (4시간) — 4 에이전트 병렬

**Track A (Agent 1):** 상품 주문 웹 — 랜딩 페이지
- [ ] **1A.1** apps/order-web Next.js 셋업
- [ ] **1A.2** ProductCard 컴포넌트 (긴급배너, 가격 강조, 마감일)
- [ ] **1A.3** 상품 목록 페이지 (active 상품만)
- [ ] **1A.4** CountdownTimer 컴포넌트

**Track B (Agent 2):** 상품 주문 웹 — 주문 폼
- [ ] **1B.1** 상품 상세 페이지 ([productId])
- [ ] **1B.2** OrderForm 컴포넌트
- [ ] **1B.3** Supabase insert + 남은 수량 갱신
- [ ] **1B.4** 실시간 참여자 수 표시 (Realtime)

**Track C (Agent 3):** Agent Tool — generate_announcement
- [ ] **1C.1** packages/agent/tools.ts 정의
- [ ] **1C.2** generate-announcement.ts 구현 (Claude API)
- [ ] **1C.3** TDD: 슈미트 베개커버 예시 통과
- [ ] **1C.4** Stage 1, 3 모두 지원

**Track D (Agent 4):** 대시보드 — 상품 등록 폼
- [ ] **1D.1** apps/dashboard Next.js 셋업
- [ ] **1D.2** ProductRegisterForm 컴포넌트
- [ ] **1D.3** Supabase insert + redirect to detail
- [ ] **1D.4** 이미지 업로드 (Supabase Storage)

### 오후 (4시간) — 통합 + 다음 트랙

- [ ] **1.E** 4개 트랙 PR 리뷰 + 머지
- [ ] **1.F** 통합 테스트 (주문 등록 → 대시보드 표시)

**Track E (Agent 5, 오후):** Agent Tool — crawl_naver_price
- [ ] **1E.1** Playwright 셋업
- [ ] **1E.2** crawl-naver-price.ts 구현
- [ ] **1E.3** Rate limit + UA rotation
- [ ] **1E.4** Supabase Storage 업로드

**Track F (Agent 6, 오후):** Agent Tool — get_orders + db-ops
- [ ] **1F.1** get-orders.ts (anomaly detection 포함)
- [ ] **1F.2** db-ops.ts (공통 Supabase wrapper)
- [ ] **1F.3** TDD

---

## Day 2 — Heavy Tools + 통합 (8시간)

### 오전 (4시간) — 무거운 Tool 3개

**Track G (Agent 1):** Agent Tool — compose_poster
- [ ] **2G.1** Sharp 셋업 + 한글 폰트 (Pretendard)
- [ ] **2G.2** compose-poster.ts (슈미트 포스터 형식)
- [ ] **2G.3** TDD: fixture 이미지로 800x950 PNG 출력 확인

**Track H (Agent 2):** Orchestrator + Agent Chat
- [ ] **2H.1** packages/agent/orchestrator.ts (tool_use 루프)
- [ ] **2H.2** apps/dashboard Agent Chat UI
- [ ] **2H.3** Execution Trace UI (Supabase Realtime)
- [ ] **2H.4** Action 버튼 (start_campaign 등)

**Track I (Agent 3):** Agent Tool — notify_wholesaler
- [ ] **2I.1** Resend API 연동
- [ ] **2I.2** 이메일 템플릿 (도매업자용)
- [ ] **2I.3** get_orders 활용해 주문 집계
- [ ] **2I.4** TDD

### 오후 (4시간) — 통합 + 배포

- [ ] **2.J** 모든 Tool을 Orchestrator에 등록
- [ ] **2.K** 4가지 Action 자동 실행 테스트:
  - start_campaign
  - close_orders
  - notify_warehouse
  - announce_pickup
- [ ] **2.L** E2E 테스트 (상품 등록 → 주문 → 도매 → 수령 안내)
- [ ] **2.M** Vercel 배포 (3개 앱)
- [ ] **2.N** 클라이언트 시연 영상 녹화

---

## Should (시간 남으면)

- [ ] 주문조회 웹 (apps/lookup-web)
- [ ] generate_pickup_table tool
- [ ] 대시보드 캘린더 뷰
- [ ] Stage 2 공고 (마감 임박)

---

## 일일 회고 체크포인트

### Day 1 종료 시 자가 평가
- [ ] Must P0의 50% 이상 완료?
- [ ] AI_DOCS에 추가할 학습 있나?
- [ ] 내일 4개 Track 명확한가?
- [ ] 막힌 부분 → 클라이언트 확인 필요한 것 있나?

### Day 2 종료 시 자가 평가
- [ ] Must P0 100% 완료?
- [ ] E2E 흐름이 끊김 없이 동작?
- [ ] Vercel 배포 완료?
- [ ] 클라이언트가 *지금* 보면 만족할까?

---

## 에스컬레이션 트리거

다음 상황 발생 시 *즉시* Jinho에게 알림:

- 클라이언트 요구사항이 모호한 항목 발견
- AI_DOCS와 실제 구현이 충돌
- Track 하나가 4시간 이상 막힘
- 외부 API (네이버, Resend, Anthropic) 작동 안 함
