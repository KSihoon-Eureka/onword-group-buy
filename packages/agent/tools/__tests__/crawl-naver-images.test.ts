/**
 * TDD: crawl_naver_images (Phase D.5)
 *
 * PRD §10.3 + §11.1 — 네이버 쇼핑에서 max 6 이미지 크롤 +
 * 분류(product/detail/lifestyle) + Supabase Storage 업로드.
 *
 * 외부 의존 mock 원칙:
 *   - playwright: vi.mock 으로 chromium.launch / browser / context / page 가짜화.
 *     실제 네이버 절대 접근 X.
 *   - @onword/db: createServiceClient + uploadToStorage 둘 다 mock.
 *   - sharp: 이미지 metadata 측정 mock (분류 heuristic 검증용).
 *   - global fetch: 이미지 다운로드 mock (네이버 CDN 응답 가짜).
 *
 * 절대 금지 (PRD §17, CLAUDE.md §1):
 *   - 차단 감지 시 추측 데이터 채움.
 *   - 검색 결과 0 시 placeholder 이미지로 채우기.
 *
 * 실행:
 *   pnpm --filter=@onword/agent test crawl-naver-images
 *
 * TDD 사이클:
 *   Red:   본 파일 작성 후 import 한 함수 미존재 → 컴파일 실패 / 런타임 실패.
 *   Green: tools/crawl-naver-images.ts 최소 구현 → 통과.
 *   Refactor: 분류 heuristic 분리, USER_AGENTS 상수 분리.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// =====================================================
// Mocks — vi.hoisted 로 import 전에 평가
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
  pageClickMock,
  pageWaitForSelectorMock,
  uploadToStorageMock,
  assetsInsertMock,
  fetchMock,
  sharpMetadataMock,
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
  pageClickMock: vi.fn(),
  pageWaitForSelectorMock: vi.fn(),
  uploadToStorageMock: vi.fn(),
  assetsInsertMock: vi.fn(),
  fetchMock: vi.fn(),
  sharpMetadataMock: vi.fn(),
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
            const idx = assetsInsertMock(payload)
            return {
              select: (_cols: string) => ({
                single: () =>
                  Promise.resolve({
                    data: { id: `asset-img-${idx ?? assetsInsertMock.mock.calls.length}` },
                    error: null,
                  }),
              }),
            }
          },
        }
      }
      throw new Error(`Unexpected table: ${table}`)
    },
  }),
  uploadToStorage: uploadToStorageMock,
}))

vi.mock('sharp', () => ({
  default: (_buf: Buffer) => ({
    metadata: sharpMetadataMock,
  }),
}))

// global fetch mock
beforeEach(() => {
  globalThis.fetch = fetchMock as unknown as typeof fetch
})

// 모든 mock 리셋 + page 객체 와이어링
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
  pageClickMock.mockReset()
  pageWaitForSelectorMock.mockReset()
  uploadToStorageMock.mockReset()
  assetsInsertMock.mockReset()
  fetchMock.mockReset()
  sharpMetadataMock.mockReset()

  const page = {
    goto: pageGotoMock,
    evaluate: pageEvaluateMock,
    content: pageContentMock,
    waitForTimeout: pageWaitForTimeoutMock,
    screenshot: pageScreenshotMock,
    click: pageClickMock,
    waitForSelector: pageWaitForSelectorMock,
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

  // 기본 happy-path
  pageGotoMock.mockResolvedValue(null)
  pageWaitForTimeoutMock.mockResolvedValue(undefined)
  pageWaitForSelectorMock.mockResolvedValue(null)
  pageClickMock.mockResolvedValue(undefined)
  pageContentMock.mockResolvedValue('<html><body>normal</body></html>')

  // 기본: 차단 아님 + 결과 6장
  pageEvaluateMock.mockImplementation(async () => ({
    productPageUrl: 'https://shopping.naver.com/products/123',
    imageUrls: [
      'https://shop-phinf.pstatic.net/p/1.jpg',
      'https://shop-phinf.pstatic.net/p/2.jpg',
      'https://shop-phinf.pstatic.net/p/3.jpg',
      'https://shop-phinf.pstatic.net/p/4.jpg',
      'https://shop-phinf.pstatic.net/p/5.jpg',
      'https://shop-phinf.pstatic.net/p/6.jpg',
    ],
  }))

  // fetch: 더미 buffer (10KB)
  fetchMock.mockResolvedValue({
    ok: true,
    arrayBuffer: async () => new ArrayBuffer(10_000),
    headers: { get: () => 'image/jpeg' },
  } as unknown as Response)

  // sharp: 기본 1:1 800x800 (= product 분류)
  sharpMetadataMock.mockResolvedValue({
    width: 800,
    height: 800,
    size: 10_000,
    format: 'jpeg',
  })

  // Storage 업로드: 순차 URL
  let n = 0
  uploadToStorageMock.mockImplementation(async (path: string) => {
    n += 1
    return `https://supabase.example/storage/v1/${path}#${n}`
  })
})

afterEach(() => {
  vi.useRealTimers()
})

// 분리해서 import — mock 들 위에 올려야 hoist 됨
import { crawlNaverImages } from '../crawl-naver-images'

// =====================================================
// Constants
// =====================================================

const PRODUCT_ID = 'product-schmidt-1'
const PRODUCT_NAME = '슈미트 차렵이불 커버'

// =====================================================
// Happy path
// =====================================================

describe('crawl_naver_images — happy path', () => {
  it('returns up to 6 images with type classification + assetIds', async () => {
    const result = await crawlNaverImages({
      productId: PRODUCT_ID,
      productName: PRODUCT_NAME,
    })

    expect(result.images.length).toBe(6)
    expect(result.assetIds.length).toBe(6)
    expect(result.productPageUrl).toBe('https://shopping.naver.com/products/123')

    // 각 이미지에 type 필드 존재 + ImageType 값
    for (const img of result.images) {
      expect(['product', 'detail', 'lifestyle']).toContain(img.type)
      expect(img.url).toMatch(/^https:\/\/supabase\.example\/storage/)
      expect(img.sourceUrl).toMatch(/^https:\/\/shop-phinf\.pstatic\.net/)
      expect(img.width).toBeGreaterThan(0)
      expect(img.height).toBeGreaterThan(0)
    }
  })

  it('respects custom maxImages (e.g. 3)', async () => {
    const result = await crawlNaverImages({
      productId: PRODUCT_ID,
      productName: PRODUCT_NAME,
      maxImages: 3,
    })

    expect(result.images.length).toBe(3)
    expect(result.assetIds.length).toBe(3)
    // fetch / upload 도 3회만
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(uploadToStorageMock).toHaveBeenCalledTimes(3)
  })

  it('defaults maxImages to 6 when omitted', async () => {
    pageEvaluateMock.mockResolvedValueOnce({
      productPageUrl: 'https://shopping.naver.com/products/123',
      imageUrls: Array.from({ length: 10 }, (_, i) => `https://shop-phinf.pstatic.net/p/${i}.jpg`),
    })

    const result = await crawlNaverImages({
      productId: PRODUCT_ID,
      productName: PRODUCT_NAME,
    })

    expect(result.images.length).toBe(6)
  })

  it('uploads each image to product-images/{productId}/N path', async () => {
    await crawlNaverImages({
      productId: PRODUCT_ID,
      productName: PRODUCT_NAME,
      maxImages: 2,
    })

    expect(uploadToStorageMock).toHaveBeenCalledTimes(2)
    const paths = uploadToStorageMock.mock.calls.map((c) => c[0] as string)
    for (const p of paths) {
      expect(p).toContain(`product-images/${PRODUCT_ID}/`)
    }
    // 두 번째 인자는 Buffer, 세 번째는 content-type image/*
    const contentTypes = uploadToStorageMock.mock.calls.map((c) => c[2] as string)
    for (const ct of contentTypes) {
      expect(ct).toMatch(/^image\//)
    }
  })

  it('saves N generated_assets rows of type=product_image with source_url metadata (§11.1 audit)', async () => {
    await crawlNaverImages({
      productId: PRODUCT_ID,
      productName: PRODUCT_NAME,
      maxImages: 2,
    })

    expect(assetsInsertMock).toHaveBeenCalledTimes(2)
    for (const call of assetsInsertMock.mock.calls) {
      const payload = call[0] as Record<string, unknown>
      expect(payload.type).toBe('product_image')
      expect(payload.product_id).toBe(PRODUCT_ID)
      const meta = payload.metadata as Record<string, unknown>
      expect(meta.source_url).toBeTruthy()
      expect(meta.width).toBeGreaterThan(0)
    }
  })
})

// =====================================================
// 분류 heuristic (PRD §11.1)
// =====================================================

describe('crawl_naver_images — type classification', () => {
  it('classifies 1:1 small image as product (< 200KB + 1:1)', async () => {
    sharpMetadataMock.mockResolvedValue({
      width: 800,
      height: 800,
      size: 50_000, // < 200KB
      format: 'jpeg',
    })
    const result = await crawlNaverImages({
      productId: PRODUCT_ID,
      productName: PRODUCT_NAME,
      maxImages: 1,
    })
    expect(result.images[0].type).toBe('product')
  })

  it('classifies wide 16:9 large image as lifestyle (>800px width)', async () => {
    sharpMetadataMock.mockResolvedValue({
      width: 1600,
      height: 900,
      size: 300_000,
      format: 'jpeg',
    })
    const result = await crawlNaverImages({
      productId: PRODUCT_ID,
      productName: PRODUCT_NAME,
      maxImages: 1,
    })
    expect(result.images[0].type).toBe('lifestyle')
  })

  it('classifies remainder (e.g. tall spec sheet) as detail', async () => {
    sharpMetadataMock.mockResolvedValue({
      width: 500,
      height: 2000,
      size: 400_000, // > 200KB
      format: 'jpeg',
    })
    const result = await crawlNaverImages({
      productId: PRODUCT_ID,
      productName: PRODUCT_NAME,
      maxImages: 1,
    })
    expect(result.images[0].type).toBe('detail')
  })
})

// =====================================================
// 네이버 차단 (PRD §17 — 추측 채움 금지)
// =====================================================

describe('crawl_naver_images — blocked / CAPTCHA', () => {
  it('throws "네이버 차단" when page content matches CAPTCHA pattern', async () => {
    pageContentMock.mockResolvedValueOnce(
      '<html><body>네이버 보안 인증이 필요합니다. CAPTCHA</body></html>',
    )
    // evaluate 가 호출되더라도 throw 가 먼저 나야 함

    await expect(
      crawlNaverImages({
        productId: PRODUCT_ID,
        productName: PRODUCT_NAME,
      }),
    ).rejects.toThrow(/네이버 차단|블록|차단/)

    // 차단 시 어떤 asset 도 저장 안 됨 (추측 채움 금지)
    expect(assetsInsertMock).not.toHaveBeenCalled()
    expect(uploadToStorageMock).not.toHaveBeenCalled()
  })

  it('throws on HTTP 403-like blocked response (page.goto throws)', async () => {
    pageGotoMock.mockRejectedValueOnce(new Error('net::ERR_HTTP_RESPONSE_CODE_FAILURE 403'))

    await expect(
      crawlNaverImages({
        productId: PRODUCT_ID,
        productName: PRODUCT_NAME,
      }),
    ).rejects.toThrow()

    expect(assetsInsertMock).not.toHaveBeenCalled()
  })

  it('closes browser even when blocked', async () => {
    pageContentMock.mockResolvedValueOnce(
      '<html><body>CAPTCHA required</body></html>',
    )

    await expect(
      crawlNaverImages({
        productId: PRODUCT_ID,
        productName: PRODUCT_NAME,
      }),
    ).rejects.toThrow()

    expect(browserCloseMock).toHaveBeenCalledTimes(1)
  })
})

// =====================================================
// 부분 실패 (일부 이미지 다운로드 실패)
// =====================================================

describe('crawl_naver_images — partial failure', () => {
  it('returns successful images + metadata.failureCount when some downloads fail', async () => {
    // 6 이미지 중 2번/4번 다운로드 실패
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/2.jpg') || url.includes('/4.jpg')) {
        return { ok: false, status: 404 } as unknown as Response
      }
      return {
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(10_000),
        headers: { get: () => 'image/jpeg' },
      } as unknown as Response
    })

    const result = await crawlNaverImages({
      productId: PRODUCT_ID,
      productName: PRODUCT_NAME,
    })

    expect(result.images.length).toBe(4) // 6 - 2 실패
    expect(result.assetIds.length).toBe(4)
  })
})

// =====================================================
// 결과 0 케이스 (PRD §11.1 — placeholder 채움 금지)
// =====================================================

describe('crawl_naver_images — empty results', () => {
  it('returns empty images + null productPageUrl when no search results', async () => {
    pageEvaluateMock.mockResolvedValueOnce({
      productPageUrl: null,
      imageUrls: [],
    })

    const result = await crawlNaverImages({
      productId: PRODUCT_ID,
      productName: '아무도 안 파는 상품 9999',
    })

    expect(result.images).toEqual([])
    expect(result.assetIds).toEqual([])
    expect(result.productPageUrl).toBeNull()
    // placeholder 채움 X
    expect(uploadToStorageMock).not.toHaveBeenCalled()
    expect(assetsInsertMock).not.toHaveBeenCalled()
  })
})

// =====================================================
// Rate limit + UA rotation (PRD §11.2)
// =====================================================

describe('crawl_naver_images — rate limit + UA rotation', () => {
  it('passes a User-Agent string to browser context', async () => {
    await crawlNaverImages({
      productId: PRODUCT_ID,
      productName: PRODUCT_NAME,
      maxImages: 1,
    })

    expect(newContextMock).toHaveBeenCalledTimes(1)
    const opts = newContextMock.mock.calls[0][0] as { userAgent?: string; locale?: string }
    expect(opts.userAgent).toBeTruthy()
    expect(typeof opts.userAgent).toBe('string')
    expect(opts.locale).toBe('ko-KR')
  })

  it('UA rotation: across 5 calls, at least 2 distinct UAs seen', async () => {
    const seen = new Set<string>()
    for (let i = 0; i < 5; i++) {
      await crawlNaverImages({
        productId: PRODUCT_ID + '-' + i,
        productName: PRODUCT_NAME,
        maxImages: 1,
      })
      const opts = newContextMock.mock.calls[i][0] as { userAgent: string }
      seen.add(opts.userAgent)
    }
    // USER_AGENTS 가 최소 2개라면, 5회 random 중 2개 이상 볼 확률 매우 높음.
    // (만약 강제 결정성 필요하면 implementation 에서 round-robin 도 OK — 본 테스트는 |seen|>=2 만 요구.)
    expect(seen.size).toBeGreaterThanOrEqual(2)
  })

  it('waits between requests (rate limit 3-7s)', async () => {
    await crawlNaverImages({
      productId: PRODUCT_ID,
      productName: PRODUCT_NAME,
      maxImages: 1,
    })

    expect(pageWaitForTimeoutMock).toHaveBeenCalled()
    const ms = pageWaitForTimeoutMock.mock.calls[0][0] as number
    expect(ms).toBeGreaterThanOrEqual(3000)
    expect(ms).toBeLessThanOrEqual(7000)
  })
})

// =====================================================
// 정리 (cleanup)
// =====================================================

describe('crawl_naver_images — cleanup', () => {
  it('closes browser on success path', async () => {
    await crawlNaverImages({
      productId: PRODUCT_ID,
      productName: PRODUCT_NAME,
      maxImages: 1,
    })
    expect(browserCloseMock).toHaveBeenCalledTimes(1)
  })

  it('closes browser when Storage upload throws', async () => {
    uploadToStorageMock.mockRejectedValueOnce(new Error('Storage upload failed'))
    // 단일 이미지에서 업로드 실패는 partial failure 처리 → 전체 throw 가 아님.
    // 그러므로 cleanup 검증을 위해 *모든* 업로드를 실패시킴.
    uploadToStorageMock.mockRejectedValue(new Error('Storage upload failed'))

    // 모든 이미지 실패 → result.images 빈 배열로 정상 종료 (또는 throw — 구현 선택)
    // 둘 다 cleanup 은 보장
    try {
      await crawlNaverImages({
        productId: PRODUCT_ID,
        productName: PRODUCT_NAME,
        maxImages: 2,
      })
    } catch {
      // throw 도 OK
    }
    expect(browserCloseMock).toHaveBeenCalledTimes(1)
  })
})

// =====================================================
// Input validation
// =====================================================

describe('crawl_naver_images — input validation', () => {
  it('throws when productId missing', async () => {
    await expect(
      crawlNaverImages({
        // @ts-expect-error testing missing field
        productId: undefined,
        productName: PRODUCT_NAME,
      }),
    ).rejects.toThrow(/productId/i)
  })

  it('throws when productName missing', async () => {
    await expect(
      crawlNaverImages({
        productId: PRODUCT_ID,
        // @ts-expect-error testing missing field
        productName: undefined,
      }),
    ).rejects.toThrow(/productName/i)
  })

  it('caps maxImages at 6 even if larger value passed', async () => {
    pageEvaluateMock.mockResolvedValueOnce({
      productPageUrl: 'https://shopping.naver.com/products/123',
      imageUrls: Array.from({ length: 20 }, (_, i) => `https://shop-phinf.pstatic.net/p/${i}.jpg`),
    })

    const result = await crawlNaverImages({
      productId: PRODUCT_ID,
      productName: PRODUCT_NAME,
      maxImages: 50, // 캡 초과
    })

    expect(result.images.length).toBeLessThanOrEqual(6)
  })
})
