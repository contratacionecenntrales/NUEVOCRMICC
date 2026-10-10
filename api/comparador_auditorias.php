<?php
/**
 * ICC CRM · Historico de comparativas generadas por el Comparador, siempre
 * ligadas a un cliente existente del CRM (misma logica de visibilidad que
 * estudios.php: backoffice/jefe_de_equipo/admin ven todo, el comercial solo
 * las de sus propios clientes).
 */
require __DIR__ . '/config.php';

$user = icc_require_auth();
$metodo = $_SERVER['REQUEST_METHOD'];
$db = icc_db();

function icc_cliente_visible(array $cliente, array $user): bool {
  return icc_puede_ver_comercial($user, $cliente['comercial_id'] ?? null);
}

if ($metodo === 'GET') {
  $clienteId = (int)($_GET['cliente_id'] ?? 0);
  if (!$clienteId) icc_json(['error' => 'Falta cliente_id'], 400);

  $stmt = $db->prepare('SELECT * FROM clientes WHERE id = ?');
  $stmt->execute([$clienteId]);
  $cliente = $stmt->fetch();
  if (!$cliente || !icc_cliente_visible($cliente, $user)) icc_json(['error' => 'No encontrado'], 404);

  $stmt = $db->prepare('SELECT * FROM comparador_auditorias WHERE cliente_id = ? ORDER BY created_at DESC');
  $stmt->execute([$clienteId]);
  $filas = array_map(function ($f) {
    $f['id'] = (int)$f['id'];
    $f['cliente_id'] = (int)$f['cliente_id'];
    $f['gestor_id'] = $f['gestor_id'] !== null ? (int)$f['gestor_id'] : null;
    foreach (['coste_actual_anual', 'coste_propuesto_anual', 'ahorro_anual', 'ahorro_porcentaje'] as $c) {
      $f[$c] = $f[$c] !== null ? (float)$f[$c] : null;
    }
    $f['datos_entrada'] = json_decode($f['datos_entrada'], true);
    $f['resultado'] = json_decode($f['resultado'], true);
    return $f;
  }, $stmt->fetchAll());
  icc_json(['auditorias' => $filas]);
}

if ($metodo === 'POST') {
  icc_require_csrf();
  $body = icc_body();

  $clienteId = (int)($body['cliente_id'] ?? 0);
  $sector = $body['sector'] ?? '';
  if (!$clienteId) icc_json(['error' => 'Falta cliente_id'], 400);
  if (!in_array($sector, ['energia', 'telefonia', 'alarmas'], true)) icc_json(['error' => 'Sector no valido'], 422);

  $stmt = $db->prepare('SELECT * FROM clientes WHERE id = ?');
  $stmt->execute([$clienteId]);
  $cliente = $stmt->fetch();
  if (!$cliente || !icc_cliente_visible($cliente, $user)) icc_json(['error' => 'Cliente no encontrado'], 404);

  $stmt = $db->prepare(
    'INSERT INTO comparador_auditorias
      (cliente_id, gestor_id, sector, datos_entrada, resultado,
       coste_actual_anual, coste_propuesto_anual, ahorro_anual, ahorro_porcentaje)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  $stmt->execute([
    $clienteId,
    $user['id'],
    $sector,
    json_encode($body['datos_entrada'] ?? new stdClass(), JSON_UNESCAPED_UNICODE),
    json_encode($body['resultado'] ?? new stdClass(), JSON_UNESCAPED_UNICODE),
    $body['coste_actual_anual'] ?? null,
    $body['coste_propuesto_anual'] ?? null,
    $body['ahorro_anual'] ?? null,
    $body['ahorro_porcentaje'] ?? null,
  ]);

  icc_json(['id' => (int)$db->lastInsertId()], 201);
}

icc_json(['error' => 'Metodo no permitido'], 405);
