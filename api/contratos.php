<?php
require __DIR__ . '/config.php';

$user = icc_require_auth();
icc_require_permiso_metodo($user, ['GET' => 'contratos.ver', 'POST' => 'contratos.crear', 'PUT' => 'contratos.crear', 'DELETE' => 'contratos.borrar']);
$metodo = $_SERVER['REQUEST_METHOD'];
$id = isset($_GET['id']) ? (int)$_GET['id'] : null;
$estadosValidos = ['tramitado', 'ok', 'ko', 'incidencias', 'verificado', 'decomisionado', 'en_distribuidora'];
$sectoresValidos = ['alarmas', 'energia', 'telecomunicaciones', 'seguros', 'financiero'];

if ($metodo === 'GET' && $id === null) {
  $db = icc_db();
  $where = [];
  $params = [];

  $idsEquipo = icc_equipo_comercial_ids($user);
  if ($idsEquipo !== null) {
    $where[] = 'comercial_id IN (' . implode(',', array_fill(0, count($idsEquipo), '?')) . ')';
    array_push($params, ...$idsEquipo);
  }
  if (!empty($_GET['comercial_id']) && icc_puede_ver_comercial($user, (int)$_GET['comercial_id'])) {
    $where[] = 'comercial_id = ?';
    $params[] = (int)$_GET['comercial_id'];
  }
  if (!empty($_GET['estado']) && in_array($_GET['estado'], $estadosValidos, true)) {
    $where[] = 'estado = ?';
    $params[] = $_GET['estado'];
  }
  if (!empty($_GET['sector']) && in_array($_GET['sector'], $sectoresValidos, true)) {
    $where[] = 'sector = ?';
    $params[] = $_GET['sector'];
  }
  if (!empty($_GET['comercializadora'])) {
    $where[] = 'comercializadora = ?';
    $params[] = $_GET['comercializadora'];
  }
  if (!empty($_GET['tarifa'])) {
    $where[] = 'tarifa = ?';
    $params[] = $_GET['tarifa'];
  }
  if (!empty($_GET['desde'])) {
    $where[] = 'fecha_alta >= ?';
    $params[] = $_GET['desde'];
  }
  if (!empty($_GET['hasta'])) {
    $where[] = 'fecha_alta <= ?';
    $params[] = $_GET['hasta'];
  }
  if (!empty($_GET['q'])) {
    $where[] = '(numero_contrato LIKE ? OR titular LIKE ? OR cif_titular LIKE ?)';
    $like = '%' . $_GET['q'] . '%';
    array_push($params, $like, $like, $like);
  }

  $sql = 'SELECT c.*, u.nombre AS comercial_nombre FROM contratos c LEFT JOIN usuarios u ON u.id = c.comercial_id';
  if ($where) $sql .= ' WHERE ' . implode(' AND ', $where);
  $sql .= ' ORDER BY c.created_at DESC LIMIT 500';

  $stmt = $db->prepare($sql);
  $stmt->execute($params);
  icc_json(['contratos' => $stmt->fetchAll()]);
}

if ($metodo === 'GET' && $id !== null) {
  $db = icc_db();
  $stmt = $db->prepare('SELECT * FROM contratos WHERE id = ?');
  $stmt->execute([$id]);
  $contrato = $stmt->fetch();
  $visible = $contrato && icc_puede_ver_comercial($user, $contrato['comercial_id']);
  if (!$visible) icc_json(['error' => 'No encontrado'], 404);
  icc_json(['contrato' => $contrato]);
}

if ($metodo === 'POST' && $id === null) {
  icc_require_csrf();
  $body = icc_body();
  $titular = trim($body['titular'] ?? '');
  $fechaAlta = $body['fecha_alta'] ?? '';
  if ($titular === '' || $fechaAlta === '') icc_json(['error' => 'Titular y fecha de alta son obligatorios'], 400);

  $db = icc_db();
  $stmt = $db->prepare(
    'INSERT INTO contratos (cliente_id, comercial_id, sector, numero_contrato, titular, cif_titular, tarifa, comercializadora, kw, estado, fecha_alta, fecha_activacion, notas)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  $estado = in_array($body['estado'] ?? '', $estadosValidos, true) ? $body['estado'] : 'tramitado';
  $sector = in_array($body['sector'] ?? '', $sectoresValidos, true) ? $body['sector'] : 'energia';
  $stmt->execute([
    !empty($body['cliente_id']) ? (int)$body['cliente_id'] : null,
    !empty($body['comercial_id']) && icc_puede_ver_comercial($user, (int)$body['comercial_id']) ? (int)$body['comercial_id'] : $user['id'],
    $sector,
    trim($body['numero_contrato'] ?? ''),
    $titular,
    trim($body['cif_titular'] ?? ''),
    trim($body['tarifa'] ?? ''),
    trim($body['comercializadora'] ?? ''),
    $body['kw'] !== '' && isset($body['kw']) ? $body['kw'] : null,
    $estado,
    $fechaAlta,
    !empty($body['fecha_activacion']) ? $body['fecha_activacion'] : null,
    trim($body['notas'] ?? ''),
  ]);
  icc_json(['id' => (int)$db->lastInsertId()], 201);
}

if ($metodo === 'PUT' && $id !== null) {
  icc_require_csrf();
  $db = icc_db();
  $stmt = $db->prepare('SELECT * FROM contratos WHERE id = ?');
  $stmt->execute([$id]);
  $contrato = $stmt->fetch();
  $visible = $contrato && icc_puede_ver_comercial($user, $contrato['comercial_id']);
  if (!$visible) icc_json(['error' => 'No encontrado'], 404);

  $body = icc_body();
  $campos = ['numero_contrato', 'titular', 'cif_titular', 'tarifa', 'comercializadora', 'kw', 'fecha_alta', 'fecha_activacion', 'notas'];
  $sets = [];
  $valores = [];
  foreach ($campos as $campo) {
    if (array_key_exists($campo, $body)) {
      $sets[] = "$campo = ?";
      $valores[] = $body[$campo] === '' ? null : $body[$campo];
    }
  }
  if (array_key_exists('estado', $body) && in_array($body['estado'], $estadosValidos, true)) {
    $sets[] = 'estado = ?';
    $valores[] = $body['estado'];
  }
  if (array_key_exists('sector', $body) && in_array($body['sector'], $sectoresValidos, true)) {
    $sets[] = 'sector = ?';
    $valores[] = $body['sector'];
  }
  if (!$sets) icc_json(['ok' => true]);
  $valores[] = $id;
  $db->prepare('UPDATE contratos SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($valores);
  icc_json(['ok' => true]);
}

if ($metodo === 'DELETE' && $id !== null) {
  icc_require_csrf();
  $db = icc_db();
  $stmt = $db->prepare('SELECT comercial_id FROM contratos WHERE id = ?');
  $stmt->execute([$id]);
  $contrato = $stmt->fetch();
  $puedeBorrar = $contrato && icc_puede_ver_comercial($user, $contrato['comercial_id']);
  if (!$puedeBorrar) icc_json(['error' => 'No encontrado'], 404);
  $db->prepare('DELETE FROM contratos WHERE id = ?')->execute([$id]);
  icc_json(['ok' => true]);
}

icc_json(['error' => 'Peticion no valida'], 404);
