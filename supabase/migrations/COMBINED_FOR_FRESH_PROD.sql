-- ========================================================================
-- COMBINED_FOR_FRESH_PROD.sql
-- ========================================================================
-- Fresh prod Supabase 에 한 번에 적용할 통합 migration.
-- 0001 ~ 0007 순서대로 실행 (중간 실패 시 같은 migration 의 잔여 statement
-- 만 다음 실행에서 idempotent).
--
-- 실행 방법:
--   1. Supabase Dashboard > SQL Editor > New Query
--   2. 본 파일 내용 전체 paste
--   3. Run (⌘ Enter)
--   4. "Success. No rows returned" 확인
--
-- 기존 prod 에 이미 일부 migration 이 적용된 경우 본 파일 *대신* 개별
-- migration 을 누락된 것만 실행. 본 통합 파일은 모든 statement 가 idempotent
-- (`if not exists`, `drop ... if exists`) 하므로 중복 실행해도 안전하지만
-- 데이터 보호를 위해 prod 에서는 개별 적용 권장.
-- ========================================================================

-- ========================================================================
-- 0001_init.sql
-- ========================================================================
-- 0001_init.sql
-- Onword Group Buy 초기 스키마 — 5 도메인 테이블
-- PRD §4.4-4.8 1:1 대응
--
-- 이 마이그레이션은 멀티테넌트 컬럼 (store_id) / RLS / GRANT를 포함하지 않는다.
-- 0002_multi_tenant.sql에서 일괄 추가.
-- 즉 0001만 실행한 상태에서는 supabase-js 호출 시 PostgREST 404 발생 (Auto-expose OFF).
-- 0002 직후까지 묶어 실행 전제.

-- ==========================
-- updated_at 자동 갱신 (공용 함수)
-- ==========================
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ==========================
-- products
-- ==========================
create table if not exists products (
  id uuid primary key default gen_random_uuid(),

  name text not null,
  description text,
  category text,

  price integer not null,
  compare_price integer,

  stock_quantity integer not null,
  ordered_quantity integer default 0 not null,

  expiry_date date,
  order_deadline timestamptz not null,
  pickup_date date not null,
  pickup_deadline date not null,

  source_image_urls text[] default array[]::text[] not null,

  flow_stage text default 'product_registered' not null,
  status text default 'active' not null,

  urgency_banner text,

  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,

  constraint products_price_positive check (price > 0),
  constraint products_stock_non_negative check (stock_quantity >= 0),
  constraint products_status_valid check (status in ('active', 'closed', 'cancelled')),
  constraint products_flow_stage_valid check (flow_stage in (
    'product_registered', 'announcement_1', 'order_open', 'order_closed',
    'stock_confirmed', 'warehouse_notified', 'arrived', 'pickup_ready', 'completed'
  ))
);

create index if not exists idx_products_flow_stage on products(flow_stage);
create index if not exists idx_products_status on products(status);
create index if not exists idx_products_pickup_date on products(pickup_date);

drop trigger if exists products_updated_at on products;
create trigger products_updated_at
  before update on products
  for each row execute function set_updated_at();

-- ==========================
-- orders (DORMANT, A14 — apps/order-web 미출시)
-- ==========================
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) on delete cascade not null,

  customer_name text not null,
  customer_phone text,                              -- PIPA 끝 4자리; constraint는 0004

  quantity integer not null,
  total_price integer not null,

  status text default 'pending' not null,

  anomaly_detected boolean default false not null,
  anomaly_reason text,
  notes text,

  picked_up_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,

  constraint orders_quantity_positive check (quantity > 0),
  constraint orders_price_non_negative check (total_price >= 0),
  constraint orders_status_valid check (status in (
    'pending', 'confirmed', 'picked_up', 'cancelled', 'no_show'
  ))
);

create index if not exists idx_orders_product_id on orders(product_id);
create index if not exists idx_orders_status on orders(status);

drop trigger if exists orders_updated_at on orders;
create trigger orders_updated_at
  before update on orders
  for each row execute function set_updated_at();

