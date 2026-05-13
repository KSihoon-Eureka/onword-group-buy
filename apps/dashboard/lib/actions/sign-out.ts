'use server'

/**
 * signOutAction — 로그아웃 (PLAN.md B.6).
 *
 *  1. supabase.auth.signOut() — 세션 쿠키 무효화
 *  2. active_store_id 쿠키 제거 (다음 로그인 시 stale 방지)
 *  3. /login redirect
 */

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getServerSupabase } from '../supabase/server'
import {
  ACTIVE_STORE_COOKIE,
  activeStoreCookieOptions,
} from '../supabase/middleware'

export async function signOutAction(): Promise<void> {
  const supabase = getServerSupabase()
  await supabase.auth.signOut()

  cookies().set(ACTIVE_STORE_COOKIE, '', {
    ...activeStoreCookieOptions(),
    maxAge: 0,
  })

  redirect('/login')
}
