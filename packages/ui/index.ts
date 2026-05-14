/**
 * @onword/ui — 공통 UI 컴포넌트
 * 
 * 출처 패턴: Versatile Execution Agent (Vite/React 19)
 * 우리: Next.js 14 (App Router) + 'use client' 적용
 */

export { cn } from './cn'
export { Sidebar, type SidebarProps } from './Sidebar'
export { StoreSwitcher, type StoreSwitcherProps } from './StoreSwitcher'
export { BottomNav, type BottomNavProps } from './BottomNav'
export { AgentStepBlock, type AgentStepBlockProps } from './AgentStepBlock'
export { SavedFlows, type SavedFlowsProps } from './SavedFlows'
export { ProductCard, type ProductCardProps } from './ProductCard'
export {
  PROGRESS_STAGE_ORDER,
  getProgressDots,
  formatPriceKRW,
  formatDeadlineKR,
  formatParticipation,
  type ProgressDotState,
} from './productCardHelpers'
export {
  AuditLogPanel,
  type AuditLogPanelProps,
  type AuditFilter,
  type AuditFilterOption,
  AUDIT_ACTION_LABEL,
  AUDIT_ENTITY_LABEL,
  getAuditActionLabel,
  getAuditEntityLabel,
  formatAuditTimestamp,
  getActorLabel,
  getEntityDisplay,
  summarizeChanges,
} from './AuditLogPanel'
export { AssetCard, type AssetCardProps, type AssetCardData } from './AssetCard'
export {
  NotificationCenter,
  type NotificationCenterProps,
  type NotificationItem,
  type NotificationKind,
  NOTIFICATION_KIND_LABEL,
  getNotificationKindLabel,
  isUnread,
  countUnread,
  formatRelativeKo,
} from './NotificationCenter'
export {
  SummaryCard,
  type SummaryCardProps,
  type SummaryStats,
  type SummaryCardKey,
  SUMMARY_CARD_META,
  SUMMARY_CARD_ORDER,
  formatSummaryNumber,
  isZeroValue,
} from './SummaryCard'
