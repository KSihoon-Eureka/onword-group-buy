# CLAUDE.md — Onword Group Buy 운영체제

> 이 파일은 매 턴 자동 로드된다. **간결성 우선.** 깊은 규칙은 `methodology.md`, 도메인 정보는 `PRD.md`, 진행 추적은 `PLAN.md`.

---

## §0. 우선순위

다음이 충돌하면 위쪽이 이김:

1. 사용자 명시 지시
2. §1 절대 규칙 (파괴적 git 등)
3. §15 Cascading Change Warning
4. §2 모드 판단
5. 기타

---

## §1. 절대 규칙 — 사용자 명시 승인 없이 금지

- 🚫 파괴적 git (`push --force`, `reset --hard`, `branch -D`, `rebase -i` 비대화형)
- 🚫 훅 우회 (`--no-verify`, `--no-gpg-sign`)
- 🚫 프로덕션 DB 변경, 배포, 환경변수 변경
- 🚫 외부 메시징 (Slack / 이메일 / 카카오 실제 전송)
- 🚫 금융 행위
- 🚫 근본 원인 우회 (테스트 실패 시 테스트 삭제 금지)
- 🚫 범위 외 작업
- 🚫 추측 채움 — PRD에 없으면 사용자에게 묻기

---

## §2. 모드 판단 — 매 작업 시작 시

| 신호어 | 모드 | 우선 참조 |
|---|---|---|
| 기획, 우선순위, 스코프, 클라이언트 요구 | **PM 모드** | §11 PM 시퀀스 |
| 코드, 구현, 빌드, 테스트, tool 추가 | **CODE 모드** | §3-10 코드 규칙 |

응답 첫 줄에 `[PM 모드]` 또는 `[CODE 모드]` 명시.

---

## §3. 작업 흐름 (CODE 모드)

- **설계 → 코드.** plan 먼저, 코드 X
- **컨텍스트 → AI.** 작업 시키기 전에 5요소(§6) 채움
- **작은 단계.** 1 변경, 1 commit
- **추측 금지.** 모르면 묻기. PRD에 없으면 Sihoon에게

---

## §4. TDD 자세

| 영역 | TDD |
|---|---|
| **Agent tools** | **강제** |
| 비즈니스 로직 | 강제 |
| API routes | 권장 |
| UI 컴포넌트 | 선택 (시각 검증 우선) |
| 프로토타입 | 생략 가능 |

Agent tool TDD 강제 이유: tool은 AI가 호출하는 함수. AI가 잘못된 입력 줘도 안전해야 → test가 안전망.

상세 TDD 사이클: `AI_DOCS/task-execution.md` §3.8

---

## §5. 커밋 prefix (`AI_DOCS/sihoon-guide.md` §1.5 상세)

```
[타입]: 설명 (50자 이내)
- 상세 1
- 상세 2
```

| 타입 | 용도 |
|---|---|
| `feat` | 새 기능 |
| `fix` | 버그 |
| `tool` | Agent tool |
| `agent` | Orchestrator / prompt |
| `db` | 스키마 / 마이그레이션 |
| `api` | API 엔드포인트 |
| `ui` | 프런트엔드 |
| `test` | 테스트 |
| `docs` | 문서 (PRD, AI_DOCS, PLAN) |
| `refactor` | 기능 변경 없는 개선 |

**커밋 시점:** 테스트 통과 / 린트 청결 / 논리 단위 완료. 여러 변경 한 commit에 섞지 말 것.

---

## §6. 5-요소 컨텍스트 — AI에게 시키기 전

1. **목표** — 무엇 + 왜 (한 문장)
2. **읽을 파일** — 추측 경로 금지. PRD.md / 파일 경로 명시
3. **따라야 할 패턴** — 기존 어느 파일 본뜰지
4. **제약** — 성능 / 호환성 / 보안 / 스타일
5. **범위 밖** — *비어있으면 안 됨*
6. **완료 기준** — 관찰 가능 성공 (테스트 통과, URL X에서 Y 보임)

상세 + task별 template: `AI_DOCS/task-execution.md` §3

---

## §7. 브랜치 전략 (1인 = 다 에이전트)

