<?php
require __DIR__ . '/config.php';

$user = icc_require_auth();
icc_require_permiso_metodo($user, ['GET' => 'clientes.ver', 'POST' => 'clientes.crear', 'PUT' => 'clientes.editar']);
$metodo = $_SERVER['REQUEST_METHOD'];
$id = isset($_GET['id']) ? (int)$_GET['id'] : null;
$tiposClienteValidos = ['residencial', 'pyme', 'comunidad_vecinos', 'gran_cuenta'];

function icc_cliente_visible(array $user, array $cliente): bool {
  return icc_puede_ver_comercial($user, $cliente['comercial_id'] ?? null);
}

function icc_cargar_servicios(PDO $db, int $clienteId): array {
  $stmt = $db->prepare('SELECT servicio FROM cliente_servicios WHERE cliente_id = ?');
  $stmt->execute([$clienteId]);
  return array_column($stmt->fetchAll(), 'servicio');
}

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

  $sql = 'SELECT * FROM clientes';
  if ($where) $sql .= ' WHERE ' . implode(' AND ', $where);
  $sql .= ' ORDER BY created_at DESC';

  $stmt = $db->prepare($sql);
  $stmt->execute($params);
  $clientes = $stmt->fetchAll();
  foreach ($clientes as &$c) {
    $c['servicios'] = icc_cargar_servicios($db, (int)$c['id']);
  }
  icc_json(['clientes' => $clientes]);
}

if ($metodo === 'GET' && $id !== null) {
  $db = icc_db();
  $stmt = $db->prepare('SELECT * FROM clientes WHERE id = ?');
  $stmt->execute([$id]);
  $cliente = $stmt->fetch();
  if (!$cliente || !icc_cliente_visible($user, $cliente)) icc_json(['error' => 'No encontrado'], 404);
  $cliente['servicios'] = icc_cargar_servicios($db, $id);
  icc_json(['cliente' => $cliente]);
}

if ($metodo === 'POST' && $id === null) {
  icc_require_csrf();
  $body = icc_body();
  $razonSocial = trim($body['razon_social'] ?? '');
  $cif = trim($body['cif'] ?? '');
  if ($razonSocial === '' || $cif === '') {
    icc_json(['error' => 'Razon social y CIF son obligatorios'], 400);
  }

  $db = icc_db();
  $db->beginTransaction();
  try {
    $tipoCliente = in_array($body['tipo_cliente'] ?? '', $tiposClienteValidos, true) ? $body['tipo_cliente'] : 'residencial';
    $stmt = $db->prepare(
      'INSERT INTO clientes (comercial_id, razon_social, cif, contacto_nombre, contacto_telefono, contacto_email, sector, tipo_cliente, telefono, email, direccion_suministro, upload_token)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    $stmt->execute([
      $user['id'],
      $razonSocial,
      $cif,
      trim($body['contacto_nombre'] ?? ''),
      trim($body['contacto_telefono'] ?? ''),
      trim($body['contacto_email'] ?? ''),
      trim($body['sector'] ?? ''),
      $tipoCliente,
      trim($body['telefono'] ?? ''),
      trim($body['email'] ?? ''),
      trim($body['direccion_suministro'] ?? ''),
      icc_uuid(),
    ]);
    $nuevoId = (int)$db->lastInsertId();

    $servicios = is_array($body['servicios'] ?? null) ? $body['servicios'] : [];
    $validos = ['energia', 'telecomunicaciones', 'seguros', 'alarmas', 'financiero', 'paginas_web', 'campanas'];
    $insServ = $db->prepare('INSERT INTO cliente_servicios (cliente_id, servicio) VALUES (?, ?)');
    foreach ($servicios as $s) {
      if (in_array($s, $validos, true)) $insServ->execute([$nuevoId, $s]);
    }

    $db->commit();
    icc_json(['id' => $nuevoId], 201);
  } catch (Exception $e) {
    $db->rollBack();
    icc_json(['error' => icc_mensaje_error('No se pudo crear el cliente', $e, $user)], 500);
  }
}

if ($metodo === 'PUT' && $id !== null) {
  icc_require_csrf();
  $db = icc_db();
  $stmt = $db->prepare('SELECT * FROM clientes WHERE id = ?');
  $stmt->execute([$id]);
  $cliente = $stmt->fetch();
  if (!$cliente || !icc_cliente_visible($user, $cliente)) icc_json(['error' => 'No encontrado'], 404);

  $body = icc_body();
  $campos = ['razon_social', 'cif', 'contacto_nombre', 'contacto_telefono', 'contacto_email', 'sector', 'telefono', 'email', 'direccion_suministro', 'notas', 'motivo_perdida'];
  $sets = [];
  $valores = [];
  foreach ($campos as $campo) {
    if (array_key_exists($campo, $body)) {
      $sets[] = "$campo = ?";
      $valores[] = trim((string)$body[$campo]);
    }
  }
  $estadosValidos = ['lead_captado', 'estudio_backoffice', 'oferta_presentada', 'en_cierre', 'cliente_activo', 'perdido'];
  if (array_key_exists('estado', $body) && in_array($body['estado'], $estadosValidos, true)) {
    $sets[] = 'estado = ?';
    $valores[] = $body['estado'];
  }
  if (array_key_exists('tipo_cliente', $body) && in_array($body['tipo_cliente'], $tiposClienteValidos, true)) {
    $sets[] = 'tipo_cliente = ?';
    $valores[] = $body['tipo_cliente'];
  }

  if ($sets) {
    $valores[] = $id;
    $db->prepare('UPDATE clientes SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($valores);

    if (array_key_exists('estado', $body) && $body['estado'] !== $cliente['estado'] && in_array($body['estado'], $estadosValidos, true)) {
      $db->prepare('INSERT INTO historial_estado (cliente_id, estado_anterior, estado_nuevo, cambiado_por) VALUES (?, ?, ?, ?)')
        ->execute([$id, $cliente['estado'], $body['estado'], $user['id']]);
    }
  }

  if (array_key_exists('servicios', $body) && is_array($body['servicios'])) {
    $db->prepare('DELETE FROM cliente_servicios WHERE cliente_id = ?')->execute([$id]);
    $validos = ['energia', 'telecomunicaciones', 'seguros', 'alarmas', 'financiero', 'paginas_web', 'campanas'];
    $insServ = $db->prepare('INSERT INTO cliente_servicios (cliente_id, servicio) VALUES (?, ?)');
    foreach ($body['servicios'] as $s) {
      if (in_array($s, $validos, true)) $insServ->execute([$id, $s]);
    }
  }

  icc_json(['ok' => true]);
}

icc_json(['error' => 'Peticion no valida'], 404);
