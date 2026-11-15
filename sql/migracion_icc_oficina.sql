-- ICC CRM v91 · Oficina virtual de ICC Consultoria
-- La identidad Labs24k del Motor pasa a ICC Consultoria (100 % servicios, 100 % companias).
-- Idempotente: se puede ejecutar varias veces. No hay tablas ni columnas nuevas.
UPDATE motor_campanas SET perfil = 'icc' WHERE perfil = 'labs24k';
UPDATE motor_campanas SET angulo = 'auditoria_integral' WHERE angulo IN ('ia_transparencia', 'ia_alfabetizacion', 'ia_fundae', 'ia_captacion', 'ia_pregunta');
DELETE FROM ajustes WHERE clave = 'motor_perfil_labs24k';
UPDATE ajustes SET valor = 'icc' WHERE clave = 'barrido_perfil' AND valor = 'labs24k';
