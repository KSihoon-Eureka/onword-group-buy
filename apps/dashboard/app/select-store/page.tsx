/**
 * /select-store — 멤버 2+ 매장 사용자가 진입 매장 선택 (PLAN.md B.7, PRD §5.2).
 *
 * 미들웨어가 멤버 1개 / 0개 / 미인증을 이미 redirect하므로 여기 도달 = 멤버 2+.
 * 그래도 방어적으로 다시 fetch (한 매장이면 자동 이동).
 */

import { redirect } from 'next/navigation'
import { getServerSupabase } from '@/lib/supabase/server'
import { getUserStores } from '@/lib/auth/store-membership'
import { StoreSelectList } from './store-select-list'

export const metadata = {
  title: '매장 선택 — 공구 관리 대시보드',
}

export default async function SelectStorePage() {
  const supabase = getServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const stores = await getUserStores(supabase)

  if (stores.length === 0) redirect('/no-store')
  if (stores.length === 1) redirect('/')

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F3F3F3] px-4">
      <div className="w-full max-w-md">
        <div className="mb-10 text-center">
          <h1 className="text-2xl font-bold text-black tracking-tight">매장 선택</h1>
          <p className="mt-2 text-[13px] text-zinc-500">
            관리할 매장을 선택해주세요.
          </p>
        </div>

        <div className="bg-white rounded-[32px] border border-black/[0.04] shadow-[0_2px_12px_rgba(0,0,0,0.02)] p-4">
          <StoreSelectList stores={stores} />
        </div>
      </div>
    </div>
  )
}
