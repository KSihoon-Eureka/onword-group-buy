/**
 * Tool Registry — Phase C.5 mock 단계.
 *
 * 목적:
 *   - Orchestrator가 사용할 tool 8개 등록 (PRD §10, ToolName 8 entries).
 *   - 본 워커(C.5)는 *모든 handler 가 no-op mock* — 실제 구현은 Phase D (D.1–D.10).
 *   - Phase D 머지 시 mockHandler 자리에 실제 함수 swap.
 *
 * 명세:
 *   - ToolHandler 시그니처는 orchestrator 와 동일. (input, ctx) => Promise<unknown>.
 *   - Mock handler 는 { message: 'Phase D에서 구현됩니다', ... } 반환. throw 안 함 (success path).
 *
 * Anthropic Tool schema (TOOL_SCHEMAS):
 *   - Phase D 의 동적 Claude tool_use loop 진입 시 사용 (현재 본 워커는 정적 chain mode).
 *   - 각 schema 는 PRD §10 의 시그니처와 1:1.
 */

import type Anthropic from '@anthropic-ai/sdk'
import type { ToolName } from '@onword/types'

// =====================================================
// ToolContext / ToolHandler
// =====================================================

export interface ToolContext {
  traceId: string
  storeId: string
  productId: string | null
  userId: string | null
}

export type ToolHandler = (
  input: Record<string, unknown>,
  ctx: ToolContext,
) => Promise<unknown>

// =====================================================
// Mock handler factory (Phase C.5)
// =====================================================

export const PHASE_D_PLACEHOLDER = 'Phase D에서 구현됩니다'

function mockHandler(toolName: ToolName): ToolHandler {
  return async (input, _ctx) => ({
    message: PHASE_D_PLACEHOLDER,
    toolName,
    input,
  })
}

// =====================================================
// Registry — ToolName 8개 (packages/types/index.ts 와 1:1)
// =====================================================

export const TOOL_REGISTRY: Record<ToolName, ToolHandler> = {
  generate_announcement: mockHandler('generate_announcement'),
  generate_price_emphasis_text: mockHandler('generate_price_emphasis_text'),
  crawl_naver_images: mockHandler('crawl_naver_images'),
  crawl_naver_price: mockHandler('crawl_naver_price'),
  compose_poster: mockHandler('compose_poster'),
  generate_pickup_table: mockHandler('generate_pickup_table'),
  get_orders: mockHandler('get_orders'),
  notify_wholesaler: mockHandler('notify_wholesaler'),
}

export const TOOL_NAMES: readonly ToolName[] = Object.keys(
  TOOL_REGISTRY,
) as ToolName[]

// =====================================================
// Anthropic Tool schemas — Phase D Claude tool_use loop 진입 시 사용
// =====================================================

export const TOOL_SCHEMAS: Anthropic.Tool[] = [
  {
    name: 'generate_announcement',
    description:
      '오픈채팅(카카오톡) 공고 텍스트를 생성한다. stage=1 모집 / 2 마감임박 / 3 수령안내. AI_DOCS/kakao-text-format.md 표준 준수.',
    input_schema: {
      type: 'object',
      properties: {
        productId: { type: 'string', description: 'stage 1/2 단일 상품 ID.' },
        productIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'stage 2 다중 상품 ID.',
        },
        storeId: { type: 'string', description: 'stage 3 (오늘 픽업) 매장 ID.' },
        stage: { type: 'number', enum: [1, 2, 3] },
      },
      required: ['storeId', 'stage'],
    },
  },
  {
    name: 'generate_price_emphasis_text',
    description:
      '네이버 가격 비교 결과를 카톡용 100자 이내 짧은 텍스트로 변환. 할인 효과 없으면 throw.',
    input_schema: {
      type: 'object',
      properties: {
        productId: { type: 'string' },
        priceCompareAssetId: { type: 'string' },
      },
      required: ['productId', 'priceCompareAssetId'],
    },
  },
  {
    name: 'crawl_naver_images',
    description:
      '네이버 쇼핑에서 상품 이미지 최대 6장 크롤 + 분류(product/detail/lifestyle). Supabase Storage 업로드.',
    input_schema: {
      type: 'object',
      properties: {
        productId: { type: 'string' },
        productName: { type: 'string' },
        maxImages: { type: 'number', description: 'default 6.' },
      },
      required: ['productId', 'productName'],
    },
  },
  {
    name: 'crawl_naver_price',
    description:
      '네이버 가격비교 페이지 크롤 + 스크린샷. 실패 시 빈 결과 (추측 금지).',
    input_schema: {
      type: 'object',
      properties: {
        productName: { type: 'string' },
      },
      required: ['productName'],
    },
  },
  {
    name: 'compose_poster',
    description:
      '상품 이미지 + 텍스트 합성 → 800×950 PNG 포스터. Sharp + Pretendard. 생성 AI 미사용.',
    input_schema: {
      type: 'object',
      properties: {
        productId: { type: 'string' },
        baseImageUrl: { type: 'string', description: '미지정 시 products.primary_image_url.' },
        textOverlay: {
          type: 'object',
          properties: {
            category: { type: 'string' },
            spec: { type: 'string' },
          },
        },
      },
      required: ['productId'],
    },
  },
  {
    name: 'generate_pickup_table',
    description:
      '진행 중 상품들의 수령 가능 기간 시각화 테이블 이미지 + 동반 카톡 텍스트 생성.',
    input_schema: {
      type: 'object',
      properties: {
        storeId: { type: 'string' },
        rangeDays: { type: 'number', description: 'default 5 (3-7).' },
        productIds: { type: 'array', items: { type: 'string' } },
      },
      required: ['storeId'],
    },
  },
  {
    name: 'get_orders',
    description: '특정 상품/매장의 주문 내역 조회. anomaly 분리 옵션.',
    input_schema: {
      type: 'object',
      properties: {
        storeId: { type: 'string' },
        productId: { type: 'string' },
        includeAnomalies: { type: 'boolean' },
      },
      required: ['storeId'],
    },
  },
  {
    name: 'notify_wholesaler',
    description:
      '도매업자에게 주문 내역 이메일 전송 (Resend). customer_phone 절대 제외 (PIPA).',
    input_schema: {
      type: 'object',
      properties: {
        productId: { type: 'string' },
        recipientOverride: { type: 'string' },
      },
      required: ['productId'],
    },
  },
]
