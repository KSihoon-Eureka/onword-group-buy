import { Plus } from 'lucide-react'

export default function NewProductPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-4 text-center">
      <div className="rounded-full bg-zinc-100 p-6">
        <Plus size={48} className="text-zinc-700" strokeWidth={1.5} />
      </div>
      <h1 className="text-2xl font-bold text-black tracking-tight">상품 등록</h1>
      <p className="text-[14px] text-zinc-500">
        상품 등록 폼이 곧 추가됩니다
      </p>
    </div>
  )
}
