/**
 * Tool: compose_poster
 * 
 * 기존 상품 이미지 + 텍스트 오버레이로 그룹채팅용 포스터 합성.
 * 생성 AI 사용 안 함 — Sharp로 합성.
 * 
 * 트랙: Track G (Day 2 Agent 1)
 * 의존: AI_DOCS/poster-composition.md (반드시 Read), Sharp, 한글 폰트
 * 
 * 출력: 800x950 PNG, Supabase Storage 업로드 + URL 반환
 * 
 * 구현 절차 (AI_DOCS/poster-composition.md 참조):
 *   1. productId로 products 조회
 *   2. baseImageUrl에서 이미지 fetch → Buffer
 *   3. Sharp로 3개 영역 렌더:
 *      a. 상단 배너 (보라색, 입고/수령 날짜)
 *      b. 중앙 상품 이미지 (800x600, fit: cover)
 *      c. 하단 정보 (카테고리, 가격, 규격)
 *   4. composite로 합성
 *   5. PNG 출력 → Supabase Storage 업로드
 *   6. generated_assets에 type='poster' 저장
 * 
 * 폰트 셋업:
 *   - Pretendard 또는 Noto Sans KR
 *   - Vercel 배포 시: public/fonts/ 에 .woff2 배치
 *   - Sharp SVG 렌더링 시 폰트 파일 경로 명시 필요
 * 
 * 입력 검증:
 *   - baseImageBuffer 사이즈: 100KB ~ 10MB
 *   - 지원 포맷: JPEG, PNG, WebP
 *   - 너비 최소 600px
 */

import sharp from 'sharp'
import { createServiceClient, uploadToStorage } from '@onword/db'
import type {
  ComposePosterInput,
  ComposePosterOutput,
} from '@onword/types'

const POSTER_WIDTH = 800
const POSTER_HEIGHT = 950
const PURPLE = '#5B2E91'
const WHITE = '#FFFFFF'

export async function composePoster(
  input: ComposePosterInput & { _traceId?: string }
): Promise<ComposePosterOutput> {
  const { productId, baseImageUrl, _traceId } = input
  const supabase = createServiceClient()
  
  // 1. 상품 조회
  const { data: product, error } = await supabase
    .from('products')
    .select('*')
    .eq('id', productId)
    .single()
  
  if (error || !product) {
    throw new Error(`Product not found: ${productId}`)
  }
  
  // 2. 기본 이미지 fetch
  const imageResp = await fetch(baseImageUrl)
  if (!imageResp.ok) {
    throw new Error(`Failed to fetch base image: ${imageResp.statusText}`)
  }
  const baseImageBuffer = Buffer.from(await imageResp.arrayBuffer())
  
  // 입력 검증
  if (baseImageBuffer.length > 10 * 1024 * 1024) {
    throw new Error('Base image too large (>10MB)')
  }
  
  const meta = await sharp(baseImageBuffer).metadata()
  if (!meta.width || meta.width < 600) {
    throw new Error(`Base image too small: ${meta.width}px (min 600px)`)
  }
  
  // 3. 중앙 이미지 리사이즈
  const centerImage = await sharp(baseImageBuffer)
    .resize(POSTER_WIDTH, 600, { fit: 'cover' })
    .toBuffer()
  
  // TODO: 4. 상단 배너 + 하단 섹션 렌더
  //   - SVG로 텍스트 렌더 (한글 폰트 명시)
  //   - AI_DOCS/poster-composition.md의 layout 정확히 따름
  //   - 상품명, 가격, 마감일 등 변수 매핑
  const topBanner = await renderBanner({
    text: `입고예정일 ${formatDate(product.pickup_date)}, 수령 마감일 ${formatDate(product.pickup_deadline)} 까지`,
  })
  
  const bottomSection = await renderBottom({
    category: product.category ?? product.name,
    price: product.price,
    spec: product.description ?? '',
  })
  
  // 5. 합성
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
      { input: centerImage, top: 50, left: 0 },
      { input: bottomSection, top: 650, left: 0 },
    ])
    .png()
    .toBuffer()
  
  // 6. Storage 업로드
  const filename = `posters/${productId}-${Date.now()}.png`
  const posterUrl = await uploadToStorage(filename, finalImage, 'image/png')
  
  // 7. generated_assets 저장
  const { data: asset, error: assetError } = await supabase
    .from('generated_assets')
    .insert({
      product_id: productId,
      trace_step_id: _traceId ?? null,
      type: 'poster',
      asset_url: posterUrl,
      metadata: { width: POSTER_WIDTH, height: POSTER_HEIGHT },
    })
    .select('id')
    .single()
  
  if (assetError || !asset) {
    throw new Error(`Failed to save asset: ${assetError?.message}`)
  }
  
  return { posterUrl, assetId: asset.id }
}

// ==========================
// 내부 렌더링 helpers
// ==========================

async function renderBanner({ text }: { text: string }): Promise<Buffer> {
  // TODO: SVG 텍스트 렌더 + 한글 폰트 명시
  const svg = `
    <svg width="${POSTER_WIDTH}" height="50" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="${PURPLE}"/>
      <text 
        x="50%" 
        y="50%" 
        font-family="Pretendard, 'Noto Sans KR', sans-serif"
        font-size="18"
        font-weight="bold"
        fill="${WHITE}"
        text-anchor="middle"
        dominant-baseline="middle"
      >${escapeXml(text)}</text>
    </svg>
  `
  return sharp(Buffer.from(svg)).png().toBuffer()
}

async function renderBottom({ 
  category, 
  price, 
  spec 
}: { 
  category: string
  price: number
  spec: string 
}): Promise<Buffer> {
  // TODO: 카테고리 라벨 + 큰 가격 표시 + 규격 정보
  //       슈미트 포스터 형식 정확히 따라야 함 (AI_DOCS/poster-composition.md 참조)
  const priceStr = price.toLocaleString('ko-KR')
  const svg = `
    <svg width="${POSTER_WIDTH}" height="300" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="${WHITE}"/>
      <text 
        x="50%" y="60"
        font-family="Pretendard, sans-serif"
        font-size="24" font-weight="bold"
        fill="${PURPLE}"
        text-anchor="middle"
      >${escapeXml(category)}</text>
      <text 
        x="50%" y="160"
        font-family="Pretendard, sans-serif"
        font-size="72" font-weight="bold"
        fill="#E11D48"
        text-anchor="middle"
      >${priceStr}원</text>
      <text 
        x="50%" y="240"
        font-family="Pretendard, sans-serif"
        font-size="14"
        fill="#6B7280"
        text-anchor="middle"
      >${escapeXml(spec.slice(0, 60))}</text>
    </svg>
  `
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

function formatDate(iso: string): string {
  // TODO: date-fns로 "MM월 DD일(요일)" 형식
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()}`
}
