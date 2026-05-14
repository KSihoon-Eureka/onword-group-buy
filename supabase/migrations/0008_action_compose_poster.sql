-- ==========================
-- 0008_action_compose_poster.sql
-- ==========================
-- agent_traces.action CHECK constraint 에 'compose_poster' 추가.
--
-- 배경: 사용자 UX 요구로 공고/포스터 카드를 *각각 실행*. 기존엔 둘 다
--   start_campaign chain 으로 동시 실행. 이제 분리:
--   - 공고 카드 → action='start_campaign' (chain = [generate_announcement])
--   - 포스터 카드 → action='compose_poster' (chain = [compose_poster])
--
-- 6-layer enum sync:
--   1. packages/types ActionName ✓
--   2. ACTION_CHAIN (orchestrator) ✓
--   3. DB CHECK ← 이 migration
--   4. role GRANT — 영향 없음
--   5. RLS — 영향 없음 (action 별 정책 없음)
--   6. AI_DOCS / FEATURE_DEFINITIONS ✓

alter table agent_traces drop constraint if exists traces_action_valid;
alter table agent_traces add constraint traces_action_valid check (action in (
  'start_campaign', 'compose_poster', 'close_orders', 'notify_warehouse',
  'announce_pickup', 'urgent_alert', 'free_text'
));
