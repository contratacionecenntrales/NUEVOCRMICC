-- =============================================================================
-- ICC CRM · Migracion: Presupuestos (etapa previa al contrato, por sector)
-- Segura de ejecutar sobre una base de datos que ya tenga schema.sql importado.
--
-- Un cliente puede tener varios presupuestos (uno por sector: energia,
-- telecomunicaciones, alarmas...). Cada presupuesto reutiliza la tabla
-- "documentos" que ya existia (factura/estudio/contrato_firmado), solo que
-- ahora un documento puede quedar ligado ademas a un presupuesto concreto
-- (presupuesto_id), para no mezclar los ficheros de distintos sectores del
-- mismo cliente. Al cerrar un presupuesto se genera automaticamente el
-- Contrato correspondiente en la seccion Contratos que ya existia.
-- =============================================================================

SET NAMES utf8mb4;

ALTER TABLE clientes
  ADD COLUMN tipo_cliente ENUM('residencial','empresa','prime') NOT NULL DEFAULT 'residencial' AFTER sector;

CREATE TABLE IF NOT EXISTS presupuestos (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  cliente_id INT UNSIGNED NOT NULL,
  comercial_id INT UNSIGNED NULL,
  sector ENUM('alarmas','energia','telecomunicaciones','seguros','financiero') NOT NULL,
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

ALTER TABLE documentos
  ADD COLUMN presupuesto_id INT UNSIGNED NULL AFTER cliente_id,
  ADD CONSTRAINT fk_doc_presupuesto FOREIGN KEY (presupuesto_id) REFERENCES presupuestos(id) ON DELETE SET NULL;

CREATE INDEX idx_documentos_presupuesto ON documentos(presupuesto_id);