```
main (항상 배포 가능)
  ↑
  feat/order-landing       ← 워커 1 (터미널 1)
  feat/tool-announcement   ← 워커 2 (터미널 2)
  feat/tool-naver-crawl    ← 워커 3 (터미널 3)
  feat/dashboard-form      ← 워커 4 (터미널 4)
```

규칙:
- 1 터미널 = 1 worktree = 1 브랜치 = 1 기능
- 다른 worktree의 파일 절대 수정 금지
- 머지 전 `git pull --rebase origin main`
- Reviewer (별도 세션)가 1차 리뷰 → 사람 2차

Worktree 셋업: `AI_DOCS/sihoon-guide.md` §3

---

## §8. 깊은 참조 트리거

### 도메인 정보 — PRD.md (Single Source of Truth)

| 상황 | PRD 섹션 |
|---|---|
| 클라이언트 요구사항 / 결정 | §1, §2 |
| 데이터 모델 | §4 |
| 인증 / 멀티매장 / RLS | §5 |
| PIPA | §6 |
| 워크플로우 11단계 | §7 |
| 카카오톡 텍스트 형식 | §8 |
| UI 디자인 시스템 | §9 |
| Agent Tool 명세 | §10 |
| 네이버 크롤 | §11 |
| 포스터 합성 | §12 |
| 수령일 테이블 | §13 |
| Saved Flows | §14 |
| API / 라우팅 | §15 |
| 환경 변수 | §16 |
| 위험 & 경고 모음 | §17 |
| 용어집 | §18 |

### 방법론 — `AI_DOCS/task-execution.md`

| 상황 | 섹션 |
|---|---|
| Cascading change 경고 | §1 |
| 5요소 컨텍스트 | §2 |
| **Task별 프롬프트 템플릿** | §3 |
| 매 단계 리뷰 | §4 |
| 모델 선택 | §5 |
| TDD strict | §3.8, §8 |

### 깊은 코드 방법론 — `methodology.md` (on-demand)

| 상황 | 섹션 |
|---|---|
| 새 PRD / TRD 작성 | §1, §2 |
| 비자명한 변경 plan | §3 |
| Taste / 품질 판단 | §5 |
| TDD 사이클 헷갈림 | §6 |
| MCP 설정 | §7 |

### Sihoon용 운영 가이드 — `AI_DOCS/sihoon-guide.md`

| 상황 | 섹션 |
|---|---|
| Git 처음 쓰기 | §1 |
| 비밀 / .gitignore | §2 |
| 다중 터미널 / worktree | §3 |
| Context window 관리 | §5 |
| Trouble shooting | §7 |

---

## §9. "완료" 점검표 (`AI_DOCS/task-execution.md` §10 상세)

- [ ] diff가 사전 plan과 일치
- [ ] 범위 밖 변경 없음 (있으면 별도 commit)
- [ ] 테스트 실행 후 통과
- [ ] UI 변경 시 브라우저 확인
- [ ] DB 변경 시 실제 쿼리로 확인
- [ ] 커밋 메시지가 *왜*를 설명
- [ ] 구조적 / 행동적 변경 분리 (Tidy First)
- [ ] PLAN.md 해당 항목 체크
- [ ] §15 cascading change 있었으면 PRD 업데이트

---

## §10. 신뢰 수준 표기

비자명한 주장에 태그 부여:
- `[높음]` 클라이언트 확인 / 공식 문서 / 검증됨
- `[중간]` 합리적 추정, 검증 가능
- `[낮음]` 추측 — 사람 확인 필요
- `[미확인]` 빈 자리 — 멈추고 묻기

---

## §11. PM 시퀀스

1. **WHO & WHY** — 누가 이걸 요청, 왜?
2. **CORE** — 진짜 문제는?
3. **SEQUENCE** — 어떤 순서가 인과적 의미?
4. **EXECUTE** — Plan 후 실행
5. **REVIEW & COMPOUND** — 다음을 더 쉽게 만드는 학습 기록

---

## §12. 모드 전환

**PM → CODE**: 우선순위 명확 + 5슬롯 채울 수 있음
**CODE → PM**: "범위 밖"이 비어있거나 *왜 만드는지* 의문 생김

---

## §13. AI 에이전트 활용 패턴

### 1일 표준 흐름

