<?php
/**
 * ICC CRM · Recuperación de no firmados y ofertas exclusivas del mes.
 * Dirección y jefes de equipo (su equipo); las ofertas las gestionan coordinación,
 * gerencia y admin.
 *
 * GET  ?action=panel
 * POST ?action=analizar · lanzar {id} · objecion {id, objecion, fin_permanencia?} · estado {id, estado}
 * POST ?action=oferta {...} · oferta_borrar {id} · campana_oferta {id}
 */
require __DIR__ . '/config.php';
require_once __DIR__ . '/recuperacion_lib.php';

$user = icc_require_auth();
if (!icc_ve_ia_equipo($user)) icc_json(['error' => 'No encontrado'], 404);
$metodo = $_SERVER['REQUEST_METHOD'];
$accion = (string)($_GET['action'] ?? 'panel');
if ($metodo !== 'GET') icc_require_csrf();
$body = $metodo === 'GET' ? [] : icc_body();
$db = icc_db();
$uid = (int)$user['id'];
$visibles = icc_equipo_comercial_ids($user);
$puedeOfertas = in_array($user['rol'], ['coordinador', 'gerente', 'admin', 'super_admin'], true);
function rc_visible(int $id, ?array $vis): bool {
  if ($vis === null) return true;
  $st = icc_db()->prepare('SELECT c.comercial_id FROM recuperacion r JOIN clientes c ON c.id = r.cliente_id WHERE r.id = ?');
  $st->execute([$id]);
  $g = $st->fetchColumn();
  return $g !== false && in_array((int)$g, $vis, true);
}

