-- =============================================================================
-- ICC CRM · Migracion: rol "Super Administrador", por encima de Admin.
--
-- Super Admin puede todo lo que puede Admin, ademas de ser el unico que puede
-- crear/editar el rol de/bloquear/eliminar/entrar como ("Ver como") una
-- cuenta de Admin o de otro Super Admin. Un Admin normal sigue gestionando
-- todo el negocio igual que hasta ahora, pero ya no puede tocar cuentas de
-- Admin o Super Admin (ni crear nuevas).
-- =============================================================================

-- 1) Habilita el rol en la base de datos (si ya existe, no pasa nada raro:
-- MODIFY a la misma definicion es seguro de repetir).
ALTER TABLE usuarios
  MODIFY rol ENUM('comercial','backoffice','jefe_de_equipo','admin','super_admin')
  NOT NULL DEFAULT 'comercial';

-- 2) Sube al admin actual a Super Admin. Solo actua si hay EXACTAMENTE un
-- admin hoy, para no tocar nada por error si la situacion no es la esperada
-- (por ejemplo si ya se habia creado mas de un admin).
SET @total_admins := (SELECT COUNT(*) FROM usuarios WHERE rol = 'admin');
UPDATE usuarios SET rol = 'super_admin' WHERE rol = 'admin' AND @total_admins = 1;

-- 3) Sube a Maria Alvarez a Admin.
UPDATE usuarios SET rol = 'admin'
WHERE email = 'maria.alvarez@integralconnectionconsulting.es';

-- Comprobacion final: deberias ver a Juan como super_admin y a Maria como admin.
SELECT id, nombre, email, rol FROM usuarios WHERE rol IN ('admin', 'super_admin') ORDER BY rol DESC;
