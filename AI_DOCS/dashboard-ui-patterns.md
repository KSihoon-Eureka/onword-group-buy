# Dashboard UI Patterns

> 출처: Versatile Execution Agent 레퍼런스 (Vite + React 19).
> 우리는 Next.js 14 (App Router)로 *포팅*. UI 시스템은 그대로 유지.
> 모든 대시보드 컴포넌트는 이 문서의 디자인 토큰을 따른다.

---

## 디자인 철학

**"Apple-like minimalism":**
- 흰 배경 (`#FFFFFF` 카드) + 회색 배경 (`#F3F3F3` 페이지)
- 검정 텍스트 (`text-zinc-900` 주요, `text-zinc-500` 보조)
- 무거운 그림자 대신 *얇은 보더* (`border-black/[0.04]` 또는 `border-black/5`)
- 부드러운 그림자 (`shadow-[0_2px_12px_rgba(0,0,0,0.03)]`)
- 강한 라운드 (`rounded-full` 버튼, `rounded-[32px]` 카드)
- 색상은 *상태 표시*에만 (emerald=성공, red=오류, zinc=일반)

---

## 디자인 토큰

### 색상 (Tailwind 클래스)

```
배경
- 페이지: bg-[#F3F3F3]
- 카드: bg-white
- 호버: hover:bg-black/[0.04]
- 활성: bg-black text-white
- 강조 영역: bg-zinc-50/80

텍스트
- 헤더: text-zinc-900 (검정)
- 본문: text-zinc-700
- 보조: text-zinc-500
- 비활성: text-zinc-400
- 매우 흐림: text-zinc-300

보더
- 기본: border-black/[0.04]
- 강조: border-black/5
- 매우 얇음: border-black/[0.02]

상태
- 성공: text-emerald-500 / bg-emerald-50
- 오류: text-red-500 / bg-red-50
- 진행: text-zinc-400 (애니메이션) + Loader2 icon
```

### 라운드

```
- rounded-full: 버튼, 네비 아이템, 검색 입력
- rounded-3xl (24px): 에이전트 스텝 블록, 채팅 버블
- rounded-[32px]: 큰 카드 (대시보드, 차트, 상품 카드)
- rounded-2xl (16px): 작은 카드, 코드 블록
- rounded-xl (12px): 입력 필드, 작은 버튼
```

### 그림자

```
- shadow-sm: 활성 버튼
- shadow-[0_2px_12px_rgba(0,0,0,0.02)]: 카드 기본
- shadow-[0_2px_12px_rgba(0,0,0,0.03)]: 에이전트 스텝 활성 상태
- shadow-none: 비활성/배경 카드
```

### 폰트 크기

```
- text-2xl font-bold: 페이지 타이틀 ("Retail Agent Dashboard" 위치)
- text-[17px] font-semibold: 카드 타이틀
- text-[15px] font-semibold: 작은 카드 타이틀
- text-[14px] font-medium: 메뉴 아이템, 버튼
- text-[13px]: 본문, AgentStep 라벨
- text-[12px]: 보조 정보, 메타데이터
- text-[11px]: 푸터
- text-[10px] uppercase tracking-wider: 라벨 (Type, Status 등)
- text-[9px] uppercase tracking-wider: 매우 작은 라벨 (Result 등)
```

### 간격

```
- 사이드바 너비: w-[280px]
- 페이지 패딩: pt-8 pb-6 pl-8 pr-4 (사이드바), p-4~p-8 (메인)
- 카드 패딩: p-6 ~ p-8
- 카드 간격: gap-6
- 섹션 간격: mb-10
```

---

## 핵심 컴포넌트 (포팅 대상)

### 1. Sidebar (App.tsx 27-63 → packages/ui/Sidebar.tsx)

```typescript
// 5개 메뉴: Chat / Campaigns / Orders / Assets / New
// 활성 상태: bg-black text-white shadow-sm
// 비활성: text-zinc-500 hover:bg-black/[0.04] hover:text-black
// 모든 아이템: rounded-full, gap-3, 아이콘 + 라벨
```

### 2. BottomNav (App.tsx 793-821 → packages/ui/BottomNav.tsx)

```typescript
// 모바일 전용: md:hidden
// 4개 아이템 (Assets 제외)
// 아이콘 + 작은 라벨 (text-[10px])
```

### 3. AgentStepBlock (App.tsx 65-117 → packages/ui/AgentStepBlock.tsx) ⭐ 핵심

Execution Trace의 각 단계를 표시. 3가지 상태:
- `streaming`: 흰 배경 + 그림자 + Loader2 회전
- `completed`: 회색 배경 + 체크 아이콘 + 소요 시간
- `error`: 빨간 액센트 + 오류 아이콘

```typescript
interface AgentStep {
  id: string
  type: 'text' | 'tool'         // 'thinking' 또는 'tool call'
  content?: string              // text 타입일 때 (생각 내용)
  toolName?: string             // tool 타입일 때 (예: 'generate_announcement')
  toolArgs?: Record<string, any>
  result?: { message?: string }
  status: 'pending' | 'streaming' | 'completed' | 'error'
  latencyMs?: number
}
```

