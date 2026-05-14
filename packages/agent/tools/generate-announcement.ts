/**
 * Tool: generate_announcement (PRD §10.1 + §8.1-§8.3)
 *
 * 카카오톡 오픈채팅 공고 텍스트 생성.
 *   - Stage 1: 모집 시작 공고 (PRD §8.1)
 *   - Stage 2: 마감 임박 공고 (PRD §8.2, 단일 / 다중 분기)
 *   - Stage 3: 수령 안내 공고 (PRD §8.3, 오늘 픽업 가능 상품)
 *
 * 의존:
 *   - Anthropic SDK (text 생성)
 *   - Supabase: stores / products / generated_assets
 *
 * 에러 정책 (A3 — chain 실패 시 중단):
 *   - input validation 실패 → throw 동기 (Claude 호출 전)
 *   - product / store 미존재 → throw
 *   - Stage 3 빈 결과 → throw "표시할 상품 없음"
 *   - Anthropic 429 → exponential backoff 2회 재시도 (총 3회 시도)
 *   - 그 외 Anthropic 에러 → 즉시 throw (retry X)
 *
 * 외부 의존 mocking:
 *   - new Anthropic() — vi.mock 으로 messages.create 가짜화 가능.
 *   - createServiceClient() — vi.mock('@onword/db') 으로 from() 라우팅 가짜화.
 */

import Anthropic from '@anthropic-ai/sdk'
import { createServiceClient } from '@onword/db'
import type {
  AnnouncementStage,
  AssetType,
  GenerateAnnouncementInput,
  GenerateAnnouncementOutput,
} from '@onword/types'

// =====================================================
// 상수
// =====================================================

const MODEL = 'claude-sonnet-4-20250514'
const MAX_TOKENS = 2048
const TEMPERATURE = 0.7
const MAX_RETRIES_ON_429 = 2
const BASE_BACKOFF_MS = 200

const STAGE_TO_ASSET_TYPE: Record<AnnouncementStage, AssetType> = {
  1: 'announcement_stage1',
  2: 'announcement_stage2',
  3: 'announcement_stage3',
}

// =====================================================
// 내부 타입
// =====================================================

interface StoreConfigRow {
  id: string
  name: string
  brand_name: string | null
  short_name: string | null
  leading_emoji: string | null
}

interface ProductRow {
  id: string
  store_id: string
  name: string
  description: string | null
  category: string | null
  price: number
  compare_price: number | null
  order_deadline: string
  pickup_date: string
  pickup_deadline: string
  status: string
}

// =====================================================
// Public entry
// =====================================================

export async function generateAnnouncement(
  input: GenerateAnnouncementInput & { _traceId?: string; _traceStepId?: string },
): Promise<GenerateAnnouncementOutput> {
  const { stage, storeId, _traceStepId } = input

  if (stage !== 1 && stage !== 2 && stage !== 3) {
    throw new Error(`Invalid stage: ${String(stage)}. Must be 1, 2, or 3.`)
  }
  if (!storeId) {
    throw new Error('storeId is required')
  }

  const supabase = createServiceClient()
  const store = await fetchStore(supabase, storeId)

  let products: ProductRow[]
  let primaryProductId: string | null

  if (stage === 1) {
    if (!input.productId) {
      throw new Error('productId is required for stage 1')
    }
    const product = await fetchProductById(supabase, input.productId)
    products = [product]
    primaryProductId = product.id
  } else if (stage === 2) {
    if (input.productIds && input.productIds.length > 0) {
      products = await fetchProductsByIds(supabase, input.productIds)
      primaryProductId = null
    } else if (input.productId) {
      const product = await fetchProductById(supabase, input.productId)
      products = [product]
      primaryProductId = product.id
    } else {
      throw new Error(
        'stage 2 requires productId (single) or productIds (multi)',
      )
    }
  } else {
    // stage 3
    const today = todayKstDate()
    products = await fetchTodayPickupProducts(supabase, storeId, today)
    if (products.length === 0) {
      throw new Error(`표시할 상품 없음 — 오늘(${today}) 픽업 가능 상품 0건`)
    }
    primaryProductId = null
  }

  const { system, user } = buildPrompt(stage, store, products)
  const content = await callClaudeWithRetry(system, user)

  const assetId = await saveAsset(supabase, {
    storeId,
    productId: primaryProductId,
    traceStepId: _traceStepId ?? null,
    type: STAGE_TO_ASSET_TYPE[stage],
    stage,
    content,
  })

  return { content, assetId }
}

// =====================================================
// Supabase helpers
// =====================================================

