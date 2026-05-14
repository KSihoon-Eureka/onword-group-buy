'use client'

/**
 * ProductCard — 공구 현황 그리드 카드 (dumb).
 * PRD §9.5 (레이아웃), §9.2 (디자인 토큰), §2.12 (포맷), §15.2 (URL: /p/[id]).
 *
 * 책임:
 *  - 데이터 fetch / mutation 없음 — 부모(server component)에서 Product 전달.
 *  - 클릭 시 `/p/[id]` 이동 (next/link `<Link>` 사용, PRD §9.8).
 *  - archived 상품은 시각적으로 muted + "보관됨" 배지.
 *  - 이미지 없으면 zinc placeholder.
 *
 * 데이터 흐름:
 *  - Product 타입 그대로(camelCase). row→camelCase 매핑은 부모 server component.
 */

import Link from 'next/link'
import type { Product } from '@onword/types'
import { cn } from './cn'
import {
  PROGRESS_STAGE_ORDER,
  formatDeadlineKR,
  formatParticipation,
  formatPriceKRW,
  getProgressDots,
  type ProgressDotState,
} from './productCardHelpers'

export interface ProductCardProps {
  product: Product
  /**
   * 카드 클릭 라우팅 prefix. 기본 `/p`.
   * (Next.js dashboard에서 `/p/[id]`로 매핑됨)
   */
  hrefPrefix?: string
}

function dotClassName(state: ProgressDotState, muted: boolean): string {
  if (muted) {
    // archived 상품: 모든 dot을 회색 톤으로 약화
    return state === 'pending' ? 'bg-zinc-100' : 'bg-zinc-300'
  }
  if (state === 'done') return 'bg-emerald-500'
  if (state === 'current') return 'bg-black ring-2 ring-black/10'
  return 'bg-zinc-200'
}

export function ProductCard({ product, hrefPrefix = '/p' }: ProductCardProps) {
  const archived = product.archivedAt !== null
  const dots = getProgressDots(product.flowStage)

  return (
    <Link
      href={`${hrefPrefix}/${product.id}`}
      aria-label={`${product.name} 상품 상세로 이동`}
      className={cn(
        'group block bg-white border border-black/[0.04] rounded-2xl overflow-hidden',
        'shadow-[0_2px_12px_rgba(0,0,0,0.02)] hover:bg-black/[0.02] transition-all',
        archived && 'opacity-70',
      )}
    >
      {/* 이미지 */}
      <div className="relative aspect-[4/3] w-full bg-zinc-50">
        {product.primaryImageUrl ? (
          // 외부 도메인 / Supabase Storage 모두 next/image 설정 의존이라 일반 <img>.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.primaryImageUrl}
            alt={product.name}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[11px] text-zinc-400 uppercase tracking-wider">
            이미지 없음
          </div>
        )}
        {archived && (
          <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider bg-black/70 text-white">
            보관됨
          </span>
        )}
      </div>

      {/* 본문 */}
      <div className="p-4 flex flex-col gap-3">
        <h3
          className="text-[14px] font-semibold text-zinc-900 line-clamp-2 min-h-[2.5em]"
          title={product.name}
        >
          {product.name}
        </h3>

        {/* 8-stage progress dots */}
        <div
          className="flex items-center gap-1"
          role="progressbar"
          aria-label="공구 진행 단계"
          aria-valuemin={0}
          aria-valuemax={PROGRESS_STAGE_ORDER.length}
          aria-valuenow={dots.filter((s) => s === 'done').length + (dots.includes('current') ? 1 : 0)}
        >
          {dots.map((state, i) => (
            <span
              key={PROGRESS_STAGE_ORDER[i]}
              data-stage={PROGRESS_STAGE_ORDER[i]}
              data-state={state}
              className={cn(
                'inline-block w-2 h-2 rounded-full transition-colors',
                dotClassName(state, archived),
              )}
            />
          ))}
        </div>

        {/* 가격 · 참여 수 */}
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[17px] font-semibold text-zinc-900">
            {formatPriceKRW(product.price)}
          </span>
          <span className="text-[12px] text-zinc-500">
            {formatParticipation(product.orderedQuantity, product.stockQuantity)}
          </span>
        </div>

        {/* 마감일 */}
        <div className="flex items-center justify-between text-[12px] text-zinc-500">
          <span>마감</span>
          <time dateTime={product.orderDeadline}>
            {formatDeadlineKR(product.orderDeadline)}
          </time>
        </div>
      </div>
    </Link>
  )
}