if ($accion === 'panel' && $metodo === 'GET') {
  $p = rc_panel($visibles);
  $todas = $db->query('SELECT * FROM ofertas_mes WHERE vigente_hasta >= CURDATE() - INTERVAL 60 DAY ORDER BY vigente_hasta DESC, id DESC LIMIT 50')->fetchAll();
  icc_json($p + ['todas_ofertas' => $todas, 'puede_ofertas' => $puedeOfertas, 'objeciones_lista' => array_map(function ($o) { return $o[0]; }, RC_OBJECIONES)]);
}
if ($accion === 'analizar' && $metodo === 'POST') {
  @set_time_limit(200);
  icc_json(['ok' => true, 'texto' => rc_tick()]);
}
if ($accion === 'lanzar' && $metodo === 'POST') {
  $id = (int)($body['id'] ?? 0);
  if (!rc_visible($id, $visibles)) icc_json(['error' => 'No encontrado.'], 404);
  try { icc_json(['ok' => true, 'texto' => rc_lanzar($id, $uid)]); } catch (InvalidArgumentException $e) { icc_json(['error' => $e->getMessage()], 422); }
}
if ($accion === 'objecion' && $metodo === 'POST') {
  $id = (int)($body['id'] ?? 0);
  if (!rc_visible($id, $visibles)) icc_json(['error' => 'No encontrado.'], 404);
  $o = (string)($body['objecion'] ?? '');
  if (!isset(RC_OBJECIONES[$o])) icc_json(['error' => 'Objeción no válida.'], 422);
  $f = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)($body['fin_permanencia'] ?? '')) ? $body['fin_permanencia'] : null;
  $db->prepare("UPDATE recuperacion SET objecion = ?, fin_permanencia = COALESCE(?, fin_permanencia), ia = 0, estado = IF(estado = 'descartado', 'pendiente', estado) WHERE id = ?")->execute([$o, $f, $id]);
  icc_json(['ok' => true]);
}
if ($accion === 'estado' && $metodo === 'POST') {
  $id = (int)($body['id'] ?? 0);
  if (!rc_visible($id, $visibles)) icc_json(['error' => 'No encontrado.'], 404);
  $e = in_array($body['estado'] ?? '', ['recuperado', 'descartado', 'pendiente'], true) ? $body['estado'] : 'pendiente';
  $db->prepare('UPDATE recuperacion SET estado = ? WHERE id = ?')->execute([$e, $id]);
  icc_json(['ok' => true]);
}
if ($accion === 'oferta' && $metodo === 'POST') {
  if (!$puedeOfertas) icc_json(['error' => 'Solo coordinación, gerencia y administración publican ofertas.'], 403);
  $tit = trim((string)($body['titulo'] ?? ''));
  $desde = (string)($body['vigente_desde'] ?? date('Y-m-d')); $hasta = (string)($body['vigente_hasta'] ?? '');
  if ($tit === '' || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $desde) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $hasta) || $hasta < $desde) icc_json(['error' => 'Pon el título de la oferta y su vigencia (desde y hasta).'], 422);
  if (trim((string)($body['condiciones'] ?? '')) === '') icc_json(['error' => 'Escribe las condiciones reales (permanencia, a quién aplica, requisitos): los agentes las dirán tal cual.'], 422);
  $serv = isset(RC_SERVICIOS[$body['servicio'] ?? '']) ? $body['servicio'] : 'general';
  $args = [$serv, mb_substr(trim((string)($body['compania'] ?? '')), 0, 120), mb_substr($tit, 0, 160), mb_substr((string)($body['descripcion'] ?? ''), 0, 2000), mb_substr((string)$body['condiciones'], 0, 2000), $desde, $hasta, !empty($body['activo']) ? 1 : 0];
  $id = (int)($body['id'] ?? 0);
  if ($id) $db->prepare('UPDATE ofertas_mes SET servicio = ?, compania = ?, titulo = ?, descripcion = ?, condiciones = ?, vigente_desde = ?, vigente_hasta = ?, activo = ? WHERE id = ?')->execute(array_merge($args, [$id]));
  else { $db->prepare('INSERT INTO ofertas_mes (servicio, compania, titulo, descripcion, condiciones, vigente_desde, vigente_hasta, activo, creado_por) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')->execute(array_merge($args, [$uid])); $id = (int)$db->lastInsertId(); }
  icc_seg_anota('Oferta del mes guardada', $tit, $uid);
  icc_json(['ok' => true, 'id' => $id]);
}
if ($accion === 'oferta_borrar' && $metodo === 'POST') {
  if (!$puedeOfertas) icc_json(['error' => 'No permitido.'], 403);
  $db->prepare('UPDATE ofertas_mes SET activo = 0 WHERE id = ?')->execute([(int)($body['id'] ?? 0)]);
  icc_json(['ok' => true]);
}
if ($accion === 'campana_oferta' && $metodo === 'POST') {
  // Llama con la oferta a los no firmados de su servicio que la objecion permite (precio, momento, contento o permanencia ya vencida).
  if (!$puedeOfertas) icc_json(['error' => 'No permitido.'], 403);
  $of = $db->query('SELECT * FROM ofertas_mes WHERE id = ' . (int)($body['id'] ?? 0) . ' AND activo = 1 AND vigente_hasta >= CURDATE()')->fetch();
  if (!$of) icc_json(['error' => 'La oferta no está vigente.'], 422);
  $w = $of['servicio'] === 'general' ? '1 = 1' : 'r.servicio = ' . $db->quote($of['servicio']);
  $l = $db->query("SELECT r.id FROM recuperacion r JOIN clientes c ON c.id = r.cliente_id WHERE $w AND c.no_contactar = 0 AND c.estado <> 'cliente_activo' AND r.estado IN ('pendiente','en_curso')
    AND (r.objecion IN ('precio','momento','contento','otro') OR (r.objecion = 'permanencia' AND (r.fin_permanencia IS NULL OR r.fin_permanencia <= CURDATE() + INTERVAL 45 DAY)))
    AND (r.updated_at < NOW() - INTERVAL 7 DAY OR r.estado = 'pendiente') ORDER BY c.valor_estimado DESC LIMIT 60")->fetchAll(PDO::FETCH_COLUMN);
  $n = 0;
  foreach ($l as $id) { try { rc_lanzar((int)$id, $uid); $n++; } catch (InvalidArgumentException $e) { /* siguiente */ } }
  icc_json(['ok' => true, 'texto' => $n . ' llamadas con la oferta «' . $of['titulo'] . '» en las agendas de los gestores.']);
}
icc_json(['error' => 'Acción no soportada.'], 400);
