<?php
/**
 * ICC CRM · Anuncios de direccion (requiere sql/migracion_anuncios.sql).
 *
 * GET                 todos los usuarios: anuncios vigentes ahora.
 * GET ?todos=1        direccion: tambien los programados y los caducados (30 dias).
 * POST                direccion: { texto, emoji?, provincia?, ciudad?, duracion: hoy|semana|fecha, expira?: Y-m-d }
 * DELETE ?id=         direccion: retira un anuncio.
 *
 * El anuncio lo escribe una persona de direccion y se muestra tal cual a todo
 * el equipo (cinta en directo, sala de ventas y mapa).
 */
require __DIR__ . '/config.php';

$user = icc_require_auth();
$metodo = $_SERVER['REQUEST_METHOD'];
$db = icc_db();
$direccion = icc_es_rol_admin((string)$user['rol']);

try {
  $db->query('SELECT 1 FROM anuncios LIMIT 0');
} catch (PDOException $e) {
  if ($metodo === 'GET') icc_json(['anuncios' => [], 'disponible' => false]);
  icc_json(['error' => 'Falta importar sql/migracion_anuncios.sql en la base de datos'], 409);
}

/** Anuncios vigentes ahora (los usa tambien api/sala.php). */
function icc_anuncios_vigentes(PDO $db): array {
  $filas = $db->query('SELECT id, texto, emoji, provincia, ciudad, inicio, expira, created_at FROM anuncios
                       WHERE inicio <= NOW() AND expira > NOW() ORDER BY inicio DESC LIMIT 20')->fetchAll();
  foreach ($filas as &$f) $f['id'] = (int)$f['id'];
  return $filas;
}

if ($metodo === 'GET') {
  if (!empty($_GET['todos']) && $direccion) {
    $filas = $db->query("SELECT a.id, a.texto, a.emoji, a.provincia, a.ciudad, a.inicio, a.expira, a.created_at,
                                TRIM(CONCAT(COALESCE(u.nombre, ''), ' ', COALESCE(u.apellidos, ''))) autor,
                                (a.inicio <= NOW() AND a.expira > NOW()) vigente
                         FROM anuncios a LEFT JOIN usuarios u ON u.id = a.autor_id
                         WHERE a.expira > NOW() - INTERVAL 30 DAY ORDER BY a.inicio DESC LIMIT 100")->fetchAll();
    foreach ($filas as &$f) {
      $f['id'] = (int)$f['id'];
      $f['vigente'] = (bool)$f['vigente'];
    }
    icc_json(['anuncios' => $filas, 'disponible' => true]);
  }
  icc_json(['anuncios' => icc_anuncios_vigentes($db), 'disponible' => true]);
}

icc_require_csrf();
if (!$direccion) icc_json(['error' => 'Solo dirección puede publicar o retirar anuncios'], 403);

if ($metodo === 'POST') {
  $b = icc_body();
  $texto = trim(preg_replace('/\s+/u', ' ', (string)($b['texto'] ?? '')));
  if ($texto === '') icc_json(['error' => 'Escribe el texto del anuncio'], 400);
  if (mb_strlen($texto) > 280) icc_json(['error' => 'El anuncio puede tener como mucho 280 caracteres'], 400);
  $emoji = mb_substr(trim((string)($b['emoji'] ?? '')), 0, 4) ?: '📣';
  $provincia = mb_substr(trim((string)($b['provincia'] ?? '')), 0, 60);
  $ciudad = mb_substr(trim((string)($b['ciudad'] ?? '')), 0, 100);
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
  $stmt = $db->prepare('INSERT INTO anuncios (texto, emoji, provincia, ciudad, expira, autor_id) VALUES (?, ?, ?, ?, ?, ?)');
  $stmt->execute([$texto, $emoji, $provincia, $ciudad, $expira, (int)$user['id']]);
  icc_json(['ok' => true, 'id' => (int)$db->lastInsertId(), 'expira' => $expira], 201);
}

if ($metodo === 'DELETE') {
  $id = (int)($_GET['id'] ?? 0);
  $stmt = $db->prepare('DELETE FROM anuncios WHERE id = ?');
  $stmt->execute([$id]);
  if (!$stmt->rowCount()) icc_json(['error' => 'Ese anuncio ya no existe'], 404);
  icc_json(['ok' => true]);
}

icc_json(['error' => 'Metodo no permitido'], 405);
