-- =============================================================================
-- ICC CRM · Migracion: ficha avanzada de cada agente (area privada)
-- Segura de ejecutar sobre una base de datos que ya tenga schema.sql importado,
-- y tambien de volver a ejecutar (CREATE TABLE IF NOT EXISTS).
--
-- Cada usuario tiene una ficha privada que solo ven el propio agente, su
-- Jefe de equipo y Admin/Super Admin (nunca otros comerciales ni otros
-- equipos). Los dos lados ven exactamente la misma ficha.
--   - agentes_ficha: datos personales, laborales y objetivos.
--   - agentes_seguimiento: historial de notas, reuniones, objetivos,
--     formaciones, incidencias y reconocimientos.
-- =============================================================================

CREATE TABLE IF NOT EXISTS agentes_ficha (
  usuario_id INT UNSIGNED NOT NULL PRIMARY KEY,
  dni VARCHAR(20) NOT NULL DEFAULT '',
  fecha_nacimiento DATE NULL,
  direccion VARCHAR(255) NOT NULL DEFAULT '',
  poblacion VARCHAR(120) NOT NULL DEFAULT '',
  provincia VARCHAR(120) NOT NULL DEFAULT '',
  codigo_postal VARCHAR(10) NOT NULL DEFAULT '',
  email_personal VARCHAR(190) NOT NULL DEFAULT '',
  iban VARCHAR(40) NOT NULL DEFAULT '',
  contacto_emergencia VARCHAR(190) NOT NULL DEFAULT '',
  tipo_relacion ENUM('autonomo','empleado','colaborador','subagente','otro') NULL,
  fecha_incorporacion DATE NULL,
  zona VARCHAR(190) NOT NULL DEFAULT '',
  sectores VARCHAR(255) NOT NULL DEFAULT '',
  objetivo_contratos_mes INT UNSIGNED NULL,
  objetivo_kw_mes DECIMAL(10,2) NULL,
  objetivo_facturacion_mes DECIMAL(10,2) NULL,
  observaciones TEXT NULL,
  actualizado_por INT UNSIGNED NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_agente_ficha_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_agente_ficha_actualizado FOREIGN KEY (actualizado_por) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS agentes_seguimiento (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT UNSIGNED NOT NULL,
  autor_id INT UNSIGNED NULL,
  tipo ENUM('nota','reunion','objetivo','formacion','incidencia','reconocimiento') NOT NULL DEFAULT 'nota',
  titulo VARCHAR(190) NOT NULL,
  contenido TEXT NULL,
  fecha DATE NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_agente_seg_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_agente_seg_autor FOREIGN KEY (autor_id) REFERENCES usuarios(id) ON DELETE SET NULL,
  INDEX idx_agente_seg_usuario_fecha (usuario_id, fecha)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
