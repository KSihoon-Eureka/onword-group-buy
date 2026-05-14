'use client'

/**
 * AssetCard + copy 추적 client wrapper.
 *  - 복사 클릭 → AssetCard 의 onCopied callback → POST /api/assets/[id]/copy
 *  - fire-and-forget — 실패해도 UI 영향 없음 (이미 클립보드 복사 완료된 상태)
 */

import { AssetCard, type AssetCardData } from '@onword/ui'

interface Props {
  asset: AssetCardData
}

export function AssetCardWithCopy({ asset }: Props) {
  async function handleCopied(assetId: string) {
    try {
      await fetch(`/api/assets/${assetId}/copy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
    } catch {
      // ignore — 클립보드는 이미 채워짐
    }
  }

  return <AssetCard asset={asset} onCopied={handleCopied} />
}
