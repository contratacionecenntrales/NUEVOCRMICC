<?php
/**
 * Ficha de usuario avanzada: informacion, roles y permisos, disponibilidad,
 * notificaciones y seguridad. Requiere sql/migracion_usuarios_avanzado.sql.
 *
 * Quien puede hacer que (A = quien entra, U = usuario de la ficha):
 *  - Super Admin administra cualquier cuenta; Admin cualquiera salvo otras
 *    de Admin/Super Admin.
 *  - El propio usuario ve todo lo suyo y edita sus datos de contacto, foto,
 *    disponibilidad, avisos y contrasena, pero nunca su rol ni sus permisos.
 *  - Su Jefe de equipo ve informacion y disponibilidad; con el permiso
 *    usuarios.gestionar gestiona ademas la cuenta de sus comerciales (datos,
 *    bloqueo, contrasena, sesiones y permisos, estos solo dentro de los que
 *    el mismo tiene). El rol y el equipo siguen siendo de Admin/Super Admin.
 */
require __DIR__ . '/config.php';

$user = icc_require_auth();
$metodo = $_SERVER['REQUEST_METHOD'];
$accion = $_GET['accion'] ?? '';
$id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
$db = icc_db();

const USU_DIAS = ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom'];
const USU_ESTADOS_DISPONIBILIDAD = ['disponible', 'ocupado', 'ausente', 'vacaciones', 'baja'];
const USU_CATEGORIAS_AVISO = ['ficha_agente', 'oferta_presentada', 'agenda', 'cuenta'];

if (!$id) icc_json(['error' => 'Falta id'], 400);

$stmt = $db->prepare('SELECT * FROM usuarios WHERE id = ?');
$stmt->execute([$id]);
$objetivo = $stmt->fetch();
if (!$objetivo) icc_json(['error' => 'Usuario no encontrado'], 404);
unset($objetivo['password_hash']);

$esPropia = (int)$user['id'] === $id;
$enVerComo = !empty($_SESSION['impersonador_id']);
$objetivoAdminTier = in_array($objetivo['rol'], ['admin', 'super_admin'], true);
$administra = !$esPropia && (icc_es_super_admin($user) || (icc_es_admin_o_superior($user) && !$objetivoAdminTier));
$esSuJefe = $user['rol'] === 'jefe_de_equipo' && (int)$objetivo['supervisor_id'] === (int)$user['id'];
$gestionaEquipo = !$esPropia && icc_jefe_gestiona($user, $objetivo);
$gestiona = $administra || $gestionaEquipo;

if (!$esPropia && !$administra && !$esSuJefe) {
  icc_json(['error' => 'No tienes acceso a la ficha de este usuario'], 403);
}

$puede = [
  'editar_info' => $gestiona || $esPropia,
  'editar_email' => $gestiona,
  'editar_estado' => $gestiona,
  'ver_permisos' => $gestiona || $esPropia,
  'editar_permisos' => $gestiona,
  'cambiar_rol' => $administra,
  'editar_disponibilidad' => $gestiona || $esPropia,
  'ver_notificaciones' => $administra || $esPropia,
  'ver_seguridad' => $gestiona || $esPropia,
  'reset_password' => $gestiona,
  'exigir_cambio' => $gestiona,
  'cerrar_sesiones' => $gestiona || $esPropia,
  'ver_como' => $gestionaEquipo && icc_tiene_permiso($user, 'usuarios.ver_como') && !$enVerComo && !(int)$objetivo['bloqueado'],
  'cambiar_mi_password' => $esPropia && !$enVerComo,
];

/**
 * Permisos que quien entra puede conceder o retirar: Admin todos; un Jefe de
 * equipo solo los que el mismo tiene (nunca mas de los suyos) y nunca los de
 * gestion de equipo, que no aplican a un comercial.
 */
function usu_permisos_editables(array $user, bool $administra): array {
  $todos = array_keys(icc_permisos_indice());
  if ($administra) return $todos;
  $propios = icc_permisos_efectivos($user);
  return array_values(array_filter($todos, function ($c) use ($propios) {
    return strpos($c, 'usuarios.') !== 0 && in_array($c, $propios, true);
  }));
}

function usu_requiere(bool $permitido): void {
  if (!$permitido) icc_json(['error' => 'No tienes permiso para esta accion'], 403);
}

function usu_requiere_migracion(): void {
  if (!icc_v52()) icc_json(['error' => 'Falta importar sql/migracion_usuarios_avanzado.sql en la base de datos'], 409);
}

