/**
 * AuditLogPanel 단위 테스트 (PLAN.md E.5).
 *
 * vitest 가 node 환경에서 동작 (apps/dashboard/vitest.config.ts) — DOM 렌더 X.
 * 그래서 pure helper 함수들의 branching 을 검증한다:
 *  - action 한국어 매핑 (정의된 키 + 미정의 fallback)
 *  - entity / actor / timestamp / changes summary 포맷
 *  - filter dropdown 선택 인덱스 / onFilterChange 호출 시점
 *  - empty state vs entries 렌더 분기 (React.createElement output children 검사)
 */

import { describe, it, expect, vi } from 'vitest'
import * as React from 'react'
import type { AuditLogEntry } from '@onword/types'
import {
  AuditLogPanel,
  AUDIT_ACTION_LABEL,
  AUDIT_ENTITY_LABEL,
  getAuditActionLabel,
  getAuditEntityLabel,
  getActorLabel,
  getEntityDisplay,
  formatAuditTimestamp,
  summarizeChanges,
  type AuditFilter,
  type AuditFilterOption,
} from '@onword/ui'

// ==========================
// Pure helpers
// ==========================

describe('AUDIT_ACTION_LABEL — 한국어 매핑', () => {
  it('스펙된 7가지 action 모두 한국어 라벨 존재', () => {
    expect(AUDIT_ACTION_LABEL.create).toBe('생성')
    expect(AUDIT_ACTION_LABEL.update).toBe('수정')
    expect(AUDIT_ACTION_LABEL.archive).toBe('보관')
    expect(AUDIT_ACTION_LABEL.restore).toBe('복원')
    expect(AUDIT_ACTION_LABEL.flow_stage_change).toBe('상태 변경')
    expect(AUDIT_ACTION_LABEL.asset_supersede).toBe('자산 교체')
    expect(AUDIT_ACTION_LABEL.auto_no_show).toBe('자동 노쇼')
  })

  it('getAuditActionLabel — 정의된 값은 한국어, 미정의는 원문', () => {
    expect(getAuditActionLabel('create')).toBe('생성')
    expect(getAuditActionLabel('flow_stage_change')).toBe('상태 변경')
    expect(getAuditActionLabel('asset_supersede')).toBe('자산 교체')
    expect(getAuditActionLabel('auto_no_show')).toBe('자동 노쇼')
    expect(getAuditActionLabel('unknown_action')).toBe('unknown_action')
  })
})

describe('AUDIT_ENTITY_LABEL — entity_type 한국어 매핑', () => {
  it('5가지 entity_type 모두 한국어', () => {
    expect(AUDIT_ENTITY_LABEL.product).toBe('상품')
    expect(AUDIT_ENTITY_LABEL.order).toBe('주문')
    expect(AUDIT_ENTITY_LABEL.asset).toBe('자산')
    expect(AUDIT_ENTITY_LABEL.flow).toBe('플로우')
    expect(AUDIT_ENTITY_LABEL.store).toBe('매장')
  })

  it('getAuditEntityLabel fallback', () => {
    expect(getAuditEntityLabel('product')).toBe('상품')
    expect(getAuditEntityLabel('weird_type')).toBe('weird_type')
  })
})

describe('formatAuditTimestamp — PRD A12', () => {
  it('오후 시간', () => {
    // 2026-05-13 14:23 local → "오후 2시 23분"
    const iso = new Date(2026, 4, 13, 14, 23, 0).toISOString()
    const out = formatAuditTimestamp(iso)
    expect(out).toContain('2026-05-13')
    expect(out).toContain('오후')
    expect(out).toContain('2시')
    expect(out).toContain('23분')
  })

  it('오전 시간', () => {
    const iso = new Date(2026, 4, 13, 9, 5, 0).toISOString()
    const out = formatAuditTimestamp(iso)
    expect(out).toContain('오전')
    expect(out).toContain('9시')
    expect(out).toContain('05분')
  })

  it('자정 → 오전 12시', () => {
    const iso = new Date(2026, 4, 13, 0, 0, 0).toISOString()
    const out = formatAuditTimestamp(iso)
    expect(out).toContain('오전')
    expect(out).toContain('12시')
  })

  it('정오 → 오후 12시', () => {
    const iso = new Date(2026, 4, 13, 12, 0, 0).toISOString()
    const out = formatAuditTimestamp(iso)
    expect(out).toContain('오후')
    expect(out).toContain('12시')
  })

  it('invalid → raw 반환', () => {
    expect(formatAuditTimestamp('not-a-date')).toBe('not-a-date')
  })
})

