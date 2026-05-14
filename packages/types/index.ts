// packages/types/index.ts
// 모든 앱과 패키지가 import하는 공통 타입
// AI_DOCS/data-model.md와 1:1 대응

// ==========================
// 도메인 상수
// ==========================

export type FlowStage =
  | 'product_registered'    // Step 1 완료
  | 'announcement_1'         // Step 2 완료
  | 'order_open'             // Step 3-5 진행 중
  | 'order_closed'           // 주문 마감
  | 'stock_confirmed'        // Step 7 완료
  | 'warehouse_notified'     // Step 8 완료
  | 'arrived'                // 입고 완료
  | 'pickup_ready'           // Step 9 완료
  | 'completed'              // 모든 픽업 완료

export type ProductStatus = 'active' | 'closed' | 'cancelled'

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'picked_up'
  | 'cancelled'
  | 'no_show'                // Step 10 cron으로 자동 마킹

export type TraceStatus = 'running' | 'completed' | 'failed' | 'cancelled'

export type StepStatus = 'pending' | 'running' | 'done' | 'error'

export type AssetType =
  | 'announcement_stage1'
  | 'announcement_stage2'    // NEW: 마감 임박
  | 'announcement_stage3'
  | 'price_emphasis_text'    // NEW: 가격 강조 짧은 카톡
  | 'price_compare_image'    // 네이버 스크린샷
  | 'price_compare_data'     // 네이버 가격 JSON
  | 'product_image'          // NEW: multi-image crawl 결과
  | 'poster'
  | 'pickup_table_image'
  | 'pickup_table_text'      // NEW: 동반 카톡 텍스트
  | 'wholesale_email'

export type ToolName =
  | 'generate_announcement'
  | 'generate_price_emphasis_text'  // NEW
  | 'crawl_naver_images'             // NEW (분리됨)
  | 'crawl_naver_price'
  | 'compose_poster'
  | 'generate_pickup_table'
  | 'get_orders'
  | 'notify_wholesaler'

export type ActionName =
  | 'start_campaign'         // Step 2-4
  | 'close_orders'           // Step 6-7
  | 'notify_warehouse'       // Step 8
  | 'announce_pickup'        // Step 9
  | 'urgent_alert'           // NEW: Step 6b (마감 임박)
  | 'free_text'              // NEW: ChatView 자유 텍스트 메시지 — Claude dynamic tool_use loop (Phase D에서 활성)

export type AnnouncementStage = 1 | 2 | 3

export type StoreMemberRole = 'owner' | 'staff'

export type AuditAction =
  | 'create'
  | 'update'
  | 'archive'
  | 'restore'
  | 'flow_stage_change'
  | 'asset_supersede'
  | 'auto_no_show'

export type AuditEntityType = 'product' | 'order' | 'asset' | 'flow' | 'store'

export type PhoneAccessAction = 'view' | 'edit' | 'export' | 'delete'

export type ImageType = 'product' | 'detail' | 'lifestyle'

// ==========================
// Auth / Multi-tenant 엔티티
// ==========================

export interface Store {
  id: string

  name: string
  brandName: string | null
  shortName: string | null

  leadingEmoji: string                // default '🎁'
  primaryColor: string                // hex
  accentColor: string                 // hex

  wholesaleEmail: string | null
  wholesaleFromEmail: string

  ownerId: string                     // auth.users.id

  createdAt: string
  updatedAt: string
}

export interface StoreMember {
  storeId: string
  userId: string
  role: StoreMemberRole
  joinedAt: string
}

/** Supabase Auth user (관리됨; 우리가 직접 insert 안 함) */
export interface AuthUser {
  id: string
  email: string
  createdAt: string
}

// ==========================
// 도메인 엔티티
// ==========================

export interface Product {
  id: string
  storeId: string                     // NEW

  name: string
  description: string | null
  category: string | null

  price: number
  comparePrice: number | null

  stockQuantity: number
  orderedQuantity: number

