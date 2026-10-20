-- =============================================================================
-- ICC CRM · Migracion: comerciales asignados a cada usuario de Backoffice
-- Segura de ejecutar sobre una base de datos que ya tenga schema.sql importado.
--
-- Un Admin puede elegir que comerciales concretos atiende cada usuario de
-- Backoffice (p. ej. Daniela solo lleva a algunos comerciales del equipo de
-- Maria). A partir de aqui:
--   - Backoffice CON comerciales asignados: solo ve los clientes, contratos,
--     presupuestos, proformas, citas, comparativas e informes de esos
--     comerciales (y lo suyo propio), y en "Agentes" solo le aparecen ellos.
--   - Backoffice SIN ninguno asignado: sigue viendo toda la empresa, como
--     hasta ahora.
-- =============================================================================

CREATE TABLE IF NOT EXISTS backoffice_comerciales (
  backoffice_id INT UNSIGNED NOT NULL,
  comercial_id INT UNSIGNED NOT NULL,
  asignado_por INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (backoffice_id, comercial_id),
  CONSTRAINT fk_bo_com_backoffice FOREIGN KEY (backoffice_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_bo_com_comercial FOREIGN KEY (comercial_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_bo_com_asignado_por FOREIGN KEY (asignado_por) REFERENCES usuarios(id) ON DELETE SET NULL,
  INDEX idx_bo_com_comercial (comercial_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
