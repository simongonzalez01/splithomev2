-- ============================================================
-- SplitHome – Módulo Personal (Ahorros)
-- Ejecutar completo en Supabase SQL Editor
-- ============================================================

-- ──────────────────────────────────────────────────────────
-- 1. SAVINGS ACCOUNTS
-- ──────────────────────────────────────────────────────────
create table if not exists public.savings_accounts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  name            text not null,
  type            text not null default 'savings'
                  check (type in ('savings', 'person')),
  initial_balance numeric(12,2) not null default 0,
  color           text not null default '#3B82F6',
  person_name     text,          -- solo cuando type = 'person'
  is_archived     boolean not null default false,
  created_at      timestamptz not null default now()
);

create index if not exists savings_accounts_user_id_idx on public.savings_accounts(user_id);

-- ──────────────────────────────────────────────────────────
-- 2. SAVINGS CATEGORIES  (defaults globales + propias por usuario)
-- ──────────────────────────────────────────────────────────
create table if not exists public.savings_categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete cascade,
  name       text not null,
  type       text not null check (type in ('income', 'expense', 'both')),
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists savings_categories_user_id_idx on public.savings_categories(user_id);

-- ──────────────────────────────────────────────────────────
-- 3. SAVINGS TRANSACTIONS
-- ──────────────────────────────────────────────────────────
create table if not exists public.savings_transactions (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.savings_accounts(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  type        text not null check (type in ('ingreso', 'gasto')),
  amount      numeric(12,2) not null check (amount > 0),
  category    text,
  description text not null,
  date        date not null default current_date,
  receipt_url text,   -- ruta en Supabase Storage (no la URL completa)
  notes       text,
  created_at  timestamptz not null default now()
);

create index if not exists savings_transactions_account_id_idx on public.savings_transactions(account_id);
create index if not exists savings_transactions_user_id_idx    on public.savings_transactions(user_id);
create index if not exists savings_transactions_date_idx       on public.savings_transactions(date desc);

-- ──────────────────────────────────────────────────────────
-- 4. HABILITAR RLS
-- ──────────────────────────────────────────────────────────
alter table public.savings_accounts     enable row level security;
alter table public.savings_categories   enable row level security;
alter table public.savings_transactions enable row level security;

-- ──────────────────────────────────────────────────────────
-- 5. POLICIES – SAVINGS ACCOUNTS (solo el dueño)
-- ──────────────────────────────────────────────────────────
create policy "savings_accounts: select own"
  on public.savings_accounts for select
  using (user_id = auth.uid());

create policy "savings_accounts: insert own"
  on public.savings_accounts for insert
  with check (user_id = auth.uid());

create policy "savings_accounts: update own"
  on public.savings_accounts for update
  using (user_id = auth.uid());

create policy "savings_accounts: delete own"
  on public.savings_accounts for delete
  using (user_id = auth.uid());

-- ──────────────────────────────────────────────────────────
-- 6. POLICIES – SAVINGS CATEGORIES
--    Puede ver las default (user_id IS NULL) y las propias
-- ──────────────────────────────────────────────────────────
create policy "savings_categories: select"
  on public.savings_categories for select
  using (user_id is null or user_id = auth.uid());

create policy "savings_categories: insert own"
  on public.savings_categories for insert
  with check (user_id = auth.uid());

create policy "savings_categories: update own"
  on public.savings_categories for update
  using (user_id = auth.uid());

create policy "savings_categories: delete own"
  on public.savings_categories for delete
  using (user_id = auth.uid());

-- ──────────────────────────────────────────────────────────
-- 7. POLICIES – SAVINGS TRANSACTIONS (solo el dueño)
-- ──────────────────────────────────────────────────────────
create policy "savings_transactions: select own"
  on public.savings_transactions for select
  using (user_id = auth.uid());

create policy "savings_transactions: insert own"
  on public.savings_transactions for insert
  with check (user_id = auth.uid());

create policy "savings_transactions: update own"
  on public.savings_transactions for update
  using (user_id = auth.uid());

create policy "savings_transactions: delete own"
  on public.savings_transactions for delete
  using (user_id = auth.uid());

-- ──────────────────────────────────────────────────────────
-- 8. CATEGORÍAS PREDETERMINADAS
-- ──────────────────────────────────────────────────────────
insert into public.savings_categories (name, type, is_default) values
  -- Ingresos
  ('Salario',           'income',  true),
  ('Freelance',         'income',  true),
  ('Inversión',         'income',  true),
  ('Regalo recibido',   'income',  true),
  ('Venta',             'income',  true),
  ('Devolución',        'income',  true),
  ('Transferencia',     'income',  true),
  ('Otros ingresos',    'income',  true),
  -- Gastos
  ('Alimentación',      'expense', true),
  ('Transporte',        'expense', true),
  ('Salud',             'expense', true),
  ('Entretenimiento',   'expense', true),
  ('Ropa',              'expense', true),
  ('Servicios',         'expense', true),
  ('Educación',         'expense', true),
  ('Hogar',             'expense', true),
  ('Suscripciones',     'expense', true),
  ('Deuda / Préstamo',  'expense', true),
  ('Transferencia',     'expense', true),
  ('Otros gastos',      'expense', true);

-- ──────────────────────────────────────────────────────────
-- 9. STORAGE BUCKET "receipts"  (privado)
-- ──────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'receipts',
  'receipts',
  false,
  5242880,   -- 5 MB máx por archivo
  array['image/jpeg','image/png','image/webp','image/heic','image/heif']
)
on conflict (id) do nothing;

-- Política: solo el dueño accede a sus archivos (carpeta = user_id)
create policy "receipts: owner select"
  on storage.objects for select
  using (bucket_id = 'receipts' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "receipts: owner insert"
  on storage.objects for insert
  with check (bucket_id = 'receipts' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "receipts: owner delete"
  on storage.objects for delete
  using (bucket_id = 'receipts' and auth.uid()::text = (storage.foldername(name))[1]);
