'use client'

/**
 * Sidebar — 데스크탑 사이드바.
 * 출처: Versatile Execution Agent App.tsx L27-63
 * 변경: 메뉴 5개를 공구 도메인으로 재정의, 한글 라벨, lucide 아이콘 매핑
 */

import { Bot, Activity, Database, FileText, Plus } from 'lucide-react'
import { cn } from './cn'
import type { DashboardTab } from '@onword/types'

const ICONS = {
  Bot, Activity, Database, FileText, Plus,
} as const

const MENU_ITEMS: Array<{
  id: DashboardTab
  label: string
  icon: keyof typeof ICONS
}> = [
  { id: 'chat',      label: 'AI 비서',   icon: 'Bot' },
  { id: 'campaigns', label: '공구 현황', icon: 'Activity' },
  { id: 'orders',    label: '주문 관리', icon: 'Database' },
  { id: 'assets',    label: '자산',      icon: 'FileText' },
  { id: 'new',       label: '상품 등록', icon: 'Plus' },
]

export interface SidebarProps {
  activeTab: DashboardTab
  onTabChange: (tab: DashboardTab) => void
}

export function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  return (
    <div className="hidden md:flex w-[280px] flex-col h-screen pt-8 pb-6 pl-8 pr-4">
      <div className="mb-10 px-6 flex items-center">
        <button
          onClick={() => onTabChange('chat')}
          className="text-2xl font-bold text-black tracking-tight text-left hover:opacity-70 transition-opacity"
        >
          공구 관리 대시보드
        </button>
      </div>

      <nav className="flex-1 space-y-1.5 pr-2">
        {MENU_ITEMS.map((item) => {
          const Icon = ICONS[item.icon]
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={cn(
                'w-full flex items-center gap-3 px-4 py-3 rounded-full text-[14px] font-medium transition-all',
                activeTab === item.id
                  ? 'bg-black text-white shadow-sm'
                  : 'text-zinc-500 hover:bg-black/[0.04] hover:text-black'
              )}
            >
              <Icon size={16} strokeWidth={activeTab === item.id ? 2.5 : 2} />
              {item.label}
            </button>
          )
        })}
      </nav>
    </div>
  )
}
