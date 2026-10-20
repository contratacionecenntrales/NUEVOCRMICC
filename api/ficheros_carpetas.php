<?php
/**
 * ICC CRM · Explorador de carpetas de Ficheros (arbol recursivo, estilo
 * Google Drive). Carpeta compartida (propietario_id NULL): biblioteca
 * corporativa, visible para todo el mundo. Carpeta personal
 * (propietario_id fijado): privacidad estricta, solo su dueno y Admin.
 *
 * Solo Administracion crea, renombra, ordena y borra carpetas.
 *
 *   GET    ?parent_id=N                 lista (raiz si no hay parent_id)
 *   POST   { nombre, parent_id, seccion }   crear
 *   PUT    ?id=N { nombre?, seccion? }      renombrar / cambiar de seccion
 *   PUT    ?action=ordenar { ids: [...] }   guardar el orden (mismo padre)
 *   DELETE ?id=N                         borrar (debe estar vacia)
 */
require __DIR__ . '/config.php';

$user = icc_require_auth();
icc_require_permiso($user, 'ficheros.ver');
$metodo = $_SERVER['REQUEST_METHOD'];
$id = isset($_GET['id']) ? (int)$_GET['id'] : null;
$gestiona = icc_puede_gestionar_ficheros($user);

if ($metodo !== 'GET' && !$gestiona) {
  icc_json(['error' => 'Solo Administracion puede crear, editar o borrar carpetas'], 403);
}

$secciones = icc_ficheros_secciones();
$clavesSeccion = array_column($secciones, 'clave');

function icc_carpeta_con_permisos(array $user, array $carpeta): array {
  $gestiona = icc_puede_gestionar_ficheros($user);
  $carpeta['puede_subir'] = $gestiona;
  $carpeta['puede_borrar'] = $gestiona;
  $carpeta['es_personal'] = $carpeta['propietario_id'] !== null;
  $guardada = $carpeta['seccion'] ?? null;
  $carpeta['seccion_elegida'] = $guardada ?: null;
  $carpeta['seccion'] = $guardada ?: icc_ficheros_seccion_auto((string)$carpeta['nombre']);
  $carpeta['orden'] = (int)($carpeta['orden'] ?? 0);
  return $carpeta;
}

function icc_cargar_carpeta(PDO $db, int $id): ?array {
  $stmt = $db->prepare('SELECT * FROM ficheros_carpetas WHERE id = ?');
  $stmt->execute([$id]);
  $fila = $stmt->fetch();
  return $fila ?: null;
}

/** Hermanas visibles de una carpeta (mismo padre). */
function icc_hermanas_ids(PDO $db, ?int $parentId): array {
  if ($parentId === null) {
    $stmt = $db->query('SELECT id FROM ficheros_carpetas WHERE parent_id IS NULL');
  } else {
    $stmt = $db->prepare('SELECT id FROM ficheros_carpetas WHERE parent_id = ?');
    $stmt->execute([$parentId]);
  }
  return array_map('intval', array_column($stmt->fetchAll(), 'id'));
}

