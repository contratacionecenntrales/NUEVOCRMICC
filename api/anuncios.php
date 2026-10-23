<?php
/**
 * ICC CRM · Anuncios de direccion (requiere sql/migracion_anuncios.sql).
 *
 * GET                 todos los usuarios: anuncios vigentes ahora.
 * GET ?todos=1        direccion: tambien los caducados (30 dias).
 * POST                direccion (JSON o multipart con "foto"):
 *                     { texto, emoji?, provincia?, ciudad?, usuario_id?, duracion: hoy|semana|fecha, expira?: Y-m-d }
 * DELETE ?id=         direccion: retira un anuncio (y su foto).
 *
 * El anuncio lo escribe una persona de direccion y se muestra tal cual a todo
 * el equipo (pantalla de celebracion, cinta en directo, sala de ventas y mapa).
 */
require __DIR__ . '/config.php';
require __DIR__ . '/anuncios_lib.php';

$user = icc_require_auth();
$metodo = $_SERVER['REQUEST_METHOD'];
$db = icc_db();
$direccion = icc_es_rol_admin((string)$user['rol']);
$dirFotos = ICC_STORAGE_DIR . '/anuncios';

try {
  $db->query('SELECT 1 FROM anuncios LIMIT 0');
} catch (PDOException $e) {
  if ($metodo === 'GET') icc_json(['anuncios' => [], 'disponible' => false]);
  icc_json(['error' => 'Falta importar sql/migracion_anuncios.sql en la base de datos'], 409);
}

if ($metodo === 'GET') {
  if (!empty($_GET['todos']) && $direccion) {
    $filas = $db->query(icc_anuncios_select($db, "(SELECT TRIM(CONCAT(COALESCE(u.nombre, ''), ' ', COALESCE(u.apellidos, ''))) FROM usuarios u WHERE u.id = a.autor_id) autor,
                         (a.inicio <= NOW() AND a.expira > NOW()) vigente") . "
                         WHERE a.expira > NOW() - INTERVAL 30 DAY ORDER BY a.inicio DESC LIMIT 100");
    $filas = $filas->fetchAll();
    foreach ($filas as &$f) $f['vigente'] = (bool)$f['vigente'];
    icc_json(['anuncios' => array_map('icc_anuncio_publico', $filas), 'disponible' => true, 'con_foto' => icc_anuncios_con_foto($db)]);
  }
  icc_json(['anuncios' => icc_anuncios_vigentes($db), 'disponible' => true]);
}

icc_require_csrf();
if (!$direccion) icc_json(['error' => 'Solo dirección puede publicar o retirar anuncios'], 403);

if ($metodo === 'POST') {
  $b = !empty($_POST) ? $_POST : icc_body();
  $texto = trim(preg_replace('/\s+/u', ' ', (string)($b['texto'] ?? '')));
  if ($texto === '') icc_json(['error' => 'Escribe el texto del anuncio'], 400);
  if (mb_strlen($texto) > 280) icc_json(['error' => 'El anuncio puede tener como mucho 280 caracteres'], 400);
  $emoji = mb_substr(trim((string)($b['emoji'] ?? '')), 0, 4) ?: '📣';
  $provincia = mb_substr(trim((string)($b['provincia'] ?? '')), 0, 60);
  $ciudad = mb_substr(trim((string)($b['ciudad'] ?? '')), 0, 100);
  $usuarioId = (int)($b['usuario_id'] ?? 0) ?: null;
  if ($usuarioId !== null) {
    $st = $db->prepare('SELECT id FROM usuarios WHERE id = ?');
    $st->execute([$usuarioId]);
    if (!$st->fetch()) icc_json(['error' => 'Esa persona no existe'], 400);
  }
  $duracion = (string)($b['duracion'] ?? 'hoy');
  $hoy = (string)$db->query('SELECT CURDATE()')->fetchColumn();
  if ($duracion === 'semana') {
    $expira = date('Y-m-d 23:59:59', strtotime($hoy . ' +6 days'));
  } elseif ($duracion === 'fecha') {
    $f = (string)($b['expira'] ?? '');
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $f) || $f < $hoy) icc_json(['error' => 'Elige una fecha de fin de hoy en adelante'], 400);
    $expira = $f . ' 23:59:59';
  } else {
    $expira = $hoy . ' 23:59:59';
  }

  // Foto opcional del anuncio (PNG, JPG o WebP, hasta 5 MB).
  $fotoRuta = null;
  if (!empty($_FILES['foto']) && $_FILES['foto']['error'] !== UPLOAD_ERR_NO_FILE) {
    $archivo = $_FILES['foto'];
    if ($archivo['error'] !== UPLOAD_ERR_OK) icc_json(['error' => 'No se pudo recibir la foto (¿pesa demasiado?)'], 400);
    if ($archivo['size'] > 5 * 1024 * 1024) icc_json(['error' => 'La foto supera los 5 MB'], 400);
    $info = @getimagesize($archivo['tmp_name']);
    $tipos = [IMAGETYPE_PNG => 'png', IMAGETYPE_JPEG => 'jpg', IMAGETYPE_WEBP => 'webp'];
    if (!$info || !isset($tipos[$info[2]])) icc_json(['error' => 'Formato de foto no admitido: usa PNG, JPG o WebP'], 400);
    if (!is_dir($dirFotos)) mkdir($dirFotos, 0755, true);
    $fotoRuta = 'anuncio-' . bin2hex(random_bytes(8)) . '.' . $tipos[$info[2]];
    if (!move_uploaded_file($archivo['tmp_name'], $dirFotos . '/' . $fotoRuta)) {
      icc_json(['error' => 'No se pudo guardar la foto. Revisa los permisos de storage/'], 500);
    }
  }

  if (icc_anuncios_con_foto($db)) {
    $stmt = $db->prepare('INSERT INTO anuncios (texto, emoji, provincia, ciudad, expira, autor_id, usuario_id, foto_ruta) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    $stmt->execute([$texto, $emoji, $provincia, $ciudad, $expira, (int)$user['id'], $usuarioId, $fotoRuta]);
  } else {
    if ($fotoRuta) @unlink($dirFotos . '/' . $fotoRuta);
    $stmt = $db->prepare('INSERT INTO anuncios (texto, emoji, provincia, ciudad, expira, autor_id) VALUES (?, ?, ?, ?, ?, ?)');
    $stmt->execute([$texto, $emoji, $provincia, $ciudad, $expira, (int)$user['id']]);
  }
  icc_json(['ok' => true, 'id' => (int)$db->lastInsertId(), 'expira' => $expira], 201);
}

if ($metodo === 'DELETE') {
  $id = (int)($_GET['id'] ?? 0);
  $foto = null;
  if (icc_anuncios_con_foto($db)) {
    $st = $db->prepare('SELECT foto_ruta FROM anuncios WHERE id = ?');
    $st->execute([$id]);
    $foto = $st->fetchColumn() ?: null;
  }
  $stmt = $db->prepare('DELETE FROM anuncios WHERE id = ?');
  $stmt->execute([$id]);
  if (!$stmt->rowCount()) icc_json(['error' => 'Ese anuncio ya no existe'], 404);
  if ($foto) @unlink($dirFotos . '/' . basename($foto));
  icc_json(['ok' => true]);
}

icc_json(['error' => 'Metodo no permitido'], 405);
