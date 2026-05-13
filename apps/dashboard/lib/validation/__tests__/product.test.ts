import { describe, it, expect } from 'vitest'
import { validateCreateProduct } from '../product'

const validPayload = () => ({
  storeId: 'store-1',
  name: '슈미트 베개커버',
  description: '독일제 호텔식',
  category: '침구',
  price: 12000,
  comparePrice: 18000,
  stockQuantity: 50,
  expiryDate: '2027-01-01',
  orderDeadline: '2026-06-01T12:00:00Z',
  pickupDate: '2026-06-05',
  pickupDeadline: '2026-06-07',
  sourceImageUrls: ['https://example.com/a.jpg'],
  primaryImageUrl: 'https://example.com/a.jpg',
})

describe('validateCreateProduct', () => {
  it('정상 입력 → ok + trimmed 값', () => {
    const r = validateCreateProduct({
      ...validPayload(),
      name: '  슈미트 베개커버  ',
      description: '  hello  ',
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data.name).toBe('슈미트 베개커버')
      expect(r.data.description).toBe('hello')
      expect(r.data.comparePrice).toBe(18000)
      expect(r.data.primaryImageUrl).toBe('https://example.com/a.jpg')
      expect(r.data.pickupDate).toBe('2026-06-05')
    }
  })

  it('이미지 0장이어도 통과 (자동 크롤 D.5 대비)', () => {
    const r = validateCreateProduct({
      ...validPayload(),
      sourceImageUrls: [],
      primaryImageUrl: undefined,
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data.sourceImageUrls).toEqual([])
      expect(r.data.primaryImageUrl).toBeNull()
    }
  })

  it('이미지만 있고 primary 미지정 → 첫 장 자동 선택', () => {
    const r = validateCreateProduct({
      ...validPayload(),
      sourceImageUrls: ['https://a', 'https://b'],
      primaryImageUrl: undefined,
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.primaryImageUrl).toBe('https://a')
  })

  it('name 비어있음 → 에러', () => {
    const r = validateCreateProduct({ ...validPayload(), name: '   ' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/상품명/)
  })

  it('price 0 이하 → 에러', () => {
    const r = validateCreateProduct({ ...validPayload(), price: 0 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/판매가/)
  })

  it('price 정수 아님 → 에러', () => {
    const r = validateCreateProduct({ ...validPayload(), price: 12.5 })
    expect(r.ok).toBe(false)
  })

  it('stockQuantity 0 이하 → 에러', () => {
    const r = validateCreateProduct({ ...validPayload(), stockQuantity: 0 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/재고/)
  })

  it('comparePrice < price → 에러', () => {
    const r = validateCreateProduct({
      ...validPayload(),
      price: 20000,
      comparePrice: 10000,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/비교가/)
  })

  it('주문 마감 > 수령 시작 → 에러', () => {
    const r = validateCreateProduct({
      ...validPayload(),
      orderDeadline: '2026-06-10T00:00:00Z',
      pickupDate: '2026-06-05',
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/주문 마감/)
  })

  it('수령 시작 > 수령 마감 → 에러', () => {
    const r = validateCreateProduct({
      ...validPayload(),
      pickupDate: '2026-06-10',
      pickupDeadline: '2026-06-05',
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/수령 시작/)
  })

  it('주문 마감 형식 오류 → 에러', () => {
    const r = validateCreateProduct({
      ...validPayload(),
      orderDeadline: 'not-a-date',
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/주문 마감/)
  })

  it('이미지 7장 → 에러', () => {
    const r = validateCreateProduct({
      ...validPayload(),
      sourceImageUrls: Array.from({ length: 7 }, (_, i) => `https://x/${i}`),
      primaryImageUrl: 'https://x/0',
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/최대 6장/)
  })

  it('primaryImageUrl이 sourceImageUrls에 없음 → 에러', () => {
    const r = validateCreateProduct({
      ...validPayload(),
      sourceImageUrls: ['https://a'],
      primaryImageUrl: 'https://b',
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/메인 이미지/)
  })
})
