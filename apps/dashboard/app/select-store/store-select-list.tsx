'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { Store } from '@onword/types'
import { switchStoreAction } from '@/lib/actions/switch-store'

export function StoreSelectList({ stores }: { stores: Store[] }) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleSelect(storeId: string) {
    startTransition(async () => {
      await switchStoreAction(storeId)
      router.push('/')
    })
  }

  return (
    <ul className="space-y-2">
      {stores.map((store) => (
        <li key={store.id}>
          <button
            type="button"
            disabled={isPending}
            onClick={() => handleSelect(store.id)}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-left text-[14px] font-medium text-zinc-900 hover:bg-black/[0.04] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="text-xl" aria-hidden>
              {store.leadingEmoji}
            </span>
            <span className="flex-1">{store.name}</span>
            <span className="text-[12px] text-zinc-400">선택</span>
          </button>
        </li>
      ))}
    </ul>
  )
}
