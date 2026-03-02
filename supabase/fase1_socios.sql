-- ══════════════════════════════════════════════════════════════════
-- FASE 1 — Sistema de Socios (ejecutar completo en Supabase SQL Editor)
-- ══════════════════════════════════════════════════════════════════

-- ── 1. Profiles (nombre y email de cada usuario) ─────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id         uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name  text,
  email      text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "profiles_access" ON profiles;
CREATE POLICY "profiles_access" ON profiles FOR ALL USING (auth.uid() IS NOT NULL);

-- Auto-crear perfil cuando se registra un usuario nuevo
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (new.id, new.email, new.raw_user_meta_data->>'full_name')
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Rellenar perfiles de usuarios ya existentes
INSERT INTO profiles (id, email)
SELECT id, email FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- ── 2. Columnas nuevas en businesses ─────────────────────────────
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS type        text DEFAULT 'ventas' CHECK (type IN ('ventas','cambio')),
  ADD COLUMN IF NOT EXISTS invite_code text UNIQUE,
  ADD COLUMN IF NOT EXISTS category    text DEFAULT 'personal' CHECK (category IN ('personal','partner'));

-- ── 3. Business members (socios dentro de un negocio compartido) ──
CREATE TABLE IF NOT EXISTS business_members (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  uuid REFERENCES businesses(id) ON DELETE CASCADE,
  user_id      uuid REFERENCES auth.users(id)  ON DELETE CASCADE,
  role         text    DEFAULT 'partner',
  profit_share numeric DEFAULT 50,
  joined_at    timestamptz DEFAULT now(),
  UNIQUE(business_id, user_id)
);
ALTER TABLE business_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "business_members_access" ON business_members;
CREATE POLICY "business_members_access" ON business_members
  FOR ALL USING (auth.uid() IS NOT NULL);

-- Permitir que los miembros lean el negocio (además del dueño)
DROP POLICY IF EXISTS "businesses_members_read" ON businesses;
CREATE POLICY "businesses_members_read" ON businesses
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM business_members
      WHERE business_id = businesses.id AND user_id = auth.uid()
    )
  );

-- ── 4. Capital invertido por persona ─────────────────────────────
CREATE TABLE IF NOT EXISTS business_capital (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id    uuid REFERENCES businesses(id)  ON DELETE CASCADE,
  contributed_by uuid REFERENCES auth.users(id)  ON DELETE SET NULL,
  amount         numeric NOT NULL,
  description    text,
  date           date    NOT NULL,
  created_at     timestamptz DEFAULT now()
);
ALTER TABLE business_capital ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "business_capital_access" ON business_capital;
CREATE POLICY "business_capital_access" ON business_capital
  FOR ALL USING (auth.uid() IS NOT NULL);

-- ── 5. Partner relationships (vínculo entre dos personas) ─────────
CREATE TABLE IF NOT EXISTS partner_relationships (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  partner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  nickname   text,
  status     text DEFAULT 'active',
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, partner_id)
);
ALTER TABLE partner_relationships ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "partner_relationships_access" ON partner_relationships;
CREATE POLICY "partner_relationships_access" ON partner_relationships
  FOR ALL USING (auth.uid() IS NOT NULL);

-- ── 6. Transferencias entre socios ───────────────────────────────
CREATE TABLE IF NOT EXISTS partner_transfers (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  to_user      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  total_amount numeric NOT NULL,
  currency     text DEFAULT 'USD',
  method       text,
  date         date NOT NULL,
  notes        text,
  receipt_url  text,
  created_at   timestamptz DEFAULT now()
);
ALTER TABLE partner_transfers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "partner_transfers_access" ON partner_transfers;
CREATE POLICY "partner_transfers_access" ON partner_transfers
  FOR ALL USING (auth.uid() IS NOT NULL);

-- ── 7. Asignación de transferencias a negocios ───────────────────
CREATE TABLE IF NOT EXISTS partner_transfer_allocations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id uuid REFERENCES partner_transfers(id) ON DELETE CASCADE,
  business_id uuid REFERENCES businesses(id)        ON DELETE SET NULL,
  amount      numeric NOT NULL
);
ALTER TABLE partner_transfer_allocations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "transfer_allocations_access" ON partner_transfer_allocations;
CREATE POLICY "transfer_allocations_access" ON partner_transfer_allocations
  FOR ALL USING (auth.uid() IS NOT NULL);

-- ── 8. Cambio de divisas (para negocios tipo "cambio") ───────────
CREATE TABLE IF NOT EXISTS business_exchanges (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id        uuid REFERENCES businesses(id)       ON DELETE CASCADE,
  sent_by            uuid REFERENCES auth.users(id)       ON DELETE SET NULL,
  amount_sent        numeric NOT NULL,
  currency_sent      text    NOT NULL,
  amount_received    numeric NOT NULL,
  currency_received  text    NOT NULL,
  exchange_rate      numeric,
  method             text,
  date               date    NOT NULL,
  notes              text,
  receipt_url        text,
  linked_exchange_id uuid REFERENCES business_exchanges(id) ON DELETE SET NULL,
  status             text DEFAULT 'unmatched',
  created_at         timestamptz DEFAULT now()
);
ALTER TABLE business_exchanges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "business_exchanges_access" ON business_exchanges;
CREATE POLICY "business_exchanges_access" ON business_exchanges
  FOR ALL USING (auth.uid() IS NOT NULL);

