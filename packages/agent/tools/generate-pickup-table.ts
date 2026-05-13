/**
 * Tool: generate_pickup_table
 * 
 * 진행 중인 모든 상품의 수령 가능 기간을 시각화한 테이블 이미지 생성.
 * 캔버스의 "언제 찾으러 갈까요?" 형식.
 * 
 * 트랙: Should → Must로 승격 가능 (Day 2 오후)
 * 의존: products 테이블, Sharp (또는 Puppeteer HTML→이미지)
 * 
 * 형식:
 *   - 컬럼: 상품명 | 진행 상태 | 5일치 날짜 막대 | 수령 마감일
 *   - 색상:
 *     - 마감 임박 (pickup_date ≤ today + 1일): 빨강
 *     - 수령 가능 (pickup_date ≤ today ≤ pickup_deadline): 초록
 *     - 상품 준비 (pickup_date > today): 파랑
 * 
 * 구현 옵션:
 *   A. Sharp + SVG (단점: 복잡한 테이블 SVG 작성 번거로움)
 *   B. Puppeteer + HTML 템플릿 (장점: CSS로 디자인 자유로움, 단점: 무거움)
 *   C. node-canvas (장점: 가벼움, 단점: 한글 폰트 셋업)
 * 
 * 추천: B (Puppeteer로 HTML 페이지 렌더 → 스크린샷). 
 *      이미 Playwright가 설치되어 있으니 재사용.
 * 
 * 구현 절차:
 *   1. productIds 없으면 active 상품 전체 조회
 *   2. 각 상품의 진행 상태 분류
 *   3. HTML 템플릿 생성 (date-fns로 5일치 그리드)
 *   4. Playwright로 렌더 → 스크린샷
 *   5. Supabase Storage 업로드
 *   6. generated_assets 저장
 */

import { createServiceClient, uploadToStorage } from '@onword/db'
import type {
  GeneratePickupTableInput,
  GeneratePickupTableOutput,
} from '@onword/types'

export async function generatePickupTable(
  input: GeneratePickupTableInput & { _traceId?: string }
): Promise<GeneratePickupTableOutput> {
  const { productIds, _traceId } = input
  const supabase = createServiceClient()
  
  // 1. 상품 조회
  let query = supabase.from('products').select('*').eq('status', 'active')
  if (productIds && productIds.length > 0) {
    query = query.in('id', productIds)
  }
  
  const { data: products, error } = await query
  
  if (error) {
    throw new Error(`Failed to fetch products: ${error.message}`)
  }
  
  if (!products || products.length === 0) {
    throw new Error('No active products to render')
  }
  
  // TODO: 2-4. HTML 렌더 + 스크린샷
  //   - date-fns로 오늘부터 5일 그리드 생성
  //   - 각 상품을 한 row로 렌더
  //   - 색상 코딩 (마감임박/수령가능/상품준비)
  //   - Playwright로 HTML 페이지 → screenshot
  //   - AI_DOCS/dashboard-ui-patterns.md의 디자인 토큰 차용
  const html = renderTableHtml(products)
  const screenshot = await renderHtmlToPng(html)
  
  // 5. Storage 업로드
  const filename = `pickup-tables/${Date.now()}.png`
  const imageUrl = await uploadToStorage(filename, screenshot, 'image/png')
  
  // 6. generated_assets 저장
  const { data: asset, error: assetError } = await supabase
    .from('generated_assets')
    .insert({
      trace_step_id: _traceId ?? null,
      type: 'pickup_table',
      asset_url: imageUrl,
      metadata: { 
        productIds: products.map(p => p.id),
        productCount: products.length,
      },
    })
    .select('id')
    .single()
  
  if (assetError || !asset) {
    throw new Error(`Failed to save asset: ${assetError?.message}`)
  }
  
  return { imageUrl, assetId: asset.id }
}

// ==========================
// 내부 helpers (구현 필요)
// ==========================

function renderTableHtml(products: any[]): string {
  // TODO: 캔버스의 "언제 찾으러 갈까요?" 형식
  //   - 헤더: 5일치 날짜 (요일 포함)
  //   - 각 row: 상품명 + 상태 라벨 + 막대 + 수령 마감일
  //   - 색상: 빨강(마감임박) / 초록(수령가능) / 파랑(상품준비)
  return `<html><body><h1>TODO: Pickup Table</h1></body></html>`
}

async function renderHtmlToPng(html: string): Promise<Buffer> {
  // TODO: Playwright로 HTML 페이지 렌더 → 스크린샷
  //   - new page, setContent(html), screenshot
  //   - viewport: 800x?
  throw new Error('Not implemented yet — Track for Day 2 afternoon')
}
