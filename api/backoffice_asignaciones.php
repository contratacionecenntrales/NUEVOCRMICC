<?php
/**
 * ICC CRM · Comerciales asignados a cada usuario de Backoffice.
 * Requiere sql/migracion_backoffice_asignaciones.sql.
 *
 * Solo Admin/Super Admin:
 *  GET                 -> { asignaciones: { backoffice_id: [comercial_id, ...] } }
 *  PUT ?id=<backoffice> -> body { comercial_ids: [...], agenda_ids?: [...] }
 *                          sustituye las listas ([] comerciales = toda la empresa;
 *                          agenda_ids = jefes/direccion de los que SOLO ve la agenda).
 */
require __DIR__ . '/config.php';

$user = icc_require_role(ICC_ROLES_ADMIN);
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
  $agendas = [];
  if (icc_v_backoffice_agendas()) {
    foreach ($db->query('SELECT backoffice_id, usuario_id FROM backoffice_agendas')->fetchAll() as $fila) {
      $agendas[(int)$fila['backoffice_id']][] = (int)$fila['usuario_id'];
    }
  }
  $equipos = [];
  if (icc_v_backoffice_equipos()) {
    foreach ($db->query('SELECT backoffice_id, jefe_id FROM backoffice_equipos')->fetchAll() as $fila) {
      $equipos[(int)$fila['backoffice_id']][] = (int)$fila['jefe_id'];
    }
  }
  icc_json(['asignaciones' => (object)$out, 'agendas' => (object)$agendas, 'agendas_disponible' => icc_v_backoffice_agendas(),
    'equipos' => (object)$equipos, 'equipos_disponible' => icc_v_backoffice_equipos()]);
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

  // Agendas compartidas (solo agenda): jefes de equipo y cargos de direccion.
  $conAgendas = array_key_exists('agenda_ids', $body);
  $agendaIds = [];
  if ($conAgendas) {
    if (!icc_v_backoffice_agendas()) {
      icc_json(['error' => 'Para compartir agendas importa antes sql/migracion_backoffice_agendas.sql'], 409);
    }
    $agendaIds = is_array($body['agenda_ids']) ? $body['agenda_ids'] : [];
    $agendaIds = array_values(array_unique(array_filter(array_map('intval', $agendaIds))));
    if ($agendaIds) {
      $marcas = implode(',', array_fill(0, count($agendaIds), '?'));
      $rolesValidos = array_merge(['jefe_de_equipo'], ICC_ROLES_ADMIN);
      $stmt = $db->prepare("SELECT rol FROM usuarios WHERE id IN ($marcas)");
      $stmt->execute($agendaIds);
      $filas = $stmt->fetchAll();
      if (count($filas) !== count($agendaIds)) icc_json(['error' => 'Alguna de las personas elegidas no existe'], 400);
      foreach ($filas as $f) {
        if (!in_array($f['rol'], $rolesValidos, true)) {
          icc_json(['error' => 'Solo se puede compartir la agenda de jefes de equipo y cargos de dirección'], 400);
        }
      }
    }
  }

  // Equipos completos (todos los comerciales del jefe, tambien los nuevos).
  $conEquipos = array_key_exists('equipo_ids', $body) && icc_v_backoffice_equipos();
  $equipoIds = [];
  if ($conEquipos) {
    $equipoIds = is_array($body['equipo_ids']) ? $body['equipo_ids'] : [];
    $equipoIds = array_values(array_unique(array_filter(array_map('intval', $equipoIds))));
    if ($equipoIds) {
      $marcas = implode(',', array_fill(0, count($equipoIds), '?'));
      $stmt = $db->prepare("SELECT rol FROM usuarios WHERE id IN ($marcas)");
      $stmt->execute($equipoIds);
      $filas = $stmt->fetchAll();
      if (count($filas) !== count($equipoIds)) icc_json(['error' => 'Algún equipo elegido no existe'], 400);
      foreach ($filas as $f) {
        if ($f['rol'] !== 'jefe_de_equipo' && !icc_es_rol_admin($f['rol'])) icc_json(['error' => 'Solo se pueden asignar equipos de jefes de equipo'], 400);
      }
    }
  }

  $db->beginTransaction();
  try {
    $db->prepare('DELETE FROM backoffice_comerciales WHERE backoffice_id = ?')->execute([$id]);
    $ins = $db->prepare('INSERT INTO backoffice_comerciales (backoffice_id, comercial_id, asignado_por) VALUES (?, ?, ?)');
    foreach ($ids as $comercialId) $ins->execute([$id, $comercialId, $user['id']]);
    if ($conEquipos) {
      $db->prepare('DELETE FROM backoffice_equipos WHERE backoffice_id = ?')->execute([$id]);
      $insE = $db->prepare('INSERT INTO backoffice_equipos (backoffice_id, jefe_id, asignado_por) VALUES (?, ?, ?)');
      foreach ($equipoIds as $jid) $insE->execute([$id, $jid, $user['id']]);
    }
    if ($conAgendas) {
      $db->prepare('DELETE FROM backoffice_agendas WHERE backoffice_id = ?')->execute([$id]);
      $insA = $db->prepare('INSERT INTO backoffice_agendas (backoffice_id, usuario_id, asignado_por) VALUES (?, ?, ?)');
      foreach ($agendaIds as $uid) $insA->execute([$id, $uid, $user['id']]);
    }
    $db->commit();
  } catch (Exception $e) {
    $db->rollBack();
    icc_json(['error' => icc_mensaje_error('No se pudieron guardar los comerciales asignados', $e, $user)], 500);
  }

  icc_auditar($id, (int)$user['id'], 'comerciales_asignados', $ids
    ? 'Comerciales asignados: ' . count($ids) . ' (ids ' . implode(', ', $ids) . ')'
    : 'Sin comerciales asignados: ve toda la empresa');
  if ($conAgendas) {
    icc_auditar($id, (int)$user['id'], 'agendas_compartidas', $agendaIds
      ? 'Agendas compartidas (solo agenda): ids ' . implode(', ', $agendaIds)
      : 'Sin agendas compartidas');
  }
  if ($conEquipos) {
    icc_auditar($id, (int)$user['id'], 'equipos_asignados', $equipoIds ? 'Equipos completos: jefes ' . implode(', ', $equipoIds) : 'Sin equipos completos');
  }
  icc_json(['ok' => true, 'comercial_ids' => $ids, 'agenda_ids' => $agendaIds, 'equipo_ids' => $equipoIds]);
}

icc_json(['error' => 'Metodo no permitido'], 405);
