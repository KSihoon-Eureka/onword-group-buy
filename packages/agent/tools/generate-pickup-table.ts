/**
 * Tool: generate_pickup_table (PRD §10.6 + §13)
 *
 * 진행 중 모든 상품의 수령 가능 기간을 시각화한 PNG + 동반 카톡 텍스트.
 *   - 입력: { storeId, rangeDays? (default 5, 3-7), productIds? }
 *   - 출력: { imageUrl, imageAssetId, textAssetId, productCount }
 *   - 두 assets:
 *     - pickup_table_image (asset_url = PNG)
 *     - pickup_table_text  (content = §13.5 동반 안내)
 *
 * 폰트 정책: compose-poster 와 동일 — Pretendard 미존재, fontconfig fallback.
 *
 * 진행 상태 분류 (PRD §13.2):
 *   - 마감 임박: flow_stage in (arrived, pickup_ready) AND (pickup_deadline - today) ≤ 1d → 빨강
 *   - 수령 가능: flow_stage in (arrived, pickup_ready) AND > 1d → 초록
 *   - 상품 준비: flow_stage in (order_open, order_closed, warehouse_notified) → 회색
 *   - 표시 X: completed / cancelled (쿼리에서 제외)
 *
 * 출력 사양 (PRD §13.3):
 *   - 너비 800px, 높이 80 (header) + rowCount × 60 + 40 (footer)
 *   - 배경 흰색
 */

import sharp from 'sharp'
import { createServiceClient, uploadToStorage } from '@onword/db'
import type {
  GeneratePickupTableInput,
  GeneratePickupTableOutput,
} from '@onword/types'

// =====================================================
// 상수
// =====================================================

const TABLE_WIDTH = 800
const HEADER_HEIGHT = 80
const ROW_HEIGHT = 60
const FOOTER_HEIGHT = 40

const RANGE_DAYS_DEFAULT = 5
const RANGE_DAYS_MIN = 3
const RANGE_DAYS_MAX = 7

const COLOR_IMMINENT_BG = '#FEF2F2' // bg-red-50
const COLOR_IMMINENT_FG = '#DC2626' // text-red-600
const COLOR_AVAILABLE_BG = '#ECFDF5' // bg-emerald-50
const COLOR_AVAILABLE_FG = '#059669' // text-emerald-600
const COLOR_PREPARING_BG = '#FAFAFA' // bg-zinc-50
const COLOR_PREPARING_FG = '#52525B' // text-zinc-600
const COLOR_TEXT = '#111827'
const COLOR_MUTED = '#6B7280'
const COLOR_BG = '#FFFFFF'
const COLOR_HEADER_BG = '#F9FAFB'

const FONT_FAMILY = "Pretendard, 'Noto Sans KR', sans-serif"

const PICKUP_TABLE_COMPANION_TEXT = `🗓️ 이번 주 수령 가능 상품 안내

수령 가능한 상품과 마감일을 정리했어요!
빨간색은 *마감 임박*이니 빨리 찾으러 와주세요. 🏃

(이미지 첨부)

문의 사항은 매장으로 연락주세요. 🙏`

// 마감 임박 / 수령 가능 / 상품 준비 라벨 + 색
type StatusLabel = 'imminent' | 'available' | 'preparing'

// flow_stage 필터 — 쿼리에 사용
const VISIBLE_FLOW_STAGES = [
  'order_open',
  'order_closed',
  'warehouse_notified',
  'arrived',
  'pickup_ready',
]

// =====================================================
// 내부 타입
// =====================================================

interface ProductRow {
  id: string
  store_id: string
  name: string
  flow_stage: string
  pickup_date: string
  pickup_deadline: string
  status: string
}

// =====================================================
// Public entry
// =====================================================

