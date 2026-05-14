/**
 * Tool: get_orders  (PRD §10.7 / PLAN.md D.9)
 *
 * 특정 매장(필수) + 상품(옵션)의 주문 내역 조회.
 * - service_role 사용 → store_id 코드 레벨 필터 강제 (PRD §5.5)
 * - PIPA: phone 끝 4자리만 → "**XXXX" 마스킹 표시 (PRD §6)
 * - PIPA: phone 노출 시 phone_access_log 'view' 1건 INSERT (PRD §6.2.4 / §4.11)
 * - includeAnomalies=true 시 비정상 주문 분리 반환
 *
 * Anomaly rules (단순 v1 — AI_DOCS/anomaly-rules.md 에서 확장 예정):
 *   1. quantity > 100              → "비정상 대량 주문"
 *   2. 같은 customer_name + 5분 이내 → "중복 주문 의심"
 *   3. customer_name 공백/빈 값     → "고객명 누락"
 *   4. DB 의 anomaly_detected=true → DB anomaly_reason 그대로
 *
 * 트랙: Track D (Day 1 Agent 6) — PLAN.md D.9
 * 의존: orders 테이블, phone_access_log 테이블
 *
 * NOTE: packages/db Database 타입에 orders.store_id / phone_consent_at /
 * updated_at, 그리고 phone_access_log 테이블 자체가 누락되어 있어
 * Supabase 클라이언트 호출 시 `as any` cast 가 일부 필요. 시그니처는 PRD §10.7 고정.
 */

import { createServiceClient } from '@onword/db'
import type {
  GetOrdersInput,
  GetOrdersOutput,
  Order,
  OrderStatus,
} from '@onword/types'

// =====================================================
// Anomaly rule constants
// =====================================================

const ANOMALY_LARGE_QUANTITY = 100
const ANOMALY_DUPLICATE_WINDOW_MS = 5 * 60 * 1000 // 5분

// =====================================================
// 공개 export
// =====================================================

export async function getOrders(
  input: GetOrdersInput & { _traceId?: string },
): Promise<GetOrdersOutput> {
  // ---- 1. 입력 검증 ----
  if (!input || typeof input.storeId !== 'string' || input.storeId.trim() === '') {
    throw new Error('get_orders: storeId is required')
  }

  const { storeId, productId, includeAnomalies = false } = input

  // ---- 2. orders 조회 ----
  // service_role 사용 → store_id 필터 *코드 레벨 강제* (PRD §5.5)
  const supabase = createServiceClient() as any

  let query = supabase
    .from('orders')
    .select('*')
    .eq('store_id', storeId)
    .neq('status', 'cancelled')

  if (productId) {
    query = query.eq('product_id', productId)
  }

  query = query.order('created_at', { ascending: true })

  const { data: rows, error } = await query

  if (error) {
    throw new Error(`Failed to fetch orders: ${error.message ?? 'unknown'}`)
  }

  const rawRows: OrderRow[] = Array.isArray(rows) ? (rows as OrderRow[]) : []

  // ---- 3. anomaly 평가 (raw row 기준, 마스킹 전) ----
  //   - 마스킹 전 단계에서 평가해야 customer_name 등 메타가 정확함.
  //   - DB anomaly_detected/reason 도 함께 통합.
  const anomalyMap = computeAnomalies(rawRows)

  // ---- 4. Row → Order (camelCase + phone 마스킹 + anomaly 병합) ----
  const orders: Order[] = rawRows.map((row) => {
    const merged = anomalyMap.get(row.id)
    const finalDetected = merged?.detected ?? row.anomaly_detected ?? false
    const finalReason = merged?.reason ?? row.anomaly_reason ?? null
    return rowToOrder(row, finalDetected, finalReason)
  })

  // ---- 5. 총 수량 ----
  const totalQuantity = orders.reduce((sum, o) => sum + (o.quantity || 0), 0)

  // ---- 6. anomalies 분리 (includeAnomalies=true 일 때만) ----
  const anomalies: Order[] = includeAnomalies
    ? orders.filter((o) => o.anomalyDetected)
    : []

  // ---- 7. PIPA — phone 노출 시 access log 1건 ----
  //   - 사장님이 dashboard 에서 phone 보임 = 'view' (PRD §6.2.4)
  //   - bulk read 이므로 order_id 는 null. reason 에 컨텍스트 기록.
  const exposedPhoneCount = rawRows.filter(
    (r) => r.customer_phone !== null && r.customer_phone !== '',
  ).length

  if (exposedPhoneCount > 0) {
    try {
      await supabase.from('phone_access_log').insert({
        store_id: storeId,
        user_id: null,
        order_id: null,
        action: 'view',
        reason: `get_orders bulk view (${exposedPhoneCount} phones, productId=${
          productId ?? 'all'
        })`,
      })
    } catch {
      // PIPA 감사 실패해도 user-facing 결과는 막지 않음.
      // (실 운영에선 sentry/log 로 escalation 필요 — 별도 task.)
    }
  }

  return {
    orders,
    totalQuantity,
    anomalies,
  }
}

