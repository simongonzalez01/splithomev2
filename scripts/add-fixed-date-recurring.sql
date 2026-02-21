-- ============================================================
-- Migration: Add start_date and is_recurring to fixed_expenses
-- Run this in your Supabase SQL Editor (Dashboard → SQL)
-- ============================================================

ALTER TABLE fixed_expenses
  ADD COLUMN IF NOT EXISTS start_date   DATE,
  ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN fixed_expenses.start_date   IS 'Date from which the fixed expense is active';
COMMENT ON COLUMN fixed_expenses.is_recurring IS 'TRUE = repeats every month; FALSE = one-time, auto-deactivates after first payment';
