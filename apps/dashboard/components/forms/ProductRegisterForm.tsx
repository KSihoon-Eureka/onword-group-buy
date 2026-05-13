'use client'

/**
 * ProductRegisterForm — 상품 등록 폼 (smart, PLAN.md C.1, PRD §9.5).
 *
 *  - 한국어 라벨 (PRD §9.4) + 디자인 토큰 (PRD §9.2)
 *  - 이미지 1-6장 직접 업로드 → /api/upload (PRD §11.1 fallback 패턴)
 *  - "이미지 자동 가져오기" — Phase D.5 placeholder (alert)
 *  - 제출 → POST /api/products → 성공 시 토스트 (인라인) + "공구 시작" / "계속"
 *
 * 검증은 서버 (validateCreateProduct)가 최종 책임. 클라이언트는 UX 가드만.
 */

import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X, Upload, Image as ImageIcon, Loader2 } from 'lucide-react'
import { cn } from '@onword/ui'
import type { CreateProductInput } from '@onword/types'

interface UploadedImage {
  url: string
  /** Storage 경로 — 미사용이지만 디버깅 / 삭제 시 활용 가능 */
  path?: string
}

type SubmitState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'success'; productId: string }
  | { kind: 'error'; message: string }

const input =
  'w-full px-4 py-3 rounded-xl border border-black/[0.04] bg-white text-[14px] text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-black/20'
const labelClass = 'block text-[12px] font-medium text-zinc-700 mb-1.5'

