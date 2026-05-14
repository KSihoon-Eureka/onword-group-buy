import { describe, it, expect } from 'vitest'
import {
  FEATURE_DEFINITIONS,
  computeFeatureStates,
  getStatusGlyph,
  getStatusLabel,
  type AssetLite,
  type TraceLite,
} from '../action-status'

const NOW = '2026-05-14T10:00:00.000Z'
const EARLIER = '2026-05-14T09:00:00.000Z'
const EARLIEST = '2026-05-14T08:00:00.000Z'

function asset(overrides: Partial<AssetLite> & { type: AssetLite['type'] }): AssetLite {
  return {
    supersededAt: null,
    createdAt: NOW,
    ...overrides,
  }
}

function trace(overrides: Partial<TraceLite> & { action: TraceLite['action']; status: TraceLite['status'] }): TraceLite {
  return {
    startedAt: NOW,
    completedAt: null,
    ...overrides,
  }
}

describe('FEATURE_DEFINITIONS', () => {
  it('PRD §9.5 의 7 feature 정확히 노출', () => {
    expect(FEATURE_DEFINITIONS).toHaveLength(7)
    const ids = FEATURE_DEFINITIONS.map((f) => f.id)
    expect(ids).toEqual([
      'announcement_1',
      'images',
      'price',
      'poster',
      'pickup_table',
      'wholesale',
      'pickup_announce',
    ])
  })

  it('각 feature 는 ActionName 매핑이 있다', () => {
    for (const f of FEATURE_DEFINITIONS) {
      expect(f.action).toBeTruthy()
    }
  })

  it('PRD §7.13 매핑 — 수령표 = close_orders, 도매주문 = notify_warehouse, 수령안내 = announce_pickup', () => {
    const byId = new Map(FEATURE_DEFINITIONS.map((f) => [f.id, f]))
    expect(byId.get('pickup_table')?.action).toBe('close_orders')
    expect(byId.get('wholesale')?.action).toBe('notify_warehouse')
    expect(byId.get('pickup_announce')?.action).toBe('announce_pickup')
    expect(byId.get('announcement_1')?.action).toBe('start_campaign')
    expect(byId.get('poster')?.action).toBe('start_campaign')
  })
})

describe('computeFeatureStates — asset 매칭', () => {
  it('asset 0개 + trace 0개 = 전부 idle', () => {
    const states = computeFeatureStates({ assets: [], traces: [] })
    expect(states).toHaveLength(7)
    for (const s of states) expect(s.status).toBe('idle')
  })

  it('announcement_stage1 자산 1개 → 공고① completed', () => {
    const states = computeFeatureStates({
      assets: [asset({ type: 'announcement_stage1' })],
      traces: [],
    })
    const a1 = states.find((s) => s.definition.id === 'announcement_1')!
    expect(a1.status).toBe('completed')
    expect(a1.assetCount).toBe(1)
  })

  it('superseded 자산은 카운트 제외 → idle', () => {
    const states = computeFeatureStates({
      assets: [
        asset({ type: 'announcement_stage1', supersededAt: '2026-05-14T11:00:00.000Z' }),
      ],
      traces: [],
    })
    const a1 = states.find((s) => s.definition.id === 'announcement_1')!
    expect(a1.status).toBe('idle')
    expect(a1.assetCount).toBe(0)
  })

  it('price feature 는 3 종 asset 중 어느 하나라도 있으면 completed', () => {
    for (const t of ['price_compare_image', 'price_compare_data', 'price_emphasis_text'] as const) {
      const states = computeFeatureStates({
        assets: [asset({ type: t })],
        traces: [],
      })
      const price = states.find((s) => s.definition.id === 'price')!
      expect(price.status).toBe('completed')
      expect(price.assetCount).toBe(1)
    }
  })

  it('pickup_table 은 image / text 중 하나라도 있으면 completed', () => {
    const states = computeFeatureStates({
      assets: [asset({ type: 'pickup_table_image' })],
      traces: [],
    })
    const t = states.find((s) => s.definition.id === 'pickup_table')!
    expect(t.status).toBe('completed')
  })
})

