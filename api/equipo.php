<?php
/**
 * ICC CRM · Zona de agentes. Direccion y jefes de equipo la ven; aprueban,
 * lanzan turnos y marcan cobros solo direccion; los ajustes, coordinacion y
 * admin. Los jefes solo ven los clientes y gestores de su equipo.
 *
 * GET  ?action=estado | aprobar | tareas | lab | cerebro | calidad | cierre | cobros | registro | config
 * POST ?action=decidir {id, aprobar, args?}       POST ?action=turno {agente}
 * POST ?action=tarea {id, estado}                 POST ?action=experimento {...} · experimento_accion {id, accion}
 * POST ?action=memoria {tipo, texto, evidencia} · memoria_quitar {id}
 * POST ?action=hallazgo {id, accion} · auditar    POST ?action=cobro {id, accion: pagado|anular}
 * GET  ?action=sala · voz        POST ?action=empujar {cliente_id?} · partes · voz_llamar {cliente_id, motivo} · voz_probar
 * PUT  ?action=config {...} · voz {...}
 */
require __DIR__ . '/config.php';
require_once __DIR__ . '/agentes_lib.php';

$user = icc_require_auth();
if (!icc_ve_ia_equipo($user)) icc_json(['error' => 'No encontrado'], 404);
$metodo = $_SERVER['REQUEST_METHOD'];
$accion = (string)($_GET['action'] ?? 'estado');
if ($metodo !== 'GET') icc_require_csrf();
$body = $metodo === 'GET' ? [] : icc_body();
$db = icc_db();
$uid = (int)$user['id'];
$esDir = icc_es_admin_o_superior($user);
$esConfig = icc_ve_config_ia($user);
$visibles = icc_equipo_comercial_ids($user); // null = todo

function eq_cliente_visible(?array $visibles, $clienteId): bool {
  if ($visibles === null || !$clienteId) return true;
  $st = icc_db()->prepare('SELECT comercial_id FROM clientes WHERE id = ?');
  $st->execute([(int)$clienteId]);
  $c = $st->fetchColumn();
  return $c !== false && $c !== null && in_array((int)$c, $visibles, true);
}
function eq_solo_dir(bool $esDir): void { if (!$esDir) icc_json(['error' => 'Solo dirección puede hacer esto.'], 403); }

if ($accion === 'estado' && $metodo === 'GET') {
  $p = eq_puntuaciones();
  $agentes = [];
  foreach (EQ_AGENTES as $k => $a) {
    $st = $db->prepare('SELECT id, inicio, fin, ok, ia, rondas, acciones, resumen, error FROM equipo_turnos WHERE agente = ? ORDER BY id DESC LIMIT 1');
    $st->execute([$k]);
    $st2 = $db->prepare("SELECT (SELECT COUNT(*) FROM equipo_acciones WHERE agente = ? AND estado = 'pendiente') pend, (SELECT COUNT(*) FROM equipo_tareas WHERE asignado_agente = ? AND estado = 'abierta') tareas");
    $st2->execute([$k, $k]);
    $c = $st2->fetch();
    $agentes[] = ['id' => $k, 'nombre' => $a[0], 'departamento' => $a[1], 'jefe' => $a[2], 'cada_min' => $a[3], 'mision' => $a[4], 'herramientas' => $a[5],
      'autonomia' => eq_autonomia($k), 'puntuacion' => $p[$k], 'ultimo' => $st->fetch() ?: null, 'pendientes' => (int)$c['pend'], 'tareas' => (int)$c['tareas']];
  }
  $cfg = eq_config();
  icc_json(['agentes' => $agentes, 'activo' => $cfg['activo'], 'ia' => icc_ia_disponible(), 'es_dir' => $esDir, 'es_config' => $esConfig,
    'pendientes' => (int)$db->query("SELECT COUNT(*) FROM equipo_acciones WHERE estado = 'pendiente'")->fetchColumn(),
    'turnos_hoy' => (int)$db->query('SELECT COUNT(*) FROM equipo_turnos WHERE inicio >= CURDATE()')->fetchColumn(), 'turnos_dia' => $cfg['turnos_dia'],
    'ritmo' => eq_ritmo(), 'herramientas' => array_map(function ($h) { return ['riesgo' => $h[0], 'descripcion' => $h[1]]; }, EQ_HERRAMIENTAS),
    'siempre_humano' => EQ_SIEMPRE_HUMANO]);
}

