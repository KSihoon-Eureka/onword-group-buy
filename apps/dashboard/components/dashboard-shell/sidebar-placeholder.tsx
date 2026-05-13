'use client'

/**
 * SidebarPlaceholder — W2 (@onword/ui Sidebar) 머지 전까지 임시 컴포넌트.
 *
 * 시그니처는 W1↔W2 합의된 SidebarProps와 동일.
 * W2 머지 후 (dashboard)/layout.tsx의 import 1줄만 `@onword/ui`로 교체.
 */

import type { Store } from '@onword/types'

export interface SidebarProps {
  currentStore: Store
  availableStores: Store[]
  userEmail: string
  activePath: string
  onSwitchStore: (storeId: string) => void | Promise<void>
  onLogout: () => void | Promise<void>
}

export function SidebarPlaceholder(props: SidebarProps) {
  const { currentStore, availableStores, userEmail, activePath, onLogout } = props
  return (
    <aside className="hidden md:flex w-[280px] shrink-0 flex-col h-screen pt-8 pb-6 pl-8 pr-4 border-r border-black/[0.04] bg-white">
      <div className="mb-6 px-2">
        <div className="text-[10px] uppercase tracking-wider text-zinc-400 mb-2">
          Sidebar — W2 placeholder
        </div>
        <div className="text-[14px] font-medium text-zinc-900">
          {currentStore.leadingEmoji} {currentStore.name}
        </div>
        <div className="text-[12px] text-zinc-500 mt-1">
          {availableStores.length}개 매장 멤버 · {userEmail}
        </div>
        <div className="text-[11px] text-zinc-400 mt-1">activePath: {activePath}</div>
      </div>

      <nav className="flex-1 space-y-1.5 pr-2 text-[14px] text-zinc-500">
        <div className="px-4 py-2">🤖 AI 비서</div>
        <div className="px-4 py-2">📊 공구 현황</div>
        <div className="px-4 py-2">🗂️ 주문 관리</div>
        <div className="px-4 py-2">📁 자산</div>
        <div className="px-4 py-2">➕ 상품 등록</div>
      </nav>

      <form action={onLogout} className="mt-6 px-2">
        <button
          type="submit"
          className="text-[13px] text-zinc-500 hover:text-zinc-900 transition-colors"
        >
          로그아웃
        </button>
      </form>
    </aside>
  )
}
