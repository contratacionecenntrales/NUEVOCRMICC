-- =============================================================================
-- ICC CRM · Migracion: Pipeline comercial (tablero de oportunidades)
-- Importar una sola vez. No modifica datos existentes.
--
-- Anade a cada cliente/oportunidad:
--   valor_estimado         lo que vale la venta para ICC (EUR, p. ej. comision anual)
--   fecha_cierre_prevista  cuando se espera firmar (para la prevision por mes)
-- Los dias en cada fase se calculan con historial_estado (ya existe).
-- =============================================================================

SET NAMES utf8mb4;

ALTER TABLE clientes
  ADD COLUMN valor_estimado DECIMAL(12,2) NULL AFTER motivo_perdida,
  ADD COLUMN fecha_cierre_prevista DATE NULL AFTER valor_estimado;

CREATE INDEX idx_historial_cliente_estado ON historial_estado(cliente_id, estado_nuevo, created_at);