표시 형식:
```
┌─────────────────────────────────────────┐
│ 🤖 Tool Call: generate_announcement  ✓ 1.2s │
│ ┌───────────────────────────────────┐  │
│ │ { "productId": "abc", "stage": 1 }│  │ ← toolArgs (회색 코드 블록)
│ └───────────────────────────────────┘  │
│ ─────────────────────────────────────  │
│ RESULT                                  │
│ 공고 텍스트 생성 완료 (572자)            │
└─────────────────────────────────────────┘
```

### 4. ChatInterface (App.tsx 119-? → apps/dashboard/components/ChatInterface.tsx)

채팅 입력 + 메시지 히스토리 + 추천 액션 버튼.

추천 액션을 우리 도메인에 맞게:
```typescript
const suggestions = [
  "오늘 진행 중인 공구 상태 보고해",
  "주문 마감 임박한 상품 찾아줘",
  "도매업자에게 보낼 주문 정리해줘"
]
```

### 5. ProductCard (신규, packages/ui/ProductCard.tsx)

공구 현황 카드. flow_stage를 시각적으로 표시.

```
┌─────────────────────────────────────┐
│ [상품 이미지]                        │
│                                      │
│ 슈미트 냉감 베개커버 세트(2장)        │
│                                      │
│ ┌──┬──┬──┬──┬──┬──┬──┬──┐          │
│ │✓ │✓ │✓ │● │  │  │  │  │ ← flow_stage 진행도
│ └──┴──┴──┴──┴──┴──┴──┴──┘          │
│                                      │
│ 12,400원  ·  128명 참여 중            │
│ 마감: 5/13 (수) 14:24                │
└─────────────────────────────────────┘
```

### 6. OrderRow (신규, packages/ui/OrderRow.tsx)

주문 목록 한 줄. 카운터에서 검색해서 픽업 처리할 때 사용.

```
김OO  010-1234  코카콜라 350ml ×20  12,400원  [대기중] [픽업완료]
```

이상 시 `anomaly_detected=true`면 빨간 점 표시.

---

## 레퍼런스 그대로 가져올 라이브러리

```json
{
  "framer-motion": "^12.x",      // 애니메이션 (AnimatePresence, motion.div)
  "lucide-react": "^0.546.x",    // 아이콘 (Bot, Send, Database, CheckCircle2 등)
  "react-markdown": "^10.x",     // 채팅 메시지 마크다운 렌더링
  "clsx": "^2.x",                // 클래스 조건부 결합
  "tailwind-merge": "^3.x",      // Tailwind 중복 제거
  "date-fns": "^4.x"             // 날짜 포맷 (한국어 locale)
}
```

`cn()` 유틸리티는 레퍼런스의 `src/lib/utils.ts`를 그대로 사용:
```typescript
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

---

## 라벨 한국어화

레퍼런스는 영문 라벨. 우리는 한글 우선 (클라이언트 시니어층).

| 레퍼런스 | 우리 |
|---|---|
| Retail Agent Dashboard | 공구 관리 대시보드 |
| Agent Chat | AI 비서 |
| Dashboards | 공구 현황 |
| Orders | 주문 관리 |
| Reports | 자산 (또는 생성물) |
| Reviews | (사용 안 함) |
| Send | 보내기 |
| Thinking | 생각 중 |
| Tool Call | 도구 실행 |
| Result | 결과 |
| How can I help you today? | 무엇을 도와드릴까요? |

단, *코드 내부 식별자(state, function, type)는 영문 유지*. 라벨만 한글.

---

## Framer Motion 패턴

레퍼런스에서 자주 쓰이는 애니메이션 두 가지:

### 1. 새 스텝 등장
```tsx
<motion.div
  initial={{ opacity: 0, y: 10 }}
  animate={{ opacity: 1, y: 0 }}
>
```

### 2. 차트 바 채우기
```tsx
<motion.div 
  initial={{ width: 0 }}
  animate={{ width: `${percentage}%` }}
/>
```

### 3. AnimatePresence (스텝 삭제 시)
```tsx
<AnimatePresence>
  {steps.map(step => <AgentStepBlock key={step.id} step={step} />)}
</AnimatePresence>
```

---

## 모바일/데스크탑 분기

### 사이드바
- 데스크탑 (md+): `<Sidebar />` 표시 (`hidden md:flex`)
- 모바일: `<BottomNav />` 표시 (`md:hidden`)

### 메인 영역
```tsx
<main className="flex-1 flex flex-col overflow-hidden relative 
                 px-4 pb-4 pt-2 md:pt-6 md:pb-6 md:pr-6 md:pl-2">
```

### 모바일 헤더 (사이드바 대신)
```tsx
<div className="md:hidden flex items-center px-6 pt-6 pb-2 shrink-0">
  <button className="text-2xl font-bold text-black">
    공구 관리 대시보드
  </button>
</div>
```

---

## 안 가져오는 것 (레퍼런스에 있지만 우리에겐 불필요)

- `MOCK_DB` (우리는 Supabase 실제 DB)
- `realData.orders` JSON (Olist 브라질 e-commerce 데이터 - 무관)
- `data.json`의 dashboard/report 구조 (생성형 대시보드 - 우리는 정해진 뷰)
- `start_ai_agent` tool (sub-agent - 우리 도메인엔 과도)
- `analyze_sales_performance` 등 분석 tools (다음 스프린트)

대신 *패턴은 흡수*: `AgentStep`, `sendMessageToAgentStream` 시그니처, tool_use 루프 구조.
