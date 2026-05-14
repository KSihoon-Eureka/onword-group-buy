/**
 * @onword/db — Supabase 클라이언트 + DB 타입 (Phase D 통합 본).
 *
 * 사용 패턴:
 *   - 클라이언트 (브라우저): createBrowserClient() — anon key
 *   - 서버 (API routes, agent tools): createServiceClient() — service role key
 *
 * service role 클라이언트는 RLS 우회. 절대 브라우저에 노출 금지.
 *
 * Database 타입:
 *   - supabase/migrations/0001-0006 의 모든 컬럼/제약을 반영.
 *   - 10 tables: stores, store_members, products, orders, agent_traces,
 *     trace_steps, generated_assets, saved_flows, audit_log, phone_access_log.
 *   - Single source of truth — dashboard / agent 양쪽이 이 타입을 사용.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'

// ==========================
// Domain enum helpers (string literal types)
// ==========================

export type FlowStageDb =
  | 'product_registered'
  | 'announcement_1'
  | 'order_open'
  | 'order_closed'
  | 'stock_confirmed'
  | 'warehouse_notified'
  | 'arrived'
  | 'pickup_ready'
  | 'completed'

export type ProductStatusDb = 'active' | 'closed' | 'cancelled'

export type OrderStatusDb =
  | 'pending'
  | 'confirmed'
  | 'picked_up'
  | 'cancelled'
  | 'no_show'

export type TraceStatusDb = 'running' | 'completed' | 'failed' | 'cancelled'

export type StepStatusDb = 'pending' | 'running' | 'done' | 'error'

export type ActionDb =
  | 'start_campaign'
  | 'compose_poster'
  | 'close_orders'
  | 'notify_warehouse'
  | 'announce_pickup'
  | 'urgent_alert'
  | 'free_text'

export type StoreMemberRoleDb = 'owner' | 'staff'

export type AssetTypeDb =
  | 'announcement_stage1'
  | 'announcement_stage2'
  | 'announcement_stage3'
  | 'price_emphasis_text'
  | 'price_compare_image'
  | 'price_compare_data'
  | 'product_image'
  | 'poster'
  | 'pickup_table_image'
  | 'pickup_table_text'
  | 'wholesale_email'

export type AuditEntityTypeDb = 'product' | 'order' | 'asset' | 'flow' | 'store'

export type AuditActionDb =
  | 'create'
  | 'update'
  | 'archive'
  | 'restore'
  | 'flow_stage_change'
  | 'asset_supersede'
  | 'auto_no_show'

export type PhoneAccessActionDb = 'view' | 'edit' | 'export' | 'delete'

// ==========================
// Database (migrations 0001-0006 1:1)
// ==========================

export interface Database {
  public: {
    Tables: {
      // -------------------- stores (0002) --------------------
      stores: {
        Row: {
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
        Insert: {
          id?: string
          name: string
          brand_name?: string | null
          short_name?: string | null
          leading_emoji?: string
          primary_color?: string
          accent_color?: string
          wholesale_email?: string | null
          wholesale_from_email?: string
          owner_id: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['stores']['Row']>
        Relationships: []
      }

      // -------------------- store_members (0002) --------------------
      store_members: {
        Row: {
          store_id: string
          user_id: string
          role: StoreMemberRoleDb
          joined_at: string
        }
        Insert: {
          store_id: string
          user_id: string
          role: StoreMemberRoleDb
          joined_at?: string
        }
        Update: Partial<Database['public']['Tables']['store_members']['Row']>
        Relationships: []
      }

      // -------------------- products (0001 + 0002 store_id + 0004 primary_image_url/archived_at) --------------------
      products: {
        Row: {
          id: string
          store_id: string
          name: string
          description: string | null
          category: string | null
          price: number
          compare_price: number | null
          stock_quantity: number
          ordered_quantity: number
          expiry_date: string | null
          order_deadline: string
          pickup_date: string
          pickup_deadline: string
          source_image_urls: string[]
          primary_image_url: string | null
          flow_stage: FlowStageDb
          status: ProductStatusDb
          urgency_banner: string | null
          archived_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          store_id: string
          name: string
          description?: string | null
          category?: string | null
          price: number
          compare_price?: number | null
          stock_quantity: number
          ordered_quantity?: number
          expiry_date?: string | null
          order_deadline: string
          pickup_date: string
          pickup_deadline: string
          source_image_urls?: string[]
          primary_image_url?: string | null
          flow_stage?: FlowStageDb
          status?: ProductStatusDb
          urgency_banner?: string | null
          archived_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['products']['Row']>
        Relationships: []
      }

      // -------------------- orders (0001 + 0002 store_id + 0004 phone_consent_at) --------------------
      orders: {
        Row: {
          id: string
          store_id: string
          product_id: string
          customer_name: string
          customer_phone: string | null
          phone_consent_at: string
          quantity: number
          total_price: number
          status: OrderStatusDb
          anomaly_detected: boolean
          anomaly_reason: string | null
          notes: string | null
          picked_up_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          store_id?: string // trigger copy_store_id_to_order로 자동 복제 가능
          product_id: string
          customer_name: string
          customer_phone?: string | null
          phone_consent_at: string
          quantity: number
          total_price: number
          status?: OrderStatusDb
          anomaly_detected?: boolean
          anomaly_reason?: string | null
          notes?: string | null
          picked_up_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['orders']['Row']>
        Relationships: []
      }

      // -------------------- agent_traces (0001 + 0002 store_id/user_id + 0005 free_text) --------------------
      agent_traces: {
        Row: {
          id: string
          store_id: string
          product_id: string | null
          user_id: string | null
          action: ActionDb
          status: TraceStatusDb
          summary: string | null
          error_message: string | null
          started_at: string
          completed_at: string | null
        }
        Insert: {
          id?: string
          store_id: string
          product_id?: string | null
          user_id?: string | null
          action: ActionDb
          status?: TraceStatusDb
          summary?: string | null
          error_message?: string | null
          started_at?: string
          completed_at?: string | null
        }
        Update: Partial<Database['public']['Tables']['agent_traces']['Row']>
        Relationships: []
      }

      // -------------------- trace_steps (0001) --------------------
      trace_steps: {
        Row: {
          id: string
          trace_id: string
          step_order: number
          tool_name: string
          status: StepStatusDb
          input: Record<string, unknown> | null
          output: Record<string, unknown> | null
          summary: string | null
          started_at: string
          completed_at: string | null
          duration_ms: number | null
        }
        Insert: {
          id?: string
          trace_id: string
          step_order: number
          tool_name: string
          status?: StepStatusDb
          input?: Record<string, unknown> | null
          output?: Record<string, unknown> | null
          summary?: string | null
          started_at?: string
          completed_at?: string | null
          duration_ms?: number | null
        }
        Update: Partial<Database['public']['Tables']['trace_steps']['Row']>
        Relationships: []
      }

      // -------------------- generated_assets (0001 + 0002 store_id + 0004 supersede) --------------------
      generated_assets: {
        Row: {
          id: string
          store_id: string
          product_id: string | null
          trace_step_id: string | null
          type: AssetTypeDb
          stage: string | null
          content: string | null
          asset_url: string | null
          metadata: Record<string, unknown> | null
          copied_at: string | null
          used_at: string | null
          superseded_at: string | null
          superseded_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          store_id: string
          product_id?: string | null
          trace_step_id?: string | null
          type: AssetTypeDb
          stage?: string | null
          content?: string | null
          asset_url?: string | null
          metadata?: Record<string, unknown> | null
          copied_at?: string | null
          used_at?: string | null
          superseded_at?: string | null
          superseded_by?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['generated_assets']['Row']>
        Relationships: []
      }

      // -------------------- saved_flows (0003) --------------------
      saved_flows: {
        Row: {
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
        Update: Partial<Database['public']['Tables']['saved_flows']['Row']>
        Relationships: []
      }

      // -------------------- audit_log (0003) --------------------
      audit_log: {
        Row: {
          id: string
          store_id: string
          user_id: string | null
          entity_type: AuditEntityTypeDb
          entity_id: string
          action: AuditActionDb
          changes: Record<string, unknown> | null
          created_at: string
        }
        Insert: {
          id?: string
          store_id: string
          user_id?: string | null
          entity_type: AuditEntityTypeDb
          entity_id: string
          action: AuditActionDb
          changes?: Record<string, unknown> | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['audit_log']['Row']>
        Relationships: []
      }

      // -------------------- phone_access_log (0003) --------------------
      phone_access_log: {
        Row: {
          id: string
          store_id: string
          user_id: string | null
          order_id: string | null
          action: PhoneAccessActionDb
          reason: string | null
          ip_address: string | null
          user_agent: string | null
          created_at: string
        }
        Insert: {
          id?: string
          store_id: string
          user_id?: string | null
          order_id?: string | null
          action: PhoneAccessActionDb
          reason?: string | null
          ip_address?: string | null
          user_agent?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['phone_access_log']['Row']>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
  }
}

// ==========================
// 클라이언트 생성자
// ==========================

let _service: SupabaseClient<Database> | null = null
let _browser: SupabaseClient<Database> | null = null

/**
 * 서버 사이드 클라이언트.
 * Service role key 사용 - RLS 우회.
 * API routes, agent tools, cron jobs에서만 사용.
 * 절대 브라우저로 전송 금지.
 */
export function createServiceClient(): SupabaseClient<Database> {
  if (_service) return _service

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error(
      'Missing Supabase env: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'
    )
  }

  _service = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return _service
}

/**
 * 브라우저 클라이언트.
 * Anon key 사용 - RLS 적용됨.
 * 'use client' 컴포넌트에서 사용.
 */
export function createBrowserClient(): SupabaseClient<Database> {
  if (_browser) return _browser

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    throw new Error(
      'Missing Supabase env: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY'
    )
  }

  _browser = createClient<Database>(url, key)
  return _browser
}

// ==========================
// Storage helpers
// ==========================

/**
 * Supabase Storage에 파일 업로드 후 public URL 반환.
 * 버킷이 존재하지 않으면 throw.
 */
export async function uploadToStorage(
  path: string,
  buffer: Buffer,
  contentType: string,
  bucket = 'assets'
): Promise<string> {
  const supabase = createServiceClient()

  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, buffer, {
      contentType,
      upsert: true,
    })

  if (error) {
    throw new Error(`Storage upload failed: ${error.message}`)
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  return data.publicUrl
}
