/**
 * Tool: crawl_naver_price (PRD §10.4 + §11.2)
 *
 * 네이버 가격비교 페이지 크롤 + 스크린샷.
 *   - 검색 → 가격비교 영역 데이터 추출 (title / lowestPrice / modelName / sellers)
 *   - 스크린샷 → Supabase Storage 업로드
 *   - generated_assets 2건 저장 (type='price_compare_data', type='price_compare_image')
 *
 * 시그니처 (packages/types/index.ts — 진실원):
 *   CrawlNaverPriceOutput = { data, imageUrl, assetIds: { dataId, imageId } }
 *
 * 안전 정책 (PRD §11.2 / §17):
 *   - rate limit 3-7s random delay
 *   - User-Agent rotation
 *   - 차단 (CAPTCHA / HTTP 403) 감지 → throw. 추측 데이터 채움 절대 금지.
 *   - 가격비교 페이지 없을 시 null 필드 반환 (가격 fabricate X).
 *
 * Mock 가능 포인트 (TDD 강제):
 *   - vi.mock('playwright')  : chromium.launch
 *   - vi.mock('@onword/db')  : createServiceClient / uploadToStorage
 */

import { chromium, type Browser, type BrowserContext } from 'playwright'
import { createServiceClient, uploadToStorage } from '@onword/db'
import type {
  CrawlNaverPriceInput,
  CrawlNaverPriceOutput,
} from '@onword/types'

// =====================================================
// 상수
// =====================================================

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

export async function crawlNaverPrice(
  input: CrawlNaverPriceInput & { _traceId?: string; _traceStepId?: string },
): Promise<CrawlNaverPriceOutput> {
  // ---- input validation
  if (!input.productName || input.productName.trim().length === 0) {
    throw new Error('productName is required')
  }

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

    // ---- 1. 검색
    const searchUrl = `https://search.shopping.naver.com/search/all?query=${encodeURIComponent(
      input.productName,
    )}`
    await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 15_000 })

    // ---- rate limit
    await page.waitForTimeout(randomDelayMs())

    // ---- 차단 감지
    const html = await page.content()
    assertNotBlocked(html)

    // ---- 2. 데이터 추출 (page.evaluate)
    const data = (await page.evaluate(extractPriceScript)) as CrawlNaverPriceOutput['data']

    // ---- 3. 스크린샷
    const screenshot = await page.screenshot({ fullPage: false })
    const screenshotBuf = Buffer.isBuffer(screenshot)
      ? screenshot
      : Buffer.from(screenshot)

    // ---- 4. Storage 업로드
    const filename = `naver-prices/${encodeURIComponent(input.productName)}-${Date.now()}.png`
    const imageUrl = await uploadToStorage(filename, screenshotBuf, 'image/png')

    // ---- 5. generated_assets 저장 — 2건 (data + image)
    const dataId = await saveAsset(supabase, {
      productId: null,
      traceStepId: input._traceStepId ?? null,
      type: 'price_compare_data',
      assetUrl: null,
      content: JSON.stringify(data),
      metadata: { productName: input.productName, data },
    })

    const imageId = await saveAsset(supabase, {
      productId: null,
      traceStepId: input._traceStepId ?? null,
      type: 'price_compare_image',
      assetUrl: imageUrl,
      content: null,
      metadata: { productName: input.productName },
    })

    return {
      data,
      imageUrl,
      assetIds: { dataId, imageId },
    }
  } finally {
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

function assertNotBlocked(html: string): void {
  for (const pat of CAPTCHA_PATTERNS) {
    if (pat.test(html)) {
      throw new Error('네이버 차단 감지 — CAPTCHA 또는 접근 제한. 추측 데이터 채움 금지 (PRD §17).')
    }
  }
}

async function saveAsset(
  supabase: ReturnType<typeof createServiceClient>,
  args: {
    productId: string | null
    traceStepId: string | null
    type: 'price_compare_data' | 'price_compare_image'
    assetUrl: string | null
    content: string | null
    metadata: Record<string, unknown>
  },
): Promise<string> {
  const { data, error } = (await supabase
    .from('generated_assets')
    .insert({
      product_id: args.productId,
      trace_step_id: args.traceStepId,
      type: args.type,
      asset_url: args.assetUrl,
      content: args.content,
      metadata: args.metadata,
    } as never)
    .select('id')
    .single()) as { data: { id: string } | null; error: { message: string } | null }

  if (error || !data) {
    throw new Error(`Failed to save asset (${args.type}): ${error?.message ?? 'no data'}`)
  }
  return data.id
}

/**
 * 브라우저 컨텍스트 안에서 실행. vitest mock 환경에선 page.evaluate 가 mock 으로 대체.
 *
 * 셀렉터는 네이버 변경 시 깨질 위험 — 깨질 시 null 채움 (가격 fabricate X — PRD §17).
 */
function extractPriceScript(): {
  title: string | null
  lowestPrice: string | null
  modelName: string | null
  sellers: Array<{ name: string; price: string }>
} {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const doc: any = (globalThis as any).document
    if (!doc) {
      return { title: null, lowestPrice: null, modelName: null, sellers: [] }
    }

    const titleEl = doc.querySelector('h2, h3, [class*="title"]') as { textContent?: string } | null
    const priceEl = doc.querySelector('[class*="price"], strong[class*="num"]') as {
      textContent?: string
    } | null

    const sellerNodes = Array.from(
      doc.querySelectorAll('[class*="seller"], [class*="mall"]'),
    ) as Array<{ textContent?: string; querySelector?: (s: string) => { textContent?: string } | null }>

    const sellers: Array<{ name: string; price: string }> = []
    for (const node of sellerNodes.slice(0, 10)) {
      const nameEl = node.querySelector?.('[class*="name"]')
      const priceNodeEl = node.querySelector?.('[class*="price"]')
      const name = (nameEl?.textContent ?? '').trim()
      const price = (priceNodeEl?.textContent ?? '').trim()
      if (name && price) sellers.push({ name, price })
    }

    return {
      title: titleEl?.textContent?.trim() ?? null,
      lowestPrice: priceEl?.textContent?.trim() ?? null,
      modelName: null, // 모델명 셀렉터는 prod 검증 필요 — 본 구현은 null 반환 (fabricate X)
      sellers,
    }
  } catch {
    return { title: null, lowestPrice: null, modelName: null, sellers: [] }
  }
}
