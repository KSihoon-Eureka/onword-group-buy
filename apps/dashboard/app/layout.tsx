import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '공구 관리 대시보드 — Onword',
  description: '한국 오프라인 매장용 공동구매 운영 자동화',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  )
}
