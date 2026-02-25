-- ============================================================
-- add-receipts-home.sql
-- Adds receipt_url to home module tables + family storage policies
-- ============================================================

-- 1. Add receipt_url to expenses ─────────────────────────────
alter table public.expenses
  add column if not exists receipt_url text;

-- 2. Add receipt_url to incomes ──────────────────────────────
alter table public.incomes
  add column if not exists receipt_url text;

-- 3. Storage policies for family receipts ────────────────────
-- Path convention: family/{family_id}/{timestamp}-{random}.{ext}

-- SELECT: family members can view receipts from their family folder
create policy "receipts family select"
  on storage.objects for select
  using (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = 'family'
    and exists (
      select 1 from public.profiles
      where user_id = auth.uid()
        and family_id::text = (storage.foldername(name))[2]
    )
  );

-- INSERT: family members can upload receipts to their family folder
create policy "receipts family insert"
  on storage.objects for insert
  with check (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = 'family'
    and exists (
      select 1 from public.profiles
      where user_id = auth.uid()
        and family_id::text = (storage.foldername(name))[2]
    )
  );

-- UPDATE: family members can replace receipts in their family folder
create policy "receipts family update"
  on storage.objects for update
  using (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = 'family'
    and exists (
      select 1 from public.profiles
      where user_id = auth.uid()
        and family_id::text = (storage.foldername(name))[2]
    )
  );

-- DELETE: family members can delete receipts from their family folder
create policy "receipts family delete"
  on storage.objects for delete
  using (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = 'family'
    and exists (
      select 1 from public.profiles
      where user_id = auth.uid()
        and family_id::text = (storage.foldername(name))[2]
    )
  );
