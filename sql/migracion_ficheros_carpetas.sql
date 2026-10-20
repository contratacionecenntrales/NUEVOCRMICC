-- Migracion: Ficheros pasa de un listado fijo de 10 carpetas a un
-- explorador de carpetas anidadas de verdad (estilo Google Drive), y se
-- anade la automatizacion de carpetas privadas de facturacion por usuario.
--
-- Ejecuta este script UNA VEZ en phpMyAdmin sobre tu base de datos actual.
-- No borra ningun archivo ya subido: solo reorganiza a que carpeta
-- (ahora identificada por un id numerico, no por texto fijo) pertenece
-- cada fichero. Los archivos fisicos no se mueven ni se tocan.

-- 1) Tabla de carpetas (arbol recursivo: cada carpeta puede tener una
--    carpeta padre, o ser raiz si parent_id es NULL).
CREATE TABLE IF NOT EXISTS ficheros_carpetas (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(150) NOT NULL,
  parent_id INT UNSIGNED NULL,
  propietario_id INT UNSIGNED NULL,
  creado_por INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_carpeta_parent FOREIGN KEY (parent_id) REFERENCES ficheros_carpetas(id) ON DELETE CASCADE,
  CONSTRAINT fk_carpeta_propietario FOREIGN KEY (propietario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_carpeta_creador FOREIGN KEY (creado_por) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_ficheros_carpetas_parent ON ficheros_carpetas(parent_id);
CREATE INDEX idx_ficheros_carpetas_propietario ON ficheros_carpetas(propietario_id);

-- 2) Las 10 carpetas raiz que ya existian (mismos nombres visibles de
--    siempre), como carpetas compartidas (propietario_id NULL = visibles
--    para todo el mundo, solo backoffice/jefe de equipo/admin suben).
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
  ('Recursos generales', NULL, NULL, NULL);

-- 3) Carpeta raiz "Facturacion de Comerciales": contenedor compartido
--    (todo el mundo puede entrar en ella) cuyas subcarpetas son privadas
--    una por comercial, para nominas/comisiones/facturacion personal.
INSERT INTO ficheros_carpetas (nombre, parent_id, propietario_id, creado_por) VALUES
  ('Facturacion de Comerciales', NULL, NULL, NULL);

-- 4) Anade la columna nueva a ficheros (sustituye al ENUM fijo "carpeta").
ALTER TABLE ficheros ADD COLUMN carpeta_id INT UNSIGNED NULL AFTER carpeta;

-- 5) Traslada cada fichero existente a su carpeta equivalente (por nombre).
UPDATE ficheros f JOIN ficheros_carpetas c ON c.nombre = 'Calendario de pagos' AND c.parent_id IS NULL
  SET f.carpeta_id = c.id WHERE f.carpeta = 'calendario_pagos';
UPDATE ficheros f JOIN ficheros_carpetas c ON c.nombre = 'Comercializadoras' AND c.parent_id IS NULL
  SET f.carpeta_id = c.id WHERE f.carpeta = 'comercializadoras';
UPDATE ficheros f JOIN ficheros_carpetas c ON c.nombre = 'Comparadores' AND c.parent_id IS NULL
  SET f.carpeta_id = c.id WHERE f.carpeta = 'comparadores';
UPDATE ficheros f JOIN ficheros_carpetas c ON c.nombre = 'Documentacion - Penalizaciones - Renovaciones' AND c.parent_id IS NULL
  SET f.carpeta_id = c.id WHERE f.carpeta = 'documentacion_penalizaciones_renovaciones';
UPDATE ficheros f JOIN ficheros_carpetas c ON c.nombre = 'Eficiencia energetica' AND c.parent_id IS NULL
  SET f.carpeta_id = c.id WHERE f.carpeta = 'eficiencia_energetica';
UPDATE ficheros f JOIN ficheros_carpetas c ON c.nombre = 'Informe mensual mercado energetico espanol' AND c.parent_id IS NULL
  SET f.carpeta_id = c.id WHERE f.carpeta = 'informe_mensual_mercado';
