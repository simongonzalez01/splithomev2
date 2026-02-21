-- ============================================================
-- SplitHome – Supabase Setup SQL
-- Run this entire file in the Supabase SQL Editor (one shot).
-- ============================================================

-- ──────────────────────────────────────────────────────────
-- 1. PROFILES
--    One row per auth user; stores display_name + family_id
-- ──────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null unique references auth.users(id) on delete cascade,
  display_name text,
  family_id    uuid,                  -- FK added after families table
  created_at   timestamptz not null default now()
);

create index if not exists profiles_family_id_idx on public.profiles(family_id);
create index if not exists profiles_user_id_idx   on public.profiles(user_id);

-- ──────────────────────────────────────────────────────────
-- 2. FAMILIES
-- ──────────────────────────────────────────────────────────
create table if not exists public.families (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  code       char(6) not null unique,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists families_code_idx on public.families(code);

-- Now add the FK from profiles → families
alter table public.profiles
  add constraint profiles_family_id_fk
  foreign key (family_id) references public.families(id) on delete set null;

-- ──────────────────────────────────────────────────────────
-- 3. EXPENSES
-- ──────────────────────────────────────────────────────────
create table if not exists public.expenses (
  id         uuid primary key default gen_random_uuid(),
  family_id  uuid not null references public.families(id) on delete cascade,
  title      text not null,
  amount     numeric(10,2) not null check (amount > 0),
  date       date not null,
  category   text not null default 'General',
  paid_by    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists expenses_family_id_idx on public.expenses(family_id);
create index if not exists expenses_paid_by_idx   on public.expenses(paid_by);

-- Auto-update updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger expenses_updated_at
  before update on public.expenses
  for each row execute function public.set_updated_at();

-- ──────────────────────────────────────────────────────────
-- 4. EXPENSE NOTES
-- ──────────────────────────────────────────────────────────
create table if not exists public.expense_notes (
  id         uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses(id) on delete cascade,
  family_id  uuid not null references public.families(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  content    text not null,
  created_at timestamptz not null default now()
);

create index if not exists expense_notes_expense_id_idx on public.expense_notes(expense_id);
create index if not exists expense_notes_family_id_idx  on public.expense_notes(family_id);

-- ──────────────────────────────────────────────────────────
-- 5. SHOPPING ITEMS
-- ──────────────────────────────────────────────────────────
create table if not exists public.shopping_items (
  id         uuid primary key default gen_random_uuid(),
  family_id  uuid not null references public.families(id) on delete cascade,
  name       text not null,
  qty        text,
  note       text,
  bought     boolean not null default false,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists shopping_items_family_id_idx on public.shopping_items(family_id);

-- ──────────────────────────────────────────────────────────
-- 6. EVENTS
-- ──────────────────────────────────────────────────────────
create table if not exists public.events (
  id         uuid primary key default gen_random_uuid(),
  family_id  uuid not null references public.families(id) on delete cascade,
  title      text not null,
  date       date not null,
  note       text,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists events_family_id_idx on public.events(family_id);

create trigger events_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();

-- ──────────────────────────────────────────────────────────
-- 7. ENABLE ROW LEVEL SECURITY
-- ──────────────────────────────────────────────────────────
alter table public.profiles       enable row level security;
alter table public.families       enable row level security;
alter table public.expenses       enable row level security;
alter table public.expense_notes  enable row level security;
alter table public.shopping_items enable row level security;
alter table public.events         enable row level security;

-- ──────────────────────────────────────────────────────────
-- 8. HELPER: current user's family_id
-- ──────────────────────────────────────────────────────────
create or replace function public.my_family_id()
returns uuid language sql security definer stable as $$
  select family_id from public.profiles where user_id = auth.uid() limit 1;
$$;

-- ──────────────────────────────────────────────────────────
-- 9. RLS POLICIES – PROFILES
-- ──────────────────────────────────────────────────────────
-- Users can see their own profile and all profiles in the same family
create policy "profiles: select own and family"
  on public.profiles for select
  using (
    user_id = auth.uid()
    or family_id = public.my_family_id()
  );

create policy "profiles: insert own"
  on public.profiles for insert
  with check (user_id = auth.uid());

create policy "profiles: update own"
  on public.profiles for update
  using (user_id = auth.uid());

-- ──────────────────────────────────────────────────────────
-- 10. RLS POLICIES – FAMILIES
-- ──────────────────────────────────────────────────────────
-- Anyone can read a family to validate a join code (needed for join flow)
-- We restrict to the family the user belongs to OR the user created it
create policy "families: select own family"
  on public.families for select
  using (id = public.my_family_id() or created_by = auth.uid());

-- Allow reading a family by code for joining (unrestricted select on code lookup)
-- We handle this via a server-side function / anon approach instead.
-- Actually to allow join-by-code we need to allow select for all authenticated users:
drop policy if exists "families: select own family" on public.families;

create policy "families: select for authenticated"
  on public.families for select
  to authenticated
  using (true);

create policy "families: insert by creator"
  on public.families for insert
  with check (created_by = auth.uid());

create policy "families: update by creator"
  on public.families for update
  using (created_by = auth.uid());

-- ──────────────────────────────────────────────────────────
-- 11. RLS POLICIES – EXPENSES
-- ──────────────────────────────────────────────────────────
create policy "expenses: select family"
  on public.expenses for select
  using (family_id = public.my_family_id());

create policy "expenses: insert family member"
  on public.expenses for insert
  with check (
    family_id = public.my_family_id()
    and paid_by = auth.uid()
  );

create policy "expenses: update own"
  on public.expenses for update
  using (paid_by = auth.uid() and family_id = public.my_family_id());

create policy "expenses: delete own"
  on public.expenses for delete
  using (paid_by = auth.uid() and family_id = public.my_family_id());

-- ──────────────────────────────────────────────────────────
-- 12. RLS POLICIES – EXPENSE NOTES
-- ──────────────────────────────────────────────────────────
create policy "expense_notes: select family"
  on public.expense_notes for select
  using (family_id = public.my_family_id());

create policy "expense_notes: insert family member"
  on public.expense_notes for insert
  with check (
    family_id = public.my_family_id()
    and user_id = auth.uid()
  );

create policy "expense_notes: delete own"
  on public.expense_notes for delete
  using (user_id = auth.uid() and family_id = public.my_family_id());

-- ──────────────────────────────────────────────────────────
-- 13. RLS POLICIES – SHOPPING ITEMS
-- ──────────────────────────────────────────────────────────
create policy "shopping_items: select family"
  on public.shopping_items for select
  using (family_id = public.my_family_id());

create policy "shopping_items: insert family member"
  on public.shopping_items for insert
  with check (
    family_id = public.my_family_id()
    and created_by = auth.uid()
  );

-- Any family member can toggle bought
create policy "shopping_items: update family"
  on public.shopping_items for update
  using (family_id = public.my_family_id());

create policy "shopping_items: delete own"
  on public.shopping_items for delete
  using (created_by = auth.uid() and family_id = public.my_family_id());

-- ──────────────────────────────────────────────────────────
-- 14. RLS POLICIES – EVENTS
-- ──────────────────────────────────────────────────────────
create policy "events: select family"
  on public.events for select
  using (family_id = public.my_family_id());

create policy "events: insert family member"
  on public.events for insert
  with check (
    family_id = public.my_family_id()
    and created_by = auth.uid()
  );

create policy "events: update own"
  on public.events for update
  using (created_by = auth.uid() and family_id = public.my_family_id());

create policy "events: delete own"
  on public.events for delete
  using (created_by = auth.uid() and family_id = public.my_family_id());

-- ──────────────────────────────────────────────────────────
-- 15. AUTO-CREATE PROFILE ON SIGNUP
--     Trigger fires when a new user is inserted in auth.users
-- ──────────────────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (user_id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
