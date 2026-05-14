# Task Execution Methodology

> 출처: 『클로드 코드 마스터』Chapter 3 (책 pp.144-194) + Kent Beck Augmented Coding 원칙.
> 이 문서는 **모든 task 진행 시 적용**된다. CLAUDE.md와 함께 매 task 시작 전 확인.
> Sihoon이 task를 시킬 때 프롬프트 작성하는 시간을 아끼기 위해 task별 프롬프트 템플릿을 제공.

---

## §0. 5가지 핵심 원칙 (요약)

1. **설계가 코드보다 먼저** — 추측으로 코드부터 쓰지 않는다 (PDF §3.1)
2. **작은 단위로 쪼개기** — 한 번에 한 가지 책임 (PDF §3.2)
3. **명확한 지시** — 5-element context (목표/맥락/제약/완료/예시) (PDF §3.3)
4. **매 단계 리뷰** — 작은 작업 = 작은 리뷰. 누적 오류 방지 (PDF §3.4)
5. **TDD 강제** — Red → Green → Refactor 사이클 (PDF §3.6)

---

## §1. Cascading Change Warning (가장 중요)

> **이 규칙은 모든 task 위에 우선한다. CLAUDE.md §15에도 명시.**

### 1.1 언제 경고하나

다음 변경 시 *반드시* 사용자에게 경고하고 진행 전 승인 받기:

| 변경 영역 | 영향받는 후속 task |
|---|---|
| `packages/types/index.ts` | 모든 entity 사용 코드, tool I/O 시그니처 |
| `supabase/migrations/*.sql` | RLS, tool 쿼리, API route, UI 표시 |
| `PRD.md` 도메인 룰 | 해당 룰 의존 모든 task |
| Agent tool 시그니처 (`packages/agent/tools/*.ts` export) | orchestrator, API route, UI 호출 |
| API route shape (`apps/dashboard/app/api/**`) | 프론트엔드 호출 코드 |
| 환경변수 추가 / 제거 | 배포 설정, 모든 환경 |
| URL 구조 / 라우팅 변경 | 북마크, 기존 링크, 미들웨어 |
| `flow_stage` 값 변경 | ProductCard, ProductDetail, automations |
| `stores` 테이블 컬럼 변경 | 브랜드 설정 의존 모든 자산 (포스터, 공고) |
| RLS 정책 변경 | 보안 직결 — 즉시 경고 |

### 1.2 경고 형식

코드 작성 *전*에 반드시 출력:

```
⚠️ CASCADING CHANGE — 진행 전 확인 필요
변경 내용: [한 줄, 구체적으로]
영향받는 후속 task:
- [PLAN.md ID]: [어떻게 영향받나]
- [PLAN.md ID]: [어떻게 영향받나]
영향받는 기존 코드:
- [파일 경로:라인]: [어떻게 영향받나]
계속 진행할까요? (예 / 아니오 / 대안 제시)
```

### 1.3 경고 불필요

다음은 경고 없이 진행 OK:
- UI 디테일 (color, padding, font size 등)
- 코드 내부 변수명 변경 (export 안 하는 경우)
- 주석, 문서 typo 수정
- 새 파일 추가 (기존 파일 영향 없음)
- 테스트 추가
- 새 lint rule

### 1.4 위반 = 즉시 멈춤

이 규칙 어기고 cascading change 진행하면:
1. 사용자가 즉시 멈춤
2. 변경 rollback (git reset 또는 revert)
3. 영향 분석 후 다시 시작

---

## §2. 5-Element Context Structure

> AI에게 task를 시킬 때 항상 이 5요소를 채운다. 비어있으면 추측 채움 위험.

| 요소 | 질문 | 역할 |
|---|---|---|
| **목표 (What)** | 무엇을 달성? | 작업 방향 설정 |
| **맥락 (Context)** | 현재 상황 / 배경? | AI가 올바른 가정 |
| **제약 (Constraints)** | 지켜야 할 규칙? | 일탈 방지 |
| **완료 조건 (Done Criteria)** | 성공을 어떻게 판단? | 명확한 종료 지점 |
| **예시 (Examples)** | 결과의 구체적 모습? | 모호함 제거 |

