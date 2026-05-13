/**
 * Browser Supabase client — 'use client' 컴포넌트 전용.
 * Anon key + 쿠키 기반 세션. RLS 적용.
 */

import { createBrowserClient } from '@supabase/ssr'
import type { Database } from './database.types'

export function getBrowserSupabase() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
