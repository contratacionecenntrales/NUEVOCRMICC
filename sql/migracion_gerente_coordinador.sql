-- =============================================================================
-- ICC CRM · Migracion: roles Gerente y Coordinador
-- Importar una sola vez. No borra datos.
--
-- Gerente y Coordinador tienen exactamente los mismos poderes que
-- Administrador (lo decide el codigo; aqui solo se permiten los valores).
-- Ademas deja a Juan (Super Administrador) como responsable de Maria y,
-- por tanto, coordinador de ella y de todo su equipo.
-- =============================================================================

SET NAMES utf8mb4;

ALTER TABLE usuarios
  MODIFY rol ENUM('comercial','backoffice','jefe_de_equipo','coordinador','gerente','admin','super_admin')
  NOT NULL DEFAULT 'comercial';

-- Juan (info@ o juan@integralconnectionconsulting.es) responsable de Maria.
-- Solo se aplica si Maria es Jefa de equipo; sus comerciales siguen colgando de ella.
UPDATE usuarios m
  JOIN usuarios j ON j.email IN ('info@integralconnectionconsulting.es', 'juan@integralconnectionconsulting.es')
SET m.supervisor_id = j.id
WHERE m.rol = 'jefe_de_equipo'
  AND (m.email = 'maria.alvarez@integralconnectionconsulting.es' OR m.email LIKE 'maria%@integralconnectionconsulting.es');
