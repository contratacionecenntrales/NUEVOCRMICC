-- =============================================================================
-- ICC CRM · Migracion: secciones y orden en Ficheros
-- Importar una sola vez. No borra ni modifica carpetas ni archivos.
--
--   seccion  Formacion / Energia / Telefonia / Alarmas / Seguros / General.
--            Vacio = el CRM la deduce del nombre de la carpeta.
--   orden    posicion que fija Administracion al ordenar las carpetas.
-- =============================================================================

SET NAMES utf8mb4;

ALTER TABLE ficheros_carpetas
  ADD COLUMN seccion VARCHAR(20) NULL AFTER creado_por,
  ADD COLUMN orden INT NOT NULL DEFAULT 0 AFTER seccion;
