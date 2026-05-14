/**
 * /audit — 감사 로그 페이지 (PRD §9.5 / §15.2 / §4.10, PLAN.md E.5).
 *
 * Server Component:
 *  1. (dashboard) layout 이 이미 user + active store 검증.
 *  2. resolveActiveStore() 로 storeId 확정.
 *  3. audit_log 테이블에서 store_id 일치 row 를 created_at desc 로 limit 100 fetch.
 *     - searchParams.entityType / entityId 로 추가 필터.
 *  4. products 조회로 entityId → 상품명 매핑 (UI 가독성).
 *  5. AuditPageClient (client wrapper) 에 전달 — filter 변경 시 URL 갱신.
 *
 * Phase D: packages/db Database 가 audit_log / phone_access_log 포함하도록 통합.
 * 더 이상 untyped 캐스트 불필요 — 직접 from('audit_log') 사용.
 */

import { redirect } from 'next/navigation'
import { resolveActiveStore } from '@/lib/auth/active-store'
import { getServerSupabase } from '@/lib/supabase/server'
import type { AuditEntityType, AuditLogEntry } from '@onword/types'
import type { AuditFilter, AuditFilterOption } from '@onword/ui'
import { AuditPageClient } from './AuditPageClient'

export const metadata = {
  title: '감사 로그 — 공구 관리 대시보드',
}

const AUDIT_LIMIT = 100

const ENTITY_TYPES: readonly AuditEntityType[] = [
  'product',
  'order',
  'asset',
  'flow',
  'store',
] as const

function isAuditEntityType(v: string): v is AuditEntityType {
  return (ENTITY_TYPES as readonly string[]).includes(v)
}

interface AuditLogRow {
  id: string
  store_id: string
  user_id: string | null
  entity_type: string
  entity_id: string
  action: string
  changes: Record<string, unknown> | null
  created_at: string
}

function rowToEntry(r: AuditLogRow): AuditLogEntry {
  return {
    id: r.id,
    storeId: r.store_id,
    userId: r.user_id,
    entityType: r.entity_type as AuditEntityType,
    entityId: r.entity_id,
    action: r.action as AuditLogEntry['action'],
    changes: r.changes,
    createdAt: r.created_at,
  }
}

interface AuditPageProps {
  searchParams?: {
    entityType?: string
    entityId?: string
  }
}

export default async function AuditPage({ searchParams }: AuditPageProps) {
  const active = await resolveActiveStore()
  if (active.type === 'unauthenticated') redirect('/login')
  if (active.type === 'no_active_store') redirect('/select-store')
  if (active.type === 'not_member') redirect('/no-store')

  const { storeId } = active

  // searchParams 검증 (PRD enum 외 값 무시).
  const rawType = searchParams?.entityType
  const filter: AuditFilter = {
    entityType: rawType && isAuditEntityType(rawType) ? rawType : undefined,
    entityId: searchParams?.entityId || undefined,
  }

  const supabase = getServerSupabase()

  // audit_log fetch — store_id + 선택적 entity 필터, 시간 역순 limit 100.
  // Phase D 부터 Database 타입에 audit_log 포함되어 직접 from() 가능.
  let query = supabase
    .from('audit_log')
    .select(
      'id, store_id, user_id, entity_type, entity_id, action, changes, created_at',
    )
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })
    .limit(AUDIT_LIMIT)

  if (filter.entityType) query = query.eq('entity_type', filter.entityType)
  if (filter.entityId) query = query.eq('entity_id', filter.entityId)

  const { data: auditRows, error: auditErr } = await query.returns<
    AuditLogRow[]
  >()

  if (auditErr) {
    console.error('[/audit] audit_log fetch failed:', auditErr)
  }

  const entries: AuditLogEntry[] = (auditRows ?? []).map(rowToEntry)

  // product 이름 매핑 — entries 에 등장한 product entityId 모음.
  const productIds = Array.from(
    new Set(
      entries
        .filter((e) => e.entityType === 'product')
        .map((e) => e.entityId),
    ),
  )

  const entityLabelMap: Record<string, string> = {}
  if (productIds.length > 0) {
    const { data: productRows } = await supabase
      .from('products')
      .select('id, name')
      .in('id', productIds)
      .eq('store_id', storeId)

    for (const p of (productRows ?? []) as Array<{ id: string; name: string }>) {
      entityLabelMap[p.id] = p.name
    }
  }

  // Filter options 빌드 — 항상 "전체" + entries 에 실제 등장한 entityType 들.
  const filterOptions: AuditFilterOption[] = [{ label: '전체', value: {} }]

  // entries 가 필터로 좁혀진 상태일 수 있어, 전체 옵션 보강을 위해 distinct entityType 만
  // 가져오는 별도 쿼리는 비용 대비 부담 → entries 에 보이는 것 + 현재 필터값 합집합.
  const seenTypes = new Set<AuditEntityType>()
  for (const e of entries) seenTypes.add(e.entityType)
  if (filter.entityType) seenTypes.add(filter.entityType)

  const ENTITY_LABELS: Record<AuditEntityType, string> = {
    product: '상품',
    order: '주문',
    asset: '자산',
    flow: '플로우',
    store: '매장',
  }

  for (const type of ENTITY_TYPES) {
    if (seenTypes.has(type)) {
      filterOptions.push({
        label: `${ENTITY_LABELS[type]} 전체`,
        value: { entityType: type },
      })
    }
  }

  // product 별 옵션 — entityLabelMap 이용.
  for (const pid of productIds) {
    const name = entityLabelMap[pid] ?? pid.slice(0, 8)
    filterOptions.push({
      label: `상품 · ${name}`,
      value: { entityType: 'product', entityId: pid },
    })
  }

  return (
    <div className="px-4 md:px-8 pt-6 md:pt-8 pb-10">
      <AuditPageClient
        entries={entries}
        filter={filter}
        filterOptions={filterOptions}
        entityLabelMap={entityLabelMap}
      />
    </div>
  )
}
