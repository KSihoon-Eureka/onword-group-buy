# ONBOARDING.md — Claude Code 첫 세션 가이드

> **AI 독자에게**: 이 파일은 이 repo를 처음 만나는 *Claude Code 세션*과 *코파운더*가 **함께** 읽도록 작성됐다.
> 코파운더가 첫 세션에서 이 파일을 보여주면, 너(Claude)는 이 절차를 *순서대로* 따라 진행한다.
> 추측하지 않는다. 막히면 코파운더에게 묻는다. CLAUDE.md §1 (추측 금지)를 항상 적용한다.

---

## 0. 컨텍스트

### 0.1 너가 누구인가
- 이 repo는 **Onword Group Buy** — 한국 오프라인 매장용 공동구매 운영 자동화 솔루션
- 개발 형태: 코파운더 1명 + 너 같은 AI 에이전트 4-6개 병렬 (Boris Cherny 패턴)
- 기간: 2일 스프린트 (Day 0 → Day 1 → Day 2)
- 클라이언트: 한국 오프라인 매장 운영자 (시니어층, 디지털 친화도 낮음)
- 핵심: *상품 발주 정보 한 번만 입력 → AI가 모든 워크플로우 자동 실행*

### 0.2 너가 이미 가진 것 (Jinho가 준비함)
- `CLAUDE.md` (282줄): 너의 운영 규칙. 매 세션 자동 로드.
- `methodology.md` (732줄): 깊은 코드 방법론. 필요 시 Read.
- `AI_DOCS/` 7개 파일: 도메인 지식 전체 (워크플로우, 카카오 포맷, 크롤링, 포스터, 데이터 모델, 클라이언트 요구사항, 대시보드 UI)
- `PLAN.md`: Day 0/1/2 살아있는 스프린트 계획
- `packages/types/index.ts`: 모든 TypeScript 타입 정의 (358줄)
- `packages/agent/`: Orchestrator + 6개 Tool 스켈레톤 (구현 본문은 TODO)
- `packages/ui/`: 검증된 UI 컴포넌트 4개 (Sidebar, BottomNav, AgentStepBlock, cn)
- `packages/db/`: Supabase 클라이언트 + Database 타입
- `apps/dashboard/`: Next.js 14 skeleton + API route
- `supabase/migrations/`: 5개 테이블 SQL
- `.claude/commands/` 5개: `/new-feature`, `/add-tool`, `/review`, `/commit-push`, `/update-docs`

### 0.3 너가 *없는* 것 (직접 만들거나 코파운더에게 받을 것)
- 환경 변수 (`.env.local`) — 코파운더가 Step 2에서 채움
- Supabase 프로젝트 — 코파운더가 Step 3에서 생성
- 6개 Tool의 *구현 본문* (현재 TODO 표시됨) — Day 1-2 작업
- 3개 앱의 view 구현체 — Day 1-2 작업

---

## 1. 첫 세션의 동작 순서 (Phase 1: 컨텍스트 흡수)

### 1.1 너가 *반드시 먼저* 읽을 파일 (이 순서대로)

```
1. CLAUDE.md                          (282줄, 운영체제)
2. AI_DOCS/client-requirements.md     (119줄, 무엇을 만드나)
3. AI_DOCS/workflow-9-steps.md        (211줄, 9단계 워크플로우)
4. AI_DOCS/data-model.md              (274줄, DB 스키마)
5. AI_DOCS/kakao-text-format.md       (164줄, 카카오톡 표준)
6. AI_DOCS/naver-crawl-strategy.md    (168줄, 네이버 크롤링)
7. AI_DOCS/poster-composition.md      (204줄, 포스터 합성)
8. AI_DOCS/dashboard-ui-patterns.md   (299줄, UI 디자인 시스템)
9. PLAN.md                            (164줄, 스프린트 계획)
10. packages/types/index.ts           (358줄, 타입 정의)
```

읽기 끝나면 코파운더에게 다음을 한국어로 보고:

