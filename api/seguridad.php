<?php
/**
 * ICC CRM · Centro de Seguridad (requiere sql/migracion_seguridad.sql).
 *
 * Cualquier usuario, sobre SU cuenta:
 *   GET  ?action=2fa                         estado de su doble factor
 *   POST ?action=2fa_iniciar                 secreto nuevo para escanear (QR)
 *   POST ?action=2fa_activar    {codigo}     lo activa y devuelve los codigos de recuperacion
 *   POST ?action=2fa_desactivar {codigo}
 *   GET  ?action=mis_sesiones · POST ?action=cerrar_mis_sesiones {id | "otras"}
 * Solo direccion (Admin, Gerente, Coordinador, Super Admin):
 *   GET  ?action=estado                      comprobaciones y puntuacion
 *   GET  ?action=exposicion                  prueba real desde fuera con archivos cebo
 *   GET  ?action=accesos                     ultimas entradas y conexiones sospechosas
 *   GET  ?action=sesiones · POST ?action=cerrar_sesion {id | usuario_id}
 *   GET  ?action=bloqueos · POST ?action=quitar_bloqueo {id}
 *   GET  ?action=bitacora                    verifica la cadena y lista los ultimos apuntes
 *   POST ?action=limpiar {rutas}             borra archivos peligrosos detectados
 *   POST ?action=proteger_config             lleva la configuracion a la carpeta privada
 *   POST ?action=mover_archivos              lleva los documentos a la carpeta privada
 *   POST ?action=2fa_reiniciar {usuario_id}  quita el doble factor de otra persona (movil perdido)
 */
require __DIR__ . '/config.php';

$user = icc_require_auth();
$metodo = $_SERVER['REQUEST_METHOD'];
$accion = (string)($_GET['action'] ?? '');
$miId = (int)$user['id'];
$verComo = !empty($_SESSION['impersonador_id']);

if (!icc_seg_ok()) {
  icc_json(['error' => 'Falta importar sql/migracion_seguridad.sql (o la base de datos completa v78) en la base de datos.', 'sin_migracion' => true], 409);
}
if ($metodo !== 'GET') icc_require_csrf();
$b = $metodo === 'GET' ? [] : icc_body();

function seg_sesiones(?int $usuarioId): array {
  $sql = "SELECT s.id, s.usuario_id, s.ip, s.user_agent, s.creada_en, s.ultima_actividad,
                 TRIM(CONCAT(u.nombre, ' ', COALESCE(u.apellidos, ''))) nombre, u.email, u.rol
          FROM usuarios_sesiones s JOIN usuarios u ON u.id = s.usuario_id
          WHERE s.cerrada_en IS NULL AND s.ultima_actividad > NOW() - INTERVAL ? HOUR AND s.creada_en > NOW() - INTERVAL ? DAY"
    . ($usuarioId ? ' AND s.usuario_id = ?' : '') . ' ORDER BY s.ultima_actividad DESC LIMIT 300';
  $p = [ICC_INACTIVIDAD_HORAS, ICC_SESION_MAX_DIAS];
  if ($usuarioId) $p[] = $usuarioId;
  $actual = icc_sesion_actual_id();
  $out = [];
  foreach (icc_seg_q($sql, $p)->fetchAll() as $f) {
    $out[] = ['id' => (int)$f['id'], 'usuario_id' => (int)$f['usuario_id'], 'nombre' => $f['nombre'], 'email' => $f['email'], 'rol' => $f['rol'],
      'ip' => $f['ip'], 'agente' => $f['user_agent'], 'creado' => $f['creada_en'], 'ultimo_uso' => $f['ultima_actividad'],
      'actual' => $actual !== null && (int)$f['id'] === $actual];
  }
  return $out;
}

