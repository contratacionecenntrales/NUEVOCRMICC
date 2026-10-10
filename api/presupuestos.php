<?php
/**
 * ICC CRM · Presupuestos: etapa previa al contrato, un presupuesto por
 * sector/cliente. Al cerrarse genera automaticamente el Contrato
 * correspondiente en la seccion Contratos.
 */
require __DIR__ . '/config.php';

$user = icc_require_auth();
$metodo = $_SERVER['REQUEST_METHOD'];
$id = isset($_GET['id']) ? (int)$_GET['id'] : null;
$sectoresValidos = ['alarmas', 'energia', 'telecomunicaciones', 'seguros', 'financiero'];
$estadosValidos = ['borrador', 'factura_subida', 'estudio_adjunto', 'documentacion_contrato', 'cerrado'];
$tiposSuministroValidos = ['electricidad', 'gas', 'dual'];

function icc_presupuesto_visible(array $user, array $presupuesto): bool {
  return icc_puede_ver_comercial($user, $presupuesto['comercial_id']);
}

if ($metodo === 'GET' && $id === null) {
  $db = icc_db();
  $where = [];
  $params = [];

  $idsEquipo = icc_equipo_comercial_ids($user);
  if ($idsEquipo !== null) {
    $where[] = 'p.comercial_id IN (' . implode(',', array_fill(0, count($idsEquipo), '?')) . ')';
    array_push($params, ...$idsEquipo);
  }
  if (!empty($_GET['estado']) && in_array($_GET['estado'], $estadosValidos, true)) {
    $where[] = 'p.estado = ?';
    $params[] = $_GET['estado'];
  }
  if (!empty($_GET['sector']) && in_array($_GET['sector'], $sectoresValidos, true)) {
    $where[] = 'p.sector = ?';
    $params[] = $_GET['sector'];
  }
  if (!empty($_GET['tipo_cliente']) && in_array($_GET['tipo_cliente'], ['residencial', 'pyme', 'comunidad_vecinos', 'gran_cuenta'], true)) {
    $where[] = 'c.tipo_cliente = ?';
    $params[] = $_GET['tipo_cliente'];
  }
  if (!empty($_GET['cliente_id'])) {
    $where[] = 'p.cliente_id = ?';
    $params[] = (int)$_GET['cliente_id'];
  }

  $sql = 'SELECT p.*, c.razon_social, c.cif, c.tipo_cliente, u.nombre AS comercial_nombre
          FROM presupuestos p
          JOIN clientes c ON c.id = p.cliente_id
          LEFT JOIN usuarios u ON u.id = p.comercial_id';
  if ($where) $sql .= ' WHERE ' . implode(' AND ', $where);
  $sql .= ' ORDER BY p.created_at DESC LIMIT 500';

  $stmt = $db->prepare($sql);
  $stmt->execute($params);
  icc_json(['presupuestos' => $stmt->fetchAll()]);
}

if ($metodo === 'GET' && $id !== null) {
  $db = icc_db();
  $stmt = $db->prepare(
    'SELECT p.*, c.razon_social, c.cif, c.tipo_cliente, c.upload_token, u.nombre AS comercial_nombre
     FROM presupuestos p
     JOIN clientes c ON c.id = p.cliente_id
     LEFT JOIN usuarios u ON u.id = p.comercial_id
     WHERE p.id = ?'
  );
  $stmt->execute([$id]);
  $presupuesto = $stmt->fetch();
  if (!$presupuesto || !icc_presupuesto_visible($user, $presupuesto)) icc_json(['error' => 'No encontrado'], 404);
  icc_json(['presupuesto' => $presupuesto]);
}

