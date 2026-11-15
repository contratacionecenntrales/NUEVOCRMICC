<?php
/**
 * ICC CRM · Agente de correo. Direccion y jefes de equipo (los jefes, sin
 * buzones personales ajenos ni clientes de otros equipos); buzones, agentes y
 * «Cómo responde» los configura coordinacion, admin y super admin.
 * Las contrasenas de los buzones nunca vuelven al navegador.
 *
 * GET  ?action=estado | bandeja | mensaje&id= | adjunto&id=&n= | aprobar | cuentas | config | dosieres
 * POST ?action=enviar {id, asunto, cuerpo, dosieres[]}  · archivar {id} · accion {id, aprobar}
 * POST ?action=cuenta {...} · cuenta_probar {id} · cuenta_borrar {id} · cuenta_agente {...} · cuentas_lote {filas[]}
 * POST ?action=revisar     PUT ?action=config
 */
require __DIR__ . '/config.php';
require_once __DIR__ . '/correo_agentes_lib.php';
require_once __DIR__ . '/aprendizaje_lib.php';

$user = icc_require_auth();
if (!icc_ve_ia_equipo($user)) icc_json(['error' => 'No encontrado'], 404);
$metodo = $_SERVER['REQUEST_METHOD'];
$accion = (string)($_GET['action'] ?? 'estado');
if ($metodo !== 'GET') icc_require_csrf();
$body = $metodo === 'GET' ? [] : icc_body();
$db = icc_db();
$uid = (int)$user['id'];
$esConfig = icc_ve_config_ia($user);
$visibles = icc_equipo_comercial_ids($user);

/** Condicion SQL de lo que esta persona puede ver de mail_mensajes "m" + mail_cuentas "a". */
function ca_where(?array $visibles, int $uid, bool $esConfig): string {
  if ($esConfig) return '1 = 1';
  $w = "(a.funcion <> 'personal' OR a.responsable_id = $uid)";
  if ($visibles !== null) {
    $lista = $visibles ? implode(',', array_map('intval', $visibles)) : '0';
    $w .= " AND (m.cliente_id IS NULL OR EXISTS (SELECT 1 FROM clientes cv WHERE cv.id = m.cliente_id AND cv.comercial_id IN ($lista)))";
    $w .= " AND (a.funcion <> 'personal' OR a.responsable_id IN ($lista))";
  }
  return $w;
}
function ca_mensaje(int $id, ?array $visibles, int $uid, bool $esConfig): ?array {
  $st = icc_db()->prepare('SELECT m.*, a.email buzon, a.funcion, a.nombre buzon_nombre FROM mail_mensajes m JOIN mail_cuentas a ON a.id = m.cuenta_id WHERE m.id = ? AND ' . ca_where($visibles, $uid, $esConfig));
  $st->execute([$id]);
  return $st->fetch() ?: null;
}
function ca_cuenta_publica(array $c): array {
  $ag = ca_agente($c);
  return ['id' => (int)$c['id'], 'email' => $c['email'], 'nombre' => $c['nombre'], 'funcion' => $c['funcion'], 'modo' => $c['modo'], 'activo' => (bool)$c['activo'],
    'host_imap' => $c['host_imap'], 'puerto_imap' => (int)$c['puerto_imap'], 'seguridad_imap' => $c['seguridad_imap'], 'host_smtp' => $c['host_smtp'], 'puerto_smtp' => (int)$c['puerto_smtp'],
    'seguridad_smtp' => $c['seguridad_smtp'], 'usuario' => $c['usuario'], 'tiene_clave' => !empty($c['clave']), 'firma' => $c['firma'], 'responsable_id' => $c['responsable_id'] ? (int)$c['responsable_id'] : null,
    'adjuntos' => $c['adjuntos'], 'adjuntar' => (bool)$c['adjuntar'], 'acuse' => (bool)$c['acuse'], 'error' => $c['error'], 'ultima_lectura' => $c['ultima_lectura'], 'conectado_en' => $c['conectado_en'],
    'agente' => $ag];
}

