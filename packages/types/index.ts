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
  | 'stock_confirmed'        // Step 7 완료 (재고/누락 검수)
  | 'warehouse_notified'     // Step 8 완료 (도매업자 통지)
  | 'arrived'                // 입고 완료
  | 'pickup_ready'           // Step 9 완료 (수령 안내)
  | 'completed'              // 모든 주문 픽업 완료

export type ProductStatus = 'active' | 'closed' | 'cancelled'

export type OrderStatus =
  | 'pending'                // 주문 들어옴
  | 'confirmed'              // 주문 확인됨
  | 'picked_up'              // 픽업 완료
  | 'cancelled'              // 취소
  | 'no_show'                // 수령 마감일 경과

export type TraceStatus = 'running' | 'completed' | 'failed' | 'cancelled'

export type StepStatus = 'pending' | 'running' | 'done' | 'error'

export type AssetType =
  | 'announcement'           // 카카오 공고 텍스트
  | 'poster'                 // 포스터 이미지
  | 'pickup_table'           // 수령일 비교 테이블 이미지
  | 'price_compare'          // 네이버 가격비교 (JSON + 이미지)
  | 'wholesale_email'        // 도매업자 이메일

export type ToolName =
  | 'generate_announcement'
  | 'crawl_naver_price'
  | 'compose_poster'
  | 'generate_pickup_table'
  | 'get_orders'
  | 'notify_wholesaler'

export type ActionName =
  | 'start_campaign'         // Step 2-4 자동 실행
  | 'close_orders'           // Step 6-7 자동 실행
  | 'notify_warehouse'       // Step 8 자동 실행
  | 'announce_pickup'        // Step 9 자동 실행

export type AnnouncementStage = 1 | 2 | 3
// 1 = 모집 시작
// 2 = 마감 임박 (Should)
// 3 = 수령 안내

// ==========================
// 엔티티
// ==========================

export interface Product {
  id: string
  
  name: string
  description: string | null
  category: string | null
  
  price: number              // 원 단위 정수
  comparePrice: number | null
  
  stockQuantity: number
  orderedQuantity: number
  
  expiryDate: string | null  // ISO date "YYYY-MM-DD"
  orderDeadline: string      // ISO datetime
  pickupDate: string         // ISO date
  pickupDeadline: string     // ISO date
  
  flowStage: FlowStage
  status: ProductStatus
  
  urgencyBanner: string | null
  sourceImageUrls: string[]
  
  createdAt: string
  updatedAt: string
}

export interface Order {
  id: string
  productId: string
  
  customerName: string
  customerPhone: string | null
  
  quantity: number
  totalPrice: number
  
  status: OrderStatus
  
  anomalyDetected: boolean
  anomalyReason: string | null
  notes: string | null
  
  pickedUpAt: string | null
  createdAt: string
}

export interface AgentTrace {
  id: string
  productId: string | null
  
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
  productId: string | null
  traceStepId: string | null
  
  type: AssetType
  stage: string | null
  
  content: string | null     // 텍스트 자산
  assetUrl: string | null    // 이미지/파일 URL
  metadata: Record<string, unknown> | null
  
  copiedAt: string | null
  usedAt: string | null
  
  createdAt: string
}

// ==========================
// API 입출력 타입
// ==========================

export interface CreateProductInput {
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
}

export interface CreateOrderInput {
  productId: string
  customerName: string
  customerPhone?: string
  quantity: number
}

export interface RunAgentActionInput {
  productId: string
  action: ActionName
}

export interface RunAgentActionResponse {
  traceId: string
  status: TraceStatus
}

// ==========================
// Agent Tool I/O 타입
// ==========================

export interface GenerateAnnouncementInput {
  productId: string
  stage: AnnouncementStage
}

export interface GenerateAnnouncementOutput {
  content: string
  assetId: string
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
  imageUrl: string  // 스크린샷
  assetId: string
}

export interface ComposePosterInput {
  productId: string
  baseImageUrl: string       // 기존 상품 이미지 (Supabase Storage URL)
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
  productId: string
  includeAnomalies?: boolean
}

export interface GetOrdersOutput {
  orders: Order[]
  totalQuantity: number
  anomalies: Order[]
}

export interface NotifyWholesalerInput {
  productId: string
  method?: 'email' | 'sms'
}

export interface NotifyWholesalerOutput {
  sent: boolean
  recipientCount: number
  emailId?: string
}

export interface GeneratePickupTableInput {
  /** 진행 중인 상품 목록. 비우면 자동 조회. */
  productIds?: string[]
}

export interface GeneratePickupTableOutput {
  imageUrl: string
  assetId: string
}
