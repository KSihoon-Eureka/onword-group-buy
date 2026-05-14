/**
 * Tool registry + orchestrator chain 단위 테스트.
 *
 * 검증:
 *   1. TOOL_REGISTRY 가 ToolName 8 entries 와 1:1 (이름 매칭).
 *   2. 각 mock handler 가 PHASE_D_PLACEHOLDER 를 반환 (no-op 확인).
 *   3. TOOL_SCHEMAS 가 같은 이름 set 을 가짐 (Claude tool_use 진입 시 사용).
 *   4. ACTION_CHAIN 의 모든 tool 이 registry 에 존재.
 *   5. runAgent: 정상 chain 실행 시 trace_steps insert 들이 발생하고
 *      trace status='completed' 로 업데이트.
 *   6. runAgent: handler throw 시 chain 중단 + trace status='failed' (A3).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ToolName } from '@onword/types'
import {
  TOOL_REGISTRY,
  TOOL_NAMES,
  TOOL_SCHEMAS,
  PHASE_D_PLACEHOLDER,
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

describe('TOOL_REGISTRY (Phase C.5 mocks)', () => {
  it('contains all 8 ToolName entries', () => {
    expect(new Set(TOOL_NAMES)).toEqual(new Set(EXPECTED_TOOL_NAMES))
    expect(TOOL_NAMES.length).toBe(EXPECTED_TOOL_NAMES.length)
  })

  it('every handler is a function', () => {
    for (const name of EXPECTED_TOOL_NAMES) {
      expect(typeof TOOL_REGISTRY[name]).toBe('function')
    }
  })

  it('every mock handler returns PHASE_D_PLACEHOLDER message', async () => {
    for (const name of EXPECTED_TOOL_NAMES) {
      const out = await TOOL_REGISTRY[name](
        { storeId: 'store-x' },
        { traceId: 't', storeId: 'store-x', productId: null, userId: null },
      )
      expect(out).toMatchObject({
        message: PHASE_D_PLACEHOLDER,
        toolName: name,
      })
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
      // action 라벨도 검증
      expect(typeof action).toBe('string')
    }
  })
})

// =====================================================
// runAgent integration — Supabase mock
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

describe('runAgent (Phase C.5 chain mode)', () => {
  beforeEach(() => {
    tracesUpdateMock.mockReset()
    stepsInsertMock.mockReset()
  })

  it('runs announce_pickup chain → 1 trace_step + trace completed', async () => {
    const result = await runAgent({
      traceId: 'trace-1',
      storeId: 'store-a',
      action: 'announce_pickup',
      userId: 'u1',
    })

    expect(result).toEqual({
      traceId: 'trace-1',
      completed: true,
      failedToolName: null,
    })

    // announce_pickup chain = [generate_announcement] → 1 step insert.
    expect(stepsInsertMock).toHaveBeenCalledTimes(1)
    const stepPayload = stepsInsertMock.mock.calls[0][0]
    expect(stepPayload).toMatchObject({
      trace_id: 'trace-1',
      step_order: 1,
      tool_name: 'generate_announcement',
      status: 'done',
    })
    expect(stepPayload.output).toMatchObject({
      message: PHASE_D_PLACEHOLDER,
      toolName: 'generate_announcement',
    })

    // trace 완료 마킹.
    expect(tracesUpdateMock).toHaveBeenCalledWith({
      payload: expect.objectContaining({ status: 'completed' }),
      col: 'id',
      val: 'trace-1',
    })
  })

  it('runs start_campaign chain → 5 tools all done', async () => {
    const result = await runAgent({
      traceId: 'trace-2',
      storeId: 'store-a',
      action: 'start_campaign',
      productId: 'p1',
      userId: 'u1',
    })

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
    // 첫 번째 tool 만 throw 하도록 임시 monkey-patch.
    const originalHandler = TOOL_REGISTRY.generate_announcement
    TOOL_REGISTRY.generate_announcement = async () => {
      throw new Error('boom')
    }

    try {
      const result = await runAgent({
        traceId: 'trace-3',
        storeId: 'store-a',
        action: 'start_campaign',
        productId: 'p1',
      })

      expect(result.completed).toBe(false)
      expect(result.failedToolName).toBe('generate_announcement')

      // 첫 step 만 insert 됨 (status='error') — 다음 tool 진행 X.
      expect(stepsInsertMock).toHaveBeenCalledTimes(1)
      expect(stepsInsertMock.mock.calls[0][0]).toMatchObject({
        tool_name: 'generate_announcement',
        status: 'error',
      })

      // trace failed 마킹.
      expect(tracesUpdateMock).toHaveBeenCalledWith({
        payload: expect.objectContaining({
          status: 'failed',
          error_message: expect.stringContaining('boom'),
        }),
        col: 'id',
        val: 'trace-3',
      })
    } finally {
      TOOL_REGISTRY.generate_announcement = originalHandler
    }
  })
})
