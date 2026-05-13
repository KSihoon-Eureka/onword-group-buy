'use client'

/**
 * SavedFlows — AI 비서 empty state의 "저장된 플로우" 그리드 (dumb).
 * PRD §14 (Saved Flows) + §9.2 디자인 토큰.
 *
 * 책임 분리:
 *  - 데이터 fetch는 부모(smart)에서. 이 컴포넌트는 props만 받는다.
 *  - 클릭 → onSelect(flow) — 부모가 input fill (자동 전송 X).
 *  - "+ 새 플로우" / 편집 / 삭제 → 모달 state만 내부에서, 실제 mutation은 부모 콜백.
 */

import { useEffect, useRef, useState } from 'react'
import {
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  RefreshCcw,
  Mail,
  Calendar,
  Megaphone,
  Sparkles,
  Wand2,
  Send,
  X,
  type LucideIcon,
} from 'lucide-react'
import type { SavedFlow } from '@onword/types'
import { cn } from './cn'

export interface SavedFlowsProps {
  flows: SavedFlow[]
  onSelect: (flow: SavedFlow) => void
  onSaveNew: (input: { name: string; prompt: string; icon?: string }) => void | Promise<void>
  onEdit: (flow: SavedFlow) => void
  onDelete: (flowId: string) => void
}

const ICON_MAP: Record<string, LucideIcon> = {
  RefreshCcw,
  Mail,
  Calendar,
  Megaphone,
  Sparkles,
  Wand2,
  Send,
}

function FlowIcon({ name }: { name: string | null }) {
  const Component: LucideIcon = (name ? ICON_MAP[name] : undefined) ?? Sparkles
  return <Component size={16} className="text-zinc-700 shrink-0" />
}

export function SavedFlows({
  flows,
  onSelect,
  onSaveNew,
  onEdit,
  onDelete,
}: SavedFlowsProps) {
  const [modalOpen, setModalOpen] = useState(false)
  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpenFor) return
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpenFor(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [menuOpenFor])

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {flows.map((flow) => (
          <div
            key={flow.id}
            className="group relative bg-white border border-black/[0.04] rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.02)] hover:bg-black/[0.02] transition-all"
          >
            <button
              type="button"
              onClick={() => onSelect(flow)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left rounded-2xl"
            >
              <span className="w-8 h-8 rounded-full bg-zinc-50 flex items-center justify-center shrink-0">
                <FlowIcon name={flow.icon} />
              </span>
              <span className="flex-1 min-w-0 text-[13px] font-medium text-zinc-800 truncate">
                {flow.name}
              </span>
            </button>

            <div className="absolute top-1.5 right-1.5">
              <button
                type="button"
                aria-label="flow 메뉴"
                onClick={(e) => {
                  e.stopPropagation()
                  setMenuOpenFor((prev) => (prev === flow.id ? null : flow.id))
                }}
                className="p-1.5 rounded-full text-zinc-400 hover:text-zinc-700 hover:bg-black/[0.04] opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <MoreHorizontal size={14} />
              </button>

              {menuOpenFor === flow.id && (
                <div
                  ref={menuRef}
                  role="menu"
                  className="absolute right-0 top-full mt-1 bg-white border border-black/[0.04] rounded-xl shadow-[0_2px_12px_rgba(0,0,0,0.08)] p-1 z-10 min-w-[120px]"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpenFor(null)
                      onEdit(flow)
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] text-zinc-700 hover:bg-black/[0.04]"
                  >
                    <Pencil size={12} />
                    편집
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpenFor(null)
                      onDelete(flow.id)
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] text-red-600 hover:bg-red-50"
                  >
                    <Trash2 size={12} />
                    삭제
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex justify-center">
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-medium text-zinc-700 bg-white border border-black/[0.04] hover:bg-black/[0.04] transition-all"
        >
          <Plus size={14} />
          새 플로우 저장
        </button>
      </div>

      {modalOpen && (
        <NewFlowModal
          onClose={() => setModalOpen(false)}
          onSave={async (input) => {
            await onSaveNew(input)
            setModalOpen(false)
          }}
        />
      )}
    </div>
  )
}

interface NewFlowModalProps {
  onClose: () => void
  onSave: (input: { name: string; prompt: string; icon?: string }) => void | Promise<void>
}

function NewFlowModal({ onClose, onSave }: NewFlowModalProps) {
  const [name, setName] = useState('')
  const [prompt, setPrompt] = useState('')
  const [icon, setIcon] = useState<string>('Sparkles')
  const [submitting, setSubmitting] = useState(false)

  const canSubmit = name.trim().length > 0 && name.length <= 40 && prompt.trim().length > 0 && !submitting

  async function handleSubmit() {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      await onSave({ name: name.trim(), prompt, icon })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white rounded-3xl shadow-[0_10px_40px_rgba(0,0,0,0.12)] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-[17px] font-semibold text-zinc-900">새 플로우 저장</h2>
          <button
            type="button"
            aria-label="닫기"
            onClick={onClose}
            className="p-1.5 rounded-full text-zinc-400 hover:text-zinc-700 hover:bg-black/[0.04]"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
              이름 (최대 40자)
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              placeholder="예: 오늘 마감 상품 공고글 다시 만들기"
              className="px-3 py-2.5 rounded-xl border border-black/[0.08] text-[14px] outline-none focus:border-zinc-400"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
              프롬프트
            </span>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              placeholder="예: 오늘 마감인 모든 상품의 공고글을 다시 생성해줘"
              className="px-3 py-2.5 rounded-xl border border-black/[0.08] text-[14px] outline-none focus:border-zinc-400 resize-none"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
              아이콘
            </span>
            <div className="flex flex-wrap gap-2">
              {Object.keys(ICON_MAP).map((iconName) => (
                <button
                  key={iconName}
                  type="button"
                  onClick={() => setIcon(iconName)}
                  className={cn(
                    'w-9 h-9 rounded-full flex items-center justify-center transition-all',
                    icon === iconName
                      ? 'bg-black text-white shadow-sm'
                      : 'bg-zinc-50 text-zinc-600 hover:bg-zinc-100',
                  )}
                  aria-pressed={icon === iconName}
                  aria-label={iconName}
                >
                  <FlowIcon name={iconName} />
                </button>
              ))}
            </div>
          </label>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-full text-[13px] font-medium text-zinc-700 hover:bg-black/[0.04]"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={cn(
              'px-4 py-2 rounded-full text-[13px] font-medium transition-all',
              canSubmit
                ? 'bg-black text-white shadow-sm hover:bg-zinc-800'
                : 'bg-zinc-100 text-zinc-400 cursor-not-allowed',
            )}
          >
            저장
          </button>
        </div>
      </div>
    </div>
  )
}
