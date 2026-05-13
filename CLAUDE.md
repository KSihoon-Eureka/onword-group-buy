# CLAUDE.md — Onword Group Buy 운영체제

> 이 파일은 매 턴 자동 로드된다.
> 깊은 코드 방법론은 `methodology.md`, 깊은 PM 사고는 `~/onword-agent/core/pm-os.md`.
> 도메인 지식은 `AI_DOCS/`에 있으며 **작업 시작 전 반드시 Read**.

---

## 0. 모드 판단 — 매 작업 시작 시

| 신호어 | 모드 | 우선 적용 |
|---|---|---|
| 기획, 우선순위, 스코프, 클라이언트 요구 | **PM 모드** | §11 PM 시퀀스 |
| 코드, 구현, 빌드, 테스트, tool 추가 | **CODE 모드** | §1-10 코드 규칙 |

응답 첫 줄에 `[PM 모드]` 또는 `[CODE 모드]` 명시.

---

## 1. 작업 흐름의 한 줄 규칙 (CODE 모드)

- **설계 → 코드.** plan을 먼저 쓴다. 코드부터 쓰지 않는다.
- **컨텍스트 → AI.** 작업 시키기 전에 6슬롯을 채운다.
- **작은 단계.** 한 번에 하나의 변경, 하나의 커밋.
- **추측 금지.** 모르면 묻는다. AI_DOCS에 답이 없으면 사람에게.

---

## 2. 절대 규칙 — 사용자 명시 승인 없이 금지

- 🚫 파괴적 git (`push --force`, `reset --hard`, `branch -D`)
- 🚫 훅 우회 (`--no-verify`)
- 🚫 프로덕션 DB 변경, 배포, 환경변수 변경
- 🚫 외부 메시징 (Slack/이메일/카카오 실제 전송)
- 🚫 금융 행위
- 🚫 근본 원인 우회 (테스트 실패 시 테스트 삭제 금지)
- 🚫 범위 외 작업
- 🚫 추측 채움

---

## 3. TDD 자세 — 영역별 결정

| 영역 | TDD |
|---|---|
| **Agent tools** | **강제** (각 tool은 격리 테스트 가능해야 함) |
| 비즈니스 로직 (주문 처리, 가격 계산) | 강제 |
| API routes | 권장 |
| UI 컴포넌트 | 선택 (시각적 검증 우선) |
| 프로토타입/일회용 | 생략 가능 (이유 명시) |

**Agent tool의 TDD가 왜 강제인가**: tool은 *AI가 호출하는 함수*다. AI가 잘못된 입력을 줘도 tool은 안전해야 한다. test가 그 안전망.

---

## 4. 커밋 prefix

```
[타입] 간단한 설명 (50자 이내)
- 상세 1
- 상세 2
```

| 타입 | 용도 |
|---|---|
| `feat` | 새 기능 |
| `fix` | 버그 수정 |
| `tool` | Agent tool 추가/수정 |
| `agent` | Orchestrator/prompt 변경 |
| `db` | 스키마/마이그레이션 |
| `api` | API 엔드포인트 |
| `ui` | 프런트엔드 |
| `test` | 테스트 |
| `docs` | 문서 (AI_DOCS 포함) |
| `refactor` | 기능 변경 없는 개선 |

**커밋 시점**: 테스트 통과 / 린터 청결 / 논리 단위 완료. 여러 변경 한 커밋에 섞지 않는다.

---

## 5. 컨텍스트 6슬롯 — AI에게 시키기 전

1. **과제** — 한 문장: 무엇을 + 왜
2. **읽을 파일** — 추측 경로 금지. AI_DOCS/ 포함 반드시.
3. **따라야 할 패턴** — 기존 어느 파일 본뜰지
4. **제약** — 성능, 호환성, 보안, 스타일
5. **범위 밖** — *항상 비어있지 않아야* 함
6. **완료 기준** — 관찰 가능한 성공 (테스트 통과, URL X에서 Y 보임)

---

## 6. 브랜치 전략 (1인 = 다 에이전트 패턴)

```
main (항상 배포 가능)
  ↑
  feat/order-landing      ← Agent 1 (터미널 1)
  feat/tool-announcement  ← Agent 2 (터미널 2)
  feat/tool-naver-crawl   ← Agent 3 (터미널 3)
  feat/dashboard-form     ← Agent 4 (터미널 4)
```

**규칙**:
- 한 터미널 = 한 브랜치 = 한 기능
- 다른 터미널의 파일 절대 수정 금지 (충돌 방지)
- 머지 전 `git pull --rebase origin main`
- Reviewer 에이전트 (별도 세션)가 1차 리뷰 후 사람이 2차

---

## 7. 깊은 참조 호출 트리거

### AI_DOCS/ (도메인 지식, 매 작업 시작 시 필수)

| 상황 | 읽을 파일 |
|---|---|
| 워크플로우 단계 구현 | `AI_DOCS/workflow-9-steps.md` |
| 카카오 공고 텍스트 생성 | `AI_DOCS/kakao-text-format.md` |
| 네이버 크롤링 | `AI_DOCS/naver-crawl-strategy.md` |
| 이미지 합성 | `AI_DOCS/poster-composition.md` |
| 데이터 모델 | `AI_DOCS/data-model.md` |
| 클라이언트 제약 | `AI_DOCS/client-requirements.md` |

