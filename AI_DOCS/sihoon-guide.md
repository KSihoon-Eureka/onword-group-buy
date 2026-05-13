# Sihoon Operations Guide — Git · Terminals · Sessions

> Sihoon 본인용 가이드. Claude Code 세션은 안 읽음.
> Git을 처음 쓰는 경우 §1부터, 익숙해지면 §3 (terminal) / §5 (session) 참고.

---

## §1. Git 입문 (0부터)

### 1.1 Git이 뭔가 (1분 요약)

**Git = 코드의 "Ctrl-Z" + 백업 + 협업 시스템.**

- **버전 관리**: 매 변경마다 "snapshot" 저장 → 언제든 과거로 돌아가기
- **백업**: GitHub에 업로드 → 컴퓨터 망가져도 코드 안전
- **협업**: 여러 사람 / 여러 AI 세션이 동시에 같은 코드 작업

이 프로젝트에서 너의 역할:
- AI가 코드를 만든다 → 너가 Git으로 *저장*하고 *업로드*한다
- 잘못되면 → Git으로 *되돌린다*

### 1.2 처음 한 번만 설정

이미 git이 설치되어 있으니 본인 정보 등록:

```bash
git config --global user.name "Sihoon Kim"
git config --global user.email "ksihoon312@gmail.com"
git config --global init.defaultBranch main
git config --global pull.rebase true
```

확인:
```bash
git config --global user.name           # 이름 나와야 함
git config --global user.email          # 이메일 나와야 함
```

GitHub CLI 설치 (PR 만들 때 편함):
```bash
brew install gh
gh auth login                           # 브라우저 열림 → 로그인
gh auth status                          # 로그인 확인
```

### 1.3 GitHub repo 만들기 (한 번만)

이 프로젝트는 이미 로컬에 git이 있지만 GitHub에 없음. 연결:

**Option A — gh CLI 한 줄 (추천):**
```bash
cd ~/Coding/onword-group-buy
gh repo create onword-group-buy --private --source=. --remote=origin --push
```

이거 한 줄이면:
1. GitHub에 private repo 생성
2. `origin` remote 자동 설정
3. main 브랜치 push

**Option B — 수동:**
1. https://github.com/new → 이름 `onword-group-buy`, **Private**, README/license/gitignore 안 체크 → Create
2. 터미널:
```bash
cd ~/Coding/onword-group-buy
git remote add origin https://github.com/<your-username>/onword-group-buy.git
git push -u origin main
```

확인:
```bash
git remote -v                           # origin URL 보여야
git log --oneline                       # 커밋 4개 이상
gh repo view --web                      # 브라우저 열림 → 확인
```

### 1.4 매일 쓰는 명령 (이거 5개만 외우면 됨)

```bash
# 1. 지금 무엇이 바뀌었는지 확인
git status

# 2. 특정 파일을 "다음 commit"에 포함시키기
git add 파일경로              # 예: git add PRD.md
git add .                     # ⚠️ 모든 변경 (실수로 .env 포함 위험)

# 3. snapshot 저장 (메시지 필수)
git commit -m "docs: PRD 작성"

# 4. GitHub에 업로드
git push

# 5. GitHub에서 최신 받기 (다른 세션이 변경했을 때)
git pull --rebase origin main
```

이 5개로 90% 작업 가능.

### 1.5 Commit 메시지 작성 규칙

좋은 commit message = 나중에 "왜 이걸 바꿨지?" 알 수 있게.

**Type prefix (CLAUDE.md §4):**
- `feat:` 새 기능
- `fix:` 버그 수정
- `tool:` Agent tool 추가/수정
- `db:` 스키마 / 마이그레이션
- `api:` API endpoint
- `ui:` 프론트엔드
- `test:` 테스트
- `docs:` 문서 (PRD, AI_DOCS 등)
- `refactor:` 기능 변경 없는 개선

예시:
```bash
git commit -m "feat: 상품 등록 폼 추가"
git commit -m "fix: 매장 스위처 새로고침 시 active store 유지"
git commit -m "docs: PRD §7 워크플로우 11단계로 업데이트"
git commit -m "tool: generate_announcement Stage 2 추가"
```

길게 쓰고 싶으면:
```bash
git commit -m "feat: AI 비서에 saved flows 추가

- empty state 그리드 표시
- 새 플로우 저장 버튼
- run_count 기반 정렬"
```

### 1.6 브랜치 (병렬 작업의 핵심)

