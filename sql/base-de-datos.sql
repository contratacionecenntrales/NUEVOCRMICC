-- =============================================================================
-- LABS COMMAND CENTER 360™ · Base de datos MySQL para Hostalia
-- Labs24k · Grupo Evolvix Global SL
--
-- CÓMO SE EJECUTA
--   Panel de Hostalia → Bases de datos → phpMyAdmin → elige la base de datos
--   → pestaña «Importar» → este archivo → Continuar.
--   Se puede volver a importar sin romper nada: solo crea lo que falta.
--
-- QUÉ SUSTITUYE
--   Los guiones 01 a 17 de Supabase. Las reglas de seguridad que allí hacían
--   las políticas RLS y los disparadores las aplica ahora el backend PHP
--   (carpeta api/), que es la única puerta de entrada a estos datos.
--
-- DESPUÉS DE IMPORTARLO
--   Abre https://TU-DOMINIO/api/instalar.php y pon la contraseña de la cuenta
--   raíz (jalvarez@labs24k.com). Hasta entonces esa cuenta no puede entrar.
--
-- Compatible con MySQL 5.7 / 8.x y MariaDB 10.3 o superior.
-- Fechas y horas en UTC (el backend fija la zona de la conexión).
-- =============================================================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- =============================================================================
-- 1 · IDENTIDADES Y SESIONES (lo que antes hacía Supabase Auth)
-- =============================================================================
CREATE TABLE IF NOT EXISTS cuentas (
  id           CHAR(36)     NOT NULL,
  email        VARCHAR(190) NOT NULL,
  clave_hash   VARCHAR(255) NULL,          -- bcrypt; NULL = aún sin contraseña
  creado       DATETIME(6)  NOT NULL,
  actualizado  DATETIME(6)  NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY cuentas_email_uq (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Fichas de acceso emitidas al entrar. Solo se guarda el hash SHA-256 del
-- token: quien lea esta tabla no puede suplantar a nadie.
CREATE TABLE IF NOT EXISTS tokens_sesion (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id      CHAR(36)    NOT NULL,
  acceso_hash     CHAR(64)    NOT NULL,
  renovacion_hash CHAR(64)    NOT NULL,
  acceso_expira   DATETIME(6) NOT NULL,
  renovacion_expira DATETIME(6) NOT NULL,
  ver_como_de     CHAR(36)    NULL,          -- quién abrió la sesión con «Ver como»
  ip              VARCHAR(64) NULL,
  agente          VARCHAR(255) NULL,
  creado          DATETIME(6) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY tokens_acceso_uq (acceso_hash),
  UNIQUE KEY tokens_renovacion_uq (renovacion_hash),
  KEY tokens_usuario_idx (usuario_id),
  CONSTRAINT tokens_usuario_fk FOREIGN KEY (usuario_id) REFERENCES cuentas(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Freno a los ataques de fuerza bruta contra el acceso.
CREATE TABLE IF NOT EXISTS intentos_acceso (
  id     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email  VARCHAR(190) NOT NULL,
  ip     VARCHAR(64)  NULL,
  ts     DATETIME(6)  NOT NULL,
  PRIMARY KEY (id),
  KEY intentos_email_idx (email, ts),
  KEY intentos_ip_idx (ip, ts)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- 2 · ROLES PERSONALIZADOS (se crea antes que perfiles por la clave ajena)
-- =============================================================================
CREATE TABLE IF NOT EXISTS roles_personalizados (
  id               CHAR(36)     NOT NULL,
  nombre           VARCHAR(60)  NOT NULL,
  descripcion      TEXT         NOT NULL,
  basado_en        VARCHAR(20)  NOT NULL DEFAULT 'commercial',
  permisos         LONGTEXT     NOT NULL,   -- JSON {clave: booleano}
  modulos_visibles LONGTEXT     NOT NULL,   -- JSON [ids de pestaña]
  creado_por       CHAR(36)     NULL,
  creado           DATETIME(6)  NOT NULL,
  actualizado      DATETIME(6)  NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY roles_pers_nombre_uq (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- 3 · PERFILES · la ficha de cada usuario
-- =============================================================================
CREATE TABLE IF NOT EXISTS perfiles (
  id            CHAR(36)     NOT NULL,
  raiz          TINYINT(1)   NOT NULL DEFAULT 0,
  nombre        VARCHAR(60)  NOT NULL,
  apellidos     VARCHAR(120) NOT NULL DEFAULT '',
  email         VARCHAR(190) NOT NULL,
  prefijo       VARCHAR(5)   NOT NULL DEFAULT '+34',
  telefono      VARCHAR(40)  NOT NULL DEFAULT '',
  extension     VARCHAR(6)   NOT NULL DEFAULT '',
  rol           VARCHAR(20)  NOT NULL DEFAULT 'commercial',   -- admin · manager · commercial · backoffice
  estado        VARCHAR(20)  NOT NULL DEFAULT 'Activo',       -- Activo · Suspendido · Dado de baja
  rel           VARCHAR(20)  NOT NULL,
  avatar_url    MEDIUMTEXT   NULL,
  google        TINYINT(1)   NOT NULL DEFAULT 0,
  doble_factor  TINYINT(1)   NOT NULL DEFAULT 0,
  debe_cambiar  TINYINT(1)   NOT NULL DEFAULT 1,
  permisos      LONGTEXT     NOT NULL,      -- JSON {clave: booleano}
  preferencias  LONGTEXT     NOT NULL,      -- JSON
  api_token     VARCHAR(120) NULL,
  alta          DATE         NOT NULL,
  ultimo_acceso DATETIME(6)  NULL,
  modulos_visibles LONGTEXT  NULL,          -- JSON [ids] o NULL = los del rol
  rol_personalizado_id CHAR(36) NULL,
  superior_id   CHAR(36)     NULL,
  empresa       VARCHAR(120) NOT NULL DEFAULT '',
  cif           VARCHAR(20)  NOT NULL DEFAULT '',
  creado        DATETIME(6)  NOT NULL,
  actualizado   DATETIME(6)  NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY perfiles_email_uq (email),
  UNIQUE KEY perfiles_rel_uq (rel),
  KEY perfiles_rol_idx (rol),
  KEY perfiles_estado_idx (estado),
  KEY perfiles_superior_idx (superior_id),
  CONSTRAINT perfiles_cuenta_fk   FOREIGN KEY (id) REFERENCES cuentas(id) ON DELETE CASCADE,
  CONSTRAINT perfiles_rolpers_fk  FOREIGN KEY (rol_personalizado_id) REFERENCES roles_personalizados(id) ON DELETE SET NULL,
  CONSTRAINT perfiles_superior_fk FOREIGN KEY (superior_id) REFERENCES perfiles(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- 4 · CATÁLOGO DE PERMISOS
-- =============================================================================
CREATE TABLE IF NOT EXISTS permisos_catalogo (
  clave       VARCHAR(60)  NOT NULL,
  grupo       VARCHAR(60)  NOT NULL,
  nombre      VARCHAR(120) NOT NULL,
  descripcion VARCHAR(255) NOT NULL DEFAULT '',
  orden       INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (clave)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO permisos_catalogo (clave, grupo, nombre, descripcion, orden) VALUES
  ('presu.ver',    'Comercial',             'Ver presupuestos',             'Consultar el histórico de propuestas', 10),
  ('presu.crear',  'Comercial',             'Crear y enviar propuestas',    'Generar documentos con el catálogo oficial', 20),
  ('presu.dto',    'Comercial',             'Aplicar descuentos',           'Modificar el precio de tarifa', 30),
  ('funnel.ver',   'Comercial',             'Ver embudos de venta',         'Acceso a la evolución del pipeline', 40),
  ('exp.ver',      'Clientes y expedientes','Ver expedientes',              'Ficha completa del cliente activo', 50),
  ('exp.estado',   'Clientes y expedientes','Cambiar el estado',            'Avanzar la fase de implantación', 60),
  ('exp.hitos',    'Clientes y expedientes','Marcar hitos',                 'Validar los pasos de la hoja de ruta', 70),
  ('exp.docs',     'Clientes y expedientes','Subir documentación',          'Contratos, auditorías y anexos', 80),
  ('exp.borrar',   'Clientes y expedientes','Eliminar registros',           'Borrado de documentos y expedientes', 90),
  ('hr.ver',       'Talento y equipo',      'Ver el pipeline de selección', 'Candidatos y entrevistas', 100),
  ('hr.mover',     'Talento y equipo',      'Mover candidatos de fase',     'Gestionar el proceso de selección', 110),
  ('hr.contratar', 'Talento y equipo',      'Cerrar contrataciones',        'Dar por incorporado a un candidato', 120),
  ('com.llamadas', 'Comunicaciones',        'Centralita y llamadas',        'Marcador, grabaciones y buzón', 130),
  ('com.wsp',      'Comunicaciones',        'WhatsApp y voz IA',            'Agentes automáticos de conversación', 140),
  ('com.plant',    'Comunicaciones',        'Editar plantillas',            'Mensajes tipo de la red comercial', 150),
  ('sys.config',   'Sistema',               'Configuración global',         'Marca, precios, enlaces y claves', 160),
  ('roles.gestionar','Sistema',             'Gestionar roles personalizados','Crear, editar y aplicar plantillas de permisos', 165),
  ('sys.usuarios', 'Sistema',               'Gestión de usuarios',          'Altas, bajas y permisos', 170),
  ('sys.alta_agentes','Sistema',            'Dar de alta agentes',          'Crear cuentas de Gestión Comercial (solo ese rol)', 172),
  ('sys.audit',    'Sistema',               'Bitácora de auditoría',        'Ver quién ha cambiado qué', 180),
  ('contactos.ver',      'Contactos', 'Ver contactos',            'Consultar leads y clientes de la cartera', 200),
  ('contactos.crea',     'Contactos', 'Crear contactos',          'Dar de alta un nuevo lead o cliente', 210),
  ('contactos.editar',   'Contactos', 'Editar ficha de contacto', 'Datos, estado y especificaciones técnicas', 220),
  ('contactos.notas',    'Contactos', 'Añadir seguimiento',       'Anotar actualizaciones en el historial', 230),
  ('contactos.comentar', 'Contactos', 'Comentar',                 'Notas internas rápidas del equipo', 240),
  ('contactos.docs',     'Contactos', 'Subir documentación',      'Adjuntar contratos, briefings y anexos', 250),
  ('contactos.borrar',   'Contactos', 'Eliminar contactos',       'Borrado de fichas y documentos', 260),
  ('recursos.ver',    'Recursos', 'Ver el centro de recursos', 'Consultar y descargar dosieres corporativos', 300),
  ('recursos.subir',  'Recursos', 'Subir dosieres',            'Añadir documentos al repositorio', 310),
  ('recursos.borrar', 'Recursos', 'Eliminar dosieres',         'Retirar documentos del repositorio', 320),
  ('soporte.ver',       'Soporte', 'Abrir y ver incidencias', 'Registrar incidencias propias y ver su estado', 400),
  ('soporte.gestionar', 'Soporte', 'Gestionar incidencias',   'Ver todas las incidencias, asignarlas y cambiar su estado', 410),
  ('soporte.escalar',   'Soporte', 'Escalar a Nivel 2',       'Derivar una incidencia al Responsable del Responsable', 420)
ON DUPLICATE KEY UPDATE grupo = VALUES(grupo), nombre = VALUES(nombre),
  descripcion = VALUES(descripcion), orden = VALUES(orden);

-- =============================================================================
-- 5 · AUDITORÍA, ACCESOS DE RAÍZ Y SESIONES
-- =============================================================================
CREATE TABLE IF NOT EXISTS bitacora (
  id             CHAR(36)     NOT NULL,
  ts             DATETIME(6)  NOT NULL,
  actor_id       CHAR(36)     NULL,
  actor_nombre   VARCHAR(200) NOT NULL DEFAULT 'sistema',
  actor_rol      VARCHAR(20)  NULL,
  destino_id     CHAR(36)     NULL,
  destino_nombre VARCHAR(200) NULL,
  accion         VARCHAR(200) NOT NULL,
  detalle        TEXT         NOT NULL,
  ip             VARCHAR(64)  NULL,
  agente         VARCHAR(255) NULL,
  PRIMARY KEY (id),
  KEY bitacora_ts_idx (ts),
  KEY bitacora_destino_idx (destino_id),
  KEY bitacora_actor_idx (actor_id),
  CONSTRAINT bitacora_actor_fk FOREIGN KEY (actor_id) REFERENCES perfiles(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS accesos_raiz (
  id      CHAR(36)     NOT NULL,
  ts      DATETIME(6)  NOT NULL,
  evento  VARCHAR(20)  NOT NULL,     -- ENTRADA · ENTRADA_GOOGLE · SALIDA · FALLIDO
  usuario CHAR(36)     NULL,
  email   VARCHAR(190) NULL,
  ip      VARCHAR(64)  NULL,
  agente  VARCHAR(255) NULL,
  motivo  VARCHAR(255) NULL,
  PRIMARY KEY (id),
  KEY accesos_raiz_ts_idx (ts)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sesiones (
  id          CHAR(36)     NOT NULL,
  usuario_id  CHAR(36)     NOT NULL,
  dispositivo VARCHAR(255) NOT NULL DEFAULT '',
  ip          VARCHAR(64)  NULL,
  ubicacion   VARCHAR(255) NULL,
  inicio      DATETIME(6)  NOT NULL,
  visto       DATETIME(6)  NOT NULL,
  PRIMARY KEY (id),
  KEY sesiones_usuario_idx (usuario_id),
  CONSTRAINT sesiones_usuario_fk FOREIGN KEY (usuario_id) REFERENCES perfiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- 6 · NEGOCIO: expedientes, candidatos y presupuestos
-- =============================================================================
CREATE TABLE IF NOT EXISTS expedientes (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  empresa       VARCHAR(200) NOT NULL,
  sector        VARCHAR(120) NOT NULL DEFAULT '',
  contacto      VARCHAR(200) NOT NULL DEFAULT '',
  telefono      VARCHAR(40)  NOT NULL DEFAULT '',
  email         VARCHAR(190) NOT NULL DEFAULT '',
  mrr           DECIMAL(10,2) NOT NULL DEFAULT 0,
  estado        VARCHAR(60)  NOT NULL DEFAULT 'Auditoría inicial',
  hito          INT          NOT NULL DEFAULT 0,
  satisfaccion  INT          NULL,
  gestor_id     CHAR(36)     NULL,
  backoffice_id CHAR(36)     NULL,
  alta          DATE         NOT NULL,
  creado        DATETIME(6)  NOT NULL,
  actualizado   DATETIME(6)  NOT NULL,
  PRIMARY KEY (id),
  KEY expedientes_gestor_idx (gestor_id),
  CONSTRAINT expedientes_gestor_fk FOREIGN KEY (gestor_id) REFERENCES perfiles(id) ON DELETE SET NULL,
  CONSTRAINT expedientes_bo_fk     FOREIGN KEY (backoffice_id) REFERENCES perfiles(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS expediente_log (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  expediente_id BIGINT UNSIGNED NOT NULL,
  autor_id      CHAR(36)     NULL,
  autor_nombre  VARCHAR(200) NOT NULL DEFAULT '',
  autor_rol     VARCHAR(20)  NULL,
  tipo          VARCHAR(40)  NOT NULL DEFAULT 'avance',
  texto         TEXT         NOT NULL,
  ts            DATETIME(6)  NOT NULL,
  PRIMARY KEY (id),
  KEY expediente_log_exp_idx (expediente_id, ts),
  CONSTRAINT explog_exp_fk   FOREIGN KEY (expediente_id) REFERENCES expedientes(id) ON DELETE CASCADE,
  CONSTRAINT explog_autor_fk FOREIGN KEY (autor_id) REFERENCES perfiles(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS expediente_docs (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  expediente_id BIGINT UNSIGNED NOT NULL,
  nombre        VARCHAR(255) NOT NULL,
  tipo          VARCHAR(120) NOT NULL DEFAULT '',
  ruta          VARCHAR(500) NULL,
  subido_por    CHAR(36)     NULL,
  ts            DATETIME(6)  NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT expdoc_exp_fk FOREIGN KEY (expediente_id) REFERENCES expedientes(id) ON DELETE CASCADE,
  CONSTRAINT expdoc_sub_fk FOREIGN KEY (subido_por) REFERENCES perfiles(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS candidatos (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre         VARCHAR(200) NOT NULL,
  puesto         VARCHAR(200) NOT NULL DEFAULT '',
  email          VARCHAR(190) NOT NULL DEFAULT '',
  telefono       VARCHAR(40)  NOT NULL DEFAULT '',
  fase           VARCHAR(60)  NOT NULL DEFAULT 'Solicitud recibida',
  nota           INT          NULL,
  origen         VARCHAR(120) NOT NULL DEFAULT '',
  responsable_id CHAR(36)     NULL,
  creado         DATETIME(6)  NOT NULL,
  actualizado    DATETIME(6)  NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT cand_resp_fk FOREIGN KEY (responsable_id) REFERENCES perfiles(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS presupuestos (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  codigo        VARCHAR(60)  NOT NULL,
  cliente       VARCHAR(200) NOT NULL,
  expediente_id BIGINT UNSIGNED NULL,
  autor_id      CHAR(36)     NULL,
  lineas        LONGTEXT     NOT NULL,     -- JSON
  base          DECIMAL(10,2) NOT NULL DEFAULT 0,
  iva           DECIMAL(5,2)  NOT NULL DEFAULT 21,
  total         DECIMAL(10,2) NOT NULL DEFAULT 0,
  estado        VARCHAR(40)  NOT NULL DEFAULT 'Borrador',
  creado        DATETIME(6)  NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY presupuestos_codigo_uq (codigo),
  CONSTRAINT presu_exp_fk   FOREIGN KEY (expediente_id) REFERENCES expedientes(id) ON DELETE SET NULL,
  CONSTRAINT presu_autor_fk FOREIGN KEY (autor_id) REFERENCES perfiles(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- 7 · MISSION CONTROL Y CONTRATOS
-- =============================================================================
CREATE TABLE IF NOT EXISTS agentes (
  id            VARCHAR(40)  NOT NULL,
  nombre        VARCHAR(120) NOT NULL,
  tipo          VARCHAR(20)  NOT NULL,     -- email · whatsapp · voice · content · marketing · ceo
  estado        VARCHAR(20)  NOT NULL DEFAULT 'offline',
  descripcion   TEXT         NOT NULL,
  autonomia     VARCHAR(60)  NOT NULL DEFAULT 'Sugiere y espera aprobación',
  webhook       VARCHAR(500) NULL,
  metricas      LONGTEXT     NOT NULL,     -- JSON
  ultimo_latido DATETIME(6)  NULL,
  creado        DATETIME(6)  NOT NULL,
  actualizado   DATETIME(6)  NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO agentes (id, nombre, tipo, descripcion, autonomia, metricas, creado, actualizado) VALUES
  ('ag-mail','Agente de Correo','email','Redacta, responde y clasifica el correo entrante de la red comercial.','Sugiere y espera aprobación','{}',UTC_TIMESTAMP(6),UTC_TIMESTAMP(6)),
  ('ag-wsp','Agente de WhatsApp','whatsapp','Atiende conversaciones, cualifica leads y agenda citas.','Actúa solo','{}',UTC_TIMESTAMP(6),UTC_TIMESTAMP(6)),
  ('ag-voz','Agente de Voz','voice','Atiende llamadas 24/7, recoge el motivo y avisa al responsable.','Actúa solo','{}',UTC_TIMESTAMP(6),UTC_TIMESTAMP(6)),
  ('ag-cont','Agente de Contenido','content','Prepara propuestas, publicaciones y material comercial.','Sugiere y espera aprobación','{}',UTC_TIMESTAMP(6),UTC_TIMESTAMP(6)),
  ('ag-mkt','Agente de Marketing','marketing','Lanza y vigila campañas, y reparte los leads que llegan.','Sugiere y espera aprobación','{}',UTC_TIMESTAMP(6),UTC_TIMESTAMP(6)),
  ('ag-ceo','Agente Director','ceo','Revisa el rendimiento de la red y propone prioridades del día.','Solo informa','{}',UTC_TIMESTAMP(6),UTC_TIMESTAMP(6))
ON DUPLICATE KEY UPDATE nombre = VALUES(nombre), descripcion = VALUES(descripcion);

CREATE TABLE IF NOT EXISTS agente_acciones (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  agente_id     VARCHAR(40)  NOT NULL,
  ts            DATETIME(6)  NOT NULL,
  accion        VARCHAR(255) NOT NULL,
  detalle       TEXT         NOT NULL,
  resultado     VARCHAR(20)  NULL DEFAULT 'ok',
  expediente_id BIGINT UNSIGNED NULL,
  aprobado_por  CHAR(36)     NULL,
  PRIMARY KEY (id),
  KEY agente_acciones_idx (agente_id, ts),
  CONSTRAINT acc_agente_fk FOREIGN KEY (agente_id) REFERENCES agentes(id) ON DELETE CASCADE,
  CONSTRAINT acc_exp_fk    FOREIGN KEY (expediente_id) REFERENCES expedientes(id) ON DELETE SET NULL,
  CONSTRAINT acc_aprob_fk  FOREIGN KEY (aprobado_por) REFERENCES perfiles(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS contratos (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  codigo         VARCHAR(60)  NOT NULL,
  cliente        VARCHAR(200) NOT NULL,
  cif            VARCHAR(40)  NOT NULL DEFAULT '',
  domicilio      VARCHAR(300) NOT NULL DEFAULT '',
  representante  VARCHAR(200) NOT NULL DEFAULT '',
  email          VARCHAR(190) NOT NULL DEFAULT '',
  telefono       VARCHAR(40)  NOT NULL DEFAULT '',
  servicio       VARCHAR(300) NOT NULL,
  setup          DECIMAL(10,2) NOT NULL DEFAULT 0,
  mensual        DECIMAL(10,2) NOT NULL DEFAULT 0,
  meses          INT          NOT NULL DEFAULT 12,
  iva            DECIMAL(5,2) NOT NULL DEFAULT 21,
  inicio         DATE         NOT NULL,
  observaciones  TEXT         NOT NULL,
  estado         VARCHAR(20)  NOT NULL DEFAULT 'Borrador',   -- Borrador · Enviado · Firmado · Anulado
  enviado_el     DATETIME(6)  NULL,
  enviado_por    VARCHAR(20)  NULL,
  firmado_el     DATE         NULL,
  gestor_id      CHAR(36)     NULL,
  expediente_id  BIGINT UNSIGNED NULL,
  documento_ruta VARCHAR(500) NULL,
  token          CHAR(36)     NULL,
  token_expira   DATETIME(6)  NULL,
  token_usado    TINYINT(1)   NOT NULL DEFAULT 0,
  firma_img      MEDIUMTEXT   NULL,
  firma_nombre   VARCHAR(200) NULL,
  firma_dni      VARCHAR(40)  NULL,
  firma_ip       VARCHAR(64)  NULL,
  firma_ua       VARCHAR(500) NULL,
  firma_huella   VARCHAR(128) NULL,
  firmado_ts     DATETIME(6)  NULL,
  datos_contrato LONGTEXT     NOT NULL,     -- JSON
  creado         DATETIME(6)  NOT NULL,
  actualizado    DATETIME(6)  NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY contratos_codigo_uq (codigo),
  UNIQUE KEY contratos_token_uq (token),
  KEY contratos_estado_idx (estado),
  KEY contratos_gestor_idx (gestor_id),
  CONSTRAINT contratos_gestor_fk FOREIGN KEY (gestor_id) REFERENCES perfiles(id) ON DELETE SET NULL,
  CONSTRAINT contratos_exp_fk    FOREIGN KEY (expediente_id) REFERENCES expedientes(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS firma_eventos (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  contrato_id BIGINT UNSIGNED NULL,
  ts          DATETIME(6)  NOT NULL,
  evento      VARCHAR(20)  NOT NULL,     -- emitido · abierto · firmado · rechazado · caducado
  ip          VARCHAR(64)  NULL,
  ua          VARCHAR(500) NULL,
  detalle     VARCHAR(500) NOT NULL DEFAULT '',
  PRIMARY KEY (id),
  KEY firma_eventos_idx (contrato_id, ts),
  CONSTRAINT firma_contrato_fk FOREIGN KEY (contrato_id) REFERENCES contratos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- 8 · CONTACTOS
-- =============================================================================
CREATE TABLE IF NOT EXISTS contactos (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tipo             VARCHAR(20)  NOT NULL DEFAULT 'lead',     -- lead · cliente
  nombre           VARCHAR(120) NOT NULL,
  empresa          VARCHAR(200) NOT NULL DEFAULT '',
  email            VARCHAR(190) NOT NULL DEFAULT '',
  prefijo          VARCHAR(5)   NOT NULL DEFAULT '+34',
  telefono         VARCHAR(40)  NOT NULL DEFAULT '',
  origen           VARCHAR(120) NOT NULL DEFAULT '',
  estado           VARCHAR(40)  NOT NULL DEFAULT 'Nuevo',
  especificaciones TEXT         NOT NULL,
  gestor_id        CHAR(36)     NULL,
  expediente_id    BIGINT UNSIGNED NULL,
  creado           DATETIME(6)  NOT NULL,
  actualizado      DATETIME(6)  NOT NULL,
  PRIMARY KEY (id),
  KEY contactos_gestor_idx (gestor_id),
  KEY contactos_estado_idx (estado),
  CONSTRAINT contactos_gestor_fk FOREIGN KEY (gestor_id) REFERENCES perfiles(id) ON DELETE SET NULL,
  CONSTRAINT contactos_exp_fk    FOREIGN KEY (expediente_id) REFERENCES expedientes(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS contacto_eventos (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  contacto_id BIGINT UNSIGNED NOT NULL,
  autor_id    CHAR(36)     NULL,
  tipo        VARCHAR(20)  NOT NULL DEFAULT 'nota',          -- estado · evento · nota
  texto       TEXT         NOT NULL,
  ts          DATETIME(6)  NOT NULL,
  PRIMARY KEY (id),
  KEY contacto_eventos_idx (contacto_id, ts),
  CONSTRAINT cev_contacto_fk FOREIGN KEY (contacto_id) REFERENCES contactos(id) ON DELETE CASCADE,
  CONSTRAINT cev_autor_fk    FOREIGN KEY (autor_id) REFERENCES perfiles(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS contacto_comentarios (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  contacto_id BIGINT UNSIGNED NOT NULL,
  autor_id    CHAR(36)     NULL,
  texto       TEXT         NOT NULL,
  ts          DATETIME(6)  NOT NULL,
  PRIMARY KEY (id),
  KEY contacto_comentarios_idx (contacto_id, ts),
  CONSTRAINT cco_contacto_fk FOREIGN KEY (contacto_id) REFERENCES contactos(id) ON DELETE CASCADE,
  CONSTRAINT cco_autor_fk    FOREIGN KEY (autor_id) REFERENCES perfiles(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS contacto_documentos (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  contacto_id  BIGINT UNSIGNED NOT NULL,
  nombre       VARCHAR(255) NOT NULL,
  tipo         VARCHAR(120) NOT NULL DEFAULT '',
  ruta         VARCHAR(500) NOT NULL,
  tamano_bytes BIGINT       NULL,
  subido_por   CHAR(36)     NULL,
  ts           DATETIME(6)  NOT NULL,
  PRIMARY KEY (id),
  KEY contacto_documentos_idx (contacto_id, ts),
  CONSTRAINT cdo_contacto_fk FOREIGN KEY (contacto_id) REFERENCES contactos(id) ON DELETE CASCADE,
  CONSTRAINT cdo_subido_fk   FOREIGN KEY (subido_por) REFERENCES perfiles(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- 9 · CENTRO DE RECURSOS
-- =============================================================================
CREATE TABLE IF NOT EXISTS recursos (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  categoria    VARCHAR(60)  NOT NULL DEFAULT 'General',
  nombre       VARCHAR(160) NOT NULL,
  descripcion  TEXT         NOT NULL,
  tipo         VARCHAR(10)  NOT NULL DEFAULT 'pdf',          -- pdf · pptx
  ruta         VARCHAR(500) NOT NULL,
  tamano_bytes BIGINT       NULL,
  subido_por   CHAR(36)     NULL,
  creado       DATETIME(6)  NOT NULL,
  actualizado  DATETIME(6)  NOT NULL,
  PRIMARY KEY (id),
  KEY recursos_categoria_idx (categoria),
  CONSTRAINT recursos_subido_fk FOREIGN KEY (subido_por) REFERENCES perfiles(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS recursos_descargas (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  recurso_id BIGINT UNSIGNED NOT NULL,
  usuario_id CHAR(36)    NULL,
  ts         DATETIME(6) NOT NULL,
  PRIMARY KEY (id),
  KEY recursos_descargas_idx (recurso_id, ts),
  CONSTRAINT rdesc_recurso_fk FOREIGN KEY (recurso_id) REFERENCES recursos(id) ON DELETE CASCADE,
  CONSTRAINT rdesc_usuario_fk FOREIGN KEY (usuario_id) REFERENCES perfiles(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- 10 · SOPORTE Y TICKETS
-- =============================================================================
CREATE TABLE IF NOT EXISTS tickets (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  titulo         VARCHAR(160) NOT NULL,
  descripcion    TEXT         NOT NULL,
  categoria      VARCHAR(60)  NOT NULL DEFAULT 'Plataforma',
  prioridad      VARCHAR(10)  NOT NULL DEFAULT 'media',      -- baja · media · alta · critica
  estado         VARCHAR(20)  NOT NULL DEFAULT 'abierto',    -- abierto · en_progreso · escalado · resuelto · cerrado
  nivel_escalado SMALLINT     NOT NULL DEFAULT 0,
  creado_por     CHAR(36)     NULL,
  asignado_a     CHAR(36)     NULL,
  creado         DATETIME(6)  NOT NULL,
  actualizado    DATETIME(6)  NOT NULL,
  PRIMARY KEY (id),
  KEY tickets_estado_idx (estado),
  KEY tickets_asignado_idx (asignado_a),
  KEY tickets_creado_por_idx (creado_por),
  CONSTRAINT tickets_creador_fk  FOREIGN KEY (creado_por) REFERENCES perfiles(id) ON DELETE SET NULL,
  CONSTRAINT tickets_asignado_fk FOREIGN KEY (asignado_a) REFERENCES perfiles(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ticket_eventos (
  id        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ticket_id BIGINT UNSIGNED NOT NULL,
  autor_id  CHAR(36)     NULL,
  tipo      VARCHAR(20)  NOT NULL DEFAULT 'comentario',      -- comentario · cambio_estado · escalado
  texto     TEXT         NOT NULL,
  creado    DATETIME(6)  NOT NULL,
  PRIMARY KEY (id),
  KEY ticket_eventos_idx (ticket_id, creado),
  CONSTRAINT tev_ticket_fk FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
  CONSTRAINT tev_autor_fk  FOREIGN KEY (autor_id) REFERENCES perfiles(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- 11 · FICHAS DE AGENTE
-- =============================================================================
CREATE TABLE IF NOT EXISTS agente_fichas (
  agente_id        CHAR(36)     NOT NULL,
  zona             VARCHAR(120) NOT NULL DEFAULT '',
  equipo           VARCHAR(120) NOT NULL DEFAULT '',
  especialidad     VARCHAR(200) NOT NULL DEFAULT '',
  incorporacion    DATE         NULL,
  objetivo_mensual DECIMAL(12,2) NULL,
  objetivos        TEXT         NOT NULL,
  plan_accion      TEXT         NOT NULL,
  formacion        TEXT         NOT NULL,
  actualizado      DATETIME(6)  NOT NULL,
  actualizado_por  CHAR(36)     NULL,
  PRIMARY KEY (agente_id),
  CONSTRAINT agfichas_agente_fk FOREIGN KEY (agente_id) REFERENCES perfiles(id) ON DELETE CASCADE,
  CONSTRAINT agfichas_por_fk    FOREIGN KEY (actualizado_por) REFERENCES perfiles(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS agente_seguimiento (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  agente_id    CHAR(36)     NOT NULL,
  autor_id     CHAR(36)     NULL,
  autor_nombre VARCHAR(200) NOT NULL DEFAULT '',
  tipo         VARCHAR(20)  NOT NULL DEFAULT 'nota',   -- nota · tarea · objetivo · reunion · evaluacion
  titulo       VARCHAR(160) NOT NULL,
  texto        TEXT         NOT NULL,
  fecha        DATE         NULL,
  hecho        TINYINT(1)   NOT NULL DEFAULT 0,
  creado       DATETIME(6)  NOT NULL,
  PRIMARY KEY (id),
  KEY agente_seguimiento_agente_idx (agente_id, creado),
  CONSTRAINT agseg_agente_fk FOREIGN KEY (agente_id) REFERENCES perfiles(id) ON DELETE CASCADE,
  CONSTRAINT agseg_autor_fk  FOREIGN KEY (autor_id) REFERENCES perfiles(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- 12 · CUENTA DE RAÍZ
-- Se crea SIN contraseña: nadie puede entrar con ella hasta que pongas la tuya
-- en api/instalar.php. Así no queda ninguna contraseña escrita en este archivo.
-- =============================================================================
SET @raiz_id = (SELECT id FROM cuentas WHERE email = 'jalvarez@labs24k.com');
SET @raiz_id = COALESCE(@raiz_id, UUID());

INSERT INTO cuentas (id, email, clave_hash, creado, actualizado)
SELECT @raiz_id, 'jalvarez@labs24k.com', NULL, UTC_TIMESTAMP(6), UTC_TIMESTAMP(6)
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM cuentas WHERE email = 'jalvarez@labs24k.com');

INSERT INTO perfiles (
  id, raiz, nombre, apellidos, email, prefijo, telefono, extension,
  rol, estado, rel, google, doble_factor, debe_cambiar,
  permisos, preferencias, api_token, alta, creado, actualizado
)
SELECT @raiz_id, 1, 'Juan', 'Álvarez', 'jalvarez@labs24k.com', '+34', '600 112 233', '101',
  'admin', 'Activo', '0-413-936', 1, 1, 1,
  '{}',
  '{"llamadas":{"extension":"101","desvio":"","grabar":true,"buzon":true,"saludo":"Has llamado a Labs24k. Deja tu mensaje y te devolvemos la llamada."},"disponibilidad":{"dias":{"L":true,"M":true,"X":true,"J":true,"V":true,"S":false,"D":false},"desde":"09:00","hasta":"18:00","zona":"Europe/Madrid"},"calendario":{"duracion":30,"margen":10,"antelacion":4,"enlace":""},"notificaciones":{"correo":true,"push":true,"whatsapp":false,"resumen":true,"altas":true,"incidencias":true}}',
  NULL, '2026-01-12', UTC_TIMESTAMP(6), UTC_TIMESTAMP(6)
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM perfiles WHERE raiz = 1);

-- Los permisos de la raíz (todos a true) los rellena el backend la primera vez
-- que arranca, a partir de permisos_catalogo: así nunca se quedan atrás si se
-- añade un permiso nuevo.

-- Comprobación: debe devolver una fila con es_raiz = 1 y tiene_clave = 0
-- (pasará a 1 cuando pongas la contraseña en api/instalar.php).
SELECT p.email, p.rol, p.raiz AS es_raiz, (c.clave_hash IS NOT NULL) AS tiene_clave,
       (SELECT COUNT(*) FROM permisos_catalogo) AS permisos_en_catalogo
FROM perfiles p JOIN cuentas c ON c.id = p.id
WHERE p.raiz = 1;
