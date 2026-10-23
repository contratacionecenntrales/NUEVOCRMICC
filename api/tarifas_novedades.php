<?php
/**
 * ICC CRM · Novedades de tarifas (lo que cambia tramitacion en los comparadores).
 *
 *   GET                      listado (filtros: tipo, accion, desde=YYYY-MM-DD, q, pagina)
 *   GET  ?contador=1         { no_vistas, ultima } para el aviso y el contador del menu
 *   POST ?accion=vistas      marca todo como visto para quien lo pide
 *
 * Lo ve quien usa los comparadores (permiso comparador.usar). Sin la migracion
 * sql/migracion_tarifas_novedades.sql responde vacio (disponible: false).
 */
require __DIR__ . '/config.php';
require_once __DIR__ . '/tarifas_novedades_lib.php';

$user = icc_require_auth();
icc_require_permiso($user, 'comparador.usar');
$metodo = $_SERVER['REQUEST_METHOD'];
$db = icc_db();
$uid = (int)$user['id'];

if (!nov_disponible()) {
  icc_json(['disponible' => false, 'novedades' => [], 'no_vistas' => 0, 'hay_mas' => false]);
}

/** Ultima novedad vista por el usuario (0 = ninguna). */
function nov_ultima_vista(PDO $db, int $uid): int {
  try {
    $stmt = $db->prepare('SELECT ultima_id FROM tarifas_novedades_vistas WHERE usuario_id = ?');
    $stmt->execute([$uid]);
    return (int)$stmt->fetchColumn();
  } catch (PDOException $e) {
    return 0;
  }
}

/** Novedades sin ver de los ultimos 30 dias (lo mas antiguo ya no es "nuevo"). */
function nov_no_vistas(PDO $db, int $uid): int {
  $stmt = $db->prepare('SELECT COUNT(*) FROM tarifas_novedades WHERE id > ? AND created_at >= (NOW() - INTERVAL 30 DAY) AND (autor_id IS NULL OR autor_id <> ?)');
  $stmt->execute([nov_ultima_vista($db, $uid), $uid]);
  return (int)$stmt->fetchColumn();
}

if ($metodo === 'GET' && !empty($_GET['contador'])) {
  $stmt = $db->prepare('SELECT id, tipo, titulo, created_at FROM tarifas_novedades WHERE id > ? AND (autor_id IS NULL OR autor_id <> ?) ORDER BY id DESC LIMIT 1');
  $stmt->execute([nov_ultima_vista($db, $uid), $uid]);
  $ultima = $stmt->fetch() ?: null;
  icc_json(['disponible' => true, 'no_vistas' => nov_no_vistas($db, $uid), 'ultima' => $ultima]);
}

if ($metodo === 'GET') {
  $where = [];
  $params = [];
  if (in_array($_GET['tipo'] ?? '', ['energia', 'telefonia'], true)) {
    $where[] = 'n.tipo = ?';
    $params[] = $_GET['tipo'];
  }
  if (in_array($_GET['accion'] ?? '', ['alta', 'cambio', 'baja'], true)) {
    $where[] = 'n.accion = ?';
    $params[] = $_GET['accion'];
  }
  if (!empty($_GET['desde']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $_GET['desde'])) {
    $where[] = 'n.created_at >= ?';
    $params[] = $_GET['desde'] . ' 00:00:00';
  }
  $q = trim((string)($_GET['q'] ?? ''));
  if ($q !== '') {
    $where[] = '(n.titulo LIKE ? OR n.detalle LIKE ?)';
    $params[] = '%' . $q . '%';
    $params[] = '%' . $q . '%';
  }
  $porPagina = 60;
  $pagina = max(1, (int)($_GET['pagina'] ?? 1));
  $sql = 'SELECT n.id, n.tipo, n.accion, n.titulo, n.detalle, n.referencia_id, n.autor_id, n.created_at,
                 TRIM(CONCAT(COALESCE(u.nombre, \'\'), \' \', COALESCE(u.apellidos, \'\'))) AS autor_nombre
          FROM tarifas_novedades n LEFT JOIN usuarios u ON u.id = n.autor_id'
    . ($where ? ' WHERE ' . implode(' AND ', $where) : '')
    . ' ORDER BY n.id DESC LIMIT ' . ($porPagina + 1) . ' OFFSET ' . (($pagina - 1) * $porPagina);
  $stmt = $db->prepare($sql);
  $stmt->execute($params);
  $filas = $stmt->fetchAll();
  $hayMas = count($filas) > $porPagina;
  $filas = array_slice($filas, 0, $porPagina);
  $ultimaVista = nov_ultima_vista($db, $uid);
  $out = array_map(function ($f) use ($ultimaVista, $uid) {
    $detalle = json_decode((string)$f['detalle'], true);
    return [
      'id' => (int)$f['id'],
      'tipo' => $f['tipo'],
      'accion' => $f['accion'],
      'titulo' => $f['titulo'],
      'detalle' => is_array($detalle) ? $detalle : ['cambios' => [], 'texto' => (string)$f['detalle']],
      'referencia_id' => $f['referencia_id'] !== null ? (int)$f['referencia_id'] : null,
      'autor_nombre' => $f['autor_nombre'] !== '' ? $f['autor_nombre'] : null,
      'created_at' => $f['created_at'],
      'nueva' => (int)$f['id'] > $ultimaVista && (int)$f['autor_id'] !== $uid,
    ];
  }, $filas);
  // Resumen del ultimo mes para la cabecera.
  $res = $db->query(
    "SELECT COUNT(*) AS total, SUM(tipo = 'energia') AS energia, SUM(tipo = 'telefonia') AS telefonia,
            SUM(created_at >= CURDATE()) AS hoy
     FROM tarifas_novedades WHERE created_at >= (NOW() - INTERVAL 30 DAY)"
  )->fetch();
  icc_json([
    'disponible' => true,
    'novedades' => $out,
    'hay_mas' => $hayMas,
    'pagina' => $pagina,
    'no_vistas' => nov_no_vistas($db, $uid),
    'resumen' => [
      'total_30d' => (int)$res['total'], 'energia_30d' => (int)$res['energia'],
      'telefonia_30d' => (int)$res['telefonia'], 'hoy' => (int)$res['hoy'],
    ],
  ]);
}

if ($metodo === 'POST' && ($_GET['accion'] ?? '') === 'vistas') {
  icc_require_csrf();
  $max = (int)$db->query('SELECT COALESCE(MAX(id), 0) FROM tarifas_novedades')->fetchColumn();
  $db->prepare('INSERT INTO tarifas_novedades_vistas (usuario_id, ultima_id, vista_en) VALUES (?, ?, NOW())
                ON DUPLICATE KEY UPDATE ultima_id = GREATEST(ultima_id, VALUES(ultima_id)), vista_en = NOW()')->execute([$uid, $max]);
  // Los avisos de la campana sobre novedades dejan de estar pendientes.
  $db->prepare("UPDATE notificaciones SET leido = 1 WHERE user_id = ? AND tipo = 'tarifas_novedades' AND leido = 0")->execute([$uid]);
  icc_json(['ok' => true, 'no_vistas' => 0]);
}

icc_json(['error' => 'Peticion no valida'], 404);
