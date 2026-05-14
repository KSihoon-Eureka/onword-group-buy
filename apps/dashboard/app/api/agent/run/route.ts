/**
 * POST /api/agent/run
 *
 * Phase C.5 — Orchestrator entry. (W5와 합의된 contract.)
 *
 * 흐름:
 *   1. body 파싱 + 검증 → invalid 시 400.
 *   2. 인증 확인 (Supabase Auth cookie) → 미인증 401.
 *   3. store_members 멤버십 확인 (cross-store leak 차단) → 비멤버 403.
 *   4. agent_traces row INSERT (status='running').
 *   5. 백그라운드로 orchestrator 실행 (fire-and-forget). 클라이언트는 Supabase
 *      Realtime 으로 trace_steps 구독 (PRD §4.16, §15.3).
 *   6. 200 { traceId, status: 'started' } 즉시 응답.
 *
 * 미들웨어 미적용: `/api/*` 는 middleware matcher 에서 제외 (apps/dashboard/middleware.ts).
 * 따라서 본 route 가 직접 auth 검증.
 */

import { NextResponse } from 'next/server'
import { runAgent, ALL_ACTIONS } from '@onword/agent/orchestrator'
import { createServiceClient } from '@onword/db'
import type { ActionName } from '@onword/types'
import { getServerSupabase } from '../../../../lib/supabase/server'
import { isUserStoreMember } from '../../../../lib/auth/store-membership'

export const runtime = 'nodejs'
export const maxDuration = 60

interface ValidBody {
  storeId: string
  action: ActionName
  productId: string | null
  productIds: string[] | null
  message: string | null
}

type ParsedBody =
  | { ok: true; value: ValidBody }
  | { ok: false }

const VALID_ACTIONS: Set<string> = new Set(ALL_ACTIONS)

function parseBody(raw: unknown): ParsedBody {
  if (!raw || typeof raw !== 'object') return { ok: false }
  const body = raw as Record<string, unknown>

  const storeId = body.storeId
  const action = body.action
  if (typeof storeId !== 'string' || storeId.length === 0) return { ok: false }
  if (typeof action !== 'string' || !VALID_ACTIONS.has(action)) return { ok: false }

  let productId: string | null = null
  if ('productId' in body && body.productId !== undefined && body.productId !== null) {
    if (typeof body.productId !== 'string' || body.productId.length === 0) return { ok: false }
    productId = body.productId
  }

  let productIds: string[] | null = null
  if ('productIds' in body && body.productIds !== undefined && body.productIds !== null) {
    if (
      !Array.isArray(body.productIds) ||
      body.productIds.some((p) => typeof p !== 'string' || p.length === 0)
    ) {
      return { ok: false }
    }
    productIds = body.productIds as string[]
  }

  let message: string | null = null
  if ('message' in body && body.message !== undefined && body.message !== null) {
    if (typeof body.message !== 'string') return { ok: false }
    message = body.message
  }

  return {
    ok: true,
    value: {
      storeId,
      action: action as ActionName,
      productId,
      productIds,
      message,
    },
  }
}

export async function POST(req: Request) {
  // 1. body 파싱
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 })
  }

  const parsed = parseBody(raw)
  if (!parsed.ok) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 })
  }
  const body = parsed.value

  // 2. 인증
  const supabase = getServerSupabase()
  const { data: userData, error: userErr } = await supabase.auth.getUser()
  if (userErr || !userData?.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }
  const user = userData.user

  // 3. 멤버십
  const isMember = await isUserStoreMember(supabase, user.id, body.storeId)
  if (!isMember) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  // 4. agent_traces INSERT
  // PRD §5.5: service role 허용 — 멤버십을 코드로 이미 검증했고 store_id 명시.
  // (@supabase/ssr 0.5.2 ↔ supabase-js 2.105 typing 호환성 이슈로 ssr 클라이언트의
  //  .insert() 가 never 로 추론됨 — read 는 정상. write 는 service client 사용.)
  const service = createServiceClient()
  const { data: trace, error: traceErr } = await service
    .from('agent_traces')
    .insert({
      store_id: body.storeId,
      product_id: body.productId,
      user_id: user.id,
      action: body.action,
      status: 'running',
    })
    .select('id')
    .single()

  if (traceErr || !trace) {
    return NextResponse.json({ error: 'trace_insert_failed' }, { status: 500 })
  }
  const traceId = (trace as { id: string }).id

  // 5. Orchestrator fire-and-forget — 백그라운드로 실행.
  // 실패 시 orchestrator 가 agent_traces.status='failed' 마킹 + console.error.
  void runAgent({
    traceId,
    storeId: body.storeId,
    action: body.action,
    productId: body.productId,
    productIds: body.productIds ?? undefined,
    userId: user.id,
    message: body.message ?? undefined,
  }).catch((err) => {
    console.error('[api/agent/run] orchestrator failed:', err)
  })

  // 6. 즉시 응답.
  return NextResponse.json({ traceId, status: 'started' }, { status: 200 })
}
