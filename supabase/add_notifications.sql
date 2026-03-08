-- ═══════════════════════════════════════════════════════════════
-- Notification system: persistent notifications + preferences
-- + web push subscriptions
-- Run this in the Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- 1. Stored notifications (created by cron job)
CREATE TABLE IF NOT EXISTS public.notifications (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type       text        NOT NULL,
  title      text        NOT NULL,
  body       text        NOT NULL,
  link       text,
  read       boolean     DEFAULT false,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_unread_idx ON public.notifications(user_id, read, created_at DESC);

-- 2. Notification preferences per user per type
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id             uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        uuid    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type           text    NOT NULL,
  enabled        boolean DEFAULT true,
  reminder_time  text    DEFAULT '20:00',  -- HH:MM preferred time
  threshold_pct  integer DEFAULT 80,        -- for budget_alert
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now(),
  UNIQUE(user_id, type)
);

-- 3. Web push device subscriptions
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint   text        NOT NULL UNIQUE,
  p256dh     text        NOT NULL,
  auth       text        NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- ── RLS ─────────────────────────────────────────────────────────
ALTER TABLE public.notifications           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions       ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications: own"
  ON public.notifications FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "notification_preferences: own"
  ON public.notification_preferences FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "push_subscriptions: own"
  ON public.push_subscriptions FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
