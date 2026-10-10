<?php
require __DIR__ . '/config.php';

$user = icc_require_auth();
$metodo = $_SERVER['REQUEST_METHOD'];

if ($metodo === 'GET') {
  $stmt = icc_db()->prepare('SELECT * FROM notificaciones WHERE user_id = ? ORDER BY created_at DESC LIMIT 30');
  $stmt->execute([$user['id']]);
  icc_json(['notificaciones' => $stmt->fetchAll()]);
}

if ($metodo === 'PUT') {
  icc_require_csrf();
  $id = (int)($_GET['id'] ?? 0);
  if (!$id) icc_json(['error' => 'Falta id'], 400);
  icc_db()->prepare('UPDATE notificaciones SET leido = 1 WHERE id = ? AND user_id = ?')->execute([$id, $user['id']]);
  icc_json(['ok' => true]);
}

icc_json(['error' => 'Metodo no permitido'], 405);
