/**
 * POST /api/assets/:assetId/copy
 *
 * 자산이 복사되었음을 기록 (generated_assets.copied_at 업데이트).
 * - 인증 필수 + active store 멤버만
 * - 자산이 active store 의 자산이어야 함 (RLS 통과)
 * - fire-and-forget — 응답 200/4xx 만, body 는 비어있음
 *
 * 사용처: AssetCard "복사" 버튼의 onCopied callback.
 */

import { NextResponse } from 'next/server'
import { resolveActiveStore } from '@/lib/auth/active-store'
import { getServerSupabase } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RouteContext {
  params: { assetId: string }
}

export async function POST(_request: Request, { params }: RouteContext) {
  const active = await resolveActiveStore()
  if (active.type === 'unauthenticated') {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }
  if (active.type === 'no_active_store' || active.type === 'not_member') {
    return NextResponse.json(
      { error: '매장을 먼저 선택해주세요.' },
      { status: 403 },
    )
  }

  const { storeId } = active
  const { assetId } = params

  if (!assetId || !/^[0-9a-f-]{36}$/i.test(assetId)) {
    return NextResponse.json({ error: 'invalid assetId' }, { status: 400 })
  }

  const supabase = getServerSupabase()
  const nowIso = new Date().toISOString()

  // store_id 명시 — RLS 우회 X (anon 사용자, RLS 강제), 중복 안전망.
  const { error } = await supabase
    .from('generated_assets')
    .update({ copied_at: nowIso } as never)
    .eq('id' as never, assetId as never)
    .eq('store_id' as never, storeId as never)

  if (error) {
    console.error('[/api/assets/copy] update failed:', error.message)
    return NextResponse.json({ error: '기록 실패' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, copiedAt: nowIso })
}
