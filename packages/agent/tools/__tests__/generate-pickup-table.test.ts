/**
 * TDD: generate_pickup_table (Phase D.8)
 *
 * PRD §13 — 수령일 비교 테이블.
 *   - 입력: storeId + rangeDays? (default 5, 3-7) + productIds?
 *   - 출력: { imageUrl, imageAssetId, textAssetId, productCount }
 *   - 두 assets: pickup_table_image + pickup_table_text (동반 카톡)
 *
 * 의존성:
 *   - Sharp: 실제 라이브러리 호출 (mock 안 함). 800px width PNG 검증.
 *   - Supabase: vi.mock('@onword/db') 로 from() + uploadToStorage 라우팅.
 *   - 시간: vi.useFakeTimers — 마감 임박 vs 수령 가능 분류는 today에 의존.
 *
 * 폰트 정책: compose-poster 와 동일. font-family 명시, 실제 시각 검증은 Phase F.6.
 *
 * 실행:
 *   pnpm --filter=@onword/agent test generate-pickup-table
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import sharp from 'sharp'

// =====================================================
// Mocks
// =====================================================

const {
  productsListMock,
  assetsInsertMock,
  assetsInsertResultMock,
  uploadToStorageMock,
} = vi.hoisted(() => ({
  productsListMock: vi.fn(),
  assetsInsertMock: vi.fn(),
  assetsInsertResultMock: vi.fn(),
  uploadToStorageMock: vi.fn(),
}))

vi.mock('@onword/db', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === 'products') {
        // Builder pattern supporting both:
        //   .select(*).eq('store_id', X).eq('status', 'active').in('flow_stage', [...]) → list
        //   .select(*).eq('store_id', X).in('id', ids).eq('status', 'active').in('flow_stage', [...]) → list
        const ops: Array<{ type: string; col?: string; val?: unknown; vals?: unknown }> = []
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const builder: any = {}
        const thenLike = {
          then: (onFul: (v: unknown) => unknown) =>
            productsListMock({ ops }).then(onFul),
        }
        builder.select = (_cols: string) => {
          ops.push({ type: 'select' })
          return builder
        }
        builder.eq = (col: string, val: unknown) => {
          ops.push({ type: 'eq', col, val })
          return Object.assign({}, builder, thenLike)
        }
        builder.in = (col: string, vals: unknown) => {
          ops.push({ type: 'in', col, vals })
          return Object.assign({}, builder, thenLike)
        }
        builder.order = (col: string) => {
          ops.push({ type: 'order', col })
          return Object.assign({}, builder, thenLike)
        }
        return builder
      }
      if (table === 'generated_assets') {
        return {
          insert: (payload: unknown) => {
            assetsInsertMock(payload)
            return {
              select: (_cols: string) => ({
                single: () => assetsInsertResultMock(),
              }),
            }
          },
        }
      }
      throw new Error(`Unexpected table in mock: ${table}`)
    },
  }),
  uploadToStorage: (...args: unknown[]) => uploadToStorageMock(...args),
}))

import { generatePickupTable } from '../generate-pickup-table'

// =====================================================
// Test data
// =====================================================

/**
 * 오늘 = 2025-05-13 (KST) 로 고정.
 *   - p1: arrived, pickup_deadline = 2025-05-13 → 마감 임박 (≤1d)
 *   - p2: arrived, pickup_deadline = 2025-05-16 → 수령 가능 (>1d)
 *   - p3: order_open, pickup_deadline = 2025-05-20 → 상품 준비
 */
const PROD_IMMINENT = {
  id: 'p1',
  store_id: 'store-pandafarm',
  name: '슈미트 냉감 쿨 베개커버 세트(2장)',
  flow_stage: 'arrived',
  pickup_date: '2025-05-09',
  pickup_deadline: '2025-05-13',
  status: 'active',
}

const PROD_AVAILABLE = {
  id: 'p2',
  store_id: 'store-pandafarm',
  name: '여름 이불 세트',
  flow_stage: 'arrived',
  pickup_date: '2025-05-12',
  pickup_deadline: '2025-05-16',
  status: 'active',
}

const PROD_PREPARING = {
  id: 'p3',
  store_id: 'store-pandafarm',
  name: '캠핑 매트',
  flow_stage: 'order_open',
  pickup_date: '2025-05-18',
  pickup_deadline: '2025-05-20',
  status: 'active',
}

// =====================================================
// Setup
// =====================================================

let assetInsertCounter = 0

