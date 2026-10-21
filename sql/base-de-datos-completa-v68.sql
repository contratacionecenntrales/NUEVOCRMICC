-- =============================================================================
-- ICC CRM v68 · BASE DE DATOS COMPLETA (instalar o actualizar en un solo paso)
--
-- Cómo usarlo: phpMyAdmin > tu base de datos > Importar > este archivo > Continuar.
--
-- - Si la base de datos YA TIENE datos (tu CRM actual): NO borra nada.
--   Solo crea las tablas, columnas e índices que falten y amplía lo necesario
--   para la versión v68. Sirve vengas de la versión que vengas (v55 en adelante).
-- - Si la base de datos está VACÍA: crea el CRM completo y un usuario
--   Super Administrador inicial (ver el final del archivo).
-- - Se puede ejecutar MÁS DE UNA VEZ sin errores ni duplicados.
-- =============================================================================

SET NAMES utf8mb4;
SET @icc_modo_anterior = @@SESSION.sql_mode;
SET SESSION sql_mode = 'NO_ENGINE_SUBSTITUTION';
SET FOREIGN_KEY_CHECKS = 0;

-- -----------------------------------------------------------------------------
-- 1) Tablas (solo se crean las que no existen)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `agentes_ficha` (
  `usuario_id` int(10) unsigned NOT NULL,
  `dni` varchar(20) NOT NULL DEFAULT '',
  `fecha_nacimiento` date DEFAULT NULL,
  `direccion` varchar(255) NOT NULL DEFAULT '',
  `poblacion` varchar(120) NOT NULL DEFAULT '',
  `provincia` varchar(120) NOT NULL DEFAULT '',
  `codigo_postal` varchar(10) NOT NULL DEFAULT '',
  `email_personal` varchar(190) NOT NULL DEFAULT '',
  `iban` varchar(40) NOT NULL DEFAULT '',
  `contacto_emergencia` varchar(190) NOT NULL DEFAULT '',
  `tipo_relacion` enum('autonomo','empleado','colaborador','subagente','otro') DEFAULT NULL,
  `fecha_incorporacion` date DEFAULT NULL,
  `zona` varchar(190) NOT NULL DEFAULT '',
  `sectores` varchar(255) NOT NULL DEFAULT '',
  `objetivo_contratos_mes` int(10) unsigned DEFAULT NULL,
  `objetivo_kw_mes` decimal(10,2) DEFAULT NULL,
  `objetivo_facturacion_mes` decimal(10,2) DEFAULT NULL,
  `observaciones` text DEFAULT NULL,
  `actualizado_por` int(10) unsigned DEFAULT NULL,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`usuario_id`),
  KEY `fk_agente_ficha_actualizado` (`actualizado_por`),
  CONSTRAINT `fk_agente_ficha_actualizado` FOREIGN KEY (`actualizado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_agente_ficha_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `agentes_seguimiento` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `usuario_id` int(10) unsigned NOT NULL,
  `autor_id` int(10) unsigned DEFAULT NULL,
  `tipo` enum('nota','reunion','objetivo','formacion','incidencia','reconocimiento') NOT NULL DEFAULT 'nota',
  `titulo` varchar(190) NOT NULL,
  `contenido` text DEFAULT NULL,
  `fecha` date NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_agente_seg_autor` (`autor_id`),
  KEY `idx_agente_seg_usuario_fecha` (`usuario_id`,`fecha`),
  CONSTRAINT `fk_agente_seg_autor` FOREIGN KEY (`autor_id`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_agente_seg_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `backoffice_agendas` (
  `backoffice_id` int(10) unsigned NOT NULL,
  `usuario_id` int(10) unsigned NOT NULL,
  `asignado_por` int(10) unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`backoffice_id`,`usuario_id`),
  KEY `fk_bo_ag_asignado_por` (`asignado_por`),
  KEY `idx_bo_ag_usuario` (`usuario_id`),
  CONSTRAINT `fk_bo_ag_asignado_por` FOREIGN KEY (`asignado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_bo_ag_backoffice` FOREIGN KEY (`backoffice_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_bo_ag_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `backoffice_comerciales` (
  `backoffice_id` int(10) unsigned NOT NULL,
  `comercial_id` int(10) unsigned NOT NULL,
  `asignado_por` int(10) unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`backoffice_id`,`comercial_id`),
  KEY `fk_bo_com_asignado_por` (`asignado_por`),
  KEY `idx_bo_com_comercial` (`comercial_id`),
  CONSTRAINT `fk_bo_com_asignado_por` FOREIGN KEY (`asignado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_bo_com_backoffice` FOREIGN KEY (`backoffice_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_bo_com_comercial` FOREIGN KEY (`comercial_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `citas` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `comercial_id` int(10) unsigned DEFAULT NULL,
  `equipo_id` int(10) unsigned DEFAULT NULL,
  `cliente_id` int(10) unsigned DEFAULT NULL,
  `tipo` varchar(20) NOT NULL DEFAULT 'visita',
  `cliente_nombre` varchar(200) NOT NULL,
  `contacto_nombre` varchar(150) NOT NULL DEFAULT '',
  `telefono` varchar(30) NOT NULL DEFAULT '',
  `email` varchar(190) NOT NULL DEFAULT '',
  `direccion` varchar(500) NOT NULL DEFAULT '',
  `sector` enum('energia','telecomunicaciones','alarmas','multisectorial','seguros','financiero') NOT NULL DEFAULT 'energia',
  `fecha` date NOT NULL,
  `hora_inicio` time NOT NULL,
  `hora_fin` time NOT NULL,
  `estado` enum('programada','confirmada','realizada','reprogramada','ko') NOT NULL DEFAULT 'programada',
  `notas` text DEFAULT NULL,
  `resumen` text DEFAULT NULL,
  `proximos_pasos` varchar(500) NOT NULL DEFAULT '',
  `presupuesto_id` int(10) unsigned DEFAULT NULL,
  `creado_por` int(10) unsigned DEFAULT NULL,
  `asignada_por` int(10) unsigned DEFAULT NULL,
  `asignada_en` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_citas_comercial_fecha` (`comercial_id`,`fecha`),
  KEY `idx_citas_fecha` (`fecha`),
  KEY `fk_cita_presupuesto` (`presupuesto_id`),
  KEY `fk_cita_creado_por` (`creado_por`),
  KEY `idx_citas_cliente` (`cliente_id`,`fecha`),
  KEY `fk_cita_asignada_por` (`asignada_por`),
  KEY `idx_citas_equipo` (`equipo_id`,`comercial_id`),
  CONSTRAINT `fk_cita_asignada_por` FOREIGN KEY (`asignada_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_cita_cliente` FOREIGN KEY (`cliente_id`) REFERENCES `clientes` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_cita_comercial` FOREIGN KEY (`comercial_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_cita_creado_por` FOREIGN KEY (`creado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_cita_equipo` FOREIGN KEY (`equipo_id`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_cita_presupuesto` FOREIGN KEY (`presupuesto_id`) REFERENCES `presupuestos` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `clientes` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `comercial_id` int(10) unsigned DEFAULT NULL,
  `razon_social` varchar(190) NOT NULL,
  `cif` varchar(20) NOT NULL,
  `contacto_nombre` varchar(150) NOT NULL DEFAULT '',
  `contacto_telefono` varchar(40) NOT NULL DEFAULT '',
  `contacto_email` varchar(190) NOT NULL DEFAULT '',
  `sector` varchar(120) NOT NULL DEFAULT '',
  `tipo_cliente` enum('residencial','pyme','comunidad_vecinos','gran_cuenta') NOT NULL DEFAULT 'residencial',
  `telefono` varchar(40) NOT NULL DEFAULT '',
  `email` varchar(190) NOT NULL DEFAULT '',
  `direccion_suministro` varchar(255) NOT NULL DEFAULT '',
  `estado` enum('lead_captado','estudio_backoffice','oferta_presentada','en_cierre','cliente_activo','perdido') NOT NULL DEFAULT 'lead_captado',
  `motivo_perdida` varchar(255) NOT NULL DEFAULT '',
  `valor_estimado` decimal(12,2) DEFAULT NULL,
  `fecha_cierre_prevista` date DEFAULT NULL,
  `notas` text DEFAULT NULL,
  `upload_token` char(36) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `upload_token` (`upload_token`),
  KEY `idx_clientes_estado` (`estado`),
  KEY `idx_clientes_comercial` (`comercial_id`),
  CONSTRAINT `fk_clientes_comercial` FOREIGN KEY (`comercial_id`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `cliente_servicios` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `cliente_id` int(10) unsigned NOT NULL,
  `servicio` enum('energia','telecomunicaciones','seguros','alarmas','financiero','paginas_web','campanas') NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_cliente_servicio` (`cliente_id`,`servicio`),
  CONSTRAINT `fk_cs_cliente` FOREIGN KEY (`cliente_id`) REFERENCES `clientes` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `cmp_config` (
  `clave` varchar(50) NOT NULL,
  `valor` varchar(255) NOT NULL,
  PRIMARY KEY (`clave`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `cmp_ene_informes` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `numero` varchar(40) NOT NULL,
  `usuario_id` int(10) unsigned NOT NULL,
  `cliente_id` int(10) unsigned DEFAULT NULL,
  `tipo` varchar(10) NOT NULL DEFAULT 'luz',
  `cliente_nombre` varchar(150) DEFAULT NULL,
  `cups` varchar(30) DEFAULT NULL,
  `comercializadora_actual` varchar(150) DEFAULT NULL,
  `tarifa_propuesta` varchar(150) DEFAULT NULL,
  `coste_actual_anual` decimal(12,2) DEFAULT NULL,
  `coste_propuesto_anual` decimal(12,2) DEFAULT NULL,
  `ahorro_anual` decimal(12,2) DEFAULT NULL,
  `datos` longtext NOT NULL,
  `pdf_ruta` varchar(255) DEFAULT NULL,
  `pdf_bytes` int(10) unsigned DEFAULT NULL,
  `pdf_fecha` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `numero` (`numero`),
  KEY `idx_cmp_ene_informes_usuario` (`usuario_id`,`updated_at`),
  KEY `idx_cmp_ene_informes_cliente` (`cliente_id`),
  CONSTRAINT `fk_cmp_ene_informes_cliente` FOREIGN KEY (`cliente_id`) REFERENCES `clientes` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_cmp_ene_informes_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `cmp_ene_tarifas` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `tipo` varchar(10) NOT NULL DEFAULT 'luz',
  `peaje` varchar(10) NOT NULL DEFAULT '2.0TD',
  `rol` varchar(10) NOT NULL DEFAULT 'propia',
  `comercializadora` varchar(120) NOT NULL,
  `nombre` varchar(150) NOT NULL,
  `modalidad` varchar(10) NOT NULL DEFAULT 'fijo',
  `cliente` varchar(12) NOT NULL DEFAULT 'todos',
  `pp1` decimal(10,6) NOT NULL DEFAULT 0.000000,
  `pp2` decimal(10,6) NOT NULL DEFAULT 0.000000,
  `pp3` decimal(10,6) NOT NULL DEFAULT 0.000000,
  `pp4` decimal(10,6) NOT NULL DEFAULT 0.000000,
  `pp5` decimal(10,6) NOT NULL DEFAULT 0.000000,
  `pp6` decimal(10,6) NOT NULL DEFAULT 0.000000,
  `pe1` decimal(10,6) NOT NULL DEFAULT 0.000000,
  `pe2` decimal(10,6) NOT NULL DEFAULT 0.000000,
  `pe3` decimal(10,6) NOT NULL DEFAULT 0.000000,
  `pe4` decimal(10,6) NOT NULL DEFAULT 0.000000,
  `pe5` decimal(10,6) NOT NULL DEFAULT 0.000000,
  `pe6` decimal(10,6) NOT NULL DEFAULT 0.000000,
  `termino_fijo_dia` decimal(10,6) NOT NULL DEFAULT 0.000000,
  `ssaa_kwh` decimal(10,6) NOT NULL DEFAULT 0.000000,
  `compensacion_kwh` decimal(10,6) NOT NULL DEFAULT 0.000000,
  `permanencia_meses` int(11) NOT NULL DEFAULT 0,
  `comision_tramos` varchar(255) DEFAULT NULL,
  `valoracion` varchar(255) DEFAULT NULL,
  `ventajas` text DEFAULT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  `actualizado_por` int(10) unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_cmp_ene_tarifas` (`tipo`,`peaje`,`rol`,`activo`),
  KEY `fk_cmp_ene_tarifas_usuario` (`actualizado_por`),
  CONSTRAINT `fk_cmp_ene_tarifas_usuario` FOREIGN KEY (`actualizado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `cmp_limites` (
  `clave` char(64) NOT NULL,
  `contador` int(10) unsigned NOT NULL DEFAULT 0,
  `inicio` int(10) unsigned NOT NULL,
  PRIMARY KEY (`clave`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `cmp_tel_comisiones` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `marca` varchar(50) NOT NULL,
  `concepto` varchar(40) NOT NULL,
  `tramo` varchar(20) NOT NULL,
  `importe` decimal(10,3) NOT NULL,
  `importe_alta` decimal(10,3) DEFAULT NULL,
  `nota` varchar(255) DEFAULT NULL,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_cmp_tel_comision` (`marca`,`concepto`,`tramo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `cmp_tel_informes` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `numero` varchar(40) NOT NULL,
  `usuario_id` int(10) unsigned NOT NULL,
  `cliente_id` int(10) unsigned DEFAULT NULL,
  `cliente_nombre` varchar(150) DEFAULT NULL,
  `operador_actual` varchar(150) DEFAULT NULL,
  `operador_propuesto` varchar(150) DEFAULT NULL,
  `coste_actual_anual` decimal(12,2) DEFAULT NULL,
  `coste_propuesto_anual` decimal(12,2) DEFAULT NULL,
  `ahorro_anual` decimal(12,2) DEFAULT NULL,
  `datos` longtext NOT NULL,
  `pdf_ruta` varchar(255) DEFAULT NULL,
  `pdf_bytes` int(10) unsigned DEFAULT NULL,
  `pdf_fecha` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `numero` (`numero`),
  KEY `idx_cmp_tel_informes_usuario` (`usuario_id`,`updated_at`),
  KEY `idx_cmp_tel_informes_cliente` (`cliente_id`),
  CONSTRAINT `fk_cmp_tel_informes_cliente` FOREIGN KEY (`cliente_id`) REFERENCES `clientes` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_cmp_tel_informes_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `cmp_tel_perfiles` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `nombre` varchar(150) NOT NULL,
  `datos` longtext NOT NULL,
  `actualizado_por` int(10) unsigned DEFAULT NULL,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `nombre` (`nombre`),
  KEY `fk_cmp_tel_perfiles_usuario` (`actualizado_por`),
  CONSTRAINT `fk_cmp_tel_perfiles_usuario` FOREIGN KEY (`actualizado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `comparador_auditorias` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `cliente_id` int(10) unsigned NOT NULL,
  `gestor_id` int(10) unsigned DEFAULT NULL,
  `sector` enum('energia','telefonia','alarmas','pack_integral') NOT NULL,
  `tipo_informe` varchar(30) NOT NULL DEFAULT 'comparativa',
  `codigo` varchar(40) DEFAULT NULL,
  `referencia_factura` varchar(190) NOT NULL DEFAULT '',
  `documento_id` int(10) unsigned DEFAULT NULL,
  `datos_entrada` longtext NOT NULL,
  `resultado` longtext NOT NULL,
  `coste_actual_anual` decimal(12,2) DEFAULT NULL,
  `coste_propuesto_anual` decimal(12,2) DEFAULT NULL,
  `ahorro_anual` decimal(12,2) DEFAULT NULL,
  `ahorro_porcentaje` decimal(6,2) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_comparador_gestor` (`gestor_id`),
  KEY `idx_comparador_cliente` (`cliente_id`,`created_at`),
  KEY `fk_comparador_documento` (`documento_id`),
  KEY `idx_comparador_fecha` (`created_at`),
  CONSTRAINT `fk_comparador_cliente` FOREIGN KEY (`cliente_id`) REFERENCES `clientes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_comparador_documento` FOREIGN KEY (`documento_id`) REFERENCES `documentos` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_comparador_gestor` FOREIGN KEY (`gestor_id`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `contratos` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `cliente_id` int(10) unsigned DEFAULT NULL,
  `comercial_id` int(10) unsigned DEFAULT NULL,
  `sector` enum('alarmas','energia','telecomunicaciones','seguros','financiero') NOT NULL DEFAULT 'energia',
  `numero_contrato` varchar(60) NOT NULL DEFAULT '',
  `titular` varchar(190) NOT NULL,
  `cif_titular` varchar(20) NOT NULL DEFAULT '',
  `tarifa` varchar(80) NOT NULL DEFAULT '',
  `comercializadora` varchar(120) NOT NULL DEFAULT '',
  `kw` decimal(10,2) DEFAULT NULL,
  `estado` enum('tramitado','ok','ko','incidencias','verificado','decomisionado','en_distribuidora') NOT NULL DEFAULT 'tramitado',
  `fecha_alta` date NOT NULL,
  `fecha_activacion` date DEFAULT NULL,
  `notas` text DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_contrato_cliente` (`cliente_id`),
  KEY `idx_contratos_sector` (`sector`),
  KEY `idx_contratos_estado` (`estado`),
  KEY `idx_contratos_comercializadora` (`comercializadora`),
  KEY `idx_contratos_tarifa` (`tarifa`),
  KEY `idx_contratos_comercial` (`comercial_id`),
  KEY `idx_contratos_fecha_alta` (`fecha_alta`),
  FULLTEXT KEY `ft_contratos_busqueda` (`numero_contrato`,`titular`,`cif_titular`),
  CONSTRAINT `fk_contrato_cliente` FOREIGN KEY (`cliente_id`) REFERENCES `clientes` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_contrato_comercial` FOREIGN KEY (`comercial_id`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `documentos` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `cliente_id` int(10) unsigned NOT NULL,
  `presupuesto_id` int(10) unsigned DEFAULT NULL,
  `tipo` enum('factura','estudio','contrato_firmado','otro') NOT NULL,
  `ruta_archivo` varchar(255) NOT NULL,
  `nombre_archivo` varchar(255) NOT NULL,
  `subido_por` int(10) unsigned DEFAULT NULL,
  `notas` varchar(500) NOT NULL DEFAULT '',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_doc_usuario` (`subido_por`),
  KEY `idx_documentos_cliente` (`cliente_id`),
  KEY `idx_documentos_tipo` (`tipo`),
  KEY `idx_documentos_presupuesto` (`presupuesto_id`),
  CONSTRAINT `fk_doc_cliente` FOREIGN KEY (`cliente_id`) REFERENCES `clientes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_doc_presupuesto` FOREIGN KEY (`presupuesto_id`) REFERENCES `presupuestos` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_doc_usuario` FOREIGN KEY (`subido_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `estudios` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `cliente_id` int(10) unsigned NOT NULL,
  `documento_id` int(10) unsigned DEFAULT NULL,
  `ahorro_estimado` decimal(10,2) DEFAULT NULL,
  `resumen` text DEFAULT NULL,
  `elaborado_por` int(10) unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_est_cliente` (`cliente_id`),
  KEY `fk_est_documento` (`documento_id`),
  KEY `fk_est_usuario` (`elaborado_por`),
  CONSTRAINT `fk_est_cliente` FOREIGN KEY (`cliente_id`) REFERENCES `clientes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_est_documento` FOREIGN KEY (`documento_id`) REFERENCES `documentos` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_est_usuario` FOREIGN KEY (`elaborado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ficheros` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `carpeta_id` int(10) unsigned NOT NULL,
  `nombre_archivo` varchar(255) NOT NULL,
  `ruta_archivo` varchar(255) NOT NULL,
  `subido_por` int(10) unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_fichero_usuario` (`subido_por`),
  KEY `idx_ficheros_carpeta` (`carpeta_id`),
  CONSTRAINT `fk_fichero_carpeta` FOREIGN KEY (`carpeta_id`) REFERENCES `ficheros_carpetas` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_fichero_usuario` FOREIGN KEY (`subido_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ficheros_carpetas` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `nombre` varchar(150) NOT NULL,
  `parent_id` int(10) unsigned DEFAULT NULL,
  `propietario_id` int(10) unsigned DEFAULT NULL,
  `creado_por` int(10) unsigned DEFAULT NULL,
  `seccion` varchar(20) DEFAULT NULL,
  `orden` int(11) NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_carpeta_creador` (`creado_por`),
  KEY `idx_ficheros_carpetas_parent` (`parent_id`),
  KEY `idx_ficheros_carpetas_propietario` (`propietario_id`),
  CONSTRAINT `fk_carpeta_creador` FOREIGN KEY (`creado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_carpeta_parent` FOREIGN KEY (`parent_id`) REFERENCES `ficheros_carpetas` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_carpeta_propietario` FOREIGN KEY (`propietario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `firmas` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `cliente_id` int(10) unsigned NOT NULL,
  `documento_id` int(10) unsigned DEFAULT NULL,
  `firmante_nombre` varchar(150) NOT NULL,
  `firmante_dni` varchar(20) NOT NULL,
  `ruta_archivo` varchar(255) NOT NULL,
  `hash_integridad` char(64) NOT NULL,
  `ip` varchar(45) DEFAULT NULL,
  `user_agent` varchar(255) DEFAULT NULL,
  `firmado_por` int(10) unsigned DEFAULT NULL,
  `firmado_en` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_firma_cliente` (`cliente_id`),
  KEY `fk_firma_documento` (`documento_id`),
  KEY `fk_firma_usuario` (`firmado_por`),
  CONSTRAINT `fk_firma_cliente` FOREIGN KEY (`cliente_id`) REFERENCES `clientes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_firma_documento` FOREIGN KEY (`documento_id`) REFERENCES `documentos` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_firma_usuario` FOREIGN KEY (`firmado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `historial_estado` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `cliente_id` int(10) unsigned NOT NULL,
  `estado_anterior` varchar(40) DEFAULT NULL,
  `estado_nuevo` varchar(40) NOT NULL,
  `cambiado_por` int(10) unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_hist_usuario` (`cambiado_por`),
  KEY `idx_historial_cliente_estado` (`cliente_id`,`estado_nuevo`,`created_at`),
  CONSTRAINT `fk_hist_cliente` FOREIGN KEY (`cliente_id`) REFERENCES `clientes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_hist_usuario` FOREIGN KEY (`cambiado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `logs_impersonacion` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `admin_id` int(10) unsigned NOT NULL,
  `usuario_objetivo_id` int(10) unsigned NOT NULL,
  `iniciado_en` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `finalizado_en` datetime DEFAULT NULL,
  `ip` varchar(45) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_impersonacion_objetivo` (`usuario_objetivo_id`),
  KEY `idx_impersonacion_admin` (`admin_id`,`iniciado_en`),
  CONSTRAINT `fk_impersonacion_admin` FOREIGN KEY (`admin_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_impersonacion_objetivo` FOREIGN KEY (`usuario_objetivo_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `notificaciones` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int(10) unsigned NOT NULL,
  `cliente_id` int(10) unsigned DEFAULT NULL,
  `tipo` varchar(40) NOT NULL DEFAULT 'info',
  `mensaje` varchar(500) NOT NULL,
  `leido` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_notif_cliente` (`cliente_id`),
  KEY `idx_notif_user` (`user_id`,`leido`),
  CONSTRAINT `fk_notif_cliente` FOREIGN KEY (`cliente_id`) REFERENCES `clientes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_notif_usuario` FOREIGN KEY (`user_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `presupuestos` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `cliente_id` int(10) unsigned NOT NULL,
  `comercial_id` int(10) unsigned DEFAULT NULL,
  `sector` enum('alarmas','energia','telecomunicaciones','seguros','financiero') NOT NULL,
  `tipo_suministro` enum('electricidad','gas','dual') DEFAULT NULL,
  `cups` varchar(30) NOT NULL DEFAULT '',
  `comercializadora_actual` varchar(120) NOT NULL DEFAULT '',
  `tarifa_actual` varchar(120) NOT NULL DEFAULT '',
  `potencias_contratadas` varchar(200) NOT NULL DEFAULT '',
  `consumo_anual_kwh` int(10) unsigned DEFAULT NULL,
  `datos_actuales_otros` varchar(300) NOT NULL DEFAULT '',
  `fecha_permanencia` date DEFAULT NULL,
  `estado` enum('borrador','factura_subida','estudio_adjunto','documentacion_contrato','cerrado') NOT NULL DEFAULT 'borrador',
  `contrato_id` int(10) unsigned DEFAULT NULL,
  `notas` varchar(500) NOT NULL DEFAULT '',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_presupuesto_contrato` (`contrato_id`),
  KEY `idx_presupuestos_cliente` (`cliente_id`),
  KEY `idx_presupuestos_sector` (`sector`),
  KEY `idx_presupuestos_estado` (`estado`),
  KEY `idx_presupuestos_comercial` (`comercial_id`),
  KEY `idx_presupuestos_fecha_permanencia` (`fecha_permanencia`),
  CONSTRAINT `fk_presupuesto_cliente` FOREIGN KEY (`cliente_id`) REFERENCES `clientes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_presupuesto_comercial` FOREIGN KEY (`comercial_id`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_presupuesto_contrato` FOREIGN KEY (`contrato_id`) REFERENCES `contratos` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `proformas` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `numero` varchar(60) NOT NULL,
  `facturado_por` enum('ICC','ELITE_ENERGY','EVOLVIX_GLOBAL') NOT NULL,
  `comercial_id` int(10) unsigned DEFAULT NULL,
  `cliente_email` varchar(190) NOT NULL DEFAULT '',
  `importe` decimal(10,2) NOT NULL DEFAULT 0.00,
  `estado_pago` enum('pagada','pendiente') NOT NULL DEFAULT 'pendiente',
  `fecha` date NOT NULL,
  `ruta_archivo` varchar(255) DEFAULT NULL,
  `notas` varchar(500) NOT NULL DEFAULT '',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_proforma_comercial` (`comercial_id`),
  KEY `idx_proformas_estado` (`estado_pago`),
  KEY `idx_proformas_facturado_por` (`facturado_por`),
  KEY `idx_proformas_fecha` (`fecha`),
  CONSTRAINT `fk_proforma_comercial` FOREIGN KEY (`comercial_id`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tarifa_alarmas` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `proveedor` varchar(150) NOT NULL DEFAULT 'Integral Connection Consulting',
  `nombre_kit` varchar(150) NOT NULL,
  `tipo_kit` enum('basica','camaras','gama_alta','comercial') NOT NULL,
  `descripcion` text DEFAULT NULL,
  `equipamiento` varchar(1000) DEFAULT NULL,
  `num_camaras` int(11) NOT NULL DEFAULT 0,
  `num_sensores` int(11) NOT NULL DEFAULT 0,
  `num_mandos` int(11) NOT NULL DEFAULT 0,
  `conexion_movil` tinyint(1) NOT NULL DEFAULT 1,
  `central_receptora` tinyint(1) NOT NULL DEFAULT 1,
  `cuota_mensual` decimal(10,2) NOT NULL DEFAULT 0.00,
  `coste_instalacion` decimal(10,2) NOT NULL DEFAULT 0.00,
  `permanencia_meses` int(11) NOT NULL DEFAULT 0,
  `comision_captacion` decimal(10,2) NOT NULL DEFAULT 0.00,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  `destacada` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_tarifa_alarmas_tipo` (`tipo_kit`,`activo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tarifa_energia` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `proveedor` varchar(150) NOT NULL DEFAULT 'Integral Connection Consulting',
  `nombre_tarifa` varchar(150) NOT NULL,
  `tipo` enum('luz','gas') NOT NULL,
  `segmento` varchar(20) NOT NULL,
  `descripcion` text DEFAULT NULL,
  `precio_potencia_p1` decimal(10,6) NOT NULL DEFAULT 0.000000,
  `precio_potencia_p2` decimal(10,6) NOT NULL DEFAULT 0.000000,
  `precio_potencia_p3` decimal(10,6) NOT NULL DEFAULT 0.000000,
  `precio_potencia_p4` decimal(10,6) NOT NULL DEFAULT 0.000000,
  `precio_potencia_p5` decimal(10,6) NOT NULL DEFAULT 0.000000,
  `precio_potencia_p6` decimal(10,6) NOT NULL DEFAULT 0.000000,
  `precio_energia_p1` decimal(10,6) NOT NULL DEFAULT 0.000000,
  `precio_energia_p2` decimal(10,6) NOT NULL DEFAULT 0.000000,
  `precio_energia_p3` decimal(10,6) NOT NULL DEFAULT 0.000000,
  `precio_energia_p4` decimal(10,6) NOT NULL DEFAULT 0.000000,
  `precio_energia_p5` decimal(10,6) NOT NULL DEFAULT 0.000000,
  `precio_energia_p6` decimal(10,6) NOT NULL DEFAULT 0.000000,
  `termino_fijo_mensual` decimal(10,4) NOT NULL DEFAULT 0.0000,
  `alquiler_equipo_dia` decimal(10,6) NOT NULL DEFAULT 0.000000,
  `comision_captacion` decimal(10,2) NOT NULL DEFAULT 0.00,
  `permanencia_meses` int(11) NOT NULL DEFAULT 0,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  `destacada` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_tarifa_energia_tipo_segmento` (`tipo`,`segmento`,`activo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tarifa_mercado` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `operador` varchar(100) NOT NULL,
  `cuota_mensual` decimal(10,2) NOT NULL DEFAULT 0.00,
  `promocion` varchar(255) DEFAULT NULL,
  `valoracion` varchar(255) DEFAULT NULL,
  `caracteristicas` text DEFAULT NULL,
  `recomendada` tinyint(1) NOT NULL DEFAULT 0,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_tarifa_mercado_activo` (`activo`,`cuota_mensual`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tarifa_telefonia` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `proveedor` varchar(150) NOT NULL DEFAULT 'Integral Connection Consulting',
  `nombre_tarifa` varchar(150) NOT NULL,
  `tipo` enum('movil','fibra','fijo','convergente','centralita') NOT NULL,
  `descripcion` text DEFAULT NULL,
  `gb_datos` decimal(10,2) DEFAULT NULL,
  `datos_ilimitados` tinyint(1) NOT NULL DEFAULT 0,
  `llamadas_ilimitadas` tinyint(1) NOT NULL DEFAULT 1,
  `minutos_incluidos` decimal(10,2) DEFAULT NULL,
  `velocidad_fibra_mb` decimal(10,2) DEFAULT NULL,
  `lineas_moviles_incluidas` int(11) NOT NULL DEFAULT 0,
  `lineas_fijas_incluidas` int(11) NOT NULL DEFAULT 0,
  `extras` varchar(500) DEFAULT NULL,
  `precio_mensual` decimal(10,2) NOT NULL DEFAULT 0.00,
  `permanencia_meses` int(11) NOT NULL DEFAULT 0,
  `comision_captacion` decimal(10,2) NOT NULL DEFAULT 0.00,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  `destacada` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_tarifa_telefonia_tipo` (`tipo`,`activo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `usuarios` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `numero_relacion` varchar(20) DEFAULT NULL,
  `nombre` varchar(120) NOT NULL,
  `apellidos` varchar(150) NOT NULL DEFAULT '',
  `email` varchar(190) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `telefono` varchar(40) NOT NULL DEFAULT '',
  `prefijo_telefono` varchar(8) NOT NULL DEFAULT '+34',
  `extension` varchar(10) NOT NULL DEFAULT '',
  `avatar_ruta` varchar(255) DEFAULT NULL,
  `empresa` varchar(150) NOT NULL DEFAULT '',
  `cif` varchar(20) NOT NULL DEFAULT '',
  `tipo` varchar(60) NOT NULL DEFAULT '',
  `rol` enum('comercial','backoffice','jefe_de_equipo','coordinador','gerente','admin','super_admin') NOT NULL DEFAULT 'comercial',
  `supervisor_id` int(10) unsigned DEFAULT NULL,
  `bloqueado` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `ultimo_acceso` datetime DEFAULT NULL,
  `debe_cambiar_password` tinyint(1) NOT NULL DEFAULT 0,
  `password_actualizada_en` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  UNIQUE KEY `idx_usuarios_numero_relacion` (`numero_relacion`),
  KEY `idx_usuarios_rol` (`rol`),
  KEY `idx_usuarios_bloqueado` (`bloqueado`),
  KEY `idx_usuarios_supervisor` (`supervisor_id`),
  CONSTRAINT `fk_usuarios_supervisor` FOREIGN KEY (`supervisor_id`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `usuarios_auditoria` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `usuario_id` int(10) unsigned NOT NULL,
  `autor_id` int(10) unsigned DEFAULT NULL,
  `accion` varchar(60) NOT NULL,
  `detalle` varchar(500) NOT NULL DEFAULT '',
  `ip` varchar(45) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_usuaud_autor` (`autor_id`),
  KEY `idx_usuaud_usuario` (`usuario_id`,`created_at`),
  KEY `idx_usuaud_accion` (`usuario_id`,`accion`,`created_at`),
  CONSTRAINT `fk_usuaud_autor` FOREIGN KEY (`autor_id`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_usuaud_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `usuarios_permisos` (
  `usuario_id` int(10) unsigned NOT NULL,
  `permiso` varchar(60) NOT NULL,
  `concedido` tinyint(1) NOT NULL,
  `actualizado_por` int(10) unsigned DEFAULT NULL,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`usuario_id`,`permiso`),
  KEY `fk_usuperm_autor` (`actualizado_por`),
  CONSTRAINT `fk_usuperm_autor` FOREIGN KEY (`actualizado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_usuperm_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `usuarios_preferencias` (
  `usuario_id` int(10) unsigned NOT NULL,
  `horario` text DEFAULT NULL,
  `estado_disponibilidad` enum('disponible','ocupado','ausente','vacaciones','baja') NOT NULL DEFAULT 'disponible',
  `ausencia_desde` date DEFAULT NULL,
  `ausencia_hasta` date DEFAULT NULL,
  `nota_disponibilidad` varchar(255) NOT NULL DEFAULT '',
  `notificaciones` text DEFAULT NULL,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`usuario_id`),
  CONSTRAINT `fk_usupref_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `usuarios_sesiones` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `usuario_id` int(10) unsigned NOT NULL,
  `token_hash` char(64) NOT NULL,
  `ip` varchar(45) DEFAULT NULL,
  `user_agent` varchar(255) NOT NULL DEFAULT '',
  `creada_en` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `ultima_actividad` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `cerrada_en` datetime DEFAULT NULL,
  `cerrada_por` int(10) unsigned DEFAULT NULL,
  `motivo_cierre` varchar(60) NOT NULL DEFAULT '',
  PRIMARY KEY (`id`),
  UNIQUE KEY `token_hash` (`token_hash`),
  KEY `fk_ususes_cerrada_por` (`cerrada_por`),
  KEY `idx_ususes_usuario` (`usuario_id`,`cerrada_en`),
  CONSTRAINT `fk_ususes_cerrada_por` FOREIGN KEY (`cerrada_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ususes_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 2) Columnas que falten en tablas que ya existían
-- -----------------------------------------------------------------------------
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'agentes_ficha' AND column_name = 'usuario_id'), 'ALTER TABLE `agentes_ficha` ADD COLUMN `usuario_id` int(10) unsigned NOT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'agentes_ficha' AND column_name = 'dni'), 'ALTER TABLE `agentes_ficha` ADD COLUMN `dni` varchar(20) NOT NULL DEFAULT ''''', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'agentes_ficha' AND column_name = 'fecha_nacimiento'), 'ALTER TABLE `agentes_ficha` ADD COLUMN `fecha_nacimiento` date DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'agentes_ficha' AND column_name = 'direccion'), 'ALTER TABLE `agentes_ficha` ADD COLUMN `direccion` varchar(255) NOT NULL DEFAULT ''''', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'agentes_ficha' AND column_name = 'poblacion'), 'ALTER TABLE `agentes_ficha` ADD COLUMN `poblacion` varchar(120) NOT NULL DEFAULT ''''', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'agentes_ficha' AND column_name = 'provincia'), 'ALTER TABLE `agentes_ficha` ADD COLUMN `provincia` varchar(120) NOT NULL DEFAULT ''''', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'agentes_ficha' AND column_name = 'codigo_postal'), 'ALTER TABLE `agentes_ficha` ADD COLUMN `codigo_postal` varchar(10) NOT NULL DEFAULT ''''', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'agentes_ficha' AND column_name = 'email_personal'), 'ALTER TABLE `agentes_ficha` ADD COLUMN `email_personal` varchar(190) NOT NULL DEFAULT ''''', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'agentes_ficha' AND column_name = 'iban'), 'ALTER TABLE `agentes_ficha` ADD COLUMN `iban` varchar(40) NOT NULL DEFAULT ''''', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'agentes_ficha' AND column_name = 'contacto_emergencia'), 'ALTER TABLE `agentes_ficha` ADD COLUMN `contacto_emergencia` varchar(190) NOT NULL DEFAULT ''''', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'agentes_ficha' AND column_name = 'tipo_relacion'), 'ALTER TABLE `agentes_ficha` ADD COLUMN `tipo_relacion` enum(''autonomo'',''empleado'',''colaborador'',''subagente'',''otro'') DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'agentes_ficha' AND column_name = 'fecha_incorporacion'), 'ALTER TABLE `agentes_ficha` ADD COLUMN `fecha_incorporacion` date DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'agentes_ficha' AND column_name = 'zona'), 'ALTER TABLE `agentes_ficha` ADD COLUMN `zona` varchar(190) NOT NULL DEFAULT ''''', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'agentes_ficha' AND column_name = 'sectores'), 'ALTER TABLE `agentes_ficha` ADD COLUMN `sectores` varchar(255) NOT NULL DEFAULT ''''', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'agentes_ficha' AND column_name = 'objetivo_contratos_mes'), 'ALTER TABLE `agentes_ficha` ADD COLUMN `objetivo_contratos_mes` int(10) unsigned DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'agentes_ficha' AND column_name = 'objetivo_kw_mes'), 'ALTER TABLE `agentes_ficha` ADD COLUMN `objetivo_kw_mes` decimal(10,2) DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'agentes_ficha' AND column_name = 'objetivo_facturacion_mes'), 'ALTER TABLE `agentes_ficha` ADD COLUMN `objetivo_facturacion_mes` decimal(10,2) DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'agentes_ficha' AND column_name = 'observaciones'), 'ALTER TABLE `agentes_ficha` ADD COLUMN `observaciones` text DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'agentes_ficha' AND column_name = 'actualizado_por'), 'ALTER TABLE `agentes_ficha` ADD COLUMN `actualizado_por` int(10) unsigned DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'agentes_ficha' AND column_name = 'updated_at'), 'ALTER TABLE `agentes_ficha` ADD COLUMN `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'agentes_seguimiento' AND column_name = 'id'), 'ALTER TABLE `agentes_seguimiento` ADD COLUMN `id` int(10) unsigned NOT NULL AUTO_INCREMENT', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'agentes_seguimiento' AND column_name = 'usuario_id'), 'ALTER TABLE `agentes_seguimiento` ADD COLUMN `usuario_id` int(10) unsigned NOT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'agentes_seguimiento' AND column_name = 'autor_id'), 'ALTER TABLE `agentes_seguimiento` ADD COLUMN `autor_id` int(10) unsigned DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'agentes_seguimiento' AND column_name = 'tipo'), 'ALTER TABLE `agentes_seguimiento` ADD COLUMN `tipo` enum(''nota'',''reunion'',''objetivo'',''formacion'',''incidencia'',''reconocimiento'') NOT NULL DEFAULT ''nota''', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'agentes_seguimiento' AND column_name = 'titulo'), 'ALTER TABLE `agentes_seguimiento` ADD COLUMN `titulo` varchar(190) NOT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'agentes_seguimiento' AND column_name = 'contenido'), 'ALTER TABLE `agentes_seguimiento` ADD COLUMN `contenido` text DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'agentes_seguimiento' AND column_name = 'fecha'), 'ALTER TABLE `agentes_seguimiento` ADD COLUMN `fecha` date NOT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'agentes_seguimiento' AND column_name = 'created_at'), 'ALTER TABLE `agentes_seguimiento` ADD COLUMN `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'backoffice_agendas' AND column_name = 'backoffice_id'), 'ALTER TABLE `backoffice_agendas` ADD COLUMN `backoffice_id` int(10) unsigned NOT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'backoffice_agendas' AND column_name = 'usuario_id'), 'ALTER TABLE `backoffice_agendas` ADD COLUMN `usuario_id` int(10) unsigned NOT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'backoffice_agendas' AND column_name = 'asignado_por'), 'ALTER TABLE `backoffice_agendas` ADD COLUMN `asignado_por` int(10) unsigned DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'backoffice_agendas' AND column_name = 'created_at'), 'ALTER TABLE `backoffice_agendas` ADD COLUMN `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'backoffice_comerciales' AND column_name = 'backoffice_id'), 'ALTER TABLE `backoffice_comerciales` ADD COLUMN `backoffice_id` int(10) unsigned NOT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'backoffice_comerciales' AND column_name = 'comercial_id'), 'ALTER TABLE `backoffice_comerciales` ADD COLUMN `comercial_id` int(10) unsigned NOT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'backoffice_comerciales' AND column_name = 'asignado_por'), 'ALTER TABLE `backoffice_comerciales` ADD COLUMN `asignado_por` int(10) unsigned DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'backoffice_comerciales' AND column_name = 'created_at'), 'ALTER TABLE `backoffice_comerciales` ADD COLUMN `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'citas' AND column_name = 'id'), 'ALTER TABLE `citas` ADD COLUMN `id` int(10) unsigned NOT NULL AUTO_INCREMENT', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'citas' AND column_name = 'comercial_id'), 'ALTER TABLE `citas` ADD COLUMN `comercial_id` int(10) unsigned DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'citas' AND column_name = 'equipo_id'), 'ALTER TABLE `citas` ADD COLUMN `equipo_id` int(10) unsigned DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'citas' AND column_name = 'cliente_id'), 'ALTER TABLE `citas` ADD COLUMN `cliente_id` int(10) unsigned DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'citas' AND column_name = 'tipo'), 'ALTER TABLE `citas` ADD COLUMN `tipo` varchar(20) NOT NULL DEFAULT ''visita''', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'citas' AND column_name = 'cliente_nombre'), 'ALTER TABLE `citas` ADD COLUMN `cliente_nombre` varchar(200) NOT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'citas' AND column_name = 'contacto_nombre'), 'ALTER TABLE `citas` ADD COLUMN `contacto_nombre` varchar(150) NOT NULL DEFAULT ''''', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'citas' AND column_name = 'telefono'), 'ALTER TABLE `citas` ADD COLUMN `telefono` varchar(30) NOT NULL DEFAULT ''''', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'citas' AND column_name = 'email'), 'ALTER TABLE `citas` ADD COLUMN `email` varchar(190) NOT NULL DEFAULT ''''', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'citas' AND column_name = 'direccion'), 'ALTER TABLE `citas` ADD COLUMN `direccion` varchar(500) NOT NULL DEFAULT ''''', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'citas' AND column_name = 'sector'), 'ALTER TABLE `citas` ADD COLUMN `sector` enum(''energia'',''telecomunicaciones'',''alarmas'',''multisectorial'',''seguros'',''financiero'') NOT NULL DEFAULT ''energia''', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'citas' AND column_name = 'fecha'), 'ALTER TABLE `citas` ADD COLUMN `fecha` date NOT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'citas' AND column_name = 'hora_inicio'), 'ALTER TABLE `citas` ADD COLUMN `hora_inicio` time NOT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'citas' AND column_name = 'hora_fin'), 'ALTER TABLE `citas` ADD COLUMN `hora_fin` time NOT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'citas' AND column_name = 'estado'), 'ALTER TABLE `citas` ADD COLUMN `estado` enum(''programada'',''confirmada'',''realizada'',''reprogramada'',''ko'') NOT NULL DEFAULT ''programada''', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'citas' AND column_name = 'notas'), 'ALTER TABLE `citas` ADD COLUMN `notas` text DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'citas' AND column_name = 'resumen'), 'ALTER TABLE `citas` ADD COLUMN `resumen` text DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'citas' AND column_name = 'proximos_pasos'), 'ALTER TABLE `citas` ADD COLUMN `proximos_pasos` varchar(500) NOT NULL DEFAULT ''''', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'citas' AND column_name = 'presupuesto_id'), 'ALTER TABLE `citas` ADD COLUMN `presupuesto_id` int(10) unsigned DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'citas' AND column_name = 'creado_por'), 'ALTER TABLE `citas` ADD COLUMN `creado_por` int(10) unsigned DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'citas' AND column_name = 'asignada_por'), 'ALTER TABLE `citas` ADD COLUMN `asignada_por` int(10) unsigned DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'citas' AND column_name = 'asignada_en'), 'ALTER TABLE `citas` ADD COLUMN `asignada_en` datetime DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'citas' AND column_name = 'created_at'), 'ALTER TABLE `citas` ADD COLUMN `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'citas' AND column_name = 'updated_at'), 'ALTER TABLE `citas` ADD COLUMN `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'clientes' AND column_name = 'id'), 'ALTER TABLE `clientes` ADD COLUMN `id` int(10) unsigned NOT NULL AUTO_INCREMENT', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'clientes' AND column_name = 'comercial_id'), 'ALTER TABLE `clientes` ADD COLUMN `comercial_id` int(10) unsigned DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'clientes' AND column_name = 'razon_social'), 'ALTER TABLE `clientes` ADD COLUMN `razon_social` varchar(190) NOT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'clientes' AND column_name = 'cif'), 'ALTER TABLE `clientes` ADD COLUMN `cif` varchar(20) NOT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'clientes' AND column_name = 'contacto_nombre'), 'ALTER TABLE `clientes` ADD COLUMN `contacto_nombre` varchar(150) NOT NULL DEFAULT ''''', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'clientes' AND column_name = 'contacto_telefono'), 'ALTER TABLE `clientes` ADD COLUMN `contacto_telefono` varchar(40) NOT NULL DEFAULT ''''', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'clientes' AND column_name = 'contacto_email'), 'ALTER TABLE `clientes` ADD COLUMN `contacto_email` varchar(190) NOT NULL DEFAULT ''''', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'clientes' AND column_name = 'sector'), 'ALTER TABLE `clientes` ADD COLUMN `sector` varchar(120) NOT NULL DEFAULT ''''', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'clientes' AND column_name = 'tipo_cliente'), 'ALTER TABLE `clientes` ADD COLUMN `tipo_cliente` enum(''residencial'',''pyme'',''comunidad_vecinos'',''gran_cuenta'') NOT NULL DEFAULT ''residencial''', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'clientes' AND column_name = 'telefono'), 'ALTER TABLE `clientes` ADD COLUMN `telefono` varchar(40) NOT NULL DEFAULT ''''', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'clientes' AND column_name = 'email'), 'ALTER TABLE `clientes` ADD COLUMN `email` varchar(190) NOT NULL DEFAULT ''''', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'clientes' AND column_name = 'direccion_suministro'), 'ALTER TABLE `clientes` ADD COLUMN `direccion_suministro` varchar(255) NOT NULL DEFAULT ''''', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'clientes' AND column_name = 'estado'), 'ALTER TABLE `clientes` ADD COLUMN `estado` enum(''lead_captado'',''estudio_backoffice'',''oferta_presentada'',''en_cierre'',''cliente_activo'',''perdido'') NOT NULL DEFAULT ''lead_captado''', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'clientes' AND column_name = 'motivo_perdida'), 'ALTER TABLE `clientes` ADD COLUMN `motivo_perdida` varchar(255) NOT NULL DEFAULT ''''', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'clientes' AND column_name = 'valor_estimado'), 'ALTER TABLE `clientes` ADD COLUMN `valor_estimado` decimal(12,2) DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'clientes' AND column_name = 'fecha_cierre_prevista'), 'ALTER TABLE `clientes` ADD COLUMN `fecha_cierre_prevista` date DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'clientes' AND column_name = 'notas'), 'ALTER TABLE `clientes` ADD COLUMN `notas` text DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'clientes' AND column_name = 'upload_token'), 'ALTER TABLE `clientes` ADD COLUMN `upload_token` char(36) NOT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'clientes' AND column_name = 'created_at'), 'ALTER TABLE `clientes` ADD COLUMN `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'clientes' AND column_name = 'updated_at'), 'ALTER TABLE `clientes` ADD COLUMN `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cliente_servicios' AND column_name = 'id'), 'ALTER TABLE `cliente_servicios` ADD COLUMN `id` int(10) unsigned NOT NULL AUTO_INCREMENT', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cliente_servicios' AND column_name = 'cliente_id'), 'ALTER TABLE `cliente_servicios` ADD COLUMN `cliente_id` int(10) unsigned NOT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cliente_servicios' AND column_name = 'servicio'), 'ALTER TABLE `cliente_servicios` ADD COLUMN `servicio` enum(''energia'',''telecomunicaciones'',''seguros'',''alarmas'',''financiero'',''paginas_web'',''campanas'') NOT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cmp_config' AND column_name = 'clave'), 'ALTER TABLE `cmp_config` ADD COLUMN `clave` varchar(50) NOT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cmp_config' AND column_name = 'valor'), 'ALTER TABLE `cmp_config` ADD COLUMN `valor` varchar(255) NOT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cmp_ene_informes' AND column_name = 'id'), 'ALTER TABLE `cmp_ene_informes` ADD COLUMN `id` int(10) unsigned NOT NULL AUTO_INCREMENT', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cmp_ene_informes' AND column_name = 'numero'), 'ALTER TABLE `cmp_ene_informes` ADD COLUMN `numero` varchar(40) NOT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cmp_ene_informes' AND column_name = 'usuario_id'), 'ALTER TABLE `cmp_ene_informes` ADD COLUMN `usuario_id` int(10) unsigned NOT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cmp_ene_informes' AND column_name = 'cliente_id'), 'ALTER TABLE `cmp_ene_informes` ADD COLUMN `cliente_id` int(10) unsigned DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cmp_ene_informes' AND column_name = 'tipo'), 'ALTER TABLE `cmp_ene_informes` ADD COLUMN `tipo` varchar(10) NOT NULL DEFAULT ''luz''', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cmp_ene_informes' AND column_name = 'cliente_nombre'), 'ALTER TABLE `cmp_ene_informes` ADD COLUMN `cliente_nombre` varchar(150) DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cmp_ene_informes' AND column_name = 'cups'), 'ALTER TABLE `cmp_ene_informes` ADD COLUMN `cups` varchar(30) DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cmp_ene_informes' AND column_name = 'comercializadora_actual'), 'ALTER TABLE `cmp_ene_informes` ADD COLUMN `comercializadora_actual` varchar(150) DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cmp_ene_informes' AND column_name = 'tarifa_propuesta'), 'ALTER TABLE `cmp_ene_informes` ADD COLUMN `tarifa_propuesta` varchar(150) DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cmp_ene_informes' AND column_name = 'coste_actual_anual'), 'ALTER TABLE `cmp_ene_informes` ADD COLUMN `coste_actual_anual` decimal(12,2) DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cmp_ene_informes' AND column_name = 'coste_propuesto_anual'), 'ALTER TABLE `cmp_ene_informes` ADD COLUMN `coste_propuesto_anual` decimal(12,2) DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cmp_ene_informes' AND column_name = 'ahorro_anual'), 'ALTER TABLE `cmp_ene_informes` ADD COLUMN `ahorro_anual` decimal(12,2) DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cmp_ene_informes' AND column_name = 'datos'), 'ALTER TABLE `cmp_ene_informes` ADD COLUMN `datos` longtext NOT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cmp_ene_informes' AND column_name = 'pdf_ruta'), 'ALTER TABLE `cmp_ene_informes` ADD COLUMN `pdf_ruta` varchar(255) DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cmp_ene_informes' AND column_name = 'pdf_bytes'), 'ALTER TABLE `cmp_ene_informes` ADD COLUMN `pdf_bytes` int(10) unsigned DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cmp_ene_informes' AND column_name = 'pdf_fecha'), 'ALTER TABLE `cmp_ene_informes` ADD COLUMN `pdf_fecha` datetime DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cmp_ene_informes' AND column_name = 'created_at'), 'ALTER TABLE `cmp_ene_informes` ADD COLUMN `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cmp_ene_informes' AND column_name = 'updated_at'), 'ALTER TABLE `cmp_ene_informes` ADD COLUMN `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cmp_ene_tarifas' AND column_name = 'id'), 'ALTER TABLE `cmp_ene_tarifas` ADD COLUMN `id` int(10) unsigned NOT NULL AUTO_INCREMENT', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cmp_ene_tarifas' AND column_name = 'tipo'), 'ALTER TABLE `cmp_ene_tarifas` ADD COLUMN `tipo` varchar(10) NOT NULL DEFAULT ''luz''', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cmp_ene_tarifas' AND column_name = 'peaje'), 'ALTER TABLE `cmp_ene_tarifas` ADD COLUMN `peaje` varchar(10) NOT NULL DEFAULT ''2.0TD''', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cmp_ene_tarifas' AND column_name = 'rol'), 'ALTER TABLE `cmp_ene_tarifas` ADD COLUMN `rol` varchar(10) NOT NULL DEFAULT ''propia''', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cmp_ene_tarifas' AND column_name = 'comercializadora'), 'ALTER TABLE `cmp_ene_tarifas` ADD COLUMN `comercializadora` varchar(120) NOT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cmp_ene_tarifas' AND column_name = 'nombre'), 'ALTER TABLE `cmp_ene_tarifas` ADD COLUMN `nombre` varchar(150) NOT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cmp_ene_tarifas' AND column_name = 'modalidad'), 'ALTER TABLE `cmp_ene_tarifas` ADD COLUMN `modalidad` varchar(10) NOT NULL DEFAULT ''fijo''', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cmp_ene_tarifas' AND column_name = 'cliente'), 'ALTER TABLE `cmp_ene_tarifas` ADD COLUMN `cliente` varchar(12) NOT NULL DEFAULT ''todos''', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cmp_ene_tarifas' AND column_name = 'pp1'), 'ALTER TABLE `cmp_ene_tarifas` ADD COLUMN `pp1` decimal(10,6) NOT NULL DEFAULT 0.000000', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cmp_ene_tarifas' AND column_name = 'pp2'), 'ALTER TABLE `cmp_ene_tarifas` ADD COLUMN `pp2` decimal(10,6) NOT NULL DEFAULT 0.000000', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cmp_ene_tarifas' AND column_name = 'pp3'), 'ALTER TABLE `cmp_ene_tarifas` ADD COLUMN `pp3` decimal(10,6) NOT NULL DEFAULT 0.000000', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cmp_ene_tarifas' AND column_name = 'pp4'), 'ALTER TABLE `cmp_ene_tarifas` ADD COLUMN `pp4` decimal(10,6) NOT NULL DEFAULT 0.000000', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cmp_ene_tarifas' AND column_name = 'pp5'), 'ALTER TABLE `cmp_ene_tarifas` ADD COLUMN `pp5` decimal(10,6) NOT NULL DEFAULT 0.000000', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cmp_ene_tarifas' AND column_name = 'pp6'), 'ALTER TABLE `cmp_ene_tarifas` ADD COLUMN `pp6` decimal(10,6) NOT NULL DEFAULT 0.000000', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cmp_ene_tarifas' AND column_name = 'pe1'), 'ALTER TABLE `cmp_ene_tarifas` ADD COLUMN `pe1` decimal(10,6) NOT NULL DEFAULT 0.000000', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cmp_ene_tarifas' AND column_name = 'pe2'), 'ALTER TABLE `cmp_ene_tarifas` ADD COLUMN `pe2` decimal(10,6) NOT NULL DEFAULT 0.000000', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cmp_ene_tarifas' AND column_name = 'pe3'), 'ALTER TABLE `cmp_ene_tarifas` ADD COLUMN `pe3` decimal(10,6) NOT NULL DEFAULT 0.000000', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cmp_ene_tarifas' AND column_name = 'pe4'), 'ALTER TABLE `cmp_ene_tarifas` ADD COLUMN `pe4` decimal(10,6) NOT NULL DEFAULT 0.000000', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cmp_ene_tarifas' AND column_name = 'pe5'), 'ALTER TABLE `cmp_ene_tarifas` ADD COLUMN `pe5` decimal(10,6) NOT NULL DEFAULT 0.000000', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cmp_ene_tarifas' AND column_name = 'pe6'), 'ALTER TABLE `cmp_ene_tarifas` ADD COLUMN `pe6` decimal(10,6) NOT NULL DEFAULT 0.000000', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cmp_ene_tarifas' AND column_name = 'termino_fijo_dia'), 'ALTER TABLE `cmp_ene_tarifas` ADD COLUMN `termino_fijo_dia` decimal(10,6) NOT NULL DEFAULT 0.000000', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cmp_ene_tarifas' AND column_name = 'ssaa_kwh'), 'ALTER TABLE `cmp_ene_tarifas` ADD COLUMN `ssaa_kwh` decimal(10,6) NOT NULL DEFAULT 0.000000', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cmp_ene_tarifas' AND column_name = 'compensacion_kwh'), 'ALTER TABLE `cmp_ene_tarifas` ADD COLUMN `compensacion_kwh` decimal(10,6) NOT NULL DEFAULT 0.000000', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cmp_ene_tarifas' AND column_name = 'permanencia_meses'), 'ALTER TABLE `cmp_ene_tarifas` ADD COLUMN `permanencia_meses` int(11) NOT NULL DEFAULT 0', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cmp_ene_tarifas' AND column_name = 'comision_tramos'), 'ALTER TABLE `cmp_ene_tarifas` ADD COLUMN `comision_tramos` varchar(255) DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cmp_ene_tarifas' AND column_name = 'valoracion'), 'ALTER TABLE `cmp_ene_tarifas` ADD COLUMN `valoracion` varchar(255) DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cmp_ene_tarifas' AND column_name = 'ventajas'), 'ALTER TABLE `cmp_ene_tarifas` ADD COLUMN `ventajas` text DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cmp_ene_tarifas' AND column_name = 'activo'), 'ALTER TABLE `cmp_ene_tarifas` ADD COLUMN `activo` tinyint(1) NOT NULL DEFAULT 1', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cmp_ene_tarifas' AND column_name = 'actualizado_por'), 'ALTER TABLE `cmp_ene_tarifas` ADD COLUMN `actualizado_por` int(10) unsigned DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cmp_ene_tarifas' AND column_name = 'created_at'), 'ALTER TABLE `cmp_ene_tarifas` ADD COLUMN `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cmp_ene_tarifas' AND column_name = 'updated_at'), 'ALTER TABLE `cmp_ene_tarifas` ADD COLUMN `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cmp_limites' AND column_name = 'clave'), 'ALTER TABLE `cmp_limites` ADD COLUMN `clave` char(64) NOT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cmp_limites' AND column_name = 'contador'), 'ALTER TABLE `cmp_limites` ADD COLUMN `contador` int(10) unsigned NOT NULL DEFAULT 0', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cmp_limites' AND column_name = 'inicio'), 'ALTER TABLE `cmp_limites` ADD COLUMN `inicio` int(10) unsigned NOT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cmp_tel_comisiones' AND column_name = 'id'), 'ALTER TABLE `cmp_tel_comisiones` ADD COLUMN `id` int(10) unsigned NOT NULL AUTO_INCREMENT', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cmp_tel_comisiones' AND column_name = 'marca'), 'ALTER TABLE `cmp_tel_comisiones` ADD COLUMN `marca` varchar(50) NOT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cmp_tel_comisiones' AND column_name = 'concepto'), 'ALTER TABLE `cmp_tel_comisiones` ADD COLUMN `concepto` varchar(40) NOT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cmp_tel_comisiones' AND column_name = 'tramo'), 'ALTER TABLE `cmp_tel_comisiones` ADD COLUMN `tramo` varchar(20) NOT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cmp_tel_comisiones' AND column_name = 'importe'), 'ALTER TABLE `cmp_tel_comisiones` ADD COLUMN `importe` decimal(10,3) NOT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cmp_tel_comisiones' AND column_name = 'importe_alta'), 'ALTER TABLE `cmp_tel_comisiones` ADD COLUMN `importe_alta` decimal(10,3) DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cmp_tel_comisiones' AND column_name = 'nota'), 'ALTER TABLE `cmp_tel_comisiones` ADD COLUMN `nota` varchar(255) DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cmp_tel_comisiones' AND column_name = 'updated_at'), 'ALTER TABLE `cmp_tel_comisiones` ADD COLUMN `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cmp_tel_informes' AND column_name = 'id'), 'ALTER TABLE `cmp_tel_informes` ADD COLUMN `id` int(10) unsigned NOT NULL AUTO_INCREMENT', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cmp_tel_informes' AND column_name = 'numero'), 'ALTER TABLE `cmp_tel_informes` ADD COLUMN `numero` varchar(40) NOT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cmp_tel_informes' AND column_name = 'usuario_id'), 'ALTER TABLE `cmp_tel_informes` ADD COLUMN `usuario_id` int(10) unsigned NOT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cmp_tel_informes' AND column_name = 'cliente_id'), 'ALTER TABLE `cmp_tel_informes` ADD COLUMN `cliente_id` int(10) unsigned DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cmp_tel_informes' AND column_name = 'cliente_nombre'), 'ALTER TABLE `cmp_tel_informes` ADD COLUMN `cliente_nombre` varchar(150) DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cmp_tel_informes' AND column_name = 'operador_actual'), 'ALTER TABLE `cmp_tel_informes` ADD COLUMN `operador_actual` varchar(150) DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cmp_tel_informes' AND column_name = 'operador_propuesto'), 'ALTER TABLE `cmp_tel_informes` ADD COLUMN `operador_propuesto` varchar(150) DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cmp_tel_informes' AND column_name = 'coste_actual_anual'), 'ALTER TABLE `cmp_tel_informes` ADD COLUMN `coste_actual_anual` decimal(12,2) DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cmp_tel_informes' AND column_name = 'coste_propuesto_anual'), 'ALTER TABLE `cmp_tel_informes` ADD COLUMN `coste_propuesto_anual` decimal(12,2) DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cmp_tel_informes' AND column_name = 'ahorro_anual'), 'ALTER TABLE `cmp_tel_informes` ADD COLUMN `ahorro_anual` decimal(12,2) DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cmp_tel_informes' AND column_name = 'datos'), 'ALTER TABLE `cmp_tel_informes` ADD COLUMN `datos` longtext NOT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cmp_tel_informes' AND column_name = 'pdf_ruta'), 'ALTER TABLE `cmp_tel_informes` ADD COLUMN `pdf_ruta` varchar(255) DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cmp_tel_informes' AND column_name = 'pdf_bytes'), 'ALTER TABLE `cmp_tel_informes` ADD COLUMN `pdf_bytes` int(10) unsigned DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cmp_tel_informes' AND column_name = 'pdf_fecha'), 'ALTER TABLE `cmp_tel_informes` ADD COLUMN `pdf_fecha` datetime DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cmp_tel_informes' AND column_name = 'created_at'), 'ALTER TABLE `cmp_tel_informes` ADD COLUMN `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cmp_tel_informes' AND column_name = 'updated_at'), 'ALTER TABLE `cmp_tel_informes` ADD COLUMN `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cmp_tel_perfiles' AND column_name = 'id'), 'ALTER TABLE `cmp_tel_perfiles` ADD COLUMN `id` int(10) unsigned NOT NULL AUTO_INCREMENT', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cmp_tel_perfiles' AND column_name = 'nombre'), 'ALTER TABLE `cmp_tel_perfiles` ADD COLUMN `nombre` varchar(150) NOT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cmp_tel_perfiles' AND column_name = 'datos'), 'ALTER TABLE `cmp_tel_perfiles` ADD COLUMN `datos` longtext NOT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cmp_tel_perfiles' AND column_name = 'actualizado_por'), 'ALTER TABLE `cmp_tel_perfiles` ADD COLUMN `actualizado_por` int(10) unsigned DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cmp_tel_perfiles' AND column_name = 'updated_at'), 'ALTER TABLE `cmp_tel_perfiles` ADD COLUMN `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'comparador_auditorias' AND column_name = 'id'), 'ALTER TABLE `comparador_auditorias` ADD COLUMN `id` int(10) unsigned NOT NULL AUTO_INCREMENT', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'comparador_auditorias' AND column_name = 'cliente_id'), 'ALTER TABLE `comparador_auditorias` ADD COLUMN `cliente_id` int(10) unsigned NOT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'comparador_auditorias' AND column_name = 'gestor_id'), 'ALTER TABLE `comparador_auditorias` ADD COLUMN `gestor_id` int(10) unsigned DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'comparador_auditorias' AND column_name = 'sector'), 'ALTER TABLE `comparador_auditorias` ADD COLUMN `sector` enum(''energia'',''telefonia'',''alarmas'',''pack_integral'') NOT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'comparador_auditorias' AND column_name = 'tipo_informe'), 'ALTER TABLE `comparador_auditorias` ADD COLUMN `tipo_informe` varchar(30) NOT NULL DEFAULT ''comparativa''', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'comparador_auditorias' AND column_name = 'codigo'), 'ALTER TABLE `comparador_auditorias` ADD COLUMN `codigo` varchar(40) DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'comparador_auditorias' AND column_name = 'referencia_factura'), 'ALTER TABLE `comparador_auditorias` ADD COLUMN `referencia_factura` varchar(190) NOT NULL DEFAULT ''''', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'comparador_auditorias' AND column_name = 'documento_id'), 'ALTER TABLE `comparador_auditorias` ADD COLUMN `documento_id` int(10) unsigned DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'comparador_auditorias' AND column_name = 'datos_entrada'), 'ALTER TABLE `comparador_auditorias` ADD COLUMN `datos_entrada` longtext NOT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'comparador_auditorias' AND column_name = 'resultado'), 'ALTER TABLE `comparador_auditorias` ADD COLUMN `resultado` longtext NOT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'comparador_auditorias' AND column_name = 'coste_actual_anual'), 'ALTER TABLE `comparador_auditorias` ADD COLUMN `coste_actual_anual` decimal(12,2) DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'comparador_auditorias' AND column_name = 'coste_propuesto_anual'), 'ALTER TABLE `comparador_auditorias` ADD COLUMN `coste_propuesto_anual` decimal(12,2) DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'comparador_auditorias' AND column_name = 'ahorro_anual'), 'ALTER TABLE `comparador_auditorias` ADD COLUMN `ahorro_anual` decimal(12,2) DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'comparador_auditorias' AND column_name = 'ahorro_porcentaje'), 'ALTER TABLE `comparador_auditorias` ADD COLUMN `ahorro_porcentaje` decimal(6,2) DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'comparador_auditorias' AND column_name = 'created_at'), 'ALTER TABLE `comparador_auditorias` ADD COLUMN `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'contratos' AND column_name = 'id'), 'ALTER TABLE `contratos` ADD COLUMN `id` int(10) unsigned NOT NULL AUTO_INCREMENT', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'contratos' AND column_name = 'cliente_id'), 'ALTER TABLE `contratos` ADD COLUMN `cliente_id` int(10) unsigned DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'contratos' AND column_name = 'comercial_id'), 'ALTER TABLE `contratos` ADD COLUMN `comercial_id` int(10) unsigned DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'contratos' AND column_name = 'sector'), 'ALTER TABLE `contratos` ADD COLUMN `sector` enum(''alarmas'',''energia'',''telecomunicaciones'',''seguros'',''financiero'') NOT NULL DEFAULT ''energia''', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'contratos' AND column_name = 'numero_contrato'), 'ALTER TABLE `contratos` ADD COLUMN `numero_contrato` varchar(60) NOT NULL DEFAULT ''''', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'contratos' AND column_name = 'titular'), 'ALTER TABLE `contratos` ADD COLUMN `titular` varchar(190) NOT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'contratos' AND column_name = 'cif_titular'), 'ALTER TABLE `contratos` ADD COLUMN `cif_titular` varchar(20) NOT NULL DEFAULT ''''', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'contratos' AND column_name = 'tarifa'), 'ALTER TABLE `contratos` ADD COLUMN `tarifa` varchar(80) NOT NULL DEFAULT ''''', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'contratos' AND column_name = 'comercializadora'), 'ALTER TABLE `contratos` ADD COLUMN `comercializadora` varchar(120) NOT NULL DEFAULT ''''', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'contratos' AND column_name = 'kw'), 'ALTER TABLE `contratos` ADD COLUMN `kw` decimal(10,2) DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'contratos' AND column_name = 'estado'), 'ALTER TABLE `contratos` ADD COLUMN `estado` enum(''tramitado'',''ok'',''ko'',''incidencias'',''verificado'',''decomisionado'',''en_distribuidora'') NOT NULL DEFAULT ''tramitado''', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'contratos' AND column_name = 'fecha_alta'), 'ALTER TABLE `contratos` ADD COLUMN `fecha_alta` date NOT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'contratos' AND column_name = 'fecha_activacion'), 'ALTER TABLE `contratos` ADD COLUMN `fecha_activacion` date DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'contratos' AND column_name = 'notas'), 'ALTER TABLE `contratos` ADD COLUMN `notas` text DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'contratos' AND column_name = 'created_at'), 'ALTER TABLE `contratos` ADD COLUMN `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'contratos' AND column_name = 'updated_at'), 'ALTER TABLE `contratos` ADD COLUMN `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'documentos' AND column_name = 'id'), 'ALTER TABLE `documentos` ADD COLUMN `id` int(10) unsigned NOT NULL AUTO_INCREMENT', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'documentos' AND column_name = 'cliente_id'), 'ALTER TABLE `documentos` ADD COLUMN `cliente_id` int(10) unsigned NOT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'documentos' AND column_name = 'presupuesto_id'), 'ALTER TABLE `documentos` ADD COLUMN `presupuesto_id` int(10) unsigned DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'documentos' AND column_name = 'tipo'), 'ALTER TABLE `documentos` ADD COLUMN `tipo` enum(''factura'',''estudio'',''contrato_firmado'',''otro'') NOT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'documentos' AND column_name = 'ruta_archivo'), 'ALTER TABLE `documentos` ADD COLUMN `ruta_archivo` varchar(255) NOT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'documentos' AND column_name = 'nombre_archivo'), 'ALTER TABLE `documentos` ADD COLUMN `nombre_archivo` varchar(255) NOT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'documentos' AND column_name = 'subido_por'), 'ALTER TABLE `documentos` ADD COLUMN `subido_por` int(10) unsigned DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'documentos' AND column_name = 'notas'), 'ALTER TABLE `documentos` ADD COLUMN `notas` varchar(500) NOT NULL DEFAULT ''''', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'documentos' AND column_name = 'created_at'), 'ALTER TABLE `documentos` ADD COLUMN `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'estudios' AND column_name = 'id'), 'ALTER TABLE `estudios` ADD COLUMN `id` int(10) unsigned NOT NULL AUTO_INCREMENT', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'estudios' AND column_name = 'cliente_id'), 'ALTER TABLE `estudios` ADD COLUMN `cliente_id` int(10) unsigned NOT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'estudios' AND column_name = 'documento_id'), 'ALTER TABLE `estudios` ADD COLUMN `documento_id` int(10) unsigned DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'estudios' AND column_name = 'ahorro_estimado'), 'ALTER TABLE `estudios` ADD COLUMN `ahorro_estimado` decimal(10,2) DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'estudios' AND column_name = 'resumen'), 'ALTER TABLE `estudios` ADD COLUMN `resumen` text DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'estudios' AND column_name = 'elaborado_por'), 'ALTER TABLE `estudios` ADD COLUMN `elaborado_por` int(10) unsigned DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'estudios' AND column_name = 'created_at'), 'ALTER TABLE `estudios` ADD COLUMN `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'ficheros' AND column_name = 'id'), 'ALTER TABLE `ficheros` ADD COLUMN `id` int(10) unsigned NOT NULL AUTO_INCREMENT', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'ficheros' AND column_name = 'carpeta_id'), 'ALTER TABLE `ficheros` ADD COLUMN `carpeta_id` int(10) unsigned NOT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'ficheros' AND column_name = 'nombre_archivo'), 'ALTER TABLE `ficheros` ADD COLUMN `nombre_archivo` varchar(255) NOT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'ficheros' AND column_name = 'ruta_archivo'), 'ALTER TABLE `ficheros` ADD COLUMN `ruta_archivo` varchar(255) NOT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'ficheros' AND column_name = 'subido_por'), 'ALTER TABLE `ficheros` ADD COLUMN `subido_por` int(10) unsigned DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'ficheros' AND column_name = 'created_at'), 'ALTER TABLE `ficheros` ADD COLUMN `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'ficheros_carpetas' AND column_name = 'id'), 'ALTER TABLE `ficheros_carpetas` ADD COLUMN `id` int(10) unsigned NOT NULL AUTO_INCREMENT', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'ficheros_carpetas' AND column_name = 'nombre'), 'ALTER TABLE `ficheros_carpetas` ADD COLUMN `nombre` varchar(150) NOT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'ficheros_carpetas' AND column_name = 'parent_id'), 'ALTER TABLE `ficheros_carpetas` ADD COLUMN `parent_id` int(10) unsigned DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'ficheros_carpetas' AND column_name = 'propietario_id'), 'ALTER TABLE `ficheros_carpetas` ADD COLUMN `propietario_id` int(10) unsigned DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'ficheros_carpetas' AND column_name = 'creado_por'), 'ALTER TABLE `ficheros_carpetas` ADD COLUMN `creado_por` int(10) unsigned DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'ficheros_carpetas' AND column_name = 'seccion'), 'ALTER TABLE `ficheros_carpetas` ADD COLUMN `seccion` varchar(20) DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'ficheros_carpetas' AND column_name = 'orden'), 'ALTER TABLE `ficheros_carpetas` ADD COLUMN `orden` int(11) NOT NULL DEFAULT 0', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'ficheros_carpetas' AND column_name = 'created_at'), 'ALTER TABLE `ficheros_carpetas` ADD COLUMN `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'firmas' AND column_name = 'id'), 'ALTER TABLE `firmas` ADD COLUMN `id` int(10) unsigned NOT NULL AUTO_INCREMENT', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'firmas' AND column_name = 'cliente_id'), 'ALTER TABLE `firmas` ADD COLUMN `cliente_id` int(10) unsigned NOT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'firmas' AND column_name = 'documento_id'), 'ALTER TABLE `firmas` ADD COLUMN `documento_id` int(10) unsigned DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'firmas' AND column_name = 'firmante_nombre'), 'ALTER TABLE `firmas` ADD COLUMN `firmante_nombre` varchar(150) NOT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'firmas' AND column_name = 'firmante_dni'), 'ALTER TABLE `firmas` ADD COLUMN `firmante_dni` varchar(20) NOT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'firmas' AND column_name = 'ruta_archivo'), 'ALTER TABLE `firmas` ADD COLUMN `ruta_archivo` varchar(255) NOT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'firmas' AND column_name = 'hash_integridad'), 'ALTER TABLE `firmas` ADD COLUMN `hash_integridad` char(64) NOT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'firmas' AND column_name = 'ip'), 'ALTER TABLE `firmas` ADD COLUMN `ip` varchar(45) DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'firmas' AND column_name = 'user_agent'), 'ALTER TABLE `firmas` ADD COLUMN `user_agent` varchar(255) DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'firmas' AND column_name = 'firmado_por'), 'ALTER TABLE `firmas` ADD COLUMN `firmado_por` int(10) unsigned DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'firmas' AND column_name = 'firmado_en'), 'ALTER TABLE `firmas` ADD COLUMN `firmado_en` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'historial_estado' AND column_name = 'id'), 'ALTER TABLE `historial_estado` ADD COLUMN `id` int(10) unsigned NOT NULL AUTO_INCREMENT', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'historial_estado' AND column_name = 'cliente_id'), 'ALTER TABLE `historial_estado` ADD COLUMN `cliente_id` int(10) unsigned NOT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'historial_estado' AND column_name = 'estado_anterior'), 'ALTER TABLE `historial_estado` ADD COLUMN `estado_anterior` varchar(40) DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'historial_estado' AND column_name = 'estado_nuevo'), 'ALTER TABLE `historial_estado` ADD COLUMN `estado_nuevo` varchar(40) NOT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'historial_estado' AND column_name = 'cambiado_por'), 'ALTER TABLE `historial_estado` ADD COLUMN `cambiado_por` int(10) unsigned DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'historial_estado' AND column_name = 'created_at'), 'ALTER TABLE `historial_estado` ADD COLUMN `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'logs_impersonacion' AND column_name = 'id'), 'ALTER TABLE `logs_impersonacion` ADD COLUMN `id` int(10) unsigned NOT NULL AUTO_INCREMENT', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'logs_impersonacion' AND column_name = 'admin_id'), 'ALTER TABLE `logs_impersonacion` ADD COLUMN `admin_id` int(10) unsigned NOT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'logs_impersonacion' AND column_name = 'usuario_objetivo_id'), 'ALTER TABLE `logs_impersonacion` ADD COLUMN `usuario_objetivo_id` int(10) unsigned NOT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'logs_impersonacion' AND column_name = 'iniciado_en'), 'ALTER TABLE `logs_impersonacion` ADD COLUMN `iniciado_en` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'logs_impersonacion' AND column_name = 'finalizado_en'), 'ALTER TABLE `logs_impersonacion` ADD COLUMN `finalizado_en` datetime DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'logs_impersonacion' AND column_name = 'ip'), 'ALTER TABLE `logs_impersonacion` ADD COLUMN `ip` varchar(45) DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'notificaciones' AND column_name = 'id'), 'ALTER TABLE `notificaciones` ADD COLUMN `id` int(10) unsigned NOT NULL AUTO_INCREMENT', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'notificaciones' AND column_name = 'user_id'), 'ALTER TABLE `notificaciones` ADD COLUMN `user_id` int(10) unsigned NOT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'notificaciones' AND column_name = 'cliente_id'), 'ALTER TABLE `notificaciones` ADD COLUMN `cliente_id` int(10) unsigned DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'notificaciones' AND column_name = 'tipo'), 'ALTER TABLE `notificaciones` ADD COLUMN `tipo` varchar(40) NOT NULL DEFAULT ''info''', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'notificaciones' AND column_name = 'mensaje'), 'ALTER TABLE `notificaciones` ADD COLUMN `mensaje` varchar(500) NOT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'notificaciones' AND column_name = 'leido'), 'ALTER TABLE `notificaciones` ADD COLUMN `leido` tinyint(1) NOT NULL DEFAULT 0', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'notificaciones' AND column_name = 'created_at'), 'ALTER TABLE `notificaciones` ADD COLUMN `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'presupuestos' AND column_name = 'id'), 'ALTER TABLE `presupuestos` ADD COLUMN `id` int(10) unsigned NOT NULL AUTO_INCREMENT', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'presupuestos' AND column_name = 'cliente_id'), 'ALTER TABLE `presupuestos` ADD COLUMN `cliente_id` int(10) unsigned NOT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'presupuestos' AND column_name = 'comercial_id'), 'ALTER TABLE `presupuestos` ADD COLUMN `comercial_id` int(10) unsigned DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'presupuestos' AND column_name = 'sector'), 'ALTER TABLE `presupuestos` ADD COLUMN `sector` enum(''alarmas'',''energia'',''telecomunicaciones'',''seguros'',''financiero'') NOT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'presupuestos' AND column_name = 'tipo_suministro'), 'ALTER TABLE `presupuestos` ADD COLUMN `tipo_suministro` enum(''electricidad'',''gas'',''dual'') DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'presupuestos' AND column_name = 'cups'), 'ALTER TABLE `presupuestos` ADD COLUMN `cups` varchar(30) NOT NULL DEFAULT ''''', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'presupuestos' AND column_name = 'comercializadora_actual'), 'ALTER TABLE `presupuestos` ADD COLUMN `comercializadora_actual` varchar(120) NOT NULL DEFAULT ''''', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'presupuestos' AND column_name = 'tarifa_actual'), 'ALTER TABLE `presupuestos` ADD COLUMN `tarifa_actual` varchar(120) NOT NULL DEFAULT ''''', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'presupuestos' AND column_name = 'potencias_contratadas'), 'ALTER TABLE `presupuestos` ADD COLUMN `potencias_contratadas` varchar(200) NOT NULL DEFAULT ''''', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'presupuestos' AND column_name = 'consumo_anual_kwh'), 'ALTER TABLE `presupuestos` ADD COLUMN `consumo_anual_kwh` int(10) unsigned DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'presupuestos' AND column_name = 'datos_actuales_otros'), 'ALTER TABLE `presupuestos` ADD COLUMN `datos_actuales_otros` varchar(300) NOT NULL DEFAULT ''''', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'presupuestos' AND column_name = 'fecha_permanencia'), 'ALTER TABLE `presupuestos` ADD COLUMN `fecha_permanencia` date DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'presupuestos' AND column_name = 'estado'), 'ALTER TABLE `presupuestos` ADD COLUMN `estado` enum(''borrador'',''factura_subida'',''estudio_adjunto'',''documentacion_contrato'',''cerrado'') NOT NULL DEFAULT ''borrador''', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'presupuestos' AND column_name = 'contrato_id'), 'ALTER TABLE `presupuestos` ADD COLUMN `contrato_id` int(10) unsigned DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'presupuestos' AND column_name = 'notas'), 'ALTER TABLE `presupuestos` ADD COLUMN `notas` varchar(500) NOT NULL DEFAULT ''''', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'presupuestos' AND column_name = 'created_at'), 'ALTER TABLE `presupuestos` ADD COLUMN `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'presupuestos' AND column_name = 'updated_at'), 'ALTER TABLE `presupuestos` ADD COLUMN `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'proformas' AND column_name = 'id'), 'ALTER TABLE `proformas` ADD COLUMN `id` int(10) unsigned NOT NULL AUTO_INCREMENT', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'proformas' AND column_name = 'numero'), 'ALTER TABLE `proformas` ADD COLUMN `numero` varchar(60) NOT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'proformas' AND column_name = 'facturado_por'), 'ALTER TABLE `proformas` ADD COLUMN `facturado_por` enum(''ICC'',''ELITE_ENERGY'',''EVOLVIX_GLOBAL'') NOT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'proformas' AND column_name = 'comercial_id'), 'ALTER TABLE `proformas` ADD COLUMN `comercial_id` int(10) unsigned DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'proformas' AND column_name = 'cliente_email'), 'ALTER TABLE `proformas` ADD COLUMN `cliente_email` varchar(190) NOT NULL DEFAULT ''''', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'proformas' AND column_name = 'importe'), 'ALTER TABLE `proformas` ADD COLUMN `importe` decimal(10,2) NOT NULL DEFAULT 0.00', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'proformas' AND column_name = 'estado_pago'), 'ALTER TABLE `proformas` ADD COLUMN `estado_pago` enum(''pagada'',''pendiente'') NOT NULL DEFAULT ''pendiente''', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'proformas' AND column_name = 'fecha'), 'ALTER TABLE `proformas` ADD COLUMN `fecha` date NOT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'proformas' AND column_name = 'ruta_archivo'), 'ALTER TABLE `proformas` ADD COLUMN `ruta_archivo` varchar(255) DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'proformas' AND column_name = 'notas'), 'ALTER TABLE `proformas` ADD COLUMN `notas` varchar(500) NOT NULL DEFAULT ''''', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'proformas' AND column_name = 'created_at'), 'ALTER TABLE `proformas` ADD COLUMN `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tarifa_alarmas' AND column_name = 'id'), 'ALTER TABLE `tarifa_alarmas` ADD COLUMN `id` int(10) unsigned NOT NULL AUTO_INCREMENT', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tarifa_alarmas' AND column_name = 'proveedor'), 'ALTER TABLE `tarifa_alarmas` ADD COLUMN `proveedor` varchar(150) NOT NULL DEFAULT ''Integral Connection Consulting''', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tarifa_alarmas' AND column_name = 'nombre_kit'), 'ALTER TABLE `tarifa_alarmas` ADD COLUMN `nombre_kit` varchar(150) NOT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tarifa_alarmas' AND column_name = 'tipo_kit'), 'ALTER TABLE `tarifa_alarmas` ADD COLUMN `tipo_kit` enum(''basica'',''camaras'',''gama_alta'',''comercial'') NOT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tarifa_alarmas' AND column_name = 'descripcion'), 'ALTER TABLE `tarifa_alarmas` ADD COLUMN `descripcion` text DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tarifa_alarmas' AND column_name = 'equipamiento'), 'ALTER TABLE `tarifa_alarmas` ADD COLUMN `equipamiento` varchar(1000) DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tarifa_alarmas' AND column_name = 'num_camaras'), 'ALTER TABLE `tarifa_alarmas` ADD COLUMN `num_camaras` int(11) NOT NULL DEFAULT 0', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tarifa_alarmas' AND column_name = 'num_sensores'), 'ALTER TABLE `tarifa_alarmas` ADD COLUMN `num_sensores` int(11) NOT NULL DEFAULT 0', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tarifa_alarmas' AND column_name = 'num_mandos'), 'ALTER TABLE `tarifa_alarmas` ADD COLUMN `num_mandos` int(11) NOT NULL DEFAULT 0', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tarifa_alarmas' AND column_name = 'conexion_movil'), 'ALTER TABLE `tarifa_alarmas` ADD COLUMN `conexion_movil` tinyint(1) NOT NULL DEFAULT 1', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tarifa_alarmas' AND column_name = 'central_receptora'), 'ALTER TABLE `tarifa_alarmas` ADD COLUMN `central_receptora` tinyint(1) NOT NULL DEFAULT 1', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tarifa_alarmas' AND column_name = 'cuota_mensual'), 'ALTER TABLE `tarifa_alarmas` ADD COLUMN `cuota_mensual` decimal(10,2) NOT NULL DEFAULT 0.00', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tarifa_alarmas' AND column_name = 'coste_instalacion'), 'ALTER TABLE `tarifa_alarmas` ADD COLUMN `coste_instalacion` decimal(10,2) NOT NULL DEFAULT 0.00', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tarifa_alarmas' AND column_name = 'permanencia_meses'), 'ALTER TABLE `tarifa_alarmas` ADD COLUMN `permanencia_meses` int(11) NOT NULL DEFAULT 0', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tarifa_alarmas' AND column_name = 'comision_captacion'), 'ALTER TABLE `tarifa_alarmas` ADD COLUMN `comision_captacion` decimal(10,2) NOT NULL DEFAULT 0.00', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tarifa_alarmas' AND column_name = 'activo'), 'ALTER TABLE `tarifa_alarmas` ADD COLUMN `activo` tinyint(1) NOT NULL DEFAULT 1', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tarifa_alarmas' AND column_name = 'destacada'), 'ALTER TABLE `tarifa_alarmas` ADD COLUMN `destacada` tinyint(1) NOT NULL DEFAULT 0', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tarifa_alarmas' AND column_name = 'created_at'), 'ALTER TABLE `tarifa_alarmas` ADD COLUMN `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tarifa_alarmas' AND column_name = 'updated_at'), 'ALTER TABLE `tarifa_alarmas` ADD COLUMN `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tarifa_energia' AND column_name = 'id'), 'ALTER TABLE `tarifa_energia` ADD COLUMN `id` int(10) unsigned NOT NULL AUTO_INCREMENT', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tarifa_energia' AND column_name = 'proveedor'), 'ALTER TABLE `tarifa_energia` ADD COLUMN `proveedor` varchar(150) NOT NULL DEFAULT ''Integral Connection Consulting''', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tarifa_energia' AND column_name = 'nombre_tarifa'), 'ALTER TABLE `tarifa_energia` ADD COLUMN `nombre_tarifa` varchar(150) NOT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tarifa_energia' AND column_name = 'tipo'), 'ALTER TABLE `tarifa_energia` ADD COLUMN `tipo` enum(''luz'',''gas'') NOT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tarifa_energia' AND column_name = 'segmento'), 'ALTER TABLE `tarifa_energia` ADD COLUMN `segmento` varchar(20) NOT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tarifa_energia' AND column_name = 'descripcion'), 'ALTER TABLE `tarifa_energia` ADD COLUMN `descripcion` text DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tarifa_energia' AND column_name = 'precio_potencia_p1'), 'ALTER TABLE `tarifa_energia` ADD COLUMN `precio_potencia_p1` decimal(10,6) NOT NULL DEFAULT 0.000000', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tarifa_energia' AND column_name = 'precio_potencia_p2'), 'ALTER TABLE `tarifa_energia` ADD COLUMN `precio_potencia_p2` decimal(10,6) NOT NULL DEFAULT 0.000000', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tarifa_energia' AND column_name = 'precio_potencia_p3'), 'ALTER TABLE `tarifa_energia` ADD COLUMN `precio_potencia_p3` decimal(10,6) NOT NULL DEFAULT 0.000000', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tarifa_energia' AND column_name = 'precio_potencia_p4'), 'ALTER TABLE `tarifa_energia` ADD COLUMN `precio_potencia_p4` decimal(10,6) NOT NULL DEFAULT 0.000000', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tarifa_energia' AND column_name = 'precio_potencia_p5'), 'ALTER TABLE `tarifa_energia` ADD COLUMN `precio_potencia_p5` decimal(10,6) NOT NULL DEFAULT 0.000000', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tarifa_energia' AND column_name = 'precio_potencia_p6'), 'ALTER TABLE `tarifa_energia` ADD COLUMN `precio_potencia_p6` decimal(10,6) NOT NULL DEFAULT 0.000000', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tarifa_energia' AND column_name = 'precio_energia_p1'), 'ALTER TABLE `tarifa_energia` ADD COLUMN `precio_energia_p1` decimal(10,6) NOT NULL DEFAULT 0.000000', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tarifa_energia' AND column_name = 'precio_energia_p2'), 'ALTER TABLE `tarifa_energia` ADD COLUMN `precio_energia_p2` decimal(10,6) NOT NULL DEFAULT 0.000000', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tarifa_energia' AND column_name = 'precio_energia_p3'), 'ALTER TABLE `tarifa_energia` ADD COLUMN `precio_energia_p3` decimal(10,6) NOT NULL DEFAULT 0.000000', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tarifa_energia' AND column_name = 'precio_energia_p4'), 'ALTER TABLE `tarifa_energia` ADD COLUMN `precio_energia_p4` decimal(10,6) NOT NULL DEFAULT 0.000000', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tarifa_energia' AND column_name = 'precio_energia_p5'), 'ALTER TABLE `tarifa_energia` ADD COLUMN `precio_energia_p5` decimal(10,6) NOT NULL DEFAULT 0.000000', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tarifa_energia' AND column_name = 'precio_energia_p6'), 'ALTER TABLE `tarifa_energia` ADD COLUMN `precio_energia_p6` decimal(10,6) NOT NULL DEFAULT 0.000000', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tarifa_energia' AND column_name = 'termino_fijo_mensual'), 'ALTER TABLE `tarifa_energia` ADD COLUMN `termino_fijo_mensual` decimal(10,4) NOT NULL DEFAULT 0.0000', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tarifa_energia' AND column_name = 'alquiler_equipo_dia'), 'ALTER TABLE `tarifa_energia` ADD COLUMN `alquiler_equipo_dia` decimal(10,6) NOT NULL DEFAULT 0.000000', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tarifa_energia' AND column_name = 'comision_captacion'), 'ALTER TABLE `tarifa_energia` ADD COLUMN `comision_captacion` decimal(10,2) NOT NULL DEFAULT 0.00', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tarifa_energia' AND column_name = 'permanencia_meses'), 'ALTER TABLE `tarifa_energia` ADD COLUMN `permanencia_meses` int(11) NOT NULL DEFAULT 0', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tarifa_energia' AND column_name = 'activo'), 'ALTER TABLE `tarifa_energia` ADD COLUMN `activo` tinyint(1) NOT NULL DEFAULT 1', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tarifa_energia' AND column_name = 'destacada'), 'ALTER TABLE `tarifa_energia` ADD COLUMN `destacada` tinyint(1) NOT NULL DEFAULT 0', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tarifa_energia' AND column_name = 'created_at'), 'ALTER TABLE `tarifa_energia` ADD COLUMN `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tarifa_energia' AND column_name = 'updated_at'), 'ALTER TABLE `tarifa_energia` ADD COLUMN `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tarifa_mercado' AND column_name = 'id'), 'ALTER TABLE `tarifa_mercado` ADD COLUMN `id` int(10) unsigned NOT NULL AUTO_INCREMENT', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tarifa_mercado' AND column_name = 'operador'), 'ALTER TABLE `tarifa_mercado` ADD COLUMN `operador` varchar(100) NOT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tarifa_mercado' AND column_name = 'cuota_mensual'), 'ALTER TABLE `tarifa_mercado` ADD COLUMN `cuota_mensual` decimal(10,2) NOT NULL DEFAULT 0.00', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tarifa_mercado' AND column_name = 'promocion'), 'ALTER TABLE `tarifa_mercado` ADD COLUMN `promocion` varchar(255) DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tarifa_mercado' AND column_name = 'valoracion'), 'ALTER TABLE `tarifa_mercado` ADD COLUMN `valoracion` varchar(255) DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tarifa_mercado' AND column_name = 'caracteristicas'), 'ALTER TABLE `tarifa_mercado` ADD COLUMN `caracteristicas` text DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tarifa_mercado' AND column_name = 'recomendada'), 'ALTER TABLE `tarifa_mercado` ADD COLUMN `recomendada` tinyint(1) NOT NULL DEFAULT 0', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tarifa_mercado' AND column_name = 'activo'), 'ALTER TABLE `tarifa_mercado` ADD COLUMN `activo` tinyint(1) NOT NULL DEFAULT 1', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tarifa_mercado' AND column_name = 'created_at'), 'ALTER TABLE `tarifa_mercado` ADD COLUMN `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tarifa_mercado' AND column_name = 'updated_at'), 'ALTER TABLE `tarifa_mercado` ADD COLUMN `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tarifa_telefonia' AND column_name = 'id'), 'ALTER TABLE `tarifa_telefonia` ADD COLUMN `id` int(10) unsigned NOT NULL AUTO_INCREMENT', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tarifa_telefonia' AND column_name = 'proveedor'), 'ALTER TABLE `tarifa_telefonia` ADD COLUMN `proveedor` varchar(150) NOT NULL DEFAULT ''Integral Connection Consulting''', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tarifa_telefonia' AND column_name = 'nombre_tarifa'), 'ALTER TABLE `tarifa_telefonia` ADD COLUMN `nombre_tarifa` varchar(150) NOT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tarifa_telefonia' AND column_name = 'tipo'), 'ALTER TABLE `tarifa_telefonia` ADD COLUMN `tipo` enum(''movil'',''fibra'',''fijo'',''convergente'',''centralita'') NOT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tarifa_telefonia' AND column_name = 'descripcion'), 'ALTER TABLE `tarifa_telefonia` ADD COLUMN `descripcion` text DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tarifa_telefonia' AND column_name = 'gb_datos'), 'ALTER TABLE `tarifa_telefonia` ADD COLUMN `gb_datos` decimal(10,2) DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tarifa_telefonia' AND column_name = 'datos_ilimitados'), 'ALTER TABLE `tarifa_telefonia` ADD COLUMN `datos_ilimitados` tinyint(1) NOT NULL DEFAULT 0', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tarifa_telefonia' AND column_name = 'llamadas_ilimitadas'), 'ALTER TABLE `tarifa_telefonia` ADD COLUMN `llamadas_ilimitadas` tinyint(1) NOT NULL DEFAULT 1', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tarifa_telefonia' AND column_name = 'minutos_incluidos'), 'ALTER TABLE `tarifa_telefonia` ADD COLUMN `minutos_incluidos` decimal(10,2) DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tarifa_telefonia' AND column_name = 'velocidad_fibra_mb'), 'ALTER TABLE `tarifa_telefonia` ADD COLUMN `velocidad_fibra_mb` decimal(10,2) DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tarifa_telefonia' AND column_name = 'lineas_moviles_incluidas'), 'ALTER TABLE `tarifa_telefonia` ADD COLUMN `lineas_moviles_incluidas` int(11) NOT NULL DEFAULT 0', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tarifa_telefonia' AND column_name = 'lineas_fijas_incluidas'), 'ALTER TABLE `tarifa_telefonia` ADD COLUMN `lineas_fijas_incluidas` int(11) NOT NULL DEFAULT 0', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tarifa_telefonia' AND column_name = 'extras'), 'ALTER TABLE `tarifa_telefonia` ADD COLUMN `extras` varchar(500) DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tarifa_telefonia' AND column_name = 'precio_mensual'), 'ALTER TABLE `tarifa_telefonia` ADD COLUMN `precio_mensual` decimal(10,2) NOT NULL DEFAULT 0.00', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tarifa_telefonia' AND column_name = 'permanencia_meses'), 'ALTER TABLE `tarifa_telefonia` ADD COLUMN `permanencia_meses` int(11) NOT NULL DEFAULT 0', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tarifa_telefonia' AND column_name = 'comision_captacion'), 'ALTER TABLE `tarifa_telefonia` ADD COLUMN `comision_captacion` decimal(10,2) NOT NULL DEFAULT 0.00', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tarifa_telefonia' AND column_name = 'activo'), 'ALTER TABLE `tarifa_telefonia` ADD COLUMN `activo` tinyint(1) NOT NULL DEFAULT 1', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tarifa_telefonia' AND column_name = 'destacada'), 'ALTER TABLE `tarifa_telefonia` ADD COLUMN `destacada` tinyint(1) NOT NULL DEFAULT 0', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tarifa_telefonia' AND column_name = 'created_at'), 'ALTER TABLE `tarifa_telefonia` ADD COLUMN `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tarifa_telefonia' AND column_name = 'updated_at'), 'ALTER TABLE `tarifa_telefonia` ADD COLUMN `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'usuarios' AND column_name = 'id'), 'ALTER TABLE `usuarios` ADD COLUMN `id` int(10) unsigned NOT NULL AUTO_INCREMENT', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'usuarios' AND column_name = 'numero_relacion'), 'ALTER TABLE `usuarios` ADD COLUMN `numero_relacion` varchar(20) DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'usuarios' AND column_name = 'nombre'), 'ALTER TABLE `usuarios` ADD COLUMN `nombre` varchar(120) NOT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'usuarios' AND column_name = 'apellidos'), 'ALTER TABLE `usuarios` ADD COLUMN `apellidos` varchar(150) NOT NULL DEFAULT ''''', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'usuarios' AND column_name = 'email'), 'ALTER TABLE `usuarios` ADD COLUMN `email` varchar(190) NOT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'usuarios' AND column_name = 'password_hash'), 'ALTER TABLE `usuarios` ADD COLUMN `password_hash` varchar(255) NOT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'usuarios' AND column_name = 'telefono'), 'ALTER TABLE `usuarios` ADD COLUMN `telefono` varchar(40) NOT NULL DEFAULT ''''', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'usuarios' AND column_name = 'prefijo_telefono'), 'ALTER TABLE `usuarios` ADD COLUMN `prefijo_telefono` varchar(8) NOT NULL DEFAULT ''+34''', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'usuarios' AND column_name = 'extension'), 'ALTER TABLE `usuarios` ADD COLUMN `extension` varchar(10) NOT NULL DEFAULT ''''', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'usuarios' AND column_name = 'avatar_ruta'), 'ALTER TABLE `usuarios` ADD COLUMN `avatar_ruta` varchar(255) DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'usuarios' AND column_name = 'empresa'), 'ALTER TABLE `usuarios` ADD COLUMN `empresa` varchar(150) NOT NULL DEFAULT ''''', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'usuarios' AND column_name = 'cif'), 'ALTER TABLE `usuarios` ADD COLUMN `cif` varchar(20) NOT NULL DEFAULT ''''', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'usuarios' AND column_name = 'tipo'), 'ALTER TABLE `usuarios` ADD COLUMN `tipo` varchar(60) NOT NULL DEFAULT ''''', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'usuarios' AND column_name = 'rol'), 'ALTER TABLE `usuarios` ADD COLUMN `rol` enum(''comercial'',''backoffice'',''jefe_de_equipo'',''coordinador'',''gerente'',''admin'',''super_admin'') NOT NULL DEFAULT ''comercial''', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'usuarios' AND column_name = 'supervisor_id'), 'ALTER TABLE `usuarios` ADD COLUMN `supervisor_id` int(10) unsigned DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'usuarios' AND column_name = 'bloqueado'), 'ALTER TABLE `usuarios` ADD COLUMN `bloqueado` tinyint(1) NOT NULL DEFAULT 0', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'usuarios' AND column_name = 'created_at'), 'ALTER TABLE `usuarios` ADD COLUMN `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'usuarios' AND column_name = 'updated_at'), 'ALTER TABLE `usuarios` ADD COLUMN `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'usuarios' AND column_name = 'ultimo_acceso'), 'ALTER TABLE `usuarios` ADD COLUMN `ultimo_acceso` datetime DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'usuarios' AND column_name = 'debe_cambiar_password'), 'ALTER TABLE `usuarios` ADD COLUMN `debe_cambiar_password` tinyint(1) NOT NULL DEFAULT 0', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'usuarios' AND column_name = 'password_actualizada_en'), 'ALTER TABLE `usuarios` ADD COLUMN `password_actualizada_en` datetime DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'usuarios_auditoria' AND column_name = 'id'), 'ALTER TABLE `usuarios_auditoria` ADD COLUMN `id` int(10) unsigned NOT NULL AUTO_INCREMENT', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'usuarios_auditoria' AND column_name = 'usuario_id'), 'ALTER TABLE `usuarios_auditoria` ADD COLUMN `usuario_id` int(10) unsigned NOT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'usuarios_auditoria' AND column_name = 'autor_id'), 'ALTER TABLE `usuarios_auditoria` ADD COLUMN `autor_id` int(10) unsigned DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'usuarios_auditoria' AND column_name = 'accion'), 'ALTER TABLE `usuarios_auditoria` ADD COLUMN `accion` varchar(60) NOT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'usuarios_auditoria' AND column_name = 'detalle'), 'ALTER TABLE `usuarios_auditoria` ADD COLUMN `detalle` varchar(500) NOT NULL DEFAULT ''''', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'usuarios_auditoria' AND column_name = 'ip'), 'ALTER TABLE `usuarios_auditoria` ADD COLUMN `ip` varchar(45) DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'usuarios_auditoria' AND column_name = 'created_at'), 'ALTER TABLE `usuarios_auditoria` ADD COLUMN `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'usuarios_permisos' AND column_name = 'usuario_id'), 'ALTER TABLE `usuarios_permisos` ADD COLUMN `usuario_id` int(10) unsigned NOT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'usuarios_permisos' AND column_name = 'permiso'), 'ALTER TABLE `usuarios_permisos` ADD COLUMN `permiso` varchar(60) NOT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'usuarios_permisos' AND column_name = 'concedido'), 'ALTER TABLE `usuarios_permisos` ADD COLUMN `concedido` tinyint(1) NOT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'usuarios_permisos' AND column_name = 'actualizado_por'), 'ALTER TABLE `usuarios_permisos` ADD COLUMN `actualizado_por` int(10) unsigned DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'usuarios_permisos' AND column_name = 'updated_at'), 'ALTER TABLE `usuarios_permisos` ADD COLUMN `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'usuarios_preferencias' AND column_name = 'usuario_id'), 'ALTER TABLE `usuarios_preferencias` ADD COLUMN `usuario_id` int(10) unsigned NOT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'usuarios_preferencias' AND column_name = 'horario'), 'ALTER TABLE `usuarios_preferencias` ADD COLUMN `horario` text DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'usuarios_preferencias' AND column_name = 'estado_disponibilidad'), 'ALTER TABLE `usuarios_preferencias` ADD COLUMN `estado_disponibilidad` enum(''disponible'',''ocupado'',''ausente'',''vacaciones'',''baja'') NOT NULL DEFAULT ''disponible''', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'usuarios_preferencias' AND column_name = 'ausencia_desde'), 'ALTER TABLE `usuarios_preferencias` ADD COLUMN `ausencia_desde` date DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'usuarios_preferencias' AND column_name = 'ausencia_hasta'), 'ALTER TABLE `usuarios_preferencias` ADD COLUMN `ausencia_hasta` date DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'usuarios_preferencias' AND column_name = 'nota_disponibilidad'), 'ALTER TABLE `usuarios_preferencias` ADD COLUMN `nota_disponibilidad` varchar(255) NOT NULL DEFAULT ''''', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'usuarios_preferencias' AND column_name = 'notificaciones'), 'ALTER TABLE `usuarios_preferencias` ADD COLUMN `notificaciones` text DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'usuarios_preferencias' AND column_name = 'updated_at'), 'ALTER TABLE `usuarios_preferencias` ADD COLUMN `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'usuarios_sesiones' AND column_name = 'id'), 'ALTER TABLE `usuarios_sesiones` ADD COLUMN `id` int(10) unsigned NOT NULL AUTO_INCREMENT', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'usuarios_sesiones' AND column_name = 'usuario_id'), 'ALTER TABLE `usuarios_sesiones` ADD COLUMN `usuario_id` int(10) unsigned NOT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'usuarios_sesiones' AND column_name = 'token_hash'), 'ALTER TABLE `usuarios_sesiones` ADD COLUMN `token_hash` char(64) NOT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'usuarios_sesiones' AND column_name = 'ip'), 'ALTER TABLE `usuarios_sesiones` ADD COLUMN `ip` varchar(45) DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'usuarios_sesiones' AND column_name = 'user_agent'), 'ALTER TABLE `usuarios_sesiones` ADD COLUMN `user_agent` varchar(255) NOT NULL DEFAULT ''''', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'usuarios_sesiones' AND column_name = 'creada_en'), 'ALTER TABLE `usuarios_sesiones` ADD COLUMN `creada_en` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'usuarios_sesiones' AND column_name = 'ultima_actividad'), 'ALTER TABLE `usuarios_sesiones` ADD COLUMN `ultima_actividad` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'usuarios_sesiones' AND column_name = 'cerrada_en'), 'ALTER TABLE `usuarios_sesiones` ADD COLUMN `cerrada_en` datetime DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'usuarios_sesiones' AND column_name = 'cerrada_por'), 'ALTER TABLE `usuarios_sesiones` ADD COLUMN `cerrada_por` int(10) unsigned DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'usuarios_sesiones' AND column_name = 'motivo_cierre'), 'ALTER TABLE `usuarios_sesiones` ADD COLUMN `motivo_cierre` varchar(60) NOT NULL DEFAULT ''''', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- -----------------------------------------------------------------------------
-- 3) Ampliaciones de columnas existentes
-- -----------------------------------------------------------------------------
SET @s = (SELECT IF((SELECT COUNT(*) > 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'usuarios' AND column_name = 'rol' AND (column_type <> 'enum(''comercial'',''backoffice'',''jefe_de_equipo'',''coordinador'',''gerente'',''admin'',''super_admin'')' OR is_nullable <> 'NO')), 'ALTER TABLE `usuarios` MODIFY `rol` enum(''comercial'',''backoffice'',''jefe_de_equipo'',''coordinador'',''gerente'',''admin'',''super_admin'') NOT NULL DEFAULT ''comercial''', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) > 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'citas' AND column_name = 'comercial_id' AND (column_type <> 'int(10) unsigned' OR is_nullable <> 'YES')), 'ALTER TABLE `citas` MODIFY `comercial_id` int(10) unsigned DEFAULT NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- -----------------------------------------------------------------------------
-- 4) Índices que falten
-- -----------------------------------------------------------------------------
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'agentes_ficha' AND index_name = 'fk_agente_ficha_actualizado'), 'CREATE INDEX `fk_agente_ficha_actualizado` ON `agentes_ficha` (`actualizado_por`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'agentes_seguimiento' AND index_name = 'fk_agente_seg_autor'), 'CREATE INDEX `fk_agente_seg_autor` ON `agentes_seguimiento` (`autor_id`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'agentes_seguimiento' AND index_name = 'idx_agente_seg_usuario_fecha'), 'CREATE INDEX `idx_agente_seg_usuario_fecha` ON `agentes_seguimiento` (`usuario_id`, `fecha`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'backoffice_agendas' AND index_name = 'fk_bo_ag_asignado_por'), 'CREATE INDEX `fk_bo_ag_asignado_por` ON `backoffice_agendas` (`asignado_por`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'backoffice_agendas' AND index_name = 'idx_bo_ag_usuario'), 'CREATE INDEX `idx_bo_ag_usuario` ON `backoffice_agendas` (`usuario_id`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'backoffice_comerciales' AND index_name = 'fk_bo_com_asignado_por'), 'CREATE INDEX `fk_bo_com_asignado_por` ON `backoffice_comerciales` (`asignado_por`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'backoffice_comerciales' AND index_name = 'idx_bo_com_comercial'), 'CREATE INDEX `idx_bo_com_comercial` ON `backoffice_comerciales` (`comercial_id`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'citas' AND index_name = 'fk_cita_asignada_por'), 'CREATE INDEX `fk_cita_asignada_por` ON `citas` (`asignada_por`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'citas' AND index_name = 'fk_cita_creado_por'), 'CREATE INDEX `fk_cita_creado_por` ON `citas` (`creado_por`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'citas' AND index_name = 'fk_cita_presupuesto'), 'CREATE INDEX `fk_cita_presupuesto` ON `citas` (`presupuesto_id`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'citas' AND index_name = 'idx_citas_cliente'), 'CREATE INDEX `idx_citas_cliente` ON `citas` (`cliente_id`, `fecha`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'citas' AND index_name = 'idx_citas_comercial_fecha'), 'CREATE INDEX `idx_citas_comercial_fecha` ON `citas` (`comercial_id`, `fecha`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'citas' AND index_name = 'idx_citas_equipo'), 'CREATE INDEX `idx_citas_equipo` ON `citas` (`equipo_id`, `comercial_id`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'citas' AND index_name = 'idx_citas_fecha'), 'CREATE INDEX `idx_citas_fecha` ON `citas` (`fecha`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'clientes' AND index_name = 'idx_clientes_comercial'), 'CREATE INDEX `idx_clientes_comercial` ON `clientes` (`comercial_id`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'clientes' AND index_name = 'idx_clientes_estado'), 'CREATE INDEX `idx_clientes_estado` ON `clientes` (`estado`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'clientes' AND index_name = 'upload_token'), 'CREATE UNIQUE INDEX `upload_token` ON `clientes` (`upload_token`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'cliente_servicios' AND index_name = 'uq_cliente_servicio'), 'CREATE UNIQUE INDEX `uq_cliente_servicio` ON `cliente_servicios` (`cliente_id`, `servicio`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'cmp_ene_informes' AND index_name = 'idx_cmp_ene_informes_cliente'), 'CREATE INDEX `idx_cmp_ene_informes_cliente` ON `cmp_ene_informes` (`cliente_id`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'cmp_ene_informes' AND index_name = 'idx_cmp_ene_informes_usuario'), 'CREATE INDEX `idx_cmp_ene_informes_usuario` ON `cmp_ene_informes` (`usuario_id`, `updated_at`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'cmp_ene_informes' AND index_name = 'numero'), 'CREATE UNIQUE INDEX `numero` ON `cmp_ene_informes` (`numero`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'cmp_ene_tarifas' AND index_name = 'fk_cmp_ene_tarifas_usuario'), 'CREATE INDEX `fk_cmp_ene_tarifas_usuario` ON `cmp_ene_tarifas` (`actualizado_por`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'cmp_ene_tarifas' AND index_name = 'idx_cmp_ene_tarifas'), 'CREATE INDEX `idx_cmp_ene_tarifas` ON `cmp_ene_tarifas` (`tipo`, `peaje`, `rol`, `activo`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'cmp_tel_comisiones' AND index_name = 'uq_cmp_tel_comision'), 'CREATE UNIQUE INDEX `uq_cmp_tel_comision` ON `cmp_tel_comisiones` (`marca`, `concepto`, `tramo`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'cmp_tel_informes' AND index_name = 'idx_cmp_tel_informes_cliente'), 'CREATE INDEX `idx_cmp_tel_informes_cliente` ON `cmp_tel_informes` (`cliente_id`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'cmp_tel_informes' AND index_name = 'idx_cmp_tel_informes_usuario'), 'CREATE INDEX `idx_cmp_tel_informes_usuario` ON `cmp_tel_informes` (`usuario_id`, `updated_at`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'cmp_tel_informes' AND index_name = 'numero'), 'CREATE UNIQUE INDEX `numero` ON `cmp_tel_informes` (`numero`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'cmp_tel_perfiles' AND index_name = 'fk_cmp_tel_perfiles_usuario'), 'CREATE INDEX `fk_cmp_tel_perfiles_usuario` ON `cmp_tel_perfiles` (`actualizado_por`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'cmp_tel_perfiles' AND index_name = 'nombre'), 'CREATE UNIQUE INDEX `nombre` ON `cmp_tel_perfiles` (`nombre`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'comparador_auditorias' AND index_name = 'fk_comparador_documento'), 'CREATE INDEX `fk_comparador_documento` ON `comparador_auditorias` (`documento_id`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'comparador_auditorias' AND index_name = 'fk_comparador_gestor'), 'CREATE INDEX `fk_comparador_gestor` ON `comparador_auditorias` (`gestor_id`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'comparador_auditorias' AND index_name = 'idx_comparador_cliente'), 'CREATE INDEX `idx_comparador_cliente` ON `comparador_auditorias` (`cliente_id`, `created_at`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'comparador_auditorias' AND index_name = 'idx_comparador_fecha'), 'CREATE INDEX `idx_comparador_fecha` ON `comparador_auditorias` (`created_at`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'contratos' AND index_name = 'fk_contrato_cliente'), 'CREATE INDEX `fk_contrato_cliente` ON `contratos` (`cliente_id`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'contratos' AND index_name = 'ft_contratos_busqueda'), 'CREATE INDEX `ft_contratos_busqueda` ON `contratos` (`numero_contrato`, `titular`, `cif_titular`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'contratos' AND index_name = 'idx_contratos_comercial'), 'CREATE INDEX `idx_contratos_comercial` ON `contratos` (`comercial_id`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'contratos' AND index_name = 'idx_contratos_comercializadora'), 'CREATE INDEX `idx_contratos_comercializadora` ON `contratos` (`comercializadora`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'contratos' AND index_name = 'idx_contratos_estado'), 'CREATE INDEX `idx_contratos_estado` ON `contratos` (`estado`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'contratos' AND index_name = 'idx_contratos_fecha_alta'), 'CREATE INDEX `idx_contratos_fecha_alta` ON `contratos` (`fecha_alta`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'contratos' AND index_name = 'idx_contratos_sector'), 'CREATE INDEX `idx_contratos_sector` ON `contratos` (`sector`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'contratos' AND index_name = 'idx_contratos_tarifa'), 'CREATE INDEX `idx_contratos_tarifa` ON `contratos` (`tarifa`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'documentos' AND index_name = 'fk_doc_usuario'), 'CREATE INDEX `fk_doc_usuario` ON `documentos` (`subido_por`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'documentos' AND index_name = 'idx_documentos_cliente'), 'CREATE INDEX `idx_documentos_cliente` ON `documentos` (`cliente_id`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'documentos' AND index_name = 'idx_documentos_presupuesto'), 'CREATE INDEX `idx_documentos_presupuesto` ON `documentos` (`presupuesto_id`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'documentos' AND index_name = 'idx_documentos_tipo'), 'CREATE INDEX `idx_documentos_tipo` ON `documentos` (`tipo`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'estudios' AND index_name = 'fk_est_cliente'), 'CREATE INDEX `fk_est_cliente` ON `estudios` (`cliente_id`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'estudios' AND index_name = 'fk_est_documento'), 'CREATE INDEX `fk_est_documento` ON `estudios` (`documento_id`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'estudios' AND index_name = 'fk_est_usuario'), 'CREATE INDEX `fk_est_usuario` ON `estudios` (`elaborado_por`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'ficheros' AND index_name = 'fk_fichero_usuario'), 'CREATE INDEX `fk_fichero_usuario` ON `ficheros` (`subido_por`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'ficheros' AND index_name = 'idx_ficheros_carpeta'), 'CREATE INDEX `idx_ficheros_carpeta` ON `ficheros` (`carpeta_id`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'ficheros_carpetas' AND index_name = 'fk_carpeta_creador'), 'CREATE INDEX `fk_carpeta_creador` ON `ficheros_carpetas` (`creado_por`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'ficheros_carpetas' AND index_name = 'idx_ficheros_carpetas_parent'), 'CREATE INDEX `idx_ficheros_carpetas_parent` ON `ficheros_carpetas` (`parent_id`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'ficheros_carpetas' AND index_name = 'idx_ficheros_carpetas_propietario'), 'CREATE INDEX `idx_ficheros_carpetas_propietario` ON `ficheros_carpetas` (`propietario_id`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'firmas' AND index_name = 'fk_firma_cliente'), 'CREATE INDEX `fk_firma_cliente` ON `firmas` (`cliente_id`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'firmas' AND index_name = 'fk_firma_documento'), 'CREATE INDEX `fk_firma_documento` ON `firmas` (`documento_id`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'firmas' AND index_name = 'fk_firma_usuario'), 'CREATE INDEX `fk_firma_usuario` ON `firmas` (`firmado_por`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'historial_estado' AND index_name = 'fk_hist_usuario'), 'CREATE INDEX `fk_hist_usuario` ON `historial_estado` (`cambiado_por`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'historial_estado' AND index_name = 'idx_historial_cliente_estado'), 'CREATE INDEX `idx_historial_cliente_estado` ON `historial_estado` (`cliente_id`, `estado_nuevo`, `created_at`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'logs_impersonacion' AND index_name = 'fk_impersonacion_objetivo'), 'CREATE INDEX `fk_impersonacion_objetivo` ON `logs_impersonacion` (`usuario_objetivo_id`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'logs_impersonacion' AND index_name = 'idx_impersonacion_admin'), 'CREATE INDEX `idx_impersonacion_admin` ON `logs_impersonacion` (`admin_id`, `iniciado_en`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'notificaciones' AND index_name = 'fk_notif_cliente'), 'CREATE INDEX `fk_notif_cliente` ON `notificaciones` (`cliente_id`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'notificaciones' AND index_name = 'idx_notif_user'), 'CREATE INDEX `idx_notif_user` ON `notificaciones` (`user_id`, `leido`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'presupuestos' AND index_name = 'fk_presupuesto_contrato'), 'CREATE INDEX `fk_presupuesto_contrato` ON `presupuestos` (`contrato_id`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'presupuestos' AND index_name = 'idx_presupuestos_cliente'), 'CREATE INDEX `idx_presupuestos_cliente` ON `presupuestos` (`cliente_id`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'presupuestos' AND index_name = 'idx_presupuestos_comercial'), 'CREATE INDEX `idx_presupuestos_comercial` ON `presupuestos` (`comercial_id`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'presupuestos' AND index_name = 'idx_presupuestos_estado'), 'CREATE INDEX `idx_presupuestos_estado` ON `presupuestos` (`estado`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'presupuestos' AND index_name = 'idx_presupuestos_fecha_permanencia'), 'CREATE INDEX `idx_presupuestos_fecha_permanencia` ON `presupuestos` (`fecha_permanencia`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'presupuestos' AND index_name = 'idx_presupuestos_sector'), 'CREATE INDEX `idx_presupuestos_sector` ON `presupuestos` (`sector`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'proformas' AND index_name = 'fk_proforma_comercial'), 'CREATE INDEX `fk_proforma_comercial` ON `proformas` (`comercial_id`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'proformas' AND index_name = 'idx_proformas_estado'), 'CREATE INDEX `idx_proformas_estado` ON `proformas` (`estado_pago`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'proformas' AND index_name = 'idx_proformas_facturado_por'), 'CREATE INDEX `idx_proformas_facturado_por` ON `proformas` (`facturado_por`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'proformas' AND index_name = 'idx_proformas_fecha'), 'CREATE INDEX `idx_proformas_fecha` ON `proformas` (`fecha`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'tarifa_alarmas' AND index_name = 'idx_tarifa_alarmas_tipo'), 'CREATE INDEX `idx_tarifa_alarmas_tipo` ON `tarifa_alarmas` (`tipo_kit`, `activo`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'tarifa_energia' AND index_name = 'idx_tarifa_energia_tipo_segmento'), 'CREATE INDEX `idx_tarifa_energia_tipo_segmento` ON `tarifa_energia` (`tipo`, `segmento`, `activo`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'tarifa_mercado' AND index_name = 'idx_tarifa_mercado_activo'), 'CREATE INDEX `idx_tarifa_mercado_activo` ON `tarifa_mercado` (`activo`, `cuota_mensual`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'tarifa_telefonia' AND index_name = 'idx_tarifa_telefonia_tipo'), 'CREATE INDEX `idx_tarifa_telefonia_tipo` ON `tarifa_telefonia` (`tipo`, `activo`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'usuarios' AND index_name = 'email'), 'CREATE UNIQUE INDEX `email` ON `usuarios` (`email`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'usuarios' AND index_name = 'idx_usuarios_bloqueado'), 'CREATE INDEX `idx_usuarios_bloqueado` ON `usuarios` (`bloqueado`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'usuarios' AND index_name = 'idx_usuarios_numero_relacion'), 'CREATE UNIQUE INDEX `idx_usuarios_numero_relacion` ON `usuarios` (`numero_relacion`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'usuarios' AND index_name = 'idx_usuarios_rol'), 'CREATE INDEX `idx_usuarios_rol` ON `usuarios` (`rol`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'usuarios' AND index_name = 'idx_usuarios_supervisor'), 'CREATE INDEX `idx_usuarios_supervisor` ON `usuarios` (`supervisor_id`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'usuarios_auditoria' AND index_name = 'fk_usuaud_autor'), 'CREATE INDEX `fk_usuaud_autor` ON `usuarios_auditoria` (`autor_id`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'usuarios_auditoria' AND index_name = 'idx_usuaud_accion'), 'CREATE INDEX `idx_usuaud_accion` ON `usuarios_auditoria` (`usuario_id`, `accion`, `created_at`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'usuarios_auditoria' AND index_name = 'idx_usuaud_usuario'), 'CREATE INDEX `idx_usuaud_usuario` ON `usuarios_auditoria` (`usuario_id`, `created_at`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'usuarios_permisos' AND index_name = 'fk_usuperm_autor'), 'CREATE INDEX `fk_usuperm_autor` ON `usuarios_permisos` (`actualizado_por`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'usuarios_sesiones' AND index_name = 'fk_ususes_cerrada_por'), 'CREATE INDEX `fk_ususes_cerrada_por` ON `usuarios_sesiones` (`cerrada_por`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'usuarios_sesiones' AND index_name = 'idx_ususes_usuario'), 'CREATE INDEX `idx_ususes_usuario` ON `usuarios_sesiones` (`usuario_id`, `cerrada_en`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'usuarios_sesiones' AND index_name = 'token_hash'), 'CREATE UNIQUE INDEX `token_hash` ON `usuarios_sesiones` (`token_hash`)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- -----------------------------------------------------------------------------
-- 5) Relaciones (claves foráneas) que falten
-- -----------------------------------------------------------------------------
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'agentes_ficha' AND constraint_name = 'fk_agente_ficha_actualizado' AND constraint_type = 'FOREIGN KEY'), 'ALTER TABLE `agentes_ficha` ADD CONSTRAINT `fk_agente_ficha_actualizado` FOREIGN KEY (`actualizado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'agentes_ficha' AND constraint_name = 'fk_agente_ficha_usuario' AND constraint_type = 'FOREIGN KEY'), 'ALTER TABLE `agentes_ficha` ADD CONSTRAINT `fk_agente_ficha_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'agentes_seguimiento' AND constraint_name = 'fk_agente_seg_autor' AND constraint_type = 'FOREIGN KEY'), 'ALTER TABLE `agentes_seguimiento` ADD CONSTRAINT `fk_agente_seg_autor` FOREIGN KEY (`autor_id`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'agentes_seguimiento' AND constraint_name = 'fk_agente_seg_usuario' AND constraint_type = 'FOREIGN KEY'), 'ALTER TABLE `agentes_seguimiento` ADD CONSTRAINT `fk_agente_seg_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'backoffice_agendas' AND constraint_name = 'fk_bo_ag_asignado_por' AND constraint_type = 'FOREIGN KEY'), 'ALTER TABLE `backoffice_agendas` ADD CONSTRAINT `fk_bo_ag_asignado_por` FOREIGN KEY (`asignado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'backoffice_agendas' AND constraint_name = 'fk_bo_ag_backoffice' AND constraint_type = 'FOREIGN KEY'), 'ALTER TABLE `backoffice_agendas` ADD CONSTRAINT `fk_bo_ag_backoffice` FOREIGN KEY (`backoffice_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'backoffice_agendas' AND constraint_name = 'fk_bo_ag_usuario' AND constraint_type = 'FOREIGN KEY'), 'ALTER TABLE `backoffice_agendas` ADD CONSTRAINT `fk_bo_ag_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'backoffice_comerciales' AND constraint_name = 'fk_bo_com_asignado_por' AND constraint_type = 'FOREIGN KEY'), 'ALTER TABLE `backoffice_comerciales` ADD CONSTRAINT `fk_bo_com_asignado_por` FOREIGN KEY (`asignado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'backoffice_comerciales' AND constraint_name = 'fk_bo_com_backoffice' AND constraint_type = 'FOREIGN KEY'), 'ALTER TABLE `backoffice_comerciales` ADD CONSTRAINT `fk_bo_com_backoffice` FOREIGN KEY (`backoffice_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'backoffice_comerciales' AND constraint_name = 'fk_bo_com_comercial' AND constraint_type = 'FOREIGN KEY'), 'ALTER TABLE `backoffice_comerciales` ADD CONSTRAINT `fk_bo_com_comercial` FOREIGN KEY (`comercial_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'citas' AND constraint_name = 'fk_cita_asignada_por' AND constraint_type = 'FOREIGN KEY'), 'ALTER TABLE `citas` ADD CONSTRAINT `fk_cita_asignada_por` FOREIGN KEY (`asignada_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'citas' AND constraint_name = 'fk_cita_cliente' AND constraint_type = 'FOREIGN KEY'), 'ALTER TABLE `citas` ADD CONSTRAINT `fk_cita_cliente` FOREIGN KEY (`cliente_id`) REFERENCES `clientes` (`id`) ON DELETE SET NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'citas' AND constraint_name = 'fk_cita_comercial' AND constraint_type = 'FOREIGN KEY'), 'ALTER TABLE `citas` ADD CONSTRAINT `fk_cita_comercial` FOREIGN KEY (`comercial_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'citas' AND constraint_name = 'fk_cita_creado_por' AND constraint_type = 'FOREIGN KEY'), 'ALTER TABLE `citas` ADD CONSTRAINT `fk_cita_creado_por` FOREIGN KEY (`creado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'citas' AND constraint_name = 'fk_cita_equipo' AND constraint_type = 'FOREIGN KEY'), 'ALTER TABLE `citas` ADD CONSTRAINT `fk_cita_equipo` FOREIGN KEY (`equipo_id`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'citas' AND constraint_name = 'fk_cita_presupuesto' AND constraint_type = 'FOREIGN KEY'), 'ALTER TABLE `citas` ADD CONSTRAINT `fk_cita_presupuesto` FOREIGN KEY (`presupuesto_id`) REFERENCES `presupuestos` (`id`) ON DELETE SET NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'clientes' AND constraint_name = 'fk_clientes_comercial' AND constraint_type = 'FOREIGN KEY'), 'ALTER TABLE `clientes` ADD CONSTRAINT `fk_clientes_comercial` FOREIGN KEY (`comercial_id`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'cliente_servicios' AND constraint_name = 'fk_cs_cliente' AND constraint_type = 'FOREIGN KEY'), 'ALTER TABLE `cliente_servicios` ADD CONSTRAINT `fk_cs_cliente` FOREIGN KEY (`cliente_id`) REFERENCES `clientes` (`id`) ON DELETE CASCADE', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'cmp_ene_informes' AND constraint_name = 'fk_cmp_ene_informes_cliente' AND constraint_type = 'FOREIGN KEY'), 'ALTER TABLE `cmp_ene_informes` ADD CONSTRAINT `fk_cmp_ene_informes_cliente` FOREIGN KEY (`cliente_id`) REFERENCES `clientes` (`id`) ON DELETE SET NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'cmp_ene_informes' AND constraint_name = 'fk_cmp_ene_informes_usuario' AND constraint_type = 'FOREIGN KEY'), 'ALTER TABLE `cmp_ene_informes` ADD CONSTRAINT `fk_cmp_ene_informes_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'cmp_ene_tarifas' AND constraint_name = 'fk_cmp_ene_tarifas_usuario' AND constraint_type = 'FOREIGN KEY'), 'ALTER TABLE `cmp_ene_tarifas` ADD CONSTRAINT `fk_cmp_ene_tarifas_usuario` FOREIGN KEY (`actualizado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'cmp_tel_informes' AND constraint_name = 'fk_cmp_tel_informes_cliente' AND constraint_type = 'FOREIGN KEY'), 'ALTER TABLE `cmp_tel_informes` ADD CONSTRAINT `fk_cmp_tel_informes_cliente` FOREIGN KEY (`cliente_id`) REFERENCES `clientes` (`id`) ON DELETE SET NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'cmp_tel_informes' AND constraint_name = 'fk_cmp_tel_informes_usuario' AND constraint_type = 'FOREIGN KEY'), 'ALTER TABLE `cmp_tel_informes` ADD CONSTRAINT `fk_cmp_tel_informes_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'cmp_tel_perfiles' AND constraint_name = 'fk_cmp_tel_perfiles_usuario' AND constraint_type = 'FOREIGN KEY'), 'ALTER TABLE `cmp_tel_perfiles` ADD CONSTRAINT `fk_cmp_tel_perfiles_usuario` FOREIGN KEY (`actualizado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'comparador_auditorias' AND constraint_name = 'fk_comparador_cliente' AND constraint_type = 'FOREIGN KEY'), 'ALTER TABLE `comparador_auditorias` ADD CONSTRAINT `fk_comparador_cliente` FOREIGN KEY (`cliente_id`) REFERENCES `clientes` (`id`) ON DELETE CASCADE', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'comparador_auditorias' AND constraint_name = 'fk_comparador_documento' AND constraint_type = 'FOREIGN KEY'), 'ALTER TABLE `comparador_auditorias` ADD CONSTRAINT `fk_comparador_documento` FOREIGN KEY (`documento_id`) REFERENCES `documentos` (`id`) ON DELETE SET NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'comparador_auditorias' AND constraint_name = 'fk_comparador_gestor' AND constraint_type = 'FOREIGN KEY'), 'ALTER TABLE `comparador_auditorias` ADD CONSTRAINT `fk_comparador_gestor` FOREIGN KEY (`gestor_id`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'contratos' AND constraint_name = 'fk_contrato_cliente' AND constraint_type = 'FOREIGN KEY'), 'ALTER TABLE `contratos` ADD CONSTRAINT `fk_contrato_cliente` FOREIGN KEY (`cliente_id`) REFERENCES `clientes` (`id`) ON DELETE SET NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'contratos' AND constraint_name = 'fk_contrato_comercial' AND constraint_type = 'FOREIGN KEY'), 'ALTER TABLE `contratos` ADD CONSTRAINT `fk_contrato_comercial` FOREIGN KEY (`comercial_id`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'documentos' AND constraint_name = 'fk_doc_cliente' AND constraint_type = 'FOREIGN KEY'), 'ALTER TABLE `documentos` ADD CONSTRAINT `fk_doc_cliente` FOREIGN KEY (`cliente_id`) REFERENCES `clientes` (`id`) ON DELETE CASCADE', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'documentos' AND constraint_name = 'fk_doc_presupuesto' AND constraint_type = 'FOREIGN KEY'), 'ALTER TABLE `documentos` ADD CONSTRAINT `fk_doc_presupuesto` FOREIGN KEY (`presupuesto_id`) REFERENCES `presupuestos` (`id`) ON DELETE SET NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'documentos' AND constraint_name = 'fk_doc_usuario' AND constraint_type = 'FOREIGN KEY'), 'ALTER TABLE `documentos` ADD CONSTRAINT `fk_doc_usuario` FOREIGN KEY (`subido_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'estudios' AND constraint_name = 'fk_est_cliente' AND constraint_type = 'FOREIGN KEY'), 'ALTER TABLE `estudios` ADD CONSTRAINT `fk_est_cliente` FOREIGN KEY (`cliente_id`) REFERENCES `clientes` (`id`) ON DELETE CASCADE', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'estudios' AND constraint_name = 'fk_est_documento' AND constraint_type = 'FOREIGN KEY'), 'ALTER TABLE `estudios` ADD CONSTRAINT `fk_est_documento` FOREIGN KEY (`documento_id`) REFERENCES `documentos` (`id`) ON DELETE SET NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'estudios' AND constraint_name = 'fk_est_usuario' AND constraint_type = 'FOREIGN KEY'), 'ALTER TABLE `estudios` ADD CONSTRAINT `fk_est_usuario` FOREIGN KEY (`elaborado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'ficheros' AND constraint_name = 'fk_fichero_carpeta' AND constraint_type = 'FOREIGN KEY'), 'ALTER TABLE `ficheros` ADD CONSTRAINT `fk_fichero_carpeta` FOREIGN KEY (`carpeta_id`) REFERENCES `ficheros_carpetas` (`id`) ON DELETE CASCADE', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'ficheros' AND constraint_name = 'fk_fichero_usuario' AND constraint_type = 'FOREIGN KEY'), 'ALTER TABLE `ficheros` ADD CONSTRAINT `fk_fichero_usuario` FOREIGN KEY (`subido_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'ficheros_carpetas' AND constraint_name = 'fk_carpeta_creador' AND constraint_type = 'FOREIGN KEY'), 'ALTER TABLE `ficheros_carpetas` ADD CONSTRAINT `fk_carpeta_creador` FOREIGN KEY (`creado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'ficheros_carpetas' AND constraint_name = 'fk_carpeta_parent' AND constraint_type = 'FOREIGN KEY'), 'ALTER TABLE `ficheros_carpetas` ADD CONSTRAINT `fk_carpeta_parent` FOREIGN KEY (`parent_id`) REFERENCES `ficheros_carpetas` (`id`) ON DELETE CASCADE', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'ficheros_carpetas' AND constraint_name = 'fk_carpeta_propietario' AND constraint_type = 'FOREIGN KEY'), 'ALTER TABLE `ficheros_carpetas` ADD CONSTRAINT `fk_carpeta_propietario` FOREIGN KEY (`propietario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'firmas' AND constraint_name = 'fk_firma_cliente' AND constraint_type = 'FOREIGN KEY'), 'ALTER TABLE `firmas` ADD CONSTRAINT `fk_firma_cliente` FOREIGN KEY (`cliente_id`) REFERENCES `clientes` (`id`) ON DELETE CASCADE', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'firmas' AND constraint_name = 'fk_firma_documento' AND constraint_type = 'FOREIGN KEY'), 'ALTER TABLE `firmas` ADD CONSTRAINT `fk_firma_documento` FOREIGN KEY (`documento_id`) REFERENCES `documentos` (`id`) ON DELETE SET NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'firmas' AND constraint_name = 'fk_firma_usuario' AND constraint_type = 'FOREIGN KEY'), 'ALTER TABLE `firmas` ADD CONSTRAINT `fk_firma_usuario` FOREIGN KEY (`firmado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'historial_estado' AND constraint_name = 'fk_hist_cliente' AND constraint_type = 'FOREIGN KEY'), 'ALTER TABLE `historial_estado` ADD CONSTRAINT `fk_hist_cliente` FOREIGN KEY (`cliente_id`) REFERENCES `clientes` (`id`) ON DELETE CASCADE', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'historial_estado' AND constraint_name = 'fk_hist_usuario' AND constraint_type = 'FOREIGN KEY'), 'ALTER TABLE `historial_estado` ADD CONSTRAINT `fk_hist_usuario` FOREIGN KEY (`cambiado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'logs_impersonacion' AND constraint_name = 'fk_impersonacion_admin' AND constraint_type = 'FOREIGN KEY'), 'ALTER TABLE `logs_impersonacion` ADD CONSTRAINT `fk_impersonacion_admin` FOREIGN KEY (`admin_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'logs_impersonacion' AND constraint_name = 'fk_impersonacion_objetivo' AND constraint_type = 'FOREIGN KEY'), 'ALTER TABLE `logs_impersonacion` ADD CONSTRAINT `fk_impersonacion_objetivo` FOREIGN KEY (`usuario_objetivo_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'notificaciones' AND constraint_name = 'fk_notif_cliente' AND constraint_type = 'FOREIGN KEY'), 'ALTER TABLE `notificaciones` ADD CONSTRAINT `fk_notif_cliente` FOREIGN KEY (`cliente_id`) REFERENCES `clientes` (`id`) ON DELETE CASCADE', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'notificaciones' AND constraint_name = 'fk_notif_usuario' AND constraint_type = 'FOREIGN KEY'), 'ALTER TABLE `notificaciones` ADD CONSTRAINT `fk_notif_usuario` FOREIGN KEY (`user_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'presupuestos' AND constraint_name = 'fk_presupuesto_cliente' AND constraint_type = 'FOREIGN KEY'), 'ALTER TABLE `presupuestos` ADD CONSTRAINT `fk_presupuesto_cliente` FOREIGN KEY (`cliente_id`) REFERENCES `clientes` (`id`) ON DELETE CASCADE', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'presupuestos' AND constraint_name = 'fk_presupuesto_comercial' AND constraint_type = 'FOREIGN KEY'), 'ALTER TABLE `presupuestos` ADD CONSTRAINT `fk_presupuesto_comercial` FOREIGN KEY (`comercial_id`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'presupuestos' AND constraint_name = 'fk_presupuesto_contrato' AND constraint_type = 'FOREIGN KEY'), 'ALTER TABLE `presupuestos` ADD CONSTRAINT `fk_presupuesto_contrato` FOREIGN KEY (`contrato_id`) REFERENCES `contratos` (`id`) ON DELETE SET NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'proformas' AND constraint_name = 'fk_proforma_comercial' AND constraint_type = 'FOREIGN KEY'), 'ALTER TABLE `proformas` ADD CONSTRAINT `fk_proforma_comercial` FOREIGN KEY (`comercial_id`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'usuarios' AND constraint_name = 'fk_usuarios_supervisor' AND constraint_type = 'FOREIGN KEY'), 'ALTER TABLE `usuarios` ADD CONSTRAINT `fk_usuarios_supervisor` FOREIGN KEY (`supervisor_id`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'usuarios_auditoria' AND constraint_name = 'fk_usuaud_autor' AND constraint_type = 'FOREIGN KEY'), 'ALTER TABLE `usuarios_auditoria` ADD CONSTRAINT `fk_usuaud_autor` FOREIGN KEY (`autor_id`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'usuarios_auditoria' AND constraint_name = 'fk_usuaud_usuario' AND constraint_type = 'FOREIGN KEY'), 'ALTER TABLE `usuarios_auditoria` ADD CONSTRAINT `fk_usuaud_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'usuarios_permisos' AND constraint_name = 'fk_usuperm_autor' AND constraint_type = 'FOREIGN KEY'), 'ALTER TABLE `usuarios_permisos` ADD CONSTRAINT `fk_usuperm_autor` FOREIGN KEY (`actualizado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'usuarios_permisos' AND constraint_name = 'fk_usuperm_usuario' AND constraint_type = 'FOREIGN KEY'), 'ALTER TABLE `usuarios_permisos` ADD CONSTRAINT `fk_usuperm_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'usuarios_preferencias' AND constraint_name = 'fk_usupref_usuario' AND constraint_type = 'FOREIGN KEY'), 'ALTER TABLE `usuarios_preferencias` ADD CONSTRAINT `fk_usupref_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'usuarios_sesiones' AND constraint_name = 'fk_ususes_cerrada_por' AND constraint_type = 'FOREIGN KEY'), 'ALTER TABLE `usuarios_sesiones` ADD CONSTRAINT `fk_ususes_cerrada_por` FOREIGN KEY (`cerrada_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'usuarios_sesiones' AND constraint_name = 'fk_ususes_usuario' AND constraint_type = 'FOREIGN KEY'), 'ALTER TABLE `usuarios_sesiones` ADD CONSTRAINT `fk_ususes_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- -----------------------------------------------------------------------------
-- 6) Datos
-- -----------------------------------------------------------------------------
-- Numero de relacion de cada usuario (solo a quien no lo tenga).
UPDATE usuarios SET numero_relacion = CONCAT('ICC-', LPAD(id, 5, '0')) WHERE numero_relacion IS NULL;

