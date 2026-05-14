/**
 * Agent Orchestrator — Phase C.5 skeleton.
 *
 * 책임:
 *   1. 정적 action chain (PRD §7.13) 모드로 tool 들을 순서대로 실행.
 *   2. 각 tool 실행 전후로 trace_steps 행 upsert (pending → running → done|error).
 *   3. 실패 시 chain 중단 + agent_traces.status = 'failed' (PRD A3).
 *   4. Phase D 에서 Claude tool_use 동적 loop 가 필요해지면 별도 함수로 추가.
 *
 * 비책임 (route 가 함):
 *   - 인증 / store 멤버 검증
 *   - agent_traces 행 *생성* — route 가 미리 만들고 traceId 를 넘긴다.
 *   - HTTP 응답.
 *
 * Fire-and-forget:
 *   - route 가 await 하지 않고 백그라운드로 호출.
 *   - orchestrator 자체적으로 try/catch + 상태 persist.
 *   - 클라이언트는 Supabase Realtime (trace:{traceId}) 으로 trace_steps 구독.
 *
 * Phase D 변경 포인트:
 *   - mock handler 들이 실제 함수로 교체됨 (packages/agent/tools/index.ts).
 *   - 필요 시 Claude tool_use 동적 loop 함수 추가 (`runDynamicAgent` 같은 이름).
 */

import Anthropic from '@anthropic-ai/sdk'
import { createServiceClient } from '@onword/db'
import type { ActionName, ToolName } from '@onword/types'
import { TOOL_REGISTRY, type ToolContext } from './tools/index'

// =====================================================
// Anthropic SDK (lazy)
// =====================================================
// Module-level 인스턴스는 import 시 환경변수 부재로 throw 하지 않도록 lazy.
// 본 워커는 호출하지 않지만 Phase D 가 사용.

export const MODEL = 'claude-sonnet-4-6-20250514'
export const MAX_TOKENS = 4096 // CLAUDE.md 함정: tool_use 안정 한도.

let _anthropic: Anthropic | null = null
export function getAnthropic(): Anthropic {
  if (_anthropic) return _anthropic
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error('Missing ANTHROPIC_API_KEY (PRD §16).')
  }
  _anthropic = new Anthropic({ apiKey })
  return _anthropic
}

// =====================================================
// Static action → tool chain (PRD §7.13)
// =====================================================
// free_text 는 정적 chain 이 아니라 Phase D 의 Claude 동적 tool_use loop 대상.
// 본 워커는 mock 단일 step 으로 표시만 한다 (아래 runAgent 분기 참고).

export type StaticChainAction = Exclude<ActionName, 'free_text'>

export const ACTION_CHAIN: Record<StaticChainAction, ToolName[]> = {
  start_campaign: [
    'generate_announcement',
    'crawl_naver_images',
    'crawl_naver_price',
    'generate_price_emphasis_text',
    'compose_poster',
  ],
  close_orders: ['get_orders', 'generate_pickup_table'],
  notify_warehouse: ['get_orders', 'notify_wholesaler'],
  announce_pickup: ['generate_announcement'],
  urgent_alert: ['generate_announcement'],
}

export const ALL_ACTIONS: readonly ActionName[] = [
  ...(Object.keys(ACTION_CHAIN) as StaticChainAction[]),
  'free_text',
]

// =====================================================
// runAgent — fire-and-forget entry
// =====================================================

export interface RunAgentInput {
  traceId: string
  storeId: string
  action: ActionName
  productId?: string | null
  productIds?: string[]
  userId?: string | null
  /** free_text 액션의 사용자 자연어 입력. Phase D 에서 Claude 에 전달. */
  message?: string
}

export interface RunAgentResult {
  traceId: string
  completed: boolean
  failedToolName: ToolName | null
}

const FREE_TEXT_PLACEHOLDER = 'Phase D에서 활성화됩니다'

