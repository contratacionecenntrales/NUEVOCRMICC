-- =============================================================================
-- ICC CRM · Migracion: Automatizaciones y Embudos (fase 4)
-- Se puede importar varias veces. No borra datos.
--
--   flujos               disparador + arbol de pasos + objetivo
--   flujo_inscripciones  cada contacto dentro de un flujo y el paso en que esta
--   flujo_eventos        cola de cambios del CRM que pueden disparar flujos
--   flujo_registro       cada accion de un flujo (180 dias)
--   flujo_vistos         ultimo estado visto de citas y presupuestos (para detectar cambios)
--   cliente_etiquetas    etiquetas de los clientes
-- =============================================================================

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS flujos (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(160) NOT NULL,
  descripcion VARCHAR(500) NOT NULL DEFAULT '',
  disparador VARCHAR(40) NOT NULL,
  disparador_cfg TEXT NULL,
  filtro TEXT NULL,
  pasos MEDIUMTEXT NOT NULL,
  objetivo TEXT NULL,
  solo_horario TINYINT(1) NOT NULL DEFAULT 1,
  estado ENUM('borrador','activo','pausado') NOT NULL DEFAULT 'borrador',
  token_entrada CHAR(32) NULL,
  gracias_url VARCHAR(255) NOT NULL DEFAULT '',
  plantilla VARCHAR(40) NOT NULL DEFAULT '',
  creado_por INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_flujos_token (token_entrada),
  KEY idx_flujos_estado (estado, disparador)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS flujo_inscripciones (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  flujo_id INT UNSIGNED NOT NULL,
  cliente_id INT UNSIGNED NOT NULL,
  paso_id VARCHAR(20) NOT NULL DEFAULT '',
  proximo DATETIME NULL,
  espera_hasta DATETIME NULL,
  estado ENUM('en_curso','terminado','objetivo','salido') NOT NULL DEFAULT 'en_curso',
  motivo VARCHAR(255) NOT NULL DEFAULT '',
  variante CHAR(1) NULL,
  datos TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_flujo_insc_flujo (flujo_id, estado),
  KEY idx_flujo_insc_cliente (cliente_id),
  KEY idx_flujo_insc_proximo (estado, proximo),
  CONSTRAINT fk_flujo_insc_flujo FOREIGN KEY (flujo_id) REFERENCES flujos (id) ON DELETE CASCADE,
  CONSTRAINT fk_flujo_insc_cliente FOREIGN KEY (cliente_id) REFERENCES clientes (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS flujo_eventos (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ts DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  tipo VARCHAR(40) NOT NULL,
  cliente_id INT UNSIGNED NULL,
  datos TEXT NULL,
  procesado TINYINT(1) NOT NULL DEFAULT 0,
  KEY idx_flujo_eventos_pend (procesado, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS flujo_registro (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ts DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  flujo_id INT UNSIGNED NOT NULL,
  inscripcion_id INT UNSIGNED NULL,
  cliente_id INT UNSIGNED NULL,
  paso_id VARCHAR(20) NOT NULL DEFAULT '',
  accion VARCHAR(40) NOT NULL,
  detalle VARCHAR(500) NOT NULL DEFAULT '',
  KEY idx_flujo_registro_flujo (flujo_id, ts)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS flujo_vistos (
  entidad VARCHAR(20) NOT NULL,
  entidad_id INT UNSIGNED NOT NULL,
  estado VARCHAR(40) NOT NULL,
  PRIMARY KEY (entidad, entidad_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cliente_etiquetas (
  cliente_id INT UNSIGNED NOT NULL,
  etiqueta VARCHAR(60) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (cliente_id, etiqueta),
  KEY idx_cliente_etiquetas_etiqueta (etiqueta),
  CONSTRAINT fk_cliente_etiquetas_cliente FOREIGN KEY (cliente_id) REFERENCES clientes (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
