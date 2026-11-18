<?php
/**
 * ICC CRM · Campaña de llamadas a negocios sin web. Direccion y jefes de equipo
 * ven todo, buscan y reparten; comerciales y backoffice ven y llaman lo suyo.
 *
 * GET  ?action=lista[&estado=&comarca=&sector=&asignado=&q=&solo_hoy=1]
 * GET  ?action=exportar (CSV, direccion y jefes)
 * POST ?action=buscar {sectores[], ubicaciones[]}  · repartir {usuarios[], por_persona, comarca?, sector?}
 * POST ?action=resultado {id, resultado, nota?, cuando?}   · tomar {id} (asignarme)
 * PUT  ?action=guion {guion}
 */
require __DIR__ . '/config.php';
require_once __DIR__ . '/sinweb_lib.php';

$user = icc_require_auth();
$esDir = icc_ve_ia_equipo($user);
$esLlamador = in_array($user['rol'], ['comercial', 'backoffice'], true);
if (!$esDir && !$esLlamador) icc_json(['error' => 'No encontrado'], 404);
$metodo = $_SERVER['REQUEST_METHOD'];
$accion = (string)($_GET['action'] ?? 'lista');
if ($metodo !== 'GET') icc_require_csrf();
$body = $metodo === 'GET' ? [] : icc_body();
$db = icc_db();
$uid = (int)$user['id'];
$visibles = icc_equipo_comercial_ids($user); // jefe: su equipo
function sw_solo_dir(bool $d): void { if (!$d) icc_json(['error' => 'Solo dirección y jefes de equipo.'], 403); }

/** Filtro de visibilidad: comercial/backoffice lo suyo; jefe su equipo y lo sin asignar; direccion todo. */
function sw_vis(bool $esDir, ?array $visibles, int $uid): string {
  if (!$esDir) return 'l.llamada_asignado = ' . $uid;
  if ($visibles === null) return '1 = 1';
  return '(l.llamada_asignado IS NULL OR l.llamada_asignado IN (' . implode(',', array_map('intval', $visibles ?: [0])) . '))';
}

