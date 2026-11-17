<?php
/**
 * ICC CRM · Zona de entrevistas. Direccion y jefes de equipo; los agentes de
 * WhatsApp y la conexion con Meta, coordinacion, admin y super admin.
 *
 * GET  ?action=panel | vacantes | candidatos[&vacante=&estado=] | entrevista&id= | agentes | config
 * POST ?action=vacante {...} · vacante_estado {id, estado} · vacante_plantilla {clave}
 * POST ?action=invitar {vacante_id, filas[{nombre, telefono, email}], consentimiento}
 * POST ?action=decidir {id, decision: descartar|avanzar|contratar, nota?} · descartar_bloque {ids[]}
 * POST ?action=borrar_candidato {id}
 * POST ?action=agente {...} · agente_borrar {id} · probar_wa {agente_id}
 * POST ?action=prueba_iniciar {vacante_id} · prueba_mensaje {id, texto}
 * PUT  ?action=config {...}
 */
require __DIR__ . '/config.php';
require_once __DIR__ . '/rrhh_lib.php';

$user = icc_require_auth();
if (!icc_ve_ia_equipo($user)) icc_json(['error' => 'No encontrado'], 404);
$metodo = $_SERVER['REQUEST_METHOD'];
$accion = (string)($_GET['action'] ?? 'panel');
if ($metodo !== 'GET') icc_require_csrf();
$body = $metodo === 'GET' ? [] : icc_body();
$db = icc_db();
$uid = (int)$user['id'];
$esConfig = icc_ve_config_ia($user);
function rr_solo_config(bool $c): void { if (!$c) icc_json(['error' => 'Solo la administración configura los agentes de WhatsApp.'], 403); }
function rr_vacante_publica(array $v): array {
  $v['filtros'] = json_decode((string)$v['filtros'], true) ?: [];
  $v['preguntas'] = json_decode((string)$v['preguntas'], true) ?: [];
  $v['enlace_formulario'] = $v['token'] ? icc_url_base() . '/api/rrhh_entrada.php?t=' . $v['token'] : '';
  return $v;
}