if ($metodo === 'GET' && $id === null) {
  $db = icc_db();
  $parentId = isset($_GET['parent_id']) && $_GET['parent_id'] !== '' ? (int)$_GET['parent_id'] : null;

  $actual = null;
  if ($parentId !== null) {
    $actual = icc_cargar_carpeta($db, $parentId);
    if (!$actual || !icc_carpeta_fichero_visible($user, $actual)) icc_json(['error' => 'No encontrado'], 404);
    if ($actual['propietario_id'] !== null) {
      $stmt = $db->prepare('SELECT nombre FROM usuarios WHERE id = ?');
      $stmt->execute([$actual['propietario_id']]);
      $actual['propietario_nombre'] = $stmt->fetchColumn() ?: null;
    }
  }

  $sql = "SELECT c.*, u.nombre AS propietario_nombre,
       (SELECT COUNT(*) FROM ficheros_carpetas h WHERE h.parent_id = c.id) AS n_carpetas,
       (SELECT COUNT(*) FROM ficheros f WHERE f.carpeta_id = c.id) AS n_archivos,
       (SELECT MAX(f.created_at) FROM ficheros f WHERE f.carpeta_id = c.id) AS ultimo_archivo
       FROM ficheros_carpetas c
       LEFT JOIN usuarios u ON u.id = c.propietario_id
       WHERE " . ($parentId === null ? 'c.parent_id IS NULL' : 'c.parent_id = ?');
  $stmt = $db->prepare($sql);
  $stmt->execute($parentId === null ? [] : [$parentId]);

  $carpetas = array_values(array_filter($stmt->fetchAll(), function ($c) use ($user) {
    return icc_carpeta_fichero_visible($user, $c);
  }));
  $carpetas = array_map(function ($c) use ($user) { return icc_carpeta_con_permisos($user, $c); }, $carpetas);

  // Orden: seccion (Formacion, Energia, Telefonia, Alarmas, Seguros, General),
  // despues el orden que haya fijado Admin y por ultimo el nombre.
  $posSeccion = array_flip($clavesSeccion);
  usort($carpetas, function ($a, $b) use ($posSeccion, $parentId) {
    if ($parentId === null) {
      $sa = $posSeccion[$a['seccion']] ?? 99;
      $sb = $posSeccion[$b['seccion']] ?? 99;
      if ($sa !== $sb) return $sa <=> $sb;
    }
    if ($a['orden'] !== $b['orden']) return $a['orden'] <=> $b['orden'];
    return strnatcasecmp($a['nombre'], $b['nombre']);
  });

  // Breadcrumb: cadena de ancestros hasta la raiz.
  $ruta = [];
  $cursor = $parentId;
  $vueltas = 0;
  while ($cursor !== null && $vueltas++ < 50) {
    $stmt = $db->prepare('SELECT id, nombre, parent_id, propietario_id FROM ficheros_carpetas WHERE id = ?');
    $stmt->execute([$cursor]);
    $fila = $stmt->fetch();
    if (!$fila) break;
    array_unshift($ruta, $fila);
    $cursor = $fila['parent_id'] !== null ? (int)$fila['parent_id'] : null;
  }

  icc_json([
    'carpetas' => $carpetas,
    'ruta' => $ruta,
    'actual' => $actual ? icc_carpeta_con_permisos($user, $actual) : null,
    'secciones' => $secciones,
    'puede_gestionar' => $gestiona,
    'orden_disponible' => icc_ficheros_con_orden($db),
  ]);
}

if ($metodo === 'POST' && $id === null) {
  icc_require_csrf();
  $body = icc_body();
  $nombre = trim((string)($body['nombre'] ?? ''));
  $parentId = isset($body['parent_id']) && $body['parent_id'] !== '' && $body['parent_id'] !== null ? (int)$body['parent_id'] : null;
  $seccion = (string)($body['seccion'] ?? '');
  if ($nombre === '') icc_json(['error' => 'Falta el nombre de la carpeta'], 400);
  if (mb_strlen($nombre) > 150) icc_json(['error' => 'El nombre es demasiado largo (maximo 150 caracteres)'], 400);
  if ($seccion !== '' && !in_array($seccion, $clavesSeccion, true)) icc_json(['error' => 'Seccion no valida'], 400);

  $db = icc_db();
  if ($parentId !== null) {
    $padre = icc_cargar_carpeta($db, $parentId);
    if (!$padre || !icc_carpeta_fichero_visible($user, $padre)) icc_json(['error' => 'Carpeta padre no encontrada'], 404);
    if ($padre['propietario_id'] !== null) icc_json(['error' => 'No se pueden crear subcarpetas dentro de una carpeta personal'], 403);
  }

  $stmt = $db->prepare('SELECT COUNT(*) FROM ficheros_carpetas WHERE nombre = ? AND ' . ($parentId === null ? 'parent_id IS NULL' : 'parent_id = ?'));
  $stmt->execute($parentId === null ? [$nombre] : [$nombre, $parentId]);
  if ((int)$stmt->fetchColumn() > 0) icc_json(['error' => 'Ya existe una carpeta con ese nombre aqui'], 409);

  if (icc_ficheros_con_orden($db)) {
    $stmt = $db->prepare('SELECT COALESCE(MAX(orden), 0) + 10 FROM ficheros_carpetas WHERE ' . ($parentId === null ? 'parent_id IS NULL' : 'parent_id = ?'));
    $stmt->execute($parentId === null ? [] : [$parentId]);
    $orden = (int)$stmt->fetchColumn();
    $ins = $db->prepare('INSERT INTO ficheros_carpetas (nombre, parent_id, propietario_id, creado_por, seccion, orden) VALUES (?, ?, NULL, ?, ?, ?)');
    $ins->execute([$nombre, $parentId, $user['id'], ($parentId === null && $seccion !== '') ? $seccion : null, $orden]);
  } else {
    $ins = $db->prepare('INSERT INTO ficheros_carpetas (nombre, parent_id, propietario_id, creado_por) VALUES (?, ?, NULL, ?)');
    $ins->execute([$nombre, $parentId, $user['id']]);
  }
  icc_json(['id' => (int)$db->lastInsertId()], 201);
}

