/**
 * Tool: get_orders
 * 
 * 특정 상품의 주문 내역 조회. 누락/이상 검수 옵션.
 * 
 * 트랙: Track F (Day 1 Agent 6)
 * 의존: orders 테이블, products 테이블
 * 
 * 가장 단순한 tool. 다른 tool들이 이걸 호출함 (notify_wholesaler 등).
 * 
 * 구현 절차:
 *   1. productId로 orders 조회 (status != 'cancelled')
 *   2. includeAnomalies=true이면 anomaly_detected=true 별도 집계
 *   3. 총 수량 합산
 *   4. 결과 반환
 * 
 * Anomaly 검수 규칙 (확장 여지):
 *   - quantity가 product.stock_quantity보다 큼
 *   - customer_phone이 비어있음 또는 형식 불일치
 *   - 같은 customer_phone이 N번 이상 (자기복제 의심)
 *   - 주문 시각이 마감일 이후 (DB 트리거 또는 cron으로 anomaly_detected=true 표시)
 */

import { createServiceClient } from '@onword/db'
import type {
  GetOrdersInput,
  GetOrdersOutput,
  Order,
} from '@onword/types'

export async function getOrders(
  input: GetOrdersInput & { _traceId?: string }
): Promise<GetOrdersOutput> {
  const { productId, includeAnomalies = false } = input
  const supabase = createServiceClient()
  
  // 1. 주문 조회
  const { data: rows, error } = await supabase
    .from('orders')
    .select('*')
    .eq('product_id', productId)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: true })
  
  if (error) {
    throw new Error(`Failed to fetch orders: ${error.message}`)
  }
  
  // 2. Row → Order 타입 매핑
  const orders: Order[] = (rows ?? []).map(toCamelCase)
  
  // 3. 총 수량 합산
  const totalQuantity = orders.reduce((sum, o) => sum + o.quantity, 0)
  
  // 4. Anomalies 분리
  const anomalies = includeAnomalies
    ? orders.filter(o => o.anomalyDetected)
    : []
  
  return {
    orders,
    totalQuantity,
    anomalies,
  }
}

function toCamelCase(row: any): Order {
  return {
    id: row.id,
    productId: row.product_id,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    quantity: row.quantity,
    totalPrice: row.total_price,
    status: row.status,
    anomalyDetected: row.anomaly_detected,
    anomalyReason: row.anomaly_reason,
    notes: row.notes,
    pickedUpAt: row.picked_up_at,
    createdAt: row.created_at,
  }
}
