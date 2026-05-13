새 Agent tool을 추가하거나 기존 tool을 수정한다.

## 사전 조건

- AI_DOCS/workflow-9-steps.md 읽었는가? (어떤 Step의 tool인지 확인)
- AI_DOCS/kakao-text-format.md 또는 관련 도메인 파일 읽었는가?
- packages/types/index.ts에서 Tool I/O 타입 확인했는가?

## 절차

1. **Tool 정의 확인 또는 추가**
   - `packages/agent/tools.ts` Read
   - 해당 tool이 없으면 정의 추가 (description, input_schema 명확하게)
   - description은 *Claude가 언제 이 tool을 호출해야 하는지* 명확히 설명

2. **타입 정의 확인 또는 추가**
   - `packages/types/index.ts`에서 `<ToolName>Input`, `<ToolName>Output` 확인
   - 없으면 추가

3. **TDD: 테스트 먼저 작성**
   - `packages/agent/tools/__tests__/<tool-name>.test.ts`
   - 최소 3개 케이스:
     a. 정상 입력 → 예상 출력
     b. 잘못된 입력 → throw 또는 graceful fallback
     c. 외부 의존성 실패 → 빈 결과 + 에러 로그
   - **AI_DOCS의 예시를 fixture로 사용** (예: 슈미트 베개커버)

4. **구현**
   - `packages/agent/tools/<tool-name>.ts`
   - 외부 API 호출은 try-catch
   - DB 접근은 packages/db 통해
   - generated_assets 테이블에 결과 저장 (재사용 가능)

5. **Orchestrator 등록 확인**
   - `packages/agent/orchestrator.ts`에서 해당 tool이 호출 가능한지 확인
   - 없으면 추가

6. **격리 테스트**
   ```bash
   pnpm test --filter=@onword/agent <tool-name>
   ```

7. **통합 테스트**
   - 대시보드에서 Action 버튼 클릭 → trace_steps에 기록되는지 확인

8. **커밋**
   ```bash
   git commit -m "tool: add <tool-name>
   - 무엇을 자동화하는지
   - AI_DOCS 어느 부분 구현인지"
   ```

## 체크리스트 (완료 전 확인)

- [ ] tools.ts에 정의 추가
- [ ] types/index.ts에 I/O 타입 정의
- [ ] 테스트 3개 이상 통과
- [ ] AI_DOCS 예시로 통과 확인
- [ ] generated_assets 테이블에 결과 저장
- [ ] Orchestrator에서 호출 가능
- [ ] 외부 의존성 실패 시 graceful fallback
- [ ] CLAUDE.md §2 절대 규칙 준수

## 인자

$ARGUMENTS — tool 이름과 단계 번호 (예: "generate-announcement 2")
