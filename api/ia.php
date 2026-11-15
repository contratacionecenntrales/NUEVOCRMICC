<?php
/**
 * ICC CRM · Ajustes de inteligencia artificial y del cron (solo coordinacion,
 * admin y super admin). La clave nunca vuelve al navegador.
 *
 * GET    ?action=estado            estado de la clave, ajustes, consumo, ultimas consultas y acciones, cron
 * POST   ?action=clave {clave}     guarda la clave de OpenAI cifrada (manda sobre la del archivo)
 * DELETE ?action=clave             borra la clave del panel
 * POST   ?action=probar            prueba la conexion con una consulta minima
 * PUT    ?action=config {activa, modelo, esfuerzo, limite_dia, voz}
 * POST   ?action=cron_regenerar    nuevo token del cron (si no esta fijado en el archivo)
 * POST   ?action=cron_ejecutar     pasada del cron ahora, sin esperar a los intervalos
 */
require __DIR__ . '/config.php';
require_once __DIR__ . '/cron_lib.php';

$user = icc_require_auth();
if (!icc_ve_config_ia($user)) icc_json(['error' => 'No encontrado'], 404);
if (!icc_ajustes_ok()) icc_json(['error' => 'Falta importar la base de datos completa (tablas de IA).'], 500);
$metodo = $_SERVER['REQUEST_METHOD'];
$accion = (string)($_GET['action'] ?? 'estado');
if ($metodo !== 'GET') icc_require_csrf();
$body = $metodo === 'GET' ? [] : icc_body();
$db = icc_db();
$uid = (int)$user['id'];

function ia_url_cron(): string {
  $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
  $host = preg_replace('/[^a-z0-9.\-:]/i', '', (string)($_SERVER['HTTP_HOST'] ?? 'tu-dominio'));
  $dir = rtrim(str_replace('\\', '/', dirname((string)($_SERVER['SCRIPT_NAME'] ?? '/api/ia.php'))), '/');
  return ($https ? 'https' : 'http') . '://' . $host . $dir . '/cron.php?token=' . rawurlencode(icc_cron_token());
}

