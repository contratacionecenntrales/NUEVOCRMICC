-- =============================================================================
-- ICC CRM · Migracion: agendas compartidas con Backoffice ("solo agenda")
-- Importar una sola vez (requiere migracion_backoffice_asignaciones.sql).
--
-- Un Admin puede dar a un usuario de Backoffice acceso SOLO A LA AGENDA de
-- personas concretas (p. ej. su jefa de equipo y el coordinador) para que les
-- concierte visitas. De esas personas el backoffice:
--   - SI ve su agenda y puede crear, mover y editar citas en ella;
--   - NO ve sus clientes, contratos, presupuestos, proformas, informes...
-- Con sus comerciales asignados lo sigue viendo todo, como hasta ahora.
-- =============================================================================

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS backoffice_agendas (
  backoffice_id INT UNSIGNED NOT NULL,
  usuario_id INT UNSIGNED NOT NULL,
  asignado_por INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (backoffice_id, usuario_id),
  CONSTRAINT fk_bo_ag_backoffice FOREIGN KEY (backoffice_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_bo_ag_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_bo_ag_asignado_por FOREIGN KEY (asignado_por) REFERENCES usuarios(id) ON DELETE SET NULL,
  INDEX idx_bo_ag_usuario (usuario_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Daniela (Backoffice) agenda a Juan y a Maria: solo su agenda.
INSERT IGNORE INTO backoffice_agendas (backoffice_id, usuario_id)
SELECT bo.id, u.id
FROM usuarios bo
JOIN usuarios u ON u.email IN ('juan@integralconnectionconsulting.es', 'maria.alvarez@integralconnectionconsulting.es')
WHERE bo.rol = 'backoffice' AND bo.email LIKE 'daniela%@integralconnectionconsulting.es';
