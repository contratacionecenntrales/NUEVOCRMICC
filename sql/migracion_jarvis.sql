-- =============================================================================
-- ICC CRM · Migracion: Jarvis, asistente de voz y texto (fase 5)
-- Se puede importar varias veces. No borra datos.
--
--   jarvis_registro   cada consulta: persona, tipo (texto o voz), herramientas (90 dias)
--   jarvis_usadas     propuestas ya confirmadas o descartadas (no se confirman dos veces)
-- =============================================================================

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS jarvis_registro (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ts DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  usuario_id INT UNSIGNED NULL,
  tipo VARCHAR(20) NOT NULL DEFAULT 'texto',
  pregunta VARCHAR(1000) NOT NULL DEFAULT '',
  herramientas VARCHAR(500) NOT NULL DEFAULT '',
  ia TINYINT(1) NOT NULL DEFAULT 1,
  KEY idx_jarvis_registro_ts (ts),
  KEY idx_jarvis_registro_usuario (usuario_id, ts)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS jarvis_usadas (
  nonce CHAR(32) NOT NULL PRIMARY KEY,
  usuario_id INT UNSIGNED NULL,
  resultado VARCHAR(20) NOT NULL DEFAULT 'confirmada',
  ts DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_jarvis_usadas_ts (ts)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
