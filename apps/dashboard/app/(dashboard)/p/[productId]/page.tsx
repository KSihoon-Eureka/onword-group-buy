/**
 * /p/[productId] — 상품 상세 view (PLAN.md E.2, PRD §9.5 / §15.2).
 *
 * Server Component:
 *  1. (dashboard) layout 이 이미 user / store 검증 → 여기선 active store 쿠키만 방어적 확인.
 *  2. products fetch (id + storeId 일치, RLS 가 추가로 store_members 멤버십 강제).
 *      - 매치 없음 → notFound (cross-store 접근 누수 방지).
 *  3. generated_assets fetch (storeId + productId, superseded_at IS NULL).
 *  4. agent_traces fetch (storeId + productId, 최근순) — action별 최신 상태 산출.
 *  5. computeFeatureStates → 7-feature grid (ActionSurface client component).
 *  6. AI 비서 (ChatView, 상품 컨텍스트 배너) — ChatView 시그니처는 그대로 (cascading 회피).
 *  7. 자산 목록 (AssetCard 재사용).
 *
 * 비고:
 *  - ChatView 컨텍스트 주입: prop 추가 대신 상단 banner 로 "상품: {name}" 표시.
 *    실제 agent prompt context injection 은 Phase D/F (orchestrator 활성화) 시 별도.
 *  - 이미지 표시: AssetCard 가 일반 <img> 사용 (외부 도메인 대응).
 */

import { cookies } from 'next/headers'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Bot, Package } from 'lucide-react'
import { type AssetCardData } from '@onword/ui'
import { AssetCardWithCopy } from '@/components/assets/AssetCardWithCopy'
import type { Product } from '@onword/types'
import { getServerSupabase } from '@/lib/supabase/server'
import { ACTIVE_STORE_COOKIE } from '@/lib/supabase/middleware'
import { rowToSavedFlow, type SavedFlowRow } from '@/lib/saved-flows/serialize'
import { rowToGeneratedAsset, type GeneratedAssetRow } from '@/lib/assets/serialize'
import {
  formatAssetCreatedAt,
  getAssetCategory,
  getAssetTypeLabel,
  getDownloadFilename,
  truncatePreview,
} from '@/lib/assets/labels'
import {
  computeFeatureStates,
  type AssetLite,
  type TraceLite,
} from '@/lib/products/action-status'
import { ChatView } from '@/components/views/ChatView'
import { ActionSurface } from '@/components/product/ActionSurface'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: '상품 상세 — 공구 관리 대시보드',
}

interface PageProps {
  params: { productId: string }
}

type ProductRow = {
  id: string
  store_id: string
  name: string
  description: string | null
  category: string | null
  price: number
  compare_price: number | null
  stock_quantity: number
  ordered_quantity: number | null
  expiry_date: string | null
  order_deadline: string
  pickup_date: string
  pickup_deadline: string
  source_image_urls: string[] | null
  primary_image_url: string | null
  flow_stage: string
  status: string
  urgency_banner: string | null
  archived_at: string | null
  created_at: string
  updated_at: string
}

