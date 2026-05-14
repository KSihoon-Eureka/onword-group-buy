/**
 * TDD: generate_announcement (Phase D.1 + D.2 + D.3)
 *
 * Stage 1 (모집 시작) + Stage 2 (마감 임박, 단일/다중) + Stage 3 (수령 안내).
 *
 * 외부 의존 mock 원칙:
 *   - Anthropic SDK: vi.mock 으로 messages.create 가짜화. 절대 실제 API X.
 *   - Supabase: vi.mock('@onword/db') 로 from(table) 라우팅.
 *   - 시간: vi.useFakeTimers + setSystemTime — Stage 3 today 결정용.
 *
 * 실행:
 *   pnpm --filter=@onword/agent test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fixture from './__fixtures__/schmidt-pillow-cover.json'

// =====================================================
// Mocks — vi.hoisted 로 import 전에 평가
// =====================================================

const {
  anthropicCreateMock,
  productsSingleMock,
  productsInMock,
  productsListEqMock,
  storesSingleMock,
  assetsInsertMock,
} = vi.hoisted(() => ({
  anthropicCreateMock: vi.fn(),
  productsSingleMock: vi.fn(),
  productsInMock: vi.fn(),
  productsListEqMock: vi.fn(),
  storesSingleMock: vi.fn(),
  assetsInsertMock: vi.fn(),
}))

vi.mock('@anthropic-ai/sdk', () => {
  // default export = Anthropic class
  return {
    default: class MockAnthropic {
      messages = { create: anthropicCreateMock }
      constructor(_opts?: unknown) {}
    },
  }
})

vi.mock('@onword/db', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === 'products') {
        return {
          select: (_cols: string) => ({
            // single product (stage 1 / 2 단일)
            eq: (col: string, val: unknown) => ({
              single: () => productsSingleMock({ col, val }),
              // stage 3: .eq('store_id', ...).eq('pickup_date', today).eq('status', 'active')
              eq: (col2: string, val2: unknown) => ({
                eq: (col3: string, val3: unknown) =>
                  productsListEqMock({
                    filters: [
                      { col, val },
                      { col: col2, val: val2 },
                      { col: col3, val: val3 },
                    ],
                  }),
              }),
            }),
            // stage 2 다중: .in('id', ids)
            in: (col: string, vals: unknown) => productsInMock({ col, vals }),
          }),
        }
      }
      if (table === 'stores') {
        return {
          select: (_cols: string) => ({
            eq: (col: string, val: unknown) => ({
              single: () => storesSingleMock({ col, val }),
            }),
          }),
        }
      }
      if (table === 'generated_assets') {
        return {
          insert: (payload: unknown) => {
            assetsInsertMock(payload)
            return {
              select: (_cols: string) => ({
                single: () =>
                  Promise.resolve({ data: { id: 'asset-mock-1' }, error: null }),
              }),
            }
          },
        }
      }
      throw new Error(`Unexpected table in mock: ${table}`)
    },
  }),
}))

// Import 후 reset 가능
import { generateAnnouncement } from '../generate-announcement'

// =====================================================
// Test data builders
// =====================================================

const STORE_ROW = {
  id: 'store-pandafarm',
  name: '판다팜',
  brand_name: '산타',
  short_name: '산타가족',
  leading_emoji: '🐼',
}

const PRODUCT_ROW = {
  id: fixture.product.id,
  store_id: 'store-pandafarm',
  name: fixture.product.name,
  description: fixture.product.description,
  category: fixture.product.category,
  price: fixture.product.price,
  compare_price: fixture.product.compare_price,
  order_deadline: fixture.product.order_deadline,
  pickup_date: fixture.product.pickup_date,
  pickup_deadline: fixture.product.pickup_deadline,
  status: 'active',
  flow_stage: fixture.product.flow_stage,
}

function fakeClaudeResponse(text: string) {
  return { content: [{ type: 'text', text }] }
}

// =====================================================
// 공통 setup
// =====================================================

beforeEach(() => {
  anthropicCreateMock.mockReset()
  productsSingleMock.mockReset()
  productsInMock.mockReset()
  productsListEqMock.mockReset()
  storesSingleMock.mockReset()
  assetsInsertMock.mockReset()

  // 기본: store 조회 성공
  storesSingleMock.mockResolvedValue({ data: STORE_ROW, error: null })
  // 기본: single product 조회 성공
  productsSingleMock.mockResolvedValue({ data: PRODUCT_ROW, error: null })
})

afterEach(() => {
  vi.useRealTimers()
})

// =====================================================
// Stage 1 — 모집 시작 공고
// =====================================================

describe('generate_announcement — Stage 1 (모집 시작)', () => {
  it('returns content + assetId on success', async () => {
    anthropicCreateMock.mockResolvedValueOnce(
      fakeClaudeResponse(fixture.expected_announcement_stage_1),
    )

    const result = await generateAnnouncement({
      productId: PRODUCT_ROW.id,
      storeId: STORE_ROW.id,
      stage: 1,
    })

    expect(result.content).toBe(fixture.expected_announcement_stage_1)
    expect(result.assetId).toBe('asset-mock-1')
  })

  it('passes store + product variables into Claude prompt', async () => {
    anthropicCreateMock.mockResolvedValueOnce(fakeClaudeResponse('OK'))

    await generateAnnouncement({
      productId: PRODUCT_ROW.id,
      storeId: STORE_ROW.id,
      stage: 1,
    })

    expect(anthropicCreateMock).toHaveBeenCalledTimes(1)
    const arg = anthropicCreateMock.mock.calls[0][0] as {
      system: string
      messages: Array<{ role: string; content: string }>
    }
    const blob = arg.system + '\n' + arg.messages.map((m) => m.content).join('\n')

    // 변수 주입 검증
    expect(blob).toContain(STORE_ROW.name) // 판다팜
    expect(blob).toContain(STORE_ROW.brand_name) // 산타
    expect(blob).toContain(STORE_ROW.short_name) // 산타가족
    expect(blob).toContain(STORE_ROW.leading_emoji) // 🐼
    expect(blob).toContain(PRODUCT_ROW.name)
    // 가격 콤마 포맷 (A12)
    expect(blob).toContain('8,900')
    expect(blob).toContain('40,000')
    // 날짜 한국어 포맷 (A12)
    expect(blob).toMatch(/05월 07일\(수\) 오후 2시|05월 07일\(목\) 오후 2시/)
    expect(blob).toMatch(/05월 09일\(.\)/)
    expect(blob).toMatch(/05월 13일\(.\)/)
  })

  it('saves to generated_assets with type=announcement_stage1 + store_id', async () => {
    anthropicCreateMock.mockResolvedValueOnce(fakeClaudeResponse('text-A'))

    await generateAnnouncement({
      productId: PRODUCT_ROW.id,
      storeId: STORE_ROW.id,
      stage: 1,
    })

    expect(assetsInsertMock).toHaveBeenCalledTimes(1)
    const payload = assetsInsertMock.mock.calls[0][0] as {
      product_id: string
      store_id: string
      type: string
      content: string
    }
    expect(payload).toMatchObject({
      product_id: PRODUCT_ROW.id,
      store_id: STORE_ROW.id,
      type: 'announcement_stage1',
      content: 'text-A',
    })
  })

  it('throws when productId is missing for stage 1', async () => {
    await expect(
      generateAnnouncement({
        storeId: STORE_ROW.id,
        stage: 1,
      }),
    ).rejects.toThrow(/productId/i)
    expect(anthropicCreateMock).not.toHaveBeenCalled()
  })

  it('throws when product not found', async () => {
    productsSingleMock.mockResolvedValueOnce({ data: null, error: null })

    await expect(
      generateAnnouncement({
        productId: 'nope',
        storeId: STORE_ROW.id,
        stage: 1,
      }),
    ).rejects.toThrow(/product/i)
  })

  it('throws when Claude returns no text block', async () => {
    anthropicCreateMock.mockResolvedValueOnce({
      content: [{ type: 'tool_use', input: {} }],
    })

    await expect(
      generateAnnouncement({
        productId: PRODUCT_ROW.id,
        storeId: STORE_ROW.id,
        stage: 1,
      }),
    ).rejects.toThrow(/text/i)
  })
})

// =====================================================
// Stage 2 — 마감 임박 (단일 / 다중)
// =====================================================

describe('generate_announcement — Stage 2 (마감 임박)', () => {
  it('single product: returns content + saves announcement_stage2', async () => {
    anthropicCreateMock.mockResolvedValueOnce(
      fakeClaudeResponse('⏰ 곧 마감되는 공구 상품이에요!\n🎁 슈미트 ...'),
    )

    const result = await generateAnnouncement({
      productId: PRODUCT_ROW.id,
      storeId: STORE_ROW.id,
      stage: 2,
    })

    expect(result.assetId).toBe('asset-mock-1')
    expect(result.content).toContain('곧 마감')

    expect(assetsInsertMock).toHaveBeenCalledTimes(1)
    expect(assetsInsertMock.mock.calls[0][0]).toMatchObject({
      type: 'announcement_stage2',
      product_id: PRODUCT_ROW.id,
      store_id: STORE_ROW.id,
    })
  })

  it('multi products: queries with .in(id, ids), prompt mentions each name', async () => {
    const p2 = { ...PRODUCT_ROW, id: 'p2', name: '두번째 상품', price: 5500 }
    const p3 = { ...PRODUCT_ROW, id: 'p3', name: '세번째 상품', price: 7700 }

    productsInMock.mockResolvedValueOnce({
      data: [PRODUCT_ROW, p2, p3],
      error: null,
    })
    anthropicCreateMock.mockResolvedValueOnce(
      fakeClaudeResponse('⏰ 곧 마감되는 공구 상품들이에요!\n🎁 ...'),
    )

    const result = await generateAnnouncement({
      productIds: [PRODUCT_ROW.id, 'p2', 'p3'],
      storeId: STORE_ROW.id,
      stage: 2,
    })

    expect(productsInMock).toHaveBeenCalledWith({
      col: 'id',
      vals: [PRODUCT_ROW.id, 'p2', 'p3'],
    })
    expect(result.content).toContain('곧 마감')

    const arg = anthropicCreateMock.mock.calls[0][0] as {
      system: string
      messages: Array<{ content: string }>
    }
    const blob = arg.system + arg.messages.map((m) => m.content).join('\n')
    expect(blob).toContain(PRODUCT_ROW.name)
    expect(blob).toContain('두번째 상품')
    expect(blob).toContain('세번째 상품')

    // store_id 만 (다중에서는 product_id null 또는 첫 product 가능 — 본 구현은 null)
    const payload = assetsInsertMock.mock.calls[0][0] as {
      type: string
      store_id: string
      product_id: string | null
    }
    expect(payload.type).toBe('announcement_stage2')
    expect(payload.store_id).toBe(STORE_ROW.id)
  })

  it('throws when neither productId nor productIds provided for stage 2', async () => {
    await expect(
      generateAnnouncement({
        storeId: STORE_ROW.id,
        stage: 2,
      }),
    ).rejects.toThrow(/product/i)
  })
})

// =====================================================
// Stage 3 — 수령 안내
// =====================================================

describe('generate_announcement — Stage 3 (수령 안내)', () => {
  beforeEach(() => {
    // 오늘 = 2025-05-09 (fixture pickup_date) — KST 자정 기준
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-05-09T03:00:00Z')) // 12:00 KST
  })

  it('queries products with store_id + today pickup_date + status=active', async () => {
    productsListEqMock.mockResolvedValueOnce({
      data: [PRODUCT_ROW],
      error: null,
    })
    anthropicCreateMock.mockResolvedValueOnce(
      fakeClaudeResponse(
        '📢 오늘 수령 가능 상품 안내\n🎁 슈미트 ...\n늦지 않게 방문해 주세요! 🏃 💨\n감사합니다! 🥰',
      ),
    )

    const result = await generateAnnouncement({
      storeId: STORE_ROW.id,
      stage: 3,
    })

    expect(result.content).toContain('오늘 수령 가능')
    expect(result.content).toContain('감사합니다')

    expect(productsListEqMock).toHaveBeenCalledTimes(1)
    const filters = productsListEqMock.mock.calls[0][0].filters as Array<{
      col: string
      val: unknown
    }>
    const filterMap = new Map(filters.map((f) => [f.col, f.val]))
    expect(filterMap.get('store_id')).toBe(STORE_ROW.id)
    expect(filterMap.get('pickup_date')).toBe('2025-05-09')
    expect(filterMap.get('status')).toBe('active')
  })

  it('throws when no products to pick up today', async () => {
    productsListEqMock.mockResolvedValueOnce({ data: [], error: null })

    await expect(
      generateAnnouncement({
        storeId: STORE_ROW.id,
        stage: 3,
      }),
    ).rejects.toThrow(/표시할 상품 없음|no products|픽업/i)

    expect(anthropicCreateMock).not.toHaveBeenCalled()
    expect(assetsInsertMock).not.toHaveBeenCalled()
  })

  it('saves with type=announcement_stage3, product_id null', async () => {
    productsListEqMock.mockResolvedValueOnce({
      data: [PRODUCT_ROW],
      error: null,
    })
    anthropicCreateMock.mockResolvedValueOnce(fakeClaudeResponse('text-3'))

    await generateAnnouncement({
      storeId: STORE_ROW.id,
      stage: 3,
    })

    expect(assetsInsertMock).toHaveBeenCalledTimes(1)
    expect(assetsInsertMock.mock.calls[0][0]).toMatchObject({
      type: 'announcement_stage3',
      store_id: STORE_ROW.id,
      product_id: null,
    })
  })
})

// =====================================================
// 재시도 — 429 exponential backoff (max 2 retries)
// =====================================================

describe('generate_announcement — 429 retry policy', () => {
  it('retries up to 2x on 429 then succeeds', async () => {
    const err429: Error & { status?: number } = new Error('rate limited')
    err429.status = 429

    anthropicCreateMock
      .mockRejectedValueOnce(err429)
      .mockRejectedValueOnce(err429)
      .mockResolvedValueOnce(fakeClaudeResponse('finally ok'))

    const result = await generateAnnouncement({
      productId: PRODUCT_ROW.id,
      storeId: STORE_ROW.id,
      stage: 1,
    })

    expect(result.content).toBe('finally ok')
    expect(anthropicCreateMock).toHaveBeenCalledTimes(3)
  })

  it('throws when 429 persists past retry budget', async () => {
    const err429: Error & { status?: number } = new Error('rate limited')
    err429.status = 429
    anthropicCreateMock.mockRejectedValue(err429)

    await expect(
      generateAnnouncement({
        productId: PRODUCT_ROW.id,
        storeId: STORE_ROW.id,
        stage: 1,
      }),
    ).rejects.toThrow(/rate limited|429/)

    expect(anthropicCreateMock).toHaveBeenCalledTimes(3) // 1 + 2 retries
  })

  it('non-429 error does NOT retry', async () => {
    const err500 = new Error('boom')
    anthropicCreateMock.mockRejectedValueOnce(err500)

    await expect(
      generateAnnouncement({
        productId: PRODUCT_ROW.id,
        storeId: STORE_ROW.id,
        stage: 1,
      }),
    ).rejects.toThrow(/boom/)

    expect(anthropicCreateMock).toHaveBeenCalledTimes(1)
  })
})

// =====================================================
// Invalid stage
// =====================================================

describe('generate_announcement — invalid input', () => {
  it('throws on unknown stage', async () => {
    await expect(
      generateAnnouncement({
        productId: PRODUCT_ROW.id,
        storeId: STORE_ROW.id,
        // @ts-expect-error invalid stage
        stage: 99,
      }),
    ).rejects.toThrow(/stage/i)
  })
})
