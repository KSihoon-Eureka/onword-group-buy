import { Bot } from 'lucide-react'

export default function AIAssistantPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-4 text-center">
      <div className="rounded-full bg-zinc-100 p-6">
        <Bot size={48} className="text-zinc-700" strokeWidth={1.5} />
      </div>
      <h1 className="text-2xl font-bold text-black tracking-tight">AI 비서</h1>
      <p className="text-[14px] text-zinc-500">
        무엇을 도와드릴까요? (곧 활성화)
      </p>
    </div>
  )
}