**브랜치 = 평행세계.** main 브랜치는 "stable". 새 기능은 별도 브랜치에서 작업 → 완성되면 main에 합침.

```bash
# 새 브랜치 만들고 그쪽으로 이동
git checkout -b feat/login-page

# ... 작업 ...

# main으로 돌아오기
git switch main

# 다시 그 브랜치로
git switch feat/login-page

# 브랜치 목록
git branch
```

**브랜치 이름 규칙:**
- `feat/<기능명>`: 새 기능 (예: `feat/store-switcher`)
- `fix/<버그명>`: 버그 수정 (예: `fix/login-redirect`)
- `tool/<tool명>`: Agent tool (예: `tool/generate-announcement`)
- `db/<설명>`: 마이그레이션 (예: `db/add-stores-table`)

### 1.7 Pull Request (PR) — 코드 리뷰 의식

브랜치에서 작업 끝나면 main에 합치기 전에 PR 만들어서 리뷰:

```bash
# 브랜치 push
git push -u origin feat/login-page

# PR 생성
gh pr create --fill                # commit 메시지로 자동
# 또는 직접:
gh pr create --title "feat: login page" --body "Phase B.1 완료"
```

PR 페이지에서 변경 사항 보기:
```bash
gh pr view --web                   # 브라우저 열림
```

리뷰 후 main에 합치기:
```bash
gh pr merge --squash --delete-branch
```

`--squash`: 브랜치의 여러 commit을 1개로 합쳐서 main에 추가. 깔끔한 history.

main 동기화:
```bash
git switch main
git pull --rebase origin main
```

### 1.8 GitHub에서 main 직접 push 막기 (한 번 설정)

실수로 main에 직접 push 못 하게:

1. GitHub repo 페이지 → Settings → Branches
2. "Add branch protection rule" → branch name = `main`
3. ✅ Require a pull request before merging
4. Save

이제 main 직접 push 시도 → 차단됨.

### 1.9 절대 하면 안 되는 명령 (CLAUDE.md §2 + 일반 안전)

```bash
git push --force                   # 다른 사람 작업 덮어씀
git reset --hard                   # 모든 변경 날림 (uncommitted 영구 소실)
git branch -D <브랜치>             # 안 merged 브랜치 강제 삭제
git commit --no-verify             # 훅 우회 (테스트 / 린트 무시)
git add .                          # ⚠️ .env 같은 비밀 commit 위험
```

이 명령들 쓸 일 있으면 *반드시* Claude에게 먼저 물어봐.

### 1.10 흔한 시나리오

**시나리오 1: 코드 변경하고 push**
```bash
git status                          # 뭐 바뀌었나
git add 파일1 파일2                 # 특정 파일만 stage
git commit -m "feat: 설명"
git push
```

**시나리오 2: 다른 브랜치로 이동했더니 변경사항이 사라짐?**
→ 변경사항이 다른 브랜치에 남아있음. 다시 그 브랜치로 돌아가면 보임.

**시나리오 3: 잘못 commit 했음 (push 전)**
```bash
git reset --soft HEAD~1            # 마지막 commit 취소, 변경은 남음
# 수정 후 다시 commit
```

**시나리오 4: 잘못 push 했음 (별로 안 심각)**
→ 새 commit으로 *수정* (revert), force push 금지:
```bash
# 파일 수정 후
git commit -m "fix: 이전 commit 수정"
git push
```

**시나리오 5: GitHub에 최신 코드 있는데 내 로컬은 옛날**
```bash
git pull --rebase origin main      # 받기 + 내 변경 위에 올림
```

**시나리오 6: 머지 conflict (두 브랜치가 같은 줄 수정)**
```bash
git pull --rebase origin main
# CONFLICT 메시지 → 해당 파일 열어서 <<<<<<< 마커 보고 수동 해결
# 해결 후:
git add 충돌파일
git rebase --continue
```

complex하면 Claude에게 물어봐.

### 1.11 매일 끝 루틴

```bash
git status                          # 빠진 거 없나
git add <오늘 작업한 파일>
git commit -m "docs: day N 마무리 - [한 줄 요약]"
git push
```

이게 매일 *반드시* 일어나야 함. 안 하면 다음 날 너가 어디까지 했는지 잊는다.

---

## §2. .gitignore와 비밀 관리

### 2.1 .gitignore 확인

매번 push 전에:
```bash
git check-ignore .env.local         # 출력 있어야 정상 (= ignored)
git status                          # .env.local이 목록에 없어야 정상
```

