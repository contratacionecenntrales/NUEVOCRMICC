-- ICC CRM v96 · Zona de entrevistas: agentes de WhatsApp que entrevistan candidatos.
-- Idempotente.
CREATE TABLE IF NOT EXISTS rrhh_agentes (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre VARCHAR(80) NOT NULL,
  phone_number_id VARCHAR(40) NOT NULL DEFAULT '',
  numero_visible VARCHAR(30) NOT NULL DEFAULT '',
  tono VARCHAR(160) NOT NULL DEFAULT 'cercano y profesional, de tú',
  activo TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_rrhh_ag_phone (phone_number_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rrhh_vacantes (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  titulo VARCHAR(160) NOT NULL,
  ubicacion VARCHAR(160) NOT NULL DEFAULT '',
  modalidad VARCHAR(60) NOT NULL DEFAULT '',
  jornada VARCHAR(80) NOT NULL DEFAULT '',
  salario VARCHAR(160) NOT NULL DEFAULT '',
  descripcion TEXT DEFAULT NULL,
  filtros MEDIUMTEXT DEFAULT NULL,
  preguntas MEDIUMTEXT DEFAULT NULL,
  puntuacion_min TINYINT UNSIGNED NOT NULL DEFAULT 60,
  plazas SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  agente_id INT UNSIGNED DEFAULT NULL,
  responsable_id INT UNSIGNED DEFAULT NULL,
  auto_agendar TINYINT(1) NOT NULL DEFAULT 1,
  estado ENUM('borrador','activa','pausada','cerrada') NOT NULL DEFAULT 'borrador',
  token CHAR(32) DEFAULT NULL,
  creado_por INT UNSIGNED DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_rrhh_vac_token (token),
  KEY idx_rrhh_vac_estado (estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rrhh_candidatos (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre VARCHAR(160) NOT NULL DEFAULT '',
  telefono VARCHAR(20) NOT NULL,
  email VARCHAR(190) NOT NULL DEFAULT '',
  origen VARCHAR(30) NOT NULL DEFAULT 'manual',
  consentimiento DATETIME DEFAULT NULL,
  bolsa_hasta DATE DEFAULT NULL,
  baja TINYINT(1) NOT NULL DEFAULT 0,
  ultimo_entrante DATETIME DEFAULT NULL,
  notas TEXT DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_rrhh_cand_tel (telefono)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rrhh_entrevistas (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  vacante_id INT UNSIGNED NOT NULL,
  candidato_id INT UNSIGNED NOT NULL,
  agente_id INT UNSIGNED DEFAULT NULL,
  canal ENUM('whatsapp','prueba') NOT NULL DEFAULT 'whatsapp',
  estado ENUM('invitado','en_curso','preseleccionado','revisar','no_cumple','agendada','contratado','descartado','abandonada','baja') NOT NULL DEFAULT 'invitado',
  paso VARCHAR(30) NOT NULL DEFAULT 'inicio',
  intentos TINYINT UNSIGNED NOT NULL DEFAULT 0,
  respuestas MEDIUMTEXT DEFAULT NULL,
  puntuacion TINYINT UNSIGNED DEFAULT NULL,
  resumen TEXT DEFAULT NULL,
  motivo VARCHAR(500) NOT NULL DEFAULT '',
  huecos VARCHAR(200) DEFAULT NULL,
  cita_id INT UNSIGNED DEFAULT NULL,
  cita_en DATETIME DEFAULT NULL,
  recordatorios TINYINT UNSIGNED NOT NULL DEFAULT 0,
  aviso_cita TINYINT UNSIGNED NOT NULL DEFAULT 0,
  decidido_por INT UNSIGNED DEFAULT NULL,
  decidido_en DATETIME DEFAULT NULL,
  ultimo_saliente DATETIME DEFAULT NULL,
  ultimo_entrante DATETIME DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_rrhh_ent_estado (estado, updated_at),
  KEY idx_rrhh_ent_vac (vacante_id, estado),
  KEY idx_rrhh_ent_cand (candidato_id),
  CONSTRAINT fk_rrhh_ent_vac FOREIGN KEY (vacante_id) REFERENCES rrhh_vacantes (id) ON DELETE CASCADE,
  CONSTRAINT fk_rrhh_ent_cand FOREIGN KEY (candidato_id) REFERENCES rrhh_candidatos (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rrhh_mensajes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  entrevista_id INT UNSIGNED DEFAULT NULL,
  candidato_id INT UNSIGNED NOT NULL,
  agente_id INT UNSIGNED DEFAULT NULL,
  direccion ENUM('entrada','salida') NOT NULL,
  texto TEXT NOT NULL,
  wa_id VARCHAR(120) DEFAULT NULL,
  estado VARCHAR(20) NOT NULL DEFAULT 'enviado',
  error VARCHAR(255) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_rrhh_msg_cand (candidato_id, id),
  KEY idx_rrhh_msg_wa (wa_id),
  CONSTRAINT fk_rrhh_msg_cand FOREIGN KEY (candidato_id) REFERENCES rrhh_candidatos (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
