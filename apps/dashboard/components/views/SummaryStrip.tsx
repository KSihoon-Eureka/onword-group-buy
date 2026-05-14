'use client'

/**
 * SummaryStrip — AI 비서 홈 상단 4-grid stats.
 *  - SummaryCard (dumb) 에 stats + onCardClick(navigation) 주입.
 *  - 카드 클릭 시 의미있는 페이지로 이동.
 */

import { useRouter } from 'next/navigation'
import {
  SummaryCard,
  type SummaryCardKey,
  type SummaryStats,
} from '@onword/ui'

const NAV_MAP: Record<SummaryCardKey, string> = {
  closingToday: '/campaigns?filter=closing-today',
  newOrders: '/orders',
  pickupReady: '/campaigns?filter=pickup-ready',
  deadlineSoon: '/campaigns?filter=deadline-soon',
}

export function SummaryStrip({ stats }: { stats: SummaryStats }) {
  const router = useRouter()

  function handleClick(key: SummaryCardKey) {
    const dest = NAV_MAP[key]
    if (dest) router.push(dest)
  }

  return <SummaryCard stats={stats} onCardClick={handleClick} />
}