if ($metodo === 'POST' && $id === null) {
  icc_require_csrf();
  $body = icc_body();
  $clienteId = (int)($body['cliente_id'] ?? 0);
  $sector = $body['sector'] ?? '';
  if (!$clienteId) icc_json(['error' => 'Falta cliente_id'], 400);
  if (!in_array($sector, $sectoresValidos, true)) icc_json(['error' => 'Sector no valido'], 422);

  $db = icc_db();
  $stmt = $db->prepare('SELECT * FROM clientes WHERE id = ?');
  $stmt->execute([$clienteId]);
  $cliente = $stmt->fetch();
  if (!$cliente || !icc_puede_ver_comercial($user, $cliente['comercial_id'])) icc_json(['error' => 'Cliente no encontrado'], 404);

  $tipoSuministro = in_array($body['tipo_suministro'] ?? '', $tiposSuministroValidos, true) ? $body['tipo_suministro'] : null;
  $consumoAnual = ($body['consumo_anual_kwh'] ?? '') !== '' ? (int)$body['consumo_anual_kwh'] : null;
  $fechaPermanencia = !empty($body['fecha_permanencia']) ? $body['fecha_permanencia'] : null;

  try {
    $ins = $db->prepare(
      'INSERT INTO presupuestos (cliente_id, comercial_id, sector, tipo_suministro, notas, cups, comercializadora_actual, tarifa_actual, potencias_contratadas, consumo_anual_kwh, datos_actuales_otros, fecha_permanencia)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    $ins->execute([
      $clienteId,
      $user['id'],
      $sector,
      $tipoSuministro,
      trim($body['notas'] ?? ''),
      trim($body['cups'] ?? ''),
      trim($body['comercializadora_actual'] ?? ''),
      trim($body['tarifa_actual'] ?? ''),
      trim($body['potencias_contratadas'] ?? ''),
      $consumoAnual,
      trim($body['datos_actuales_otros'] ?? ''),
      $fechaPermanencia,
    ]);
    icc_json(['id' => (int)$db->lastInsertId()], 201);
  } catch (Exception $e) {
    icc_json(['error' => icc_mensaje_error('No se pudo crear el presupuesto', $e, $user)], 500);
  }
}

