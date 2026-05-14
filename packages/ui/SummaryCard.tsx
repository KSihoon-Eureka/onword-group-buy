'use client'

/**
 * SummaryCard — AI 비서 default landing 의 오늘 요약 (dumb).
 * PRD §9.5 SummaryCard + §9.2 디자인 토큰 + §9.4 한국어 라벨.
 *
 * 책임 분리:
 *  - 통계 계산은 부모(server / smart) 에서 수행. 이 컴포넌트는 props 만으로 렌더.
 *  - 4 항목 grid: 오늘 마감 / 신규 주문 / 수령 가능 / 마감 임박.
 *  - 카드 클릭 → onCardClick(key) — 부모가 navigation 처리 (예: /campaigns?filter=...).
 *  - 0값은 회색 톤으로 약화 표시 (시각적 노이즈 감소).
 *  - supabase / fetch / server action import 0.
 */

import * as React from 'react'
import { Clock, Inbox, PackageCheck, AlertTriangle, type LucideIcon } from 'lucide-react'
import { cn } from './cn'

// ==========================
// Types
// ==========================

export type SummaryCardKey = 'closingToday' | 'newOrders' | 'pickupReady' | 'deadlineSoon'

export interface SummaryStats {
  /** 오늘 주문 마감인 상품 수 */
  closingToday: number
  /** 신규 주문 수 (예: 마지막 방문 이후 또는 오늘 발생 — 부모 정의) */
  newOrders: number
  /** 수령 가능 상품 수 (flow_stage = arrived / pickup_ready) */
  pickupReady: number
  /** 마감 임박 상품 수 (24h-48h 등 — 부모 정의) */
  deadlineSoon: number
}

export interface SummaryCardProps {
  stats: SummaryStats
  /** 카드 클릭 — 부모가 routing 처리. 없으면 카드는 정적 디스플레이. */
  onCardClick?: (key: SummaryCardKey) => void
  className?: string
}

// ==========================
// Pure helpers (testable)
// ==========================

interface CardMeta {
  key: SummaryCardKey
  label: string
  unit: string
  Icon: LucideIcon
  /** 0보다 클 때 강조색 (Tailwind class) */
  accentText: string
  accentBg: string
}

export const SUMMARY_CARD_META: Record<SummaryCardKey, CardMeta> = {
  closingToday: {
    key: 'closingToday',
    label: '오늘 마감',
    unit: '개',
    Icon: Clock,
    accentText: 'text-orange-700',
    accentBg: 'bg-orange-50',
  },
  newOrders: {
    key: 'newOrders',
    label: '신규 주문',
    unit: '건',
    Icon: Inbox,
    accentText: 'text-emerald-700',
    accentBg: 'bg-emerald-50',
  },
  pickupReady: {
    key: 'pickupReady',
    label: '수령 가능',
    unit: '개',
    Icon: PackageCheck,
    accentText: 'text-blue-700',
    accentBg: 'bg-blue-50',
  },
  deadlineSoon: {
    key: 'deadlineSoon',
    label: '마감 임박',
    unit: '개',
    Icon: AlertTriangle,
    accentText: 'text-red-700',
    accentBg: 'bg-red-50',
  },
}

export const SUMMARY_CARD_ORDER: SummaryCardKey[] = [
  'closingToday',
  'newOrders',
  'pickupReady',
  'deadlineSoon',
]

/**
 * 표시용 숫자 포맷.
 *  - 음수 / NaN / undefined → 0
 *  - 1,000+ 콤마 (한국 PRD A12 일관성)
 */
export function formatSummaryNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return '0'
  if (typeof value !== 'number' || Number.isNaN(value)) return '0'
  if (value < 0) return '0'
  return Math.floor(value).toLocaleString('ko-KR')
}

/**
 * 0값 여부 (zero-state 톤 분기용).
 */
export function isZeroValue(value: number | null | undefined): boolean {
  if (value === null || value === undefined) return true
  if (typeof value !== 'number' || Number.isNaN(value)) return true
  return value <= 0
}

// ==========================
// Component
// ==========================

export function SummaryCard({ stats, onCardClick, className }: SummaryCardProps) {
  return (
    <div
      role="region"
      aria-label="오늘 요약"
      className={cn(
        'w-full max-w-2xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-3',
        className,
      )}
    >
      {SUMMARY_CARD_ORDER.map((key) => {
        const meta = SUMMARY_CARD_META[key]
        const value = stats[key]
        const zero = isZeroValue(value)
        const formatted = formatSummaryNumber(value)
        const clickable = Boolean(onCardClick) && !zero

        const inner = (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  'inline-flex items-center justify-center w-7 h-7 rounded-full',
                  zero ? 'bg-zinc-100' : meta.accentBg,
                )}
              >
                <meta.Icon
                  size={14}
                  className={zero ? 'text-zinc-400' : meta.accentText}
                  aria-hidden
                />
              </div>
              <span className="text-[12px] font-medium text-zinc-500">{meta.label}</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span
                data-testid={`summary-value-${key}`}
                data-zero={zero ? 'true' : 'false'}
                className={cn(
                  'text-2xl font-bold tracking-tight',
                  zero ? 'text-zinc-300' : 'text-zinc-900',
                )}
              >
                {formatted}
              </span>
              <span
                className={cn(
                  'text-[12px] font-medium',
                  zero ? 'text-zinc-300' : 'text-zinc-500',
                )}
              >
                {meta.unit}
              </span>
            </div>
          </div>
        )

        if (onCardClick) {
          return (
            <button
              key={key}
              type="button"
              onClick={() => onCardClick(key)}
              disabled={zero}
              aria-label={`${meta.label} ${formatted}${meta.unit}`}
              data-testid={`summary-card-${key}`}
              className={cn(
                'text-left p-4 bg-white border border-black/[0.04] rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.02)] transition-all',
                clickable
                  ? 'hover:shadow-[0_4px_16px_rgba(0,0,0,0.06)] hover:-translate-y-0.5 cursor-pointer'
                  : 'cursor-default',
              )}
            >
              {inner}
            </button>
          )
        }

        return (
          <div
            key={key}
            data-testid={`summary-card-${key}`}
            className="p-4 bg-white border border-black/[0.04] rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.02)]"
          >
            {inner}
          </div>
        )
      })}
    </div>
  )
}