  expiryDate: string | null
  orderDeadline: string
  pickupDate: string
  pickupDeadline: string

  sourceImageUrls: string[]
  primaryImageUrl: string | null      // NEW

  flowStage: FlowStage
  status: ProductStatus

  urgencyBanner: string | null
  archivedAt: string | null           // NEW

  createdAt: string
  updatedAt: string
}

export interface Order {
  id: string
  storeId: string                     // NEW
  productId: string

  customerName: string
  customerPhone: string | null        // 끝 4자리만 (length = 4) — PIPA
  phoneConsentAt: string              // NEW: 동의 시각

  quantity: number
  totalPrice: number

  status: OrderStatus

  anomalyDetected: boolean
  anomalyReason: string | null
  notes: string | null

  pickedUpAt: string | null
  createdAt: string
  updatedAt: string
}

export interface AgentTrace {
  id: string
  storeId: string                     // NEW
  productId: string | null
  userId: string | null               // NEW

  action: ActionName
  status: TraceStatus

  summary: string | null
  errorMessage: string | null

  startedAt: string
  completedAt: string | null
}

export interface TraceStep {
  id: string
  traceId: string
  stepOrder: number

  toolName: ToolName
  status: StepStatus

  input: Record<string, unknown> | null
  output: Record<string, unknown> | null

  summary: string | null

  startedAt: string
  completedAt: string | null
  durationMs: number | null
}

export interface GeneratedAsset {
  id: string
  storeId: string                     // NEW
  productId: string | null
  traceStepId: string | null

  type: AssetType
  stage: string | null

  content: string | null
  assetUrl: string | null
  metadata: Record<string, unknown> | null

  copiedAt: string | null
  usedAt: string | null

  supersededAt: string | null         // NEW (X10)
  supersededBy: string | null         // NEW

  createdAt: string
}

export interface SavedFlow {
  id: string
  storeId: string
  userId: string

  name: string
  prompt: string
  icon: string | null
  displayOrder: number

  runCount: number
  lastRunAt: string | null

  createdAt: string
  updatedAt: string
}

export interface AuditLogEntry {
  id: string
  storeId: string
  userId: string | null               // null = system

  entityType: AuditEntityType
  entityId: string

  action: AuditAction
  changes: Record<string, unknown> | null

  createdAt: string
}

export interface PhoneAccessLogEntry {
  id: string
  storeId: string
  userId: string | null               // null = system
  orderId: string | null

  action: PhoneAccessAction
  reason: string | null

  ipAddress: string | null
  userAgent: string | null

  createdAt: string
}

// ==========================
// API 입출력 타입
// ==========================

export interface CreateProductInput {
  storeId: string
  name: string
  description?: string
  category?: string
  price: number
  comparePrice?: number
  stockQuantity: number
  expiryDate?: string
  orderDeadline: string
  pickupDate: string
  pickupDeadline: string
  urgencyBanner?: string
  sourceImageUrls?: string[]
  primaryImageUrl?: string
}

export interface CreateOrderInput {
  productId: string
  customerName: string
  customerPhone: string               // 끝 4자리
  phoneConsent: true                  // 명시 동의 필수 (PIPA)
  quantity: number
}

export interface RunAgentActionInput {
  storeId: string
  productId?: string
  action: ActionName
  productIds?: string[]               // urgent_alert 다중 상품용
}

export interface RunAgentActionResponse {
  traceId: string
  status: TraceStatus
}

// ==========================
// Agent Tool I/O
// ==========================

export interface GenerateAnnouncementInput {
  productId?: string                  // stage 1/2 단일
  productIds?: string[]                // stage 2 다중
  storeId: string                     // stage 3 (오늘 픽업 가능)
  stage: AnnouncementStage
}

export interface GenerateAnnouncementOutput {
  content: string
  assetId: string
}

export interface GeneratePriceEmphasisTextInput {
  productId: string
  priceCompareAssetId: string         // crawl_naver_price 결과
}