if ($metodo === 'PUT' && $id !== null) {
  icc_require_csrf();
  $db = icc_db();
  $stmt = $db->prepare('SELECT * FROM presupuestos WHERE id = ?');
  $stmt->execute([$id]);
  $presupuesto = $stmt->fetch();
  if (!$presupuesto || !icc_presupuesto_visible($user, $presupuesto)) icc_json(['error' => 'No encontrado'], 404);

  $body = icc_body();

  if (($body['action'] ?? '') === 'cerrar') {
    if ($presupuesto['estado'] === 'cerrado') icc_json(['error' => 'Este presupuesto ya esta cerrado'], 400);

    $stmt = $db->prepare("SELECT COUNT(*) AS total FROM documentos WHERE presupuesto_id = ? AND tipo = 'contrato_firmado'");
    $stmt->execute([$id]);
    if ((int)$stmt->fetch()['total'] === 0) {
      icc_json(['error' => 'Sube la documentacion de contrato antes de cerrar el presupuesto'], 409);
    }

    $stmt = $db->prepare('SELECT razon_social, cif FROM clientes WHERE id = ?');
    $stmt->execute([$presupuesto['cliente_id']]);
    $cliente = $stmt->fetch();

    $db->beginTransaction();
    try {
      $insContrato = $db->prepare(
        'INSERT INTO contratos (cliente_id, comercial_id, sector, titular, cif_titular, estado, fecha_alta)
         VALUES (?, ?, ?, ?, ?, "tramitado", CURDATE())'
      );
      $insContrato->execute([
        $presupuesto['cliente_id'],
        $presupuesto['comercial_id'],
        $presupuesto['sector'],
        $cliente['razon_social'],
        $cliente['cif'],
      ]);
      $contratoId = (int)$db->lastInsertId();

      $db->prepare('UPDATE presupuestos SET estado = "cerrado", contrato_id = ? WHERE id = ?')->execute([$contratoId, $id]);
      $db->commit();
      icc_json(['ok' => true, 'contrato_id' => $contratoId]);
    } catch (Exception $e) {
      $db->rollBack();
      icc_json(['error' => icc_mensaje_error('No se pudo cerrar el presupuesto', $e, $user)], 500);
    }
  }

  $camposEditables = ['notas', 'cups', 'comercializadora_actual', 'tarifa_actual', 'potencias_contratadas', 'datos_actuales_otros'];
  $sets = [];
  $valores = [];
  foreach ($camposEditables as $campo) {
    if (array_key_exists($campo, $body)) {
      $sets[] = "$campo = ?";
      $valores[] = trim((string)$body[$campo]);
    }
  }
  if (array_key_exists('tipo_suministro', $body)) {
    $sets[] = 'tipo_suministro = ?';
    $valores[] = in_array($body['tipo_suministro'], $tiposSuministroValidos, true) ? $body['tipo_suministro'] : null;
  }
  if (array_key_exists('consumo_anual_kwh', $body)) {
    $sets[] = 'consumo_anual_kwh = ?';
    $valores[] = $body['consumo_anual_kwh'] !== '' ? (int)$body['consumo_anual_kwh'] : null;
  }
  if (array_key_exists('fecha_permanencia', $body)) {
    $sets[] = 'fecha_permanencia = ?';
    $valores[] = $body['fecha_permanencia'] !== '' ? $body['fecha_permanencia'] : null;
  }

  // Reasignar el gestor/comercial: solo Admin, y a quien quiera. Se
  // mantiene tambien en el cliente para que ese comercial pueda ver y
  // gestionar toda la ficha (no solo este presupuesto suelto).
  if (icc_es_admin_o_superior($user) && array_key_exists('comercial_id', $body)) {
    $nuevoComercialId = $body['comercial_id'] !== '' && $body['comercial_id'] !== null ? (int)$body['comercial_id'] : null;
    if ($nuevoComercialId !== null) {
      $stmt = $db->prepare('SELECT id FROM usuarios WHERE id = ?');
      $stmt->execute([$nuevoComercialId]);
      if (!$stmt->fetch()) icc_json(['error' => 'Ese usuario no existe'], 404);
    }
    $sets[] = 'comercial_id = ?';
    $valores[] = $nuevoComercialId;
    $db->prepare('UPDATE clientes SET comercial_id = ? WHERE id = ?')->execute([$nuevoComercialId, $presupuesto['cliente_id']]);
  }

  // Cambio manual de estado: solo Admin. El estado normalmente avanza solo
  // al subir documentos (factura/estudio/contrato), pero un registro
  // importado o un caso especial puede necesitar forzarlo. "cerrado" queda
  // fuera: eso solo se hace con la accion "cerrar" (genera el contrato).
  $estadosManuales = ['borrador', 'factura_subida', 'estudio_adjunto', 'documentacion_contrato'];
  if (icc_es_admin_o_superior($user) && array_key_exists('estado', $body) && in_array($body['estado'], $estadosManuales, true)) {
    $sets[] = 'estado = ?';
    $valores[] = $body['estado'];
  }

  if ($sets) {
    $valores[] = $id;
    try {
      $db->prepare('UPDATE presupuestos SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($valores);
    } catch (Exception $e) {
      icc_json(['error' => icc_mensaje_error('No se pudo guardar', $e, $user)], 500);
    }
  }
  icc_json(['ok' => true]);
}

if ($metodo === 'DELETE' && $id !== null) {
  icc_require_role(['backoffice', 'jefe_de_equipo', 'admin', 'super_admin']);
  icc_require_csrf();
  $db = icc_db();
  $stmt = $db->prepare('SELECT * FROM presupuestos WHERE id = ?');
  $stmt->execute([$id]);
  $presupuesto = $stmt->fetch();
  if (!$presupuesto || !icc_presupuesto_visible($user, $presupuesto)) icc_json(['error' => 'No encontrado'], 404);
  if ($presupuesto['contrato_id'] !== null) {
    icc_json(['error' => 'No se puede borrar: ya genero un contrato. Borra o gestiona el contrato en su lugar.'], 409);
  }
  $db->prepare('DELETE FROM presupuestos WHERE id = ?')->execute([$id]);
  icc_json(['ok' => true]);
}

icc_json(['error' => 'Peticion no valida'], 404);