```
[흡수 완료]
- 9단계 워크플로우 이해됨
- Tool 6개의 역할 명확함
- Day 1 Track A/B/C/D 작업 항목 파악됨
- 막히는 부분: [있으면 명시, 없으면 "없음"]

다음 진행:
  옵션 A: 환경 셋업 도와드릴까요? (Supabase, pnpm install)
  옵션 B: Day 1 Track 하나를 바로 시작할까요?
  옵션 C: 도메인 질문이 있으시면 받겠습니다.
```

### 1.2 읽지 *말아야* 할 것 (Phase 1에서)
- 구체적 tool 구현 (`packages/agent/tools/*.ts`) — Phase 2에서 작업 시 그때 읽기
- `apps/dashboard/components/views/*.tsx` 스켈레톤 — 구현 시 읽기
- `methodology.md` 전체 — *언제* 읽을지는 CLAUDE.md §7 트리거 표에 있음

읽은 파일에 *답이 있는 질문*을 코파운더에게 다시 묻는 건 시간 낭비. 항상 *읽고 → 요약 → 행동*.

---

## 2. Phase 2: 환경 셋업 (Day 0의 0.2~0.7)

이건 코파운더가 *손으로* 해야 하는 작업이 많아 (Supabase 가입, GitHub repo 등). 너는 **각 단계가 끝났는지 검증**하고, **다음 단계로 안내**한다.

### 2.1 GitHub 연결 검증

코파운더에게 물어봐:
```
다음 셋 중 어디까지 됐어?
(a) zip 풀고 cd ~/onword-group-buy 까지
(b) git remote add 까지
(c) git push -u origin main 까지 완료
```

(c)면 다음으로. 아니면 단계별 명령 안내. 다음 명령으로 검증:

```bash
git log --oneline                    # 3개 커밋 보여야 함
git remote -v                        # origin이 jinhologankim/onword-group-buy.git 가리켜야 함
```

### 2.2 Node + pnpm 검증

```bash
node -v        # v20.x.x 이상이어야 함
pnpm -v        # 9.x.x여야 함
```

`v20` 미만이면 *멈춤*. nvm으로 v20 설치 안내:
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
nvm install 20
nvm use 20
```

pnpm 없으면:
```bash
npm install -g pnpm
```

### 2.3 Supabase 셋업 검증

코파운더가 다음을 *직접 수행* (너는 안내만):

1. https://supabase.com 가입/로그인
2. New Project — 이름 `onword-group-buy`, 리전 `ap-northeast-2 (Seoul)`, DB password 강력하게
3. 프로젝트 생성 대기 (2-3분)
4. SQL Editor → New query → `supabase/migrations/00000000000000_init.sql` 내용 *전체* 복사 → Run
5. 결과 확인: "Success. No rows returned" 메시지
6. Storage → New bucket → 이름 `assets`, Public toggle ON, Create
7. Database → Replication → 3개 테이블 Realtime 활성화:
   - `orders`
   - `trace_steps`
   - `products`
8. Settings → API → 3개 값 복사 (다음 단계용)

검증 쿼리 (SQL Editor에서 실행):
```sql
select count(*) from products;          -- 0 나와야 함
select count(*) from agent_traces;      -- 0
select count(*) from generated_assets;  -- 0
```

세 쿼리 모두 통과하면 다음 단계로.

### 2.4 환경 변수 (.env.local)

```bash
cp .env.example .env.local
```

코파운더가 채울 값 (네가 안내):

| 변수 | 어디서 얻나 | 필수 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Settings → API → Project URL | ✓ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Settings → API → anon public | ✓ |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Settings → API → service_role secret | ✓ |
| `ANTHROPIC_API_KEY` | Jinho가 공유 (console.anthropic.com) | ✓ |
| `RESEND_API_KEY` | resend.com 가입 → API Keys (도매업자 이메일) | Day 2 |
| `STORE_NAME` | `판다팜` (또는 클라이언트 매장명) | ✓ |
| `BRAND_NAME` | `산타` | ✓ |
| `STORE_SHORTNAME` | `산타가족` | ✓ |
| `WHOLESALE_FROM_EMAIL` | `noreply@onword.kr` | Day 2 |
| `WHOLESALE_DEFAULT_RECIPIENT` | 도매업자 이메일 (클라이언트 확인) | Day 2 |

서비스 롤 키가 *공개되지 않았는지* 확인:
```bash
grep "SUPABASE_SERVICE_ROLE_KEY" .gitignore  # .env*.local 패턴 매치되는지
git status                                    # .env.local이 untracked여야 함
```

### 2.5 의존성 설치

```bash
pnpm install
# 5-10분 소요. 워크스페이스 전체 의존성 설치.

