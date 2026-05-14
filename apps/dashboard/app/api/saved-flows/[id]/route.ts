/**
 * /api/saved-flows/[id] — PRD §15.1, §14.
 *
 * PATCH   partial 수정 (name / prompt / icon / displayOrder).
 * DELETE  hard delete (PRD §14.3).
 *
 * 가드:
 *   - 미인증 → 401
 *   - active_store_id 쿠키 없거나 멤버 아님 → 403
 *   - id 유효하지 않거나 (PATCH) 입력 검증 실패 → 400
 *   - 해당 flow 없음 (또는 RLS로 가려짐) → 403 forbidden (정보 누출 방지)
 */

import { NextResponse, type NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { getServerSupabase } from '@/lib/supabase/server'
import { ACTIVE_STORE_COOKIE } from '@/lib/supabase/middleware'
import { rowToSavedFlow, type SavedFlowRow } from '@/lib/saved-flows/serialize'
import { isValidId, parseUpdateInput } from '@/lib/saved-flows/validate'

export const runtime = 'nodejs'

interface RouteContext {
  params: { id: string }
}

async function authorize(supabase: ReturnType<typeof getServerSupabase>) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false as const, response: NextResponse.json({ error: 'unauthenticated' }, { status: 401 }) }
  }

  const storeId = cookies().get(ACTIVE_STORE_COOKIE)?.value
  if (!storeId) {
    return { ok: false as const, response: NextResponse.json({ error: 'forbidden' }, { status: 403 }) }
  }

  const { data: membership, error: memberErr } = await supabase
    .from('store_members')
    .select('store_id')
    .eq('user_id', user.id)
    .eq('store_id', storeId)
    .maybeSingle()

  if (memberErr) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'db_error', message: memberErr.message }, { status: 500 }),
    }
  }
  if (!membership) {
    return { ok: false as const, response: NextResponse.json({ error: 'forbidden' }, { status: 403 }) }
  }

  return { ok: true as const, user, storeId }
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  if (!isValidId(params.id)) {
    return NextResponse.json({ error: 'invalid_input', reason: 'invalid_id' }, { status: 400 })
  }

  const supabase = getServerSupabase()
  const auth = await authorize(supabase)
  if (!auth.ok) return auth.response

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_input', reason: 'malformed_json' }, { status: 400 })
  }

  const parsed = parseUpdateInput(raw)
  if (!parsed.ok) {
    return NextResponse.json({ error: 'invalid_input', reason: parsed.error }, { status: 400 })
  }

  const patch: Record<string, unknown> = {}
  if (parsed.value.name !== undefined) patch.name = parsed.value.name
  if (parsed.value.prompt !== undefined) patch.prompt = parsed.value.prompt
  if (parsed.value.icon !== undefined) patch.icon = parsed.value.icon
  if (parsed.value.displayOrder !== undefined) patch.display_order = parsed.value.displayOrder

  // `as never` cast: @supabase/ssr 0.5.2 + supabase-js 2.105 typing 호환성 이슈.
  // 동일 패턴: apps/dashboard/app/api/products/route.ts.
  const { data, error } = await supabase
    .from('saved_flows')
    .update(patch as never)
    .eq('id', params.id)
    .eq('store_id', auth.storeId)
    .eq('user_id', auth.user.id)
    .select(
      'id, store_id, user_id, name, prompt, icon, display_order, run_count, last_run_at, created_at, updated_at',
    )
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: 'db_error', message: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  return NextResponse.json({ flow: rowToSavedFlow(data as SavedFlowRow) })
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  if (!isValidId(params.id)) {
    return NextResponse.json({ error: 'invalid_input', reason: 'invalid_id' }, { status: 400 })
  }

  const supabase = getServerSupabase()
  const auth = await authorize(supabase)
  if (!auth.ok) return auth.response

  const { data, error } = await supabase
    .from('saved_flows')
    .delete()
    .eq('id', params.id)
    .eq('store_id', auth.storeId)
    .eq('user_id', auth.user.id)
    .select('id')
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: 'db_error', message: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  return NextResponse.json({ ok: true })
}
