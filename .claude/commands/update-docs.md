새로 발견한 도메인 지식이나 패턴을 AI_DOCS에 추가한다.
이게 *compound engineering*의 핵심 — 매 학습이 영원히 자산이 된다.

## 언제 호출

- 클라이언트로부터 새 요구사항 들음
- 외부 API 동작 방식 새로 알게 됨
- 같은 패턴을 반복해 작성하고 있음을 발견
- Reviewer가 "AI_DOCS에 추가하라" 코멘트

## 절차

1. **학습 내용 정리**
   - 한 줄 요약 (제목)
   - 컨텍스트 (어떤 상황에서 발견)
   - 구체적 사실 (코드, 데이터, 인용)

2. **어디에 추가할지 결정**

| 학습 종류 | 추가 위치 |
|---|---|
| 워크플로우 단계 변경/추가 | AI_DOCS/workflow-9-steps.md |
| 카카오 텍스트 형식 변경 | AI_DOCS/kakao-text-format.md |
| 네이버 크롤링 함정 | AI_DOCS/naver-crawl-strategy.md |
| 이미지 합성 기법 | AI_DOCS/poster-composition.md |
| DB 스키마 변경 | AI_DOCS/data-model.md |
| 클라이언트 결정 | AI_DOCS/client-requirements.md |
| 새 영역 (위에 없음) | 새 파일 생성 |

3. **CLAUDE.md §7 호출 트리거 표 업데이트**
   - 새 파일 추가 시 *언제 읽어야 하는지* 명시

4. **커밋**
   ```bash
   git commit -m "docs: AI_DOCS에 <학습 제목> 추가
   
   - 발견 컨텍스트: ...
   - 영향받는 tool/feature: ..."
   ```

5. **현재 작업 중인 에이전트들에게 알림**
   - "AI_DOCS/<파일> 업데이트됨. 다음 작업 시 반드시 다시 Read."

## 절대 하지 말 것

- 너무 추상적인 학습 ("코드를 잘 짜야 한다")
- 일회성 디버깅 노트 (이건 git 커밋 메시지에)
- 검증 안 된 추측 ("아마 이럴 것이다") — `[낮음]` 태그 필수

## 인자

$ARGUMENTS — 추가할 학습 내용 (자유 형식).
