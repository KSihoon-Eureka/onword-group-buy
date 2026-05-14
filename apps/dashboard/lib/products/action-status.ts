/**
 * 상품 상세 페이지의 7-feature action surface 헬퍼.
 * PRD §9.5 (`[✓ 공고①][✓ 이미지][○ 가격][— 포스터][— 수령표][— 도매주문][— 수령안내]`)
 * PRD §7.13 (Action → Tool 매핑) — 각 feature의 "실행" 버튼이 호출하는 orchestrator action.
 *
 * 책임:
 *  - 7 feature 메타데이터 (id / 라벨 / 매핑 asset types / 트리거할 action) 정의.
 *  - generated_assets 배열 + agent_traces 배열을 받아 feature별 상태 산출 (pure).
 *  - 상태: 'completed' | 'running' | 'idle' | 'failed' — PRD §9.5 표기와 동등.
 *
 * 입력 가정:
 *  - assets: 동일 storeId / productId 범위로 이미 필터됨. superseded_at IS NULL 가정 (호출자 책임).
 *  - traces: 동일 storeId / productId 범위 + 최근순.
 *
 * 호출자: `/p/[productId]/page.tsx` (server component) — Supabase row → camelCase 매핑 후 전달.
 */

import type { ActionName, AssetType, TraceStatus } from '@onword/types'

export type FeatureStatus = 'completed' | 'running' | 'idle' | 'failed'

export type FeatureId =
  | 'announcement_1'
  | 'images'
  | 'price'
  | 'poster'
  | 'pickup_table'
  | 'wholesale'
  | 'pickup_announce'

export interface FeatureDefinition {
  id: FeatureId
  /** PRD §9.5 한국어 라벨 */
  label: string
  /** 짧은 설명 (1 줄, 마우스 오버용 등) */
  description: string
  /** "실행" 버튼이 호출할 orchestrator action (PRD §7.13) */
  action: ActionName
  /** 이 feature 에 매핑되는 asset types — 하나라도 존재하면 completed */
  assetTypes: ReadonlyArray<AssetType>
}

/**
 * PRD §9.5 의 7 feature 정의.
 * 순서 = grid 표시 순서.
 */
export const FEATURE_DEFINITIONS: ReadonlyArray<FeatureDefinition> = [
  {
    id: 'announcement_1',
    label: '공고①',
    description: '모집 시작 카톡 (Stage 1)',
    action: 'start_campaign',
    assetTypes: ['announcement_stage1'],
  },
  {
    id: 'images',
    label: '이미지',
    description: '네이버 상품 이미지 자동 크롤',
    action: 'start_campaign',
    assetTypes: ['product_image'],
  },
  {
    id: 'price',
    label: '가격',
    description: '네이버 가격 스크린샷 + 강조 카톡',
    action: 'start_campaign',
    assetTypes: ['price_compare_image', 'price_compare_data', 'price_emphasis_text'],
  },
  {
    id: 'poster',
    label: '포스터',
    description: '800×950 포스터 합성',
    action: 'start_campaign',
    assetTypes: ['poster'],
  },
  {
    id: 'pickup_table',
    label: '수령표',
    description: '수령일 비교 테이블 (5일)',
    action: 'close_orders',
    assetTypes: ['pickup_table_image', 'pickup_table_text'],
  },
  {
    id: 'wholesale',
    label: '도매주문',
    description: '도매업자 이메일 발송',
    action: 'notify_warehouse',
    assetTypes: ['wholesale_email'],
  },
  {
    id: 'pickup_announce',
    label: '수령안내',
    description: '오늘 픽업 가능 안내 (Stage 3)',
    action: 'announce_pickup',
    assetTypes: ['announcement_stage3'],
  },
] as const

/**
 * Asset / trace 최소 입력. server component 가 camelCase 매핑 결과를 그대로 전달.
 */
export interface AssetLite {
  type: AssetType | string
  supersededAt: string | null
  createdAt: string
}

export interface TraceLite {
  action: ActionName
  status: TraceStatus
  startedAt: string
  completedAt: string | null
}

export interface FeatureState {
  definition: FeatureDefinition
  status: FeatureStatus
  /** 매핑된 활성(non-superseded) asset 개수 — completed 판정 근거 표시용 */
  assetCount: number
}

/**
 * 7 feature 의 상태를 계산한다 (pure).
 *
 * 규칙 (우선순위):
 *  1. assets 중 feature.assetTypes 와 매치되는 *활성*(supersededAt === null) 자산이 1개 이상 → 'completed'.
 *  2. (1) 아니고, traces 중 feature.action 와 매치되는 항목 중 *가장 최근*이:
 *       - status === 'running' → 'running'
 *       - status === 'failed' → 'failed'
 *       - status === 'cancelled' → 'idle' (실행되지 않은 것으로 간주)
 *       - status === 'completed' but asset 0개 → 'idle' (asset 이 superseded 처리된 경우)
 *  3. 아무 trace 없음 → 'idle'.
 *
 * 동일 action 을 여러 feature 가 공유할 수 있다 (PRD §7.13: start_campaign 은 공고/이미지/가격/포스터 모두 트리거).
 * → 어떤 feature 의 asset 이 채워졌는지 별도 판단. 'running' / 'failed' 는 *action 자체* 의 상태.
 */
export function computeFeatureStates(input: {
  assets: ReadonlyArray<AssetLite>
  traces: ReadonlyArray<TraceLite>
}): FeatureState[] {
  const { assets, traces } = input

  // 1. action 별 최근 trace
  const latestTraceByAction = new Map<ActionName, TraceLite>()
  for (const t of traces) {
    const prev = latestTraceByAction.get(t.action)
    if (!prev) {
      latestTraceByAction.set(t.action, t)
      continue
    }
    if (Date.parse(t.startedAt) > Date.parse(prev.startedAt)) {
      latestTraceByAction.set(t.action, t)
    }
  }

  return FEATURE_DEFINITIONS.map((definition) => {
    // active asset 개수
    const typeSet = new Set<string>(definition.assetTypes)
    const activeAssets = assets.filter(
      (a) => a.supersededAt === null && typeSet.has(a.type),
    )
    if (activeAssets.length > 0) {
      return {
        definition,
        status: 'completed' as const,
        assetCount: activeAssets.length,
      }
    }

    const latest = latestTraceByAction.get(definition.action)
    if (!latest) {
      return { definition, status: 'idle' as const, assetCount: 0 }
    }

    if (latest.status === 'running') {
      return { definition, status: 'running' as const, assetCount: 0 }
    }
    if (latest.status === 'failed') {
      return { definition, status: 'failed' as const, assetCount: 0 }
    }
    // completed / cancelled → asset 없음이면 idle
    return { definition, status: 'idle' as const, assetCount: 0 }
  })
}

/**
 * PRD §9.5 의 상태 표시 기호.
 */
export function getStatusGlyph(status: FeatureStatus): string {
  switch (status) {
    case 'completed':
      return '✓'
    case 'running':
      return '○'
    case 'idle':
      return '—'
    case 'failed':
      return '✗'
  }
}

export function getStatusLabel(status: FeatureStatus): string {
  switch (status) {
    case 'completed':
      return '완료'
    case 'running':
      return '진행 중'
    case 'idle':
      return '미실행'
    case 'failed':
      return '실패'
  }
}
