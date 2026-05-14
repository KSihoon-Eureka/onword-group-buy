/**
 * /campaigns — 공구 현황 view (PLAN.md E.1, PRD §9.3 / §9.5 / §15.2).
 *
 * Server Component:
 *  1. (dashboard) layout이 이미 user + store 검증 — 여기선 active store만 다시 확인 (방어적).
 *  2. ?filter=active|archived|all (default `active`).
 *  3. products fetch — RLS가 store_id 자동 강제. 추가로 store_id 명시 (이중 안전망).
 *  4. row → Product (camelCase) 매핑 후 ProductCard 그리드.
 *  5. 0건이면 empty state + 상품 등록 링크.
 *
 * 참고:
 *  - ProductCard는 dumb (packages/ui). 데이터 로드는 여기서 끝.
 *  - 필터 탭은 URL searchParams 동기화 (next/link).
 */

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ProductCard } from '@onword/ui'
import type { Product } from '@onword/types'
import { getServerSupabase } from '@/lib/supabase/server'
import { resolveActiveStore } from '@/lib/auth/active-store'
import { cn } from '@onword/ui'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: '공구 현황 — 공구 관리 대시보드',
}

type Filter = 'active' | 'archived' | 'all'

function parseFilter(raw: string | string[] | undefined): Filter {
  const v = Array.isArray(raw) ? raw[0] : raw
  if (v === 'archived' || v === 'all') return v
  return 'active'
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

const FILTER_TABS: Array<{ id: Filter; label: string }> = [
  { id: 'active', label: '활성' },
  { id: 'archived', label: '마감' },
  { id: 'all', label: '전체' },
]

interface PageProps {
  searchParams?: { filter?: string | string[] }
}

export default async function CampaignsPage({ searchParams }: PageProps) {
  const active = await resolveActiveStore()
  if (active.type === 'unauthenticated') redirect('/login')
  if (active.type === 'no_active_store') redirect('/select-store')
  if (active.type === 'not_member') redirect('/select-store')

  const filter = parseFilter(searchParams?.filter)

  const supabase = getServerSupabase()
  // RLS가 store_members 멤버십을 강제하지만, store_id 명시로 cross-store 누수 이중 차단.
  // `as never` cast 이유: api/products/route.ts 주석 참조 (packages/db Database 타입 mismatch, Phase D 정리 예정).
  let query = supabase
    .from('products')
    .select('*')
    .eq('store_id' as never, active.storeId as never)
    .order('order_deadline' as never, { ascending: false })

  if (filter === 'active') {
    query = query.is('archived_at' as never, null)
  } else if (filter === 'archived') {
    query = query.not('archived_at' as never, 'is', null)
  }
  // filter === 'all' → 필터 없음

  const { data, error } = await query.returns<ProductRow[]>()

  if (error) {
    console.error('[/campaigns] products fetch failed:', error)
    return (
      <div className="px-4 md:px-8 pt-6 md:pt-8">
        <header className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">공구 현황</h1>
        </header>
        <div className="rounded-2xl border border-red-100 bg-red-50 p-6 text-[13px] text-red-700">
          상품 목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.
        </div>
      </div>
    )
  }

  const products: Product[] = (data ?? []).map(rowToProduct)

  return (
    <div className="px-4 md:px-8 pt-6 md:pt-8 pb-10">
      <header className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">공구 현황</h1>
          <p className="mt-1 text-[13px] text-zinc-500">
            진행 중인 공구와 마감된 공구를 한눈에 확인합니다.
          </p>
        </div>
        <Link
          href="/new"
          className="inline-flex items-center self-start gap-1.5 px-4 py-2 rounded-full text-[13px] font-medium bg-black text-white shadow-sm hover:bg-zinc-800 transition-all"
        >
          + 상품 등록
        </Link>
      </header>

      {/* 필터 탭 */}
      <nav
        className="inline-flex items-center gap-1 p-1 bg-white border border-black/[0.04] rounded-full mb-6"
        role="tablist"
        aria-label="공구 상태 필터"
      >
        {FILTER_TABS.map((tab) => {
          const activeTab = tab.id === filter
          return (
            <Link
              key={tab.id}
              href={`/campaigns?filter=${tab.id}`}
              role="tab"
              aria-selected={activeTab}
              className={cn(
                'px-4 py-1.5 rounded-full text-[13px] font-medium transition-all',
                activeTab
                  ? 'bg-black text-white shadow-sm'
                  : 'text-zinc-500 hover:bg-black/[0.04] hover:text-black',
              )}
            >
              {tab.label}
            </Link>
          )
        })}
      </nav>

      {products.length === 0 ? (
        <EmptyState filter={filter} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </div>
  )
}

function EmptyState({ filter }: { filter: Filter }) {
  const messages: Record<Filter, string> = {
    active: '진행 중인 공구가 없습니다.',
    archived: '마감된 공구가 없습니다.',
    all: '공구가 아직 없습니다.',
  }
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <div className="rounded-full bg-zinc-100 p-5 text-3xl">📦</div>
      <p className="text-[14px] text-zinc-600">{messages[filter]}</p>
      <Link
        href="/new"
        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-medium bg-black text-white shadow-sm hover:bg-zinc-800 transition-all"
      >
        + 첫 상품 등록하기
      </Link>
    </div>
  )
}
