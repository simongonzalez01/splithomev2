-- ════════════════════════════════════════════════════════════════════════════
-- FIX: Invite Codes & Partner Profiles
-- Ejecutar completo en el Supabase SQL Editor (es idempotente, se puede
-- correr más de una vez sin problemas).
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Asegurar que profiles tiene todas las columnas necesarias ───────────
--    (ADD COLUMN IF NOT EXISTS no hace nada si ya existe)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS user_id      uuid UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS email        text,
  ADD COLUMN IF NOT EXISTS full_name    text,
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS family_id    uuid REFERENCES public.families(id) ON DELETE SET NULL;

-- ── 2. Índices útiles ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS profiles_user_id_idx   ON public.profiles(user_id);
CREATE INDEX IF NOT EXISTS profiles_family_id_idx ON public.profiles(family_id);

-- ── 3. Sincronizar user_id ─────────────────────────────────────────────────
--    Si la tabla se creó con id = auth.users.id (esquema de fase1_socios),
--    copiamos id → user_id donde sea necesario.
UPDATE public.profiles p
SET    user_id = p.id
WHERE  p.user_id IS NULL
  AND  EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id);

-- ── 4. Rellenar email, full_name y display_name desde auth.users ───────────
UPDATE public.profiles p
SET
  email        = COALESCE(p.email,        u.email),
  full_name    = COALESCE(p.full_name,    u.raw_user_meta_data->>'full_name'),
  display_name = COALESCE(
                   p.display_name,
                   u.raw_user_meta_data->>'display_name',
                   u.raw_user_meta_data->>'full_name',
                   split_part(u.email, '@', 1)
                 )
FROM auth.users u
WHERE u.id = COALESCE(p.user_id, p.id);

-- ── 5. Corregir el trigger handle_new_user ────────────────────────────────
--    Versión universal: funciona con AMBOS esquemas de profiles.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, full_name, display_name)
  VALUES (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    COALESCE(
      new.raw_user_meta_data->>'display_name',
      new.raw_user_meta_data->>'full_name',
      split_part(new.email, '@', 1)
    )
  )
  ON CONFLICT (user_id) DO UPDATE
    SET email        = EXCLUDED.email,
        full_name    = COALESCE(public.profiles.full_name,    EXCLUDED.full_name),
        display_name = COALESCE(public.profiles.display_name, EXCLUDED.display_name);
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── 6. [BUG PRINCIPAL] Businesses RLS — permitir búsqueda por invite_code ──
--    El problema: cuando alguien intenta unirse con un código, no es ni
--    dueño ni miembro, así que las políticas existentes bloquean el SELECT.
--    Esta política permite leer negocios que tienen invite_code (son
--    negocios de socios pensados para ser compartidos).
DROP POLICY IF EXISTS "businesses: select by invite code" ON public.businesses;
CREATE POLICY "businesses: select by invite code"
  ON public.businesses FOR SELECT
  TO authenticated
  USING (invite_code IS NOT NULL);

-- ── 7. Profiles RLS — permitir ver perfiles de socios ─────────────────────
--    Con el esquema original, la política solo permite ver tu propio perfil
--    o los de tu familia. Los socios de negocio no pueden verse entre sí.
--    Añadimos una política permisiva para lectura (SELECT) de todos los
--    perfiles por usuarios autenticados.
DROP POLICY IF EXISTS "profiles: select for authenticated" ON public.profiles;
CREATE POLICY "profiles: select for authenticated"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);