export async function generatePickupTable(
  input: GeneratePickupTableInput & { _traceId?: string },
): Promise<GeneratePickupTableOutput> {
  // 1. 입력 검증
  if (!input || !input.storeId) {
    throw new Error('storeId is required')
  }
  const rangeDays = input.rangeDays ?? RANGE_DAYS_DEFAULT
  if (rangeDays < RANGE_DAYS_MIN || rangeDays > RANGE_DAYS_MAX) {
    throw new Error(
      `rangeDays out of range: ${rangeDays} (must be ${RANGE_DAYS_MIN}-${RANGE_DAYS_MAX})`,
    )
  }

  const supabase = createServiceClient()

  // 2. 상품 조회
  const products = await fetchProducts(supabase, input.storeId, input.productIds)
  if (products.length === 0) {
    throw new Error(
      `표시할 상품 없음 (storeId=${input.storeId}). 수령 가능한 상품이 0건입니다.`,
    )
  }

  // 3. 상태 분류 + 정렬
  const today = todayKstYmd()
  const enriched = products
    .map((p) => ({ p, status: classifyStatus(p, today) }))
    // 마감 임박 → 수령 가능 → 상품 준비 순. 같은 그룹 내 pickup_deadline asc.
    .sort((a, b) => {
      const orderA = statusOrder(a.status)
      const orderB = statusOrder(b.status)
      if (orderA !== orderB) return orderA - orderB
      return a.p.pickup_deadline.localeCompare(b.p.pickup_deadline)
    })

  // 4. SVG → PNG 렌더
  const svg = renderTableSvg(enriched, today, rangeDays)
  const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer()

  // 5. Storage 업로드
  const filename = `pickup-tables/${input.storeId}-${Date.now()}.png`
  const imageUrl = await uploadToStorage(filename, pngBuffer, 'image/png')

  // 6. 두 asset 저장: pickup_table_image + pickup_table_text
  const imageAssetId = await insertAsset(supabase, {
    store_id: input.storeId,
    product_id: null,
    trace_step_id: input._traceId ?? null,
    type: 'pickup_table_image',
    asset_url: imageUrl,
    content: null,
    metadata: {
      productIds: products.map((p) => p.id),
      productCount: products.length,
      rangeDays,
      width: TABLE_WIDTH,
      height: HEADER_HEIGHT + products.length * ROW_HEIGHT + FOOTER_HEIGHT,
    },
  })

  const textAssetId = await insertAsset(supabase, {
    store_id: input.storeId,
    product_id: null,
    trace_step_id: input._traceId ?? null,
    type: 'pickup_table_text',
    asset_url: null,
    content: PICKUP_TABLE_COMPANION_TEXT,
    metadata: { partnerImageAssetId: imageAssetId },
  })

  return {
    imageUrl,
    imageAssetId,
    textAssetId,
    productCount: products.length,
  }
}

// =====================================================
// Supabase helpers
// =====================================================

async function fetchProducts(
  supabase: ReturnType<typeof createServiceClient>,
  storeId: string,
  productIds?: string[],
): Promise<ProductRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = supabase.from('products').select('*')
  q = q.eq('store_id', storeId)
  q = q.eq('status', 'active')
  q = q.in('flow_stage', VISIBLE_FLOW_STAGES)
  if (productIds && productIds.length > 0) {
    q = q.in('id', productIds)
  }
  const { data, error } = (await q) as {
    data: ProductRow[] | null
    error: { message: string } | null
  }

  if (error) {
    throw new Error(`Failed to fetch products: ${error.message}`)
  }
  return data ?? []
}

async function insertAsset(
  supabase: ReturnType<typeof createServiceClient>,
  payload: {
    store_id: string
    product_id: string | null
    trace_step_id: string | null
    type: 'pickup_table_image' | 'pickup_table_text'
    asset_url: string | null
    content: string | null
    metadata: Record<string, unknown>
  },
): Promise<string> {
  const { data, error } = (await supabase
    .from('generated_assets')
    .insert(payload as never)
    .select('id')
    .single()) as {
    data: { id: string } | null
    error: { message: string } | null
  }

  if (error || !data) {
    throw new Error(
      `Failed to save asset (${payload.type}): ${error?.message ?? 'no data'}`,
    )
  }
  return data.id
}

// =====================================================
// 상태 분류 (PRD §13.2)
// =====================================================

function classifyStatus(p: ProductRow, today: string): StatusLabel {
  const arrivedStages = ['arrived', 'pickup_ready']
  if (arrivedStages.includes(p.flow_stage)) {
    const daysUntilDeadline = daysBetween(today, p.pickup_deadline)
    return daysUntilDeadline <= 1 ? 'imminent' : 'available'
  }
  return 'preparing'
}