if ($accion === 'estado' && $metodo === 'GET') {
  $clave = icc_openai_clave();
  $uso = $db->query("SELECT COUNT(*) consultas, COALESCE(SUM(ok = 0), 0) fallos, COALESCE(SUM(tokens_entrada), 0) entrada, COALESCE(SUM(tokens_salida), 0) salida
                     FROM ia_registro WHERE ts >= CURDATE()")->fetch();
  $mes = $db->query("SELECT tipo, COUNT(*) n, COALESCE(SUM(tokens_entrada), 0) entrada, COALESCE(SUM(tokens_salida), 0) salida
                     FROM ia_registro WHERE ts >= NOW() - INTERVAL 30 DAY GROUP BY tipo ORDER BY n DESC")->fetchAll();
  $recientes = $db->query("SELECT r.ts, r.tipo, r.modelo, r.tokens_entrada, r.tokens_salida, r.ms, r.ok, r.error, u.nombre usuario
                           FROM ia_registro r LEFT JOIN usuarios u ON u.id = r.usuario_id ORDER BY r.id DESC LIMIT 25")->fetchAll();
  $acciones = $db->query("SELECT a.id, a.ts, a.origen, a.agente, a.entidad, a.entidad_id, a.accion, a.detalle, a.deshecha_en, u.nombre usuario
                          FROM ia_acciones a LEFT JOIN usuarios u ON u.id = a.usuario_id ORDER BY a.id DESC LIMIT 25")->fetchAll();
  $cronUlt = explode('|', (string)icc_ajuste('cron_ultimo', ''));
  $bloques = [];
  foreach (icc_cron_bloques() as $nombre => [$cada]) {
    $st = $db->prepare('SELECT ts, ok, ms, mensaje, origen FROM cron_registro WHERE bloque = ? ORDER BY id DESC LIMIT 1');
    $st->execute([$nombre]);
    $bloques[] = ['nombre' => $nombre, 'cada_min' => $cada, 'ultimo' => $st->fetch() ?: null];
  }
  $cronRegistro = $db->query('SELECT ts, origen, bloque, ok, ms, mensaje FROM cron_registro ORDER BY id DESC LIMIT 20')->fetchAll();
  $cfg = icc_ia_config();
  icc_json([
    'clave' => [
      'origen' => icc_openai_origen_clave(),
      // Solo el final, para reconocerla; nunca la clave entera.
      'final' => $clave !== '' ? '…' . substr($clave, -4) : '',
    ],
    'disponible' => icc_ia_disponible(),
    'demo' => (bool)ICC_MODO_DEMO,
    'proveedor' => 'OpenAI',
    'config' => $cfg,
    'modelos' => ICC_IA_MODELOS,
    'voces' => ICC_IA_VOCES,
    'uso_hoy' => $uso,
    'uso_30_dias' => $mes,
    'recientes' => $recientes,
    'acciones' => $acciones,
    'cron' => [
      'url' => ia_url_cron(),
      'token_en_archivo' => defined('ICC_CRON_TOKEN') && ICC_CRON_TOKEN !== '',
      'ultimo' => $cronUlt[0] !== '' ? $cronUlt[0] : null,
      'ultimo_origen' => $cronUlt[1] ?? null,
      'funciona' => $cronUlt[0] !== '' && strtotime($cronUlt[0]) > time() - 900,
      'bloques' => $bloques,
      'registro' => $cronRegistro,
    ],
  ]);
}

if ($accion === 'clave' && $metodo === 'POST') {
  $clave = trim((string)($body['clave'] ?? ''));
  if (!preg_match('/^sk-[A-Za-z0-9_\-]{20,300}$/', $clave)) icc_json(['error' => 'Eso no parece una clave de OpenAI (empieza por «sk-»).'], 422);
  icc_ajuste_guardar('openai_clave', $clave, true, $uid);
  icc_seg_anota('Clave de IA guardada', 'Clave de OpenAI guardada (cifrada) desde el panel, terminada en ' . substr($clave, -4), $uid);
  icc_json(['ok' => true]);
}

if ($accion === 'clave' && $metodo === 'DELETE') {
  icc_db()->prepare('DELETE FROM ajustes WHERE clave = ?')->execute(['openai_clave']);
  $GLOBALS['icc_ajustes_cache']['openai_clave'] = null;
  icc_seg_anota('Clave de IA borrada', 'Clave de OpenAI del panel borrada', $uid);
  icc_json(['ok' => true, 'origen' => icc_openai_origen_clave()]);
}

if ($accion === 'probar' && $metodo === 'POST') {
  if (ICC_MODO_DEMO) icc_json(['ok' => false, 'error' => 'En modo demostración la IA está desactivada.']);
  if (icc_openai_clave() === '') icc_json(['ok' => false, 'error' => 'Todavía no hay clave de OpenAI.']);
  if (icc_openai_base() === null) icc_json(['ok' => false, 'error' => 'La dirección configurada no es la de OpenAI: el CRM solo permite OpenAI.']);
  if (!icc_ia_config()['activa']) icc_json(['ok' => false, 'error' => 'La IA está apagada. Enciéndela para probar.']);
  $r = icc_ia_chat([
    ['role' => 'system', 'content' => 'Responde solo con la palabra OK.'],
    ['role' => 'user', 'content' => 'Prueba de conexión del CRM.'],
  ], ['tipo' => 'prueba', 'usuario_id' => $uid, 'esfuerzo' => 'minimal', 'max_tokens' => 400, 'timeout' => 30, 'sin_limite' => true]);
  if (!$r['ok']) icc_json(['ok' => false, 'error' => $r['error']]);
  icc_json(['ok' => true, 'ms' => $r['ms'], 'respuesta' => mb_substr(trim($r['contenido']), 0, 40), 'modelo' => icc_ia_config()['modelo']]);
}

if ($accion === 'config' && $metodo === 'PUT') {
  $modelo = (string)($body['modelo'] ?? '');
  $esfuerzo = (string)($body['esfuerzo'] ?? '');
  $voz = (string)($body['voz'] ?? '');
  $limite = (int)($body['limite_dia'] ?? 0);
  if (!in_array($modelo, ICC_IA_MODELOS, true)) icc_json(['error' => 'Modelo no admitido.'], 422);
  if (!in_array($esfuerzo, ['minimal', 'low', 'medium'], true)) icc_json(['error' => 'Nivel de razonamiento no admitido.'], 422);
  if (!in_array($voz, ICC_IA_VOCES, true)) icc_json(['error' => 'Voz no admitida.'], 422);
  if ($limite < 1 || $limite > 5000) icc_json(['error' => 'El límite diario debe estar entre 1 y 5000 consultas por persona.'], 422);
  $antes = icc_ia_config();
  icc_ajuste_guardar('ia_activa', !empty($body['activa']) ? '1' : '0', false, $uid);
  icc_ajuste_guardar('ia_modelo', $modelo, false, $uid);
  icc_ajuste_guardar('ia_esfuerzo', $esfuerzo, false, $uid);
  icc_ajuste_guardar('ia_limite_dia', (string)$limite, false, $uid);
  icc_ajuste_guardar('ia_voz', $voz, false, $uid);
  if ($antes['activa'] !== !empty($body['activa'])) icc_seg_anota(!empty($body['activa']) ? 'IA encendida' : 'IA apagada', 'Desde el panel de inteligencia artificial', $uid);
  icc_json(['ok' => true]);
}

if ($accion === 'cron_regenerar' && $metodo === 'POST') {
  if (defined('ICC_CRON_TOKEN') && ICC_CRON_TOKEN !== '') icc_json(['error' => 'El token está fijado en el archivo de configuración del servidor; cámbialo allí.'], 409);
  icc_ajuste_guardar('cron_token', bin2hex(random_bytes(24)), true, $uid);
  icc_seg_anota('Token del cron regenerado', 'Hay que actualizar la tarea programada del hosting', $uid);
  icc_json(['ok' => true]);
}

if ($accion === 'cron_ejecutar' && $metodo === 'POST') {
  icc_json(['ok' => true, 'bloques' => icc_cron_ejecutar('manual', true)]);
}

icc_json(['error' => 'Acción no soportada.'], 400);
