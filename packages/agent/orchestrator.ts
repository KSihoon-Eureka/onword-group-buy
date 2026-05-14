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
import { TOOL_REGISTRY, TOOL_SCHEMAS, type ToolContext } from './tools/index'

// =====================================================
// Anthropic SDK (lazy)
// =====================================================
// Module-level 인스턴스는 import 시 환경변수 부재로 throw 하지 않도록 lazy.
// 본 워커는 호출하지 않지만 Phase D 가 사용.

// generate-announcement.ts 와 동일 모델 (검증된 작동).
export const MODEL = 'claude-sonnet-4-20250514'
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
  // 공고와 포스터는 각각 분리 실행 (UX 요구, 2026-05-15).
  // 네이버 크롤 2개 + generate_price_emphasis_text 는 UI 숨김 (Phase F+).
  start_campaign: ['generate_announcement'],
  compose_poster: ['compose_poster'],
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
  /** free_text action 의 경우 Claude 가 생성한 최종 답변 텍스트. */
  finalMessage?: string
}

const DYNAMIC_MAX_ITERATIONS = 6

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

  // 진단: 환경변수 가시성 (값 자체는 출력 X, 존재/길이만).
  console.log('[orchestrator] env check:', {
    hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
    anthropicKeyLength: process.env.ANTHROPIC_API_KEY?.length ?? 0,
    anthropicKeyPrefix: process.env.ANTHROPIC_API_KEY?.slice(0, 7) ?? null,
    hasResendKey: !!process.env.RESEND_API_KEY,
    nodeEnv: process.env.NODE_ENV,
  })

  const supabase = createServiceClient()

  // free_text: Claude dynamic tool_use loop.
  // 사용자 자연어 → Claude 가 tool 선택해서 호출 → 최종 답변 생성.
  if (action === 'free_text') {
    try {
      const finalMessage = await runDynamicAgent({
        traceId,
        storeId,
        productId,
        userId,
        message: message ?? '',
      })
      await supabase
        .from('agent_traces')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
        })
        .eq('id', traceId)
      return { traceId, completed: true, failedToolName: null, finalMessage }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      await markTraceFailed(supabase, traceId, `free_text: ${errMsg}`)
      return { traceId, completed: false, failedToolName: null }
    }
  }

  const chain = ACTION_CHAIN[action]
  if (!chain) {
    // ActionName 타입으로 막혀 있지만 런타임 방어.
    await markTraceFailed(supabase, traceId, `Unknown action: ${action}`)
    return { traceId, completed: false, failedToolName: null }
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

    // 1. trace_step INSERT 먼저 (status='running') — tool 이 자산 저장 시 FK 로 쓸 수 있게.
    const stepId = await insertRunningStep(supabase, {
      traceId,
      stepOrder,
      toolName,
      input: toolInput,
      startedAt,
    })

    const ctx: ToolContext = {
      traceId,
      traceStepId: stepId,
      storeId,
      productId,
      userId,
    }

    if (!handler) {
      // 등록 안 된 tool — chain 중단.
      await updateStep(supabase, stepId, {
        status: 'error',
        output: { error: `No handler for ${toolName}` },
        summary: `등록되지 않은 tool: ${toolName}`,
        completedAt: new Date(),
        durationMs: 0,
      })
      await markTraceFailed(supabase, traceId, `No handler: ${toolName}`)
      return { traceId, completed: false, failedToolName: toolName }
    }

    try {
      const output = await handler(toolInput, ctx)
      const durationMs = Math.round(performance.now() - runStart)

      await updateStep(supabase, stepId, {
        status: 'done',
        output: output as Record<string, unknown>,
        summary: summarize(toolName, output),
        completedAt: new Date(),
        durationMs,
      })
    } catch (err) {
      const durationMs = Math.round(performance.now() - runStart)
      const message = err instanceof Error ? err.message : String(err)

      await updateStep(supabase, stepId, {
        status: 'error',
        output: { error: message },
        summary: `오류: ${message}`,
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
// Dynamic agent — free_text Claude tool_use loop
// =====================================================

interface RunDynamicAgentArgs {
  traceId: string
  storeId: string
  productId: string | null
  userId: string | null
  message: string
}

const DYNAMIC_SYSTEM_PROMPT = `당신은 한국 오프라인 매장 공동구매 운영 자동화 AI 비서입니다.
사장님의 자연어 요청을 받아 적절한 tool 을 호출해 처리합니다.

가능한 작업:
- 카카오톡 공고 텍스트 생성 (generate_announcement)
- 수령일 비교 테이블 생성 (generate_pickup_table)
- 주문 내역 조회 (get_orders)
- 포스터 합성 (compose_poster)

가이드:
- 사용자 요청을 정확히 이해하고 적절한 tool 을 선택하세요.
- 정보가 부족하면 추측하지 말고 어떤 정보가 필요한지 사용자에게 물어보세요.
- tool 결과를 한국어로 친절히 요약하세요.
- 자산 (공고/포스터/테이블) 이 생성되면 "자산이 생성되었습니다" 라고 알려주세요.
- 실패 시 원인을 짧게 설명하세요.

존댓말로 답변하세요.`

/**
 * Claude dynamic tool_use loop.
 * 사용자 메시지 → Claude 가 tool 선택 → tool 실행 → 결과 → 최종 답변.
 * trace_steps 에 모든 tool call 기록.
 *
 * Loop 시작 전 매장 컨텍스트 (상품 목록 + 최근 자산) 를 system prompt 에 주입.
 * → Claude 가 list_products tool 없이도 상품 ID 알고 사용자 자연어 매핑 가능.
 */
async function runDynamicAgent(args: RunDynamicAgentArgs): Promise<string> {
  const anthropic = getAnthropic()
  const supabase = createServiceClient()

  // 매장 컨텍스트 미리 조회 (Claude 에 system 으로 주입).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const productsBuilder: any = supabase
    .from('products')
    .select(
      'id, name, price, order_deadline, pickup_date, flow_stage, ordered_quantity, stock_quantity',
    )
  const { data: productsData } = (await productsBuilder
    .eq('store_id', args.storeId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(20)) as {
    data: Array<{
      id: string
      name: string
      price: number
      order_deadline: string
      pickup_date: string
      flow_stage: string
      ordered_quantity: number | null
      stock_quantity: number
    }> | null
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const assetsBuilder: any = supabase
    .from('generated_assets')
    .select('id, type, product_id, created_at')
  const { data: assetsData } = (await assetsBuilder
    .eq('store_id', args.storeId)
    .is('superseded_at', null)
    .order('created_at', { ascending: false })
    .limit(10)) as {
    data: Array<{
      id: string
      type: string
      product_id: string | null
      created_at: string
    }> | null
  }

  const productList = (productsData ?? [])
    .map(
      (p) =>
        `- id=${p.id} | "${p.name}" | ${p.price.toLocaleString('ko-KR')}원 | 마감 ${p.order_deadline} | 픽업 ${p.pickup_date} | 주문 ${p.ordered_quantity ?? 0}/${p.stock_quantity}`,
    )
    .join('\n')

  const assetList = (assetsData ?? [])
    .map(
      (a) =>
        `- id=${a.id} | type=${a.type} | productId=${a.product_id ?? 'null'} | ${a.created_at}`,
    )
    .join('\n')

  const systemPrompt = `${DYNAMIC_SYSTEM_PROMPT}

현재 매장 컨텍스트:
- storeId: ${args.storeId}${args.productId ? `\n- 사용자 현재 보고 있는 상품: ${args.productId}` : ''}

활성 상품 목록 (최근 20개, 없으면 빈 줄):
${productList || '(상품 없음)'}

최근 생성된 자산 (10개, superseded 제외):
${assetList || '(자산 없음)'}

지침:
- 위 목록의 id 를 사용해 tool 을 호출하세요. 사용자가 상품명으로 부르면 위 목록에서 id 를 찾으세요.
- 상품이 여러 개고 모호하면 사용자에게 어느 상품인지 명확히 묻기.
- 자산 목록은 *참고용* (재생성 여부 판단). 자산을 다시 보여달라 하면 \`/assets\` 페이지 안내.
- 자산을 새로 생성하면 자산 페이지 (/assets) 에서 확인 가능하다고 알리기.`

  const conversationMessages: Anthropic.MessageParam[] = [
    { role: 'user', content: args.message },
  ]

  let stepOrder = 0

  for (let iteration = 0; iteration < DYNAMIC_MAX_ITERATIONS; iteration++) {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      tools: TOOL_SCHEMAS,
      messages: conversationMessages,
    })

    conversationMessages.push({
      role: 'assistant',
      content: response.content,
    })

    if (response.stop_reason === 'end_turn' || response.stop_reason === 'max_tokens') {
      const textBlocks = response.content.filter(
        (b): b is Anthropic.TextBlock => b.type === 'text',
      )
      const finalText = textBlocks.map((b) => b.text).join('\n').trim()
      return finalText || '응답을 생성하지 못했습니다.'
    }

    if (response.stop_reason !== 'tool_use') {
      return '응답을 생성하지 못했습니다.'
    }

    // tool_use blocks 실행
    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
    )

    const toolResults: Anthropic.ToolResultBlockParam[] = []

    for (const block of toolUseBlocks) {
      stepOrder += 1
      const toolName = block.name as ToolName
      const handler = TOOL_REGISTRY[toolName]
      const startedAt = new Date()
      const runStart = performance.now()

      // step INSERT (running)
      let stepId: string
      try {
        stepId = await insertRunningStep(supabase, {
          traceId: args.traceId,
          stepOrder,
          toolName,
          input: block.input as Record<string, unknown>,
          startedAt,
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: `Internal error: failed to record step (${msg})`,
          is_error: true,
        })
        continue
      }

      if (!handler) {
        await updateStep(supabase, stepId, {
          status: 'error',
          output: { error: `No handler for ${toolName}` },
          summary: `등록되지 않은 tool: ${toolName}`,
          completedAt: new Date(),
          durationMs: 0,
        })
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: `Tool ${toolName} is not available.`,
          is_error: true,
        })
        continue
      }

      const ctx: ToolContext = {
        traceId: args.traceId,
        traceStepId: stepId,
        storeId: args.storeId,
        productId: args.productId,
        userId: args.userId,
      }

      try {
        const output = await handler(block.input as Record<string, unknown>, ctx)
        const durationMs = Math.round(performance.now() - runStart)
        await updateStep(supabase, stepId, {
          status: 'done',
          output: output as Record<string, unknown>,
          summary: summarize(toolName, output),
          completedAt: new Date(),
          durationMs,
        })
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(output),
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        const durationMs = Math.round(performance.now() - runStart)
        await updateStep(supabase, stepId, {
          status: 'error',
          output: { error: message },
          summary: `오류: ${message}`,
          completedAt: new Date(),
          durationMs,
        })
        // tool 실패해도 loop 계속 — Claude 가 user 에게 친절히 설명 가능.
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: `Error: ${message}`,
          is_error: true,
        })
      }
    }

    conversationMessages.push({
      role: 'user',
      content: toolResults,
    })
  }

  return `${DYNAMIC_MAX_ITERATIONS}회 시도 후에도 답변을 완성하지 못했습니다. 더 구체적으로 요청해주세요.`
}

