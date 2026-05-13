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
