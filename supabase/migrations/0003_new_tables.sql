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