if ($accion === 'lista' && $metodo === 'GET') {
  $w = [sw_where(), sw_vis($esDir, $visibles, $uid)]; $p = [];
  // Los finales (interesado, no interesa) se ven aunque ya no esten en la campaña activa.
  $w[0] = "l.web = '' AND l.telefono <> '' AND (l.estado NOT IN ('baja','descartado') AND l.cliente_id IS NULL OR l.llamada_estado IN ('interesado','no_interesa','no_llamar'))";
  $est = (string)($_GET['estado'] ?? '');
  if ($est === 'hoy') $w[] = "l.llamada_estado IN ('pendiente','volver','no_contesta') AND (l.llamada_proxima IS NULL OR l.llamada_proxima <= NOW() + INTERVAL 30 MINUTE)";
  elseif ($est === 'sin_asignar') $w[] = "l.llamada_estado = ''";
  elseif ($est !== '' && isset(SW_ESTADOS[$est])) { $w[] = 'l.llamada_estado = ?'; $p[] = $est; }
  foreach (['comarca', 'sector', 'concejo'] as $k) if (!empty($_GET[$k])) { $w[] = "l.$k = ?"; $p[] = (string)$_GET[$k]; }
  if ($esDir && !empty($_GET['asignado'])) { $w[] = 'l.llamada_asignado = ?'; $p[] = (int)$_GET['asignado']; }
  if (!empty($_GET['q'])) { $w[] = '(l.nombre LIKE ? OR l.telefono LIKE ? OR l.direccion LIKE ?)'; $q = '%' . $_GET['q'] . '%'; array_push($p, $q, $q, $q); }
  $st = $db->prepare("SELECT l.id, l.nombre, l.sector, l.direccion, l.localidad, l.concejo, l.comarca, l.telefono, l.place_id, l.llamada_estado, l.llamada_asignado, l.llamada_proxima, l.llamada_intentos, l.llamada_nota, l.llamada_en,
      CONCAT(u.nombre, ' ', COALESCE(u.apellidos, '')) asignado FROM motor_leads l LEFT JOIN usuarios u ON u.id = l.llamada_asignado WHERE " . implode(' AND ', $w) . "
      ORDER BY FIELD(l.llamada_estado, 'volver', 'pendiente', 'no_contesta', '', 'interesado', 'agotado', 'no_interesa', 'no_llamar'), l.llamada_proxima IS NULL, l.llamada_proxima, l.comarca, l.concejo, l.nombre LIMIT 500");
  $st->execute($p);
  $filas = $st->fetchAll();
  foreach ($filas as &$f) $f['sector_nombre'] = MOTOR_SECTORES[$f['sector']][0] ?? $f['sector'];
  unset($f);
  $vis = sw_vis($esDir, $visibles, $uid);
  $cont = $db->query("SELECT l.llamada_estado e, COUNT(*) n FROM motor_leads l WHERE l.web = '' AND l.telefono <> '' AND $vis GROUP BY l.llamada_estado")->fetchAll(PDO::FETCH_KEY_PAIR);
  $hoy = (int)$db->query("SELECT COUNT(*) FROM motor_leads l WHERE " . sw_where() . " AND $vis AND l.llamada_estado IN ('pendiente','volver','no_contesta') AND (l.llamada_proxima IS NULL OR l.llamada_proxima <= NOW() + INTERVAL 30 MINUTE)")->fetchColumn();
  $mias = (int)$db->query("SELECT COUNT(*) FROM motor_llamadas WHERE usuario_id = $uid AND created_at >= CURDATE()")->fetchColumn();
  $porUsuario = $esDir ? $db->query("SELECT u.id, CONCAT(u.nombre, ' ', COALESCE(u.apellidos, '')) nombre, SUM(l.llamada_estado IN ('pendiente','volver','no_contesta')) pendientes, SUM(l.llamada_estado = 'interesado') interesados,
      (SELECT COUNT(*) FROM motor_llamadas m WHERE m.usuario_id = u.id AND m.created_at >= CURDATE()) llamadas_hoy
      FROM usuarios u LEFT JOIN motor_leads l ON l.llamada_asignado = u.id WHERE u.bloqueado = 0 AND u.rol IN ('comercial','jefe_de_equipo','backoffice')" . ($visibles !== null ? ' AND u.id IN (' . implode(',', array_map('intval', $visibles ?: [0])) . ')' : '') . " GROUP BY u.id ORDER BY nombre")->fetchAll() : [];
  $comarcas = $db->query("SELECT l.comarca, COUNT(*) n FROM motor_leads l WHERE " . sw_where() . " AND l.comarca <> '' GROUP BY l.comarca ORDER BY n DESC")->fetchAll();
  icc_json(['negocios' => $filas, 'contadores' => $cont, 'para_hoy' => $hoy, 'mis_llamadas_hoy' => $mias, 'usuarios' => $porUsuario, 'comarcas' => $comarcas,
    'sectores' => array_map(function ($s) { return $s[0]; }, MOTOR_SECTORES), 'zonas' => MOTOR_ZONAS, 'estados' => SW_ESTADOS, 'resultados' => SW_RESULTADOS, 'guion' => sw_guion(),
    'places' => icc_places_clave() !== '', 'es_dir' => $esDir, 'es_config' => icc_ve_config_ia($user), 'yo' => $uid]);
}

if ($accion === 'exportar' && $metodo === 'GET') {
  sw_solo_dir($esDir);
  $vis = sw_vis(true, $visibles, $uid);
  $st = $db->query("SELECT l.nombre, l.sector, l.telefono, l.direccion, l.concejo, l.comarca, l.llamada_estado, l.llamada_nota FROM motor_leads l WHERE " . sw_where() . " AND $vis ORDER BY l.comarca, l.concejo, l.nombre");
  header('Content-Type: text/csv; charset=utf-8');
  header('Content-Disposition: attachment; filename="negocios-sin-web-asturias-' . date('Y-m-d') . '.csv"');
  $out = fopen('php://output', 'w');
  fwrite($out, "\xEF\xBB\xBF");
  fputcsv($out, ['Negocio', 'Sector', 'Teléfono', 'Dirección', 'Concejo', 'Comarca', 'Estado', 'Nota'], ';');
  $limpia = function ($v) { $v = (string)$v; return preg_match('/^[=+\-@\t\r]/', $v) ? "'" . $v : $v; }; // sin formulas en Excel
  foreach ($st as $r) fputcsv($out, array_map($limpia, [$r['nombre'], MOTOR_SECTORES[$r['sector']][0] ?? $r['sector'], $r['telefono'], $r['direccion'], $r['concejo'], $r['comarca'], SW_ESTADOS[$r['llamada_estado']] ?? $r['llamada_estado'], $r['llamada_nota']]), ';');
  fclose($out);
  icc_seg_anota('Exportación de la campaña sin web', $user['nombre'], $uid);
  exit;
}

if ($accion === 'buscar' && $metodo === 'POST') {
  sw_solo_dir($esDir);
  if (icc_places_clave() === '') icc_json(['error' => 'Falta la clave de Google Places (Motor → Fábrica de agentes → Agente Scraper).'], 422);
  $sect = array_values(array_filter((array)($body['sectores'] ?? []), function ($s) { return isset(MOTOR_SECTORES[$s]); }));
  $ubic = array_values(array_filter(array_map(function ($u) { return mb_substr(trim((string)$u), 0, 80); }, (array)($body['ubicaciones'] ?? []))));
  if (!$sect || !$ubic) icc_json(['error' => 'Elige al menos un sector y una zona.'], 422);
  @set_time_limit(280);
  $r = sw_buscar($sect, $ubic, $uid);
  icc_json(['ok' => true] + $r + ['texto' => $r['sin_web'] . ' negocios nuevos sin web con teléfono (' . $r['nuevos'] . ' encontrados en ' . $r['consultas'] . ' búsquedas).']);
}

if ($accion === 'repartir' && $metodo === 'POST') {
  sw_solo_dir($esDir);
  $us = array_map('intval', (array)($body['usuarios'] ?? []));
  if ($visibles !== null) $us = array_values(array_intersect($us, $visibles));
  $r = sw_repartir($us, (int)($body['por_persona'] ?? 30), ['comarca' => (string)($body['comarca'] ?? ''), 'sector' => (string)($body['sector'] ?? '')], $uid);
  icc_json(['ok' => true, 'texto' => array_sum($r) . ' negocios repartidos entre ' . count(array_filter($r)) . ' personas.']);
}

if ($accion === 'tomar' && $metodo === 'POST') {
  $id = (int)($body['id'] ?? 0);
  $st = $db->prepare("UPDATE motor_leads l SET llamada_asignado = ?, llamada_estado = IF(llamada_estado = '', 'pendiente', llamada_estado) WHERE id = ? AND llamada_asignado IS NULL AND " . sw_where());
  $st->execute([$uid, $id]);
  icc_json($st->rowCount() ? ['ok' => true] : ['error' => 'Ya lo tiene otra persona.'], $st->rowCount() ? 200 : 409);
}

if ($accion === 'resultado' && $metodo === 'POST') {
  $id = (int)($body['id'] ?? 0);
  $st = $db->prepare('SELECT llamada_asignado FROM motor_leads l WHERE id = ? AND ' . sw_vis($esDir, $visibles, $uid));
  $st->execute([$id]);
  if ($st->fetch() === false) icc_json(['error' => 'No encontrado.'], 404);
  try { icc_json(['ok' => true, 'texto' => sw_resultado($id, (string)($body['resultado'] ?? ''), (string)($body['nota'] ?? ''), isset($body['cuando']) ? (string)$body['cuando'] : null, $uid)]); }
  catch (InvalidArgumentException $e) { icc_json(['error' => $e->getMessage()], 422); }
}

if ($accion === 'guion' && $metodo === 'PUT') {
  if (!icc_ve_config_ia($user)) icc_json(['error' => 'Solo coordinación y administración cambian el guion.'], 403);
  icc_ajuste_guardar('sinweb_guion', mb_substr(trim((string)($body['guion'] ?? '')), 0, 4000), false, $uid);
  icc_json(['ok' => true]);
}

icc_json(['error' => 'Acción no soportada.'], 400);
