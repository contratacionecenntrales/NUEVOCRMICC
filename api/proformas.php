<?php
require __DIR__ . '/config.php';

$user = icc_require_auth();
icc_require_permiso_metodo($user, ['GET' => 'proformas.ver', 'POST' => 'proformas.crear', 'PUT' => 'proformas.crear', 'DELETE' => 'proformas.borrar']);
$metodo = $_SERVER['REQUEST_METHOD'];
$id = isset($_GET['id']) ? (int)$_GET['id'] : null;
$facturadoPorValidos = ['ICC', 'ELITE_ENERGY', 'EVOLVIX_GLOBAL'];

if ($metodo === 'GET' && $id === null) {
  $db = icc_db();
  $where = [];
  $params = [];

  $idsEquipo = icc_equipo_comercial_ids($user);
  if ($idsEquipo !== null) {
    $where[] = 'comercial_id IN (' . implode(',', array_fill(0, count($idsEquipo), '?')) . ')';
    array_push($params, ...$idsEquipo);
  }
  if (!empty($_GET['facturado_por']) && in_array($_GET['facturado_por'], $facturadoPorValidos, true)) {
    $where[] = 'facturado_por = ?';
    $params[] = $_GET['facturado_por'];
  }
  if (!empty($_GET['estado_pago']) && in_array($_GET['estado_pago'], ['pagada', 'pendiente'], true)) {
    $where[] = 'estado_pago = ?';
    $params[] = $_GET['estado_pago'];
  }
  if (!empty($_GET['desde'])) { $where[] = 'fecha >= ?'; $params[] = $_GET['desde']; }
  if (!empty($_GET['hasta'])) { $where[] = 'fecha <= ?'; $params[] = $_GET['hasta']; }
  if (!empty($_GET['numero'])) { $where[] = 'numero LIKE ?'; $params[] = '%' . $_GET['numero'] . '%'; }
  if (!empty($_GET['email'])) { $where[] = 'cliente_email LIKE ?'; $params[] = '%' . $_GET['email'] . '%'; }

  $sql = 'SELECT p.*, u.nombre AS comercial_nombre FROM proformas p LEFT JOIN usuarios u ON u.id = p.comercial_id';
  if ($where) $sql .= ' WHERE ' . implode(' AND ', $where);
  $sql .= ' ORDER BY p.fecha DESC LIMIT 500';

  $stmt = $db->prepare($sql);
  $stmt->execute($params);
  icc_json(['proformas' => $stmt->fetchAll()]);
}

if ($metodo === 'POST' && $id === null) {
  icc_require_csrf();
  $numero = trim($_POST['numero'] ?? '');
  $facturadoPor = $_POST['facturado_por'] ?? '';
  $fecha = $_POST['fecha'] ?? '';
  if ($numero === '' || !in_array($facturadoPor, $facturadoPorValidos, true) || $fecha === '') {
    icc_json(['error' => 'Numero, facturado por y fecha son obligatorios'], 400);
  }

  $rutaGuardada = null;
  if (!empty($_FILES['archivo']) && $_FILES['archivo']['error'] === UPLOAD_ERR_OK) {
    $archivo = $_FILES['archivo'];
    if ($archivo['size'] > 15 * 1024 * 1024) icc_json(['error' => 'El archivo supera los 15 MB'], 400);
    $destinoDir = ICC_STORAGE_DIR . '/proformas';
    if (!is_dir($destinoDir)) mkdir($destinoDir, 0755, true);
    $nombreFinal = time() . '-' . icc_slug_archivo($archivo['name']);
    if (move_uploaded_file($archivo['tmp_name'], $destinoDir . '/' . $nombreFinal)) {
      $rutaGuardada = $nombreFinal;
    }
  }

  $db = icc_db();
  $stmt = $db->prepare(
    'INSERT INTO proformas (numero, facturado_por, comercial_id, cliente_email, importe, estado_pago, fecha, ruta_archivo, notas)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  $stmt->execute([
    $numero,
    $facturadoPor,
    !empty($_POST['comercial_id']) && icc_puede_ver_comercial($user, (int)$_POST['comercial_id']) ? (int)$_POST['comercial_id'] : $user['id'],
    trim($_POST['cliente_email'] ?? ''),
    !empty($_POST['importe']) ? $_POST['importe'] : 0,
    in_array($_POST['estado_pago'] ?? '', ['pagada', 'pendiente'], true) ? $_POST['estado_pago'] : 'pendiente',
    $fecha,
    $rutaGuardada,
    trim($_POST['notas'] ?? ''),
  ]);
  icc_json(['id' => (int)$db->lastInsertId()], 201);
}

if ($metodo === 'PUT' && $id !== null) {
  icc_require_csrf();
  $db = icc_db();
  $stmt = $db->prepare('SELECT * FROM proformas WHERE id = ?');
  $stmt->execute([$id]);
  $proforma = $stmt->fetch();
  $visible = $proforma && icc_puede_ver_comercial($user, $proforma['comercial_id']);
  if (!$visible) icc_json(['error' => 'No encontrado'], 404);

  $body = icc_body();
  if (array_key_exists('estado_pago', $body) && in_array($body['estado_pago'], ['pagada', 'pendiente'], true)) {
    $db->prepare('UPDATE proformas SET estado_pago = ? WHERE id = ?')->execute([$body['estado_pago'], $id]);
  }
  icc_json(['ok' => true]);
}

if ($metodo === 'DELETE' && $id !== null) {
  icc_require_csrf();
  $db = icc_db();
  $stmt = $db->prepare('SELECT ruta_archivo FROM proformas WHERE id = ?');
  $stmt->execute([$id]);
  $proforma = $stmt->fetch();
  if ($proforma && $proforma['ruta_archivo']) {
    $ruta = ICC_STORAGE_DIR . '/proformas/' . $proforma['ruta_archivo'];
    if (is_file($ruta)) @unlink($ruta);
  }
  $db->prepare('DELETE FROM proformas WHERE id = ?')->execute([$id]);
  icc_json(['ok' => true]);
}

icc_json(['error' => 'Peticion no valida'], 404);
