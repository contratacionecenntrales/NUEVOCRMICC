-- =============================================================================
-- ICC CRM · Migracion: base de inteligencia artificial (fase 1)
-- Se puede importar varias veces. No borra datos.
--
--   ajustes        configuracion del CRM (clave de OpenAI y contrasenas de
--                  buzones cifradas: nunca vuelven al navegador)
--   ia_registro    cada consulta a la IA: quien, para que, tokens (90 dias)
--   ia_acciones    cada cambio que hace la IA, con el valor anterior para
--                  poder deshacerlo
--   cliente_notas  notas en el historial del cliente (las de la IA tambien)
--   cron_registro  cada vuelta del cron unico, bloque a bloque (30 dias)
-- =============================================================================

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS ajustes (
  clave VARCHAR(80) NOT NULL PRIMARY KEY,
  valor MEDIUMTEXT NULL,
  cifrado TINYINT(1) NOT NULL DEFAULT 0,
  actualizado DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  actualizado_por INT UNSIGNED NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ia_registro (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ts DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  usuario_id INT UNSIGNED NULL,
  tipo VARCHAR(40) NOT NULL,
  modelo VARCHAR(60) NOT NULL DEFAULT '',
  tokens_entrada INT UNSIGNED NOT NULL DEFAULT 0,
  tokens_salida INT UNSIGNED NOT NULL DEFAULT 0,
  ms INT UNSIGNED NOT NULL DEFAULT 0,
  ok TINYINT(1) NOT NULL DEFAULT 1,
  error VARCHAR(255) NULL,
  INDEX idx_ia_registro_ts (ts),
  INDEX idx_ia_registro_usuario (usuario_id, ts)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ia_acciones (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ts DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  origen VARCHAR(40) NOT NULL,
  agente VARCHAR(80) NOT NULL DEFAULT '',
  usuario_id INT UNSIGNED NULL,
  lote VARCHAR(40) NULL,
  entidad VARCHAR(40) NOT NULL,
  entidad_id INT UNSIGNED NULL,
  accion VARCHAR(80) NOT NULL,
  detalle VARCHAR(500) NOT NULL DEFAULT '',
  antes MEDIUMTEXT NULL,
  despues MEDIUMTEXT NULL,
  deshecha_en DATETIME NULL,
  INDEX idx_ia_acciones_ts (ts),
  INDEX idx_ia_acciones_lote (lote),
  INDEX idx_ia_acciones_entidad (entidad, entidad_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cliente_notas (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  cliente_id INT UNSIGNED NOT NULL,
  autor_id INT UNSIGNED NULL,
  origen VARCHAR(40) NOT NULL DEFAULT 'persona',
  texto TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_cliente_notas_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE,
  CONSTRAINT fk_cliente_notas_autor FOREIGN KEY (autor_id) REFERENCES usuarios(id) ON DELETE SET NULL,
  INDEX idx_cliente_notas (cliente_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cron_registro (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ts DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  origen VARCHAR(20) NOT NULL DEFAULT 'cron',
  bloque VARCHAR(40) NOT NULL,
  ok TINYINT(1) NOT NULL DEFAULT 1,
  ms INT UNSIGNED NOT NULL DEFAULT 0,
  mensaje VARCHAR(500) NOT NULL DEFAULT '',
  INDEX idx_cron_registro_ts (ts),
  INDEX idx_cron_registro_bloque (bloque, ts)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
