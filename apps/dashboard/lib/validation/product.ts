/**
 * 상품 등록 입력 검증 — 순수 함수 (PRD §4.4 products, §15.1 /api/products).
 *
 * /api/products POST body + ProductRegisterForm submit 양쪽이 동일 규칙으로 검증.
 * `CreateProductInput` (packages/types) 매핑 + 서버 측 추가 제약 (날짜 순서, 가격 양수).
 *
 * 에러 메시지는 한국어 — 그대로 사용자에게 노출 가능.
 */

import type { CreateProductInput } from '@onword/types'

export interface ValidatedCreateProduct {
  name: string
  description: string | null
  category: string | null
  price: number
  comparePrice: number | null
  stockQuantity: number
  expiryDate: string | null
  orderDeadline: string
  pickupDate: string
  pickupDeadline: string
  urgencyBanner: string | null
  sourceImageUrls: string[]
  primaryImageUrl: string | null
}

export type ProductValidationResult =
  | { ok: true; data: ValidatedCreateProduct }
  | { ok: false; error: string }

function isFiniteInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && Number.isInteger(v)
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0
}

function parseDate(v: unknown): Date | null {
  if (typeof v !== 'string' || v.length === 0) return null
  const t = Date.parse(v)
  return Number.isNaN(t) ? null : new Date(t)
}

/**
 * 폼 / API 양쪽에서 사용. storeId는 검증 안 함 — 세션에서 주입.
 *
 * 검증 규칙:
 *  - name 필수 (비공백)
 *  - price > 0 정수
 *  - stockQuantity > 0 정수
 *  - comparePrice 지정 시 price 이상 (할인 무의미 방지)
 *  - orderDeadline / pickupDate / pickupDeadline 모두 유효 날짜 문자열
 *  - 시간순: orderDeadline ≤ pickupDate ≤ pickupDeadline
 *  - expiryDate 지정 시 유효 날짜
 *  - sourceImageUrls 최대 6장 (PRD §11.1)
 *  - primaryImageUrl이 sourceImageUrls에 포함되거나 빈 배열일 때만 null 허용
 */
export function validateCreateProduct(
  payload: Partial<CreateProductInput>,
): ProductValidationResult {
  if (!isNonEmptyString(payload.name)) {
    return { ok: false, error: '상품명을 입력해주세요.' }
  }
  const name = payload.name.trim()
  if (name.length > 200) {
    return { ok: false, error: '상품명은 200자 이내로 입력해주세요.' }
  }

  if (!isFiniteInt(payload.price) || payload.price <= 0) {
    return { ok: false, error: '판매가는 1원 이상의 정수여야 합니다.' }
  }

  if (!isFiniteInt(payload.stockQuantity) || payload.stockQuantity <= 0) {
    return { ok: false, error: '재고 수량은 1개 이상이어야 합니다.' }
  }

  let comparePrice: number | null = null
  if (payload.comparePrice !== undefined && payload.comparePrice !== null) {
    if (!isFiniteInt(payload.comparePrice) || payload.comparePrice <= 0) {
      return { ok: false, error: '비교가는 1원 이상의 정수여야 합니다.' }
    }
    if (payload.comparePrice < payload.price) {
      return {
        ok: false,
        error: '비교가는 판매가보다 크거나 같아야 합니다.',
      }
    }
    comparePrice = payload.comparePrice
  }

  const orderDeadline = parseDate(payload.orderDeadline)
  if (!orderDeadline) {
    return { ok: false, error: '주문 마감일시를 올바른 형식으로 입력해주세요.' }
  }

  const pickupDate = parseDate(payload.pickupDate)
  if (!pickupDate) {
    return { ok: false, error: '수령 시작일을 올바른 형식으로 입력해주세요.' }
  }

  const pickupDeadline = parseDate(payload.pickupDeadline)
  if (!pickupDeadline) {
    return { ok: false, error: '수령 마감일을 올바른 형식으로 입력해주세요.' }
  }

  if (orderDeadline.getTime() > pickupDate.getTime()) {
    return {
      ok: false,
      error: '주문 마감은 수령 시작일보다 빠르거나 같아야 합니다.',
    }
  }
  if (pickupDate.getTime() > pickupDeadline.getTime()) {
    return {
      ok: false,
      error: '수령 시작일은 수령 마감일보다 빠르거나 같아야 합니다.',
    }
  }

  let expiryDate: string | null = null
  if (payload.expiryDate !== undefined && payload.expiryDate !== null && payload.expiryDate !== '') {
    const parsed = parseDate(payload.expiryDate)
    if (!parsed) {
      return { ok: false, error: '유통기한을 올바른 형식으로 입력해주세요.' }
    }
    expiryDate = payload.expiryDate
  }

  const sourceImageUrls = Array.isArray(payload.sourceImageUrls)
    ? payload.sourceImageUrls.filter((u): u is string => typeof u === 'string' && u.length > 0)
    : []
  if (sourceImageUrls.length > 6) {
    return { ok: false, error: '이미지는 최대 6장까지 등록할 수 있습니다.' }
  }

  let primaryImageUrl: string | null = null
  if (typeof payload.primaryImageUrl === 'string' && payload.primaryImageUrl.length > 0) {
    if (!sourceImageUrls.includes(payload.primaryImageUrl)) {
      return {
        ok: false,
        error: '메인 이미지는 업로드된 이미지 중에서 선택해주세요.',
      }
    }
    primaryImageUrl = payload.primaryImageUrl
  } else if (sourceImageUrls.length > 0) {
    primaryImageUrl = sourceImageUrls[0]!
  }

  const description = isNonEmptyString(payload.description)
    ? payload.description.trim()
    : null
  const category = isNonEmptyString(payload.category) ? payload.category.trim() : null
  const urgencyBanner = isNonEmptyString(payload.urgencyBanner)
    ? payload.urgencyBanner.trim()
    : null

  return {
    ok: true,
    data: {
      name,
      description,
      category,
      price: payload.price,
      comparePrice,
      stockQuantity: payload.stockQuantity,
      expiryDate,
      orderDeadline: orderDeadline.toISOString(),
      pickupDate: pickupDate.toISOString().slice(0, 10),
      pickupDeadline: pickupDeadline.toISOString().slice(0, 10),
      urgencyBanner,
      sourceImageUrls,
      primaryImageUrl,
    },
  }
}