pnpm exec playwright install chromium
# 네이버 크롤링용. ~150MB 다운로드.
```

### 2.6 첫 빌드 검증

```bash
pnpm type-check
# 모든 패키지에서 통과해야 함.
# 에러 나오면 → 정확한 메시지 코파운더에게 요청 → 분석.
# 만약 @onword/* 모듈을 못 찾는 에러:
#   → pnpm install 다시 실행
#   → 그래도 안 되면 node_modules 삭제 후 재설치
```

```bash
pnpm dev --filter=@onword/dashboard
# http://localhost:3000 열기
# 검증 기준:
#   ✓ 사이드바에 5개 메뉴 (AI 비서, 공구 현황, 주문 관리, 자산, 상품 등록)
#   ✓ 클릭 시 메뉴 전환 동작
#   ✓ 각 view에 "구현 예정" placeholder 표시
#   ✗ 콘솔에 에러 없어야 함 (warning은 OK)
```

여기까지 통과 = **Day 0 완료**. 코파운더에게 보고:

```
[Day 0 완료]
- GitHub repo 연결 ✓
- Supabase 5개 테이블 + 1개 버킷 ✓
- 환경 변수 설정 ✓
- pnpm install + Playwright ✓
- localhost:3000 정상 동작 ✓

다음: Day 1 Track 시작 준비됐어요. PLAN.md §"Day 1 — Builder Mode"를 봐주세요.
```

---

## 3. Phase 3: Day 1 Track 시작 (Builder Mode)

### 3.1 병렬 세션 패턴

코파운더가 5개 터미널 창을 연다:
- 터미널 1: *이 세션* (메인, 조율 + 리뷰)
- 터미널 2-5: 다른 Claude Code 세션 (각자 다른 Track 작업)

너(이 세션)의 역할은:
1. *직접 작업하지 않음* — 다른 세션들이 작업
2. 코파운더가 PR을 보낼 때 `/review` 명령 처리
3. Track 사이 충돌 / AI_DOCS 업데이트 필요성 감지
4. PLAN.md 업데이트

### 3.2 Track 분배 (Day 1 오전, 4시간)

각 Track을 *별도 터미널*에서 시작. 코파운더는 다음 4개를 동시 실행:

```
터미널 2 → claude → /new-feature 1A.2
  (apps/order-web/components/ProductCard.tsx — 상품 주문 웹 카드)

터미널 3 → claude → /new-feature 1B.2
  (apps/order-web/components/OrderForm.tsx — 주문 폼)

터미널 4 → claude → /add-tool generate-announcement
  (packages/agent/tools/generate-announcement.ts 구현)

터미널 5 → claude → /new-feature 1D.1
  (apps/dashboard/components/ProductRegisterForm.tsx — 발주 입력)
```

각 세션은 *동일하게 Phase 1.1을 먼저 수행*. 즉 AI_DOCS를 먼저 읽고 시작.

### 3.3 메인 세션의 동시 작업

너(이 세션)는 옆에서 다음을 진행:
- 각 트랙의 PR이 올라오면 `/review feat/[branch]` 실행
- AI_DOCS에 추가할 학습이 있으면 즉시 `/update-docs`
- 코파운더에게 Track 간 의존성 발견 시 알림

### 3.4 PR 머지 절차

각 Track이 작업 끝나면 코파운더가 PR 만듦. 너의 역할:

```
/review feat/[branch]
```

너의 출력 형식 (CLAUDE.md §3 적용):
```
[Reviewer 리뷰: feat/order-card]

