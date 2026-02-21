-- ============================================================
-- SplitHome 2.0 — Upgrade SQL
-- Run in Supabase SQL Editor AFTER supabase_setup.sql
-- ============================================================

-- ──────────────────────────────────────────────────────────
-- 1. Add `note` column to existing expenses table
-- ──────────────────────────────────────────────────────────
alter table public.expenses add column if not exists note text;

-- ──────────────────────────────────────────────────────────
-- 2. BUDGETS
-- ──────────────────────────────────────────────────────────
create table if not exists public.budgets (
  id         uuid primary key default gen_random_uuid(),
  family_id  uuid not null references public.families(id) on delete cascade,
  category   text not null,
  month      date not null,           -- always first day of month
  amount     numeric(10,2) not null check (amount >= 0),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint budgets_family_category_month_key unique (family_id, category, month)
);
create index if not exists budgets_family_month_idx on public.budgets(family_id, month);

-- ──────────────────────────────────────────────────────────
-- 3. FIXED EXPENSES (templates)
-- ──────────────────────────────────────────────────────────
create table if not exists public.fixed_expenses (
  id                 uuid primary key default gen_random_uuid(),
  family_id          uuid not null references public.families(id) on delete cascade,
  name               text not null,
  amount             numeric(10,2) not null check (amount >= 0),
  category           text not null,
  due_day            int  not null check (due_day between 1 and 31),
  default_paid_by    uuid references auth.users(id) on delete set null,
  is_active          boolean not null default true,
  created_by         uuid not null references auth.users(id) on delete cascade,
  created_at         timestamptz not null default now()
);
create index if not exists fixed_expenses_family_idx on public.fixed_expenses(family_id);

-- ──────────────────────────────────────────────────────────
-- 4. FIXED EXPENSE PAYMENTS (one per month per template)
-- ──────────────────────────────────────────────────────────
create table if not exists public.fixed_expense_payments (
  id               uuid primary key default gen_random_uuid(),
  fixed_expense_id uuid not null references public.fixed_expenses(id) on delete cascade,
  family_id        uuid not null references public.families(id) on delete cascade,
  month            date not null,     -- first day of month
  expense_id       uuid references public.expenses(id) on delete set null,
  created_by       uuid not null references auth.users(id) on delete cascade,
  created_at       timestamptz not null default now(),
  constraint fixed_expense_payments_unique_month unique (fixed_expense_id, month)
);
create index if not exists fixed_payments_family_month_idx
  on public.fixed_expense_payments(family_id, month);

