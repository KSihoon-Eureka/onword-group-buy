/**
 * Middleware Supabase client + 세션 새로고침.
 *
 * Next.js 14 App Router에서 미들웨어는 매 요청마다 세션 토큰을 갱신해야 한다.
 * 그렇지 않으면 만료된 토큰으로 Server Components가 401을 받는다.
 */

import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { Database } from './database.types'

export function createMiddlewareSupabase(
  request: NextRequest,
  response: NextResponse,
) {
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          )
        },
      },
    },
  )
}

export const ACTIVE_STORE_COOKIE = 'active_store_id'

export function activeStoreCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 days
  }
}