✅ 잘된 점
- ...

⚠️ 개선 권고
- 파일:라인 — 설명

🚫 머지 차단
- (있을 때만)

💡 학습 기회
- AI_DOCS/[파일].md에 추가 가능: ...

판정: APPROVE / NEEDS_REVISION / BLOCK
```

APPROVE면 코파운더가 머지. 머지 후:
- `PLAN.md`에서 해당 체크박스 ✓
- 별도 commit: `docs: check off 1A.2`

---

## 4. Phase 4: Day 2 — Heavy Tools + 배포

Day 1 종료 시 다음 점검:
- [ ] Track A/B/C/D 머지 완료?
- [ ] 통합 테스트 (주문 등록 → 대시보드 표시) 통과?
- [ ] 막힌 부분 있나?

Day 2 트랙 (PLAN.md §"Day 2" 참조):
- Track G: `compose_poster` 구현 (가장 무거움)
- Track H: ChatView + Execution Trace 통합
- Track I: `notify_wholesaler` + Resend
- 오후: 나머지 view + E2E 테스트 + Vercel 배포

배포 시 주의:
- Playwright는 Vercel serverless에서 무거움 → `@sparticuz/chromium` 검토
- Sharp는 Vercel에 native binary 자동 포함
- `maxDuration: 60` (Vercel Pro 필요)

---

## 5. 막힘 시 분기

### 5.1 도메인 모호함
- 1차: `AI_DOCS/` 다시 읽기
- 2차: `AI_DOCS/client-requirements.md`에 답 있나?
- 3차: 코파운더에게 *구체적* 질문 (모호한 "어떡하지?" X)
- 4차: 코파운더가 모르면 Jinho에게

### 5.2 기술 모호함
- 1차: `methodology.md` 트리거 표 (CLAUDE.md §7)
- 2차: 관련 라이브러리 공식 문서 (Anthropic SDK, Supabase, Sharp, Playwright)
- 3차: 추측하지 말고 코파운더에게 명시적 질문

### 5.3 외부 API 실패
- 네이버 크롤링 실패: `AI_DOCS/naver-crawl-strategy.md` §"알아둘 함정"
- Claude API 429: 재시도 + jitter
- Supabase 연결 실패: 환경 변수 다시 확인

### 5.4 시간 초과
- 한 Track이 *4시간 이상 막힘* → 즉시 멈추고 코파운더 + Jinho에게 보고
- Scope 축소 또는 다음 스프린트로 이월 결정

---

## 6. 절대 규칙 (CLAUDE.md §2 요약)

이 규칙들은 *모든* 작업 위에 우선한다. 어기면 즉시 정지.

- 🚫 main에 직접 push (별도 브랜치 → PR)
- 🚫 테스트 없이 머지 (Agent tool은 TDD 강제)
- 🚫 AI_DOCS 안 읽고 추측 시작
- 🚫 `--no-verify`, `--force` 등 우회
- 🚫 `--no-gpg-sign`
- 🚫 한 브랜치에 여러 기능 섞기
- 🚫 외부 메시징 (실제 카카오/이메일 전송) — 명시적 승인 없으면
- 🚫 프로덕션 데이터 변경
- 🚫 환경 변수 / 시크릿 공유

---

## 7. 매일 끝 루틴 (Compound Engineering)

```bash
# 1. 학습 기록 (오늘 발견한 패턴/실수)
# learnings/CHANGELOG.md에 한 줄 추가
# 영구 규칙이면 → 해당 lens 또는 AI_DOCS에 승격

# 2. PLAN.md 체크박스 업데이트
# 별도 commit: docs: end of day X

