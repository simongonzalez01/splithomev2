-- Allow custom (non-inventory) items in transactions
-- Run this in the Supabase SQL Editor

-- 1. Make product_id nullable so free-text items can be stored
ALTER TABLE public.business_tx_items
  ALTER COLUMN product_id DROP NOT NULL;

-- 2. Add custom_name column for items not linked to any product
ALTER TABLE public.business_tx_items
  ADD COLUMN IF NOT EXISTS custom_name text;
