-- ICC CRM v104 · Supervisión de backoffice: plan del día y revisión diaria. Idempotente.
CREATE TABLE IF NOT EXISTS plan_diario (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id INT UNSIGNED NOT NULL,
  fecha DATE NOT NULL,
  items LONGTEXT DEFAULT NULL,
  revision LONGTEXT DEFAULT NULL,
  ia TINYINT(1) NOT NULL DEFAULT 0,
  enviado_correo TINYINT(1) NOT NULL DEFAULT 0,
  leido_at DATETIME DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_plan_dia (usuario_id, fecha),
  CONSTRAINT fk_plan_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
