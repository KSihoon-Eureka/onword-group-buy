'use client'

import { LogOut } from 'lucide-react'
import type { Store } from '@onword/types'
import { cn } from './cn'
import { StoreSwitcher } from './StoreSwitcher'

export interface SidebarProps {
  currentStore: Store
  availableStores: Store[]
  userEmail: string
  activePath: string
  onSwitchStore: (storeId: string) => void | Promise<void>
  onLogout: () => void | Promise<void>
}

type MenuItem = {
  emoji: string
  label: string
  path: string
}

const MENU_ITEMS: MenuItem[] = [
  { emoji: '🤖', label: 'AI 비서',   path: '/' },
  { emoji: '📊', label: '공구 현황', path: '/campaigns' },
  { emoji: '🗂️', label: '주문 관리', path: '/orders' },
  { emoji: '📁', label: '자산',      path: '/assets' },
  { emoji: '➕', label: '상품 등록', path: '/new' },
]

function isMenuActive(activePath: string, itemPath: string): boolean {
  if (itemPath === '/') return activePath === '/'
  return activePath === itemPath || activePath.startsWith(itemPath + '/')
}

export function Sidebar({
  currentStore,
  availableStores,
  userEmail,
  activePath,
  onSwitchStore,
  onLogout,
}: SidebarProps) {
  return (
    <aside className="hidden md:flex w-[280px] flex-col h-screen pt-8 pb-6 pl-8 pr-4 shrink-0">
      <div className="mb-6">
        <StoreSwitcher
          currentStore={currentStore}
          availableStores={availableStores}
          onSwitch={onSwitchStore}
        />
      </div>

      <nav className="flex-1 space-y-1.5 overflow-y-auto pr-1">
        {MENU_ITEMS.map((item) => {
          const active = isMenuActive(activePath, item.path)
          return (
            <a
              key={item.path}
              href={item.path}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'w-full flex items-center gap-3 px-4 py-3 rounded-full text-[14px] font-medium transition-all',
                active
                  ? 'bg-black text-white shadow-sm'
                  : 'text-zinc-500 hover:bg-black/[0.04] hover:text-black'
              )}
            >
              <span className="text-[16px] leading-none">{item.emoji}</span>
              <span>{item.label}</span>
            </a>
          )
        })}
      </nav>

      <div className="mt-4 pt-4 border-t border-black/[0.04] px-4">
        <p className="text-[12px] text-zinc-500 truncate mb-2" title={userEmail}>
          {userEmail}
        </p>
        <button
          type="button"
          onClick={() => void onLogout()}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-[13px] font-medium text-zinc-700 hover:bg-black/[0.04] hover:text-black transition-all"
        >
          <LogOut size={14} strokeWidth={2} />
          <span>로그아웃</span>
        </button>
      </div>
    </aside>
  )
}
