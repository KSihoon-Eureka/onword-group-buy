'use client'

/**
 * AuditPageClient — 감사 로그 페이지의 client wrapper.
 *
 * 역할:
 *  - AuditLogPanel (dumb) 에 entries / filterOptions / current filter 주입.
 *  - filter dropdown 변경 → URL searchParams 동기화 (`?entityType=...&entityId=...`).
 *  - server component (page.tsx) 가 새 URL 로 재실행되며 다시 fetch.
 */

import { useRouter, useSearchParams } from 'next/navigation'
import {
  AuditLogPanel,
  type AuditFilter,
  type AuditFilterOption,
} from '@onword/ui'
import type { AuditLogEntry } from '@onword/types'

export interface AuditPageClientProps {
  entries: AuditLogEntry[]
  filter: AuditFilter
  filterOptions: AuditFilterOption[]
  userMap?: Record<string, { name?: string | null; email?: string | null }>
  entityLabelMap?: Record<string, string>
}

export function AuditPageClient({
  entries,
  filter,
  filterOptions,
  userMap,
  entityLabelMap,
}: AuditPageClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function handleFilterChange(next: AuditFilter) {
    const params = new URLSearchParams(searchParams?.toString() ?? '')
    if (next.entityType) params.set('entityType', next.entityType)
    else params.delete('entityType')

    if (next.entityId) params.set('entityId', next.entityId)
    else params.delete('entityId')

    const qs = params.toString()
    router.push(qs ? `/audit?${qs}` : '/audit')
  }

  return (
    <AuditLogPanel
      entries={entries}
      filter={filter}
      filterOptions={filterOptions}
      onFilterChange={handleFilterChange}
      userMap={userMap}
      entityLabelMap={entityLabelMap}
    />
  )
}
