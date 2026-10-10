<?php
require __DIR__ . '/config.php';

$user = icc_require_auth();
icc_require_permiso_metodo($user, ['GET' => 'agenda.ver', 'POST' => 'agenda.gestionar', 'PUT' => 'agenda.gestionar', 'DELETE' => 'agenda.gestionar']);
$metodo = $_SERVER['REQUEST_METHOD'];
$id = isset($_GET['id']) ? (int)$_GET['id'] : null;
$sectoresValidos = ['energia', 'telecomunicaciones', 'alarmas', 'multisectorial'];
$estadosValidos = ['programada', 'realizada', 'reprogramada', 'ko'];

/**
 * Devuelve un aviso (no bloqueante) si ya existe otra cita del mismo
 * comercial que se solapa en horario con la franja dada, en la misma
 * fecha. Nunca impide guardar: el comercial puede tener motivos para
 * quedarse igual (p.ej. una llamada corta encajada entre dos visitas).
 */
function icc_aviso_solape_cita(PDO $db, int $comercialId, string $fecha, string $horaInicio, string $horaFin, ?int $excluirId = null): ?string {
  $sql = "SELECT cliente_nombre, hora_inicio, hora_fin FROM citas
          WHERE comercial_id = ? AND fecha = ? AND estado != 'ko'
            AND hora_inicio < ? AND hora_fin > ?";
  $params = [$comercialId, $fecha, $horaFin, $horaInicio];
  if ($excluirId !== null) {
    $sql .= ' AND id != ?';
    $params[] = $excluirId;
  }
  $stmt = $db->prepare($sql . ' LIMIT 1');
  $stmt->execute($params);
  $choque = $stmt->fetch();
  if (!$choque) return null;
  return 'Ya tienes otra cita con ' . $choque['cliente_nombre'] . ' de ' . substr($choque['hora_inicio'], 0, 5) .
    ' a ' . substr($choque['hora_fin'], 0, 5) . ' ese dia. Se ha guardado igualmente.';
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
  if (!empty($_GET['fecha'])) {
    $where[] = 'fecha = ?';
    $params[] = $_GET['fecha'];
  }
  if (!empty($_GET['desde'])) {
    $where[] = 'fecha >= ?';
    $params[] = $_GET['desde'];
  }
  if (!empty($_GET['hasta'])) {
    $where[] = 'fecha <= ?';
    $params[] = $_GET['hasta'];
  }
  if (!empty($_GET['estado']) && in_array($_GET['estado'], $estadosValidos, true)) {
    $where[] = 'estado = ?';
    $params[] = $_GET['estado'];
  }
  if (!empty($_GET['sector']) && in_array($_GET['sector'], $sectoresValidos, true)) {
    $where[] = 'sector = ?';
    $params[] = $_GET['sector'];
  }

  $sql = 'SELECT c.*, u.nombre AS comercial_nombre FROM citas c LEFT JOIN usuarios u ON u.id = c.comercial_id';
  if ($where) $sql .= ' WHERE ' . implode(' AND ', $where);
  $sql .= ' ORDER BY c.fecha ASC, c.hora_inicio ASC LIMIT 1000';

  try {
    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    icc_json(['citas' => $stmt->fetchAll()]);
  } catch (Exception $e) {
    icc_json(['error' => icc_mensaje_error('No se pudo cargar la agenda (¿falta importar sql/migracion_agenda.sql?)', $e, $user)], 500);
  }
}

