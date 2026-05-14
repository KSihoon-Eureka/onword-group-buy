/**
 * ProductCard 순수 헬퍼 (PRD §9.5, §2.12, §4.4).
 *
 * 분리 이유:
 *  - ProductCard는 dumb (props만). 로직 / 포맷은 별도 함수로 빼서 테스트 가능하게.
 *  - packages/ui는 외부(앱)에서 vitest로 테스트한다 — node 환경, JSX 렌더 없음.
 *
 * 주의:
 *  - FlowStage 9단계 중 `completed`는 종료 상태이므로 progress dots(8칸)에 포함되지 않는다.
 *  - `flowStage='completed'` 인 상품은 8칸 모두 `done` 처리.
 */

import type { FlowStage } from '@onword/types'

/**
 * Progress dot 8칸 순서 (PRD §9.5 ProductCard 명세).
 * `completed`(9번째)는 표시 X — 카드 자체가 보통 archive 상태로 빠진다.
 */
export const PROGRESS_STAGE_ORDER: ReadonlyArray<FlowStage> = [
  'product_registered',
  'announcement_1',
  'order_open',
  'order_closed',
  'stock_confirmed',
  'warehouse_notified',
  'arrived',
  'pickup_ready',
] as const

export type ProgressDotState = 'done' | 'current' | 'pending'

/**
 * 8칸 progress dot 상태 배열을 계산한다.
 *  - `current` = 지금 stage
 *  - `done`    = 이전 stage들
 *  - `pending` = 이후 stage들
 *
 * `completed` 단계는 모든 칸을 done 처리한다.
 * 알 수 없는 stage 값이면 모두 pending — 방어적.
 */
export function getProgressDots(flowStage: FlowStage): ProgressDotState[] {
  if (flowStage === 'completed') {
    return PROGRESS_STAGE_ORDER.map(() => 'done')
  }
  const idx = PROGRESS_STAGE_ORDER.indexOf(flowStage)
  if (idx < 0) {
    return PROGRESS_STAGE_ORDER.map(() => 'pending')
  }
  return PROGRESS_STAGE_ORDER.map((_, i) => {
    if (i < idx) return 'done'
    if (i === idx) return 'current'
    return 'pending'
  })
}

/**
 * PRD A12: `8,900원` (콤마 + 원).
 */
export function formatPriceKRW(price: number): string {
  const n = Number.isFinite(price) ? Math.round(price) : 0
  return `${n.toLocaleString('ko-KR')}원`
}

const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'] as const

/**
 * PRD A12: `MM월 DD일(요일)`.
 * `YYYY-MM-DD` 또는 ISO timestamp 모두 허용.
 * 파싱 실패 → 원본 string 그대로 반환 (UI에서 깨지지 않도록).
 */
export function formatDeadlineKR(isoLike: string): string {
  const d = new Date(isoLike)
  if (Number.isNaN(d.getTime())) return isoLike
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const weekday = WEEKDAY_KO[d.getDay()]
  return `${mm}월 ${dd}일(${weekday})`
}

/**
 * 참여 수 표시: `ordered / stock`.
 * stock 0 또는 음수 → `ordered`만.
 */
export function formatParticipation(orderedQuantity: number, stockQuantity: number): string {
  const o = Number.isFinite(orderedQuantity) ? Math.max(0, Math.round(orderedQuantity)) : 0
  const s = Number.isFinite(stockQuantity) ? Math.round(stockQuantity) : 0
  if (s <= 0) return `${o.toLocaleString('ko-KR')}개`
  return `${o.toLocaleString('ko-KR')} / ${s.toLocaleString('ko-KR')}개`
}