export async function runAgent(input: RunAgentInput): Promise<RunAgentResult> {
  const {
    traceId,
    storeId,
    action,
    productId = null,
    productIds,
    userId = null,
    message,
  } = input

  const supabase = createServiceClient()

  // free_text: 정적 chain 아님 → mock 단일 step + trace 완료.
  // Phase D 에서 Claude dynamic tool_use loop 로 교체.
  if (action === 'free_text') {
    const startedAt = new Date()
    await persistStep(supabase, {
      traceId,
      stepOrder: 1,
      toolName: 'free_text',
      status: 'done',
      input: {
        storeId,
        ...(productId ? { productId } : {}),
        ...(message ? { message } : {}),
      },
      output: { message: FREE_TEXT_PLACEHOLDER },
      summary: FREE_TEXT_PLACEHOLDER,
      startedAt,
      completedAt: new Date(),
      durationMs: 0,
    })
    await supabase
      .from('agent_traces')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', traceId)
    return { traceId, completed: true, failedToolName: null }
  }

  const chain = ACTION_CHAIN[action]
  if (!chain) {
    // ActionName 타입으로 막혀 있지만 런타임 방어.
    await markTraceFailed(supabase, traceId, `Unknown action: ${action}`)
    return { traceId, completed: false, failedToolName: null }
  }

  const ctx: ToolContext = {
    traceId,
    storeId,
    productId,
    userId,
  }

  for (let i = 0; i < chain.length; i++) {
    const toolName = chain[i]
    const handler = TOOL_REGISTRY[toolName]
    const stepOrder = i + 1

    const toolInput: Record<string, unknown> = {
      storeId,
      ...(productId ? { productId } : {}),
      ...(productIds ? { productIds } : {}),
      ...(toolName === 'generate_announcement'
        ? { stage: stageForAction(action) }
        : {}),
    }

    const startedAt = new Date()
    const runStart = performance.now()

    if (!handler) {
      // 등록 안 된 tool — chain 중단.
      await persistStep(supabase, {
        traceId,
        stepOrder,
        toolName,
        status: 'error',
        input: toolInput,
        output: { error: `No handler for ${toolName}` },
        summary: `등록되지 않은 tool: ${toolName}`,
        startedAt,
        completedAt: new Date(),
        durationMs: 0,
      })
      await markTraceFailed(supabase, traceId, `No handler: ${toolName}`)
      return { traceId, completed: false, failedToolName: toolName }
    }

    try {
      const output = await handler(toolInput, ctx)
      const durationMs = Math.round(performance.now() - runStart)

      await persistStep(supabase, {
        traceId,
        stepOrder,
        toolName,
        status: 'done',
        input: toolInput,
        output: output as Record<string, unknown>,
        summary: summarize(toolName, output),
        startedAt,
        completedAt: new Date(),
        durationMs,
      })
    } catch (err) {
      const durationMs = Math.round(performance.now() - runStart)
      const message = err instanceof Error ? err.message : String(err)

      await persistStep(supabase, {
        traceId,
        stepOrder,
        toolName,
        status: 'error',
        input: toolInput,
        output: { error: message },
        summary: `오류: ${message}`,
        startedAt,
        completedAt: new Date(),
        durationMs,
      })

      // A3: chain 실패 → 즉시 중단.
      await markTraceFailed(supabase, traceId, `${toolName}: ${message}`)
      return { traceId, completed: false, failedToolName: toolName }
    }
  }

  // 모든 tool 성공 → trace completed.
  await supabase
    .from('agent_traces')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
    })
    .eq('id', traceId)

  return { traceId, completed: true, failedToolName: null }
}

// =====================================================
// Helpers
// =====================================================

interface PersistStepArgs {
  traceId: string
  stepOrder: number
  /** 'free_text' 는 ToolName 이 아니지만 trace_steps.tool_name 자리 표시자. */
  toolName: ToolName | 'free_text'
  status: 'done' | 'error'
  input: Record<string, unknown> | null
  output: Record<string, unknown> | null
  summary: string | null
  startedAt: Date
  completedAt: Date
  durationMs: number
}

async function persistStep(
  supabase: ReturnType<typeof createServiceClient>,
  args: PersistStepArgs,
): Promise<void> {
  // store_id 는 trace_steps 에 없음 — agent_traces.store_id 로 RLS 적용 (PRD §4.7).
  await supabase.from('trace_steps').insert({
    trace_id: args.traceId,
    step_order: args.stepOrder,
    tool_name: args.toolName,
    status: args.status,
    input: args.input,
    output: args.output,
    summary: args.summary,
    started_at: args.startedAt.toISOString(),
    completed_at: args.completedAt.toISOString(),
    duration_ms: args.durationMs,
  })
}

async function markTraceFailed(
  supabase: ReturnType<typeof createServiceClient>,
  traceId: string,
  errorMessage: string,
): Promise<void> {
  await supabase
    .from('agent_traces')
    .update({
      status: 'failed',
      error_message: errorMessage,
      completed_at: new Date().toISOString(),
    })
    .eq('id', traceId)
}

function stageForAction(action: StaticChainAction): 1 | 2 | 3 {
  // PRD §7.13: start_campaign → stage 1, urgent_alert → 2, announce_pickup → 3.
  if (action === 'urgent_alert') return 2
  if (action === 'announce_pickup') return 3
  return 1
}

function summarize(toolName: ToolName, output: unknown): string {
  if (!output || typeof output !== 'object') return `${toolName} 완료`
  const o = output as Record<string, unknown>
  if (typeof o.message === 'string') return o.message
  return `${toolName} 완료`
}
