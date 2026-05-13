# Onword Group Buy — Sprint Plan

> Phase-based execution. **Timeline: as fast as parallel sessions allow** (no fixed days).
> 살아있는 문서. 매 작업 완료 시 체크박스 업데이트.
> 마지막 업데이트: 2026-05-13 (sprint 2 — auth, multi-store, hybrid menu, dashboard-first)

**개발 형태:** Sihoon (1인) + Claude Code 4-6 병렬 세션 (Boris Cherny 패턴 — `AI_DOCS/claude-code-workflow.md`)

---

## 완료됨

- [x] **0.1** 디렉토리 구조 + 핵심 파일 (CLAUDE.md, AI_DOCS, types, orchestrator, UI 스켈레톤)
- [x] **0.2** Agent tool 6개 스켈레톤 + 슈미트 fixture
- [x] **0.3** API route 스켈레톤
- [x] **0.4** 모든 패키지 package.json + tsconfig
- [x] **0.5** Next.js 설정 (layout, tailwind, postcss, globals.css)
- [x] **0.6** ONBOARDING.md
- [x] **0.7** AI_DOCS sprint 2 업데이트 (multi-store, auth, PIPA, 7-feature dashboard, saved flows, image crawl 분리, Step 10)

---

## Phase A — Foundation (prereqs for everything)

순차 작업. 다른 Phase 시작 전에 완료 필수.

- [x] **A.1** Supabase 프로젝트 생성 (서울 region) + 환경변수 (.env.local) — `onword-dev` (ref: scatsfimosbotzbvzklt), Data API ON / Auto-expose OFF / Auto RLS ON
- [x] **A.2** GitHub repo 생성 + `git push -u origin main` — `KSihoon-Eureka/onword-group-buy` (private)
- [x] **A.3** `supabase/migrations/0001_init.sql` 정리 (현재 5 tables만)
- [x] **A.4** `0002_multi_tenant.sql`:
  - stores, store_members 테이블 생성
  - 기존 5 tables에 store_id FK 추가
  - 기본 RLS 활성화 + 4 action 정책 (SELECT/INSERT/UPDATE/DELETE)
  - orders trigger (store_id 자동 복제)
  - GRANT TO authenticated 10 테이블 (Auto-expose OFF 대응)
- [x] **A.5** `0003_new_tables.sql`:
  - saved_flows 테이블 + default flows trigger
  - audit_log 테이블
  - phone_access_log 테이블
- [x] **A.6** `0004_constraints.sql`:
  - phone length check (= 4)
  - phone_consent_at NOT NULL
  - generated_assets supersede 컬럼 추가
  - products.primary_image_url, archived_at 추가
- [x] **A.7** Storage bucket 생성 (`assets`, public, 50MB)
- [x] **A.8** 첫 번째 사장님 user + store + store_members 수동 생성 (SQL) — 판다팜 + Sihoon
- [x] **A.9** RLS cross-store leak 테스트 (다른 store의 user로 접근 → 차단 확인) — User A → Store B 조회 0 rows ✓
- [x] **A.10** pnpm install + Playwright chromium install — type-check은 skeleton 잔재로 실패 (Phase D TDD 재구현 대상, expected)

> **위험 게이트**: A.9 통과 못 하면 Phase B 시작 금지. 멀티 매장 격리 안 되면 launch 불가.

---

## Phase B — Dashboard Skeleton (B.1-B.4 병렬 가능)

- [x] **B.1** `/login` 페이지 + Supabase Auth 클라이언트
  - email + password 폼
  - 에러 메시지 ("이메일 또는 비밀번호가 올바르지 않습니다.")
  - 성공 시 `/` 리다이렉트
- [x] **B.2** Auth 미들웨어 (`apps/dashboard/middleware.ts`)
  - 미인증 사용자 `/login` 리다이렉트
  - 인증된 사용자 → store_members 조회 → active_store 설정
  - 분기 4개 단위 테스트 (decideAuth)
- [x] **B.3** 5-slot 사이드바 + Korean 라벨 (`packages/ui/Sidebar.tsx`)
- [x] **B.4** StoreSwitcher 컴포넌트 (`packages/ui/StoreSwitcher.tsx`)
- [x] **B.5** 각 메뉴의 empty placeholder ("곧 추가됨") — 5개 페이지 (`app/(dashboard)/{page,campaigns,orders,assets,new}/page.tsx`)
- [x] **B.6** 로그아웃 동작 (signOutAction)
- [x] **B.7** 다중 매장 멤버 시 `/select-store` 화면

---

## Phase C — Core Views (C.1-C.4 병렬 가능)

- [ ] **C.1** `ProductRegisterForm.tsx` (`/new` 페이지)
  - 모든 필수 필드 입력
  - "이미지 자동 가져오기" 버튼 (→ `crawl_naver_images` 호출)
  - 6장 이미지 그리드, 선택 / 메인 지정
  - 직접 업로드 fallback (Supabase Storage 직접)
  - Submit → `products` insert → "공구 시작" 옵션 토스트
