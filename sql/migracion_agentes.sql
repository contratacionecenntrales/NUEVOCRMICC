-- =============================================================================
-- ICC CRM · Migracion: Zona de agentes (fase 3)
-- Se puede importar varias veces. No borra datos.
--
--   equipo_turnos        cada turno de cada agente (que vio, que hizo)
--   equipo_acciones      cada herramienta usada; las de riesgo esperan en «Para aprobar»
--   equipo_tareas        tareas encargadas a agentes o a personas
--   equipo_cobros        cobros por hitos (marcar pagado: solo personas)
--   equipo_experimentos  Laboratorio: tests A/B de angulo o de nicho
--   equipo_memoria       Cerebro: reglas, aprendizajes, avisos y reglas de la casa
--   equipo_hallazgos     Calidad: errores encontrados por el auditor
--   equipo_cierre        cadencia de cierre de cada presupuesto abierto
-- =============================================================================

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS equipo_turnos (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  agente VARCHAR(30) NOT NULL,
  inicio DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fin DATETIME NULL,
  origen VARCHAR(20) NOT NULL DEFAULT 'cron',
  ia TINYINT(1) NOT NULL DEFAULT 0,
  rondas TINYINT UNSIGNED NOT NULL DEFAULT 0,
  acciones SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  ok TINYINT(1) NOT NULL DEFAULT 1,
  resumen TEXT NULL,
  error VARCHAR(255) NULL,
  KEY idx_eq_turnos_agente (agente, inicio)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS equipo_acciones (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ts DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  agente VARCHAR(30) NOT NULL,
  turno_id INT UNSIGNED NULL,
  herramienta VARCHAR(60) NOT NULL,
  riesgo ENUM('lectura','bajo','alto') NOT NULL DEFAULT 'bajo',
  args MEDIUMTEXT NULL,
  resultado TEXT NULL,
  estado ENUM('hecha','pendiente','aprobada','rechazada','fallida') NOT NULL DEFAULT 'hecha',
  motivo VARCHAR(255) NULL,
  entidad VARCHAR(40) NULL,
  entidad_id INT UNSIGNED NULL,
  decidido_por INT UNSIGNED NULL,
  decidido_en DATETIME NULL,
  KEY idx_eq_acc_estado (estado),
  KEY idx_eq_acc_agente (agente, ts)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS equipo_tareas (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  origen VARCHAR(30) NOT NULL DEFAULT '',
  asignado_agente VARCHAR(30) NULL,
  asignado_usuario INT UNSIGNED NULL,
  titulo VARCHAR(200) NOT NULL,
  detalle TEXT NULL,
  cliente_id INT UNSIGNED NULL,
  hallazgo_id INT UNSIGNED NULL,
  vence DATE NULL,
  estado ENUM('abierta','hecha','cancelada') NOT NULL DEFAULT 'abierta',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cerrada_en DATETIME NULL,
  KEY idx_eq_tareas_estado (estado),
  KEY idx_eq_tareas_agente (asignado_agente),
  KEY idx_eq_tareas_usuario (asignado_usuario)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS equipo_cobros (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  cliente_id INT UNSIGNED NULL,
  concepto VARCHAR(200) NOT NULL,
  hito VARCHAR(120) NOT NULL DEFAULT '',
  importe DECIMAL(10,2) NOT NULL DEFAULT 0,
  vence DATE NULL,
  estado ENUM('pendiente','pagado','anulado') NOT NULL DEFAULT 'pendiente',
  recordatorios TINYINT UNSIGNED NOT NULL DEFAULT 0,
  ultimo_recordatorio DATETIME NULL,
  creado_por INT UNSIGNED NULL,
  pagado_por INT UNSIGNED NULL,
  pagado_en DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_eq_cobros_estado (estado, vence)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS equipo_experimentos (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tipo ENUM('angulo','nicho') NOT NULL DEFAULT 'angulo',
  hipotesis VARCHAR(400) NOT NULL DEFAULT '',
  sector VARCHAR(60) NOT NULL DEFAULT '',
  sector_b VARCHAR(60) NOT NULL DEFAULT '',
  variante_a VARCHAR(40) NOT NULL DEFAULT '',
  variante_b VARCHAR(40) NOT NULL DEFAULT '',
  campana_a INT UNSIGNED NULL,
  campana_b INT UNSIGNED NULL,
  estado ENUM('propuesto','en_marcha','ganador','sin_diferencia','detenido') NOT NULL DEFAULT 'propuesto',
  ganador CHAR(1) NULL,
  resultado TEXT NULL,
  propuesto_por VARCHAR(30) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lanzado_en DATETIME NULL,
  cerrado_en DATETIME NULL,
  KEY idx_eq_exp_estado (estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS equipo_memoria (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tipo ENUM('regla','aprendizaje','aviso','casa') NOT NULL DEFAULT 'aprendizaje',
  texto VARCHAR(600) NOT NULL,
  evidencia VARCHAR(600) NOT NULL DEFAULT '',
  confianza TINYINT UNSIGNED NOT NULL DEFAULT 50,
  sector VARCHAR(60) NOT NULL DEFAULT '',
  angulo VARCHAR(40) NOT NULL DEFAULT '',
  agente VARCHAR(30) NOT NULL DEFAULT '',
  activo TINYINT(1) NOT NULL DEFAULT 1,
  creado_por INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_eq_mem_tipo (tipo, activo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS equipo_hallazgos (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  clave VARCHAR(120) NOT NULL,
  tipo VARCHAR(40) NOT NULL,
  gravedad ENUM('baja','media','alta') NOT NULL DEFAULT 'media',
  texto VARCHAR(400) NOT NULL,
  evidencia VARCHAR(600) NOT NULL DEFAULT '',
  responsable VARCHAR(30) NOT NULL DEFAULT '',
  tarea_id INT UNSIGNED NULL,
  estado ENUM('abierto','resuelto','descartado') NOT NULL DEFAULT 'abierto',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  visto_en DATETIME NULL,
  resuelto_en DATETIME NULL,
  UNIQUE KEY uq_eq_hallazgos_clave (clave),
  KEY idx_eq_hallazgos_estado (estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS equipo_cierre (
  cliente_id INT UNSIGNED NOT NULL PRIMARY KEY,
  presupuesto_id INT UNSIGNED NULL,
  toque TINYINT UNSIGNED NOT NULL DEFAULT 0,
  inicio DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ultimo_toque DATETIME NULL,
  temperatura TINYINT UNSIGNED NOT NULL DEFAULT 0,
  estado ENUM('en_curso','pausado','decision','cerrado') NOT NULL DEFAULT 'en_curso',
  nota VARCHAR(255) NOT NULL DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
