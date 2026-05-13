/**
 * Auth middleware — PRD §5.2 로그인 흐름.
 *
 * 매 요청마다:
 *  1. Supabase 세션 토큰 갱신 (createMiddlewareSupabase)
 *  2. user / stores / active_store_id 쿠키 / path 기반 redirect 결정 (decideAuth)
 *  3. 필요 시 active_store_id 쿠키 set 또는 clear
 *
 * 분기 (PRD §5.2):
 *  - 미인증 → /login
 *  - 인증 + 0 stores → /no-store 안내
 *  - 인증 + 1 store → 자동 쿠키 + 진입
 *  - 인증 + 2+ stores + 유효 쿠키 → 진입
 *  - 인증 + 2+ stores + 무효 쿠키 → /select-store
 */

import { NextResponse, type NextRequest } from 'next/server'
import {
  ACTIVE_STORE_COOKIE,
  activeStoreCookieOptions,
  createMiddlewareSupabase,
} from './lib/supabase/middleware'
import { decideAuth } from './lib/auth/decide-auth'

export const PATHNAME_HEADER = 'x-onword-pathname'

export async function middleware(request: NextRequest) {
  // Server Components가 pathname을 읽을 수 있도록 request 헤더에 주입.
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set(PATHNAME_HEADER, request.nextUrl.pathname)

  let response = NextResponse.next({
    request: { headers: requestHeaders },
  })

  const supabase = createMiddlewareSupabase(request, response)

  // 토큰 갱신 (getUser는 매 호출 시 Supabase에 검증 요청)
  const { data: userData } = await supabase.auth.getUser()
  const user = userData.user

  let storeIds: string[] = []
  if (user) {
    const { data, error } = await supabase
      .from('store_members')
      .select('store_id')
    if (error) {
      // RLS / 네트워크 실패는 보수적으로 0개 처리 → /no-store로 안내
      console.error('[middleware] store_members select failed:', error.message)
      storeIds = []
    } else {
      const rows = (data ?? []) as Array<{ store_id: string }>
      storeIds = rows.map((r) => r.store_id)
    }
  }

  const activeStoreId = request.cookies.get(ACTIVE_STORE_COOKIE)?.value ?? null

  const decision = decideAuth({
    userId: user?.id ?? null,
    storeIds,
    activeStoreId,
    path: request.nextUrl.pathname,
  })

  if (decision.type === 'redirect') {
    const url = request.nextUrl.clone()
    url.pathname = decision.to
    url.search = ''
    const redirect = NextResponse.redirect(url)
    // 응답에 supabase가 set한 쿠키 보존
    response.cookies.getAll().forEach((c) => {
      redirect.cookies.set(c.name, c.value)
    })
    if (decision.clearActiveStore) {
      redirect.cookies.set(ACTIVE_STORE_COOKIE, '', {
        ...activeStoreCookieOptions(),
        maxAge: 0,
      })
    }
    return redirect
  }

  if ('setActiveStoreId' in decision) {
    response.cookies.set(
      ACTIVE_STORE_COOKIE,
      decision.setActiveStoreId,
      activeStoreCookieOptions(),
    )
  }

  return response
}

export const config = {
  matcher: [
    /**
     * 다음 경로 제외:
     * - _next/static, _next/image (정적)
     * - favicon.ico, public assets
     * - /api/* (라우트 핸들러는 자체적으로 세션 검증)
     */
    '/((?!_next/static|_next/image|favicon\\.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
