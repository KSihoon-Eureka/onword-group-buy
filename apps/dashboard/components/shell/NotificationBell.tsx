'use client'

/**
 * NotificationBell — Dashboard 우상단 알림 아이콘 + dropdown.
 *  - 아이콘 클릭 → 아이콘 아래 NotificationCenter dropdown 토글
 *  - 외부 클릭 / ESC → 닫기
 *  - localStorage 'onword:notifications:lastReadAt' 로 읽음 표시 관리
 *
 *  Sidebar 안의 Bell 은 제거됨 (사용자 요청, 2026-05-14). 알림은 항상 우상단에 위치.
 */

import { useEffect, useRef, useState } from 'react'
import { Bell } from 'lucide-react'
import { useRouter } from 'next/navigation'
import {
  NotificationCenter,
  type NotificationItem,
  countUnread,
} from '@onword/ui'

const LS_LAST_READ_KEY = 'onword:notifications:lastReadAt'

interface Props {
  notifications: NotificationItem[]
}

export function NotificationBell({ notifications }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [lastReadAt, setLastReadAt] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const stored = window.localStorage.getItem(LS_LAST_READ_KEY)
    if (stored) setLastReadAt(stored)
  }, [])

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (!containerRef.current) return
      if (!containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onEsc)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onEsc)
    }
  }, [open])

  const unreadCount = countUnread(notifications, lastReadAt)

  function handleMarkRead(readAtIso: string) {
    setLastReadAt(readAtIso)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(LS_LAST_READ_KEY, readAtIso)
    }
  }

  function handleItemClick(item: NotificationItem) {
    if (item.href) router.push(item.href)
    setOpen(false)
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`알림 ${unreadCount > 0 ? `(${unreadCount}개 안 읽음)` : ''}`}
        className={
          'relative inline-flex items-center justify-center w-10 h-10 rounded-full bg-white border border-black/[0.04] shadow-sm transition-all hover:bg-zinc-50 ' +
          (open ? 'bg-zinc-50' : '')
        }
      >
        <Bell size={18} strokeWidth={2} className="text-zinc-700" />
        {unreadCount > 0 && (
          <span
            aria-hidden
            className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full bg-red-500 text-white text-[10px] font-semibold"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-50">
          <NotificationCenter
            notifications={notifications}
            lastReadAt={lastReadAt}
            onMarkRead={handleMarkRead}
            onItemClick={handleItemClick}
          />
        </div>
      )}
    </div>
  )
}
