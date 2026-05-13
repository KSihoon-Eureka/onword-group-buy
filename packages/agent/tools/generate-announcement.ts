/**
 * Tool: generate_announcement
 * 
 * 카카오톡 오픈채팅 공고 텍스트 생성.
 * Claude API를 호출해 AI_DOCS/kakao-text-format.md 표준을 정확히 따르는 텍스트 생성.
 * 
 * 트랙: Track C (Day 1 Agent 3)
 * 의존: AI_DOCS/kakao-text-format.md (반드시 Read), products 테이블
 * 
 * 구현 절차:
 *   1. productId로 products 조회
 *   2. stage에 따라 다른 프롬프트 빌드:
 *      - stage 1: 슈미트 베개커버 예시를 few-shot으로 + 변수 매핑
 *      - stage 3: 오늘 pickup_date인 모든 active 상품 조회 + 목록 형식
 *   3. Claude API 호출 (max_tokens 2048, temperature 0.7)
 *   4. 생성된 텍스트를 generated_assets에 저장 (type='announcement', stage)
 *   5. 결과 반환
 * 
 * TDD 요구:
 *   - 슈미트 베개커버 입력 → 클라이언트 예시와 *구조적으로* 일치 (이모지 줄, 날짜 포맷, 마지막 안내)
 *   - 가격이 null이면 throw (필수 필드)
 *   - Claude API 실패 시 graceful error (추측 채움 금지)
 */

import Anthropic from '@anthropic-ai/sdk'
import { createServiceClient } from '@onword/db'
import type {
  GenerateAnnouncementInput,
  GenerateAnnouncementOutput,
} from '@onword/types'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function generateAnnouncement(
  input: GenerateAnnouncementInput & { _traceId?: string }
): Promise<GenerateAnnouncementOutput> {
  const { productId, stage, _traceId } = input
  const supabase = createServiceClient()
  
  // 1. 상품 조회
  const { data: product, error } = await supabase
    .from('products')
    .select('*')
    .eq('id', productId)
    .single()
  
  if (error || !product) {
    throw new Error(`Product not found: ${productId}`)
  }
  
  // 2. 프롬프트 빌드
  // TODO: AI_DOCS/kakao-text-format.md §1 (stage 1) / §3 (stage 3) 형식 정확히 반영
  //       - 슈미트 베개커버 예시를 few-shot으로 주입
  //       - process.env.STORE_NAME, BRAND_NAME, STORE_SHORTNAME 활용
  //       - 날짜는 "MM월 DD일(요일) 오전/오후 H시" 형식으로 변환
  const systemPrompt = `[TODO: AI_DOCS/kakao-text-format.md §${stage} 표준]`
  const userPrompt = `[TODO: product 데이터로 변수 매핑]`
  
  // 3. Claude API 호출
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    temperature: 0.7,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  })
  
  const textBlock = response.content.find(b => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('Claude returned no text')
  }
  const content = textBlock.text
  
  // 4. generated_assets에 저장
  const { data: asset, error: assetError } = await supabase
    .from('generated_assets')
    .insert({
      product_id: productId,
      trace_step_id: _traceId ?? null,
      type: 'announcement',
      stage: `stage_${stage}`,
      content,
      metadata: { stage, model: 'claude-sonnet-4-20250514' },
    })
    .select('id')
    .single()
  
  if (assetError || !asset) {
    throw new Error(`Failed to save asset: ${assetError?.message}`)
  }
  
  return {
    content,
    assetId: asset.id,
  }
}
