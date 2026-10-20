<?php
/**
 * ICC CRM · Comerciales asignados a cada usuario de Backoffice.
 * Requiere sql/migracion_backoffice_asignaciones.sql.
 *
 * Solo Admin/Super Admin:
 *  GET                 -> { asignaciones: { backoffice_id: [comercial_id, ...] } }
 *  PUT ?id=<backoffice> -> body { comercial_ids: [...] } sustituye la lista
 *                          completa ([] = vuelve a ver toda la empresa).
 */
require __DIR__ . '/config.php';

$user = icc_require_role(['admin', 'super_admin']);
$metodo = $_SERVER['REQUEST_METHOD'];
$db = icc_db();

if (!icc_v_backoffice_asignaciones()) {
  icc_json(['error' => 'Falta importar sql/migracion_backoffice_asignaciones.sql en la base de datos'], 409);
}

if ($metodo === 'GET') {
  $out = [];
  foreach ($db->query('SELECT backoffice_id, comercial_id FROM backoffice_comerciales')->fetchAll() as $fila) {
    $out[(int)$fila['backoffice_id']][] = (int)$fila['comercial_id'];
  }
  icc_json(['asignaciones' => (object)$out]);
}

if ($metodo === 'PUT') {
  icc_require_csrf();
  $id = (int)($_GET['id'] ?? 0);
  $stmt = $db->prepare('SELECT id, nombre, rol FROM usuarios WHERE id = ?');
  $stmt->execute([$id]);
  $backoffice = $stmt->fetch();
  if (!$backoffice) icc_json(['error' => 'Usuario no encontrado'], 404);
  if ($backoffice['rol'] !== 'backoffice') {
    icc_json(['error' => 'Solo se pueden asignar comerciales a usuarios de Backoffice'], 400);
  }

  $body = icc_body();
  $ids = is_array($body['comercial_ids'] ?? null) ? $body['comercial_ids'] : [];
  $ids = array_values(array_unique(array_filter(array_map('intval', $ids))));

  if ($ids) {
    $marcas = implode(',', array_fill(0, count($ids), '?'));
    $stmt = $db->prepare("SELECT id FROM usuarios WHERE id IN ($marcas) AND rol = 'comercial'");
    $stmt->execute($ids);
    if (count($stmt->fetchAll()) !== count($ids)) {
      icc_json(['error' => 'Alguno de los usuarios elegidos no existe o no es Comercial'], 400);
    }
  }

  $db->beginTransaction();
  try {
    $db->prepare('DELETE FROM backoffice_comerciales WHERE backoffice_id = ?')->execute([$id]);
    $ins = $db->prepare('INSERT INTO backoffice_comerciales (backoffice_id, comercial_id, asignado_por) VALUES (?, ?, ?)');
    foreach ($ids as $comercialId) $ins->execute([$id, $comercialId, $user['id']]);
    $db->commit();
  } catch (Exception $e) {
    $db->rollBack();
    icc_json(['error' => icc_mensaje_error('No se pudieron guardar los comerciales asignados', $e, $user)], 500);
  }

  icc_auditar($id, (int)$user['id'], 'comerciales_asignados', $ids
    ? 'Comerciales asignados: ' . count($ids) . ' (ids ' . implode(', ', $ids) . ')'
    : 'Sin comerciales asignados: ve toda la empresa');
  icc_json(['ok' => true, 'comercial_ids' => $ids]);
}

icc_json(['error' => 'Metodo no permitido'], 405);
