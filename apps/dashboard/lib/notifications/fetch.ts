/**
 * 통합 알림 데이터 fetch — Sidebar NotificationCenter wiring 용.
 *
 * 소스 2 개를 통합 NotificationItem shape 로 정규화:
 *   - audit_log 최근 10건 (변경 이력)
 *   - agent_traces.status='failed' 최근 5건 (실행 실패)
 *
 * 호출: dashboard layout server component 에서. service_role 안 씀 — 인증된 user 의
 *      RLS 통과 SELECT 만 사용 (audit_log / agent_traces).
 *
 * NOTE: orders insert (Realtime) 알림은 미래 (PRD §9.5 "new_order").
 */

import type { NotificationItem } from '@onword/ui'

// supabase-js / ssr 의 Database generic 충돌 회피 — any 로 받음.
type SupabaseLike = any

const MAX_AUDIT = 10
const MAX_TRACE_FAIL = 5

interface AuditRow {
  id: string
  created_at: string
  action: string
  entity_type: string | null
  entity_id: string | null
  summary: string | null
}

interface TraceRow {
  id: string
  product_id: string | null
  action: string
  error_message: string | null
  started_at: string
  completed_at: string | null
}

const ACTION_LABEL: Record<string, string> = {
  start_campaign: '공구 시작',
  close_orders: '주문 마감',
  notify_warehouse: '창고 알림',
  announce_pickup: '수령 안내',
  urgent_alert: '긴급 알림',
  free_text: '자유 텍스트',
}

function actionLabel(action: string): string {
  return ACTION_LABEL[action] ?? action
}

export async function fetchSidebarNotifications(
  supabase: SupabaseLike,
  storeId: string,
): Promise<NotificationItem[]> {
  // 1. audit_log
  const auditBuilder: any = supabase.from('audit_log').select(
    'id, created_at, action, entity_type, entity_id, summary',
  )
  const { data: auditData } = (await auditBuilder
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })
    .limit(MAX_AUDIT)) as {
    data: AuditRow[] | null
    error: { message: string } | null
  }

  // 2. agent_traces (failed)
  const traceBuilder: any = supabase
    .from('agent_traces')
    .select('id, product_id, action, error_message, started_at, completed_at')
  const { data: traceData } = (await traceBuilder
    .eq('store_id', storeId)
    .eq('status', 'failed')
    .order('started_at', { ascending: false })
    .limit(MAX_TRACE_FAIL)) as {
    data: TraceRow[] | null
    error: { message: string } | null
  }

  const items: NotificationItem[] = []

  for (const row of auditData ?? []) {
    items.push({
      id: row.id,
      kind: 'audit',
      createdAt: row.created_at,
      title: row.summary ?? `${row.action} (${row.entity_type ?? '?'})`,
      description: row.entity_id ? `대상 ${row.entity_id.slice(0, 8)}` : undefined,
      href: row.entity_type === 'product' && row.entity_id
        ? `/p/${row.entity_id}`
        : '/audit',
    })
  }

  for (const row of traceData ?? []) {
    items.push({
      id: row.id,
      kind: 'tool_failure',
      createdAt: row.completed_at ?? row.started_at,
      title: `${actionLabel(row.action)} 실패`,
      description: row.error_message ?? undefined,
      href: row.product_id ? `/p/${row.product_id}` : undefined,
    })
  }

  // 시간 역순 정렬.
  items.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
  return items
}
