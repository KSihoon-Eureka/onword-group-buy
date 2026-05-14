'use client'

/**
 * AuditLogPanel — 감사 로그 패널 (dumb).
 * PRD §4.10 audit_log + §9.5 AuditLogPanel + §9.2 디자인 토큰 + §9.4 한국어 라벨.
 *
 * 책임 분리:
 *  - 데이터 fetch는 부모(server component / smart)에서. 이 컴포넌트는 props만 받는다.
 *  - filter 변경 → onFilterChange(filter) — 부모가 URL searchParams 동기화.
 *  - supabase / fetch 호출 절대 금지.
 *
 * 표시:
 *  - 시간 역순 (parent 가 created_at desc 로 정렬해 전달).
 *  - 시간 (PRD A12: YYYY-MM-DD 오전/오후 H시 M분)
 *  - 사용자 (user_id null = system, 아니면 사용자 표시명 / 이메일)
 *  - entity (entity_type + entity_id; 부모가 label 미리 매핑 가능)
 *  - action 한국어 매핑
 *  - changes preview (있을 때 핵심 필드 일부)
 */

import * as React from 'react'
import type { AuditAction, AuditEntityType, AuditLogEntry } from '@onword/types'
import { cn } from './cn'

// ==========================
// Pure helpers (테스트 대상)
// ==========================

/**
 * AuditAction → 한국어 라벨. PRD §9.4 + 작업 명세.
 * 정의되지 않은 값은 원문 그대로 (fallback).
 */
export const AUDIT_ACTION_LABEL: Record<AuditAction, string> = {
  create: '생성',
  update: '수정',
  archive: '보관',
  restore: '복원',
  flow_stage_change: '상태 변경',
  asset_supersede: '자산 교체',
  auto_no_show: '자동 노쇼',
}

export function getAuditActionLabel(action: string): string {
  return (AUDIT_ACTION_LABEL as Record<string, string>)[action] ?? action
}

/**
 * AuditEntityType → 한국어 라벨.
 */
export const AUDIT_ENTITY_LABEL: Record<AuditEntityType, string> = {
  product: '상품',
  order: '주문',
  asset: '자산',
  flow: '플로우',
  store: '매장',
}

export function getAuditEntityLabel(entityType: string): string {
  return (AUDIT_ENTITY_LABEL as Record<string, string>)[entityType] ?? entityType
}

/**
 * 시간 포맷 (PRD A12). 한국식: `2026-05-13 오후 2시 23분`.
 * 입력 invalid 시 raw 그대로 반환.
 */
export function formatAuditTimestamp(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso

  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')

  const h24 = d.getHours()
  const min = d.getMinutes()

  const ampm = h24 < 12 ? '오전' : '오후'
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12

  return `${y}-${m}-${day} ${ampm} ${h12}시 ${String(min).padStart(2, '0')}분`
}

/**
 * 사용자 표시명. null = 시스템 (자동 실행).
 */
export function getActorLabel(
  userId: string | null,
  userMap?: Record<string, { name?: string | null; email?: string | null }>,
): string {
  if (userId === null) return '시스템'
  const info = userMap?.[userId]
  if (!info) return '사용자'
  return info.name?.trim() || info.email?.trim() || '사용자'
}

/**
 * entity 표시 라벨 — entityLabelMap (entity_id → 사람이 읽는 이름) 있으면 사용,
 * 없으면 `타입 #abc12345` 단축.
 */
export function getEntityDisplay(
  entityType: string,
  entityId: string,
  entityLabelMap?: Record<string, string>,
): string {
  const typeLabel = getAuditEntityLabel(entityType)
  const named = entityLabelMap?.[entityId]
  if (named && named.trim().length > 0) return `${typeLabel} · ${named}`
  return `${typeLabel} #${entityId.slice(0, 8)}`
}

/**
 * changes preview — `{ before, after }` 또는 `{ field: new_value }` 패턴 양쪽.
 * 핵심 필드만 1~3개 추출, 100자 이내 잘라 표시.
 */
