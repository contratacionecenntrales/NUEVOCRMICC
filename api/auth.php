<?php
require __DIR__ . '/config.php';

$accion = $_GET['action'] ?? '';
$metodo = $_SERVER['REQUEST_METHOD'];

if ($metodo === 'GET' && $accion === 'me') {
  $user = icc_current_user();
  icc_json(['user' => $user, 'csrf' => icc_ensure_csrf(), 'impersonando' => icc_info_impersonacion()]);
}

if ($metodo === 'POST' && $accion === 'ver_como') {
  $admin = icc_require_role(['admin', 'super_admin']);
  icc_require_csrf();
  if (!empty($_SESSION['impersonador_id'])) {
    icc_json(['error' => 'Ya estas viendo el CRM como otro usuario. Vuelve a tu cuenta antes de entrar en otra.'], 409);
  }
  $body = icc_body();
  $objetivoId = (int)($body['id'] ?? 0);
  if ($objetivoId === (int)$admin['id']) {
    icc_json(['error' => 'No tiene sentido entrar en tu propia cuenta'], 400);
  }
  $db = icc_db();
  $stmt = $db->prepare('SELECT id, bloqueado, rol FROM usuarios WHERE id = ?');
  $stmt->execute([$objetivoId]);
  $objetivo = $stmt->fetch();
  if (!$objetivo) icc_json(['error' => 'Usuario no encontrado'], 404);
  if ((int)$objetivo['bloqueado'] === 1) icc_json(['error' => 'Esa cuenta esta bloqueada'], 400);
  // Un Admin normal no puede entrar en cuentas de Admin/Super Admin (solo "hacia
  // abajo" en la jerarquia); Super Admin puede entrar en cualquiera.
  if (in_array($objetivo['rol'], ['admin', 'super_admin'], true) && !icc_es_super_admin($admin)) {
    icc_json(['error' => 'Solo un Super Administrador puede entrar en una cuenta de Admin o Super Admin'], 403);
  }

  $db->prepare('INSERT INTO logs_impersonacion (admin_id, usuario_objetivo_id, ip) VALUES (?, ?, ?)')
    ->execute([$admin['id'], $objetivoId, $_SERVER['REMOTE_ADDR'] ?? null]);
  $_SESSION['impersonacion_log_id'] = (int)$db->lastInsertId();
  $_SESSION['impersonador_id'] = (int)$admin['id'];
  $_SESSION['user_id'] = $objetivoId;

  $nuevoUsuario = icc_current_user(true);
  icc_json(['user' => $nuevoUsuario, 'csrf' => icc_ensure_csrf(), 'impersonando' => icc_info_impersonacion()]);
}

if ($metodo === 'POST' && $accion === 'detener_impersonacion') {
  icc_require_auth();
  icc_require_csrf();
  if (empty($_SESSION['impersonador_id'])) {
    icc_json(['error' => 'No estas viendo el CRM como otro usuario'], 400);
  }
  icc_cerrar_impersonacion_actual();
  $adminOriginal = icc_current_user(true);
  icc_json(['user' => $adminOriginal, 'csrf' => icc_ensure_csrf(), 'impersonando' => null]);
}

if ($metodo === 'GET' && $accion === 'historial_impersonacion') {
  icc_require_role(['admin', 'super_admin']);
  $stmt = icc_db()->query(
    "SELECT l.*, a.nombre AS admin_nombre, o.nombre AS objetivo_nombre, o.rol AS objetivo_rol
     FROM logs_impersonacion l
     JOIN usuarios a ON a.id = l.admin_id
     JOIN usuarios o ON o.id = l.usuario_objetivo_id
     ORDER BY l.iniciado_en DESC LIMIT 300"
  );
  icc_json(['historial' => $stmt->fetchAll()]);
}

if ($metodo === 'POST' && $accion === 'login') {
  $body = icc_body();
  $email = trim($body['email'] ?? '');
  $password = (string)($body['password'] ?? '');
  if ($email === '' || $password === '') {
    icc_json(['error' => 'Indica email y contrasena'], 400);
  }

  $stmt = icc_db()->prepare('SELECT * FROM usuarios WHERE email = ?');
  $stmt->execute([$email]);
  $user = $stmt->fetch();

  if (!$user || !password_verify($password, $user['password_hash'])) {
    icc_json(['error' => 'Email o contrasena incorrectos'], 401);
  }
  if ((int)$user['bloqueado'] === 1) {
    icc_json(['error' => 'Tu cuenta esta bloqueada. Contacta con administracion.'], 403);
  }

  session_regenerate_id(true);
  unset($_SESSION['impersonador_id'], $_SESSION['impersonacion_log_id']);
  $_SESSION['user_id'] = (int)$user['id'];
  unset($user['password_hash']);
  icc_json(['user' => $user, 'csrf' => icc_ensure_csrf(), 'impersonando' => null]);
}

// No existe alta publica: las cuentas del equipo las crea un administrador
// desde "Agentes" (ver api/agentes.php, accion POST).

if ($metodo === 'POST' && $accion === 'logout') {
  if (!empty($_SESSION['impersonador_id'])) {
    icc_cerrar_impersonacion_actual();
  }
  $_SESSION = [];
  session_destroy();
  icc_json(['ok' => true]);
}

icc_json(['error' => 'Accion no valida'], 404);
