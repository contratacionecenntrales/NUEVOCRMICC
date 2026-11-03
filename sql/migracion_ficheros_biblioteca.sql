-- =============================================================================
-- ICC CRM · Migracion: Biblioteca de formacion y recursos (Ficheros)
-- Se puede importar varias veces. No borra datos.
--
-- Cada archivo de Ficheros puede llevar un titulo profesional, una
-- descripcion, una categoria (ruta de inicio, presentaciones, tramitacion,
-- formacion, ofertas tacticas) y su paso dentro de la ruta de inicio del
-- comercial. ficheros_progreso guarda que pasos ha completado cada persona.
-- =============================================================================

SET NAMES utf8mb4;

SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE ficheros ADD COLUMN titulo VARCHAR(200) NULL', 'DO 0')
          FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ficheros' AND COLUMN_NAME = 'titulo');
PREPARE q FROM @s; EXECUTE q; DEALLOCATE PREPARE q;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE ficheros ADD COLUMN descripcion VARCHAR(400) NULL', 'DO 0')
          FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ficheros' AND COLUMN_NAME = 'descripcion');
PREPARE q FROM @s; EXECUTE q; DEALLOCATE PREPARE q;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE ficheros ADD COLUMN categoria VARCHAR(20) NULL', 'DO 0')
          FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ficheros' AND COLUMN_NAME = 'categoria');
PREPARE q FROM @s; EXECUTE q; DEALLOCATE PREPARE q;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE ficheros ADD COLUMN ruta_paso SMALLINT NULL', 'DO 0')
          FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ficheros' AND COLUMN_NAME = 'ruta_paso');
PREPARE q FROM @s; EXECUTE q; DEALLOCATE PREPARE q;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE ficheros ADD COLUMN duracion_min SMALLINT NULL', 'DO 0')
          FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ficheros' AND COLUMN_NAME = 'duracion_min');
PREPARE q FROM @s; EXECUTE q; DEALLOCATE PREPARE q;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE ficheros ADD COLUMN paginas SMALLINT NULL', 'DO 0')
          FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ficheros' AND COLUMN_NAME = 'paginas');
PREPARE q FROM @s; EXECUTE q; DEALLOCATE PREPARE q;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE ficheros ADD COLUMN orden INT NOT NULL DEFAULT 0', 'DO 0')
          FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ficheros' AND COLUMN_NAME = 'orden');
PREPARE q FROM @s; EXECUTE q; DEALLOCATE PREPARE q;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE ficheros ADD COLUMN vistas INT NOT NULL DEFAULT 0', 'DO 0')
          FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ficheros' AND COLUMN_NAME = 'vistas');
PREPARE q FROM @s; EXECUTE q; DEALLOCATE PREPARE q;

CREATE TABLE IF NOT EXISTS ficheros_progreso (
  usuario_id INT UNSIGNED NOT NULL,
  fichero_id INT UNSIGNED NOT NULL,
  completado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (usuario_id, fichero_id),
  CONSTRAINT fk_fprog_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_fprog_fichero FOREIGN KEY (fichero_id) REFERENCES ficheros(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
