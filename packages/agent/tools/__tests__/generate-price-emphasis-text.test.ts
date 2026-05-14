/**
 * TDD: generate_price_emphasis_text (PRD §10.2, D.4)
 *
 * 사이클:
 *   1. Red — 인터페이스/형식/에러 검증 테스트 작성 → 실패 확인
 *   2. Green — 구현 (결정적 §8.4 템플릿)
 *   3. Refactor — 100자 보장 / 콤마 포맷 / 에러 분기 정리
 *
 * 실행:
 *   pnpm --filter=@onword/agent test generate-price-emphasis-text
 *
 * Mock 정책:
 *   - @onword/db 의 createServiceClient 만 mock (Supabase fixture)
 *   - Anthropic SDK 호출 없음 (PRD §8.4 는 결정적 템플릿 — AI 불필요)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ──────────────────────────────────────────────────────────────────────────
// Supabase mock
//
// 동적 라우팅: from('products') / from('generated_assets') 별로 다른 row 반환.
// 각 테스트가 자기만의 fixture 를 주입할 수 있도록 모듈 단위 변수로 관리.
// ──────────────────────────────────────────────────────────────────────────

type Row = { data: unknown; error: { message: string } | null }

const state = {
  productRow: { data: null as unknown, error: null } as Row,
  assetRow: { data: null as unknown, error: null } as Row,
  insertRow: {
    data: { id: 'asset-emphasis-1' } as unknown,
    error: null,
  } as Row,
}

function resetState(): void {
  state.productRow = { data: null, error: null }
  state.assetRow = { data: null, error: null }
  state.insertRow = { data: { id: 'asset-emphasis-1' }, error: null }
}

vi.mock('@onword/db', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === 'products') {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve(state.productRow),
            }),
          }),
        }
      }
      if (table === 'generated_assets') {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve(state.assetRow),
            }),
          }),
          insert: () => ({
            select: () => ({
              single: () => Promise.resolve(state.insertRow),
            }),
          }),
        }
      }
      throw new Error(`Unmocked table: ${table}`)
    },
  }),
}))

// 동적 import (mock 적용 보장)
import { generatePriceEmphasisText } from '../generate-price-emphasis-text'

beforeEach(() => {
  resetState()
  process.env.STORE_SHORTNAME = '산타가족'
})

describe('generate_price_emphasis_text — PRD §10.2 / §8.4', () => {
  // ────────────────────────────────────────────────────────────────────────
  // 정상 케이스
  // ────────────────────────────────────────────────────────────────────────
  describe('정상: naverPrice > ourPrice', () => {
    it('§8.4 형식의 텍스트 + 절약 금액을 metadata 에 저장', async () => {
      state.productRow = {
        data: { id: 'p1', name: '슈미트 베개커버', price: 8900 },
        error: null,
      }
      state.assetRow = {
        data: {
          id: 'pc-1',
          type: 'price_compare',
          metadata: { data: { lowestPrice: '40000' } },
        },
        error: null,
      }

      const result = await generatePriceEmphasisText({
        productId: 'p1',
        priceCompareAssetId: 'pc-1',
      })

      // PRD §10.2 — 반환 형태
      expect(result.assetId).toBe('asset-emphasis-1')
      expect(typeof result.content).toBe('string')

      // PRD §8.4 — 본문 구성요소
      expect(result.content).toContain('네이버 최저가 40,000원')
      expect(result.content).toContain('산타가족 특가 8,900원')
      expect(result.content).toContain('31,100원 절약')
      expect(result.content).toMatch(/지금이 살 때/)

      // 100자 이내
      expect(result.content.length).toBeLessThanOrEqual(100)
    })

    it('콤마 천단위 구분 포맷 (A12 — 8,900원)', async () => {
      state.productRow = {
        data: { id: 'p1', name: 'x', price: 12000 },
        error: null,
      }
      state.assetRow = {
        data: { id: 'pc-2', metadata: { data: { lowestPrice: '18900' } } },
        error: null,
      }

      const result = await generatePriceEmphasisText({
        productId: 'p1',
        priceCompareAssetId: 'pc-2',
      })

      expect(result.content).toContain('18,900원')
      expect(result.content).toContain('12,000원')
      expect(result.content).toContain('6,900원 절약')
    })

    it('lowestPrice 가 숫자 타입이어도 동작', async () => {
      state.productRow = {
        data: { id: 'p1', name: 'x', price: 5000 },
        error: null,
      }
      state.assetRow = {
        data: { id: 'pc-3', metadata: { data: { lowestPrice: 10000 } } },
        error: null,
      }

      const result = await generatePriceEmphasisText({
        productId: 'p1',
        priceCompareAssetId: 'pc-3',
      })

      expect(result.content).toContain('10,000원')
      expect(result.content).toContain('5,000원 절약')
    })
  })

  // ────────────────────────────────────────────────────────────────────────
  // 에러: 가격 역전 / 동일
  // ────────────────────────────────────────────────────────────────────────
  describe('에러: 할인 효과 없음 (PRD §10.2)', () => {
    it('naverPrice < ourPrice → throw', async () => {
      state.productRow = {
        data: { id: 'p1', name: 'x', price: 10000 },
        error: null,
      }
      state.assetRow = {
        data: { id: 'pc-4', metadata: { data: { lowestPrice: '8000' } } },
        error: null,
      }

      await expect(
        generatePriceEmphasisText({
          productId: 'p1',
          priceCompareAssetId: 'pc-4',
        }),
      ).rejects.toThrow(/할인 효과 없음/)
    })

    it('naverPrice === ourPrice → throw', async () => {
      state.productRow = {
        data: { id: 'p1', name: 'x', price: 10000 },
        error: null,
      }
      state.assetRow = {
        data: { id: 'pc-5', metadata: { data: { lowestPrice: '10000' } } },
        error: null,
      }

      await expect(
        generatePriceEmphasisText({
          productId: 'p1',
          priceCompareAssetId: 'pc-5',
        }),
      ).rejects.toThrow(/할인 효과 없음/)
    })
  })

  // ────────────────────────────────────────────────────────────────────────
  // 에러: 데이터 부재
  // ────────────────────────────────────────────────────────────────────────
  describe('에러: 데이터 부재', () => {
    it('product 없음 → throw', async () => {
      state.productRow = { data: null, error: { message: 'not found' } }
      state.assetRow = {
        data: { id: 'pc-6', metadata: { data: { lowestPrice: '40000' } } },
        error: null,
      }

      await expect(
        generatePriceEmphasisText({
          productId: 'missing',
          priceCompareAssetId: 'pc-6',
        }),
      ).rejects.toThrow(/Product not found/)
    })

    it('price_compare asset 없음 → throw', async () => {
      state.productRow = {
        data: { id: 'p1', name: 'x', price: 8900 },
        error: null,
      }
      state.assetRow = { data: null, error: { message: 'not found' } }

      await expect(
        generatePriceEmphasisText({
          productId: 'p1',
          priceCompareAssetId: 'missing',
        }),
      ).rejects.toThrow(/price_compare.*not found/i)
    })

    it('lowestPrice 가 metadata 에 없음 → throw', async () => {
      state.productRow = {
        data: { id: 'p1', name: 'x', price: 8900 },
        error: null,
      }
      state.assetRow = {
        data: { id: 'pc-7', metadata: { data: { lowestPrice: null } } },
        error: null,
      }

      await expect(
        generatePriceEmphasisText({
          productId: 'p1',
          priceCompareAssetId: 'pc-7',
        }),
      ).rejects.toThrow(/네이버 가격 데이터 없음/)
    })

    it('lowestPrice 가 파싱 불가 문자열 → throw', async () => {
      state.productRow = {
        data: { id: 'p1', name: 'x', price: 8900 },
        error: null,
      }
      state.assetRow = {
        data: { id: 'pc-8', metadata: { data: { lowestPrice: '가격문의' } } },
        error: null,
      }

      await expect(
        generatePriceEmphasisText({
          productId: 'p1',
          priceCompareAssetId: 'pc-8',
        }),
      ).rejects.toThrow(/네이버 가격 데이터 없음/)
    })
  })

  // ────────────────────────────────────────────────────────────────────────
  // 경계: 100자 정확
  // ────────────────────────────────────────────────────────────────────────
  describe('경계: 100자 제한', () => {
    it('shortName 이 매우 긴 경우에도 100자 이내 (없으면 throw "형식 위반")', async () => {
      process.env.STORE_SHORTNAME = '이건말도안되게긴매장약칭이름값입니다정말로아주아주아주길어요'

      state.productRow = {
        data: { id: 'p1', name: 'x', price: 999999 },
        error: null,
      }
      state.assetRow = {
        data: { id: 'pc-9', metadata: { data: { lowestPrice: '9999999' } } },
        error: null,
      }

      // 100자 초과 시 명시적 에러 (PRD §8.4 — 100자 이내 약속)
      await expect(
        generatePriceEmphasisText({
          productId: 'p1',
          priceCompareAssetId: 'pc-9',
        }),
      ).rejects.toThrow(/형식 위반|100자/)
    })

    it('shortName 기본값 (STORE_SHORTNAME 미설정) → "특가" fallback, 100자 이내', async () => {
      delete process.env.STORE_SHORTNAME

      state.productRow = {
        data: { id: 'p1', name: 'x', price: 8900 },
        error: null,
      }
      state.assetRow = {
        data: { id: 'pc-10', metadata: { data: { lowestPrice: '40000' } } },
        error: null,
      }

      const result = await generatePriceEmphasisText({
        productId: 'p1',
        priceCompareAssetId: 'pc-10',
      })

      expect(result.content.length).toBeLessThanOrEqual(100)
      // shortName 환경 변수 없으면 fallback 표시
      expect(result.content).toMatch(/(특가|매장)/)
    })
  })

  // ────────────────────────────────────────────────────────────────────────
  // DB insert 저장 확인
  // ────────────────────────────────────────────────────────────────────────
  describe('generated_assets 저장', () => {
    it('insert 실패 시 throw', async () => {
      state.productRow = {
        data: { id: 'p1', name: 'x', price: 8900 },
        error: null,
      }
      state.assetRow = {
        data: { id: 'pc-11', metadata: { data: { lowestPrice: '40000' } } },
        error: null,
      }
      state.insertRow = { data: null, error: { message: 'insert failed' } }

      await expect(
        generatePriceEmphasisText({
          productId: 'p1',
          priceCompareAssetId: 'pc-11',
        }),
      ).rejects.toThrow(/save asset|insert failed/i)
    })
  })
})
