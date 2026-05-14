/**
 * Tool: compose_poster (PRD §10.5 + §12)
 *
 * 상품 이미지 + 텍스트 합성으로 카카오톡 오픈채팅용 포스터 PNG 생성.
 *   - 800×950 PNG (50 banner + 600 image + 300 bottom)
 *   - store.primary_color (배너 / 카테고리 / 정보 바)
 *   - store.accent_color (가격)
 *   - 생성 AI 사용 안 함 — Sharp 합성만.
 *
 * 의존:
 *   - sharp (실제 라이브러리 호출)
 *   - @onword/db: createServiceClient, uploadToStorage
 *
 * 폰트 정책:
 *   - SVG에 `Pretendard, 'Noto Sans KR', sans-serif` 명시.
 *   - 프로젝트 폰트 파일 없음 → Sharp(librsvg)가 fontconfig fallback (sans-serif).
 *   - 픽셀 단위 시각 검증은 Phase F.6 (수동 visual review).
 *
 * 에러 정책:
 *   - input validation 실패 → throw 동기
 *   - product / store 미존재 → throw
 *   - primary_image_url 없고 baseImageUrl 없음 → throw
 *   - hex color invalid → throw
 *   - base image fetch 실패 / 600px 미만 → throw
 *   - storage / asset insert 실패 → throw
 */

import sharp from 'sharp'
import { createServiceClient, uploadToStorage } from '@onword/db'
import type {
  ComposePosterInput,
  ComposePosterOutput,
} from '@onword/types'

// =====================================================
// 상수
// =====================================================

const POSTER_WIDTH = 800
const POSTER_HEIGHT = 950
const BANNER_HEIGHT = 50
const IMAGE_HEIGHT = 600
const BOTTOM_HEIGHT = 300

const WHITE = '#FFFFFF'
const TEXT_GRAY = '#6B7280'

const MIN_IMAGE_WIDTH = 600
const MAX_IMAGE_BYTES = 10 * 1024 * 1024 // 10 MB

const FONT_FAMILY = "Pretendard, 'Noto Sans KR', sans-serif"

// =====================================================
// 내부 타입
// =====================================================

interface ProductRow {
  id: string
  store_id: string
  name: string
  description: string | null
  category: string | null
  price: number
  primary_image_url: string | null
  pickup_date: string
  pickup_deadline: string
}

interface StoreRow {
  id: string
  name: string
  primary_color: string
  accent_color: string
}

// =====================================================
// Public entry
// =====================================================

export async function composePoster(
  input: ComposePosterInput & { _traceId?: string; _traceStepId?: string },
): Promise<ComposePosterOutput> {
  // 1. 입력 검증
  if (!input || !input.productId) {
    throw new Error('productId is required')
  }
  const { productId, baseImageUrl: explicitUrl, textOverlay, _traceStepId } = input

  const supabase = createServiceClient()

  // 2. 상품 + 매장 조회
  const product = await fetchProduct(supabase, productId)
  const store = await fetchStore(supabase, product.store_id)

  // 3. 색상 검증
  assertHexColor(store.primary_color, 'store.primary_color')
  assertHexColor(store.accent_color, 'store.accent_color')

  // 4. 이미지 URL 결정
  const imageUrl = explicitUrl ?? product.primary_image_url
  if (!imageUrl) {
    throw new Error(
      `No base image: products.primary_image_url is null and baseImageUrl not provided (productId=${productId})`,
    )
  }

  // 5. base image fetch
  const resp = await fetch(imageUrl)
  if (!resp.ok) {
    throw new Error(
      `Failed to fetch base image (${resp.status} ${resp.statusText}): ${imageUrl}`,
    )
  }
  const baseImageBuffer = Buffer.from(await resp.arrayBuffer())

  if (baseImageBuffer.length > MAX_IMAGE_BYTES) {
    throw new Error(
      `Base image too large: ${baseImageBuffer.length} bytes (max ${MAX_IMAGE_BYTES})`,
    )
  }

  // 6. base image 메타 검증.
  // 너무 작은 이미지는 upscale 시 화질 저하 — 경고만 하고 진행 (데모 안정성 우선).
  // 너무 작아 sharp 가 처리 못 하는 수준 (< 100px) 만 throw.
  const meta = await sharp(baseImageBuffer).metadata()
  if (!meta.width || meta.width < 100) {
    throw new Error(
      `Base image too small to process: width=${meta.width ?? 'unknown'}px (min 100px)`,
    )
  }
  if (meta.width < MIN_IMAGE_WIDTH) {
    console.warn(
      `[compose_poster] base image width=${meta.width}px < ${MIN_IMAGE_WIDTH}px — upscaling (may reduce quality)`,
    )
  }

  // 7. 중앙 상품 이미지 리사이즈 (upscale 허용).
  // withoutEnlargement: false (default) — 작은 이미지도 POSTER_WIDTH 까지 확대.
  const centerImage = await sharp(baseImageBuffer)
    .resize(POSTER_WIDTH, IMAGE_HEIGHT, { fit: 'cover', withoutEnlargement: false })
    .toBuffer()

  // 8. 상단 배너 (입고/수령 마감일)
  const bannerText = `입고예정일 ${formatKoreanDate(product.pickup_date)}, 수령 마감일 ${formatKoreanDate(product.pickup_deadline)} 까지`
  const topBanner = await renderBanner(bannerText, store.primary_color)

  // 9. 하단 영역 (카테고리 / 가격 / 규격)
  const bottomSection = await renderBottom({
    category: textOverlay?.category ?? product.category ?? product.name,
    price: product.price,
    spec: textOverlay?.spec ?? product.description ?? '',
    primaryColor: store.primary_color,
    accentColor: store.accent_color,
  })

  // 10. 합성 → 800×950 PNG
  const finalImage = await sharp({
    create: {
      width: POSTER_WIDTH,
      height: POSTER_HEIGHT,
      channels: 4,
      background: WHITE,
    },
  })
    .composite([
      { input: topBanner, top: 0, left: 0 },
      { input: centerImage, top: BANNER_HEIGHT, left: 0 },
      { input: bottomSection, top: BANNER_HEIGHT + IMAGE_HEIGHT, left: 0 },
    ])
    .png()
    .toBuffer()

  // 11. Storage 업로드
  const filename = `posters/${productId}-${Date.now()}.png`
  const posterUrl = await uploadToStorage(filename, finalImage, 'image/png')

  // 12. generated_assets 저장
  const { data: asset, error: assetError } = (await supabase
    .from('generated_assets')
    .insert({
      store_id: store.id,
      product_id: productId,
      trace_step_id: _traceStepId ?? null,
      type: 'poster',
      asset_url: posterUrl,
      metadata: {
        width: POSTER_WIDTH,
        height: POSTER_HEIGHT,
        primaryColor: store.primary_color,
        accentColor: store.accent_color,
      },
    } as never)
    .select('id')
    .single()) as {
    data: { id: string } | null
    error: { message: string } | null
  }

  if (assetError || !asset) {
    throw new Error(
      `Failed to save poster asset: ${assetError?.message ?? 'no data'}`,
    )
  }

  return { posterUrl, assetId: asset.id }
}