-- ── 9. Verificación de transacciones ─────────────────────────────
ALTER TABLE business_transactions
  ADD COLUMN IF NOT EXISTS created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz;

-- ── 10. Ventas a crédito (abonos parciales) ───────────────────────
ALTER TABLE business_transactions
  ADD COLUMN IF NOT EXISTS payment_type  text    DEFAULT 'contado' CHECK (payment_type IN ('contado','credito')),
  ADD COLUMN IF NOT EXISTS amount_paid   numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS client_name   text;

CREATE TABLE IF NOT EXISTS business_transaction_payments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid REFERENCES business_transactions(id) ON DELETE CASCADE,
  business_id    uuid REFERENCES businesses(id)             ON DELETE CASCADE,
  amount         numeric NOT NULL,
  date           date    NOT NULL,
  notes          text,
  receipt_url    text,
  created_at     timestamptz DEFAULT now()
);
ALTER TABLE business_transaction_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tx_payments_access" ON business_transaction_payments;
CREATE POLICY "tx_payments_access" ON business_transaction_payments
  FOR ALL USING (auth.uid() IS NOT NULL);

-- ── 11. Proveedores (para Fase 3 – pedidos) ──────────────────────
CREATE TABLE IF NOT EXISTS business_suppliers (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  uuid REFERENCES businesses(id) ON DELETE CASCADE,
  created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name         text NOT NULL,
  country      text,
  contact_name text,
  contact_info text,
  currency     text DEFAULT 'USD',
  notes        text,
  is_active    boolean DEFAULT true,
  created_at   timestamptz DEFAULT now()
);
ALTER TABLE business_suppliers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "business_suppliers_access" ON business_suppliers;
CREATE POLICY "business_suppliers_access" ON business_suppliers
  FOR ALL USING (auth.uid() IS NOT NULL);

-- ── 12. Pedidos/Órdenes (para Fase 3) ────────────────────────────
CREATE TABLE IF NOT EXISTS business_orders (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id       uuid REFERENCES businesses(id)          ON DELETE CASCADE,
  created_by        uuid REFERENCES auth.users(id)          ON DELETE SET NULL,
  supplier_id       uuid REFERENCES business_suppliers(id)  ON DELETE SET NULL,
  title             text NOT NULL,
  description       text,
  total_cost        numeric,
  amount_paid       numeric DEFAULT 0,
  currency          text DEFAULT 'USD',
  order_date        date,
  expected_delivery date,
  actual_delivery   date,
  status            text DEFAULT 'pendiente',
  notes             text,
  created_at        timestamptz DEFAULT now()
);
ALTER TABLE business_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "business_orders_access" ON business_orders;
CREATE POLICY "business_orders_access" ON business_orders
  FOR ALL USING (auth.uid() IS NOT NULL);

-- ── 13. Documentos de pedidos (para Fase 3) ──────────────────────
CREATE TABLE IF NOT EXISTS business_order_documents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    uuid REFERENCES business_orders(id)  ON DELETE CASCADE,
  business_id uuid REFERENCES businesses(id)        ON DELETE SET NULL,
  uploaded_by uuid REFERENCES auth.users(id)        ON DELETE SET NULL,
  title       text NOT NULL,
  file_url    text NOT NULL,
  file_type   text,
  created_at  timestamptz DEFAULT now()
);
ALTER TABLE business_order_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "order_documents_access" ON business_order_documents;
CREATE POLICY "order_documents_access" ON business_order_documents
  FOR ALL USING (auth.uid() IS NOT NULL);

-- ── 14. Chat del negocio (para Fase 4) ───────────────────────────
CREATE TABLE IF NOT EXISTS business_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  sent_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  content     text,
  file_url    text,
  file_name   text,
  file_type   text,
  created_at  timestamptz DEFAULT now()
);
ALTER TABLE business_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "business_messages_access" ON business_messages;
CREATE POLICY "business_messages_access" ON business_messages
  FOR ALL USING (auth.uid() IS NOT NULL);

-- ── 15. Pendientes por negocio (para Fase 4) ─────────────────────
CREATE TABLE IF NOT EXISTS business_todos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  title       text NOT NULL,
  description text,
  due_date    date,
  is_done     boolean DEFAULT false,
  done_at     timestamptz,
  created_at  timestamptz DEFAULT now()
);
ALTER TABLE business_todos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "business_todos_access" ON business_todos;
CREATE POLICY "business_todos_access" ON business_todos
  FOR ALL USING (auth.uid() IS NOT NULL);
