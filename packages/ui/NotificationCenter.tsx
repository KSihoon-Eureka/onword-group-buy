'use client'

/**
 * NotificationCenter — 사이드바 🔔 dropdown (dumb).
 * PRD §9.5 NotificationCenter + §4.10 audit_log + §4.6 agent_traces + §9.2 디자인 토큰.
 *
 * 책임 분리:
 *  - 데이터 fetch / 분류는 부모(smart wrapper)에서. 이 컴포넌트는 props 만으로 렌더.
 *  - 부모는 audit_log (최근 10건) + agent_traces (status='failed') + 새 주문 (Realtime, 미래)
 *    을 각각 조회 → `NotificationItem` 형태로 통합 → 시간 역순 정렬 → 전달.
 *  - 읽음 표시는 `lastReadAt` 비교 (createdAt > lastReadAt 이면 unread).
 *  - 클릭 시 onItemClick (navigation) + onMarkRead (lastReadAt 갱신, localStorage 저장은 부모 책임).
 *  - supabase / fetch / server action import 0.
 *
 * Props 의 NotificationItem 은 packages/ui 내부 정의. audit_log / agent_traces / orders
 * 등 *서로 다른 도메인 객체를 통합 view shape* 로 정규화한 결과. 도메인 타입(@onword/types)
 * 은 수정하지 않는다 (cascading 회피).
 */

import * as React from 'react'
import { Bell, AlertCircle, FileText, ShoppingBag } from 'lucide-react'
import { cn } from './cn'

// ==========================
// Public types
// ==========================

/**
 * 통합 알림 종류:
 *  - `audit` — audit_log 항목
 *  - `tool_failure` — agent_traces.status='failed' 항목
 *  - `new_order` — orders insert (Realtime, 미래)
 */
export type NotificationKind = 'audit' | 'tool_failure' | 'new_order'

export interface NotificationItem {
  /** trace id / audit id / order id 등 원본 식별자 */
  id: string
  kind: NotificationKind
  /** ISO timestamp — 정렬 / unread 판정 기준 */
  createdAt: string
  /** 한국어 제목 (한 줄) */
  title: string
  /** 한국어 본문 (선택, 1-2줄) */
  description?: string
  /** 클릭 시 부모가 navigation 에 사용 (예: `/audit?entity=...` / `/p/[id]`). 옵셔널. */
  href?: string
}

// ==========================
// Pure helpers (testable)
// ==========================

/**
 * lastReadAt 보다 createdAt 이 더 미래이면 unread.
 *  - lastReadAt 이 undefined / null / 빈 문자열 → 전부 unread.
 *  - parse 실패 → 보수적으로 unread 취급.
 */
export function isUnread(createdAtIso: string, lastReadAtIso?: string | null): boolean {
  if (!lastReadAtIso) return true
  const last = Date.parse(lastReadAtIso)
  const cur = Date.parse(createdAtIso)
  if (Number.isNaN(last) || Number.isNaN(cur)) return true
  return cur > last
}

/**
 * unread 카운트. badge 표시용. 99 초과 시 99+ 표기는 view 단에서.
 */
export function countUnread(
  notifications: NotificationItem[],
  lastReadAtIso?: string | null,
): number {
  let n = 0
  for (const item of notifications) {
    if (isUnread(item.createdAt, lastReadAtIso)) n++
  }
  return n
}

/**
 * 종류별 한국어 라벨.
 */
export const NOTIFICATION_KIND_LABEL: Record<NotificationKind, string> = {
  audit: '변경 이력',
  tool_failure: '실행 실패',
  new_order: '새 주문',
}

export function getNotificationKindLabel(kind: string): string {
  return (NOTIFICATION_KIND_LABEL as Record<string, string>)[kind] ?? kind
}

/**
 * 상대 시간 (ko) — `방금 전` / `N분 전` / `N시간 전` / `N일 전` / `MM월 DD일` 후 절대값.
 *  - now 옵션 주입 가능 (테스트용).
 */
export function formatRelativeKo(iso: string, now: Date = new Date()): string {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return iso
  const diff = now.getTime() - t
  if (diff < 0) return '방금 전'

  const sec = Math.floor(diff / 1000)
  if (sec < 60) return '방금 전'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}분 전`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}시간 전`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}일 전`

  const d = new Date(t)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${m}월 ${dd}일`
}

// ==========================
// Component
// ==========================

