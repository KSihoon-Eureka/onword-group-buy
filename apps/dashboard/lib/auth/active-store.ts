/**
 * API route용 인증 + active store 추출 헬퍼.
 *
 * 흐름:
 *  1. getServerSupabase().auth.getUser()
 *  2. 쿠키 `active_store_id` 조회
 *  3. store_members로 멤버십 검증 (cross-store 방어 — service role 사용 시 RLS 우회되므로 코드 레벨 필수)
 *
 * 라우트는 결과의 type 분기로 401 / 403 / 200 응답을 만든다.
 */

import { cookies } from 'next/headers'
import { getServerSupabase } from '../supabase/server'
import { isUserStoreMember } from './store-membership'
import { ACTIVE_STORE_COOKIE } from '../supabase/middleware'

export type ActiveStoreResult =
  | { type: 'unauthenticated' }
  | { type: 'no_active_store' }
  | { type: 'not_member' }
  | { type: 'ok'; userId: string; storeId: string }

export async function resolveActiveStore(): Promise<ActiveStoreResult> {
  const supabase = getServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { type: 'unauthenticated' }

  const storeId = cookies().get(ACTIVE_STORE_COOKIE)?.value
  if (!storeId) return { type: 'no_active_store' }

  const isMember = await isUserStoreMember(supabase, user.id, storeId)
  if (!isMember) return { type: 'not_member' }

  return { type: 'ok', userId: user.id, storeId }
}
