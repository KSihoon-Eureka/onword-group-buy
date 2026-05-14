/**
 * Tool: list_recent_activity (Phase F dynamic agent read tool)
 *
 * 매장의 최근 활동 (agent_traces + audit_log) 통합 조회.
 *  - 자연어 ChatView 에서 "지난주 뭐 했지?" / "오늘 활동 보여줘" 같은 질문 답변용.
 *  - 시간 역순, 통합 view (kind=trace|audit).
 *  - 자산 자체 INSERT 안 함 (pure read).
 *
 * PIPA: 본 tool 은 phone 미접근 (별도 phone_access_log 기록 불필요).
 */

import { createServiceClient } from '@onword/db'

const MAX_DAYS = 30
const MAX_ITEMS = 50

export interface ListRecentActivityInput {
  storeId: string
  /** 최근 N 일. default 7. max 30. */
  days?: number
  /** 최대 결과 수. default 20. max 50. */
  limit?: number
}

export interface ActivityItem {
  kind: 'trace' | 'audit'
  id: string
  timestamp: string
  /** 한 줄 요약 */
  summary: string
  /** trace: action name / audit: action+entity */
  action: string
  /** 성공 여부 (trace 만 의미 있음, audit 은 항상 true). */
  ok: boolean
  /** 관련 product_id (있으면). */
  productId: string | null
}

export interface ListRecentActivityOutput {
  storeId: string
  days: number
  count: number
  activity: ActivityItem[]
}

interface TraceRow {
  id: string
  product_id: string | null
  action: string
  status: string
  error_message: string | null
  started_at: string
  completed_at: string | null
}

interface AuditRow {
  id: string
  entity_type: string
  entity_id: string
  action: string
  created_at: string
}

const ACTION_LABEL_KO: Record<string, string> = {
  start_campaign: '공구 시작',
  close_orders: '주문 마감',
  notify_warehouse: '창고 알림',
  announce_pickup: '수령 안내',
  urgent_alert: '긴급 알림',
  free_text: 'AI 비서 대화',
}

function actionLabel(a: string): string {
  return ACTION_LABEL_KO[a] ?? a
}

const ENTITY_LABEL_KO: Record<string, string> = {
  product: '상품',
  order: '주문',
  asset: '자산',
  flow: '플로우',
  store: '매장',
}

function entityLabel(e: string): string {
  return ENTITY_LABEL_KO[e] ?? e
}

export async function listRecentActivity(
  input: ListRecentActivityInput & { _traceId?: string; _traceStepId?: string },
): Promise<ListRecentActivityOutput> {
  const { storeId } = input
  if (!storeId) throw new Error('storeId is required')

  const days = Math.min(Math.max(input.days ?? 7, 1), MAX_DAYS)
  const limit = Math.min(Math.max(input.limit ?? 20, 1), MAX_ITEMS)

  const supabase = createServiceClient()
  const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  // 1. agent_traces
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const traceBuilder: any = supabase
    .from('agent_traces')
    .select('id, product_id, action, status, error_message, started_at, completed_at')
  const { data: traces } = (await traceBuilder
    .eq('store_id', storeId)
    .gte('started_at', sinceIso)
    .order('started_at', { ascending: false })
    .limit(limit)) as { data: TraceRow[] | null }

  // 2. audit_log
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const auditBuilder: any = supabase
    .from('audit_log')
    .select('id, entity_type, entity_id, action, created_at')
  const { data: audits } = (await auditBuilder
    .eq('store_id', storeId)
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(limit)) as { data: AuditRow[] | null }

  const items: ActivityItem[] = []

  for (const t of traces ?? []) {
    const ok = t.status === 'completed'
    const summary = ok
      ? `${actionLabel(t.action)} 완료`
      : t.status === 'failed'
        ? `${actionLabel(t.action)} 실패 (${t.error_message?.slice(0, 80) ?? '원인 미상'})`
        : `${actionLabel(t.action)} ${t.status}`
    items.push({
      kind: 'trace',
      id: t.id,
      timestamp: t.completed_at ?? t.started_at,
      summary,
      action: t.action,
      ok,
      productId: t.product_id,
    })
  }

  for (const a of audits ?? []) {
    items.push({
      kind: 'audit',
      id: a.id,
      timestamp: a.created_at,
      summary: `${entityLabel(a.entity_type)} ${a.action}`,
      action: `${a.entity_type}.${a.action}`,
      ok: true,
      productId: a.entity_type === 'product' ? a.entity_id : null,
    })
  }

  items.sort(
    (x, y) => Date.parse(y.timestamp) - Date.parse(x.timestamp),
  )

  return {
    storeId,
    days,
    count: items.length,
    activity: items.slice(0, limit),
  }
}