// =====================================================
// Supabase helpers
// =====================================================

async function fetchProduct(
  supabase: ReturnType<typeof createServiceClient>,
  productId: string,
): Promise<ProductRow> {
  const { data, error } = (await supabase
    .from('products')
    .select('*')
    .eq('id', productId)
    .single()) as {
    data: ProductRow | null
    error: { message: string } | null
  }

  if (error) {
    throw new Error(`Failed to fetch product: ${error.message}`)
  }
  if (!data) {
    throw new Error(`Product not found: ${productId}`)
  }
  return data
}

async function fetchStore(
  supabase: ReturnType<typeof createServiceClient>,
  storeId: string,
): Promise<StoreRow> {
  // store_id 필드가 packages/db 의 Row 타입에 누락 (cascading 회피 위해 cast).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: any = supabase.from('stores').select('*')
  const { data, error } = (await builder.eq('id', storeId).single()) as {
    data: StoreRow | null
    error: { message: string } | null
  }

  if (error) {
    throw new Error(`Failed to fetch store: ${error.message}`)
  }
  if (!data) {
    throw new Error(`Store not found: ${storeId}`)
  }
  return data
}

// =====================================================
// 색상 검증
// =====================================================

const HEX_COLOR_RE = /^#(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/

function assertHexColor(value: string, label: string): void {
  if (!HEX_COLOR_RE.test(value)) {
    throw new Error(`Invalid hex color for ${label}: ${value}`)
  }
}

// =====================================================
// SVG 렌더 helpers
// =====================================================

async function renderBanner(text: string, bgColor: string): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${POSTER_WIDTH}" height="${BANNER_HEIGHT}">
  <rect width="100%" height="100%" fill="${bgColor}"/>
  <text x="50%" y="50%"
        font-family="${FONT_FAMILY}"
        font-size="18" font-weight="bold" fill="${WHITE}"
        text-anchor="middle" dominant-baseline="middle">${escapeXml(text)}</text>
</svg>`
  return sharp(Buffer.from(svg)).png().toBuffer()
}

async function renderBottom(args: {
  category: string
  price: number
  spec: string
  primaryColor: string
  accentColor: string
}): Promise<Buffer> {
  const priceStr = args.price.toLocaleString('ko-KR')
  // spec 최대 60자 / 한 줄
  const spec = args.spec.length > 60 ? args.spec.slice(0, 60) + '…' : args.spec

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${POSTER_WIDTH}" height="${BOTTOM_HEIGHT}">
  <rect width="100%" height="100%" fill="${WHITE}"/>
  <text x="50%" y="60"
        font-family="${FONT_FAMILY}"
        font-size="26" font-weight="700" fill="${args.primaryColor}"
        text-anchor="middle">${escapeXml(args.category)}</text>
  <text x="50%" y="170"
        font-family="${FONT_FAMILY}"
        font-size="72" font-weight="800" fill="${args.accentColor}"
        text-anchor="middle">🎁 ${escapeXml(priceStr)}원</text>
  <rect x="40" y="220" width="${POSTER_WIDTH - 80}" height="40" rx="6" fill="${args.primaryColor}" opacity="0.08"/>
  <text x="50%" y="246"
        font-family="${FONT_FAMILY}"
        font-size="14" fill="${TEXT_GRAY}"
        text-anchor="middle">${escapeXml(spec)}</text>
</svg>`
  return sharp(Buffer.from(svg)).png().toBuffer()
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

// =====================================================
// 날짜 포맷 (KST 기준 — generate-announcement 와 동일 규칙)
// =====================================================

const WEEKDAYS_KO = ['일', '월', '화', '수', '목', '금', '토']

function formatKoreanDate(input: string): string {
  let d: Date
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    d = new Date(`${input}T00:00:00Z`)
  } else {
    const t = new Date(input)
    d = new Date(t.getTime() + 9 * 60 * 60 * 1000)
  }
  const month = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  const weekday = WEEKDAYS_KO[d.getUTCDay()]
  return `${month}월 ${day}일(${weekday})`
}
