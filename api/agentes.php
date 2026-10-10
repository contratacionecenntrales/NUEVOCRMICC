<?php
require __DIR__ . '/config.php';

$user = icc_require_role(['backoffice', 'jefe_de_equipo', 'admin', 'super_admin']);
$metodo = $_SERVER['REQUEST_METHOD'];
$id = isset($_GET['id']) ? (int)$_GET['id'] : null;

if ($metodo === 'GET' && $id === null) {
  $db = icc_db();
  $where = [];
  $params = [];

  $idsEquipo = icc_equipo_comercial_ids($user);
  if ($idsEquipo !== null) {
    // Jefe de equipo: solo se ve a si mismo y a su equipo, nunca a otros equipos ni a su superior.
    $where[] = 'id IN (' . implode(',', array_fill(0, count($idsEquipo), '?')) . ')';
    array_push($params, ...$idsEquipo);
  }

  if (isset($_GET['bloqueado']) && $_GET['bloqueado'] !== '') {
    $where[] = 'bloqueado = ?';
    $params[] = (int)$_GET['bloqueado'];
  }
  foreach (['nombre', 'apellidos', 'empresa', 'cif', 'telefono', 'tipo'] as $campo) {
    if (!empty($_GET[$campo])) {
      $where[] = "$campo LIKE ?";
      $params[] = '%' . $_GET[$campo] . '%';
    }
  }

  $sql = 'SELECT id, nombre, apellidos, email, telefono, empresa, cif, tipo, rol, supervisor_id, bloqueado, created_at FROM usuarios';
  if ($where) $sql .= ' WHERE ' . implode(' AND ', $where);
  $sql .= ' ORDER BY nombre ASC';

  $stmt = $db->prepare($sql);
  $stmt->execute($params);
  icc_json(['agentes' => $stmt->fetchAll()]);
}

if ($metodo === 'POST' && $id === null) {
  icc_require_role(['admin', 'super_admin', 'jefe_de_equipo']);
  icc_require_csrf();
  $body = icc_body();
  $email = trim($body['email'] ?? '');
  $password = (string)($body['password'] ?? '');
  $nombre = trim($body['nombre'] ?? '');
  $rol = $body['rol'] ?? 'comercial';

  // Un jefe de equipo solo puede dar de alta comerciales, y siempre en su propio
  // equipo (nunca backoffice/jefe_de_equipo/admin, ni asignar a otro jefe).
  if ($user['rol'] === 'jefe_de_equipo') {
    $rol = 'comercial';
  }

  if ($email === '' || strlen($password) < 6 || $nombre === '') {
    icc_json(['error' => 'Rellena nombre, email y una contrasena de al menos 6 caracteres'], 400);
  }
  if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    icc_json(['error' => 'Email no valido'], 400);
  }
  if (!in_array($rol, ['comercial', 'backoffice', 'jefe_de_equipo', 'admin', 'super_admin'], true)) {
    icc_json(['error' => 'Rol no valido'], 400);
  }
  // Solo un Super Administrador puede crear otra cuenta de Admin o Super Admin.
  if (in_array($rol, ['admin', 'super_admin'], true) && !icc_es_super_admin($user)) {
    icc_json(['error' => 'Solo un Super Administrador puede crear cuentas de Admin o Super Admin'], 403);
  }

  $db = icc_db();
  $stmt = $db->prepare('SELECT id FROM usuarios WHERE email = ?');
  $stmt->execute([$email]);
  if ($stmt->fetch()) {
    icc_json(['error' => 'Ya existe una cuenta con ese email'], 409);
  }

  $supervisorId = null;
  if ($rol === 'comercial') {
    if ($user['rol'] === 'jefe_de_equipo') {
      $supervisorId = icc_validar_supervisor($db, (int)$user['id']);
    } elseif (!empty($body['supervisor_id'])) {
      $supervisorId = icc_validar_supervisor($db, (int)$body['supervisor_id']);
    }
  }

  $ins = $db->prepare(
    'INSERT INTO usuarios (nombre, apellidos, email, password_hash, telefono, empresa, cif, tipo, rol, supervisor_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  $ins->execute([
    $nombre,
    trim($body['apellidos'] ?? ''),
    $email,
    password_hash($password, PASSWORD_DEFAULT),
    trim($body['telefono'] ?? ''),
    trim($body['empresa'] ?? ''),
    trim($body['cif'] ?? ''),
    trim($body['tipo'] ?? ''),
    $rol,
    $supervisorId,
  ]);
  $nuevoId = (int)$db->lastInsertId();

  if ($rol === 'comercial') {
    icc_crear_carpeta_personal_fichero($db, $nuevoId, $nombre);
  }

  icc_json(['id' => $nuevoId], 201);
}

