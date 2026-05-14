/**
 * NotificationCenter 단위 테스트 (PLAN.md E.6).
 *
 * vitest node 환경 — DOM 렌더 X. 그래서 pure helper 분기 + React.createElement 트리 검사.
 */

import { describe, it, expect, vi } from 'vitest'
import * as React from 'react'
import {
  NotificationCenter,
  NOTIFICATION_KIND_LABEL,
  getNotificationKindLabel,
  isUnread,
  countUnread,
  formatRelativeKo,
  type NotificationItem,
} from '../NotificationCenter'

// ==========================
// Pure helpers
// ==========================

describe('NOTIFICATION_KIND_LABEL — 한국어 매핑', () => {
  it('audit / tool_failure / new_order 모두 한국어', () => {
    expect(NOTIFICATION_KIND_LABEL.audit).toBe('변경 이력')
    expect(NOTIFICATION_KIND_LABEL.tool_failure).toBe('실행 실패')
    expect(NOTIFICATION_KIND_LABEL.new_order).toBe('새 주문')
  })

  it('getNotificationKindLabel — 미정의는 원문', () => {
    expect(getNotificationKindLabel('audit')).toBe('변경 이력')
    expect(getNotificationKindLabel('unknown_kind')).toBe('unknown_kind')
  })
})

describe('isUnread', () => {
  const t = (h: number) => new Date(2026, 4, 13, h, 0, 0).toISOString()

  it('lastReadAt 없음 → unread', () => {
    expect(isUnread(t(10))).toBe(true)
    expect(isUnread(t(10), null)).toBe(true)
    expect(isUnread(t(10), '')).toBe(true)
  })

  it('createdAt > lastReadAt → unread', () => {
    expect(isUnread(t(12), t(10))).toBe(true)
  })

  it('createdAt = lastReadAt → read (방어적: 동일 시각은 이미 본 것으로)', () => {
    expect(isUnread(t(10), t(10))).toBe(false)
  })

  it('createdAt < lastReadAt → read', () => {
    expect(isUnread(t(8), t(10))).toBe(false)
  })

  it('parse 실패 → unread (보수적)', () => {
    expect(isUnread('not-a-date', t(10))).toBe(true)
    expect(isUnread(t(10), 'not-a-date')).toBe(true)
  })
})

describe('countUnread', () => {
  const t = (h: number) => new Date(2026, 4, 13, h, 0, 0).toISOString()

  function mkItem(h: number, kind: NotificationItem['kind'] = 'audit'): NotificationItem {
    return {
      id: `n-${h}`,
      kind,
      createdAt: t(h),
      title: `title ${h}`,
    }
  }

  it('lastReadAt 없으면 모두 unread', () => {
    expect(countUnread([mkItem(8), mkItem(10), mkItem(12)])).toBe(3)
  })

  it('일부만 unread', () => {
    expect(countUnread([mkItem(8), mkItem(10), mkItem(12)], t(10))).toBe(1)
  })

  it('모두 read', () => {
    expect(countUnread([mkItem(8), mkItem(9)], t(10))).toBe(0)
  })

  it('빈 배열 → 0', () => {
    expect(countUnread([], t(10))).toBe(0)
  })
})

