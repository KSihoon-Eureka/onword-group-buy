/**
 * Tool: generate_price_emphasis_text  (PRD §10.2, PLAN D.4)
 *
 * 목적:
 *   네이버 가격비교 결과(price_compare asset) + products.price 를 비교해
 *   카카오톡 푸시용 100자 이내 짧은 가격 강조 텍스트를 생성한다.
 *
 * 의존:
 *   - PRD §8.4 (텍스트 형식 표준 — 결정적 템플릿)
 *   - PRD §10.2 (시그니처)
 *   - `generated_assets` (type='price_compare') metadata.data.lowestPrice
 *   - `products.price`
 *   - env: STORE_SHORTNAME (없으면 "특가" fallback)
 *
 * 설계 결정:
 *   §8.4 는 변수만 채우면 되는 결정적 템플릿이라 Anthropic API 불필요.
 *   AI 호출을 안 하므로 100자 보장 + 비용 0 + 빠름.
 *   (generate_announcement 는 감성 설명/이모지 선택이 필요해서 AI 사용.)
 *
 * 에러:
 *   - product 없음               → throw "Product not found"
 *   - price_compare asset 없음   → throw "price_compare asset not found"
 *   - lowestPrice 파싱 실패      → throw "네이버 가격 데이터 없음"
 *   - naverPrice ≤ ourPrice      → throw "할인 효과 없음 — 가격 강조 텍스트 생성 안 함"
 *   - 100자 초과                 → throw "형식 위반: 100자 초과"
 *
 * 참고: AI tool 호출은 잘못된 input 으로 들어올 수 있다. 모든 분기에 명시적 throw.
 */

import { createServiceClient, type Database } from '@onword/db'
import type {
  GeneratePriceEmphasisTextInput,
  GeneratePriceEmphasisTextOutput,
} from '@onword/types'

const MAX_LENGTH = 100
const DEFAULT_SHORT_NAME = '특가'

// ──────────────────────────────────────────────────────────────────────────
// 유틸
// ──────────────────────────────────────────────────────────────────────────

/** "40,000" / "40000" / 40000 → 40000. 파싱 실패 시 null. */
function parsePrice(raw: unknown): number | null {
  if (raw == null) return null
  if (typeof raw === 'number') {
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : null
  }
  if (typeof raw === 'string') {
    const digits = raw.replace(/[^\d]/g, '')
    if (!digits) return null
    const n = Number.parseInt(digits, 10)
    return Number.isFinite(n) && n > 0 ? n : null
  }
  return null
}

/** 8900 → "8,900" */
function formatWon(n: number): string {
  return n.toLocaleString('ko-KR')
}

// ──────────────────────────────────────────────────────────────────────────
// 본체
// ──────────────────────────────────────────────────────────────────────────

export async function generatePriceEmphasisText(
  input: GeneratePriceEmphasisTextInput & { _traceId?: string; _traceStepId?: string },
): Promise<GeneratePriceEmphasisTextOutput> {
  const { productId, priceCompareAssetId, _traceStepId } = input
  const supabase = createServiceClient()

  // 1. 상품 조회 — 우리 가격
  const { data: product, error: productError } = await supabase
    .from('products')
    .select('*')
    .eq('id', productId)
    .single()

  if (productError || !product) {
    throw new Error(`Product not found: ${productId}`)
  }

  const ourPrice = parsePrice((product as { price: unknown }).price)
  if (ourPrice == null) {
    throw new Error(`Product price invalid: ${productId}`)
  }

  // store_id 는 generated_assets NOT NULL — products.store_id 에서 복제.
  // 테스트 fixture 가 store_id 를 안 넘기는 경우 대비 안전 처리.
  const storeId =
    typeof (product as { store_id?: unknown }).store_id === 'string'
      ? ((product as { store_id: string }).store_id)
      : null

  // 2. price_compare asset 조회 — 네이버 가격
  const { data: asset, error: assetError } = await supabase
    .from('generated_assets')
    .select('*')
    .eq('id', priceCompareAssetId)
    .single()

  if (assetError || !asset) {
    throw new Error(`price_compare asset not found: ${priceCompareAssetId}`)
  }

  // metadata.data.lowestPrice — crawl_naver_price 결과 구조 (PRD §10.4)
  const metadata = (asset as { metadata: unknown }).metadata as
    | { data?: { lowestPrice?: unknown } }
    | null
  const rawLowest = metadata?.data?.lowestPrice
  const naverPrice = parsePrice(rawLowest)

  if (naverPrice == null) {
    throw new Error('네이버 가격 데이터 없음')
  }

  // 3. 비교 검증 — PRD §10.2 "할인 효과 없음 (생성 안 함)"
  if (naverPrice <= ourPrice) {
    throw new Error(
      `할인 효과 없음: 네이버 ${formatWon(naverPrice)}원 ≤ 우리 ${formatWon(ourPrice)}원`,
    )
  }

  const savings = naverPrice - ourPrice
  const shortName = process.env.STORE_SHORTNAME?.trim() || DEFAULT_SHORT_NAME

  // 4. PRD §8.4 결정적 템플릿
  //    🌈 네이버 최저가 {naverPrice}원 ❌
  //    🔥 {shortName} 특가 {ourPrice}원 ✅
  //
  //    💰 {savings}원 절약!
  //    지금이 살 때 🛒
  const content = [
    `🌈 네이버 최저가 ${formatWon(naverPrice)}원 ❌`,
    `🔥 ${shortName} 특가 ${formatWon(ourPrice)}원 ✅`,
    '',
    `💰 ${formatWon(savings)}원 절약!`,
    '지금이 살 때 🛒',
  ].join('\n')

  // 5. 100자 보장 (PRD §8.4)
  if (content.length > MAX_LENGTH) {
    throw new Error(
      `형식 위반: 100자 초과 (${content.length}자). shortName 또는 가격 길이 점검 필요.`,
    )
  }

  // 6. generated_assets 저장 — type='price_emphasis_text'
  //    store_id 는 NOT NULL (migrations 0002). product 에서 복제 — null 이면 prod 환경
  //    에서 RLS / NOT NULL 위반으로 자연 실패 (graceful: 명시 에러 메시지).
  if (!storeId) {
    throw new Error(
      `Product missing store_id (productId=${productId}). RLS / migration 정합 확인 필요.`,
    )
  }
  const insertPayload: Database['public']['Tables']['generated_assets']['Insert'] =
    {
      store_id: storeId,
      product_id: productId,
      trace_step_id: _traceStepId ?? null,
      type: 'price_emphasis_text',
      stage: null,
      content,
      asset_url: null,
      metadata: {
        naverPrice,
        ourPrice,
        savings,
        sourceAssetId: priceCompareAssetId,
      },
      copied_at: null,
      used_at: null,
    }
  const { data: saved, error: insertError } = await supabase
    .from('generated_assets')
    .insert(insertPayload)
    .select('id')
    .single()

  if (insertError || !saved) {
    throw new Error(`Failed to save asset: ${insertError?.message ?? 'unknown'}`)
  }

  return {
    content,
    assetId: (saved as { id: string }).id,
  }
}
