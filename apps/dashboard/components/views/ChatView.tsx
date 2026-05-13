'use client'

/**
 * ChatView — AI 비서 메인 화면.
 * 
 * 구현 가이드 (Track H — Day 2 Agent 2 담당):
 * 1. ChatInterface (메시지 히스토리 + 입력)
 * 2. Execution Trace 패널 (AgentStepBlock 시퀀스, Supabase Realtime 구독)
 * 3. 추천 액션 버튼 (도메인 specific):
 *    - "오늘 진행 중인 공구 상태 보고해"
 *    - "주문 마감 임박한 상품 찾아줘"
 *    - "도매업자에게 보낼 주문 정리해줘"
 *    - "오늘 수령 가능 상품 안내문 만들어줘"
 * 
 * 호출:
 *   POST /api/agent/run { message, history }
 *   → 응답: { traceId }
 *   → Supabase Realtime으로 trace_steps 구독 → AgentStepBlock 렌더
 * 
 * 출처 패턴: 레퍼런스 App.tsx L119-? (ChatInterface) + L65-117 (AgentStepBlock 표시)
 * 자세한 디자인: AI_DOCS/dashboard-ui-patterns.md
 */

import type { DashboardTab } from '@onword/types'

interface ChatViewProps {
  onNavigate: (tab: DashboardTab) => void
}

export function ChatView({ onNavigate }: ChatViewProps) {
  return (
    <div className="h-full flex items-center justify-center text-zinc-500">
      <div className="text-center">
        <p className="text-lg font-medium mb-2">AI 비서</p>
        <p className="text-sm">/api/agent/run + Realtime trace_steps 구독으로 구현 예정</p>
        <p className="text-xs mt-4 text-zinc-400">Track H (Day 2)</p>
      </div>
    </div>
  )
}
