# Claude Code 에이전틱 개발 방법론 — 참조 전용 (on-demand)

> **이 파일은 매 턴 자동 로드되지 않는다.** 같은 폴더의 `CLAUDE.md`(슬림, 164줄)가 매 턴 로드되고, **필요할 때만** Claude가 이 파일을 Read 도구로 직접 가져온다.
>
> 그렇게 한 이유: 이 파일 727줄을 매 턴 컨텍스트에 박으면 (1) 토큰 낭비, (2) 사소한 요청에 과잉 규칙 적용, (3) 모델이 방법론을 답변에 토해내는 부작용이 생긴다. **CLAUDE.md = 항상 적용되는 운영 규칙, methodology.md = 깊이 필요할 때 참조하는 사전.** 이 분리가 핵심.
>
> **AI가 이 파일을 읽어야 하는 트리거** (CLAUDE.md §7에 명시되어 있음):
> - PRD/TRD 작성 → §1, §2
> - 비자명한 변경 plan → §3
> - Taste / 코드 품질 판단 → §5
> - TDD 사이클 헷갈림 → §6
> - MCP 설정 → §7
> - 도메인 한계 확인 → §8
> - 책 원문 인용 필요 → §5.1, §4.2, §7.8
> - 용어/명령 헷갈림 → §12, §13
>
> 출처: 『클로드 코드 마스터 — 기획·개발·운영이 한 번에 끝나는 AI 에이전틱 코딩 워크 플로』(이남희·백승현, 2026), **Chapter 3** (책 144–195쪽).

---

## 목차

