<?php
require __DIR__ . '/config.php';

$user = icc_require_role(ICC_ROLES_INTERNOS);
$metodo = $_SERVER['REQUEST_METHOD'];
$id = isset($_GET['id']) ? (int)$_GET['id'] : null;

// Lo que tiene cada cuenta antes de darla de baja (solo Admin): ?action=resumen_baja&ids=1,2
if ($metodo === 'GET' && ($_GET['action'] ?? '') === 'resumen_baja') {
  icc_require_role(ICC_ROLES_ADMIN);
  $db = icc_db();
  $ids = array_values(array_unique(array_filter(array_map('intval', explode(',', (string)($_GET['ids'] ?? ''))))));
  $out = [];
  foreach ($ids as $uid) $out[$uid] = icc_resumen_datos_usuario($db, $uid);
  icc_json(['resumen' => (object)$out]);
}

if ($metodo === 'GET' && $id === null) {
  $db = icc_db();
  $where = [];
  $params = [];

  $idsEquipo = icc_equipo_comercial_ids($user);
  // Backoffice: tambien ve a las personas cuya agenda gestiona (solo agenda).
  $soloAgenda = icc_agendas_compartidas($user);
  if ($idsEquipo !== null && $soloAgenda) $idsEquipo = array_values(array_unique(array_merge($idsEquipo, $soloAgenda)));
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

  // supervisor_nombre: para que se vea el Jefe de equipo aunque quien consulta
  // no lo tenga en su lista (p. ej. un Backoffice con comerciales asignados).
  $columnas = 'u.id, u.nombre, u.apellidos, u.email, u.telefono, u.empresa, u.cif, u.tipo, u.rol, u.supervisor_id, u.bloqueado, u.created_at, s.nombre AS supervisor_nombre';
  $join = ' LEFT JOIN usuarios s ON s.id = u.supervisor_id';
  if (icc_v52()) {
    $columnas .= ', u.numero_relacion, u.avatar_ruta, u.ultimo_acceso, p.estado_disponibilidad, p.ausencia_hasta';
    $join .= ' LEFT JOIN usuarios_preferencias p ON p.usuario_id = u.id';
  }
  // Actividad de cada usuario para las tarjetas de Agentes.
  $columnas .= ", (SELECT COUNT(*) FROM clientes cl WHERE cl.comercial_id = u.id) AS n_clientes"
    . ", (SELECT COUNT(*) FROM contratos co WHERE co.comercial_id = u.id AND co.fecha_alta >= DATE_FORMAT(CURDATE(), '%Y-%m-01')) AS contratos_mes";
  $where = array_map(function ($w) { return 'u.' . $w; }, $where);
  $sql = "SELECT $columnas FROM usuarios u$join";
  if ($where) $sql .= ' WHERE ' . implode(' AND ', $where);
  $sql .= ' ORDER BY u.nombre ASC';

  $stmt = $db->prepare($sql);
  $stmt->execute($params);
  $agentes = $stmt->fetchAll();
  if ($soloAgenda) {
    foreach ($agentes as &$a) {
      if (in_array((int)$a['id'], $soloAgenda, true)) {
        // De sus superiores solo comparte la agenda: nada de su actividad.
        $a['solo_agenda'] = 1;
        $a['n_clientes'] = null;
        $a['contratos_mes'] = null;
      }
    }
    unset($a);
  }
  icc_json(['agentes' => $agentes]);
}

