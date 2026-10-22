-- =============================================================================
-- ICC CRM · Migracion: Backoffice que lleva un equipo completo
-- Importar una sola vez (requiere migracion_backoffice_asignaciones.sql).
--
-- Ademas de comerciales sueltos, un Admin puede asignar a un Backoffice el
-- EQUIPO COMPLETO de un jefe: vera a todos sus comerciales, tambien a los que
-- entren despues, sin tener que marcarlos uno a uno.
-- =============================================================================

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS backoffice_equipos (
  backoffice_id INT UNSIGNED NOT NULL,
  jefe_id INT UNSIGNED NOT NULL,
  asignado_por INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (backoffice_id, jefe_id),
  CONSTRAINT fk_bo_eq_backoffice FOREIGN KEY (backoffice_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_bo_eq_jefe FOREIGN KEY (jefe_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_bo_eq_asignado_por FOREIGN KEY (asignado_por) REFERENCES usuarios(id) ON DELETE SET NULL,
  INDEX idx_bo_eq_jefe (jefe_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Daniela (Backoffice) lleva todo el equipo de Maria, incluidos los comerciales nuevos.
INSERT IGNORE INTO backoffice_equipos (backoffice_id, jefe_id)
SELECT bo.id, j.id
FROM usuarios bo
JOIN usuarios j ON j.rol = 'jefe_de_equipo'
  AND (j.email = 'maria.alvarez@integralconnectionconsulting.es' OR j.email LIKE 'maria%@integralconnectionconsulting.es')
WHERE bo.rol = 'backoffice' AND bo.email LIKE 'daniela%@integralconnectionconsulting.es';
