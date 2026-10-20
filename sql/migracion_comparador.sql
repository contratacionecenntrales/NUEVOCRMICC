-- =============================================================================
-- ICC CRM · Migracion: Comparador y Auditor Inteligente (Energia / Telefonia /
-- Alarmas), integrado dentro del CRM (mismo login y roles, sin tabla de
-- usuarios separada). Segura de ejecutar sobre una base de datos que ya
-- tenga schema.sql importado.
-- =============================================================================

SET NAMES utf8mb4;

-- -----------------------------------------------------------------------------
-- tarifa_energia — catalogo de tarifas propias de luz (2.0TD/3.0TD) y gas
-- (RL.1/RL.2/RL.3), con periodos P1-P6 para soportar cualquier peaje.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tarifa_energia (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  proveedor VARCHAR(150) NOT NULL DEFAULT 'Integral Connection Consulting',
  nombre_tarifa VARCHAR(150) NOT NULL,
  tipo ENUM('luz', 'gas') NOT NULL,
  segmento VARCHAR(20) NOT NULL,
  descripcion TEXT,

  precio_potencia_p1 DECIMAL(10,6) NOT NULL DEFAULT 0,
  precio_potencia_p2 DECIMAL(10,6) NOT NULL DEFAULT 0,
  precio_potencia_p3 DECIMAL(10,6) NOT NULL DEFAULT 0,
  precio_potencia_p4 DECIMAL(10,6) NOT NULL DEFAULT 0,
  precio_potencia_p5 DECIMAL(10,6) NOT NULL DEFAULT 0,
  precio_potencia_p6 DECIMAL(10,6) NOT NULL DEFAULT 0,

  precio_energia_p1 DECIMAL(10,6) NOT NULL DEFAULT 0,
  precio_energia_p2 DECIMAL(10,6) NOT NULL DEFAULT 0,
  precio_energia_p3 DECIMAL(10,6) NOT NULL DEFAULT 0,
  precio_energia_p4 DECIMAL(10,6) NOT NULL DEFAULT 0,
  precio_energia_p5 DECIMAL(10,6) NOT NULL DEFAULT 0,
  precio_energia_p6 DECIMAL(10,6) NOT NULL DEFAULT 0,

  termino_fijo_mensual DECIMAL(10,4) NOT NULL DEFAULT 0,
  alquiler_equipo_dia DECIMAL(10,6) NOT NULL DEFAULT 0,

  comision_captacion DECIMAL(10,2) NOT NULL DEFAULT 0,
  permanencia_meses INT NOT NULL DEFAULT 0,

  activo TINYINT(1) NOT NULL DEFAULT 1,
  destacada TINYINT(1) NOT NULL DEFAULT 0,

  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_tarifa_energia_tipo_segmento (tipo, segmento, activo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- tarifa_telefonia — movil, fibra, fijo, convergentes y centralita
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tarifa_telefonia (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  proveedor VARCHAR(150) NOT NULL DEFAULT 'Integral Connection Consulting',
  nombre_tarifa VARCHAR(150) NOT NULL,
  tipo ENUM('movil', 'fibra', 'fijo', 'convergente', 'centralita') NOT NULL,
  descripcion TEXT,

  gb_datos DECIMAL(10,2) DEFAULT NULL,
  datos_ilimitados TINYINT(1) NOT NULL DEFAULT 0,
  llamadas_ilimitadas TINYINT(1) NOT NULL DEFAULT 1,
  minutos_incluidos DECIMAL(10,2) DEFAULT NULL,
  velocidad_fibra_mb DECIMAL(10,2) DEFAULT NULL,
  lineas_moviles_incluidas INT NOT NULL DEFAULT 0,
  lineas_fijas_incluidas INT NOT NULL DEFAULT 0,
  extras VARCHAR(500) DEFAULT NULL,

  precio_mensual DECIMAL(10,2) NOT NULL DEFAULT 0,
  permanencia_meses INT NOT NULL DEFAULT 0,
  comision_captacion DECIMAL(10,2) NOT NULL DEFAULT 0,

  activo TINYINT(1) NOT NULL DEFAULT 1,
  destacada TINYINT(1) NOT NULL DEFAULT 0,

  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_tarifa_telefonia_tipo (tipo, activo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- tarifa_alarmas — kits de seguridad residencial y comercial
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tarifa_alarmas (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  proveedor VARCHAR(150) NOT NULL DEFAULT 'Integral Connection Consulting',
  nombre_kit VARCHAR(150) NOT NULL,
  tipo_kit ENUM('basica', 'camaras', 'gama_alta', 'comercial') NOT NULL,
  descripcion TEXT,
  equipamiento VARCHAR(1000) DEFAULT NULL,

  num_camaras INT NOT NULL DEFAULT 0,
  num_sensores INT NOT NULL DEFAULT 0,
  num_mandos INT NOT NULL DEFAULT 0,
  conexion_movil TINYINT(1) NOT NULL DEFAULT 1,
  central_receptora TINYINT(1) NOT NULL DEFAULT 1,

  cuota_mensual DECIMAL(10,2) NOT NULL DEFAULT 0,
  coste_instalacion DECIMAL(10,2) NOT NULL DEFAULT 0,
  permanencia_meses INT NOT NULL DEFAULT 0,
  comision_captacion DECIMAL(10,2) NOT NULL DEFAULT 0,

  activo TINYINT(1) NOT NULL DEFAULT 1,
  destacada TINYINT(1) NOT NULL DEFAULT 0,

  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_tarifa_alarmas_tipo (tipo_kit, activo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- comparador_auditorias — historico de comparativas generadas desde la ficha
-- de un cliente ya existente en el CRM (a diferencia de la app original, aqui
-- SIEMPRE va ligada a un cliente/usuario del propio CRM, no a datos sueltos).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS comparador_auditorias (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  cliente_id INT UNSIGNED NOT NULL,
  gestor_id INT UNSIGNED NULL,
  sector ENUM('energia', 'telefonia', 'alarmas') NOT NULL,

  datos_entrada LONGTEXT NOT NULL,
  resultado LONGTEXT NOT NULL,

  coste_actual_anual DECIMAL(12,2) DEFAULT NULL,
  coste_propuesto_anual DECIMAL(12,2) DEFAULT NULL,
  ahorro_anual DECIMAL(12,2) DEFAULT NULL,
  ahorro_porcentaje DECIMAL(6,2) DEFAULT NULL,

  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_comparador_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE,
  CONSTRAINT fk_comparador_gestor FOREIGN KEY (gestor_id) REFERENCES usuarios(id) ON DELETE SET NULL,
  INDEX idx_comparador_cliente (cliente_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
