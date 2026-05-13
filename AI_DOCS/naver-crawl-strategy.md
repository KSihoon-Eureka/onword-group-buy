# Naver Price Crawl Strategy

> Step 3의 핵심. `crawl_naver_price` tool의 동작 방식.

---

## 목표

상품명을 받아 네이버 쇼핑에서 *최저가 + 가격비교 정보*를 추출.

출력:
1. 가격비교 JSON (시중가, 모델명, 판매처)
2. 네이버 최저가 페이지 스크린샷 (PNG)

---

## 기술 선택

**Playwright (Node.js)** 사용. 이유:
- Headless 브라우저 → 동적 콘텐츠 렌더링 가능
- 스크린샷 native 지원
- 한국 사이트(네이버) 호환성 검증됨

대안 검토:
- `node-fetch` + cheerio → 불충분 (네이버 JS 렌더링)
- `puppeteer` → 가능하나 Playwright가 더 modern
- 비공식 네이버 API → 차단 위험 더 큼

---

## 구현 흐름

```typescript
// packages/agent/tools/crawl-naver-price.ts

import { chromium } from 'playwright'
import { uploadToSupabase } from '@/db/storage'

export async function crawlNaverPrice(productName: string) {
  const browser = await chromium.launch({ 
    headless: true,
    args: ['--disable-blink-features=AutomationControlled']
  })
  
  const context = await browser.newContext({
    userAgent: getRandomUserAgent(),  // rotation
    locale: 'ko-KR',
    viewport: { width: 1280, height: 800 }
  })
  
  const page = await context.newPage()
  
  // 1. 네이버 쇼핑 검색
  await page.goto(
    `https://search.shopping.naver.com/search/all?query=${encodeURIComponent(productName)}`,
    { waitUntil: 'networkidle' }
  )
  
  // 2. 가격비교 영역 확인
  const priceCompareUrl = await page.locator('.priceCompare').first().getAttribute('href')
  if (priceCompareUrl) {
    await page.goto(priceCompareUrl, { waitUntil: 'networkidle' })
  }
  
  // 3. 데이터 추출
  const data = await page.evaluate(() => ({
    title: document.querySelector('.product_title')?.textContent,
    lowestPrice: document.querySelector('.lowestPrice')?.textContent,
    modelName: document.querySelector('.model_name')?.textContent,
    sellers: Array.from(document.querySelectorAll('.seller_list_item')).map(el => ({
      name: el.querySelector('.name')?.textContent,
      price: el.querySelector('.price')?.textContent
    }))
  }))
  
  // 4. 스크린샷
  const screenshot = await page.screenshot({ fullPage: false })
  const imageUrl = await uploadToSupabase(
    `naver-prices/${productName}-${Date.now()}.png`,
    screenshot
  )
  
  await browser.close()
  
  return { data, imageUrl }
}
```

---

## Rate Limiting & 봇 회피

**Risk:** 네이버는 자동화 트래픽을 적극 차단. 한 IP에서 시간당 50회 이상 요청 시 captcha 또는 차단.

**대응 전략:**

### 1. User-Agent Rotation
```typescript
const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  // 추가...
]
function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]
}
```

### 2. 요청 간 지연
- 최소 3초 간격
- 랜덤 jitter (3-7초)

```typescript
await page.waitForTimeout(3000 + Math.random() * 4000)
```

### 3. Cache First
- 한 번 크롤한 상품은 24시간 캐시
- DB의 `generated_assets`에 `type='price_compare', created_at` 확인

### 4. Fallback
- 크롤링 실패 시 빈 데이터 반환 + 사람에게 알림 (UI 토스트)
- 절대 *추측 데이터*로 채우지 말 것 (CLAUDE.md §1: 추측 금지)

---

## 테스트 전략 (TDD 강제)

`packages/agent/tools/__tests__/crawl-naver-price.test.ts`:

```typescript
import { crawlNaverPrice } from '../crawl-naver-price'

describe('crawlNaverPrice', () => {
  // 실제 네이버 호출은 e2e에서만. 단위 테스트는 mock.
  
  it('returns structured data from mock HTML', async () => {
    // page.evaluate 모킹
    const mockPage = createMockPage({
      title: '슈미트 냉감 베개커버',
      lowestPrice: '39,900원',
      sellers: [{ name: '슈미트', price: '39,900' }]
    })
    
    const result = await extractDataFromPage(mockPage)
    
    expect(result.title).toContain('슈미트')
    expect(result.lowestPrice).toBe('39,900원')
  })
  
  it('falls back gracefully on missing elements', async () => {
    const emptyPage = createMockPage({})
    const result = await extractDataFromPage(emptyPage)
    expect(result.lowestPrice).toBeNull()
  })
})
```

E2E 테스트는 별도 `e2e/` 폴더에서 실제 네이버 호출 (CI에서는 skip).

---

## 알아둘 함정

- 네이버 쇼핑 페이지 구조는 자주 변경됨 → selector 깨질 위험
- 모바일 vs 데스크탑 UA에 따라 HTML 다름 → 데스크탑으로 통일
- 일부 상품은 가격비교 페이지가 없음 → null 처리 필수
- 한글 인코딩 주의 (`encodeURIComponent` 필수)
