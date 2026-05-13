/**
 * Agent Orchestrator
 * 
 * 출처 패턴: Versatile Execution Agent의 sendMessageToAgentStream (Gemini)
 * 우리 변경:
 *   1. Gemini → Anthropic Claude SDK
 *   2. MOCK_DB → Supabase
 *   3. 클라이언트 콜백 → Supabase Realtime + 서버 SSE
 *   4. 추가: trace persistence (agent_traces, trace_steps 테이블)
 * 
 * 호출 위치: apps/dashboard/app/api/agent/run/route.ts
 */

import Anthropic from '@anthropic-ai/sdk'
import { TOOLS } from './tools'
import { 
  generateAnnouncement,
  crawlNaverPrice,
  composePoster,
  generatePickupTable,
  getOrders,
  notifyWholesaler,
} from './tools'
import { createServiceClient } from '@onword/db'
import type {
  ChatMessage,
  AgentStep,
  StreamUpdate,
  ToolName,
  ActionName,
} from '@onword/types'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export const MODEL = 'claude-sonnet-4-20250514'
const MAX_TOKENS = 4096
const MAX_TURNS = 8  // tool_use 루프 안전장치

// ==========================
// System Prompt
// ==========================

const SYSTEM_PROMPT = `당신은 한국 오프라인 매장의 공동구매(공구) 운영을 자동화하는 AI 비서입니다.

## 핵심 역할
1. 상품 발주 → 오픈채팅 공고 자동 생성
2. 네이버 가격비교 자동 크롤링
3. 그룹채팅용 포스터 합성
4. 도매업자에게 주문 자동 통지
5. 수령 안내 자동 생성
6. 매장 관리자의 자연어 명령에 따라 적절한 도구를 *순서대로* 실행

## 행동 원칙

### 도구 사용
- 사용자가 "상품 등록 캠페인 시작" 같은 액션을 요청하면 *여러 도구를 순서대로* 자동 호출:
  start_campaign = generate_announcement(1) → crawl_naver_price → compose_poster
- 도구 호출 *전에* 무엇을 하는지 한국어로 한 줄 알림 ("공고 텍스트 생성 중...")
- 도구 호출 *후에* 결과를 간단히 요약

### 데이터 정직성 (절대 규칙)
- 도구가 빈 결과를 반환하면 *추측으로 채우지 말 것*.
- "네이버 크롤링 실패. 직접 확인 부탁드립니다." 처럼 명확히 보고.
- 가격, 수량, 날짜를 *지어내지* 않음.

### 한국어 응답
- 모든 사용자 응답은 한국어로.
- 카카오톡 공고 텍스트는 AI_DOCS/kakao-text-format.md 표준을 정확히 따름.
- 시니어층 친화적 표현 (전문 용어 피하기).

### 효율
- 사용자가 "공고 만들어" 같은 모호한 요청을 하면, 컨텍스트(최근 등록 상품)를 보고 자동 추론. 가능하면 되묻지 않음.
- 정말 모호하면 *하나만* 되묻기 ("어떤 상품에 대한 공고일까요?").
- 도구 결과를 자세히 출력하지 말 것. *대시보드의 Execution Trace*가 이미 보여줌.

### 안전
- products 테이블의 status를 'cancelled'로 바꾸는 것 같은 *되돌리기 힘든 작업*은 명시적 확인 받기.
- 도매업자 이메일 발송 같은 외부 통신은 한 번 더 확인.
`

// ==========================
// Tool Handler Map
// ==========================

const TOOL_HANDLERS: Record<ToolName, (input: any) => Promise<unknown>> = {
  generate_announcement: generateAnnouncement,
  crawl_naver_price: crawlNaverPrice,
  compose_poster: composePoster,
  generate_pickup_table: generatePickupTable,
  get_orders: getOrders,
  notify_wholesaler: notifyWholesaler,
}

// ==========================
// Main Orchestrator
// ==========================

export interface RunAgentOptions {
  /** 사용자 메시지 (자연어) 또는 사전 정의된 action */
  message?: string
  action?: ActionName
  /** 액션이 특정 상품 대상이면 productId */
  productId?: string
  /** 이전 대화 컨텍스트 */
  history: ChatMessage[]
  /** 매 업데이트 시 호출 (SSE 전송용) */
  onUpdate: (update: StreamUpdate) => void
}