async function fetchStore(
  supabase: ReturnType<typeof createServiceClient>,
  storeId: string,
): Promise<StoreConfigRow> {
  const { data, error } = await supabase
    .from('stores')
    .select('id, name, brand_name, short_name, leading_emoji')
    .eq('id', storeId)
    .single()

  if (error) {
    throw new Error(`Failed to fetch store: ${error.message}`)
  }
  if (!data) {
    throw new Error(`Store not found: ${storeId}`)
  }
  return data as unknown as StoreConfigRow
}

async function fetchProductById(
  supabase: ReturnType<typeof createServiceClient>,
  productId: string,
): Promise<ProductRow> {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('id', productId)
    .single()

  if (error) {
    throw new Error(`Failed to fetch product: ${error.message}`)
  }
  if (!data) {
    throw new Error(`Product not found: ${productId}`)
  }
  return data as unknown as ProductRow
}

async function fetchProductsByIds(
  supabase: ReturnType<typeof createServiceClient>,
  ids: string[],
): Promise<ProductRow[]> {
  const { data, error } = (await supabase
    .from('products')
    .select('*')
    .in('id', ids)) as { data: ProductRow[] | null; error: { message: string } | null }

  if (error) {
    throw new Error(`Failed to fetch products: ${error.message}`)
  }
  if (!data || data.length === 0) {
    throw new Error(`No products found for ids: ${ids.join(', ')}`)
  }
  return data
}

async function fetchTodayPickupProducts(
  supabase: ReturnType<typeof createServiceClient>,
  storeId: string,
  today: string,
): Promise<ProductRow[]> {
  // store_id 컬럼이 packages/db 의 Row 타입에 누락 (migrations 0002 에서 추가됨).
  // 본 tool 내부에서만 cast — 전역 type 수정은 cascading change 라서 회피.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: any = supabase.from('products').select('*')
  const { data, error } = (await builder
    .eq('store_id', storeId)
    .eq('pickup_date', today)
    .eq('status', 'active')) as {
    data: ProductRow[] | null
    error: { message: string } | null
  }

  if (error) {
    throw new Error(`Failed to fetch today's pickup products: ${error.message}`)
  }
  return data ?? []
}

async function saveAsset(
  supabase: ReturnType<typeof createServiceClient>,
  args: {
    storeId: string
    productId: string | null
    traceStepId: string | null
    type: AssetType
    stage: AnnouncementStage
    content: string
  },
): Promise<string> {
  const { data, error } = (await supabase
    .from('generated_assets')
    .insert({
      store_id: args.storeId,
      product_id: args.productId,
      trace_step_id: args.traceStepId,
      type: args.type,
      stage: `stage_${args.stage}`,
      content: args.content,
      metadata: { stage: args.stage, model: MODEL },
    } as never)
    .select('id')
    .single()) as { data: { id: string } | null; error: { message: string } | null }

  if (error || !data) {
    throw new Error(`Failed to save asset: ${error?.message ?? 'no data'}`)
  }
  return data.id
}

// =====================================================
// Anthropic call + retry
// =====================================================

let _anthropic: Anthropic | null = null
function getAnthropic(): Anthropic {
  if (!_anthropic) {
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }
  return _anthropic
}

