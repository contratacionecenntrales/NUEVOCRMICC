-- ICC CRM v95 · Rellamadas de backoffice: llamadas para que el cliente acepte el presupuesto y empiece a ahorrar.
-- Idempotente.
CREATE TABLE IF NOT EXISTS rellamadas (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  cliente_id INT UNSIGNED NOT NULL,
  presupuesto_id INT UNSIGNED DEFAULT NULL,
  usuario_id INT UNSIGNED NOT NULL,
  cita_id INT UNSIGNED DEFAULT NULL,
  intento TINYINT UNSIGNED NOT NULL DEFAULT 1,
  estado ENUM('pendiente','acepta','lo_piensa','no_contesta','no_acepta','cancelada') NOT NULL DEFAULT 'pendiente',
  motivo VARCHAR(500) NOT NULL DEFAULT '',
  fecha DATE NOT NULL,
  rellamar_desde DATE DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resuelta_en DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_rell_usuario (usuario_id, estado, fecha),
  KEY idx_rell_cliente (cliente_id, created_at),
  CONSTRAINT fk_rell_cliente FOREIGN KEY (cliente_id) REFERENCES clientes (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