만약 .env.local이 status에 보이면 → gitignore 안 됐음. 절대 commit 금지.

### 2.2 비밀 키 (절대 git에 들어가면 안 됨)

| 키 | 위험 |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | RLS 우회 = 전체 데이터 노출 |
| `ANTHROPIC_API_KEY` | 너 명의 비용 청구 |
| `RESEND_API_KEY` | 너 명의 이메일 스팸 발송 |
| `CRON_SECRET` | Cron 임의 트리거 |

실수로 commit / push했다면:
1. **즉시** Supabase / Anthropic / Resend에서 키 재발급
2. Vercel env 업데이트
3. `git filter-branch` 또는 `git filter-repo` 로 history에서 제거 (복잡 — Claude에게 도움)

---

## §3. 다중 터미널 (병렬 작업)

### 3.1 왜 다중 터미널?

1인 개발자가 4-6개 Claude Code 세션을 *동시에* 굴리는 패턴 (Boris Cherny).

- 터미널 1 (메인): 너 + Claude — 조율, PR 리뷰
- 터미널 2: Claude — Track A 작업
- 터미널 3: Claude — Track B 작업
- 터미널 4: Claude — Track C 작업
- ...

각 터미널이 *다른 브랜치*, *다른 파일* 작업 → 충돌 없음.

### 3.2 실제 셋업 — Git Worktree

문제: 4개 터미널이 같은 폴더(`~/Coding/onword-group-buy`)에 있으면, 한 터미널에서 `git switch feat/A`하면 *모든 터미널*이 그 브랜치로 바뀜. → 다른 터미널 작업 깨짐.

해결: **git worktree** — 같은 repo지만 *다른 폴더*에서 *다른 브랜치*.

```bash
# 메인 터미널 (~/Coding/onword-group-buy, main 브랜치)
git fetch origin
git checkout main && git pull --rebase

# 새 워커 트랙 1 만들기
git worktree add ../onword-A -b feat/A-task

# 새 워커 트랙 2 만들기
git worktree add ../onword-B -b feat/B-task

# 새 워커 트랙 3 만들기
git worktree add ../onword-C -b feat/C-task

# 현재 worktree 목록
git worktree list
# ~/Coding/onword-group-buy   <commit>  [main]
# ~/Coding/onword-A           <commit>  [feat/A-task]
# ~/Coding/onword-B           <commit>  [feat/B-task]
# ~/Coding/onword-C           <commit>  [feat/C-task]
```

이제 각 폴더가 *독립*. 각 터미널에서 `cd` 하면 그 브랜치로 자동.

### 3.3 새 워커 터미널 시작

```bash
# 새 터미널 열기 (iTerm2: Cmd+T, Cmd+D 분할)
cd ~/Coding/onword-A
cp ~/Coding/onword-group-buy/.env.local .   # env 복사 (worktree마다 별도)
pnpm install                                # 첫 실행만 (~30초)
claude                                       # Claude Code 세션 시작
```

Claude 세션 첫 메시지:
```
ONBOARDING.md를 읽고 Phase 1.1 절차를 따라줘.
흡수 끝나면 PLAN.md의 [Phase A — Task A.{N}] 작업 시작.
범위 밖: 다른 worktree의 파일.
완료 기준: 테스트 통과 + PR 올림.
막히면 멈추고 보고. 추측 금지.
```

### 3.4 워커 작업 완료 후

```bash
# 워커 터미널 (예: ~/Coding/onword-A)
git push -u origin feat/A-task
gh pr create --fill
```

```bash
# 메인 터미널
gh pr list                              # 확인
gh pr view 5                            # PR 5번 상세
# /review feat/A-task                   # Claude에서 리뷰
gh pr merge 5 --squash --delete-branch
git switch main && git pull --rebase

# worktree 정리
git worktree remove ../onword-A
```

### 3.5 터미널 도구 선택

