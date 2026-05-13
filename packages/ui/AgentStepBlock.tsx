'use client'

/**
 * AgentStepBlock — Execution Trace의 한 단계.
 * 출처: Versatile Execution Agent App.tsx L65-117
 * 변경: 한글 라벨, ToolName 타입 가드 추가
 * 
 * 3가지 상태:
 *   - streaming: 흰 배경 + 그림자 + Loader2 회전
 *   - completed: 회색 배경 + CheckCircle2 + 소요 시간
 *   - error: 회색 배경 + 빨간 라벨 (TODO: 디자인 보강)
 */

import { motion } from 'framer-motion'
import { Bot, Database, Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { cn } from './cn'
import type { AgentStep } from '@onword/types'

export interface AgentStepBlockProps {
  step: AgentStep
}

// 사용자에게 보여줄 도구 한글 라벨
const TOOL_LABELS: Record<string, string> = {
  generate_announcement: '공고 텍스트 생성',
  crawl_naver_price: '네이버 가격비교 크롤링',
  compose_poster: '포스터 합성',
  generate_pickup_table: '수령 안내 테이블 생성',
  get_orders: '주문 내역 조회',
  notify_wholesaler: '도매업자 이메일 전송',
}

export function AgentStepBlock({ step }: AgentStepBlockProps) {
  const isStreaming = step.status === 'streaming'
  const isCompleted = step.status === 'completed'
  const isError = step.status === 'error'
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'p-4 rounded-3xl transition-all',
        isStreaming
          ? 'bg-white shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-black/5'
          : 'bg-zinc-50 border border-black/[0.02]'
      )}
    >
      <div className="flex items-center gap-3 mb-2">
        <div
          className={cn(
            'w-7 h-7 rounded-full flex items-center justify-center shrink-0',
            'bg-white shadow-sm border border-black/5 text-zinc-500'
          )}
        >
          {step.type === 'tool' ? <Database size={12} /> : <Bot size={12} />}
        </div>
        
        <span className="font-semibold text-[13px] text-zinc-800 truncate">
          {step.type === 'tool'
            ? `도구 실행: ${TOOL_LABELS[step.toolName ?? ''] ?? step.toolName}`
            : '생각 중'}
        </span>
        
        {isStreaming && (
          <Loader2 size={12} className="animate-spin text-zinc-400 ml-auto shrink-0" />
        )}
        
        {(isCompleted || isError) && (
          <div className="flex items-center gap-2 ml-auto shrink-0">
            {step.latencyMs !== undefined && (
              <span className="text-[10px] text-zinc-500 font-medium">
                {(step.latencyMs / 1000).toFixed(2)}초
              </span>
            )}
            {isCompleted && (
              <div className="text-emerald-500">
                <CheckCircle2 size={14} />
              </div>
            )}
            {isError && (
              <div className="text-red-500">
                <XCircle size={14} />
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* tool 호출 인자 - 작은 코드 블록 */}
      {step.type === 'tool' && step.toolArgs && (
        <pre className="text-[10px] bg-white text-zinc-500 p-3 rounded-2xl overflow-x-auto mt-3 font-mono whitespace-pre-wrap border border-black/[0.04]">
          {JSON.stringify(step.toolArgs, null, 2)}
        </pre>
      )}
      
      {/* text "생각" 내용 - 짧게 (2줄) */}
      {step.type === 'text' && step.content && (
        <div className="text-[13px] text-zinc-500 mt-2 line-clamp-2 leading-relaxed">
          "{step.content}"
        </div>
      )}
      
      {/* 결과 요약 */}
      {step.result && (
        <div className="mt-4 pt-3 border-t border-black/[0.04] flex flex-col gap-1 text-[11px]">
          <span className="font-semibold text-zinc-400 uppercase tracking-wider text-[9px]">
            결과
          </span>
          <span className={cn(
            'truncate font-medium',
            isError ? 'text-red-600' : 'text-zinc-700'
          )}>
            {step.result.message || '완료'}
          </span>
        </div>
      )}
    </motion.div>
  )
}