// =====================================================
// 내부 헬퍼
// =====================================================

interface OrderRow {
  id: string
  store_id: string
  product_id: string
  customer_name: string
  customer_phone: string | null
  phone_consent_at: string
  quantity: number
  total_price: number
  status: string
  anomaly_detected: boolean | null
  anomaly_reason: string | null
  notes: string | null
  picked_up_at: string | null
  created_at: string
  updated_at: string
}

/** PIPA — phone 4자리를 항상 "**XXXX" 로 마스킹. null/잘못된 값은 안전 처리. */
function maskPhone(phone: string | null): string | null {
  if (phone === null || phone === undefined || phone === '') return null
  // 끝 4자리만 노출. DB 가 4자리 보장하지만, 풀번호가 잘못 들어왔어도 4자리만 표시.
  const last4 = phone.slice(-4)
  return `**${last4}`
}

function rowToOrder(
  row: OrderRow,
  anomalyDetected: boolean,
  anomalyReason: string | null,
): Order {
  return {
    id: row.id,
    storeId: row.store_id,
    productId: row.product_id,
    customerName: row.customer_name,
    customerPhone: maskPhone(row.customer_phone),
    phoneConsentAt: row.phone_consent_at,
    quantity: row.quantity,
    totalPrice: row.total_price,
    status: (row.status as OrderStatus) ?? 'pending',
    anomalyDetected,
    anomalyReason,
    notes: row.notes,
    pickedUpAt: row.picked_up_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/**
 * Anomaly 규칙 평가. order id → { detected, reason } map 반환.
 * DB 의 anomaly_detected 도 합쳐 OR 처리.
 */
function computeAnomalies(
  rows: OrderRow[],
): Map<string, { detected: boolean; reason: string | null }> {
  const result = new Map<string, { detected: boolean; reason: string | null }>()

  const addReason = (id: string, reason: string) => {
    const prev = result.get(id)
    if (prev && prev.reason) {
      result.set(id, { detected: true, reason: `${prev.reason}; ${reason}` })
    } else {
      result.set(id, { detected: true, reason })
    }
  }

  for (const row of rows) {
    // Rule 1 — 대량 주문
    if (row.quantity > ANOMALY_LARGE_QUANTITY) {
      addReason(row.id, '비정상 대량 주문')
    }

    // Rule 3 — 고객명 빈 값 (trim 후 비교)
    if (!row.customer_name || row.customer_name.trim() === '') {
      addReason(row.id, '고객명 누락')
    }

    // DB flag — 기존 anomaly 도 합류
    if (row.anomaly_detected) {
      addReason(row.id, row.anomaly_reason ?? 'DB anomaly_detected=true')
    }
  }

  // Rule 2 — 같은 customer_name + 5분 이내 다중
  // O(n^2) 단순 구현 (소규모 매장 가정). 향후 buckets 로 최적화 가능.
  const byName = new Map<string, OrderRow[]>()
  for (const row of rows) {
    const key = row.customer_name?.trim() ?? ''
    if (!key) continue // 빈 이름은 Rule 3 에서 이미 처리
    const arr = byName.get(key) ?? []
    arr.push(row)
    byName.set(key, arr)
  }

  for (const [, group] of byName) {
    if (group.length < 2) continue
    // 시간순 정렬 후 인접 비교
    const sorted = [...group].sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    )
    const flaggedIds = new Set<string>()
    for (let i = 0; i < sorted.length - 1; i++) {
      const t1 = new Date(sorted[i].created_at).getTime()
      const t2 = new Date(sorted[i + 1].created_at).getTime()
      if (Math.abs(t2 - t1) <= ANOMALY_DUPLICATE_WINDOW_MS) {
        flaggedIds.add(sorted[i].id)
        flaggedIds.add(sorted[i + 1].id)
      }
    }
    for (const id of flaggedIds) {
      addReason(id, '중복 주문 의심')
    }
  }

  return result
}