-- Citas antiguas: quedan en el equipo del jefe de su comercial (solo las que no tengan equipo).
UPDATE citas c JOIN usuarios u ON u.id = c.comercial_id
  SET c.equipo_id = u.supervisor_id
  WHERE c.equipo_id IS NULL AND u.supervisor_id IS NOT NULL;

-- Carpetas iniciales de Ficheros (solo si no existe ninguna carpeta).
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM ficheros_carpetas), 'INSERT INTO ficheros_carpetas (nombre, parent_id, propietario_id, creado_por) VALUES
  (''Calendario de pagos'', NULL, NULL, NULL),
  (''Comercializadoras'', NULL, NULL, NULL),
  (''Comparadores'', NULL, NULL, NULL),
  (''Documentacion - Penalizaciones - Renovaciones'', NULL, NULL, NULL),
  (''Eficiencia energetica'', NULL, NULL, NULL),
  (''Informe mensual mercado energetico espanol'', NULL, NULL, NULL),
  (''Dosieres'', NULL, NULL, NULL),
  (''Tabla precios de excedentes y bateria virtual'', NULL, NULL, NULL),
  (''Temporadas - Periodos'', NULL, NULL, NULL),
  (''Recursos generales'', NULL, NULL, NULL),
  (''Facturacion de Comerciales'', NULL, NULL, NULL)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- Comparadores: configuracion (no pisa la existente).