UPDATE ficheros f JOIN ficheros_carpetas c ON c.nombre = 'Dosieres' AND c.parent_id IS NULL
  SET f.carpeta_id = c.id WHERE f.carpeta = 'manuales_crm';
UPDATE ficheros f JOIN ficheros_carpetas c ON c.nombre = 'Tabla precios de excedentes y bateria virtual' AND c.parent_id IS NULL
  SET f.carpeta_id = c.id WHERE f.carpeta = 'tabla_precios_excedentes_bateria';
UPDATE ficheros f JOIN ficheros_carpetas c ON c.nombre = 'Temporadas - Periodos' AND c.parent_id IS NULL
  SET f.carpeta_id = c.id WHERE f.carpeta = 'temporadas_periodos';
UPDATE ficheros f JOIN ficheros_carpetas c ON c.nombre = 'Recursos generales' AND c.parent_id IS NULL
  SET f.carpeta_id = c.id WHERE f.carpeta = 'recursos_generales';

-- 5b) Algunas instalaciones tienen archivos historicos en la categoria
--     "comisiones" (existia en el ENUM de la base de datos aunque la app
--     ya no la ofrecia). Se recuperan en su propia carpeta en vez de
--     perderlos, y cualquier otro valor inesperado se manda a Recursos
--     generales para que la migracion nunca se quede bloqueada.
INSERT INTO ficheros_carpetas (nombre, parent_id, propietario_id, creado_por)
SELECT 'Comisiones (archivo)', NULL, NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM ficheros_carpetas WHERE nombre = 'Comisiones (archivo)' AND parent_id IS NULL);

UPDATE ficheros f JOIN ficheros_carpetas c ON c.nombre = 'Comisiones (archivo)' AND c.parent_id IS NULL
  SET f.carpeta_id = c.id WHERE f.carpeta_id IS NULL AND f.carpeta = 'comisiones';

UPDATE ficheros f JOIN ficheros_carpetas c ON c.nombre = 'Recursos generales' AND c.parent_id IS NULL
  SET f.carpeta_id = c.id WHERE f.carpeta_id IS NULL;

-- 6) Crea ya la carpeta privada de facturacion de cada comercial que ya
--    exista hoy (a los nuevos se les crea sola desde Agentes a partir de
--    ahora). Si algun comercial ya tuviera una (reejecucion del script),
--    no se duplica.
INSERT INTO ficheros_carpetas (nombre, parent_id, propietario_id, creado_por)
SELECT u.nombre, (SELECT id FROM ficheros_carpetas WHERE nombre = 'Facturacion de Comerciales' AND parent_id IS NULL), u.id, NULL
FROM usuarios u
WHERE u.rol = 'comercial'
  AND NOT EXISTS (
    SELECT 1 FROM ficheros_carpetas fc
    WHERE fc.propietario_id = u.id
      AND fc.parent_id = (SELECT id FROM ficheros_carpetas WHERE nombre = 'Facturacion de Comerciales' AND parent_id IS NULL)
  );

-- 7) Con todo ya migrado, hace obligatoria la columna nueva y elimina el
--    viejo ENUM fijo (comprueba antes que no quede ningun NULL: deberia
--    devolver 0 filas; si devuelve alguna, no continues y avisa).
-- SELECT * FROM ficheros WHERE carpeta_id IS NULL;

ALTER TABLE ficheros MODIFY COLUMN carpeta_id INT UNSIGNED NOT NULL;
ALTER TABLE ficheros ADD CONSTRAINT fk_fichero_carpeta FOREIGN KEY (carpeta_id) REFERENCES ficheros_carpetas(id) ON DELETE CASCADE;
DROP INDEX idx_ficheros_carpeta ON ficheros;
ALTER TABLE ficheros DROP COLUMN carpeta;
CREATE INDEX idx_ficheros_carpeta ON ficheros(carpeta_id);