function statusOrder(s: StatusLabel): number {
  switch (s) {
    case 'imminent':
      return 0
    case 'available':
      return 1
    case 'preparing':
      return 2
  }
}

function statusColors(s: StatusLabel): { bg: string; fg: string; label: string } {
  switch (s) {
    case 'imminent':
      return { bg: COLOR_IMMINENT_BG, fg: COLOR_IMMINENT_FG, label: '마감 임박' }
    case 'available':
      return {
        bg: COLOR_AVAILABLE_BG,
        fg: COLOR_AVAILABLE_FG,
        label: '수령 가능',
      }
    case 'preparing':
      return {
        bg: COLOR_PREPARING_BG,
        fg: COLOR_PREPARING_FG,
        label: '상품 준비',
      }
  }
}

// =====================================================
// SVG 렌더
// =====================================================

function renderTableSvg(
  rows: Array<{ p: ProductRow; status: StatusLabel }>,
  today: string,
  rangeDays: number,
): string {
  const totalHeight = HEADER_HEIGHT + rows.length * ROW_HEIGHT + FOOTER_HEIGHT
  const days = nextNDays(today, rangeDays)

  // 컬럼 폭: 상품명 280 / pill 100 / 5-7일 그리드 / 마감일 80
  const gridStartX = 280 + 100
  const gridEndX = TABLE_WIDTH - 80
  const dayColWidth = (gridEndX - gridStartX) / rangeDays

  const header = renderHeader(days, gridStartX, dayColWidth)
  const rowsSvg = rows
    .map((r, idx) => renderRow(r, idx, days, gridStartX, dayColWidth))
    .join('\n')
  const footer = renderFooter(totalHeight - FOOTER_HEIGHT)

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${TABLE_WIDTH}" height="${totalHeight}">
  <rect width="100%" height="100%" fill="${COLOR_BG}"/>
  ${header}
  ${rowsSvg}
  ${footer}
</svg>`
}

function renderHeader(
  days: string[],
  gridStartX: number,
  dayColWidth: number,
): string {
  const dayLabels = days
    .map((d, i) => {
      const cx = gridStartX + dayColWidth * (i + 0.5)
      const [mm, dd, wk] = splitDayLabel(d)
      return `<text x="${cx}" y="34" font-family="${FONT_FAMILY}" font-size="13" font-weight="600" fill="${COLOR_TEXT}" text-anchor="middle">${mm}.${dd}</text>
<text x="${cx}" y="52" font-family="${FONT_FAMILY}" font-size="11" fill="${COLOR_MUTED}" text-anchor="middle">(${wk})</text>`
    })
    .join('\n')

  return `<rect x="0" y="0" width="${TABLE_WIDTH}" height="${HEADER_HEIGHT}" fill="${COLOR_HEADER_BG}"/>
<text x="20" y="48" font-family="${FONT_FAMILY}" font-size="18" font-weight="700" fill="${COLOR_TEXT}">📅 수령일 비교</text>
${dayLabels}
<text x="${TABLE_WIDTH - 40}" y="48" font-family="${FONT_FAMILY}" font-size="12" fill="${COLOR_MUTED}" text-anchor="middle">마감일</text>`
}

function renderRow(
  r: { p: ProductRow; status: StatusLabel },
  index: number,
  days: string[],
  gridStartX: number,
  dayColWidth: number,
): string {
  const y = HEADER_HEIGHT + index * ROW_HEIGHT
  const cy = y + ROW_HEIGHT / 2
  const { bg, fg, label } = statusColors(r.status)
  const name = r.p.name.length > 22 ? r.p.name.slice(0, 22) + '…' : r.p.name

  // pill: x=290 y=cy-12 w=84 h=24 radius 12
  const pillX = 290
  const pillW = 84
  const pillH = 24
  const pillY = cy - pillH / 2

  // 막대: pickup_date ~ pickup_deadline (오늘 + rangeDays 범위 안)
  const bar = renderBar(r, days, gridStartX, dayColWidth, cy, fg)

  // 분리선 (마지막 row 제외)
  const divider = `<line x1="0" y1="${y + ROW_HEIGHT}" x2="${TABLE_WIDTH}" y2="${y + ROW_HEIGHT}" stroke="#E5E7EB" stroke-width="1"/>`

  const deadlineLabel = formatShortKoreanDate(r.p.pickup_deadline)

  return `<g>
<text x="20" y="${cy + 5}" font-family="${FONT_FAMILY}" font-size="14" font-weight="500" fill="${COLOR_TEXT}">${escapeXml(name)}</text>
<rect x="${pillX}" y="${pillY}" width="${pillW}" height="${pillH}" rx="12" fill="${bg}"/>
<text x="${pillX + pillW / 2}" y="${cy + 4}" font-family="${FONT_FAMILY}" font-size="11" font-weight="600" fill="${fg}" text-anchor="middle">${escapeXml(label)}</text>
${bar}
<text x="${TABLE_WIDTH - 40}" y="${cy + 5}" font-family="${FONT_FAMILY}" font-size="12" fill="${COLOR_TEXT}" text-anchor="middle">${escapeXml(deadlineLabel)}</text>
${divider}
</g>`
}

function renderBar(
  r: { p: ProductRow; status: StatusLabel },
  days: string[],
  gridStartX: number,
  dayColWidth: number,
  cy: number,
  fg: string,
): string {
  // 막대 시작/끝 인덱스 — pickup_date / pickup_deadline 중 days 범위 안.
  const startIdx = days.findIndex((d) => d >= r.p.pickup_date)
  const endIdx = lastIndexWhere(days, (d) => d <= r.p.pickup_deadline)
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    // 범위 밖 — 색 점만
    const cx = gridStartX + dayColWidth * 0.5
    return `<circle cx="${cx}" cy="${cy}" r="4" fill="${fg}" opacity="0.4"/>`
  }
  const x = gridStartX + dayColWidth * startIdx + 6
  const w = dayColWidth * (endIdx - startIdx + 1) - 12
  const h = 14
  const by = cy - h / 2
  return `<rect x="${x}" y="${by}" width="${Math.max(w, 6)}" height="${h}" rx="7" fill="${fg}" opacity="0.85"/>`
}

function renderFooter(footerY: number): string {
  return `<rect x="0" y="${footerY}" width="${TABLE_WIDTH}" height="${FOOTER_HEIGHT}" fill="${COLOR_HEADER_BG}"/>
<text x="20" y="${footerY + 26}" font-family="${FONT_FAMILY}" font-size="11" fill="${COLOR_MUTED}">🔴 마감 임박 · 🟢 수령 가능 · ⚪ 상품 준비</text>`
}

function lastIndexWhere<T>(arr: T[], pred: (v: T) => boolean): number {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (pred(arr[i])) return i
  }
  return -1
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

// =====================================================
// 날짜 helpers (KST)
// =====================================================

const WEEKDAYS_KO = ['일', '월', '화', '수', '목', '금', '토']

function todayKstYmd(): string {
  const now = new Date()
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, '0')}-${String(kst.getUTCDate()).padStart(2, '0')}`
}

/** "YYYY-MM-DD" 형식 비교 — 두 날짜 사이 일수 (b - a). */
function daysBetween(a: string, b: string): number {
  const da = new Date(`${a}T00:00:00Z`).getTime()
  const db = new Date(`${b}T00:00:00Z`).getTime()
  return Math.round((db - da) / (24 * 60 * 60 * 1000))
}

function nextNDays(startYmd: string, n: number): string[] {
  const out: string[] = []
  const start = new Date(`${startYmd}T00:00:00Z`)
  for (let i = 0; i < n; i++) {
    const d = new Date(start.getTime() + i * 24 * 60 * 60 * 1000)
    out.push(
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`,
    )
  }
  return out
}

/** "YYYY-MM-DD" → ["MM", "DD", "요일"]. SVG 헤더용. */
function splitDayLabel(ymd: string): [string, string, string] {
  const d = new Date(`${ymd}T00:00:00Z`)
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  const wk = WEEKDAYS_KO[d.getUTCDay()]
  return [mm, dd, wk]
}

function formatShortKoreanDate(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00Z`)
  return `${String(d.getUTCMonth() + 1).padStart(2, '0')}.${String(d.getUTCDate()).padStart(2, '0')}`
}
