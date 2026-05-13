# ONBOARDING.md — 새 Claude Code 세션 진입 가이드

> 새 세션이 이 repo에서 처음 작업할 때 이 파일을 먼저 본다.
> Sihoon이 첫 세션에서 이 파일을 보여주면, Claude는 절차를 *순서대로* 따라 진행.
> 추측 금지. 막히면 Sihoon에게 묻기. CLAUDE.md §1 적용.

---

## Phase 1 — 컨텍스트 흡수 (필수)

### 1.1 읽을 파일 (이 순서대로)

```
1. CLAUDE.md                        ← 운영 규칙 (자동 로드이지만 확인)
2. PRD.md                           ← 모든 도메인 정보 (single source of truth)
3. PLAN.md                          ← 진행 추적
4. AI_DOCS/task-execution.md        ← 프롬프트 템플릿 + cascading 규칙
5. packages/types/index.ts          ← 타입 정의 (PRD §4와 1:1)
```

워커 (단일 task)인 경우 4-5는 task에 필요하면.

### 1.2 읽지 *말아야* 할 것 (Phase 1에서)
- 구체적 tool 구현 (`packages/agent/tools/*.ts`) — Phase 2 작업 시
- view 스켈레톤 — 구현 시
- `methodology.md` 전체 — CLAUDE.md §8 트리거 표에 *언제* 읽을지 명시
- `AI_DOCS/sihoon-guide.md` — Sihoon 본인용, 워커 안 읽음

읽은 파일에 *답이 있는 질문*을 다시 묻는 건 시간 낭비. 항상 *읽고 → 요약 → 행동*.

### 1.3 흡수 완료 보고

```
[흡수 완료]
- 11단계 워크플로우 (PRD §7) 이해
- Tool 10개 역할 (PRD §10) 명확
- 현재 Phase / Task 파악 (PLAN.md)
- 막히는 부분: [있으면 명시, 없으면 "없음"]

다음 진행:
  옵션 A: 환경 셋업 (Supabase / pnpm install)
  옵션 B: 특정 Task 시작 (어떤 거?)
  옵션 C: 도메인 질문
```

---

## Phase 2 — Task 작업

Sihoon이 5요소 prompt (`AI_DOCS/task-execution.md` §3 template) 던지면 거기 따름.

### Cascading Change 경고

CLAUDE.md §15. 다음 영역 변경 시 *반드시* 사전 경고:
- `packages/types/*`
- `supabase/migrations/*`
- `PRD.md` 도메인 룰
- Agent tool 시그니처
- API route shape
- 환경 변수
- URL / 라우팅
- `flow_stage` 값
- `stores` 컬럼
- RLS 정책

---

## Phase 3 — 작업 종료

- [ ] 테스트 통과 확인
- [ ] PLAN.md 체크박스 업데이트
- [ ] commit + push
- [ ] PR 생성 (`gh pr create --fill`)

---

## 막힘 시 분기

### 도메인 모호함
- 1차: `PRD.md` 다시 읽기 (해당 섹션)
- 2차: Sihoon에게 *구체적* 질문 (모호한 "어떡하지?" X)

### 기술 모호함
- 1차: `methodology.md` 트리거 표 (CLAUDE.md §8)
- 2차: 라이브러리 공식 문서 (Anthropic SDK / Supabase / Sharp / Playwright)
- 3차: Sihoon에게 묻기

### 외부 API 실패
- 네이버 크롤링 실패: PRD §11
- Claude API 429: 재시도 + jitter
- Supabase 연결: 환경 변수 확인

### 시간 초과
- 한 Task가 4시간+ 막힘 → 즉시 멈추고 Sihoon 보고
- Scope 축소 또는 다음 sprint 이월

---

## 절대 규칙 (CLAUDE.md §1 요약)

- 🚫 main 직접 push (PR 통해)
- 🚫 테스트 없이 머지 (Agent tool은 TDD 강제)
- 🚫 PRD 안 읽고 추측
- 🚫 `--no-verify`, `--force`
- 🚫 한 브랜치 여러 기능
- 🚫 외부 메시징 실제 전송
- 🚫 프로덕션 데이터 변경
- 🚫 시크릿 공유

---

## 첫 메시지 — Sihoon에게

흡수 완료 후 한국어로 보고:

```
안녕하세요. Onword Group Buy 컨텍스트 흡수 완료했습니다.

준비:
- 11단계 워크플로우 + Tool 10개 이해 (PRD §7, §10)
- 현재 Phase / Task: [PLAN.md에서 확인한 항목]
- Cascading change 경고 규칙 (CLAUDE.md §15) 활성

당장 가능:
1. [PLAN.md 다음 task] 시작
2. 환경 셋업 / 검증
3. 도메인 질문

어느 것부터?
```

---

## 부록 — 슬래시 명령 빠른 참조

| 명령 | 언제 |
|---|---|
| `/new-feature [번호]` | PLAN.md 항목 시작 |
| `/add-tool [이름]` | Agent tool 추가 / 수정 |
| `/review [브랜치]` | PR 리뷰 |
| `/commit-push` | 작업 마무리 |
| `/update-docs` | 학습 / 결정 영속화 |
| `/tdd-red`, `/tdd-green`, `/tdd-refactor` | TDD 사이클 |

상세: `.claude/commands/*.md`

---

**끝.**
