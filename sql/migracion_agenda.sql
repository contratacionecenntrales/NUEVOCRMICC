-- =============================================================================
-- ICC CRM · Migracion: tabla "citas" (Agenda comercial y visitas). Segura de
-- ejecutar sobre una base de datos que ya tenga schema.sql importado (si
-- instalas desde cero, con el schema.sql actualizado basta, no hace falta
-- ademas esta migracion).
-- =============================================================================

CREATE TABLE IF NOT EXISTS citas (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  comercial_id INT UNSIGNED NOT NULL,
  cliente_nombre VARCHAR(200) NOT NULL,
  contacto_nombre VARCHAR(150) NOT NULL DEFAULT '',
  telefono VARCHAR(30) NOT NULL DEFAULT '',
  direccion VARCHAR(500) NOT NULL DEFAULT '',
  sector ENUM('energia','telecomunicaciones','alarmas','multisectorial') NOT NULL DEFAULT 'energia',
  fecha DATE NOT NULL,
  hora_inicio TIME NOT NULL,
  hora_fin TIME NOT NULL,
  estado ENUM('programada','realizada','reprogramada','ko') NOT NULL DEFAULT 'programada',
  notas TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_cita_comercial FOREIGN KEY (comercial_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  INDEX idx_citas_comercial_fecha (comercial_id, fecha),
  INDEX idx_citas_fecha (fecha)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
