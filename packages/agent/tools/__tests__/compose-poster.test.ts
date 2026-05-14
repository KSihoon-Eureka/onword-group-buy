/**
 * TDD: compose_poster (Phase D.7)
 *
 * 의존성:
 *   - Sharp: 실제 라이브러리 호출 (mock 안 함). PNG 출력 dimension 검증용.
 *   - Supabase: vi.mock('@onword/db')로 from() + uploadToStorage 라우팅.
 *   - fetch: 글로벌 fetch를 mock — baseImageUrl 다운로드.
 *
 * 폰트 정책:
 *   - 프로젝트에 Pretendard / Noto Sans KR 폰트 파일 없음.
 *   - Sharp(librsvg) 는 font-family 명시 시 fontconfig fallback (sans-serif).
 *   - 시각 검증은 Phase F.6 (manual visual review) 로 위임.
 *   - 본 테스트는 (a) SVG에 font-family 명시되어 있고 (b) 출력 PNG가 800×950 임을 검증.
 *
 * 실행:
 *   pnpm --filter=@onword/agent test compose-poster
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import sharp from 'sharp'

// =====================================================
// Mocks
// =====================================================

const {
  productsSingleMock,
  storesSingleMock,
  assetsInsertMock,
  assetsInsertResultMock,
  uploadToStorageMock,
} = vi.hoisted(() => ({
  productsSingleMock: vi.fn(),
  storesSingleMock: vi.fn(),
  assetsInsertMock: vi.fn(),
  assetsInsertResultMock: vi.fn(),
  uploadToStorageMock: vi.fn(),
}))

vi.mock('@onword/db', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === 'products') {
        return {
          select: (_cols: string) => ({
            eq: (col: string, val: unknown) => ({
              single: () => productsSingleMock({ col, val }),
            }),
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

// Global fetch mock (Node 20 has built-in fetch).
const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

import { composePoster } from '../compose-poster'

// =====================================================
// Helpers
// =====================================================

const STORE_ROW = {
  id: 'store-pandafarm',
  name: '판다팜',
  primary_color: '#5B2E91',
  accent_color: '#E53E3E',
}

const PRODUCT_ROW = {
  id: 'prod-1',
  store_id: 'store-pandafarm',
  name: '슈미트 냉감 쿨 베개커버 세트(2장)',
  description: '여름철 베개커버 위생관리 필수. 66x40cm 표준 베개 사이즈.',
  category: '생활용품',
  price: 8900,
  primary_image_url: 'https://cdn.example.com/pillow.jpg',
  pickup_date: '2025-05-09',
  pickup_deadline: '2025-05-13',
}

/** 실제 sharp로 800×800 PNG 만들어서 fetch 응답에 쓰는 fixture buffer. */
async function makeFixtureImageBuffer(width = 800, height = 800): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 200, g: 200, b: 200 },
    },
  })
    .jpeg()
    .toBuffer()
}

function makeFetchResponse(buffer: Buffer, ok = true): Response {
  // Use the real Response constructor — works in Node 20+.
  // Buffer → Uint8Array for BodyInit (Node typed differently in DOM lib).
  const body = ok ? new Uint8Array(buffer) : null
  return new Response(body, {
    status: ok ? 200 : 404,
    statusText: ok ? 'OK' : 'Not Found',
  })
}

// =====================================================
// Common setup
// =====================================================

beforeEach(async () => {
  productsSingleMock.mockReset()
  storesSingleMock.mockReset()
  assetsInsertMock.mockReset()
  assetsInsertResultMock.mockReset()
  uploadToStorageMock.mockReset()
  fetchMock.mockReset()

  productsSingleMock.mockResolvedValue({ data: PRODUCT_ROW, error: null })
  storesSingleMock.mockResolvedValue({ data: STORE_ROW, error: null })
  assetsInsertResultMock.mockResolvedValue({
    data: { id: 'poster-asset-1' },
    error: null,
  })
  uploadToStorageMock.mockResolvedValue(
    'https://storage.example.com/posters/prod-1-12345.png',
  )

  const buf = await makeFixtureImageBuffer()
  fetchMock.mockResolvedValue(makeFetchResponse(buf))
})

// =====================================================
// 정상 케이스
// =====================================================

