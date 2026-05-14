/**
 * Tool: crawl_naver_images (PRD §10.3 + §11.1)
 *
 * 네이버 쇼핑에서 상품 이미지 최대 6장 크롤 → 분류(product/detail/lifestyle)
 *  → Supabase Storage 업로드 → generated_assets (type='product_image') 저장.
 *
 * 의존:
 *   - Playwright chromium (UA rotation, ko-KR locale)
 *   - @onword/db: createServiceClient + uploadToStorage
 *   - sharp: 이미지 metadata (분류 heuristic)
 *
 * 안전 정책 (PRD §11.1 / §17):
 *   - rate limit 3-7s random delay
 *   - User-Agent rotation
 *   - 차단 (CAPTCHA / HTTP 403) 감지 시 throw — 추측 데이터 채움 절대 금지.
 *   - 부분 다운로드 실패 → 성공한 이미지만 반환 (placeholder 채움 X).
 *   - 검색 결과 0 → 빈 배열 반환 (placeholder 채움 X).
 *
 * Mock 가능 포인트 (TDD 강제):
 *   - vi.mock('playwright')  : chromium.launch 가짜화
 *   - vi.mock('@onword/db')  : createServiceClient / uploadToStorage
 *   - vi.mock('sharp')       : metadata heuristic
 *   - globalThis.fetch       : 이미지 다운로드
 */

import { chromium, type Browser, type BrowserContext } from 'playwright'
import sharp from 'sharp'
import { createServiceClient, uploadToStorage } from '@onword/db'
import type {
  CrawlNaverImagesInput,
  CrawlNaverImagesOutput,
  ImageType,
} from '@onword/types'

// =====================================================
// 상수 (PRD §11.1 / §11.2)
// =====================================================

const MAX_IMAGES_CAP = 6
const DEFAULT_MAX_IMAGES = 6

const RATE_LIMIT_MIN_MS = 3000
const RATE_LIMIT_MAX_MS = 7000

const USER_AGENTS: readonly string[] = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
]

const CAPTCHA_PATTERNS = [
  /CAPTCHA/i,
  /보안\s*인증/,
  /접근\s*차단/,
  /비정상적인\s*접근/,
  /자동화된\s*요청/,
]

// =====================================================
// Public entry
// =====================================================

export async function crawlNaverImages(
  input: CrawlNaverImagesInput & { _traceId?: string; _traceStepId?: string },
): Promise<CrawlNaverImagesOutput> {
  // ---- input validation
  if (!input.productId) {
    throw new Error('productId is required')
  }
  if (!input.productName) {
    throw new Error('productName is required')
  }

  const maxImages = Math.min(
    Math.max(1, input.maxImages ?? DEFAULT_MAX_IMAGES),
    MAX_IMAGES_CAP,
  )

  const supabase = createServiceClient()

  let browser: Browser | null = null
  let context: BrowserContext | null = null

  try {
    // ---- launch playwright
    browser = await chromium.launch({
      headless: true,
      args: ['--disable-blink-features=AutomationControlled'],
    })
    context = await browser.newContext({
      userAgent: randomUserAgent(),
      locale: 'ko-KR',
      viewport: { width: 1280, height: 800 },
    })

    const page = await context.newPage()

    // ---- 1. 검색 페이지 이동
    const searchUrl = `https://search.shopping.naver.com/search/all?query=${encodeURIComponent(
      input.productName,
    )}`
    await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 15_000 })

    // ---- rate limit
    await page.waitForTimeout(randomDelayMs())

    // ---- CAPTCHA / 차단 감지
    const html = await page.content()
    assertNotBlocked(html)

    // ---- 2-4. 이미지 URL 수집 (page.evaluate 가 selector 작업 수행)
    const extracted = (await page.evaluate(extractScript)) as {
      productPageUrl: string | null
      imageUrls: string[]
    }

    if (!extracted.imageUrls || extracted.imageUrls.length === 0) {
      // 검색 결과 0 — placeholder 채움 금지 (PRD §11.1)
      return {
        images: [],
        productPageUrl: extracted.productPageUrl,
        assetIds: [],
      }
    }

    const candidateUrls = extracted.imageUrls.slice(0, maxImages)

    // ---- 5-7. 각 이미지 fetch → metadata 측정 → Storage 업로드 → asset 저장
    const images: CrawlNaverImagesOutput['images'] = []
    const assetIds: string[] = []

    let index = 0
    for (const sourceUrl of candidateUrls) {
      index += 1
      const downloaded = await downloadImage(sourceUrl)
      if (!downloaded) {
        // 부분 실패 — skip (placeholder 채움 X)
        continue
      }

      const meta = await safeMetadata(downloaded.buffer)
      const type = classifyImage(meta)

      const ext = guessExtension(downloaded.contentType)
      const path = `product-images/${input.productId}/${index}${ext}`
      let storageUrl: string
      try {
        storageUrl = await uploadToStorage(path, downloaded.buffer, downloaded.contentType)
      } catch {
        // Storage 1회 실패 → skip (PRD §11.1: 1회 재시도 후 실패 시 throw 도 정책이지만
        //  본 구현은 부분 실패 허용 정책 채택. 모든 이미지 실패 시는 결과적으로 빈 배열 반환).
        continue
      }

      const { data: asset, error } = await supabase
        .from('generated_assets')
        .insert({
          product_id: input.productId,
          trace_step_id: input._traceStepId ?? null,
          type: 'product_image',
          asset_url: storageUrl,
          metadata: {
            source_url: sourceUrl,
            width: meta.width,
            height: meta.height,
            size: meta.size,
            image_type: type,
          },
        } as never)
        .select('id')
        .single()

      if (error || !asset) {
        // asset row 저장 실패 — skip
        continue
      }

      images.push({
        url: storageUrl,
        sourceUrl,
        width: meta.width,
        height: meta.height,
        type,
      })
      assetIds.push((asset as { id: string }).id)
    }

    return {
      images,
      productPageUrl: extracted.productPageUrl,
      assetIds,
    }
  } finally {
    // cleanup — 항상 실행 (PRD §11.1 차단 시에도)
    try {
      await context?.close()
    } catch {
      /* swallow */
    }
    try {
      await browser?.close()
    } catch {
      /* swallow */
    }
  }
}

