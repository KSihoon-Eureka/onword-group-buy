-- ==========================
-- 0006_service_role_grants.sql
-- ==========================
-- service_role 에 도메인 테이블 GRANT.
--
-- 근거: Supabase Auto-expose OFF 셋업에서 service_role 도 명시적 GRANT 필요.
-- 0002_multi_tenant.sql 에서 authenticated 만 GRANT 했고 service_role 누락 →
-- Phase C.5 agent_traces INSERT 시 'permission denied for table agent_traces' (42501).
--
-- service_role 사용 영역 (PRD §5.5, §4.13):
--   - /api/agent/run orchestrator (agent_traces / trace_steps / generated_assets)
--   - cron job (auto_no_show / pipa_retention — orders / phone_access_log)
--   - 수동 user 생성 SQL (stores / store_members)
--   - audit_log 시스템 INSERT
--
-- ⚠️ RLS 우회 위험 (CLAUDE.md §15): service_role 사용 시 *코드 레벨 store_id 필터링 강제*.
-- 자동 RLS 보호 없으므로 모든 service_role 쿼리에 .eq('store_id', X) 명시 필수.

grant select, insert, update on public.stores            to service_role;
grant select, insert, update on public.store_members     to service_role;
grant select, insert, update on public.products          to service_role;
grant select, insert, update on public.orders            to service_role;
grant select, insert, update on public.agent_traces      to service_role;
grant select, insert, update on public.trace_steps       to service_role;
grant select, insert, update on public.generated_assets  to service_role;
grant select, insert, update on public.saved_flows       to service_role;
grant select, insert, update on public.audit_log         to service_role;
grant select, insert, update on public.phone_access_log  to service_role;

-- sequence usage (id default gen_random_uuid() 라 직접 사용 안 하지만 안전)
grant usage on all sequences in schema public to service_role;
