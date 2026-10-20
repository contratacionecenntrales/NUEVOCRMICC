-- =============================================================================
-- ICC CRM · Migracion: datos de suministro/servicio actual en Clientes y
-- Presupuestos (CUPS, comercializadora actual, tarifa actual, potencias,
-- direccion de suministro, y datos de telefonia/alarmas actuales).
-- Segura de ejecutar sobre una base de datos que ya tenga
-- migracion_presupuestos.sql importado.
-- =============================================================================

SET NAMES utf8mb4;

ALTER TABLE clientes
  ADD COLUMN direccion_suministro VARCHAR(255) NOT NULL DEFAULT '' AFTER email;

ALTER TABLE presupuestos
  ADD COLUMN cups VARCHAR(30) NOT NULL DEFAULT '' AFTER sector,
  ADD COLUMN comercializadora_actual VARCHAR(120) NOT NULL DEFAULT '' AFTER cups,
  ADD COLUMN tarifa_actual VARCHAR(120) NOT NULL DEFAULT '' AFTER comercializadora_actual,
  ADD COLUMN potencias_contratadas VARCHAR(200) NOT NULL DEFAULT '' AFTER tarifa_actual,
  ADD COLUMN datos_actuales_otros VARCHAR(300) NOT NULL DEFAULT '' AFTER potencias_contratadas;
