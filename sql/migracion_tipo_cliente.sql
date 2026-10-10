-- =============================================================================
-- ICC CRM · Migracion: nuevas categorias de "Tipo de cliente".
-- Antes: Residencial / Empresa / Prime.
-- Ahora: Residencial / Pyme / Comunidad de vecinos / Gran cuenta.
-- Segura de re-ejecutar: si ya esta migrada, el primer ALTER y los UPDATE
-- no tocan nada, y el ultimo ALTER simplemente redefine el mismo ENUM.
-- =============================================================================

SET NAMES utf8mb4;

-- 1) Amplia el ENUM para que admita a la vez los valores antiguos y los
--    nuevos (MySQL no deja poner un valor que no este ya en la lista).
ALTER TABLE clientes
  MODIFY COLUMN tipo_cliente ENUM('residencial','empresa','prime','pyme','comunidad_vecinos','gran_cuenta') NOT NULL DEFAULT 'residencial';

-- 2) Traslada los clientes que ya tuvieran el tipo antiguo al mas parecido
--    del nuevo listado (Empresa -> Pyme, Prime -> Gran cuenta).
UPDATE clientes SET tipo_cliente = 'pyme' WHERE tipo_cliente = 'empresa';
UPDATE clientes SET tipo_cliente = 'gran_cuenta' WHERE tipo_cliente = 'prime';

-- 3) Ya no queda ningun cliente con los valores antiguos: recorta el ENUM
--    a solo los 4 nuevos.
ALTER TABLE clientes
  MODIFY COLUMN tipo_cliente ENUM('residencial','pyme','comunidad_vecinos','gran_cuenta') NOT NULL DEFAULT 'residencial';
