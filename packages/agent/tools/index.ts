/**
 * Tool Registry — Phase D 통합 본 (실제 함수 wiring).
 *
 * 목적:
 *   - Orchestrator 가 호출할 tool 8 개를 *실제 구현* 으로 등록 (PRD §10).
 *   - Phase C.5 mock 단계는 제거되었다. mockHandler / PHASE_D_PLACEHOLDER 는
 *     테스트 호환 + 외부 mock 시 fallback 용도로 남겨두되 등록은 안 함.
 *
 * Adapter (makeHandler):
 *   - tool 실제 함수 시그니처는 `(input) => Promise<...>` 이고 input 에
 *     `_traceId / _traceStepId / _userId` 같은 사적 메타 필드를 받는다 (PRD §10.x).
 *   - ToolHandler 시그니처는 `(input, ctx) => Promise<unknown>` 이라
 *     orchestrator 의 ToolContext (traceId/storeId/productId/userId) 에서
 *     이 메타 필드들을 input 에 *주입* 한다.
 *   - orchestrator 가 toolInput 에 이미 storeId/productId 를 넣어주므로
 *     adapter 는 ctx 정보를 *덮어쓰지 않는다* (input 우선).
 *
 * Anthropic Tool schema (TOOL_SCHEMAS):
 *   - Phase D 의 Claude 동적 tool_use loop 진입 시 사용. 본 워커는 정적 chain mode.
 *   - 각 schema 는 PRD §10 의 시그니처와 1:1.
 */

import type Anthropic from '@anthropic-ai/sdk'
import type { ToolName } from '@onword/types'

import { generateAnnouncement } from './generate-announcement'
import { generatePriceEmphasisText } from './generate-price-emphasis-text'
import { crawlNaverImages } from './crawl-naver-images'
import { crawlNaverPrice } from './crawl-naver-price'
import { composePoster } from './compose-poster'
import { generatePickupTable } from './generate-pickup-table'
import { getOrders } from './get-orders'
import { notifyWholesaler } from './notify-wholesaler'

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
// 메타 주입 키 (각 tool 내부에서 받는 사적 필드 이름)
// =====================================================
//
// generate_announcement / generate_price_emphasis_text /
// crawl_naver_* / compose_poster / generate_pickup_table / get_orders:
//   - `_traceId` 한 가지만 받음 (트레이스 step 연결용).
//
// notify_wholesaler:
//   - `_traceStepId` (audit_log/asset 연결) + `_userId` (phone_access_log).
//
// adapter 는 모든 키를 *덮어쓰지 않게* 안전하게 주입 (input 우선).

interface InjectedMeta {
  _traceId?: string
  _traceStepId?: string
  _userId?: string | null
}

function injectCtx(
  input: Record<string, unknown>,
  ctx: ToolContext,
): Record<string, unknown> {
  const meta: InjectedMeta = {}
  if (!('_traceId' in input)) meta._traceId = ctx.traceId
  if (!('_traceStepId' in input)) meta._traceStepId = ctx.traceId
  if (!('_userId' in input)) meta._userId = ctx.userId
  return { ...meta, ...input }
}

/**
 * Tool 실제 함수를 ToolHandler 시그니처로 wrapping.
 * - input 에 ctx 메타 (_traceId / _traceStepId / _userId) 주입.
 * - tool 내부 input 검증은 그대로 (storeId/productId/productName 등 누락 시 throw).
 *
 * export 이유: 테스트에서 adapter 동작 직접 검증 (ctx 주입 + input 덮어쓰기 방지).
 */
export function makeHandler<TInput, TOutput>(
  fn: (input: TInput) => Promise<TOutput>,
): ToolHandler {
  return async (input, ctx) => {
    const enriched = injectCtx(input, ctx)
    return fn(enriched as unknown as TInput)
  }
}

// =====================================================
// Mock handler (legacy — Phase C.5 호환 + 등록에는 사용 안 함)
// =====================================================
//
// 외부 테스트가 vi.mock 으로 TOOL_REGISTRY 를 override 하거나, 또는
// PHASE_D_PLACEHOLDER 텍스트를 fixture 로 import 하는 케이스가 있어 보존.

export const PHASE_D_PLACEHOLDER = 'Phase D에서 구현됩니다'

/** @internal — 테스트용. 신규 코드는 import 하지 말 것. */
export function mockHandler(toolName: ToolName): ToolHandler {
  return async (input, _ctx) => ({
    message: PHASE_D_PLACEHOLDER,
    toolName,
    input,
  })
}

// =====================================================
// Registry — 8 tool 실제 함수 wiring (PRD §10)
// =====================================================

export const TOOL_REGISTRY: Record<ToolName, ToolHandler> = {
  generate_announcement: makeHandler(generateAnnouncement),
  generate_price_emphasis_text: makeHandler(generatePriceEmphasisText),
  crawl_naver_images: makeHandler(crawlNaverImages),
  crawl_naver_price: makeHandler(crawlNaverPrice),
  compose_poster: makeHandler(composePoster),
  generate_pickup_table: makeHandler(generatePickupTable),
  get_orders: makeHandler(getOrders),
  notify_wholesaler: makeHandler(notifyWholesaler),
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
