-- =============================================================================
-- ICC CRM · Migracion: comparadores de Energia y Telefonia
-- Segura de ejecutar varias veces (no duplica nada).
--
-- Sustituye al comparador anterior del CRM. Crea:
--   cmp_config          numeracion de presupuestos (compartida por los dos)
--   cmp_limites         limites de uso (lectura de facturas con IA, SIPS)
--   cmp_ene_tarifas     catalogo de tarifas de luz y gas (propias y de mercado)
--   cmp_ene_informes    auditorias energeticas guardadas
--   cmp_tel_perfiles    tarifas de mercado de las operadoras (por configuracion)
--   cmp_tel_comisiones  comisiones por operadora (no salen nunca en el PDF)
--   cmp_tel_informes    auditorias de telecomunicaciones guardadas
-- Cada informe pertenece al comercial que lo crea y se ve segun la misma
-- jerarquia del CRM (comercial / jefe de equipo / backoffice / admin).
-- =============================================================================

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS cmp_config (
  clave VARCHAR(50) NOT NULL PRIMARY KEY,
  valor VARCHAR(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- Continua la numeracion de los presupuestos ya emitidos (ultimo: ICC-09-2838364).
INSERT IGNORE INTO cmp_config (clave, valor) VALUES ('prefijo', 'ICC-09-'), ('siguiente', '2838365');

CREATE TABLE IF NOT EXISTS cmp_limites (
  clave CHAR(64) NOT NULL PRIMARY KEY,
  contador INT UNSIGNED NOT NULL DEFAULT 0,
  inicio INT UNSIGNED NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cmp_ene_tarifas (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tipo VARCHAR(10) NOT NULL DEFAULT 'luz',
  peaje VARCHAR(10) NOT NULL DEFAULT '2.0TD',
  rol VARCHAR(10) NOT NULL DEFAULT 'propia',
  comercializadora VARCHAR(120) NOT NULL,
  nombre VARCHAR(150) NOT NULL,
  modalidad VARCHAR(10) NOT NULL DEFAULT 'fijo',
  cliente VARCHAR(12) NOT NULL DEFAULT 'todos',
  pp1 DECIMAL(10,6) NOT NULL DEFAULT 0, pp2 DECIMAL(10,6) NOT NULL DEFAULT 0, pp3 DECIMAL(10,6) NOT NULL DEFAULT 0,
  pp4 DECIMAL(10,6) NOT NULL DEFAULT 0, pp5 DECIMAL(10,6) NOT NULL DEFAULT 0, pp6 DECIMAL(10,6) NOT NULL DEFAULT 0,
  pe1 DECIMAL(10,6) NOT NULL DEFAULT 0, pe2 DECIMAL(10,6) NOT NULL DEFAULT 0, pe3 DECIMAL(10,6) NOT NULL DEFAULT 0,
  pe4 DECIMAL(10,6) NOT NULL DEFAULT 0, pe5 DECIMAL(10,6) NOT NULL DEFAULT 0, pe6 DECIMAL(10,6) NOT NULL DEFAULT 0,
  termino_fijo_dia DECIMAL(10,6) NOT NULL DEFAULT 0,
  ssaa_kwh DECIMAL(10,6) NOT NULL DEFAULT 0,
  compensacion_kwh DECIMAL(10,6) NOT NULL DEFAULT 0,
  permanencia_meses INT NOT NULL DEFAULT 0,
  comision_tramos VARCHAR(255) DEFAULT NULL,
  valoracion VARCHAR(255) DEFAULT NULL,
  ventajas TEXT,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  actualizado_por INT UNSIGNED DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_cmp_ene_tarifas (tipo, peaje, rol, activo),
  CONSTRAINT fk_cmp_ene_tarifas_usuario FOREIGN KEY (actualizado_por) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cmp_ene_informes (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  numero VARCHAR(40) NOT NULL UNIQUE,
  usuario_id INT UNSIGNED NOT NULL,
  cliente_id INT UNSIGNED NULL,
  tipo VARCHAR(10) NOT NULL DEFAULT 'luz',
  cliente_nombre VARCHAR(150) DEFAULT NULL,
  cups VARCHAR(30) DEFAULT NULL,
  comercializadora_actual VARCHAR(150) DEFAULT NULL,
  tarifa_propuesta VARCHAR(150) DEFAULT NULL,
  coste_actual_anual DECIMAL(12,2) DEFAULT NULL,
  coste_propuesto_anual DECIMAL(12,2) DEFAULT NULL,
  ahorro_anual DECIMAL(12,2) DEFAULT NULL,
  datos LONGTEXT NOT NULL,
  pdf_ruta VARCHAR(255) DEFAULT NULL,
  pdf_bytes INT UNSIGNED DEFAULT NULL,
  pdf_fecha DATETIME DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_cmp_ene_informes_usuario (usuario_id, updated_at),
  INDEX idx_cmp_ene_informes_cliente (cliente_id),
  CONSTRAINT fk_cmp_ene_informes_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_cmp_ene_informes_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cmp_tel_perfiles (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(150) NOT NULL UNIQUE,
  datos LONGTEXT NOT NULL,
  actualizado_por INT UNSIGNED DEFAULT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_cmp_tel_perfiles_usuario FOREIGN KEY (actualizado_por) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cmp_tel_comisiones (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  marca VARCHAR(50) NOT NULL,
  concepto VARCHAR(40) NOT NULL,
  tramo VARCHAR(20) NOT NULL,
  importe DECIMAL(10,3) NOT NULL,
  importe_alta DECIMAL(10,3) DEFAULT NULL,
  nota VARCHAR(255) DEFAULT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cmp_tel_comision (marca, concepto, tramo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cmp_tel_informes (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  numero VARCHAR(40) NOT NULL UNIQUE,
  usuario_id INT UNSIGNED NOT NULL,
  cliente_id INT UNSIGNED NULL,
  cliente_nombre VARCHAR(150) DEFAULT NULL,
  operador_actual VARCHAR(150) DEFAULT NULL,
  operador_propuesto VARCHAR(150) DEFAULT NULL,
  coste_actual_anual DECIMAL(12,2) DEFAULT NULL,
  coste_propuesto_anual DECIMAL(12,2) DEFAULT NULL,
  ahorro_anual DECIMAL(12,2) DEFAULT NULL,
  datos LONGTEXT NOT NULL,
  pdf_ruta VARCHAR(255) DEFAULT NULL,
  pdf_bytes INT UNSIGNED DEFAULT NULL,
  pdf_fecha DATETIME DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_cmp_tel_informes_usuario (usuario_id, updated_at),
  INDEX idx_cmp_tel_informes_cliente (cliente_id),
  CONSTRAINT fk_cmp_tel_informes_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_cmp_tel_informes_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Comisiones de telefonia (desde MR_comisiones.xlsx). Reimportar deja estos valores.
-- -----------------------------------------------------------------------------
INSERT INTO cmp_tel_comisiones (marca, concepto, tramo, importe, importe_alta, nota) VALUES
  ('Yoigo', 'fibra', '2000', 47.25, NULL, 'Alta de fijo según velocidad'),
  ('Yoigo', 'fibra', '1000', 43.75, NULL, 'Alta de fijo según velocidad'),
  ('Yoigo', 'fibra', '600', 36.75, NULL, 'Alta de fijo según velocidad'),
  ('Yoigo', 'fibra', '500', 36.75, NULL, 'Alta de fijo según velocidad'),
  ('Yoigo', 'fibra', '400', 29.75, NULL, 'Alta de fijo según velocidad'),
  ('Yoigo', 'fibra', '300', 29.75, NULL, 'Alta de fijo según velocidad'),
  ('Yoigo', 'movil', '40', 8.75, NULL, 'Línea móvil de pago según GB (las gratuitas no comisionan)'),
  ('Yoigo', 'movil', '90', 10.5, NULL, 'Línea móvil de pago según GB (las gratuitas no comisionan)'),
  ('Yoigo', 'movil', 'mas90', 14, NULL, 'Línea móvil de pago según GB (las gratuitas no comisionan)'),
  ('Yoigo', 'movil', 'ilimitada', 17.5, NULL, 'Línea móvil de pago según GB (las gratuitas no comisionan)'),
  ('Yoigo', 'extra_portabilidad', 'fibra', 14, NULL, 'Por portabilidad de fuera del grupo +O'),
  ('Yoigo', 'extra_portabilidad', 'linea', 14, NULL, 'Por línea portada de fuera del grupo +O'),
  ('Yoigo', 'extra_empresa', 'linea', 7, NULL, 'Segmentación empresa, por línea'),
  ('MásMóvil', 'fibra', '1000', 23.625, NULL, 'Alta de fijo según velocidad'),
  ('MásMóvil', 'fibra', '600', 18.725, NULL, 'Alta de fijo según velocidad'),
  ('MásMóvil', 'fibra', '500', 18.725, NULL, 'Alta de fijo según velocidad'),
  ('MásMóvil', 'fibra', '400', 13.825, NULL, 'Alta de fijo según velocidad'),
  ('MásMóvil', 'fibra', '300', 13.825, NULL, 'Alta de fijo según velocidad'),
  ('MásMóvil', 'movil', '40', 8.75, NULL, 'Línea móvil de pago según GB (las gratuitas no comisionan)'),
  ('MásMóvil', 'movil', '90', 10.5, NULL, 'Línea móvil de pago según GB (las gratuitas no comisionan)'),
  ('MásMóvil', 'movil', 'mas90', 14, NULL, 'Línea móvil de pago según GB (las gratuitas no comisionan)'),
  ('MásMóvil', 'movil', 'ilimitada', 17.5, NULL, 'Línea móvil de pago según GB (las gratuitas no comisionan)'),
  ('MásMóvil', 'extra_portabilidad', 'fibra', 14, NULL, 'Por portabilidad de fuera del grupo +O'),
  ('MásMóvil', 'extra_portabilidad', 'linea', 14, NULL, 'Por línea portada de fuera del grupo +O'),
  ('MásMóvil', 'extra_empresa', 'linea', 7, NULL, 'Segmentación empresa, por línea'),
  ('Jazztel', 'fibra', '1000', 29.75, NULL, 'Alta de fijo según velocidad'),
  ('Jazztel', 'fibra', '600', 22.75, NULL, 'Alta de fijo según velocidad'),
  ('Jazztel', 'fibra', '500', 22.75, NULL, 'Alta de fijo según velocidad'),
  ('Jazztel', 'fibra', '400', 19.25, NULL, 'Alta de fijo según velocidad'),
  ('Jazztel', 'fibra', '300', 19.25, NULL, 'Alta de fijo según velocidad'),
  ('Jazztel', 'movil', '40', 8.75, NULL, 'Línea móvil de pago según GB (las gratuitas no comisionan)'),
  ('Jazztel', 'movil', '90', 10.5, NULL, 'Línea móvil de pago según GB (las gratuitas no comisionan)'),
  ('Jazztel', 'movil', 'mas90', 14, NULL, 'Línea móvil de pago según GB (las gratuitas no comisionan)'),
  ('Jazztel', 'movil', 'ilimitada', 17.5, NULL, 'Línea móvil de pago según GB (las gratuitas no comisionan)'),
  ('Jazztel', 'extra_portabilidad', 'fibra', 14, NULL, 'Por portabilidad de fuera del grupo +O'),
  ('Jazztel', 'extra_portabilidad', 'linea', 14, NULL, 'Por línea portada de fuera del grupo +O'),
  ('Jazztel', 'extra_empresa', 'linea', 7, NULL, 'Segmentación empresa, por línea'),
  ('Pepephone', 'fibra', '1000', 19.25, NULL, 'Alta de fijo según velocidad'),
  ('Pepephone', 'fibra', '600', 15.225, NULL, 'Alta de fijo según velocidad'),
  ('Pepephone', 'fibra', '500', 15.225, NULL, 'Alta de fijo según velocidad'),
  ('Pepephone', 'fibra', '400', 10.325, NULL, 'Alta de fijo según velocidad'),
  ('Pepephone', 'fibra', '300', 10.325, NULL, 'Alta de fijo según velocidad'),
  ('Pepephone', 'movil', '40', 8.75, NULL, 'Línea móvil de pago según GB (las gratuitas no comisionan)'),
  ('Pepephone', 'movil', '90', 10.5, NULL, 'Línea móvil de pago según GB (las gratuitas no comisionan)'),
  ('Pepephone', 'movil', 'mas90', 14, NULL, 'Línea móvil de pago según GB (las gratuitas no comisionan)'),
  ('Pepephone', 'movil', 'ilimitada', 17.5, NULL, 'Línea móvil de pago según GB (las gratuitas no comisionan)'),
  ('Pepephone', 'extra_portabilidad', 'fibra', 14, NULL, 'Por portabilidad de fuera del grupo +O'),
  ('Pepephone', 'extra_portabilidad', 'linea', 14, NULL, 'Por línea portada de fuera del grupo +O'),
  ('Pepephone', 'extra_empresa', 'linea', 7, NULL, 'Segmentación empresa, por línea'),
  ('Orange', 'fibra', '2000', 47.25, NULL, 'Alta de fijo según velocidad'),
  ('Orange', 'fibra', '1000', 43.75, NULL, 'Alta de fijo según velocidad'),
  ('Orange', 'fibra', '600', 36.75, NULL, 'Alta de fijo según velocidad'),
  ('Orange', 'fibra', '500', 36.75, NULL, 'Alta de fijo según velocidad'),
  ('Orange', 'fibra', '400', 29.75, NULL, 'Alta de fijo según velocidad'),
  ('Orange', 'fibra', '300', 29.75, NULL, 'Alta de fijo según velocidad'),
  ('Orange', 'movil', '40', 8.75, NULL, 'Línea móvil de pago según GB (las gratuitas no comisionan)'),
  ('Orange', 'movil', '90', 10.5, NULL, 'Línea móvil de pago según GB (las gratuitas no comisionan)'),
  ('Orange', 'movil', 'mas90', 14, NULL, 'Línea móvil de pago según GB (las gratuitas no comisionan)'),
  ('Orange', 'movil', 'ilimitada', 17.5, NULL, 'Línea móvil de pago según GB (las gratuitas no comisionan)'),
  ('Orange', 'extra_portabilidad', 'fibra', 3.5, NULL, 'Por portabilidad de fuera del grupo +O'),
  ('Orange', 'extra_portabilidad', 'linea', 3.5, NULL, 'Por línea portada de fuera del grupo +O'),
  ('Orange', 'extra_empresa', '1', 5.25, NULL, 'Por línea según tamaño del pack Negocio (1, 3, 5, 10+ líneas)'),
  ('Orange', 'extra_empresa', '3', 7, NULL, 'Por línea según tamaño del pack Negocio (1, 3, 5, 10+ líneas)'),
  ('Orange', 'extra_empresa', '5', 8.75, NULL, 'Por línea según tamaño del pack Negocio (1, 3, 5, 10+ líneas)'),
  ('Orange', 'extra_empresa', '10', 14, NULL, 'Por línea según tamaño del pack Negocio (1, 3, 5, 10+ líneas)'),
  ('Orange', 'descuento_digi', 'fibra', -25, NULL, 'Convergente con cliente procedente de Digi'),
  ('Vodafone', 'fibra', '1000', 76.55, NULL, 'Fibra cliente convergente (anexo VS0626)'),
  ('Vodafone', 'fibra', '600', 54.7, NULL, 'Fibra cliente convergente (anexo VS0626)'),
  ('Vodafone', 'movil_principal', 'ilimitada', 90.15, 45.05, 'Portabilidad / alta nueva'),
  ('Vodafone', 'movil_principal', '300', 75.1, 37.55, 'Portabilidad / alta nueva'),
  ('Vodafone', 'movil_principal', '160', 60.1, 30.05, 'Portabilidad / alta nueva'),
  ('Vodafone', 'movil_principal', '60', 45.05, 22.55, 'Portabilidad / alta nueva'),
  ('Vodafone', 'movil_2a4', 'ilimitada', 26.3, 13.15, 'Portabilidad / alta nueva'),
  ('Vodafone', 'movil_2a4', '300', 21.9, 10.95, 'Portabilidad / alta nueva'),
  ('Vodafone', 'movil_2a4', '160', 17.5, 8.75, 'Portabilidad / alta nueva'),
  ('Vodafone', 'movil_2a4', '60', 13.15, 6.55, 'Portabilidad / alta nueva'),
  ('Vodafone', 'movil_5mas', 'ilimitada', 53, 26.5, 'Portabilidad / alta nueva'),
  ('Vodafone', 'movil_5mas', '300', 44.2, 22.1, 'Portabilidad / alta nueva'),
  ('Vodafone', 'movil_5mas', '160', 35.35, 17.65, 'Portabilidad / alta nueva'),
  ('Vodafone', 'movil_5mas', '60', 26.5, 13.25, 'Portabilidad / alta nueva')
ON DUPLICATE KEY UPDATE importe = VALUES(importe), importe_alta = VALUES(importe_alta), nota = VALUES(nota);

-- -----------------------------------------------------------------------------
-- Perfiles de tarifas de mercado de telefonia de octubre 2026 (editables).
-- -----------------------------------------------------------------------------
-- Perfiles de tarifas de mercado de octubre 2026 (editables desde /informe).
INSERT INTO cmp_tel_perfiles (nombre, datos) VALUES
  ('Oct 2026 · Residencial · F600 + fijo + 2 ilimitadas', '{"config": "fibra 600 Mb–1 Gb, fijo y 2 líneas móviles ilimitadas", "fechaTarifas": "2026-10-05", "nota": "Precios públicos (sin ofertas BTL). Yoigo: 49 € si la portabilidad no viene de Movistar o Vodafone. Adamo: 6 € menos en zona Smart; confirmar cobertura.", "ops": [{"nombre": "Adamo Caaalma Total", "cuota": 46, "promoPrecio": "", "promoMeses": "", "promoTexto": "Precio estable", "valoracion": "Fibra 1Gb + 2 ilimitadas + fijo; confirmar cobertura", "residencial": true, "ventajas": ["**Fibra 1Gb con WiFi 6.**", "**2ª línea ilimitada por 1 €** y hasta 3 más a 5 €.", "**Precio estable** sin subidas por promoción.", "**Fijo ilimitado** por 6 € más."], "comision": "", "marca": "Adamo", "fibra": 1000, "lineas": "∞, ∞", "lineasGratis": ""}, {"nombre": "Jazztel 2L 120GB", "cuota": 44.95, "promoPrecio": "", "promoMeses": "", "promoTexto": "Precio fijo", "valoracion": "120GB compartidos, no ilimitada; permanencia 12 meses", "residencial": true, "ventajas": [], "comision": "", "marca": "Jazztel", "fibra": 600, "lineas": "120, 120", "lineasGratis": ""}, {"nombre": "MásMóvil 2L 200GB", "cuota": 46.9, "promoPrecio": "", "promoMeses": "", "promoTexto": "Precio fijo", "valoracion": "200GB compartidos, fijo ilimitado", "residencial": true, "ventajas": [], "comision": "", "marca": "MásMóvil", "fibra": 500, "lineas": "200, 200", "lineasGratis": ""}, {"nombre": "Lowi 300GB + 300GB", "cuota": 49, "promoPrecio": "", "promoMeses": "", "promoTexto": "Precio final", "valoracion": "Residencial; sin fijo; red Vodafone", "residencial": true, "ventajas": [], "comision": "", "marca": "Lowi", "fibra": 600, "lineas": "300, 300", "lineasGratis": ""}, {"nombre": "Yoigo F600 + GB∞ + Dúo", "cuota": 61, "promoPrecio": "", "promoMeses": "", "promoTexto": "49 € portas*", "valoracion": "2 líneas compartiendo GB ilimitados", "residencial": true, "ventajas": [], "comision": "", "marca": "Yoigo", "fibra": 600, "lineas": "∞, ∞", "lineasGratis": 1}, {"nombre": "Vodafone F600 + 2 ilimitadas + TV", "cuota": 74, "promoPrecio": 59, "promoMeses": 3, "promoTexto": "59 € hasta dic.", "valoracion": "Vodafone TV + 3 OTT gratis hasta 31/12", "residencial": true, "ventajas": ["**2 líneas ilimitadas** con Vodafone TV y 3 plataformas gratis hasta el 31/12.", "**Líneas adicionales por 6 €** con las mismas condiciones.", "**Router WiFi 6** y deco incluidos.", "**Sin permanencia en TV.**"], "comision": "", "marca": "Vodafone", "fibra": 600, "lineas": "∞, ∞", "lineasGratis": ""}]}'),
  ('Oct 2026 · Residencial · F600 + 2 líneas hasta 50GB', '{"config": "fibra 600 Mb, fijo y 2 líneas móviles de hasta 50GB", "fechaTarifas": "2026-10-05", "nota": "Precios públicos (sin ofertas BTL). Yoigo: 41 € si la portabilidad no viene de Movistar o Vodafone.", "ops": [{"nombre": "Lowi 50GB + 50GB", "cuota": 35, "promoPrecio": "", "promoMeses": "", "promoTexto": "Precio final", "valoracion": "Residencial; sin fijo; red Vodafone", "residencial": true, "ventajas": [], "comision": "", "marca": "Lowi", "fibra": 600, "lineas": "50, 50", "lineasGratis": ""}, {"nombre": "Adamo F600 + 2x60GB", "cuota": 42, "promoPrecio": "", "promoMeses": "", "promoTexto": "Precio estable", "valoracion": "Incluye fijo (+6 €); confirmar cobertura", "residencial": true, "ventajas": [], "comision": "", "marca": "Adamo", "fibra": 600, "lineas": "60, 60", "lineasGratis": ""}, {"nombre": "MásMóvil 2L 100GB", "cuota": 39.9, "promoPrecio": "", "promoMeses": "", "promoTexto": "Precio fijo", "valoracion": "100GB compartidos", "residencial": true, "ventajas": [], "comision": "", "marca": "MásMóvil", "fibra": 500, "lineas": "100, 100", "lineasGratis": ""}, {"nombre": "Jazztel 2L 120GB", "cuota": 44.95, "promoPrecio": "", "promoMeses": "", "promoTexto": "Precio fijo", "valoracion": "120GB compartidos", "residencial": true, "ventajas": [], "comision": "", "marca": "Jazztel", "fibra": 600, "lineas": "120, 120", "lineasGratis": ""}, {"nombre": "Yoigo F600 + 80GB + Dúo", "cuota": 53, "promoPrecio": "", "promoMeses": "", "promoTexto": "41 € portas*", "valoracion": "80GB compartidos", "residencial": true, "ventajas": [], "comision": "", "marca": "Yoigo", "fibra": 600, "lineas": "80, 80", "lineasGratis": 1}, {"nombre": "Vodafone F600 + 2x60GB + TV", "cuota": 52, "promoPrecio": 49, "promoMeses": 3, "promoTexto": "49 € hasta dic.", "valoracion": "Vodafone TV + 1 OTT gratis hasta 31/12", "residencial": true, "ventajas": ["**2 líneas ilimitadas** con Vodafone TV y 3 plataformas gratis hasta el 31/12.", "**Líneas adicionales por 6 €** con las mismas condiciones.", "**Router WiFi 6** y deco incluidos.", "**Sin permanencia en TV.**"], "comision": "", "marca": "Vodafone", "fibra": 600, "lineas": "60, 60", "lineasGratis": ""}]}'),
  ('Oct 2026 · Residencial · familia 4 líneas', '{"config": "fibra 600 Mb–1 Gb, fijo y 4 líneas móviles (2 ilimitadas)", "fechaTarifas": "2026-10-05", "nota": "Precios públicos (sin ofertas BTL). Adamo: 4 líneas ilimitadas; 6 € menos en zona Smart.", "ops": [{"nombre": "Adamo Caaalma Total 4 ilimitadas", "cuota": 56, "promoPrecio": "", "promoMeses": "", "promoTexto": "Precio estable", "valoracion": "Fibra 1Gb + 4 ilimitadas + fijo; confirmar cobertura", "residencial": true, "ventajas": ["**Fibra 1Gb con WiFi 6.**", "**2ª línea ilimitada por 1 €** y hasta 3 más a 5 €.", "**Precio estable** sin subidas por promoción.", "**Fijo ilimitado** por 6 € más."], "comision": "", "marca": "Adamo", "fibra": 1000, "lineas": "∞, ∞, ∞, ∞", "lineasGratis": ""}, {"nombre": "MásMóvil 2L 200GB + 2x25GB", "cuota": 56.9, "promoPrecio": "", "promoMeses": "", "promoTexto": "Precio fijo", "valoracion": "200GB compartidos + 2 líneas de 25GB", "residencial": true, "ventajas": [], "comision": "", "marca": "MásMóvil", "fibra": 500, "lineas": "200, 200, 25, 25", "lineasGratis": ""}, {"nombre": "Jazztel 2L 120GB + 2x20GB", "cuota": 56.95, "promoPrecio": "", "promoMeses": "", "promoTexto": "Precio fijo", "valoracion": "120GB compartidos + 2 de 20GB", "residencial": true, "ventajas": [], "comision": "", "marca": "Jazztel", "fibra": 600, "lineas": "120, 120, 20, 20", "lineasGratis": ""}, {"nombre": "Lowi 2x300GB + 2x50GB", "cuota": 59, "promoPrecio": "", "promoMeses": "", "promoTexto": "Precio final", "valoracion": "Sin fijo", "residencial": true, "ventajas": [], "comision": "", "marca": "Lowi", "fibra": 600, "lineas": "300, 300, 50, 50", "lineasGratis": ""}, {"nombre": "Yoigo GB∞ + Dúo + 2 Dúo AD", "cuota": 79, "promoPrecio": "", "promoMeses": "", "promoTexto": "67 € portas*", "valoracion": "4 líneas compartiendo GB ilimitados", "residencial": true, "ventajas": [], "comision": "", "marca": "Yoigo", "fibra": 600, "lineas": "∞, ∞, ∞, ∞", "lineasGratis": 1}, {"nombre": "Vodafone 2 ilimitadas + 2 adicionales", "cuota": 86, "promoPrecio": 71, "promoMeses": 3, "promoTexto": "71 € hasta dic.", "valoracion": "4 ilimitadas + TV y 3 OTT hasta 31/12", "residencial": true, "ventajas": ["**2 líneas ilimitadas** con Vodafone TV y 3 plataformas gratis hasta el 31/12.", "**Líneas adicionales por 6 €** con las mismas condiciones.", "**Router WiFi 6** y deco incluidos.", "**Sin permanencia en TV.**"], "comision": "", "marca": "Vodafone", "fibra": 600, "lineas": "∞, ∞, ∞, ∞", "lineasGratis": ""}]}'),
  ('Oct 2026 · Autónomo · F1Gb + 2 ilimitadas (IVA incl.)', '{"config": "fibra 1 Gb, fijo y 2 líneas móviles ilimitadas, empresa", "fechaTarifas": "2026-10-05", "nota": "Precios de empresa convertidos a IVA incluido. Orange exige venta a plazos de un terminal; sin ella, 81,28 €.", "ops": [{"nombre": "Vodafone Mi Negocio Pro 2", "cuota": 61.58, "promoPrecio": "", "promoMeses": "", "promoTexto": "Precio estable", "valoracion": "Soporte 24x7, MultiSIM, 200 min internacionales", "residencial": false, "ventajas": ["**2 líneas ilimitadas 5G** y MultiSIM en cada línea.", "**Soporte informático 24x7** y Secure Net fijo y móvil.", "**200 minutos internacionales** por línea.", "**Línea ilimitada adicional por 9,09 €** (sin IVA)."], "comision": "", "marca": "Vodafone", "fibra": 1000, "lineas": "∞, ∞", "lineasGratis": ""}, {"nombre": "Yoigo Digital Pro F1Gb + GB∞", "cuota": 64.13, "promoPrecio": 49.61, "promoMeses": 3, "promoTexto": "49,61 € 3 meses", "valoracion": "Ciberseguridad, web, M365, Prime; Dúo incluido", "residencial": false, "ventajas": [], "comision": "", "marca": "Yoigo", "fibra": 1000, "lineas": "∞, ∞", "lineasGratis": 1}, {"nombre": "Yoigo Digital Pro F600 + GB∞", "cuota": 49.61, "promoPrecio": "", "promoMeses": "", "promoTexto": "Precio 24 meses", "valoracion": "24 meses de precio; ciberseguridad, web, M365", "residencial": false, "ventajas": [], "comision": "", "marca": "Yoigo", "fibra": 600, "lineas": "∞, ∞", "lineasGratis": 1}, {"nombre": "MásMóvil Digital Pro F1Gb 225GB", "cuota": 65.34, "promoPrecio": 55.66, "promoMeses": 3, "promoTexto": "55,66 € 3 meses", "valoracion": "200+25GB; ciberseguridad y web", "residencial": false, "ventajas": [], "comision": "", "marca": "MásMóvil", "fibra": 1000, "lineas": "200, 25", "lineasGratis": ""}, {"nombre": "Orange Negocio Extra 1 + 1 línea", "cuota": 73.35, "promoPrecio": "", "promoMeses": "", "promoTexto": "Con VAP 24 meses", "valoracion": "Con venta a plazos; beneficios Negocio", "residencial": false, "ventajas": [], "comision": "", "marca": "Orange", "fibra": 1000, "lineas": "∞, ∞", "lineasGratis": ""}]}'),
  ('Oct 2026 · Pyme · 3 líneas ilimitadas (IVA incl.)', '{"config": "fibra 1 Gb, fijo y 3 líneas móviles ilimitadas, empresa", "fechaTarifas": "2026-10-05", "nota": "Precios de empresa convertidos a IVA incluido. Orange exige venta a plazos de un terminal; sin ella, 103,46 €.", "ops": [{"nombre": "Vodafone Mi Negocio Pro 2 + 1 ilimitada", "cuota": 66.53, "promoPrecio": "", "promoMeses": "", "promoTexto": "Precio estable", "valoracion": "Soporte 24x7, MultiSIM; −5 € desde 3 líneas", "residencial": false, "ventajas": ["**2 líneas ilimitadas 5G** y MultiSIM en cada línea.", "**Soporte informático 24x7** y Secure Net fijo y móvil.", "**200 minutos internacionales** por línea.", "**Línea ilimitada adicional por 9,09 €** (sin IVA)."], "comision": "", "marca": "Vodafone", "fibra": 1000, "lineas": "∞, ∞, ∞", "lineasGratis": ""}, {"nombre": "Yoigo Digital Pro F1Gb + Dúo + Dúo AD", "cuota": 73.13, "promoPrecio": 58.61, "promoMeses": 3, "promoTexto": "3 meses", "valoracion": "3 líneas compartiendo GB ilimitados", "residencial": false, "ventajas": [], "comision": "", "marca": "Yoigo", "fibra": 1000, "lineas": "∞, ∞, ∞", "lineasGratis": 1}, {"nombre": "MásMóvil Digital Pro F1Gb + 100GB", "cuota": 77.32, "promoPrecio": 67.64, "promoMeses": 3, "promoTexto": "3 meses", "valoracion": "200+25+100GB", "residencial": false, "ventajas": [], "comision": "", "marca": "MásMóvil", "fibra": 1000, "lineas": "200, 25, 100", "lineasGratis": ""}, {"nombre": "Orange Negocio Extra 3", "cuota": 80.47, "promoPrecio": "", "promoMeses": "", "promoTexto": "Con VAP 24 meses", "valoracion": "Con venta a plazos; 2 beneficios elegibles", "residencial": false, "ventajas": [], "comision": "", "marca": "Orange", "fibra": 1000, "lineas": "∞, ∞, ∞", "lineasGratis": ""}]}'),
  ('Oct 2026 · Pyme · 5 líneas ilimitadas (IVA incl.)', '{"config": "fibra 1 Gb, fijo y 5 líneas móviles ilimitadas, empresa", "fechaTarifas": "2026-10-05", "nota": "Precios de empresa convertidos a IVA incluido. Vodafone: confirmar si el −5 € es por contrato o por línea.", "ops": [{"nombre": "Vodafone Mi Negocio Pro 2 + 3 ilimitadas", "cuota": 88.52, "promoPrecio": "", "promoMeses": "", "promoTexto": "Precio estable", "valoracion": "Soporte 24x7, MultiSIM", "residencial": false, "ventajas": ["**2 líneas ilimitadas 5G** y MultiSIM en cada línea.", "**Soporte informático 24x7** y Secure Net fijo y móvil.", "**200 minutos internacionales** por línea.", "**Línea ilimitada adicional por 9,09 €** (sin IVA)."], "comision": "", "marca": "Vodafone", "fibra": 1000, "lineas": "∞, ∞, ∞, ∞, ∞", "lineasGratis": ""}, {"nombre": "Orange Negocio Extra 3 + 2 líneas", "cuota": 100.36, "promoPrecio": "", "promoMeses": "", "promoTexto": "Con VAP 24 meses", "valoracion": "Con venta a plazos; líneas a 8,22 € 24 meses", "residencial": false, "ventajas": [], "comision": "", "marca": "Orange", "fibra": 1000, "lineas": "∞, ∞, ∞, ∞, ∞", "lineasGratis": ""}, {"nombre": "Orange Negocio Extra 5", "cuota": 108.42, "promoPrecio": "", "promoMeses": "", "promoTexto": "Con VAP 24 meses", "valoracion": "Con venta a plazos; 3 beneficios elegibles", "residencial": false, "ventajas": [], "comision": "", "marca": "Orange", "fibra": 1000, "lineas": "∞, ∞, ∞, ∞, ∞", "lineasGratis": ""}, {"nombre": "Yoigo Digital Pro F1Gb + 3 GB∞ AD", "cuota": 122.21, "promoPrecio": 107.69, "promoMeses": 3, "promoTexto": "3 meses", "valoracion": "Líneas independientes", "residencial": false, "ventajas": [], "comision": "", "marca": "Yoigo", "fibra": 1000, "lineas": "∞, ∞, ∞, ∞, ∞", "lineasGratis": 1}]}')
ON DUPLICATE KEY UPDATE datos = VALUES(datos);

-- -----------------------------------------------------------------------------
-- Catalogo de energia de ejemplo (cada tarifa solo si no existe ya).
-- Propias: NAGINI y NET (rellenad la comision desde Catalogo).
-- Mercado: tarifas publicadas a mediados de octubre de 2026, sin impuestos.
-- Revisadlas cada mes antes de enviar informes.
-- -----------------------------------------------------------------------------
INSERT INTO cmp_ene_tarifas (tipo, peaje, rol, comercializadora, nombre, modalidad, cliente, pp1, pp2, pe1, pe2, pe3, valoracion, ventajas)
SELECT 'luz', '2.0TD', 'propia', 'NAGINI', 'NAGINI Fijo Prime Plus 2.0TD', 'fijo', 'todos', 0.171793, 0.097878, 0.129, 0.129, 0.129, 'Precio fijo; sin cargo de SSAA aparte', '**Precio fijo.** El kWh no cambia con el mercado mayorista.\n**Sin cargos de red aparte.** Desaparece el cargo de SSAA de su factura.\n**Mismo precio todo el día** en punta, llano y valle.\n**Gestión integral.** Cambio sin cortes de suministro.' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM cmp_ene_tarifas WHERE comercializadora = 'NAGINI' AND nombre = 'NAGINI Fijo Prime Plus 2.0TD');
INSERT INTO cmp_ene_tarifas (tipo, peaje, rol, comercializadora, nombre, modalidad, cliente, pp1, pp2, pe1, pe2, pe3, valoracion, ventajas)
SELECT 'luz', '2.0TD', 'propia', 'NET', 'NET FIJO BOE 2.0TD', 'fijo', 'todos', 0.075903, 0.001987, 0.248201, 0.17206, 0.142966, 'Precio fijo; potencia a precio BOE', '**Potencia a precio BOE.** Paga solo peajes y cargos regulados, sin margen.\n**Precio fijo.** El kWh no cambia con el mercado mayorista.\n**Ideal con mucha potencia** y poco consumo.\n**Gestión integral.** Cambio sin cortes de suministro.' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM cmp_ene_tarifas WHERE comercializadora = 'NET' AND nombre = 'NET FIJO BOE 2.0TD');
INSERT INTO cmp_ene_tarifas (tipo, peaje, rol, comercializadora, nombre, modalidad, cliente, pp1, pp2, pe1, pe2, pe3, valoracion, ventajas)
SELECT 'luz', '2.0TD', 'mercado', 'Iberdrola', 'Plan Estable', 'fijo', 'todos', 0.1164, 0.1041, 0.2049, 0.2049, 0.2049, 'Precio fijo en todas las horas', NULL FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM cmp_ene_tarifas WHERE comercializadora = 'Iberdrola' AND nombre = 'Plan Estable');
INSERT INTO cmp_ene_tarifas (tipo, peaje, rol, comercializadora, nombre, modalidad, cliente, pp1, pp2, pe1, pe2, pe3, valoracion, ventajas)
SELECT 'luz', '2.0TD', 'mercado', 'Endesa', 'Luz 24h 3 años', 'fijo', 'todos', 0.0937, 0.0937, 0.1754, 0.1754, 0.1754, 'Precio fijo 3 años', NULL FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM cmp_ene_tarifas WHERE comercializadora = 'Endesa' AND nombre = 'Luz 24h 3 años');
INSERT INTO cmp_ene_tarifas (tipo, peaje, rol, comercializadora, nombre, modalidad, cliente, pp1, pp2, pe1, pe2, pe3, valoracion, ventajas)
SELECT 'luz', '2.0TD', 'mercado', 'Naturgy', 'Por Uso Luz', 'fijo', 'todos', 0.123, 0.0616, 0.123, 0.123, 0.123, 'Precio fijo 12 meses', NULL FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM cmp_ene_tarifas WHERE comercializadora = 'Naturgy' AND nombre = 'Por Uso Luz');
INSERT INTO cmp_ene_tarifas (tipo, peaje, rol, comercializadora, nombre, modalidad, cliente, pp1, pp2, pe1, pe2, pe3, valoracion, ventajas)
SELECT 'luz', '2.0TD', 'mercado', 'Repsol', 'Sin Horarios', 'fijo', 'todos', 0.0819, 0.0819, 0.1399, 0.1399, 0.1399, 'Precio único todo el día', NULL FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM cmp_ene_tarifas WHERE comercializadora = 'Repsol' AND nombre = 'Sin Horarios');
INSERT INTO cmp_ene_tarifas (tipo, peaje, rol, comercializadora, nombre, modalidad, cliente, pp1, pp2, pe1, pe2, pe3, valoracion, ventajas)
SELECT 'luz', '2.0TD', 'mercado', 'TotalEnergies', 'A Tu Aire Luz Siempre', 'fijo', 'todos', 0.0863, 0.0863, 0.0999, 0.0999, 0.0999, 'Precio único todo el día', NULL FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM cmp_ene_tarifas WHERE comercializadora = 'TotalEnergies' AND nombre = 'A Tu Aire Luz Siempre');
INSERT INTO cmp_ene_tarifas (tipo, peaje, rol, comercializadora, nombre, modalidad, cliente, pp1, pp2, pe1, pe2, pe3, valoracion, ventajas)
SELECT 'luz', '2.0TD', 'mercado', 'Octopus Energy', 'Octopus Relax', 'fijo', 'todos', 0.1184, 0.1184, 0.1444, 0.1444, 0.1444, 'Precio único todo el día', NULL FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM cmp_ene_tarifas WHERE comercializadora = 'Octopus Energy' AND nombre = 'Octopus Relax');
INSERT INTO cmp_ene_tarifas (tipo, peaje, rol, comercializadora, nombre, modalidad, cliente, pp1, pp2, pe1, pe2, pe3, valoracion, ventajas)
SELECT 'luz', '2.0TD', 'mercado', 'Holaluz', 'Tarifa Clásica', 'fijo', 'todos', 0.12, 0.12, 0.139, 0.139, 0.139, 'Precio estándar sin contratación online', NULL FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM cmp_ene_tarifas WHERE comercializadora = 'Holaluz' AND nombre = 'Tarifa Clásica');
INSERT INTO cmp_ene_tarifas (tipo, peaje, rol, comercializadora, nombre, modalidad, cliente, pp1, pp2, pe1, pe2, pe3, valoracion, ventajas)
SELECT 'luz', '2.0TD', 'mercado', 'Factor Energía', 'Fija Precio Único', 'fijo', 'todos', 0.1041, 0.1041, 0.14, 0.14, 0.14, 'Precio único todo el día', NULL FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM cmp_ene_tarifas WHERE comercializadora = 'Factor Energía' AND nombre = 'Fija Precio Único');
INSERT INTO cmp_ene_tarifas (tipo, peaje, rol, comercializadora, nombre, modalidad, cliente, pp1, pp2, pe1, pe2, pe3, valoracion, ventajas)
SELECT 'luz', '2.0TD', 'mercado', 'Plenitude', 'Fácil Plus Luz', 'fijo', 'todos', 0.1125, 0.1125, 0.12, 0.12, 0.12, 'Precio único todo el día', NULL FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM cmp_ene_tarifas WHERE comercializadora = 'Plenitude' AND nombre = 'Fácil Plus Luz');
