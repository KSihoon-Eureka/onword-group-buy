'use client'

/**
 * BottomNav — 모바일 하단 네비.
 * 출처: Versatile Execution Agent App.tsx L793-821
 * 변경: Assets 제외 (모바일에서 복사할 일 없음), 한글 라벨
 */

import { Bot, Activity, Database, Plus } from 'lucide-react'
import { cn } from './cn'
import type { DashboardTab } from '@onword/types'

const ICONS = { Bot, Activity, Database, Plus } as const

const MOBILE_ITEMS: Array<{
  id: DashboardTab
  label: string
  icon: keyof typeof ICONS
}> = [
  { id: 'chat',      label: '비서',     icon: 'Bot' },
  { id: 'campaigns', label: '공구',     icon: 'Activity' },
  { id: 'orders',    label: '주문',     icon: 'Database' },
  { id: 'new',       label: '등록',     icon: 'Plus' },
]

export interface BottomNavProps {
  activeTab: DashboardTab
  onTabChange: (tab: DashboardTab) => void
}

export function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  return (
    <div className="md:hidden flex items-center justify-around bg-white border-t border-black/5 px-2 py-3 shrink-0 pb-safe">
      {MOBILE_ITEMS.map((item) => {
        const Icon = ICONS[item.icon]
        return (
          <button
            key={item.id}
            onClick={() => onTabChange(item.id)}
            className={cn(
              'flex flex-col items-center gap-1 p-2 rounded-xl transition-all',
              activeTab === item.id
                ? 'text-black'
                : 'text-zinc-400 hover:text-zinc-600'
            )}
          >
            <Icon size={20} strokeWidth={activeTab === item.id ? 2.5 : 2} />
            <span className="text-[10px] font-medium">{item.label}</span>
          </button>
        )
      })}
    </div>
  )
}
