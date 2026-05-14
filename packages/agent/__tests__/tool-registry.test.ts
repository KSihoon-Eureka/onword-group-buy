/**
 * Tool registry + orchestrator chain 단위 테스트 (Phase D).
 *
 * 검증:
 *   1. TOOL_REGISTRY 가 ToolName 8 entries 와 1:1 (이름 매칭).
 *   2. *모든 handler 가 실제 함수* (mockHandler 가 아님) — Phase D 후속 정리.
 *   3. TOOL_SCHEMAS 가 같은 이름 set 을 가짐.
 *   4. ACTION_CHAIN 의 모든 tool 이 registry 에 존재.
 *   5. adapter (makeHandler): ctx 의 traceId/userId 가 input 에 *주입*되고
 *      input 이 이미 키를 가진 경우 *덮어쓰지 않음*.
 *   6. runAgent: 정상 chain 실행 시 trace_steps insert 발생 + status='completed'.
 *   7. runAgent: handler throw 시 chain 중단 + trace status='failed' (A3).
 *   8. runAgent: free_text 액션은 mock 1 step 으로 완료 (Phase D 동적 loop 미구현).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ToolName } from '@onword/types'
import {
  TOOL_REGISTRY,
  TOOL_NAMES,
  TOOL_SCHEMAS,
  PHASE_D_PLACEHOLDER,
  mockHandler,
  makeHandler,
  type ToolContext,
  type ToolHandler,
} from '../tools/index'
import { ACTION_CHAIN, runAgent } from '../orchestrator'

// =====================================================
// Static expectations
// =====================================================

const EXPECTED_TOOL_NAMES: ToolName[] = [
  'generate_announcement',
  'generate_price_emphasis_text',
  'crawl_naver_images',
  'crawl_naver_price',
  'compose_poster',
  'generate_pickup_table',
  'get_orders',
  'notify_wholesaler',
]

describe('TOOL_REGISTRY (Phase D — real handlers)', () => {
  it('contains all 8 ToolName entries', () => {
    expect(new Set(TOOL_NAMES)).toEqual(new Set(EXPECTED_TOOL_NAMES))
    expect(TOOL_NAMES.length).toBe(EXPECTED_TOOL_NAMES.length)
  })

  it('every handler is a function', () => {
    for (const name of EXPECTED_TOOL_NAMES) {
      expect(typeof TOOL_REGISTRY[name]).toBe('function')
    }
  })

  it('handlers are *not* the legacy mockHandler (Phase D 정리)', async () => {
    // mockHandler 와 동일 출력을 내는지 검사 — 동일하면 mock 잔재.
    for (const name of EXPECTED_TOOL_NAMES) {
      // 실제 함수는 supabase 호출이 mock 안 된 상태에서 throw 한다 →
      // mockHandler 와 동작이 다름 (mock 은 message 반환).
      const out = await TOOL_REGISTRY[name](
        // 의도적으로 빈 input → 실제 함수면 validation throw.
        {},
        { traceId: 't', storeId: 's', productId: null, userId: null },
      ).catch((err: Error) => ({ __caught: true, message: err.message }))

      // Mock 이라면 out.message === PHASE_D_PLACEHOLDER 가 됨.
      const isMockOutput =
        out !== null &&
        typeof out === 'object' &&
        '__caught' in out === false &&
        (out as { message?: string }).message === PHASE_D_PLACEHOLDER
      expect(isMockOutput).toBe(false)
    }
  })

  it('TOOL_SCHEMAS name set equals TOOL_REGISTRY', () => {
    const schemaNames = TOOL_SCHEMAS.map((s) => s.name).sort()
    const registryNames = [...EXPECTED_TOOL_NAMES].sort()
    expect(schemaNames).toEqual(registryNames)
  })

  it('ACTION_CHAIN references only registered tools (PRD §7.13)', () => {
    for (const [action, chain] of Object.entries(ACTION_CHAIN)) {
      for (const tool of chain) {
        expect(TOOL_REGISTRY[tool]).toBeDefined()
        expect(TOOL_NAMES).toContain(tool)
      }
      expect(chain.length).toBeGreaterThan(0)
      expect(typeof action).toBe('string')
    }
  })
})

// =====================================================
// makeHandler adapter — ctx 주입 검증
// =====================================================
//
// Adapter (`makeHandler`) 가 ToolContext 의 traceId/userId 를 tool input 에
// `_traceId / _traceStepId / _userId` 키로 주입하는지 직접 검증.
//
// 외부 함수가 아닌 *내부 어댑터* 자체를 검증해야 해서 mockHandler 로 한 번 더
// 호출 — capture 용.

describe('makeHandler adapter (ctx → input 주입)', () => {
  it('실제 함수에 _traceId / _traceStepId / _userId 를 input 에 주입', async () => {
    const calls: Array<Record<string, unknown>> = []
    // makeHandler 로 wrap — 등록과 동일 경로.
    const handler = makeHandler(async (input: Record<string, unknown>) => {
      calls.push(input)
      return { ok: true }
    })

    await handler(
      { storeId: 'store-x', productId: 'p1' },
      { traceId: 'tr-1', storeId: 'store-x', productId: 'p1', userId: 'u-1' },
    )

    expect(calls[0]).toMatchObject({
      _traceId: 'tr-1',
      _traceStepId: 'tr-1',
      _userId: 'u-1',
      storeId: 'store-x',
      productId: 'p1',
    })
  })

  it('input 이 이미 _traceId 를 가지면 ctx 가 *덮어쓰지 않음* (input 우선)', async () => {
    const calls: Array<Record<string, unknown>> = []
    const handler = makeHandler(async (input: Record<string, unknown>) => {
      calls.push(input)
      return { ok: true }
    })

    await handler(
      { _traceId: 'preexisting-trace', storeId: 'store-x' },
      { traceId: 'ctx-trace', storeId: 'store-x', productId: null, userId: 'u-1' },
    )

    // _traceId 는 input 값을 우선.
    expect(calls[0]._traceId).toBe('preexisting-trace')
    // 다른 키는 그대로 ctx 에서 주입.
    expect(calls[0]._userId).toBe('u-1')
  })

  it('ctx.userId 가 null 이어도 안전 (실제 함수에 null 로 전달)', async () => {
    const calls: Array<Record<string, unknown>> = []
    const handler = makeHandler(async (input: Record<string, unknown>) => {
      calls.push(input)
      return { ok: true }
    })

    await handler(
      { storeId: 'store-x' },
      { traceId: 'tr-2', storeId: 'store-x', productId: null, userId: null },
    )

    expect(calls[0]._userId).toBeNull()
  })

  it('mockHandler 는 ctx 주입을 안 한다 (registry 에서 더 이상 사용 안 함)', async () => {
    // 보존된 legacy mockHandler — Phase D 에서는 registry 에 등록 안 함.
    const m = mockHandler('get_orders')
    const out = (await m(
      { storeId: 'x' },
      { traceId: 't', storeId: 'x', productId: null, userId: null },
    )) as { input: Record<string, unknown>; message: string }

    // mockHandler 는 *adapter 가 아님* — ctx 주입 없이 input 그대로 반환.
    expect(out.input._traceId).toBeUndefined()
    expect(out.message).toBe(PHASE_D_PLACEHOLDER)
  })
})

// =====================================================
// runAgent integration — Supabase mock + 모든 tool replaced
// =====================================================

const { tracesUpdateMock, stepsInsertMock } = vi.hoisted(() => ({
  tracesUpdateMock: vi.fn(),
  stepsInsertMock: vi.fn(),
}))

vi.mock('@onword/db', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === 'agent_traces') {
        return {
          update: (payload: unknown) => ({
            eq: (col: string, val: string) => {
              tracesUpdateMock({ payload, col, val })
              return Promise.resolve({ data: null, error: null })
            },
          }),
        }
      }
      if (table === 'trace_steps') {
        return {
          insert: (payload: unknown) => {
            stepsInsertMock(payload)
            return Promise.resolve({ data: null, error: null })
          },
        }
      }
      throw new Error(`Unexpected table: ${table}`)
    },
  }),
}))

describe('runAgent (Phase D — chain mode, tools stubbed)', () => {
  beforeEach(() => {
    tracesUpdateMock.mockReset()
    stepsInsertMock.mockReset()
  })

  /**
   * 실제 tool 함수는 외부 의존 (Anthropic / Playwright / Supabase) 을 갖기 때문에
   * runAgent 단위 테스트에서는 TOOL_REGISTRY 의 8 개 handler 를 *런타임 시점*에
   * stub 으로 교체한다. 본 변경은 try/finally 로 원복.
   */
  function withStubbedRegistry<T>(
    stub: ToolHandler,
    fn: () => Promise<T>,
  ): Promise<T> {
    const saved: Partial<Record<ToolName, ToolHandler>> = {}
    for (const name of EXPECTED_TOOL_NAMES) {
      saved[name] = TOOL_REGISTRY[name]
      TOOL_REGISTRY[name] = stub
    }
    return fn().finally(() => {
      for (const name of EXPECTED_TOOL_NAMES) {
        TOOL_REGISTRY[name] = saved[name]!
      }
    })
  }

  it('runs announce_pickup chain → 1 trace_step + trace completed', async () => {
    const capturedInputs: Array<Record<string, unknown>> = []
    // makeHandler 를 통해 stub 등록 — adapter 경로 보존 (ctx 주입 검증).
    const stub: ToolHandler = makeHandler(
      async (input: Record<string, unknown>) => {
        capturedInputs.push(input)
        return { stub: true }
      },
    )

    const result = await withStubbedRegistry(stub, () =>
      runAgent({
        traceId: 'trace-1',
        storeId: 'store-a',
        action: 'announce_pickup',
        userId: 'u1',
      }),
    )

    expect(result).toEqual({
      traceId: 'trace-1',
      completed: true,
      failedToolName: null,
    })

    expect(stepsInsertMock).toHaveBeenCalledTimes(1)
    const stepPayload = stepsInsertMock.mock.calls[0][0]
    expect(stepPayload).toMatchObject({
      trace_id: 'trace-1',
      step_order: 1,
      tool_name: 'generate_announcement',
      status: 'done',
    })

    // adapter 가 ctx 메타를 input 에 주입했는지 *통합 경로* 에서 확인.
    expect(capturedInputs[0]).toMatchObject({
      _traceId: 'trace-1',
      _traceStepId: 'trace-1',
      _userId: 'u1',
    })

    expect(tracesUpdateMock).toHaveBeenCalledWith({
      payload: expect.objectContaining({ status: 'completed' }),
      col: 'id',
      val: 'trace-1',
    })
  })

  it('runs start_campaign chain → 5 tools all done', async () => {
    const stub: ToolHandler = makeHandler(async () => ({ stub: true }))

    const result = await withStubbedRegistry(stub, () =>
      runAgent({
        traceId: 'trace-2',
        storeId: 'store-a',
        action: 'start_campaign',
        productId: 'p1',
        userId: 'u1',
      }),
    )

    expect(result.completed).toBe(true)
    expect(stepsInsertMock).toHaveBeenCalledTimes(5)
    const toolNames = stepsInsertMock.mock.calls.map(
      (c) => (c[0] as { tool_name: string }).tool_name,
    )
    expect(toolNames).toEqual(ACTION_CHAIN.start_campaign)
  })

  it('free_text action: 정적 chain 아님 → mock 1 step + trace completed', async () => {
    const result = await runAgent({
      traceId: 'trace-ft',
      storeId: 'store-a',
      action: 'free_text',
      message: '오늘 픽업 가능한 상품?',
      userId: 'u1',
    })

    expect(result).toEqual({
      traceId: 'trace-ft',
      completed: true,
      failedToolName: null,
    })

    expect(stepsInsertMock).toHaveBeenCalledTimes(1)
    const payload = stepsInsertMock.mock.calls[0][0]
    expect(payload).toMatchObject({
      trace_id: 'trace-ft',
      step_order: 1,
      tool_name: 'free_text',
      status: 'done',
    })
    expect(payload.input).toMatchObject({
      storeId: 'store-a',
      message: '오늘 픽업 가능한 상품?',
    })
    expect(payload.summary).toContain('Phase D')

    expect(tracesUpdateMock).toHaveBeenCalledWith({
      payload: expect.objectContaining({ status: 'completed' }),
      col: 'id',
      val: 'trace-ft',
    })
  })

  it('A3 chain failure: handler throw → 즉시 중단 + trace failed', async () => {
    const stub: ToolHandler = makeHandler(async () => {
      throw new Error('boom')
    })

    const result = await withStubbedRegistry(stub, () =>
      runAgent({
        traceId: 'trace-3',
        storeId: 'store-a',
        action: 'start_campaign',
        productId: 'p1',
      }),
    )

    expect(result.completed).toBe(false)
    expect(result.failedToolName).toBe('generate_announcement')

    // 첫 step 만 insert 됨 (status='error') — 다음 tool 진행 X.
    expect(stepsInsertMock).toHaveBeenCalledTimes(1)
    expect(stepsInsertMock.mock.calls[0][0]).toMatchObject({
      tool_name: 'generate_announcement',
      status: 'error',
    })

    expect(tracesUpdateMock).toHaveBeenCalledWith({
      payload: expect.objectContaining({
        status: 'failed',
        error_message: expect.stringContaining('boom'),
      }),
      col: 'id',
      val: 'trace-3',
    })
  })
})
