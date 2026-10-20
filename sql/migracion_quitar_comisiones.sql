-- ICC CRM · Quita la seccion "Comisiones" (tabla de compañías por sector con
-- su comision por tramo/potencia). Es irreversible: borra la tabla entera y
-- todo lo que tuviera guardado. Los PDF adjuntos NO se borran con este SQL
-- (viven en storage/comisiones/, fuera de la base de datos) — borralos a
-- mano desde el gestor de archivos de Hostalia despues de aplicar esto, o
-- simplemente dejalos ahi sin usar.
--
-- Seguro de ejecutar mas de una vez: si la tabla ya no existe, no hace nada.

DROP TABLE IF EXISTS comisiones;
