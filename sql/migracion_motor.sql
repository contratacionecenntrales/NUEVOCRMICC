-- =============================================================================
-- ICC CRM · Migracion: Motor de prospeccion IA (fase 2)
-- Se puede importar varias veces. No borra datos.
--
--   motor_campanas   campanas de correo (con aprobacion, solo borradores o autonoma)
--   motor_leads      empresas encontradas (Google Places, webs, CSV, barrido)
--   motor_mensajes   correos enviados, pendientes de revisar y respuestas
--   motor_bajas      lista de exclusion (correos y dominios), respetada en todo el CRM
--   motor_log        lo que va haciendo el Motor (180 dias)
--   motor_cobertura  sector x concejo ya barrido (lo usa la Zona de agentes)
--   clientes         + decisor, proximo paso, ultima actividad, origen, no contactar
-- =============================================================================

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS motor_campanas (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(160) NOT NULL,
  sector VARCHAR(60) NOT NULL DEFAULT '',
  angulo VARCHAR(40) NOT NULL DEFAULT 'ahorro_factura',
  modo ENUM('aprobacion','borradores','autonomo') NOT NULL DEFAULT 'aprobacion',
  estado ENUM('activa','pausada','terminada') NOT NULL DEFAULT 'activa',
  siempre_activa TINYINT(1) NOT NULL DEFAULT 0,
  gestor_id INT UNSIGNED NULL,
  experimento_id INT UNSIGNED NULL,
  variante CHAR(1) NULL,
  creado_por INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_motor_camp_estado (estado),
  KEY idx_motor_camp_sector (sector)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS motor_leads (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  campana_id INT UNSIGNED NULL,
  place_id VARCHAR(190) NULL,
  nombre VARCHAR(190) NOT NULL,
  razon_social VARCHAR(190) NOT NULL DEFAULT '',
  cif VARCHAR(20) NOT NULL DEFAULT '',
  sector VARCHAR(60) NOT NULL DEFAULT '',
  direccion VARCHAR(255) NOT NULL DEFAULT '',
  localidad VARCHAR(120) NOT NULL DEFAULT '',
  concejo VARCHAR(120) NOT NULL DEFAULT '',
  comarca VARCHAR(80) NOT NULL DEFAULT '',
  cp VARCHAR(10) NOT NULL DEFAULT '',
  telefono VARCHAR(40) NOT NULL DEFAULT '',
  web VARCHAR(255) NOT NULL DEFAULT '',
  email VARCHAR(190) NOT NULL DEFAULT '',
  mx_ok TINYINT(1) NOT NULL DEFAULT 0,
  madurez VARCHAR(255) NOT NULL DEFAULT '',
  extracto TEXT NULL,
  analizado_en DATETIME NULL,
  analisis_error VARCHAR(255) NULL,
  estado ENUM('nuevo','en_campana','contactado','respondido','interesado','descartado','baja','en_crm') NOT NULL DEFAULT 'nuevo',
  canal ENUM('correo','telefono','visita') NOT NULL DEFAULT 'correo',
  paso TINYINT UNSIGNED NOT NULL DEFAULT 0,
  proximo_envio DATETIME NULL,
  ultimo_envio DATETIME NULL,
  cliente_id INT UNSIGNED NULL,
  origen ENUM('places','csv','barrido','manual') NOT NULL DEFAULT 'places',
  creado_por INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_motor_leads_place (place_id),
  KEY idx_motor_leads_estado (estado),
  KEY idx_motor_leads_campana (campana_id),
  KEY idx_motor_leads_email (email),
  KEY idx_motor_leads_envio (proximo_envio)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS motor_mensajes (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  lead_id INT UNSIGNED NOT NULL,
  campana_id INT UNSIGNED NULL,
  paso TINYINT UNSIGNED NOT NULL DEFAULT 1,
  direccion ENUM('salida','entrada') NOT NULL DEFAULT 'salida',
  asunto VARCHAR(255) NOT NULL DEFAULT '',
  cuerpo TEXT NULL,
  estado ENUM('borrador','pendiente','aprobado','enviado','descartado','error','recibido') NOT NULL DEFAULT 'pendiente',
  angulo VARCHAR(40) NOT NULL DEFAULT '',
  ia TINYINT(1) NOT NULL DEFAULT 0,
  clasificacion VARCHAR(30) NULL,
  message_id VARCHAR(255) NULL,
  error VARCHAR(255) NULL,
  aprobado_por INT UNSIGNED NULL,
  enviado_en DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_motor_msg_lead (lead_id),
  KEY idx_motor_msg_estado (estado),
  KEY idx_motor_msg_mid (message_id),
  CONSTRAINT fk_motor_msg_lead FOREIGN KEY (lead_id) REFERENCES motor_leads (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS motor_bajas (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tipo ENUM('email','dominio') NOT NULL DEFAULT 'email',
  valor VARCHAR(190) NOT NULL,
  motivo VARCHAR(255) NOT NULL DEFAULT '',
  origen VARCHAR(40) NOT NULL DEFAULT 'manual',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_motor_bajas (tipo, valor)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS motor_log (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ts DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  tipo VARCHAR(30) NOT NULL,
  mensaje VARCHAR(500) NOT NULL,
  lead_id INT UNSIGNED NULL,
  campana_id INT UNSIGNED NULL,
  KEY idx_motor_log_ts (ts)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS motor_cobertura (
  sector VARCHAR(60) NOT NULL,
  concejo VARCHAR(120) NOT NULL,
  comarca VARCHAR(80) NOT NULL DEFAULT '',
  ultima DATETIME NULL,
  encontrados INT UNSIGNED NOT NULL DEFAULT 0,
  consultas INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (sector, concejo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Campos nuevos en clientes (solo si faltan).
SET @s = (SELECT IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'clientes' AND column_name = 'decisor_nombre') = 0,
  'ALTER TABLE clientes ADD COLUMN decisor_nombre VARCHAR(150) NOT NULL DEFAULT '''', ADD COLUMN decisor_cargo VARCHAR(120) NOT NULL DEFAULT '''', ADD COLUMN decisor_email VARCHAR(190) NOT NULL DEFAULT ''''', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'clientes' AND column_name = 'proximo_paso') = 0,
  'ALTER TABLE clientes ADD COLUMN proximo_paso VARCHAR(255) NOT NULL DEFAULT '''', ADD COLUMN proximo_contacto DATETIME NULL, ADD COLUMN ultima_actividad DATETIME NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'clientes' AND column_name = 'origen') = 0,
  'ALTER TABLE clientes ADD COLUMN origen VARCHAR(40) NOT NULL DEFAULT ''manual'', ADD COLUMN no_contactar TINYINT(1) NOT NULL DEFAULT 0', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