function usu_preferencias(PDO $db, int $id): array {
  $base = [
    'horario' => null,
    'estado_disponibilidad' => 'disponible',
    'ausencia_desde' => null,
    'ausencia_hasta' => null,
    'nota_disponibilidad' => '',
    'notificaciones' => null,
  ];
  if (!icc_v52()) return $base;
  $stmt = $db->prepare('SELECT * FROM usuarios_preferencias WHERE usuario_id = ?');
  $stmt->execute([$id]);
  $fila = $stmt->fetch();
  if (!$fila) return $base;
  $fila['horario'] = $fila['horario'] ? json_decode($fila['horario'], true) : null;
  $fila['notificaciones'] = $fila['notificaciones'] ? json_decode($fila['notificaciones'], true) : null;
  return $fila;
}

function usu_guardar_preferencias(PDO $db, int $id, array $campos): void {
  $columnas = array_keys($campos);
  $sql = 'INSERT INTO usuarios_preferencias (usuario_id, ' . implode(', ', $columnas) . ') VALUES (?, ' .
    implode(', ', array_fill(0, count($columnas), '?')) . ') ON DUPLICATE KEY UPDATE ' .
    implode(', ', array_map(function ($c) { return "$c = VALUES($c)"; }, $columnas));
  $db->prepare($sql)->execute(array_merge([$id], array_values($campos)));
}

function usu_fecha_o_null($valor): ?string {
  $valor = trim((string)$valor);
  if ($valor === '') return null;
  if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $valor)) icc_json(['error' => 'Fecha no valida'], 400);
  return $valor;
}

// =============================================================== GET: ficha
if ($metodo === 'GET') {
  $v52 = icc_v52();
  $respuesta = [
    'migracion_pendiente' => !$v52,
    'usuario' => $objetivo,
    'es_propia' => $esPropia,
    'puede' => $puede,
    'preferencias' => usu_preferencias($db, $id),
  ];

  $respuesta['supervisor'] = null;
  if ($objetivo['supervisor_id']) {
    $stmt = $db->prepare('SELECT id, nombre, apellidos, rol FROM usuarios WHERE id = ?');
    $stmt->execute([$objetivo['supervisor_id']]);
    $respuesta['supervisor'] = $stmt->fetch() ?: null;
  }

  try {
    $stmt = $db->prepare(
      "SELECT id, cliente_nombre, fecha, hora_inicio, hora_fin, sector, estado FROM citas
       WHERE comercial_id = ? AND fecha BETWEEN CURDATE() AND (CURDATE() + INTERVAL 14 DAY)
       ORDER BY fecha, hora_inicio LIMIT 30"
    );
    $stmt->execute([$id]);
    $respuesta['proximas_citas'] = $stmt->fetchAll();
  } catch (Exception $e) {
    $respuesta['proximas_citas'] = [];
  }

  if ($puede['ver_permisos']) {
    $excepciones = icc_permisos_excepciones($id);
    $respuesta['permisos'] = [
      'catalogo' => icc_catalogo_permisos(),
      'efectivos' => icc_permisos_efectivos($objetivo),
      'excepciones' => $excepciones,
      'editables' => $puede['editar_permisos'] ? usu_permisos_editables($user, $administra) : [],
    ];
  }

  if ($puede['ver_seguridad'] && $v52) {
    $stmt = $db->prepare(
      'SELECT id, ip, user_agent, creada_en, ultima_actividad FROM usuarios_sesiones
       WHERE usuario_id = ? AND cerrada_en IS NULL AND ultima_actividad > (NOW() - INTERVAL 30 DAY)
       ORDER BY ultima_actividad DESC'
    );
    $stmt->execute([$id]);
    $sesiones = $stmt->fetchAll();
    $actual = $esPropia || $enVerComo ? icc_sesion_actual_id() : null;
    foreach ($sesiones as &$s) $s['es_actual'] = $actual !== null && (int)$s['id'] === $actual;
    unset($s);

    $stmt = $db->prepare(
      'SELECT a.id, a.accion, a.detalle, a.ip, a.created_at, u.nombre AS autor_nombre
       FROM usuarios_auditoria a LEFT JOIN usuarios u ON u.id = a.autor_id
       WHERE a.usuario_id = ? ORDER BY a.created_at DESC, a.id DESC LIMIT 60'
    );
    $stmt->execute([$id]);
    $respuesta['seguridad'] = [
      'sesiones' => $sesiones,
      'historial' => $stmt->fetchAll(),
    ];
  }

  icc_json($respuesta);
}

if (!in_array($metodo, ['POST', 'PUT', 'DELETE'], true)) icc_json(['error' => 'Metodo no permitido'], 405);
icc_require_csrf();
$autorId = (int)$user['id'];
$body = icc_body();

