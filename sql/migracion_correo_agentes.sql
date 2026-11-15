-- =============================================================================
-- ICC CRM · Migracion: agentes de correo por buzon (fase 7)
-- Se puede importar varias veces. No borra datos.
--
--   mail_cuentas    buzones conectados (IMAP/SMTP, contrasena cifrada) y su agente
--   mail_mensajes   correos recibidos, su traza, borradores y lo que se hizo (1 ano)
--   mail_acciones   acciones de los agentes que esperan aprobacion
--   tickets         incidencias de soporte (referencia TK-...)
--   candidatos      candidaturas recibidas en los buzones de talento
-- =============================================================================

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS mail_cuentas (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(190) NOT NULL,
  nombre VARCHAR(120) NOT NULL DEFAULT '',
  host_imap VARCHAR(120) NOT NULL DEFAULT '',
  puerto_imap SMALLINT UNSIGNED NOT NULL DEFAULT 993,
  seguridad_imap VARCHAR(10) NOT NULL DEFAULT 'ssl',
  host_smtp VARCHAR(120) NOT NULL DEFAULT '',
  puerto_smtp SMALLINT UNSIGNED NOT NULL DEFAULT 587,
  seguridad_smtp VARCHAR(10) NOT NULL DEFAULT 'starttls',
  usuario VARCHAR(190) NOT NULL DEFAULT '',
  clave TEXT NULL,
  firma TEXT NULL,
  funcion VARCHAR(30) NOT NULL DEFAULT 'general',
  responsable_id INT UNSIGNED NULL,
  modo ENUM('aprobacion','automatico','amplio') NOT NULL DEFAULT 'automatico',
  agente MEDIUMTEXT NULL,
  adjuntos VARCHAR(255) NOT NULL DEFAULT '',
  adjuntar TINYINT(1) NOT NULL DEFAULT 1,
  acuse TINYINT(1) NOT NULL DEFAULT 1,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  ultimo_uid INT UNSIGNED NULL,
  uidvalidity INT UNSIGNED NULL,
  dias_atras TINYINT UNSIGNED NOT NULL DEFAULT 0,
  conectado_en DATETIME NULL,
  ultima_lectura DATETIME NULL,
  error VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_mail_cuentas_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mail_mensajes (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  cuenta_id INT UNSIGNED NOT NULL,
  uid INT UNSIGNED NULL,
  message_id VARCHAR(255) NOT NULL DEFAULT '',
  in_reply_to VARCHAR(255) NOT NULL DEFAULT '',
  referencias TEXT NULL,
  de VARCHAR(190) NOT NULL DEFAULT '',
  de_nombre VARCHAR(190) NOT NULL DEFAULT '',
  asunto VARCHAR(255) NOT NULL DEFAULT '',
  cuerpo MEDIUMTEXT NULL,
  fecha DATETIME NULL,
  cliente_id INT UNSIGNED NULL,
  categoria VARCHAR(30) NULL,
  confianza TINYINT UNSIGNED NULL,
  resumen VARCHAR(500) NULL,
  estado ENUM('nuevo','archivado','respondido','para_aprobar','enviado_manual','derivado','error') NOT NULL DEFAULT 'nuevo',
  motivo VARCHAR(500) NULL,
  borrador_asunto VARCHAR(255) NULL,
  borrador_cuerpo TEXT NULL,
  borrador_adjuntos VARCHAR(255) NULL,
  agente VARCHAR(120) NULL,
  traza MEDIUMTEXT NULL,
  acciones TEXT NULL,
  acuse_id VARCHAR(255) NULL,
  respuesta_id VARCHAR(255) NULL,
  derivado_de INT UNSIGNED NULL,
  ticket_id INT UNSIGNED NULL,
  adjuntos_entrada TEXT NULL,
  ia TINYINT(1) NOT NULL DEFAULT 0,
  respondido_por INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_mail_msg_cuenta (cuenta_id, estado),
  KEY idx_mail_msg_mid (message_id),
  KEY idx_mail_msg_de (de, created_at),
  KEY idx_mail_msg_cliente (cliente_id),
  CONSTRAINT fk_mail_msg_cuenta FOREIGN KEY (cuenta_id) REFERENCES mail_cuentas (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mail_acciones (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  mensaje_id INT UNSIGNED NOT NULL,
  cuenta_id INT UNSIGNED NOT NULL,
  agente VARCHAR(120) NOT NULL DEFAULT '',
  herramienta VARCHAR(60) NOT NULL,
  args TEXT NULL,
  estado ENUM('pendiente','aprobada','rechazada') NOT NULL DEFAULT 'pendiente',
  motivo VARCHAR(255) NULL,
  resultado VARCHAR(500) NULL,
  decidido_por INT UNSIGNED NULL,
  decidido_en DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_mail_acc_estado (estado),
  CONSTRAINT fk_mail_acc_msg FOREIGN KEY (mensaje_id) REFERENCES mail_mensajes (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tickets (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  referencia VARCHAR(20) NOT NULL DEFAULT '',
  cliente_id INT UNSIGNED NULL,
  email VARCHAR(190) NOT NULL DEFAULT '',
  asunto VARCHAR(255) NOT NULL,
  descripcion TEXT NULL,
  prioridad ENUM('baja','media','alta','urgente') NOT NULL DEFAULT 'media',
  estado ENUM('abierto','en_curso','resuelto','cerrado') NOT NULL DEFAULT 'abierto',
  cuenta_id INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_tickets_cliente (cliente_id),
  KEY idx_tickets_estado (estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS candidatos (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(150) NOT NULL,
  email VARCHAR(190) NOT NULL DEFAULT '',
  telefono VARCHAR(40) NOT NULL DEFAULT '',
  puesto VARCHAR(150) NOT NULL DEFAULT '',
  zona VARCHAR(120) NOT NULL DEFAULT '',
  cv_ruta VARCHAR(255) NULL,
  notas TEXT NULL,
  estado ENUM('nuevo','entrevista','descartado','contratado') NOT NULL DEFAULT 'nuevo',
  mensaje_id INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_candidatos_estado (estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
