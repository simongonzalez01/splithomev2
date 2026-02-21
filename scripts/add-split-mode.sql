-- ============================================================
-- Migration: Add split_mode column to expenses table
-- Run this once in your Supabase SQL Editor (Dashboard → SQL)
-- ============================================================

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS split_mode TEXT NOT NULL DEFAULT '50/50';

COMMENT ON COLUMN expenses.split_mode IS
  '50/50 = expense is split equally between all family members; personal = full cost goes to the payer';

-- Optional: index for future filtering
-- CREATE INDEX IF NOT EXISTS idx_expenses_split_mode ON expenses(split_mode);
