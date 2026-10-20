-- =============================================================================
-- ICC CRM · Migracion: visitas concertadas por Backoffice y asignadas a equipos
-- Requiere haber importado antes sql/migracion_agenda_avanzada.sql.
--
-- Backoffice concierta una visita y la asigna al equipo de un Jefe de equipo:
--   - directamente a un comercial de ese equipo, o
--   - "por asignar": queda en la bandeja del Jefe de equipo, que la reparte.
-- =============================================================================

ALTER TABLE citas MODIFY comercial_id INT UNSIGNED NULL;
ALTER TABLE citas ADD COLUMN equipo_id INT UNSIGNED NULL AFTER comercial_id;
ALTER TABLE citas ADD COLUMN asignada_por INT UNSIGNED NULL AFTER creado_por;
ALTER TABLE citas ADD COLUMN asignada_en DATETIME NULL AFTER asignada_por;
ALTER TABLE citas ADD CONSTRAINT fk_cita_equipo FOREIGN KEY (equipo_id) REFERENCES usuarios(id) ON DELETE SET NULL;
ALTER TABLE citas ADD CONSTRAINT fk_cita_asignada_por FOREIGN KEY (asignada_por) REFERENCES usuarios(id) ON DELETE SET NULL;
CREATE INDEX idx_citas_equipo ON citas(equipo_id, comercial_id);

-- Las citas que ya existen quedan en el equipo del Jefe de su comercial.
UPDATE citas c JOIN usuarios u ON u.id = c.comercial_id
  SET c.equipo_id = u.supervisor_id
  WHERE c.equipo_id IS NULL AND u.supervisor_id IS NOT NULL;
