'use client'

/**
 * CampaignsView — 진행 중인 공구 현황.
 * 
 * 구현 가이드:
 * 1. Supabase에서 products WHERE status = 'active' 조회
 * 2. ProductCard 그리드 (3컬럼 데스크탑, 1컬럼 모바일)
 * 3. 각 카드에 flow_stage 진행도 표시 (8-step 점선)
 * 4. 카드 클릭 시 상세 뷰 또는 액션 버튼 (start_campaign, close_orders 등)
 * 
 * 액션 버튼 클릭 → POST /api/agent/run { action, productId } → Chat 탭으로 전환
 * 
 * 자세한 디자인: AI_DOCS/dashboard-ui-patterns.md (ProductCard 섹션)
 */

import type { DashboardTab } from '@onword/types'

interface CampaignsViewProps {
  onNavigate: (tab: DashboardTab) => void
}

export function CampaignsView({ onNavigate }: CampaignsViewProps) {
  return (
    <div className="h-full p-6">
      <h2 className="text-2xl font-bold text-zinc-900 tracking-tight mb-6">공구 현황</h2>
      <div className="text-zinc-500 text-sm">
        진행 중인 상품 카드 뷰 — ProductCard 컴포넌트 + flow_stage 진행도
      </div>
    </div>
  )
}
