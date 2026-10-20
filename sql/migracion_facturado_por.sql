-- =============================================================================
-- ICC CRM · Migracion: "Facturado por" pasa de EVE/AETRON (prohibidos) a
-- los nombres reales: ICC / Elite Energy / Evolvix Global.
-- Segura de re-ejecutar: si ya esta migrada, el primer ALTER y los UPDATE
-- no tocan nada, y el ultimo ALTER simplemente redefine el mismo ENUM.
--
-- IMPORTANTE: las proformas que ya tuvieras con EVE se pasan a ICC, y las
-- que tuvieras con AETRON se pasan a Elite Energy, como mapeo por
-- defecto. Si alguna proforma concreta debiera ir a Evolvix Global en vez
-- de a esas dos, cambialo a mano despues desde Proformas en el propio CRM
-- (editando esa proforma).
-- =============================================================================

SET NAMES utf8mb4;

-- 1) Amplia el ENUM para que admita a la vez los valores antiguos y los
--    nuevos (MySQL no deja poner un valor que no este ya en la lista).
ALTER TABLE proformas
  MODIFY COLUMN facturado_por ENUM('EVE','AETRON','ICC','ELITE_ENERGY','EVOLVIX_GLOBAL') NOT NULL;

-- 2) Traslada las proformas que ya tuvieran el valor antiguo.
UPDATE proformas SET facturado_por = 'ICC' WHERE facturado_por = 'EVE';
UPDATE proformas SET facturado_por = 'ELITE_ENERGY' WHERE facturado_por = 'AETRON';

-- 3) Ya no queda ninguna proforma con los valores antiguos: recorta el
--    ENUM a solo los 3 nuevos.
ALTER TABLE proformas
  MODIFY COLUMN facturado_por ENUM('ICC','ELITE_ENERGY','EVOLVIX_GLOBAL') NOT NULL;
