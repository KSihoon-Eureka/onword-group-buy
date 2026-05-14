/**
 * SummaryCard 단위 테스트 (PLAN.md E.7).
 *
 * vitest node 환경 — DOM 렌더 X. Pure helper + React.createElement 트리 검사.
 */

import { describe, it, expect, vi } from 'vitest'
import * as React from 'react'
import {
  SummaryCard,
  SUMMARY_CARD_META,
  SUMMARY_CARD_ORDER,
  formatSummaryNumber,
  isZeroValue,
  type SummaryStats,
  type SummaryCardKey,
} from '../SummaryCard'

// ==========================
// Pure helpers
// ==========================

describe('SUMMARY_CARD_ORDER', () => {
  it('PRD §9.5 순서: closingToday → newOrders → pickupReady → deadlineSoon', () => {
    expect(SUMMARY_CARD_ORDER).toEqual([
      'closingToday',
      'newOrders',
      'pickupReady',
      'deadlineSoon',
    ])
  })

  it('4 카드 전부 META 보유 + 한국어 라벨', () => {
    expect(SUMMARY_CARD_META.closingToday.label).toBe('오늘 마감')
    expect(SUMMARY_CARD_META.newOrders.label).toBe('신규 주문')
    expect(SUMMARY_CARD_META.pickupReady.label).toBe('수령 가능')
    expect(SUMMARY_CARD_META.deadlineSoon.label).toBe('마감 임박')
  })

  it('META 단위 한국어 ("개" / "건")', () => {
    expect(SUMMARY_CARD_META.closingToday.unit).toBe('개')
    expect(SUMMARY_CARD_META.newOrders.unit).toBe('건')
    expect(SUMMARY_CARD_META.pickupReady.unit).toBe('개')
    expect(SUMMARY_CARD_META.deadlineSoon.unit).toBe('개')
  })
})

describe('formatSummaryNumber', () => {
  it('정상 정수', () => {
    expect(formatSummaryNumber(0)).toBe('0')
    expect(formatSummaryNumber(5)).toBe('5')
    expect(formatSummaryNumber(12)).toBe('12')
  })

  it('1,000+ 콤마 (PRD A12 일관성)', () => {
    expect(formatSummaryNumber(1000)).toBe('1,000')
    expect(formatSummaryNumber(12345)).toBe('12,345')
  })

  it('음수 → 0 (방어적)', () => {
    expect(formatSummaryNumber(-1)).toBe('0')
    expect(formatSummaryNumber(-100)).toBe('0')
  })

  it('NaN → 0', () => {
    expect(formatSummaryNumber(NaN)).toBe('0')
  })

  it('null / undefined → 0', () => {
    expect(formatSummaryNumber(null)).toBe('0')
    expect(formatSummaryNumber(undefined)).toBe('0')
  })

  it('소수 → 내림 정수', () => {
    expect(formatSummaryNumber(5.7)).toBe('5')
    expect(formatSummaryNumber(5.4)).toBe('5')
  })
})

describe('isZeroValue', () => {
  it('0 / 음수 / NaN / null / undefined → true', () => {
    expect(isZeroValue(0)).toBe(true)
    expect(isZeroValue(-3)).toBe(true)
    expect(isZeroValue(NaN)).toBe(true)
    expect(isZeroValue(null)).toBe(true)
    expect(isZeroValue(undefined)).toBe(true)
  })

  it('양수 → false', () => {
    expect(isZeroValue(1)).toBe(false)
    expect(isZeroValue(100)).toBe(false)
    expect(isZeroValue(0.1)).toBe(false)
  })
})

// ==========================
// Component tree
// ==========================

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

function findByTestId(node: React.ReactNode, id: string): React.ReactElement | null {
  if (!node || typeof node !== 'object') return null
  if (Array.isArray(node)) {
    for (const n of node) {
      const r = findByTestId(n, id)
      if (r) return r
    }
    return null
  }
  const el = node as React.ReactElement
  const props = el.props as { 'data-testid'?: string; children?: React.ReactNode }
  if (props['data-testid'] === id) return el
  return findByTestId(props.children, id)
}

function findAllByTestIdPrefix(
  node: React.ReactNode,
  prefix: string,
  acc: React.ReactElement[] = [],
): React.ReactElement[] {
  if (!node || typeof node !== 'object') return acc
  if (Array.isArray(node)) {
    node.forEach((n) => findAllByTestIdPrefix(n, prefix, acc))
    return acc
  }
  const el = node as React.ReactElement
  const props = el.props as { 'data-testid'?: string; children?: React.ReactNode }
  if (props['data-testid']?.startsWith(prefix)) acc.push(el)
  findAllByTestIdPrefix(props.children, prefix, acc)
  return acc
}

const STATS_BASE: SummaryStats = {
  closingToday: 5,
  newOrders: 12,
  pickupReady: 8,
  deadlineSoon: 3,
}