// ===================================================== Informacion personal
if ($accion === 'info') {
  usu_requiere($puede['editar_info']);
  $sets = [];
  $valores = [];
  $cambios = [];
  $campos = ['nombre' => 120, 'apellidos' => 150, 'telefono' => 40, 'empresa' => 150, 'cif' => 20];
  if (icc_v52()) $campos += ['prefijo_telefono' => 8, 'extension' => 10];
  foreach ($campos as $campo => $max) {
    if (!array_key_exists($campo, $body)) continue;
    $valor = substr(trim((string)$body[$campo]), 0, $max);
    if ($campo === 'nombre' && $valor === '') icc_json(['error' => 'El nombre es obligatorio'], 400);
    if ($valor !== (string)$objetivo[$campo]) {
      $sets[] = "$campo = ?";
      $valores[] = $valor;
      $cambios[] = $campo;
    }
  }
  if (array_key_exists('email', $body) && trim((string)$body['email']) !== $objetivo['email']) {
    usu_requiere($puede['editar_email']);
    $email = trim((string)$body['email']);
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) icc_json(['error' => 'Email no valido'], 400);
    $stmt = $db->prepare('SELECT id FROM usuarios WHERE email = ? AND id <> ?');
    $stmt->execute([$email, $id]);
    if ($stmt->fetch()) icc_json(['error' => 'Ya existe otra cuenta con ese email'], 409);
    $sets[] = 'email = ?';
    $valores[] = $email;
    $cambios[] = 'email (' . $objetivo['email'] . ' → ' . $email . ')';
  }
  $bloquear = null;
  if (array_key_exists('bloqueado', $body) && (int)(bool)$body['bloqueado'] !== (int)$objetivo['bloqueado']) {
    usu_requiere($puede['editar_estado']);
    $bloquear = (bool)$body['bloqueado'];
    $sets[] = 'bloqueado = ?';
    $valores[] = $bloquear ? 1 : 0;
  }
  if (!$sets) icc_json(['ok' => true]);
  $valores[] = $id;
  $db->prepare('UPDATE usuarios SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($valores);
  if ($cambios) icc_auditar($id, $autorId, 'datos_actualizados', 'Campos: ' . implode(', ', $cambios));
  if ($bloquear === true) {
    $n = icc_sesiones_cerrar($id, $autorId, 'cuenta_bloqueada');
    icc_auditar($id, $autorId, 'cuenta_bloqueada', 'Cuenta bloqueada' . ($n ? '; ' . icc_n_sesiones($n) : ''));
  } elseif ($bloquear === false) {
    icc_auditar($id, $autorId, 'cuenta_desbloqueada', 'Cuenta desbloqueada');
  }
  icc_json(['ok' => true]);
}

// ========================================================== Foto de perfil
if ($accion === 'avatar') {
  usu_requiere($puede['editar_info']);
  usu_requiere_migracion();
  $dir = ICC_STORAGE_DIR . '/avatares';

  if ($metodo === 'DELETE') {
    if ($objetivo['avatar_ruta']) @unlink($dir . '/' . basename($objetivo['avatar_ruta']));
    $db->prepare('UPDATE usuarios SET avatar_ruta = NULL WHERE id = ?')->execute([$id]);
    icc_auditar($id, $autorId, 'foto_eliminada', 'Foto de perfil eliminada');
    icc_json(['ok' => true]);
  }

  if (empty($_FILES['archivo']) || $_FILES['archivo']['error'] !== UPLOAD_ERR_OK) {
    icc_json(['error' => 'No se recibio ninguna imagen'], 400);
  }
  $archivo = $_FILES['archivo'];
  if ($archivo['size'] > 2.5 * 1024 * 1024) icc_json(['error' => 'La imagen supera los 2,5 MB'], 400);
  $info = @getimagesize($archivo['tmp_name']);
  $tipos = [IMAGETYPE_PNG => 'png', IMAGETYPE_JPEG => 'jpg', IMAGETYPE_WEBP => 'webp'];
  if (!$info || !isset($tipos[$info[2]])) icc_json(['error' => 'Formato no admitido: usa PNG, JPG o WebP'], 400);

  if (!is_dir($dir)) mkdir($dir, 0755, true);
  $nombre = $id . '-' . bin2hex(random_bytes(6)) . '.' . $tipos[$info[2]];
  if (!move_uploaded_file($archivo['tmp_name'], $dir . '/' . $nombre)) {
    icc_json(['error' => 'No se pudo guardar la imagen. Revisa los permisos de storage/'], 500);
  }
  if ($objetivo['avatar_ruta']) @unlink($dir . '/' . basename($objetivo['avatar_ruta']));
  $db->prepare('UPDATE usuarios SET avatar_ruta = ? WHERE id = ?')->execute([$nombre, $id]);
  icc_auditar($id, $autorId, 'foto_actualizada', 'Nueva foto de perfil');
  icc_json(['ok' => true, 'avatar_ruta' => $nombre]);
}

