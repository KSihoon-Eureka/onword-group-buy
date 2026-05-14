/**
 * SummaryCard 4-grid stats fetch — AI 비서 홈 (/page) 에서.
 *
 * 각 stat 정의 (PRD §9.5):
 *   - closingToday: 오늘 order_deadline 인 활성 상품 수
 *   - newOrders: 오늘 created_at 인 주문 수
 *   - pickupReady: pickup_date <= 오늘 + status='active' (수령 가능 상품)
 *   - deadlineSoon: order_deadline 이 내일/모레 (D+1, D+2) 인 활성 상품 수
 *
 * 호출자: app/(dashboard)/page.tsx (server component).
 */

import type { SummaryStats } from '@onword/ui'

// supabase-js / ssr 의 Database generic 충돌 회피 — any 로 받음.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any

function todayKstIsoDate(): string {
  const now = new Date()
  // KST = UTC+9
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  return kst.toISOString().slice(0, 10)
}

function addDaysIso(baseIsoDate: string, days: number): string {
  const d = new Date(baseIsoDate + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export async function fetchSummaryStats(
  supabase: SupabaseLike,
  storeId: string,
): Promise<SummaryStats> {
  const today = todayKstIsoDate()
  const tomorrow = addDaysIso(today, 1)
  const dayAfterTomorrow = addDaysIso(today, 2)

  // 1. closingToday
  const closingTodayRes = await supabase
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('store_id', storeId)
    .eq('status', 'active')
    .eq('order_deadline', today)

  // 2. newOrders (오늘 생성)
  const newOrdersRes = await supabase
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('store_id', storeId)
    .gte('created_at', today + 'T00:00:00Z')

  // 3. pickupReady (pickup_date <= 오늘)
  const pickupReadyRes = await supabase
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('store_id', storeId)
    .eq('status', 'active')
    .lte('pickup_date', today)

  // 4. deadlineSoon (내일/모레 마감)
  const deadlineSoonRes = await supabase
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('store_id', storeId)
    .eq('status', 'active')
    .gte('order_deadline', tomorrow)
    .lte('order_deadline', dayAfterTomorrow)

  return {
    closingToday: closingTodayRes.count ?? 0,
    newOrders: newOrdersRes.count ?? 0,
    pickupReady: pickupReadyRes.count ?? 0,
    deadlineSoon: deadlineSoonRes.count ?? 0,
  }
}
