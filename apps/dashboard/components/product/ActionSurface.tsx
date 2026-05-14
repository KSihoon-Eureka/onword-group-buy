'use client'

/**
 * ActionSurface — 상품 상세 페이지의 7-feature action grid (smart 일부).
 * PRD §9.5 / §7.13.
 *
 * 책임:
 *  - server component 가 계산해 넘긴 `features` (FeatureState[]) 를 그리드로 렌더.
 *  - 각 카드의 "실행" 버튼 클릭 → POST /api/agent/run (W6 contract).
 *  - 실행 직후 router.refresh() 로 server component 재실행 → 새 trace / asset 반영.
 *  - 실행 중인 action 은 버튼 disabled (스피너 라벨).
 *
 * ChatView 시그니처는 건드리지 않는다 (cascading 회피).
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Play } from 'lucide-react'
import {
  getStatusGlyph,
  getStatusLabel,
  type FeatureState,
} from '@/lib/products/action-status'
import { cn } from '@onword/ui'

interface ActionSurfaceProps {
  storeId: string
  productId: string
  features: ReadonlyArray<FeatureState>
}

interface RunResponse {
  traceId?: string
  status?: string
  error?: string
}

export function ActionSurface({ storeId, productId, features }: ActionSurfaceProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleRun(action: string, featureId: string) {
    setError(null)
    setBusyId(featureId)
    try {
      const res = await fetch('/api/agent/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId,
          productId,
          action,
        }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as RunResponse
        setError(`실행 실패 (${res.status}${body.error ? ` · ${body.error}` : ''})`)
        return
      }
      // 200: trace 시작됨 — server component 재실행으로 상태 갱신
      startTransition(() => {
        router.refresh()
      })
    } catch (err) {
      setError(
        err instanceof Error ? `네트워크 오류: ${err.message}` : '네트워크 오류',
      )
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section aria-labelledby="action-surface-heading" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2
          id="action-surface-heading"
          className="text-[17px] font-semibold text-zinc-900"
        >
          자동화 액션
        </h2>
        <span className="text-[11px] text-zinc-400">
          ✓ 완료 · ○ 진행 중 · — 미실행 · ✗ 실패
        </span>
      </div>

      <div
        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3"
        data-testid="action-grid"
      >
        {features.map((f) => {
          const glyph = getStatusGlyph(f.status)
          const isBusy = busyId === f.definition.id || (pending && busyId === f.definition.id)
          const disabled = isBusy || f.status === 'running'
          return (
            <article
              key={f.definition.id}
              data-feature-id={f.definition.id}
              data-status={f.status}
              className={cn(
                'bg-white border border-black/[0.04] rounded-2xl p-4 flex flex-col gap-3',
                'shadow-[0_2px_12px_rgba(0,0,0,0.02)]',
              )}
            >
              <header className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={cn(
                      'inline-flex items-center justify-center w-6 h-6 rounded-full text-[12px] font-semibold',
                      f.status === 'completed' && 'bg-emerald-50 text-emerald-700',
                      f.status === 'running' && 'bg-amber-50 text-amber-700',
                      f.status === 'idle' && 'bg-zinc-100 text-zinc-500',
                      f.status === 'failed' && 'bg-red-50 text-red-700',
                    )}
                    aria-label={getStatusLabel(f.status)}
                  >
                    {glyph}
                  </span>
                  <span className="text-[13px] font-semibold text-zinc-900 truncate">
                    {f.definition.label}
                  </span>
                </div>
                <span className="text-[10px] uppercase tracking-wider text-zinc-400 shrink-0">
                  {getStatusLabel(f.status)}
                </span>
              </header>

              <p className="text-[12px] text-zinc-500 line-clamp-2 min-h-[2.5em]">
                {f.definition.description}
              </p>

              <button
                type="button"
                onClick={() => void handleRun(f.definition.action, f.definition.id)}
                disabled={disabled}
                aria-label={`${f.definition.label} 실행`}
                className={cn(
                  'mt-auto inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium transition-all',
                  disabled
                    ? 'bg-zinc-100 text-zinc-400 cursor-not-allowed'
                    : 'bg-black text-white shadow-sm hover:bg-zinc-800',
                )}
              >
                {isBusy ? (
                  <>
                    <Loader2 size={12} className="animate-spin" />
                    실행 중
                  </>
                ) : (
                  <>
                    <Play size={12} />
                    실행
                  </>
                )}
              </button>
            </article>
          )
        })}
      </div>

      {error && (
        <p
          role="alert"
          className="text-[12px] text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2"
        >
          {error}
        </p>
      )}
    </section>
  )
}