if ($metodo === 'PUT' && $id !== null) {
  icc_require_csrf();
  $db = icc_db();

  // El jefe de equipo solo puede tocar cuentas de su propio equipo (o la suya propia);
  // rol y a que jefe pertenece cada comercial se quedan exclusivos de Admin/Super
  // Admin (el bloqueo tiene su propia regla mas abajo, que si permite al jefe de equipo).
  if ($user['rol'] === 'jefe_de_equipo' && !icc_puede_ver_comercial($user, $id)) {
    icc_json(['error' => 'No tienes permiso para gestionar esta cuenta'], 403);
  }

  $stmt = $db->prepare('SELECT rol FROM usuarios WHERE id = ?');
  $stmt->execute([$id]);
  $objetivo = $stmt->fetch();
  if (!$objetivo) icc_json(['error' => 'Usuario no encontrado'], 404);
  $rolObjetivo = $objetivo['rol'];

  // Un Admin normal no puede tocar ninguna cuenta de Admin o Super Admin (ni la
  // suya, salvo que sea la propia, para poder seguir editando su propio perfil):
  // eso es exclusivo de Super Admin.
  if (in_array($rolObjetivo, ['admin', 'super_admin'], true) && $id !== (int)$user['id'] && !icc_es_super_admin($user)) {
    icc_json(['error' => 'No tienes permiso para gestionar esta cuenta'], 403);
  }

  $body = icc_body();
  $sets = [];
  $valores = [];

  if (array_key_exists('bloqueado', $body)) {
    if (icc_es_admin_o_superior($user)) {
      $sets[] = 'bloqueado = ?';
      $valores[] = $body['bloqueado'] ? 1 : 0;
    } elseif ($user['rol'] === 'jefe_de_equipo') {
      // Un jefe de equipo puede bloquear/desbloquear a los comerciales de su
      // propio equipo (ya comprobado mas arriba con icc_puede_ver_comercial),
      // pero nunca a si mismo ni a cuentas que no sean comerciales.
      if ($id === (int)$user['id'] || $rolObjetivo !== 'comercial') {
        icc_json(['error' => 'Solo puedes bloquear o desbloquear a comerciales de tu equipo'], 403);
      }
      $sets[] = 'bloqueado = ?';
      $valores[] = $body['bloqueado'] ? 1 : 0;
    }
  }
  if (icc_es_admin_o_superior($user)) {
    if (array_key_exists('rol', $body)) {
      $nuevoRol = $body['rol'];
      if (in_array($nuevoRol, ['comercial', 'backoffice', 'jefe_de_equipo'], true)) {
        $sets[] = 'rol = ?';
        $valores[] = $nuevoRol;
      } elseif (in_array($nuevoRol, ['admin', 'super_admin'], true)) {
        // El guard de mas arriba ya garantiza que, si $rolObjetivo ya era
        // admin/super_admin, solo un Super Admin ha llegado hasta aqui; falta
        // cubrir el caso de PROMOCIONAR a alguien que hoy es un rol menor.
        if (!icc_es_super_admin($user)) {
          icc_json(['error' => 'Solo un Super Administrador puede asignar el rol de Admin o Super Admin'], 403);
        }
        $sets[] = 'rol = ?';
        $valores[] = $nuevoRol;
      }
    }
    if (array_key_exists('supervisor_id', $body)) {
      $supervisorId = $body['supervisor_id'] ? icc_validar_supervisor($db, (int)$body['supervisor_id']) : null;
      $sets[] = 'supervisor_id = ?';
      $valores[] = $supervisorId;
    }
  }
  foreach (['nombre', 'apellidos', 'telefono', 'empresa', 'cif', 'tipo'] as $campo) {
    if (array_key_exists($campo, $body)) {
      $sets[] = "$campo = ?";
      $valores[] = trim((string)$body[$campo]);
    }
  }
  if (!empty($body['password'])) {
    if (strlen($body['password']) < 6) icc_json(['error' => 'La contrasena debe tener al menos 6 caracteres'], 400);
    $sets[] = 'password_hash = ?';
    $valores[] = password_hash($body['password'], PASSWORD_DEFAULT);
  }

  if (!$sets) icc_json(['ok' => true]);
  $valores[] = $id;
  $db->prepare('UPDATE usuarios SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($valores);
  icc_json(['ok' => true]);
}

if ($metodo === 'DELETE' && $id !== null) {
  icc_require_role(['admin', 'super_admin']);
  icc_require_csrf();
  $db = icc_db();

  if ($id === (int)$user['id']) {
    icc_json(['error' => 'No puedes eliminar tu propia cuenta'], 400);
  }

  $stmt = $db->prepare('SELECT rol FROM usuarios WHERE id = ?');
  $stmt->execute([$id]);
  $objetivo = $stmt->fetch();
  if (!$objetivo) icc_json(['error' => 'Usuario no encontrado'], 404);
  if (in_array($objetivo['rol'], ['admin', 'super_admin'], true) && !icc_es_super_admin($user)) {
    icc_json(['error' => 'Solo un Super Administrador puede eliminar una cuenta de Admin o Super Admin'], 403);
  }

  $conteos = [
    'clientes' => 'SELECT COUNT(*) AS total FROM clientes WHERE comercial_id = ?',
    'contratos' => 'SELECT COUNT(*) AS total FROM contratos WHERE comercial_id = ?',
    'presupuestos' => 'SELECT COUNT(*) AS total FROM presupuestos WHERE comercial_id = ?',
    'proformas' => 'SELECT COUNT(*) AS total FROM proformas WHERE comercial_id = ?',
    'comparativas' => 'SELECT COUNT(*) AS total FROM comparador_auditorias WHERE gestor_id = ?',
    'equipo' => 'SELECT COUNT(*) AS total FROM usuarios WHERE supervisor_id = ?',
  ];
  try {
    foreach ($conteos as $motivo => $sql) {
      $stmt = $db->prepare($sql);
      $stmt->execute([$id]);
      if ((int)$stmt->fetch()['total'] > 0) {
        icc_json(['error' => 'No se puede eliminar: esta cuenta todavia tiene ' . $motivo . ' asociados. Reasignalos primero, o bloquea la cuenta en su lugar.'], 409);
      }
    }
    $db->prepare('DELETE FROM usuarios WHERE id = ?')->execute([$id]);
  } catch (Exception $e) {
    icc_json(['error' => icc_mensaje_error('No se pudo eliminar la cuenta', $e, $user)], 500);
  }
  icc_json(['ok' => true]);
}

icc_json(['error' => 'Peticion no valida'], 404);

/**
 * Valida que el supervisor exista y sea Jefe de equipo (o Admin/Super Admin:
 * alguien que venia liderando un equipo como jefe_de_equipo y luego se
 * promociona sigue pudiendo ser el supervisor de ese mismo equipo). Sin
 * limite de tamano de equipo: un Jefe de equipo puede tener tantos
 * comerciales como haga falta.
 */
function icc_validar_supervisor(PDO $db, int $supervisorId): int {
  $stmt = $db->prepare("SELECT id FROM usuarios WHERE id = ? AND rol IN ('jefe_de_equipo', 'admin', 'super_admin')");
  $stmt->execute([$supervisorId]);
  if (!$stmt->fetch()) {
    icc_json(['error' => 'El supervisor indicado no existe o no es Jefe de equipo'], 400);
  }

  return $supervisorId;
}
