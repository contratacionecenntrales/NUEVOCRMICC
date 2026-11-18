<?php
/**
 * ICC CRM · Centro de control de la IA. Lo ven direccion y jefes de equipo; lo
 * cambian coordinacion, admin y super admin.
 *
 * GET  ?action=estado
 * POST ?action=pausa {pausa: bool}
 * POST ?action=modulo {clave, activo}
 * POST ?action=agente {clave, activo?, autonomia?}
 */
require __DIR__ . '/config.php';
require_once __DIR__ . '/agentes_lib.php';
require_once __DIR__ . '/centro_lib.php';

$user = icc_require_auth();
if (!icc_ve_ia_equipo($user)) icc_json(['error' => 'No encontrado'], 404);
$metodo = $_SERVER['REQUEST_METHOD'];
$accion = (string)($_GET['action'] ?? 'estado');
if ($metodo !== 'GET') { icc_require_csrf(); if (!icc_ve_config_ia($user)) icc_json(['error' => 'Solo coordinación y administración encienden o apagan la IA.'], 403); }
$body = $metodo === 'GET' ? [] : icc_body();
$db = icc_db();
$uid = (int)$user['id'];

if ($accion === 'estado' && $metodo === 'GET') {
  // Ultima actividad de cada bloque del cron.
  $ult = [];
  foreach ($db->query("SELECT r.bloque, r.ts, r.ok, r.mensaje FROM cron_registro r JOIN (SELECT bloque, MAX(id) id FROM cron_registro WHERE ts >= NOW() - INTERVAL 7 DAY GROUP BY bloque) u ON u.id = r.id")->fetchAll() as $r) $ult[$r['bloque']] = $r;
  $mods = [];
  foreach (CI_MODULOS as $k => $m) $mods[] = ['clave' => $k, 'nombre' => $m[0], 'icono' => $m[1], 'descripcion' => $m[2], 'activo' => ci_modulo_activo($k), 'enlace' => $m[7], 'ultima' => $m[6] && isset($ult[$m[6]]) ? $ult[$m[6]] : null];
  $cfg = eq_config();
  $apag = ci_agentes_apagados();
  $ag = [];
  foreach (EQ_AGENTES as $k => $a) {
    $st = $db->prepare('SELECT inicio, ok, resumen FROM equipo_turnos WHERE agente = ? ORDER BY id DESC LIMIT 1');
    $st->execute([$k]);
    $t = $st->fetch() ?: null;
    $ag[] = ['clave' => $k, 'nombre' => $a[0], 'departamento' => $a[1], 'mision' => $a[4], 'cada_min' => $a[3], 'activo' => !in_array($k, $apag, true), 'autonomia' => $cfg['autonomia'][$k] ?? 'propone',
      'ultimo' => $t ? ['inicio' => $t['inicio'], 'ok' => (bool)$t['ok'], 'resumen' => mb_substr((string)$t['resumen'], 0, 180)] : null];
  }
  $uso = $db->query("SELECT COUNT(*) llamadas, COALESCE(SUM(ok = 0), 0) errores, COALESCE(SUM(tokens_entrada), 0) entrada, COALESCE(SUM(tokens_salida), 0) salida FROM ia_registro WHERE ts >= CURDATE()")->fetch();
  $uso7 = $db->query("SELECT COUNT(*) llamadas, COALESCE(SUM(tokens_entrada + tokens_salida), 0) tokens FROM ia_registro WHERE ts >= NOW() - INTERVAL 7 DAY")->fetch();
  $tipos = $db->query("SELECT tipo, COUNT(*) n FROM ia_registro WHERE ts >= CURDATE() GROUP BY tipo ORDER BY n DESC LIMIT 8")->fetchAll();
  $pend = (int)$db->query("SELECT COUNT(*) FROM equipo_acciones WHERE estado = 'pendiente'")->fetchColumn();
  icc_json(['pausa' => ci_pausa(), 'pausa_desde' => (string)icc_ajuste('ia_pausa_desde', ''), 'modulos' => $mods, 'agentes' => $ag, 'agentes_activos' => $cfg['activo'],
    'ia' => ['disponible' => icc_ia_disponible(), 'clave' => icc_openai_origen_clave(), 'uso_hoy' => $uso, 'uso_7d' => $uso7, 'tipos' => $tipos],
    'piloto' => (string)icc_ajuste('piloto_automatico', '0') === '1', 'para_aprobar' => $pend, 'cola_whatsapp' => count(json_decode((string)icc_ajuste('rrhh_cola_pausa', '[]'), true) ?: []),
    'es_config' => icc_ve_config_ia($user)]);
}

if ($accion === 'pausa' && $metodo === 'POST') {
  $p = !empty($body['pausa']);
  icc_ajuste_guardar('ia_pausa_general', $p ? '1' : '0', false, $uid);
  icc_ajuste_guardar('ia_pausa_desde', $p ? date('Y-m-d H:i:s') : '', false, $uid);
  icc_seg_anota($p ? 'IA en pausa general' : 'IA reanudada', $user['nombre'], $uid);
  icc_json(['ok' => true, 'texto' => $p ? 'Toda la IA autónoma está en pausa. Lo que pidáis a mano sigue funcionando.' : 'IA reanudada: cada módulo vuelve a trabajar según su interruptor.']);
}

if ($accion === 'modulo' && $metodo === 'POST') {
  $k = (string)($body['clave'] ?? '');
  if (!isset(CI_MODULOS[$k])) icc_json(['error' => 'Módulo no válido.'], 422);
  ci_modulo_poner($k, !empty($body['activo']), $uid);
  icc_seg_anota('IA · ' . CI_MODULOS[$k][0] . (!empty($body['activo']) ? ' encendido' : ' apagado'), $user['nombre'], $uid);
  icc_json(['ok' => true]);
}

if ($accion === 'agente' && $metodo === 'POST') {
  $k = (string)($body['clave'] ?? '');
  if (!isset(EQ_AGENTES[$k])) icc_json(['error' => 'Agente no válido.'], 422);
  if (array_key_exists('activo', $body)) {
    $l = array_values(array_diff(ci_agentes_apagados(), [$k]));
    if (empty($body['activo'])) $l[] = $k;
    icc_ajuste_guardar('equipo_apagados', json_encode($l), false, $uid);
  }
  if (isset($body['autonomia']) && in_array($body['autonomia'], ['observa', 'propone', 'actua'], true)) {
    $aut = eq_config()['autonomia'];
    $aut[$k] = $body['autonomia'];
    if ($body['autonomia'] === 'actua') icc_seg_anota('Autonomía «actúa» concedida', EQ_AGENTES[$k][0], $uid);
    icc_ajuste_guardar('equipo_autonomia', json_encode($aut), false, $uid);
  }
  icc_json(['ok' => true]);
}

icc_json(['error' => 'Acción no soportada.'], 400);
