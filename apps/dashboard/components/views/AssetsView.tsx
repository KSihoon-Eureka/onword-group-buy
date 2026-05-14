'use client'

/**
 * AssetsView — AI가 만든 자산 보관소.
 * 
 * 구현 가이드:
 * 1. Supabase generated_assets 조회 (type별 필터)
 * 2. type별 그리드:
 *    - announcement: 텍스트 카드 + "복사" 버튼 → copied_at 기록
 *    - poster: 이미지 썸네일 + "다운로드" 버튼
 *    - pickup_table: 이미지 + "복사"
 *    - price_compare: JSON 데이터 + 캡처 이미지
 *    - wholesale_email: 보낸 이메일 본문 (재발송 가능)
 * 3. 각 자산이 어느 상품에서 나왔는지 링크 (products 조인)
 * 4. "재생성" 버튼: 동일 입력으로 다시 만들기 (새 자산 추가)
 * 
 * 모바일에서는 표시 안 함 (BottomNav 제외).
 */

import type { DashboardTab } from '@onword/types'

interface AssetsViewProps {
  onNavigate: (tab: DashboardTab) => void
}

export function AssetsView(_props: AssetsViewProps) {
  return (
    <div className="h-full p-6">
      <h2 className="text-2xl font-bold text-zinc-900 tracking-tight mb-6">자산</h2>
      <div className="text-zinc-500 text-sm">
        AI 생성 공고/포스터/이메일 보관 + 복사/다운로드/재생성
      </div>
    </div>
  )
}
