/**
 * Tool: notify_wholesaler  (PRD §10.8 / PLAN.md D.10)
 *
 * 도매업자에게 주문 집계 이메일 발송 (Resend API).
 *
 * PRD 참조:
 *   - §7.10  Step 8 — recipient 우선순위 + flow_stage='warehouse_notified'
 *   - §10.8  Input/Output 시그니처 — NotifyWholesalerInput/Output
 *   - §6.2.6 PIPA — customer_phone / customer_name 절대 본문 포함 X
 *   - §6.4 / §4.11  phone_access_log action='export' INSERT
 *   - §4.2  stores.wholesale_email / wholesale_from_email
 *   - §16   RESEND_API_KEY / WHOLESALE_DEFAULT_RECIPIENT
 *
 * Recipient 우선순위:
 *   1. recipientOverride (비어있지 않은 문자열)
 *   2. stores.wholesale_email
 *   3. WHOLESALE_DEFAULT_RECIPIENT (env)
 *   세 단계 모두 없으면 throw "도매 이메일 미설정".
 *
 * From 주소:
 *   stores.wholesale_from_email (default 'noreply@onword.kr' — 스키마 default)
 *
 * 본문 정책 (PIPA — strict):
 *   - 포함: 매장명, 상품명, 총 수량, 주문 건수, 입고 희망일(pickup_date)
 *   - 미포함: customer_name, customer_phone (마스킹된 것 포함), 개별 주문 row
 *   - 도매업자 입장 = "총 N개 발주" 만 알면 됨
 *
 * 부수효과:
 *   - phone_access_log(action='export', reason='wholesale_email') 1건 INSERT
 *     주의: order_id=null (bulk export). 주문 0건이면 INSERT 안 함.
 *   - products.flow_stage = 'warehouse_notified'
 *   - generated_assets(type='wholesale_email') 1건 INSERT
 *
 * 실제 외부 발송 0:
 *   - 테스트는 Resend SDK 를 vi.mock 으로 가로채 외부 API 호출 0.
 *   - 운영 시점에는 RESEND_API_KEY 가 live 키로 주입되어야 동작.
 *
 * 의존: get-orders (집계 + phone 마스킹 + view 로그), Resend SDK
 */

import { Resend } from 'resend'
import { createServiceClient } from '@onword/db'
import { getOrders } from './get-orders'
import type {
  NotifyWholesalerInput,
  NotifyWholesalerOutput,
} from '@onword/types'

// =====================================================
// 공개 export
// =====================================================

