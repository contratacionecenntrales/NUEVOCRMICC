-- =============================================================================
-- ICC CRM · Migracion: Agenda avanzada (v54)
-- - Citas vinculadas a clientes del CRM, tipo de cita (visita, llamada...),
--   email del contacto, resumen de la reunion, proximos pasos y presupuesto
--   generado desde la cita.
-- - Nuevo estado "Confirmada" y sectores Seguros / Financiero.
-- Ejecutala UNA sola vez. Mientras no la ejecutes la agenda sigue
-- funcionando, pero sin esas funciones nuevas.
-- =============================================================================

SET NAMES utf8mb4;

ALTER TABLE citas MODIFY sector ENUM('energia','telecomunicaciones','alarmas','multisectorial','seguros','financiero') NOT NULL DEFAULT 'energia';
ALTER TABLE citas MODIFY estado ENUM('programada','confirmada','realizada','reprogramada','ko') NOT NULL DEFAULT 'programada';
ALTER TABLE citas ADD COLUMN cliente_id INT UNSIGNED NULL AFTER comercial_id;
ALTER TABLE citas ADD COLUMN tipo VARCHAR(20) NOT NULL DEFAULT 'visita' AFTER cliente_id;
ALTER TABLE citas ADD COLUMN email VARCHAR(190) NOT NULL DEFAULT '' AFTER telefono;
ALTER TABLE citas ADD COLUMN resumen TEXT NULL AFTER notas;
ALTER TABLE citas ADD COLUMN proximos_pasos VARCHAR(500) NOT NULL DEFAULT '' AFTER resumen;
ALTER TABLE citas ADD COLUMN presupuesto_id INT UNSIGNED NULL AFTER proximos_pasos;
ALTER TABLE citas ADD COLUMN creado_por INT UNSIGNED NULL AFTER presupuesto_id;
ALTER TABLE citas ADD CONSTRAINT fk_cita_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL;
ALTER TABLE citas ADD CONSTRAINT fk_cita_presupuesto FOREIGN KEY (presupuesto_id) REFERENCES presupuestos(id) ON DELETE SET NULL;
ALTER TABLE citas ADD CONSTRAINT fk_cita_creado_por FOREIGN KEY (creado_por) REFERENCES usuarios(id) ON DELETE SET NULL;
CREATE INDEX idx_citas_cliente ON citas(cliente_id, fecha);
