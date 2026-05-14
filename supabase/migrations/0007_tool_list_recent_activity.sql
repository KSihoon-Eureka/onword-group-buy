-- ==========================
-- 0007_tool_list_recent_activity.sql
-- ==========================
-- trace_steps.tool_name CHECK constraint 에 list_recent_activity 추가.
--
-- 배경: Phase F dynamic agent (Claude tool_use loop) 가 매장 활동 이력을
--   조회하는 read-only tool 'list_recent_activity' 를 호출. orchestrator 가
--   trace_steps INSERT 시 tool_name='list_recent_activity' 사용 → 기존
--   CHECK constraint 위반 (0001_init.sql).
--
-- 6-layer enum sync (AI_DOCS §3.9):
--   1. packages/types ToolName ✓
--   2. PRD §10 (도메인 명세) — list_recent_activity 추가 필요 (TODO)
--   3. DB CHECK constraint ← 이 migration
--   4. role GRANT — trace_steps 는 이미 service_role 권한 부여됨 (0006)
--   5. RLS — 영향 없음 (trace_steps RLS 는 agent_traces.store_id 기반)
--   6. AI_DOCS 참조 — 이 migration + AI_DOCS/task-execution.md
--
-- ⚠️ free_text 처럼 동적 agent 가 사용. read-only tool 이므로 RLS 추가 안전.

alter table trace_steps drop constraint if exists steps_tool_name_valid;
alter table trace_steps add constraint steps_tool_name_valid check (tool_name in (
  'generate_announcement', 'generate_price_emphasis_text',
  'crawl_naver_images', 'crawl_naver_price',
  'compose_poster', 'generate_pickup_table',
  'get_orders', 'notify_wholesaler',
  'list_recent_activity'
));