0. [출처와 신뢰 수준 표기 규칙](#0-출처와-신뢰-수준-표기-규칙)
1. [왜 설계가 중요한가 (§3.1)](#1-왜-설계가-중요한가-31)
2. [설계 방법론 — 한 번에 하나의 설계 요소 (§3.2)](#2-설계-방법론--한-번에-하나의-설계-요소-32)
3. [컨텍스트 제공 기술 (§3.3)](#3-컨텍스트-제공-기술-33)
4. [단계적 구현 — 브랜치·커밋 전략 (§3.4)](#4-단계적-구현--브랜치커밋-전략-34)
5. [AI에게 줄 것 — Taste와 개발자의 책임 (§3.5)](#5-ai에게-줄-것--taste와-개발자의-책임-35)
6. [AI 시대의 TDD (§3.6)](#6-ai-시대의-tdd-36)
7. [MCP 설정 — 외부 시스템 연결 (§3.7)](#7-mcp-설정--외부-시스템-연결-37)
8. [책 바깥 — 도메인 지식의 한계](#8-책-바깥--도메인-지식의-한계)
9. [공식 도구 매핑 (책 → claude-code-expert/example 리포)](#9-공식-도구-매핑)
10. [절대 규칙 — 사용자 명시 승인 없이 금지](#10-절대-규칙--사용자-명시-승인-없이-금지)
11. ["완료" 점검표](#11-완료-점검표)
12. [핵심 용어 미니 사전](#12-핵심-용어-미니-사전)
13. [Claude Code 명령어 빠른 참조](#13-claude-code-명령어-빠른-참조)
14. [부록 A — 알려진 한계](#부록-a--알려진-한계)
15. [부록 B — 갱신 트리거](#부록-b--갱신-트리거)

---

## 0. 출처와 신뢰 수준 표기 규칙

이 문서의 비자명한 주장은 다음 태그 중 하나를 가진다. AI도 사람도 이 태그를 보고 행동 강도를 조절한다.

| 태그 | 의미 | 행동 지침 |
|---|---|---|
| `[높음]` | 책 또는 공식 리포에서 **직접 확인** | 그대로 적용 |
| `[중간]` | 책 + 외부 표준·공식 문서 **교차 확인** | 적용하되 한 번 더 검증 |
| `[낮음]` | OCR 약한 구간의 합리적 추정 | 원본 직접 확인 권장 |
| `[미확인]` | 본문에 명시. 빈 자리. | 사용자/프로젝트가 직접 채워야 함 |

**1차 출처:** 이남희·백승현, 『클로드 코드 마스터』, 2026, **Chapter 3** (책 pp.144–195).
**2차 출처:** 공식 리포 [`claude-code-expert/example`](https://github.com/claude-code-expert/example) (책의 모든 템플릿·스킬·훅·규칙 실물).

---

## 1. 왜 설계가 중요한가 (§3.1)

### 1.1 핵심 명제 [높음]

> AI 코드 도구 시대에 설계 없이 바로 시작하는 것은 코드의 운명을 결정짓는다. AI는 주어진 지시 방식을 그대로 따르기 때문에, 먼저 계획하고 구조를 생각하고 전체 개요를 잡은 뒤에 코드를 쓰게 해야 한다.

설계는 코드의 **속도** 문제가 아니라 **유지보수성과 확장성**의 문제다. AI는 "TODO 앱 만들어줘"라고 하면 즉시 코드를 생성하지만, 그 시점에 박힌 구조적 결정은 나중에 거의 되돌릴 수 없다.

### 1.2 설계 없는 개발이 누적시키는 비용 [높음] — 책 §1.2 시나리오

| 시점 | 작업 요청 | 누적 비용 |
|---|---|---|
| **1일차** | "TODO 앱 만들어줘" — AI가 CRUD 웹 앱 생성 | 즉시 작동 |
| **3일차** | "팀 공유 기능 추가해" — 인증·권한 시스템 급조 | 기존 코드 일부 재작성 |
| **7일차** | "SaaS 서비스로 확장하고 싶어" — 멀티테넌시 도입 | 전면 재작성 |
| **14일차** | "온프레미스 설치 옵션 필요" — 환경 설정 시스템 재설계 | 처음부터 다시 |

설계 없이 시작한 코드는 변경이 누적될 때 **선형이 아니라 기하급수적으로** 비용이 든다. 처음 설계에 들이는 시간은 이 누적을 막는 보험이다.

### 1.3 AI에게 코드를 시키기 전에 결정해야 할 5가지 [높음]

다음이 정해지기 전에는 어떤 implementation 코드도 쓰지 않는다.

1. **요구사항 분석** — 무엇을 만들 것인가, 핵심 기능과 비기능 요구사항
2. **아키텍처 결정** — 어떤 구조와 규모로, 어떤 패턴이 적합한지
3. **기술 스택** — 언어, 프레임워크, DB, 인증, 배포
4. **API / 데이터 모델** — 인터페이스 명세, 스키마, 에러 코드
5. **완료 기준 (Done Criteria)** — 무엇을 보면 끝났다고 할 것인가

---

## 2. 설계 방법론 — 한 번에 하나의 설계 요소 (§3.2)

### 2.1 한 번에 하나 원칙 [높음]

설계를 한꺼번에 전부 하려고 하지 말 것. **한 번에 하나의 요소만** 결정한다. 결정한 요소를 문서로 박은 다음 다음 요소로 넘어간다.

권장 순서:

```
요구사항 → 기술 스택 → 데이터 모델 → API 계약 → 에러 코드 → 완료 기준
```

각 단계에서 AI에게 "이것만 결정하자"라고 명시적으로 제한한다. AI가 결정되지 않은 영역을 추측해 채우는 것을 막는다.

### 2.2 컨텍스트 표 (Context Table) [높음]

AI에게 정보를 줄 때 다음 4축으로 구조화한다.

| 분류 (Category) | 형식 (Form) | 내용 (What) | 완료 기준 (Done Criteria) |
|---|---|---|---|
| 어떤 정보인가 | 어떻게 표현할 것인가 | 구체적 내용은 무엇인가 | 무엇으로 완료를 판단할 것인가 |

**예시 — 사용자 등록 API:**

| 분류 | 형식 | 내용 | 완료 기준 |
|---|---|---|---|
| 엔드포인트 | REST | `POST /api/auth/register` | 200 응답 + DB row 생성 |
| 요청 본문 | JSON schema | `{name, email, password}` | Zod 검증 통과 |
| 응답 본문 | JSON schema | `{id, name, email, avatar_url, created_at}` | 비밀번호 미노출 확인 |
| 에러 코드 | HTTP 상태 | 400 (validation), 409 (중복 이메일), 500 (서버) | 각 코드별 통합 테스트 통과 |

표를 채우는 동안 **추측이 들어간 자리는 그 자리에서 사용자에게 묻는다.** 묻지 않고 채우면 그게 곧 잘못된 가정으로 굳어진다.

---

## 3. 컨텍스트 제공 기술 (§3.3)

### 3.1 6슬롯 컨텍스트 블록 [높음]

비자명한 작업을 AI에게 시키기 전에 다음 6슬롯을 채운 컨텍스트 블록을 먼저 만든다. 비어 있는 슬롯은 비어 있다고 명시 — **가짜로 채우는 것보다 빈 슬롯이 낫다.**

1. **과제 (Task)** — 한 문장: 무엇을 + 왜
2. **읽을 파일 (Files to read)** — Claude가 작업 전에 반드시 읽어야 할 정확한 경로
3. **따라야 할 패턴 (Patterns to mirror)** — "`auth/login.ts`의 에러 처리 방식을 그대로 따른다"
4. **제약 (Constraints)** — 성능 예산, 호환성, 보안, 스타일 규칙
5. **범위 밖 (Out of scope)** — 관련 있어 보이지만 이번 변경에는 포함하지 않는 것
6. **완료 기준 (Done criteria)** — 관찰 가능한 성공 (테스트 통과, curl X 반환, UI에 Y 표시)

### 3.2 슬롯 채우기 규칙 [높음]

- 한 슬롯에 한 가지 답만. 두 가지 가능성이 떠오르면 그 자리에서 사용자에게 묻는다
- "범위 밖" 슬롯은 비워두지 않는다. **항상 무언가가 범위 밖이다.** 비어 있으면 범위가 미정의된 것 — AI가 마음껏 확장
- "읽을 파일" 슬롯의 경로는 추측 금지 — 실제로 존재하는 파일만

---

## 4. 단계적 구현 — 브랜치·커밋 전략 (§3.4)

### 4.1 작은 슬라이스 원칙 [높음]

한 번에 하나의 변경, 한 번에 하나의 커밋. **한 커밋이 한 줄로 설명되지 않으면 그 커밋은 너무 크다.**

### 4.2 브랜치 전략 — 책 p.160 verbatim [높음]

> AI에게 새로운 방식을 시도하게 할 때는 **별도 브랜치**에서 작업하는 것이 안전하다. 실험이 성공하면 메인 브랜치에 병합하고, 실패하면 브랜치를 삭제하면 된다. 특히 대규모 리팩터링이나 아키텍처 변경을 AI에게 맡길 때는 반드시 별도 브랜치에서 진행해야 한다. 이런 작업은 예상보다 광범위한 변경을 수반하는 경우가 많고, 실패했을 때 복구하기 어려울 수 있다.

**규칙:**
- 실험적/대규모 작업 → 별도 브랜치 의무
- 안전한 점진적 변경 → 메인 브랜치 가능

### 4.3 커밋 메시지 형식 — 책 §3.4 그대로 [높음]

**형식:**

```
[타입] 간단한 설명 (50자 이내)
- 상세 내용 1
- 상세 내용 2
- AI 에이전트 사용 여부 (선택)
```

**타입 prefix 표 (책 표 3-3):**

| 타입 | 용도 | 설명 |
|---|---|---|
| `feature` 혹은 `feat` | 새 기능 | 새로운 기능 추가 |
| `fix` | 버그 수정 | 버그 및 오류 수정 |
| `debug` | 디버깅 | 디버깅 과정에서의 수정 |
| `refactor` | 리팩토링 | 기능 변경 없이 코드 개선 |
| `db` | 데이터베이스 | 스키마, 마이그레이션, 쿼리 변경 |
| `api` | API | API 엔드포인트 추가/수정 |
| `ui` | UI/UX | 프런트엔드 UI 변경 |
| `test` | 테스트 | 테스트 코드 추가/수정 |
| `docs` | 문서화 | 문서·주석 추가/수정 |

> **참고:** Conventional Commits 표준(`feat/fix/refactor/perf/test/docs/chore/build/ci`)과 비교 시 책의 표는 `db/api/ui`를 별도 타입으로 분리한다. **프로젝트 시작 시 하나만 골라 `CLAUDE.md`에 명시하고 그것만 유지한다.**

### 4.4 커밋 시점 [높음]

다음 중 하나가 발생했을 때 커밋한다:

- 모든 테스트가 통과한 시점
- 컴파일러/린터 경고가 해결된 시점
- 하나의 논리적 변경 단위가 완료된 시점
- 구조적 변경(리팩토링)이 완료된 시점

**여러 변경을 한 커밋에 섞지 않는다.** 특히 **구조적 변경과 행동적 변경을 같은 커밋에 넣지 않는다** (§6.5 Tidy First).

---

## 5. AI에게 줄 것 — Taste와 개발자의 책임 (§3.5)

### 5.1 Taste 정의 — 책 p.162 verbatim [높음]

> 옷을 고르는 안목, 그리고 장기적으로 유지보수가 쉬운 구조를 설계하는 직관이 모두 Taste에 해당한다. Taste는 수년간의 경험을 통해 축적된다. 버그를 디버깅하면서 '그럴듯해 보이는' 해결책이 왜 문제를 일으키는지 깨닫고, 코드를 유지보수하면서 어떤 구조가 시간이 지나도 견고한지 체득하며, 팀원들과 코드 리뷰를 하면서 가독성의 가치를 깨닫는 등의 경험들이 쌓여 개발자 고유의 판단 기준이 형성된다.

**Taste란 무엇인가:** 작동하는 코드와 좋은 코드를 구별하는 직관. 경험에서만 나온다. **AI는 Taste를 갖지 않는다. 개발자가 Taste의 책임자다.**

### 5.2 '작동하는 코드' vs '좋은 코드' — 책의 실제 예시 [높음] (책 p.162)

AI에게 "할 일 목록을 필터링하는 기능을 만들어줘"라고 요청했을 때:

**AI가 생성한 코드 (작동하는 코드):**

```typescript
function filterTodos(todos: Todo[], filter: string) {
  if (filter === 'all') {
    return todos;
  } else if (filter === 'active') {
    return todos.filter(todo => !todo.completed);
  } else if (filter === 'completed') {
    return todos.filter(todo => todo.completed);
  } else {
    return todos;
  }
}
```

**숙련된 개발자가 개선한 코드 (좋은 코드):**

```typescript
type FilterType = 'all' | 'active' | 'completed';

const filterStrategies: Record<FilterType, (todo: Todo) => boolean> = {
  all: () => true,
  active: (todo) => !todo.completed,
  completed: (todo) => todo.completed,
};
```

**차이점:**
- `filter: string` → `FilterType` 유니온 타입 (잘못된 값 컴파일 타임 차단)
- 조건문 분기 → 전략 객체 (새 필터 추가 시 O(1))
- 암묵적 fallback (`else { return todos }`) 제거 — 타입 시스템이 강제

**핵심:** AI의 출력은 **출발점이지 종점이 아니다.** 개발자의 Taste로 한 번 더 거른다.

### 5.3 비즈니스 맥락 이해하기 [높음]

AI는 비즈니스 맥락을 모른다. TDD를 할지 말지, 어디까지 견고하게 만들지, 어떤 케이스를 우선할지는 **개발자가 비즈니스 관점에서 결정한다**:

- 이 기능은 반드시 견고해야 하는가, 빠르게 보여주고 나중에 리팩토링할 것인가?
- 이 에러 케이스는 실제로 발생할 수 있는가, 이론적으로만 가능한가?
- 이 성능 최적화는 측정된 병목인가, 추측된 병목인가?

AI에게 위 질문에 대한 답을 컨텍스트로 명시적으로 줘야 한다. 안 주면 AI는 **모든 케이스를 동등하게 견고하게** 만들려 하고, 그 결과는 과잉 엔지니어링이다.

---

## 6. AI 시대의 TDD (§3.6)

### 6.1 왜 TDD가 AI 시대에 더 중요한가 [높음]

AI는 코드를 빠르게 생성한다. 검증 없이 코드가 쌓이는 속도가 사람보다 훨씬 빠르다. 테스트가 없으면 코드의 정확성을 검증할 방법이 없고, 잘못된 코드 위에 또 잘못된 코드가 쌓인다.

**TDD는 AI 시대 이전부터 있던 기법이지만, AI 시대에는 선택이 아니라 안전장치다.**

**철칙:** 실패하는 테스트 없이 프로덕션 코드를 작성하지 않는다. **테스트가 실패하는 것을 직접 보지 않았다면, 그 테스트가 올바른 것을 검증하는지 알 수 없다.**

### 6.2 비즈니스 맥락 기반 TDD 결정 [높음]

전체에 TDD를 적용하지 않는다. **비즈니스 관점에서 결정한다:**

| 영역 | TDD 강제? |
|---|---|
| 비즈니스 로직, 결제, 권한 | **강제** |
| 라이브러리·API 안정 계약 | **강제** |
| 일반 CRUD, UI | 권장 (테스트 후행 가능) |
| 프로토타입, 실험, 데모 | 선택 (출시 시 추가) |
| 일회용 스크립트, 인프라 코드 | 생략 가능 (이유 명시) |

프로젝트의 `CLAUDE.md`에 기본 자세를 하나 정하고, 영역별 예외를 명시한다.

### 6.3 Red-Green-Refactor 사이클 [높음]

```
  ┌─────────┐      ┌─────────┐      ┌───────────┐
  │ 🔴 RED  │ ───→ │ 🟢 GREEN│ ───→ │🔵 REFACTOR│
  │  실패   │      │  최소   │      │   정리    │
  │ 테스트  │      │  코드   │      │           │
  └─────────┘      └─────────┘      └───────────┘
       ↑                                   │
       └───────────────────────────────────┘
```

1. **RED — 실패하는 테스트 작성**
   - 가장 단순한 실패 케이스 하나
   - 실행하여 **실패 확인 필수**
   - 실패 메시지가 예상과 일치하는지 확인
2. **GREEN — 통과시키는 최소 코드**
   - 통과시키기 위한 **가장 단순한** 코드
   - 하드코딩 허용 (다음 사이클에서 일반화)
   - YAGNI — 테스트가 요구하지 않는 것은 만들지 않는다
3. **REFACTOR — 정리**
   - 테스트는 계속 통과 상태 유지
   - 중복 제거, 네이밍 개선
   - **행동(behavior) 변경 금지**

### 6.4 TDD 실제 예시 — EmailValidator [높음]

공식 리포 `skills/test-driven-development.md`의 예시. **TDD가 실제로 어떻게 진행되는지** 보여주는 가장 작은 예.

**1단계 RED — 테스트 먼저 짜기:**

```typescript
// src/utils/validation.test.ts
import { validateEmail } from './validation';

describe('validateEmail', () => {
  test('빈 이메일을 거부한다', () => {
    expect(() => validateEmail('')).toThrow('이메일은 필수입니다');
  });

  test('유효하지 않은 형식을 거부한다', () => {
    expect(() => validateEmail('invalid')).toThrow('이메일 형식이 올바르지 않습니다');
  });

  test('유효한 이메일을 허용한다', () => {
    expect(validateEmail('user@example.com')).toBe('user@example.com');
  });
});
```

**실행 결과 (실패 확인):**

```
$ npm test validation
FAIL  src/utils/validation.test.ts
  ● validateEmail › 빈 이메일을 거부한다
    Cannot find module './validation'
```

**2단계 GREEN — 통과시키는 최소 코드:**

```typescript
// src/utils/validation.ts
export function validateEmail(email: string): string {
  if (!email) {
    throw new Error('이메일은 필수입니다');
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new Error('이메일 형식이 올바르지 않습니다');
  }
  
  return email;
}
```

**실행 결과:**

```
$ npm test validation
PASS  src/utils/validation.test.ts
  ✓ 빈 이메일을 거부한다
  ✓ 유효하지 않은 형식을 거부한다
  ✓ 유효한 이메일을 허용한다
```

세 테스트 모두 통과. 이게 GREEN. 다음 단계 REFACTOR에서는 행동이 같은 상태로 코드를 정리한다.

### 6.5 Small, Safe Steps — 3단계 복잡도 [높음]

테스트는 항상 가장 단순한 것부터 시작해서 한 단계씩 복잡도를 올린다.

| 단계 | 예시 (이메일 검증) | 사이클 |
|---|---|---|
| 1단계: 단순 | `validateEmail('')` → 에러 발생 | RED → GREEN → REFACTOR |
| 2단계: 중간 | `validateEmail('invalid')` → 에러 발생 | RED → GREEN → REFACTOR |
| 3단계: 고급 | `validateEmail('a@b.c')` → 통과 | RED → GREEN → REFACTOR |

각 단계에서 RED → GREEN → REFACTOR를 한 사이클씩 돈다. **한 사이클에 여러 단계를 압축하지 않는다.**

### 6.6 Tidy First — 구조 변경과 행동 변경 분리 [높음]

Kent Beck의 *Tidy First*에 따라 두 종류의 변경을 절대 같은 커밋에 섞지 않는다.

| 변경 종류 | 정의 | 예시 |
|---|---|---|
| **구조적 변경 (Structural)** | 행동은 그대로, 모양만 바꿈 | 변수 이름, 함수 추출, 파일 이동, 들여쓰기 |
| **행동적 변경 (Behavioral)** | 코드가 *하는 일*이 바뀜 | 새 기능, 버그 수정, 알고리즘 변경 |

**규칙:**
- 구조적 변경 커밋과 행동적 변경 커밋을 분리한다
- 같은 PR 안에서도 별도 커밋으로 분리
- `refactor:` prefix는 구조적 변경에만 사용
- 새 기능 + 정리가 동시에 떠오르면 → 정리부터 먼저 (Tidy First), 깨끗해진 코드 위에 새 기능 추가

### 6.7 Make it work, Make it right, Make it fast [높음] — Kent Beck

```
1. Make it work   → 일단 작동하게 만든다 (RED → GREEN)
2. Make it right  → 구조를 바로잡는다 (REFACTOR)
3. Make it fast   → 측정 후 최적화한다 (필요할 때만)
```

**`fast`는 마지막이다.** 측정 없이 최적화하지 않는다. 측정된 병목만 최적화한다.

### 6.8 위험 신호 — 즉시 중단 [높음]

| 신호 | 대응 |
|---|---|
| 테스트 전에 코드를 작성함 | 작성한 코드 삭제 후 재시작 |
| 테스트가 바로 통과 | 테스트가 잘못됨. 실패하도록 수정 |
| "이번만 생략" | 합리화. TDD로 복귀 |
| 한 테스트에 여러 단언 | 분리. 한 테스트 = 한 단언 |
| 테스트가 구현을 따라감 | 행동을 표현하도록 다시 씀 |

### 6.9 테스트 이름 규칙 [높음]

- 테스트 이름은 **행동을 도메인 언어로 기술**한다
- 예: ✅ `rejects emails without @` / ❌ `calls regex.test`
- 예: ✅ `빈 이메일을 거부한다` / ❌ `validateEmail returns false`
- 좋은 테스트 이름은 **테스트 코드를 보지 않고도 무엇을 검증하는지 알 수 있어야 함**

---

## 7. MCP 설정 — 외부 시스템 연결 (§3.7)

### 7.1 MCP가 무엇인가

**MCP (Model Context Protocol)** — Anthropic이 정의한 표준. Claude가 외부 시스템(GitHub, DB, Slack, Sentry 등)에 접근할 수 있게 해준다.

**비유:**
- Claude Code = 노트북 본체
- MCP 서버 = USB 어댑터
- 어댑터를 끼우면 새 기능 추가 (PR 생성, DB 쿼리, 에러 로그 조회…)

### 7.2 두 가지 전송 방식 [높음]

| 방식 | 용도 | 명령 |
|---|---|---|
| **HTTP** | 외부 호스팅 MCP 서버 (Sentry, GitHub 등) | `claude mcp add --transport http <name> <url>` |
| **stdio** | 로컬 프로세스 (Context7 등) | `claude mcp add --transport stdio <name> -- npx <package>` |

### 7.3 Scope — 3가지 저장 위치 [높음] — 책 표 3-4

| Scope | 저장 위치 | 용도 |
|---|---|---|
| `local` | `~/.claude.json` (프로젝트 경로 하위) | 개인, 현재 프로젝트만 |
| `project` | `.mcp.json` (프로젝트 루트) | 팀 공유, 버전 관리 |
| `user` | `~/.claude.json` | 전역, 모든 프로젝트 |

**규칙:**
- 팀 공유 서버 → `project` scope (`.mcp.json` 커밋)
- 개인 토큰 포함된 서버 → `local` 또는 `user` scope
- **API 키는 절대 `project` scope에 넣지 않는다 — 환경 변수로 처리**

### 7.4 필수 MCP 서버 [높음] — 책 §3.7.2 표 3-5

기술 스택과 무관하게 권장되는 MCP 서버:

| MCP 서버 | 용도 | 설치 명령 |
|---|---|---|
| **GitHub** | PR 생성, 이슈 관리, 코드 검색 | HTTP, GitHub PAT 필요 (§7.5 참고) |
| **Context7** | 최신 라이브러리 문서 조회 | `claude mcp add context7 -- npx -y @upstash/context7-mcp` |
| **PostgreSQL** | DB 스키마 조회, 쿼리 실행 | PostgreSQL 사용 프로젝트만 |
| **Sentry** | 에러 모니터링, 디버깅 | `claude mcp add --transport http sentry https://mcp.sentry.dev/mcp` |
| **LSP** | 편집기와 언어 사이의 통신규약 | 언어별 설정 (TypeScript, Python 등) |

> 책이 상세 설명을 제공하는 것은 **GitHub, Context7, LSP 3종**. PostgreSQL/Sentry는 프로젝트 스택에 따라 선택.

### 7.5 GitHub PAT(Personal Access Token) 설정 [높음]

1. GitHub → Settings → Developer settings → Personal access tokens
2. Generate new token (classic) 선택
3. 토큰 이름 (예: `claude-code-integration`), 만료기간 (권장: 90 days)
4. 스코프 선택:
   - `repo` (전체 저장소 접근)
   - `read:org` (조직 정보 — 필요 시)
5. 생성된 토큰은 즉시 환경 변수로 저장. **깃에 절대 커밋하지 않는다.**

```bash
# ~/.zshrc 또는 ~/.bashrc에 추가
export GITHUB_PAT="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

# Claude Code에 추가
claude mcp add --transport http github https://api.github.com/graphql \
  --header "Authorization: Bearer $GITHUB_PAT"
```

### 7.6 MCP 발견 서비스 [높음]

새 MCP 서버를 찾을 때 사용:

| 명칭 | URL | 용도 |
|---|---|---|
| Smithery | [smithery.ai](https://smithery.ai) | MCP 서버 카탈로그 |
| MCP Market | [mcp-market.com](https://mcp-market.com) | MCP 서버 정리 |
| GitHub MCP Servers | [github.com/modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers) | 공식 MCP 서버 모음 |
| Docker MCP Catalog | hub.docker.com (검색: `mcp`) | Docker 기반 MCP 서버 |

### 7.7 MCP 사용 시 주의사항 [높음] — 책 p.192 verbatim

**보안:**
- **비공식 MCP 서버 주의** — 검증되지 않은 코드는 보안 위험이 있을 수 있다
- **프롬프트 인젝션 주의** — 외부 콘텐츠를 가져오는 MCP 서버는 악의적 프롬프트가 주입될 수 있다
- **자격 증명 관리** — API 키, 토큰 등은 환경 변수로 관리하고 코드에 직접 노출하지 않는다

**성능:**
- **토큰 소비** — MCP 서버가 반환하는 데이터가 크면 컨텍스트 윈도우를 많이 소비한다
- **기본 제한** — 1만 토큰 초과 시 강제로 잘림
- **제한 조정** — 필요 시 환경 변수로 조정:

```bash
# MCP 출력 토큰 제한을 5만으로 설정
export MAX_MCP_OUTPUT_TOKENS=50000
```

### 7.8 §3.7.3 확장 기능 사용의 원칙 [높음] — 책 p.192 verbatim

> 많이 설정한다고 좋은 것이 아니다. Skill, Hook, MCP 등 클로드 코드의 확장 기능은 강력하지만, 무조건 많이 설정하는 것은 좋지 않다. 오히려 많은 설정으로 인해 토큰이 낭비될 수도 있고, 의도한 방향대로 동작이 일어나지 않는 경우도 생긴다.

**많은 설정이 가져오는 문제 (책 표 3-6):**

| 문제 | 설명 |
|---|---|
| 토큰 낭비 | 사용하지 않는 MCP의 도구 정의도 컨텍스트에 추가되어 토큰을 소비한다 |
| 응답 지연 | 연결된 MCP 서버가 많을수록 초기화 시간이 길어진다 |
| 의도치 않은 동작 | 여러 도구가 충돌하거나, AI가 잘못된 도구를 선택할 수 있다 |
| 디버깅 어려움 | 문제 발생 시 어떤 확장이 원인인지 파악하기 어렵다 |

**원칙:**
- 프로젝트별로 **필요한 MCP만** 활성화. 전역(`user` scope)에 다 박지 않는다
- Hook은 자동 검증·자동 포맷 같은 **결정적인 작업**에만. AI 판단이 필요한 영역엔 Hook을 쓰지 않는다
- Skill은 **반복되는 워크플로**(TDD, 코드 리뷰 등)에만. 일회성 작업은 Skill로 만들지 않는다

---

## 8. 책 바깥 — 도메인 지식의 한계

> **중요. 이 문서는 "AI와 어떻게 협업할 것인가"의 방법론이다. "무엇을 만들 것인가"의 도메인 지식은 다루지 않는다.** 책 전체(Part 1·2·3)에서 다루지 않는다. [높음]

다음은 별도 학습이 필요한 영역이다. AI에게 이 영역의 코드를 시키기 전에 — 반드시 1차 출처(공식 문서, 법령, RFC, 표준)에서 직접 학습한 사람이 컨텍스트로 입력한다. **책 또는 이 문서를 도메인 출처로 인용하지 않는다.**

| 도메인 | 1차 출처 / 별도 학습 자료 |
|---|---|
| **전자상거래** | Saleor/Medusa source, commercetools docs |
| **결제 (한국)** | [PortOne 문서](https://developers.portone.io), [Toss Payments 문서](https://docs.tosspayments.com) |
| **결제 (글로벌)** | [Stripe 문서](https://stripe.com/docs) |
| **개인정보 (한국)** | [PIPA 법령](https://www.law.go.kr) |
| **세무·전자상거래** | [국세청 홈택스](https://www.hometax.go.kr), 통신판매업 신고는 관할 구청 |
| **인증·인가** | OAuth 2.0 RFC 6749, NextAuth.js docs |
| **검색** | Postgres FTS / Elasticsearch / Algolia / Meilisearch 공식 문서 |
| **성능** | Web Vitals, CDN(Cloudflare/Vercel Edge) 문서 |
| **신뢰성** | SRE Book (Google), 사고 대응 RUNBOOK |
| **호스팅·배포** | [Vercel 문서](https://vercel.com/docs), [Cloudflare 문서](https://developers.cloudflare.com) |

---

## 9. 공식 도구 매핑

책의 방법론을 실행 가능한 도구로 매핑한 것이 공식 리포 [`claude-code-expert/example`](https://github.com/claude-code-expert/example)이다. 이 리포는 책 저자가 직접 운영한다.

| 책의 원칙 | 매칭되는 도구 | 위치 |
|---|---|---|
| 설계 먼저 (§3.1) | `template/CLAUDE.md`, `template/AGENTS.md` | [공식 `template/`](https://github.com/claude-code-expert/example/tree/main/template) |
| 컨텍스트 표 (§3.2–3.3) | 직접 작성 (이 문서 §2.2·§3.1 참고) | — |
| 단계적 구현 / 커밋 prefix (§3.4) | 직접 작성 + 깃 워크플로 | — |
| TDD RGR (§3.6) | `skills/test-driven-development.md` (Skill) | [공식 `skills/`](https://github.com/claude-code-expert/example/tree/main/skills) |
| 코드 리뷰 (Taste 보강) | `skills/code-reviewer.md` (Skill) | 같은 곳 |
| 보안 점검 | `.claude/commands/security-checklist.md` | [공식 `.claude/commands/`](https://github.com/claude-code-expert/example/tree/main/.claude/commands) |
| MCP 설정 (§3.7) | `claude mcp add ...` CLI 직접 명령 | Claude Code 내장 |
| 자동 포맷·린트·테스트 | 공식 `.claude/hooks/` 12개 | [공식 `.claude/hooks/`](https://github.com/claude-code-expert/example/tree/main/.claude/hooks) |
| 경로별 규칙 | 공식 `.claude/rules/` (api-routes / frontend / testing / database) | [공식 `.claude/rules/`](https://github.com/claude-code-expert/example/tree/main/.claude/rules) |
| 전문 에이전트 | 8개 서브에이전트 | [`claude-code-expert/subagents`](https://github.com/claude-code-expert/subagents) |

**친구를 위한 권장 셋업 순서:**

```bash
# 1. 공식 리포 clone
git clone https://github.com/claude-code-expert/example.git ~/code/claude-code-expert-example

# 2. 스킬 전역 설치 (TDD, code-reviewer, react-component)
mkdir -p ~/.claude/skills
cp ~/code/claude-code-expert-example/skills/*.md ~/.claude/skills/

# 3. 슬래시 명령 전역 설치 (/optimize, /security-checklist)
mkdir -p ~/.claude/commands
cp ~/code/claude-code-expert-example/.claude/commands/*.md ~/.claude/commands/

# 4. 새 프로젝트에서:
#    - template/CLAUDE.md를 복사해서 프로젝트 루트에 두고
#    - 그 안에 이 methodology.md를 @로 import
#    - .claude/hooks/, .claude/rules/ 필요한 것만 복사
```

---

## 10. 절대 규칙 — 사용자 명시 승인 없이 금지

이 규칙들은 **모든 변경 위에 우선한다.** AI는 다음 행위를 사용자의 명시적 승인 없이 수행하면 안 된다.

- 🚫 **파괴적 git 명령** (사용자 명시 요청 시에만): `push --force` to main/master, `reset --hard`, `branch -D`, `clean -fd`
- 🚫 **훅 우회** (사용자 명시 요청 시에만): `--no-verify`, `--no-gpg-sign`
- 🚫 **프로덕션 변경** (사용자 확인 필수): 프로덕션 DB 마이그레이션, 배포, 환경 변수·비밀 변경
- 🚫 **외부 메시징** (사용자 확인 필수): 원격 푸시, PR 생성·종료, Slack·이메일·GitHub 게시
- 🚫 **민감 콘텐츠 외부 업로드** (사용자 확인 필수)
- 🚫 **금융 행위**: 거래·송금·주문. 절대.
- 🚫 **근본 원인 우회**: lint·test·lock 실패 시 우회 금지. 원인을 고친다
- 🚫 **추측 채움**: 가정으로 채우지 않는다. 모르면 묻는다
- 🚫 **범위 외 작업**: 요청 외 기능·추상화·주석·리팩토링 추가 금지
- 🚫 **불필요한 방어 코드**: 내부 함수에 try/catch 남발 금지. 시스템 경계에서만 검증한다

---

## 11. "완료" 점검표

다음이 모두 ✅ 되기 전에는 "완료"라고 말하지 않는다.

- [ ] 작성한 diff가 사전 plan과 일치 (이탈은 명시적으로 설명되어 있음)
- [ ] 범위 밖 변경은 롤백되거나 별도 작업으로 분리됨
- [ ] 테스트 실행 후 통과 확인 ("작동할 것 같음" 신뢰 금지)
- [ ] UI 변경: 실제 브라우저에서 동작 확인
- [ ] 데이터 변경: 실제 데이터 형태 쿼리로 확인 (마이그레이션 로그만으론 부족)
- [ ] 커밋 메시지는 *왜*를 설명 (*무엇*은 diff가 이미 보여줌)
- [ ] 구조적 변경과 행동적 변경이 같은 커밋에 섞이지 않음 (Tidy First)
- [ ] 비자명한 변경이면 plan 문서를 `planning/archive/` 로 이동

---

## 12. 핵심 용어 미니 사전

이 문서를 읽을 때 헷갈리면 돌아오는 자리. 더 깊은 정의는 표준 자료 참고.

| 용어 | 비기술적 정의 |
|---|---|
| **Claude Code** | Anthropic의 AI 코딩 도구. 터미널에서 자연어로 시키면 파일을 직접 읽고·수정하고·명령을 실행 |
| **Git** | 코드의 변경 이력을 시간순으로 기록하는 시스템. Word의 "변경 내용 추적" 강화판 |
| **저장소 (Repository)** | 코드 + 모든 변경 이력이 담긴 폴더 |
| **브랜치 (Branch)** | 저장소의 평행 우주. 메인과 별도로 실험할 수 있는 공간 |
| **커밋 (Commit)** | 작업 한 단위를 저장하는 행위. 게임 세이브 포인트와 비슷 |
| **PR (Pull Request)** | "내 브랜치 변경을 메인에 합쳐주세요" 요청. 합치기 전 검토 기회 |
| **TDD** | 테스트를 먼저 짜고 그걸 통과하도록 코드를 짜는 개발 방식 |
| **RGR (Red-Green-Refactor)** | TDD 한 사이클의 이름. 실패→통과→정리 |
| **리팩토링 (Refactor)** | 코드의 동작은 그대로 두고 구조만 개선 |
| **Tidy First** | 구조적 변경과 행동적 변경을 같은 커밋에 섞지 않는 원칙 |
| **MCP** | Claude가 외부 시스템(GitHub, DB 등)에 접근하게 하는 표준 어댑터 |
| **HTTP / stdio** | MCP의 두 가지 통신 방식. HTTP=원격, stdio=로컬 |
| **Scope** | MCP 설정의 영향 범위. local / project / user |
| **PAT** | Personal Access Token. 비밀번호 대신 쓰는 임시 인증 토큰 |
| **OAuth** | "다른 서비스 비밀번호 없이 그 서비스 권한 빌려 쓰기" 표준 |
| **환경 변수** | API 키·비밀번호 같은 민감 값을 코드 밖에 분리해 두는 메커니즘 |
| **API** | 프로그램끼리 데이터를 주고받는 약속 |
| **엔드포인트** | API에서 특정 기능을 호출하는 URL + HTTP 메서드 조합 |
| **Zod** | TypeScript에서 데이터 형식을 런타임에 검증하는 라이브러리 |
| **LSP** | 코드 편집기와 언어 도구 사이의 표준 통신 규약 |
| **린터 (Linter)** | 코드의 스타일·잠재적 버그를 자동 검사하는 도구 |
| **포매터 (Formatter)** | 코드의 시각적 형식을 자동 통일하는 도구 |
| **Hook (Claude Code)** | Claude Code가 특정 시점에 자동 실행하는 스크립트 |
| **Skill (Claude Code)** | Claude가 따르는 반복 가능한 워크플로 명세 (`.md` 파일) |
| **슬래시 명령어** | `~/.claude/commands/`의 `.md` 파일이 곧 슬래시 명령. 예: `/plan` |
| **서브에이전트** | 특정 작업에 특화된 보조 Claude 인스턴스 |

---

## 13. Claude Code 명령어 빠른 참조

| 명령 | 용도 |
|---|---|
| `claude` | Claude Code 시작 |
| `claude mcp add --transport http <name> <url>` | 원격 MCP 서버 추가 |
| `claude mcp add --transport stdio <name> -- <command>` | 로컬 MCP 서버 추가 |
| `claude mcp list` | 설치된 MCP 서버 목록 |
| `claude mcp remove <name>` | MCP 서버 제거 |
| `/plan` (있다면) | 변경 시작 전 plan.md 작성 |
| `/security-checklist` (공식 명령) | 보안 점검 |

**파일 위치 규칙:**

| 경로 | 용도 |
|---|---|
| `<project>/CLAUDE.md` | 프로젝트별 Claude 지침 (이 문서를 @로 임포트하면 좋음) |
| `<project>/CLAUDE.local.md` | 개인 오버라이드 (gitignore) |
| `<project>/.claude/settings.json` | 훅·권한·환경 변수 설정 |
| `<project>/.claude/hooks/*` | pre/post 도구 액션 (lint/format/test 자동화) |
| `<project>/.claude/commands/*.md` | 프로젝트별 슬래시 명령 |
| `<project>/.claude/skills/*.md` | 프로젝트별 스킬 |
| `<project>/.claude/rules/*.md` | 경로별 규칙 (api-routes, frontend 등) |
| `<project>/.mcp.json` | 프로젝트 scope MCP 설정 (팀 공유) |
| `~/.claude/skills/*.md` | 전역 스킬 |
| `~/.claude/commands/*.md` | 전역 슬래시 명령 |
| `~/.claude.json` | 전역 / local scope MCP 설정 |

---

## 부록 A — 알려진 한계

이 문서를 신뢰할 때 반드시 인지해야 할 사항.

1. **출처는 책의 단일 챕터.** Ch.3가 책의 방법론 챕터 전체이지만, Part 2·3은 **실제 풀스택 앱을 만드는 과정**을 담는다. 그 실습 흐름은 이 문서 바깥. 직접 책을 사거나 [`claude-code-expert/tika`](https://github.com/claude-code-expert/tika) 리포의 실제 코드 참조.
2. **OCR 기반 재구성.** 원본은 스캔본. 표·인용·코드는 다중 검증했지만 본문 산문은 일부 의역됐을 수 있다. **원문이 중요한 곳은 책 페이지 번호와 함께 표기**되어 있으니, 진짜 인용이 필요하면 책으로 확인.
3. **공식 리포 의존도.** §9의 매핑은 `claude-code-expert/example`의 실제 파일을 가리킨다. 리포가 변경·삭제되면 일부 링크 깨짐.
4. **도메인 지식 없음.** §8 명시: AI 협업 방법론은 다루지만, 도메인 지식(전자상거래, 결제, 세무, PIPA, 검색 등)은 다루지 않는다. **반드시 별도 학습.**
5. **Claude Code의 빠른 변화.** MCP API, hook 사양, skill 스펙이 변경되면 §7·§13이 stale 된다. 책은 2026-04 시점.

## 부록 B — 갱신 트리거

다음 조건 중 하나가 발생하면 이 문서를 갱신한다.

1. 책의 다른 챕터를 추가로 확인했을 때 (특히 Part 2 SDD 파이프라인, Part 3 할루시네이션 대응)
2. 공식 리포 `template/`, `.claude/hooks/`, `skills/`, `.claude/commands/`, `.claude/rules/`가 변경됐을 때
3. Claude Code 자체의 명령 표면이 변경됐을 때 (`claude mcp ...` 형식, hook spec, skill spec)
4. 이 문서를 따라 만든 프로젝트에서 실패 사례가 발견됐을 때 — **실패 사례는 갱신 사유**

---

## 끝 — 친구에게 한마디

이 문서는 **개발 방법론의 출발선**이지 종점이 아니다.

이 책의 진짜 가치는 "AI가 빠르게 짜는 코드를 사람이 어떻게 통제할 것인가"라는 질문에 대한 한 팀(이남희·백승현)의 답을 보여주는 것이다. 그 답은 결국 **표준 소프트웨어 공학 원칙(TDD, Tidy First, 설계 우선)**과 **Anthropic의 도구 표면(CLAUDE.md, MCP, hooks, skills)**을 결합한 것이다. 둘 다 너의 프로젝트 맥락에 맞게 재단해야 한다.

특히 §6.2(비즈니스 맥락 기반 TDD)와 §7.8(설정 최소주의)를 가볍게 읽고 넘기지 마라. 둘 다 **"많이 하면 좋다"는 본능을 거스르는** 원칙이고, 너의 프로젝트 초반에 과잉 구축으로 시간 낭비하는 걸 막아주는 안전장치다.

행운을 빈다.

—

**파일 정보:**
- 작성 시점: 2026-05-12
- 원천: 『클로드 코드 마스터』 Ch.3 + 공식 리포 `claude-code-expert/example`
- 라이선스: 책의 인용·표는 저작권자 소유. 이 재구성 문서 자체는 자유롭게 사용·수정·재배포 가능 (참조 출처만 유지).
