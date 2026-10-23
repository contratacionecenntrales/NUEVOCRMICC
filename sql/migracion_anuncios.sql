-- =============================================================================
-- ICC CRM · Migracion: anuncios de direccion
-- Se puede importar varias veces. No borra datos.
--
-- Mensajes que publica direccion (Admin, Gerente, Coordinador, Super Admin)
-- para que todo el equipo los vea en la cinta en directo, en la sala de
-- ventas y en el mapa (la provincia del anuncio late). Caducan solos.
-- =============================================================================

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS anuncios (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  texto VARCHAR(280) NOT NULL,
  emoji VARCHAR(16) NOT NULL DEFAULT '📣',
  provincia VARCHAR(60) NOT NULL DEFAULT '',
  ciudad VARCHAR(100) NOT NULL DEFAULT '',
  inicio DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expira DATETIME NOT NULL,
  autor_id INT UNSIGNED NULL,
  usuario_id INT UNSIGNED NULL,           -- persona protagonista (su foto de perfil)
  foto_ruta VARCHAR(255) NULL,            -- foto subida para el anuncio (storage/anuncios)
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_anuncio_autor FOREIGN KEY (autor_id) REFERENCES usuarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_anuncio_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL,
  INDEX idx_anuncios_vigencia (inicio, expira)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- v74: protagonista y foto (para bases que ya tenian la tabla de la v73).
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE anuncios ADD COLUMN usuario_id INT UNSIGNED NULL', 'DO 0')
          FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'anuncios' AND COLUMN_NAME = 'usuario_id');
PREPARE q FROM @s; EXECUTE q; DEALLOCATE PREPARE q;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE anuncios ADD COLUMN foto_ruta VARCHAR(255) NULL', 'DO 0')
          FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'anuncios' AND COLUMN_NAME = 'foto_ruta');
PREPARE q FROM @s; EXECUTE q; DEALLOCATE PREPARE q;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE anuncios ADD CONSTRAINT fk_anuncio_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL', 'DO 0')
          FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'anuncios' AND CONSTRAINT_NAME = 'fk_anuncio_usuario');
PREPARE q FROM @s; EXECUTE q; DEALLOCATE PREPARE q;
