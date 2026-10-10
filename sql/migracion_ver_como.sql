-- =============================================================================
-- ICC CRM · Migracion: "Ver como" (Admin entra temporalmente en la sesion de
-- otro usuario para ver el CRM exactamente como lo ve el, con aviso visible
-- permanente y registro de auditoria). Segura de ejecutar sobre una base de
-- datos que ya tenga schema.sql importado.
-- =============================================================================

CREATE TABLE IF NOT EXISTS logs_impersonacion (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  admin_id INT UNSIGNED NOT NULL,
  usuario_objetivo_id INT UNSIGNED NOT NULL,
  iniciado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finalizado_en DATETIME NULL,
  ip VARCHAR(45) NULL,
  CONSTRAINT fk_impersonacion_admin FOREIGN KEY (admin_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_impersonacion_objetivo FOREIGN KEY (usuario_objetivo_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  INDEX idx_impersonacion_admin (admin_id, iniciado_en)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