if ($accion === 'estado' && $metodo === 'GET') {
  $w = ca_where($visibles, $uid, $esConfig);
  $cont = $db->query("SELECT m.estado, COUNT(*) n FROM mail_mensajes m JOIN mail_cuentas a ON a.id = m.cuenta_id WHERE $w AND m.created_at >= NOW() - INTERVAL 30 DAY GROUP BY m.estado")->fetchAll(PDO::FETCH_KEY_PAIR);
  $acc = (int)$db->query("SELECT COUNT(*) FROM mail_acciones x JOIN mail_mensajes m ON m.id = x.mensaje_id JOIN mail_cuentas a ON a.id = m.cuenta_id WHERE x.estado = 'pendiente' AND $w")->fetchColumn();
  icc_json(['contadores' => $cont, 'acciones_pendientes' => $acc, 'cuentas' => (int)$db->query('SELECT COUNT(*) FROM mail_cuentas WHERE activo = 1')->fetchColumn(),
    'ia' => icc_ia_disponible(), 'es_config' => $esConfig, 'categorias' => CA_CATEGORIAS, 'funciones' => array_map(function ($f) { return $f[0] . ' · ' . $f[1]; }, CA_FUNCIONES),
    'herramientas' => array_map(function ($h) { return ['tipo' => $h[0], 'descripcion' => $h[1]]; }, CA_HERRAMIENTAS), 'siempre_aprobacion' => CA_SIEMPRE_APROBACION]);
}

