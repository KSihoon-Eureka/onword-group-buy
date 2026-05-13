import { FolderOpen } from 'lucide-react'

export default function AssetsPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-4 text-center">
      <div className="rounded-full bg-zinc-100 p-6">
        <FolderOpen size={48} className="text-zinc-700" strokeWidth={1.5} />
      </div>
      <h1 className="text-2xl font-bold text-black tracking-tight">자산</h1>
      <p className="text-[14px] text-zinc-500">
        AI가 생성한 자산이 곧 표시됩니다
      </p>
    </div>
  )
}
