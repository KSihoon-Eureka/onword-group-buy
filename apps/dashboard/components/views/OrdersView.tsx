'use client'

/**
 * OrdersView — 주문 관리 (카운터 + 관리자용).
 * 
 * 구현 가이드:
 * 1. 검색바: 이름 / 전화번호 / 상품으로 검색
 * 2. 주문 테이블 (OrderRow 반복):
 *    - 이름, 전화번호 끝 4자리, 상품, 수량, 상태
 *    - status 토글: pending → confirmed → picked_up
 *    - anomaly_detected=true면 빨간 점 표시
 * 3. 필터: 오늘 픽업 / 마감 임박 / 누락 검수
 * 4. 우측 사이드패널: 선택 주문 상세 + 액션
 * 
 * Supabase Realtime으로 새 주문 들어오면 toast 알림.
 */

import type { DashboardTab } from '@onword/types'

interface OrdersViewProps {
  onNavigate: (tab: DashboardTab) => void
}

export function OrdersView(_props: OrdersViewProps) {
  return (
    <div className="h-full p-6">
      <h2 className="text-2xl font-bold text-zinc-900 tracking-tight mb-6">주문 관리</h2>
      <div className="text-zinc-500 text-sm">
        주문 목록 + 검색 + 누락 검수 + 픽업 처리
      </div>
    </div>
  )
}
