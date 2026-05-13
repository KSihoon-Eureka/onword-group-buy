# Data Model

> 모든 Agent tool, API route, UI 컴포넌트는 이 스키마를 기준으로 동작.

---

## 테이블 일람

```
products            ← 상품 (관리자가 등록)
orders              ← 고객 주문
agent_traces        ← AI 에이전트 실행 세션
trace_steps         ← 각 tool 호출 단계
generated_assets    ← AI 생성 자산 (텍스트/이미지)
```

---

## products

상품 정보. Step 1에서 관리자가 입력.

```sql
create table products (
  id uuid primary key default gen_random_uuid(),
  
  -- 기본 정보
  name text not null,
  description text,
  category text,                  -- '식품' | '생활용품' | '뷰티' | ...
  
  -- 가격
  price integer not null,         -- 판매가 (원, 정수)
  compare_price integer,          -- 시중가 (원, 정수)
  
  -- 수량
  stock_quantity integer not null,
  ordered_quantity integer default 0,  -- 현재까지 주문된 수량
  
  -- 일정
  expiry_date date,               -- 소비기한
  order_deadline timestamptz,     -- 주문 마감일시
  pickup_date date,               -- 입고/픽업 가능 시작일
  pickup_deadline date,           -- 수령 마감일 (지나면 자동 취소)
  
  -- 상태
  flow_stage text default 'product_registered',
  -- 'product_registered' | 'announcement_1' | 'order_open' | 'order_closed' 
  -- | 'stock_confirmed' | 'warehouse_notified' | 'arrived' | 'pickup_ready' | 'completed'
  
  status text default 'active',
  -- 'active' | 'closed' | 'cancelled'
  
  -- 메타
  urgency_banner text,            -- "할인율/기간한정" 같은 배너
  source_image_urls text[],       -- 관리자 업로드 원본 이미지 URL 배열
  
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_products_flow_stage on products(flow_stage);
create index idx_products_status on products(status);
create index idx_products_pickup_date on products(pickup_date);
```

---

## orders

고객 주문. Step 5에서 주문 웹으로 들어옴.

```sql
create table orders (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) not null,
  
  -- 고객 정보
  customer_name text not null,
  customer_phone text,            -- "010-XXXX-XXXX" 또는 마지막 4자리
  
  -- 주문
  quantity integer not null check (quantity > 0),
  total_price integer not null,
  
  -- 상태
  status text default 'pending',
  -- 'pending' | 'confirmed' | 'picked_up' | 'cancelled' | 'no_show'
  
  -- 메타
  anomaly_detected boolean default false,  -- 누락/이상 감지 (Step 7)
  anomaly_reason text,
  notes text,                              -- 카운터 메모
  
  picked_up_at timestamptz,
  created_at timestamptz default now()
);

create index idx_orders_product_id on orders(product_id);
create index idx_orders_customer_phone on orders(customer_phone);
create index idx_orders_status on orders(status);
```

---

## agent_traces

AI 에이전트 실행 세션. Action 단위로 1개 trace.

```sql
create table agent_traces (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id),
  
  action text not null,
  -- 'start_campaign' | 'close_orders' | 'notify_warehouse' | 'announce_pickup'
  
  status text default 'running',
  -- 'running' | 'completed' | 'failed' | 'cancelled'
  
  -- 결과
  summary text,                   -- AI가 작성한 한 줄 요약
  error_message text,
  
  started_at timestamptz default now(),
  completed_at timestamptz
);

create index idx_traces_product_id on agent_traces(product_id);
create index idx_traces_status on agent_traces(status);
```

---

## trace_steps

각 tool 호출 단위. Execution Trace 패널에 표시되는 항목.

```sql
create table trace_steps (
  id uuid primary key default gen_random_uuid(),
  trace_id uuid references agent_traces(id) not null,
  
  step_order integer not null,    -- 1, 2, 3... (시간 순서)
  
  tool_name text not null,
  -- 'generate_announcement' | 'crawl_naver_price' | 'compose_poster' | ...
  
  status text default 'pending',
  -- 'pending' | 'running' | 'done' | 'error'
  
  -- I/O (디버깅용)
  input jsonb,
  output jsonb,
  
  -- UI 표시용
  summary text,                   -- "공고 텍스트 생성 완료 (572자)"
  
  started_at timestamptz default now(),
  completed_at timestamptz,
  duration_ms integer
);

create index idx_steps_trace_id on trace_steps(trace_id);
```

---

## generated_assets

AI가 만들어낸 모든 자산 (재사용 가능).

```sql
create table generated_assets (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id),
  trace_step_id uuid references trace_steps(id),
  
  type text not null,
  -- 'announcement' | 'poster' | 'pickup_table' | 'price_compare' | 'wholesale_email'
  
  stage text,                     -- workflow stage가 무엇이었나
  
  -- 콘텐츠
  content text,                   -- 텍스트 자산
  asset_url text,                 -- 이미지/파일 URL (Supabase Storage)
  metadata jsonb,                 -- 추가 데이터 (예: 네이버 가격 배열)
  
  -- 사용 상태
  copied_at timestamptz,          -- 관리자가 복사한 시점
  used_at timestamptz,            -- 실제 사용된 시점 (있다면)
  
  created_at timestamptz default now()
);

create index idx_assets_product_id on generated_assets(product_id);
create index idx_assets_type on generated_assets(type);
```

---

## TypeScript Type Mapping

`packages/types/index.ts`에 *대응되는 타입 반드시 정의*:

```typescript
export type FlowStage = 
  | 'product_registered'
  | 'announcement_1'
  | 'order_open'
  | 'order_closed'
  | 'stock_confirmed'
  | 'warehouse_notified'
  | 'arrived'
  | 'pickup_ready'
  | 'completed'

export type ProductStatus = 'active' | 'closed' | 'cancelled'
export type OrderStatus = 'pending' | 'confirmed' | 'picked_up' | 'cancelled' | 'no_show'
export type TraceStatus = 'running' | 'completed' | 'failed' | 'cancelled'
export type StepStatus = 'pending' | 'running' | 'done' | 'error'
export type AssetType = 
  | 'announcement' 
  | 'poster' 
  | 'pickup_table' 
  | 'price_compare' 
  | 'wholesale_email'

export type ToolName =
  | 'generate_announcement'
  | 'crawl_naver_price'
  | 'compose_poster'
  | 'generate_pickup_table'
  | 'get_orders'
  | 'notify_wholesaler'
  | 'send_kakao_message'  // 향후 (이번엔 텍스트만)
  // ...
```

---

## Realtime 채널

Supabase Realtime으로 대시보드가 구독해야 할 채널:

```typescript
// 한 trace의 진행 상황을 실시간으로
supabase
  .channel(`trace:${traceId}`)
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'trace_steps',
    filter: `trace_id=eq.${traceId}`
  }, ...)
  .subscribe()

// 새 주문이 들어올 때
supabase
  .channel('new-orders')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'orders'
  }, ...)
  .subscribe()
```

---

## RLS (Row Level Security) — 추후

이번 스프린트엔 단일 매장만 — 모든 row 모든 사용자 가능.
다음 스프린트에 multi-tenant 추가 시 RLS 정책 필요.
