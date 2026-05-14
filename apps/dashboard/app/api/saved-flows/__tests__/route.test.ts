/**
 * /api/saved-flows + /api/saved-flows/[id] guards.
 *
 * 각 method (GET / POST / PATCH / DELETE) × 4 분기 (200/201, 401, 403, 400).
 * RLS 신뢰 — 여기서는 라우트 핸들러의 가드 + 입력 검증만 검증한다.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const {
  cookiesGetMock,
  getUserMock,
  membershipMock,
  flowsSelectMock,
  flowsInsertMock,
  flowsUpdateMock,
  flowsDeleteMock,
} = vi.hoisted(() => ({
  cookiesGetMock: vi.fn(),
  getUserMock: vi.fn(),
  membershipMock: vi.fn(),
  flowsSelectMock: vi.fn(),
  flowsInsertMock: vi.fn(),
  flowsUpdateMock: vi.fn(),
  flowsDeleteMock: vi.fn(),
}))

vi.mock('next/headers', () => ({
  cookies: () => ({ get: cookiesGetMock }),
}))

vi.mock('@/lib/supabase/server', () => ({
  getServerSupabase: () => buildSupabase(),
}))

function buildSupabase() {
  return {
    auth: { getUser: getUserMock },
    from(table: string) {
      if (table === 'store_members') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: membershipMock,
              }),
            }),
          }),
        }
      }
      if (table === 'saved_flows') {
        return {
          // GET: select().eq().eq().order().order()
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: () => ({
                  order: flowsSelectMock,
                }),
              }),
            }),
          }),
          // POST: insert(payload).select(...).single()
          insert: (payload: unknown) => ({
            select: () => ({
              single: () => flowsInsertMock(payload),
            }),
          }),
          // PATCH: update(patch).eq().eq().eq().select().maybeSingle()
          update: (patch: unknown) => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  select: () => ({
                    maybeSingle: () => flowsUpdateMock(patch),
                  }),
                }),
              }),
            }),
          }),
          // DELETE: delete().eq().eq().eq().select().maybeSingle()
          delete: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  select: () => ({
                    maybeSingle: flowsDeleteMock,
                  }),
                }),
              }),
            }),
          }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }
}

import { GET, POST } from '../route'
import { PATCH, DELETE } from '../[id]/route'

const STORE_ID = '11111111-1111-1111-1111-111111111111'
const USER_ID = '22222222-2222-2222-2222-222222222222'
const FLOW_ID = '33333333-3333-3333-3333-333333333333'

function asUser() {
  cookiesGetMock.mockImplementation((name: string) =>
    name === 'active_store_id' ? { value: STORE_ID } : undefined,
  )
  getUserMock.mockResolvedValue({ data: { user: { id: USER_ID, email: 'a@b.com' } }, error: null })
  membershipMock.mockResolvedValue({ data: { store_id: STORE_ID }, error: null })
}

function buildJsonRequest(url: string, init?: RequestInit) {
  return new Request(url, init) as unknown as Parameters<typeof POST>[0]
}

const SAMPLE_ROW = {
  id: FLOW_ID,
  store_id: STORE_ID,
  user_id: USER_ID,
  name: '오늘 마감',
  prompt: '오늘 마감 상품 공고글 만들어줘',
  icon: 'RefreshCcw',
  display_order: 1,
  run_count: 5,
  last_run_at: null,
  created_at: '2026-05-14T00:00:00Z',
  updated_at: '2026-05-14T00:00:00Z',
}

beforeEach(() => {
  cookiesGetMock.mockReset()
  getUserMock.mockReset()
  membershipMock.mockReset()
  flowsSelectMock.mockReset()
  flowsInsertMock.mockReset()
  flowsUpdateMock.mockReset()
  flowsDeleteMock.mockReset()
})

// ============================================================
// GET /api/saved-flows
// ============================================================
describe('GET /api/saved-flows', () => {
  it('200 — 인증 + 멤버 → flows 반환', async () => {
    asUser()
    flowsSelectMock.mockResolvedValue({ data: [SAMPLE_ROW], error: null })

    const res = await GET(buildJsonRequest('http://t/api/saved-flows'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.flows).toHaveLength(1)
    expect(body.flows[0].id).toBe(FLOW_ID)
    expect(body.flows[0].storeId).toBe(STORE_ID)
    expect(body.flows[0].runCount).toBe(5)
  })

  it('401 — 미인증', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null })
    const res = await GET(buildJsonRequest('http://t/api/saved-flows'))
    expect(res.status).toBe(401)
  })

  it('403 — active_store_id 쿠키 없음', async () => {
    cookiesGetMock.mockReturnValue(undefined)
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
    const res = await GET(buildJsonRequest('http://t/api/saved-flows'))
    expect(res.status).toBe(403)
  })

  it('403 — 멤버 아닌 store', async () => {
    cookiesGetMock.mockImplementation((name: string) =>
      name === 'active_store_id' ? { value: 'foreign-store' } : undefined,
    )
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
    membershipMock.mockResolvedValue({ data: null, error: null })

    const res = await GET(buildJsonRequest('http://t/api/saved-flows'))
    expect(res.status).toBe(403)
  })
})

// ============================================================
// POST /api/saved-flows
// ============================================================
describe('POST /api/saved-flows', () => {
  it('201 — 정상 입력 → flow 반환', async () => {
    asUser()
    flowsInsertMock.mockResolvedValue({ data: SAMPLE_ROW, error: null })

    const req = buildJsonRequest('http://t/api/saved-flows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '새 플로우', prompt: '뭐든 해줘', icon: 'Sparkles' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.flow.id).toBe(FLOW_ID)
  })

  it('401 — 미인증', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null })
    const req = buildJsonRequest('http://t/api/saved-flows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'x', prompt: 'y' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('403 — 멤버 아닌 store', async () => {
    cookiesGetMock.mockImplementation((name: string) =>
      name === 'active_store_id' ? { value: 'foreign-store' } : undefined,
    )
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
    membershipMock.mockResolvedValue({ data: null, error: null })

    const req = buildJsonRequest('http://t/api/saved-flows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'x', prompt: 'y' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(403)
  })

  it('400 — name 누락', async () => {
    asUser()
    const req = buildJsonRequest('http://t/api/saved-flows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'y' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('invalid_input')
    expect(body.reason).toBe('name_required')
  })

  it('400 — name 40자 초과', async () => {
    asUser()
    const req = buildJsonRequest('http://t/api/saved-flows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'a'.repeat(41), prompt: 'y' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    expect((await res.json()).reason).toBe('name_too_long')
  })

  it('400 — malformed JSON', async () => {
    asUser()
    const req = buildJsonRequest('http://t/api/saved-flows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not json',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })
})

// ============================================================
// PATCH /api/saved-flows/[id]
// ============================================================
describe('PATCH /api/saved-flows/[id]', () => {
  it('200 — 정상 → 업데이트된 flow 반환', async () => {
    asUser()
    flowsUpdateMock.mockResolvedValue({
      data: { ...SAMPLE_ROW, name: '수정된 이름' },
      error: null,
    })

    const req = buildJsonRequest(`http://t/api/saved-flows/${FLOW_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '수정된 이름' }),
    })
    const res = await PATCH(req, { params: { id: FLOW_ID } })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.flow.name).toBe('수정된 이름')
  })

  it('401 — 미인증', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null })
    const req = buildJsonRequest(`http://t/api/saved-flows/${FLOW_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'x' }),
    })
    const res = await PATCH(req, { params: { id: FLOW_ID } })
    expect(res.status).toBe(401)
  })

  it('403 — 다른 사용자의 flow (RLS / WHERE로 0 rows) → 403', async () => {
    asUser()
    flowsUpdateMock.mockResolvedValue({ data: null, error: null })

    const req = buildJsonRequest(`http://t/api/saved-flows/${FLOW_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'x' }),
    })
    const res = await PATCH(req, { params: { id: FLOW_ID } })
    expect(res.status).toBe(403)
  })

  it('400 — uuid 아님', async () => {
    asUser()
    const req = buildJsonRequest('http://t/api/saved-flows/not-a-uuid', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'x' }),
    })
    const res = await PATCH(req, { params: { id: 'not-a-uuid' } })
    expect(res.status).toBe(400)
    expect((await res.json()).reason).toBe('invalid_id')
  })

  it('400 — 빈 body (업데이트 필드 없음)', async () => {
    asUser()
    const req = buildJsonRequest(`http://t/api/saved-flows/${FLOW_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const res = await PATCH(req, { params: { id: FLOW_ID } })
    expect(res.status).toBe(400)
    expect((await res.json()).reason).toBe('no_fields_to_update')
  })
})

// ============================================================
// DELETE /api/saved-flows/[id]
// ============================================================
describe('DELETE /api/saved-flows/[id]', () => {
  it('200 — 정상 삭제 → ok', async () => {
    asUser()
    flowsDeleteMock.mockResolvedValue({ data: { id: FLOW_ID }, error: null })

    const req = buildJsonRequest(`http://t/api/saved-flows/${FLOW_ID}`, { method: 'DELETE' })
    const res = await DELETE(req, { params: { id: FLOW_ID } })
    expect(res.status).toBe(200)
    expect((await res.json()).ok).toBe(true)
  })

  it('401 — 미인증', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null })
    const req = buildJsonRequest(`http://t/api/saved-flows/${FLOW_ID}`, { method: 'DELETE' })
    const res = await DELETE(req, { params: { id: FLOW_ID } })
    expect(res.status).toBe(401)
  })

  it('403 — 다른 사용자의 flow (0 rows 삭제)', async () => {
    asUser()
    flowsDeleteMock.mockResolvedValue({ data: null, error: null })

    const req = buildJsonRequest(`http://t/api/saved-flows/${FLOW_ID}`, { method: 'DELETE' })
    const res = await DELETE(req, { params: { id: FLOW_ID } })
    expect(res.status).toBe(403)
  })

  it('400 — uuid 아님', async () => {
    asUser()
    const req = buildJsonRequest('http://t/api/saved-flows/xxx', { method: 'DELETE' })
    const res = await DELETE(req, { params: { id: 'xxx' } })
    expect(res.status).toBe(400)
  })
})
