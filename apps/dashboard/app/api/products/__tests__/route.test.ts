/**
 * POST /api/products 핸들러 동작 테스트.
 *
 * 인증 / 멤버십 / 검증 / DB insert 분기를 검사.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const {
  getUserMock,
  isMemberMock,
  cookieGetMock,
  insertMock,
  insertSelectSingleMock,
} = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  isMemberMock: vi.fn(),
  cookieGetMock: vi.fn(),
  insertMock: vi.fn(),
  insertSelectSingleMock: vi.fn(),
}))

vi.mock('next/headers', () => ({
  cookies: () => ({ get: cookieGetMock }),
}))

vi.mock('@/lib/supabase/server', () => ({
  getServerSupabase: () => ({
    auth: { getUser: getUserMock },
    from: vi.fn(() => ({
      insert: (...args: unknown[]) => {
        insertMock(...args)
        return {
          select: () => ({
            single: insertSelectSingleMock,
          }),
        }
      },
    })),
  }),
}))

vi.mock('@/lib/auth/store-membership', () => ({
  isUserStoreMember: isMemberMock,
}))

import { POST } from '../route'

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/products', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

const validBody = () => ({
  name: '슈미트 베개커버',
  price: 12000,
  comparePrice: 18000,
  stockQuantity: 50,
  orderDeadline: '2026-06-01T12:00:00Z',
  pickupDate: '2026-06-05',
  pickupDeadline: '2026-06-07',
  sourceImageUrls: ['https://example.com/a.jpg'],
  primaryImageUrl: 'https://example.com/a.jpg',
})

describe('POST /api/products', () => {
  beforeEach(() => {
    getUserMock.mockReset()
    isMemberMock.mockReset()
    cookieGetMock.mockReset()
    insertMock.mockReset()
    insertSelectSingleMock.mockReset()
  })

  it('미인증 → 401', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await POST(makeRequest(validBody()))
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toMatch(/로그인/)
  })

  it('인증됐지만 active_store_id 쿠키 없음 → 403', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'u1' } } })
    cookieGetMock.mockReturnValue(undefined)
    const res = await POST(makeRequest(validBody()))
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toMatch(/매장/)
  })

  it('인증됐지만 store 멤버 아님 → 403', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'u1' } } })
    cookieGetMock.mockReturnValue({ value: 'foreign-store' })
    isMemberMock.mockResolvedValue(false)
    const res = await POST(makeRequest(validBody()))
    expect(res.status).toBe(403)
  })

  it('잘못된 JSON → 400', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'u1' } } })
    cookieGetMock.mockReturnValue({ value: 'store-a' })
    isMemberMock.mockResolvedValue(true)
    const res = await POST(makeRequest('{not-json'))
    expect(res.status).toBe(400)
  })

  it('필수 필드 누락 (name) → 400 + 한국어 메시지', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'u1' } } })
    cookieGetMock.mockReturnValue({ value: 'store-a' })
    isMemberMock.mockResolvedValue(true)
    const { name: _omit, ...rest } = validBody()
    void _omit
    const res = await POST(makeRequest(rest))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/상품명/)
  })

  it('price = 0 → 400', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'u1' } } })
    cookieGetMock.mockReturnValue({ value: 'store-a' })
    isMemberMock.mockResolvedValue(true)
    const res = await POST(makeRequest({ ...validBody(), price: 0 }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/판매가/)
  })

  it('수령 시작 > 수령 마감 → 400', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'u1' } } })
    cookieGetMock.mockReturnValue({ value: 'store-a' })
    isMemberMock.mockResolvedValue(true)
    const res = await POST(
      makeRequest({
        ...validBody(),
        pickupDate: '2026-06-10',
        pickupDeadline: '2026-06-05',
      }),
    )
    expect(res.status).toBe(400)
  })

  it('정상 → 200 + id, insert에 store_id + flow_stage 포함', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'u1' } } })
    cookieGetMock.mockReturnValue({ value: 'store-a' })
    isMemberMock.mockResolvedValue(true)
    insertSelectSingleMock.mockResolvedValue({
      data: { id: 'product-1' },
      error: null,
    })

    const res = await POST(makeRequest(validBody()))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.id).toBe('product-1')

    expect(insertMock).toHaveBeenCalledTimes(1)
    const payload = insertMock.mock.calls[0]![0] as Record<string, unknown>
    expect(payload.store_id).toBe('store-a')
    expect(payload.flow_stage).toBe('product_registered')
    expect(payload.primary_image_url).toBe('https://example.com/a.jpg')
    expect(payload.source_image_urls).toEqual(['https://example.com/a.jpg'])
  })

  it('DB insert 실패 → 500', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'u1' } } })
    cookieGetMock.mockReturnValue({ value: 'store-a' })
    isMemberMock.mockResolvedValue(true)
    insertSelectSingleMock.mockResolvedValue({
      data: null,
      error: { message: 'conflict' },
    })
    const res = await POST(makeRequest(validBody()))
    expect(res.status).toBe(500)
  })
})
