/**
 * 사용자의 멤버 store 목록 조회.
 * RLS: store_members_select 정책이 user_id = auth.uid() 행만 반환 (PRD §4.13).
 */

import type { AppSupabase } from '../supabase/database.types'
import type { Store } from '@onword/types'

interface StoreRow {
  id: string
  name: string
  brand_name: string | null
  short_name: string | null
  leading_emoji: string
  primary_color: string
  accent_color: string
  wholesale_email: string | null
  wholesale_from_email: string
  owner_id: string
  created_at: string
  updated_at: string
}

function rowToStore(row: StoreRow): Store {
  return {
    id: row.id,
    name: row.name,
    brandName: row.brand_name,
    shortName: row.short_name,
    leadingEmoji: row.leading_emoji,
    primaryColor: row.primary_color,
    accentColor: row.accent_color,
    wholesaleEmail: row.wholesale_email,
    wholesaleFromEmail: row.wholesale_from_email,
    ownerId: row.owner_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/**
 * 현재 인증 사용자의 멤버 store 전체 목록. role 무관.
 * 호출자가 RLS 적용 supabase 클라이언트를 넘긴다.
 */
export async function getUserStores(
  supabase: AppSupabase,
): Promise<Store[]> {
  const { data, error } = await supabase
    .from('store_members')
    .select('stores(id, name, brand_name, short_name, leading_emoji, primary_color, accent_color, wholesale_email, wholesale_from_email, owner_id, created_at, updated_at)')

  if (error) {
    throw new Error(`getUserStores failed: ${error.message}`)
  }

  const rows = (data ?? []) as Array<{ stores: StoreRow | null }>
  return rows
    .map((r) => r.stores)
    .filter((s): s is StoreRow => s !== null)
    .map(rowToStore)
}

/**
 * 단일 store_id가 현재 사용자의 멤버 store인지 검증.
 * service role 클라이언트 사용 시 store_id 명시 필터 필수 (PRD §5.5).
 */
export async function isUserStoreMember(
  supabase: AppSupabase,
  userId: string,
  storeId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('store_members')
    .select('store_id')
    .eq('user_id', userId)
    .eq('store_id', storeId)
    .maybeSingle()

  if (error) {
    throw new Error(`isUserStoreMember failed: ${error.message}`)
  }
  return data !== null
}