/* --- Doble factor de la propia cuenta ----------------------------------- */
if ($accion === '2fa' && $metodo === 'GET') {
  $f = icc_2fa($miId);
  $activo = $f && (int)$f['activo'] === 1;
  icc_json(['activo' => $activo, 'activado' => $activo ? $f['activado'] : null,
    'recuperacion_restantes' => $activo ? count(json_decode((string)$f['recuperacion'], true) ?: []) : 0, 'ver_como' => $verComo]);
}
if (strpos($accion, '2fa_') === 0 && $accion !== '2fa_reiniciar' && $verComo) {
  icc_json(['error' => 'El doble factor solo lo gestiona la propia persona, no desde «Ver como».'], 403);
}
if ($accion === '2fa_iniciar' && $metodo === 'POST') {
  icc_json(icc_2fa_inicia($miId, (string)$user['email']));
}
if ($accion === '2fa_activar' && $metodo === 'POST') {
  $codigos = icc_2fa_activa($miId, (string)($b['codigo'] ?? ''));
  icc_auditar($miId, $miId, 'doble_factor_activado', 'Desde ahora necesita el código del móvil para entrar');
  icc_json(['ok' => true, 'codigos' => $codigos]);
}
if ($accion === '2fa_desactivar' && $metodo === 'POST') {
  if (!icc_2fa_comprueba($miId, (string)($b['codigo'] ?? ''))) {
    icc_json(['error' => 'El código no es correcto: para quitar el doble factor hace falta un código válido.'], 400);
  }
  icc_2fa_quita($miId);
  icc_auditar($miId, $miId, 'doble_factor_desactivado', 'La cuenta vuelve a entrar solo con contraseña');
  icc_json(['ok' => true]);
}

/* --- Sesiones de la propia cuenta --------------------------------------- */
if ($accion === 'mis_sesiones' && $metodo === 'GET') {
  icc_json(['sesiones' => seg_sesiones(icc_usuario_real_id())]);
}
if ($accion === 'cerrar_mis_sesiones' && $metodo === 'POST') {
  $real = icc_usuario_real_id();
  if (($b['id'] ?? '') === 'otras') {
    $n = icc_sesiones_cerrar($real, $real, 'cerrada_por_el_usuario', icc_sesion_actual_id());
  } else {
    $st = icc_seg_q('UPDATE usuarios_sesiones SET cerrada_en = NOW(), cerrada_por = ?, motivo_cierre = ? WHERE id = ? AND usuario_id = ? AND cerrada_en IS NULL',
      [$real, 'cerrada_por_el_usuario', (int)($b['id'] ?? 0), $real]);
    $n = $st->rowCount();
  }
  if ($n) icc_auditar($real, $real, 'sesiones_cerradas', icc_n_sesiones($n) . ' por la propia persona');
  icc_json(['ok' => true, 'cerradas' => $n]);
}

/* --- A partir de aqui, solo direccion ------------------------------------ */
if (!icc_es_rol_admin((string)$user['rol'])) {
  icc_json(['error' => 'El Centro de Seguridad es solo para dirección.'], 403);
}
$soySuper = $user['rol'] === 'super_admin';
$esSuper = function (int $id): bool {
  $f = icc_seg_fila('SELECT rol FROM usuarios WHERE id = ?', [$id]);
  return $f && $f['rol'] === 'super_admin';
};

