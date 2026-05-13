/**
 * Dashboard-local Database 타입 — packages/db의 Database를 확장.
 *
 * packages/db/index.ts의 Database 타입은 Phase A 스켈레톤 시점 작성으로
 * 마이그레이션 0002 (stores, store_members)와 0003-0004의 컬럼 추가가 반영 안 됨.
 * Phase D에서 packages/db를 정리할 예정 (PLAN.md A.10 expected 상태).
 *
 * 워커 단위 확장:
 *  - B1 (auth backbone) → stores, store_members
 *  - C1 (상품 등록) → products에 store_id / primary_image_url / archived_at / pickup_deadline 컬럼 추가
 */

import type { Database as BaseDatabase } from '@onword/db'
import type { createServerClient } from '@supabase/ssr'

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

interface StoreMemberRow {
  store_id: string
  user_id: string
  role: 'owner' | 'staff'
  joined_at: string
}

interface SavedFlowRow {
  id: string
  store_id: string
  user_id: string
  name: string
  prompt: string
  icon: string | null
  display_order: number
  run_count: number
  last_run_at: string | null
  created_at: string
  updated_at: string
}

type BaseProductRow = BaseDatabase['public']['Tables']['products']['Row']
type ProductRow = BaseProductRow & {
  store_id: string
  primary_image_url: string | null
  archived_at: string | null
}
type ProductInsert = Omit<ProductRow, 'id' | 'created_at' | 'updated_at' | 'ordered_quantity'> & {
  id?: string
  ordered_quantity?: number
  created_at?: string
  updated_at?: string
}

type OverriddenTables = Omit<BaseDatabase['public']['Tables'], 'products'> & {
  stores: {
    Row: StoreRow
    Insert: Partial<StoreRow> & {
      name: string
      owner_id: string
    }
    Update: Partial<StoreRow>
  }
  store_members: {
    Row: StoreMemberRow
    Insert: StoreMemberRow
    Update: Partial<StoreMemberRow>
  }
  products: {
    Row: ProductRow
    Insert: ProductInsert
    Update: Partial<ProductRow>
  }
  saved_flows: {
    Row: SavedFlowRow
    Insert: {
      id?: string
      store_id: string
      user_id: string
      name: string
      prompt: string
      icon?: string | null
      display_order?: number
      run_count?: number
      last_run_at?: string | null
      created_at?: string
      updated_at?: string
    }
    Update: {
      id?: string
      store_id?: string
      user_id?: string
      name?: string
      prompt?: string
      icon?: string | null
      display_order?: number
      run_count?: number
      last_run_at?: string | null
      created_at?: string
      updated_at?: string
    }
  }
}

export interface Database {
  public: Omit<BaseDatabase['public'], 'Tables'> & {
    Tables: OverriddenTables
  }
}

/**
 * 공통 SupabaseClient 별칭 — getServerSupabase / createMiddlewareSupabase /
 * getBrowserSupabase 셋이 모두 동일 구조의 클라이언트를 반환한다.
 * helper 함수 시그니처에 이 타입을 사용하면 generic 추론 불일치를 방지한다.
 */
export type AppSupabase = ReturnType<typeof createServerClient<Database>>
