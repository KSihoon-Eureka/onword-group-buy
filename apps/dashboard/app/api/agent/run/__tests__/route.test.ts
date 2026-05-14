/**
 * POST /api/agent/run — 4 case (PRD §15.1, W5와 합의된 contract).
 *
 *  1. 400 invalid_input — body 형식 잘못
 *  2. 401 unauthenticated — getUser 실패
 *  3. 403 forbidden — store_members 비멤버
 *  4. 200 started — agent_traces row 생성 + traceId 반환 + orchestrator 호출
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const {
  getUserMock,
  membershipMock,
  traceInsertMock,
  runAgentMock,
} = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  membershipMock: vi.fn(),
  traceInsertMock: vi.fn(),
  runAgentMock: vi.fn(),
}))

vi.mock('../../../../../lib/supabase/server', () => ({
  getServerSupabase: () => ({
    auth: { getUser: getUserMock },
  }),
}))

vi.mock('../../../../../lib/auth/store-membership', () => ({
  isUserStoreMember: (...args: unknown[]) => membershipMock(...args),
}))

vi.mock('@onword/db', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table !== 'agent_traces') {
        throw new Error(`Unexpected table: ${table}`)
      }
      return {
        insert: (payload: unknown) => ({
          select: () => ({
            single: () => {
              traceInsertMock(payload)
              return Promise.resolve({
                data: { id: 'trace-uuid-123' },
                error: null,
              })
            },
          }),
        }),
      }
    },
  }),
}))

vi.mock('@onword/agent/orchestrator', () => ({
  runAgent: (...args: unknown[]) => {
    runAgentMock(...args)
    return Promise.resolve({ traceId: 'trace-uuid-123', completed: true, failedToolName: null })
  },
  ALL_ACTIONS: [
    'start_campaign',
    'close_orders',
    'notify_warehouse',
    'announce_pickup',
    'urgent_alert',
    'free_text',
  ],
}))

import { POST } from '../route'

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/agent/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

describe('POST /api/agent/run', () => {
  beforeEach(() => {
    getUserMock.mockReset()
    membershipMock.mockReset()
    traceInsertMock.mockReset()
    runAgentMock.mockReset()
  })

  it('400 invalid_input — non-JSON body', async () => {
    const req = makeRequest('not-json')
    const res = await POST(req)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_input' })
    expect(getUserMock).not.toHaveBeenCalled()
  })

  it('400 invalid_input — missing storeId', async () => {
    const req = makeRequest({ action: 'start_campaign' })
    const res = await POST(req)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_input' })
  })

  it('400 invalid_input — unknown action', async () => {
    const req = makeRequest({ storeId: 'store-a', action: 'bogus_action' })
    const res = await POST(req)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_input' })
  })

  it('400 invalid_input — message not a string', async () => {
    const req = makeRequest({
      storeId: 'store-a',
      action: 'free_text',
      message: 123,
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_input' })
  })

  it('401 unauthenticated — no session', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null })
    const req = makeRequest({ storeId: 'store-a', action: 'start_campaign' })
    const res = await POST(req)
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'unauthenticated' })
    expect(membershipMock).not.toHaveBeenCalled()
    expect(traceInsertMock).not.toHaveBeenCalled()
    expect(runAgentMock).not.toHaveBeenCalled()
  })

  it('403 forbidden — user is not a member of store', async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: 'u1', email: 'a@b.com' } },
      error: null,
    })
    membershipMock.mockResolvedValue(false)

    const req = makeRequest({
      storeId: 'foreign-store',
      action: 'start_campaign',
      productId: 'p1',
    })
    const res = await POST(req)
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'forbidden' })
    expect(traceInsertMock).not.toHaveBeenCalled()
    expect(runAgentMock).not.toHaveBeenCalled()
  })

  it('200 started — auth + member → trace insert + orchestrator kicked off', async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: 'u1', email: 'a@b.com' } },
      error: null,
    })
    membershipMock.mockResolvedValue(true)

    const req = makeRequest({
      storeId: 'store-a',
      action: 'start_campaign',
      productId: 'p1',
    })
    const res = await POST(req)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      traceId: 'trace-uuid-123',
      status: 'started',
    })

    // trace insert payload 검증.
    expect(traceInsertMock).toHaveBeenCalledTimes(1)
    expect(traceInsertMock.mock.calls[0][0]).toMatchObject({
      store_id: 'store-a',
      product_id: 'p1',
      user_id: 'u1',
      action: 'start_campaign',
      status: 'running',
    })

    // orchestrator 호출 (fire-and-forget).
    expect(runAgentMock).toHaveBeenCalledTimes(1)
    expect(runAgentMock.mock.calls[0][0]).toMatchObject({
      traceId: 'trace-uuid-123',
      storeId: 'store-a',
      action: 'start_campaign',
      productId: 'p1',
      userId: 'u1',
    })
  })

  it('200 started — free_text action (productId 없이) + message 전달', async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: 'u1', email: 'a@b.com' } },
      error: null,
    })
    membershipMock.mockResolvedValue(true)

    const req = makeRequest({
      storeId: 'store-a',
      action: 'free_text',
      message: '오늘 픽업 가능한 상품 알려줘',
    })
    const res = await POST(req)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      traceId: 'trace-uuid-123',
      status: 'started',
    })

    expect(traceInsertMock).toHaveBeenCalledTimes(1)
    expect(traceInsertMock.mock.calls[0][0]).toMatchObject({
      store_id: 'store-a',
      product_id: null,
      user_id: 'u1',
      action: 'free_text',
      status: 'running',
    })

    expect(runAgentMock).toHaveBeenCalledTimes(1)
    expect(runAgentMock.mock.calls[0][0]).toMatchObject({
      traceId: 'trace-uuid-123',
      storeId: 'store-a',
      action: 'free_text',
      productId: null,
      userId: 'u1',
      message: '오늘 픽업 가능한 상품 알려줘',
    })
  })
})
