'use client'

/**
 * AssetCard — /assets 갤러리의 단일 자산 카드 (dumb).
 * PRD §4.8 (generated_assets) + §9.5 (자산 view) + §9.2 (디자인 토큰).
 *
 * 책임 분리:
 *  - 데이터 fetch / store 조회는 상위 server component 가 처리.
 *  - 이 컴포넌트는 props 만으로 렌더링 + browser API (clipboard / blob 다운로드)
 *    만 호출. Supabase 호출 금지.
 *  - 카테고리 분기는 props 로 외부에서 결정해 전달 (`category`).
 *  - 복사 / 다운로드는 fire-and-forget — 상위 콜백이 필요한 경우 onCopied /
 *    onDownloaded 옵셔널 hook 사용 (copied_at 기록 등 future).
 */

import { useState } from 'react'
import { Copy, Check, Download, AlertCircle } from 'lucide-react'
import { cn } from './cn'

export interface AssetCardData {
  id: string
  type: string
  typeLabel: string
  category: 'text' | 'image'
  content: string | null
  contentPreview: string
  assetUrl: string | null
  createdAtLabel: string
  downloadFilename: string
}

export interface AssetCardProps {
  asset: AssetCardData
  onCopied?: (assetId: string) => void
  onDownloaded?: (assetId: string) => void
}

type FeedbackState = 'idle' | 'success' | 'error'

export function AssetCard({ asset, onCopied, onDownloaded }: AssetCardProps) {
  const [copyState, setCopyState] = useState<FeedbackState>('idle')
  const [downloadState, setDownloadState] = useState<FeedbackState>('idle')

  async function handleCopy() {
    if (!asset.content) {
      setCopyState('error')
      window.setTimeout(() => setCopyState('idle'), 2000)
      return
    }
    try {
      await navigator.clipboard.writeText(asset.content)
      setCopyState('success')
      onCopied?.(asset.id)
    } catch {
      setCopyState('error')
    }
    window.setTimeout(() => setCopyState('idle'), 2000)
  }

  async function handleDownload() {
    if (!asset.assetUrl) {
      setDownloadState('error')
      window.setTimeout(() => setDownloadState('idle'), 2000)
      return
    }
    try {
      const res = await fetch(asset.assetUrl)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = asset.downloadFilename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(objectUrl)
      setDownloadState('success')
      onDownloaded?.(asset.id)
    } catch {
      setDownloadState('error')
    }
    window.setTimeout(() => setDownloadState('idle'), 2000)
  }

  return (
    <article
      className="bg-white border border-black/[0.04] rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.02)] overflow-hidden flex flex-col"
      data-testid={`asset-card-${asset.id}`}
      data-category={asset.category}
    >
      <header className="flex items-center justify-between px-4 pt-4 pb-2">
        <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-zinc-50 text-[11px] font-medium uppercase tracking-wider text-zinc-600">
          {asset.typeLabel}
        </span>
        <time className="text-[11px] text-zinc-400">{asset.createdAtLabel}</time>
      </header>

      {asset.category === 'image' ? (
        <div className="px-4 pb-3">
          {asset.assetUrl ? (
            // 이미지: thumbnail 표시. next/image 는 외부 도메인 설정이 필요해서
            // 자산 갤러리에서는 단순 <img> 사용 (storage / 네이버 등 다중 도메인).
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={asset.assetUrl}
              alt={asset.typeLabel}
              loading="lazy"
              className="w-full aspect-square object-cover rounded-xl bg-zinc-100"
            />
          ) : (
            <div className="w-full aspect-square rounded-xl bg-zinc-50 flex items-center justify-center text-[12px] text-zinc-400">
              이미지 URL 없음
            </div>
          )}
        </div>
      ) : (
        <div className="px-4 pb-3">
          <p className="text-[13px] text-zinc-700 whitespace-pre-wrap break-words line-clamp-6">
            {asset.contentPreview || '내용 없음'}
          </p>
        </div>
      )}

      <footer className="mt-auto px-4 pt-2 pb-3 flex items-center gap-2 border-t border-black/[0.02]">
        {asset.category === 'text' ? (
          <button
            type="button"
            onClick={handleCopy}
            disabled={!asset.content}
            aria-label="텍스트 복사"
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium transition-all',
              !asset.content
                ? 'bg-zinc-100 text-zinc-400 cursor-not-allowed'
                : copyState === 'success'
                  ? 'bg-emerald-50 text-emerald-700'
                  : copyState === 'error'
                    ? 'bg-red-50 text-red-700'
                    : 'bg-black text-white shadow-sm hover:bg-zinc-800',
            )}
          >
            {copyState === 'success' ? (
              <>
                <Check size={12} />
                복사됨
              </>
            ) : copyState === 'error' ? (
              <>
                <AlertCircle size={12} />
                실패
              </>
            ) : (
              <>
                <Copy size={12} />
                복사
              </>
            )}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleDownload}
            disabled={!asset.assetUrl}
            aria-label="이미지 다운로드"
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium transition-all',
              !asset.assetUrl
                ? 'bg-zinc-100 text-zinc-400 cursor-not-allowed'
                : downloadState === 'success'
                  ? 'bg-emerald-50 text-emerald-700'
                  : downloadState === 'error'
                    ? 'bg-red-50 text-red-700'
                    : 'bg-black text-white shadow-sm hover:bg-zinc-800',
            )}
          >
            {downloadState === 'success' ? (
              <>
                <Check size={12} />
                저장됨
              </>
            ) : downloadState === 'error' ? (
              <>
                <AlertCircle size={12} />
                실패
              </>
            ) : (
              <>
                <Download size={12} />
                다운로드
              </>
            )}
          </button>
        )}
      </footer>
    </article>
  )
}
