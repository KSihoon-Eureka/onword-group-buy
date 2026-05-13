현재 변경사항을 커밋하고 푸시한다.

## 절차

1. **변경사항 확인**
   ```bash
   git status
   git diff --staged
   git diff
   ```

2. **린트/타입체크 통과 확인**
   ```bash
   pnpm type-check
   pnpm lint
   ```
   실패 시 *우회하지 말고* 원인 수정. CLAUDE.md §2 절대 규칙.

3. **테스트 통과 확인** (TDD 영역인 경우)
   ```bash
   pnpm test
   ```

4. **커밋 메시지 작성**
   - 형식 (CLAUDE.md §4 참조):
     ```
     [타입] 간단한 설명 (50자 이내)
     - 상세 1
     - 상세 2
     ```
   - 타입: feat/fix/tool/agent/db/api/ui/test/docs/refactor
   - *왜*를 설명. *무엇*은 diff가 보여줌.

5. **Tidy First 검증**
   - 이 커밋이 *구조적 변경*과 *행동적 변경*을 섞었나? 섞였으면 분리.

6. **커밋 + 푸시**
   ```bash
   git add <specific files>  # git add . 보다 specific 선호
   git commit -m "..."
   git push
   ```

7. **PLAN.md 업데이트** (해당 항목 완료 시)
   - 별도 커밋으로
   - `docs: check off 1A.2`

## 절대 하지 말 것

- `git push --force` (CLAUDE.md §2)
- `--no-verify` (훅 우회)
- 여러 변경을 한 커밋에
- 테스트 실패한 채로 커밋
- "WIP" 또는 "fix later" 커밋 메시지

## 인자

$ARGUMENTS — 커밋 메시지 (선택). 없으면 변경사항 보고 추천.
