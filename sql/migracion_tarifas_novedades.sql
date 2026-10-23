-- =============================================================================
-- ICC CRM · Migracion: Novedades de tarifas (lo que cambia tramitacion)
-- Importar una sola vez (requiere sql/migracion_comparadores.sql).
--
-- Cada vez que tramitacion da de alta, cambia, retira o borra una tarifa de
-- energia, un perfil de tarifas de telefonia o las comisiones, el CRM guarda
-- una "novedad" con lo que ha cambiado (antes -> despues) y avisa al equipo.
--
--   tarifas_novedades         las novedades (una por operacion)
--   tarifas_novedades_vistas  hasta que novedad ha visto cada usuario
--                             (para el contador de "no vistas")
-- =============================================================================

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS tarifas_novedades (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tipo VARCHAR(20) NOT NULL,            -- 'energia' | 'telefonia'
  accion VARCHAR(20) NOT NULL,          -- 'alta' | 'cambio' | 'baja'
  titulo VARCHAR(255) NOT NULL,
  detalle TEXT NULL,                    -- JSON: {tendencia, cambios:[{label, antes, despues, unidad, pct, sentido}], ...}
  referencia_id INT UNSIGNED NULL,      -- id de la tarifa/comision/perfil
  autor_id INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_tarifa_novedad_autor FOREIGN KEY (autor_id) REFERENCES usuarios(id) ON DELETE SET NULL,
  INDEX idx_tarifas_novedades_fecha (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tarifas_novedades_vistas (
  usuario_id INT UNSIGNED NOT NULL PRIMARY KEY,
  ultima_id INT UNSIGNED NOT NULL DEFAULT 0,
  vista_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_tarifa_novedad_vista_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
