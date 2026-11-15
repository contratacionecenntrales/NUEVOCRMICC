<?php
/**
 * ICC CRM · Motor de prospeccion IA. Direccion y jefes de equipo; los ajustes
 * (claves, buzon, limites, aviso legal) solo coordinacion, admin y super admin.
 *
 * GET  ?action=estado                       tarjetas de campanas, feed, contadores
 * GET  ?action=leads&estado=&sector=&q=&campana=
 * POST ?action=extraer {sector, palabra, ubicaciones[], paginas}
 * POST ?action=importar {csv}               CSV/Excel exportado (nombre;email;telefono;web;sector;localidad)
 * POST ?action=leads_accion {ids[], accion: descartar|crm|campana|reanalizar, campana_id, gestor_id}
 * POST ?action=campana {id?, nombre, sector, angulo, modo, gestor_id}
 * POST ?action=campana_estado {id, estado}
 * GET  ?action=mensajes&estado=pendiente    correos para revisar
 * POST ?action=mensaje {id, accion: aprobar|descartar|editar|enviado, asunto, cuerpo}
 * GET  ?action=respuestas
 * POST ?action=respuesta {lead_id, asunto, texto}   respuesta pegada a mano
 * GET  ?action=bajas · POST ?action=baja {valor, tipo} · POST ?action=baja_quitar {id}
 * GET  ?action=config · PUT ?action=config {...} · POST ?action=probar {que: smtp|imap|places}
 * POST ?action=aviso_legal {acepto} · POST ?action=pausa {pausado}
 */
require __DIR__ . '/config.php';
require_once __DIR__ . '/motor_lib.php';
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

function motor_gestores(array $user): array {
  $ids = icc_equipo_comercial_ids($user);
  $sql = "SELECT id, CONCAT(nombre, ' ', COALESCE(apellidos, '')) nombre, rol FROM usuarios WHERE bloqueado = 0 AND rol IN ('comercial','jefe_de_equipo')";
  if ($ids !== null) $sql .= $ids ? ' AND id IN (' . implode(',', array_map('intval', $ids)) . ')' : ' AND 0';
  return icc_db()->query($sql . ' ORDER BY nombre')->fetchAll();
}

function motor_gestor_valido(array $user, $id): ?int {
  if (!$id) return null;
  return icc_puede_ver_comercial($user, (int)$id) ? (int)$id : null;
}

function motor_lead_publico(array $l): array {
  return [
    'id' => (int)$l['id'], 'nombre' => $l['nombre'], 'razon_social' => $l['razon_social'], 'cif' => $l['cif'], 'sector' => $l['sector'],
    'localidad' => $l['concejo'] ?: $l['localidad'], 'comarca' => $l['comarca'], 'telefono' => $l['telefono'], 'web' => $l['web'], 'email' => $l['email'] !== '' && function_exists('idn_to_utf8') && strpos($l['email'], 'xn--') !== false
      ? substr($l['email'], 0, strpos($l['email'], '@') + 1) . (idn_to_utf8(substr($l['email'], strpos($l['email'], '@') + 1), IDNA_DEFAULT, INTL_IDNA_VARIANT_UTS46) ?: substr($l['email'], strpos($l['email'], '@') + 1)) : $l['email'],
    'mx_ok' => (bool)$l['mx_ok'], 'madurez' => $l['madurez'] === '' ? [] : explode(',', $l['madurez']), 'estado' => $l['estado'], 'canal' => $l['canal'],
    'paso' => (int)$l['paso'], 'campana_id' => $l['campana_id'] ? (int)$l['campana_id'] : null, 'cliente_id' => $l['cliente_id'] ? (int)$l['cliente_id'] : null,
    'analizado' => $l['analizado_en'] !== null, 'analisis_error' => $l['analisis_error'], 'excluido' => $l['email'] !== '' && icc_excluido($l['email']),
    'origen' => $l['origen'], 'created_at' => $l['created_at'],
  ];
}

