-- ============================================================================
-- MIGRACIÓN 002: Actualización de la Tabla de Mutaciones al Cuadro Maestro
-- ============================================================================

ALTER TABLE mutaciones 
    ADD COLUMN IF NOT EXISTS categoria VARCHAR(50),
    ADD COLUMN IF NOT EXISTS herencia VARCHAR(50),
    ADD COLUMN IF NOT EXISTS cromosoma VARCHAR(30),
    ADD COLUMN IF NOT EXISTS codigo_genetico VARCHAR(30),
    ADD COLUMN IF NOT EXISTS regla_cruce TEXT;
