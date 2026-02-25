-- ============================================================
-- SplitHome – Módulo de Negocios
-- Ejecutar completo en Supabase SQL Editor
-- ============================================================

-- ──────────────────────────────────────────────────────────
-- 1. BUSINESSES
-- ──────────────────────────────────────────────────────────
create table if not exists public.businesses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  description text,
  color       text not null default '#F97316',
  created_at  timestamptz not null default now()
);

create index if not exists businesses_user_id_idx on public.businesses(user_id);

-- ──────────────────────────────────────────────────────────
-- 2. BUSINESS PRODUCTS (inventario)
-- ──────────────────────────────────────────────────────────
create table if not exists public.business_products (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  unit        text not null default 'unidad',   -- unidad, kg, litro, caja, etc.
  cost_price  numeric(12,2) not null default 0,
  sale_price  numeric(12,2) not null default 0,
  stock       numeric(12,2) not null default 0,
  min_stock   numeric(12,2) not null default 0, -- alerta stock bajo
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create index if not exists business_products_business_id_idx on public.business_products(business_id);
create index if not exists business_products_user_id_idx     on public.business_products(user_id);

-- ──────────────────────────────────────────────────────────
-- 3. BUSINESS TRANSACTIONS
-- ──────────────────────────────────────────────────────────
create table if not exists public.business_transactions (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  type        text not null check (type in ('venta','compra','gasto','ingreso')),
  total       numeric(12,2) not null check (total >= 0),
  description text,
  date        date not null default current_date,
  receipt_url text,
  notes       text,
  created_at  timestamptz not null default now()
);

create index if not exists business_transactions_business_id_idx on public.business_transactions(business_id);
create index if not exists business_transactions_date_idx        on public.business_transactions(date desc);

-- ──────────────────────────────────────────────────────────
-- 4. BUSINESS TX ITEMS  (productos en una venta/compra)
-- ──────────────────────────────────────────────────────────
create table if not exists public.business_tx_items (
  id             uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.business_transactions(id) on delete cascade,
  product_id     uuid not null references public.business_products(id) on delete cascade,
  quantity       numeric(12,2) not null check (quantity > 0),
  unit_price     numeric(12,2) not null,  -- precio al momento de la transacción
  subtotal       numeric(12,2) not null
);

create index if not exists business_tx_items_transaction_id_idx on public.business_tx_items(transaction_id);
create index if not exists business_tx_items_product_id_idx     on public.business_tx_items(product_id);

-- ──────────────────────────────────────────────────────────
-- 5. HABILITAR RLS
-- ──────────────────────────────────────────────────────────
alter table public.businesses             enable row level security;
alter table public.business_products      enable row level security;
alter table public.business_transactions  enable row level security;
alter table public.business_tx_items      enable row level security;

-- ──────────────────────────────────────────────────────────
-- 6. POLICIES – BUSINESSES
-- ──────────────────────────────────────────────────────────
create policy "businesses: select own"
  on public.businesses for select using (user_id = auth.uid());
create policy "businesses: insert own"
  on public.businesses for insert with check (user_id = auth.uid());
create policy "businesses: update own"
  on public.businesses for update using (user_id = auth.uid());
create policy "businesses: delete own"
  on public.businesses for delete using (user_id = auth.uid());

-- ──────────────────────────────────────────────────────────
-- 7. POLICIES – BUSINESS PRODUCTS
-- ──────────────────────────────────────────────────────────
create policy "business_products: select own"
  on public.business_products for select using (user_id = auth.uid());
create policy "business_products: insert own"
  on public.business_products for insert with check (user_id = auth.uid());
create policy "business_products: update own"
  on public.business_products for update using (user_id = auth.uid());
create policy "business_products: delete own"
  on public.business_products for delete using (user_id = auth.uid());

-- ──────────────────────────────────────────────────────────
-- 8. POLICIES – BUSINESS TRANSACTIONS
-- ──────────────────────────────────────────────────────────
create policy "business_transactions: select own"
  on public.business_transactions for select using (user_id = auth.uid());
create policy "business_transactions: insert own"
  on public.business_transactions for insert with check (user_id = auth.uid());
create policy "business_transactions: update own"
  on public.business_transactions for update using (user_id = auth.uid());
create policy "business_transactions: delete own"
  on public.business_transactions for delete using (user_id = auth.uid());

-- ──────────────────────────────────────────────────────────
-- 9. POLICIES – BUSINESS TX ITEMS
--    Acceso via el dueño del negocio usando la transacción
-- ──────────────────────────────────────────────────────────
create policy "business_tx_items: select own"
  on public.business_tx_items for select
  using (
    exists (
      select 1 from public.business_transactions bt
      where bt.id = transaction_id and bt.user_id = auth.uid()
    )
  );
create policy "business_tx_items: insert own"
  on public.business_tx_items for insert
  with check (
    exists (
      select 1 from public.business_transactions bt
      where bt.id = transaction_id and bt.user_id = auth.uid()
    )
  );
create policy "business_tx_items: delete own"
  on public.business_tx_items for delete
  using (
    exists (
      select 1 from public.business_transactions bt
      where bt.id = transaction_id and bt.user_id = auth.uid()
    )
  );
