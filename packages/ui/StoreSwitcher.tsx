'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import type { Store } from '@onword/types'
import { cn } from './cn'

export interface StoreSwitcherProps {
  currentStore: Store
  availableStores: Store[]
  onSwitch: (storeId: string) => void | Promise<void>
}

export function StoreSwitcher({
  currentStore,
  availableStores,
  onSwitch,
}: StoreSwitcherProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const hasMultiple = availableStores.length >= 2

  useEffect(() => {
    if (!open) return
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false)
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  function handleSelect(storeId: string) {
    setOpen(false)
    if (storeId !== currentStore.id) {
      void onSwitch(storeId)
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => hasMultiple && setOpen((v) => !v)}
        disabled={!hasMultiple}
        aria-haspopup={hasMultiple ? 'listbox' : undefined}
        aria-expanded={hasMultiple ? open : undefined}
        className={cn(
          'w-full flex items-center gap-2 px-4 py-3 rounded-2xl text-left transition-all',
          'bg-white border border-black/[0.04]',
          hasMultiple
            ? 'cursor-pointer hover:bg-black/[0.04]'
            : 'cursor-default'
        )}
      >
        <span className="text-[18px] leading-none shrink-0">
          {currentStore.leadingEmoji}
        </span>
        <span className="flex-1 min-w-0 text-[14px] font-semibold text-zinc-900 truncate">
          {currentStore.name}
        </span>
        {hasMultiple && (
          <ChevronDown
            size={16}
            className={cn(
              'shrink-0 text-zinc-500 transition-transform',
              open && 'rotate-180'
            )}
          />
        )}
      </button>

      {open && hasMultiple && (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-black/[0.04] rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.06)] p-1.5 z-20"
        >
          {availableStores.map((store) => {
            const isActive = store.id === currentStore.id
            return (
              <button
                key={store.id}
                type="button"
                role="option"
                aria-selected={isActive}
                onClick={() => handleSelect(store.id)}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-left text-[14px] font-medium transition-all',
                  isActive
                    ? 'bg-black/[0.04] text-zinc-900'
                    : 'text-zinc-700 hover:bg-black/[0.04]'
                )}
              >
                <span className="text-[16px] leading-none shrink-0">
                  {store.leadingEmoji}
                </span>
                <span className="flex-1 min-w-0 truncate">{store.name}</span>
                {isActive && (
                  <Check size={14} className="shrink-0 text-zinc-900" />
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
