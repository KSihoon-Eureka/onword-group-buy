'use client'

/**
 * ChatView — AI 비서 메인 view (smart container).
 * PRD §9.5 + §14 (Saved Flows).
 *
 * 책임:
 *  - 메시지 history (local state)
 *  - 메시지 전송 → POST /api/agent/run (W6 인터페이스 계약)
 *  - empty state → SavedFlows (dumb, @onword/ui) 마운트
 *  - 새 대화 버튼 → history 초기화 (empty state 복귀)
 *  - SavedFlows CRUD → /api/saved-flows[/id] 호출
 *  - ExecutionTracePanel 자리 placeholder — C.4 머지 시 컴포넌트 import 교체
 */

import { useState, type KeyboardEvent } from 'react'
import { Bot, Plus, Send } from 'lucide-react'
import { SavedFlows } from '@onword/ui'
import type { SavedFlow } from '@onword/types'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  traceId?: string
  isError?: boolean
}

interface ChatViewProps {
  storeId: string
  initialFlows: SavedFlow[]
}

interface RunAgentResponse {
  traceId?: string
  status?: string
  error?: string
}

function randomId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return Math.random().toString(36).slice(2)
}

export function ChatView({ storeId, initialFlows }: ChatViewProps) {
  const [flows, setFlows] = useState<SavedFlow[]>(initialFlows)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [activeTraceId, setActiveTraceId] = useState<string | null>(null)

  const hasConversation = messages.length > 0

  async function refreshFlows() {
    try {
      const res = await fetch('/api/saved-flows', { method: 'GET' })
      if (!res.ok) return
      const data = (await res.json()) as { flows: SavedFlow[] }
      setFlows(data.flows)
    } catch {
      // 무시: 캐시된 목록 유지
    }
  }

  function handleSelectFlow(flow: SavedFlow) {
    setInput(flow.prompt)
  }

  async function handleSaveNew(input: { name: string; prompt: string; icon?: string }) {
    const res = await fetch('/api/saved-flows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    if (res.ok) {
      await refreshFlows()
    } else {
      console.error('[ChatView] save flow failed', await res.text())
    }
  }

  async function handleEditFlow(flow: SavedFlow) {
    const nextName = window.prompt('플로우 이름', flow.name)
    if (nextName === null) return
    const nextPrompt = window.prompt('프롬프트', flow.prompt)
    if (nextPrompt === null) return

    const res = await fetch(`/api/saved-flows/${flow.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nextName, prompt: nextPrompt }),
    })
    if (res.ok) {
      await refreshFlows()
    } else {
      console.error('[ChatView] edit flow failed', await res.text())
    }
  }

  async function handleDeleteFlow(flowId: string) {
    const ok = window.confirm('이 플로우를 삭제할까요?')
    if (!ok) return
    const res = await fetch(`/api/saved-flows/${flowId}`, { method: 'DELETE' })
    if (res.ok) {
      setFlows((prev) => prev.filter((f) => f.id !== flowId))
    } else {
      console.error('[ChatView] delete flow failed', await res.text())
    }
  }

  function startNewConversation() {
    setMessages([])
    setActiveTraceId(null)
    setInput('')
  }

  async function handleSend() {
    const text = input.trim()
    if (!text || sending) return

    const userMsg: ChatMessage = { id: randomId(), role: 'user', content: text }
    const placeholderId = randomId()
    const placeholder: ChatMessage = {
      id: placeholderId,
      role: 'assistant',
      content: '실행 시작...',
    }
    setMessages((prev) => [...prev, userMsg, placeholder])
    setInput('')
    setSending(true)

    try {
      const res = await fetch('/api/agent/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId,
          action: 'free_text',
          message: text,
        }),
      })

      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as RunAgentResponse
        setMessages((prev) =>
          prev.map((m) =>
            m.id === placeholderId
              ? { ...m, content: `실행 실패 (${res.status}${errBody.error ? ` · ${errBody.error}` : ''})`, isError: true }
              : m,
          ),
        )
        return
      }

      const data = (await res.json()) as RunAgentResponse
      const traceId = data.traceId ?? null
      if (traceId) setActiveTraceId(traceId)

      setMessages((prev) =>
        prev.map((m) =>
          m.id === placeholderId
            ? {
                ...m,
                content: traceId
                  ? `실행 시작 (trace: ${traceId.slice(0, 8)}…)`
                  : '실행 시작...',
                traceId: traceId ?? undefined,
              }
            : m,
        ),
      )
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === placeholderId
            ? {
                ...m,
                content: `네트워크 오류: ${err instanceof Error ? err.message : '알 수 없음'}`,
                isError: true,
              }
            : m,
        ),
      )
    } finally {
      setSending(false)
    }
  }

  function handleInputKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  return (
    <div className="h-full flex flex-col md:flex-row gap-4 md:gap-6 px-2 md:px-6 py-4 md:py-6">
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">AI 비서</h1>
          {hasConversation && (
            <button
              type="button"
              onClick={startNewConversation}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-medium text-zinc-700 bg-white border border-black/[0.04] hover:bg-black/[0.04] transition-all"
            >
              <Plus size={14} />
              새 대화
            </button>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {!hasConversation ? (
            <div className="h-full flex flex-col items-center justify-center gap-5">
              <div className="rounded-full bg-zinc-50 p-5">
                <Bot size={36} className="text-zinc-700" strokeWidth={1.5} />
              </div>
              <p className="text-[15px] font-medium text-zinc-700">무엇을 도와드릴까요?</p>
              <SavedFlows
                flows={flows}
                onSelect={handleSelectFlow}
                onSaveNew={handleSaveNew}
                onEdit={handleEditFlow}
                onDelete={handleDeleteFlow}
              />
            </div>
          ) : (
            <div className="flex flex-col gap-3 max-w-2xl mx-auto w-full">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={
                    msg.role === 'user'
                      ? 'self-end max-w-[80%] px-4 py-2.5 rounded-3xl bg-black text-white text-[14px]'
                      : msg.isError
                        ? 'self-start max-w-[80%] px-4 py-2.5 rounded-3xl bg-red-50 text-red-700 text-[14px] border border-red-200'
                        : 'self-start max-w-[80%] px-4 py-2.5 rounded-3xl bg-white text-zinc-800 text-[14px] border border-black/[0.04]'
                  }
                >
                  {msg.content}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 max-w-2xl mx-auto w-full">
          <div className="flex items-end gap-2 bg-white rounded-3xl border border-black/[0.04] p-2 shadow-[0_2px_12px_rgba(0,0,0,0.02)]">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleInputKeyDown}
              rows={1}
              placeholder="메시지 입력..."
              className="flex-1 resize-none bg-transparent px-3 py-2 text-[14px] outline-none placeholder:text-zinc-400 max-h-32"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={!input.trim() || sending}
              aria-label="보내기"
              className={
                input.trim() && !sending
                  ? 'w-9 h-9 rounded-full bg-black text-white flex items-center justify-center shadow-sm hover:bg-zinc-800 transition-all'
                  : 'w-9 h-9 rounded-full bg-zinc-100 text-zinc-400 flex items-center justify-center cursor-not-allowed'
              }
            >
              <Send size={14} />
            </button>
          </div>
        </div>
      </div>

      {/*
        ExecutionTracePanel 자리 (C.4).
        활성 trace가 있을 때만 표시 (placeholder는 정보 안내).
      */}
      <aside
        className="hidden md:block md:w-[360px] shrink-0"
        aria-label="실행 상태 패널"
      >
        <div className="h-full bg-white border border-black/[0.04] rounded-3xl p-6 flex flex-col">
          <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-400 mb-2">
            실행 상태
          </div>
          <div className="flex-1 flex items-center justify-center text-center text-[13px] text-zinc-400">
            {activeTraceId
              ? `실행 상태가 곧 표시됩니다 (trace: ${activeTraceId.slice(0, 8)}…)`
              : '실행 상태가 곧 표시됩니다'}
          </div>
        </div>
      </aside>
    </div>
  )
}
