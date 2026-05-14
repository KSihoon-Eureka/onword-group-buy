/**
 * POST /api/products — 상품 등록 (PRD §15.1, PLAN.md C.1).
 *
 * 인증 흐름:
 *  1. resolveActiveStore() — 세션 + 멤버십 검증
 *  2. body 검증 (validateCreateProduct)
 *  3. user-session supabase 클라이언트로 insert — RLS가 cross-store 자동 차단
 *
 * 응답:
 *  - 200 { id }
 *  - 400 { error } — 입력 오류
 *  - 401 { error } — 미인증
 *  - 403 { error } — store_id 외 store 접근 / 매장 미선택
 *  - 500 { error } — DB 실패
 */

import { NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase/server'
import { resolveActiveStore } from '@/lib/auth/active-store'
import { validateCreateProduct } from '@/lib/validation/product'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const active = await resolveActiveStore()
  if (active.type === 'unauthenticated') {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }
  if (active.type === 'no_active_store' || active.type === 'not_member') {
    return NextResponse.json(
      { error: '매장을 먼저 선택해주세요.' },
      { status: 403 },
    )
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json(
      { error: '요청 본문이 JSON 형식이 아닙니다.' },
      { status: 400 },
    )
  }

  if (typeof payload !== 'object' || payload === null) {
    return NextResponse.json(
      { error: '요청 본문이 비어있습니다.' },
      { status: 400 },
    )
  }

  const validation = validateCreateProduct(payload as Record<string, unknown>)
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 })
  }

  const supabase = getServerSupabase()
  const insertPayload = {
    store_id: active.storeId,
    name: validation.data.name,
    description: validation.data.description,
    category: validation.data.category,
    price: validation.data.price,
    compare_price: validation.data.comparePrice,
    stock_quantity: validation.data.stockQuantity,
    expiry_date: validation.data.expiryDate,
    order_deadline: validation.data.orderDeadline,
    pickup_date: validation.data.pickupDate,
    pickup_deadline: validation.data.pickupDeadline,
    urgency_banner: validation.data.urgencyBanner,
    source_image_urls: validation.data.sourceImageUrls,
    primary_image_url: validation.data.primaryImageUrl,
    flow_stage: 'product_registered',
  }

  // RLS가 store_members 멤버십을 강제하지만, resolveActiveStore에서 이미 확인됨.
  // `as never` cast: @onword/db Database 타입이 supabase-js v2.105의 __InternalSupabase
  // 키를 갖지 않아 .from() 추론이 깨짐 (PLAN.md A.10 expected 잔재).
  // Phase D에서 packages/db Database 재생성 시 제거.
  const { data, error } = await supabase
    .from('products')
    .insert(insertPayload as never)
    .select('id')
    .single<{ id: string }>()

  if (error) {
    console.error('[/api/products] insert failed:', error)
    return NextResponse.json(
      { error: '상품 등록에 실패했습니다.' },
      { status: 500 },
    )
  }

  return NextResponse.json({ id: data.id }, { status: 200 })
}