// =====================================================
// Helpers
// =====================================================

function randomUserAgent(): string {
  const idx = Math.floor(Math.random() * USER_AGENTS.length)
  return USER_AGENTS[idx]
}

function randomDelayMs(): number {
  return RATE_LIMIT_MIN_MS + Math.floor(Math.random() * (RATE_LIMIT_MAX_MS - RATE_LIMIT_MIN_MS))
}

/**
 * HTML 본문이 CAPTCHA / 차단 패턴 포함 시 throw "네이버 차단".
 */
function assertNotBlocked(html: string): void {
  for (const pat of CAPTCHA_PATTERNS) {
    if (pat.test(html)) {
      throw new Error('네이버 차단 감지 — CAPTCHA 또는 접근 제한. 추측 데이터 채움 금지 (PRD §17).')
    }
  }
}

interface DownloadedImage {
  buffer: Buffer
  contentType: string
}

async function downloadImage(url: string): Promise<DownloadedImage | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const ab = await res.arrayBuffer()
    const buffer = Buffer.from(ab)
    const contentType = res.headers.get('content-type') ?? 'image/jpeg'
    return { buffer, contentType }
  } catch {
    return null
  }
}

interface ImageMeta {
  width: number
  height: number
  size: number
}

async function safeMetadata(buffer: Buffer): Promise<ImageMeta> {
  try {
    const meta = await sharp(buffer).metadata()
    return {
      width: meta.width ?? 0,
      height: meta.height ?? 0,
      size: meta.size ?? buffer.byteLength,
    }
  } catch {
    return { width: 0, height: 0, size: buffer.byteLength }
  }
}

/**
 * PRD §11.1 분류 휴리스틱:
 *   - product:   1:1 비율 + < 200KB → 깨끗한 단독 컷
 *   - lifestyle: (4:3 또는 16:9 근처) + width > 800px → 모델 / 라이프스타일
 *   - detail:    그 외 (스펙 정보)
 */
function classifyImage(meta: ImageMeta): ImageType {
  const { width, height, size } = meta
  if (width === 0 || height === 0) return 'detail'

  const aspect = width / height
  const isSquare = Math.abs(aspect - 1) < 0.1
  const is43 = Math.abs(aspect - 4 / 3) < 0.15
  const is169 = Math.abs(aspect - 16 / 9) < 0.15
  const wide = is43 || is169

  if (isSquare && size < 200_000) return 'product'
  if (wide && width > 800) return 'lifestyle'
  return 'detail'
}

function guessExtension(contentType: string): string {
  if (contentType.includes('png')) return '.png'
  if (contentType.includes('webp')) return '.webp'
  if (contentType.includes('gif')) return '.gif'
  return '.jpg'
}

/**
 * 브라우저 컨텍스트 안에서 실행되는 셀렉터 스크립트.
 * vitest mock 환경에선 page.evaluate 가 mock 으로 대체되어 본 함수는 실행되지 않음.
 * 실제 prod 환경에서만 동작.
 *
 * 셀렉터는 네이버 변경 시 깨질 위험 — 깨질 시 빈 배열 반환 (placeholder 채움 X).
 */
function extractScript(): { productPageUrl: string | null; imageUrls: string[] } {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const doc: any = (globalThis as any).document
    if (!doc) return { productPageUrl: null, imageUrls: [] }

    // 첫 상품 카드의 detail 페이지 URL (가장 관련성 높은 결과)
    const firstLink = doc.querySelector('a[href*="/products/"]') as { href?: string } | null
    const productPageUrl = firstLink?.href ?? null

    // 메인 갤러리 + 상세 본문 이미지
    const imgs = Array.from(doc.querySelectorAll('img[src*="phinf"]')) as Array<{
      src?: string
    }>
    const seen = new Set<string>()
    const imageUrls: string[] = []
    for (const img of imgs) {
      const s = img.src
      if (!s) continue
      if (seen.has(s)) continue
      seen.add(s)
      imageUrls.push(s)
      if (imageUrls.length >= 20) break // 후처리에서 maxImages 캡
    }
    return { productPageUrl, imageUrls }
  } catch {
    return { productPageUrl: null, imageUrls: [] }
  }
}