export async function runAgent(opts: RunAgentOptions): Promise<{ traceId: string }> {
  const { message, action, productId, history, onUpdate } = opts
  const supabase = createServiceClient()
  
  // 1. agent_traces에 시작 기록
  const { data: trace, error: traceErr } = await supabase
    .from('agent_traces')
    .insert({
      product_id: productId ?? null,
      action: action ?? 'chat',
      status: 'running',
    })
    .select()
    .single()
  
  if (traceErr || !trace) {
    throw new Error(`Failed to create trace: ${traceErr?.message}`)
  }
  
  const traceId = trace.id
  
  // 2. 메시지 구성 (action이면 system이 적절한 명령을 생성)
  const userMessage = message ?? buildActionPrompt(action!, productId)
  
  const messages: Anthropic.MessageParam[] = [
    ...history.map(toAnthropicMessage),
    { role: 'user', content: userMessage },
  ]
  
  let currentHistory: ChatMessage[] = [
    ...history,
    { role: 'user', content: userMessage, timestamp: new Date().toISOString() },
  ]
  
  const steps: AgentStep[] = []
  let finalText = ''
  let stepOrder = 0
  
  const notify = (isDone = false) => {
    onUpdate({
      history: currentHistory,
      steps: [...steps],
      isDone,
      currentText: finalText,
      traceId,
    })
  }
  
  try {
    // 3. Tool use 루프 (레퍼런스의 while 패턴 차용)
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const turnStart = performance.now()
      
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        tools: TOOLS,
        messages,
      })
      
      const turnLatency = performance.now() - turnStart
      
      // 응답의 text/tool_use 분리
      const textBlocks = response.content.filter(b => b.type === 'text') as Array<{ type: 'text'; text: string }>
      const toolUses = response.content.filter(b => b.type === 'tool_use') as Array<{
        type: 'tool_use'
        id: string
        name: string
        input: Record<string, unknown>
      }>
      
      // text가 있으면 AgentStep 추가
      if (textBlocks.length > 0) {
        const textContent = textBlocks.map(b => b.text).join('\n')
        finalText += textContent
        
        const textStep: AgentStep = {
          id: `step-${stepOrder++}`,
          type: 'text',
          content: textContent,
          status: 'completed',
          latencyMs: turnLatency,
        }
        steps.push(textStep)
        
        await persistStep(supabase, traceId, textStep, stepOrder)
        notify(false)
      }
      
      // tool 호출 없으면 종료
      if (toolUses.length === 0 || response.stop_reason === 'end_turn') {
        break
      }
      
      // assistant 메시지를 history에 추가 (Anthropic이 요구)
      messages.push({ role: 'assistant', content: response.content })
      
      // 각 tool 실행
      const toolResults: Anthropic.ToolResultBlockParam[] = []
      
      for (const toolUse of toolUses) {
        const toolStart = performance.now()
        
        const toolStep: AgentStep = {
          id: toolUse.id,
          type: 'tool',
          toolName: toolUse.name as ToolName,
          toolArgs: toolUse.input,
          status: 'streaming',
        }
        steps.push(toolStep)
        notify(false)
        
        const handler = TOOL_HANDLERS[toolUse.name as ToolName]
        let result: unknown
        let resultMessage: string
        let success = true
        
        if (!handler) {
          result = { error: `Unknown tool: ${toolUse.name}` }
          resultMessage = `알 수 없는 도구: ${toolUse.name}`
          success = false
        } else {
          try {
            result = await handler({
              ...toolUse.input,
              _traceId: traceId,  // tool이 generated_assets에 trace_step_id 기록할 수 있게
            })
            resultMessage = summarizeToolResult(toolUse.name as ToolName, result)
          } catch (err) {
            result = { error: err instanceof Error ? err.message : String(err) }
            resultMessage = `오류: ${err instanceof Error ? err.message : String(err)}`
            success = false
          }
        }
        
        const toolLatency = performance.now() - toolStart
        
        // step 업데이트
        toolStep.result = { success, message: resultMessage, data: result }
        toolStep.status = success ? 'completed' : 'error'
        toolStep.latencyMs = toolLatency
        
        await persistStep(supabase, traceId, toolStep, stepOrder++)
        notify(false)
        
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: JSON.stringify(result),
          is_error: !success,
        })
      }
      
      // tool 결과를 다음 turn 메시지로
      messages.push({ role: 'user', content: toolResults })
    }
    
    // 최종 assistant 메시지 history에 저장
    if (finalText) {
      currentHistory.push({
        role: 'assistant',
        content: finalText,
        timestamp: new Date().toISOString(),
      })
    }
    
    // trace 완료
    await supabase
      .from('agent_traces')
      .update({
        status: 'completed',
        summary: finalText.slice(0, 200),
        completed_at: new Date().toISOString(),
      })
      .eq('id', traceId)
    
    notify(true)
    return { traceId }
    
  } catch (err) {
    // trace 실패
    await supabase
      .from('agent_traces')
      .update({
        status: 'failed',
        error_message: err instanceof Error ? err.message : String(err),
        completed_at: new Date().toISOString(),
      })
      .eq('id', traceId)
    
    notify(true)
    throw err
  }
}