export function summarizeChanges(changes: Record<string, unknown> | null): string {
  if (!changes) return ''
  const entries = Object.entries(changes)
  if (entries.length === 0) return ''

  // before/after 패턴: 두 필드만 보임 → 핵심 1줄.
  if (
    entries.length === 2 &&
    'before' in changes &&
    'after' in changes
  ) {
    const before = stringifyShort(changes.before)
    const after = stringifyShort(changes.after)
    const text = `${before} → ${after}`
    return text.length > 100 ? text.slice(0, 97) + '...' : text
  }

  const parts = entries.slice(0, 3).map(([k, v]) => `${k}: ${stringifyShort(v)}`)
  const text = parts.join(', ')
  return text.length > 100 ? text.slice(0, 97) + '...' : text
}

function stringifyShort(v: unknown): string {
  if (v === null || v === undefined) return '∅'
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

// ==========================
// Filter 타입
// ==========================

/**
 * 부모(/audit 페이지)는 이 객체를 URL searchParams 와 동기화.
 *  - `entityType`: 'product' 등 — undefined = 전체
 *  - `entityId`: 특정 객체로 좁히기 — undefined = 전체
 */
export interface AuditFilter {
  entityType?: AuditEntityType
  entityId?: string
}

export interface AuditFilterOption {
  /** dropdown 표시 텍스트 */
  label: string
  /** filter 적용값 */
  value: AuditFilter
}

// ==========================
// Component
// ==========================

export interface AuditLogPanelProps {
  /** 시간 역순 정렬된 entries — 부모가 정렬 후 전달 */
  entries: AuditLogEntry[]
  /** 현재 적용 필터 */
  filter: AuditFilter
  /** 필터 옵션 — 부모가 entries로부터 product 목록 등을 추출해 전달 */
  filterOptions: AuditFilterOption[]
  /** filter dropdown 변경 → 부모가 URL searchParams 동기화 */
  onFilterChange: (filter: AuditFilter) => void
  /** user_id → 표시 정보. 없으면 '사용자' fallback */
  userMap?: Record<string, { name?: string | null; email?: string | null }>
  /** entity_id → 사람이 읽는 이름. 없으면 type+id 단축 표시 */
  entityLabelMap?: Record<string, string>
}

function filtersEqual(a: AuditFilter, b: AuditFilter): boolean {
  return a.entityType === b.entityType && a.entityId === b.entityId
}

function getSelectedOptionIndex(
  filter: AuditFilter,
  options: AuditFilterOption[],
): number {
  const idx = options.findIndex((o) => filtersEqual(o.value, filter))
  return idx >= 0 ? idx : 0
}

export function AuditLogPanel({
  entries,
  filter,
  filterOptions,
  onFilterChange,
  userMap,
  entityLabelMap,
}: AuditLogPanelProps) {
  const selectedIndex = getSelectedOptionIndex(filter, filterOptions)

  return (
    <div className="w-full max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6 gap-3">
        <h1 className="text-2xl font-bold text-black tracking-tight">감사 로그</h1>

        {filterOptions.length > 1 && (
          <label className="flex items-center gap-2">
            <span className="sr-only">필터</span>
            <select
              value={selectedIndex}
              onChange={(e) => {
                const next = filterOptions[Number(e.target.value)]
                if (next) onFilterChange(next.value)
              }}
              className="px-3 py-2 rounded-xl border border-black/[0.08] bg-white text-[13px] outline-none focus:border-zinc-400"
            >
              {filterOptions.map((opt, i) => (
                <option key={`${opt.label}-${i}`} value={i}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {entries.length === 0 ? (
        <div
          role="status"
          className="bg-white border border-black/[0.04] rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.02)] p-10 text-center"
        >
          <p className="text-[14px] text-zinc-500">기록이 없습니다</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className={cn(
                'bg-white border border-black/[0.04] rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.02)]',
                'px-4 py-3 flex flex-col gap-1.5',
              )}
            >
              <div className="flex items-center justify-between gap-3 text-[12px] text-zinc-500">
                <time dateTime={entry.createdAt}>
                  {formatAuditTimestamp(entry.createdAt)}
                </time>
                <span className="font-medium text-zinc-700">
                  {getActorLabel(entry.userId, userMap)}
                </span>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[13px] font-medium text-zinc-900">
                  {getEntityDisplay(entry.entityType, entry.entityId, entityLabelMap)}
                </span>
                <span className="text-[11px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-700">
                  {getAuditActionLabel(entry.action)}
                </span>
              </div>

              {entry.changes && summarizeChanges(entry.changes) && (
                <p className="text-[12px] text-zinc-500 truncate">
                  {summarizeChanges(entry.changes)}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
