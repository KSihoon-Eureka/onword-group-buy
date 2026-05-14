/**
 * TDD: get_orders
 *
 * PRD §10.7 — GetOrdersInput / GetOrdersOutput
 * PRD §4.5 — orders schema (store_id, product_id, customer_name, customer_phone[4자리], phone_consent_at, quantity, status, anomaly_detected, anomaly_reason, ...)
 * PRD §4.11 — phone_access_log (action='view' 기록)
 * PRD §5.5 — service_role 사용 시 store_id 코드 레벨 필터링 강제
 * PRD §6 — PIPA: 끝 4자리 → 마스킹 표시 ("**1234")
 *
 * 실행:
 *   pnpm --filter=@onword/agent test get-orders
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// =====================================================
// Supabase mock — 테스트별로 동적 교체 가능
// =====================================================

type OrderRow = {
  id: string
  store_id: string
  product_id: string
  customer_name: string
  customer_phone: string | null
  phone_consent_at: string
  quantity: number
  total_price: number
  status: string
  anomaly_detected: boolean
  anomaly_reason: string | null
  notes: string | null
  picked_up_at: string | null
  created_at: string
  updated_at: string
}

const phoneLogInserts: Array<Record<string, unknown>> = []
let mockOrdersRows: OrderRow[] = []
let mockOrdersError: { message: string } | null = null
let phoneLogShouldFail = false

const filterCalls: Array<{ method: string; column: string; value: unknown }> = []

function makeOrdersQueryBuilder() {
  const self: any = {
    eq(column: string, value: unknown) {
      filterCalls.push({ method: 'eq', column, value })
      return self
    },
    neq(column: string, value: unknown) {
      filterCalls.push({ method: 'neq', column, value })
      return self
    },
    order(_column: string) {
      return self
    },
    then(resolve: (v: { data: OrderRow[] | null; error: { message: string } | null }) => unknown) {
      return Promise.resolve(
        mockOrdersError
          ? { data: null, error: mockOrdersError }
          : { data: mockOrdersRows, error: null },
      ).then(resolve)
    },
  }
  return self
}

function makePhoneLogQueryBuilder() {
  return {
    insert: (row: Record<string, unknown>) => {
      if (phoneLogShouldFail) {
        return Promise.resolve({ error: { message: 'log fail' } })
      }
      phoneLogInserts.push(row)
      return Promise.resolve({ error: null })
    },
  }
}

vi.mock('@onword/db', () => ({
  createServiceClient: () => ({
    from: vi.fn((table: string) => {
      if (table === 'orders') {
        const builder = makeOrdersQueryBuilder()
        builder.select = (_cols: string) => builder
        return builder
      }
      if (table === 'phone_access_log') {
        return makePhoneLogQueryBuilder()
      }
      throw new Error(`unexpected table: ${table}`)
    }),
  }),
}))

import { getOrders } from '../get-orders'

// =====================================================
// Helpers
// =====================================================

function makeRow(overrides: Partial<OrderRow> = {}): OrderRow {
  return {
    id: 'o1',
    store_id: 'store-A',
    product_id: 'p1',
    customer_name: '홍길동',
    customer_phone: '1234',
    phone_consent_at: '2026-05-01T00:00:00.000Z',
    quantity: 2,
    total_price: 20000,
    status: 'pending',
    anomaly_detected: false,
    anomaly_reason: null,
    notes: null,
    picked_up_at: null,
    created_at: '2026-05-10T10:00:00.000Z',
    updated_at: '2026-05-10T10:00:00.000Z',
    ...overrides,
  }
}

beforeEach(() => {
  phoneLogInserts.length = 0
  filterCalls.length = 0
  mockOrdersRows = []
  mockOrdersError = null
  phoneLogShouldFail = false
})

// =====================================================
// 1. 정상 동작
// =====================================================

describe('get_orders — 정상', () => {
  it('orders + totalQuantity 반환', async () => {
    mockOrdersRows = [
      makeRow({ id: 'o1', quantity: 2 }),
      makeRow({ id: 'o2', quantity: 3, customer_name: '김철수' }),
    ]

    const result = await getOrders({ storeId: 'store-A' })

    expect(result.orders).toHaveLength(2)
    expect(result.totalQuantity).toBe(5)
    expect(result.anomalies).toEqual([])
  })

  it('productId 지정 시 product_id 필터 추가', async () => {
    mockOrdersRows = [makeRow({ product_id: 'p-X' })]

    await getOrders({ storeId: 'store-A', productId: 'p-X' })

    const productFilter = filterCalls.find((f) => f.column === 'product_id')
    expect(productFilter).toBeDefined()
    expect(productFilter?.value).toBe('p-X')
  })

  it('includeAnomalies=true 일 때만 anomalies 채워짐', async () => {
    mockOrdersRows = [
      makeRow({ id: 'o1', anomaly_detected: true, anomaly_reason: 'DB flag' }),
      makeRow({ id: 'o2', anomaly_detected: false }),
    ]

    const withAnom = await getOrders({
      storeId: 'store-A',
      includeAnomalies: true,
    })
    expect(withAnom.anomalies.length).toBeGreaterThanOrEqual(1)
    expect(withAnom.anomalies.some((o) => o.id === 'o1')).toBe(true)

    // 다시 mock 초기화
    mockOrdersRows = [
      makeRow({ id: 'o3', anomaly_detected: true, anomaly_reason: 'DB flag' }),
    ]
    const withoutAnom = await getOrders({ storeId: 'store-A' })
    expect(withoutAnom.anomalies).toEqual([])
  })
})

// =====================================================
// 2. 실패 케이스
// =====================================================

describe('get_orders — 실패', () => {
  it('storeId 누락 시 throw', async () => {
    await expect(
      // @ts-expect-error — 의도적 누락 테스트
      getOrders({}),
    ).rejects.toThrow(/storeId/)
  })

  it('storeId 빈 문자열도 throw', async () => {
    await expect(getOrders({ storeId: '' })).rejects.toThrow(/storeId/)
  })

  it('Supabase 에러 시 throw', async () => {
    mockOrdersError = { message: 'connection refused' }
    await expect(getOrders({ storeId: 'store-A' })).rejects.toThrow(
      /Failed to fetch orders/,
    )
  })
})

// =====================================================
// 3. store_id 코드 레벨 필터 강제 (service_role 보호 — PRD §5.5)
// =====================================================

describe('get_orders — service_role 보호', () => {
  it('orders 쿼리에 .eq("store_id", input.storeId) 가 반드시 포함', async () => {
    mockOrdersRows = [makeRow()]

    await getOrders({ storeId: 'store-XYZ' })

    const storeFilter = filterCalls.find((f) => f.column === 'store_id')
    expect(storeFilter).toBeDefined()
    expect(storeFilter?.method).toBe('eq')
    expect(storeFilter?.value).toBe('store-XYZ')
  })
})

// =====================================================
// 4. PIPA — phone 마스킹
// =====================================================

describe('get_orders — PIPA phone 마스킹', () => {
  it('customerPhone 은 "**" + 4자리 형식으로 마스킹', async () => {
    mockOrdersRows = [makeRow({ customer_phone: '1234' })]

    const result = await getOrders({ storeId: 'store-A' })

    expect(result.orders[0].customerPhone).toBe('**1234')
  })

  it('customer_phone 이 null 이면 마스킹 결과도 null', async () => {
    mockOrdersRows = [makeRow({ customer_phone: null })]

    const result = await getOrders({ storeId: 'store-A' })

    expect(result.orders[0].customerPhone).toBeNull()
  })

  it('풀 번호(11자리) 가 반환되면 절대 안 됨', async () => {
    // 만약 DB에 잘못 저장된 풀번호가 있어도 tool 은 4자리 이상 노출 금지
    mockOrdersRows = [makeRow({ customer_phone: '01012341234' })]

    const result = await getOrders({ storeId: 'store-A' })

    const phone = result.orders[0].customerPhone ?? ''
    // 마스킹 후 길이는 6 이하 ("**" + 4자리 = 6자)
    expect(phone.length).toBeLessThanOrEqual(6)
    expect(phone).not.toContain('0101234')
  })
})

// =====================================================
// 5. PIPA — phone_access_log 'view' INSERT
// =====================================================

describe('get_orders — PIPA phone_access_log', () => {
  it('phone 가 노출되면 phone_access_log INSERT (action=view)', async () => {
    mockOrdersRows = [makeRow({ customer_phone: '1234' })]

    await getOrders({ storeId: 'store-A' })

    expect(phoneLogInserts.length).toBeGreaterThanOrEqual(1)
    const log = phoneLogInserts[0]
    expect(log.action).toBe('view')
    expect(log.store_id).toBe('store-A')
  })

  it('phone 가 전혀 없으면 INSERT 안 함', async () => {
    mockOrdersRows = [
      makeRow({ customer_phone: null }),
      makeRow({ id: 'o2', customer_phone: null }),
    ]

    await getOrders({ storeId: 'store-A' })

    expect(phoneLogInserts.length).toBe(0)
  })

  it('orders 자체가 빈 경우 INSERT 안 함', async () => {
    mockOrdersRows = []

    await getOrders({ storeId: 'store-A' })

    expect(phoneLogInserts.length).toBe(0)
  })
})

// =====================================================
// 6. Anomaly detection
// =====================================================

describe('get_orders — anomaly detection', () => {
  it('quantity > 100 → "비정상 대량 주문"', async () => {
    mockOrdersRows = [
      makeRow({ id: 'o1', quantity: 150, customer_name: '대량고객' }),
      makeRow({ id: 'o2', quantity: 5, customer_name: '정상고객' }),
    ]

    const result = await getOrders({
      storeId: 'store-A',
      includeAnomalies: true,
    })

    expect(result.anomalies.some((o) => o.id === 'o1')).toBe(true)
    expect(result.anomalies.some((o) => o.id === 'o2')).toBe(false)
    const flagged = result.anomalies.find((o) => o.id === 'o1')
    expect(flagged?.anomalyReason).toMatch(/대량/)
  })

  it('같은 customer_name + 5분 이내 다중 → "중복 주문 의심"', async () => {
    mockOrdersRows = [
      makeRow({
        id: 'o1',
        customer_name: '홍길동',
        created_at: '2026-05-10T10:00:00.000Z',
      }),
      makeRow({
        id: 'o2',
        customer_name: '홍길동',
        created_at: '2026-05-10T10:02:00.000Z',
      }),
      makeRow({
        id: 'o3',
        customer_name: '김철수',
        created_at: '2026-05-10T10:01:00.000Z',
      }),
    ]

    const result = await getOrders({
      storeId: 'store-A',
      includeAnomalies: true,
    })

    const dupIds = result.anomalies
      .filter((o) => /중복/.test(o.anomalyReason ?? ''))
      .map((o) => o.id)

    expect(dupIds).toContain('o1')
    expect(dupIds).toContain('o2')
    expect(dupIds).not.toContain('o3')
  })

  it('customer_name 빈 값 → "고객명 누락"', async () => {
    mockOrdersRows = [
      makeRow({ id: 'o1', customer_name: '' }),
      makeRow({ id: 'o2', customer_name: '   ' }),
      makeRow({ id: 'o3', customer_name: '홍길동' }),
    ]

    const result = await getOrders({
      storeId: 'store-A',
      includeAnomalies: true,
    })

    const flaggedIds = result.anomalies
      .filter((o) => /고객명|이름/.test(o.anomalyReason ?? ''))
      .map((o) => o.id)
    expect(flaggedIds).toContain('o1')
    expect(flaggedIds).toContain('o2')
    expect(flaggedIds).not.toContain('o3')
  })

  it('DB anomaly_detected=true 도 anomalies 에 포함', async () => {
    mockOrdersRows = [
      makeRow({
        id: 'o1',
        anomaly_detected: true,
        anomaly_reason: '미리 표시됨',
      }),
    ]

    const result = await getOrders({
      storeId: 'store-A',
      includeAnomalies: true,
    })

    expect(result.anomalies.map((o) => o.id)).toContain('o1')
  })

  it('includeAnomalies 미지정 시 anomalies 는 항상 빈 배열', async () => {
    mockOrdersRows = [makeRow({ id: 'o1', quantity: 999 })]

    const result = await getOrders({ storeId: 'store-A' })

    expect(result.anomalies).toEqual([])
  })
})

// =====================================================
// 7. Output 타입 형식
// =====================================================

describe('get_orders — Output shape', () => {
  it('GetOrdersOutput 필드: orders / totalQuantity / anomalies', async () => {
    mockOrdersRows = [makeRow({ quantity: 7 })]

    const result = await getOrders({ storeId: 'store-A' })

    expect(result).toHaveProperty('orders')
    expect(result).toHaveProperty('totalQuantity', 7)
    expect(result).toHaveProperty('anomalies')
    expect(Array.isArray(result.orders)).toBe(true)
    expect(Array.isArray(result.anomalies)).toBe(true)
  })

  it('Order 객체 필드: camelCase 매핑 + storeId / phoneConsentAt 포함', async () => {
    mockOrdersRows = [makeRow()]

    const result = await getOrders({ storeId: 'store-A' })
    const order = result.orders[0]

    expect(order.storeId).toBe('store-A')
    expect(order.productId).toBe('p1')
    expect(order.customerName).toBe('홍길동')
    expect(order.phoneConsentAt).toBe('2026-05-01T00:00:00.000Z')
    expect(order.totalPrice).toBe(20000)
    expect(order.anomalyDetected).toBe(false)
  })
})
