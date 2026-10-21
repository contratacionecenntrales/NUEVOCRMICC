<?php
require __DIR__ . '/config.php';

$accion = $_GET['action'] ?? '';
$metodo = $_SERVER['REQUEST_METHOD'];

if ($metodo === 'GET' && $accion === 'me') {
  $user = icc_current_user();
  icc_json(['user' => $user, 'csrf' => icc_ensure_csrf(), 'impersonando' => icc_info_impersonacion()]);
}

if ($metodo === 'POST' && $accion === 'ver_como') {
  // Quien entra: Admin y superiores, Jefe de equipo y Backoffice (estos dos
  // solo en sus comerciales). Si ya se esta en "Ver como", los permisos son
  // los de la cuenta en la que se esta (p. ej. Juan viendo como Daniela puede
  // pasar a un comercial de Daniela) y el registro queda a nombre de quien
  // empezo ("Volver a mi cuenta" devuelve siempre a su cuenta).
  $admin = icc_require_role(ICC_ROLES_INTERNOS);
  icc_require_csrf();
  $body = icc_body();
  $objetivoId = (int)($body['id'] ?? 0);
  if ($objetivoId === (int)$admin['id']) {
    icc_json(['error' => 'No tiene sentido entrar en tu propia cuenta'], 400);
  }
  $db = icc_db();
  $stmt = $db->prepare('SELECT id, bloqueado, rol, supervisor_id FROM usuarios WHERE id = ?');
  $stmt->execute([$objetivoId]);
  $objetivo = $stmt->fetch();
  if (!$objetivo) icc_json(['error' => 'Usuario no encontrado'], 404);
  if ((int)$objetivo['bloqueado'] === 1) icc_json(['error' => 'Esa cuenta esta bloqueada'], 400);
  // Un Admin normal no puede entrar en cuentas de Admin/Super Admin (solo "hacia
  // abajo" en la jerarquia); Super Admin puede entrar en cualquiera.
  // Un Jefe de equipo solo entra en los comerciales de su propio equipo, y si
  // tiene el permiso usuarios.ver_como.
  if ($admin['rol'] === 'jefe_de_equipo' && !icc_jefe_gestiona($admin, $objetivo, 'usuarios.ver_como')) {
    icc_json(['error' => 'Solo puedes entrar como los comerciales de tu equipo'], 403);
  }
  // Backoffice: solo en los comerciales que lleva (nunca jefes ni direccion).
  if ($admin['rol'] === 'backoffice'
      && (!icc_tiene_permiso($admin, 'usuarios.ver_como') || $objetivo['rol'] !== 'comercial' || !icc_puede_ver_comercial($admin, (int)$objetivo['id']))) {
    icc_json(['error' => 'Solo puedes entrar como los comerciales que tienes asignados'], 403);
  }
  $impersonadorOriginal = !empty($_SESSION['impersonador_id']) ? (int)$_SESSION['impersonador_id'] : (int)$admin['id'];
  if ($objetivoId === $impersonadorOriginal) {
    icc_json(['error' => 'Para volver a tu cuenta pulsa «Volver a mi cuenta»'], 400);
  }
  if (in_array($objetivo['rol'], ICC_ROLES_ADMIN, true) && !icc_es_super_admin($admin)) {
    icc_json(['error' => 'Solo un Super Administrador puede entrar en una cuenta de Administrador, Gerente, Coordinador o Super Admin'], 403);
  }

  // Si ya se estaba en "Ver como", se cierra ese tramo antes de abrir el nuevo.
  if (!empty($_SESSION['impersonacion_log_id'])) {
    $db->prepare('UPDATE logs_impersonacion SET finalizado_en = NOW() WHERE id = ?')->execute([$_SESSION['impersonacion_log_id']]);
  }
  $db->prepare('INSERT INTO logs_impersonacion (admin_id, usuario_objetivo_id, ip) VALUES (?, ?, ?)')
    ->execute([$impersonadorOriginal, $objetivoId, $_SERVER['REMOTE_ADDR'] ?? null]);
  $_SESSION['impersonacion_log_id'] = (int)$db->lastInsertId();
  $_SESSION['impersonador_id'] = $impersonadorOriginal;
  $_SESSION['user_id'] = $objetivoId;
  $detalle = $impersonadorOriginal !== (int)$admin['id'] ? ' (desde la cuenta de ' . $admin['nombre'] . ')' : '';
  icc_auditar($objetivoId, $impersonadorOriginal, 'ver_como', 'Ha entrado en la cuenta con "Ver como"' . $detalle);

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
  icc_require_role(ICC_ROLES_ADMIN);
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

  $db = icc_db();
  $stmt = $db->prepare('SELECT * FROM usuarios WHERE email = ?');
  $stmt->execute([$email]);
  $user = $stmt->fetch();

  // Proteccion contra fuerza bruta: 5 intentos fallidos en 15 minutos
  // bloquean temporalmente el acceso a esa cuenta.
  if ($user && icc_v52()) {
    $stmt = $db->prepare(
      "SELECT COUNT(*) AS total FROM usuarios_auditoria
       WHERE usuario_id = ? AND accion = 'login_fallido' AND created_at > (NOW() - INTERVAL 15 MINUTE)
         AND created_at > COALESCE((SELECT MAX(created_at) FROM usuarios_auditoria WHERE usuario_id = ? AND accion = 'login'), '1970-01-01')"
    );
    $stmt->execute([$user['id'], $user['id']]);
    if ((int)$stmt->fetch()['total'] >= 5) {
      icc_json(['error' => 'Demasiados intentos fallidos. Espera 15 minutos o pide a administracion que restablezca tu contrasena.'], 429);
    }
  }

  if (!$user || !password_verify($password, $user['password_hash'])) {
    if ($user) icc_auditar((int)$user['id'], null, 'login_fallido', 'Contrasena incorrecta');
    icc_json(['error' => 'Email o contraseña incorrectos'], 401);
  }
  if ((int)$user['bloqueado'] === 1) {
    icc_json(['error' => 'Tu cuenta esta bloqueada. Contacta con administracion.'], 403);
  }

  session_regenerate_id(true);
  unset($_SESSION['impersonador_id'], $_SESSION['impersonacion_log_id'], $_SESSION['sesion_token']);
  $_SESSION['user_id'] = (int)$user['id'];
  icc_sesion_crear((int)$user['id']);
  icc_auditar((int)$user['id'], (int)$user['id'], 'login', 'Inicio de sesion');
  icc_json(['user' => icc_current_user(true), 'csrf' => icc_ensure_csrf(), 'impersonando' => null]);
}