### 2.1 완료 조건은 검증 가능해야 함

| 나쁜 조건 | 좋은 조건 |
|---|---|
| 빠르게 동작 | API 응답 300ms 이내 |
| 에러 처리 잘 되어야 | 에러 시 재시도 3회 후 메시지 표시 |
| 코드가 깔끔 | 함수당 30줄 이내, 중복 없음 |
| 테스트 필요 | 정상/실패/경계 케이스 각 1개 이상 |
| 잘 동작해야 | 명세의 모든 시나리오 통과 |

### 2.2 적정 작업 크기

- **단일 책임**: 1 요청 = 1 책임. "그리고", "또한", "추가로" 들어가면 쪼개기 신호
- **테스트 가능**: "이 기능 동작하는가?" 예/아니오 단위
- **10분 내 검증 가능**: 출력 받고 코드 보고 테스트 돌리는데 10분 넘으면 더 쪼개기
- **파일 / 기능 경계 존중**: 같은 도메인이라도 다른 책임이면 분리

---

## §3. Task별 프롬프트 템플릿

> Sihoon이 매번 작성하는 시간을 아끼기 위해 task 유형별 템플릿 제공.
> 사용법: 템플릿 복사 → `{...}` 채우기 → Claude Code 세션에 붙여넣기.

### 3.1 Template: 새 Agent Tool 구현 (TDD)

```
[목표]
PRD.md §10.{N} 명세에 따라 `{tool_name}` Agent tool을 TDD로 구현해줘.

[맥락]
- packages/agent/tools/{tool-name}.ts (구현)
- packages/agent/tools/__tests__/{tool-name}.test.ts (테스트, TDD)
- 의존: packages/types/index.ts (시그니처), packages/db (DB)
- 기존 패턴: packages/agent/tools/generate-announcement.ts (있으면 본떠)

[제약]
- TDD 강제: 먼저 실패하는 테스트 작성 → 최소 구현 → 리팩터
- 구현 본문 작성 전에 npm test로 실패 확인 (Red 단계 검증)
- 외부 API 호출은 mock (실제 호출은 e2e 폴더만)
- packages/types/ 수정 금지 (필요 시 cascading change 경고 후 별도)
- TypeScript strict 모드 통과
- store_id 명시 필터링 (RLS 우회 service role 사용 시)
- 추측 금지. PRD에 답 없으면 멈추고 물어봐

[완료 조건]
- `pnpm test --filter=@onword/agent -- {tool-name}` 통과
- TypeScript 컴파일 에러 없음
- 정상 / 실패 / 경계 케이스 각 1개 이상
- 입출력 타입이 PRD.md §10.{N}과 일치
- AI_DOCS fixture(있으면)로 정확 출력 확인

[예시]
PRD.md §10.{N} 의 input / output 시그니처:
{paste input/output interface from PRD.md}

성공 출력 예시:
{paste expected output from PRD.md or fixtures}
```

**예시 (실제 사용):**

```
[목표]
PRD.md §10.1 명세에 따라 `generate_announcement` Agent tool을 TDD로 구현해줘.

[맥락]
- packages/agent/tools/generate-announcement.ts (구현)
- packages/agent/tools/__tests__/generate-announcement.test.ts (테스트)
- 의존: packages/types/index.ts (GenerateAnnouncementInput/Output)
- 슈미트 베개커버 fixture: packages/agent/__fixtures__/schmidt-pillow.json
- 카카오 텍스트 표준: PRD.md §8.1 (Stage 1) / §8.2 (Stage 2) / §8.3 (Stage 3)

[제약]
- TDD: 실패 테스트 먼저 → 최소 구현 → 리팩터
- Stage 1/2/3 모두 지원 (한 tool, stage 파라미터로 분기)
- Stage 3 빈 결과 → throw "표시할 상품 없음"
- Claude API 429 → exponential backoff 2회 재시도
- packages/types/ 수정 금지
- store config (leading_emoji, brand_name) DB 조회 필수

[완료 조건]
- `pnpm test --filter=@onword/agent -- generate-announcement` 통과
- 슈미트 fixture로 Stage 1 출력이 PRD §8.1 예시와 일치
- TypeScript strict 통과
- 정상/실패/경계 케이스 각 1+

[예시]
GenerateAnnouncementInput:
{ productId: "abc", stage: 1 }

기대 출력 (요약):
{
  content: "🐼 판다팜 & 산타 오늘의상품 8,900원\n🎁 슈미트...",
  assetId: "uuid"
}
```

