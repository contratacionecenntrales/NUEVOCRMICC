-- =============================================================================
-- ICC CRM · Migracion: agente de mantenimiento del pipeline (fase 6)
-- Se puede importar varias veces. No borra datos.
--
--   saneo_registro   cada cambio con su valor anterior, agrupado por pasada (lote)
--   saneo_memoria    lo que recuerda de cada oportunidad: reprogramaciones,
--                    «mantener» decidido por una persona y valor quitado a mano
-- =============================================================================

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS saneo_registro (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ts DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lote CHAR(16) NOT NULL,
  origen VARCHAR(20) NOT NULL DEFAULT 'cron',
  usuario_id INT UNSIGNED NULL,
  cliente_id INT UNSIGNED NOT NULL,
  problema VARCHAR(30) NOT NULL,
  campo VARCHAR(40) NOT NULL,
  antes VARCHAR(500) NULL,
  despues VARCHAR(500) NULL,
  cita_id INT UNSIGNED NULL,
  deshecho TINYINT(1) NOT NULL DEFAULT 0,
  KEY idx_saneo_registro_lote (lote),
  KEY idx_saneo_registro_cliente (cliente_id),
  KEY idx_saneo_registro_ts (ts)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS saneo_memoria (
  cliente_id INT UNSIGNED NOT NULL PRIMARY KEY,
  reprogramaciones TINYINT UNSIGNED NOT NULL DEFAULT 0,
  mantener_hasta DATE NULL,
  valor_quitado TINYINT(1) NOT NULL DEFAULT 0,
  actualizado DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
