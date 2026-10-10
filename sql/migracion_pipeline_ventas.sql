-- =============================================================================
-- ICC CRM · Migracion: refuerzo del pipeline comercial para Energia/Telco/
-- Alarmas (foco en Energia) + motivo de perdida en clientes.
--
-- No crea tablas nuevas: amplia Presupuestos (que ya guarda los datos
-- actuales del suministro/servicio por cliente y por sector) con tipo de
-- suministro, consumo anual y fecha de fin de permanencia (para alertas
-- de renovacion), y anade a Clientes el motivo cuando un lead se marca
-- como Perdido.
--
-- Segura de ejecutar sobre una base de datos que ya tenga
-- migracion_presupuestos.sql y migracion_presupuestos_v2.sql importados.
-- =============================================================================

SET NAMES utf8mb4;

ALTER TABLE presupuestos
  ADD COLUMN tipo_suministro ENUM('electricidad','gas','dual') NULL AFTER sector,
  ADD COLUMN consumo_anual_kwh INT UNSIGNED NULL AFTER potencias_contratadas,
  ADD COLUMN fecha_permanencia DATE NULL AFTER datos_actuales_otros;

CREATE INDEX idx_presupuestos_fecha_permanencia ON presupuestos(fecha_permanencia);

ALTER TABLE clientes
  ADD COLUMN motivo_perdida VARCHAR(255) NOT NULL DEFAULT '' AFTER estado;