| 도구 | 추천도 |
|---|---|
| **iTerm2 (분할 패널)** | ⭐⭐⭐ Cmd+D 수직, Cmd+Shift+D 수평, 4개를 한 화면에 |
| **Terminal.app (탭)** | ⭐⭐ Cmd+T로 탭 추가 |
| **VS Code 통합 터미널** | ⭐⭐⭐ Cmd+\` 토글, +로 추가, drag로 분할 |
| **tmux** | ⭐ 익숙해야 함, 학습 곡선 |

iTerm2 4-pane 그리드를 깔면 모든 워커를 *한 화면*에서 보면서 진행 상황 모니터링. 최고.

설치: brew install --cask iterm2

### 3.6 한 화면에서 4개 동시 보기 (iTerm2)

1. iTerm2 열기
2. Cmd+D → 좌우 분할 (2개)
3. 각 패널에서 Cmd+Shift+D → 위아래 분할 → 총 4개
4. 각 패널: `cd ~/Coding/onword-X && claude`

### 3.7 워커 작업 중 너의 역할 (메인 터미널)

30분마다 cycle:
1. 각 워커 진행 상황 보기 (눈으로 화면 훑기)
2. 막힌 워커 있으면 도움
3. 새 PR 있으면 `gh pr list` → 리뷰 → 머지
4. PLAN.md 체크박스 업데이트

---

## §4. 워커 세션에게 시킬 때 — 효율적 prompt

`AI_DOCS/task-execution.md` §3 참조. Task 유형별 template 있음. 복사 → 채워서 붙여넣기.

매 task 첫 메시지 = 5요소 (목표 / 맥락 / 제약 / 완료 조건 / 예시) 채워서.

빈자리 있으면 워커가 추측 → 잘못된 결과. 비어있으면 너가 정해주거나 Claude에게 물어라.

---

## §5. 세션 (Context Window) 관리

### 5.1 Context Window가 뭔가

Claude는 한 번에 *기억하는 양*에 한계가 있음 (= context window). 그 한계 = 200,000 토큰 (Sonnet/Opus 기준).

대화가 길어지면:
- 입력 토큰 누적 ↑
- 200k 한계 근접 → 옛날 메시지 잘림 또는 압축
- 결과: AI가 너가 이미 답한 질문 다시 물음, 결정 오락가락, 환각 ↑

### 5.2 Context 가득 차고 있다는 신호

| 신호 | 해석 |
|---|---|
| 너가 이미 답한 질문을 또 함 | 메시지 잘리기 시작 |
| 방금 만든 파일 내용을 모름 | 파일 read 후 컨텍스트 누락 |
| 이전 결정과 모순되는 제안 | 결정 history 잊음 |
| 응답 속도 ↓ | 입력 토큰 많음 |
| 같은 코드를 반복 생성 | 루프 (Kent Beck 경고 신호) |
| 토큰 비용 ↑ | 입력 토큰 늘어남 |

이 중 *하나*만 보여도 → 새 세션 시작 고려. *두 개* 동시 → 즉시 새 세션.

### 5.3 새 세션 시작 시점

- 한 phase / 큰 작업 완료 직후
- 위 신호 발견 시
- 전혀 무관한 새 작업 시작 시
- 2-4 시간 집중 작업 후
- 토큰 사용량 ~70-80% (https://console.anthropic.com/usage 모니터)

### 5.4 새 세션 시작하기 전에 — 컨텍스트 저장

새 세션은 *zero memory*. 진행 상황을 영구 저장된 곳에 옮겨야 함.

체크리스트:
- [ ] PLAN.md 체크박스 업데이트 (어디까지 했나)
- [ ] AI_DOCS / PRD에 *새 결정* 있으면 기록
- [ ] 모든 변경 commit + push
- [ ] 메모리에 영속할 정보 있으면 memory 파일에 (CLAUDE.md memory 시스템)
- [ ] 다음 task 명확히 1줄로 PLAN.md에 적어두기

### 5.5 새 세션 시작 명령

```bash
# 같은 터미널에서:
# /clear  ← Claude 세션 내 명령. 컨텍스트 모두 비움, 같은 세션이지만 처음부터.
```

또는 *완전 새 세션*:
```bash
# 터미널에서 현재 claude 종료 (Ctrl+D 또는 exit)
claude        # 새 세션 시작
```

### 5.6 새 세션에서 컨텍스트 복구

새 세션은 자동으로:
- CLAUDE.md 로드 (operating rules)
- 메모리 파일 로드 (persistent facts)

너는 첫 메시지로:
```
ONBOARDING.md를 따라줘.
흡수 끝나면 PLAN.md를 보고 다음 task를 시작해.
```

ONBOARDING.md → Phase 1.1 절차 (PRD.md / PLAN.md 등 읽기). 새 세션이 30초 안에 모든 도메인 정보 흡수.

### 5.7 /compact 명령 (대안)

`/clear`는 너무 과격. 중간 솔루션 = `/compact`:
- 대화 *요약*하고 *압축*
- 핵심 정보 남기고 토큰 줄임
- 100% 보존은 아니지만 80%+ 보존

```
/compact
```

장점: 같은 세션 계속, 컨텍스트 절약
단점: 일부 정보 손실 가능

추천 사용:
- 토큰 60-70% → `/compact`
- 토큰 80%+ 또는 위 신호 → 새 세션 (`/clear` 또는 새 `claude`)

### 5.8 비용 절약

| 모델 | 시간당 비용 (대략) |
|---|---|
| Sonnet 4.6 | $1-3 |
| Opus 4.7 | $5-15 |

세션 1개 = 보통 1-3시간 = $3-15.

비용 줄이기:
1. 워커는 Sonnet, 코디네이터만 Opus
2. 세션 재시작 자주 (옛 컨텍스트 비움)
3. 워커가 안 읽어도 되는 파일을 명시 금지 ("apps/는 보지 마")
4. PRD.md 워커가 *전부* 읽지 말고 *해당 섹션*만 ("PRD.md §10.1만 읽어")

---

## §6. 매일 워크플로우 (이상적 하루)

### 오전 (4시간) — Builder Mode

```
9:00  메인 터미널에서 PLAN.md 보고 오늘 4개 트랙 결정
9:05  worktree 4개 만들기:
      git worktree add ../onword-A -b feat/A
      git worktree add ../onword-B -b feat/B
      git worktree add ../onword-C -b feat/C
      git worktree add ../onword-D -b feat/D