export interface GeneratePriceEmphasisTextOutput {
  content: string                     // 100자 이내
  assetId: string
}

export interface CrawlNaverImagesInput {
  productId: string
  productName: string
  maxImages?: number                   // default 6
}

export interface CrawlNaverImagesOutput {
  images: Array<{
    url: string                       // Supabase Storage URL
    sourceUrl: string                 // 네이버 원본
    width: number
    height: number
    type: ImageType
  }>
  productPageUrl: string | null
  assetIds: string[]
}

export interface CrawlNaverPriceInput {
  productName: string
}

export interface CrawlNaverPriceOutput {
  data: {
    title: string | null
    lowestPrice: string | null
    modelName: string | null
    sellers: Array<{ name: string; price: string }>
  }
  imageUrl: string                    // 스크린샷
  assetIds: {
    dataId: string                    // price_compare_data
    imageId: string                   // price_compare_image
  }
}

export interface ComposePosterInput {
  productId: string
  baseImageUrl?: string               // 미지정 시 products.primary_image_url
  textOverlay?: {
    category?: string
    spec?: string
  }
}

export interface ComposePosterOutput {
  posterUrl: string
  assetId: string
}

export interface GetOrdersInput {
  storeId: string
  productId?: string
  includeAnomalies?: boolean
}

export interface GetOrdersOutput {
  orders: Order[]
  totalQuantity: number
  anomalies: Order[]
}

export interface NotifyWholesalerInput {
  productId: string
  recipientOverride?: string          // 상품별 다른 도매업자
}

export interface NotifyWholesalerOutput {
  sent: boolean
  recipientCount: number
  emailId?: string
  /** customer_phone 절대 제외 — PIPA. 이 응답에도 phone 없음 */
}

export interface GeneratePickupTableInput {
  storeId: string
  rangeDays?: number                  // default 5
  productIds?: string[]               // 미지정 시 자동 조회
}

export interface GeneratePickupTableOutput {
  imageUrl: string
  textAssetId: string                 // 동반 카톡 텍스트 asset id
  imageAssetId: string
  productCount: number
}

// ==========================
// Agent Streaming
// ==========================

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string | Array<{
    type: 'text' | 'tool_use' | 'tool_result'
    text?: string
    name?: string
    input?: Record<string, unknown>
    tool_use_id?: string
    content?: string
  }>
  timestamp: string
  latencyMs?: number
  hasAssetGenerated?: boolean
  generatedAssetIds?: string[]
}

export interface AgentStep {
  id: string
  type: 'text' | 'tool'

  content?: string

  toolName?: ToolName
  toolArgs?: Record<string, unknown>
  result?: {
    success: boolean
    message?: string
    data?: unknown
  }

  status: StepStatus
  latencyMs?: number
}

export interface StreamUpdate {
  history: ChatMessage[]
  steps: AgentStep[]
  isDone: boolean
  currentText: string
  traceId: string
}

// ==========================
// 메뉴 / 네비
// ==========================

export type DashboardTab =
  | 'chat'
  | 'campaigns'
  | 'orders'
  | 'assets'
  | 'new'
  | 'notifications'                   // NEW
  | 'audit'                           // NEW (옵션)

export const DASHBOARD_TABS: Array<{
  id: DashboardTab
  label: string
  icon: string
  mobileVisible: boolean
}> = [
  { id: 'chat',          label: 'AI 비서',     icon: 'Bot',      mobileVisible: true  },
  { id: 'campaigns',     label: '공구 현황',   icon: 'Activity', mobileVisible: true  },
  { id: 'orders',        label: '주문 관리',   icon: 'Database', mobileVisible: true  },
  { id: 'assets',        label: '자산',        icon: 'FileText', mobileVisible: false },
  { id: 'new',           label: '상품 등록',   icon: 'Plus',     mobileVisible: true  },
  { id: 'notifications', label: '알림',        icon: 'Bell',     mobileVisible: false },
]