// ========================================================= Roles y permisos
if ($accion === 'permisos') {
  usu_requiere($puede['editar_permisos']);
  usu_requiere_migracion();
  $deseados = is_array($body['permisos'] ?? null) ? $body['permisos'] : [];
  $indice = icc_permisos_indice();
  $anteriores = icc_permisos_efectivos($objetivo);
  $editables = usu_permisos_editables($user, $administra);

  $db->beginTransaction();
  try {
    $db->prepare('DELETE FROM usuarios_permisos WHERE usuario_id = ?')->execute([$id]);
    $ins = $db->prepare('INSERT INTO usuarios_permisos (usuario_id, permiso, concedido, actualizado_por) VALUES (?, ?, ?, ?)');
    foreach ($indice as $clave => $def) {
      $deFabrica = in_array($objetivo['rol'], $def['roles'], true);
      $quiere = array_key_exists($clave, $deseados) && in_array($clave, $editables, true)
        ? (bool)$deseados[$clave]
        : in_array($clave, $anteriores, true);
      if ($quiere !== $deFabrica) $ins->execute([$id, $clave, $quiere ? 1 : 0, $autorId]);
    }
    $db->commit();
  } catch (Exception $e) {
    $db->rollBack();
    icc_json(['error' => icc_mensaje_error('No se pudieron guardar los permisos', $e, $user)], 500);
  }

  $nuevos = icc_permisos_efectivos($objetivo);
  $dados = array_diff($nuevos, $anteriores);
  $quitados = array_diff($anteriores, $nuevos);
  if ($dados || $quitados) {
    $etiqueta = function ($c) use ($indice) { return $indice[$c]['label'] ?? $c; };
    $detalle = trim(
      ($dados ? 'Concedidos: ' . implode(', ', array_map($etiqueta, $dados)) . '. ' : '') .
      ($quitados ? 'Retirados: ' . implode(', ', array_map($etiqueta, $quitados)) . '.' : '')
    );
    icc_auditar($id, $autorId, 'permisos_cambiados', $detalle);
    icc_notificar($id, 'cuenta', 'cuenta', $user['nombre'] . ' ha actualizado tus permisos en el CRM');
  }
  icc_json(['ok' => true, 'efectivos' => $nuevos]);
}

if ($accion === 'restablecer_permisos') {
  usu_requiere($puede['editar_permisos']);
  usu_requiere_migracion();
  if ($administra) {
    $stmt = $db->prepare('DELETE FROM usuarios_permisos WHERE usuario_id = ?');
    $stmt->execute([$id]);
  } else {
    // Un jefe solo restablece los permisos que el mismo podria conceder.
    $editables = usu_permisos_editables($user, false);
    if (!$editables) icc_json(['ok' => true]);
    $stmt = $db->prepare('DELETE FROM usuarios_permisos WHERE usuario_id = ? AND permiso IN (' . implode(',', array_fill(0, count($editables), '?')) . ')');
    $stmt->execute(array_merge([$id], $editables));
  }
  if ($stmt->rowCount()) {
    icc_auditar($id, $autorId, 'permisos_restablecidos', 'Permisos restablecidos a los de fabrica del rol');
    icc_notificar($id, 'cuenta', 'cuenta', $user['nombre'] . ' ha restablecido tus permisos a los de tu rol');
  }
  icc_json(['ok' => true]);
}

