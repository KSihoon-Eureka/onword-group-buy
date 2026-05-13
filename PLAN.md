# 2-Day Sprint Plan

> 살아있는 문서. 매 작업 완료 시 체크박스 업데이트.
> 변경 시 commit + push 필수.

**시작:** 2025-05-13
**종료:** 2025-05-15
**개발 형태:** 파트너 1명 + AI 에이전트 4-6 병렬

**레퍼런스 흡수 효과:**
- 디자인 시스템 (Sidebar/BottomNav/AgentStepBlock) 즉시 완성 → 4-6시간 절약
- 에이전트 loop 패턴 (`sendMessageToAgentStream`) Claude SDK로 포팅 완료 → 2-3시간 절약
- Should 항목 일부를 Must로 승격 가능

---

## Day 0 — 부트스트랩 (3시간, 오늘)

레퍼런스 흡수로 시간 단축됨 (4h → 3h).

- [x] **0.1** 디렉토리 구조 + 핵심 파일 (CLAUDE.md, AI_DOCS, types, orchestrator, UI)
- [ ] **0.2** GitHub repo 생성 (onword-group-buy, private) + push
- [ ] **0.3** pnpm install (Turborepo + 모든 의존성)
- [ ] **0.4** Supabase 프로젝트 생성 + 마이그레이션 적용
- [ ] **0.5** 환경변수 셋업 (.env.local):
  - NEXT_PUBLIC_SUPABASE_URL
  - NEXT_PUBLIC_SUPABASE_ANON_KEY
  - SUPABASE_SERVICE_ROLE_KEY
  - ANTHROPIC_API_KEY
  - RESEND_API_KEY
- [ ] **0.6** packages/db/ Supabase 클라이언트 작성
- [ ] **0.7** apps/dashboard 첫 빌드 통과 확인 (`pnpm dev` 실행)
- [ ] **0.8** 첫 commit + push

---

## Day 1 — Builder Mode (8시간)

### 오전 (4시간) — 4 에이전트 병렬

**Track A (Agent 1):** 상품 주문 웹 — 랜딩 페이지
- [ ] **1A.1** apps/order-web Next.js 셋업
- [ ] **1A.2** ProductCard 컴포넌트 (긴급배너, 가격 강조, 마감일)
- [ ] **1A.3** 상품 목록 페이지 (active 상품만)
- [ ] **1A.4** CountdownTimer 컴포넌트
- 참조: AI_DOCS/dashboard-ui-patterns.md (디자인 토큰)

**Track B (Agent 2):** 상품 주문 웹 — 주문 폼
- [ ] **1B.1** 상품 상세 페이지 ([productId])
- [ ] **1B.2** OrderForm 컴포넌트
- [ ] **1B.3** Supabase insert + 재고 갱신 (trigger 자동)
- [ ] **1B.4** 실시간 참여자 수 표시 (Realtime)

**Track C (Agent 3):** Agent Tool — generate_announcement
- [ ] **1C.1** packages/agent/tools/generate-announcement.ts
- [ ] **1C.2** Claude API 호출 + AI_DOCS/kakao-text-format.md 템플릿 주입
- [ ] **1C.3** TDD: 슈미트 베개커버 예시 통과
- [ ] **1C.4** Stage 1, 3 모두 지원

**Track D (Agent 4):** 대시보드 — NewProductView 폼
- [ ] **1D.1** ProductRegisterForm 컴포넌트
- [ ] **1D.2** 이미지 업로드 (Supabase Storage)
- [ ] **1D.3** Submit → products insert → /api/agent/run(start_campaign)
- [ ] **1D.4** Submit 후 Chat 탭으로 자동 전환

### 오후 (4시간) — 통합 + 추가 Tool

- [ ] **1.E** 4개 트랙 PR 리뷰 + 머지
- [ ] **1.F** 통합 테스트 (상품 등록 → 주문 → 대시보드 표시)

**Track E (Agent 5):** Agent Tool — crawl_naver_price
- [ ] **1E.1** Playwright 설정 + Vercel serverless 호환
- [ ] **1E.2** crawl-naver-price.ts 구현
- [ ] **1E.3** Rate limit + UA rotation
- [ ] **1E.4** Supabase Storage 업로드 (스크린샷)