describe('formatRelativeKo', () => {
  const now = new Date(2026, 4, 13, 14, 0, 0)

  it('30초 전 → 방금 전', () => {
    const iso = new Date(now.getTime() - 30 * 1000).toISOString()
    expect(formatRelativeKo(iso, now)).toBe('방금 전')
  })

  it('5분 전 → 5분 전', () => {
    const iso = new Date(now.getTime() - 5 * 60 * 1000).toISOString()
    expect(formatRelativeKo(iso, now)).toBe('5분 전')
  })

  it('3시간 전 → 3시간 전', () => {
    const iso = new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString()
    expect(formatRelativeKo(iso, now)).toBe('3시간 전')
  })

  it('2일 전 → 2일 전', () => {
    const iso = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString()
    expect(formatRelativeKo(iso, now)).toBe('2일 전')
  })

  it('7일+ → MM월 DD일', () => {
    const iso = new Date(2026, 3, 1, 14, 0, 0).toISOString() // 4월 1일
    expect(formatRelativeKo(iso, now)).toBe('04월 01일')
  })

  it('미래 시각 (clock skew) → 방금 전 (음수 방어)', () => {
    const iso = new Date(now.getTime() + 60_000).toISOString()
    expect(formatRelativeKo(iso, now)).toBe('방금 전')
  })

  it('invalid → raw', () => {
    expect(formatRelativeKo('not-a-date', now)).toBe('not-a-date')
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

function mkItem(over: Partial<NotificationItem> = {}): NotificationItem {
  return {
    id: over.id ?? 'n1',
    kind: over.kind ?? 'audit',
    createdAt: over.createdAt ?? new Date(2026, 4, 13, 14, 0, 0).toISOString(),
    title: over.title ?? '제목',
    description: over.description,
    href: over.href,
  }
}

describe('NotificationCenter — empty state', () => {
  it('빈 배열 → "알림이 없습니다"', () => {
    const tree = NotificationCenter({ notifications: [] }) as React.ReactElement
    const text = collectText(tree)
    expect(text).toContain('알림이 없습니다')
  })

  it('빈 배열 → unread badge 없음', () => {
    const tree = NotificationCenter({ notifications: [] }) as React.ReactElement
    expect(findByTestId(tree, 'unread-badge')).toBeNull()
  })

  it('빈 배열 → "모두 읽음" 버튼 없음', () => {
    const tree = NotificationCenter({
      notifications: [],
      onMarkRead: () => {},
    }) as React.ReactElement
    const text = collectText(tree)
    expect(text).not.toContain('모두 읽음')
  })
})

describe('NotificationCenter — unread badge', () => {
  const t = (h: number) => new Date(2026, 4, 13, h, 0, 0).toISOString()

  it('lastReadAt 없으면 전체가 unread → badge count = notifications.length', () => {
    const items = [mkItem({ id: '1', createdAt: t(10) }), mkItem({ id: '2', createdAt: t(11) })]
    const tree = NotificationCenter({ notifications: items }) as React.ReactElement
    const badge = findByTestId(tree, 'unread-badge')
    expect(badge).not.toBeNull()
    expect(collectText(badge)).toContain('2')
  })

  it('lastReadAt 일부보다 큰 경우 → badge count = 새 항목 수', () => {
    const items = [
      mkItem({ id: '1', createdAt: t(8) }),
      mkItem({ id: '2', createdAt: t(11) }),
      mkItem({ id: '3', createdAt: t(13) }),
    ]
    const tree = NotificationCenter({
      notifications: items,
      lastReadAt: t(10),
    }) as React.ReactElement
    const badge = findByTestId(tree, 'unread-badge')
    expect(collectText(badge)).toContain('2')
  })

  it('전부 read → badge 미렌더', () => {
    const items = [mkItem({ id: '1', createdAt: t(8) })]
    const tree = NotificationCenter({
      notifications: items,
      lastReadAt: t(10),
    }) as React.ReactElement
    expect(findByTestId(tree, 'unread-badge')).toBeNull()
  })

  it('99 초과 → "99+"', () => {
    const items = Array.from({ length: 150 }, (_, i) =>
      mkItem({ id: `n-${i}`, createdAt: t(10) }),
    )
    // maxItems 기본 10 이지만 unread count 는 visible 기준
    // visible (slice 10) 안에서 unread 수 = 10. 99+ 분기를 직접 검증하려면 maxItems 늘림.
    const tree = NotificationCenter({
      notifications: items,
      maxItems: 150,
    }) as React.ReactElement
    const badge = findByTestId(tree, 'unread-badge')
    expect(collectText(badge)).toContain('99+')
  })
})

describe('NotificationCenter — 항목 분류 (kind)', () => {
  it('3종 kind 라벨 모두 표시', () => {
    const items: NotificationItem[] = [
      mkItem({ id: 'a1', kind: 'audit', title: '상품 생성' }),
      mkItem({ id: 't1', kind: 'tool_failure', title: '도구 실행 실패' }),
      mkItem({ id: 'o1', kind: 'new_order', title: '새 주문 도착' }),
    ]
    const tree = NotificationCenter({ notifications: items }) as React.ReactElement
    const text = collectText(tree)
    expect(text).toContain('변경 이력')
    expect(text).toContain('실행 실패')
    expect(text).toContain('새 주문')
    expect(text).toContain('상품 생성')
    expect(text).toContain('도구 실행 실패')
    expect(text).toContain('새 주문 도착')
  })
})

describe('NotificationCenter — maxItems 제한', () => {
  const t = (h: number) => new Date(2026, 4, 13, h, 0, 0).toISOString()

  it('기본 10건 (PRD §9.5)', () => {
    const items = Array.from({ length: 15 }, (_, i) =>
      mkItem({ id: `n-${i}`, createdAt: t(10 + (i % 12)) }),
    )
    const tree = NotificationCenter({ notifications: items }) as React.ReactElement
    const buttons = findAllByTestIdPrefix(tree, 'notification-item-')
    expect(buttons.length).toBe(10)
  })

  it('maxItems override', () => {
    const items = Array.from({ length: 15 }, (_, i) =>
      mkItem({ id: `n-${i}`, createdAt: t(10) }),
    )
    const tree = NotificationCenter({
      notifications: items,
      maxItems: 5,
    }) as React.ReactElement
    const buttons = findAllByTestIdPrefix(tree, 'notification-item-')
    expect(buttons.length).toBe(5)
  })
})

describe('NotificationCenter — onMarkRead / onItemClick 콜백', () => {
  const t = (h: number) => new Date(2026, 4, 13, h, 0, 0).toISOString()

  it('"모두 읽음" 클릭 → onMarkRead(ISO timestamp)', () => {
    const onMarkRead = vi.fn()
    const tree = NotificationCenter({
      notifications: [mkItem({ id: '1', createdAt: t(10) })],
      onMarkRead,
    }) as React.ReactElement

    // header 의 "모두 읽음" button 찾기 — text 로 search
    function findButtonByText(node: React.ReactNode, label: string): React.ReactElement | null {
      if (!node || typeof node !== 'object') return null
      if (Array.isArray(node)) {
        for (const n of node) {
          const r = findButtonByText(n, label)
          if (r) return r
        }
        return null
      }
      const el = node as React.ReactElement
      if (el.type === 'button' && collectText((el.props as { children?: React.ReactNode }).children).includes(label)) {
        return el
      }
      return findButtonByText((el.props as { children?: React.ReactNode }).children, label)
    }

    const markAllBtn = findButtonByText(tree, '모두 읽음')
    expect(markAllBtn).not.toBeNull()
    const handler = (markAllBtn!.props as { onClick: () => void }).onClick
    handler()
    expect(onMarkRead).toHaveBeenCalledTimes(1)
    const arg = onMarkRead.mock.calls[0][0]
    expect(typeof arg).toBe('string')
    expect(Number.isNaN(Date.parse(arg))).toBe(false)
  })

  it('항목 클릭 → onItemClick(item)', () => {
    const onItemClick = vi.fn()
    const item = mkItem({ id: 'X', kind: 'tool_failure', title: '실패 알림' })
    const tree = NotificationCenter({
      notifications: [item],
      onItemClick,
    }) as React.ReactElement

    const btn = findByTestId(tree, 'notification-item-X')
    expect(btn).not.toBeNull()
    const handler = (btn!.props as { onClick: () => void }).onClick
    handler()
    expect(onItemClick).toHaveBeenCalledTimes(1)
    expect(onItemClick).toHaveBeenCalledWith(item)
  })

  it('onMarkRead 미제공 시 "모두 읽음" 버튼 미렌더', () => {
    const tree = NotificationCenter({
      notifications: [mkItem({ id: '1', createdAt: t(10) })],
    }) as React.ReactElement
    const text = collectText(tree)
    expect(text).not.toContain('모두 읽음')
  })
})

describe('NotificationCenter — unread 표시 (data-unread)', () => {
  const t = (h: number) => new Date(2026, 4, 13, h, 0, 0).toISOString()

  it('각 항목 data-unread 정확', () => {
    const items: NotificationItem[] = [
      mkItem({ id: 'old', createdAt: t(8) }), // read
      mkItem({ id: 'new', createdAt: t(13) }), // unread
    ]
    const tree = NotificationCenter({
      notifications: items,
      lastReadAt: t(10),
    }) as React.ReactElement

    const oldBtn = findByTestId(tree, 'notification-item-old')
    const newBtn = findByTestId(tree, 'notification-item-new')
    expect((oldBtn!.props as { 'data-unread': string })['data-unread']).toBe('false')
    expect((newBtn!.props as { 'data-unread': string })['data-unread']).toBe('true')
  })

  it('unread 항목만 unread-dot 렌더', () => {
    const items: NotificationItem[] = [
      mkItem({ id: 'old', createdAt: t(8) }),
      mkItem({ id: 'new', createdAt: t(13) }),
    ]
    const tree = NotificationCenter({
      notifications: items,
      lastReadAt: t(10),
    }) as React.ReactElement

    const dots = findAllByTestIdPrefix(tree, 'unread-dot')
    expect(dots.length).toBe(1)
  })
})
