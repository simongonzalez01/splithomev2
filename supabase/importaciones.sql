-- ═══════════════════════════════════════════════════════════════════
-- MÓDULO DE IMPORTACIONES
-- ═══════════════════════════════════════════════════════════════════

-- 1. Pedidos de importación
create table if not exists import_orders (
  id               uuid primary key default gen_random_uuid(),
  business_id      uuid not null references businesses(id) on delete cascade,
  title            text not null,
  supplier_name    text,
  proforma_url     text,
  proforma_name    text,
  status           text not null default 'proforma',
  -- Etapas: proforma | aprobada | deposito | produccion | pago_final
  --         enviado_agente | en_transito | recibido | verificando | cerrado
  supplier_total   numeric(14,2),
  freight_total    numeric(14,2),
  currency         text not null default 'USD',
  production_eta   date,
  arrival_eta      date,
  notes            text,
  created_by       uuid references auth.users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- 2. Pagos (al proveedor o al agente de carga)
create table if not exists import_payments (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references import_orders(id) on delete cascade,
  recipient     text not null check (recipient in ('supplier', 'freight')),
  amount        numeric(14,2) not null,
  currency      text not null default 'USD',
  paid_at       date not null default current_date,
  receipt_url   text,
  receipt_name  text,
  notes         text,
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now()
);

-- 3. Líneas de producto del pedido
create table if not exists import_order_items (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references import_orders(id) on delete cascade,
  description  text not null,
  qty_ordered  integer not null default 0,
  qty_received integer,
  unit_price   numeric(14,2),
  condition    text check (condition in ('ok', 'damaged', 'missing')),
  notes        text,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now()
);

-- 4. Historial de etapas (timeline)
create table if not exists import_events (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references import_orders(id) on delete cascade,
  stage       text not null,
  note        text,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now()
);

-- 5. Verificación de carga recibida
create table if not exists import_verification (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null unique references import_orders(id) on delete cascade,
  boxes_expected  integer,
  boxes_received  integer,
  photo_urls      text[] default '{}',
  result          text check (result in ('ok', 'discrepancy')),
  notes           text,
  verified_by     uuid references auth.users(id),
  verified_at     timestamptz
);

-- Índices
create index if not exists import_orders_business_id_idx  on import_orders(business_id);
create index if not exists import_payments_order_id_idx   on import_payments(order_id);
create index if not exists import_items_order_id_idx      on import_order_items(order_id);
create index if not exists import_events_order_id_idx     on import_events(order_id);

-- ── RLS ─────────────────────────────────────────────────────────────
alter table import_orders       enable row level security;
alter table import_payments     enable row level security;
alter table import_order_items  enable row level security;
alter table import_events       enable row level security;
alter table import_verification enable row level security;

-- Función helper: verifica si el usuario actual es miembro del negocio
create or replace function is_import_biz_member(biz_id uuid)
returns boolean
language sql security definer stable
as $$
  select exists (
    select 1 from businesses    where id = biz_id and user_id = auth.uid()
    union all
    select 1 from business_members where business_id = biz_id and user_id = auth.uid()
  );
$$;

-- ── Políticas (drop primero para evitar errores si ya existen) ───────
drop policy if exists "imp_orders_select"   on import_orders;
drop policy if exists "imp_orders_insert"   on import_orders;
drop policy if exists "imp_orders_update"   on import_orders;
drop policy if exists "imp_orders_delete"   on import_orders;

drop policy if exists "imp_payments_select" on import_payments;
drop policy if exists "imp_payments_insert" on import_payments;
drop policy if exists "imp_payments_delete" on import_payments;

drop policy if exists "imp_items_all"       on import_order_items;

drop policy if exists "imp_events_select"   on import_events;
drop policy if exists "imp_events_insert"   on import_events;

drop policy if exists "imp_verification_all" on import_verification;

-- Políticas: import_orders
create policy "imp_orders_select" on import_orders
  for select using (is_import_biz_member(business_id));

create policy "imp_orders_insert" on import_orders
  for insert with check (is_import_biz_member(business_id));

create policy "imp_orders_update" on import_orders
  for update using (is_import_biz_member(business_id));

create policy "imp_orders_delete" on import_orders
  for delete using (is_import_biz_member(business_id));

-- Políticas: import_payments
create policy "imp_payments_select" on import_payments
  for select using (
    exists (select 1 from import_orders o
            where o.id = order_id and is_import_biz_member(o.business_id))
  );

create policy "imp_payments_insert" on import_payments
  for insert with check (
    exists (select 1 from import_orders o
            where o.id = order_id and is_import_biz_member(o.business_id))
  );

create policy "imp_payments_delete" on import_payments
  for delete using (
    exists (select 1 from import_orders o
            where o.id = order_id and is_import_biz_member(o.business_id))
  );

-- Políticas: import_order_items
create policy "imp_items_all" on import_order_items
  for all using (
    exists (select 1 from import_orders o
            where o.id = order_id and is_import_biz_member(o.business_id))
  );

-- Políticas: import_events
create policy "imp_events_select" on import_events
  for select using (
    exists (select 1 from import_orders o
            where o.id = order_id and is_import_biz_member(o.business_id))
  );

create policy "imp_events_insert" on import_events
  for insert with check (
    exists (select 1 from import_orders o
            where o.id = order_id and is_import_biz_member(o.business_id))
  );

-- Políticas: import_verification
create policy "imp_verification_all" on import_verification
  for all using (
    exists (select 1 from import_orders o
            where o.id = order_id and is_import_biz_member(o.business_id))
  );