-- 주문 INSERT/UPDATE 시 products.ordered_quantity 동기화 (Sihoon 결정 — 유지)
create or replace function update_ordered_quantity() returns trigger as $$
begin
  if (TG_OP = 'INSERT' and new.status != 'cancelled') then
    update products
      set ordered_quantity = ordered_quantity + new.quantity
      where id = new.product_id;
  elsif (TG_OP = 'UPDATE' and old.status != 'cancelled' and new.status = 'cancelled') then
    update products
      set ordered_quantity = ordered_quantity - old.quantity
      where id = old.product_id;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists orders_quantity_sync on orders;
create trigger orders_quantity_sync
  after insert or update on orders
  for each row execute function update_ordered_quantity();

-- ==========================
-- agent_traces
-- ==========================
create table if not exists agent_traces (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) on delete set null,

  action text not null,
  status text default 'running' not null,

  summary text,
  error_message text,

  started_at timestamptz default now() not null,
  completed_at timestamptz,

  constraint traces_status_valid check (status in (
    'running', 'completed', 'failed', 'cancelled'
  )),
  constraint traces_action_valid check (action in (
    'start_campaign', 'close_orders', 'notify_warehouse',
    'announce_pickup', 'urgent_alert'
  ))
);

create index if not exists idx_traces_product_id on agent_traces(product_id);
create index if not exists idx_traces_status on agent_traces(status);
create index if not exists idx_traces_started_at on agent_traces(started_at desc);

-- ==========================
-- trace_steps
-- ==========================
create table if not exists trace_steps (
  id uuid primary key default gen_random_uuid(),
  trace_id uuid references agent_traces(id) on delete cascade not null,

  step_order integer not null,

  tool_name text not null,
  status text default 'pending' not null,

  input jsonb,
  output jsonb,

  summary text,

  started_at timestamptz default now() not null,
  completed_at timestamptz,
  duration_ms integer,

  constraint steps_status_valid check (status in (
    'pending', 'running', 'done', 'error'
  )),
  constraint steps_tool_name_valid check (tool_name in (
    'generate_announcement', 'generate_price_emphasis_text',
    'crawl_naver_images', 'crawl_naver_price',
    'compose_poster', 'generate_pickup_table',
    'get_orders', 'notify_wholesaler'
  ))
);

create index if not exists idx_steps_trace_order on trace_steps(trace_id, step_order);

-- ==========================
-- generated_assets
-- ==========================
-- type constraint: types/index.ts AssetType과 1:1 (11개).
-- supersede 컬럼은 0004에서 추가.
create table if not exists generated_assets (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) on delete cascade,
  trace_step_id uuid references trace_steps(id) on delete set null,

  type text not null,
  stage text,

  content text,
  asset_url text,
  metadata jsonb,

  copied_at timestamptz,
  used_at timestamptz,

  created_at timestamptz default now() not null,

  constraint assets_type_valid check (type in (
    'announcement_stage1',
    'announcement_stage2',
    'announcement_stage3',
    'price_emphasis_text',
    'price_compare_image',
    'price_compare_data',
    'product_image',
    'poster',
    'pickup_table_image',
    'pickup_table_text',
    'wholesale_email'
  ))
);

create index if not exists idx_assets_product_id on generated_assets(product_id);
create index if not exists idx_assets_type on generated_assets(type);
create index if not exists idx_assets_created_at on generated_assets(created_at desc);

-- ==========================
-- Realtime 활성화 안내 (Supabase Dashboard에서 수동)
-- ==========================
-- - trace_steps (Execution Trace 실시간)
-- - orders (DORMANT, 추후 활성)
-- - products (flow_stage 변경)
-- - audit_log (notification feed; 0003에서 생성)

-- ========================================================================
-- 0002_multi_tenant.sql
-- ========================================================================
-- 0002_multi_tenant.sql
-- 멀티 매장 + RLS + GRANT
-- PRD §4.2-4.3 (stores, store_members), §4.13 (RLS 표준 패턴), §5 (auth)
--
-- Supabase 프로젝트 설정 (Sihoon, 2026-05-14):
--   - Data API ON / Auto-expose new tables OFF / Auto RLS ON
--   → 모든 신규 테이블에 명시적 GRANT TO authenticated 필수.
--   → anon GRANT은 sprint 1 보류 (A14: order-web dormant).

