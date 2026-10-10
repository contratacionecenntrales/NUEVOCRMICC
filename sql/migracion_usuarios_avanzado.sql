-- =============================================================================
-- ICC CRM · Migracion: ficha de usuario avanzada
-- (informacion ampliada, permisos granulares, disponibilidad, preferencias de
-- notificaciones y seguridad: sesiones activas, cambio de contrasena
-- obligatorio e historial de la cuenta).
--
-- Ejecutala UNA sola vez sobre una base de datos que ya tenga schema.sql y
-- sql/migracion_ficha_agente.sql importados. Mientras no la ejecutes, el CRM
-- sigue funcionando igual que antes (las pestanas nuevas avisan de que falta).
-- =============================================================================

ALTER TABLE usuarios ADD COLUMN numero_relacion VARCHAR(20) NULL AFTER id;
ALTER TABLE usuarios ADD COLUMN prefijo_telefono VARCHAR(8) NOT NULL DEFAULT '+34' AFTER telefono;
ALTER TABLE usuarios ADD COLUMN extension VARCHAR(10) NOT NULL DEFAULT '' AFTER prefijo_telefono;
ALTER TABLE usuarios ADD COLUMN avatar_ruta VARCHAR(255) NULL AFTER extension;
ALTER TABLE usuarios ADD COLUMN ultimo_acceso DATETIME NULL;
ALTER TABLE usuarios ADD COLUMN debe_cambiar_password TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE usuarios ADD COLUMN password_actualizada_en DATETIME NULL;

UPDATE usuarios SET numero_relacion = CONCAT('ICC-', LPAD(id, 5, '0')) WHERE numero_relacion IS NULL;
CREATE UNIQUE INDEX idx_usuarios_numero_relacion ON usuarios(numero_relacion);

-- Excepciones de permisos respecto a los de fabrica de su rol
-- (concedido = 1 da un permiso extra, 0 lo quita).
CREATE TABLE IF NOT EXISTS usuarios_permisos (
  usuario_id INT UNSIGNED NOT NULL,
  permiso VARCHAR(60) NOT NULL,
  concedido TINYINT(1) NOT NULL,
  actualizado_por INT UNSIGNED NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (usuario_id, permiso),
  CONSTRAINT fk_usuperm_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_usuperm_autor FOREIGN KEY (actualizado_por) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sesiones abiertas de cada usuario (permite verlas y cerrarlas en remoto).
CREATE TABLE IF NOT EXISTS usuarios_sesiones (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  ip VARCHAR(45) NULL,
  user_agent VARCHAR(255) NOT NULL DEFAULT '',
  creada_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ultima_actividad DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cerrada_en DATETIME NULL,
  cerrada_por INT UNSIGNED NULL,
  motivo_cierre VARCHAR(60) NOT NULL DEFAULT '',
  CONSTRAINT fk_ususes_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_ususes_cerrada_por FOREIGN KEY (cerrada_por) REFERENCES usuarios(id) ON DELETE SET NULL,
  INDEX idx_ususes_usuario (usuario_id, cerrada_en)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Historial de la cuenta: accesos, cambios de datos, rol, permisos, seguridad.
CREATE TABLE IF NOT EXISTS usuarios_auditoria (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT UNSIGNED NOT NULL,
  autor_id INT UNSIGNED NULL,
  accion VARCHAR(60) NOT NULL,
  detalle VARCHAR(500) NOT NULL DEFAULT '',
  ip VARCHAR(45) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_usuaud_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_usuaud_autor FOREIGN KEY (autor_id) REFERENCES usuarios(id) ON DELETE SET NULL,
  INDEX idx_usuaud_usuario (usuario_id, created_at),
  INDEX idx_usuaud_accion (usuario_id, accion, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Disponibilidad (horario semanal + estado) y preferencias de avisos.
CREATE TABLE IF NOT EXISTS usuarios_preferencias (
  usuario_id INT UNSIGNED NOT NULL PRIMARY KEY,
  horario TEXT NULL,
  estado_disponibilidad ENUM('disponible','ocupado','ausente','vacaciones','baja') NOT NULL DEFAULT 'disponible',
  ausencia_desde DATE NULL,
  ausencia_hasta DATE NULL,
  nota_disponibilidad VARCHAR(255) NOT NULL DEFAULT '',
  notificaciones TEXT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_usupref_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
