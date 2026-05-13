/**
 * TDD: generate_announcement
 * 
 * 이 테스트들이 통과하기 전에는 머지 금지.
 * Fixture: schmidt-pillow-cover.json (클라이언트 실제 예시)
 * 
 * 실행:
 *   pnpm test --filter=@onword/agent generate-announcement
 * 
 * 환경:
 *   - ANTHROPIC_API_KEY 필요 (실제 API 호출 테스트)
 *   - Supabase는 mock (Tool 구현이 createServiceClient 호출하므로)
 *   - CI에서는 API 호출 테스트 skip, structural 테스트만 실행
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import fixture from './__fixtures__/schmidt-pillow-cover.json'

// Supabase mock
vi.mock('@onword/db', () => ({
  createServiceClient: () => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: fixture.product, error: null }),
        })),
      })),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: { id: 'asset-1' }, error: null }),
        })),
      })),
    })),
  }),
}))

import { generateAnnouncement } from '../generate-announcement'

describe('generate_announcement', () => {
  beforeEach(() => {
    process.env.STORE_NAME = '판다팜'
    process.env.BRAND_NAME = '산타'
    process.env.STORE_SHORTNAME = '산타가족'
  })
  
  describe('Stage 1: 모집 시작 공고', () => {
    it.skip('TDD: 슈미트 베개커버 입력 → 구조적 일치', async () => {
      // skip 이유: 실제 Claude API 호출 필요. 구현 후 unskip.
      const result = await generateAnnouncement({
        productId: 'test-schmidt-001',
        stage: 1,
      })
      
      expect(result.content).toBeTruthy()
      expect(result.assetId).toBeTruthy()
      
      const text = result.content
      
      // Structural checks (정확한 텍스트 일치 X — 구조만)
      for (const must of fixture.structural_checks_stage_1.must_contain) {
        expect(text).toContain(must)
      }
      
      // Length check
      expect(text.length).toBeLessThan(
        fixture.structural_checks_stage_1.max_length
      )
      
      // First line starts with 🎅
      const firstLine = text.split('\n')[0]
      expect(firstLine).toMatch(/^🎅/)
    })
  })
  
  describe('Stage 3: 수령 안내 공고', () => {
    it.skip('TDD: 오늘 수령 가능 상품 목록', async () => {
      // skip 이유: 실제 Claude API 호출 필요.
      // 예상 출력:
      //   📢 오늘 수령 가능 상품 안내
      //   🎁 슈미트 베개커버
      //   ...
      //   늦지 않게 방문해 주세요! 🏃 💨
      //   감사합니다! 🥰
      const result = await generateAnnouncement({
        productId: 'test-schmidt-001',
        stage: 3,
      })
      
      expect(result.content).toMatch(/오늘 수령 가능/)
      expect(result.content).toMatch(/🎁/)
      expect(result.content).toMatch(/감사합니다/)
    })
  })
  
  describe('에러 케이스', () => {
    it('throws when product not found', async () => {
      // TODO: mock을 product=null로 바꿔 throw 검증
    })
    
    it('throws when Claude returns no text', async () => {
      // TODO: anthropic mock을 빈 content로
    })
  })
})