if ($metodo === 'POST' && $accion === 'cambiar_password') {
  $user = icc_require_auth();
  icc_require_csrf();
  if (!empty($_SESSION['impersonador_id'])) {
    icc_json(['error' => 'No puedes cambiar la contrasena de otro usuario desde "Ver como"'], 403);
  }
  $body = icc_body();
  $actual = (string)($body['actual'] ?? '');
  $nueva = (string)($body['nueva'] ?? '');
  $error = icc_validar_politica_password($nueva);
  if ($error) icc_json(['error' => $error], 400);

  $db = icc_db();
  $stmt = $db->prepare('SELECT password_hash FROM usuarios WHERE id = ?');
  $stmt->execute([$user['id']]);
  $hashActual = $stmt->fetch()['password_hash'];
  if (!password_verify($actual, $hashActual)) {
    icc_json(['error' => 'La contrasena actual no es correcta'], 400);
  }
  if ($nueva === $actual) {
    icc_json(['error' => 'La nueva contrasena debe ser distinta de la actual'], 400);
  }
  $sets = 'password_hash = ?' . (icc_v52() ? ', debe_cambiar_password = 0, password_actualizada_en = NOW()' : '');
  $db->prepare("UPDATE usuarios SET $sets WHERE id = ?")->execute([password_hash($nueva, PASSWORD_DEFAULT), $user['id']]);
  $cerradas = icc_sesiones_cerrar((int)$user['id'], (int)$user['id'], 'cambio_password', icc_sesion_actual_id());
  icc_auditar((int)$user['id'], (int)$user['id'], 'password_cambiada', 'Cambiada por el propio usuario' . ($cerradas ? '; ' . icc_n_sesiones($cerradas) : ''));
  icc_json(['ok' => true, 'user' => icc_current_user(true)]);
}

// No existe alta publica: las cuentas del equipo las crea un administrador
// desde "Agentes" (ver api/agentes.php, accion POST).

if ($metodo === 'POST' && $accion === 'logout') {
  if (!empty($_SESSION['impersonador_id'])) {
    icc_cerrar_impersonacion_actual();
  }
  if (icc_v52() && !empty($_SESSION['sesion_token'])) {
    icc_db()->prepare("UPDATE usuarios_sesiones SET cerrada_en = NOW(), motivo_cierre = 'logout' WHERE token_hash = ? AND cerrada_en IS NULL")
      ->execute([hash('sha256', $_SESSION['sesion_token'])]);
  }
  $_SESSION = [];
  session_destroy();
  icc_json(['ok' => true]);
}

icc_json(['error' => 'Accion no valida'], 404);
