/**
 * /api/saved-flows — PRD §15.1, §14.
 *
 * GET   본인의 active store에 저장된 saved_flows 목록 (run_count desc, display_order asc).
 * POST  새 flow 생성. body = { name, prompt, icon? }.
 *
 * 인증/매장 가드:
 *   - 미인증 → 401 unauthenticated
 *   - active_store_id 쿠키 없거나 멤버 아님 → 403 forbidden
 *   - 입력 검증 실패 → 400 invalid_input
 */

import { NextResponse, type NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { getServerSupabase } from '@/lib/supabase/server'
import { ACTIVE_STORE_COOKIE } from '@/lib/supabase/middleware'
import { rowToSavedFlow, type SavedFlowRow } from '@/lib/saved-flows/serialize'
import { parseCreateInput } from '@/lib/saved-flows/validate'

export const runtime = 'nodejs'

export async function GET(_req: NextRequest) {
  const supabase = getServerSupabase()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  const storeId = cookies().get(ACTIVE_STORE_COOKIE)?.value
  if (!storeId) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { data: membership, error: memberErr } = await supabase
    .from('store_members')
    .select('store_id')
    .eq('user_id', user.id)
    .eq('store_id', storeId)
    .maybeSingle()

  if (memberErr) {
    return NextResponse.json({ error: 'db_error', message: memberErr.message }, { status: 500 })
  }
  if (!membership) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { data, error } = await supabase
    .from('saved_flows')
    .select(
      'id, store_id, user_id, name, prompt, icon, display_order, run_count, last_run_at, created_at, updated_at',
    )
    .eq('store_id', storeId)
    .eq('user_id', user.id)
    .order('run_count', { ascending: false })
    .order('display_order', { ascending: true })

  if (error) {
    return NextResponse.json({ error: 'db_error', message: error.message }, { status: 500 })
  }

  const flows = ((data ?? []) as SavedFlowRow[]).map(rowToSavedFlow)
  return NextResponse.json({ flows })
}

export async function POST(req: NextRequest) {
  const supabase = getServerSupabase()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  const storeId = cookies().get(ACTIVE_STORE_COOKIE)?.value
  if (!storeId) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { data: membership, error: memberErr } = await supabase
    .from('store_members')
    .select('store_id')
    .eq('user_id', user.id)
    .eq('store_id', storeId)
    .maybeSingle()

  if (memberErr) {
    return NextResponse.json({ error: 'db_error', message: memberErr.message }, { status: 500 })
  }
  if (!membership) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_input', reason: 'malformed_json' }, { status: 400 })
  }

  const parsed = parseCreateInput(raw)
  if (!parsed.ok) {
    return NextResponse.json({ error: 'invalid_input', reason: parsed.error }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('saved_flows')
    .insert({
      store_id: storeId,
      user_id: user.id,
      name: parsed.value.name,
      prompt: parsed.value.prompt,
      icon: parsed.value.icon ?? null,
      display_order: parsed.value.displayOrder ?? 0,
    })
    .select(
      'id, store_id, user_id, name, prompt, icon, display_order, run_count, last_run_at, created_at, updated_at',
    )
    .single()

  if (error || !data) {
    return NextResponse.json(
      { error: 'db_error', message: error?.message ?? 'insert_failed' },
      { status: 500 },
    )
  }

  return NextResponse.json({ flow: rowToSavedFlow(data as SavedFlowRow) }, { status: 201 })
}
