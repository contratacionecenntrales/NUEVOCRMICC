<?php
/**
 * ICC CRM · Aprendizaje automatico de los agentes, piloto automatico y
 * puesta en marcha.
 *
 * Los agentes aprenden solos, cada dia, de los resultados reales:
 *  - Que angulo funciona en cada sector (prueba de dos proporciones) -> lo
 *    fijan como estandar y lo usan las campanas siempre activas.
 *  - Que sectores y que concejos convierten mas -> el barrido los prioriza.
 *  - Lo que direccion rechaza -> aviso en el cerebro para no repetirlo.
 *  - Los correos que una persona corrige antes de enviar -> ejemplos de estilo
 *    que el Motor y cada agente de correo imitan.
 *  - Un agente con puntuacion baja -> su jefe propone instrucciones nuevas
 *    (las aprueba direccion).
 * Todo queda en el cerebro con su evidencia y su confianza.
 */
require_once __DIR__ . '/agentes_lib.php';

/* ===========================================================================
   EJEMPLOS APRENDIDOS (correcciones de personas)
   ========================================================================= */
function apr_ejemplo_guardar(string $clave, string $entrada, string $salida, int $max = 6): void {
  $l = json_decode((string)icc_ajuste('ejemplos_' . $clave, ''), true) ?: [];
  array_unshift($l, ['e' => mb_substr(trim($entrada), 0, 700), 's' => mb_substr(trim($salida), 0, 1500), 'f' => date('Y-m-d')]);
  icc_ajuste_guardar('ejemplos_' . $clave, json_encode(array_slice($l, 0, $max), JSON_UNESCAPED_UNICODE));
}

function apr_ejemplos(string $clave): array {
  return json_decode((string)icc_ajuste('ejemplos_' . $clave, ''), true) ?: [];
}

/** Texto para el prompt: ejemplos aprobados por personas (como datos de estilo). */
function apr_ejemplos_texto(string $clave, string $titulo): string {
  $l = apr_ejemplos($clave);
  if (!$l) return '';
  $t = "\n\n" . $titulo . " (imita su estilo y criterio; no copies datos concretos):\n";
  foreach (array_slice($l, 0, 4) as $i => $x) $t .= '--- Ejemplo ' . ($i + 1) . "\nSituación: " . $x['e'] . "\nVersión aprobada por una persona: " . $x['s'] . "\n";
  return $t;
}

/** Aprendizaje en el cerebro sin duplicar (misma clave = se actualiza). */
function apr_memoria(string $tipo, string $texto, string $evidencia, int $confianza, string $sector = '', string $angulo = '', string $agente = 'aprendizaje'): bool {
  $db = icc_db();
  $st = $db->prepare('SELECT id FROM equipo_memoria WHERE activo = 1 AND tipo = ? AND texto = ?');
  $st->execute([$tipo, mb_substr($texto, 0, 600)]);
  if ($id = $st->fetchColumn()) {
    $db->prepare('UPDATE equipo_memoria SET evidencia = ?, confianza = ? WHERE id = ?')->execute([mb_substr($evidencia, 0, 600), max(0, min(100, $confianza)), $id]);
    return false;
  }
  $db->prepare('INSERT INTO equipo_memoria (tipo, texto, evidencia, confianza, sector, angulo, agente) VALUES (?, ?, ?, ?, ?, ?, ?)')
    ->execute([$tipo, mb_substr($texto, 0, 600), mb_substr($evidencia, 0, 600), max(0, min(100, $confianza)), $sector, $angulo, $agente]);
  return true;
}

/* ===========================================================================
   CICLO DIARIO DE APRENDIZAJE
   ========================================================================= */