// ==========================
// Helpers
// ==========================

function toAnthropicMessage(m: ChatMessage): Anthropic.MessageParam {
  // system 메시지는 별도 처리되므로 user/assistant만 통과
  if (m.role === 'system') {
    return { role: 'user', content: typeof m.content === 'string' ? m.content : '' }
  }
  return {
    role: m.role,
    content: typeof m.content === 'string' ? m.content : (m.content as any),
  }
}

function buildActionPrompt(action: ActionName, productId?: string): string {
  const prompts: Record<ActionName, string> = {
    start_campaign: `상품 ID ${productId}의 모집 캠페인을 시작해줘. 순서대로:
1. generate_announcement(stage=1)로 공고 텍스트 생성
2. crawl_naver_price로 네이버 가격비교 자동 수집
3. compose_poster로 포스터 합성`,
    close_orders: `상품 ID ${productId}의 주문을 마감하고 정리해줘:
1. get_orders(includeAnomalies=true)로 누락/이상 검수
2. generate_pickup_table로 수령 안내 테이블 생성`,
    notify_warehouse: `상품 ID ${productId}의 주문을 도매업자에게 전달해줘:
1. get_orders로 주문 집계
2. notify_wholesaler(method=email)로 이메일 전송`,
    announce_pickup: `오늘 수령 가능한 모든 상품에 대해 안내 공고를 만들어줘:
1. generate_announcement(stage=3) 호출`,
  }
  return prompts[action]
}

async function persistStep(
  supabase: ReturnType<typeof createServiceClient>,
  traceId: string,
  step: AgentStep,
  stepOrder: number
): Promise<void> {
  await supabase.from('trace_steps').upsert({
    id: step.id,
    trace_id: traceId,
    step_order: stepOrder,
    tool_name: step.toolName ?? 'thinking',
    status: step.status,
    input: step.toolArgs ?? null,
    output: step.result ? (step.result as any) : null,
    summary: step.result?.message ?? step.content?.slice(0, 200) ?? null,
    started_at: new Date(Date.now() - (step.latencyMs ?? 0)).toISOString(),
    completed_at: step.status === 'completed' || step.status === 'error' 
      ? new Date().toISOString() 
      : null,
    duration_ms: step.latencyMs ? Math.round(step.latencyMs) : null,
  })
}

function summarizeToolResult(toolName: ToolName, result: unknown): string {
  if (!result || typeof result !== 'object') return '완료'
  
  const r = result as Record<string, unknown>
  
  switch (toolName) {
    case 'generate_announcement':
      return r.content 
        ? `공고 텍스트 생성 완료 (${String(r.content).length}자)`
        : '공고 생성됨'
    case 'crawl_naver_price':
      return r.data 
        ? `네이버 가격비교 수집 완료`
        : '네이버 크롤링 실패'
    case 'compose_poster':
      return r.posterUrl 
        ? '포스터 합성 완료'
        : '포스터 생성됨'
    case 'get_orders':
      return r.totalQuantity 
        ? `주문 ${(r.orders as any[])?.length ?? 0}건 (총 ${r.totalQuantity}개)`
        : '주문 0건'
    case 'notify_wholesaler':
      return r.sent ? `도매업자 이메일 전송 완료` : '전송 실패'
    case 'generate_pickup_table':
      return r.imageUrl ? '수령 안내 테이블 생성' : '생성됨'
    default:
      return '완료'
  }
}