describe('computeFeatureStates — trace 기반 상태', () => {
  it('asset 없음 + 최근 trace running → running', () => {
    const states = computeFeatureStates({
      assets: [],
      traces: [trace({ action: 'start_campaign', status: 'running' })],
    })
    // start_campaign 은 공고/이미지/가격/포스터 4개를 cover
    expect(states.find((s) => s.definition.id === 'announcement_1')!.status).toBe('running')
    expect(states.find((s) => s.definition.id === 'images')!.status).toBe('running')
    expect(states.find((s) => s.definition.id === 'price')!.status).toBe('running')
    expect(states.find((s) => s.definition.id === 'poster')!.status).toBe('running')
    // 다른 action 은 영향 없음
    expect(states.find((s) => s.definition.id === 'pickup_table')!.status).toBe('idle')
  })

  it('asset 없음 + 최근 trace failed → failed', () => {
    const states = computeFeatureStates({
      assets: [],
      traces: [trace({ action: 'notify_warehouse', status: 'failed' })],
    })
    expect(states.find((s) => s.definition.id === 'wholesale')!.status).toBe('failed')
  })

  it('asset 존재가 trace 상태보다 우선 (completed > running)', () => {
    const states = computeFeatureStates({
      assets: [asset({ type: 'wholesale_email' })],
      traces: [trace({ action: 'notify_warehouse', status: 'running' })],
    })
    expect(states.find((s) => s.definition.id === 'wholesale')!.status).toBe('completed')
  })

  it('asset 존재가 failed 보다 우선', () => {
    const states = computeFeatureStates({
      assets: [asset({ type: 'announcement_stage3' })],
      traces: [trace({ action: 'announce_pickup', status: 'failed' })],
    })
    expect(states.find((s) => s.definition.id === 'pickup_announce')!.status).toBe('completed')
  })

  it('여러 trace 중 가장 최근만 적용', () => {
    const states = computeFeatureStates({
      assets: [],
      traces: [
        trace({ action: 'start_campaign', status: 'failed', startedAt: EARLIEST }),
        trace({ action: 'start_campaign', status: 'completed', startedAt: EARLIER }),
        trace({ action: 'start_campaign', status: 'running', startedAt: NOW }),
      ],
    })
    expect(states.find((s) => s.definition.id === 'announcement_1')!.status).toBe('running')
  })

  it('trace completed 인데 asset 없으면 idle (superseded 후 정리된 경우)', () => {
    const states = computeFeatureStates({
      assets: [],
      traces: [trace({ action: 'announce_pickup', status: 'completed' })],
    })
    expect(states.find((s) => s.definition.id === 'pickup_announce')!.status).toBe('idle')
  })

  it('trace cancelled 는 idle 취급', () => {
    const states = computeFeatureStates({
      assets: [],
      traces: [trace({ action: 'close_orders', status: 'cancelled' })],
    })
    expect(states.find((s) => s.definition.id === 'pickup_table')!.status).toBe('idle')
  })
})

describe('getStatusGlyph / getStatusLabel — PRD §9.5 표기', () => {
  it('PRD §9.5 글리프', () => {
    expect(getStatusGlyph('completed')).toBe('✓')
    expect(getStatusGlyph('running')).toBe('○')
    expect(getStatusGlyph('idle')).toBe('—')
    expect(getStatusGlyph('failed')).toBe('✗')
  })

  it('한국어 라벨', () => {
    expect(getStatusLabel('completed')).toBe('완료')
    expect(getStatusLabel('running')).toBe('진행 중')
    expect(getStatusLabel('idle')).toBe('미실행')
    expect(getStatusLabel('failed')).toBe('실패')
  })
})
