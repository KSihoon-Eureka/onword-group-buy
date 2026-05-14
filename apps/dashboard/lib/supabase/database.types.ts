/**
 * Dashboard-local Database 타입 — Phase D 통합 본.
 *
 * Phase A/B/C 동안에는 dashboard local 에서 packages/db 의 부족한 컬럼을 확장했으나,
 * Phase D 에서 packages/db 의 Database 가 migrations 0001-0006 와 1:1 로 동기화되었다.
 * 따라서 본 파일은 thin re-export 만 한다 (옵션 B).
 *
 * dashboard 의 모든 supabase 클라이언트 (`client.ts`, `server.ts`, `middleware.ts`)
 * 와 helper (`auth/store-membership.ts`) 는 본 파일에서 import 한다 — 다중 호출자에서
 * 단일 경로 유지 + 향후 dashboard-only 타입 추가 시 확장 지점 보존 목적.
 */

import type { createServerClient } from '@supabase/ssr'
export type { Database } from '@onword/db'
import type { Database } from '@onword/db'

/**
 * 공통 SupabaseClient 별칭 — getServerSupabase / createMiddlewareSupabase /
 * getBrowserSupabase 셋이 모두 동일 구조의 클라이언트를 반환한다.
 * helper 함수 시그니처에 이 타입을 사용하면 generic 추론 불일치를 방지한다.
 */
export type AppSupabase = ReturnType<typeof createServerClient<Database>>