### 3.2 Template: UI 컴포넌트 구현

```
[목표]
PRD.md §9.5 / §9.{N}의 `{ComponentName}` 컴포넌트를 구현해줘.

[맥락]
- 위치: {path/to/Component.tsx}
- 디자인 토큰: PRD.md §9.2
- 한국어 라벨: PRD.md §9.4
- 의존: packages/ui/cn (clsx + tailwind-merge)
- 기존 패턴: {기존 컴포넌트 경로}
- Next.js 라우팅 패턴: route group `(name)` 채택 여부 + layout.tsx 위치 명시 (예: `app/(dashboard)/layout.tsx`)
- Dumb / Smart 분리: {이 컴포넌트는 dumb(props만) or smart(fetch + actions)? — Phase B 검증 패턴}

[제약]
- Tailwind 클래스만 (인라인 style 금지)
- "use client" 필요한 경우만 명시
- props는 packages/types/index.ts에 정의된 entity 타입 사용
- 모바일/데스크탑 분기: PRD §9.7
- 시니어 친화 X (대시보드, A9)
- 라벨 한국어 (영문은 기술 식별자만)
- 라우팅 nav (메뉴 / 링크) — `<a>` 대신 `next/link`의 `<Link>` 사용 (prefetch + client-side navigation)
- Dumb 컴포넌트 (packages/ui)인 경우: internal에서 supabase 호출 / fetch / server action import 금지. 모든 데이터 props로만 받음.

[완료 조건]
- 컴파일 에러 없음
- 시각 검증: localhost:3000에서 의도대로 보임 (스크린샷 첨부 시)
- 디자인 토큰만 사용 (custom hex 금지)
- 접근성: aria-label / role 적절

[예시]
PRD.md §9.{N} 의 시각 mockup (있으면):
{paste ASCII mockup or describe}
```

### 3.3 Template: API Route 구현

```
[목표]
{HTTP method} {route path} API route를 구현해줘. PRD.md §15.1 명세.

[맥락]
- 위치: apps/dashboard/app/api/{path}/route.ts
- 인증: Supabase Auth 세션 확인 → store_id 추출
- DB: @onword/db Supabase 클라이언트
- 입출력: packages/types/index.ts에 정의된 타입
- 기존 패턴: {기존 route}

[제약]
- 세션 미확인 시 401
- store 멤버 아닌 경우 403 (RLS가 막지만 명시적 체크)
- input validation (zod 또는 수동) 필수
- 에러 응답: { error: string } 형식
- service role 사용 시 store_id 코드 레벨 필터링 (RLS 우회 주의)

[완료 조건]
- 정상 case 200
- 미인증 401
- 권한 없음 403
- 잘못된 input 400
- 단위 테스트 (정상/에러 4가지)

[예시]
요청: POST /api/products
Body: { name: "...", price: 8900, ... }
응답 200: { id: "uuid", ... }
응답 401: { error: "unauthenticated" }
```

### 3.4 Template: DB 마이그레이션

