import type { SavedFlow } from '@onword/types'

export interface SavedFlowRow {
  id: string
  store_id: string
  user_id: string
  name: string
  prompt: string
  icon: string | null
  display_order: number
  run_count: number
  last_run_at: string | null
  created_at: string
  updated_at: string
}

export function rowToSavedFlow(row: SavedFlowRow): SavedFlow {
  return {
    id: row.id,
    storeId: row.store_id,
    userId: row.user_id,
    name: row.name,
    prompt: row.prompt,
    icon: row.icon,
    displayOrder: row.display_order,
    runCount: row.run_count,
    lastRunAt: row.last_run_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
