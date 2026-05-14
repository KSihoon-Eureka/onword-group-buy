/**
 * /assets 페이지용 generated_assets row → domain object 직렬화.
 *
 * Row는 dashboard-local Database 타입과 1:1. PRD §4.8 + types/index.ts
 * GeneratedAsset 으로 변환한다. AssetType 은 자유 문자열로 들어올 수
 * 있으므로 enum 캐스팅 시 알 수 없는 값은 그대로 보존하지만,
 * UI 라벨 단계 (`labels.ts`) 에서 fallback 처리한다.
 */

import type { GeneratedAsset, AssetType } from '@onword/types'

export interface GeneratedAssetRow {
  id: string
  store_id: string
  product_id: string | null
  trace_step_id: string | null
  type: string
  stage: string | null
  content: string | null
  asset_url: string | null
  metadata: Record<string, unknown> | null
  copied_at: string | null
  used_at: string | null
  superseded_at: string | null
  superseded_by: string | null
  created_at: string
}

export function rowToGeneratedAsset(row: GeneratedAssetRow): GeneratedAsset {
  return {
    id: row.id,
    storeId: row.store_id,
    productId: row.product_id,
    traceStepId: row.trace_step_id,
    type: row.type as AssetType,
    stage: row.stage,
    content: row.content,
    assetUrl: row.asset_url,
    metadata: row.metadata,
    copiedAt: row.copied_at,
    usedAt: row.used_at,
    supersededAt: row.superseded_at,
    supersededBy: row.superseded_by,
    createdAt: row.created_at,
  }
}