// ============================================================ Disponibilidad
if ($accion === 'disponibilidad') {
  usu_requiere($puede['editar_disponibilidad']);
  usu_requiere_migracion();
  $horario = [];
  $entrada = is_array($body['horario'] ?? null) ? $body['horario'] : [];
  foreach (USU_DIAS as $dia) {
    $d = is_array($entrada[$dia] ?? null) ? $entrada[$dia] : [];
    $desde = (string)($d['desde'] ?? '');
    $hasta = (string)($d['hasta'] ?? '');
    $activo = !empty($d['activo']);
    if ($activo) {
      if (!preg_match('/^\d{2}:\d{2}$/', $desde) || !preg_match('/^\d{2}:\d{2}$/', $hasta) || $desde >= $hasta) {
        icc_json(['error' => 'Revisa el horario del ' . $dia . ': la hora de inicio debe ser anterior a la de fin'], 400);
      }
    }
    $horario[$dia] = ['activo' => $activo, 'desde' => $desde, 'hasta' => $hasta];
  }
  $estado = $body['estado_disponibilidad'] ?? 'disponible';
  if (!in_array($estado, USU_ESTADOS_DISPONIBILIDAD, true)) icc_json(['error' => 'Estado no valido'], 400);
  $desde = usu_fecha_o_null($body['ausencia_desde'] ?? '');
  $hasta = usu_fecha_o_null($body['ausencia_hasta'] ?? '');
  if ($desde && $hasta && $desde > $hasta) icc_json(['error' => 'La fecha de fin de la ausencia es anterior a la de inicio'], 400);

  usu_guardar_preferencias($db, $id, [
    'horario' => json_encode($horario),
    'estado_disponibilidad' => $estado,
    'ausencia_desde' => $desde,
    'ausencia_hasta' => $hasta,
    'nota_disponibilidad' => substr(trim((string)($body['nota_disponibilidad'] ?? '')), 0, 255),
  ]);
  icc_auditar($id, $autorId, 'disponibilidad_actualizada', 'Estado: ' . $estado . ($desde || $hasta ? " ($desde → $hasta)" : ''));
  icc_json(['ok' => true]);
}

// ============================================================ Notificaciones
if ($accion === 'notificaciones') {
  usu_requiere($puede['ver_notificaciones']);
  usu_requiere_migracion();
  $prefs = [];
  foreach (USU_CATEGORIAS_AVISO as $cat) $prefs[$cat] = !array_key_exists($cat, $body) || (bool)$body[$cat];
  usu_guardar_preferencias($db, $id, ['notificaciones' => json_encode($prefs)]);
  icc_auditar($id, $autorId, 'avisos_actualizados', 'Preferencias de notificaciones actualizadas');
  icc_json(['ok' => true]);
}

// ================================================================= Seguridad
if ($accion === 'reset_password') {
  usu_requiere($puede['reset_password']);
  usu_requiere_migracion();
  $nueva = icc_generar_password();
  $db->prepare('UPDATE usuarios SET password_hash = ?, debe_cambiar_password = 1, password_actualizada_en = NOW() WHERE id = ?')
    ->execute([password_hash($nueva, PASSWORD_DEFAULT), $id]);
  $n = icc_sesiones_cerrar($id, $autorId, 'password_restablecida');
  icc_auditar($id, $autorId, 'password_restablecida', 'Debera cambiarla en el proximo acceso' . ($n ? '; ' . icc_n_sesiones($n) : ''));
  // La contrasena solo se devuelve en esta respuesta: no queda guardada en claro.
  icc_json(['ok' => true, 'password' => $nueva]);
}

if ($accion === 'exigir_cambio') {
  usu_requiere($puede['exigir_cambio']);
  usu_requiere_migracion();
  $valor = !empty($body['valor']);
  $db->prepare('UPDATE usuarios SET debe_cambiar_password = ? WHERE id = ?')->execute([$valor ? 1 : 0, $id]);
  icc_auditar($id, $autorId, $valor ? 'cambio_password_exigido' : 'cambio_password_no_exigido',
    $valor ? 'Debera cambiar la contrasena en el proximo acceso' : 'Ya no se le exige cambiar la contrasena');
  icc_json(['ok' => true]);
}

if ($accion === 'cerrar_sesiones') {
  usu_requiere($puede['cerrar_sesiones']);
  usu_requiere_migracion();
  // Desde la propia cuenta se cierran las demas (la actual sigue abierta).
  $excepto = $esPropia ? icc_sesion_actual_id() : null;
  $n = icc_sesiones_cerrar($id, $autorId, 'cierre_remoto', $excepto);
  if ($n) icc_auditar($id, $autorId, 'sesiones_cerradas', icc_n_sesiones($n) . ' en remoto');
  icc_json(['ok' => true, 'cerradas' => $n]);
}

if ($accion === 'cerrar_sesion') {
  usu_requiere($puede['cerrar_sesiones']);
  usu_requiere_migracion();
  $sesionId = (int)($body['sesion_id'] ?? 0);
  $stmt = $db->prepare("UPDATE usuarios_sesiones SET cerrada_en = NOW(), cerrada_por = ?, motivo_cierre = 'cierre_remoto' WHERE id = ? AND usuario_id = ? AND cerrada_en IS NULL");
  $stmt->execute([$autorId, $sesionId, $id]);
  if ($stmt->rowCount()) icc_auditar($id, $autorId, 'sesion_cerrada', 'Sesion #' . $sesionId . ' cerrada en remoto');
  icc_json(['ok' => true]);
}

icc_json(['error' => 'Accion no valida'], 404);