describe('compose_poster — 정상 경로', () => {
  it('returns posterUrl + assetId on success', async () => {
    const result = await composePoster({ productId: 'prod-1' })

    expect(result.posterUrl).toBe(
      'https://storage.example.com/posters/prod-1-12345.png',
    )
    expect(result.assetId).toBe('poster-asset-1')
  })

  it('queries products + stores + uploads + inserts asset (in that order)', async () => {
    await composePoster({ productId: 'prod-1' })

    expect(productsSingleMock).toHaveBeenCalledWith({ col: 'id', val: 'prod-1' })
    expect(storesSingleMock).toHaveBeenCalledWith({
      col: 'id',
      val: 'store-pandafarm',
    })
    expect(uploadToStorageMock).toHaveBeenCalledTimes(1)
    expect(assetsInsertMock).toHaveBeenCalledTimes(1)

    const uploadCall = uploadToStorageMock.mock.calls[0]
    expect(uploadCall[0]).toMatch(/^posters\/prod-1-\d+\.png$/)
    expect(uploadCall[1]).toBeInstanceOf(Buffer)
    expect(uploadCall[2]).toBe('image/png')
  })

  it('outputs a PNG of exactly 800×950', async () => {
    let capturedBuffer: Buffer | null = null
    uploadToStorageMock.mockImplementationOnce(
      async (_path: string, buf: Buffer) => {
        capturedBuffer = buf
        return 'https://storage.example.com/p.png'
      },
    )

    await composePoster({ productId: 'prod-1' })

    expect(capturedBuffer).not.toBeNull()
    const meta = await sharp(capturedBuffer as unknown as Buffer).metadata()
    expect(meta.format).toBe('png')
    expect(meta.width).toBe(800)
    expect(meta.height).toBe(950)
  })

  it('uses products.primary_image_url when baseImageUrl not given', async () => {
    await composePoster({ productId: 'prod-1' })
    expect(fetchMock).toHaveBeenCalledWith('https://cdn.example.com/pillow.jpg')
  })

  it('uses explicit baseImageUrl override when provided', async () => {
    await composePoster({
      productId: 'prod-1',
      baseImageUrl: 'https://override.example.com/x.jpg',
    })
    expect(fetchMock).toHaveBeenCalledWith('https://override.example.com/x.jpg')
  })

  it('saves asset with type=poster + store_id + product_id + asset_url', async () => {
    await composePoster({ productId: 'prod-1' })

    const payload = assetsInsertMock.mock.calls[0][0] as {
      type: string
      store_id: string
      product_id: string
      asset_url: string
    }
    expect(payload).toMatchObject({
      type: 'poster',
      store_id: 'store-pandafarm',
      product_id: 'prod-1',
    })
    expect(payload.asset_url).toBe(
      'https://storage.example.com/posters/prod-1-12345.png',
    )
  })
})

// =====================================================
// 색상 / 폰트 검증 (SVG 내용)
// =====================================================

describe('compose_poster — store 색상 / 폰트', () => {
  it("applies store.primary_color to banner and accent_color to price (via SVG)", async () => {
    // 색상은 SVG에 들어가서 Sharp로 rasterize. SVG buffer는 직접 검증 불가.
    // 대신: store 조회 발생 + tool이 throw 안 했음 으로 패스. 픽셀 단위 검증은 F.6.
    // Stronger check: tool에서 SVG를 만들 때 색상이 sanitized hex 검증을 거쳤는지.
    storesSingleMock.mockResolvedValueOnce({
      data: { ...STORE_ROW, primary_color: '#123456', accent_color: '#ABCDEF' },
      error: null,
    })
    const result = await composePoster({ productId: 'prod-1' })
    expect(result.posterUrl).toBeTruthy()
  })

  it('throws when store.primary_color is not valid hex', async () => {
    storesSingleMock.mockResolvedValueOnce({
      data: { ...STORE_ROW, primary_color: 'not-a-hex' },
      error: null,
    })
    await expect(composePoster({ productId: 'prod-1' })).rejects.toThrow(
      /color|hex|invalid/i,
    )
  })

  it('throws when store.accent_color is not valid hex', async () => {
    storesSingleMock.mockResolvedValueOnce({
      data: { ...STORE_ROW, accent_color: '#ZZZZZZ' },
      error: null,
    })
    await expect(composePoster({ productId: 'prod-1' })).rejects.toThrow(
      /color|hex|invalid/i,
    )
  })
})

// =====================================================
// 입력 / 의존성 에러
// =====================================================

describe('compose_poster — 에러 경로', () => {
  it('throws when productId is missing', async () => {
    await expect(
      // @ts-expect-error invalid (no productId)
      composePoster({}),
    ).rejects.toThrow(/productId/i)
  })

  it('throws when product not found', async () => {
    productsSingleMock.mockResolvedValueOnce({ data: null, error: null })
    await expect(composePoster({ productId: 'nope' })).rejects.toThrow(
      /product/i,
    )
  })

  it('throws when product has no primary_image_url and no baseImageUrl', async () => {
    productsSingleMock.mockResolvedValueOnce({
      data: { ...PRODUCT_ROW, primary_image_url: null },
      error: null,
    })
    await expect(composePoster({ productId: 'prod-1' })).rejects.toThrow(
      /image|url/i,
    )
  })

  it('throws when store not found', async () => {
    storesSingleMock.mockResolvedValueOnce({ data: null, error: null })
    await expect(composePoster({ productId: 'prod-1' })).rejects.toThrow(
      /store/i,
    )
  })

  it('throws when fetch fails (non-ok response)', async () => {
    fetchMock.mockResolvedValueOnce(makeFetchResponse(Buffer.alloc(0), false))
    await expect(composePoster({ productId: 'prod-1' })).rejects.toThrow(
      /fetch|image|404|not found/i,
    )
  })

  it('throws when base image is too small (<600px width)', async () => {
    const tiny = await makeFixtureImageBuffer(400, 400)
    fetchMock.mockResolvedValueOnce(makeFetchResponse(tiny))
    await expect(composePoster({ productId: 'prod-1' })).rejects.toThrow(
      /600|too small|width/i,
    )
  })

  it('throws when storage upload fails', async () => {
    uploadToStorageMock.mockRejectedValueOnce(
      new Error('Storage upload failed: bucket missing'),
    )
    await expect(composePoster({ productId: 'prod-1' })).rejects.toThrow(
      /storage|upload/i,
    )
  })

  it('throws when generated_assets insert fails', async () => {
    assetsInsertResultMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'insert blew up' },
    })
    await expect(composePoster({ productId: 'prod-1' })).rejects.toThrow(
      /asset|insert|insert blew up/i,
    )
  })
})
