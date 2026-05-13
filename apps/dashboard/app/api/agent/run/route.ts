import { runAgent } from '@onword/agent/orchestrator'
import type { RunAgentActionInput, StreamUpdate } from '@onword/types'

/**
 * POST /api/agent/run
 * 
 * 에이전트 실행 시작. SSE로 진행 상황 스트리밍.
 * 
 * Request body:
 *   { message: string, history: ChatMessage[] } — 자연어 채팅
 *   OR
 *   { productId: string, action: ActionName } — 사전 정의 액션 (start_campaign 등)
 * 
 * Response: text/event-stream
 *   data: { history, steps, currentText, isDone, traceId }
 *   ...
 * 
 * 또는 클라이언트가 SSE 대신 Supabase Realtime을 사용할 수 있음 — 그 경우 이 route는
 * traceId만 즉시 반환하고 background에서 실행.
 * 
 * 이번 구현: SSE (클라이언트가 즉각적 응답을 받게)
 */

export const runtime = 'nodejs'           // Playwright/Sharp 위해 nodejs 필수
export const maxDuration = 60             // Vercel Pro 기준

export async function POST(req: Request) {
  let body: any
  try {
    body = await req.json()
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }
  
  const { message, history = [], productId, action } = body
  
  if (!message && !action) {
    return new Response('Missing message or action', { status: 400 })
  }
  
  // SSE stream
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: StreamUpdate) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
        )
      }
      
      try {
        await runAgent({
          message,
          action,
          productId,
          history,
          onUpdate: send,
        })
      } catch (err) {
        controller.enqueue(
          encoder.encode(
            `event: error\ndata: ${JSON.stringify({
              error: err instanceof Error ? err.message : String(err),
            })}\n\n`
          )
        )
      } finally {
        controller.close()
      }
    },
  })
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