```
[목표]
{설명} 마이그레이션 작성. PRD.md §4.{N} 스키마 따라.

[맥락]
- 위치: supabase/migrations/{NNNN}_{name}.sql
- 기존 마이그레이션: §4.12 순서
- RLS: PRD.md §4.13 표준 패턴

[제약]
- idempotent (재실행 안전, IF NOT EXISTS / IF EXISTS 사용)
- store_id FK 모든 도메인 테이블
- RLS enable + 4개 정책 (SELECT/INSERT/UPDATE/DELETE)
- DELETE 정책은 USING (false) — archive만 허용
- 트리거 / 함수 SECURITY DEFINER 사용 (RLS 우회 필요시)
- ⚠️ CASCADING CHANGE: 이 마이그레이션은 후속 모든 task에 영향 — 적용 전 사용자 승인 필수

[완료 조건]
- Supabase SQL Editor에서 실행 성공
- 검증 쿼리 통과 (예: count, RLS 정책 확인)
- 다른 store user로 cross-store 접근 차단 검증

[예시]
검증 쿼리:
SELECT count(*) FROM {table}; -- 0
SELECT * FROM pg_policies WHERE tablename = '{table}'; -- 4개 행
```

### 3.5 Template: 버그 수정

```
[목표]
{버그 한 줄 설명} 수정.

[맥락]
- 재현: {재현 단계}
- 현재 동작: {잘못된 결과}
- 기대 동작: {올바른 결과}
- 관련 파일: {파일 경로}
- 관련 PRD 섹션: PRD.md §{N}

[제약]
- 우선 실패하는 테스트 작성 (regression test)
- 근본 원인 파악 후 수정 (증상 회피 금지)
- 다른 기능 영향 없는지 확인
- 테스트 삭제 / skip 금지

[완료 조건]
- 작성한 테스트 통과
- 기존 테스트 모두 통과
- 재현 단계 수동 검증 통과
- 근본 원인 commit 메시지 / 주석에 명시

[예시]
재현 입력: {...}
현재 출력: {...}
기대 출력: {...}
```

### 3.6 Template: 리팩터

```
[목표]
{리팩터 범위}를 PRD.md §{N} 기준으로 정리.

[맥락]
- 현재 코드: {파일}
- 리팩터 이유: {왜}
- 기존 테스트: 통과 중

[제약]
- ⚠️ Tidy First: 구조적 변경과 행동적 변경 절대 같은 commit에 섞지 마
- 한 번에 하나의 리팩터 변경
- 각 변경 후 테스트 실행 → 통과 확인
- 새 기능 추가 금지 (별도 task)
- API 시그니처 변경 = cascading change 경고

[완료 조건]
- 모든 기존 테스트 통과
- TypeScript 에러 없음
- 가독성 / 중복 / 의존성 측면에서 개선 확인

[예시]
Before / After 비교:
{paste before & after if helpful}
```

### 3.7 Template: 테스트 추가

```
[목표]
{대상} 테스트 추가.

[맥락]
- 대상 파일: {file.ts}
- 테스트 파일: {file.test.ts}
- 기존 테스트 패턴: {다른 .test.ts}

[제약]
- 행위 테스트 (구현 세부 의존 X)
- 정상 + 실패 + 경계 케이스 각 1개+
- 독립적 (다른 테스트 실행 순서 무관)
- 반복 가능 (언제 실행해도 같은 결과)
- 외부 API mock (실제 호출 e2e 폴더만)

[완료 조건]
- 커버리지 추가
- 모든 테스트 통과
- 실패 시 명확한 에러 메시지

[예시]
정상 케이스: {input → output}
실패 케이스: {input → throw}
경계 케이스: {edge input → handling}
```

### 3.8 Template: TDD Strict (PDF §3.6)

```
1단계 (Red): {기능} 함수에 대한 실패하는 테스트를 먼저 작성해줘.
   구현은 하지 마. 테스트만.
   완료 조건:
   - 테스트 파일 생성 / 수정
   - npm test 실행 → 의도한 이유로 실패 확인

2단계 (Green): 방금 작성한 테스트를 통과시키는 최소한의 코드를 작성해줘.
   추가 기능 넣지 마. "미래를 위한" 코드 금지.
   완료 조건:
   - 구현 코드 작성
   - 모든 테스트 통과 확인

3단계 (Refactor): 테스트 통과 유지하면서 코드 리팩터링.
   새 기능 추가 금지. 테스트 수정 금지.
   완료 조건:
   - 리팩터 전 / 후 코드 차이
   - 전체 테스트 통과 확인
```

