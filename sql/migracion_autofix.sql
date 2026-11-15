-- ICC CRM v94 · Autocorrector: memoria de incidencias (que paso, que se intento, cuantas veces).
-- Idempotente.
CREATE TABLE IF NOT EXISTS autofix_memoria (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  clave VARCHAR(120) NOT NULL,
  proceso VARCHAR(40) NOT NULL,
  titulo VARCHAR(200) NOT NULL,
  detalle VARCHAR(1000) NOT NULL DEFAULT '',
  estado ENUM('abierta','arreglada','persona') NOT NULL DEFAULT 'abierta',
  accion VARCHAR(500) NOT NULL DEFAULT '',
  enlace VARCHAR(120) NOT NULL DEFAULT '',
  intentos SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  veces SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  primera DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ultima DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  arreglada_en DATETIME DEFAULT NULL,
  aviso_en DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_autofix_clave (clave),
  KEY idx_autofix_estado (estado, ultima)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
