/**
 * TDD: crawl_naver_price (Phase D.6)
 *
 * PRD §10.4 + §11.2 — 네이버 가격비교 페이지 크롤 + 스크린샷.
 *
 * 시그니처 (packages/types/index.ts — 진실원):
 *   CrawlNaverPriceInput  = { productName }
 *   CrawlNaverPriceOutput = {
 *     data: { title, lowestPrice, modelName, sellers[] },
 *     imageUrl,
 *     assetIds: { dataId, imageId }   // ← 2개 (price_compare_data + price_compare_image)
 *   }
 *
 * 외부 의존 mock 원칙:
 *   - playwright: vi.mock 으로 chromium.launch / browser / context / page 가짜화.
 *     실제 네이버 접근 X.
 *   - @onword/db: createServiceClient + uploadToStorage 둘 다 mock.
 *
 * 절대 금지 (PRD §17, CLAUDE.md §1):
 *   - 차단 감지 시 추측 데이터 채움.
 *   - 가격비교 페이지 없을 때 가격 fabricate.
 *
 * 실행:
 *   pnpm --filter=@onword/agent test crawl-naver-price
 *
 * TDD 사이클:
 *   Red:   기존 skeleton 은 assetId(단수) 반환 — 본 테스트의 assetIds(복수) 기대와 불일치 → fail.
 *   Green: 신규 구현 — assetIds: { dataId, imageId } 반환.
 *   Refactor: extract helpers (USER_AGENTS, blocked detection).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// =====================================================
// Mocks — hoisted
// =====================================================

const {
  chromiumLaunchMock,
  browserCloseMock,
  contextCloseMock,
  newContextMock,
  newPageMock,
  pageGotoMock,
  pageEvaluateMock,
  pageContentMock,
  pageWaitForTimeoutMock,
  pageScreenshotMock,
  pageWaitForSelectorMock,
  pageClickMock,
  uploadToStorageMock,
  assetsInsertMock,
} = vi.hoisted(() => ({
  chromiumLaunchMock: vi.fn(),
  browserCloseMock: vi.fn(),
  contextCloseMock: vi.fn(),
  newContextMock: vi.fn(),
  newPageMock: vi.fn(),
  pageGotoMock: vi.fn(),
  pageEvaluateMock: vi.fn(),
  pageContentMock: vi.fn(),
  pageWaitForTimeoutMock: vi.fn(),
  pageScreenshotMock: vi.fn(),
  pageWaitForSelectorMock: vi.fn(),
  pageClickMock: vi.fn(),
  uploadToStorageMock: vi.fn(),
  assetsInsertMock: vi.fn(),
}))

vi.mock('playwright', () => ({
  chromium: { launch: chromiumLaunchMock },
}))

vi.mock('@onword/db', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === 'generated_assets') {
        return {
          insert: (payload: unknown) => {
            assetsInsertMock(payload)
            // 호출 순서로 id 결정: 1번째 = data, 2번째 = image
            const callIdx = assetsInsertMock.mock.calls.length
            const type = (payload as { type: string }).type
            const id =
              type === 'price_compare_data'
                ? `asset-data-${callIdx}`
                : type === 'price_compare_image'
                  ? `asset-image-${callIdx}`
                  : `asset-other-${callIdx}`
            return {
              select: (_cols: string) => ({
                single: () => Promise.resolve({ data: { id }, error: null }),
              }),
            }
          },
          // 캐시 lookup용 select chain — 본 tool 은 캐시 없음 (skeleton 의 캐시 로직은 제거)
          select: (_cols: string) => ({
            eq: (_c: string, _v: unknown) => ({
              gt: (_c2: string, _v2: unknown) => ({
                ilike: (_c3: string, _v3: unknown) => ({
                  limit: (_n: number) => ({
                    single: () => Promise.resolve({ data: null, error: null }),
                  }),
                }),
              }),
            }),
          }),
        }
      }
      throw new Error(`Unexpected table: ${table}`)
    },
  }),
  uploadToStorage: uploadToStorageMock,
}))

// 모든 mock 리셋 + page 객체 wiring
beforeEach(() => {
  chromiumLaunchMock.mockReset()
  browserCloseMock.mockReset()
  contextCloseMock.mockReset()
  newContextMock.mockReset()
  newPageMock.mockReset()
  pageGotoMock.mockReset()
  pageEvaluateMock.mockReset()
  pageContentMock.mockReset()
  pageWaitForTimeoutMock.mockReset()
  pageScreenshotMock.mockReset()
  pageWaitForSelectorMock.mockReset()
  pageClickMock.mockReset()
  uploadToStorageMock.mockReset()
  assetsInsertMock.mockReset()

  const page = {
    goto: pageGotoMock,
    evaluate: pageEvaluateMock,
    content: pageContentMock,
    waitForTimeout: pageWaitForTimeoutMock,
    screenshot: pageScreenshotMock,
    waitForSelector: pageWaitForSelectorMock,
    click: pageClickMock,
  }
  const context = {
    newPage: newPageMock.mockResolvedValue(page),
    close: contextCloseMock,
  }
  const browser = {
    newContext: newContextMock.mockResolvedValue(context),
    close: browserCloseMock,
  }
  chromiumLaunchMock.mockResolvedValue(browser)

  // 기본 happy-path: 차단 아님
  pageContentMock.mockResolvedValue('<html><body>normal price page</body></html>')
  pageGotoMock.mockResolvedValue(null)
  pageWaitForTimeoutMock.mockResolvedValue(undefined)
  pageWaitForSelectorMock.mockResolvedValue(null)
  pageClickMock.mockResolvedValue(undefined)
  pageScreenshotMock.mockResolvedValue(Buffer.from('png-bytes'))

  // 기본 데이터
  pageEvaluateMock.mockResolvedValue({
    title: '슈미트 차렵이불 커버',
    lowestPrice: '39,900',
    modelName: 'SCHMIDT-COVER-001',
    sellers: [
      { name: '쿠팡', price: '42,000' },
      { name: '11번가', price: '44,500' },
    ],
  })

  // Storage 업로드
  uploadToStorageMock.mockImplementation(async (path: string) => {
    return `https://supabase.example/storage/v1/${path}`
  })
})

// 이제 import (mock 평가 후)
import { crawlNaverPrice } from '../crawl-naver-price'

// =====================================================
// Constants
// =====================================================

const PRODUCT_NAME = '슈미트 차렵이불 커버'

// =====================================================
// Happy path
// =====================================================

describe('crawl_naver_price — happy path', () => {
  it('returns data + imageUrl + assetIds {dataId, imageId}', async () => {
    const result = await crawlNaverPrice({ productName: PRODUCT_NAME })

    expect(result.data.title).toBe('슈미트 차렵이불 커버')
    expect(result.data.lowestPrice).toBe('39,900')
    expect(result.data.modelName).toBe('SCHMIDT-COVER-001')
    expect(result.data.sellers).toEqual([
      { name: '쿠팡', price: '42,000' },
      { name: '11번가', price: '44,500' },
    ])

    expect(result.imageUrl).toMatch(/^https:\/\/supabase\.example/)
    expect(result.assetIds.dataId).toMatch(/^asset-data-/)
    expect(result.assetIds.imageId).toMatch(/^asset-image-/)
    expect(result.assetIds.dataId).not.toEqual(result.assetIds.imageId)
  })

  it('navigates to Naver shopping search with encoded productName', async () => {
    await crawlNaverPrice({ productName: PRODUCT_NAME })

    expect(pageGotoMock).toHaveBeenCalled()
    const url = pageGotoMock.mock.calls[0][0] as string
    expect(url).toContain('search.shopping.naver.com')
    // 한글 인코딩
    expect(url).toContain(encodeURIComponent(PRODUCT_NAME))
  })

  it('takes a screenshot + uploads to Storage with image/png', async () => {
    await crawlNaverPrice({ productName: PRODUCT_NAME })

    expect(pageScreenshotMock).toHaveBeenCalled()
    expect(uploadToStorageMock).toHaveBeenCalledTimes(1)
    const [path, _buf, contentType] = uploadToStorageMock.mock.calls[0]
    expect(path).toMatch(/naver-prices?\//)
    expect(contentType).toBe('image/png')
  })

  it('saves TWO generated_assets rows (price_compare_data + price_compare_image)', async () => {
    await crawlNaverPrice({ productName: PRODUCT_NAME })

    expect(assetsInsertMock).toHaveBeenCalledTimes(2)
    const types = assetsInsertMock.mock.calls.map(
      (c) => (c[0] as { type: string }).type,
    )
    expect(types).toContain('price_compare_data')
    expect(types).toContain('price_compare_image')

    // data row 는 content 또는 metadata 에 sellers 등 데이터 포함
    const dataRow = assetsInsertMock.mock.calls.find(
      (c) => (c[0] as { type: string }).type === 'price_compare_data',
    )?.[0] as Record<string, unknown>
    const meta = dataRow.metadata as Record<string, unknown>
    expect(meta).toBeTruthy()
    // sellers 정보가 어딘가 보존됨
    const blob = JSON.stringify(dataRow)
    expect(blob).toContain('쿠팡')
    expect(blob).toContain('39,900')

    // image row 는 asset_url 보유
    const imageRow = assetsInsertMock.mock.calls.find(
      (c) => (c[0] as { type: string }).type === 'price_compare_image',
    )?.[0] as Record<string, unknown>
    expect(imageRow.asset_url).toMatch(/^https:\/\/supabase\.example/)
  })
})

// =====================================================
// 가격비교 페이지 없음 — null 채움 (가짜 채움 금지)
// =====================================================

describe('crawl_naver_price — no price-compare available', () => {
  it('returns null data fields when page has no priceCompare info (no fabrication)', async () => {
    pageEvaluateMock.mockResolvedValueOnce({
      title: null,
      lowestPrice: null,
      modelName: null,
      sellers: [],
    })

    const result = await crawlNaverPrice({ productName: '아무도 안 파는 상품' })

    expect(result.data.title).toBeNull()
    expect(result.data.lowestPrice).toBeNull()
    expect(result.data.modelName).toBeNull()
    expect(result.data.sellers).toEqual([])

    // 추측 채움 금지: 그래도 스크린샷은 찍어서 사장님이 확인 가능 (PRD §17 #4)
    // 또는 throw 도 OK — 본 테스트는 null 채움만 검증.
  })
})

// =====================================================
// 네이버 차단 (CAPTCHA) — PRD §17 #4
// =====================================================

describe('crawl_naver_price — blocked / CAPTCHA', () => {
  it('throws "네이버 차단" when page content matches CAPTCHA pattern', async () => {
    pageContentMock.mockResolvedValue(
      '<html><body>네이버 보안 인증 CAPTCHA</body></html>',
    )

    await expect(
      crawlNaverPrice({ productName: PRODUCT_NAME }),
    ).rejects.toThrow(/네이버 차단|차단|블록/)

    // 차단 시 어떤 asset 도 저장 안 됨
    expect(assetsInsertMock).not.toHaveBeenCalled()
    expect(uploadToStorageMock).not.toHaveBeenCalled()
  })

  it('throws on HTTP 403-style block (goto rejects)', async () => {
    pageGotoMock.mockRejectedValueOnce(
      new Error('net::ERR_HTTP_RESPONSE_CODE_FAILURE 403'),
    )

    await expect(
      crawlNaverPrice({ productName: PRODUCT_NAME }),
    ).rejects.toThrow()

    expect(assetsInsertMock).not.toHaveBeenCalled()
  })

  it('closes browser even when blocked', async () => {
    pageContentMock.mockResolvedValue(
      '<html><body>CAPTCHA required</body></html>',
    )

    await expect(
      crawlNaverPrice({ productName: PRODUCT_NAME }),
    ).rejects.toThrow()

    expect(browserCloseMock).toHaveBeenCalledTimes(1)
  })
})

// =====================================================
// Rate limit + UA rotation (PRD §11.2)
// =====================================================

describe('crawl_naver_price — rate limit + UA rotation', () => {
  it('sets ko-KR locale + non-empty userAgent on context', async () => {
    await crawlNaverPrice({ productName: PRODUCT_NAME })

    const opts = newContextMock.mock.calls[0][0] as {
      userAgent?: string
      locale?: string
    }
    expect(opts.userAgent).toBeTruthy()
    expect(opts.locale).toBe('ko-KR')
  })

  it('UA rotation: across 5 calls, at least 2 distinct UAs', async () => {
    const seen = new Set<string>()
    for (let i = 0; i < 5; i++) {
      await crawlNaverPrice({ productName: PRODUCT_NAME + i })
      const opts = newContextMock.mock.calls[i][0] as { userAgent: string }
      seen.add(opts.userAgent)
    }
    expect(seen.size).toBeGreaterThanOrEqual(2)
  })

  it('waits 3-7s after navigating (rate limit)', async () => {
    await crawlNaverPrice({ productName: PRODUCT_NAME })
    expect(pageWaitForTimeoutMock).toHaveBeenCalled()
    const ms = pageWaitForTimeoutMock.mock.calls[0][0] as number
    expect(ms).toBeGreaterThanOrEqual(3000)
    expect(ms).toBeLessThanOrEqual(7000)
  })
})

// =====================================================
// Cleanup
// =====================================================

describe('crawl_naver_price — cleanup', () => {
  it('closes browser on success', async () => {
    await crawlNaverPrice({ productName: PRODUCT_NAME })
    expect(browserCloseMock).toHaveBeenCalledTimes(1)
  })

  it('closes browser when Storage upload fails', async () => {
    uploadToStorageMock.mockRejectedValue(new Error('Storage upload failed'))

    await expect(
      crawlNaverPrice({ productName: PRODUCT_NAME }),
    ).rejects.toThrow()

    expect(browserCloseMock).toHaveBeenCalledTimes(1)
  })
})

// =====================================================
// Input validation
// =====================================================

describe('crawl_naver_price — input validation', () => {
  it('throws when productName missing or empty', async () => {
    await expect(
      // @ts-expect-error missing field
      crawlNaverPrice({}),
    ).rejects.toThrow(/productName/i)

    await expect(crawlNaverPrice({ productName: '' })).rejects.toThrow(/productName/i)
  })
})