9:10  iTerm2 4-pane 셋업, 각 패널에서 cd + claude
9:15  각 워커에게 5요소 prompt 보내기 (template 사용)
9:15-12:00 ☕ 워커들 작업. 30분마다 진행 확인.
        막힌 워커 도움. 새 PR 있으면 리뷰.
12:00 점심
```

### 오후 (4시간) — Architect Mode

```
13:00 PR 4개 리뷰 (/review 또는 별도 reviewer 세션)
14:00 머지 (gh pr merge --squash) + worktree 정리
14:30 통합 테스트: pnpm test, pnpm dev 시각 확인
15:30 다음 트랙 PLAN.md 업데이트 + 결정 사항 PRD에 반영
16:30 commit + push + PLAN 체크박스
17:00 일일 회고: 막힌 곳 / 학습 / 내일 우선순위
```

### 저녁 (15분) — End of Day

```bash
# 메인 터미널
git add PLAN.md PRD.md AI_DOCS/
git commit -m "docs: day N 마무리 - [한 줄 요약]"
git push

# 모든 worktree 정리 (필요 시)
git worktree list
git worktree remove ../onword-A  # 머지된 거만
```

---

## §7. Trouble Shooting

| 증상 | 시도 |
|---|---|
| 워커가 같은 질문 반복 | 컨텍스트 가득 → 새 세션 |
| Type error: 모듈 못 찾음 | `pnpm install` 다시 (worktree마다 별도 node_modules) |
| 워커가 추측으로 채움 | 5요소 재점검, "추측 금지" 명시 |
| PR 머지 conflict | 워커 터미널에서 `git pull --rebase origin main` |
| 테스트 갑자기 실패 | 다른 트랙이 type 깨뜨림 → 메인에서 확인 |
| `gh pr create` 안 됨 | `gh auth login` 다시 |
| `claude` 명령 못 찾음 | https://claude.com/claude-code 설치 |
| Worktree remove 실패 | 그 폴더에 uncommitted 변경 있음 → commit / discard 후 다시 |

---

## §8. 자주 안 하지만 알면 좋은 명령

```bash
# 최근 3 commit 보기
git log --oneline -3

# 어떤 파일이 어느 commit에 변경됐나
git log --oneline -- 파일경로

# 특정 commit으로 *임시* 이동 (확인용)
git checkout <commit-hash>
git switch main          # 돌아오기

# 마지막 commit 되돌리기 (push 전만)
git reset --soft HEAD~1  # 변경 유지하고 commit 취소
git reset --mixed HEAD~1 # 변경 unstage
git reset --hard HEAD~1  # ⚠️ 변경 영구 삭제

# 특정 파일을 N개 commit 전 상태로 되돌리기
git checkout HEAD~3 -- 파일경로

# Stash (임시 보관 — 다른 브랜치로 잠깐 갈 때)
git stash                # 현재 변경 임시 저장
git switch other-branch
# ... 작업 ...
git switch original-branch
git stash pop            # 저장한 거 복원
```

---

**이 가이드 다 읽으면 Git 90%는 OK. 나머지 10%는 막힐 때 Claude에게 묻기.**
