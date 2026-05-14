/**
 * @onword/db — Supabase 클라이언트 + DB 타입.
 * 
 * 사용 패턴:
 *   - 클라이언트 (브라우저): createBrowserClient() — anon key
 *   - 서버 (API routes, agent tools): createServiceClient() — service role key
 * 
 * service role 클라이언트는 RLS 우회. 절대 브라우저에 노출 금지.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'

// ==========================
// Database 타입 (data-model.md와 1:1)
// ==========================

export interface Database {
  public: {
    Tables: {
      products: {
        Row: {
          id: string
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
          flow_stage: string
          status: string
          urgency_banner: string | null
          source_image_urls: string[]
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['products']['Row'],
          'id' | 'created_at' | 'updated_at' | 'ordered_quantity' | 'flow_stage' | 'status'
        > & {
          id?: string
          ordered_quantity?: number
          flow_stage?: string
          status?: string
        }
        Update: Partial<Database['public']['Tables']['products']['Row']>
        Relationships: []
      }
      orders: {
        Row: {
          id: string
          product_id: string
          customer_name: string
          customer_phone: string | null
          quantity: number
          total_price: number
          status: string
          anomaly_detected: boolean
          anomaly_reason: string | null
          notes: string | null
          picked_up_at: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['orders']['Row'],
          'id' | 'created_at' | 'anomaly_detected' | 'status'
        > & {
          id?: string
          status?: string
          anomaly_detected?: boolean
        }
        Update: Partial<Database['public']['Tables']['orders']['Row']>
        Relationships: []
      }
      agent_traces: {
        Row: {
          id: string
          store_id: string
          product_id: string | null
          user_id: string | null
          action: string
          status: string
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
          action: string
          status?: string
          summary?: string | null
          error_message?: string | null
          started_at?: string
          completed_at?: string | null
        }
        Update: Partial<Database['public']['Tables']['agent_traces']['Row']>
        Relationships: []
      }
      trace_steps: {
        Row: {
          id: string
          trace_id: string
          step_order: number
          tool_name: string
          status: string
          input: Record<string, unknown> | null
          output: Record<string, unknown> | null
          summary: string | null
          started_at: string
          completed_at: string | null
          duration_ms: number | null
        }
        Insert: Omit<Database['public']['Tables']['trace_steps']['Row'], 'id'> & { id?: string }
        Update: Partial<Database['public']['Tables']['trace_steps']['Row']>
        Relationships: []
      }
      generated_assets: {
        Row: {
          id: string
          product_id: string | null
          trace_step_id: string | null
          type: string
          stage: string | null
          content: string | null
          asset_url: string | null
          metadata: Record<string, unknown> | null
          copied_at: string | null
          used_at: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['generated_assets']['Row'],
          'id' | 'created_at'
        > & { id?: string }
        Update: Partial<Database['public']['Tables']['generated_assets']['Row']>
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