### methodology.md (코드 방법론)

| 상황 | 읽을 섹션 |
|---|---|
| 새 PRD/plan | §1, §2 |
| 비자명한 변경 | §3 (6슬롯 상세) |
| Taste/품질 헷갈림 | §5 |
| TDD 사이클 | §6 |
| MCP 설정 | §7 |

### ~/onword-agent/ (PM 사고)

| 상황 | 읽을 파일 |
|---|---|
| 새 기능 우선순위 | `core/pm-os.md` |
| 너무 많이 쌓임 | `lenses/deletion.md` |
| 순서 헷갈림 | `lenses/permutation.md` |

---

## 8. 도메인 한계 — 별도 학습 영역

- 카카오 API (이번 스프린트엔 사용 안 함, 텍스트 복사만)
- 결제 (다음 스프린트)
- 회원 인증 (다음 스프린트)

---

## 9. "완료" 점검표

- [ ] diff가 사전 plan과 일치
- [ ] 범위 밖 변경 분리됨
- [ ] 테스트 실행 후 통과 확인
- [ ] UI 변경 시 브라우저 확인
- [ ] DB 변경 시 실제 쿼리로 확인
- [ ] 커밋 메시지가 *왜*를 설명
- [ ] 구조적/행동적 변경이 한 커밋에 안 섞임 (Tidy First)
- [ ] PLAN.md 해당 항목 체크

---

## 10. 신뢰 수준 표기

- `[높음]` 클라이언트 확인 / 공식 문서 / 검증됨
- `[중간]` 합리적 추정, 검증 가능
- `[낮음]` 추측 — 사람에게 확인 필요
- `[미확인]` 빈 자리

---

## 11. PM 사고 시퀀스

1. **WHO & WHY** — 누가 이걸 요청했고, 왜?
2. **CORE** — 진짜 문제는?
3. **SEQUENCE** — 어떤 순서가 인과적 의미를 만드나?
4. **EXECUTE** — Plan 후 실행
5. **REVIEW & COMPOUND** — 다음을 더 쉽게 만드는 학습 기록

---

## 12. 모드 전환 규칙

**PM → CODE**: 우선순위 명확 + 6슬롯 채울 수 있음
**CODE → PM**: "범위 밖"이 비어있거나, *왜 만드는지* 의문 생김

---

## 13. AI 에이전트 활용 패턴 (이 프로젝트 specific)

### 1일 표준 흐름

```
오전 (4h) — Builder Mode
- 터미널 4-6개 병렬 실행
- 각각이 PLAN.md의 다른 Must 항목 작업
- 별도 브랜치, 독립 파일

오후 (4h) — Architect Mode
- PR 리뷰 + 머지
- 통합 테스트
- 내일 분량 plan 작성
- AI_DOCS 업데이트
```

### 에이전트 분담 원칙

- **Specialist agents** (도메인별):
  - `playwright-specialist`: 네이버 크롤링 전담
  - `image-composer-specialist`: 포스터 합성 전담
  - `announcement-writer`: 카카오 공고 텍스트 전담
- **Generalist agents** (CRUD/UI): 4-6개 병렬, 어떤 작업이든
- **Reviewer agent**: PR 1차 리뷰 (별도 세션)

### 1 작업 = 1 세션 = 1 브랜치 원칙

한 에이전트가 두 가지 기능을 섞지 않는다. 컨텍스트 오염 방지.

---

## 14. Default Output Style

- 한국어 (Jinho/파트너 모국어). 코드/기술 용어는 영어.
- 직설적, 군더더기 없이.
- 위험 발견 시 즉시 지적.
- 응답 첫 줄에 모드 명시.

---

## 프로젝트 정보

- **이름:** Onword Group Buy
- **목적:** 한국 오프라인 매장용 공동구매 운영 자동화 (AI 에이전틱 대시보드 중심)
- **단계:** 2-day MVP sprint
- **개발 형태:** 파트너 1명 + AI 에이전트 팀 (4-6 병렬 세션)
- **기술 스택:** Next.js 14 + TypeScript + Supabase + Tailwind + Turborepo
- **AI 모델:**
  - Orchestrator: claude-sonnet-4-20250514
  - 코드 작성: Claude Code (CLI)
  - 이미지: 자체 코드 합성 (생성 AI 안 씀)

## 명령어

```bash
pnpm install              # 의존성 설치
pnpm dev                  # 3개 앱 동시 실행
pnpm dev --filter=dashboard
pnpm dev --filter=order-web
pnpm dev --filter=lookup-web
pnpm type-check
pnpm test
pnpm test --filter=@onword/agent  # Agent tools만 테스트
pnpm lint
pnpm build
```

## 알아둘 함정

- 카카오 오픈채팅 API 없음 → 텍스트 생성 후 복사 버튼만
- 네이버 크롤링 IP 차단 위험 → Playwright rate limit + User-Agent rotation
- Supabase 무료 500MB → 이미지 저장은 Supabase Storage 사용
- Claude API tool_use는 max_tokens 4096이 안정적
- 한 에이전트 세션에서 두 기능 섞지 말 것 (컨텍스트 오염)
