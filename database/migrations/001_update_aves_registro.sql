-- ============================================================================
-- MIGRACIÓN: REGISTRO DE AVE (6 BLOQUES)
-- ============================================================================

-- 1. Añadir columnas de genética y detalles de estado
ALTER TABLE aves ADD COLUMN IF NOT EXISTS genotipo TEXT;
ALTER TABLE aves ADD COLUMN IF NOT EXISTS fenotipo TEXT;
ALTER TABLE aves ADD COLUMN IF NOT EXISTS estado_detalles JSONB;

-- 2. Actualizar restricción de estado_biologico para incluir EN_VENTA y OTRO
ALTER TABLE aves DROP CONSTRAINT IF EXISTS aves_estado_biologico_check;
ALTER TABLE aves ADD CONSTRAINT aves_estado_biologico_check 
CHECK (estado_biologico IN ('DISPONIBLE', 'EN_VENTA', 'VENDIDO', 'MUERTO', 'PERDIDO', 'DONADO', 'INTERCAMBIADO', 'OTRO'));

-- 3. Eliminar columna identificador_interno de forma definitiva
ALTER TABLE aves DROP COLUMN IF EXISTS identificador_interno CASCADE;


