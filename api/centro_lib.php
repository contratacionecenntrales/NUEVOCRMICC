<?php
/**
 * ICC CRM · Centro de control de la IA: interruptor general, un interruptor por
 * modulo y por agente, y uso de la IA.
 *
 * Pausa general (ajuste ia_pausa_general): el cron deja de ejecutar todo lo que
 * la IA hace sola (Motor, buzones, automatizaciones, mantenimiento, agentes,
 * aprendizaje, Autocorrector y entrevistas), el agente de voz no llama y los
 * mensajes de WhatsApp que lleguen se guardan y se contestan al reanudar. Lo que
 * una persona pide a mano (Jarvis, botones) sigue funcionando. Copias y limpieza
 * RGPD siguen siempre.
 */

/** clave => [nombre, icono, que hace, ajuste, invertido, valor por defecto, bloque del cron, enlace] */
const CI_MODULOS = [
  'agentes' => ['Zona de agentes', '🧠', 'Los agentes trabajan por turnos sobre el CRM (ventas, cierre, backoffice, coordinación, marketing…).', 'equipo_activo', false, '0', 'agentes', '#/zona-agentes'],
  'motor' => ['Motor de prospección', '🛰️', 'Busca empresas, redacta y envía los correos de las campañas y lee las respuestas.', 'motor_pausado', true, '0', 'motor', '#/motor'],
  'correo' => ['Agentes de correo', '📬', 'Leen y contestan los buzones corporativos (info@, admin@, tramitación…).', 'correo_activo', false, '1', 'buzones', '#/agente-correo'],
  'flujos' => ['Automatizaciones y embudos', '⚡', 'Correos, WhatsApp, llamadas y tareas de los embudos de la oficina.', 'flujos_activo', false, '1', 'flujos', '#/automatizaciones'],
  'saneo' => ['Mantenimiento del pipeline', '🧹', 'Pone próximo paso, valor y gestor a las oportunidades cada hora.', 'saneo_auto', false, '1', 'saneo', '#/pipeline'],
  'autofix' => ['Autocorrector', '🛠️', 'Arregla cada 10 minutos lo que requiere acción y avisa de lo demás.', 'autofix_activo', false, '1', 'autofix', '#/zona-agentes'],
  'aprendizaje' => ['Aprendizaje diario', '📈', 'Aprende de los resultados: ángulos ganadores, zonas que responden, estilo de los correos.', 'aprendizaje_auto', false, '1', 'aprendizaje', '#/puesta-en-marcha'],
  'control' => ['Control 360 · Ahorro siempre', '🛡️', 'Lee las facturas de los clientes, compara cada servicio con todo el mercado, revisa cada mes y pide las facturas que faltan.', 'control_activo', false, '1', 'control', '#/control'],
  'rellamadas' => ['Rellamadas de backoffice', '📞', 'Pone cada mañana las rellamadas de presupuestos en la agenda de backoffice.', 'rellamadas_activo', false, '1', null, '#/rellamadas'],
  'voz' => ['Agente de voz', '🤖', 'Llama con IA a los leads nuevos y a los presupuestos parados (Vapi).', 'voz_activo', false, '0', null, '#/zona-agentes'],
  'entrevistas' => ['Zona de entrevistas', '🧑‍💼', 'Los agentes de WhatsApp entrevistan a los candidatos.', 'rrhh_activo', false, '1', 'entrevistas', '#/entrevistas'],
  'jarvis' => ['Jarvis', '🎙️', 'Asistente de voz y texto para todo el equipo (solo cuando alguien le habla).', 'jarvis_activo', false, '1', null, '#/dashboard'],
];

/** Bloques del cron que para la pausa general. */
const CI_BLOQUES_PAUSA = ['motor', 'motor_analisis', 'buzones', 'saneo', 'flujos', 'agentes', 'aprendizaje', 'autofix', 'entrevistas', 'control'];

function ci_pausa(): bool { return (string)icc_ajuste('ia_pausa_general', '0') === '1'; }

function ci_modulo_activo(string $clave): bool {
  $m = CI_MODULOS[$clave];
  $v = (string)icc_ajuste($m[3], $m[5]) === '1';
  return $m[4] ? !$v : $v;
}

function ci_modulo_poner(string $clave, bool $activo, ?int $uid): void {
  $m = CI_MODULOS[$clave];
  icc_ajuste_guardar($m[3], ($m[4] ? !$activo : $activo) ? '1' : '0', false, $uid);
}

/** Agentes de la Zona de agentes apagados uno a uno. */
function ci_agentes_apagados(): array {
  $l = json_decode((string)icc_ajuste('equipo_apagados', ''), true);
  return is_array($l) ? array_values(array_filter($l, 'is_string')) : [];
}