// ================================================================== ESTADO
if ($accion === 'estado' && $metodo === 'GET') {
  $cfg = motor_config();
  $camps = $db->query("SELECT c.*,
      (SELECT COUNT(*) FROM motor_leads l WHERE l.campana_id = c.id) leads,
      (SELECT COUNT(*) FROM motor_leads l WHERE l.campana_id = c.id AND l.mx_ok = 1) verificados,
      (SELECT COUNT(*) FROM motor_mensajes m WHERE m.campana_id = c.id AND m.estado = 'enviado') enviados,
      (SELECT COUNT(*) FROM motor_mensajes m WHERE m.campana_id = c.id AND m.direccion = 'entrada') respuestas,
      (SELECT COUNT(*) FROM motor_mensajes m WHERE m.campana_id = c.id AND m.clasificacion IN ('quiere_info','pide_presupuesto','acepta_reunion')) positivas,
      (SELECT COUNT(*) FROM motor_mensajes m WHERE m.campana_id = c.id AND m.clasificacion = 'acepta_reunion') reuniones,
      (SELECT COUNT(*) FROM motor_mensajes m WHERE m.campana_id = c.id AND m.clasificacion = 'baja') bajas,
      (SELECT COUNT(*) FROM motor_mensajes m WHERE m.campana_id = c.id AND m.estado = 'pendiente') pendientes
    FROM motor_campanas c WHERE c.estado <> 'terminada' ORDER BY c.estado = 'activa' DESC, c.id DESC")->fetchAll();
  $cont = $db->query("SELECT
      (SELECT COUNT(*) FROM motor_leads) leads,
      (SELECT COUNT(*) FROM motor_leads WHERE estado = 'nuevo') nuevos,
      (SELECT COUNT(*) FROM motor_mensajes WHERE estado = 'pendiente') pendientes,
      (SELECT COUNT(*) FROM motor_mensajes WHERE estado = 'enviado' AND enviado_en >= CURDATE()) enviados_hoy,
      (SELECT COUNT(*) FROM motor_mensajes WHERE direccion = 'entrada' AND created_at >= NOW() - INTERVAL 7 DAY) respuestas_7d,
      (SELECT COUNT(*) FROM motor_bajas) bajas")->fetch();
  $feed = $db->query('SELECT ts, tipo, mensaje FROM motor_log ORDER BY id DESC LIMIT 40')->fetchAll();
  icc_json([
    'campanas' => $camps, 'contadores' => $cont, 'feed' => $feed,
    'pausado' => $cfg['pausado'], 'limite_dia' => $cfg['limite_dia'], 'motivo_espera' => motor_puede_enviar_ahora($cfg),
    'buzon' => motor_cuenta() !== null, 'places' => icc_places_clave() !== '', 'ia' => icc_ia_disponible(),
    'aviso_legal' => $cfg['aviso_legal'] !== '', 'es_config' => $esConfig,
    'sectores' => array_map(function ($k, $v) { return ['id' => $k, 'nombre' => $v[0], 'cnae' => $v[1]]; }, array_keys(MOTOR_SECTORES), MOTOR_SECTORES),
    'angulos' => MOTOR_ANGULOS, 'madurez' => MOTOR_MADUREZ, 'clases' => MOTOR_CLASES, 'asturias' => MOTOR_ASTURIAS,
    'gestores' => motor_gestores($user),
  ]);
}

// =================================================================== LEADS
if ($accion === 'leads' && $metodo === 'GET') {
  $w = ['1 = 1']; $p = [];
  foreach (['estado', 'sector'] as $k) if (!empty($_GET[$k])) { $w[] = "l.$k = ?"; $p[] = (string)$_GET[$k]; }
  if (!empty($_GET['campana'])) { $w[] = 'l.campana_id = ?'; $p[] = (int)$_GET['campana']; }
  if (!empty($_GET['q'])) { $q = '%' . trim((string)$_GET['q']) . '%'; $w[] = '(l.nombre LIKE ? OR l.email LIKE ? OR l.localidad LIKE ? OR l.concejo LIKE ?)'; array_push($p, $q, $q, $q, $q); }
  $st = $db->prepare('SELECT l.* FROM motor_leads l WHERE ' . implode(' AND ', $w) . ' ORDER BY l.id DESC LIMIT 300');
  $st->execute($p);
  icc_json(['leads' => array_map('motor_lead_publico', $st->fetchAll())]);
}

if ($accion === 'extraer' && $metodo === 'POST') {
  $sector = (string)($body['sector'] ?? '');
  if (!isset(MOTOR_SECTORES[$sector]) && trim((string)($body['palabra'] ?? '')) === '') icc_json(['error' => 'Elige un sector o escribe una palabra clave.'], 422);
  $ubic = array_values(array_filter(array_map('trim', (array)($body['ubicaciones'] ?? []))));
  if (!$ubic) icc_json(['error' => 'Elige al menos una ubicación.'], 422);
  if (count($ubic) > 15) icc_json(['error' => 'Como mucho 15 ubicaciones por búsqueda.'], 422);
  @set_time_limit(180);
  $r = motor_extraer($sector, (string)($body['palabra'] ?? ''), $ubic, $uid, max(1, min(3, (int)($body['paginas'] ?? 2))));
  foreach (array_slice($r['nuevos'], 0, 5) as $id) motor_analizar($id);
  icc_json($r + ['analizados_ya' => min(5, count($r['nuevos']))]);
}

if ($accion === 'importar' && $metodo === 'POST') {
  $csv = (string)($body['csv'] ?? '');
  if (strlen($csv) > 2000000) icc_json(['error' => 'El archivo es demasiado grande (máximo 2 MB).'], 413);
  $lineas = preg_split('/\r\n|\r|\n/', trim($csv));
  if (!$lineas || $lineas[0] === '') icc_json(['error' => 'El archivo está vacío.'], 422);
  $sep = substr_count($lineas[0], ';') >= substr_count($lineas[0], ',') ? ';' : ',';
  $cab = array_map(function ($c) { return mb_strtolower(trim($c, " \"\xEF\xBB\xBF")); }, str_getcsv($lineas[0], $sep));
  $idx = function ($nombres) use ($cab) { foreach ($nombres as $n) { $i = array_search($n, $cab, true); if ($i !== false) return $i; } return null; };
  $col = ['nombre' => $idx(['nombre', 'empresa', 'razon social', 'razón social']), 'email' => $idx(['email', 'correo', 'e-mail']), 'telefono' => $idx(['telefono', 'teléfono', 'tel']),
    'web' => $idx(['web', 'url', 'sitio web']), 'sector' => $idx(['sector', 'actividad']), 'localidad' => $idx(['localidad', 'municipio', 'concejo', 'ciudad', 'poblacion', 'población']), 'cif' => $idx(['cif', 'nif'])];
  if ($col['nombre'] === null) icc_json(['error' => 'Falta la columna «nombre» (o «empresa») en la primera fila.'], 422);
  $nuevos = 0; $repetidos = 0; $descartados = 0;
  foreach (array_slice($lineas, 1, 5000) as $l) {
    if (trim($l) === '') continue;
    $f = str_getcsv($l, $sep);
    $g = function ($k) use ($f, $col) { return $col[$k] === null ? '' : trim((string)($f[$col[$k]] ?? '')); };
    $email = $g('email');
    if ($email !== '' && !icc_email_normal($email)) { $descartados++; $email = ''; }
    $sector = '';
    foreach (MOTOR_SECTORES as $k => $s) if ($g('sector') !== '' && (mb_stripos($s[0], $g('sector')) !== false || mb_stripos($g('sector'), $s[2]) !== false || $g('sector') === $k)) { $sector = $k; break; }
    $id = motor_alta_lead(['nombre' => $g('nombre'), 'email' => $email, 'telefono' => $g('telefono'), 'web' => $g('web'), 'sector' => $sector, 'localidad' => $g('localidad'), 'cif' => $g('cif')], 'csv', $uid);
    $id ? $nuevos++ : $repetidos++;
  }
  motor_log('importar', $nuevos . ' empresas importadas desde archivo');
  icc_json(['nuevos' => $nuevos, 'repetidos' => $repetidos, 'correos_descartados' => $descartados]);
}

if ($accion === 'leads_accion' && $metodo === 'POST') {
  $ids = array_values(array_unique(array_map('intval', (array)($body['ids'] ?? []))));
  $acc = (string)($body['accion'] ?? '');
  if (!$ids || count($ids) > 500) icc_json(['error' => 'Selecciona entre 1 y 500 empresas.'], 422);
  $in = implode(',', $ids);
  if ($acc === 'descartar') {
    $n = $db->exec("UPDATE motor_leads SET estado = 'descartado', proximo_envio = NULL WHERE id IN ($in) AND estado <> 'en_crm'");
    $db->exec("UPDATE motor_mensajes SET estado = 'descartado' WHERE lead_id IN ($in) AND estado IN ('pendiente','aprobado','borrador')");
    icc_json(['ok' => true, 'hechos' => $n]);
  }
  if ($acc === 'campana') {
    $cid = (int)($body['campana_id'] ?? 0);
    $st = $db->prepare("SELECT id FROM motor_campanas WHERE id = ? AND estado <> 'terminada'");
    $st->execute([$cid]);
    if (!$st->fetchColumn()) icc_json(['error' => 'Campaña no encontrada.'], 404);
    $n = motor_meter_en_campana($ids, $cid);
    motor_log('campana', $n . ' empresas añadidas a la campaña', null, $cid);
    icc_json(['ok' => true, 'hechos' => $n, 'sin_correo' => count($ids) - $n]);
  }
  if ($acc === 'crm') {
    $gestor = motor_gestor_valido($user, $body['gestor_id'] ?? null);
    if (!$gestor) icc_json(['error' => 'Elige el gestor que llevará estas empresas.'], 422);
    $n = 0;
    foreach ($db->query("SELECT * FROM motor_leads WHERE id IN ($in) AND estado <> 'en_crm'")->fetchAll() as $l) {
      motor_a_crm($l, $gestor, motor_conversacion((int)$l['id']), $uid, 'Pasada al CRM a mano desde el Motor');
      $n++;
    }
    icc_json(['ok' => true, 'hechos' => $n]);
  }
  if ($acc === 'reanalizar') {
    @set_time_limit(180);
    $n = 0;
    foreach (array_slice($ids, 0, 15) as $id) { motor_analizar($id); $n++; }
    icc_json(['ok' => true, 'hechos' => $n]);
  }
  icc_json(['error' => 'Acción no válida.'], 422);
}

// ================================================================ CAMPANAS
if ($accion === 'campana' && $metodo === 'POST') {
  $nombre = trim((string)($body['nombre'] ?? ''));
  $modo = (string)($body['modo'] ?? 'aprobacion');
  $angulo = (string)($body['angulo'] ?? 'ahorro_factura');
  if ($nombre === '') icc_json(['error' => 'Ponle un nombre a la campaña.'], 422);
  if (!in_array($modo, ['aprobacion', 'borradores', 'autonomo'], true)) icc_json(['error' => 'Modo no válido.'], 422);
  if ($modo === 'autonomo' && (!$esConfig || motor_config()['aviso_legal'] === '')) icc_json(['error' => 'El modo autónomo solo lo activa la administración después de aceptar el aviso legal (LSSI art. 21).'], 403);
  if (!isset(MOTOR_ANGULOS[$angulo])) icc_json(['error' => 'Ángulo no válido.'], 422);
  $sector = isset(MOTOR_SECTORES[$body['sector'] ?? '']) ? (string)$body['sector'] : '';
  $gestor = motor_gestor_valido($user, $body['gestor_id'] ?? null);
  if (!empty($body['id'])) {
    $db->prepare('UPDATE motor_campanas SET nombre = ?, sector = ?, angulo = ?, modo = ?, gestor_id = ? WHERE id = ?')->execute([mb_substr($nombre, 0, 160), $sector, $angulo, $modo, $gestor, (int)$body['id']]);
    icc_json(['ok' => true, 'id' => (int)$body['id']]);
  }
  $db->prepare('INSERT INTO motor_campanas (nombre, sector, angulo, modo, gestor_id, creado_por) VALUES (?, ?, ?, ?, ?, ?)')->execute([mb_substr($nombre, 0, 160), $sector, $angulo, $modo, $gestor, $uid]);
  $id = (int)$db->lastInsertId();
  motor_log('campana', 'Campaña creada: ' . $nombre, null, $id);
  icc_json(['ok' => true, 'id' => $id]);
}

if ($accion === 'campana_estado' && $metodo === 'POST') {
  $estado = (string)($body['estado'] ?? '');
  if (!in_array($estado, ['activa', 'pausada', 'terminada'], true)) icc_json(['error' => 'Estado no válido.'], 422);
  $db->prepare('UPDATE motor_campanas SET estado = ? WHERE id = ?')->execute([$estado, (int)($body['id'] ?? 0)]);
  if ($estado === 'terminada') $db->prepare("UPDATE motor_mensajes SET estado = 'descartado' WHERE campana_id = ? AND estado IN ('pendiente','aprobado','borrador')")->execute([(int)$body['id']]);
  motor_log('campana', 'Campaña ' . $estado, null, (int)$body['id']);
  icc_json(['ok' => true]);
}

// ================================================================ MENSAJES
if ($accion === 'mensajes' && $metodo === 'GET') {
  $estado = in_array($_GET['estado'] ?? '', ['pendiente', 'borrador', 'aprobado', 'enviado', 'error'], true) ? $_GET['estado'] : 'pendiente';
  $st = $db->prepare('SELECT m.id, m.paso, m.asunto, m.cuerpo, m.estado, m.angulo, m.ia, m.error, m.created_at, m.enviado_en, l.id lead_id, l.nombre, l.email, l.sector, l.concejo, l.localidad, l.web, c.nombre campana
                      FROM motor_mensajes m JOIN motor_leads l ON l.id = m.lead_id LEFT JOIN motor_campanas c ON c.id = m.campana_id
                      WHERE m.direccion = "salida" AND m.estado = ? ORDER BY m.id ' . ($estado === 'enviado' ? 'DESC' : 'ASC') . ' LIMIT 100');
  $st->execute([$estado]);
  $out = $st->fetchAll();
  foreach ($out as &$m) $m['pie'] = motor_pie(['id' => $m['lead_id'], 'email' => $m['email'], 'nombre' => $m['nombre'], 'sector' => $m['sector']]);
  icc_json(['mensajes' => $out]);
}

if ($accion === 'mensaje' && $metodo === 'POST') {
  $id = (int)($body['id'] ?? 0);
  $acc = (string)($body['accion'] ?? '');
  $st = $db->prepare('SELECT m.*, l.email FROM motor_mensajes m JOIN motor_leads l ON l.id = m.lead_id WHERE m.id = ? AND m.direccion = "salida"');
  $st->execute([$id]);
  $m = $st->fetch();
  if (!$m) icc_json(['error' => 'Correo no encontrado.'], 404);
  if (!in_array($m['estado'], ['pendiente', 'borrador', 'aprobado', 'error'], true)) icc_json(['error' => 'Este correo ya no se puede cambiar.'], 409);
  if ($acc === 'editar' || $acc === 'aprobar') {
    if (isset($body['asunto'])) {
      $asunto = trim((string)$body['asunto']);
      $cuerpo = trim((string)($body['cuerpo'] ?? ''));
      if ($asunto === '' || $cuerpo === '') icc_json(['error' => 'Asunto y texto no pueden quedar vacíos.'], 422);
      $db->prepare('UPDATE motor_mensajes SET asunto = ?, cuerpo = ? WHERE id = ?')->execute([mb_substr($asunto, 0, 255), mb_substr($cuerpo, 0, 8000), $id]);
      // Aprende de la correccion: el agente imitara este estilo.
      if (trim((string)$m['cuerpo']) !== $cuerpo) apr_ejemplo_guardar('motor', 'Borrador del agente: ' . $m['asunto'] . "\n" . $m['cuerpo'], $asunto . "\n" . $cuerpo);
    }
    if ($acc === 'aprobar') {
      if (icc_excluido($m['email'])) icc_json(['error' => 'Esta empresa está en la lista de exclusión.'], 409);
      $db->prepare("UPDATE motor_mensajes SET estado = 'aprobado', aprobado_por = ?, error = NULL WHERE id = ?")->execute([$uid, $id]);
      motor_log('aprobado', 'Correo aprobado por ' . $user['nombre'], (int)$m['lead_id'], $m['campana_id'] ? (int)$m['campana_id'] : null);
    }
    icc_json(['ok' => true]);
  }
  if ($acc === 'descartar') {
    $db->prepare("UPDATE motor_mensajes SET estado = 'descartado' WHERE id = ?")->execute([$id]);
    // La empresa sale de la secuencia.
    $db->prepare('UPDATE motor_leads SET proximo_envio = NULL WHERE id = ?')->execute([$m['lead_id']]);
    icc_json(['ok' => true]);
  }
  if ($acc === 'enviado') {
    // Borrador enviado a mano por la persona desde su propio correo.
    $db->prepare("UPDATE motor_mensajes SET estado = 'enviado', enviado_en = NOW(), aprobado_por = ? WHERE id = ?")->execute([$uid, $id]);
    $sig = MOTOR_CADENCIA[(int)$m['paso'] + 1] ?? null;
    $db->prepare("UPDATE motor_leads SET paso = ?, ultimo_envio = NOW(), estado = 'contactado', proximo_envio = " . ($sig === null ? 'NULL' : 'NOW() + INTERVAL ' . ($sig - MOTOR_CADENCIA[(int)$m['paso']]) . ' DAY') . ' WHERE id = ?')->execute([(int)$m['paso'], $m['lead_id']]);
    icc_json(['ok' => true]);
  }
  icc_json(['error' => 'Acción no válida.'], 422);
}

if ($accion === 'respuestas' && $metodo === 'GET') {
  $r = $db->query("SELECT m.id, m.asunto, m.cuerpo, m.clasificacion, m.ia, m.created_at, l.id lead_id, l.nombre, l.email, l.estado lead_estado, l.cliente_id
                   FROM motor_mensajes m JOIN motor_leads l ON l.id = m.lead_id WHERE m.direccion = 'entrada' ORDER BY m.id DESC LIMIT 100")->fetchAll();
  icc_json(['respuestas' => $r]);
}

if ($accion === 'respuesta' && $metodo === 'POST') {
  $texto = trim((string)($body['texto'] ?? ''));
  if ($texto === '') icc_json(['error' => 'Pega el texto de la respuesta.'], 422);
  $r = motor_procesar_respuesta((int)($body['lead_id'] ?? 0), (string)($body['asunto'] ?? 'Respuesta'), $texto, 'manual', $uid);
  if (!$r['ok']) icc_json(['error' => $r['error']], 404);
  icc_json($r + ['clase_txt' => MOTOR_CLASES[$r['clase']]]);
}

// =================================================================== BAJAS
if ($accion === 'bajas' && $metodo === 'GET') {
  icc_json(['bajas' => $db->query('SELECT * FROM motor_bajas ORDER BY id DESC LIMIT 500')->fetchAll()]);
}
if ($accion === 'baja' && $metodo === 'POST') {
  $tipo = ($body['tipo'] ?? '') === 'dominio' ? 'dominio' : 'email';
  $valor = strtolower(trim((string)($body['valor'] ?? '')));
  if ($tipo === 'email' && !icc_email_normal($valor)) icc_json(['error' => 'Correo no válido.'], 422);
  if ($tipo === 'dominio' && !preg_match('/^[a-z0-9.\-]+\.[a-z]{2,}$/', $valor)) icc_json(['error' => 'Dominio no válido.'], 422);
  icc_baja_anotar($tipo === 'email' ? icc_email_normal($valor) : $valor, $tipo, trim((string)($body['motivo'] ?? 'Añadido a mano')), 'manual');
  icc_json(['ok' => true]);
}
if ($accion === 'baja_quitar' && $metodo === 'POST') {
  if (!$esConfig) icc_json(['error' => 'Solo la administración puede quitar a alguien de la lista de exclusión.'], 403);
  $db->prepare('DELETE FROM motor_bajas WHERE id = ?')->execute([(int)($body['id'] ?? 0)]);
  icc_seg_anota('Exclusión retirada', 'Quitado de la lista de exclusión del Motor (id ' . (int)$body['id'] . ')', $uid);
  icc_json(['ok' => true]);
}

// ================================================================== CONFIG
if ($accion === 'config' && $metodo === 'GET') {
  $cfg = motor_config();
  unset($cfg['smtp']['clave']);
  icc_json($cfg + ['smtp_clave' => (string)icc_ajuste('motor_smtp_clave', '') !== '', 'places_clave' => icc_places_clave() !== '', 'prompt_defecto' => MOTOR_PROMPT, 'es_config' => $esConfig]);
}
if ($accion === 'config' && $metodo === 'PUT') {
  if (!$esConfig) icc_json(['error' => 'Solo la administración cambia los ajustes del Motor.'], 403);
  $ag = (array)($body['agente'] ?? []);
  $prompt = trim((string)($ag['prompt'] ?? ''));
  icc_ajuste_guardar('motor_agente', json_encode(['firma' => mb_substr((string)($ag['firma'] ?? ''), 0, 600), 'tono' => mb_substr((string)($ag['tono'] ?? ''), 0, 120),
    'modelo' => in_array($ag['modelo'] ?? '', ICC_IA_MODELOS, true) ? $ag['modelo'] : '', 'prompt' => $prompt === '' ? MOTOR_PROMPT : mb_substr($prompt, 0, 6000)], JSON_UNESCAPED_UNICODE), false, $uid);
  $seg = function ($v) { return in_array($v, ['ssl', 'starttls', 'ninguna'], true) ? $v : 'starttls'; };
  $s = (array)($body['smtp'] ?? []);
  $email = icc_email_normal((string)($s['email'] ?? '')) ?: '';
  icc_ajuste_guardar('motor_smtp', json_encode(['email' => $email, 'nombre' => mb_substr((string)($s['nombre'] ?? ''), 0, 120), 'host_smtp' => trim((string)($s['host_smtp'] ?? '')),
    'puerto_smtp' => (int)($s['puerto_smtp'] ?? 587) ?: 587, 'seguridad_smtp' => $seg($s['seguridad_smtp'] ?? ''), 'usuario' => trim((string)($s['usuario'] ?? $email))]), false, $uid);
  $i = (array)($body['imap'] ?? []);
  icc_ajuste_guardar('motor_imap', json_encode(['host_imap' => trim((string)($i['host_imap'] ?? '')), 'puerto_imap' => (int)($i['puerto_imap'] ?? 993) ?: 993, 'seguridad_imap' => $seg($i['seguridad_imap'] ?? 'ssl'), 'usuario' => trim((string)($i['usuario'] ?? $email))]), false, $uid);
  if (!empty($body['smtp_clave'])) icc_ajuste_guardar('motor_smtp_clave', (string)$body['smtp_clave'], true, $uid);
  if (!empty($body['places_clave'])) icc_ajuste_guardar('places_clave', trim((string)$body['places_clave']), true, $uid);
  icc_ajuste_guardar('motor_responsable', mb_substr(trim((string)($body['responsable'] ?? '')), 0, 200) ?: 'Integral Connection Consulting', false, $uid);
  icc_ajuste_guardar('motor_limite_dia', (string)max(1, min(500, (int)($body['limite_dia'] ?? 35))), false, $uid);
  $pmin = max(1, min(60, (int)($body['pausa_min'] ?? 4)));
  icc_ajuste_guardar('motor_pausa_min', (string)$pmin, false, $uid);
  icc_ajuste_guardar('motor_pausa_max', (string)max($pmin, min(120, (int)($body['pausa_max'] ?? 9))), false, $uid);
  foreach (['hora_desde' => '09:00', 'hora_hasta' => '19:00'] as $k => $d) {
    $v = (string)($body[$k] ?? $d);
    icc_ajuste_guardar('motor_' . $k, preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $v) ? $v : $d, false, $uid);
  }
  icc_ajuste_guardar('motor_solo_laborables', array_key_exists('solo_laborables', $body) && !$body['solo_laborables'] ? '0' : '1', false, $uid);
  icc_ajuste_guardar('motor_gestor_defecto', (string)(motor_gestor_valido($user, $body['gestor_defecto'] ?? null) ?? ''), false, $uid);
  icc_json(['ok' => true]);
}
if ($accion === 'probar' && $metodo === 'POST') {
  if (!$esConfig) icc_json(['error' => 'Solo la administración.'], 403);
  $que = (string)($body['que'] ?? 'smtp');
  if ($que === 'places') { $r = icc_places_buscar('panadería en Oviedo, Asturias'); icc_json(['ok' => $r['ok'], 'error' => $r['error'] ?? null, 'resultados' => count($r['lugares'] ?? [])]); }
  $c = motor_cuenta();
  if (!$c) icc_json(['ok' => false, 'error' => 'Guarda primero los datos del buzón.']);
  if ($que === 'imap') { $im = motor_config()['imap']; icc_json(icc_imap_probar($im + ['usuario' => $im['usuario'] ?: $c['usuario'], 'clave' => $c['clave']])); }
  icc_json(icc_smtp_probar($c));
}
if ($accion === 'aviso_legal' && $metodo === 'POST') {
  if (!$esConfig) icc_json(['error' => 'Solo la administración.'], 403);
  if (!empty($body['acepto'])) {
    icc_ajuste_guardar('motor_aviso_legal', date('Y-m-d H:i:s') . '|' . $uid . '|' . $user['nombre'], false, $uid);
    icc_seg_anota('Aviso legal del Motor aceptado', 'Habilita el envío autónomo de correos de prospección (LSSI art. 21)', $uid);
  } else {
    icc_ajuste_guardar('motor_aviso_legal', '', false, $uid);
    $db->exec("UPDATE motor_campanas SET modo = 'aprobacion' WHERE modo = 'autonomo'");
    $db->exec("UPDATE motor_mensajes SET estado = 'pendiente' WHERE estado = 'aprobado' AND aprobado_por IS NULL");
  }
  icc_json(['ok' => true]);
}
if ($accion === 'pausa' && $metodo === 'POST') {
  icc_ajuste_guardar('motor_pausado', !empty($body['pausado']) ? '1' : '0', false, $uid);
  motor_log('pausa', !empty($body['pausado']) ? 'Motor en pausa (' . $user['nombre'] . ')' : 'Motor en marcha (' . $user['nombre'] . ')');
  icc_json(['ok' => true]);
}

icc_json(['error' => 'Acción no soportada.'], 400);
