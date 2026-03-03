-- ═══════════════════════════════════════════════════════════════
-- FASE 4 — Habilitar Realtime para el chat
-- Ejecutar en Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- Agregar business_messages a la publicación de Realtime
-- (permite que el chat reciba mensajes nuevos en tiempo real)
ALTER PUBLICATION supabase_realtime ADD TABLE business_messages;

-- Verificar que quedó habilitado:
-- SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
