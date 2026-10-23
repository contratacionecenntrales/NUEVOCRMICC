-- =============================================================================
-- ICC CRM · Migracion: red de oficinas
-- Se puede importar varias veces. No borra datos.
--
-- Cada oficina (delegacion, distribuidor) tiene su ficha: provincia, ciudad,
-- contacto y responsable. Cada usuario puede pertenecer a una oficina
-- (usuarios.oficina_id) y el CRM calcula las metricas de cada oficina con
-- los datos reales de sus personas.
-- =============================================================================

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS oficinas (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(150) NOT NULL,
  provincia VARCHAR(60) NOT NULL DEFAULT '',
  ciudad VARCHAR(100) NOT NULL DEFAULT '',
  direccion VARCHAR(255) NOT NULL DEFAULT '',
  telefono VARCHAR(30) NOT NULL DEFAULT '',
  email VARCHAR(190) NOT NULL DEFAULT '',
  responsable_id INT UNSIGNED NULL,
  activa TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_oficina_responsable FOREIGN KEY (responsable_id) REFERENCES usuarios(id) ON DELETE SET NULL,
  INDEX idx_oficinas_provincia (provincia)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Columna, indice y clave de usuarios.oficina_id (se puede ejecutar varias veces).
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE usuarios ADD COLUMN oficina_id INT UNSIGNED NULL', 'DO 0')
          FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'usuarios' AND COLUMN_NAME = 'oficina_id');
PREPARE q FROM @s; EXECUTE q; DEALLOCATE PREPARE q;
SET @s = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX idx_usuarios_oficina ON usuarios(oficina_id)', 'DO 0')
          FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'usuarios' AND INDEX_NAME = 'idx_usuarios_oficina');
PREPARE q FROM @s; EXECUTE q; DEALLOCATE PREPARE q;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE usuarios ADD CONSTRAINT fk_usuario_oficina FOREIGN KEY (oficina_id) REFERENCES oficinas(id) ON DELETE SET NULL', 'DO 0')
          FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'usuarios' AND CONSTRAINT_NAME = 'fk_usuario_oficina');
PREPARE q FROM @s; EXECUTE q; DEALLOCATE PREPARE q;
