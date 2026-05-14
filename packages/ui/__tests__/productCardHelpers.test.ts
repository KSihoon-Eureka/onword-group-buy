/**
 * ProductCard helper 단위 테스트.
 * UI 컴포넌트 자체는 시각 검증으로 위임 (CLAUDE.md §4).
 * 여기서는 props → 표시 가능한 데이터 변환의 순수 로직만 검증한다.
 */

import { describe, it, expect } from 'vitest'
import {
  PROGRESS_STAGE_ORDER,
  formatDeadlineKR,
  formatParticipation,
  formatPriceKRW,
  getProgressDots,
} from '../productCardHelpers'
import type { FlowStage } from '@onword/types'

describe('PROGRESS_STAGE_ORDER', () => {
  it('PRD §9.5 — completed 제외한 8단계', () => {
    expect(PROGRESS_STAGE_ORDER).toHaveLength(8)
    expect(PROGRESS_STAGE_ORDER).not.toContain('completed' as FlowStage)
  })

  it('product_registered 부터 pickup_ready 까지 정확한 순서', () => {
    expect(PROGRESS_STAGE_ORDER[0]).toBe('product_registered')
    expect(PROGRESS_STAGE_ORDER[1]).toBe('announcement_1')
    expect(PROGRESS_STAGE_ORDER[2]).toBe('order_open')
    expect(PROGRESS_STAGE_ORDER[3]).toBe('order_closed')
    expect(PROGRESS_STAGE_ORDER[4]).toBe('stock_confirmed')
    expect(PROGRESS_STAGE_ORDER[5]).toBe('warehouse_notified')
    expect(PROGRESS_STAGE_ORDER[6]).toBe('arrived')
    expect(PROGRESS_STAGE_ORDER[7]).toBe('pickup_ready')
  })
})

describe('getProgressDots', () => {
  it('product_registered → 첫 칸이 current, 나머지는 pending', () => {
    const dots = getProgressDots('product_registered')
    expect(dots).toEqual([
      'current',
      'pending',
      'pending',
      'pending',
      'pending',
      'pending',
      'pending',
      'pending',
    ])
  })

  it('order_open → 앞 2칸 done, 3번째 current, 나머지 pending', () => {
    const dots = getProgressDots('order_open')
    expect(dots).toEqual([
      'done',
      'done',
      'current',
      'pending',
      'pending',
      'pending',
      'pending',
      'pending',
    ])
  })

  it('pickup_ready → 앞 7칸 done, 마지막 current', () => {
    const dots = getProgressDots('pickup_ready')
    expect(dots.slice(0, 7).every((s) => s === 'done')).toBe(true)
    expect(dots[7]).toBe('current')
  })

  it('completed → 모든 칸 done (종료 상태)', () => {
    const dots = getProgressDots('completed')
    expect(dots).toHaveLength(8)
    expect(dots.every((s) => s === 'done')).toBe(true)
  })

  it('알 수 없는 stage 값 → 모두 pending (방어적)', () => {
    const dots = getProgressDots('unknown_stage_xyz' as FlowStage)
    expect(dots.every((s) => s === 'pending')).toBe(true)
  })

  it('각 FlowStage(완료 제외) 결과는 정확히 1개 current 보유', () => {
    for (const stage of PROGRESS_STAGE_ORDER) {
      const dots = getProgressDots(stage)
      const currentCount = dots.filter((s) => s === 'current').length
      expect(currentCount).toBe(1)
    }
  })
})

describe('formatPriceKRW', () => {
  it('PRD A12: 8900 → "8,900원"', () => {
    expect(formatPriceKRW(8900)).toBe('8,900원')
  })

  it('0원 → "0원"', () => {
    expect(formatPriceKRW(0)).toBe('0원')
  })

  it('1000000 → "1,000,000원"', () => {
    expect(formatPriceKRW(1000000)).toBe('1,000,000원')
  })

  it('소수점 → 반올림 정수', () => {
    expect(formatPriceKRW(8900.7)).toBe('8,901원')
  })

  it('NaN → "0원" (방어적)', () => {
    expect(formatPriceKRW(NaN)).toBe('0원')
  })
})

describe('formatDeadlineKR', () => {
  it('PRD A12: ISO date → "MM월 DD일(요일)"', () => {
    // 2026-05-14는 목요일
    const out = formatDeadlineKR('2026-05-14')
    expect(out).toMatch(/^05월 14일\(.\)$/)
  })

  it('월/일 zero-padding', () => {
    const out = formatDeadlineKR('2026-01-05')
    expect(out.startsWith('01월 05일')).toBe(true)
  })

  it('ISO timestamp 입력 허용', () => {
    const out = formatDeadlineKR('2026-05-14T12:00:00Z')
    expect(out).toMatch(/월 \d{2}일\(.\)$/)
  })

  it('파싱 실패 → 원본 반환', () => {
    expect(formatDeadlineKR('not-a-date')).toBe('not-a-date')
  })

  it('한국어 요일 1글자 (월~일)', () => {
    const out = formatDeadlineKR('2026-05-14')
    const weekday = out.slice(-2, -1)
    expect(['월', '화', '수', '목', '금', '토', '일']).toContain(weekday)
  })
})

describe('formatParticipation', () => {
  it('ordered + stock 모두 표시', () => {
    expect(formatParticipation(12, 50)).toBe('12 / 50개')
  })

  it('큰 수 → 콤마', () => {
    expect(formatParticipation(1234, 5678)).toBe('1,234 / 5,678개')
  })

  it('stock=0 → ordered만', () => {
    expect(formatParticipation(7, 0)).toBe('7개')
  })

  it('stock 음수 → ordered만', () => {
    expect(formatParticipation(7, -1)).toBe('7개')
  })

  it('ordered 음수 → 0으로 clamp', () => {
    expect(formatParticipation(-3, 50)).toBe('0 / 50개')
  })

  it('NaN → 0', () => {
    expect(formatParticipation(NaN, 50)).toBe('0 / 50개')
  })
})
