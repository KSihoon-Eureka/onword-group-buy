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