describe('SummaryCard — 4 카드 모두 렌더', () => {
  it('SUMMARY_CARD_ORDER 순서대로 카드 4개', () => {
    const tree = SummaryCard({ stats: STATS_BASE }) as React.ReactElement
    const cards = findAllByTestIdPrefix(tree, 'summary-card-')
    expect(cards.length).toBe(4)
  })

  it('한국어 라벨 4개 모두 표시', () => {
    const tree = SummaryCard({ stats: STATS_BASE }) as React.ReactElement
    const text = collectText(tree)
    expect(text).toContain('오늘 마감')
    expect(text).toContain('신규 주문')
    expect(text).toContain('수령 가능')
    expect(text).toContain('마감 임박')
  })

  it('숫자 + 단위 표시', () => {
    const tree = SummaryCard({ stats: STATS_BASE }) as React.ReactElement
    const text = collectText(tree)
    expect(text).toContain('5')
    expect(text).toContain('12')
    expect(text).toContain('8')
    expect(text).toContain('3')
    expect(text).toContain('개')
    expect(text).toContain('건')
  })
})

describe('SummaryCard — 0값 처리', () => {
  it('0값 카드 → data-zero="true"', () => {
    const tree = SummaryCard({
      stats: { closingToday: 0, newOrders: 12, pickupReady: 0, deadlineSoon: 0 },
    }) as React.ReactElement

    const v1 = findByTestId(tree, 'summary-value-closingToday')
    const v2 = findByTestId(tree, 'summary-value-newOrders')
    const v3 = findByTestId(tree, 'summary-value-pickupReady')
    const v4 = findByTestId(tree, 'summary-value-deadlineSoon')

    expect((v1!.props as Record<string, string>)['data-zero']).toBe('true')
    expect((v2!.props as Record<string, string>)['data-zero']).toBe('false')
    expect((v3!.props as Record<string, string>)['data-zero']).toBe('true')
    expect((v4!.props as Record<string, string>)['data-zero']).toBe('true')
  })

  it('전부 0 → 텍스트는 여전히 "0" 표기', () => {
    const tree = SummaryCard({
      stats: { closingToday: 0, newOrders: 0, pickupReady: 0, deadlineSoon: 0 },
    }) as React.ReactElement
    const cards = findAllByTestIdPrefix(tree, 'summary-value-')
    for (const c of cards) {
      expect(collectText(c)).toBe('0')
    }
  })
})

describe('SummaryCard — onCardClick', () => {
  it('onCardClick 미제공 → button 아닌 div 렌더 (정적)', () => {
    const tree = SummaryCard({ stats: STATS_BASE }) as React.ReactElement
    const cards = findAllByTestIdPrefix(tree, 'summary-card-')
    for (const c of cards) {
      expect(c.type).toBe('div')
    }
  })

  it('onCardClick 제공 → button 렌더', () => {
    const tree = SummaryCard({
      stats: STATS_BASE,
      onCardClick: () => {},
    }) as React.ReactElement
    const cards = findAllByTestIdPrefix(tree, 'summary-card-')
    for (const c of cards) {
      expect(c.type).toBe('button')
    }
  })

  it('카드 클릭 → onCardClick(key) — 4개 키 각각 정확히 전달', () => {
    const onCardClick = vi.fn()
    const tree = SummaryCard({ stats: STATS_BASE, onCardClick }) as React.ReactElement

    const keys: SummaryCardKey[] = [
      'closingToday',
      'newOrders',
      'pickupReady',
      'deadlineSoon',
    ]
    for (const key of keys) {
      const card = findByTestId(tree, `summary-card-${key}`)
      expect(card).not.toBeNull()
      const onClick = (card!.props as { onClick: () => void }).onClick
      onClick()
    }

    expect(onCardClick).toHaveBeenCalledTimes(4)
    expect(onCardClick.mock.calls.map((c) => c[0])).toEqual(keys)
  })

  it('0값 카드 → button 이지만 disabled', () => {
    const tree = SummaryCard({
      stats: { closingToday: 0, newOrders: 5, pickupReady: 0, deadlineSoon: 0 },
      onCardClick: () => {},
    }) as React.ReactElement

    const zero = findByTestId(tree, 'summary-card-closingToday')
    const nonZero = findByTestId(tree, 'summary-card-newOrders')

    expect((zero!.props as { disabled: boolean }).disabled).toBe(true)
    expect((nonZero!.props as { disabled: boolean }).disabled).toBe(false)
  })
})

describe('SummaryCard — 큰 숫자 / 콤마', () => {
  it('1,000+ 콤마 표시', () => {
    const tree = SummaryCard({
      stats: { closingToday: 1234, newOrders: 0, pickupReady: 0, deadlineSoon: 0 },
    }) as React.ReactElement
    const v = findByTestId(tree, 'summary-value-closingToday')
    expect(collectText(v)).toBe('1,234')
  })
})

describe('SummaryCard — aria', () => {
  it('region role + aria-label="오늘 요약"', () => {
    const tree = SummaryCard({ stats: STATS_BASE }) as React.ReactElement
    const props = tree.props as { role: string; 'aria-label': string }
    expect(props.role).toBe('region')
    expect(props['aria-label']).toBe('오늘 요약')
  })

  it('clickable 카드 aria-label 에 라벨 + 값 + 단위', () => {
    const tree = SummaryCard({
      stats: STATS_BASE,
      onCardClick: () => {},
    }) as React.ReactElement
    const card = findByTestId(tree, 'summary-card-closingToday')
    const label = (card!.props as { 'aria-label': string })['aria-label']
    expect(label).toContain('오늘 마감')
    expect(label).toContain('5')
    expect(label).toContain('개')
  })
})
