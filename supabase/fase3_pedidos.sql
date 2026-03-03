-- ═══════════════════════════════════════════════════════════════
-- FASE 3 — Items de pedidos
-- Solo agrega business_order_items (las demás tablas ya existen
-- en fase1_socios.sql: business_suppliers, business_orders,
-- business_order_documents)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS business_order_items (
  id          uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    uuid    REFERENCES business_orders(id)  ON DELETE CASCADE,
  description text    NOT NULL,
  quantity    numeric NOT NULL DEFAULT 1,
  unit_cost   numeric NOT NULL DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE business_order_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "order_items_access" ON business_order_items;
CREATE POLICY "order_items_access" ON business_order_items
  FOR ALL USING (auth.uid() IS NOT NULL);
