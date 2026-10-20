<?php
/**
 * ICC CRM · Explorador de carpetas de Ficheros (arbol recursivo, estilo
 * Google Drive). Carpeta compartida (propietario_id NULL): biblioteca
 * corporativa, visible para todo el mundo. Carpeta personal
 * (propietario_id fijado): privacidad estricta, solo su dueno y Admin.
 */
require __DIR__ . '/config.php';

$user = icc_require_auth();
icc_require_permiso_metodo($user, ['GET' => 'ficheros.ver', 'POST' => 'ficheros.subir', 'DELETE' => 'ficheros.borrar']);
$metodo = $_SERVER['REQUEST_METHOD'];
$id = isset($_GET['id']) ? (int)$_GET['id'] : null;

function icc_carpeta_con_permisos(array $user, array $carpeta): array {
  $carpeta['puede_subir'] = $carpeta['propietario_id'] === null
    ? icc_tiene_permiso($user, 'ficheros.subir')
    : icc_es_admin_o_superior($user);
  $carpeta['puede_borrar'] = icc_tiene_permiso($user, 'ficheros.borrar');
  $carpeta['es_personal'] = $carpeta['propietario_id'] !== null;
  return $carpeta;
}

if ($metodo === 'GET' && $id === null) {
  $db = icc_db();
  $parentId = isset($_GET['parent_id']) && $_GET['parent_id'] !== '' ? (int)$_GET['parent_id'] : null;

  if ($parentId !== null) {
    $stmt = $db->prepare('SELECT * FROM ficheros_carpetas WHERE id = ?');
    $stmt->execute([$parentId]);
    $actual = $stmt->fetch();
    if (!$actual || !icc_carpeta_fichero_visible($user, $actual)) icc_json(['error' => 'No encontrado'], 404);
  }

  if ($parentId === null) {
    $stmt = $db->query(
      "SELECT c.*, u.nombre AS propietario_nombre,
       (SELECT COUNT(*) FROM ficheros_carpetas h WHERE h.parent_id = c.id) AS n_carpetas,
       (SELECT COUNT(*) FROM ficheros f WHERE f.carpeta_id = c.id) AS n_archivos,
       (SELECT MAX(f.created_at) FROM ficheros f WHERE f.carpeta_id = c.id) AS ultimo_archivo
       FROM ficheros_carpetas c
       LEFT JOIN usuarios u ON u.id = c.propietario_id
       WHERE c.parent_id IS NULL ORDER BY c.nombre ASC"
    );
  } else {
    $stmt = $db->prepare(
      'SELECT c.*, u.nombre AS propietario_nombre,
       (SELECT COUNT(*) FROM ficheros_carpetas h WHERE h.parent_id = c.id) AS n_carpetas,
       (SELECT COUNT(*) FROM ficheros f WHERE f.carpeta_id = c.id) AS n_archivos,
       (SELECT MAX(f.created_at) FROM ficheros f WHERE f.carpeta_id = c.id) AS ultimo_archivo
       FROM ficheros_carpetas c
       LEFT JOIN usuarios u ON u.id = c.propietario_id
       WHERE c.parent_id = ? ORDER BY c.nombre ASC'
    );
    $stmt->execute([$parentId]);
  }
  $carpetas = array_values(array_filter($stmt->fetchAll(), function ($c) use ($user) {
    return icc_carpeta_fichero_visible($user, $c);
  }));
  $carpetas = array_map(function ($c) use ($user) { return icc_carpeta_con_permisos($user, $c); }, $carpetas);

  // Breadcrumb: cadena de ancestros hasta la raiz.
  $ruta = [];
  $cursor = $parentId;
  while ($cursor !== null) {
    $stmt = $db->prepare('SELECT id, nombre, parent_id, propietario_id FROM ficheros_carpetas WHERE id = ?');
    $stmt->execute([$cursor]);
    $fila = $stmt->fetch();
    if (!$fila) break;
    array_unshift($ruta, $fila);
    $cursor = $fila['parent_id'] !== null ? (int)$fila['parent_id'] : null;
  }

  $actualConPermisos = isset($actual) ? icc_carpeta_con_permisos($user, $actual) : null;
  icc_json(['carpetas' => $carpetas, 'ruta' => $ruta, 'actual' => $actualConPermisos]);
}

if ($metodo === 'POST' && $id === null) {
  icc_require_csrf();
  $body = icc_body();
  $nombre = trim($body['nombre'] ?? '');
  $parentId = isset($body['parent_id']) && $body['parent_id'] !== '' ? (int)$body['parent_id'] : null;
  if ($nombre === '') icc_json(['error' => 'Falta el nombre de la carpeta'], 400);

  $db = icc_db();
  if ($parentId !== null) {
    $stmt = $db->prepare('SELECT * FROM ficheros_carpetas WHERE id = ?');
    $stmt->execute([$parentId]);
    $padre = $stmt->fetch();
    if (!$padre || !icc_carpeta_fichero_visible($user, $padre)) icc_json(['error' => 'Carpeta padre no encontrada'], 404);
    if ($padre['propietario_id'] !== null) icc_json(['error' => 'No se pueden crear subcarpetas dentro de una carpeta personal'], 403);
  }

  $ins = $db->prepare('INSERT INTO ficheros_carpetas (nombre, parent_id, propietario_id, creado_por) VALUES (?, ?, NULL, ?)');
  $ins->execute([$nombre, $parentId, $user['id']]);
  icc_json(['id' => (int)$db->lastInsertId()], 201);
}

if ($metodo === 'DELETE' && $id !== null) {
  icc_require_csrf();
  $db = icc_db();
  $stmt = $db->prepare('SELECT * FROM ficheros_carpetas WHERE id = ?');
  $stmt->execute([$id]);
  $carpeta = $stmt->fetch();
  if (!$carpeta) icc_json(['error' => 'No encontrado'], 404);
  if ($carpeta['propietario_id'] !== null) {
    icc_json(['error' => 'Las carpetas personales se gestionan automaticamente y no se pueden borrar a mano'], 403);
  }

  $stmt = $db->prepare('SELECT COUNT(*) AS total FROM ficheros_carpetas WHERE parent_id = ?');
  $stmt->execute([$id]);
  if ((int)$stmt->fetch()['total'] > 0) icc_json(['error' => 'No se puede borrar: la carpeta tiene subcarpetas'], 409);

  $stmt = $db->prepare('SELECT COUNT(*) AS total FROM ficheros WHERE carpeta_id = ?');
  $stmt->execute([$id]);
  if ((int)$stmt->fetch()['total'] > 0) icc_json(['error' => 'No se puede borrar: la carpeta todavia tiene archivos'], 409);

  $db->prepare('DELETE FROM ficheros_carpetas WHERE id = ?')->execute([$id]);
  icc_json(['ok' => true]);
}

icc_json(['error' => 'Peticion no valida'], 404);