-- ──────────────────────────────────────────────────────────
-- 5. SETTLEMENTS (manual payments between members)
-- ──────────────────────────────────────────────────────────
create table if not exists public.settlements (
  id         uuid primary key default gen_random_uuid(),
  family_id  uuid not null references public.families(id) on delete cascade,
  from_user  uuid not null references auth.users(id) on delete cascade,
  to_user    uuid not null references auth.users(id) on delete cascade,
  amount     numeric(10,2) not null check (amount > 0),
  date       date not null,
  note       text,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists settlements_family_date_idx on public.settlements(family_id, date);

-- ──────────────────────────────────────────────────────────
-- 6. MONTHLY SNAPSHOTS (closed months)
-- ──────────────────────────────────────────────────────────
create table if not exists public.monthly_snapshots (
  id           uuid primary key default gen_random_uuid(),
  family_id    uuid not null references public.families(id) on delete cascade,
  month        date not null,         -- first day of month
  total_spent  numeric(10,2) not null,
  summary      jsonb not null default '{}',
  created_by   uuid not null references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  constraint monthly_snapshots_unique_month unique (family_id, month)
);
create index if not exists snapshots_family_idx on public.monthly_snapshots(family_id);

-- ──────────────────────────────────────────────────────────
-- 7. ENABLE RLS ON NEW TABLES
-- ──────────────────────────────────────────────────────────
alter table public.budgets                  enable row level security;
alter table public.fixed_expenses           enable row level security;
alter table public.fixed_expense_payments   enable row level security;
alter table public.settlements              enable row level security;
alter table public.monthly_snapshots        enable row level security;

-- ──────────────────────────────────────────────────────────
-- 8. RLS — BUDGETS
-- ──────────────────────────────────────────────────────────
drop policy if exists "budgets: select family"  on public.budgets;
drop policy if exists "budgets: insert family"  on public.budgets;
drop policy if exists "budgets: update family"  on public.budgets;
drop policy if exists "budgets: delete family"  on public.budgets;

create policy "budgets: select family"
  on public.budgets for select
  using (family_id = public.my_family_id());

create policy "budgets: insert family"
  on public.budgets for insert
  with check (family_id = public.my_family_id() and created_by = auth.uid());

create policy "budgets: update family"
  on public.budgets for update
  using (family_id = public.my_family_id());

create policy "budgets: delete family"
  on public.budgets for delete
  using (family_id = public.my_family_id());

-- ──────────────────────────────────────────────────────────
-- 9. RLS — FIXED EXPENSES
-- ──────────────────────────────────────────────────────────
drop policy if exists "fixed_expenses: select family"  on public.fixed_expenses;
drop policy if exists "fixed_expenses: insert family"  on public.fixed_expenses;
drop policy if exists "fixed_expenses: update creator" on public.fixed_expenses;
drop policy if exists "fixed_expenses: delete creator" on public.fixed_expenses;

create policy "fixed_expenses: select family"
  on public.fixed_expenses for select
  using (family_id = public.my_family_id());

create policy "fixed_expenses: insert family"
  on public.fixed_expenses for insert
  with check (family_id = public.my_family_id() and created_by = auth.uid());

create policy "fixed_expenses: update creator"
  on public.fixed_expenses for update
  using (created_by = auth.uid() and family_id = public.my_family_id());

create policy "fixed_expenses: delete creator"
  on public.fixed_expenses for delete
  using (created_by = auth.uid() and family_id = public.my_family_id());

-- ──────────────────────────────────────────────────────────
-- 10. RLS — FIXED EXPENSE PAYMENTS
-- ──────────────────────────────────────────────────────────
drop policy if exists "fixed_payments: select family"  on public.fixed_expense_payments;
drop policy if exists "fixed_payments: insert family"  on public.fixed_expense_payments;
drop policy if exists "fixed_payments: delete creator" on public.fixed_expense_payments;

create policy "fixed_payments: select family"
  on public.fixed_expense_payments for select
  using (family_id = public.my_family_id());

create policy "fixed_payments: insert family"
  on public.fixed_expense_payments for insert
  with check (family_id = public.my_family_id() and created_by = auth.uid());

create policy "fixed_payments: delete creator"
  on public.fixed_expense_payments for delete
  using (created_by = auth.uid() and family_id = public.my_family_id());

-- ──────────────────────────────────────────────────────────
-- 11. RLS — SETTLEMENTS
-- ──────────────────────────────────────────────────────────
drop policy if exists "settlements: select family"  on public.settlements;
drop policy if exists "settlements: insert family"  on public.settlements;
drop policy if exists "settlements: delete creator" on public.settlements;

create policy "settlements: select family"
  on public.settlements for select
  using (family_id = public.my_family_id());

create policy "settlements: insert family"
  on public.settlements for insert
  with check (family_id = public.my_family_id() and created_by = auth.uid());

create policy "settlements: delete creator"
  on public.settlements for delete
  using (created_by = auth.uid() and family_id = public.my_family_id());

-- ──────────────────────────────────────────────────────────
-- 12. RLS — MONTHLY SNAPSHOTS
-- ──────────────────────────────────────────────────────────
drop policy if exists "snapshots: select family"  on public.monthly_snapshots;
drop policy if exists "snapshots: insert family"  on public.monthly_snapshots;

create policy "snapshots: select family"
  on public.monthly_snapshots for select
  using (family_id = public.my_family_id());

create policy "snapshots: insert family"
  on public.monthly_snapshots for insert
  with check (family_id = public.my_family_id() and created_by = auth.uid());