if ($accion === 'bandeja' && $metodo === 'GET') {
  $w = [ca_where($visibles, $uid, $esConfig)]; $p = [];
  if (!empty($_GET['estado'])) { $w[] = 'm.estado = ?'; $p[] = (string)$_GET['estado']; }
  if (!empty($_GET['cuenta'])) { $w[] = 'm.cuenta_id = ?'; $p[] = (int)$_GET['cuenta']; }
  if (!empty($_GET['q'])) { $q = '%' . $_GET['q'] . '%'; $w[] = '(m.asunto LIKE ? OR m.de LIKE ? OR m.de_nombre LIKE ?)'; array_push($p, $q, $q, $q); }
  $st = $db->prepare('SELECT m.id, m.de, m.de_nombre, m.asunto, LEFT(m.cuerpo, 160) extracto, m.fecha, m.estado, m.categoria, m.confianza, m.agente, m.motivo, m.cliente_id, m.ticket_id, m.ia, m.derivado_de, a.email buzon, a.funcion
                      FROM mail_mensajes m JOIN mail_cuentas a ON a.id = m.cuenta_id WHERE ' . implode(' AND ', $w) . ' ORDER BY m.id DESC LIMIT 200');
  $st->execute($p);
  icc_json(['mensajes' => $st->fetchAll()]);
}

if ($accion === 'mensaje' && $metodo === 'GET') {
  $m = ca_mensaje((int)($_GET['id'] ?? 0), $visibles, $uid, $esConfig);
  if (!$m) icc_json(['error' => 'No encontrado.'], 404);
  $m['traza'] = json_decode((string)$m['traza'], true) ?: [];
  $m['acciones'] = json_decode((string)$m['acciones'], true) ?: [];
  $m['adjuntos_entrada'] = array_map(function ($a) { unset($a['ruta']); return $a; }, json_decode((string)$m['adjuntos_entrada'], true) ?: []);
  $st = $db->prepare('SELECT * FROM mail_acciones WHERE mensaje_id = ? ORDER BY id');
  $st->execute([$m['id']]);
  $m['pendientes'] = array_map(function ($a) { $a['args'] = json_decode((string)$a['args'], true); return $a; }, $st->fetchAll());
  $m['dosieres_sugeridos'] = array_filter(array_map('intval', explode(',', (string)$m['borrador_adjuntos'])));
  icc_json(['mensaje' => $m]);
}

if ($accion === 'adjunto' && $metodo === 'GET') {
  $m = ca_mensaje((int)($_GET['id'] ?? 0), $visibles, $uid, $esConfig);
  $adj = $m ? (json_decode((string)$m['adjuntos_entrada'], true) ?: []) : [];
  $a = $adj[(int)($_GET['n'] ?? -1)] ?? null;
  if (!$a) icc_json(['error' => 'No encontrado.'], 404);
  $ruta = realpath(rtrim(ICC_STORAGE_DIR, '/') . '/' . $a['ruta']);
  $base = realpath(rtrim(ICC_STORAGE_DIR, '/') . '/correo');
  if (!$ruta || !$base || strpos($ruta, $base) !== 0 || !is_file($ruta)) icc_json(['error' => 'Archivo no disponible.'], 404);
  header('Content-Type: application/octet-stream');
  header('Content-Disposition: attachment; filename="' . str_replace('"', '', $a['nombre']) . '"');
  header('Content-Length: ' . filesize($ruta));
  header('X-Content-Type-Options: nosniff');
  readfile($ruta);
  exit;
}

if ($accion === 'enviar' && $metodo === 'POST') {
  $m = ca_mensaje((int)($body['id'] ?? 0), $visibles, $uid, $esConfig);
  if (!$m) icc_json(['error' => 'No encontrado.'], 404);
  if (!in_array($m['estado'], ['para_aprobar', 'nuevo', 'error'], true)) icc_json(['error' => 'Este correo ya está gestionado.'], 409);
  $asunto = trim((string)($body['asunto'] ?? '')); $cuerpo = trim((string)($body['cuerpo'] ?? ''));
  if ($asunto === '' || $cuerpo === '') icc_json(['error' => 'Escribe el asunto y el texto.'], 422);
  if (icc_excluido((string)$m['de'])) icc_json(['error' => 'El remitente está en la lista de exclusión.'], 409);
  $cuenta = ca_cuenta((int)$m['cuenta_id'], true);
  $dos = array_slice(array_filter(array_map('intval', (array)($body['dosieres'] ?? []))), 0, 3);
  $r = ca_enviar($cuenta, $m, mb_substr($asunto, 0, 255), $cuerpo, $dos, (int)$m['ia'] === 1 && trim((string)$m['borrador_cuerpo']) === $cuerpo, $uid);
  if (!$r['ok']) icc_json(['error' => 'No se pudo enviar: ' . $r['error']], 502);
  $traza = json_decode((string)$m['traza'], true) ?: [];
  ca_traza($traza, 'enviado por una persona', $user['nombre']);
  if (trim((string)$m['borrador_cuerpo']) !== $cuerpo) apr_ejemplo_guardar('correo_' . (int)$m['cuenta_id'], 'Correo de ' . $m['de'] . ' («' . $m['asunto'] . '»): ' . mb_substr((string)$m['cuerpo'], 0, 500), $cuerpo);
  ca_guardar((int)$m['id'], ['estado' => 'enviado_manual', 'respondido_por' => $uid, 'respuesta_id' => $r['message_id'], 'borrador_asunto' => $asunto, 'borrador_cuerpo' => $cuerpo, 'traza' => $traza]);
  if ($m['cliente_id']) icc_nota_cliente((int)$m['cliente_id'], $user['nombre'] . " respondió al correo «" . $m['asunto'] . "»:\n" . mb_substr($cuerpo, 0, 1500), 'correo', $uid);
  icc_json(['ok' => true]);
}
if ($accion === 'archivar' && $metodo === 'POST') {
  $m = ca_mensaje((int)($body['id'] ?? 0), $visibles, $uid, $esConfig);
  if (!$m) icc_json(['error' => 'No encontrado.'], 404);
  $traza = json_decode((string)$m['traza'], true) ?: [];
  ca_traza($traza, 'archivado por una persona', $user['nombre']);
  ca_guardar((int)$m['id'], ['estado' => 'archivado', 'motivo' => 'Archivado por ' . $user['nombre'], 'traza' => $traza]);
  icc_json(['ok' => true]);
}

if ($accion === 'aprobar' && $metodo === 'GET') {
  $w = ca_where($visibles, $uid, $esConfig);
  $msgs = $db->query("SELECT m.id, m.de, m.de_nombre, m.asunto, LEFT(m.cuerpo, 600) extracto, m.categoria, m.confianza, m.agente, m.motivo, m.borrador_asunto, m.borrador_cuerpo, m.borrador_adjuntos, m.cliente_id, m.created_at, a.email buzon
                      FROM mail_mensajes m JOIN mail_cuentas a ON a.id = m.cuenta_id WHERE m.estado = 'para_aprobar' AND $w ORDER BY m.id LIMIT 100")->fetchAll();
  $acc = $db->query("SELECT x.*, m.asunto, m.de, a.email buzon FROM mail_acciones x JOIN mail_mensajes m ON m.id = x.mensaje_id JOIN mail_cuentas a ON a.id = m.cuenta_id WHERE x.estado = 'pendiente' AND $w ORDER BY x.id LIMIT 100")->fetchAll();
  foreach ($acc as &$x) $x['args'] = json_decode((string)$x['args'], true);
  icc_json(['mensajes' => $msgs, 'acciones' => $acc, 'dosieres' => ca_dosieres('general', 30), 'es_dir' => icc_es_admin_o_superior($user)]);
}
if ($accion === 'accion' && $metodo === 'POST') {
  if (!icc_es_admin_o_superior($user)) icc_json(['error' => 'Las acciones de los agentes las aprueba dirección.'], 403);
  $st = $db->prepare("SELECT * FROM mail_acciones WHERE id = ? AND estado = 'pendiente'");
  $st->execute([(int)($body['id'] ?? 0)]);
  $x = $st->fetch();
  if (!$x) icc_json(['error' => 'Ya no está pendiente.'], 409);
  if (empty($body['aprobar'])) {
    $db->prepare("UPDATE mail_acciones SET estado = 'rechazada', decidido_por = ?, decidido_en = NOW() WHERE id = ?")->execute([$uid, $x['id']]);
    icc_json(['ok' => true]);
  }
  $m = ca_mensaje((int)$x['mensaje_id'], null, $uid, true);
  $cuenta = ca_cuenta((int)$m['cuenta_id']);
  $ctx = ['cuenta' => $cuenta, 'msg' => $m, 'cliente' => $m['cliente_id'] ? eq_cliente((int)$m['cliente_id']) : null, 'agente' => ca_agente($cuenta), 'derivado' => true];
  try { $res = ca_ejecutar($x['herramienta'], json_decode((string)$x['args'], true) ?: [], $ctx, $uid); }
  catch (Throwable $e) {
    $db->prepare('UPDATE mail_acciones SET motivo = ? WHERE id = ?')->execute([mb_substr($e->getMessage(), 0, 255), $x['id']]);
    icc_json(['error' => $e->getMessage() . ' Sigue pendiente.'], 409);
  }
  $db->prepare("UPDATE mail_acciones SET estado = 'aprobada', resultado = ?, decidido_por = ?, decidido_en = NOW() WHERE id = ?")->execute([mb_substr($res, 0, 500), $uid, $x['id']]);
  if ($m['cliente_id']) icc_nota_cliente((int)$m['cliente_id'], 'Acción del agente de correo aprobada por ' . $user['nombre'] . ': ' . $res, 'correo', $uid);
  icc_json(['ok' => true, 'resultado' => $res]);
}

if ($accion === 'dosieres' && $metodo === 'GET') icc_json(['dosieres' => ca_dosieres('general', 30)]);

if ($accion === 'cuentas' && $metodo === 'GET') {
  $c = array_map('ca_cuenta_publica', $db->query('SELECT * FROM mail_cuentas ORDER BY funcion = "solo_envio", email')->fetchAll());
  if (!$esConfig) $c = array_values(array_filter($c, function ($x) use ($uid, $visibles) { return $x['funcion'] !== 'personal' || $x['responsable_id'] === $uid || ($visibles !== null && in_array($x['responsable_id'], $visibles, true)); }));
  $usuarios = $db->query("SELECT id, CONCAT(nombre, ' ', COALESCE(apellidos, '')) nombre FROM usuarios WHERE bloqueado = 0 ORDER BY nombre")->fetchAll();
  icc_json(['cuentas' => $c, 'usuarios' => $esConfig ? $usuarios : [], 'es_config' => $esConfig, 'dosieres' => ca_dosieres('general', 30)]);
}
function ca_solo_config(bool $esConfig): void { if (!$esConfig) icc_json(['error' => 'Solo la administración configura los buzones.'], 403); }
if ($accion === 'cuenta' && $metodo === 'POST') {
  ca_solo_config($esConfig);
  $email = icc_email_normal((string)($body['email'] ?? ''));
  if (!$email) icc_json(['error' => 'Correo no válido.'], 422);
  $seg = function ($v, $d) { return in_array($v, ['ssl', 'starttls', 'ninguna'], true) ? $v : $d; };
  $id = ca_crear_cuenta(['email' => $email, 'nombre' => (string)($body['nombre'] ?? ''), 'host_imap' => trim((string)($body['host_imap'] ?? '')), 'puerto_imap' => (int)($body['puerto_imap'] ?? 993) ?: 993,
    'seguridad_imap' => $seg($body['seguridad_imap'] ?? '', 'ssl'), 'host_smtp' => trim((string)($body['host_smtp'] ?? '')), 'puerto_smtp' => (int)($body['puerto_smtp'] ?? 587) ?: 587,
    'seguridad_smtp' => $seg($body['seguridad_smtp'] ?? '', 'starttls'), 'usuario' => trim((string)($body['usuario'] ?? '')) ?: $email, 'ultimos_7' => !empty($body['ultimos_7']), 'funcion' => (string)($body['funcion'] ?? ''), 'firma' => (string)($body['firma'] ?? '')],
    (string)($body['clave'] ?? ''), $uid);
  icc_seg_anota('Buzón conectado', $email . ' (agente de correo)', $uid);
  icc_json(['ok' => true, 'id' => $id]);
}
if ($accion === 'cuenta_probar' && $metodo === 'POST') {
  ca_solo_config($esConfig);
  $c = ca_cuenta((int)($body['id'] ?? 0), true);
  if (!$c) icc_json(['error' => 'No encontrado.'], 404);
  $i = $c['funcion'] === 'solo_envio' ? ['ok' => true, 'omitido' => true] : icc_imap_probar($c);
  $s = icc_smtp_probar($c);
  icc_json(['imap' => $i, 'smtp' => $s]);
}
if ($accion === 'cuenta_borrar' && $metodo === 'POST') {
  ca_solo_config($esConfig);
  $db->prepare('DELETE FROM mail_cuentas WHERE id = ?')->execute([(int)($body['id'] ?? 0)]);
  icc_seg_anota('Buzón desconectado', 'Buzón #' . (int)$body['id'], $uid);
  icc_json(['ok' => true]);
}
if ($accion === 'cuenta_agente' && $metodo === 'POST') {
  ca_solo_config($esConfig);
  $c = ca_cuenta((int)($body['id'] ?? 0));
  if (!$c) icc_json(['error' => 'No encontrado.'], 404);
  $funcion = isset(CA_FUNCIONES[$body['funcion'] ?? '']) ? $body['funcion'] : $c['funcion'];
  $a = (array)($body['agente'] ?? []);
  $permisos = [];
  foreach ((array)($a['permisos'] ?? []) as $k => $v) if (isset(CA_HERRAMIENTAS[$k]) && in_array($v, ['solo', 'aprobacion', 'no'], true)) $permisos[$k] = $v;
  $agente = ['nombre' => mb_substr(trim((string)($a['nombre'] ?? '')), 0, 80), 'cargo' => mb_substr(trim((string)($a['cargo'] ?? '')), 0, 80), 'instrucciones' => mb_substr((string)($a['instrucciones'] ?? ''), 0, 4000),
    'conocimiento' => mb_substr((string)($a['conocimiento'] ?? ''), 0, 6000), 'activo' => !empty($a['activo']), 'permisos' => $permisos];
  $adj = implode(',', array_slice(array_filter(array_map('intval', (array)($body['adjuntos'] ?? []))), 0, 3));
  $resp = !empty($body['responsable_id']) ? (int)$body['responsable_id'] : null;
  $db->prepare('UPDATE mail_cuentas SET funcion = ?, modo = ?, agente = ?, adjuntos = ?, adjuntar = ?, acuse = ?, responsable_id = ?, activo = ?, firma = ?, nombre = ? WHERE id = ?')
    ->execute([$funcion, in_array($body['modo'] ?? '', ['aprobacion', 'automatico', 'amplio'], true) ? $body['modo'] : $c['modo'], json_encode($agente, JSON_UNESCAPED_UNICODE), $adj, !empty($body['adjuntar']) ? 1 : 0,
      !empty($body['acuse']) ? 1 : 0, $resp, !empty($body['activo']) ? 1 : 0, mb_substr((string)($body['firma'] ?? $c['firma']), 0, 1000), mb_substr((string)($body['nombre'] ?? $c['nombre']), 0, 120), $c['id']]);
  icc_json(['ok' => true]);
}
if ($accion === 'cuentas_lote' && $metodo === 'POST') {
  ca_solo_config($esConfig);
  $out = [];
  foreach (array_slice((array)($body['filas'] ?? []), 0, 50) as $f) {
    $linea = trim((string)($f['linea'] ?? ''));
    if (!preg_match('/([^\s;,]+@[^\s;,]+)/', $linea, $mm) || !($email = icc_email_normal($mm[1]))) { $out[] = ['linea' => $linea, 'ok' => false, 'error' => 'Correo no válido']; continue; }
    $id = ca_crear_cuenta(['email' => $email, 'host_imap' => 'imap.servidor-correo.net', 'puerto_imap' => 993, 'seguridad_imap' => 'ssl', 'host_smtp' => 'smtp.servidor-correo.net', 'puerto_smtp' => 587, 'seguridad_smtp' => 'starttls', 'usuario' => $email]
      + (!empty($body['servidor']) ? (array)$body['servidor'] : []), (string)($f['clave'] ?? ''), $uid);
    $c = ca_cuenta($id, true);
    $r = $c['funcion'] === 'solo_envio' ? ['ok' => true] : icc_imap_probar($c);
    $out[] = ['linea' => $linea, 'email' => $email, 'ok' => $r['ok'], 'error' => $r['error'] ?? null, 'agente' => ca_agente($c)['nombre']];
  }
  icc_seg_anota('Buzones conectados', count($out) . ' buzones (alta en bloque)', $uid);
  icc_json(['resultado' => $out]);
}

if ($accion === 'revisar' && $metodo === 'POST') {
  @set_time_limit(280);
  icc_json(['ok' => true, 'texto' => ca_tick()]);
}

if ($accion === 'config' && $metodo === 'GET') icc_json(ca_config() + ['es_config' => $esConfig, 'modelos' => ICC_IA_MODELOS]);
if ($accion === 'config' && $metodo === 'PUT') {
  ca_solo_config($esConfig);
  icc_ajuste_guardar('correo_tono', mb_substr(trim((string)($body['tono'] ?? '')), 0, 200), false, $uid);
  icc_ajuste_guardar('correo_conocimiento', mb_substr((string)($body['conocimiento'] ?? ''), 0, 12000), false, $uid);
  icc_ajuste_guardar('correo_modelo', in_array($body['modelo'] ?? '', ICC_IA_MODELOS, true) ? $body['modelo'] : '', false, $uid);
  icc_ajuste_guardar('correo_limite_dia', (string)max(1, min(2000, (int)($body['limite_dia'] ?? 150))), false, $uid);
  icc_ajuste_guardar('correo_aviso_ia', !empty($body['aviso_ia']) ? '1' : '0', false, $uid);
  icc_ajuste_guardar('correo_crear_leads', !empty($body['crear_leads']) ? '1' : '0', false, $uid);
  icc_json(['ok' => true]);
}

icc_json(['error' => 'Acción no soportada.'], 400);