if ($accion === 'panel' && $metodo === 'GET') {
  $cont = $db->query("SELECT estado, COUNT(*) n FROM rrhh_entrevistas WHERE canal = 'whatsapp' GROUP BY estado")->fetchAll(PDO::FETCH_KEY_PAIR);
  $vac = $db->query("SELECT v.id, v.titulo, v.estado, v.plazas, a.nombre agente,
      SUM(e.id IS NOT NULL) total, SUM(e.estado = 'en_curso') en_curso, SUM(e.estado IN ('preseleccionado','agendada')) avanzan, SUM(e.estado IN ('revisar','no_cumple')) revisar,
      SUM(e.estado = 'contratado') contratados, ROUND(AVG(e.puntuacion)) media
    FROM rrhh_vacantes v LEFT JOIN rrhh_agentes a ON a.id = v.agente_id LEFT JOIN rrhh_entrevistas e ON e.vacante_id = v.id AND e.canal = 'whatsapp'
    WHERE v.estado <> 'cerrada' OR v.updated_at >= NOW() - INTERVAL 30 DAY GROUP BY v.id ORDER BY v.estado = 'activa' DESC, v.id DESC")->fetchAll();
  $fin = (int)$db->query("SELECT COUNT(*) FROM rrhh_entrevistas WHERE canal = 'whatsapp' AND (puntuacion IS NOT NULL OR estado = 'no_cumple')")->fetchColumn();
  $emp = (int)$db->query("SELECT COUNT(*) FROM rrhh_entrevistas WHERE canal = 'whatsapp' AND estado <> 'invitado'")->fetchColumn();
  $citas = $db->query("SELECT e.id, e.cita_en, c.nombre, v.titulo FROM rrhh_entrevistas e JOIN rrhh_candidatos c ON c.id = e.candidato_id JOIN rrhh_vacantes v ON v.id = e.vacante_id WHERE e.estado = 'agendada' AND e.cita_en >= NOW() ORDER BY e.cita_en LIMIT 10")->fetchAll();
  $wa = rr_config();
  icc_json(['contadores' => $cont, 'vacantes' => $vac, 'finalizacion' => $emp ? round($fin / $emp * 100) : 0, 'citas' => $citas, 'estados' => RR_ESTADOS,
    'whatsapp' => $wa['tiene_token'] && $wa['tiene_secreto'] && (int)$db->query("SELECT COUNT(*) FROM rrhh_agentes WHERE activo = 1 AND phone_number_id <> ''")->fetchColumn() > 0, 'es_config' => $esConfig, 'ia' => icc_ia_disponible()]);
}

if ($accion === 'vacantes' && $metodo === 'GET') {
  $l = array_map('rr_vacante_publica', $db->query('SELECT * FROM rrhh_vacantes ORDER BY estado = "activa" DESC, id DESC')->fetchAll());
  icc_json(['vacantes' => $l, 'agentes' => $db->query('SELECT id, nombre, activo FROM rrhh_agentes ORDER BY nombre')->fetchAll(),
    'responsables' => $db->query("SELECT id, CONCAT(nombre, ' ', COALESCE(apellidos, '')) nombre FROM usuarios WHERE bloqueado = 0 AND rol IN ('jefe_de_equipo','coordinador','gerente','admin','super_admin','backoffice') ORDER BY nombre")->fetchAll(),
    'plantillas' => array_map(function ($p) { return $p[0]; }, rr_plantillas()), 'filtros_rapidos' => rr_filtros_rapidos()]);
}

if ($accion === 'vacante' && $metodo === 'POST') {
  $titulo = trim((string)($body['titulo'] ?? ''));
  if ($titulo === '') icc_json(['error' => 'Ponle un título a la vacante.'], 422);
  try { [$f, $p] = rr_validar_vacante((array)($body['filtros'] ?? []), (array)($body['preguntas'] ?? [])); }
  catch (InvalidArgumentException $e) { icc_json(['error' => $e->getMessage()], 422); }
  $ag = (int)($body['agente_id'] ?? 0) ?: null;
  $resp = (int)($body['responsable_id'] ?? 0) ?: null;
  $args = [mb_substr($titulo, 0, 160), mb_substr(trim((string)($body['ubicacion'] ?? '')), 0, 160), mb_substr(trim((string)($body['modalidad'] ?? '')), 0, 60), mb_substr(trim((string)($body['jornada'] ?? '')), 0, 80),
    mb_substr(trim((string)($body['salario'] ?? '')), 0, 160), mb_substr((string)($body['descripcion'] ?? ''), 0, 5000), json_encode($f, JSON_UNESCAPED_UNICODE), json_encode($p, JSON_UNESCAPED_UNICODE),
    max(0, min(100, (int)($body['puntuacion_min'] ?? 60))), max(1, min(500, (int)($body['plazas'] ?? 1))), $ag, $resp, !empty($body['auto_agendar']) ? 1 : 0];
  $id = (int)($body['id'] ?? 0);
  if ($id) $db->prepare('UPDATE rrhh_vacantes SET titulo = ?, ubicacion = ?, modalidad = ?, jornada = ?, salario = ?, descripcion = ?, filtros = ?, preguntas = ?, puntuacion_min = ?, plazas = ?, agente_id = ?, responsable_id = ?, auto_agendar = ? WHERE id = ?')->execute(array_merge($args, [$id]));
  else { $db->prepare('INSERT INTO rrhh_vacantes (titulo, ubicacion, modalidad, jornada, salario, descripcion, filtros, preguntas, puntuacion_min, plazas, agente_id, responsable_id, auto_agendar, token, creado_por) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')->execute(array_merge($args, [bin2hex(random_bytes(16)), $uid])); $id = (int)$db->lastInsertId(); }
  icc_json(['ok' => true, 'id' => $id]);
}

if ($accion === 'vacante_plantilla' && $metodo === 'POST') {
  $p = rr_plantillas()[(string)($body['clave'] ?? '')] ?? null;
  if (!$p) icc_json(['error' => 'Plantilla no encontrada.'], 404);
  $ag = (int)$db->query('SELECT id FROM rrhh_agentes WHERE activo = 1 ORDER BY id LIMIT 1')->fetchColumn() ?: null;
  $db->prepare("INSERT INTO rrhh_vacantes (titulo, ubicacion, modalidad, jornada, salario, filtros, preguntas, agente_id, responsable_id, token, creado_por) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    ->execute([$p[0], $p[1], $p[2], $p[3], $p[4], json_encode($p[5], JSON_UNESCAPED_UNICODE), json_encode($p[6], JSON_UNESCAPED_UNICODE), $ag, $uid, bin2hex(random_bytes(16)), $uid]);
  icc_json(['ok' => true, 'id' => (int)$db->lastInsertId()]);
}

if ($accion === 'vacante_estado' && $metodo === 'POST') {
  $estado = in_array($body['estado'] ?? '', ['activa', 'pausada', 'cerrada', 'borrador'], true) ? $body['estado'] : 'pausada';
  $id = (int)($body['id'] ?? 0);
  if ($estado === 'activa') {
    $v = $db->query('SELECT agente_id, preguntas FROM rrhh_vacantes WHERE id = ' . $id)->fetch();
    if (!$v || !$v['agente_id']) icc_json(['error' => 'Asigna un agente de WhatsApp a la vacante antes de activarla.'], 422);
    if (!(json_decode((string)$v['preguntas'], true) ?: [])) icc_json(['error' => 'La vacante necesita preguntas.'], 422);
  }
  $db->prepare('UPDATE rrhh_vacantes SET estado = ? WHERE id = ?')->execute([$estado, $id]);
  icc_json(['ok' => true]);
}

if ($accion === 'candidatos' && $metodo === 'GET') {
  $w = ["e.canal = 'whatsapp'"]; $p = [];
  if (!empty($_GET['vacante'])) { $w[] = 'e.vacante_id = ?'; $p[] = (int)$_GET['vacante']; }
  if (!empty($_GET['estado'])) { $w[] = 'e.estado = ?'; $p[] = (string)$_GET['estado']; }
  $st = $db->prepare('SELECT e.id, e.estado, e.paso, e.puntuacion, e.motivo, e.cita_en, e.updated_at, e.created_at, c.id candidato_id, c.nombre, c.telefono, c.email, c.bolsa_hasta, v.id vacante_id, v.titulo, v.puntuacion_min
    FROM rrhh_entrevistas e JOIN rrhh_candidatos c ON c.id = e.candidato_id JOIN rrhh_vacantes v ON v.id = e.vacante_id WHERE ' . implode(' AND ', $w) . ' ORDER BY e.updated_at DESC LIMIT 400');
  $st->execute($p);
  icc_json(['candidatos' => $st->fetchAll(), 'estados' => RR_ESTADOS]);
}

if ($accion === 'entrevista' && $metodo === 'GET') {
  $e = rr_entrevista((int)($_GET['id'] ?? 0));
  if (!$e) icc_json(['error' => 'No encontrada.'], 404);
  $st = $db->prepare('SELECT direccion, texto, estado, error, created_at FROM rrhh_mensajes WHERE candidato_id = ? AND (entrevista_id = ? OR entrevista_id IS NULL) ORDER BY id');
  $st->execute([$e['candidato_id'], $e['id']]);
  $e['mensajes'] = $st->fetchAll();
  $e['respuestas'] = array_values(json_decode((string)$e['respuestas'], true) ?: []);
  unset($e['filtros'], $e['preguntas'], $e['descripcion']);
  icc_json(['entrevista' => $e, 'estados' => RR_ESTADOS]);
}

if ($accion === 'invitar' && $metodo === 'POST') {
  $vac = (int)($body['vacante_id'] ?? 0);
  if (!$db->query('SELECT 1 FROM rrhh_vacantes WHERE id = ' . $vac)->fetchColumn()) icc_json(['error' => 'Elige la vacante.'], 422);
  if (empty($body['consentimiento'])) icc_json(['error' => 'Confirma que estas personas han pedido o aceptado que les escribamos por WhatsApp (por ejemplo, se inscribieron en la oferta).'], 422);
  $out = [];
  foreach (array_slice((array)($body['filas'] ?? []), 0, 300) as $f) {
    try { $cid = rr_alta_candidato((string)($f['nombre'] ?? ''), (string)($f['telefono'] ?? ''), (string)($f['email'] ?? ''), 'importado', false); rr_invitar($vac, $cid); $out[] = ['ok' => true, 'telefono' => $f['telefono'] ?? '']; }
    catch (InvalidArgumentException $e) { $out[] = ['ok' => false, 'telefono' => $f['telefono'] ?? '', 'error' => $e->getMessage()]; }
  }
  icc_json(['resultado' => $out, 'ok' => count(array_filter($out, function ($x) { return $x['ok']; }))]);
}

if ($accion === 'decidir' && $metodo === 'POST') {
  try { icc_json(['ok' => true, 'texto' => rr_decidir((int)($body['id'] ?? 0), (string)($body['decision'] ?? ''), $uid, trim((string)($body['nota'] ?? '')))]); }
  catch (InvalidArgumentException $e) { icc_json(['error' => $e->getMessage()], 422); }
}

if ($accion === 'descartar_bloque' && $metodo === 'POST') {
  $n = 0;
  foreach (array_slice(array_map('intval', (array)($body['ids'] ?? [])), 0, 200) as $id) {
    $est = (string)$db->query('SELECT estado FROM rrhh_entrevistas WHERE id = ' . $id)->fetchColumn();
    if (!in_array($est, ['no_cumple', 'revisar', 'abandonada'], true)) continue;
    try { rr_decidir($id, 'descartar', $uid); $n++; } catch (InvalidArgumentException $e) { /* siguiente */ }
  }
  icc_json(['ok' => true, 'texto' => $n . ' descartes confirmados y avisados.']);
}

if ($accion === 'borrar_candidato' && $metodo === 'POST') {
  $db->prepare('DELETE FROM rrhh_candidatos WHERE id = ?')->execute([(int)($body['id'] ?? 0)]);
  icc_seg_anota('Candidato borrado (RGPD)', 'Candidato #' . (int)($body['id'] ?? 0), $uid);
  icc_json(['ok' => true]);
}

if ($accion === 'agentes' && $metodo === 'GET') {
  icc_json(['agentes' => $db->query('SELECT a.*, (SELECT COUNT(*) FROM rrhh_vacantes v WHERE v.agente_id = a.id AND v.estado = "activa") vacantes,
    (SELECT COUNT(*) FROM rrhh_mensajes m WHERE m.agente_id = a.id AND m.created_at >= CURDATE()) mensajes_hoy FROM rrhh_agentes a ORDER BY a.id')->fetchAll(), 'es_config' => $esConfig]);
}
if ($accion === 'agente' && $metodo === 'POST') {
  rr_solo_config($esConfig);
  $nombre = trim((string)($body['nombre'] ?? ''));
  if ($nombre === '') icc_json(['error' => 'Ponle un nombre al agente.'], 422);
  $args = [mb_substr($nombre, 0, 80), preg_replace('/\D/', '', (string)($body['phone_number_id'] ?? '')), mb_substr(trim((string)($body['numero_visible'] ?? '')), 0, 30), mb_substr(trim((string)($body['tono'] ?? '')) ?: 'cercano y profesional, de tú', 0, 160), !empty($body['activo']) ? 1 : 0];
  $id = (int)($body['id'] ?? 0);
  if ($id) $db->prepare('UPDATE rrhh_agentes SET nombre = ?, phone_number_id = ?, numero_visible = ?, tono = ?, activo = ? WHERE id = ?')->execute(array_merge($args, [$id]));
  else { $db->prepare('INSERT INTO rrhh_agentes (nombre, phone_number_id, numero_visible, tono, activo) VALUES (?, ?, ?, ?, ?)')->execute($args); $id = (int)$db->lastInsertId(); }
  icc_json(['ok' => true, 'id' => $id]);
}
if ($accion === 'agente_borrar' && $metodo === 'POST') {
  rr_solo_config($esConfig);
  $id = (int)($body['id'] ?? 0);
  if ((int)$db->query("SELECT COUNT(*) FROM rrhh_vacantes WHERE agente_id = $id AND estado = 'activa'")->fetchColumn()) icc_json(['error' => 'Tiene vacantes activas: asígnalas a otro agente antes.'], 409);
  $db->prepare('DELETE FROM rrhh_agentes WHERE id = ?')->execute([$id]);
  icc_json(['ok' => true]);
}
if ($accion === 'probar_wa' && $metodo === 'POST') {
  rr_solo_config($esConfig);
  $ag = rr_agente((int)($body['agente_id'] ?? 0));
  $token = icc_descifrar((string)icc_ajuste('rrhh_wa_token', ''));
  if (!$ag || !$token || $ag['phone_number_id'] === '') icc_json(['error' => 'Falta el token de Meta o el ID del número del agente.'], 422);
  $ch = curl_init(rr_config()['base'] . '/' . rawurlencode($ag['phone_number_id']) . '?fields=display_phone_number,verified_name,quality_rating');
  curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 15, CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $token]]);
  $r = json_decode((string)curl_exec($ch), true);
  $cod = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
  curl_close($ch);
  if ($cod >= 200 && $cod < 300 && !empty($r['display_phone_number'])) icc_json(['ok' => true, 'texto' => 'Conectado: ' . $r['display_phone_number'] . ' · ' . ($r['verified_name'] ?? '') . (isset($r['quality_rating']) ? ' · calidad ' . $r['quality_rating'] : '')]);
  icc_json(['error' => 'Meta: ' . ($r['error']['message'] ?? 'HTTP ' . $cod)], 502);
}

if ($accion === 'config' && $metodo === 'GET') {
  rr_solo_config($esConfig);
  icc_json(rr_config() + ['webhook' => icc_url_base() . '/api/rrhh_webhook.php', 'verify_token' => rr_verify_token(),
    'textos_plantillas' => [
      'invitacion' => 'Hola {{1}}, soy {{3}}, asistente virtual (IA) del equipo de selección de ICC Consultoría. Te escribo por tu candidatura a «{{2}}». ¿Te viene bien hacer ahora una breve entrevista por aquí? Responde SÍ para empezar.',
      'recordatorio' => 'Hola {{1}}, te recordamos tu proceso de selección para «{{2}}» en ICC Consultoría. Responde a este mensaje para continuar.',
      'novedades' => 'Hola {{1}}, tenemos novedades sobre tu candidatura a «{{2}}» en ICC Consultoría. Responde a este mensaje y te las contamos.']]);
}
if ($accion === 'config' && $metodo === 'PUT') {
  rr_solo_config($esConfig);
  foreach (['plantilla_invitacion', 'plantilla_recordatorio', 'plantilla_novedades'] as $k) if (isset($body[$k]) && preg_match('/^[a-z0-9_]{1,60}$/', (string)$body[$k])) icc_ajuste_guardar('rrhh_' . $k, (string)$body[$k], false, $uid);
  if (isset($body['idioma']) && preg_match('/^[a-z]{2}(_[A-Z]{2})?$/', (string)$body['idioma'])) icc_ajuste_guardar('rrhh_idioma', (string)$body['idioma'], false, $uid);
  if (isset($body['privacidad_url']) && ($body['privacidad_url'] === '' || preg_match('#^https?://#i', (string)$body['privacidad_url']))) icc_ajuste_guardar('rrhh_privacidad_url', mb_substr((string)$body['privacidad_url'], 0, 255), false, $uid);
  icc_ajuste_guardar('rrhh_meses', (string)max(1, min(24, (int)($body['meses_conservar'] ?? 6))), false, $uid);
  icc_ajuste_guardar('rrhh_limite_dia', (string)max(1, min(1000, (int)($body['limite_dia'] ?? 200))), false, $uid);
  icc_ajuste_guardar('rrhh_activo', !empty($body['activo']) ? '1' : '0', false, $uid);
  foreach (['hora_desde', 'hora_hasta'] as $k) if (isset($body[$k]) && preg_match('/^\d{2}:\d{2}$/', (string)$body[$k])) icc_ajuste_guardar('rrhh_' . $k, (string)$body[$k], false, $uid);
  if (isset($body['base']) && preg_match('#^https://[a-z0-9.-]+(/v\d+\.\d+)?$#i', (string)$body['base'])) icc_ajuste_guardar('rrhh_wa_base', (string)$body['base'], false, $uid);
  if (trim((string)($body['token'] ?? '')) !== '') { icc_ajuste_guardar('rrhh_wa_token', icc_cifrar(trim((string)$body['token'])), false, $uid); icc_seg_anota('Token de WhatsApp guardado', 'Zona de entrevistas', $uid); }
  if (trim((string)($body['app_secret'] ?? '')) !== '') icc_ajuste_guardar('rrhh_wa_app_secret', icc_cifrar(trim((string)$body['app_secret'])), false, $uid);
  icc_json(['ok' => true]);
}

/* ---- Probar la entrevista sin WhatsApp (canal de prueba) ---- */
if ($accion === 'prueba_iniciar' && $metodo === 'POST') {
  $vac = (int)($body['vacante_id'] ?? 0);
  if (!$db->query('SELECT 1 FROM rrhh_vacantes WHERE id = ' . $vac)->fetchColumn()) icc_json(['error' => 'Elige la vacante.'], 422);
  $tel = 'prueba' . $uid;
  $db->prepare("INSERT INTO rrhh_candidatos (nombre, telefono, origen) VALUES (?, ?, 'prueba') ON DUPLICATE KEY UPDATE consentimiento = NULL, baja = 0")->execute([$user['nombre'] . ' (prueba)', $tel]);
  $cid = (int)$db->query("SELECT id FROM rrhh_candidatos WHERE telefono = " . $db->quote($tel))->fetchColumn();
  $db->prepare("DELETE FROM rrhh_entrevistas WHERE candidato_id = ? AND canal = 'prueba'")->execute([$cid]);
  $db->prepare("DELETE FROM rrhh_mensajes WHERE candidato_id = ?")->execute([$cid]);
  $id = rr_invitar($vac, $cid, 'prueba');
  rr_iniciar($id);
  icc_json(['ok' => true, 'id' => $id, 'mensajes' => $db->query("SELECT direccion, texto FROM rrhh_mensajes WHERE candidato_id = $cid ORDER BY id")->fetchAll()]);
}
if ($accion === 'prueba_mensaje' && $metodo === 'POST') {
  $id = (int)($body['id'] ?? 0);
  $e = rr_entrevista($id);
  if (!$e || $e['canal'] !== 'prueba' || $e['telefono'] !== 'prueba' . $uid) icc_json(['error' => 'Prueba no encontrada.'], 404);
  $texto = mb_substr(trim((string)($body['texto'] ?? '')), 0, 2000);
  if ($texto === '') icc_json(['error' => 'Escribe un mensaje.'], 422);
  @set_time_limit(120);
  $estado = rr_procesar($id, $texto);
  $e = rr_entrevista($id);
  icc_json(['ok' => true, 'estado' => $estado, 'puntuacion' => $e ? $e['puntuacion'] : null, 'resumen' => $e ? $e['resumen'] : null,
    'mensajes' => $db->query('SELECT direccion, texto FROM rrhh_mensajes WHERE candidato_id = ' . (int)($e['candidato_id'] ?? 0) . ' ORDER BY id')->fetchAll(), 'respuestas' => $e ? array_values(json_decode((string)$e['respuestas'], true) ?: []) : []]);
}

icc_json(['error' => 'Acción no soportada.'], 400);
