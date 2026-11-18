-- ICC CRM v99 · Campaña de llamadas a negocios de Asturias sin página web.
-- Idempotente: añade columnas a motor_leads solo si faltan y crea el historial de llamadas.
SET @c = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'motor_leads' AND column_name = 'llamada_estado');
SET @s = IF(@c = 0, "ALTER TABLE motor_leads ADD COLUMN llamada_estado VARCHAR(20) NOT NULL DEFAULT '', ADD COLUMN llamada_asignado INT UNSIGNED DEFAULT NULL, ADD COLUMN llamada_proxima DATETIME DEFAULT NULL, ADD COLUMN llamada_intentos TINYINT UNSIGNED NOT NULL DEFAULT 0, ADD COLUMN llamada_nota VARCHAR(500) NOT NULL DEFAULT '', ADD COLUMN llamada_en DATETIME DEFAULT NULL, ADD KEY idx_motor_llamada (llamada_asignado, llamada_estado, llamada_proxima)", 'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

CREATE TABLE IF NOT EXISTS motor_llamadas (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  lead_id INT UNSIGNED NOT NULL,
  usuario_id INT UNSIGNED DEFAULT NULL,
  resultado VARCHAR(20) NOT NULL,
  nota VARCHAR(500) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_motor_llam_lead (lead_id),
  KEY idx_motor_llam_user (usuario_id, created_at),
  CONSTRAINT fk_motor_llam_lead FOREIGN KEY (lead_id) REFERENCES motor_leads (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