INSERT IGNORE INTO cmp_config (clave, valor) VALUES ('prefijo', 'ICC-09-'), ('siguiente', '2838365');

-- Comisiones de telefonia de ejemplo (solo la primera vez: si ya hay comisiones, no se tocan).
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM cmp_tel_comisiones), 'INSERT IGNORE INTO cmp_tel_comisiones (marca, concepto, tramo, importe, importe_alta, nota) VALUES
  (''Yoigo'', ''fibra'', ''2000'', 47.25, NULL, ''Alta de fijo según velocidad''),
  (''Yoigo'', ''fibra'', ''1000'', 43.75, NULL, ''Alta de fijo según velocidad''),
  (''Yoigo'', ''fibra'', ''600'', 36.75, NULL, ''Alta de fijo según velocidad''),
  (''Yoigo'', ''fibra'', ''500'', 36.75, NULL, ''Alta de fijo según velocidad''),
  (''Yoigo'', ''fibra'', ''400'', 29.75, NULL, ''Alta de fijo según velocidad''),
  (''Yoigo'', ''fibra'', ''300'', 29.75, NULL, ''Alta de fijo según velocidad''),
  (''Yoigo'', ''movil'', ''40'', 8.75, NULL, ''Línea móvil de pago según GB (las gratuitas no comisionan)''),
  (''Yoigo'', ''movil'', ''90'', 10.5, NULL, ''Línea móvil de pago según GB (las gratuitas no comisionan)''),
  (''Yoigo'', ''movil'', ''mas90'', 14, NULL, ''Línea móvil de pago según GB (las gratuitas no comisionan)''),
  (''Yoigo'', ''movil'', ''ilimitada'', 17.5, NULL, ''Línea móvil de pago según GB (las gratuitas no comisionan)''),
  (''Yoigo'', ''extra_portabilidad'', ''fibra'', 14, NULL, ''Por portabilidad de fuera del grupo +O''),
  (''Yoigo'', ''extra_portabilidad'', ''linea'', 14, NULL, ''Por línea portada de fuera del grupo +O''),
  (''Yoigo'', ''extra_empresa'', ''linea'', 7, NULL, ''Segmentación empresa, por línea''),
  (''MásMóvil'', ''fibra'', ''1000'', 23.625, NULL, ''Alta de fijo según velocidad''),
  (''MásMóvil'', ''fibra'', ''600'', 18.725, NULL, ''Alta de fijo según velocidad''),
  (''MásMóvil'', ''fibra'', ''500'', 18.725, NULL, ''Alta de fijo según velocidad''),
  (''MásMóvil'', ''fibra'', ''400'', 13.825, NULL, ''Alta de fijo según velocidad''),
  (''MásMóvil'', ''fibra'', ''300'', 13.825, NULL, ''Alta de fijo según velocidad''),
  (''MásMóvil'', ''movil'', ''40'', 8.75, NULL, ''Línea móvil de pago según GB (las gratuitas no comisionan)''),
  (''MásMóvil'', ''movil'', ''90'', 10.5, NULL, ''Línea móvil de pago según GB (las gratuitas no comisionan)''),
  (''MásMóvil'', ''movil'', ''mas90'', 14, NULL, ''Línea móvil de pago según GB (las gratuitas no comisionan)''),
  (''MásMóvil'', ''movil'', ''ilimitada'', 17.5, NULL, ''Línea móvil de pago según GB (las gratuitas no comisionan)''),
  (''MásMóvil'', ''extra_portabilidad'', ''fibra'', 14, NULL, ''Por portabilidad de fuera del grupo +O''),
  (''MásMóvil'', ''extra_portabilidad'', ''linea'', 14, NULL, ''Por línea portada de fuera del grupo +O''),
  (''MásMóvil'', ''extra_empresa'', ''linea'', 7, NULL, ''Segmentación empresa, por línea''),
  (''Jazztel'', ''fibra'', ''1000'', 29.75, NULL, ''Alta de fijo según velocidad''),
  (''Jazztel'', ''fibra'', ''600'', 22.75, NULL, ''Alta de fijo según velocidad''),
  (''Jazztel'', ''fibra'', ''500'', 22.75, NULL, ''Alta de fijo según velocidad''),
  (''Jazztel'', ''fibra'', ''400'', 19.25, NULL, ''Alta de fijo según velocidad''),
  (''Jazztel'', ''fibra'', ''300'', 19.25, NULL, ''Alta de fijo según velocidad''),
  (''Jazztel'', ''movil'', ''40'', 8.75, NULL, ''Línea móvil de pago según GB (las gratuitas no comisionan)''),
  (''Jazztel'', ''movil'', ''90'', 10.5, NULL, ''Línea móvil de pago según GB (las gratuitas no comisionan)''),
  (''Jazztel'', ''movil'', ''mas90'', 14, NULL, ''Línea móvil de pago según GB (las gratuitas no comisionan)''),
  (''Jazztel'', ''movil'', ''ilimitada'', 17.5, NULL, ''Línea móvil de pago según GB (las gratuitas no comisionan)''),
  (''Jazztel'', ''extra_portabilidad'', ''fibra'', 14, NULL, ''Por portabilidad de fuera del grupo +O''),
  (''Jazztel'', ''extra_portabilidad'', ''linea'', 14, NULL, ''Por línea portada de fuera del grupo +O''),
  (''Jazztel'', ''extra_empresa'', ''linea'', 7, NULL, ''Segmentación empresa, por línea''),
  (''Pepephone'', ''fibra'', ''1000'', 19.25, NULL, ''Alta de fijo según velocidad''),
  (''Pepephone'', ''fibra'', ''600'', 15.225, NULL, ''Alta de fijo según velocidad''),
  (''Pepephone'', ''fibra'', ''500'', 15.225, NULL, ''Alta de fijo según velocidad''),
  (''Pepephone'', ''fibra'', ''400'', 10.325, NULL, ''Alta de fijo según velocidad''),
  (''Pepephone'', ''fibra'', ''300'', 10.325, NULL, ''Alta de fijo según velocidad''),
  (''Pepephone'', ''movil'', ''40'', 8.75, NULL, ''Línea móvil de pago según GB (las gratuitas no comisionan)''),
  (''Pepephone'', ''movil'', ''90'', 10.5, NULL, ''Línea móvil de pago según GB (las gratuitas no comisionan)''),
  (''Pepephone'', ''movil'', ''mas90'', 14, NULL, ''Línea móvil de pago según GB (las gratuitas no comisionan)''),
  (''Pepephone'', ''movil'', ''ilimitada'', 17.5, NULL, ''Línea móvil de pago según GB (las gratuitas no comisionan)''),
  (''Pepephone'', ''extra_portabilidad'', ''fibra'', 14, NULL, ''Por portabilidad de fuera del grupo +O''),
  (''Pepephone'', ''extra_portabilidad'', ''linea'', 14, NULL, ''Por línea portada de fuera del grupo +O''),
  (''Pepephone'', ''extra_empresa'', ''linea'', 7, NULL, ''Segmentación empresa, por línea''),
  (''Orange'', ''fibra'', ''2000'', 47.25, NULL, ''Alta de fijo según velocidad''),
  (''Orange'', ''fibra'', ''1000'', 43.75, NULL, ''Alta de fijo según velocidad''),
  (''Orange'', ''fibra'', ''600'', 36.75, NULL, ''Alta de fijo según velocidad''),
  (''Orange'', ''fibra'', ''500'', 36.75, NULL, ''Alta de fijo según velocidad''),
  (''Orange'', ''fibra'', ''400'', 29.75, NULL, ''Alta de fijo según velocidad''),
  (''Orange'', ''fibra'', ''300'', 29.75, NULL, ''Alta de fijo según velocidad''),
  (''Orange'', ''movil'', ''40'', 8.75, NULL, ''Línea móvil de pago según GB (las gratuitas no comisionan)''),
  (''Orange'', ''movil'', ''90'', 10.5, NULL, ''Línea móvil de pago según GB (las gratuitas no comisionan)''),
  (''Orange'', ''movil'', ''mas90'', 14, NULL, ''Línea móvil de pago según GB (las gratuitas no comisionan)''),
  (''Orange'', ''movil'', ''ilimitada'', 17.5, NULL, ''Línea móvil de pago según GB (las gratuitas no comisionan)''),
  (''Orange'', ''extra_portabilidad'', ''fibra'', 3.5, NULL, ''Por portabilidad de fuera del grupo +O''),
  (''Orange'', ''extra_portabilidad'', ''linea'', 3.5, NULL, ''Por línea portada de fuera del grupo +O''),
  (''Orange'', ''extra_empresa'', ''1'', 5.25, NULL, ''Por línea según tamaño del pack Negocio (1, 3, 5, 10+ líneas)''),
  (''Orange'', ''extra_empresa'', ''3'', 7, NULL, ''Por línea según tamaño del pack Negocio (1, 3, 5, 10+ líneas)''),
  (''Orange'', ''extra_empresa'', ''5'', 8.75, NULL, ''Por línea según tamaño del pack Negocio (1, 3, 5, 10+ líneas)''),
  (''Orange'', ''extra_empresa'', ''10'', 14, NULL, ''Por línea según tamaño del pack Negocio (1, 3, 5, 10+ líneas)''),
  (''Orange'', ''descuento_digi'', ''fibra'', -25, NULL, ''Convergente con cliente procedente de Digi''),
  (''Vodafone'', ''fibra'', ''1000'', 76.55, NULL, ''Fibra cliente convergente (anexo VS0626)''),
  (''Vodafone'', ''fibra'', ''600'', 54.7, NULL, ''Fibra cliente convergente (anexo VS0626)''),
  (''Vodafone'', ''movil_principal'', ''ilimitada'', 90.15, 45.05, ''Portabilidad / alta nueva''),
  (''Vodafone'', ''movil_principal'', ''300'', 75.1, 37.55, ''Portabilidad / alta nueva''),
  (''Vodafone'', ''movil_principal'', ''160'', 60.1, 30.05, ''Portabilidad / alta nueva''),
  (''Vodafone'', ''movil_principal'', ''60'', 45.05, 22.55, ''Portabilidad / alta nueva''),
  (''Vodafone'', ''movil_2a4'', ''ilimitada'', 26.3, 13.15, ''Portabilidad / alta nueva''),
  (''Vodafone'', ''movil_2a4'', ''300'', 21.9, 10.95, ''Portabilidad / alta nueva''),
  (''Vodafone'', ''movil_2a4'', ''160'', 17.5, 8.75, ''Portabilidad / alta nueva''),
  (''Vodafone'', ''movil_2a4'', ''60'', 13.15, 6.55, ''Portabilidad / alta nueva''),
  (''Vodafone'', ''movil_5mas'', ''ilimitada'', 53, 26.5, ''Portabilidad / alta nueva''),
  (''Vodafone'', ''movil_5mas'', ''300'', 44.2, 22.1, ''Portabilidad / alta nueva''),
  (''Vodafone'', ''movil_5mas'', ''160'', 35.35, 17.65, ''Portabilidad / alta nueva''),
  (''Vodafone'', ''movil_5mas'', ''60'', 26.5, 13.25, ''Portabilidad / alta nueva'')', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- Perfiles de telefonia de ejemplo (solo la primera vez).
