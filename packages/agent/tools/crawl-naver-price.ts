/**
 * Tool: crawl_naver_price
 * 
 * 네이버 쇼핑에서 상품 가격비교 정보 크롤링 + 스크린샷.
 * 
 * 트랙: Track E (Day 1 Agent 5)
 * 의존: AI_DOCS/naver-crawl-strategy.md (반드시 Read), Playwright
 * 
 * 구현 절차 (AI_DOCS/naver-crawl-strategy.md 참조):
 *   1. Playwright headless chromium 실행 (UA rotation, ko-KR locale)
 *   2. https://search.shopping.naver.com/search/all?query={productName} 이동
 *   3. .priceCompare 영역 발견 시 그 페이지로 이동
 *   4. 가격, 모델명, 판매처 추출 (page.evaluate)
 *   5. 스크린샷 (fullPage: false)
 *   6. Supabase Storage 업로드 → public URL
 *   7. generated_assets에 type='price_compare' 저장
 * 
 * 안전:
 *   - 요청 간 3-7초 랜덤 지연
 *   - User-Agent rotation
 *   - 24시간 캐시 (동일 상품명이면 generated_assets에서 조회 후 재사용)
 *   - 실패 시 추측 데이터 채우지 말 것 — 빈 data + 사용자 알림
 * 
 * Vercel 배포 시 주의:
 *   - Vercel serverless의 함수 시간 제한 (10초 free, 60초 pro)
 *   - Playwright Chromium은 무겁다 → @sparticuz/chromium 사용 권장
 *   - 또는 별도 워커 (Railway/Render)
 */

import { chromium, Browser, BrowserContext } from 'playwright'
import { createServiceClient, uploadToStorage } from '@onword/db'
import type {
  CrawlNaverPriceInput,
  CrawlNaverPriceOutput,
} from '@onword/types'

const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
]

function randomUA(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]
}

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function crawlNaverPrice(
  input: CrawlNaverPriceInput & { _traceId?: string }
): Promise<CrawlNaverPriceOutput> {
  const { productName, _traceId } = input
  const supabase = createServiceClient()
  
  // 0. 24시간 캐시 체크
  const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  const { data: cached } = await supabase
    .from('generated_assets')
    .select('*')
    .eq('type', 'price_compare')
    .gt('created_at', dayAgo)
    .ilike('metadata->>productName', productName)
    .limit(1)
    .single()
  
  if (cached) {
    return {
      data: cached.metadata?.data ?? {} as any,
      imageUrl: cached.asset_url ?? '',
      assetId: cached.id,
    }
  }
  
  let browser: Browser | null = null
  let context: BrowserContext | null = null
  
  try {
    // 1. Playwright 실행
    browser = await chromium.launch({
      headless: true,
      args: ['--disable-blink-features=AutomationControlled'],
    })
    context = await browser.newContext({
      userAgent: randomUA(),
      locale: 'ko-KR',
      viewport: { width: 1280, height: 800 },
    })
    
    const page = await context.newPage()
    
    // 2. 검색
    await page.goto(
      `https://search.shopping.naver.com/search/all?query=${encodeURIComponent(productName)}`,
      { waitUntil: 'networkidle', timeout: 15000 }
    )
    
    await delay(3000 + Math.random() * 4000)
    
    // TODO: 3-4. 가격비교 페이지 이동 + 데이터 추출
    //   - .priceCompare 셀렉터는 자주 바뀜. 발견 시 AI_DOCS/naver-crawl-strategy.md 업데이트
    //   - page.evaluate로 title, lowestPrice, sellers 추출
    const data = await page.evaluate(() => ({
      title: null as string | null,
      lowestPrice: null as string | null,
      modelName: null as string | null,
      sellers: [] as Array<{ name: string; price: string }>,
    }))
    
    // 5. 스크린샷
    const screenshot = await page.screenshot({ fullPage: false })
    
    // 6. Storage 업로드
    const filename = `naver-prices/${encodeURIComponent(productName)}-${Date.now()}.png`
    const imageUrl = await uploadToStorage(filename, screenshot, 'image/png')
    
    // 7. generated_assets 저장
    const { data: asset, error } = await supabase
      .from('generated_assets')
      .insert({
        trace_step_id: _traceId ?? null,
        type: 'price_compare',
        asset_url: imageUrl,
        metadata: { productName, data },
      })
      .select('id')
      .single()
    
    if (error || !asset) {
      throw new Error(`Failed to save asset: ${error?.message}`)
    }
    
    return { data, imageUrl, assetId: asset.id }
    
  } finally {
    await context?.close()
    await browser?.close()
  }
}
