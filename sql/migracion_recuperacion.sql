-- ICC CRM v101 · Recuperación de no firmados y ofertas exclusivas del mes. Idempotente.
CREATE TABLE IF NOT EXISTS ofertas_mes (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  servicio VARCHAR(30) NOT NULL DEFAULT 'general',
  compania VARCHAR(120) NOT NULL DEFAULT '',
  titulo VARCHAR(160) NOT NULL,
  descripcion TEXT DEFAULT NULL,
  condiciones TEXT DEFAULT NULL,
  vigente_desde DATE NOT NULL,
  vigente_hasta DATE NOT NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  creado_por INT UNSIGNED DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ofertas_vig (activo, vigente_hasta)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS recuperacion (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  cliente_id INT UNSIGNED NOT NULL,
  objecion VARCHAR(30) NOT NULL DEFAULT 'otro',
  detalle VARCHAR(500) NOT NULL DEFAULT '',
  fuente VARCHAR(40) NOT NULL DEFAULT '',
  servicio VARCHAR(30) NOT NULL DEFAULT '',
  fin_permanencia DATE DEFAULT NULL,
  estado ENUM('pendiente','en_curso','recuperado','descartado') NOT NULL DEFAULT 'pendiente',
  plan VARCHAR(500) NOT NULL DEFAULT '',
  oferta_id INT UNSIGNED DEFAULT NULL,
  proxima DATE DEFAULT NULL,
  intentos TINYINT UNSIGNED NOT NULL DEFAULT 0,
  ia TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_recuperacion_cliente (cliente_id),
  KEY idx_recuperacion_estado (estado, proxima),
  CONSTRAINT fk_recuperacion_cliente FOREIGN KEY (cliente_id) REFERENCES clientes (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
