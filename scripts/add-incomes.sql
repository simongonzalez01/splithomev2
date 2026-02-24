-- ── Tabla de Ingresos ────────────────────────────────────────────────────────
-- Registra dinero que entra a la familia y cómo se divide entre los miembros.
--
-- split_mode:
--   '50/50'    → se divide equitativamente entre todos los miembros
--   'personal' → el ingreso es solo para quien lo recibió (received_by)
--   'para_otro'→ lo recibió received_by pero le corresponde a for_member

CREATE TABLE IF NOT EXISTS incomes (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  family_id     UUID        NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  title         TEXT        NOT NULL,
  amount        NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  date          DATE        NOT NULL DEFAULT CURRENT_DATE,
  category      TEXT        NOT NULL DEFAULT 'Sale',
  received_by   TEXT        NOT NULL,   -- user_id de quien recibió el dinero
  note          TEXT,
  split_mode    TEXT        NOT NULL DEFAULT '50/50',
  for_member    TEXT,                   -- user_id cuando split_mode = 'para_otro'
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE incomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "family_select_incomes"
  ON incomes FOR SELECT
  USING (family_id = my_family_id());

CREATE POLICY "family_insert_incomes"
  ON incomes FOR INSERT
  WITH CHECK (family_id = my_family_id());

CREATE POLICY "family_update_incomes"
  ON incomes FOR UPDATE
  USING (family_id = my_family_id());

CREATE POLICY "family_delete_incomes"
  ON incomes FOR DELETE
  USING (family_id = my_family_id());
