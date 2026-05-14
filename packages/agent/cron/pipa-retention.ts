/**
 * Cron: pipa_retention (PRD §6.2.5).
 *
 * 매일 00:00 KST 실행. PIPA Article 21 보유기간 만료 시 customer_phone 자동
 * NULL 처리:
 *  1. status='picked_up' AND picked_up_at < now() - 1 year → NULL
 *  2. status in ('cancelled', 'no_show') AND updated_at < now() - 30 days → NULL
 *
 * 각 행에 phone_access_log 'delete' 기록 (user_id=null = system).
 *
 * 안전성:
 *  - 멱등: customer_phone 이미 NULL 이면 영향 없음 (필터에서 제외).
 *  - service_role 사용 — 시스템 cron, store_id 필터 X (모든 매장 일괄).
 */

import { createServiceClient } from '@onword/db'

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

export interface PipaRetentionResult {
  pickedUpExpired: number
  cancelledExpired: number
  accessLogInserted: number
  errors: string[]
}

interface UpdatedOrderRow {
  id: string
  store_id: string
}

export async function runPipaRetention(): Promise<PipaRetentionResult> {
  const supabase = createServiceClient()
  const errors: string[] = []
  const now = new Date()
  const oneYearAgoIso = new Date(now.getTime() - ONE_YEAR_MS).toISOString()
  const thirtyDaysAgoIso = new Date(now.getTime() - THIRTY_DAYS_MS).toISOString()

  // 1. 픽업 완료 1년 경과 — phone NULL.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder1: any = supabase
    .from('orders')
    .update({ customer_phone: null, updated_at: new Date().toISOString() })
  const { data: pickedUpExpired, error: err1 } = (await builder1
    .eq('status', 'picked_up')
    .lt('picked_up_at', oneYearAgoIso)
    .not('customer_phone', 'is', null)
    .select('id, store_id')) as {
    data: UpdatedOrderRow[] | null
    error: { message: string } | null
  }

  if (err1) errors.push(`picked_up retention: ${err1.message}`)
  const pickedRows = pickedUpExpired ?? []

  // 2. 취소/no_show 30일 경과 — phone NULL.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder2: any = supabase
    .from('orders')
    .update({ customer_phone: null, updated_at: new Date().toISOString() })
  const { data: cancelledExpired, error: err2 } = (await builder2
    .in('status', ['cancelled', 'no_show'])
    .lt('updated_at', thirtyDaysAgoIso)
    .not('customer_phone', 'is', null)
    .select('id, store_id')) as {
    data: UpdatedOrderRow[] | null
    error: { message: string } | null
  }

  if (err2) errors.push(`cancelled retention: ${err2.message}`)
  const cancelledRows = cancelledExpired ?? []

  // 3. phone_access_log INSERT — user_id=null (system), action='delete'.
  const allDeleted = [...pickedRows, ...cancelledRows]
  let accessLogInserted = 0

  if (allDeleted.length > 0) {
    const logRows = allDeleted.map((r) => ({
      store_id: r.store_id,
      user_id: null,
      order_id: r.id,
      action: 'delete' as const,
      reason: 'PIPA retention auto-delete',
    }))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const logBuilder: any = supabase.from('phone_access_log').insert(logRows)
    const { error: logErr } = (await logBuilder) as {
      error: { message: string } | null
    }

    if (logErr) {
      errors.push(`phone_access_log insert: ${logErr.message}`)
    } else {
      accessLogInserted = allDeleted.length
    }
  }

  return {
    pickedUpExpired: pickedRows.length,
    cancelledExpired: cancelledRows.length,
    accessLogInserted,
    errors,
  }
}