async function callClaudeWithRetry(
  system: string,
  user: string,
): Promise<string> {
  let attempt = 0
  // 최대 attempt: 1 + MAX_RETRIES_ON_429 (총 3회)
  while (true) {
    try {
      const response = await getAnthropic().messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        temperature: TEMPERATURE,
        system,
        messages: [{ role: 'user', content: user }],
      })

      const textBlock = response.content.find(
        (b): b is { type: 'text'; text: string } => b.type === 'text',
      )
      if (!textBlock) {
        throw new Error('Claude returned no text block')
      }
      return textBlock.text
    } catch (err) {
      const status = (err as { status?: number }).status
      if (status === 429 && attempt < MAX_RETRIES_ON_429) {
        const delay = BASE_BACKOFF_MS * Math.pow(2, attempt)
        await sleep(delay)
        attempt += 1
        continue
      }
      throw err
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// =====================================================
// Prompt builders (PRD §8.1 / §8.2 / §8.3)
// =====================================================

function buildPrompt(
  stage: AnnouncementStage,
  store: StoreConfigRow,
  products: ProductRow[],
): { system: string; user: string } {
  switch (stage) {
    case 1:
      return buildStage1Prompt(store, products[0])
    case 2:
      return products.length > 1
        ? buildStage2MultiPrompt(store, products)
        : buildStage2SinglePrompt(store, products[0])
    case 3:
      return buildStage3Prompt(store, products)
  }
}

function buildStage1Prompt(
  store: StoreConfigRow,
  p: ProductRow,
): { system: string; user: string } {
  const storeName = store.name
  const brandName = store.brand_name ?? ''
  const shortName = store.short_name ?? store.name
  const leadingEmoji = store.leading_emoji ?? '🎁'

  const price = formatKrw(p.price)
  const comparePrice = p.compare_price != null ? formatKrw(p.compare_price) : null
  const orderDeadline = formatKoreanDateTime(p.order_deadline)
  const pickupDate = formatKoreanDate(p.pickup_date)
  const pickupDeadline = formatKoreanDate(p.pickup_deadline)

  const system = `당신은 한국 오프라인 매장 공동구매 카카오톡 오픈채팅 공고 작성 전문가입니다.

다음 형식을 *정확히* 따르세요 (PRD §8.1 Stage 1 — 모집 시작 공고):

\`\`\`
${leadingEmoji} ${storeName} & ${brandName} 오늘의상품 {price}원
🎁 {product.fullName}

❌ 시중가: {comparePrice}원대
🌈 ${shortName} 특가 👉 {price}원 🔥

{emojiLine1} {감성 설명 1 — 사용 상황/계절감}
{emojiLine2} {감성 설명 2 — 사용감 강조}
{emojiLine3} {감성 설명 3 — 필요성 강조}
{emojiLine4} {추가 — 세트 구성}
📐 {규격 정보}
🧊 {핵심 소재}
🧶 {추가 소재}

😍 역대급 가격으로 {productCategory} 득템!

❌ 수량소진시 조기 마감 ❌

⏳ 예약 마감일 : {orderDeadline}
🚚 입고 예정일 : {pickupDate}
▶️ 수령 마감일 : {pickupDeadline} 까지
📌 수령 마감일이 지나면 자동 취소됨을 알려드립니다.

🔴 예약시 상품명 적어주세요 🔴
✅ 예시) {productShortName} 1세트 + 휴대번호 4자리
\`\`\`

규칙:
- 첫 줄 이모지는 ${leadingEmoji} 고정.
- 가격은 천단위 콤마 (예: 8,900원).
- 날짜는 한국어 "MM월 DD일(요일)" 또는 "MM월 DD일(요일) 오전/오후 H시".
- 감성 설명 + 이모지는 상품 description / category 에 맞춰 AI 가 선택.
- 1,000자 이내.
- 코드 블록 없이 본문만 반환.`

  const user = `상품 정보:
- 매장명: ${storeName}
- 브랜드: ${brandName}
- 짧은이름: ${shortName}
- 첫줄이모지: ${leadingEmoji}
- 상품명(전체): ${p.name}
- 카테고리: ${p.category ?? ''}
- 설명: ${p.description ?? ''}
- 가격: ${price}원
- 시중가: ${comparePrice ? comparePrice + '원대' : '미정'}
- 예약 마감일: ${orderDeadline}
- 입고 예정일: ${pickupDate}
- 수령 마감일: ${pickupDeadline}

위 정보로 §8.1 형식 공고를 작성하세요.`

  return { system, user }
}

function buildStage2SinglePrompt(
  store: StoreConfigRow,
  p: ProductRow,
): { system: string; user: string } {
  const shortName = store.short_name ?? store.name
  const price = formatKrw(p.price)
  const comparePrice = p.compare_price != null ? formatKrw(p.compare_price) : '미정'
  const deadline = formatKoreanDeadline(p.order_deadline)

  const system = `당신은 카카오톡 마감 임박 공고 작성자입니다. PRD §8.2 단일 상품 형식:

\`\`\`
⏰ 곧 마감되는 공구 상품이에요!

🎁 {product.fullName}
👉 {price}원 (시중가 {comparePrice}원)

⏳ 예약 마감 : {deadline}

🔥 이번이 마지막 기회입니다!

🔴 예약시 상품명 적어주세요 🔴
✅ 예시) {productShortName} 1세트 + 휴대번호 4자리
\`\`\`

200자 이내. 가격 콤마. 코드 블록 없이 본문만.`

  const user = `매장: ${store.name} / 브랜드: ${store.brand_name ?? ''} / 짧은이름: ${shortName}
상품명: ${p.name}
가격: ${price}원
시중가: ${comparePrice}원
예약 마감: ${deadline}`

  return { system, user }
}

function buildStage2MultiPrompt(
  store: StoreConfigRow,
  products: ProductRow[],
): { system: string; user: string } {
  const lines = products
    .map((p) => `- ${p.name} (${formatKrw(p.price)}원), 마감 ${formatKoreanDeadline(p.order_deadline)}`)
    .join('\n')

  const system = `당신은 카카오톡 마감 임박 공고 작성자입니다. PRD §8.2 다중 상품 형식:

\`\`\`
⏰ 곧 마감되는 공구 상품들이에요!

🎁 {p1.name} ({p1.price}원)
🎁 {p2.name} ({p2.price}원)
🎁 {p3.name} ({p3.price}원)

⏳ {공통 마감 또는 각 상품별}!

🔥 놓치지 마세요!
\`\`\`

500자 이내. 가격 콤마. 코드 블록 없이 본문만.`

  const user = `매장: ${store.name} / 브랜드: ${store.brand_name ?? ''}
마감 임박 상품 ${products.length}개:
${lines}`

  return { system, user }
}

function buildStage3Prompt(
  store: StoreConfigRow,
  products: ProductRow[],
): { system: string; user: string } {
  const productLines = products.map((p) => `🎁 ${p.name}`).join('\n')

  const system = `당신은 카카오톡 수령 안내 공고 작성자입니다. PRD §8.3 형식:

\`\`\`
📢 오늘 수령 가능 상품 안내

🎁 {p1.name}
🎁 {p2.name}
🎁 {pN.name}

늦지 않게 방문해 주세요! 🏃 💨
감사합니다! 🥰
\`\`\`

코드 블록 없이 본문만. 상품 이름만 그대로 사용. 임의 가공 금지.`

  const user = `매장: ${store.name}
오늘 수령 가능 상품 ${products.length}개:
${productLines}`

  return { system, user }
}

// =====================================================
// Format helpers
// =====================================================

function formatKrw(n: number): string {
  return n.toLocaleString('ko-KR')
}

const WEEKDAYS_KO = ['일', '월', '화', '수', '목', '금', '토']

/**
 * "2025-05-09" / ISO → "05월 09일(금)".
 * KST 기준 (UTC+9). DB date 컬럼은 시간정보 없음 — KST 자정으로 처리.
 */
function formatKoreanDate(input: string): string {
  const date = parseKstDate(input)
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  const weekday = WEEKDAYS_KO[date.getUTCDay()]
  return `${month}월 ${day}일(${weekday})`
}

/**
 * ISO timestamp → "05월 07일(목) 오후 2시".
 */
function formatKoreanDateTime(input: string): string {
  const base = formatKoreanDate(input)
  const d = new Date(input)
  // KST shift
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000)
  const hour24 = kst.getUTCHours()
  const period = hour24 < 12 ? '오전' : '오후'
  const hour12 = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24
  return `${base} ${period} ${hour12}시`
}

