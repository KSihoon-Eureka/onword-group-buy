/**
 * Tool: notify_wholesaler
 * 
 * 도매업자에게 주문 내역을 자동 이메일 전송.
 * 
 * 트랙: Track I (Day 2 Agent 3)
 * 의존: get_orders, products, Resend API
 * 
 * 구현 절차:
 *   1. get_orders로 주문 집계 (cancelled 제외)
 *   2. products에서 상품 정보 가져옴
 *   3. 이메일 본문 생성:
 *      - 상품명, 총 수량, 입고 희망일
 *      - 매장 정보 (받는 곳)
 *      - 주문 내역 표 (선택: 상세 수량별)
 *   4. Resend로 발송
 *   5. 성공 시 products.flow_stage = 'warehouse_notified' 업데이트
 *   6. generated_assets에 type='wholesale_email' 저장 (재발송용)
 * 
 * Won't (이번 스프린트):
 *   - SMS 발송 (Resend는 이메일만)
 *   - 도매업자별 다른 템플릿
 *   - 첨부파일
 */

import { Resend } from 'resend'
import { createServiceClient } from '@onword/db'
import { getOrders } from './get-orders'
import type {
  NotifyWholesalerInput,
  NotifyWholesalerOutput,
} from '@onword/types'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function notifyWholesaler(
  input: NotifyWholesalerInput & { _traceId?: string }
): Promise<NotifyWholesalerOutput> {
  const { productId, method = 'email', _traceId } = input
  
  if (method !== 'email') {
    throw new Error(`Method '${method}' not implemented in this sprint`)
  }
  
  const supabase = createServiceClient()
  
  // 1. 주문 집계
  const { orders, totalQuantity } = await getOrders({ productId })
  
  if (totalQuantity === 0) {
    return { sent: false, recipientCount: 0 }
  }
  
  // 2. 상품 정보
  const { data: product, error } = await supabase
    .from('products')
    .select('*')
    .eq('id', productId)
    .single()
  
  if (error || !product) {
    throw new Error(`Product not found: ${productId}`)
  }
  
  // 3. 이메일 본문 생성
  // TODO: HTML/텍스트 템플릿 분리, 가독성 개선
  const subject = `[발주 요청] ${product.name} × ${totalQuantity}개`
  const body = `
안녕하세요.

${process.env.STORE_NAME ?? '매장'}에서 다음 상품에 대한 공동구매가 마감되어 발주 요청드립니다.

상품명: ${product.name}
총 수량: ${totalQuantity}개
주문 건수: ${orders.length}건
입고 희망일: ${product.pickup_date}

감사합니다.
${process.env.STORE_NAME ?? '매장'} 드림
  `.trim()
  
  // 4. Resend 발송
  const recipient = process.env.WHOLESALE_DEFAULT_RECIPIENT
  const fromAddress = process.env.WHOLESALE_FROM_EMAIL ?? 'noreply@onword.kr'
  
  if (!recipient) {
    throw new Error('WHOLESALE_DEFAULT_RECIPIENT env not set')
  }
  
  const { data: sent, error: sendError } = await resend.emails.send({
    from: fromAddress,
    to: recipient,
    subject,
    text: body,
  })
  
  if (sendError) {
    throw new Error(`Resend failed: ${sendError.message}`)
  }
  
  // 5. flow_stage 업데이트
  await supabase
    .from('products')
    .update({ flow_stage: 'warehouse_notified' })
    .eq('id', productId)
  
  // 6. generated_assets에 기록 (재발송용)
  await supabase
    .from('generated_assets')
    .insert({
      product_id: productId,
      trace_step_id: _traceId ?? null,
      type: 'wholesale_email',
      content: `Subject: ${subject}\n\n${body}`,
      metadata: { 
        recipient, 
        emailId: sent?.id,
        totalQuantity,
        orderCount: orders.length,
      },
    })
  
  return {
    sent: true,
    recipientCount: 1,
    emailId: sent?.id,
  }
}
