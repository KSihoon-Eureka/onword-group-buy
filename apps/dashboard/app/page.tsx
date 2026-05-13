'use client'

import { useState } from 'react'
import { Sidebar, BottomNav } from '@onword/ui'
import type { DashboardTab } from '@onword/types'
import { ChatView } from '@/components/views/ChatView'
import { CampaignsView } from '@/components/views/CampaignsView'
import { OrdersView } from '@/components/views/OrdersView'
import { AssetsView } from '@/components/views/AssetsView'
import { NewProductView } from '@/components/views/NewProductView'

/**
 * Dashboard 메인 페이지.
 * 출처 구조: Versatile Execution Agent App.tsx L823-898
 * 변경: 5개 view를 별도 컴포넌트로 분리, Next.js App Router 패턴
 */
export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<DashboardTab>('chat')
  
  return (
    <div className="flex flex-col md:flex-row h-screen font-sans text-zinc-900 bg-[#F3F3F3] overflow-hidden selection:bg-black selection:text-white">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
      
      {/* 모바일 헤더 */}
      <div className="md:hidden flex items-center px-6 pt-6 pb-2 shrink-0">
        <button
          onClick={() => setActiveTab('chat')}
          className="text-2xl font-bold text-black tracking-tight hover:opacity-70 transition-opacity"
        >
          공구 관리 대시보드
        </button>
      </div>
      
      <main className="flex-1 flex flex-col overflow-hidden relative px-4 pb-4 pt-2 md:pt-6 md:pb-6 md:pr-6 md:pl-2">
        <div className="flex-1 min-h-0 overflow-y-auto md:overflow-hidden relative">
          {activeTab === 'chat'      && <ChatView onNavigate={setActiveTab} />}
          {activeTab === 'campaigns' && <CampaignsView onNavigate={setActiveTab} />}
          {activeTab === 'orders'    && <OrdersView onNavigate={setActiveTab} />}
          {activeTab === 'assets'    && <AssetsView onNavigate={setActiveTab} />}
          {activeTab === 'new'       && <NewProductView onNavigate={setActiveTab} />}
        </div>
      </main>
      
      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  )
}