SET @s = (SELECT IF((SELECT COUNT(*) = 0 FROM cmp_tel_perfiles), 'INSERT IGNORE INTO cmp_tel_perfiles (nombre, datos) VALUES
  (''Oct 2026 · Residencial · F600 + fijo + 2 ilimitadas'', ''{"config": "fibra 600 Mb–1 Gb, fijo y 2 líneas móviles ilimitadas", "fechaTarifas": "2026-10-05", "nota": "Precios públicos (sin ofertas BTL). Yoigo: 49 € si la portabilidad no viene de Movistar o Vodafone. Adamo: 6 € menos en zona Smart; confirmar cobertura.", "ops": [{"nombre": "Adamo Caaalma Total", "cuota": 46, "promoPrecio": "", "promoMeses": "", "promoTexto": "Precio estable", "valoracion": "Fibra 1Gb + 2 ilimitadas + fijo; confirmar cobertura", "residencial": true, "ventajas": ["**Fibra 1Gb con WiFi 6.**", "**2ª línea ilimitada por 1 €** y hasta 3 más a 5 €.", "**Precio estable** sin subidas por promoción.", "**Fijo ilimitado** por 6 € más."], "comision": "", "marca": "Adamo", "fibra": 1000, "lineas": "∞, ∞", "lineasGratis": ""}, {"nombre": "Jazztel 2L 120GB", "cuota": 44.95, "promoPrecio": "", "promoMeses": "", "promoTexto": "Precio fijo", "valoracion": "120GB compartidos, no ilimitada; permanencia 12 meses", "residencial": true, "ventajas": [], "comision": "", "marca": "Jazztel", "fibra": 600, "lineas": "120, 120", "lineasGratis": ""}, {"nombre": "MásMóvil 2L 200GB", "cuota": 46.9, "promoPrecio": "", "promoMeses": "", "promoTexto": "Precio fijo", "valoracion": "200GB compartidos, fijo ilimitado", "residencial": true, "ventajas": [], "comision": "", "marca": "MásMóvil", "fibra": 500, "lineas": "200, 200", "lineasGratis": ""}, {"nombre": "Lowi 300GB + 300GB", "cuota": 49, "promoPrecio": "", "promoMeses": "", "promoTexto": "Precio final", "valoracion": "Residencial; sin fijo; red Vodafone", "residencial": true, "ventajas": [], "comision": "", "marca": "Lowi", "fibra": 600, "lineas": "300, 300", "lineasGratis": ""}, {"nombre": "Yoigo F600 + GB∞ + Dúo", "cuota": 61, "promoPrecio": "", "promoMeses": "", "promoTexto": "49 € portas*", "valoracion": "2 líneas compartiendo GB ilimitados", "residencial": true, "ventajas": [], "comision": "", "marca": "Yoigo", "fibra": 600, "lineas": "∞, ∞", "lineasGratis": 1}, {"nombre": "Vodafone F600 + 2 ilimitadas + TV", "cuota": 74, "promoPrecio": 59, "promoMeses": 3, "promoTexto": "59 € hasta dic.", "valoracion": "Vodafone TV + 3 OTT gratis hasta 31/12", "residencial": true, "ventajas": ["**2 líneas ilimitadas** con Vodafone TV y 3 plataformas gratis hasta el 31/12.", "**Líneas adicionales por 6 €** con las mismas condiciones.", "**Router WiFi 6** y deco incluidos.", "**Sin permanencia en TV.**"], "comision": "", "marca": "Vodafone", "fibra": 600, "lineas": "∞, ∞", "lineasGratis": ""}]}''),
  (''Oct 2026 · Residencial · F600 + 2 líneas hasta 50GB'', ''{"config": "fibra 600 Mb, fijo y 2 líneas móviles de hasta 50GB", "fechaTarifas": "2026-10-05", "nota": "Precios públicos (sin ofertas BTL). Yoigo: 41 € si la portabilidad no viene de Movistar o Vodafone.", "ops": [{"nombre": "Lowi 50GB + 50GB", "cuota": 35, "promoPrecio": "", "promoMeses": "", "promoTexto": "Precio final", "valoracion": "Residencial; sin fijo; red Vodafone", "residencial": true, "ventajas": [], "comision": "", "marca": "Lowi", "fibra": 600, "lineas": "50, 50", "lineasGratis": ""}, {"nombre": "Adamo F600 + 2x60GB", "cuota": 42, "promoPrecio": "", "promoMeses": "", "promoTexto": "Precio estable", "valoracion": "Incluye fijo (+6 €); confirmar cobertura", "residencial": true, "ventajas": [], "comision": "", "marca": "Adamo", "fibra": 600, "lineas": "60, 60", "lineasGratis": ""}, {"nombre": "MásMóvil 2L 100GB", "cuota": 39.9, "promoPrecio": "", "promoMeses": "", "promoTexto": "Precio fijo", "valoracion": "100GB compartidos", "residencial": true, "ventajas": [], "comision": "", "marca": "MásMóvil", "fibra": 500, "lineas": "100, 100", "lineasGratis": ""}, {"nombre": "Jazztel 2L 120GB", "cuota": 44.95, "promoPrecio": "", "promoMeses": "", "promoTexto": "Precio fijo", "valoracion": "120GB compartidos", "residencial": true, "ventajas": [], "comision": "", "marca": "Jazztel", "fibra": 600, "lineas": "120, 120", "lineasGratis": ""}, {"nombre": "Yoigo F600 + 80GB + Dúo", "cuota": 53, "promoPrecio": "", "promoMeses": "", "promoTexto": "41 € portas*", "valoracion": "80GB compartidos", "residencial": true, "ventajas": [], "comision": "", "marca": "Yoigo", "fibra": 600, "lineas": "80, 80", "lineasGratis": 1}, {"nombre": "Vodafone F600 + 2x60GB + TV", "cuota": 52, "promoPrecio": 49, "promoMeses": 3, "promoTexto": "49 € hasta dic.", "valoracion": "Vodafone TV + 1 OTT gratis hasta 31/12", "residencial": true, "ventajas": ["**2 líneas ilimitadas** con Vodafone TV y 3 plataformas gratis hasta el 31/12.", "**Líneas adicionales por 6 €** con las mismas condiciones.", "**Router WiFi 6** y deco incluidos.", "**Sin permanencia en TV.**"], "comision": "", "marca": "Vodafone", "fibra": 600, "lineas": "60, 60", "lineasGratis": ""}]}''),
  (''Oct 2026 · Residencial · familia 4 líneas'', ''{"config": "fibra 600 Mb–1 Gb, fijo y 4 líneas móviles (2 ilimitadas)", "fechaTarifas": "2026-10-05", "nota": "Precios públicos (sin ofertas BTL). Adamo: 4 líneas ilimitadas; 6 € menos en zona Smart.", "ops": [{"nombre": "Adamo Caaalma Total 4 ilimitadas", "cuota": 56, "promoPrecio": "", "promoMeses": "", "promoTexto": "Precio estable", "valoracion": "Fibra 1Gb + 4 ilimitadas + fijo; confirmar cobertura", "residencial": true, "ventajas": ["**Fibra 1Gb con WiFi 6.**", "**2ª línea ilimitada por 1 €** y hasta 3 más a 5 €.", "**Precio estable** sin subidas por promoción.", "**Fijo ilimitado** por 6 € más."], "comision": "", "marca": "Adamo", "fibra": 1000, "lineas": "∞, ∞, ∞, ∞", "lineasGratis": ""}, {"nombre": "MásMóvil 2L 200GB + 2x25GB", "cuota": 56.9, "promoPrecio": "", "promoMeses": "", "promoTexto": "Precio fijo", "valoracion": "200GB compartidos + 2 líneas de 25GB", "residencial": true, "ventajas": [], "comision": "", "marca": "MásMóvil", "fibra": 500, "lineas": "200, 200, 25, 25", "lineasGratis": ""}, {"nombre": "Jazztel 2L 120GB + 2x20GB", "cuota": 56.95, "promoPrecio": "", "promoMeses": "", "promoTexto": "Precio fijo", "valoracion": "120GB compartidos + 2 de 20GB", "residencial": true, "ventajas": [], "comision": "", "marca": "Jazztel", "fibra": 600, "lineas": "120, 120, 20, 20", "lineasGratis": ""}, {"nombre": "Lowi 2x300GB + 2x50GB", "cuota": 59, "promoPrecio": "", "promoMeses": "", "promoTexto": "Precio final", "valoracion": "Sin fijo", "residencial": true, "ventajas": [], "comision": "", "marca": "Lowi", "fibra": 600, "lineas": "300, 300, 50, 50", "lineasGratis": ""}, {"nombre": "Yoigo GB∞ + Dúo + 2 Dúo AD", "cuota": 79, "promoPrecio": "", "promoMeses": "", "promoTexto": "67 € portas*", "valoracion": "4 líneas compartiendo GB ilimitados", "residencial": true, "ventajas": [], "comision": "", "marca": "Yoigo", "fibra": 600, "lineas": "∞, ∞, ∞, ∞", "lineasGratis": 1}, {"nombre": "Vodafone 2 ilimitadas + 2 adicionales", "cuota": 86, "promoPrecio": 71, "promoMeses": 3, "promoTexto": "71 € hasta dic.", "valoracion": "4 ilimitadas + TV y 3 OTT hasta 31/12", "residencial": true, "ventajas": ["**2 líneas ilimitadas** con Vodafone TV y 3 plataformas gratis hasta el 31/12.", "**Líneas adicionales por 6 €** con las mismas condiciones.", "**Router WiFi 6** y deco incluidos.", "**Sin permanencia en TV.**"], "comision": "", "marca": "Vodafone", "fibra": 600, "lineas": "∞, ∞, ∞, ∞", "lineasGratis": ""}]}''),
  (''Oct 2026 · Autónomo · F1Gb + 2 ilimitadas (IVA incl.)'', ''{"config": "fibra 1 Gb, fijo y 2 líneas móviles ilimitadas, empresa", "fechaTarifas": "2026-10-05", "nota": "Precios de empresa convertidos a IVA incluido. Orange exige venta a plazos de un terminal; sin ella, 81,28 €.", "ops": [{"nombre": "Vodafone Mi Negocio Pro 2", "cuota": 61.58, "promoPrecio": "", "promoMeses": "", "promoTexto": "Precio estable", "valoracion": "Soporte 24x7, MultiSIM, 200 min internacionales", "residencial": false, "ventajas": ["**2 líneas ilimitadas 5G** y MultiSIM en cada línea.", "**Soporte informático 24x7** y Secure Net fijo y móvil.", "**200 minutos internacionales** por línea.", "**Línea ilimitada adicional por 9,09 €** (sin IVA)."], "comision": "", "marca": "Vodafone", "fibra": 1000, "lineas": "∞, ∞", "lineasGratis": ""}, {"nombre": "Yoigo Digital Pro F1Gb + GB∞", "cuota": 64.13, "promoPrecio": 49.61, "promoMeses": 3, "promoTexto": "49,61 € 3 meses", "valoracion": "Ciberseguridad, web, M365, Prime; Dúo incluido", "residencial": false, "ventajas": [], "comision": "", "marca": "Yoigo", "fibra": 1000, "lineas": "∞, ∞", "lineasGratis": 1}, {"nombre": "Yoigo Digital Pro F600 + GB∞", "cuota": 49.61, "promoPrecio": "", "promoMeses": "", "promoTexto": "Precio 24 meses", "valoracion": "24 meses de precio; ciberseguridad, web, M365", "residencial": false, "ventajas": [], "comision": "", "marca": "Yoigo", "fibra": 600, "lineas": "∞, ∞", "lineasGratis": 1}, {"nombre": "MásMóvil Digital Pro F1Gb 225GB", "cuota": 65.34, "promoPrecio": 55.66, "promoMeses": 3, "promoTexto": "55,66 € 3 meses", "valoracion": "200+25GB; ciberseguridad y web", "residencial": false, "ventajas": [], "comision": "", "marca": "MásMóvil", "fibra": 1000, "lineas": "200, 25", "lineasGratis": ""}, {"nombre": "Orange Negocio Extra 1 + 1 línea", "cuota": 73.35, "promoPrecio": "", "promoMeses": "", "promoTexto": "Con VAP 24 meses", "valoracion": "Con venta a plazos; beneficios Negocio", "residencial": false, "ventajas": [], "comision": "", "marca": "Orange", "fibra": 1000, "lineas": "∞, ∞", "lineasGratis": ""}]}''),
  (''Oct 2026 · Pyme · 3 líneas ilimitadas (IVA incl.)'', ''{"config": "fibra 1 Gb, fijo y 3 líneas móviles ilimitadas, empresa", "fechaTarifas": "2026-10-05", "nota": "Precios de empresa convertidos a IVA incluido. Orange exige venta a plazos de un terminal; sin ella, 103,46 €.", "ops": [{"nombre": "Vodafone Mi Negocio Pro 2 + 1 ilimitada", "cuota": 66.53, "promoPrecio": "", "promoMeses": "", "promoTexto": "Precio estable", "valoracion": "Soporte 24x7, MultiSIM; −5 € desde 3 líneas", "residencial": false, "ventajas": ["**2 líneas ilimitadas 5G** y MultiSIM en cada línea.", "**Soporte informático 24x7** y Secure Net fijo y móvil.", "**200 minutos internacionales** por línea.", "**Línea ilimitada adicional por 9,09 €** (sin IVA)."], "comision": "", "marca": "Vodafone", "fibra": 1000, "lineas": "∞, ∞, ∞", "lineasGratis": ""}, {"nombre": "Yoigo Digital Pro F1Gb + Dúo + Dúo AD", "cuota": 73.13, "promoPrecio": 58.61, "promoMeses": 3, "promoTexto": "3 meses", "valoracion": "3 líneas compartiendo GB ilimitados", "residencial": false, "ventajas": [], "comision": "", "marca": "Yoigo", "fibra": 1000, "lineas": "∞, ∞, ∞", "lineasGratis": 1}, {"nombre": "MásMóvil Digital Pro F1Gb + 100GB", "cuota": 77.32, "promoPrecio": 67.64, "promoMeses": 3, "promoTexto": "3 meses", "valoracion": "200+25+100GB", "residencial": false, "ventajas": [], "comision": "", "marca": "MásMóvil", "fibra": 1000, "lineas": "200, 25, 100", "lineasGratis": ""}, {"nombre": "Orange Negocio Extra 3", "cuota": 80.47, "promoPrecio": "", "promoMeses": "", "promoTexto": "Con VAP 24 meses", "valoracion": "Con venta a plazos; 2 beneficios elegibles", "residencial": false, "ventajas": [], "comision": "", "marca": "Orange", "fibra": 1000, "lineas": "∞, ∞, ∞", "lineasGratis": ""}]}''),
  (''Oct 2026 · Pyme · 5 líneas ilimitadas (IVA incl.)'', ''{"config": "fibra 1 Gb, fijo y 5 líneas móviles ilimitadas, empresa", "fechaTarifas": "2026-10-05", "nota": "Precios de empresa convertidos a IVA incluido. Vodafone: confirmar si el −5 € es por contrato o por línea.", "ops": [{"nombre": "Vodafone Mi Negocio Pro 2 + 3 ilimitadas", "cuota": 88.52, "promoPrecio": "", "promoMeses": "", "promoTexto": "Precio estable", "valoracion": "Soporte 24x7, MultiSIM", "residencial": false, "ventajas": ["**2 líneas ilimitadas 5G** y MultiSIM en cada línea.", "**Soporte informático 24x7** y Secure Net fijo y móvil.", "**200 minutos internacionales** por línea.", "**Línea ilimitada adicional por 9,09 €** (sin IVA)."], "comision": "", "marca": "Vodafone", "fibra": 1000, "lineas": "∞, ∞, ∞, ∞, ∞", "lineasGratis": ""}, {"nombre": "Orange Negocio Extra 3 + 2 líneas", "cuota": 100.36, "promoPrecio": "", "promoMeses": "", "promoTexto": "Con VAP 24 meses", "valoracion": "Con venta a plazos; líneas a 8,22 € 24 meses", "residencial": false, "ventajas": [], "comision": "", "marca": "Orange", "fibra": 1000, "lineas": "∞, ∞, ∞, ∞, ∞", "lineasGratis": ""}, {"nombre": "Orange Negocio Extra 5", "cuota": 108.42, "promoPrecio": "", "promoMeses": "", "promoTexto": "Con VAP 24 meses", "valoracion": "Con venta a plazos; 3 beneficios elegibles", "residencial": false, "ventajas": [], "comision": "", "marca": "Orange", "fibra": 1000, "lineas": "∞, ∞, ∞, ∞, ∞", "lineasGratis": ""}, {"nombre": "Yoigo Digital Pro F1Gb + 3 GB∞ AD", "cuota": 122.21, "promoPrecio": 107.69, "promoMeses": 3, "promoTexto": "3 meses", "valoracion": "Líneas independientes", "residencial": false, "ventajas": [], "comision": "", "marca": "Yoigo", "fibra": 1000, "lineas": "∞, ∞, ∞, ∞, ∞", "lineasGratis": 1}]}'')', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- Catalogo de energia de ejemplo (solo la primera vez: si ya hay tarifas, no se tocan).
SET @icc_cat_vacio = (SELECT COUNT(*) = 0 FROM cmp_ene_tarifas);
SET @s = (SELECT IF((SELECT @icc_cat_vacio), 'INSERT INTO cmp_ene_tarifas (tipo, peaje, rol, comercializadora, nombre, modalidad, cliente, pp1, pp2, pe1, pe2, pe3, valoracion, ventajas)
SELECT ''luz'', ''2.0TD'', ''propia'', ''NAGINI'', ''NAGINI Fijo Prime Plus 2.0TD'', ''fijo'', ''todos'', 0.171793, 0.097878, 0.129, 0.129, 0.129, ''Precio fijo; sin cargo de SSAA aparte'', ''**Precio fijo.** El kWh no cambia con el mercado mayorista.\\n**Sin cargos de red aparte.** Desaparece el cargo de SSAA de su factura.\\n**Mismo precio todo el día** en punta, llano y valle.\\n**Gestión integral.** Cambio sin cortes de suministro.'' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM cmp_ene_tarifas WHERE comercializadora = ''NAGINI'' AND nombre = ''NAGINI Fijo Prime Plus 2.0TD'')', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT @icc_cat_vacio), 'INSERT INTO cmp_ene_tarifas (tipo, peaje, rol, comercializadora, nombre, modalidad, cliente, pp1, pp2, pe1, pe2, pe3, valoracion, ventajas)
SELECT ''luz'', ''2.0TD'', ''propia'', ''NET'', ''NET FIJO BOE 2.0TD'', ''fijo'', ''todos'', 0.075903, 0.001987, 0.248201, 0.17206, 0.142966, ''Precio fijo; potencia a precio BOE'', ''**Potencia a precio BOE.** Paga solo peajes y cargos regulados, sin margen.\\n**Precio fijo.** El kWh no cambia con el mercado mayorista.\\n**Ideal con mucha potencia** y poco consumo.\\n**Gestión integral.** Cambio sin cortes de suministro.'' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM cmp_ene_tarifas WHERE comercializadora = ''NET'' AND nombre = ''NET FIJO BOE 2.0TD'')', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT @icc_cat_vacio), 'INSERT INTO cmp_ene_tarifas (tipo, peaje, rol, comercializadora, nombre, modalidad, cliente, pp1, pp2, pe1, pe2, pe3, valoracion, ventajas)
SELECT ''luz'', ''2.0TD'', ''mercado'', ''Iberdrola'', ''Plan Estable'', ''fijo'', ''todos'', 0.1164, 0.1041, 0.2049, 0.2049, 0.2049, ''Precio fijo en todas las horas'', NULL FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM cmp_ene_tarifas WHERE comercializadora = ''Iberdrola'' AND nombre = ''Plan Estable'')', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT @icc_cat_vacio), 'INSERT INTO cmp_ene_tarifas (tipo, peaje, rol, comercializadora, nombre, modalidad, cliente, pp1, pp2, pe1, pe2, pe3, valoracion, ventajas)
SELECT ''luz'', ''2.0TD'', ''mercado'', ''Endesa'', ''Luz 24h 3 años'', ''fijo'', ''todos'', 0.0937, 0.0937, 0.1754, 0.1754, 0.1754, ''Precio fijo 3 años'', NULL FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM cmp_ene_tarifas WHERE comercializadora = ''Endesa'' AND nombre = ''Luz 24h 3 años'')', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT @icc_cat_vacio), 'INSERT INTO cmp_ene_tarifas (tipo, peaje, rol, comercializadora, nombre, modalidad, cliente, pp1, pp2, pe1, pe2, pe3, valoracion, ventajas)
SELECT ''luz'', ''2.0TD'', ''mercado'', ''Naturgy'', ''Por Uso Luz'', ''fijo'', ''todos'', 0.123, 0.0616, 0.123, 0.123, 0.123, ''Precio fijo 12 meses'', NULL FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM cmp_ene_tarifas WHERE comercializadora = ''Naturgy'' AND nombre = ''Por Uso Luz'')', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT @icc_cat_vacio), 'INSERT INTO cmp_ene_tarifas (tipo, peaje, rol, comercializadora, nombre, modalidad, cliente, pp1, pp2, pe1, pe2, pe3, valoracion, ventajas)
SELECT ''luz'', ''2.0TD'', ''mercado'', ''Repsol'', ''Sin Horarios'', ''fijo'', ''todos'', 0.0819, 0.0819, 0.1399, 0.1399, 0.1399, ''Precio único todo el día'', NULL FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM cmp_ene_tarifas WHERE comercializadora = ''Repsol'' AND nombre = ''Sin Horarios'')', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT @icc_cat_vacio), 'INSERT INTO cmp_ene_tarifas (tipo, peaje, rol, comercializadora, nombre, modalidad, cliente, pp1, pp2, pe1, pe2, pe3, valoracion, ventajas)
SELECT ''luz'', ''2.0TD'', ''mercado'', ''TotalEnergies'', ''A Tu Aire Luz Siempre'', ''fijo'', ''todos'', 0.0863, 0.0863, 0.0999, 0.0999, 0.0999, ''Precio único todo el día'', NULL FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM cmp_ene_tarifas WHERE comercializadora = ''TotalEnergies'' AND nombre = ''A Tu Aire Luz Siempre'')', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT @icc_cat_vacio), 'INSERT INTO cmp_ene_tarifas (tipo, peaje, rol, comercializadora, nombre, modalidad, cliente, pp1, pp2, pe1, pe2, pe3, valoracion, ventajas)
SELECT ''luz'', ''2.0TD'', ''mercado'', ''Octopus Energy'', ''Octopus Relax'', ''fijo'', ''todos'', 0.1184, 0.1184, 0.1444, 0.1444, 0.1444, ''Precio único todo el día'', NULL FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM cmp_ene_tarifas WHERE comercializadora = ''Octopus Energy'' AND nombre = ''Octopus Relax'')', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT @icc_cat_vacio), 'INSERT INTO cmp_ene_tarifas (tipo, peaje, rol, comercializadora, nombre, modalidad, cliente, pp1, pp2, pe1, pe2, pe3, valoracion, ventajas)
SELECT ''luz'', ''2.0TD'', ''mercado'', ''Holaluz'', ''Tarifa Clásica'', ''fijo'', ''todos'', 0.12, 0.12, 0.139, 0.139, 0.139, ''Precio estándar sin contratación online'', NULL FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM cmp_ene_tarifas WHERE comercializadora = ''Holaluz'' AND nombre = ''Tarifa Clásica'')', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT @icc_cat_vacio), 'INSERT INTO cmp_ene_tarifas (tipo, peaje, rol, comercializadora, nombre, modalidad, cliente, pp1, pp2, pe1, pe2, pe3, valoracion, ventajas)
SELECT ''luz'', ''2.0TD'', ''mercado'', ''Factor Energía'', ''Fija Precio Único'', ''fijo'', ''todos'', 0.1041, 0.1041, 0.14, 0.14, 0.14, ''Precio único todo el día'', NULL FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM cmp_ene_tarifas WHERE comercializadora = ''Factor Energía'' AND nombre = ''Fija Precio Único'')', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT @icc_cat_vacio), 'INSERT INTO cmp_ene_tarifas (tipo, peaje, rol, comercializadora, nombre, modalidad, cliente, pp1, pp2, pe1, pe2, pe3, valoracion, ventajas)
SELECT ''luz'', ''2.0TD'', ''mercado'', ''Plenitude'', ''Fácil Plus Luz'', ''fijo'', ''todos'', 0.1125, 0.1125, 0.12, 0.12, 0.12, ''Precio único todo el día'', NULL FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM cmp_ene_tarifas WHERE comercializadora = ''Plenitude'' AND nombre = ''Fácil Plus Luz'')', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- Juan (juan@integralconnectionconsulting.es) responsable de Maria y su equipo.
UPDATE usuarios m
  JOIN usuarios j ON j.email = 'juan@integralconnectionconsulting.es'