function apr_ciclo(): string {
  $db = icc_db();
  $hechos = [];
  // a) Angulo ganador por sector (90 dias, 30 envios por angulo).
  $filas = $db->query("SELECT l.sector, c.angulo, SUM(m.direccion = 'salida' AND m.estado = 'enviado') env,
                       SUM(m.clasificacion IN ('quiere_info','pide_presupuesto','acepta_reunion')) pos, SUM(m.clasificacion = 'baja') bajas
                       FROM motor_mensajes m JOIN motor_leads l ON l.id = m.lead_id JOIN motor_campanas c ON c.id = m.campana_id
                       WHERE m.created_at >= NOW() - INTERVAL 90 DAY AND l.sector <> '' GROUP BY l.sector, c.angulo")->fetchAll();
  $porSector = [];
  foreach ($filas as $f) if ((int)$f['env'] >= 30 && (int)$f['bajas'] / max(1, (int)$f['env']) <= 0.05) $porSector[$f['sector']][] = $f;
  foreach ($porSector as $sector => $l) {
    if (count($l) < 2) continue;
    usort($l, function ($a, $b) { return ($b['pos'] / $b['env']) <=> ($a['pos'] / $a['env']); });
    [$z, $p] = eq_dos_proporciones((int)$l[0]['pos'], (int)$l[0]['env'], (int)$l[1]['pos'], (int)$l[1]['env']);
    if ($p >= 0.10) continue;
    $ang = $l[0]['angulo'];
    $antes = (string)icc_ajuste('angulo_estandar_' . $sector, '');
    $nom = MOTOR_SECTORES[$sector][0] ?? $sector;
    apr_memoria('aprendizaje', 'En ' . $nom . ' funciona mejor el ángulo «' . (MOTOR_ANGULOS[$ang] ?? $ang) . '»',
      $l[0]['pos'] . '/' . $l[0]['env'] . ' frente a ' . $l[1]['pos'] . '/' . $l[1]['env'] . " (p = $p)", (int)round((1 - $p) * 100), $sector, $ang, 'growth');
    if ($antes !== $ang) {
      icc_ajuste_guardar('angulo_estandar_' . $sector, $ang);
      $db->prepare('UPDATE motor_campanas SET angulo = ? WHERE siempre_activa = 1 AND sector = ?')->execute([$ang, $sector]);
      $hechos[] = 'nuevo ángulo estándar en ' . $nom;
    }
  }
  // b) Sectores que mas convierten -> prioridad del barrido.
  $sect = $db->query("SELECT l.sector, SUM(m.direccion = 'salida' AND m.estado = 'enviado') env, SUM(m.clasificacion IN ('quiere_info','pide_presupuesto','acepta_reunion')) pos
                      FROM motor_mensajes m JOIN motor_leads l ON l.id = m.lead_id WHERE m.created_at >= NOW() - INTERVAL 90 DAY AND l.sector <> '' GROUP BY l.sector HAVING env >= 30")->fetchAll();
  $tasas = [];
  foreach ($sect as $s) $tasas[$s['sector']] = round($s['pos'] / max(1, $s['env']), 4);
  if ($tasas) {
    arsort($tasas);
    icc_ajuste_guardar('barrido_prioridad', json_encode($tasas));
    $mejor = array_key_first($tasas);
    apr_memoria('aprendizaje', 'El sector que más convierte ahora es ' . (MOTOR_SECTORES[$mejor][0] ?? $mejor), round($tasas[$mejor] * 100, 1) . ' % de respuestas positivas (90 días)', 70, $mejor, '', 'growth');
    $hechos[] = 'prioridad del barrido por conversión';
  }
  // c) Concejos que mas convierten.
  foreach ($db->query("SELECT COALESCE(NULLIF(l.concejo, ''), l.localidad) loc, SUM(m.direccion = 'salida' AND m.estado = 'enviado') env, SUM(m.clasificacion IN ('quiere_info','pide_presupuesto','acepta_reunion')) pos
                       FROM motor_mensajes m JOIN motor_leads l ON l.id = m.lead_id WHERE m.created_at >= NOW() - INTERVAL 90 DAY GROUP BY loc HAVING env >= 20 ORDER BY SUM(m.clasificacion IN ('quiere_info','pide_presupuesto','acepta_reunion')) / SUM(m.direccion = 'salida' AND m.estado = 'enviado') DESC LIMIT 3")->fetchAll() as $c) {
    if ((int)$c['pos'] > 0 && $c['loc']) apr_memoria('aprendizaje', 'En ' . $c['loc'] . ' la prospección responde bien', $c['pos'] . ' positivas de ' . $c['env'] . ' envíos', 60, '', '', 'growth');
  }
  // d) Lo que direccion rechaza.
  foreach ($db->query("SELECT agente, herramienta, COUNT(*) n FROM equipo_acciones WHERE estado = 'rechazada' AND decidido_en >= NOW() - INTERVAL 14 DAY GROUP BY agente, herramienta HAVING n >= 2")->fetchAll() as $r) {
    if (apr_memoria('aviso', 'Dirección ha rechazado ' . $r['n'] . ' veces «' . str_replace('_', ' ', $r['herramienta']) . '» de ' . (EQ_AGENTES[$r['agente']][0] ?? $r['agente']) . ': proponlo solo con evidencia clara',
      'Rechazos de los últimos 14 días', 80, '', '', $r['agente'])) $hechos[] = 'aviso por rechazos de ' . $r['agente'];
  }
  // e) Agentes con puntuacion baja: su jefe propone instrucciones nuevas (aprueba direccion).
  foreach (eq_puntuaciones() as $ag => $p) {
    if ($p >= 60 || !EQ_AGENTES[$ag][2]) continue;
    $jefe = EQ_AGENTES[$ag][2];
    $st = $db->prepare("SELECT herramienta, estado, LEFT(resultado, 150) r FROM equipo_acciones WHERE agente = ? AND estado IN ('rechazada','fallida') AND ts >= NOW() - INTERVAL 7 DAY ORDER BY id DESC LIMIT 6");
    $st->execute([$ag]);
    $mal = $st->fetchAll();
    $texto = 'Antes de usar una herramienta de riesgo, comprueba los datos con las de lectura. Evita repetir: '
      . implode('; ', array_map(function ($x) { return str_replace('_', ' ', $x['herramienta']) . ' (' . $x['estado'] . ')'; }, $mal)) . '. Si te falta un dato, encárgalo con asignar_tarea en vez de actuar.';
    if (icc_ia_disponible()) {
      $r = icc_ia_chat([['role' => 'system', 'content' => 'Eres ' . EQ_AGENTES[$jefe][0] . '. Redacta en 3 frases instrucciones concretas para mejorar a un agente de tu equipo. Solo texto.'],
        ['role' => 'user', 'content' => icc_ia_datos('DATOS', json_encode(['agente' => EQ_AGENTES[$ag][0], 'mision' => EQ_AGENTES[$ag][4], 'puntuacion' => $p, 'errores' => $mal], JSON_UNESCAPED_UNICODE), 3000)]],
        ['tipo' => 'aprendizaje', 'max_tokens' => 800, 'sin_limite' => true]);
      if ($r['ok'] && trim($r['contenido']) !== '') $texto = trim($r['contenido']);
    }
    $res = eq_usar($jefe, 'cambiar_instrucciones', ['agente' => $ag, 'instrucciones' => mb_substr($texto, 0, 1500)], null, 'interno');
    if (strpos($res, 'Ya estaba') === false) $hechos[] = 'instrucciones nuevas propuestas para ' . $ag;
  }
  // f) Correos del Motor corregidos: si hay ejemplos, aviso al Copy.
  if (count(apr_ejemplos('motor')) >= 3) apr_memoria('regla', 'Dirección corrige los correos del Motor: imita el estilo de los ejemplos aprobados', count(apr_ejemplos('motor')) . ' correos corregidos y aprobados', 75, '', '', 'copy');
  icc_ajuste_guardar('aprendizaje_ultimo', date('Y-m-d H:i:s'));
  return $hechos ? 'Aprendido: ' . implode(' · ', $hechos) : 'Sin aprendizajes nuevos (hace falta más muestra).';
}

/* ===========================================================================
   PILOTO AUTOMATICO
   ========================================================================= */
/** Oficina virtual de ICC: automatizaciones basicas y embudos que se encienden con el piloto automatico.
 *  (El formulario web, el setter y la reactivacion de la base dormida se activan a mano.) */
const APR_FLUJOS_PILOTO = ['lead_reparto', 'recordatorio_cita', 'no_asistio', 'acuse_estudio', 'seguimiento_presupuesto', 'presupuesto_aceptado',
  'contrato_tramite', 'contrato_activo', 'contrato_incidencia', 'renovacion_anual', 'perdido_recuperar', 'resena_referidos', 'rescate_omnicanal',
  'embudo_energia', 'embudo_telefonia', 'embudo_alarmas', 'embudo_seguros', 'auditoria_integral', 'venta_cruzada'];

function apr_piloto(bool $encender, int $uid): array {
  $db = icc_db();
  $hecho = [];
  $aut = [];
  foreach (array_keys(EQ_AGENTES) as $k) $aut[$k] = $encender ? 'actua' : 'propone';
  icc_ajuste_guardar('equipo_autonomia', json_encode($aut), false, $uid);
  if ($encender) {
    icc_ajuste_guardar('ia_activa', '1', false, $uid);
    icc_ajuste_guardar('equipo_activo', '1', false, $uid);
    icc_ajuste_guardar('barrido_sectores', json_encode(array_keys(MOTOR_SECTORES)), false, $uid);
    if ((int)icc_ajuste('barrido_presupuesto', '150') < 50) icc_ajuste_guardar('barrido_presupuesto', '150', false, $uid);
    $legal = motor_config()['aviso_legal'] !== '';
    icc_ajuste_guardar('barrido_autonomo', $legal ? '1' : '0', false, $uid);
    if ($legal) $db->exec("UPDATE motor_campanas SET modo = 'autonomo' WHERE siempre_activa = 1");
    icc_ajuste_guardar('motor_pausado', '0', false, $uid);
    icc_ajuste_guardar('saneo_auto', '1', false, $uid);
    icc_ajuste_guardar('saneo_crear_llamadas', '1', false, $uid);
    icc_ajuste_guardar('saneo_proponer_perdidos', '1', false, $uid);
    icc_ajuste_guardar('jarvis_activo', '1', false, $uid);
    icc_ajuste_guardar('aprendizaje_auto', '1', false, $uid);
    $db->exec("UPDATE mail_cuentas SET modo = 'automatico' WHERE funcion NOT IN ('personal','solo_envio') AND modo = 'aprobacion'");
    // Flujos recomendados: se crean (si no estan) y se activan.
    if (function_exists('fl_plantillas')) {
      fl_instalar(APR_FLUJOS_PILOTO, $uid, true);
      $hecho[] = count(APR_FLUJOS_PILOTO) . ' automatizaciones activas';
    }
    $hecho[] = count(EQ_AGENTES) . ' agentes con autonomía «actúa»';
    $hecho[] = $legal ? 'barrido con envío autónomo (aviso legal aceptado)' : 'barrido con aprobación de cada correo (falta aceptar el aviso legal)';
    $hecho[] = 'mantenimiento del pipeline con llamadas';
    $hecho[] = 'agentes de correo en automático';
    $hecho[] = 'aprendizaje diario';
  } else {
    icc_ajuste_guardar('barrido_autonomo', '0', false, $uid);
    $db->exec("UPDATE motor_campanas SET modo = 'aprobacion' WHERE modo = 'autonomo'");
    $db->exec("UPDATE motor_mensajes SET estado = 'pendiente' WHERE estado = 'aprobado' AND aprobado_por IS NULL");
    $db->exec("UPDATE mail_cuentas SET modo = 'aprobacion' WHERE funcion <> 'solo_envio'");
    $hecho[] = 'agentes en «propone», correos del Motor y de los buzones con aprobación';
  }
  icc_ajuste_guardar('piloto_automatico', $encender ? '1' : '0', false, $uid);
  icc_seg_anota($encender ? 'Piloto automático encendido' : 'Modo prudente', implode('; ', $hecho), $uid);
  return $hecho;
}

/* ===========================================================================
   PUESTA EN MARCHA: lista de comprobacion en directo
   ========================================================================= */
function apr_checklist(): array {
  $db = icc_db();
  $q = function (string $sql) use ($db) { try { return $db->query($sql)->fetchColumn(); } catch (Throwable $e) { return null; } };
  $l = [];
  $add = function (string $grupo, string $id, string $estado, string $titulo, string $texto, string $enlace = '') use (&$l) { $l[] = compact('grupo', 'id', 'estado', 'titulo', 'texto', 'enlace'); };
  // Base
  $origen = icc_openai_origen_clave();
  $okIa = (int)$q("SELECT COUNT(*) FROM ia_registro WHERE ok = 1 AND ts >= NOW() - INTERVAL 7 DAY") > 0;
  $add('Base', 'ia', $origen === 'ninguna' ? 'falta' : (icc_ia_disponible() && $okIa ? 'ok' : 'aviso'), 'Clave de OpenAI', $origen === 'ninguna' ? 'Pégala en Ajustes de IA y pulsa «Probar conexión».' : ($okIa ? 'Guardada y funcionando.' : 'Guardada: pulsa «Probar conexión» para confirmar que funciona.'), '#/inteligencia-artificial');
  $cronHost = (int)$q("SELECT COUNT(*) FROM cron_registro WHERE origen = 'cron' AND ts >= NOW() - INTERVAL 30 MINUTE") > 0;
  $add('Base', 'cron', $cronHost ? 'ok' : 'falta', 'Tarea programada (cron) cada 5 minutos', $cronHost ? 'El hosting llama al cron con normalidad.' : 'Crea en Plesk la tarea «Buscar una URL» cada 5 minutos con la URL de Ajustes de IA. Sin ella, los agentes solo trabajan mientras alguien tiene el CRM abierto.', '#/inteligencia-artificial');
  $https = strpos(icc_url_base(), 'https://') === 0;
  $add('Base', 'https', $https ? 'ok' : 'aviso', 'Certificado https', $https ? 'El CRM va cifrado.' : 'Instala el certificado gratuito (Let\'s Encrypt) en Plesk y usa el .htaccess CON-SSL: sin https no funciona el micrófono de Jarvis.', '');
  // Prospeccion
  $add('Prospección', 'buzon_motor', motor_cuenta() ? 'ok' : 'falta', 'Buzón de envío del Motor', motor_cuenta() ? 'Configurado.' : 'Motor → Agente y ajustes → Buzón de envío (botón «Datos de Hostalia») y su contraseña.', '#/motor?tab=agente');
  $imap = !empty(motor_config()['imap']['host_imap']);
  $add('Prospección', 'imap_motor', $imap ? 'ok' : 'aviso', 'Lectura de respuestas del Motor', $imap ? 'Las respuestas se leen solas.' : 'Rellena el IMAP del mismo buzón para que las respuestas se clasifiquen solas.', '#/motor?tab=agente');
  $add('Prospección', 'places', icc_places_clave() !== '' ? 'ok' : 'falta', 'Clave de Google Places', icc_places_clave() !== '' ? 'Guardada.' : 'Créala en console.cloud.google.com (Places API New) con límite de gasto y pégala en el Motor.', '#/motor?tab=agente');
  $legal = motor_config()['aviso_legal'] !== '';
  $add('Prospección', 'legal', $legal ? 'ok' : 'aviso', 'Envío autónomo de prospección (LSSI art. 21)', $legal ? 'Aceptado: el barrido puede enviar sin revisar cada correo.' : 'Opcional y decisión tuya: sin aceptarlo, cada correo de prospección espera tu aprobación en «Para revisar».', '#/motor?tab=agente');
  // Equipo comercial
  $gest = (int)$q("SELECT COUNT(*) FROM usuarios WHERE bloqueado = 0 AND rol IN ('comercial','jefe_de_equipo')");
  $add('Equipo', 'gestores', $gest ? 'ok' : 'falta', 'Gestores comerciales activos', $gest ? $gest . ' gestores reciben leads, llamadas y visitas.' : 'Da de alta comerciales: los agentes les reparten el trabajo.', '#/agentes');
  $obj = (float)icc_ajuste('equipo_objetivo_mes', '0');
  $add('Equipo', 'objetivo', $obj > 0 ? 'ok' : 'falta', 'Objetivo de facturación del mes', $obj > 0 ? number_format($obj, 0, ',', '.') . ' € al mes.' : 'Fíjalo en Zona de agentes → Ajustes: el CEO calcula al revés cuánto hace falta en cada paso.', '#/zona-agentes');
  $dos = (int)$q("SELECT COUNT(*) FROM ficheros WHERE categoria = 'dosieres' OR nombre_archivo REGEXP 'dosier|dossier|catalog|folleto'");
  $add('Equipo', 'dosieres', $dos ? 'ok' : 'aviso', 'Dosieres por división', $dos ? $dos . ' dosieres que los agentes adjuntan.' : 'Sube en Formación y recursos los dosieres de energía, telefonía, alarmas y seguros.', '#/ficheros');
  // Correo
  $buz = (int)$q("SELECT COUNT(*) FROM mail_cuentas WHERE activo = 1 AND funcion <> 'solo_envio'");
  $err = (int)$q("SELECT COUNT(*) FROM mail_cuentas WHERE activo = 1 AND error IS NOT NULL");
  $add('Correo', 'buzones', $buz && !$err ? 'ok' : ($buz ? 'aviso' : 'falta'), 'Buzones corporativos conectados', $buz ? $buz . ' buzones' . ($err ? ', ' . $err . ' con error de conexión' : ' leyéndose') . '.' : 'Agente de correo → Buzones: conecta info@, soporte@, admin@… (pega la lista y sus contraseñas).', '#/agente-correo');
  $kb = (string)icc_ajuste('correo_conocimiento', '') !== '';
  $add('Correo', 'conocimiento', $kb ? 'ok' : 'aviso', 'Base de conocimiento', $kb ? 'Personalizada.' : 'Revisa «Cómo responde»: servicios, horario y precios públicos son lo único que la IA puede afirmar.', '#/agente-correo');
  // Automatico
  $add('Automático', 'agentes', eq_config()['activo'] ? 'ok' : 'falta', 'Zona de agentes encendida', eq_config()['activo'] ? 'Los 19 agentes trabajan por turnos (8 a 20 h, laborables).' : 'Enciende el interruptor general o activa el piloto automático.', '#/zona-agentes');
  if (function_exists('voz_config')) {
    $v = voz_config();
    $okV = $v['activo'] && $v['tiene_clave'] && $v['assistant_id'] !== '' && $v['phone_number_id'] !== '';
    $add('Automático', 'voz', $okV ? 'ok' : 'aviso', 'Agente de voz (llamadas con IA)', $okV ? 'Llama a los leads nuevos y a los presupuestos parados en su horario.' : 'Opcional: conecta Vapi con tu número de Telnyx o Twilio en Zona de agentes → Agente de voz. Mientras tanto, esas llamadas van a la agenda del gestor.', '#/zona-agentes');
  }
  $fl = (int)$q("SELECT COUNT(*) FROM flujos WHERE estado = 'activo'");
  $add('Automático', 'flujos', $fl ? 'ok' : 'falta', 'Automatizaciones activas', $fl ? $fl . ' flujos en marcha.' : 'Activa las plantillas o el piloto automático.', '#/automatizaciones');
  $add('Automático', 'saneo', sn_config_seguro() ? 'ok' : 'falta', 'Mantenimiento del pipeline', sn_config_seguro() ? 'Revisa el pipeline cada hora.' : 'Enciéndelo en la tarjeta del Pipeline.', '#/pipeline');
  $apr = (string)icc_ajuste('aprendizaje_ultimo', '');
  $add('Automático', 'aprendizaje', (string)icc_ajuste('aprendizaje_auto', '1') === '1' ? 'ok' : 'falta', 'Aprendizaje diario', $apr ? 'Último ciclo: ' . date('d/m H:i', strtotime($apr)) . '.' : 'Se ejecuta solo una vez al día con el cron.', '#/zona-agentes');
  $add('Automático', 'piloto', (string)icc_ajuste('piloto_automatico', '0') === '1' ? 'ok' : 'aviso', 'Piloto automático', (string)icc_ajuste('piloto_automatico', '0') === '1' ? 'Encendido.' : 'Apagado: los agentes proponen y una persona aprueba casi todo.', '');
  return $l;
}

function sn_config_seguro(): bool {
  return function_exists('sn_config') ? sn_config()['auto'] : (string)icc_ajuste('saneo_auto', '1') === '1';
}

function apr_tick(): string {
  if ((string)icc_ajuste('aprendizaje_auto', '1') !== '1') return 'Aprendizaje apagado.';
  return apr_ciclo();
}