- [ ] **C.2** `ChatView.tsx` (`/` 페이지, AI 비서)
  - 메시지 input + history
  - Empty state에 SavedFlows 렌더링
  - 새 대화 버튼 (chat 초기화)
- [ ] **C.3** `SavedFlows.tsx` (`packages/ui/`)
  - 그리드 (run_count desc 정렬)
  - 클릭 → input fill (자동 전송 안 함)
  - 새 플로우 저장 버튼 + 모달
  - 편집 / 삭제 메뉴
- [ ] **C.4** `ExecutionTracePanel.tsx` (오른쪽 패널)
  - `AgentStepBlock` 시퀀스
  - Supabase Realtime 구독 (`trace:{traceId}`)
- [ ] **C.5** API route `/api/agent/run` (orchestrator entry)
  - 인증 확인 → store_id 추출
  - agent_traces row 생성
  - tool 호출 루프 (X3: 실패 시 중단)
  - 결과 응답

---

## Phase D — Agent Tools (TDD 강제, D.1-D.10 거의 모두 병렬)

각 tool은 독립. 한 워커가 하나씩.

- [ ] **D.1** `generate_announcement` (Stage 1)
  - Claude API + `AI_DOCS/kakao-text-format.md` §1 템플릿
  - store config (leading_emoji, brand_name) 주입
  - TDD: 슈미트 베개커버 fixture 통과
- [ ] **D.2** `generate_announcement` (Stage 2 마감 임박)
  - 단일 / 다중 상품 지원
  - 형식 §2
- [ ] **D.3** `generate_announcement` (Stage 3 수령 안내)
  - 형식 §3
  - 빈 결과 처리
- [ ] **D.4** `generate_price_emphasis_text` (NEW)
  - 100자 이내
  - 형식 §4
  - naverPrice 미존재 / 역전 시 에러
- [ ] **D.5** `crawl_naver_images` (NEW — multi-image)
  - `AI_DOCS/image-crawl.md` 참조
  - max 6 images, 분류 (product/detail/lifestyle)
  - rate limit + UA rotation
  - Supabase Storage 업로드
- [ ] **D.6** `crawl_naver_price` (분리됨)
  - 가격 데이터 + 스크린샷
  - 같은 rate limit 적용
- [ ] **D.7** `compose_poster`
  - Sharp + Pretendard 폰트
  - 800×950 PNG
  - store.primary_color / accent_color 사용
- [ ] **D.8** `generate_pickup_table`
  - SVG → Sharp 렌더링
  - `AI_DOCS/pickup-table-design.md` 참조
  - 동반 카톡 텍스트도 생성
- [ ] **D.9** `get_orders` + db helpers
  - anomaly detection (rules in `AI_DOCS/anomaly-rules.md` — 추후 작성)
- [ ] **D.10** `notify_wholesaler`
  - Resend API
  - customer_phone 절대 제외 (PIPA)
  - phone_access_log 'export' 기록

---

## Phase E — Dashboard Secondary Views (E.1-E.7 병렬)

- [ ] **E.1** 공구 현황 (`/campaigns` or 기본 view)
  - ProductCard 그리드
  - flow_stage 8-stage progress dots
  - 필터 (active / archived / 전체)
- [ ] **E.2** 상품 상세 (`/p/[id]`)
  - 7-feature action surface
  - 각 액션 status 표시 (asset 존재 여부 + superseded 처리)
  - AI 비서 (상품 컨텍스트 주입)
  - 자산 목록 + 복사 버튼
- [ ] **E.3** 주문 관리 (`/orders`)
  - Empty state placeholder ("주문 데이터가 곧 추가됨")
  - 구조는 미리 준비 (order-web 출시 시 즉시 활성)
- [ ] **E.4** 자산 (`/assets`)
  - 모든 generated_assets 목록 (superseded 제외 default)
  - 타입별 필터, 상품별 그룹
  - 복사 버튼 (텍스트), 다운로드 (이미지)
- [ ] **E.5** AuditLogPanel (`/audit` 또는 ProductDetail 내)
  - 시간 역순
  - 매장 전체 또는 product별
- [ ] **E.6** NotificationCenter (사이드바 🔔)
  - 최근 audit_log 10건
  - 새 주문 (Realtime, 미래 활성)
  - tool 실패 알림
- [ ] **E.7** SummaryCard (AI 비서 default landing)
  - 오늘 마감 N / 신규 주문 N / 수령 가능 N / 마감 임박 N

---

## Phase F — Polish + Deploy

- [ ] **F.1** Cron: `auto-no-show.ts` (매일 00:00)
  - Supabase pg_cron 또는 Vercel Cron