# 3. push
git add -A
git commit -m "docs: day X end - [한 줄 요약]"
git push
```

이게 매일 *반드시* 일어나야 함. 안 하면 *내일의 너*가 *오늘의 너*가 배운 걸 잊는다. 이게 너의 자료 *Boris Cherny 패턴*의 핵심.

---

## 8. 첫 메시지 — 코파운더에게 보낼 인사

이 ONBOARDING.md를 다 읽었다면, 코파운더에게 다음을 한국어로 보고:

```
안녕하세요. Onword Group Buy repo 컨텍스트 흡수 완료했습니다.

준비 상태:
- 9단계 워크플로우 + Tool 6개 역할 이해됨
- 디자인 시스템 (AI_DOCS/dashboard-ui-patterns.md) 파악됨
- Day 1 Track A/B/C/D 작업 항목 명확함

당장 도와드릴 수 있는 것:
1. Phase 2 환경 셋업 — Supabase, pnpm install, 빌드 검증을 함께
2. Day 1 Track 직접 시작 — 어떤 Track 맡으실 건가요?

혹시 클라이언트 요구사항 중 추가/변경된 부분 있으신가요?
없으면 AI_DOCS/client-requirements.md 기준으로 진행하겠습니다.

어느 것부터 가시겠어요?
```

이 인사는 *모범적 형식*. 너가 1.2의 "읽지 말아야 할 것"까지 잘 따랐고, *행동을 제안*하며, *코파운더 결정*을 기다린다. 추측하지 않는다. 시작.

---

## 부록 A: 슬래시 명령 빠른 참조

| 명령 | 언제 |
|---|---|
| `/new-feature [번호]` | PLAN.md 항목 구현 시작 |
| `/add-tool [이름]` | 새 Agent tool 추가 또는 수정 |
| `/review [브랜치]` | PR 리뷰 |
| `/commit-push` | 작업 마무리, 푸시 |
| `/update-docs` | 학습/규칙을 AI_DOCS 또는 lens에 영속화 |

상세는 `.claude/commands/` 폴더의 각 파일 Read.

---

## 부록 B: 자주 쓰는 명령어

```bash
# 개발
pnpm dev                              # 모든 앱
pnpm dev --filter=@onword/dashboard   # 대시보드만
pnpm dev --filter=@onword/order-web   # 주문 웹만

# 검증
pnpm type-check                       # 전체 타입체크
pnpm lint                             # 린트
pnpm test                             # 테스트
pnpm test --filter=@onword/agent      # Agent tool 테스트만

# Git
git checkout -b feat/[기능명]          # 새 브랜치
git status                            # 변경사항 확인
git diff                              # 차이 확인
git add [specific files]              # 스테이징 (git add . 보다 specific)
git commit -m "feat: [설명]"           # 커밋
git push                              # 푸시
git pull --rebase origin main         # main 동기화

# 워크스페이스
pnpm install                          # 의존성 설치
pnpm add [패키지] --filter=@onword/agent  # 특정 패키지에 라이브러리 추가
```

---

## 부록 C: 트러블슈팅

### "Cannot find module '@onword/...'"
```bash
pnpm install   # 워크스페이스 링크 재생성
# 그래도 안 되면:
rm -rf node_modules
pnpm install
```

### "Playwright browser not installed"
```bash
pnpm exec playwright install chromium
```

### Supabase connection failed
- `.env.local`의 URL/key 다시 확인
- Service role key 줄바꿈 없는지 확인 (긴 문자열이라 자주 깨짐)
- Supabase 프로젝트 상태 확인 (paused 상태일 수 있음)

### Tailwind 스타일이 적용 안 됨
- `tailwind.config.ts`의 `content` 경로 확인
- `app/globals.css`가 `layout.tsx`에 import됐는지

### Type error in @onword/types
- `pnpm install` 다시
- IDE의 TypeScript 서버 재시작 (VS Code: Cmd+Shift+P → "Restart TS Server")

---

## 끝.

코파운더와 첫 인사 후, Phase 2 환경 셋업부터 시작. 행운을 빈다.