```
오전 (4h) Builder Mode — 4-6 워커 병렬, 각 다른 worktree
오후 (4h) Architect Mode — PR 리뷰, 통합 테스트, 다음 trk plan
```

### 에이전트 분담
- **Specialist** (도메인별): playwright-specialist, image-composer-specialist, announcement-writer
- **Generalist** (CRUD/UI): 4-6 병렬
- **Reviewer**: PR 1차 리뷰 (별도 세션)

### 1 작업 = 1 세션 = 1 브랜치
한 에이전트가 두 기능 섞지 않는다. 컨텍스트 오염 방지.

상세: `AI_DOCS/sihoon-guide.md` §6

---

## §14. Default Output Style

- 한국어 (Sihoon 모국어). 코드 / 기술 용어는 영어
- 직설적, 군더더기 없이
- 위험 발견 시 즉시 지적
- 응답 첫 줄에 모드 명시 (`[PM 모드]` / `[CODE 모드]`)

---

## §15. Cascading Change Warning (CRITICAL)

> 매번 task 진행 / modification 시, *향후 task에 영향*을 미치면 코드 작성 *전*에 명시적으로 경고. 위반 = 즉시 멈춤.

### 대상 변경 (경고 필수)
- `packages/types/*` (모든 type 변경)
- `supabase/migrations/*` (스키마)
- `PRD.md` 도메인 룰
- Agent tool export 시그니처
- API route shape
- 환경 변수 추가 / 제거
- URL / 라우팅 구조
- `flow_stage` 값
- `stores` 컬럼 (브랜드 설정)
- RLS 정책

### 대상 외 (경고 불필요)
- UI 디테일 (color, padding)
- 내부 변수 / 함수 이름
- 주석 / typo

### 경고 형식

```
⚠️ CASCADING CHANGE — 진행 전 확인 필요
변경 내용: [한 줄 구체적]
영향받는 후속 task:
- [PLAN.md ID]: [어떻게]
- [PLAN.md ID]: [어떻게]
영향받는 기존 코드:
- [파일:라인]: [어떻게]
계속 진행할까요? (예 / 아니오 / 대안 제시)
```

이 경고 없이 위 영역 변경 시 → 즉시 멈춤 + rollback + 다시.

상세: `AI_DOCS/task-execution.md` §1

---

## §16. Session 관리 (Context Window)

- 워커 세션이 컨텍스트 가득 신호 보이면 (질문 반복 / 잊음 / 모순) → `/clear` 또는 새 `claude` 세션
- 새 세션 시작 전 모든 진행상황 PLAN.md / PRD.md / commit / push
- 토큰 70%+ → `/compact` 고려, 80%+ → 즉시 새 세션

상세: `AI_DOCS/sihoon-guide.md` §5

---

## 프로젝트 정보

- **이름:** Onword Group Buy
- **목적:** 한국 오프라인 매장 공동구매 운영 자동화 (AI 에이전틱 대시보드)
- **단계:** 멀티 sprint
- **개발 형태:** Sihoon 1인 + Claude Code 4-6 병렬
- **기술 스택:** Next.js 14 + TS + Supabase + Tailwind + Turborepo
- **AI 모델:** Sonnet 4.6 (워커) / Opus 4.7 (코디네이터, 리뷰)
- **이미지:** 자체 합성 (Sharp) — 생성 AI 안 씀

### 메뉴 구조 (PRD §2.13)
Hybrid: 5-slot 상위 (AI 비서 / 공구 현황 / 주문 관리 / 자산 / 상품 등록) + 7-feature action surface (상품 상세).

### 명령어
```bash
pnpm install                            # 의존성
pnpm dev                                # 모든 앱
pnpm dev --filter=@onword/dashboard     # 대시보드만
pnpm type-check
pnpm test
pnpm test --filter=@onword/agent
pnpm lint
pnpm build
```

### 알아둘 함정

- 카카오 오픈채팅 API 없음 → 텍스트 복사만
- 네이버 크롤링 IP 차단 위험 → Playwright rate limit + UA rotation
- Supabase 무료 500MB → 이미지 저장 Supabase Storage 사용
- Claude API tool_use는 max_tokens 4096 안정적
- 한 세션에서 두 기능 섞지 말 것 (컨텍스트 오염)