- [ ] **F.2** Cron: `pipa-retention.ts` (매일 00:00)
  - phone 보유기간 만료 자동 NULL
- [ ] **F.3** Privacy policy 페이지 (`/privacy`) — `AI_DOCS/pipa-compliance.md` 기반
- [ ] **F.4** Vercel 프로젝트 2개 (dev + prod) 연결
  - dev → dev Supabase + sandbox API keys
  - prod → prod Supabase + 실서비스 API keys
- [ ] **F.5** Brute-force 방어 (`/login` Cloudflare Turnstile 또는 Supabase rate limit)
- [ ] **F.6** E2E test (Playwright)
  - 로그인 → 상품 등록 → start_campaign → 공고 / 이미지 / 가격 / 포스터 생성
  - 매장 스위처 동작
  - PIPA 동의 미체크 시 폼 차단
- [ ] **F.7** README + 사장님 가이드 (간단한 사용법 1페이지)

---

## Should (시간 남으면 P1 → P0 승격)

- [ ] **S.1** `apps/order-web` 부활 (고객 주문 폼, mobile-first, senior-friendly)
- [ ] **S.2** `apps/lookup-web` (카운터용 주문 조회)
- [ ] **S.3** 모바일 dashboard 최적화
- [ ] **S.4** AI가 자주 쓰는 명령 패턴 학습 → saved_flows 자동 제안
- [ ] **S.5** Sidebar 메뉴 nav `<a href>` → `next/link` `<Link>` 마이그레이션 (UX 개선 — prefetch + client-side navigation. Phase B W2가 `<a>` 사용했음, blocking 아니지만 정통 패턴 아님)

---

## Won't (이번 sprint 제외)

- 카카오 API 자동 전송 (Won't 영구)
- 결제 시스템
- 사장님 셀프 가입 + 이메일 verification
- 2FA
- Magic-link 비밀번호 재설정
- 직원 초대 (한 매장 다중 user)
- 다국어
- 모바일 앱
- Stage 4+ 카톡 템플릿 (배송 지연, 환불 등)

---

## Phase별 의존성

```
A → B → C ↘
         → D → E → F
         ↗
```

A는 모든 것의 prereq. B는 C 시작 가능. D는 C와 병렬 가능 (서로 인터페이스 분리). E는 D 일부 완료 후 (특히 tool들이 있어야 view에서 trigger 가능). F는 마지막.

병렬 워커 배치 예시 (A 완료 후):
- Worker 1: B (사이드바 + auth + 스위처)
- Worker 2: C.1 (상품 등록)
- Worker 3: C.2 + C.3 (ChatView + SavedFlows)
- Worker 4: D.1 (generate_announcement Stage 1)
- Worker 5: D.5 (image crawl)
- Worker 6 (선택): D.7 (poster)

Coordinator (Sihoon + 이 세션): PR 리뷰, AI_DOCS 업데이트, conflict 해결.

---

## 일일 회고

### 매일 종료 시
- [ ] Phase 진행도?
- [ ] AI_DOCS에 추가할 학습?
- [ ] 내일 Track 4-6개 명확한가?
- [ ] 막힌 부분 → 코파운더 확인 필요?

### 에스컬레이션 트리거
- 클라이언트 요구사항 모호 → 즉시 멈춤 + 명시적 질문
- AI_DOCS와 실제 구현 충돌 → 멈춤 + docs 업데이트 후 진행
- Track 하나가 막힘 → 다른 트랙으로 분리하거나 scope 축소
- 외부 API 작동 안 함 → fallback 명시, 사용자에게 표시
- RLS 정책 누락 의심 → 즉시 멈춤, 보안 점검 우선

---

## 참조

| 상황 | 문서 |
|---|---|
| Workflow 단계 구현 | `AI_DOCS/workflow-9-steps.md` |
| 카카오 텍스트 생성 | `AI_DOCS/kakao-text-format.md` |
| 네이버 크롤링 | `AI_DOCS/naver-crawl-strategy.md` |
| 이미지 크롤 (multi) | `AI_DOCS/image-crawl.md` |
| 포스터 합성 | `AI_DOCS/poster-composition.md` |
| 수령 테이블 | `AI_DOCS/pickup-table-design.md` |
| 데이터 모델 | `AI_DOCS/data-model.md` |
| 멀티 매장 + auth + RLS | `AI_DOCS/multi-store.md` |
| 저장된 플로우 | `AI_DOCS/saved-flows.md` |
| PIPA 준수 | `AI_DOCS/pipa-compliance.md` |
| 클라이언트 요구사항 | `AI_DOCS/client-requirements.md` |
| UI 패턴 / 디자인 | `AI_DOCS/dashboard-ui-patterns.md` |
| Claude Code 활용법 | `AI_DOCS/claude-code-workflow.md` |
