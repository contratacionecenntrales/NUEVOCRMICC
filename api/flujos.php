<?php
/**
 * ICC CRM · Automatizaciones y Embudos. Direccion y jefes de equipo.
 *
 * GET  ?action=lista                    flujos con estadisticas + catalogo (disparadores, pasos, plantillas)
 * GET  ?action=flujo&id=                flujo, arbol, contactos por paso, registro
 * POST ?action=plantilla {clave}        crea un flujo (borrador) desde una plantilla
 * POST ?action=guardar {...}            crea o guarda (valida que no haya bucles)
 * POST ?action=estado {id, estado}      activar | pausar
 * POST ?action=borrar {id}
 * POST ?action=inscribir {id, fase?, etiqueta?, cliente_id?}
 * POST ?action=tick                     pasada del motor ahora
 */
require __DIR__ . '/config.php';
require_once __DIR__ . '/agentes_lib.php';
require_once __DIR__ . '/flujos_lib.php';

$user = icc_require_auth();
if (!icc_ve_ia_equipo($user)) icc_json(['error' => 'No encontrado'], 404);
$metodo = $_SERVER['REQUEST_METHOD'];
$accion = (string)($_GET['action'] ?? 'lista');
if ($metodo !== 'GET') icc_require_csrf();
$body = $metodo === 'GET' ? [] : icc_body();
$db = icc_db();
$uid = (int)$user['id'];
$visibles = icc_equipo_comercial_ids($user);

function fl_publico(array $f): array {
  return ['id' => (int)$f['id'], 'nombre' => $f['nombre'], 'descripcion' => $f['descripcion'], 'disparador' => $f['disparador'],
    'disparador_cfg' => json_decode((string)$f['disparador_cfg'], true) ?: new stdClass(), 'filtro' => json_decode((string)$f['filtro'], true) ?: new stdClass(),
    'pasos' => json_decode((string)$f['pasos'], true), 'objetivo' => json_decode((string)$f['objetivo'], true) ?: new stdClass(),
    'solo_horario' => (bool)$f['solo_horario'], 'estado' => $f['estado'], 'plantilla' => $f['plantilla'], 'gracias_url' => $f['gracias_url'],
    'entrada_url' => $f['disparador'] === 'formulario' && $f['token_entrada'] ? icc_url_base() . '/api/flujo_entrada.php?t=' . $f['token_entrada'] : null,
    'updated_at' => $f['updated_at']];
}

if ($accion === 'lista' && $metodo === 'GET') {
  $out = [];
  foreach ($db->query('SELECT * FROM flujos ORDER BY estado = "activo" DESC, id DESC')->fetchAll() as $f) $out[] = fl_publico($f) + ['stats' => fl_estadisticas((int)$f['id'])];
  $pl = [];
  foreach (fl_plantillas() as $k => $p) $pl[] = ['clave' => $k, 'nombre' => $p[0], 'grupo' => $p[1], 'disparador' => $p[2], 'pasos' => count($p[4]['nodos'])];
  $etq = $db->query('SELECT etiqueta, COUNT(*) n FROM cliente_etiquetas GROUP BY etiqueta ORDER BY n DESC LIMIT 50')->fetchAll();
  icc_json(['flujos' => $out, 'plantillas' => $pl, 'disparadores' => FL_DISPARADORES, 'pasos' => FL_PASOS, 'fases' => FL_FASES, 'etiquetas' => $etq,
    'buzon' => motor_cuenta() !== null, 'ultimo' => (string)icc_ajuste('cron_ultimo_flujos', '')]);
}

if ($accion === 'flujo' && $metodo === 'GET') {
  $st = $db->prepare('SELECT * FROM flujos WHERE id = ?');
  $st->execute([(int)($_GET['id'] ?? 0)]);
  $f = $st->fetch();
  if (!$f) icc_json(['error' => 'No encontrado.'], 404);
  $reg = $db->prepare('SELECT r.ts, r.paso_id, r.accion, r.detalle, r.cliente_id, c.razon_social, c.comercial_id FROM flujo_registro r LEFT JOIN clientes c ON c.id = r.cliente_id WHERE r.flujo_id = ? ORDER BY r.id DESC LIMIT 80');
  $reg->execute([$f['id']]);
  $registro = array_map(function ($r) use ($visibles) {
    if ($visibles !== null && $r['cliente_id'] && !in_array((int)$r['comercial_id'], $visibles, true)) $r['razon_social'] = 'Contacto de otro equipo';
    unset($r['comercial_id']);
    return $r;
  }, $reg->fetchAll());
  icc_json(['flujo' => fl_publico($f), 'stats' => fl_estadisticas((int)$f['id']), 'registro' => $registro]);
}

