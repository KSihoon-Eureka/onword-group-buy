'use client'

/**
 * NewProductView — 상품 발주 등록 (Step 1, 유일한 human input).
 * 
 * 구현 가이드 (Track D — Day 1 Agent 4 담당):
 * 1. 입력 필드 (AI_DOCS/workflow-9-steps.md Step 1 참조):
 *    - 상품명 (name)
 *    - 설명 (description)
 *    - 카테고리 (category, select)
 *    - 가격 (price) + 비교가격 (compare_price)
 *    - 수량 (stock_quantity)
 *    - 일정: order_deadline, pickup_date, pickup_deadline
 *    - 긴급 배너 (urgency_banner, optional)
 *    - 이미지 업로드 (source_image_urls, Supabase Storage)
 * 2. 제출 시:
 *    a. products 테이블 insert
 *    b. POST /api/agent/run { action: 'start_campaign', productId }
 *    c. Chat 탭으로 전환 (사용자가 Execution Trace 볼 수 있게)
 * 
 * 시니어층 친화 UI:
 *   - 큰 라벨, 큰 입력 필드
 *   - 날짜 선택은 캘린더 위젯
 *   - 한 화면 안에 모든 필드 (단계 분할 X)
 */

import type { DashboardTab } from '@onword/types'

interface NewProductViewProps {
  onNavigate: (tab: DashboardTab) => void
}

export function NewProductView({ onNavigate }: NewProductViewProps) {
  return (
    <div className="h-full p-6 max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold text-zinc-900 tracking-tight mb-2">상품 등록</h2>
      <p className="text-sm text-zinc-500 mb-6">
        발주 정보를 입력하면 AI가 공고·포스터·도매 통지를 자동 생성합니다.
      </p>
      <div className="text-zinc-500 text-sm">
        ProductRegisterForm 컴포넌트 — Track D (Day 1)
      </div>
    </div>
  )
}