if ($accion === 'aprobar' && $metodo === 'GET') {
  $filas = $db->query("SELECT a.*, c.razon_social FROM equipo_acciones a LEFT JOIN clientes c ON a.entidad = 'cliente' AND c.id = a.entidad_id WHERE a.estado = 'pendiente' ORDER BY a.id LIMIT 200")->fetchAll();
  $out = [];
  foreach ($filas as $f) {
    if ($f['entidad'] === 'cliente' && !eq_cliente_visible($visibles, $f['entidad_id'])) continue;
    if ($visibles !== null && in_array($f['herramienta'], ['crear_cobro', 'recordar_cobro', 'cambiar_instrucciones', 'reasignar_contacto'], true)) continue;
    $f['args'] = json_decode((string)$f['args'], true);
    $f['agente_nombre'] = EQ_AGENTES[$f['agente']][0] ?? $f['agente'];
    $f['descripcion'] = EQ_HERRAMIENTAS[$f['herramienta']][1] ?? '';
    $out[] = $f;
  }
  $recientes = $visibles === null ? $db->query("SELECT a.id, a.agente, a.herramienta, a.estado, a.resultado, a.decidido_en, u.nombre decidido_por_nombre FROM equipo_acciones a LEFT JOIN usuarios u ON u.id = a.decidido_por
                           WHERE a.estado IN ('aprobada','rechazada') ORDER BY a.decidido_en DESC LIMIT 20")->fetchAll() : [];
  foreach ($recientes as &$r) $r['agente_nombre'] = EQ_AGENTES[$r['agente']][0] ?? $r['agente'];
  icc_json(['acciones' => $out, 'decididas' => $recientes, 'es_dir' => $esDir]);
}

if ($accion === 'decidir' && $metodo === 'POST') {
  eq_solo_dir($esDir);
  $args = isset($body['args']) && is_array($body['args']) ? $body['args'] : null;
  $r = eq_decidir((int)($body['id'] ?? 0), !empty($body['aprobar']), $user, $args);
  if (!$r['ok']) icc_json(['error' => $r['error']], 409);
  icc_json($r);
}

if ($accion === 'turno' && $metodo === 'POST') {
  eq_solo_dir($esDir);
  @set_time_limit(180);
  icc_json(eq_turno((string)($body['agente'] ?? ''), 'manual', $uid));
}

if ($accion === 'tareas' && $metodo === 'GET') {
  $t = $db->query("SELECT t.*, u.nombre usuario_nombre, c.razon_social, c.comercial_id FROM equipo_tareas t LEFT JOIN usuarios u ON u.id = t.asignado_usuario LEFT JOIN clientes c ON c.id = t.cliente_id
                   WHERE t.estado = 'abierta' OR t.cerrada_en >= NOW() - INTERVAL 7 DAY ORDER BY t.estado = 'abierta' DESC, t.id DESC LIMIT 200")->fetchAll();
  $t = array_values(array_filter($t, function ($x) use ($visibles, $uid) {
    if ($visibles === null || (int)$x['asignado_usuario'] === $uid) return true;
    if ($x['cliente_id']) return $x['comercial_id'] !== null && in_array((int)$x['comercial_id'], $visibles, true);
    return $x['asignado_usuario'] === null;
  }));
  foreach ($t as &$x) $x['agente_nombre'] = $x['asignado_agente'] ? (EQ_AGENTES[$x['asignado_agente']][0] ?? $x['asignado_agente']) : null;
  icc_json(['tareas' => $t]);
}
if ($accion === 'tarea' && $metodo === 'POST') {
  $estado = ($body['estado'] ?? '') === 'cancelada' ? 'cancelada' : 'hecha';
  $st = $db->prepare('SELECT asignado_usuario FROM equipo_tareas WHERE id = ?');
  $st->execute([(int)($body['id'] ?? 0)]);
  $asig = $st->fetchColumn();
  if ($asig === false) icc_json(['error' => 'Tarea no encontrada.'], 404);
  if (!$esDir && (int)$asig !== $uid) icc_json(['error' => 'Solo dirección o la persona encargada.'], 403);
  $db->prepare("UPDATE equipo_tareas SET estado = ?, cerrada_en = NOW() WHERE id = ? AND estado = 'abierta'")->execute([$estado, (int)$body['id']]);
  icc_json(['ok' => true]);
}

if ($accion === 'lab' && $metodo === 'GET') {
  $exp = $db->query('SELECT * FROM equipo_experimentos ORDER BY id DESC LIMIT 30')->fetchAll();
  foreach ($exp as &$e) {
    if ($e['campana_a']) { $e['a'] = eq_exp_numeros((int)$e['campana_a']); $e['b'] = eq_exp_numeros((int)$e['campana_b']); }
  }
  $estandar = [];
  foreach (MOTOR_SECTORES as $k => $s) { $v = (string)icc_ajuste('angulo_estandar_' . $k, ''); if ($v !== '') $estandar[$k] = $v; }
  icc_json(['experimentos' => $exp, 'cobertura' => eq_cobertura(), 'que_funciona' => eq_que_funciona(), 'sectores' => array_map(function ($s) { return $s[0]; }, MOTOR_SECTORES),
    'angulos' => MOTOR_ANGULOS, 'estandar' => $estandar, 'es_dir' => $esDir]);
}
if ($accion === 'experimento' && $metodo === 'POST') {
  eq_solo_dir($esDir);
  try {
    $r = eq_ejecutar('proponer_experimento', $body + ['hipotesis' => '', 'sector_b' => ''], 'innovacion');
  } catch (Throwable $e) { icc_json(['error' => $e->getMessage()], 422); }
  icc_json(['ok' => true, 'id' => $r['entidad_id']]);
}
if ($accion === 'experimento_accion' && $metodo === 'POST') {
  eq_solo_dir($esDir);
  $id = (int)($body['id'] ?? 0);
  $acc = (string)($body['accion'] ?? '');
  if ($acc === 'lanzar') icc_json(['ok' => true, 'texto' => eq_lanzar_experimento($id)]);
  if ($acc === 'evaluar') icc_json(['ok' => true, 'texto' => eq_evaluar_experimento($id)]);
  if ($acc === 'detener') {
    $st = $db->prepare("SELECT campana_a, campana_b FROM equipo_experimentos WHERE id = ? AND estado IN ('propuesto','en_marcha')");
    $st->execute([$id]);
    $e = $st->fetch();
    if (!$e) icc_json(['error' => 'No se puede detener.'], 409);
    $db->prepare("UPDATE equipo_experimentos SET estado = 'detenido', cerrado_en = NOW(), resultado = CONCAT(COALESCE(resultado, ''), ' · Detenido por ', ?) WHERE id = ?")->execute([$user['nombre'], $id]);
    $db->prepare("UPDATE motor_campanas SET estado = 'pausada' WHERE id IN (?, ?)")->execute([(int)$e['campana_a'], (int)$e['campana_b']]);
    icc_json(['ok' => true, 'texto' => 'Experimento detenido.']);
  }
  icc_json(['error' => 'Acción no válida.'], 422);
}

if ($accion === 'cerebro' && $metodo === 'GET') {
  icc_json(['memoria' => $db->query('SELECT m.*, u.nombre autor FROM equipo_memoria m LEFT JOIN usuarios u ON u.id = m.creado_por WHERE m.activo = 1 ORDER BY FIELD(m.tipo,"casa","regla","aviso","aprendizaje"), m.id DESC LIMIT 200')->fetchAll(),
    'que_funciona' => eq_que_funciona(), 'es_dir' => $esDir, 'angulos' => MOTOR_ANGULOS, 'sectores' => array_map(function ($s) { return $s[0]; }, MOTOR_SECTORES)]);
}
if ($accion === 'memoria' && $metodo === 'POST') {
  eq_solo_dir($esDir);
  $tipo = in_array($body['tipo'] ?? '', ['casa', 'regla', 'aviso', 'aprendizaje'], true) ? $body['tipo'] : 'casa';
  $texto = trim((string)($body['texto'] ?? ''));
  if ($texto === '') icc_json(['error' => 'Escribe la regla o el aprendizaje.'], 422);
  $db->prepare('INSERT INTO equipo_memoria (tipo, texto, evidencia, confianza, creado_por) VALUES (?, ?, ?, ?, ?)')->execute([$tipo, mb_substr($texto, 0, 600), mb_substr(trim((string)($body['evidencia'] ?? '')), 0, 600), 100, $uid]);
  icc_json(['ok' => true]);
}
if ($accion === 'memoria_quitar' && $metodo === 'POST') {
  eq_solo_dir($esDir);
  $db->prepare('UPDATE equipo_memoria SET activo = 0 WHERE id = ?')->execute([(int)($body['id'] ?? 0)]);
  icc_json(['ok' => true]);
}

if ($accion === 'calidad' && $metodo === 'GET') {
  $p = eq_puntuaciones();
  $punt = [];
  foreach (EQ_AGENTES as $k => $a) $punt[] = ['id' => $k, 'nombre' => $a[0], 'jefe' => $a[2] ? EQ_AGENTES[$a[2]][0] : null, 'puntuacion' => $p[$k]];
  $h = $db->query("SELECT * FROM equipo_hallazgos WHERE estado = 'abierto' OR resuelto_en >= NOW() - INTERVAL 7 DAY ORDER BY estado = 'abierto' DESC, FIELD(gravedad,'alta','media','baja'), id DESC LIMIT 100")->fetchAll();
  foreach ($h as &$x) $x['responsable_nombre'] = EQ_AGENTES[$x['responsable']][0] ?? $x['responsable'];
  icc_json(['hallazgos' => $h, 'puntuaciones' => $punt, 'es_dir' => $esDir]);
}
if ($accion === 'hallazgo' && $metodo === 'POST') {
  eq_solo_dir($esDir);
  $estado = ($body['accion'] ?? '') === 'descartar' ? 'descartado' : 'resuelto';
  $db->prepare('UPDATE equipo_hallazgos SET estado = ?, resuelto_en = NOW() WHERE id = ?')->execute([$estado, (int)($body['id'] ?? 0)]);
  icc_json(['ok' => true]);
}
if ($accion === 'auditar' && $metodo === 'POST') {
  eq_solo_dir($esDir);
  icc_json(['ok' => true, 'texto' => eq_usar('qa', 'auditar', [], null, 'manual')]);
}

if ($accion === 'cierre' && $metodo === 'GET') {
  $f = $db->query("SELECT e.*, c.razon_social, c.comercial_id, c.estado fase, c.valor_estimado, CONCAT(u.nombre, ' ', COALESCE(u.apellidos, '')) gestor FROM equipo_cierre e JOIN clientes c ON c.id = e.cliente_id LEFT JOIN usuarios u ON u.id = c.comercial_id
                   WHERE e.estado <> 'cerrado' ORDER BY e.temperatura DESC")->fetchAll();
  if ($visibles !== null) $f = array_values(array_filter($f, function ($x) use ($visibles) { return $x['comercial_id'] !== null && in_array((int)$x['comercial_id'], $visibles, true); }));
  icc_json(['cierre' => $f, 'toques' => array_values(array_map(function ($t) { return ['dia' => $t[0], 'tipo' => $t[1]]; }, EQ_TOQUES))]);
}

/* ---------------------------------------------------------------- SALA DE CIERRE */
if ($accion === 'sala' && $metodo === 'GET') {
  $eqs = eq_equipos();
  if ($visibles !== null) $eqs = array_values(array_filter($eqs, function ($e) use ($uid) { return (int)$e['jefe_id'] === $uid; }));
  $ll = $db->query("SELECT v.id, v.cliente_id, v.nombre, v.telefono, v.motivo, v.origen, v.estado, v.resultado, v.resumen, v.acciones, v.error, v.duracion, v.created_at, c.razon_social, c.comercial_id
                    FROM voz_llamadas v LEFT JOIN clientes c ON c.id = v.cliente_id ORDER BY v.id DESC LIMIT 40")->fetchAll();
  if ($visibles !== null) $ll = array_values(array_filter($ll, function ($x) use ($visibles) { return $x['comercial_id'] !== null && in_array((int)$x['comercial_id'], $visibles, true); }));
  $v = voz_config();
  icc_json(['parados' => eq_presupuestos_parados($visibles), 'tecnicas' => EQ_TECNICAS, 'equipos' => $eqs, 'llamadas' => $ll, 'resultados' => VOZ_RESULTADOS, 'motivos' => VOZ_MOTIVOS,
    'voz' => ['activo' => $v['activo'], 'configurado' => $v['tiene_clave'] && $v['assistant_id'] !== '' && $v['phone_number_id'] !== ''], 'es_dir' => $esDir, 'es_config' => $esConfig]);
}
if ($accion === 'empujar' && $metodo === 'POST') {
  $cid = (int)($body['cliente_id'] ?? 0);
  if (!$cid) { eq_solo_dir($esDir); icc_json(['ok' => true, 'texto' => eq_empujar_presupuestos('jefatura', null)]); }
  if (!eq_cliente_visible($visibles, $cid)) icc_json(['error' => 'No encontrado.'], 404);
  icc_json(['ok' => true, 'texto' => eq_empujar_presupuestos('jefatura', null, $cid)]);
}
if ($accion === 'partes' && $metodo === 'POST') {
  eq_solo_dir($esDir);
  icc_json(['ok' => true, 'texto' => eq_partes_equipos('jefes_equipo', null, true)]);
}
if ($accion === 'voz_llamar' && $metodo === 'POST') {
  $cid = (int)($body['cliente_id'] ?? 0);
  if (!$cid || !eq_cliente_visible($visibles, $cid)) icc_json(['error' => 'No encontrado.'], 404);
  $c = eq_cliente($cid);
  $mot = (string)($body['motivo'] ?? 'seguimiento');
  if ($mot === 'prospeccion' || !isset(VOZ_MOTIVOS[$mot])) $mot = 'seguimiento';
  $r = voz_llamar($c, $mot, mb_substr((string)($body['detalle'] ?? ''), 0, 300), 'manual · ' . $user['nombre'], $uid);
  icc_json($r['ok'] ? ['ok' => true, 'texto' => 'Llamada en curso: el resultado aparecerá aquí y en la ficha.'] : ['error' => $r['error']], $r['ok'] ? 200 : 409);
}
if ($accion === 'voz' && $metodo === 'GET') {
  if (!$esConfig) icc_json(['error' => 'Solo la administración configura el agente de voz.'], 403);
  icc_json(voz_config() + ['webhook' => voz_webhook_url(), 'secreto' => voz_secreto(), 'prompt' => VOZ_PROMPT, 'motivos' => VOZ_MOTIVOS,
    'primer_mensaje' => 'Hola, buenos días. Le llamo de ICC Consultoría; soy Carlos, un asistente de inteligencia artificial. ¿Hablo con {{nombre}}?']);
}
if ($accion === 'voz' && $metodo === 'PUT') {
  if (!$esConfig) icc_json(['error' => 'Solo la administración configura el agente de voz.'], 403);
  $limpio = function ($v) { return preg_replace('/[^A-Za-z0-9_-]/', '', (string)$v); };
  icc_ajuste_guardar('voz_activo', !empty($body['activo']) ? '1' : '0', false, $uid);
  icc_ajuste_guardar('voz_assistant_id', mb_substr($limpio($body['assistant_id'] ?? ''), 0, 80), false, $uid);
  icc_ajuste_guardar('voz_phone_number_id', mb_substr($limpio($body['phone_number_id'] ?? ''), 0, 80), false, $uid);
  icc_ajuste_guardar('voz_limite_dia', (string)max(1, min(500, (int)($body['limite_dia'] ?? 40))), false, $uid);
  icc_ajuste_guardar('voz_frio', !empty($body['frio']) ? '1' : '0', false, $uid);
  icc_ajuste_guardar('voz_auto_leads', !empty($body['auto_leads']) ? '1' : '0', false, $uid);
  icc_ajuste_guardar('voz_auto_cierre', !empty($body['auto_cierre']) ? '1' : '0', false, $uid);
  $hor = preg_replace('/\s+/', '', (string)($body['horario'] ?? ''));
  if (preg_match('/^\d{2}:\d{2}-\d{2}:\d{2}(,\d{2}:\d{2}-\d{2}:\d{2}){0,3}$/', $hor)) icc_ajuste_guardar('voz_horario', $hor, false, $uid);
  icc_ajuste_guardar('voz_solo_laborables', !empty($body['solo_laborables']) ? '1' : '0', false, $uid);
  if (isset($body['base']) && preg_match('#^https://[a-z0-9.-]+(:\d+)?$#i', (string)$body['base'])) icc_ajuste_guardar('voz_base', (string)$body['base'], false, $uid);
  if (trim((string)($body['clave'] ?? '')) !== '') { icc_ajuste_guardar('voz_clave', icc_cifrar(trim((string)$body['clave'])), false, $uid); icc_seg_anota('Clave de Vapi guardada', 'Agente de voz', $uid); }
  icc_json(['ok' => true]);
}
if ($accion === 'voz_probar' && $metodo === 'POST') {
  if (!$esConfig) icc_json(['error' => 'Solo la administración configura el agente de voz.'], 403);
  $id = voz_config()['assistant_id'];
  if ($id === '') icc_json(['error' => 'Escribe el identificador del asistente de Vapi.'], 422);
  $r = voz_peticion('GET', '/assistant/' . rawurlencode($id));
  icc_json($r['ok'] ? ['ok' => true, 'texto' => 'Conectado con Vapi: asistente «' . mb_substr((string)($r['datos']['name'] ?? $id), 0, 80) . '».'] : ['error' => 'Vapi: ' . $r['error']], $r['ok'] ? 200 : 502);
}

if ($accion === 'cobros' && $metodo === 'GET') {
  eq_solo_dir($esDir);
  icc_json(eq_cobros() + ['pagados' => $db->query("SELECT e.*, c.razon_social, u.nombre pagado_por_nombre FROM equipo_cobros e LEFT JOIN clientes c ON c.id = e.cliente_id LEFT JOIN usuarios u ON u.id = e.pagado_por WHERE e.estado <> 'pendiente' ORDER BY e.id DESC LIMIT 30")->fetchAll()]);
}
if ($accion === 'cobro' && $metodo === 'POST') {
  eq_solo_dir($esDir);
  $acc = (string)($body['accion'] ?? '');
  if ($acc === 'pagado') $db->prepare("UPDATE equipo_cobros SET estado = 'pagado', pagado_por = ?, pagado_en = NOW() WHERE id = ? AND estado = 'pendiente'")->execute([$uid, (int)($body['id'] ?? 0)]);
  elseif ($acc === 'anular') $db->prepare("UPDATE equipo_cobros SET estado = 'anulado' WHERE id = ? AND estado = 'pendiente'")->execute([(int)($body['id'] ?? 0)]);
  else icc_json(['error' => 'Acción no válida.'], 422);
  icc_seg_anota('Cobro ' . ($acc === 'pagado' ? 'marcado como pagado' : 'anulado'), 'Cobro #' . (int)$body['id'] . ' (Zona de agentes)', $uid);
  icc_json(['ok' => true]);
}

if ($accion === 'registro' && $metodo === 'GET') {
  $t = $db->query('SELECT * FROM equipo_turnos ORDER BY id DESC LIMIT 60')->fetchAll();
  foreach ($t as &$x) $x['agente_nombre'] = EQ_AGENTES[$x['agente']][0] ?? $x['agente'];
  unset($x);
  $a = $visibles === null ? $db->query('SELECT id, ts, agente, herramienta, riesgo, estado, LEFT(resultado, 300) resultado FROM equipo_acciones ORDER BY id DESC LIMIT 100')->fetchAll() : [];
  foreach ($a as &$x) $x['agente_nombre'] = EQ_AGENTES[$x['agente']][0] ?? $x['agente'];
  icc_json(['turnos' => $t, 'acciones' => $a]);
}

if ($accion === 'config' && $metodo === 'GET') {
  icc_json(eq_config() + ['sectores' => array_map(function ($s) { return $s[0]; }, MOTOR_SECTORES), 'agentes' => array_map(function ($a) { return $a[0]; }, EQ_AGENTES),
    'es_config' => $esConfig, 'aviso_legal' => motor_config()['aviso_legal'] !== '']);
}
if ($accion === 'config' && $metodo === 'PUT') {
  if (!$esConfig) icc_json(['error' => 'Solo la administración.'], 403);
  $auto = !empty($body['barrido_autonomo']);
  if ($auto && motor_config()['aviso_legal'] === '') icc_json(['error' => 'El envío autónomo del barrido exige aceptar antes el aviso legal del Motor.'], 422);
  $aut = [];
  foreach ((array)($body['autonomia'] ?? []) as $k => $v) if (isset(EQ_AGENTES[$k]) && in_array($v, ['observa', 'propone', 'actua'], true)) $aut[$k] = $v;
  $antes = eq_config();
  icc_ajuste_guardar('equipo_autonomia', json_encode($aut), false, $uid);
  icc_ajuste_guardar('equipo_activo', !empty($body['activo']) ? '1' : '0', false, $uid);
  foreach (['hora_desde' => '08:00', 'hora_hasta' => '20:00'] as $k => $d) {
    $v = (string)($body[$k] ?? $d);
    icc_ajuste_guardar('equipo_' . $k, preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $v) ? $v : $d, false, $uid);
  }
  icc_ajuste_guardar('equipo_solo_laborables', !empty($body['solo_laborables']) ? '1' : '0', false, $uid);
  icc_ajuste_guardar('equipo_turnos_dia', (string)max(1, min(500, (int)($body['turnos_dia'] ?? 120))), false, $uid);
  icc_ajuste_guardar('equipo_acciones_agente', (string)max(1, min(500, (int)($body['acciones_agente'] ?? 40))), false, $uid);
  icc_ajuste_guardar('equipo_objetivo_mes', (string)max(0, (float)($body['objetivo_mes'] ?? 0)), false, $uid);
  icc_ajuste_guardar('barrido_presupuesto', (string)max(0, min(2000, (int)($body['barrido_presupuesto'] ?? 150))), false, $uid);
  icc_ajuste_guardar('barrido_sectores', json_encode(array_values(array_filter((array)($body['barrido_sectores'] ?? []), function ($s) { return isset(MOTOR_SECTORES[$s]); }))), false, $uid);
  icc_ajuste_guardar('barrido_autonomo', $auto ? '1' : '0', false, $uid);
  if ($antes['activo'] !== !empty($body['activo'])) icc_seg_anota(!empty($body['activo']) ? 'Zona de agentes encendida' : 'Zona de agentes apagada', '', $uid);
  foreach ($aut as $k => $v) if ($v === 'actua' && ($antes['autonomia'][$k] ?? 'propone') !== 'actua') icc_seg_anota('Autonomía «actúa» concedida', EQ_AGENTES[$k][0], $uid);
  icc_json(['ok' => true]);
}

icc_json(['error' => 'Acción no soportada.'], 400);