if ($accion === 'plantilla' && $metodo === 'POST') {
  $pl = fl_plantillas()[(string)($body['clave'] ?? '')] ?? null;
  if (!$pl) icc_json(['error' => 'Plantilla no encontrada.'], 404);
  [$nombre, , $disp, $cfg, $pasos, $obj] = $pl;
  $db->prepare("INSERT INTO flujos (nombre, disparador, disparador_cfg, filtro, pasos, objetivo, plantilla, token_entrada, creado_por) VALUES (?, ?, ?, '{}', ?, ?, ?, ?, ?)")
    ->execute([$nombre, $disp, json_encode($cfg ?: new stdClass()), json_encode($pasos, JSON_UNESCAPED_UNICODE), json_encode($obj ?: new stdClass()), (string)$body['clave'], $disp === 'formulario' ? bin2hex(random_bytes(16)) : null, $uid]);
  icc_json(['ok' => true, 'id' => (int)$db->lastInsertId()]);
}

if ($accion === 'guardar' && $metodo === 'POST') {
  $nombre = trim((string)($body['nombre'] ?? ''));
  $disp = (string)($body['disparador'] ?? '');
  if ($nombre === '') icc_json(['error' => 'Ponle un nombre al flujo.'], 422);
  if (!isset(FL_DISPARADORES[$disp])) icc_json(['error' => 'Elige un disparador.'], 422);
  try { $pasos = fl_validar((array)($body['pasos'] ?? [])); } catch (InvalidArgumentException $e) { icc_json(['error' => $e->getMessage()], 422); }
  foreach ($pasos['nodos'] as $n) if ($n['tipo'] === 'webhook' && !icc_ve_config_ia($user)) {
    $id0 = (int)($body['id'] ?? 0);
    $prev = $id0 ? (string)$db->query('SELECT pasos FROM flujos WHERE id = ' . $id0)->fetchColumn() : '';
    if (strpos($prev, (string)$n['cfg']['url']) === false) icc_json(['error' => 'Solo la administración añade webhooks salientes.'], 403);
  }
  $dcfg = array_intersect_key((array)($body['disparador_cfg'] ?? []), array_flip(['fase', 'etiqueta', 'tipo_cita', 'resultado', 'dias']));
  $filtro = array_intersect_key((array)($body['filtro'] ?? []), array_flip(['origen', 'sector']));
  $obj = array_intersect_key((array)($body['objetivo'] ?? []), array_flip(['fase', 'cita', 'presupuesto_aceptado', 'etiqueta']));
  $gracias = trim((string)($body['gracias_url'] ?? ''));
  if ($gracias !== '' && !preg_match('#^https?://#i', $gracias)) icc_json(['error' => 'La página de gracias debe empezar por http:// o https://.'], 422);
  $id = (int)($body['id'] ?? 0);
  $args = [mb_substr($nombre, 0, 160), mb_substr((string)($body['descripcion'] ?? ''), 0, 500), $disp, json_encode($dcfg ?: new stdClass(), JSON_UNESCAPED_UNICODE), json_encode($filtro ?: new stdClass(), JSON_UNESCAPED_UNICODE),
    json_encode($pasos, JSON_UNESCAPED_UNICODE), json_encode($obj ?: new stdClass(), JSON_UNESCAPED_UNICODE), !empty($body['solo_horario']) ? 1 : 0, mb_substr($gracias, 0, 255)];
  if ($id) {
    $db->prepare('UPDATE flujos SET nombre = ?, descripcion = ?, disparador = ?, disparador_cfg = ?, filtro = ?, pasos = ?, objetivo = ?, solo_horario = ?, gracias_url = ? WHERE id = ?')->execute(array_merge($args, [$id]));
    // Quien esperaba en un paso que ya no existe sale del flujo.
    $st = $db->prepare("SELECT id, paso_id, cliente_id FROM flujo_inscripciones WHERE flujo_id = ? AND estado = 'en_curso'");
    $st->execute([$id]);
    foreach ($st->fetchAll() as $i) if ($i['paso_id'] !== '' && !isset($pasos['nodos'][$i['paso_id']])) {
      $db->prepare("UPDATE flujo_inscripciones SET estado = 'salido', motivo = 'Se quitó el paso en el que estaba', proximo = NULL WHERE id = ?")->execute([$i['id']]);
      fl_registro($id, (int)$i['id'], (int)$i['cliente_id'], $i['paso_id'], 'salido', 'Se quitó el paso en el que estaba');
    }
    if ($disp === 'formulario') $db->prepare('UPDATE flujos SET token_entrada = COALESCE(token_entrada, ?) WHERE id = ?')->execute([bin2hex(random_bytes(16)), $id]);
  } else {
    $db->prepare('INSERT INTO flujos (nombre, descripcion, disparador, disparador_cfg, filtro, pasos, objetivo, solo_horario, gracias_url, token_entrada, creado_por) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      ->execute(array_merge($args, [$disp === 'formulario' ? bin2hex(random_bytes(16)) : null, $uid]));
    $id = (int)$db->lastInsertId();
  }
  icc_json(['ok' => true, 'id' => $id]);
}

if ($accion === 'estado' && $metodo === 'POST') {
  $estado = ($body['estado'] ?? '') === 'activo' ? 'activo' : 'pausado';
  $id = (int)($body['id'] ?? 0);
  if ($estado === 'activo') {
    $st = $db->prepare('SELECT pasos FROM flujos WHERE id = ?');
    $st->execute([$id]);
    try { fl_validar(json_decode((string)$st->fetchColumn(), true) ?: []); } catch (InvalidArgumentException $e) { icc_json(['error' => $e->getMessage()], 422); }
  }
  $db->prepare('UPDATE flujos SET estado = ? WHERE id = ?')->execute([$estado, $id]);
  icc_json(['ok' => true]);
}

if ($accion === 'borrar' && $metodo === 'POST') {
  $db->prepare('DELETE FROM flujos WHERE id = ?')->execute([(int)($body['id'] ?? 0)]);
  icc_json(['ok' => true]);
}

if ($accion === 'inscribir' && $metodo === 'POST') {
  $st = $db->prepare("SELECT * FROM flujos WHERE id = ? AND estado = 'activo'");
  $st->execute([(int)($body['id'] ?? 0)]);
  $f = $st->fetch();
  if (!$f) icc_json(['error' => 'Activa el flujo antes de inscribir contactos.'], 409);
  $w = ['c.no_contactar = 0']; $p = [];
  if (!empty($body['cliente_id'])) { $w[] = 'c.id = ?'; $p[] = (int)$body['cliente_id']; }
  if (!empty($body['fase'])) { $w[] = 'c.estado = ?'; $p[] = (string)$body['fase']; }
  if (!empty($body['etiqueta'])) { $w[] = 'EXISTS (SELECT 1 FROM cliente_etiquetas e WHERE e.cliente_id = c.id AND e.etiqueta = ?)'; $p[] = (string)$body['etiqueta']; }
  if (count($w) === 1) icc_json(['error' => 'Elige una fase, una etiqueta o un contacto.'], 422);
  if ($visibles !== null) $w[] = $visibles ? 'c.comercial_id IN (' . implode(',', array_map('intval', $visibles)) . ')' : '0';
  $st = $db->prepare('SELECT c.id FROM clientes c WHERE ' . implode(' AND ', $w) . ' LIMIT 1000');
  $st->execute($p);
  $n = 0;
  foreach ($st->fetchAll(PDO::FETCH_COLUMN) as $cid) if (fl_inscribir($f, (int)$cid, 'manual (' . $user['nombre'] . ')')) $n++;
  icc_json(['ok' => true, 'inscritos' => $n]);
}

if ($accion === 'tick' && $metodo === 'POST') {
  icc_json(['ok' => true, 'texto' => fl_tick()]);
}

icc_json(['error' => 'Acción no soportada.'], 400);
