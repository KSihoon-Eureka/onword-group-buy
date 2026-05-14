/**
 * Cron: auto_no_show (PRD §10.9, A15).
 *
 * 매일 00:00 KST 실행 (Vercel Cron). pickup_deadline 이 지난 활성 주문을
 * 'no_show' 상태로 자동 마킹 + audit_log 기록.
 *
 * 호출: apps/dashboard/app/api/cron/auto-no-show/route.ts (Vercel Cron wrapper).
 * service_role 사용 — 멤버십 검증 없음 (시스템 cron). store_id 별 처리.
 *
 * 안전성:
 *  - 멱등 (idempotent): 같은 주문에 두 번 실행해도 한 번만 status 변경.
 *  - service_role: PRD §5.5 / CLAUDE.md §15 — RLS 우회 위험 영역, 코드 레벨
 *    store_id 필터 강제. 본 cron 은 *모든 매장* 처리이므로 store_id 필터 X,
 *    대신 update 결과의 store_id 를 audit_log 에 정확히 매핑.
 */

import { createServiceClient } from '@onword/db'

export interface AutoNoShowResult {
  scannedOrders: number
  markedNoShow: number
  auditLogInserted: number
  errors: string[]
}

interface UpdatedOrderRow {
  id: string
  store_id: string
  product_id: string | null
}

export async function runAutoNoShow(): Promise<AutoNoShowResult> {
  const supabase = createServiceClient()
  const errors: string[] = []

  // 1. pickup_deadline 이 지난 (today 이전) 상품 ID 모음.
  //    KST 자정 cron 기준 — current_date 는 server timezone 영향 받지만
  //    Vercel 은 UTC, Supabase 도 UTC. KST 자정 = UTC 15:00. pickup_deadline 은
  //    date 타입이라 timezone 무관 (PRD §4.3.1).
  //    "오늘 KST 자정" 시점에 pickup_deadline < today (KST 어제까지) 인 주문 → no_show.
  const todayKst = todayKstDate()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const expiredBuilder: any = supabase.from('products').select('id')
  const { data: expiredProducts, error: prodErr } = (await expiredBuilder
    .lt('pickup_deadline', todayKst)) as {
    data: Array<{ id: string }> | null
    error: { message: string } | null
  }

  if (prodErr) {
    errors.push(`fetch expired products: ${prodErr.message}`)
    return { scannedOrders: 0, markedNoShow: 0, auditLogInserted: 0, errors }
  }

  const expiredIds = (expiredProducts ?? []).map((p) => p.id)
  if (expiredIds.length === 0) {
    return { scannedOrders: 0, markedNoShow: 0, auditLogInserted: 0, errors }
  }

  // 2. 해당 상품의 pending/confirmed 주문을 no_show 로 update.
  //    .returning() 으로 변경된 행만 받음 → idempotent (이미 no_show 면 영향 X).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateBuilder: any = supabase
    .from('orders')
    .update({ status: 'no_show', updated_at: new Date().toISOString() })
  const { data: updated, error: updErr } = (await updateBuilder
    .in('product_id', expiredIds)
    .in('status', ['pending', 'confirmed'])
    .select('id, store_id, product_id')) as {
    data: UpdatedOrderRow[] | null
    error: { message: string } | null
  }

  if (updErr) {
    errors.push(`update orders: ${updErr.message}`)
    return { scannedOrders: 0, markedNoShow: 0, auditLogInserted: 0, errors }
  }

  const markedRows = updated ?? []
  if (markedRows.length === 0) {
    return { scannedOrders: 0, markedNoShow: 0, auditLogInserted: 0, errors }
  }

  // 3. audit_log INSERT (각 주문별).
  //    PRD §4.10: action='auto_no_show', user_id=null (system), entity_type='order'.
  const auditRows = markedRows.map((r) => ({
    store_id: r.store_id,
    user_id: null,
    entity_type: 'order' as const,
    entity_id: r.id,
    action: 'auto_no_show' as const,
    changes: { product_id: r.product_id },
  }))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const auditBuilder: any = supabase.from('audit_log').insert(auditRows)
  const { error: auditErr } = (await auditBuilder) as {
    error: { message: string } | null
  }

  let auditInserted = markedRows.length
  if (auditErr) {
    errors.push(`audit_log insert: ${auditErr.message}`)
    auditInserted = 0
  }

  return {
    scannedOrders: markedRows.length,
    markedNoShow: markedRows.length,
    auditLogInserted: auditInserted,
    errors,
  }
}

/**
 * KST (Asia/Seoul, UTC+9) 기준 오늘 날짜 'YYYY-MM-DD'.
 * cron 이 UTC 15:00 (= KST 00:00) 에 실행되어도 KST 자정 시점의 날짜로 비교.
 */
export function todayKstDate(): string {
  const now = new Date()
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  return kst.toISOString().slice(0, 10)
}
