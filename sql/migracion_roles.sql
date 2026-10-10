-- =============================================================================
-- ICC CRM · Migracion: nuevo rol "jefe_de_equipo" + carpeta "recursos_generales"
-- en Ficheros. Segura de ejecutar sobre una base de datos que ya tenga
-- schema.sql importado (si vas a instalar desde cero, con importar el
-- schema.sql actualizado basta, no hace falta ademas esta migracion).
-- =============================================================================

ALTER TABLE usuarios
  MODIFY COLUMN rol ENUM('comercial','backoffice','jefe_de_equipo','admin') NOT NULL DEFAULT 'comercial';

ALTER TABLE ficheros
  MODIFY COLUMN carpeta ENUM(
    'comisiones',
    'calendario_pagos',
    'comercializadoras',
    'comparadores',
    'documentacion_penalizaciones_renovaciones',
    'eficiencia_energetica',
    'informe_mensual_mercado',
    'manuales_crm',
    'tabla_precios_excedentes_bateria',
    'temporadas_periodos',
    'recursos_generales'
  ) NOT NULL;