export async function notifyWholesaler(
  input: NotifyWholesalerInput & { _traceStepId?: string; _userId?: string },
): Promise<NotifyWholesalerOutput> {
  // ---- 1. 입력 검증 ----
  if (!input || typeof input.productId !== 'string' || input.productId.trim() === '') {
    throw new Error('notify_wholesaler: productId is required')
  }

  const { productId, recipientOverride, _traceStepId, _userId } = input

  const supabase = createServiceClient() as any

  // ---- 2. 상품 정보 + store 정보 ----
  const { data: product, error: productError } = await supabase
    .from('products')
    .select('id, store_id, name, pickup_date, flow_stage')
    .eq('id', productId)
    .single()

  if (productError || !product) {
    throw new Error(`상품을 찾을 수 없습니다 (Product not found): ${productId}`)
  }

  const storeId: string = product.store_id

  const { data: store, error: storeError } = await supabase
    .from('stores')
    .select('id, name, wholesale_email, wholesale_from_email')
    .eq('id', storeId)
    .single()

  if (storeError || !store) {
    throw new Error(`매장 정보를 찾을 수 없습니다 (store not found): ${storeId}`)
  }

  // ---- 3. recipient 결정 ----
  const recipient = resolveRecipient({
    override: recipientOverride,
    storeWholesaleEmail: store.wholesale_email ?? null,
    envDefault: process.env.WHOLESALE_DEFAULT_RECIPIENT ?? null,
  })

  if (!recipient) {
    throw new Error(
      '도매 이메일 미설정 (stores.wholesale_email / WHOLESALE_DEFAULT_RECIPIENT 둘 다 없음)',
    )
  }

  const fromAddress: string =
    (typeof store.wholesale_from_email === 'string' && store.wholesale_from_email) ||
    'noreply@onword.kr'

  // ---- 4. 주문 집계 ----
  // get_orders 는 자체적으로 phone 마스킹 + view 로그 처리.
  // 여기서는 *집계 수치만* 사용 — orders 배열 자체는 본문에 절대 직렬화 X.
  const { totalQuantity, orders } = await getOrders({ storeId, productId })

  const orderCount = orders.length

  if (totalQuantity === 0 || orderCount === 0) {
    // 발송할 게 없음. 부수효과 (flow_stage / phone_access_log / asset) 모두 skip.
    return { sent: false, recipientCount: 0 }
  }

  // ---- 5. 본문 생성 (PIPA strict — orders 배열 절대 직렬화 X) ----
  const email = buildWholesaleEmail({
    storeName: String(store.name ?? '매장'),
    productName: String(product.name ?? ''),
    totalQuantity,
    orderCount,
    pickupDate: String(product.pickup_date ?? ''),
  })

  // ---- 6. Resend 발송 ----
  const resend = new Resend(process.env.RESEND_API_KEY)

  const { data: sent, error: sendError } = await resend.emails.send({
    from: fromAddress,
    to: recipient,
    subject: email.subject,
    text: email.text,
  })

  if (sendError) {
    throw new Error(`이메일 전송 실패: ${sendError.message ?? 'unknown'}`)
  }

  const emailId: string | undefined = sent?.id ?? undefined

  // ---- 7. flow_stage 업데이트 ----
  await supabase
    .from('products')
    .update({ flow_stage: 'warehouse_notified', updated_at: new Date().toISOString() })
    .eq('id', productId)

  // ---- 8. generated_assets 기록 (재발송용) ----
  await supabase.from('generated_assets').insert({
    store_id: storeId,
    product_id: productId,
    trace_step_id: _traceStepId ?? null,
    type: 'wholesale_email',
    content: `Subject: ${email.subject}\n\n${email.text}`,
    metadata: {
      recipient,
      emailId: emailId ?? null,
      totalQuantity,
      orderCount,
    },
  })

  // ---- 9. PIPA — phone_access_log action='export' ----
  //   - phone 노출은 본문에 안 했지만, 집계(get_orders)가 phone 컬럼을 읽고
  //     도매업자에게 *집계 결과를 외부 전송* 했으므로 'export' 1건 기록.
  //   - order_id=null: bulk export.
  await supabase.from('phone_access_log').insert({
    store_id: storeId,
    user_id: _userId ?? null,
    order_id: null,
    action: 'export',
    reason: 'wholesale_email',
  })

  return {
    sent: true,
    recipientCount: 1,
    emailId,
  }
}

// =====================================================
// 내부 헬퍼
// =====================================================

interface ResolveRecipientArgs {
  override?: string
  storeWholesaleEmail: string | null
  envDefault: string | null
}

/**
 * Recipient 우선순위: override (truthy) > stores.wholesale_email > env.
 * 빈 문자열 override 는 무시.
 */
function resolveRecipient(args: ResolveRecipientArgs): string | null {
  const override = args.override?.trim()
  if (override) return override
  if (args.storeWholesaleEmail && args.storeWholesaleEmail.trim() !== '') {
    return args.storeWholesaleEmail.trim()
  }
  if (args.envDefault && args.envDefault.trim() !== '') {
    return args.envDefault.trim()
  }
  return null
}

interface BuildEmailArgs {
  storeName: string
  productName: string
  totalQuantity: number
  orderCount: number
  pickupDate: string
}

interface BuiltEmail {
  subject: string
  text: string
}

/**
 * PIPA strict — customer_name / customer_phone 절대 포함 X.
 * 입력 인자에 phone/name 받지 않음 = 컴파일 타임 차단.
 */
function buildWholesaleEmail(args: BuildEmailArgs): BuiltEmail {
  const subject = `[발주 요청] ${args.productName} × ${args.totalQuantity}개`

  const text = [
    `안녕하세요, ${args.storeName} 입니다.`,
    '',
    `아래 상품의 공동구매가 마감되어 발주 요청드립니다.`,
    '',
    `- 상품명: ${args.productName}`,
    `- 총 수량: ${args.totalQuantity}개`,
    `- 주문 건수: ${args.orderCount}건`,
    `- 입고 희망일: ${args.pickupDate}`,
    '',
    `감사합니다.`,
    `${args.storeName} 드림`,
  ].join('\n')

  return { subject, text }
}