-- ==========================
-- 1. stores (A2, A11)
-- ==========================
create table if not exists stores (
  id uuid primary key default gen_random_uuid(),

  name text not null,
  brand_name text,
  short_name text,

  leading_emoji text default '🎁' not null,
  primary_color text default '#5B2E91' not null,
  accent_color text default '#E53E3E' not null,

  wholesale_email text,
  wholesale_from_email text default 'noreply@onword.kr' not null,

  owner_id uuid references auth.users(id) on delete restrict not null,

  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create index if not exists idx_stores_owner on stores(owner_id);

drop trigger if exists stores_updated_at on stores;
create trigger stores_updated_at
  before update on stores
  for each row execute function set_updated_at();

-- ==========================
-- 2. store_members (A2)
-- ==========================
create table if not exists store_members (
  store_id uuid references stores(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  role text not null,
  joined_at timestamptz default now() not null,

  primary key (store_id, user_id),
  constraint store_members_role_valid check (role in ('owner', 'staff'))
);

create index if not exists idx_store_members_user on store_members(user_id);

-- ==========================
-- 3. 기존 도메인 테이블에 store_id 추가
-- ==========================
-- 데이터 0 row (현재 DB 미배포) → backfill 불필요. 즉시 NOT NULL.

alter table products
  add column if not exists store_id uuid references stores(id) on delete restrict;

alter table orders
  add column if not exists store_id uuid references stores(id) on delete restrict;

alter table agent_traces
  add column if not exists store_id uuid references stores(id) on delete restrict;

alter table agent_traces
  add column if not exists user_id uuid references auth.users(id) on delete set null;

alter table generated_assets
  add column if not exists store_id uuid references stores(id) on delete restrict;

-- NOT NULL 강제 (DB 미배포라 안전; 향후 row 있는 상태에서 재실행 시도 시 실패 — 의도된 동작)
alter table products      alter column store_id set not null;
alter table orders        alter column store_id set not null;
alter table agent_traces  alter column store_id set not null;
alter table generated_assets alter column store_id set not null;

create index if not exists idx_products_store_flow on products(store_id, flow_stage);
create index if not exists idx_orders_store on orders(store_id);
create index if not exists idx_orders_store_status on orders(store_id, status);
create index if not exists idx_traces_store_time on agent_traces(store_id, started_at desc);
create index if not exists idx_assets_store_time on generated_assets(store_id, created_at desc);

-- ==========================
-- 4. orders.store_id 자동 복제 trigger
-- ==========================
-- order-web 익명 INSERT 시 product_id만 전달 → product.store_id 복제.
create or replace function copy_store_id_to_order() returns trigger as $$
begin
  if new.store_id is null then
    new.store_id := (select store_id from products where id = new.product_id);
  end if;
  if new.store_id is null then
    raise exception 'orders.store_id resolution failed: product % missing or has no store', new.product_id;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists orders_set_store_id on orders;
create trigger orders_set_store_id
  before insert on orders
  for each row execute function copy_store_id_to_order();

-- ==========================
-- 5. RLS 활성화
-- ==========================
alter table stores            enable row level security;
alter table store_members     enable row level security;
alter table products          enable row level security;
alter table orders            enable row level security;
alter table agent_traces      enable row level security;
alter table trace_steps       enable row level security;
alter table generated_assets  enable row level security;

-- ==========================
-- 6. RLS 정책 — stores
-- ==========================
-- 멤버는 자기 store 행만. owner / staff 동일.
drop policy if exists "stores_select" on stores;
create policy "stores_select" on stores for select to authenticated
using (
  exists (
    select 1 from store_members
    where store_members.store_id = stores.id
      and store_members.user_id = auth.uid()
  )
);

-- INSERT: owner가 자기 자신을 owner_id로 행 생성 가능.
-- sprint 1은 SQL 수동 생성 (PRD §5.4) → 이 정책은 향후 셀프 가입용 사전 작업.
drop policy if exists "stores_insert" on stores;
create policy "stores_insert" on stores for insert to authenticated
with check (owner_id = auth.uid());

drop policy if exists "stores_update" on stores;
create policy "stores_update" on stores for update to authenticated
using (
  exists (
    select 1 from store_members
    where store_members.store_id = stores.id
      and store_members.user_id = auth.uid()
      and store_members.role = 'owner'
  )
)
with check (
  exists (
    select 1 from store_members
    where store_members.store_id = stores.id
      and store_members.user_id = auth.uid()
      and store_members.role = 'owner'
  )
);

drop policy if exists "stores_no_delete" on stores;
create policy "stores_no_delete" on stores for delete to authenticated using (false);

-- ==========================
-- 7. RLS 정책 — store_members
-- ==========================
-- 본인 멤버십 행만 SELECT (재귀 RLS 회피).
-- StoreSwitcher 사용 케이스 충족. 다른 직원 멤버 목록 조회는 sprint 2에서
-- SECURITY DEFINER helper function으로 도입.
drop policy if exists "store_members_select" on store_members;
create policy "store_members_select" on store_members for select to authenticated
using (user_id = auth.uid());

-- INSERT/UPDATE: sprint 1 수동 관리 (SQL Editor) — service role만 사용.
-- authenticated 가입 / 변경은 sprint 2.
drop policy if exists "store_members_no_insert" on store_members;
create policy "store_members_no_insert" on store_members for insert to authenticated with check (false);

drop policy if exists "store_members_no_update" on store_members;
create policy "store_members_no_update" on store_members for update to authenticated using (false) with check (false);

drop policy if exists "store_members_no_delete" on store_members;
create policy "store_members_no_delete" on store_members for delete to authenticated using (false);

-- ==========================
-- 8. RLS 정책 — products / orders / agent_traces / generated_assets (표준 패턴)
-- ==========================
-- PRD §4.13: 모든 도메인 테이블에 동일 패턴. DELETE는 USING (false) — archive만 허용.

-- products
drop policy if exists "products_select" on products;
create policy "products_select" on products for select to authenticated
using (
  exists (select 1 from store_members
    where store_members.store_id = products.store_id and store_members.user_id = auth.uid())
);
drop policy if exists "products_insert" on products;
create policy "products_insert" on products for insert to authenticated
with check (
  exists (select 1 from store_members
    where store_members.store_id = products.store_id and store_members.user_id = auth.uid())
);
drop policy if exists "products_update" on products;
create policy "products_update" on products for update to authenticated
using (
  exists (select 1 from store_members
    where store_members.store_id = products.store_id and store_members.user_id = auth.uid())
)
with check (
  exists (select 1 from store_members
    where store_members.store_id = products.store_id and store_members.user_id = auth.uid())
);
drop policy if exists "products_no_delete" on products;
create policy "products_no_delete" on products for delete to authenticated using (false);

-- orders (order-web 익명 INSERT는 service_role 경로; authenticated는 사장님 dashboard)
drop policy if exists "orders_select" on orders;
create policy "orders_select" on orders for select to authenticated
using (
  exists (select 1 from store_members
    where store_members.store_id = orders.store_id and store_members.user_id = auth.uid())
);
drop policy if exists "orders_insert" on orders;
create policy "orders_insert" on orders for insert to authenticated
with check (
  exists (select 1 from store_members
    where store_members.store_id = orders.store_id and store_members.user_id = auth.uid())
);
drop policy if exists "orders_update" on orders;
create policy "orders_update" on orders for update to authenticated
using (
  exists (select 1 from store_members
    where store_members.store_id = orders.store_id and store_members.user_id = auth.uid())
)
with check (
  exists (select 1 from store_members
    where store_members.store_id = orders.store_id and store_members.user_id = auth.uid())
);
drop policy if exists "orders_no_delete" on orders;
create policy "orders_no_delete" on orders for delete to authenticated using (false);

-- agent_traces
drop policy if exists "traces_select" on agent_traces;
create policy "traces_select" on agent_traces for select to authenticated
using (
  exists (select 1 from store_members
    where store_members.store_id = agent_traces.store_id and store_members.user_id = auth.uid())
);
drop policy if exists "traces_insert" on agent_traces;
create policy "traces_insert" on agent_traces for insert to authenticated
with check (
  exists (select 1 from store_members
    where store_members.store_id = agent_traces.store_id and store_members.user_id = auth.uid())
);
drop policy if exists "traces_update" on agent_traces;
create policy "traces_update" on agent_traces for update to authenticated
using (
  exists (select 1 from store_members
    where store_members.store_id = agent_traces.store_id and store_members.user_id = auth.uid())
)
with check (
  exists (select 1 from store_members
    where store_members.store_id = agent_traces.store_id and store_members.user_id = auth.uid())
);
drop policy if exists "traces_no_delete" on agent_traces;
create policy "traces_no_delete" on agent_traces for delete to authenticated using (false);

-- generated_assets
drop policy if exists "assets_select" on generated_assets;
create policy "assets_select" on generated_assets for select to authenticated
using (
  exists (select 1 from store_members
    where store_members.store_id = generated_assets.store_id and store_members.user_id = auth.uid())
);
drop policy if exists "assets_insert" on generated_assets;
create policy "assets_insert" on generated_assets for insert to authenticated
with check (
  exists (select 1 from store_members
    where store_members.store_id = generated_assets.store_id and store_members.user_id = auth.uid())
);
drop policy if exists "assets_update" on generated_assets;
create policy "assets_update" on generated_assets for update to authenticated
using (
  exists (select 1 from store_members
    where store_members.store_id = generated_assets.store_id and store_members.user_id = auth.uid())
)
with check (
  exists (select 1 from store_members
    where store_members.store_id = generated_assets.store_id and store_members.user_id = auth.uid())
);
drop policy if exists "assets_no_delete" on generated_assets;
create policy "assets_no_delete" on generated_assets for delete to authenticated using (false);

-- ==========================
-- 9. RLS 정책 — trace_steps (부모 trace 경유)
-- ==========================
drop policy if exists "steps_select" on trace_steps;
create policy "steps_select" on trace_steps for select to authenticated
using (
  exists (
    select 1 from agent_traces
    join store_members on store_members.store_id = agent_traces.store_id
    where agent_traces.id = trace_steps.trace_id
      and store_members.user_id = auth.uid()
  )
);
drop policy if exists "steps_insert" on trace_steps;
create policy "steps_insert" on trace_steps for insert to authenticated
with check (
  exists (
    select 1 from agent_traces
    join store_members on store_members.store_id = agent_traces.store_id
    where agent_traces.id = trace_steps.trace_id
      and store_members.user_id = auth.uid()
  )
);
drop policy if exists "steps_update" on trace_steps;
create policy "steps_update" on trace_steps for update to authenticated
using (
  exists (
    select 1 from agent_traces
    join store_members on store_members.store_id = agent_traces.store_id
    where agent_traces.id = trace_steps.trace_id
      and store_members.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from agent_traces
    join store_members on store_members.store_id = agent_traces.store_id
    where agent_traces.id = trace_steps.trace_id
      and store_members.user_id = auth.uid()
  )
);
drop policy if exists "steps_no_delete" on trace_steps;
create policy "steps_no_delete" on trace_steps for delete to authenticated using (false);

-- ==========================
-- 10. GRANT TO authenticated (Auto-expose OFF 대응)
-- ==========================
-- DELETE 실권한은 RLS USING (false)로 모두 차단되어도 GRANT는 일관성 유지.
grant select, insert, update, delete on public.stores            to authenticated;
grant select, insert, update, delete on public.store_members     to authenticated;
grant select, insert, update, delete on public.products          to authenticated;
grant select, insert, update, delete on public.orders            to authenticated;
grant select, insert, update, delete on public.agent_traces      to authenticated;
grant select, insert, update, delete on public.trace_steps       to authenticated;
grant select, insert, update, delete on public.generated_assets  to authenticated;

-- ========================================================================
-- 0003_new_tables.sql
-- ========================================================================
-- 0003_new_tables.sql
-- saved_flows + audit_log + phone_access_log + default flows trigger
-- PRD §4.9 (saved_flows), §4.10 (audit_log), §4.11 (phone_access_log), §14.5 (default flows)
--
-- 0002에서 stores / store_members 생성 완료 가정.

-- ==========================
-- 1. saved_flows (PRD §4.9 / §14)
-- ==========================
create table if not exists saved_flows (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references stores(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,

  name text not null,
  prompt text not null,
  icon text,
  display_order integer default 0 not null,

  run_count integer default 0 not null,
  last_run_at timestamptz,

  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,

  constraint saved_flows_name_length check (length(name) <= 40)
);

create index if not exists idx_saved_flows_user on saved_flows(store_id, user_id, display_order);

drop trigger if exists saved_flows_updated_at on saved_flows;
create trigger saved_flows_updated_at
  before update on saved_flows
  for each row execute function set_updated_at();

-- ==========================
-- 2. audit_log (PRD §4.10)
-- ==========================
create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references stores(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete set null,    -- null = system (cron 등)

  entity_type text not null,
  entity_id uuid not null,

  action text not null,
  changes jsonb,

  created_at timestamptz default now() not null,

  constraint audit_entity_type_valid check (entity_type in (
    'product', 'order', 'asset', 'flow', 'store'
  )),
  constraint audit_action_valid check (action in (
    'create', 'update', 'archive', 'restore',
    'flow_stage_change', 'asset_supersede', 'auto_no_show'
  ))
);

create index if not exists idx_audit_store_entity
  on audit_log(store_id, entity_type, entity_id, created_at desc);
create index if not exists idx_audit_store_time
  on audit_log(store_id, created_at desc);

-- ==========================
-- 3. phone_access_log (PRD §4.11 / §6.2.4)
-- ==========================
create table if not exists phone_access_log (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references stores(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete set null,    -- null = system (cron pipa-retention)
  order_id uuid references orders(id) on delete set null,

  action text not null,
  reason text,

  ip_address inet,
  user_agent text,

  created_at timestamptz default now() not null,

  constraint phone_access_action_valid check (action in (
    'view', 'edit', 'export', 'delete'
  ))
);

create index if not exists idx_pal_store_time on phone_access_log(store_id, created_at desc);
create index if not exists idx_pal_order on phone_access_log(order_id);

-- ==========================
-- 4. RLS — saved_flows (사용자 본인 store 멤버여야)
-- ==========================
alter table saved_flows enable row level security;

drop policy if exists "saved_flows_select" on saved_flows;
create policy "saved_flows_select" on saved_flows for select to authenticated
using (
  exists (select 1 from store_members
    where store_members.store_id = saved_flows.store_id and store_members.user_id = auth.uid())
);
drop policy if exists "saved_flows_insert" on saved_flows;
create policy "saved_flows_insert" on saved_flows for insert to authenticated
with check (
  user_id = auth.uid()
  and exists (select 1 from store_members
    where store_members.store_id = saved_flows.store_id and store_members.user_id = auth.uid())
);
drop policy if exists "saved_flows_update" on saved_flows;
create policy "saved_flows_update" on saved_flows for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());
-- saved_flows는 hard delete 허용 (PRD §14.3 — 사장님 자유 편집/삭제)
drop policy if exists "saved_flows_delete" on saved_flows;
create policy "saved_flows_delete" on saved_flows for delete to authenticated
using (user_id = auth.uid());

-- ==========================
-- 5. RLS — audit_log (insert는 system / authenticated; read는 store 멤버)
-- ==========================
alter table audit_log enable row level security;

drop policy if exists "audit_select" on audit_log;
create policy "audit_select" on audit_log for select to authenticated
using (
  exists (select 1 from store_members
    where store_members.store_id = audit_log.store_id and store_members.user_id = auth.uid())
);
-- INSERT은 authenticated 멤버 또는 service_role. user_id 자기 자신 강제.
drop policy if exists "audit_insert" on audit_log;
create policy "audit_insert" on audit_log for insert to authenticated
with check (
  exists (select 1 from store_members
    where store_members.store_id = audit_log.store_id and store_members.user_id = auth.uid())
  and (user_id is null or user_id = auth.uid())
);
-- audit_log는 append-only — update / delete 금지.
drop policy if exists "audit_no_update" on audit_log;
create policy "audit_no_update" on audit_log for update to authenticated using (false) with check (false);
drop policy if exists "audit_no_delete" on audit_log;
create policy "audit_no_delete" on audit_log for delete to authenticated using (false);

-- ==========================
-- 6. RLS — phone_access_log (PIPA 의무, append-only)
-- ==========================
alter table phone_access_log enable row level security;

drop policy if exists "pal_select" on phone_access_log;
create policy "pal_select" on phone_access_log for select to authenticated
using (
  exists (select 1 from store_members
    where store_members.store_id = phone_access_log.store_id and store_members.user_id = auth.uid())
);
drop policy if exists "pal_insert" on phone_access_log;
create policy "pal_insert" on phone_access_log for insert to authenticated
with check (
  exists (select 1 from store_members
    where store_members.store_id = phone_access_log.store_id and store_members.user_id = auth.uid())
  and (user_id is null or user_id = auth.uid())
);
drop policy if exists "pal_no_update" on phone_access_log;
create policy "pal_no_update" on phone_access_log for update to authenticated using (false) with check (false);
drop policy if exists "pal_no_delete" on phone_access_log;
create policy "pal_no_delete" on phone_access_log for delete to authenticated using (false);

-- ==========================
-- 7. Default saved_flows 시드 trigger (PRD §14.5)
-- ==========================
-- store_members에 role='owner' 행 INSERT 시 default 4 flows 자동 생성.
-- staff 멤버 추가 시는 생성 안 함 (각 owner 본인 store에 한 번만).
create or replace function seed_default_saved_flows() returns trigger as $$
begin
  if new.role <> 'owner' then
    return new;
  end if;

  -- 이미 동일 (store_id, user_id) 조합으로 flow가 존재하면 skip (idempotent)
  if exists (
    select 1 from saved_flows
    where saved_flows.store_id = new.store_id
      and saved_flows.user_id = new.user_id
  ) then
    return new;
  end if;

  insert into saved_flows (store_id, user_id, name, prompt, icon, display_order)
  values
    (new.store_id, new.user_id,
     '오늘 마감 상품 공고글 다시 만들기',
     '오늘 마감인 모든 상품의 공고글을 다시 생성해줘',
     'RefreshCcw', 1),
    (new.store_id, new.user_id,
     '도매업자에게 주문 전송',
     '오늘 주문 마감된 상품들의 주문 내역을 도매업자에게 이메일로 전송해줘',
     'Mail', 2),
    (new.store_id, new.user_id,
     '수령일 비교 테이블 생성',
     '이번 주 수령 가능한 상품들의 수령일 비교 테이블 만들어줘',
     'Calendar', 3),
    (new.store_id, new.user_id,
     '오늘 수령 안내 공고 작성',
     '오늘 수령 가능한 상품 안내 카톡 텍스트 만들어줘',
     'Megaphone', 4);

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists store_members_seed_flows on store_members;
create trigger store_members_seed_flows
  after insert on store_members
  for each row execute function seed_default_saved_flows();

-- ==========================
-- 8. GRANT TO authenticated
-- ==========================
grant select, insert, update, delete on public.saved_flows      to authenticated;
grant select, insert, update, delete on public.audit_log        to authenticated;
grant select, insert, update, delete on public.phone_access_log to authenticated;

-- ========================================================================
-- 0004_constraints.sql
-- ========================================================================
-- 0004_constraints.sql
-- PIPA constraint + supersede + primary_image_url + archived_at
-- PRD §4.4 (products), §4.5 (orders), §4.8 (generated_assets), §6.2 (PIPA)
--
-- 0001-0003 적용 완료 가정.
-- 데이터 0 row 가정 (DB 미배포) → 모든 NOT NULL 즉시 강제 안전.

-- ==========================
-- 1. orders.customer_phone CHECK (length = 4) — PIPA §6.2.2
-- ==========================
-- 끝 4자리만 저장. NULL은 PIPA 보유기간 만료 / 삭제 요청 후 상태.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'orders_phone_length_4'
  ) then
    alter table orders
      add constraint orders_phone_length_4
      check (customer_phone is null or length(customer_phone) = 4);
  end if;
end $$;

-- ==========================
-- 2. orders.phone_consent_at NOT NULL — PIPA §6.2.1
-- ==========================
-- 동의 시각 기록 의무. orders는 dormant (A14) → 데이터 0 row 가정.
alter table orders
  add column if not exists phone_consent_at timestamptz;

alter table orders
  alter column phone_consent_at set not null;

-- ==========================
-- 3. products.primary_image_url + archived_at
-- ==========================
alter table products
  add column if not exists primary_image_url text;

alter table products
  add column if not exists archived_at timestamptz;

create index if not exists idx_products_active
  on products(store_id, flow_stage)
  where archived_at is null;

-- ==========================
-- 4. generated_assets.supersede 컬럼 + 활성 인덱스 (A10 — Idempotency)
-- ==========================
alter table generated_assets
  add column if not exists superseded_at timestamptz;

alter table generated_assets
  add column if not exists superseded_by uuid references generated_assets(id) on delete set null;

create index if not exists idx_assets_active
  on generated_assets(store_id, type)
  where superseded_at is null;

-- ========================================================================
-- 0005_action_free_text.sql
-- ========================================================================
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

-- ========================================================================
-- 0006_service_role_grants.sql
-- ========================================================================
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

-- ========================================================================
-- 0007_tool_list_recent_activity.sql
-- ========================================================================
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
