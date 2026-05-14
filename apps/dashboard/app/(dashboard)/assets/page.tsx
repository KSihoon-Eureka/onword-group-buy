/**
 * /assets — 자산 갤러리 (PLAN.md E.4, PRD §4.8 / §9.5).
 *
 * Server Component:
 *  1. (dashboard) layout 이 이미 user / store 검증 → 여기서는 active_store 쿠키만
 *     읽고 storeId 추출 (방어).
 *  2. generated_assets (superseded_at IS NULL) + products 조인 fetch.
 *  3. URL searchParams.category=text|image|all 로 1차 필터.
 *  4. product_id 기준 그룹핑 → 상품명 헤더 + AssetCard 그리드.
 *  5. AssetCard 는 packages/ui dumb 컴포넌트 (clipboard / blob 다운로드).
 *
 * 비고:
 *  - 이미지 표시는 일반 <img>. 외부 도메인 (네이버 등) 대응을 위해 next/image
 *    는 사용하지 않는다 (자산 갤러리 한정).
 *  - 모바일에서는 사이드바 메뉴에 포함되지 않지만 URL 직접 접근은 허용.
 */

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { FolderOpen } from 'lucide-react'
import { type AssetCardData } from '@onword/ui'
import { AssetCardWithCopy } from '@/components/assets/AssetCardWithCopy'
import { getServerSupabase } from '@/lib/supabase/server'
import { ACTIVE_STORE_COOKIE } from '@/lib/supabase/middleware'
import {
  rowToGeneratedAsset,
  type GeneratedAssetRow,
} from '@/lib/assets/serialize'
import {
  formatAssetCreatedAt,
  getAssetCategory,
  getAssetTypeLabel,
  getCategoryLabel,
  getDownloadFilename,
  truncatePreview,
  type AssetCategory,
} from '@/lib/assets/labels'

export const metadata = {
  title: '자산 — 공구 관리 대시보드',
}

interface PageProps {
  searchParams: { category?: string }
}

const STORE_WIDE_GROUP_KEY = '__store_wide__'
const STORE_WIDE_GROUP_LABEL = '매장 전체'

type FilterValue = 'all' | AssetCategory

const FILTER_OPTIONS: ReadonlyArray<{ value: FilterValue; label: string }> = [
  { value: 'all', label: '전체' },
  { value: 'text', label: getCategoryLabel('text') },
  { value: 'image', label: getCategoryLabel('image') },
]

function parseCategoryFilter(raw: string | undefined): FilterValue {
  if (raw === 'text' || raw === 'image') return raw
  return 'all'
}

interface AssetGroup {
  key: string
  productLabel: string
  cards: AssetCardData[]
}

export default async function AssetsPage({ searchParams }: PageProps) {
  const filter = parseCategoryFilter(searchParams.category)

  const supabase = getServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const storeId = cookies().get(ACTIVE_STORE_COOKIE)?.value
  if (!storeId) redirect('/select-store')

  const { data, error } = await supabase
    .from('generated_assets')
    .select(
      'id, store_id, product_id, trace_step_id, type, stage, content, asset_url, metadata, copied_at, used_at, superseded_at, superseded_by, created_at, products ( id, name )',
    )
    .eq('store_id', storeId)
    .is('superseded_at', null)
    .order('created_at', { ascending: false })

  if (error) {
    return (
      <div className="px-4 md:px-8 pt-6 md:pt-8">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 mb-2">자산</h1>
        <p className="text-[13px] text-red-600">
          자산을 불러오지 못했습니다 ({error.message})
        </p>
      </div>
    )
  }

  type Row = GeneratedAssetRow & {
    products: { id: string; name: string } | { id: string; name: string }[] | null
  }
  const rows = (data ?? []) as Row[]

  const groupsMap = new Map<string, AssetGroup>()

  for (const row of rows) {
    const asset = rowToGeneratedAsset(row)
    const category = getAssetCategory(asset.type)
    if (filter !== 'all' && filter !== category) continue

    const productRel = Array.isArray(row.products) ? row.products[0] : row.products
    const groupKey = asset.productId ?? STORE_WIDE_GROUP_KEY
    const productLabel = productRel?.name ?? STORE_WIDE_GROUP_LABEL

    const card: AssetCardData = {
      id: asset.id,
      type: asset.type,
      typeLabel: getAssetTypeLabel(asset.type),
      category,
      content: asset.content,
      contentPreview: truncatePreview(asset.content, 100),
      assetUrl: asset.assetUrl,
      createdAtLabel: formatAssetCreatedAt(asset.createdAt),
      downloadFilename: getDownloadFilename({
        assetUrl: asset.assetUrl,
        type: asset.type,
        id: asset.id,
      }),
    }

    const existing = groupsMap.get(groupKey)
    if (existing) {
      existing.cards.push(card)
    } else {
      groupsMap.set(groupKey, {
        key: groupKey,
        productLabel,
        cards: [card],
      })
    }
  }

  // 매장 전체 그룹은 맨 아래로 (상품 그룹 우선).
  const groups = Array.from(groupsMap.values()).sort((a, b) => {
    if (a.key === STORE_WIDE_GROUP_KEY) return 1
    if (b.key === STORE_WIDE_GROUP_KEY) return -1
    return a.productLabel.localeCompare(b.productLabel, 'ko')
  })

  const totalAssets = groups.reduce((sum, g) => sum + g.cards.length, 0)

  return (
    <div className="px-4 md:px-8 pt-6 md:pt-8 pb-8">
      <header className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">자산</h1>
          <p className="text-[13px] text-zinc-500 mt-1">
            AI가 생성한 공고 / 포스터 / 이메일 등 — 최신 버전만 표시
          </p>
        </div>

        <nav aria-label="자산 카테고리 필터" className="flex items-center gap-1">
          {FILTER_OPTIONS.map((opt) => {
            const active = opt.value === filter
            const href =
              opt.value === 'all' ? '/assets' : `/assets?category=${opt.value}`
            return (
              <Link
                key={opt.value}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={
                  active
                    ? 'inline-flex items-center px-3.5 py-1.5 rounded-full text-[12px] font-medium bg-black text-white shadow-sm'
                    : 'inline-flex items-center px-3.5 py-1.5 rounded-full text-[12px] font-medium text-zinc-600 bg-white border border-black/[0.04] hover:bg-black/[0.04] transition-all'
                }
              >
                {opt.label}
              </Link>
            )
          })}
        </nav>
      </header>

      {totalAssets === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
          <div className="rounded-full bg-zinc-100 p-6">
            <FolderOpen size={36} className="text-zinc-700" strokeWidth={1.5} />
          </div>
          <p className="text-[15px] font-medium text-zinc-700">
            {filter === 'all'
              ? '자산이 아직 생성되지 않았습니다'
              : `${getCategoryLabel(filter)} 자산이 없습니다`}
          </p>
          <p className="text-[13px] text-zinc-500">
            AI 비서로 공고 / 포스터 / 수령표를 만들면 여기에 표시됩니다
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-10">
          {groups.map((group) => (
            <section key={group.key} aria-labelledby={`group-${group.key}`}>
              <div className="flex items-baseline gap-2 mb-3">
                <h2
                  id={`group-${group.key}`}
                  className="text-[17px] font-semibold text-zinc-900"
                >
                  {group.productLabel}
                </h2>
                <span className="text-[11px] text-zinc-400">
                  {group.cards.length}개
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {group.cards.map((card) => (
                  <AssetCardWithCopy key={card.id} asset={card} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
