-- ICC CRM v93 · Agente de voz (llamadas con IA a traves de Vapi + Telnyx/Twilio)
-- Cada llamada que hace el agente de voz: a quien, por que, que paso y que hizo el CRM despues.
-- Idempotente.
CREATE TABLE IF NOT EXISTS voz_llamadas (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  cliente_id INT UNSIGNED DEFAULT NULL,
  telefono VARCHAR(40) NOT NULL,
  nombre VARCHAR(190) NOT NULL DEFAULT '',
  motivo VARCHAR(40) NOT NULL DEFAULT 'seguimiento',
  detalle VARCHAR(500) NOT NULL DEFAULT '',
  origen VARCHAR(60) NOT NULL DEFAULT 'manual',
  estado ENUM('pendiente','en_curso','terminada','error','descartada') NOT NULL DEFAULT 'pendiente',
  proveedor_id VARCHAR(80) DEFAULT NULL,
  resultado VARCHAR(30) DEFAULT NULL,
  resumen TEXT DEFAULT NULL,
  transcripcion MEDIUMTEXT DEFAULT NULL,
  duracion INT UNSIGNED DEFAULT NULL,
  grabacion_url VARCHAR(500) DEFAULT NULL,
  acciones TEXT DEFAULT NULL,
  error VARCHAR(255) DEFAULT NULL,
  creado_por INT UNSIGNED DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_voz_proveedor (proveedor_id),
  KEY idx_voz_cliente (cliente_id, created_at),
  KEY idx_voz_estado (estado, created_at),
  CONSTRAINT fk_voz_cliente FOREIGN KEY (cliente_id) REFERENCES clientes (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
