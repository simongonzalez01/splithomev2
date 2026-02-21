-- Add split_mode to fixed_expenses so each fixed bill knows how to split
ALTER TABLE fixed_expenses
  ADD COLUMN IF NOT EXISTS split_mode TEXT NOT NULL DEFAULT '50/50';
