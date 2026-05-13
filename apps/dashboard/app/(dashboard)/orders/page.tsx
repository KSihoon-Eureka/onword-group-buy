import { Inbox } from 'lucide-react'

export default function OrdersPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-4 text-center">
      <div className="rounded-full bg-zinc-100 p-6">
        <Inbox size={48} className="text-zinc-700" strokeWidth={1.5} />
      </div>
      <h1 className="text-2xl font-bold text-black tracking-tight">
        주문 데이터가 곧 추가될 예정입니다
      </h1>
      <p className="text-[14px] text-zinc-500 max-w-md leading-relaxed">
        apps/order-web (고객 주문 페이지)이 출시되면
        <br />
        여기에 실시간 주문 목록이 표시됩니다.
      </p>
    </div>
  )
}