### 3.9 Template: 다중 워커 코디네이션 (병렬 worktree)

> Phase B 검증 (2026-05-13, 3 워커 / 4-13분 / 충돌 1건). 2개 이상 워커가 인터페이스 의존 시 필수.

```
[목표]
{Phase ID}의 task를 {N}개 워커로 병렬 분담. 각 워커는 자기 worktree에서만 작업.

[분담]
- W1 ({담당 영역}): {PLAN.md ID 목록}
- W2 ({담당 영역}): {PLAN.md ID 목록}
- W{N}: ...

[계약 — 변경 금지]
워커간 호출 관계 있는 컴포넌트 / 함수 / API의 시그니처를 *명시적*으로 박는다.
양쪽 prompt에 동일 시그니처 paste. 한 워커가 임의 변경 = 즉시 멈춤.

예 (Phase B W1 ↔ W2 Sidebar):
  interface SidebarProps {
    currentStore: Store
    availableStores: Store[]
    userEmail: string
    activePath: string
    onSwitchStore: (storeId: string) => void | Promise<void>
    onLogout: () => void | Promise<void>
  }

[Placeholder 패턴 — staggered merge]
의존 컴포넌트 미머지 상태에서 워커가 완료 가능하도록 *동일 시그니처 임시 placeholder*를 mount.
머지 시 import 1줄 교체로 활성화. CI gate 없이도 main 빌드 깨짐 0.

예: W1이 SidebarPlaceholder를 6 props 시그니처 동일하게 작성 → main 머지 가능 → W2 머지 후 layout.tsx 의 import 1줄 교체로 활성.

[Dumb / Smart 분리]
- Dumb (packages/ui 등): supabase 호출 / fetch / server action import 0, props만 받음
- Smart (apps/dashboard layout, page): 데이터 fetch + server actions + dumb 컴포넌트 wiring
- 각 워커 prompt에 "이 워커는 dumb / smart 중 무엇" 명시

[PLAN.md update 규칙 — 충돌 회피]
- 워커는 *자기 항목만* 체크 ([x])
- PR 직전 *별도 commit*으로 PLAN.md update (다른 변경과 분리)
- 부가 설명 줄 신규 추가는 신중 — 인접 라인 hunk 확장으로 다른 워커 PR과 squash 충돌 가능
- 충돌 발생 시: GitHub web "Resolve conflicts" 직접 편집 (Accept current/incoming/both는 부적합)

[Contract 사전 검증 (코디네이터 책임 — prompt 작성 *전*)]
prompt에 사용된 *모든 식별자*가 codebase에 존재하는지 확인:
- enum 값 (ActionName, ToolName, FlowStage, AssetType, StoreMemberRole 등) → packages/types/index.ts 존재 grep 확인
- props 시그니처 → 기존 dumb 컴포넌트 export와 일치 (또는 신규 시 양쪽 prompt에 동일 paste)
- API route shape → PRD §15.1과 일치
- task / tool 카운트 → PRD §10 (tool 이름 수) vs PLAN.md (task ID 수) 구별

모순 발견 시:
- 옵션 A (cascading 정식): 사용자 명시 승인 → packages/types / PRD 수정 → 그 후 prompt 발행
- 옵션 B (prompt 변경): 해당 식별자를 codebase 기존 것으로 대체 또는 prompt에서 제거

*절대 금지*: 모순 무시하고 prompt 발행 — 워커가 모순 발견 시 자기 판단으로 처리해서 contract 깨짐.

[Worker contract validation (워커 책임 — paste 받은 직후)]
워커가 prompt 받은 *첫 작업*으로 contract 검증:
- prompt의 모든 식별자 (enum/props/API/카운트)가 codebase와 일치하는가?
- 모순 발견 시 *즉시 멈춤 + 보고*. 다음 형식:
  ⚠️ CONTRACT MISMATCH
   prompt: "<인용>"
   codebase (<path>:<line>): "<다른 값>"
   결정 필요: 어느 쪽 우선?
- 사용자/코디네이터 결정 후 진행. *절대 자기 판단 X* (보수적 거절 또는 prompt 무시 모두 금지)

[Contract discrepancy in PR (워커 책임 — PR 생성 시)]
구현 도중 contract 모순 발견했지만 작업 진행해야 했을 때 (위 validation 단계 놓침):
- PR description에 명시적 "## Contract Discrepancy (확인 필요)" 섹션 추가
- 모순 항목 + 워커 임시 처리 + 결정 필요 사항 명시
- 코디네이터가 머지 *전* 결정

[완료 조건 — 모든 워커 공통]
- PR description에 [범위 밖] 항목 명시 (다음 워커 / 코디네이터가 참조)
- Contract Discrepancy 있으면 PR body 명시 (위 §3.9 패턴)
- TypeScript strict 통과, lint 통과
- 자기 worktree 외 파일 0건 수정
- 의존 컴포넌트 미머지 상태에서도 placeholder로 빌드 통과
- PR 생성 후 워커 세션 idle 유지 (코디네이터 ping에 응답 가능)
```

