-- ─────────────────────────────────────────────────────────────────────────────
-- Tarjetas de crédito + Recordatorios personales
-- Ejecutar en Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Tarjetas de crédito (vinculadas a una savings_account)
create table if not exists public.savings_credit_cards (
  id                  uuid        primary key default gen_random_uuid(),
  account_id          uuid        not null references public.savings_accounts(id) on delete cascade,
  user_id             uuid        not null references auth.users(id) on delete cascade,
  name                text        not null,                      -- ej: "Visa Platino"
  last_four           text        check (length(last_four) = 4), -- últimos 4 dígitos (opcional)
  credit_limit        numeric(12,2) not null default 0,
  initial_balance     numeric(12,2) not null default 0,          -- saldo adeudado al inicio
  billing_cycle_day   int         check (billing_cycle_day between 1 and 31), -- día de corte
  due_day             int         check (due_day between 1 and 31),           -- día de pago
  color               text        not null default '#6366F1',
  is_active           boolean     not null default true,
  created_at          timestamptz not null default now()
);

alter table public.savings_credit_cards enable row level security;

create policy "owner select cards"
  on public.savings_credit_cards for select using (auth.uid() = user_id);
create policy "owner insert cards"
  on public.savings_credit_cards for insert with check (auth.uid() = user_id);
create policy "owner update cards"
  on public.savings_credit_cards for update using (auth.uid() = user_id);
create policy "owner delete cards"
  on public.savings_credit_cards for delete using (auth.uid() = user_id);


-- 2. Transacciones de tarjeta de crédito (cargo / pago)
create table if not exists public.savings_credit_card_transactions (
  id          uuid          primary key default gen_random_uuid(),
  card_id     uuid          not null references public.savings_credit_cards(id) on delete cascade,
  user_id     uuid          not null references auth.users(id) on delete cascade,
  type        text          not null check (type in ('cargo', 'pago')),
  amount      numeric(12,2) not null check (amount > 0),
  description text,
  category    text,
  date        date          not null default current_date,
  receipt_url text,
  notes       text,
  created_at  timestamptz   not null default now()
);

alter table public.savings_credit_card_transactions enable row level security;

create policy "owner select card_txs"
  on public.savings_credit_card_transactions for select using (auth.uid() = user_id);
create policy "owner insert card_txs"
  on public.savings_credit_card_transactions for insert with check (auth.uid() = user_id);
create policy "owner update card_txs"
  on public.savings_credit_card_transactions for update using (auth.uid() = user_id);
create policy "owner delete card_txs"
  on public.savings_credit_card_transactions for delete using (auth.uid() = user_id);


-- 3. Recordatorios de pagos recurrentes
create table if not exists public.personal_reminders (
  id          uuid          primary key default gen_random_uuid(),
  user_id     uuid          not null references auth.users(id) on delete cascade,
  title       text          not null,                -- ej: "Cuota del carro"
  amount      numeric(12,2),                         -- monto esperado (opcional)
  type        text          not null default 'recurrente'
                            check (type in ('tarjeta', 'recurrente')),
  account_id  uuid          references public.savings_accounts(id) on delete set null,
  card_id     uuid          references public.savings_credit_cards(id) on delete cascade,
  due_day     int           not null check (due_day between 1 and 31),
  notes       text,
  color       text          not null default '#F59E0B',
  is_active   boolean       not null default true,
  created_at  timestamptz   not null default now()
);

alter table public.personal_reminders enable row level security;

create policy "owner select reminders"
  on public.personal_reminders for select using (auth.uid() = user_id);
create policy "owner insert reminders"
  on public.personal_reminders for insert with check (auth.uid() = user_id);
create policy "owner update reminders"
  on public.personal_reminders for update using (auth.uid() = user_id);
create policy "owner delete reminders"
  on public.personal_reminders for delete using (auth.uid() = user_id);
