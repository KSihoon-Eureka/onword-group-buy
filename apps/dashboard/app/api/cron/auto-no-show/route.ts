/**
 * GET /api/cron/auto-no-show — Vercel Cron 엔드포인트.
 *
 * Vercel Cron 이 매일 00:00 KST 호출 (vercel.json schedule).
 * 호출 시 Vercel 이 자동으로 `Authorization: Bearer <CRON_SECRET>` 헤더 첨부.
 * 본 route 가 CRON_SECRET 검증 후 packages/agent/cron/auto-no-show 실행.
 *
 * Public 호출 방지: CRON_SECRET 환경변수 일치 안 하면 401.
 */

import { NextResponse } from 'next/server'
import { runAutoNoShow } from '@onword/agent/cron/auto-no-show'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const expected = process.env.CRON_SECRET
  if (!expected || authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  try {
    const result = await runAutoNoShow()
    console.log('[cron/auto-no-show] result:', result)
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[cron/auto-no-show] failed:', message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