if ($accion === 'estado' && $metodo === 'GET') icc_json(icc_seg_estado());
if ($accion === 'exposicion' && $metodo === 'GET') {
  @set_time_limit(90);
  icc_json(icc_seg_exposicion());
}
if ($accion === 'accesos' && $metodo === 'GET') {
  $lista = icc_seg_q("SELECT a.ts, a.email, a.ip, a.agente, a.resultado, a.detalle,
                             TRIM(CONCAT(COALESCE(u.nombre, ''), ' ', COALESCE(u.apellidos, ''))) nombre
                      FROM seg_accesos a LEFT JOIN usuarios u ON u.id = a.usuario_id ORDER BY a.id DESC LIMIT 250")->fetchAll();
  $atacantes = icc_seg_q("SELECT ip, COUNT(*) fallos, COUNT(DISTINCT email) cuentas, MAX(ts) ultimo FROM seg_accesos
                          WHERE resultado IN ('fallo','mfa_fallo','bloqueado') AND ts > NOW() - INTERVAL 7 DAY
                          GROUP BY ip ORDER BY fallos DESC LIMIT 20")->fetchAll();
  foreach ($atacantes as &$f) { $f['fallos'] = (int)$f['fallos']; $f['cuentas'] = (int)$f['cuentas']; }
  unset($f);
  icc_json(['accesos' => $lista, 'atacantes' => $atacantes]);
}
if ($accion === 'sesiones' && $metodo === 'GET') icc_json(['sesiones' => seg_sesiones(null)]);
if ($accion === 'cerrar_sesion' && $metodo === 'POST') {
  if (!empty($b['usuario_id'])) {
    $uid = (int)$b['usuario_id'];
    if ($esSuper($uid) && !$soySuper) icc_json(['error' => 'Las sesiones del Super Admin solo las cierra el propio Super Admin.'], 403);
    $n = icc_sesiones_cerrar($uid, icc_usuario_real_id(), 'cerrada_desde_seguridad', $uid === icc_usuario_real_id() ? icc_sesion_actual_id() : null);
    if ($n) icc_auditar($uid, icc_usuario_real_id(), 'sesiones_cerradas', icc_n_sesiones($n) . ' desde el Centro de Seguridad');
  } else {
    $s = icc_seg_fila('SELECT id, usuario_id FROM usuarios_sesiones WHERE id = ? AND cerrada_en IS NULL', [(int)($b['id'] ?? 0)]);
    if (!$s) icc_json(['error' => 'Esa sesión ya no existe.'], 404);
    if ($esSuper((int)$s['usuario_id']) && !$soySuper) icc_json(['error' => 'Las sesiones del Super Admin solo las cierra el propio Super Admin.'], 403);
    $n = icc_seg_q('UPDATE usuarios_sesiones SET cerrada_en = NOW(), cerrada_por = ?, motivo_cierre = ? WHERE id = ?',
      [icc_usuario_real_id(), 'cerrada_desde_seguridad', $s['id']])->rowCount();
    if ($n) icc_auditar((int)$s['usuario_id'], icc_usuario_real_id(), 'sesiones_cerradas', '1 sesion cerrada desde el Centro de Seguridad');
  }
  icc_json(['ok' => true, 'cerradas' => $n]);
}
if ($accion === 'bloqueos' && $metodo === 'GET') {
  $l = icc_seg_q('SELECT id, tipo, valor, hasta, motivo, creado FROM seg_bloqueos WHERE hasta > NOW() ORDER BY creado DESC')->fetchAll();
  foreach ($l as &$f) $f['id'] = (int)$f['id'];
  unset($f);
  icc_json(['bloqueos' => $l]);
}
if ($accion === 'quitar_bloqueo' && $metodo === 'POST') {
  $f = icc_seg_fila('SELECT tipo, valor FROM seg_bloqueos WHERE id = ?', [(int)($b['id'] ?? 0)]);
  if ($f) {
    icc_seg_q('DELETE FROM seg_bloqueos WHERE id = ?', [(int)$b['id']]);
    if ($f['tipo'] === 'ip') icc_seg_q('DELETE FROM seg_intentos WHERE ip = ?', [$f['valor']]);
    icc_seg_anota('Bloqueo retirado', 'Se desbloquea ' . ($f['tipo'] === 'ip' ? 'la IP ' : 'la cuenta ') . $f['valor'] . '.', icc_usuario_real_id());
  }
  icc_json(['ok' => true]);
}
if ($accion === 'bitacora' && $metodo === 'GET') {
  $v = icc_seg_verifica_bitacora();
  $v['ultimos'] = icc_seg_q('SELECT seq, ts, actor_nombre, accion, detalle, ip FROM seg_bitacora ORDER BY seq DESC LIMIT 200')->fetchAll();
  icc_json($v);
}
if ($accion === 'limpiar' && $metodo === 'POST') {
  icc_json(icc_seg_limpia(isset($b['rutas']) && is_array($b['rutas']) ? $b['rutas'] : [], icc_usuario_real_id()));
}
if ($accion === 'proteger_config' && $metodo === 'POST') icc_json(icc_seg_protege_config(icc_usuario_real_id()));
if ($accion === 'mover_archivos' && $metodo === 'POST') icc_json(icc_seg_mueve_archivos(icc_usuario_real_id()));
if ($accion === '2fa_reiniciar' && $metodo === 'POST') {
  $uid = (int)($b['usuario_id'] ?? 0);
  $el = icc_seg_fila('SELECT id, rol FROM usuarios WHERE id = ?', [$uid]);
  if (!$el) icc_json(['error' => 'Usuario no encontrado.'], 404);
  if ($uid === icc_usuario_real_id()) icc_json(['error' => 'Tu propio doble factor se quita desde «Tu doble factor», con un código válido.'], 400);
  if ($el['rol'] === 'super_admin' && !$soySuper) icc_json(['error' => 'El doble factor del Super Admin solo lo quita el propio Super Admin.'], 403);
  icc_2fa_quita($uid);
  $n = icc_sesiones_cerrar($uid, icc_usuario_real_id(), 'doble_factor_reiniciado');
  icc_auditar($uid, icc_usuario_real_id(), 'doble_factor_reiniciado', 'Quitado por dirección (móvil perdido). ' . icc_n_sesiones($n));
  icc_json(['ok' => true]);
}

icc_json(['error' => 'Operación de seguridad desconocida.'], 404);