export function ProductRegisterForm() {
  const router = useRouter()
  const [, startTransition] = useTransition()

  const [images, setImages] = useState<UploadedImage[]>([])
  const [primaryIndex, setPrimaryIndex] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [submitState, setSubmitState] = useState<SubmitState>({ kind: 'idle' })

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length === 0) return

    const remaining = 6 - images.length
    if (remaining <= 0) {
      setUploadError('이미지는 최대 6장까지 등록할 수 있습니다.')
      return
    }
    const toUpload = files.slice(0, remaining)
    if (files.length > remaining) {
      setUploadError(`최대 ${remaining}장만 추가됩니다.`)
    } else {
      setUploadError(null)
    }

    setUploading(true)
    const uploaded: UploadedImage[] = []
    for (const file of toUpload) {
      const fd = new FormData()
      fd.append('file', file)
      try {
        const res = await fetch('/api/upload', { method: 'POST', body: fd })
        const body = (await res.json()) as { url?: string; path?: string; error?: string }
        if (!res.ok || !body.url) {
          setUploadError(body.error ?? '이미지 업로드에 실패했습니다.')
          continue
        }
        uploaded.push({ url: body.url, path: body.path })
      } catch {
        setUploadError('네트워크 오류로 업로드에 실패했습니다.')
      }
    }
    setUploading(false)
    if (uploaded.length > 0) {
      setImages((prev) => [...prev, ...uploaded])
    }
  }

  function removeImage(index: number) {
    setImages((prev) => prev.filter((_, i) => i !== index))
    if (primaryIndex === index) setPrimaryIndex(0)
    else if (primaryIndex > index) setPrimaryIndex((i) => i - 1)
  }

  function handleAutoCrawlPlaceholder() {
    // D.5에서 crawl_naver_images 호출로 교체. PRD §10.5.
    alert('자동 크롤링은 Phase D에서 활성화됩니다.\n현재는 직접 업로드를 사용해주세요.')
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (submitState.kind === 'submitting') return

    const form = e.currentTarget
    const fd = new FormData(form)

    const numberField = (k: string): number => {
      const v = fd.get(k)
      const n = typeof v === 'string' ? Number(v) : NaN
      return Number.isFinite(n) ? n : NaN
    }
    const stringField = (k: string): string => {
      const v = fd.get(k)
      return typeof v === 'string' ? v : ''
    }

    const sourceImageUrls = images.map((i) => i.url)
    const primary = sourceImageUrls[primaryIndex] ?? null

    const body: Partial<CreateProductInput> = {
      name: stringField('name'),
      description: stringField('description') || undefined,
      category: stringField('category') || undefined,
      price: numberField('price'),
      comparePrice: stringField('comparePrice')
        ? numberField('comparePrice')
        : undefined,
      stockQuantity: numberField('stockQuantity'),
      expiryDate: stringField('expiryDate') || undefined,
      orderDeadline: stringField('orderDeadline'),
      pickupDate: stringField('pickupDate'),
      pickupDeadline: stringField('pickupDeadline'),
      urgencyBanner: stringField('urgencyBanner') || undefined,
      sourceImageUrls,
      primaryImageUrl: primary ?? undefined,
    }

    setSubmitState({ kind: 'submitting' })
    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const payload = (await res.json()) as { id?: string; error?: string }
      if (!res.ok || !payload.id) {
        setSubmitState({
          kind: 'error',
          message: payload.error ?? '상품 등록에 실패했습니다.',
        })
        return
      }
      setSubmitState({ kind: 'success', productId: payload.id })
    } catch {
      setSubmitState({
        kind: 'error',
        message: '네트워크 오류로 등록에 실패했습니다.',
      })
    }
  }

  function startCampaign() {
    if (submitState.kind !== 'success') return
    startTransition(() => {
      router.push(`/campaigns?from=${submitState.productId}`)
    })
  }

  function continueRegistering() {
    setSubmitState({ kind: 'idle' })
    setImages([])
    setPrimaryIndex(0)
  }

  return (
    <div className="max-w-3xl mx-auto pb-12">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-black tracking-tight">상품 등록</h1>
        <p className="mt-2 text-[13px] text-zinc-500">
          공구로 진행할 상품 정보를 입력해주세요.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-8">
        <Section title="기본 정보">
          <Field id="name" label="상품명" required>
            <input
              id="name"
              name="name"
              type="text"
              required
              maxLength={200}
              className={input}
              placeholder="예: 슈미트 베개커버 2매 세트"
            />
          </Field>

          <Field id="category" label="카테고리">
            <input
              id="category"
              name="category"
              type="text"
              className={input}
              placeholder="예: 침구"
            />
          </Field>

          <Field id="description" label="상품 설명">
            <textarea
              id="description"
              name="description"
              rows={4}
              className={cn(input, 'resize-y')}
              placeholder="고객이 알아야 할 핵심 정보를 적어주세요."
            />
          </Field>
        </Section>

        <Section title="가격 및 수량">
          <div className="grid grid-cols-2 gap-4">
            <Field id="price" label="판매가 (원)" required>
              <input
                id="price"
                name="price"
                type="number"
                min={1}
                step={1}
                required
                className={input}
                placeholder="12000"
              />
            </Field>
            <Field id="comparePrice" label="비교가 (원)">
              <input
                id="comparePrice"
                name="comparePrice"
                type="number"
                min={1}
                step={1}
                className={input}
                placeholder="18000"
              />
            </Field>
          </div>
          <Field id="stockQuantity" label="재고 수량" required>
            <input
              id="stockQuantity"
              name="stockQuantity"
              type="number"
              min={1}
              step={1}
              required
              className={input}
              placeholder="50"
            />
          </Field>
        </Section>

        <Section title="일정">
          <Field id="orderDeadline" label="주문 마감일시" required>
            <input
              id="orderDeadline"
              name="orderDeadline"
              type="datetime-local"
              required
              className={input}
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field id="pickupDate" label="수령 시작일" required>
              <input
                id="pickupDate"
                name="pickupDate"
                type="date"
                required
                className={input}
              />
            </Field>
            <Field id="pickupDeadline" label="수령 마감일" required>
              <input
                id="pickupDeadline"
                name="pickupDeadline"
                type="date"
                required
                className={input}
              />
            </Field>
          </div>
          <Field id="expiryDate" label="유통기한">
            <input id="expiryDate" name="expiryDate" type="date" className={input} />
          </Field>
        </Section>

        <Section title="이미지">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[13px] text-zinc-500">
              최대 6장. 첫 번째 이미지가 메인으로 사용됩니다.
            </p>
            <button
              type="button"
              onClick={handleAutoCrawlPlaceholder}
              className="text-[12px] font-medium text-zinc-500 hover:text-zinc-900 underline-offset-2 hover:underline"
            >
              이미지 자동 가져오기
            </button>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {images.map((img, i) => (
              <button
                key={img.url}
                type="button"
                onClick={() => setPrimaryIndex(i)}
                className={cn(
                  'relative aspect-square rounded-2xl overflow-hidden border bg-white',
                  primaryIndex === i
                    ? 'border-black ring-2 ring-black/10'
                    : 'border-black/[0.04] hover:border-black/20',
                )}
                aria-label={`이미지 ${i + 1} ${primaryIndex === i ? '— 메인' : '메인으로 지정'}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.url}
                  alt={`상품 이미지 ${i + 1}`}
                  className="w-full h-full object-cover"
                />
                {primaryIndex === i && (
                  <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-black text-white text-[10px] font-medium uppercase tracking-wider">
                    메인
                  </span>
                )}
                <span
                  onClick={(e) => {
                    e.stopPropagation()
                    removeImage(i)
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') removeImage(i)
                  }}
                  className="absolute top-2 right-2 p-1 rounded-full bg-white shadow-sm hover:bg-zinc-100 cursor-pointer"
                  aria-label="이미지 제거"
                >
                  <X size={14} className="text-zinc-700" />
                </span>
              </button>
            ))}
            {images.length < 6 && (
              <label
                className={cn(
                  'aspect-square rounded-2xl border border-dashed border-black/20 bg-white hover:bg-black/[0.02] flex flex-col items-center justify-center cursor-pointer text-zinc-500 transition-colors',
                  uploading && 'opacity-60 cursor-progress',
                )}
              >
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  multiple
                  className="hidden"
                  disabled={uploading}
                  onChange={handleFileChange}
                />
                {uploading ? (
                  <Loader2 size={20} className="animate-spin" />
                ) : (
                  <>
                    <Upload size={20} />
                    <span className="mt-1 text-[11px]">업로드</span>
                  </>
                )}
              </label>
            )}
          </div>

          {images.length === 0 && !uploading && (
            <div className="mt-3 flex items-center gap-2 text-[12px] text-zinc-400">
              <ImageIcon size={14} />
              이미지 없이도 등록할 수 있습니다 (자동 크롤로 채워질 예정).
            </div>
          )}

          {uploadError && (
            <p role="alert" className="mt-3 text-[13px] text-red-600">
              {uploadError}
            </p>
          )}
        </Section>

        <Section title="강조 배너 (선택)">
          <Field id="urgencyBanner" label="긴급 배너 텍스트">
            <input
              id="urgencyBanner"
              name="urgencyBanner"
              type="text"
              maxLength={50}
              className={input}
              placeholder="예: 오늘 마감"
            />
          </Field>
        </Section>

        {submitState.kind === 'error' && (
          <p role="alert" className="text-[13px] text-red-600">
            {submitState.message}
          </p>
        )}

        {submitState.kind !== 'success' && (
          <button
            type="submit"
            disabled={submitState.kind === 'submitting' || uploading}
            className="w-full px-4 py-3 rounded-full bg-black text-white text-[14px] font-medium shadow-sm hover:bg-zinc-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitState.kind === 'submitting' ? '등록 중...' : '상품 등록'}
          </button>
        )}
      </form>

      {submitState.kind === 'success' && (
        <div
          role="status"
          className="mt-8 p-6 rounded-3xl border border-emerald-200 bg-emerald-50/60"
        >
          <p className="text-[14px] font-medium text-emerald-900">
            상품이 등록되었습니다.
          </p>
          <p className="mt-1 text-[13px] text-emerald-700/80">
            바로 공구를 시작할까요?
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={startCampaign}
              className="px-4 py-2 rounded-full bg-black text-white text-[13px] font-medium shadow-sm hover:bg-zinc-800 transition-colors inline-flex items-center gap-1.5"
            >
              <Plus size={14} /> 공구 시작
            </button>
            <button
              type="button"
              onClick={continueRegistering}
              className="px-4 py-2 rounded-full bg-white border border-black/[0.04] text-zinc-700 text-[13px] font-medium hover:bg-black/[0.04] transition-colors"
            >
              계속 등록
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-[32px] border border-black/[0.04] shadow-[0_2px_12px_rgba(0,0,0,0.02)] p-6 md:p-8">
      <h2 className="text-[17px] font-semibold text-zinc-900 mb-5">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

function Field({
  id,
  label,
  required,
  children,
}: {
  id: string
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      {children}
    </div>
  )
}
