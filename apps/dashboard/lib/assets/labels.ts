/**
 * /assets 페이지의 표시용 순수 헬퍼.
 *
 * 책임 분리:
 *  - `getAssetCategory` — 텍스트 vs 이미지 (필터 / 카드 분기)
 *  - `getAssetTypeLabel` — PRD §9.4 한국어 라벨 + AssetType 매핑
 *  - `truncatePreview` — 텍스트 미리보기 (default 100자)
 *  - `formatAssetCreatedAt` — PRD §2.12 / A12 `MM월 DD일(요일)` + `오전/오후 H:MM`
 *  - `getDownloadFilename` — Blob 다운로드용 안전 파일명
 *
 * 모두 pure → Node vitest 에서 단위 테스트.
 */

import type { AssetType } from '@onword/types'

export type AssetCategory = 'text' | 'image'

const TEXT_TYPES: ReadonlySet<AssetType> = new Set<AssetType>([
  'announcement_stage1',
  'announcement_stage2',
  'announcement_stage3',
  'price_emphasis_text',
  'price_compare_data',
  'pickup_table_text',
  'wholesale_email',
])

const IMAGE_TYPES: ReadonlySet<AssetType> = new Set<AssetType>([
  'price_compare_image',
  'product_image',
  'poster',
  'pickup_table_image',
])

const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  announcement_stage1: '공고① (시작)',
  announcement_stage2: '공고② (마감 임박)',
  announcement_stage3: '공고③ (픽업 안내)',
  price_emphasis_text: '가격 강조 카톡',
  price_compare_data: '네이버 가격 데이터',
  price_compare_image: '네이버 가격 스크린샷',
  product_image: '상품 이미지',
  poster: '포스터',
  pickup_table_image: '수령표 이미지',
  pickup_table_text: '수령표 카톡',
  wholesale_email: '도매 이메일',
}

const CATEGORY_LABELS: Record<AssetCategory, string> = {
  text: '텍스트',
  image: '이미지',
}

/**
 * 자산을 텍스트 / 이미지 카테고리로 분류한다.
 * `price_compare_data` 는 JSON 텍스트라 텍스트 분류 (PRD §10).
 * 알 수 없는 타입은 텍스트 fallback (`content` 표시 시도).
 */
export function getAssetCategory(type: AssetType | string): AssetCategory {
  if (IMAGE_TYPES.has(type as AssetType)) return 'image'
  if (TEXT_TYPES.has(type as AssetType)) return 'text'
  return 'text'
}

export function getAssetTypeLabel(type: AssetType | string): string {
  return ASSET_TYPE_LABELS[type as AssetType] ?? type
}

export function getCategoryLabel(category: AssetCategory): string {
  return CATEGORY_LABELS[category]
}

export function truncatePreview(content: string | null, maxLength = 100): string {
  if (!content) return ''
  const trimmed = content.trim()
  if (trimmed.length <= maxLength) return trimmed
  return `${trimmed.slice(0, maxLength)}…`
}

const WEEKDAYS_KR = ['일', '월', '화', '수', '목', '금', '토'] as const

/**
 * `MM월 DD일(요일) 오전/오후 H:MM` (PRD A12).
 * ISO 문자열이 유효하지 않으면 원본 반환.
 */
export function formatAssetCreatedAt(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso

  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const weekday = WEEKDAYS_KR[d.getDay()]

  const hours24 = d.getHours()
  const minutes = String(d.getMinutes()).padStart(2, '0')
  const period = hours24 < 12 ? '오전' : '오후'
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12

  return `${mm}월 ${dd}일(${weekday}) ${period} ${hours12}:${minutes}`
}

/**
 * 다운로드 파일명. asset_url 의 마지막 path segment 를 사용하고,
 * 경로 분리자 / 쿼리스트링은 제거한다. 추출 실패 시 type + id fallback.
 */
export function getDownloadFilename(params: {
  assetUrl: string | null
  type: AssetType | string
  id: string
}): string {
  const { assetUrl, type, id } = params
  if (assetUrl) {
    try {
      const url = new URL(assetUrl)
      const segments = url.pathname.split('/').filter(Boolean)
      const last = segments[segments.length - 1]
      if (last && last.length > 0) return decodeURIComponent(last)
    } catch {
      const tail = assetUrl.split('?')[0]?.split('/').pop()
      if (tail && tail.length > 0) return tail
    }
  }
  return `${type}-${id.slice(0, 8)}`
}
