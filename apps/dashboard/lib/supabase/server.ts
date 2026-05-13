/**
 * Server Supabase client — Server Components, Route Handlers, Server Actions 전용.
 * Anon key + 요청 쿠키. RLS 적용 (auth.uid()로 사용자 식별).
 *
 * Service Role 사용은 PRD §5.5 — 별도 helper 필요 시 packages/db createServiceClient() 직접 호출.
 */

import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from './database.types'

export function getServerSupabase() {
  const cookieStore = cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          } catch {
            // Server Components 내부에서는 cookie 설정 불가 — middleware가 갱신함.
          }
        },
      },
    },
  )
}