if ($metodo === 'POST' && $id === null) {
  icc_require_role(ICC_ROLES_INTERNOS);
  icc_require_csrf();
  $body = icc_body();
  $email = trim($body['email'] ?? '');
  $password = (string)($body['password'] ?? '');
  $nombre = trim($body['nombre'] ?? '');
  $rol = $body['rol'] ?? 'comercial';

  // Un jefe de equipo solo puede dar de alta comerciales, y siempre en su propio
  // equipo (nunca backoffice/jefe_de_equipo/admin, ni asignar a otro jefe).
  if ($user['rol'] === 'jefe_de_equipo') {
    icc_require_permiso($user, 'usuarios.crear');
    $rol = 'comercial';
  }
  // Backoffice: solo da de alta Comerciales / Agentes, nunca otro rol.
  if ($user['rol'] === 'backoffice') {
    icc_require_permiso($user, 'usuarios.crear');
    $rol = 'comercial';
  }

  if ($email === '' || strlen($password) < 6 || $nombre === '') {
    icc_json(['error' => 'Rellena nombre, email y una contrasena de al menos 6 caracteres'], 400);
  }
  if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    icc_json(['error' => 'Email no valido'], 400);
  }
  if (!in_array($rol, ICC_TODOS_ROLES, true)) {
    icc_json(['error' => 'Rol no valido'], 400);
  }
  // Solo un Super Administrador puede crear otra cuenta de Admin o Super Admin.
  if (in_array($rol, ICC_ROLES_ADMIN, true) && !icc_es_super_admin($user)) {
    icc_json(['error' => 'Solo un Super Administrador puede crear cuentas de Administrador, Gerente, Coordinador o Super Admin'], 403);
  }

  $db = icc_db();
  $stmt = $db->prepare('SELECT id FROM usuarios WHERE email = ?');
  $stmt->execute([$email]);
  if ($stmt->fetch()) {
    icc_json(['error' => 'Ya existe una cuenta con ese email'], 409);
  }

  $supervisorId = null;
  if ($rol === 'comercial' && $user['rol'] === 'jefe_de_equipo') {
    $supervisorId = icc_validar_supervisor($db, (int)$user['id'], $rol);
  } elseif ($user['rol'] === 'backoffice') {
    // Solo en los equipos con los que trabaja (o cualquiera si ve toda la empresa).
    if (!empty($body['supervisor_id'])) {
      $supervisorId = icc_validar_supervisor($db, (int)$body['supervisor_id'], 'comercial');
      $permitidos = icc_backoffice_jefes_permitidos($db, $user);
      if ($permitidos !== null && !in_array($supervisorId, $permitidos, true)) {
        icc_json(['error' => 'Solo puedes dar de alta comerciales en los equipos con los que trabajas'], 403);
      }
    }
  } elseif (in_array($rol, ['comercial', 'jefe_de_equipo'], true) && !empty($body['supervisor_id'])) {
    $supervisorId = icc_validar_supervisor($db, (int)$body['supervisor_id'], $rol);
  }

  $ins = $db->prepare(
    'INSERT INTO usuarios (nombre, apellidos, email, password_hash, telefono, empresa, cif, tipo, rol, supervisor_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  $ins->execute([
    $nombre,
    trim($body['apellidos'] ?? ''),
    $email,
    icc_hash_password($password),
    trim($body['telefono'] ?? ''),
    trim($body['empresa'] ?? ''),
    trim($body['cif'] ?? ''),
    trim($body['tipo'] ?? ''),
    $rol,
    $supervisorId,
  ]);
  $nuevoId = (int)$db->lastInsertId();
  if (icc_v52()) {
    $db->prepare("UPDATE usuarios SET numero_relacion = CONCAT('ICC-', LPAD(id, 5, '0')), debe_cambiar_password = 1 WHERE id = ?")->execute([$nuevoId]);
  }
  icc_auditar($nuevoId, (int)$user['id'], 'cuenta_creada', 'Cuenta creada por ' . $user['nombre'] . ' con rol ' . $rol . ' (contrasena provisional)');

  if ($rol === 'comercial') {
    icc_crear_carpeta_personal_fichero($db, $nuevoId, $nombre);
  }
  // Backoffice con comerciales asignados: el nuevo comercial queda asignado a el.
  if ($user['rol'] === 'backoffice' && icc_v_backoffice_asignaciones() && icc_backoffice_asignados((int)$user['id'])) {
    $db->prepare('INSERT IGNORE INTO backoffice_comerciales (backoffice_id, comercial_id, asignado_por) VALUES (?, ?, ?)')
      ->execute([(int)$user['id'], $nuevoId, (int)$user['id']]);
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
  // Backoffice (y cualquier otro rol sin gestion de cuentas) solo puede editar
  // su propia cuenta: antes podia cambiar datos y contrasena de cualquier
  // comercial o jefe de equipo.
  if (!icc_es_admin_o_superior($user) && $user['rol'] !== 'jefe_de_equipo' && $id !== (int)$user['id']) {
    icc_json(['error' => 'No tienes permiso para gestionar esta cuenta'], 403);
  }

  $stmt = $db->prepare('SELECT rol, supervisor_id FROM usuarios WHERE id = ?');
  $stmt->execute([$id]);
  $objetivo = $stmt->fetch();
  if (!$objetivo) icc_json(['error' => 'Usuario no encontrado'], 404);
  $rolObjetivo = $objetivo['rol'];

  // Sobre otra cuenta de su equipo, el jefe necesita el permiso usuarios.gestionar.
  if ($user['rol'] === 'jefe_de_equipo' && $id !== (int)$user['id'] && !icc_jefe_gestiona($user, $objetivo)) {
    icc_json(['error' => 'No tienes permiso para gestionar las cuentas de tu equipo'], 403);
  }

  // Un Admin normal no puede tocar ninguna cuenta de Admin o Super Admin (ni la
  // suya, salvo que sea la propia, para poder seguir editando su propio perfil):
  // eso es exclusivo de Super Admin.
  if (in_array($rolObjetivo, ICC_ROLES_ADMIN, true) && $id !== (int)$user['id'] && !icc_es_super_admin($user)) {
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
  $rolFinal = $rolObjetivo;
  if (icc_es_admin_o_superior($user)) {
    if (array_key_exists('rol', $body)) {
      $nuevoRol = $body['rol'];
      if (in_array($nuevoRol, ['comercial', 'backoffice', 'jefe_de_equipo'], true)) {
        $sets[] = 'rol = ?';
        $valores[] = $nuevoRol;
        $rolFinal = $nuevoRol;
      } elseif (in_array($nuevoRol, ICC_ROLES_ADMIN, true)) {
        // El guard de mas arriba ya garantiza que, si $rolObjetivo ya era
        // admin/super_admin, solo un Super Admin ha llegado hasta aqui; falta
        // cubrir el caso de PROMOCIONAR a alguien que hoy es un rol menor.
        if (!icc_es_super_admin($user)) {
          icc_json(['error' => 'Solo un Super Administrador puede asignar los roles de Administrador, Gerente, Coordinador o Super Admin'], 403);
        }
        $sets[] = 'rol = ?';
        $valores[] = $nuevoRol;
        $rolFinal = $nuevoRol;
      }
    }
    if (array_key_exists('supervisor_id', $body)) {
      if ($body['supervisor_id'] && (int)$body['supervisor_id'] === $id) {
        icc_json(['error' => 'Un usuario no puede ser su propio responsable'], 400);
      }
      $supervisorId = $body['supervisor_id'] ? icc_validar_supervisor($db, (int)$body['supervisor_id'], $rolFinal) : null;
      $sets[] = 'supervisor_id = ?';
      $valores[] = $supervisorId;
    } elseif ($rolFinal !== $rolObjetivo) {
      // Al cambiar de rol, el responsable anterior puede dejar de tener
      // sentido (p. ej. un comercial de Maria ascendido a Jefe de equipo no
      // debe seguir colgando de Maria): se conserva solo si sigue siendo
      // valido para el rol nuevo.
      $stmt = $db->prepare('SELECT supervisor_id FROM usuarios WHERE id = ?');
      $stmt->execute([$id]);
      $supActual = $stmt->fetch()['supervisor_id'];
      if ($supActual !== null && !icc_supervisor_valido($db, (int)$supActual, $rolFinal)) {
        $sets[] = 'supervisor_id = NULL';
      }
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
    $valores[] = icc_hash_password($body['password']);
  }

  if (!$sets) icc_json(['ok' => true]);
  $valores[] = $id;
  $db->prepare('UPDATE usuarios SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($valores);
  icc_registrar_cambios_cuenta($db, $user, $id, $body, $rolObjetivo, $rolFinal);
  icc_json(['ok' => true]);
}

if ($metodo === 'DELETE' && $id !== null) {
  icc_require_role(ICC_ROLES_ADMIN);
  icc_require_csrf();
  $db = icc_db();

  if ($id === (int)$user['id']) {
    icc_json(['error' => 'No puedes eliminar tu propia cuenta'], 400);
  }
  if (!empty($_SESSION['impersonador_id']) && $id === (int)$_SESSION['impersonador_id']) {
    icc_json(['error' => 'No puedes eliminar la cuenta con la que has entrado'], 400);
  }

  $stmt = $db->prepare('SELECT id, nombre, apellidos, rol FROM usuarios WHERE id = ?');
  $stmt->execute([$id]);
  $objetivo = $stmt->fetch();
  if (!$objetivo) icc_json(['error' => 'Usuario no encontrado'], 404);
  if (in_array($objetivo['rol'], ICC_ROLES_ADMIN, true) && !icc_es_super_admin($user)) {
    icc_json(['error' => 'Solo un Super Administrador puede eliminar una cuenta de Administrador, Gerente, Coordinador o Super Admin'], 403);
  }

  // Destino del traspaso: una cuenta de direccion activa (Admin, Gerente, Coordinador o Super Admin).
  $destinoId = isset($_GET['traspasar_a']) && $_GET['traspasar_a'] !== '' ? (int)$_GET['traspasar_a'] : null;
  $resumen = icc_resumen_datos_usuario($db, $id);
  $tieneDatos = array_sum($resumen) > 0;
  if ($tieneDatos && $destinoId === null) {
    icc_json(['error' => 'Esta cuenta tiene clientes u otros datos: elige a quién se traspasan antes de borrarla', 'resumen' => $resumen], 409);
  }
  $destino = null;
  if ($destinoId !== null) {
    if ($destinoId === $id) icc_json(['error' => 'No puedes traspasar los datos a la misma cuenta que borras'], 400);
    $stmt = $db->prepare('SELECT id, nombre, apellidos, rol, bloqueado FROM usuarios WHERE id = ?');
    $stmt->execute([$destinoId]);
    $destino = $stmt->fetch();
    if (!$destino || !icc_es_rol_admin($destino['rol']) || (int)$destino['bloqueado'] === 1) {
      icc_json(['error' => 'Los datos solo se pueden traspasar a una cuenta de dirección activa (Administrador, Gerente, Coordinador o Super Admin)'], 400);
    }
  }

  $db->beginTransaction();
  try {
    if ($destino) icc_traspasar_datos_usuario($db, $id, (int)$destino['id'], trim($objetivo['nombre'] . ' ' . ($objetivo['apellidos'] ?? '')));
    $db->prepare('DELETE FROM usuarios WHERE id = ?')->execute([$id]);
    $db->commit();
  } catch (Exception $e) {
    $db->rollBack();
    icc_json(['error' => icc_mensaje_error('No se pudo eliminar la cuenta', $e, $user)], 500);
  }
  if ($destino) {
    icc_auditar((int)$destino['id'], (int)$user['id'], 'datos_traspasados',
      'Recibe los datos de la cuenta borrada de ' . trim($objetivo['nombre'] . ' ' . ($objetivo['apellidos'] ?? '')) . ': ' . json_encode($resumen, JSON_UNESCAPED_UNICODE));
  }
  icc_json(['ok' => true, 'traspasado' => $destino ? $resumen : null]);
}

icc_json(['error' => 'Peticion no valida'], 404);

/**
 * Efectos secundarios de un cambio de cuenta: historial, permisos y sesiones.
 * - Cambiar el rol reescribe los permisos con los de fabrica del rol nuevo.
 * - Bloquear la cuenta cierra al momento todas sus sesiones abiertas.
 */
function icc_registrar_cambios_cuenta(PDO $db, array $autor, int $id, array $body, string $rolAnterior, string $rolNuevo): void {
  $autorId = (int)$autor['id'];
  if ($rolNuevo !== $rolAnterior) {
    if (icc_v52()) $db->prepare('DELETE FROM usuarios_permisos WHERE usuario_id = ?')->execute([$id]);
    icc_auditar($id, $autorId, 'rol_cambiado', "Rol cambiado de $rolAnterior a $rolNuevo; permisos restablecidos a los del rol");
    // Las asignaciones Backoffice <-> comercial solo tienen sentido con esos roles.
    if (icc_v_backoffice_asignaciones()) {
      if ($rolAnterior === 'backoffice') $db->prepare('DELETE FROM backoffice_comerciales WHERE backoffice_id = ?')->execute([$id]);
      if ($rolAnterior === 'comercial') $db->prepare('DELETE FROM backoffice_comerciales WHERE comercial_id = ?')->execute([$id]);
    }
  }
  if (array_key_exists('bloqueado', $body)) {
    if ($body['bloqueado']) {
      $n = icc_sesiones_cerrar($id, $autorId, 'cuenta_bloqueada');
      icc_auditar($id, $autorId, 'cuenta_bloqueada', 'Cuenta bloqueada' . ($n ? '; ' . icc_n_sesiones($n) : ''));
    } else {
      icc_auditar($id, $autorId, 'cuenta_desbloqueada', 'Cuenta desbloqueada');
    }
  }
  if (array_key_exists('supervisor_id', $body) && icc_es_admin_o_superior($autor)) {
    icc_auditar($id, $autorId, 'responsable_cambiado', $body['supervisor_id'] ? 'Asignado al responsable #' . (int)$body['supervisor_id'] : 'Sin responsable asignado');
  }
  if (!empty($body['password'])) {
    icc_auditar($id, $autorId, 'password_cambiada', 'Contrasena cambiada desde Agentes');
  }
}

/**
 * Jerarquia: Admin/Super Admin -> Jefe de equipo -> Comerciales.
 * - Un comercial cuelga de un Jefe de equipo (o de un Admin/Super Admin:
 *   alguien que venia liderando un equipo como jefe_de_equipo y luego se
 *   promociona sigue pudiendo ser el supervisor de ese mismo equipo).
 * - Un Jefe de equipo cuelga de un Admin/Super Admin (su responsable).
 * Sin limite de tamano de equipo: un Jefe de equipo puede tener tantos
 * comerciales como haga falta.
 */
/**
 * Jefes en cuyos equipos un Backoffice puede dar de alta comerciales:
 * los jefes de sus comerciales asignados y las personas cuya agenda gestiona.
 * null = sin limite (Backoffice que ve toda la empresa).
 */
function icc_backoffice_jefes_permitidos(PDO $db, array $user): ?array {
  $asignados = icc_backoffice_asignados((int)$user['id']);
  if (!$asignados) return null;
  $marcas = implode(',', array_fill(0, count($asignados), '?'));
  $stmt = $db->prepare("SELECT DISTINCT supervisor_id FROM usuarios WHERE id IN ($marcas) AND supervisor_id IS NOT NULL");
  $stmt->execute($asignados);
  $ids = array_map('intval', array_column($stmt->fetchAll(), 'supervisor_id'));
  return array_values(array_unique(array_merge($ids, icc_backoffice_agendas((int)$user['id']))));
}

function icc_supervisor_valido(PDO $db, int $supervisorId, string $rolSubordinado): bool {
  if ($rolSubordinado === 'comercial') {
    $roles = ICC_ROLES_EQUIPO;
  } elseif ($rolSubordinado === 'jefe_de_equipo') {
    $roles = ICC_ROLES_ADMIN;
  } else {
    return false;
  }
  $stmt = $db->prepare('SELECT rol FROM usuarios WHERE id = ?');
  $stmt->execute([$supervisorId]);
  $sup = $stmt->fetch();
  return $sup && in_array($sup['rol'], $roles, true);
}

function icc_validar_supervisor(PDO $db, int $supervisorId, string $rolSubordinado): int {
  if (!icc_supervisor_valido($db, $supervisorId, $rolSubordinado)) {
    $mensaje = $rolSubordinado === 'jefe_de_equipo'
      ? 'El responsable de un Jefe de equipo debe ser Administrador, Gerente, Coordinador o Super Admin'
      : ($rolSubordinado === 'comercial'
        ? 'El supervisor indicado no existe o no es Jefe de equipo'
        : 'Solo los comerciales y los jefes de equipo tienen responsable asignado');
    icc_json(['error' => $mensaje], 400);
  }
  return $supervisorId;
}

/** Tablas que existen en esta base de datos (algunas dependen de migraciones). */
function icc_tabla_existe(PDO $db, string $tabla): bool {
  static $cache = [];
  if (!array_key_exists($tabla, $cache)) {
    try {
      $db->query("SELECT 1 FROM `$tabla` LIMIT 0");
      $cache[$tabla] = true;
    } catch (PDOException $e) {
      $cache[$tabla] = false;
    }
  }
  return $cache[$tabla];
}

/** Cuantos datos tiene una cuenta (lo que se traspasa al darla de baja). */
function icc_resumen_datos_usuario(PDO $db, int $id): array {
  $consultas = [
    'clientes' => 'SELECT COUNT(*) FROM clientes WHERE comercial_id = ?',
    'contratos' => 'SELECT COUNT(*) FROM contratos WHERE comercial_id = ?',
    'presupuestos' => 'SELECT COUNT(*) FROM presupuestos WHERE comercial_id = ?',
    'proformas' => 'SELECT COUNT(*) FROM proformas WHERE comercial_id = ?',
    'citas' => 'SELECT COUNT(*) FROM citas WHERE comercial_id = ?',
    'equipo' => 'SELECT COUNT(*) FROM usuarios WHERE supervisor_id = ?',
  ];
  if (icc_tabla_existe($db, 'cmp_ene_informes')) $consultas['informes_energia'] = 'SELECT COUNT(*) FROM cmp_ene_informes WHERE usuario_id = ?';
  if (icc_tabla_existe($db, 'cmp_tel_informes')) $consultas['informes_telefonia'] = 'SELECT COUNT(*) FROM cmp_tel_informes WHERE usuario_id = ?';
  $consultas['archivos_personales'] = 'SELECT COUNT(*) FROM ficheros f JOIN ficheros_carpetas c ON c.id = f.carpeta_id WHERE c.propietario_id = ?';
  $out = [];
  foreach ($consultas as $clave => $sql) {
    $stmt = $db->prepare($sql);
    $stmt->execute([$id]);
    $out[$clave] = (int)$stmt->fetchColumn();
  }
  return $out;
}

/**
 * Pasa a $destino todo lo de la cuenta $id antes de borrarla, para que la
 * empresa siga trabajando: clientes, contratos, presupuestos, proformas,
 * citas (agenda), informes de los comparadores, su carpeta personal de
 * facturacion (con sus archivos) y, si era jefe, su equipo.
 */
function icc_traspasar_datos_usuario(PDO $db, int $id, int $destino, string $nombreBaja): void {
  foreach (['clientes', 'contratos', 'presupuestos', 'proformas', 'citas'] as $tabla) {
    $db->prepare("UPDATE `$tabla` SET comercial_id = ? WHERE comercial_id = ?")->execute([$destino, $id]);
  }
  if (icc_tabla_existe($db, 'citas')) {
    try {
      $db->prepare('UPDATE citas SET equipo_id = ? WHERE equipo_id = ?')->execute([$destino, $id]);
    } catch (PDOException $e) {
      // Sin la migracion de equipos no existe la columna.
    }
  }
  foreach (['cmp_ene_informes', 'cmp_tel_informes'] as $tabla) {
    if (icc_tabla_existe($db, $tabla)) $db->prepare("UPDATE `$tabla` SET usuario_id = ? WHERE usuario_id = ?")->execute([$destino, $id]);
  }
  // Su carpeta personal no se borra: pasa a quien recibe los datos, marcada como baja.
  $stmt = $db->prepare('SELECT id, nombre FROM ficheros_carpetas WHERE propietario_id = ?');
  $stmt->execute([$id]);
  foreach ($stmt->fetchAll() as $carpeta) {
    $nombre = $carpeta['nombre'];
    if (strpos($nombre, '(baja)') === false) $nombre = mb_substr($nombre . ' (baja)', 0, 150);
    $db->prepare('UPDATE ficheros_carpetas SET propietario_id = ?, nombre = ? WHERE id = ?')->execute([$destino, $nombre, $carpeta['id']]);
  }
  // Su equipo pasa a depender de quien recibe los datos.
  $db->prepare('UPDATE usuarios SET supervisor_id = ? WHERE supervisor_id = ?')->execute([$destino, $id]);
}
