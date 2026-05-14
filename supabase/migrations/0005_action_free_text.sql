-- ==========================
-- 0005_action_free_text.sql
-- ==========================
-- agent_traces.action CHECK constraint 에 'free_text' 추가.
--
-- Cascading 정합 (Phase C harness L5 — 모든 동기화 위치 박음):
--   - packages/types/index.ts ActionName (commit 3443192)
--   - PRD.md §4.6 agent_traces.action enum 코멘트 (commit 3443192)
--   - 본 migration (DB CHECK constraint) ← 본 마이그레이션이 누락된 동기화
--
-- 근거: Phase C 시각 검증 시 ChatView free_text 메시지 → 500 trace_insert_failed.
-- 원인: 0001_init.sql 의 traces_action_valid CHECK 가 5개 action 만 허용, free_text 거부.

alter table agent_traces drop constraint if exists traces_action_valid;

alter table agent_traces add constraint traces_action_valid check (action in (
  'start_campaign', 'close_orders', 'notify_warehouse',
  'announce_pickup', 'urgent_alert', 'free_text'
));