**Track F (Agent 6):** Agent Tool — get_orders + db helpers
- [ ] **1F.1** get-orders.ts (anomaly detection)
- [ ] **1F.2** packages/db/ Supabase wrapper
- [ ] **1F.3** TDD

---

## Day 2 — Heavy Tools + 통합 + 배포 (8시간)

### 오전 (4시간) — 무거운 Tool 3개

**Track G (Agent 1):** Agent Tool — compose_poster
- [ ] **2G.1** Sharp 셋업 + 한글 폰트 (Pretendard 또는 Noto Sans KR)
- [ ] **2G.2** compose-poster.ts (슈미트 포스터 형식)
- [ ] **2G.3** TDD: fixture 이미지로 800x950 PNG 출력 확인

**Track H (Agent 2):** ChatView + Execution Trace
- [ ] **2H.1** apps/dashboard/components/views/ChatView 완성
- [ ] **2H.2** 메시지 입력 + 히스토리 표시
- [ ] **2H.3** Execution Trace 패널 (AgentStepBlock 시퀀스)
- [ ] **2H.4** Supabase Realtime 구독 (trace_steps)
- [ ] **2H.5** 추천 액션 버튼 4개

**Track I (Agent 3):** Agent Tool — notify_wholesaler + API route
- [ ] **2I.1** Resend 셋업 + 이메일 템플릿
- [ ] **2I.2** notify-wholesaler.ts
- [ ] **2I.3** apps/dashboard/app/api/agent/run/route.ts (orchestrator 호출)
- [ ] **2I.4** SSE 또는 단순 응답 (Realtime이 step 전달)

### 오후 (4시간) — 남은 View + 통합 + 배포

- [ ] **2.J** CampaignsView 완성 (ProductCard 그리드 + flow_stage)
- [ ] **2.K** OrdersView 완성 (검색 + 픽업 처리)
- [ ] **2.L** AssetsView 완성 (자산 목록 + 복사 버튼)
- [ ] **2.M** E2E 테스트:
  - 상품 등록 → start_campaign → 공고/포스터/네이버 자동 생성
  - 주문 들어옴 → close_orders → 누락 검수
  - notify_warehouse → 도매업자 이메일
  - announce_pickup → 수령 안내
- [ ] **2.N** Vercel 배포 (3개 앱 별도 도메인)
- [ ] **2.O** 클라이언트 시연 영상 녹화

---

## Should — Must로 승격 (절약 시간 활용)

레퍼런스 흡수로 절약된 6-9시간을 활용해 다음을 Must로:

- [ ] **S.1** apps/lookup-web — 주문조회 웹 (카운터용)
- [ ] **S.2** generate_pickup_table tool
- [ ] **S.3** 모바일 BottomNav 완성 + 모바일 ChatView UX

---

## Won't (이번 스프린트 제외)

- 카카오 API 자동 전송 (텍스트 복사로 대체)
- 결제 시스템
- 회원가입/로그인
- 다국어
- 다중 매장 (multi-tenant)
- Stage 2 공고 (마감 임박)
- 캘린더 위젯

---

## 일일 회고 체크포인트

### Day 1 종료 시
- [ ] Must P0의 50% 이상 완료?
- [ ] AI_DOCS에 추가할 학습 있나?
- [ ] 내일 4개 Track 명확한가?
- [ ] 막힌 부분 → 클라이언트 확인 필요?

### Day 2 종료 시
- [ ] Must P0 100% 완료?
- [ ] E2E 흐름 끊김 없이 동작?
- [ ] Vercel 배포 완료?
- [ ] 클라이언트가 *지금* 보면 만족할까?

---

## 에스컬레이션 트리거

- 클라이언트 요구사항 모호한 항목 발견 → Jinho에게 즉시
- AI_DOCS와 실제 구현 충돌 → 멈추고 docs 업데이트 후 진행
- Track 하나가 4시간 이상 막힘 → 다른 트랙으로 분리하거나 scope 축소
- 외부 API 작동 안 함 → fallback 명시, 사용자에게 표시
