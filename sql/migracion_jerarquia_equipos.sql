-- =============================================================================
-- ICC CRM · Migracion: jerarquia de equipos (Jefe de equipo -> comerciales)
-- Segura de ejecutar sobre una base de datos que ya tenga schema.sql importado.
--
-- Anade a que Jefe de equipo pertenece cada comercial. A partir de aqui:
--   - Jefe de equipo ve y gestiona clientes/contratos/proformas/estudios/
--     comparador de sus comerciales asignados (y los suyos propios), nunca
--     los de otros equipos ni los del resto de la empresa.
--   - Solo Admin puede asignar/quitar comerciales de un equipo, cambiar
--     roles o bloquear cuentas (desde Agentes -> editar comercial).
--   - Un comercial nunca ve nada de su Jefe de equipo ni de otros equipos.
-- =============================================================================

ALTER TABLE usuarios ADD COLUMN supervisor_id INT UNSIGNED NULL AFTER rol;
ALTER TABLE usuarios ADD CONSTRAINT fk_usuarios_supervisor
  FOREIGN KEY (supervisor_id) REFERENCES usuarios(id) ON DELETE SET NULL;
CREATE INDEX idx_usuarios_supervisor ON usuarios(supervisor_id);