검증:
- Phase B (2026-05-13): W1 (auth backbone) / W2 (dumb Sidebar) / W3 (5 empty pages) 분담. 머지 충돌 1건 (PLAN.md 인접 라인 — `feedback_plan_md_squash_conflict.md` 참조).
- Phase C (2026-05-13): W4 (Product 등록) / W5 (ChatView + SavedFlows) / W6 (Agent API) 분담. Contract discrepancy 1건 (free_text — `feedback_contract_validation.md` 참조). L3 (워커 PR body 명시) 작동 → 머지 전 발견. L1/L2 미작동 → §3.9 보강.

---

## §4. 매 단계 리뷰

### 4.1 무엇을 리뷰하나

**요구사항 충족 여부:**
- 요청한 기능 모두 포함?
- 요청 안 한 기능 추가됨? (YAGNI 위반)
- 엣지 케이스 처리?
- 입출력 형식 예상과 일치?

**코드 품질:**
- 가독성 (변수명, 함수명 명확?)
- 일관성 (기존 코드 컨벤션 따름?)
- 효율성 (불필요한 연산? 더 나은 알고리즘?)
- 안전성 (입력 검증, 에러 처리, SQL 인젝션, XSS)

**의도치 않은 변경:**
- 요청하지 않은 파일 수정?
- 기존 테스트 삭제 / skip?
- 설정 파일 / 환경 변수 변경?
- 의존성 추가 / 삭제?
- 기존 함수 시그니처 변경?

### 4.2 리뷰 워크플로우

```
1. 작은 작업 요청 (5요소 + cascading 체크)
   ↓
2. AI 결과 수령
   ↓
3. 코드 리뷰 (이해 + 검증)
   ↓
4. 테스트 실행
   ↓
4a. 문제 발견 → 수정 요청 또는 되돌리기
4b. 통과 → 작은 단위 커밋
   ↓
5. 다음 작업 있나? → 1로
```

핵심: **3과 4를 건너뛰지 말 것.** 문제 발견 시 살리려 하지 말고 과감하게 되돌리기.

### 4.3 슬래시 명령 활용

| 명령 | 시점 |
|---|---|
| `/review` | 커밋 / PR 전 |
| `/simplify` | 기능 구현 / 버그 수정 후 |
| `/security-review` | 보안 민감 코드 PR 전 |
| `/tdd-red` | TDD 1단계 |
| `/tdd-green` | TDD 2단계 |
| `/tdd-refactor` | TDD 3단계 |

---

## §5. 모델 선택 가이드

| 작업 유형 | 모델 | 이유 |
|---|---|---|
| CRUD, UI 컴포넌트 | Sonnet 4.6 | 충분 + 저렴 |
| Agent tool 설계 | Opus 4.7 | TDD 시그니처 판단 |
| PR 리뷰 | Opus 4.7 | 깊은 판단 |
| AI_DOCS / PRD 작성 | Opus 4.7 | 일관성 + 도메인 모델 |
| 마이그레이션 SQL | Opus 4.7 | 실수 비용 큼 |
| Playwright 크롤링 | Sonnet 4.6 | 패턴 매칭 빠름 |
| 디버깅 (모호한 버그) | Opus 4.7 | 추론 능력 |
| 디버깅 (명확한 버그) | Sonnet 4.6 | 빠름 |

