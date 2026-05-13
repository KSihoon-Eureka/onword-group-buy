/**
 * /new — 상품 등록 페이지 (PLAN.md C.1, PRD §9.5).
 *
 * Server Component shell — (dashboard) layout이 이미 user / store 검증.
 * 폼 로직은 'use client' ProductRegisterForm에 위임.
 */

import { ProductRegisterForm } from '@/components/forms/ProductRegisterForm'

export const metadata = {
  title: '상품 등록 — 공구 관리 대시보드',
}

export default function NewProductPage() {
  return (
    <div className="px-4 md:px-8 pt-6 md:pt-8">
      <ProductRegisterForm />
    </div>
  )
}
