-- ══════════════════════════════════════════════════════════════════════
-- Fix business_transactions — agregar tipo "retiro" al CHECK constraint
-- y corregir políticas RLS para permitir lectura/escritura a miembros
-- Ejecutar en Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════════════

-- ── 1. Ampliar el CHECK de tipo para incluir "retiro" ────────────────
--    El constraint original solo tenía: ('venta','compra','gasto','ingreso')
ALTER TABLE public.business_transactions
  DROP CONSTRAINT IF EXISTS business_transactions_type_check;

ALTER TABLE public.business_transactions
  ADD CONSTRAINT business_transactions_type_check
  CHECK (type IN ('venta', 'compra', 'gasto', 'ingreso', 'retiro'));

-- ── 2. RLS: permitir que miembros del negocio también lean y escriban ─
--    Las políticas originales solo permitían al dueño (user_id = auth.uid()).
--    Ahora también permiten a los socios (business_members) acceder.

-- business_products: lectura para dueño o miembro
DROP POLICY IF EXISTS "business_products: select own"    ON public.business_products;
DROP POLICY IF EXISTS "business_products: select member" ON public.business_products;
CREATE POLICY "business_products: select member"
  ON public.business_products FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM business_members
      WHERE business_id = business_products.business_id
        AND user_id = auth.uid()
    )
  );

-- business_products: insertar — dueño o miembro
DROP POLICY IF EXISTS "business_products: insert own"    ON public.business_products;
DROP POLICY IF EXISTS "business_products: insert member" ON public.business_products;
CREATE POLICY "business_products: insert member"
  ON public.business_products FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND (
      EXISTS (SELECT 1 FROM businesses WHERE id = business_id AND user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM business_members WHERE business_id = business_products.business_id AND user_id = auth.uid())
    )
  );

-- business_products: actualizar — dueño o miembro
DROP POLICY IF EXISTS "business_products: update own"    ON public.business_products;
DROP POLICY IF EXISTS "business_products: update member" ON public.business_products;
CREATE POLICY "business_products: update member"
  ON public.business_products FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM businesses WHERE id = business_id AND user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM business_members WHERE business_id = business_products.business_id AND user_id = auth.uid())
  );

-- business_products: eliminar — solo dueño del negocio
DROP POLICY IF EXISTS "business_products: delete own"    ON public.business_products;
DROP POLICY IF EXISTS "business_products: delete member" ON public.business_products;
CREATE POLICY "business_products: delete member"
  ON public.business_products FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM businesses WHERE id = business_id AND user_id = auth.uid())
  );

-- business_transactions: lectura para dueño o miembro
DROP POLICY IF EXISTS "business_transactions: select own"    ON public.business_transactions;
DROP POLICY IF EXISTS "business_transactions: select member" ON public.business_transactions;
CREATE POLICY "business_transactions: select member"
  ON public.business_transactions FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM business_members
      WHERE business_id = business_transactions.business_id
        AND user_id = auth.uid()
    )
  );

-- business_transactions: insertar — dueño o miembro (user_id debe ser auth.uid())
DROP POLICY IF EXISTS "business_transactions: insert own"    ON public.business_transactions;
DROP POLICY IF EXISTS "business_transactions: insert member" ON public.business_transactions;
CREATE POLICY "business_transactions: insert member"
  ON public.business_transactions FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND (
      EXISTS (SELECT 1 FROM businesses WHERE id = business_id AND user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM business_members WHERE business_id = business_transactions.business_id AND user_id = auth.uid())
    )
  );

-- business_transactions: actualizar — dueño o miembro
DROP POLICY IF EXISTS "business_transactions: update own"    ON public.business_transactions;
DROP POLICY IF EXISTS "business_transactions: update member" ON public.business_transactions;
CREATE POLICY "business_transactions: update member"
  ON public.business_transactions FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM businesses WHERE id = business_id AND user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM business_members WHERE business_id = business_transactions.business_id AND user_id = auth.uid())
  );

-- business_transactions: eliminar — solo dueño del negocio
DROP POLICY IF EXISTS "business_transactions: delete own"    ON public.business_transactions;
DROP POLICY IF EXISTS "business_transactions: delete member" ON public.business_transactions;
CREATE POLICY "business_transactions: delete member"
  ON public.business_transactions FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM businesses WHERE id = business_id AND user_id = auth.uid())
  );

-- business_tx_items ya usa una subquery que hereda de business_transactions,
-- así que las políticas existentes siguen funcionando sin cambios.
