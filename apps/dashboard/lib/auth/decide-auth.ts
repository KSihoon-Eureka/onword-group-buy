/**
 * Auth redirect 결정 — 순수 함수 (테스트 가능).
 *
 * Middleware가 호출. user / stores / activeStoreId / path를 받아
 * 다음 동작을 반환한다.
 *
 * PRD §5.2 로그인 흐름 + §5.3 매장 스위처 + §15.2 URL 구조.
 */

export type AuthDecision =
  | { type: 'continue' }
  | { type: 'continue'; setActiveStoreId: string }
  | { type: 'redirect'; to: string; clearActiveStore?: boolean }

export interface DecideAuthInput {
  /** Supabase user id (null = 미인증) */
  userId: string | null
  /** 사용자가 멤버인 store id 목록 */
  storeIds: string[]
  /** 현재 쿠키의 active_store_id (없으면 null) */
  activeStoreId: string | null
  /** 요청 path (예: '/', '/login', '/select-store') */
  path: string
}

// /privacy 는 PIPA 명시 공개 페이지 — 미인증/멤버없음 사용자도 접근 (PRD §6.3 launch 체크).
const PUBLIC_PATHS = new Set(['/login', '/privacy'])
const STORE_MEMBER_REQUIRED_EXEMPT = new Set([
  '/login',
  '/no-store',
  '/select-store',
  '/privacy',
])

export function decideAuth(input: DecideAuthInput): AuthDecision {
  const { userId, storeIds, activeStoreId, path } = input

  // 1. 미인증
  if (!userId) {
    if (PUBLIC_PATHS.has(path)) return { type: 'continue' }
    return { type: 'redirect', to: '/login' }
  }

  // 2. 인증 + /login 접근 → /
  if (path === '/login') {
    return { type: 'redirect', to: '/' }
  }

  // 3. 인증 + 0 stores
  if (storeIds.length === 0) {
    if (path === '/no-store') return { type: 'continue' }
    return { type: 'redirect', to: '/no-store' }
  }

  // 4. 인증 + 1 store — 자동 진입
  if (storeIds.length === 1) {
    const onlyStore = storeIds[0]!

    // /select-store는 멤버 2+ 전용
    if (path === '/select-store') {
      return { type: 'redirect', to: '/' }
    }

    // 쿠키 미일치 시 set
    if (activeStoreId !== onlyStore) {
      return { type: 'continue', setActiveStoreId: onlyStore }
    }
    return { type: 'continue' }
  }

  // 5. 인증 + 2+ stores
  const cookieValid = activeStoreId !== null && storeIds.includes(activeStoreId)

  if (!cookieValid) {
    // 이미 /select-store에 있으면 그대로
    if (STORE_MEMBER_REQUIRED_EXEMPT.has(path)) {
      // /no-store는 멤버 0개 전용이라 / 로 보냄
      if (path === '/no-store') return { type: 'redirect', to: '/select-store' }
      return { type: 'continue' }
    }
    return { type: 'redirect', to: '/select-store', clearActiveStore: activeStoreId !== null }
  }

  // cookie valid + path /select-store 접근 시 그대로 둠 (사용자가 명시적으로 매장 전환)
  return { type: 'continue' }
}
