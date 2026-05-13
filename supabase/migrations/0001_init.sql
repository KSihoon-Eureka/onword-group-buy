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
