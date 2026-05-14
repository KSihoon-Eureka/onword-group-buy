/**
 * AI 비서 (홈) — PRD §9.5 / §14.
 *
 * Server Component: 활성 store + 본인 saved_flows 초기 로드 후
 * ChatView (smart) 에 props로 전달.
 *
 * 미인증 / 매장 없음은 layout / middleware가 이미 redirect 처리.
 * 여기 도달했다면 user + active_store_id 쿠키는 유효.
 */

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getServerSupabase } from '@/lib/supabase/server'
import { ACTIVE_STORE_COOKIE } from '@/lib/supabase/middleware'
import { rowToSavedFlow, type SavedFlowRow } from '@/lib/saved-flows/serialize'
import { fetchSummaryStats } from '@/lib/summary/fetch'
import { ChatView } from '@/components/views/ChatView'
import { SummaryStrip } from '@/components/views/SummaryStrip'

export default async function AIAssistantPage() {
  const supabase = getServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const storeId = cookies().get(ACTIVE_STORE_COOKIE)?.value
  if (!storeId) redirect('/select-store')

  const { data } = await supabase
    .from('saved_flows')
    .select(
      'id, store_id, user_id, name, prompt, icon, display_order, run_count, last_run_at, created_at, updated_at',
    )
    .eq('store_id', storeId)
    .eq('user_id', user.id)
    .order('run_count', { ascending: false })
    .order('display_order', { ascending: true })

  const flows = ((data ?? []) as SavedFlowRow[]).map(rowToSavedFlow)

  const summaryStats = await fetchSummaryStats(supabase, storeId)

  return (
    <div className="flex flex-col gap-6 px-4 md:px-8 pt-6 md:pt-8 pb-10">
      <SummaryStrip stats={summaryStats} />
      <div className="flex-1 min-h-0">
        <ChatView storeId={storeId} initialFlows={flows} />
      </div>
    </div>
  )
}