// =====================================================
// Helpers
// =====================================================

interface InsertRunningStepArgs {
  traceId: string
  stepOrder: number
  toolName: ToolName
  input: Record<string, unknown> | null
  startedAt: Date
}

/**
 * trace_step INSERT (status='running') 후 step.id 반환.
 * tool 호출 *전* 에 호출 — tool 이 자산 저장 시 trace_step_id FK 로 쓸 수 있게.
 */
async function insertRunningStep(
  supabase: ReturnType<typeof createServiceClient>,
  args: InsertRunningStepArgs,
): Promise<string> {
  const { data, error } = (await supabase
    .from('trace_steps')
    .insert({
      trace_id: args.traceId,
      step_order: args.stepOrder,
      tool_name: args.toolName,
      status: 'running',
      input: args.input,
      started_at: args.startedAt.toISOString(),
    } as never)
    .select('id')
    .single()) as { data: { id: string } | null; error: { message: string } | null }

  if (error || !data) {
    throw new Error(`Failed to insert running step: ${error?.message ?? 'no data'}`)
  }
  return data.id
}

interface UpdateStepArgs {
  status: 'done' | 'error'
  output: Record<string, unknown> | null
  summary: string | null
  completedAt: Date
  durationMs: number
}

async function updateStep(
  supabase: ReturnType<typeof createServiceClient>,
  stepId: string,
  args: UpdateStepArgs,
): Promise<void> {
  await supabase
    .from('trace_steps')
    .update({
      status: args.status,
      output: args.output,
      summary: args.summary,
      completed_at: args.completedAt.toISOString(),
      duration_ms: args.durationMs,
    })
    .eq('id', stepId)
}

async function markTraceFailed(
  supabase: ReturnType<typeof createServiceClient>,
  traceId: string,
  errorMessage: string,
): Promise<void> {
  // 운영상 중요 신호 — agent 실패는 silent 하면 디버깅 불가.
  console.error('[orchestrator] trace_failed:', { traceId, errorMessage })
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
