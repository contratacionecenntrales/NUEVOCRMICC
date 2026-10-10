-- ICC CRM · Ajuste puntual de roles: sube a Juan a super_admin y confirma a
-- Maria Alvarez como admin, por email (sin depender de cuantos admins haya
-- hoy). Usa esto si tras importar migracion_super_admin.sql Juan seguia
-- apareciendo como "Administrador" en vez de "Super Administrador" -- lo mas
-- probable es que ya hubiera 2 cuentas con rol admin en ese momento (p.ej.
-- si Maria ya se habia subido a Admin a mano desde Agentes antes de
-- importar la migracion), y por eso el guardado de seguridad de aquel
-- script (solo actuaba si habia EXACTAMENTE un admin) no hizo nada.
--
-- Seguro de repetir: si ya estan bien, estos UPDATE simplemente no cambian
-- nada.

UPDATE usuarios SET rol = 'super_admin'
WHERE email = 'juan@integralconnectionconsulting.es';

UPDATE usuarios SET rol = 'admin'
WHERE email = 'maria.alvarez@integralconnectionconsulting.es';

-- Comprobacion final: Juan deberia salir como super_admin, Maria como admin.
SELECT id, nombre, email, rol
FROM usuarios
WHERE email IN ('juan@integralconnectionconsulting.es', 'maria.alvarez@integralconnectionconsulting.es');