`/model` 명령으로 세션 중 전환.

---

## §6. AI가 궤도 이탈 신호 (Kent Beck)

다음 신호 보이면 즉시 멈춤 + 재plan:

| 신호 | 의미 | 대응 |
|---|---|---|
| **루프** | 비슷한 작업 반복, 진전 없음 | 작업 더 쪼개기, 또는 세션 재시작 |
| **요청 안 한 기능 추가** | scope creep | "이거 요청 안 했어. 원래 작업만 해" |
| **치팅** | 테스트를 skip / 삭제 | 즉시 멈춤 + 테스트 원복 + 다시 |

CLAUDE.md / Hook 으로 명시적 금지.

---

## §7. Make it work, Make it right, Make it fast (Kent Beck)

1. **Make it work** — 일단 동작 (작은 범위)
2. **Make it right** — 제대로 정리 (리팩터)
3. **Make it fast** — 필요 시 최적화

처음부터 fast 추구하지 말 것. 동작 확인 → 정리 → 측정 후 최적화.

---

## §8. AI 출력 비결정성과 TDD

AI는 비결정적 (같은 입력 → 다른 출력 가능). TDD가 안전망:

- 같은 테스트 통과해도 AI 출력 매번 다름 → 행위만 같으면 OK
- 테스트 코드는 변하지 않음 → 회귀 탐지 가능
- AI가 통과 못 하면 즉시 알 수 있음

`.claude/settings.json` hook으로 자동 테스트:
```json
{
  "hooks": {
    "PostToolUse": [{
      "matcher": "Edit:*.ts|Edit:*.tsx|Write:*.ts|Write:*.tsx",
      "hooks": [{ 
        "type": "command", 
        "command": "npm test -- --findRelatedTests $CLAUDE_FILE_PATH --passWithNoTests",
        "timeout": 60 
      }]
    }]
  }
}
```

---

## §9. 회귀 방지

[높음] AI 코드는 인간 코드보다 1.4-1.7배 많은 심각한 문제 (2025 CodeRabbit 연구).

회귀 패턴:
- 기존 코드 무시하고 새로 작성
- 관련 없는 파일 수정
- 테스트 삭제 / 비활성화

방지:
1. 변경 전후 테스트 실행 습관
2. CI/CD 파이프라인
3. 테스트 커버리지 모니터링
4. 회귀 테스트 스위트 (핵심 기능)
5. Pre-commit hook으로 테스트 강제

---

## §10. 작업 종료 체크리스트

각 task 완료 시 점검:

- [ ] diff가 사전 계획과 일치
- [ ] 범위 밖 변경 없음 (있으면 별도 commit)
- [ ] 테스트 실행 후 통과
- [ ] UI 변경 시 브라우저 시각 확인
- [ ] DB 변경 시 실제 쿼리로 확인
- [ ] 커밋 메시지가 *왜*를 설명
- [ ] 구조적/행동적 변경 분리 (Tidy First)
- [ ] PLAN.md 해당 항목 체크
- [ ] cascading change 있었으면 PRD / docs 업데이트
- [ ] [높음] 신뢰도 태그 부여 가능한지

---

## §11. 핵심 슬래시 명령 (이 프로젝트 specific)

`.claude/commands/` 폴더 참조.

| 명령 | 언제 |
|---|---|
| `/new-feature [phase.id]` | PLAN.md 항목 시작 |
| `/add-tool [name]` | Agent tool 추가 / 수정 |
| `/review [branch]` | PR 리뷰 |
| `/commit-push` | 작업 마무리 |
| `/update-docs` | 학습 / 결정 영속화 |

---

**끝. 이 방법론에서 벗어나면 즉시 자기 점검 + Sihoon 보고.**
