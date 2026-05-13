import { BarChart3 } from 'lucide-react'

export default function CampaignsPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-4 text-center">
      <div className="rounded-full bg-zinc-100 p-6">
        <BarChart3 size={48} className="text-zinc-700" strokeWidth={1.5} />
      </div>
      <h1 className="text-2xl font-bold text-black tracking-tight">공구 현황</h1>
      <p className="text-[14px] text-zinc-500">
        공구 캠페인 목록이 곧 표시됩니다
      </p>
    </div>
  )
}