beforeEach(() => {
  productsListMock.mockReset()
  assetsInsertMock.mockReset()
  assetsInsertResultMock.mockReset()
  uploadToStorageMock.mockReset()

  assetInsertCounter = 0
  // 첫 insert = image asset, 둘째 = text asset
  assetsInsertResultMock.mockImplementation(() => {
    assetInsertCounter += 1
    return Promise.resolve({
      data: { id: `asset-${assetInsertCounter}` },
      error: null,
    })
  })

  uploadToStorageMock.mockResolvedValue(
    'https://storage.example.com/pickup-tables/12345.png',
  )

  // Today = 2025-05-13 KST (12:00 KST = 03:00 UTC)
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2025-05-13T03:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

// =====================================================
// 정상 케이스 — 3개 상품 (마감 임박 + 수령 가능 + 상품 준비)
// =====================================================

describe('generate_pickup_table — 정상 경로', () => {
  it('returns imageUrl + imageAssetId + textAssetId + productCount', async () => {
    productsListMock.mockResolvedValueOnce({
      data: [PROD_IMMINENT, PROD_AVAILABLE, PROD_PREPARING],
      error: null,
    })

    const result = await generatePickupTable({ storeId: 'store-pandafarm' })

    expect(result.imageUrl).toBe(
      'https://storage.example.com/pickup-tables/12345.png',
    )
    expect(result.imageAssetId).toBe('asset-1')
    expect(result.textAssetId).toBe('asset-2')
    expect(result.productCount).toBe(3)
  })

  it('queries with store_id + active status filter', async () => {
    productsListMock.mockResolvedValueOnce({
      data: [PROD_IMMINENT, PROD_AVAILABLE, PROD_PREPARING],
      error: null,
    })

    await generatePickupTable({ storeId: 'store-pandafarm' })

    expect(productsListMock).toHaveBeenCalledTimes(1)
    const ops = productsListMock.mock.calls[0][0].ops as Array<{
      type: string
      col?: string
      val?: unknown
      vals?: unknown
    }>
    const eqs = ops.filter((o) => o.type === 'eq')
    const eqMap = new Map(eqs.map((o) => [o.col, o.val]))
    expect(eqMap.get('store_id')).toBe('store-pandafarm')
    expect(eqMap.get('status')).toBe('active')
  })

  it('uses productIds filter when provided', async () => {
    productsListMock.mockResolvedValueOnce({
      data: [PROD_IMMINENT],
      error: null,
    })

    await generatePickupTable({
      storeId: 'store-pandafarm',
      productIds: ['p1'],
    })

    const ops = productsListMock.mock.calls[0][0].ops as Array<{
      type: string
      col?: string
      vals?: unknown
    }>
    const inIdOp = ops.find((o) => o.type === 'in' && o.col === 'id')
    expect(inIdOp).toBeDefined()
    expect(inIdOp?.vals).toEqual(['p1'])
  })

  it('uploads two assets: image (pickup_table_image) + text (pickup_table_text)', async () => {
    productsListMock.mockResolvedValueOnce({
      data: [PROD_IMMINENT, PROD_AVAILABLE],
      error: null,
    })

    await generatePickupTable({ storeId: 'store-pandafarm' })

    expect(assetsInsertMock).toHaveBeenCalledTimes(2)
    const types = assetsInsertMock.mock.calls.map(
      (c) => (c[0] as { type: string }).type,
    )
    expect(types).toContain('pickup_table_image')
    expect(types).toContain('pickup_table_text')

    const imagePayload = assetsInsertMock.mock.calls.find(
      (c) => (c[0] as { type: string }).type === 'pickup_table_image',
    )?.[0] as { store_id: string; asset_url: string }
    expect(imagePayload.store_id).toBe('store-pandafarm')
    expect(imagePayload.asset_url).toBe(
      'https://storage.example.com/pickup-tables/12345.png',
    )

    const textPayload = assetsInsertMock.mock.calls.find(
      (c) => (c[0] as { type: string }).type === 'pickup_table_text',
    )?.[0] as { store_id: string; content: string }
    expect(textPayload.store_id).toBe('store-pandafarm')
    expect(textPayload.content).toMatch(/수령 가능 상품/)
    expect(textPayload.content).toMatch(/마감 임박/)
  })

  it('outputs PNG 800px wide (height variable)', async () => {
    productsListMock.mockResolvedValueOnce({
      data: [PROD_IMMINENT, PROD_AVAILABLE, PROD_PREPARING],
      error: null,
    })

    let captured: Buffer | null = null
    uploadToStorageMock.mockImplementationOnce(async (_path: string, buf: Buffer) => {
      captured = buf
      return 'https://x'
    })

    await generatePickupTable({ storeId: 'store-pandafarm' })

    expect(captured).not.toBeNull()
    const meta = await sharp(captured as unknown as Buffer).metadata()
    expect(meta.format).toBe('png')
    expect(meta.width).toBe(800)
    expect(meta.height).toBeGreaterThanOrEqual(120) // header + ≥1 row + footer
  })
})

// =====================================================
// 빈 결과 — throw
// =====================================================

describe('generate_pickup_table — 빈 결과', () => {
  it('throws when no products match', async () => {
    productsListMock.mockResolvedValueOnce({ data: [], error: null })

    await expect(
      generatePickupTable({ storeId: 'store-pandafarm' }),
    ).rejects.toThrow(/표시할 상품 없음|no products|빈/i)

    expect(uploadToStorageMock).not.toHaveBeenCalled()
    expect(assetsInsertMock).not.toHaveBeenCalled()
  })
})

// =====================================================
// rangeDays 검증
// =====================================================

describe('generate_pickup_table — rangeDays 검증', () => {
  beforeEach(() => {
    productsListMock.mockResolvedValue({
      data: [PROD_IMMINENT],
      error: null,
    })
  })

  it('defaults rangeDays to 5 when not provided', async () => {
    const result = await generatePickupTable({ storeId: 'store-pandafarm' })
    expect(result.productCount).toBe(1)
  })

  it('accepts rangeDays in [3, 7]', async () => {
    for (const days of [3, 5, 7]) {
      const r = await generatePickupTable({
        storeId: 'store-pandafarm',
        rangeDays: days,
      })
      expect(r.productCount).toBe(1)
    }
  })

  it('throws when rangeDays < 3', async () => {
    await expect(
      generatePickupTable({ storeId: 'store-pandafarm', rangeDays: 2 }),
    ).rejects.toThrow(/range|3|7/i)
  })

  it('throws when rangeDays > 7', async () => {
    await expect(
      generatePickupTable({ storeId: 'store-pandafarm', rangeDays: 8 }),
    ).rejects.toThrow(/range|3|7/i)
  })
})

// =====================================================
// 동반 카톡 텍스트 (§13.5)
// =====================================================

describe('generate_pickup_table — 동반 카톡 텍스트', () => {
  it('matches PRD §13.5 template', async () => {
    productsListMock.mockResolvedValueOnce({
      data: [PROD_IMMINENT, PROD_AVAILABLE],
      error: null,
    })

    await generatePickupTable({ storeId: 'store-pandafarm' })

    const textPayload = assetsInsertMock.mock.calls.find(
      (c) => (c[0] as { type: string }).type === 'pickup_table_text',
    )?.[0] as { content: string }
    expect(textPayload.content).toContain('🗓️')
    expect(textPayload.content).toContain('이번 주 수령 가능 상품 안내')
    expect(textPayload.content).toContain('마감 임박')
    expect(textPayload.content).toContain('빨리 찾으러')
    expect(textPayload.content).toContain('문의 사항은 매장으로 연락주세요')
  })
})

// =====================================================
// 입력 / 의존성 에러
// =====================================================

describe('generate_pickup_table — 에러 경로', () => {
  it('throws when storeId is missing', async () => {
    await expect(
      // @ts-expect-error storeId required
      generatePickupTable({}),
    ).rejects.toThrow(/storeId/i)
  })

  it('throws when DB query fails', async () => {
    productsListMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'connection lost' },
    })
    await expect(
      generatePickupTable({ storeId: 'store-pandafarm' }),
    ).rejects.toThrow(/connection lost|fetch|products/i)
  })

  it('throws when storage upload fails', async () => {
    productsListMock.mockResolvedValueOnce({
      data: [PROD_IMMINENT],
      error: null,
    })
    uploadToStorageMock.mockRejectedValueOnce(
      new Error('Storage upload failed: bucket missing'),
    )
    await expect(
      generatePickupTable({ storeId: 'store-pandafarm' }),
    ).rejects.toThrow(/storage|upload/i)
  })

  it('throws when image asset insert fails', async () => {
    productsListMock.mockResolvedValueOnce({
      data: [PROD_IMMINENT],
      error: null,
    })
    assetsInsertResultMock.mockReset()
    assetsInsertResultMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'insert blew up' },
    })
    await expect(
      generatePickupTable({ storeId: 'store-pandafarm' }),
    ).rejects.toThrow(/asset|insert|blew up/i)
  })
})