if ($metodo === 'PUT' && ($_GET['action'] ?? '') === 'ordenar') {
  icc_require_csrf();
  $db = icc_db();
  if (!icc_ficheros_con_orden($db)) {
    icc_json(['error' => 'Para ordenar carpetas importa antes sql/migracion_ficheros_orden.sql en la base de datos'], 409);
  }
  $body = icc_body();
  $ids = array_values(array_unique(array_map('intval', (array)($body['ids'] ?? []))));
  if (!$ids) icc_json(['error' => 'Falta el orden'], 400);

  // Todas deben ser hermanas (mismo padre) para no mezclar niveles.
  $primera = icc_cargar_carpeta($db, $ids[0]);
  if (!$primera) icc_json(['error' => 'Carpeta no encontrada'], 404);
  $parentId = $primera['parent_id'] !== null ? (int)$primera['parent_id'] : null;
  $hermanas = icc_hermanas_ids($db, $parentId);
  foreach ($ids as $cid) {
    if (!in_array($cid, $hermanas, true)) icc_json(['error' => 'Solo se pueden ordenar carpetas del mismo nivel'], 400);
  }

  $db->beginTransaction();
  $upd = $db->prepare('UPDATE ficheros_carpetas SET orden = ? WHERE id = ?');
  foreach ($ids as $i => $cid) $upd->execute([($i + 1) * 10, $cid]);
  $db->commit();
  icc_json(['ok' => true]);
}

if ($metodo === 'PUT' && $id !== null) {
  icc_require_csrf();
  $db = icc_db();
  $carpeta = icc_cargar_carpeta($db, $id);
  if (!$carpeta) icc_json(['error' => 'No encontrado'], 404);
  $body = icc_body();
  $sets = [];
  $vals = [];

  if (array_key_exists('nombre', $body)) {
    if ($carpeta['propietario_id'] !== null) icc_json(['error' => 'Las carpetas personales se nombran automaticamente'], 403);
    $nombre = trim((string)$body['nombre']);
    if ($nombre === '') icc_json(['error' => 'El nombre no puede quedar vacio'], 400);
    if (mb_strlen($nombre) > 150) icc_json(['error' => 'El nombre es demasiado largo (maximo 150 caracteres)'], 400);
    $stmt = $db->prepare('SELECT COUNT(*) FROM ficheros_carpetas WHERE nombre = ? AND id <> ? AND ' . ($carpeta['parent_id'] === null ? 'parent_id IS NULL' : 'parent_id = ?'));
    $stmt->execute($carpeta['parent_id'] === null ? [$nombre, $id] : [$nombre, $id, $carpeta['parent_id']]);
    if ((int)$stmt->fetchColumn() > 0) icc_json(['error' => 'Ya existe una carpeta con ese nombre aqui'], 409);
    // "Facturacion de Comerciales" se localiza por su nombre al dar de alta comerciales.
    if ($carpeta['parent_id'] === null && $carpeta['nombre'] === 'Facturacion de Comerciales' && $nombre !== $carpeta['nombre']) {
      icc_json(['error' => 'Esta carpeta la usa el CRM para las carpetas personales de facturacion y no se puede renombrar'], 409);
    }
    $sets[] = 'nombre = ?';
    $vals[] = $nombre;
  }

  if (array_key_exists('seccion', $body)) {
    if (!icc_ficheros_con_orden($db)) {
      icc_json(['error' => 'Para cambiar la seccion importa antes sql/migracion_ficheros_orden.sql en la base de datos'], 409);
    }
    $seccion = (string)$body['seccion'];
    if ($seccion !== '' && !in_array($seccion, $clavesSeccion, true)) icc_json(['error' => 'Seccion no valida'], 400);
    $sets[] = 'seccion = ?';
    $vals[] = $seccion === '' ? null : $seccion;
  }

  if (!$sets) icc_json(['error' => 'Nada que cambiar'], 400);
  $vals[] = $id;
  $db->prepare('UPDATE ficheros_carpetas SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($vals);
  icc_json(['ok' => true]);
}

if ($metodo === 'DELETE' && $id !== null) {
  icc_require_csrf();
  $db = icc_db();
  $carpeta = icc_cargar_carpeta($db, $id);
  if (!$carpeta) icc_json(['error' => 'No encontrado'], 404);
  if ($carpeta['propietario_id'] !== null) {
    icc_json(['error' => 'Las carpetas personales se gestionan automaticamente y no se pueden borrar a mano'], 403);
  }
  if ($carpeta['parent_id'] === null && $carpeta['nombre'] === 'Facturacion de Comerciales') {
    icc_json(['error' => 'Esta carpeta la usa el CRM para las carpetas personales de facturacion'], 409);
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