function rowToProduct(row: ProductRow): Product {
  return {
    id: row.id,
    storeId: row.store_id,
    name: row.name,
    description: row.description,
    category: row.category,
    price: row.price,
    comparePrice: row.compare_price,
    stockQuantity: row.stock_quantity,
    orderedQuantity: row.ordered_quantity ?? 0,
    expiryDate: row.expiry_date,
    orderDeadline: row.order_deadline,
    pickupDate: row.pickup_date,
    pickupDeadline: row.pickup_deadline,
    sourceImageUrls: row.source_image_urls ?? [],
    primaryImageUrl: row.primary_image_url,
    flowStage: row.flow_stage as Product['flowStage'],
    status: row.status as Product['status'],
    urgencyBanner: row.urgency_banner,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

type AgentTraceRow = {
  id: string
  action: string
  status: string
  started_at: string
  completed_at: string | null
  error_message: string | null
}

function formatPriceKRW(n: number): string {
  return `${n.toLocaleString('ko-KR')}원`
}

function formatDateKR(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const WEEKDAYS_KR = ['일', '월', '화', '수', '목', '금', '토'] as const
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${mm}월 ${dd}일(${WEEKDAYS_KR[d.getDay()]})`
}

export default async function ProductDetailPage({ params }: PageProps) {
  const supabase = getServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const storeId = cookies().get(ACTIVE_STORE_COOKIE)?.value
  if (!storeId) redirect('/select-store')

  // 1. product fetch — store_id 명시 (RLS + cross-store 누수 이중 방어)
  // `as never` cast 이유: campaigns/page.tsx 와 동일 (Database 타입 mismatch, Phase D 정리 예정).
  const { data: productData, error: productErr } = await supabase
    .from('products')
    .select('*')
    .eq('id' as never, params.productId as never)
    .eq('store_id' as never, storeId as never)
    .maybeSingle<ProductRow>()

  if (productErr) {
    console.error('[/p/[id]] product fetch failed:', productErr)
    return (
      <div className="px-4 md:px-8 pt-6 md:pt-8">
        <h1 className="text-2xl font-bold tracking-tight">상품 상세</h1>
        <div className="mt-4 rounded-2xl border border-red-100 bg-red-50 p-6 text-[13px] text-red-700">
          상품을 불러오지 못했습니다.
        </div>
      </div>
    )
  }
  if (!productData) notFound()

  const product = rowToProduct(productData)

  // 2. generated_assets — 활성(non-superseded) only
  const { data: assetData } = await supabase
    .from('generated_assets')
    .select(
      'id, store_id, product_id, trace_step_id, type, stage, content, asset_url, metadata, copied_at, used_at, superseded_at, superseded_by, created_at',
    )
    .eq('store_id', storeId)
    .eq('product_id', params.productId)
    .is('superseded_at', null)
    .order('created_at', { ascending: false })

  const assets = ((assetData ?? []) as GeneratedAssetRow[]).map(rowToGeneratedAsset)

  // 3. agent_traces — 최근 20건이면 action별 상태 산출에 충분
  const { data: traceData } = await supabase
    .from('agent_traces')
    .select('id, action, status, started_at, completed_at, error_message')
    .eq('store_id', storeId)
    .eq('product_id', params.productId)
    .order('started_at', { ascending: false })
    .limit(20)

  const traces: TraceLite[] = ((traceData ?? []) as AgentTraceRow[]).map((t) => ({
    action: t.action as TraceLite['action'],
    status: t.status as TraceLite['status'],
    startedAt: t.started_at,
    completedAt: t.completed_at,
    errorMessage: t.error_message,
  }))

  const assetLites: AssetLite[] = assets.map((a) => ({
    type: a.type,
    supersededAt: a.supersededAt,
    createdAt: a.createdAt,
  }))

  const features = computeFeatureStates({ assets: assetLites, traces })

  // 4. saved_flows for ChatView empty state
  const { data: flowsData } = await supabase
    .from('saved_flows')
    .select(
      'id, store_id, user_id, name, prompt, icon, display_order, run_count, last_run_at, created_at, updated_at',
    )
    .eq('store_id', storeId)
    .eq('user_id', user.id)
    .order('run_count', { ascending: false })
    .order('display_order', { ascending: true })
  const flows = ((flowsData ?? []) as SavedFlowRow[]).map(rowToSavedFlow)

  // 5. asset cards
  const assetCards: AssetCardData[] = assets.map((asset) => ({
    id: asset.id,
    type: asset.type,
    typeLabel: getAssetTypeLabel(asset.type),
    category: getAssetCategory(asset.type),
    content: asset.content,
    contentPreview: truncatePreview(asset.content, 100),
    assetUrl: asset.assetUrl,
    createdAtLabel: formatAssetCreatedAt(asset.createdAt),
    downloadFilename: getDownloadFilename({
      assetUrl: asset.assetUrl,
      type: asset.type,
      id: asset.id,
    }),
  }))

  return (
    <div className="px-4 md:px-8 pt-6 md:pt-8 pb-10 flex flex-col gap-8">
      {/* 헤더 */}
      <header className="flex flex-col gap-3">
        <Link
          href="/campaigns"
          className="inline-flex items-center gap-1 text-[12px] text-zinc-500 hover:text-zinc-900 transition-all w-fit"
        >
          <ArrowLeft size={14} />
          공구 현황
        </Link>

        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div className="flex items-start gap-4 min-w-0">
            <div className="shrink-0 w-20 h-20 md:w-24 md:h-24 rounded-2xl overflow-hidden bg-zinc-100 flex items-center justify-center">
              {product.primaryImageUrl ? (
                // 외부 도메인 대응 (assets/page.tsx 와 동일 정책)
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={product.primaryImageUrl}
                  alt={product.name}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : (
                <Package size={28} className="text-zinc-400" strokeWidth={1.5} />
              )}
            </div>
            <div className="min-w-0">
              <h1
                className="text-2xl font-bold tracking-tight text-zinc-900 line-clamp-2"
                title={product.name}
              >
                {product.name}
              </h1>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[13px] text-zinc-500">
                <span className="text-[17px] font-semibold text-zinc-900">
                  {formatPriceKRW(product.price)}
                </span>
                {product.comparePrice && (
                  <span className="text-zinc-400 line-through">
                    {formatPriceKRW(product.comparePrice)}
                  </span>
                )}
                <span>
                  마감 {formatDateKR(product.orderDeadline)}
                </span>
                <span>
                  픽업 {formatDateKR(product.pickupDate)}
                </span>
                <span>
                  {product.orderedQuantity}/{product.stockQuantity}개
                </span>
              </div>
              {product.urgencyBanner && (
                <span className="mt-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-red-50 text-red-700">
                  {product.urgencyBanner}
                </span>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* 7-feature action surface */}
      <ActionSurface
        storeId={storeId}
        productId={product.id}
        features={features}
      />

      {/* AI 비서 (상품 컨텍스트 배너) */}
      <section
        aria-labelledby="ai-assistant-heading"
        className="flex flex-col gap-3"
      >
        <div className="flex items-center justify-between">
          <h2
            id="ai-assistant-heading"
            className="text-[17px] font-semibold text-zinc-900 flex items-center gap-2"
          >
            <Bot size={18} strokeWidth={1.8} />
            AI 비서
          </h2>
          <span className="text-[11px] text-zinc-400">
            상품 컨텍스트: {product.name}
          </span>
        </div>
        <div className="rounded-3xl border border-black/[0.04] bg-white overflow-hidden">
          {/* 컨텍스트 배너 — ChatView 시그니처를 건드리지 않고 시각적으로 컨텍스트 표시 */}
          <div className="px-4 py-2 bg-zinc-50 border-b border-black/[0.04] text-[12px] text-zinc-600">
            <span className="font-medium text-zinc-900">{product.name}</span>
            {' 에 대해 질문하거나 자동화 액션을 요청해보세요'}
          </div>
          <div className="h-[480px]">
            <ChatView storeId={storeId} initialFlows={flows} />
          </div>
        </div>
      </section>

      {/* 자산 목록 */}
      <section
        aria-labelledby="assets-heading"
        className="flex flex-col gap-3"
      >
        <div className="flex items-baseline justify-between">
          <h2
            id="assets-heading"
            className="text-[17px] font-semibold text-zinc-900"
          >
            자산
          </h2>
          <span className="text-[11px] text-zinc-400">{assetCards.length}개</span>
        </div>

        {assetCards.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12 rounded-2xl bg-white border border-black/[0.04] text-center">
            <p className="text-[13px] text-zinc-500">
              아직 생성된 자산이 없습니다
            </p>
            <p className="text-[12px] text-zinc-400">
              위 자동화 액션을 실행하면 자산이 여기에 표시됩니다
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {assetCards.map((card) => (
              <AssetCardWithCopy key={card.id} asset={card} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