export interface NotificationCenterProps {
  /** 시간 역순 정렬된 알림 (부모가 정렬해 전달). */
  notifications: NotificationItem[]
  /** localStorage 등에서 부모가 가져온 last_read_at. 없거나 null = 전부 unread */
  lastReadAt?: string | null
  /** 닫을 때 (또는 명시적 "모두 읽음" 액션) 부모가 lastReadAt 갱신용 시각 받음 */
  onMarkRead?: (readAtIso: string) => void
  /** 항목 클릭 — 부모가 navigation 처리 */
  onItemClick?: (item: NotificationItem) => void
  /** 옵션: 최대 표시 갯수 (default 10 — PRD §9.5) */
  maxItems?: number
}

function KindIcon({ kind }: { kind: NotificationKind }) {
  if (kind === 'tool_failure') {
    return <AlertCircle size={14} className="text-red-600 shrink-0" aria-hidden />
  }
  if (kind === 'new_order') {
    return <ShoppingBag size={14} className="text-emerald-600 shrink-0" aria-hidden />
  }
  return <FileText size={14} className="text-zinc-500 shrink-0" aria-hidden />
}

export function NotificationCenter({
  notifications,
  lastReadAt,
  onMarkRead,
  onItemClick,
  maxItems = 10,
}: NotificationCenterProps) {
  const visible = notifications.slice(0, maxItems)
  const unreadCount = countUnread(visible, lastReadAt)

  function handleMarkAll() {
    if (!onMarkRead) return
    onMarkRead(new Date().toISOString())
  }

  function handleClick(item: NotificationItem) {
    onItemClick?.(item)
  }

  return (
    <div
      role="region"
      aria-label="알림"
      className="w-[320px] max-h-[420px] bg-white border border-black/[0.04] rounded-2xl shadow-[0_8px_24px_rgba(0,0,0,0.08)] flex flex-col overflow-hidden"
    >
      <header className="flex items-center justify-between px-4 py-3 border-b border-black/[0.04]">
        <div className="flex items-center gap-2">
          <Bell size={14} className="text-zinc-700" aria-hidden />
          <h2 className="text-[13px] font-semibold text-zinc-900">알림</h2>
          {unreadCount > 0 && (
            <span
              data-testid="unread-badge"
              className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full bg-red-500 text-white text-[10px] font-semibold"
              aria-label={`읽지 않은 알림 ${unreadCount}건`}
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </div>
        {unreadCount > 0 && onMarkRead && (
          <button
            type="button"
            onClick={handleMarkAll}
            className="text-[11px] font-medium text-zinc-500 hover:text-black transition-colors"
          >
            모두 읽음
          </button>
        )}
      </header>

      {visible.length === 0 ? (
        <div
          role="status"
          className="flex-1 flex items-center justify-center px-4 py-10 text-[13px] text-zinc-500"
        >
          알림이 없습니다
        </div>
      ) : (
        <ul className="flex-1 overflow-y-auto divide-y divide-black/[0.04]">
          {visible.map((item) => {
            const unread = isUnread(item.createdAt, lastReadAt)
            return (
              <li key={`${item.kind}-${item.id}`}>
                <button
                  type="button"
                  onClick={() => handleClick(item)}
                  data-testid={`notification-item-${item.id}`}
                  data-unread={unread ? 'true' : 'false'}
                  className={cn(
                    'w-full text-left px-4 py-3 flex items-start gap-2.5 transition-colors',
                    'hover:bg-black/[0.02]',
                    unread && 'bg-blue-50/40',
                  )}
                >
                  <KindIcon kind={item.kind} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">
                        {getNotificationKindLabel(item.kind)}
                      </span>
                      {unread && (
                        <span
                          aria-hidden
                          className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0"
                          data-testid="unread-dot"
                        />
                      )}
                    </div>
                    <p
                      className={cn(
                        'text-[13px] truncate',
                        unread ? 'font-semibold text-zinc-900' : 'font-medium text-zinc-800',
                      )}
                    >
                      {item.title}
                    </p>
                    {item.description && (
                      <p className="text-[12px] text-zinc-500 line-clamp-2 mt-0.5">
                        {item.description}
                      </p>
                    )}
                    <time
                      dateTime={item.createdAt}
                      className="text-[11px] text-zinc-400 mt-1 block"
                    >
                      {formatRelativeKo(item.createdAt)}
                    </time>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