/**
 * Stage 2 deadline 문구: 오늘이면 "오늘 오후 H시", 내일이면 "내일 오전/오후 H시",
 * 그 외 일반 "MM월 DD일(요일) 오전/오후 H시".
 */
function formatKoreanDeadline(input: string): string {
  const d = new Date(input)
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000)
  const todayKst = new Date(new Date().getTime() + 9 * 60 * 60 * 1000)

  const sameDay =
    kst.getUTCFullYear() === todayKst.getUTCFullYear() &&
    kst.getUTCMonth() === todayKst.getUTCMonth() &&
    kst.getUTCDate() === todayKst.getUTCDate()

  const tomorrowKst = new Date(todayKst.getTime() + 24 * 60 * 60 * 1000)
  const nextDay =
    kst.getUTCFullYear() === tomorrowKst.getUTCFullYear() &&
    kst.getUTCMonth() === tomorrowKst.getUTCMonth() &&
    kst.getUTCDate() === tomorrowKst.getUTCDate()

  const hour24 = kst.getUTCHours()
  const period = hour24 < 12 ? '오전' : '오후'
  const hour12 = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24

  if (sameDay) return `오늘 ${period} ${hour12}시`
  if (nextDay) return `내일 ${period} ${hour12}시`
  return formatKoreanDateTime(input)
}

/**
 * "2025-05-09" 또는 ISO → KST 기준 Date (UTC 캘린더 값으로 KST 일자 표현).
 */
function parseKstDate(input: string): Date {
  // YYYY-MM-DD 단순 케이스 — 그날 자정 KST = UTC 전날 15:00. 단순화를 위해
  // UTC 자정으로 잡되 결과 표시 시 같은 캘린더 일자가 나오면 OK.
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    return new Date(`${input}T00:00:00Z`)
  }
  const d = new Date(input)
  return new Date(d.getTime() + 9 * 60 * 60 * 1000)
}

/**
 * 오늘 (KST) "YYYY-MM-DD" — Stage 3 픽업 쿼리용.
 */
function todayKstDate(): string {
  const now = new Date()
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  const y = kst.getUTCFullYear()
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0')
  const d = String(kst.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
