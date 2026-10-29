-- =============================================================================
-- ICC CRM · Migracion: Centro de Seguridad (blindaje)
-- Se puede importar varias veces. No borra datos.
--
--   seg_2fa         doble factor (codigo del movil, TOTP) de cada cuenta
--   seg_accesos     cada intento de entrada, bueno o malo (180 dias)
--   seg_intentos    intentos fallidos recientes (freno contra fuerza bruta)
--   seg_bloqueos    IPs o cuentas frenadas temporalmente
--   seg_bitacora    bitacora sellada: cada apunte lleva la huella del anterior,
--                   asi se detecta si alguien la modifica o borra por fuera
--   seg_ajustes     ultimo eslabon de la bitacora
-- =============================================================================

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS seg_2fa (
  usuario_id INT UNSIGNED NOT NULL PRIMARY KEY,
  secreto VARCHAR(64) NOT NULL,
  activo TINYINT(1) NOT NULL DEFAULT 0,
  ultimo_paso BIGINT NOT NULL DEFAULT 0,
  recuperacion TEXT NULL,
  activado DATETIME NULL,
  creado DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_seg_2fa_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS seg_accesos (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ts DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  usuario_id INT UNSIGNED NULL,
  email VARCHAR(190) NULL,
  ip VARCHAR(64) NULL,
  agente VARCHAR(255) NULL,
  resultado VARCHAR(20) NOT NULL,
  detalle VARCHAR(255) NULL,
  CONSTRAINT fk_seg_accesos_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL,
  INDEX idx_seg_accesos_ts (ts),
  INDEX idx_seg_accesos_ip (ip, ts),
  INDEX idx_seg_accesos_usuario (usuario_id, resultado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS seg_intentos (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(190) NOT NULL,
  ip VARCHAR(64) NULL,
  ts DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_seg_intentos_ts (ts),
  INDEX idx_seg_intentos_email (email, ts),
  INDEX idx_seg_intentos_ip (ip, ts)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS seg_bloqueos (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tipo VARCHAR(10) NOT NULL,
  valor VARCHAR(190) NOT NULL,
  hasta DATETIME NOT NULL,
  motivo VARCHAR(255) NOT NULL DEFAULT '',
  creado DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_seg_bloqueo (tipo, valor),
  INDEX idx_seg_bloqueos_hasta (hasta)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS seg_bitacora (
  seq BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ts DATETIME NOT NULL,
  actor_id INT UNSIGNED NULL,
  actor_nombre VARCHAR(190) NOT NULL DEFAULT '',
  destino_id INT UNSIGNED NULL,
  accion VARCHAR(200) NOT NULL,
  detalle TEXT NULL,
  ip VARCHAR(64) NULL,
  cadena CHAR(64) NOT NULL,
  INDEX idx_seg_bitacora_ts (ts)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS seg_ajustes (
  clave VARCHAR(60) NOT NULL PRIMARY KEY,
  valor TEXT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
