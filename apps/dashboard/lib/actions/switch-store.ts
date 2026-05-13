'use server'

/**
 * switchStoreAction — 매장 스위처 (PRD §5.3).
 *
 *  1. 세션 검증 (getUser)
 *  2. store_members로 멤버십 검증 — 타 store 시도 시 throw
 *  3. active_store_id 쿠키 set
 *  4. revalidatePath('/') — Sidebar / 페이지 재렌더
 */

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { getServerSupabase } from '../supabase/server'
import { isUserStoreMember } from '../auth/store-membership'
import {
  ACTIVE_STORE_COOKIE,
  activeStoreCookieOptions,
} from '../supabase/middleware'

export async function switchStoreAction(storeId: string): Promise<void> {
  if (typeof storeId !== 'string' || storeId.length === 0) {
    throw new Error('switchStoreAction: storeId required')
  }

  const supabase = getServerSupabase()
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser()

  if (userErr || !user) {
    throw new Error('switchStoreAction: unauthenticated')
  }

  const isMember = await isUserStoreMember(supabase, user.id, storeId)
  if (!isMember) {
    // 멤버 아닌 store로의 전환은 권한 위반.
    throw new Error('switchStoreAction: not a member of this store')
  }

  cookies().set(ACTIVE_STORE_COOKIE, storeId, activeStoreCookieOptions())
  revalidatePath('/', 'layout')
}
