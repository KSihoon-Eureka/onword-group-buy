/**
 * /no-store — 인증됐지만 store_members 0개일 때 안내 페이지 (PRD §5.2).
 *
 * Sprint 1은 수동 user 생성 (PRD §5.4). 운영자에게 문의 메시지만.
 */

import { signOutAction } from '@/lib/actions/sign-out'

export const metadata = {
  title: '매장 없음 — 공구 관리 대시보드',
}

export default function NoStorePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F3F3F3] px-4">
      <div className="w-full max-w-md text-center">
        <h1 className="text-2xl font-bold text-black tracking-tight">
          매장이 없습니다
        </h1>
        <p className="mt-3 text-[13px] text-zinc-500">
          연결된 매장이 없는 계정입니다. 운영자에게 문의해주세요.
        </p>

        <form action={signOutAction} className="mt-8">
          <button
            type="submit"
            className="px-6 py-2.5 rounded-full bg-black text-white text-[14px] font-medium shadow-sm hover:bg-zinc-800 transition-colors"
          >
            로그아웃
          </button>
        </form>
      </div>
    </div>
  )
}
