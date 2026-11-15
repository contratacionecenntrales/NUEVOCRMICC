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
    'resumen' => $l['resumen'] ?? '', 'puntuacion' => isset($l['puntuacion']) && $l['puntuacion'] !== null ? (int)$l['puntuacion'] : null, 'rebotado' => !empty($l['rebotado']),
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
  $feed = $db->query("SELECT g.ts, g.tipo, g.mensaje, g.lead_id, g.campana_id,
      (SELECT m.id FROM motor_mensajes m WHERE m.lead_id = g.lead_id AND m.direccion = 'salida' AND m.estado IN ('pendiente','aprobado','borrador') ORDER BY m.id DESC LIMIT 1) msg_pendiente
    FROM motor_log g ORDER BY g.id DESC LIMIT 40")->fetchAll();
  $buz = array_map(function ($b) { return ['id' => $b['id'], 'email' => $b['email'], 'activo' => !empty($b['activo']), 'perfil' => $b['perfil'] ?? '', 'calentamiento' => !empty($b['calentamiento']),
    'limite' => (int)($b['limite'] ?? 35), 'limite_hoy' => motor_buzon_limite_hoy($b), 'enviados_hoy' => motor_buzon_enviados_hoy((string)$b['email']), 'tiene_clave' => motor_buzon_clave((string)$b['id']) !== '']; }, motor_buzones());
  icc_json([
    'campanas' => $camps, 'contadores' => $cont, 'feed' => $feed,
    'pausado' => $cfg['pausado'], 'limite_dia' => array_sum(array_column(array_filter($buz, function ($b) { return $b['activo']; }), 'limite_hoy')), 'motivo_espera' => motor_puede_enviar_ahora($cfg),
    'buzones' => $buz, 'zonas' => MOTOR_ZONAS,
    'perfiles' => array_map(function ($p) { return ['nombre' => $p['nombre'], 'empresa' => $p['empresa'], 'angulos' => $p['angulos']]; }, MOTOR_PERFILES),
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
  $sectores = array_values(array_filter((array)($body['sectores'] ?? [$body['sector'] ?? '']), function ($s) { return isset(MOTOR_SECTORES[$s]); }));
  $palabra = trim((string)($body['palabra'] ?? ''));
  if (!$sectores && $palabra === '') icc_json(['error' => 'Elige al menos un sector o escribe una palabra clave.'], 422);
  $ubic = array_values(array_unique(array_filter(array_map('trim', (array)($body['ubicaciones'] ?? [])))));
  if (!$ubic) icc_json(['error' => 'Elige al menos una ubicación.'], 422);
  $pag = max(1, min(3, (int)($body['paginas'] ?? 2)));
  $busquedas = max(1, count($sectores)) * count($ubic);
  if ($busquedas > 40) icc_json(['error' => 'Son ' . $busquedas . ' búsquedas: como mucho 40 a la vez (sectores × ubicaciones). Usa el barrido automático para cubrir más.'], 422);
  @set_time_limit(280);
  $tot = ['consultas' => 0, 'vistos' => 0, 'nuevos' => [], 'errores' => []];
  foreach ($sectores ?: [''] as $s) {
    $r = motor_extraer($s, $palabra, $ubic, $uid, $pag);
    $tot['consultas'] += $r['consultas']; $tot['vistos'] += $r['vistos']; $tot['nuevos'] = array_merge($tot['nuevos'], $r['nuevos']); $tot['errores'] = array_merge($tot['errores'], $r['errores']);
    if ($r['errores']) break;
  }
  foreach (array_slice($tot['nuevos'], 0, 5) as $id) motor_analizar($id);
  $tot['errores'] = array_values(array_unique($tot['errores']));
  icc_json($tot + ['analizados_ya' => min(5, count($tot['nuevos']))]);
}

if ($accion === 'webs' && $metodo === 'POST') {
  $lineas = preg_split('/[\s,;]+/', trim((string)($body['lista'] ?? '')));
  $sector = isset(MOTOR_SECTORES[$body['sector'] ?? '']) ? (string)$body['sector'] : '';
  $r = motor_alta_webs($lineas, $sector, $uid);
  @set_time_limit(180);
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
  $perfil = isset(MOTOR_PERFILES[$body['perfil'] ?? '']) ? (string)$body['perfil'] : 'icc';
  $angulo = (string)($body['angulo'] ?? MOTOR_PERFILES[$perfil]['angulos'][0]);
  if (!in_array($angulo, MOTOR_PERFILES[$perfil]['angulos'], true)) $angulo = MOTOR_PERFILES[$perfil]['angulos'][0];
  if ($nombre === '') icc_json(['error' => 'Ponle un nombre a la campaña.'], 422);
  if (!in_array($modo, ['aprobacion', 'borradores', 'autonomo'], true)) icc_json(['error' => 'Modo no válido.'], 422);
  if ($modo === 'autonomo' && (!$esConfig || motor_config()['aviso_legal'] === '')) icc_json(['error' => 'El modo autónomo solo lo activa la administración después de aceptar el aviso legal (LSSI art. 21).'], 403);
  if (!isset(MOTOR_ANGULOS[$angulo])) icc_json(['error' => 'Ángulo no válido.'], 422);
  $sector = isset(MOTOR_SECTORES[$body['sector'] ?? '']) ? (string)$body['sector'] : '';
  $gestor = motor_gestor_valido($user, $body['gestor_id'] ?? null);
  if (!empty($body['id'])) {
    $db->prepare('UPDATE motor_campanas SET nombre = ?, sector = ?, perfil = ?, angulo = ?, modo = ?, gestor_id = ? WHERE id = ?')->execute([mb_substr($nombre, 0, 160), $sector, $perfil, $angulo, $modo, $gestor, (int)$body['id']]);
    icc_json(['ok' => true, 'id' => (int)$body['id']]);
  }
  $db->prepare('INSERT INTO motor_campanas (nombre, sector, perfil, angulo, modo, gestor_id, creado_por) VALUES (?, ?, ?, ?, ?, ?, ?)')->execute([mb_substr($nombre, 0, 160), $sector, $perfil, $angulo, $modo, $gestor, $uid]);
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
  $st = $db->prepare('SELECT m.id, m.paso, m.asunto, m.cuerpo, m.estado, m.angulo, m.ia, m.error, m.created_at, m.enviado_en, l.id lead_id, l.nombre, l.email, l.sector, l.concejo, l.localidad, l.web, l.resumen, c.nombre campana, COALESCE(c.perfil, "icc") perfil, m.buzon
                      FROM motor_mensajes m JOIN motor_leads l ON l.id = m.lead_id LEFT JOIN motor_campanas c ON c.id = m.campana_id
                      WHERE m.direccion = "salida" AND m.estado = ? ORDER BY m.id ' . ($estado === 'enviado' ? 'DESC' : 'ASC') . ' LIMIT 100');
  $st->execute([$estado]);
  $out = $st->fetchAll();
  foreach ($out as &$m) $m['pie'] = motor_pie(['id' => $m['lead_id'], 'email' => $m['email'], 'nombre' => $m['nombre'], 'sector' => $m['sector']], (string)$m['perfil']);
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
      $pf = (string)$db->query('SELECT COALESCE(perfil, "icc") FROM motor_campanas WHERE id = ' . (int)$m['campana_id'])->fetchColumn() ?: 'icc';
      if (trim((string)$m['cuerpo']) !== $cuerpo) apr_ejemplo_guardar('motor_' . $pf, 'Borrador del agente: ' . $m['asunto'] . "\n" . $m['cuerpo'], $asunto . "\n" . $cuerpo);
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
  $perfiles = [];
  foreach (array_keys(MOTOR_PERFILES) as $k) {
    $p = motor_perfil($k);
    $perfiles[$k] = ['nombre' => $p['nombre'], 'empresa' => $p['empresa'], 'firma' => $p['firma'], 'responsable' => $p['responsable'], 'tono' => $p['tono'], 'prompt' => $p['prompt'],
      'palabras' => $p['palabras'], 'modelo' => $p['modelo'], 'angulos' => $p['angulos'], 'pasos' => $p['pasos'], 'prompt_defecto' => MOTOR_PROMPT,
      'ejemplos' => count(function_exists('apr_ejemplos') ? apr_ejemplos('motor_' . $k) : [])];
  }
  $buz = array_map(function ($b) { $b['tiene_clave'] = motor_buzon_clave((string)$b['id']) !== ''; $b['limite_hoy'] = motor_buzon_limite_hoy($b); unset($b['clave']); return $b; }, motor_buzones());
  icc_json(['perfiles' => $perfiles, 'buzones' => $buz, 'scraper' => motor_scraper() + ['prefijos_texto' => implode(', ', motor_scraper()['prefijos'])],
    'pausa_min' => $cfg['pausa_min'], 'pausa_max' => $cfg['pausa_max'], 'hora_desde' => $cfg['hora_desde'], 'hora_hasta' => $cfg['hora_hasta'], 'solo_laborables' => $cfg['solo_laborables'],
    'gestor_defecto' => $cfg['gestor_defecto'], 'aviso_legal' => $cfg['aviso_legal'], 'barrido_perfil' => (string)icc_ajuste('barrido_perfil', 'icc'),
    'places_clave' => icc_places_clave() !== '', 'modelos' => ICC_IA_MODELOS, 'es_config' => $esConfig]);
}
if ($accion === 'config' && $metodo === 'PUT') {
  if (!$esConfig) icc_json(['error' => 'Solo la administración cambia los ajustes del Motor.'], 403);
  // Perfiles del agente de Outreach.
  foreach ((array)($body['perfiles'] ?? []) as $k => $p) {
    if (!isset(MOTOR_PERFILES[$k]) || !is_array($p)) continue;
    $prompt = trim((string)($p['prompt'] ?? ''));
    icc_ajuste_guardar('motor_perfil_' . $k, json_encode(['firma' => mb_substr((string)($p['firma'] ?? ''), 0, 600), 'responsable' => mb_substr(trim((string)($p['responsable'] ?? '')), 0, 200),
      'tono' => mb_substr((string)($p['tono'] ?? ''), 0, 160), 'prompt' => $prompt === '' ? '' : mb_substr($prompt, 0, 8000), 'palabras' => max(40, min(250, (int)($p['palabras'] ?? MOTOR_PERFILES[$k]['palabras']))),
      'modelo' => in_array($p['modelo'] ?? '', ICC_IA_MODELOS, true) ? $p['modelo'] : ''], JSON_UNESCAPED_UNICODE), false, $uid);
  }
  // Buzones de envio (las contrasenas, cifradas y aparte).
  if (isset($body['buzones']) && is_array($body['buzones'])) {
    $seg = function ($v, $d) { return in_array($v, ['ssl', 'starttls', 'ninguna'], true) ? $v : $d; };
    $lista = []; $vistos = [];
    $antes = []; foreach (motor_buzones() as $b) $antes[$b['id']] = $b;
    foreach (array_slice($body['buzones'], 0, 20) as $b) {
      $email = icc_email_normal((string)($b['email'] ?? ''));
      if (!$email || isset($vistos[$email])) continue;
      $vistos[$email] = 1;
      $id = preg_match('/^[a-z0-9_]{1,30}$/', (string)($b['id'] ?? '')) ? (string)$b['id'] : substr(preg_replace('/[^a-z0-9]+/', '_', $email), 0, 30);
      $lista[] = ['id' => $id, 'email' => $email, 'nombre' => mb_substr((string)($b['nombre'] ?? ''), 0, 120), 'host_smtp' => trim((string)($b['host_smtp'] ?? '')), 'puerto_smtp' => (int)($b['puerto_smtp'] ?? 587) ?: 587,
        'seguridad_smtp' => $seg($b['seguridad_smtp'] ?? '', 'starttls'), 'usuario' => trim((string)($b['usuario'] ?? '')) ?: $email, 'host_imap' => trim((string)($b['host_imap'] ?? '')),
        'puerto_imap' => (int)($b['puerto_imap'] ?? 993) ?: 993, 'seguridad_imap' => $seg($b['seguridad_imap'] ?? '', 'ssl'), 'limite' => max(1, min(200, (int)($b['limite'] ?? 35))),
        'calentamiento' => !empty($b['calentamiento']), 'alta' => $antes[$id]['alta'] ?? date('Y-m-d'), 'activo' => !empty($b['activo']),
        'perfil' => isset(MOTOR_PERFILES[$b['perfil'] ?? '']) ? $b['perfil'] : ''];
      if (!empty($b['clave'])) icc_ajuste_guardar('motor_buzon_clave_' . $id, (string)$b['clave'], true, $uid);
      elseif ($id === 'principal' && !isset($antes['principal']['migrado']) && (string)icc_ajuste('motor_buzon_clave_principal', '') === '' && (string)icc_ajuste('motor_smtp_clave', '') !== '')
        icc_ajuste_guardar('motor_buzon_clave_principal', (string)icc_ajuste('motor_smtp_clave', ''), true, $uid);
    }
    icc_ajuste_guardar('motor_buzones', json_encode($lista, JSON_UNESCAPED_UNICODE), false, $uid);
    foreach (array_diff(array_keys($antes), array_column($lista, 'id')) as $quitado) icc_db()->prepare('DELETE FROM ajustes WHERE clave = ?')->execute(['motor_buzon_clave_' . $quitado]);
  }
  // Agente scraper.
  if (isset($body['scraper'])) {
    $sc = (array)$body['scraper'];
    icc_ajuste_guardar('motor_scraper', json_encode(['prefijos' => mb_substr((string)($sc['prefijos'] ?? MOTOR_PREFIJOS), 0, 600), 'cualificar_ia' => !empty($sc['cualificar_ia']), 'puntuacion_min' => max(0, min(100, (int)($sc['puntuacion_min'] ?? 0)))]), false, $uid);
  }
  if (!empty($body['places_clave'])) icc_ajuste_guardar('places_clave', trim((string)$body['places_clave']), true, $uid);
  if (isset($body['pausa_min'])) {
    $pmin = max(1, min(60, (int)$body['pausa_min']));
    icc_ajuste_guardar('motor_pausa_min', (string)$pmin, false, $uid);
    icc_ajuste_guardar('motor_pausa_max', (string)max($pmin, min(120, (int)($body['pausa_max'] ?? 9))), false, $uid);
    foreach (['hora_desde' => '09:00', 'hora_hasta' => '19:00'] as $k => $d) {
      $v = (string)($body[$k] ?? $d);
      icc_ajuste_guardar('motor_' . $k, preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $v) ? $v : $d, false, $uid);
    }
    icc_ajuste_guardar('motor_solo_laborables', !empty($body['solo_laborables']) ? '1' : '0', false, $uid);
    icc_ajuste_guardar('motor_gestor_defecto', (string)(motor_gestor_valido($user, $body['gestor_defecto'] ?? null) ?? ''), false, $uid);
  }
  if (isset(MOTOR_PERFILES[$body['barrido_perfil'] ?? ''])) icc_ajuste_guardar('barrido_perfil', (string)$body['barrido_perfil'], false, $uid);
  icc_json(['ok' => true]);
}
if ($accion === 'probar' && $metodo === 'POST') {
  if (!$esConfig) icc_json(['error' => 'Solo la administración.'], 403);
  $que = (string)($body['que'] ?? 'smtp');
  if ($que === 'places') { $r = icc_places_buscar('panadería en Oviedo, Asturias'); icc_json(['ok' => $r['ok'], 'error' => $r['error'] ?? null, 'resultados' => count($r['lugares'] ?? [])]); }
  $b = null;
  foreach (motor_buzones() as $x) if ($x['id'] === (string)($body['buzon'] ?? '')) $b = $x;
  if (!$b) icc_json(['ok' => false, 'error' => 'Guarda primero el buzón.']);
  $c = motor_buzon_cuenta($b);
  if ($c['clave'] === '') icc_json(['ok' => false, 'error' => 'Falta la contraseña de ' . $b['email'] . '.']);
  $s = icc_smtp_probar($c);
  $i = !empty($b['host_imap']) ? icc_imap_probar($c) : ['ok' => true, 'omitido' => true];
  icc_json(['ok' => $s['ok'] && $i['ok'], 'smtp' => $s, 'imap' => $i]);
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