describe('getActorLabel — userId / map', () => {
  it('null = 시스템', () => {
    expect(getActorLabel(null)).toBe('시스템')
  })

  it('userId 있고 map 없으면 default 사용자', () => {
    expect(getActorLabel('u1')).toBe('사용자')
  })

  it('map.name 우선', () => {
    expect(
      getActorLabel('u1', { u1: { name: 'Sihoon', email: 'x@y.z' } }),
    ).toBe('Sihoon')
  })

  it('map.name 비면 email fallback', () => {
    expect(
      getActorLabel('u1', { u1: { name: '', email: 'a@b.c' } }),
    ).toBe('a@b.c')
  })

  it('map 미스 → 사용자', () => {
    expect(getActorLabel('u-missing', { u1: { name: 'X' } })).toBe('사용자')
  })
})

describe('getEntityDisplay', () => {
  it('이름 맵 있으면 "타입 · 이름"', () => {
    expect(
      getEntityDisplay('product', 'p-12345678abcd', { 'p-12345678abcd': '슈미트 베개커버' }),
    ).toBe('상품 · 슈미트 베개커버')
  })

  it('이름 맵 없으면 단축', () => {
    expect(getEntityDisplay('product', 'abcdef1234567890')).toBe('상품 #abcdef12')
  })

  it('빈 이름은 fallback', () => {
    expect(getEntityDisplay('asset', 'xyz12345', { xyz12345: '   ' })).toBe('자산 #xyz12345')
  })
})

describe('summarizeChanges', () => {
  it('null → 빈 문자열', () => {
    expect(summarizeChanges(null)).toBe('')
  })

  it('빈 객체 → 빈 문자열', () => {
    expect(summarizeChanges({})).toBe('')
  })

  it('before/after 패턴 → 화살표', () => {
    const r = summarizeChanges({ before: 'order_open', after: 'order_closed' })
    expect(r).toBe('order_open → order_closed')
  })

  it('일반 field 패턴 — 최대 3개', () => {
    const r = summarizeChanges({ a: 1, b: 2, c: 3, d: 4 })
    expect(r).toBe('a: 1, b: 2, c: 3')
  })

  it('긴 문자열은 100자 잘림', () => {
    const long = 'x'.repeat(200)
    const r = summarizeChanges({ field: long })
    expect(r.length).toBeLessThanOrEqual(100)
    expect(r.endsWith('...')).toBe(true)
  })

  it('null 값 → ∅', () => {
    expect(summarizeChanges({ name: null })).toBe('name: ∅')
  })
})

// ==========================
// Component props 분기 — React.createElement 결과 트리 검사
// ==========================

function mkEntry(overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
  return {
    id: overrides.id ?? 'a1',
    storeId: overrides.storeId ?? 's1',
    userId: overrides.userId !== undefined ? overrides.userId : 'u1',
    entityType: overrides.entityType ?? 'product',
    entityId: overrides.entityId ?? 'p-abcdefgh',
    action: overrides.action ?? 'create',
    changes: overrides.changes !== undefined ? overrides.changes : null,
    createdAt: overrides.createdAt ?? new Date(2026, 4, 13, 14, 23, 0).toISOString(),
  }
}

/** React tree 를 깊이 우선으로 순회하며 모든 string child 수집 */
function collectText(node: React.ReactNode): string {
  if (node === null || node === undefined || node === false || node === true) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(collectText).join('\n')
  if (typeof node === 'object' && 'props' in (node as React.ReactElement)) {
    const el = node as React.ReactElement
    const children = (el.props as { children?: React.ReactNode }).children
    return collectText(children)
  }
  return ''
}

describe('AuditLogPanel — empty state 분기', () => {
  it('entries 빈 배열 → "기록이 없습니다"', () => {
    const tree = AuditLogPanel({
      entries: [],
      filter: {},
      filterOptions: [{ label: '전체', value: {} }],
      onFilterChange: () => {},
    }) as React.ReactElement

    const text = collectText(tree)
    expect(text).toContain('기록이 없습니다')
  })

  it('entries 비어있으면 ul (entries list) 없음', () => {
    const tree = AuditLogPanel({
      entries: [],
      filter: {},
      filterOptions: [{ label: '전체', value: {} }],
      onFilterChange: () => {},
    }) as React.ReactElement

    // role="status" 요소가 존재 — empty container
    const json = JSON.stringify(tree, (_, v) => (typeof v === 'function' ? '[fn]' : v))
    expect(json).toContain('"role":"status"')
    // ul (list) 마커는 없어야
    expect(json).not.toContain('"type":"ul"')
  })
})