if ($metodo === 'POST' && $id === null) {
  icc_require_csrf();
  $body = icc_body();
  $clienteNombre = trim($body['cliente_nombre'] ?? '');
  $fecha = $body['fecha'] ?? '';
  $horaInicio = $body['hora_inicio'] ?? '';
  $horaFin = $body['hora_fin'] ?? '';
  if ($clienteNombre === '' || $fecha === '' || $horaInicio === '' || $horaFin === '') {
    icc_json(['error' => 'Negocio/cliente, fecha y horas de inicio y fin son obligatorios'], 400);
  }
  if ($horaFin <= $horaInicio) {
    icc_json(['error' => 'La hora de fin debe ser posterior a la hora de inicio'], 400);
  }

  $db = icc_db();
  $comercialId = !empty($body['comercial_id']) && icc_puede_ver_comercial($user, (int)$body['comercial_id'])
    ? (int)$body['comercial_id']
    : (int)$user['id'];
  $sector = in_array($body['sector'] ?? '', $sectoresValidos, true) ? $body['sector'] : 'energia';

  try {
    $stmt = $db->prepare(
      'INSERT INTO citas (comercial_id, cliente_nombre, contacto_nombre, telefono, direccion, sector, fecha, hora_inicio, hora_fin, notas)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    $stmt->execute([
      $comercialId,
      $clienteNombre,
      trim($body['contacto_nombre'] ?? ''),
      trim($body['telefono'] ?? ''),
      trim($body['direccion'] ?? ''),
      $sector,
      $fecha,
      $horaInicio,
      $horaFin,
      trim($body['notas'] ?? ''),
    ]);

    $nuevoId = (int)$db->lastInsertId();
    icc_json([
      'id' => $nuevoId,
      'aviso' => icc_aviso_solape_cita($db, $comercialId, $fecha, $horaInicio, $horaFin, $nuevoId),
    ], 201);
  } catch (Exception $e) {
    icc_json(['error' => icc_mensaje_error('No se pudo guardar la cita (¿falta importar sql/migracion_agenda.sql?)', $e, $user)], 500);
  }
}

if ($metodo === 'PUT' && $id !== null) {
  icc_require_csrf();
  $db = icc_db();
  try {
    $stmt = $db->prepare('SELECT * FROM citas WHERE id = ?');
    $stmt->execute([$id]);
    $cita = $stmt->fetch();
    $visible = $cita && icc_puede_ver_comercial($user, $cita['comercial_id']);
    if (!$visible) icc_json(['error' => 'No encontrado'], 404);

    $body = icc_body();
    $sets = [];
    $valores = [];
    foreach (['cliente_nombre', 'contacto_nombre', 'telefono', 'direccion', 'fecha', 'hora_inicio', 'hora_fin', 'notas'] as $campo) {
      if (array_key_exists($campo, $body)) {
        $sets[] = "$campo = ?";
        $valores[] = trim((string)$body[$campo]);
      }
    }
    if (array_key_exists('sector', $body) && in_array($body['sector'], $sectoresValidos, true)) {
      $sets[] = 'sector = ?';
      $valores[] = $body['sector'];
    }
    if (array_key_exists('estado', $body) && in_array($body['estado'], $estadosValidos, true)) {
      $sets[] = 'estado = ?';
      $valores[] = $body['estado'];
    }
    // Reasignar la cita a otro comercial: solo quien gestiona equipo (admin,
    // backoffice o el jefe de ese equipo), y siempre a alguien que ya pueda ver.
    if (array_key_exists('comercial_id', $body) && $user['rol'] !== 'comercial' && !empty($body['comercial_id'])
        && icc_puede_ver_comercial($user, (int)$body['comercial_id'])) {
      $sets[] = 'comercial_id = ?';
      $valores[] = (int)$body['comercial_id'];
    }

    if (!$sets) icc_json(['ok' => true]);
    $valores[] = $id;
    $db->prepare('UPDATE citas SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($valores);

    $stmt = $db->prepare('SELECT * FROM citas WHERE id = ?');
    $stmt->execute([$id]);
    $actualizada = $stmt->fetch();
    icc_json([
      'ok' => true,
      'aviso' => $actualizada && $actualizada['estado'] !== 'ko'
        ? icc_aviso_solape_cita($db, (int)$actualizada['comercial_id'], $actualizada['fecha'], $actualizada['hora_inicio'], $actualizada['hora_fin'], $id)
        : null,
    ]);
  } catch (Exception $e) {
    icc_json(['error' => icc_mensaje_error('No se pudo actualizar la cita', $e, $user)], 500);
  }
}

if ($metodo === 'DELETE' && $id !== null) {
  icc_require_csrf();
  $db = icc_db();
  try {
    $stmt = $db->prepare('SELECT comercial_id FROM citas WHERE id = ?');
    $stmt->execute([$id]);
    $cita = $stmt->fetch();
    $puedeBorrar = $cita && icc_puede_ver_comercial($user, $cita['comercial_id']);
    if (!$puedeBorrar) icc_json(['error' => 'No encontrado'], 404);
    $db->prepare('DELETE FROM citas WHERE id = ?')->execute([$id]);
    icc_json(['ok' => true]);
  } catch (Exception $e) {
    icc_json(['error' => icc_mensaje_error('No se pudo borrar la cita', $e, $user)], 500);
  }
}

icc_json(['error' => 'Peticion no valida'], 404);
