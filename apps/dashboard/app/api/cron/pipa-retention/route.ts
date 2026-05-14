/**
 * GET /api/cron/pipa-retention — Vercel Cron 엔드포인트.
 *
 * 매일 00:00 KST 호출. CRON_SECRET 검증 후 packages/agent/cron/pipa-retention 실행.
 * PIPA Article 21 보유기간 만료 phone 자동 NULL.
 */

import { NextResponse } from 'next/server'
import { runPipaRetention } from '@onword/agent/cron/pipa-retention'

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
    const result = await runPipaRetention()
    console.log('[cron/pipa-retention] result:', result)
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[cron/pipa-retention] failed:', message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