SET m.supervisor_id = j.id
WHERE m.rol = 'jefe_de_equipo'
  AND (m.email = 'maria.alvarez@integralconnectionconsulting.es' OR m.email LIKE 'maria%@integralconnectionconsulting.es');

-- Daniela (Backoffice) agenda a Juan y a Maria: solo su agenda.
INSERT IGNORE INTO backoffice_agendas (backoffice_id, usuario_id)
SELECT bo.id, u.id
FROM usuarios bo
JOIN usuarios u ON u.email IN ('juan@integralconnectionconsulting.es', 'maria.alvarez@integralconnectionconsulting.es')
WHERE bo.rol = 'backoffice' AND bo.email LIKE 'daniela%@integralconnectionconsulting.es';

-- Solo en una instalacion NUEVA (sin ningun usuario): Super Administrador inicial.
--   Email: juan@integralconnectionconsulting.es
--   Contrasena provisional: CambiaEsta-2026  (el CRM obliga a cambiarla al entrar)
INSERT INTO usuarios (nombre, email, password_hash, rol, debe_cambiar_password)
SELECT 'Juan', 'juan@integralconnectionconsulting.es', '$2y$10$3KwqT6Ca5fd71grxfcM4f.ve6SkNGLuf4Odmi1cejAIzdkY8jeliq', 'super_admin', 1 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM usuarios);
UPDATE usuarios SET numero_relacion = CONCAT('ICC-', LPAD(id, 5, '0')) WHERE numero_relacion IS NULL;

SET FOREIGN_KEY_CHECKS = 1;
SET SESSION sql_mode = @icc_modo_anterior;

-- Listo. Base de datos al dia para ICC CRM v68.
