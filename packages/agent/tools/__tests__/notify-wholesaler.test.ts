/**
 * TDD: notify_wholesaler
 *
 * PRD §10.8 — NotifyWholesalerInput / NotifyWholesalerOutput
 * PRD §7.10 — Step 8 도매업자 이메일 (recipient 우선순위 + flow_stage 업데이트)
 * PRD §6.2.6 — 제3자 제공 금지: customer_phone / customer_name 절대 본문 포함 X
 * PRD §6.4 / §4.11 — phone_access_log action='export' INSERT
 * PRD §15.4 / §16 — Resend API + RESEND_API_KEY / WHOLESALE_DEFAULT_RECIPIENT
 * PRD §4.2 — stores.wholesale_email / stores.wholesale_from_email
 *
 * 실행:
 *   pnpm --filter=@onword/agent test notify-wholesaler
 *
 * Mock 정책:
 *   - Resend SDK 완전 mock — 실제 외부 호출 0
 *   - Supabase: stores, products, generated_assets, phone_access_log, get_orders 의존
 *   - get_orders 자체도 mock (이 tool 의 단위 테스트는 도매업자 송신 로직 한정)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// =====================================================
// 0. 환경 변수 — Resend 모듈 import 전에 채워둬야 SDK new Resend(key) 안전
// =====================================================
process.env.RESEND_API_KEY = process.env.RESEND_API_KEY ?? 're_test_key'

// =====================================================
// 1. Resend mock — 실제 발송 0
// =====================================================

const resendSendCalls: Array<Record<string, unknown>> = []
let resendShouldFail = false
let resendFailMessage = 'Resend failure'
let resendReturnId: string | null = 'resend-email-id-123'

vi.mock('resend', () => {
  return {
    Resend: class {
      emails = {
        send: async (payload: Record<string, unknown>) => {
          resendSendCalls.push(payload)
          if (resendShouldFail) {
            return { data: null, error: { message: resendFailMessage } }
          }
          return { data: { id: resendReturnId }, error: null }
        },
      }
    },
  }
})

// =====================================================
// 2. get_orders mock — Order 집계는 별도 tool 책임
// =====================================================

type MockOrder = {
  id: string
  storeId: string
  productId: string
  customerName: string
  customerPhone: string | null
  quantity: number
  totalPrice: number
  status: string
}

let mockOrders: MockOrder[] = []
let mockTotalQuantity = 0
let getOrdersShouldThrow = false

vi.mock('../get-orders', () => ({
  getOrders: vi.fn(async () => {
    if (getOrdersShouldThrow) {
      throw new Error('get_orders failed')
    }
    return {
      orders: mockOrders,
      totalQuantity: mockTotalQuantity,
      anomalies: [],
    }
  }),
}))

// =====================================================
// 3. Supabase mock — stores, products, generated_assets, phone_access_log
// =====================================================

type StoreRow = {
  id: string
  name: string
  wholesale_email: string | null
  wholesale_from_email: string
}

type ProductRow = {
  id: string
  store_id: string
  name: string
  pickup_date: string
  flow_stage: string
}

let mockStore: StoreRow | null = null
let mockProduct: ProductRow | null = null
let storesError: { message: string } | null = null
let productsError: { message: string } | null = null

const generatedAssetsInserts: Array<Record<string, unknown>> = []
const phoneAccessLogInserts: Array<Record<string, unknown>> = []
const productsUpdates: Array<{ patch: Record<string, unknown>; id: string | null }> = []

let assetsInsertShouldFail = false
let phoneLogInsertShouldFail = false
let productsUpdateShouldFail = false

function makeStoresBuilder() {
  const self: any = {
    select: () => self,
    eq: (_col: string, _val: unknown) => self,
    single: () =>
      Promise.resolve(
        storesError
          ? { data: null, error: storesError }
          : { data: mockStore, error: null },
      ),
  }
  return self
}

function makeProductsBuilder() {
  let lastEqId: string | null = null
  const self: any = {
    select: () => self,
    eq: (col: string, val: unknown) => {
      if (col === 'id') lastEqId = String(val)
      return self
    },
    single: () =>
      Promise.resolve(
        productsError
          ? { data: null, error: productsError }
          : { data: mockProduct, error: null },
      ),
    update: (patch: Record<string, unknown>) => {
      return {
        eq: (col: string, val: unknown) => {
          if (productsUpdateShouldFail) {
            return Promise.resolve({ error: { message: 'update fail' } })
          }
          productsUpdates.push({ patch, id: col === 'id' ? String(val) : lastEqId })
          return Promise.resolve({ error: null })
        },
      }
    },
  }
  return self
}

function makeGeneratedAssetsBuilder() {
  return {
    insert: (row: Record<string, unknown>) => {
      if (assetsInsertShouldFail) {
        return Promise.resolve({ error: { message: 'assets insert fail' } })
      }
      generatedAssetsInserts.push(row)
      return Promise.resolve({ error: null })
    },
  }
}

function makePhoneAccessLogBuilder() {
  return {
    insert: (row: Record<string, unknown>) => {
      if (phoneLogInsertShouldFail) {
        return Promise.resolve({ error: { message: 'phone log fail' } })
      }
      phoneAccessLogInserts.push(row)
      return Promise.resolve({ error: null })
    },
  }
}

vi.mock('@onword/db', () => ({
  createServiceClient: () => ({
    from: vi.fn((table: string) => {
      switch (table) {
        case 'stores':
          return makeStoresBuilder()
        case 'products':
          return makeProductsBuilder()
        case 'generated_assets':
          return makeGeneratedAssetsBuilder()
        case 'phone_access_log':
          return makePhoneAccessLogBuilder()
        default:
          throw new Error(`unexpected table: ${table}`)
      }
    }),
  }),
}))

// =====================================================
// 4. SUT import — mock 이후에 import (중요)
// =====================================================

import { notifyWholesaler } from '../notify-wholesaler'

// =====================================================
// Helpers + reset
// =====================================================

function defaultStore(overrides: Partial<StoreRow> = {}): StoreRow {
  return {
    id: 'store-A',
    name: '판다팜',
    wholesale_email: 'wholesale@panda.kr',
    wholesale_from_email: 'noreply@onword.kr',
    ...overrides,
  }
}

function defaultProduct(overrides: Partial<ProductRow> = {}): ProductRow {
  return {
    id: 'p-1',
    store_id: 'store-A',
    name: '한우 등심 500g',
    pickup_date: '2026-05-20',
    flow_stage: 'order_closed',
    ...overrides,
  }
}

function defaultOrder(overrides: Partial<MockOrder> = {}): MockOrder {
  return {
    id: 'o1',
    storeId: 'store-A',
    productId: 'p-1',
    customerName: '홍길동',
    customerPhone: '**1234',
    quantity: 2,
    totalPrice: 50000,
    status: 'confirmed',
    ...overrides,
  }
}

beforeEach(() => {
  // resend reset
  resendSendCalls.length = 0
  resendShouldFail = false
  resendFailMessage = 'Resend failure'
  resendReturnId = 'resend-email-id-123'

  // supabase reset
  mockStore = defaultStore()
  mockProduct = defaultProduct()
  storesError = null
  productsError = null
  generatedAssetsInserts.length = 0
  phoneAccessLogInserts.length = 0
  productsUpdates.length = 0
  assetsInsertShouldFail = false
  phoneLogInsertShouldFail = false
  productsUpdateShouldFail = false

  // orders reset
  mockOrders = [defaultOrder()]
  mockTotalQuantity = 2
  getOrdersShouldThrow = false

  // env reset
  process.env.RESEND_API_KEY = 're_test_key'
  delete process.env.WHOLESALE_DEFAULT_RECIPIENT
})

afterEach(() => {
  vi.clearAllMocks()
})

// =====================================================
// 1. 정상 동작
// =====================================================

describe('notify_wholesaler — 정상', () => {
  it('sent=true + recipientCount=1 + emailId 반환', async () => {
    const result = await notifyWholesaler({ productId: 'p-1' })

    expect(result.sent).toBe(true)
    expect(result.recipientCount).toBe(1)
    expect(result.emailId).toBe('resend-email-id-123')
  })

  it('stores.wholesale_email 로 발송', async () => {
    await notifyWholesaler({ productId: 'p-1' })

    expect(resendSendCalls).toHaveLength(1)
    expect(resendSendCalls[0].to).toBe('wholesale@panda.kr')
  })

  it('stores.wholesale_from_email 으로 from 설정', async () => {
    mockStore = defaultStore({ wholesale_from_email: 'orders@store.kr' })
    await notifyWholesaler({ productId: 'p-1' })

    expect(resendSendCalls[0].from).toBe('orders@store.kr')
  })

  it('subject 에 상품명 + 총 수량 포함', async () => {
    mockTotalQuantity = 17
    mockOrders = [defaultOrder({ quantity: 17 })]
    await notifyWholesaler({ productId: 'p-1' })

    const subject = String(resendSendCalls[0].subject)
    expect(subject).toContain('한우 등심 500g')
    expect(subject).toContain('17')
  })

  it('본문(text)에 상품명 / 총 수량 / 픽업일 포함', async () => {
    mockTotalQuantity = 23
    mockOrders = [defaultOrder({ quantity: 23 })]
    await notifyWholesaler({ productId: 'p-1' })

    const body = String(resendSendCalls[0].text ?? resendSendCalls[0].html ?? '')
    expect(body).toContain('한우 등심 500g')
    expect(body).toContain('23')
    expect(body).toContain('2026-05-20')
  })
})

// =====================================================
// 2. Recipient 우선순위 — override > stores.wholesale_email > env fallback
// =====================================================

describe('notify_wholesaler — recipient 우선순위', () => {
  it('recipientOverride 가 stores.wholesale_email 보다 우선', async () => {
    mockStore = defaultStore({ wholesale_email: 'wholesale@panda.kr' })
    await notifyWholesaler({
      productId: 'p-1',
      recipientOverride: 'special@override.kr',
    })

    expect(resendSendCalls[0].to).toBe('special@override.kr')
  })

  it('stores.wholesale_email 미설정 시 WHOLESALE_DEFAULT_RECIPIENT 사용', async () => {
    mockStore = defaultStore({ wholesale_email: null })
    process.env.WHOLESALE_DEFAULT_RECIPIENT = 'fallback@onword.kr'

    await notifyWholesaler({ productId: 'p-1' })

    expect(resendSendCalls[0].to).toBe('fallback@onword.kr')
  })

  it('stores.wholesale_email 없고 env 도 없으면 throw "도매 이메일 미설정"', async () => {
    mockStore = defaultStore({ wholesale_email: null })
    delete process.env.WHOLESALE_DEFAULT_RECIPIENT

    await expect(notifyWholesaler({ productId: 'p-1' })).rejects.toThrow(
      /도매 이메일 미설정/,
    )
  })

  it('recipientOverride 가 빈 문자열이면 fallback 진행 (override로 취급 X)', async () => {
    mockStore = defaultStore({ wholesale_email: 'wholesale@panda.kr' })

    await notifyWholesaler({ productId: 'p-1', recipientOverride: '' })

    expect(resendSendCalls[0].to).toBe('wholesale@panda.kr')
  })
})

// =====================================================
// 3. 실패 케이스
// =====================================================

describe('notify_wholesaler — 실패', () => {
  it('productId 누락 시 throw', async () => {
    await expect(
      // @ts-expect-error — 의도적 누락
      notifyWholesaler({}),
    ).rejects.toThrow(/productId/)
  })

  it('product 조회 실패 시 throw', async () => {
    productsError = { message: 'not found' }
    mockProduct = null

    await expect(notifyWholesaler({ productId: 'p-1' })).rejects.toThrow(
      /상품을 찾을 수 없습니다|Product not found/,
    )
  })

  it('store 조회 실패 시 throw', async () => {
    storesError = { message: 'store fetch fail' }
    mockStore = null

    await expect(notifyWholesaler({ productId: 'p-1' })).rejects.toThrow(
      /매장|store/i,
    )
  })

  it('주문 0건 시 sent=false 반환 (Resend 호출 0)', async () => {
    mockOrders = []
    mockTotalQuantity = 0

    const result = await notifyWholesaler({ productId: 'p-1' })

    expect(result.sent).toBe(false)
    expect(result.recipientCount).toBe(0)
    expect(resendSendCalls).toHaveLength(0)
  })

  it('Resend 발송 실패 시 throw "이메일 전송 실패"', async () => {
    resendShouldFail = true
    resendFailMessage = 'SMTP refused'

    await expect(notifyWholesaler({ productId: 'p-1' })).rejects.toThrow(
      /이메일 전송 실패.*SMTP refused/,
    )
  })

  it('get_orders 실패 시 propagate (throw)', async () => {
    getOrdersShouldThrow = true

    await expect(notifyWholesaler({ productId: 'p-1' })).rejects.toThrow(
      /get_orders/,
    )
  })
})

// =====================================================
// 4. PIPA — 본문에 customer_phone / customer_name 절대 포함 X
// =====================================================

describe('notify_wholesaler — PIPA 본문 차단', () => {
  it('customer_phone(마스킹된 것도) 본문에 절대 포함 X', async () => {
    mockOrders = [
      defaultOrder({ id: 'o1', customerName: '홍길동', customerPhone: '**1234' }),
      defaultOrder({ id: 'o2', customerName: '김철수', customerPhone: '**5678' }),
      defaultOrder({ id: 'o3', customerName: '이영희', customerPhone: '**9012' }),
    ]
    mockTotalQuantity = 6

    await notifyWholesaler({ productId: 'p-1' })

    const payload = resendSendCalls[0]
    const subject = String(payload.subject ?? '')
    const text = String(payload.text ?? '')
    const html = String(payload.html ?? '')
    const combined = `${subject}\n${text}\n${html}`

    // 마스킹된 phone 도 본문에 포함 금지
    expect(combined).not.toContain('1234')
    expect(combined).not.toContain('5678')
    expect(combined).not.toContain('9012')
    expect(combined).not.toMatch(/\*\*\d{4}/)
  })

  it('customer_name 본문에 절대 포함 X', async () => {
    mockOrders = [
      defaultOrder({ id: 'o1', customerName: '홍길동' }),
      defaultOrder({ id: 'o2', customerName: '김철수' }),
    ]
    mockTotalQuantity = 4

    await notifyWholesaler({ productId: 'p-1' })

    const payload = resendSendCalls[0]
    const combined = `${String(payload.subject ?? '')}\n${String(
      payload.text ?? '',
    )}\n${String(payload.html ?? '')}`

    expect(combined).not.toContain('홍길동')
    expect(combined).not.toContain('김철수')
  })

  it('풀번호가 어떤 경로로 들어와도 본문 미포함 (방어층)', async () => {
    // 시나리오: 어떤 버그로 풀번호가 customerPhone 에 들어왔다 가정
    mockOrders = [
      defaultOrder({ customerPhone: '01012345678' as any }),
    ]
    mockTotalQuantity = 2

    await notifyWholesaler({ productId: 'p-1' })

    const payload = resendSendCalls[0]
    const combined = `${String(payload.subject ?? '')}\n${String(
      payload.text ?? '',
    )}\n${String(payload.html ?? '')}`

    expect(combined).not.toContain('01012345678')
    expect(combined).not.toContain('1234')
  })
})

// =====================================================
// 5. PIPA — phone_access_log action='export' INSERT
// =====================================================

describe('notify_wholesaler — PIPA phone_access_log', () => {
  it("phone_access_log INSERT 1건 (action='export', reason='wholesale_email')", async () => {
    await notifyWholesaler({ productId: 'p-1' })

    expect(phoneAccessLogInserts).toHaveLength(1)
    const log = phoneAccessLogInserts[0]
    expect(log.action).toBe('export')
    expect(log.reason).toBe('wholesale_email')
    expect(log.store_id).toBe('store-A')
  })

  it('order_id 는 null (bulk export)', async () => {
    await notifyWholesaler({ productId: 'p-1' })

    expect(phoneAccessLogInserts[0].order_id).toBeNull()
  })

  it('주문 0건이어도 phone_access_log INSERT 안 함 (실제 export 안 했으므로)', async () => {
    mockOrders = []
    mockTotalQuantity = 0

    await notifyWholesaler({ productId: 'p-1' })

    expect(phoneAccessLogInserts).toHaveLength(0)
  })
})

// =====================================================
// 6. flow_stage 업데이트
// =====================================================

describe('notify_wholesaler — flow_stage', () => {
  it("성공 시 products.flow_stage = 'warehouse_notified' 업데이트", async () => {
    await notifyWholesaler({ productId: 'p-1' })

    const update = productsUpdates.find(
      (u) => u.patch.flow_stage === 'warehouse_notified',
    )
    expect(update).toBeDefined()
    expect(update?.id).toBe('p-1')
  })

  it('Resend 실패 시 flow_stage 업데이트 X', async () => {
    resendShouldFail = true

    await expect(notifyWholesaler({ productId: 'p-1' })).rejects.toThrow()

    expect(productsUpdates).toHaveLength(0)
  })
})

// =====================================================
// 7. generated_assets 기록
// =====================================================

describe('notify_wholesaler — generated_assets', () => {
  it("type='wholesale_email' asset INSERT", async () => {
    await notifyWholesaler({ productId: 'p-1' })

    expect(generatedAssetsInserts).toHaveLength(1)
    const asset = generatedAssetsInserts[0]
    expect(asset.type).toBe('wholesale_email')
    expect(asset.product_id).toBe('p-1')
    expect(asset.store_id).toBe('store-A')
  })

  it('asset.content 에도 customer_phone / customer_name 포함 X', async () => {
    mockOrders = [
      defaultOrder({ customerName: '홍길동', customerPhone: '**1234' }),
    ]
    await notifyWholesaler({ productId: 'p-1' })

    const content = String(generatedAssetsInserts[0].content ?? '')
    expect(content).not.toContain('홍길동')
    expect(content).not.toContain('1234')
    expect(content).not.toMatch(/\*\*\d{4}/)
  })
})

// =====================================================
// 8. Output shape
// =====================================================

describe('notify_wholesaler — Output shape', () => {
  it('NotifyWholesalerOutput 필드: sent / recipientCount / emailId', async () => {
    const result = await notifyWholesaler({ productId: 'p-1' })

    expect(result).toHaveProperty('sent')
    expect(result).toHaveProperty('recipientCount')
    expect(result).toHaveProperty('emailId')
    expect(typeof result.sent).toBe('boolean')
    expect(typeof result.recipientCount).toBe('number')
  })

  it('output 객체에 customer_phone 필드/값 절대 노출 X', async () => {
    const result = await notifyWholesaler({ productId: 'p-1' })
    const serialized = JSON.stringify(result)

    expect(serialized).not.toMatch(/phone/i)
    expect(serialized).not.toContain('1234')
    expect(serialized).not.toMatch(/\*\*\d{4}/)
  })
})