describe('AuditLogPanel — entries 렌더', () => {
  it('entries 1건 → 한국어 action + actor + entity 표시', () => {
    const entry = mkEntry({
      userId: null,
      action: 'auto_no_show',
      entityType: 'order',
      entityId: 'o-12345678',
    })

    const tree = AuditLogPanel({
      entries: [entry],
      filter: {},
      filterOptions: [{ label: '전체', value: {} }],
      onFilterChange: () => {},
    }) as React.ReactElement

    const text = collectText(tree)
    expect(text).toContain('자동 노쇼')          // action 한국어
    expect(text).toContain('시스템')              // userId null
    expect(text).toContain('주문 #o-123456')      // entity display
  })

  it('userMap 주어지면 사람 이름 표시', () => {
    const entry = mkEntry({ userId: 'u1', action: 'update' })

    const tree = AuditLogPanel({
      entries: [entry],
      filter: {},
      filterOptions: [{ label: '전체', value: {} }],
      onFilterChange: () => {},
      userMap: { u1: { name: 'Sihoon', email: null } },
    }) as React.ReactElement

    const text = collectText(tree)
    expect(text).toContain('Sihoon')
    expect(text).toContain('수정')
  })

  it('entityLabelMap 주어지면 entity 이름 표시', () => {
    const entry = mkEntry({
      entityType: 'product',
      entityId: 'p-1',
      action: 'flow_stage_change',
      changes: { before: 'order_open', after: 'order_closed' },
    })

    const tree = AuditLogPanel({
      entries: [entry],
      filter: {},
      filterOptions: [{ label: '전체', value: {} }],
      onFilterChange: () => {},
      entityLabelMap: { 'p-1': '슈미트 베개커버' },
    }) as React.ReactElement

    const text = collectText(tree)
    expect(text).toContain('상품 · 슈미트 베개커버')
    expect(text).toContain('상태 변경')
    expect(text).toContain('order_open → order_closed')
  })
})

describe('AuditLogPanel — filter dropdown', () => {
  function findSelect(node: React.ReactNode): React.ReactElement | null {
    if (!node || typeof node !== 'object') return null
    if (Array.isArray(node)) {
      for (const n of node) {
        const r = findSelect(n)
        if (r) return r
      }
      return null
    }
    const el = node as React.ReactElement
    if (el.type === 'select') return el
    const children = (el.props as { children?: React.ReactNode }).children
    return findSelect(children)
  }

  it('filterOptions 2개 이상 → select 렌더, 선택된 index 정확', () => {
    const options: AuditFilterOption[] = [
      { label: '전체', value: {} },
      { label: '상품 전체', value: { entityType: 'product' } },
      { label: '상품 · 베개', value: { entityType: 'product', entityId: 'p-1' } },
    ]
    const currentFilter: AuditFilter = { entityType: 'product' }

    const tree = AuditLogPanel({
      entries: [],
      filter: currentFilter,
      filterOptions: options,
      onFilterChange: () => {},
    }) as React.ReactElement

    const select = findSelect(tree)
    expect(select).not.toBeNull()
    expect((select!.props as { value: number }).value).toBe(1)
  })

  it('filterOptions 1개면 select 렌더 안 함', () => {
    const tree = AuditLogPanel({
      entries: [],
      filter: {},
      filterOptions: [{ label: '전체', value: {} }],
      onFilterChange: () => {},
    }) as React.ReactElement

    const select = findSelect(tree)
    expect(select).toBeNull()
  })

  it('onFilterChange 콜백 — select onChange 가 올바른 filter 전달', () => {
    const onFilterChange = vi.fn()
    const options: AuditFilterOption[] = [
      { label: '전체', value: {} },
      { label: '상품 · 베개', value: { entityType: 'product', entityId: 'p-1' } },
    ]

    const tree = AuditLogPanel({
      entries: [],
      filter: {},
      filterOptions: options,
      onFilterChange,
    }) as React.ReactElement

    const select = findSelect(tree)
    expect(select).not.toBeNull()
    const onChange = (select!.props as { onChange: (e: { target: { value: string } }) => void })
      .onChange

    onChange({ target: { value: '1' } })

    expect(onFilterChange).toHaveBeenCalledTimes(1)
    expect(onFilterChange).toHaveBeenCalledWith({
      entityType: 'product',
      entityId: 'p-1',
    })
  })

  it('onFilterChange — index 0 (전체) → 빈 filter 객체', () => {
    const onFilterChange = vi.fn()
    const options: AuditFilterOption[] = [
      { label: '전체', value: {} },
      { label: '상품 전체', value: { entityType: 'product' } },
    ]

    const tree = AuditLogPanel({
      entries: [],
      filter: { entityType: 'product' },
      filterOptions: options,
      onFilterChange,
    }) as React.ReactElement

    const select = findSelect(tree)!
    const onChange = (select.props as { onChange: (e: { target: { value: string } }) => void })
      .onChange

    onChange({ target: { value: '0' } })

    expect(onFilterChange).toHaveBeenCalledWith({})
  })
})
