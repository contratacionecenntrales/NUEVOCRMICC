-- =============================================================================
-- ICC CRM · Migracion: Motor de prospeccion v2
-- Se puede importar varias veces. No borra datos.
--
--   motor_campanas.perfil     identidad del agente de Outreach (ICC, Labs24k...)
--   motor_mensajes.buzon      buzon de envio usado (rotacion y calentamiento)
--   motor_leads.resumen       detalle real de su web para personalizar (cualificacion IA)
--   motor_leads.puntuacion    encaje del lead (0-100) segun la cualificacion IA
--   motor_leads.rebotado      el correo reboto: no se vuelve a usar
-- =============================================================================

SET NAMES utf8mb4;

SET @s = (SELECT IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'motor_campanas' AND column_name = 'perfil') = 0,
  'ALTER TABLE motor_campanas ADD COLUMN perfil VARCHAR(30) NOT NULL DEFAULT ''icc'' AFTER sector', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'motor_mensajes' AND column_name = 'buzon') = 0,
  'ALTER TABLE motor_mensajes ADD COLUMN buzon VARCHAR(190) NULL AFTER message_id, ADD KEY idx_motor_msg_buzon (buzon, enviado_en)', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'motor_leads' AND column_name = 'resumen') = 0,
  'ALTER TABLE motor_leads ADD COLUMN resumen VARCHAR(500) NOT NULL DEFAULT '''' AFTER extracto, ADD COLUMN puntuacion TINYINT UNSIGNED NULL AFTER resumen, ADD COLUMN rebotado TINYINT(1) NOT NULL DEFAULT 0 AFTER puntuacion', 'DO 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
