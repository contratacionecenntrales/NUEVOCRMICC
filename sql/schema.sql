-- =============================================================================
-- ICC CRM · Integral Connection Consulting
-- Esquema MySQL para hosting propio (Hostalia). Importar completo una sola vez
-- en una base de datos MySQL vacia (phpMyAdmin -> Importar, o linea de comandos:
-- mysql -u USUARIO -p NOMBRE_BD < schema.sql).
-- =============================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- -----------------------------------------------------------------------------
-- Usuarios (comerciales/agentes, backoffice, administradores)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuarios (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(120) NOT NULL,
  apellidos VARCHAR(150) NOT NULL DEFAULT '',
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  telefono VARCHAR(40) NOT NULL DEFAULT '',
  empresa VARCHAR(150) NOT NULL DEFAULT '',
  cif VARCHAR(20) NOT NULL DEFAULT '',
  tipo VARCHAR(60) NOT NULL DEFAULT '',
  rol ENUM('comercial','backoffice','jefe_de_equipo','admin','super_admin') NOT NULL DEFAULT 'comercial',
  supervisor_id INT UNSIGNED NULL,
  bloqueado TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_usuarios_supervisor FOREIGN KEY (supervisor_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_usuarios_rol ON usuarios(rol);
CREATE INDEX idx_usuarios_bloqueado ON usuarios(bloqueado);
CREATE INDEX idx_usuarios_supervisor ON usuarios(supervisor_id);

-- -----------------------------------------------------------------------------
-- Clientes / Leads (embudo comercial)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clientes (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  comercial_id INT UNSIGNED NULL,
  razon_social VARCHAR(190) NOT NULL,
  cif VARCHAR(20) NOT NULL,
  contacto_nombre VARCHAR(150) NOT NULL DEFAULT '',
  contacto_telefono VARCHAR(40) NOT NULL DEFAULT '',
  contacto_email VARCHAR(190) NOT NULL DEFAULT '',
  sector VARCHAR(120) NOT NULL DEFAULT '',
  tipo_cliente ENUM('residencial','pyme','comunidad_vecinos','gran_cuenta') NOT NULL DEFAULT 'residencial',
  telefono VARCHAR(40) NOT NULL DEFAULT '',
  email VARCHAR(190) NOT NULL DEFAULT '',
  direccion_suministro VARCHAR(255) NOT NULL DEFAULT '',
  estado ENUM('lead_captado','estudio_backoffice','oferta_presentada','en_cierre','cliente_activo','perdido') NOT NULL DEFAULT 'lead_captado',
  motivo_perdida VARCHAR(255) NOT NULL DEFAULT '',
  notas TEXT NULL,
  upload_token CHAR(36) NOT NULL UNIQUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_clientes_comercial FOREIGN KEY (comercial_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_clientes_estado ON clientes(estado);
CREATE INDEX idx_clientes_comercial ON clientes(comercial_id);

CREATE TABLE IF NOT EXISTS cliente_servicios (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  cliente_id INT UNSIGNED NOT NULL,
  servicio ENUM('energia','telecomunicaciones','seguros','alarmas','financiero','paginas_web','campanas') NOT NULL,
  UNIQUE KEY uq_cliente_servicio (cliente_id, servicio),
  CONSTRAINT fk_cs_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Documentos (facturas subidas y estudios comparativos)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS documentos (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  cliente_id INT UNSIGNED NOT NULL,
  presupuesto_id INT UNSIGNED NULL,
  tipo ENUM('factura','estudio','contrato_firmado','otro') NOT NULL,
  ruta_archivo VARCHAR(255) NOT NULL,
  nombre_archivo VARCHAR(255) NOT NULL,
  subido_por INT UNSIGNED NULL,
  notas VARCHAR(500) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_doc_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE,
  CONSTRAINT fk_doc_usuario FOREIGN KEY (subido_por) REFERENCES usuarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_doc_presupuesto FOREIGN KEY (presupuesto_id) REFERENCES presupuestos(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_documentos_cliente ON documentos(cliente_id);
CREATE INDEX idx_documentos_tipo ON documentos(tipo);
CREATE INDEX idx_documentos_presupuesto ON documentos(presupuesto_id);

-- -----------------------------------------------------------------------------
-- Presupuestos (etapa previa al contrato, un presupuesto por sector/cliente)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS presupuestos (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  cliente_id INT UNSIGNED NOT NULL,
  comercial_id INT UNSIGNED NULL,
  sector ENUM('alarmas','energia','telecomunicaciones','seguros','financiero') NOT NULL,
  tipo_suministro ENUM('electricidad','gas','dual') NULL,
  cups VARCHAR(30) NOT NULL DEFAULT '',
  comercializadora_actual VARCHAR(120) NOT NULL DEFAULT '',
  tarifa_actual VARCHAR(120) NOT NULL DEFAULT '',
  potencias_contratadas VARCHAR(200) NOT NULL DEFAULT '',
  consumo_anual_kwh INT UNSIGNED NULL,
  datos_actuales_otros VARCHAR(300) NOT NULL DEFAULT '',
  fecha_permanencia DATE NULL,
  estado ENUM('borrador','factura_subida','estudio_adjunto','documentacion_contrato','cerrado') NOT NULL DEFAULT 'borrador',
  contrato_id INT UNSIGNED NULL,
  notas VARCHAR(500) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_presupuesto_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE,
  CONSTRAINT fk_presupuesto_comercial FOREIGN KEY (comercial_id) REFERENCES usuarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_presupuesto_contrato FOREIGN KEY (contrato_id) REFERENCES contratos(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_presupuestos_cliente ON presupuestos(cliente_id);
CREATE INDEX idx_presupuestos_sector ON presupuestos(sector);
CREATE INDEX idx_presupuestos_estado ON presupuestos(estado);
CREATE INDEX idx_presupuestos_comercial ON presupuestos(comercial_id);
CREATE INDEX idx_presupuestos_fecha_permanencia ON presupuestos(fecha_permanencia);

CREATE TABLE IF NOT EXISTS estudios (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  cliente_id INT UNSIGNED NOT NULL,
  documento_id INT UNSIGNED NULL,
  ahorro_estimado DECIMAL(10,2) NULL,
  resumen TEXT NULL,
  elaborado_por INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_est_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE,
  CONSTRAINT fk_est_documento FOREIGN KEY (documento_id) REFERENCES documentos(id) ON DELETE SET NULL,
  CONSTRAINT fk_est_usuario FOREIGN KEY (elaborado_por) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS firmas (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  cliente_id INT UNSIGNED NOT NULL,
  documento_id INT UNSIGNED NULL,
  firmante_nombre VARCHAR(150) NOT NULL,
  firmante_dni VARCHAR(20) NOT NULL,
  ruta_archivo VARCHAR(255) NOT NULL,
  hash_integridad CHAR(64) NOT NULL,
  ip VARCHAR(45) NULL,
  user_agent VARCHAR(255) NULL,
  firmado_por INT UNSIGNED NULL,
  firmado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_firma_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE,
  CONSTRAINT fk_firma_documento FOREIGN KEY (documento_id) REFERENCES documentos(id) ON DELETE SET NULL,
  CONSTRAINT fk_firma_usuario FOREIGN KEY (firmado_por) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notificaciones (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  cliente_id INT UNSIGNED NULL,
  tipo VARCHAR(40) NOT NULL DEFAULT 'info',
  mensaje VARCHAR(500) NOT NULL,
  leido TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notif_usuario FOREIGN KEY (user_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_notif_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_notif_user ON notificaciones(user_id, leido);

CREATE TABLE IF NOT EXISTS historial_estado (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  cliente_id INT UNSIGNED NOT NULL,
  estado_anterior VARCHAR(40) NULL,
  estado_nuevo VARCHAR(40) NOT NULL,
  cambiado_por INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_hist_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE,
  CONSTRAINT fk_hist_usuario FOREIGN KEY (cambiado_por) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Contratos — cualquier compania de alarmas, energia, telecomunicaciones,
-- seguros o financiero. "comercializadora" es de proposito general: guarda la
-- compania concreta (Endesa, Securitas Direct, Mapfre, Movistar, la entidad
-- financiera...) sea cual sea el sector.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contratos (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  cliente_id INT UNSIGNED NULL,
  comercial_id INT UNSIGNED NULL,
  sector ENUM('alarmas','energia','telecomunicaciones','seguros','financiero') NOT NULL DEFAULT 'energia',
  numero_contrato VARCHAR(60) NOT NULL DEFAULT '',
  titular VARCHAR(190) NOT NULL,
  cif_titular VARCHAR(20) NOT NULL DEFAULT '',
  tarifa VARCHAR(80) NOT NULL DEFAULT '',
  comercializadora VARCHAR(120) NOT NULL DEFAULT '',
  kw DECIMAL(10,2) NULL,
  estado ENUM('tramitado','ok','ko','incidencias','verificado','decomisionado','en_distribuidora') NOT NULL DEFAULT 'tramitado',
  fecha_alta DATE NOT NULL,
  fecha_activacion DATE NULL,
  notas TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_contrato_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL,
  CONSTRAINT fk_contrato_comercial FOREIGN KEY (comercial_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_contratos_sector ON contratos(sector);
CREATE INDEX idx_contratos_estado ON contratos(estado);
CREATE INDEX idx_contratos_comercializadora ON contratos(comercializadora);
CREATE INDEX idx_contratos_tarifa ON contratos(tarifa);
CREATE INDEX idx_contratos_comercial ON contratos(comercial_id);
CREATE INDEX idx_contratos_fecha_alta ON contratos(fecha_alta);
CREATE FULLTEXT INDEX ft_contratos_busqueda ON contratos(numero_contrato, titular, cif_titular);

-- -----------------------------------------------------------------------------
-- Ficheros (explorador de carpetas anidadas, estilo Google Drive)
-- -----------------------------------------------------------------------------
-- Carpeta compartida (propietario_id NULL): visible para cualquier usuario
-- autenticado, solo backoffice/jefe_de_equipo/admin pueden subir. Carpeta
-- personal (propietario_id fijado): privacidad estricta, solo la ve su
-- dueno y Admin (facturacion/nominas/comisiones individuales).
CREATE TABLE IF NOT EXISTS ficheros_carpetas (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(150) NOT NULL,
  parent_id INT UNSIGNED NULL,
  propietario_id INT UNSIGNED NULL,
  creado_por INT UNSIGNED NULL,
  seccion VARCHAR(20) NULL,           -- migracion_ficheros_orden.sql
  orden INT NOT NULL DEFAULT 0,       -- migracion_ficheros_orden.sql
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_carpeta_parent FOREIGN KEY (parent_id) REFERENCES ficheros_carpetas(id) ON DELETE CASCADE,
  CONSTRAINT fk_carpeta_propietario FOREIGN KEY (propietario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_carpeta_creador FOREIGN KEY (creado_por) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_ficheros_carpetas_parent ON ficheros_carpetas(parent_id);
CREATE INDEX idx_ficheros_carpetas_propietario ON ficheros_carpetas(propietario_id);

INSERT INTO ficheros_carpetas (nombre, parent_id, propietario_id, creado_por) VALUES
  ('Calendario de pagos', NULL, NULL, NULL),
  ('Comercializadoras', NULL, NULL, NULL),
  ('Comparadores', NULL, NULL, NULL),
  ('Documentacion - Penalizaciones - Renovaciones', NULL, NULL, NULL),
  ('Eficiencia energetica', NULL, NULL, NULL),
  ('Informe mensual mercado energetico espanol', NULL, NULL, NULL),
  ('Dosieres', NULL, NULL, NULL),
  ('Tabla precios de excedentes y bateria virtual', NULL, NULL, NULL),
  ('Temporadas - Periodos', NULL, NULL, NULL),
  ('Recursos generales', NULL, NULL, NULL),
  ('Facturacion de Comerciales', NULL, NULL, NULL);

CREATE TABLE IF NOT EXISTS ficheros (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  carpeta_id INT UNSIGNED NOT NULL,
  nombre_archivo VARCHAR(255) NOT NULL,
  ruta_archivo VARCHAR(255) NOT NULL,
  subido_por INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_fichero_carpeta FOREIGN KEY (carpeta_id) REFERENCES ficheros_carpetas(id) ON DELETE CASCADE,
  CONSTRAINT fk_fichero_usuario FOREIGN KEY (subido_por) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_ficheros_carpeta ON ficheros(carpeta_id);

-- -----------------------------------------------------------------------------
-- Proformas / Facturas
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS proformas (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  numero VARCHAR(60) NOT NULL,
  facturado_por ENUM('ICC','ELITE_ENERGY','EVOLVIX_GLOBAL') NOT NULL,
  comercial_id INT UNSIGNED NULL,
  cliente_email VARCHAR(190) NOT NULL DEFAULT '',
  importe DECIMAL(10,2) NOT NULL DEFAULT 0,
  estado_pago ENUM('pagada','pendiente') NOT NULL DEFAULT 'pendiente',
  fecha DATE NOT NULL,
  ruta_archivo VARCHAR(255) NULL,
  notas VARCHAR(500) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_proforma_comercial FOREIGN KEY (comercial_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_proformas_estado ON proformas(estado_pago);
CREATE INDEX idx_proformas_facturado_por ON proformas(facturado_por);
CREATE INDEX idx_proformas_fecha ON proformas(fecha);

-- -----------------------------------------------------------------------------
-- Comparador antiguo (tarifas propias + historico de comparativas): ya no lo
-- usa el CRM. Los comparadores actuales estan en sql/migracion_comparadores.sql.
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

-- -----------------------------------------------------------------------------
-- Agenda comercial — visitas/llamadas programadas por comercial, independiente
-- de presupuestos/contratos.
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- "Ver como" — Admin entra temporalmente en la sesion de otro usuario. Log de
-- auditoria de cada acceso cruzado (quien, a quien, cuando).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS logs_impersonacion (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  admin_id INT UNSIGNED NOT NULL,
  usuario_objetivo_id INT UNSIGNED NOT NULL,
  iniciado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finalizado_en DATETIME NULL,
  ip VARCHAR(45) NULL,
  CONSTRAINT fk_impersonacion_admin FOREIGN KEY (admin_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_impersonacion_objetivo FOREIGN KEY (usuario_objetivo_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  INDEX idx_impersonacion_admin (admin_id, iniciado_en)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Ficha avanzada de cada agente (area privada: el propio agente, su Jefe de
-- equipo y Admin/Super Admin). Ver api/ficha_agente.php.
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- Ficha de usuario avanzada: informacion ampliada, permisos granulares,
-- disponibilidad, notificaciones y seguridad (sesiones, auditoria).
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- Comparador y Auditor Inteligente: operadoras de mercado (Auditoria de
-- Telecomunicaciones) y campos ampliados del historico de auditorias.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tarifa_mercado (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  operador VARCHAR(100) NOT NULL,
  cuota_mensual DECIMAL(10,2) NOT NULL DEFAULT 0,
  promocion VARCHAR(255) DEFAULT NULL,
  valoracion VARCHAR(255) DEFAULT NULL,
  caracteristicas TEXT DEFAULT NULL,
  recomendada TINYINT(1) NOT NULL DEFAULT 0,
  activo TINYINT(1) NOT NULL DEFAULT 1,

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_tarifa_mercado_activo (activo, cuota_mensual)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Semilla orientativa (ver aviso de precios en sql/seed.sql): actualízala
-- desde Panel de Administración → Mercado antes de usarla con clientes.
INSERT INTO tarifa_mercado (operador, cuota_mensual, promocion, valoracion, caracteristicas, recomendada)
SELECT * FROM (SELECT
  'Lowi' AS operador, 55.00 AS cuota_mensual, 'Precio fijo' AS promocion, 'Residencial; sin atención de empresa' AS valoracion, NULL AS caracteristicas, 0 AS recomendada
  UNION ALL SELECT 'Digi', 55.00, NULL, 'Residencial; cobertura por verificar', NULL, 0
  UNION ALL SELECT 'O2', 60.00, 'Sin permanencia', 'Residencial; sin soporte de empresa', NULL, 0
  UNION ALL SELECT 'Telecable', 71.90, '2.ª línea gratis', 'Solo Asturias; sin servicios de empresa', NULL, 0
  UNION ALL SELECT 'Vodafone Business', 82.66, 'Precio estable', '2 líneas ilimitadas, soporte 24/7, MultiSIM, Netflix',
    '2 líneas ilimitadas 5G y MultiSIM para trabajar desde cualquier dispositivo.\nSoporte informático 24/7 y Secure Net incluidos.\nVodafone TV con Netflix y 200 minutos internacionales.\nSin cargos sorpresa: bloqueamos terceros, adultos y contenidos a la carta.', 1
  UNION ALL SELECT 'MásMóvil Empresas', 82.91, '79,28 € × 3 meses', 'Sube tras la promoción; TV aparte', NULL, 0
  UNION ALL SELECT 'Yoigo Empresas', 91.86, '61,61 € × 3 meses', 'Fuerte subida tras la promoción', NULL, 0
  UNION ALL SELECT 'Orange Empresas', 97.41, 'Precio definitivo', 'La más cara; permanencia 12 meses', NULL, 0
) AS semilla
WHERE NOT EXISTS (SELECT 1 FROM tarifa_mercado);

ALTER TABLE comparador_auditorias MODIFY sector ENUM('energia','telefonia','alarmas','pack_integral') NOT NULL;
ALTER TABLE comparador_auditorias ADD COLUMN tipo_informe VARCHAR(30) NOT NULL DEFAULT 'comparativa' AFTER sector;
ALTER TABLE comparador_auditorias ADD COLUMN codigo VARCHAR(40) NULL AFTER tipo_informe;
ALTER TABLE comparador_auditorias ADD COLUMN referencia_factura VARCHAR(190) NOT NULL DEFAULT '' AFTER codigo;
ALTER TABLE comparador_auditorias ADD COLUMN documento_id INT UNSIGNED NULL AFTER referencia_factura;
ALTER TABLE comparador_auditorias ADD CONSTRAINT fk_comparador_documento FOREIGN KEY (documento_id) REFERENCES documentos(id) ON DELETE SET NULL;
CREATE INDEX idx_comparador_fecha ON comparador_auditorias(created_at);

-- -----------------------------------------------------------------------------
-- Agenda avanzada: citas vinculadas a clientes, tipo, resumen y presupuesto.
-- -----------------------------------------------------------------------------
ALTER TABLE citas MODIFY sector ENUM('energia','telecomunicaciones','alarmas','multisectorial','seguros','financiero') NOT NULL DEFAULT 'energia';
ALTER TABLE citas MODIFY estado ENUM('programada','confirmada','realizada','reprogramada','ko') NOT NULL DEFAULT 'programada';
ALTER TABLE citas ADD COLUMN cliente_id INT UNSIGNED NULL AFTER comercial_id;
ALTER TABLE citas ADD COLUMN tipo VARCHAR(20) NOT NULL DEFAULT 'visita' AFTER cliente_id;
ALTER TABLE citas ADD COLUMN email VARCHAR(190) NOT NULL DEFAULT '' AFTER telefono;
ALTER TABLE citas ADD COLUMN resumen TEXT NULL AFTER notas;
ALTER TABLE citas ADD COLUMN proximos_pasos VARCHAR(500) NOT NULL DEFAULT '' AFTER resumen;
ALTER TABLE citas ADD COLUMN presupuesto_id INT UNSIGNED NULL AFTER proximos_pasos;
ALTER TABLE citas ADD COLUMN creado_por INT UNSIGNED NULL AFTER presupuesto_id;
ALTER TABLE citas ADD CONSTRAINT fk_cita_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL;
ALTER TABLE citas ADD CONSTRAINT fk_cita_presupuesto FOREIGN KEY (presupuesto_id) REFERENCES presupuestos(id) ON DELETE SET NULL;
ALTER TABLE citas ADD CONSTRAINT fk_cita_creado_por FOREIGN KEY (creado_por) REFERENCES usuarios(id) ON DELETE SET NULL;
CREATE INDEX idx_citas_cliente ON citas(cliente_id, fecha);

-- -----------------------------------------------------------------------------
-- Visitas concertadas por Backoffice y asignadas al equipo de un Jefe de equipo.
-- -----------------------------------------------------------------------------
ALTER TABLE citas MODIFY comercial_id INT UNSIGNED NULL;
ALTER TABLE citas ADD COLUMN equipo_id INT UNSIGNED NULL AFTER comercial_id;
ALTER TABLE citas ADD COLUMN asignada_por INT UNSIGNED NULL AFTER creado_por;
ALTER TABLE citas ADD COLUMN asignada_en DATETIME NULL AFTER asignada_por;
ALTER TABLE citas ADD CONSTRAINT fk_cita_equipo FOREIGN KEY (equipo_id) REFERENCES usuarios(id) ON DELETE SET NULL;
ALTER TABLE citas ADD CONSTRAINT fk_cita_asignada_por FOREIGN KEY (asignada_por) REFERENCES usuarios(id) ON DELETE SET NULL;
CREATE INDEX idx_citas_equipo ON citas(equipo_id, comercial_id);


-- -----------------------------------------------------------------------------
-- Comerciales asignados a cada usuario de Backoffice (vacio = ve toda la empresa).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS backoffice_comerciales (
  backoffice_id INT UNSIGNED NOT NULL,
  comercial_id INT UNSIGNED NOT NULL,
  asignado_por INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (backoffice_id, comercial_id),
  CONSTRAINT fk_bo_com_backoffice FOREIGN KEY (backoffice_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_bo_com_comercial FOREIGN KEY (comercial_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_bo_com_asignado_por FOREIGN KEY (asignado_por) REFERENCES usuarios(id) ON DELETE SET NULL,
  INDEX idx_bo_com_comercial (comercial_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- -----------------------------------------------------------------------------
-- Comparadores de Energia y Telefonia: importa despues sql/migracion_comparadores.sql
-- (crea sus tablas cmp_* y carga el catalogo y las comisiones iniciales).
-- -----------------------------------------------------------------------------
