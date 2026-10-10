-- =============================================================================
-- ICC CRM · Migracion: sectores de negocio (alarmas, energia, telecomunicaciones,
-- seguros, financiero) en contratos + "financiero" como servicio de cliente.
-- Segura de ejecutar sobre una base de datos que ya tenga schema.sql importado
-- (si vas a instalar desde cero, con importar el schema.sql actualizado basta,
-- no hace falta ademas esta migracion).
-- =============================================================================

ALTER TABLE contratos
  ADD COLUMN sector ENUM('alarmas','energia','telecomunicaciones','seguros','financiero')
  NOT NULL DEFAULT 'energia' AFTER cliente_id;

CREATE INDEX idx_contratos_sector ON contratos(sector);

ALTER TABLE cliente_servicios
  MODIFY COLUMN servicio ENUM('energia','telecomunicaciones','seguros','alarmas','financiero','paginas_web','campanas') NOT NULL;
