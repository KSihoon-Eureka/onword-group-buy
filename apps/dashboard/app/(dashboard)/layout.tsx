/**
 * (dashboard) route group layout — 인증 필수 경로 공통 shell (PRD §9.3, §15.2).
 *
 * Server Component:
 *  1. 미들웨어가 이미 redirect 처리하지만, layout에서도 방어적으로 user / store 검증.
 *  2. user, stores, activeStore, pathname 로드.
 *  3. Sidebar (W2 dumb component) 마운트 — switchStoreAction / signOutAction 주입.
 */

import { headers } from 'next/headers'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { Sidebar } from '@onword/ui'
import { NotificationBell } from '@/components/shell/NotificationBell'
import { fetchSidebarNotifications } from '@/lib/notifications/fetch'
import { getServerSupabase } from '@/lib/supabase/server'
import { getUserStores } from '@/lib/auth/store-membership'
import { ACTIVE_STORE_COOKIE } from '@/lib/supabase/middleware'
import { PATHNAME_HEADER } from '@/middleware'
import { switchStoreAction } from '@/lib/actions/switch-store'
import { signOutAction } from '@/lib/actions/sign-out'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = getServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const stores = await getUserStores(supabase)
  if (stores.length === 0) redirect('/no-store')

  const cookieStore = cookies()
  const activeStoreId = cookieStore.get(ACTIVE_STORE_COOKIE)?.value ?? null

  const currentStore =
    (activeStoreId && stores.find((s) => s.id === activeStoreId)) ||
    (stores.length === 1 ? stores[0] : null)

  if (!currentStore) redirect('/select-store')

  const activePath = headers().get(PATHNAME_HEADER) ?? '/'

  const notifications = await fetchSidebarNotifications(supabase, currentStore.id)

  return (
    <div className="flex flex-col md:flex-row h-screen font-sans text-zinc-900 bg-[#F3F3F3] overflow-hidden selection:bg-black selection:text-white">
      <Sidebar
        currentStore={currentStore}
        availableStores={stores}
        userEmail={user.email!}
        activePath={activePath}
        onSwitchStore={switchStoreAction}
        onLogout={signOutAction}
      />

      <main className="flex-1 flex flex-col overflow-hidden relative px-4 pb-4 pt-2 md:pt-6 md:pb-6 md:pr-6 md:pl-2">
        {/* Top right NotificationBell — 모든 페이지에 persistent. */}
        <div className="absolute top-4 right-4 md:top-6 md:right-6 z-40">
          <NotificationBell notifications={notifications} />
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto relative">
          {children}
        </div>
      </main>
    </div>
  )
}
