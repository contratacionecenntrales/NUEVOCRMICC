<?php
/**
 * ICC CRM · Jarvis. Todas las personas con sesion.
 *
 * GET  ?action=estado                       nombre, IA, voz
 * POST ?action=chat {mensaje, historial[], pantalla, voz}
 * POST ?action=confirmar {token, decision: confirmar|descartar}
 * POST ?action=transcribir (multipart: audio)  voz a texto (max 30 s / 4 MB)
 * POST ?action=hablar {texto}               texto a voz (mp3)
 * GET|PUT ?action=config                    solo coordinacion, admin y super admin
 */
require __DIR__ . '/config.php';
require_once __DIR__ . '/jarvis_lib.php';
if (is_file(__DIR__ . '/saneo_lib.php')) require_once __DIR__ . '/saneo_lib.php';

$user = icc_require_auth();
$metodo = $_SERVER['REQUEST_METHOD'];
$accion = (string)($_GET['action'] ?? 'estado');
if ($metodo !== 'GET') icc_require_csrf();
$uid = (int)$user['id'];
$cfg = jv_config();

if ($accion === 'estado' && $metodo === 'GET') {
  icc_json(['nombre' => $cfg['nombre'], 'activo' => $cfg['activo'], 'ia' => icc_ia_disponible(), 'voz' => icc_ia_config()['voz'], 'es_config' => icc_ve_config_ia($user)]);
}
if (!$cfg['activo'] && $accion !== 'config') icc_json(['error' => 'El asistente está apagado.'], 409);

if ($accion === 'chat' && $metodo === 'POST') {
  $b = icc_body();
  $msg = trim((string)($b['mensaje'] ?? ''));
  if ($msg === '') icc_json(['error' => 'Escribe o di algo.'], 422);
  @set_time_limit(120);
  icc_json(jv_chat($user, (array)($b['historial'] ?? []), $msg, (string)($b['pantalla'] ?? ''), !empty($b['voz']) ? 'voz' : 'texto'));
}

if ($accion === 'confirmar' && $metodo === 'POST') {
  $b = icc_body();
  try {
    $p = jv_abrir((string)($b['token'] ?? ''), $uid);
    $ins = icc_db()->prepare('INSERT IGNORE INTO jarvis_usadas (nonce, usuario_id, resultado) VALUES (?, ?, ?)');
    $ins->execute([$p['n'], $uid, ($b['decision'] ?? '') === 'descartar' ? 'descartada' : 'confirmada']);
    if (!$ins->rowCount()) throw new RuntimeException('Esta propuesta ya se confirmó o se descartó.');
    if (($b['decision'] ?? '') === 'descartar') icc_json(['ok' => true, 'texto' => 'Descartado.']);
    $r = jv_aplicar($user, (string)$p['t'], (array)$p['a']);
    icc_json(['ok' => true] + $r);
  } catch (Throwable $e) {
    icc_json(['error' => $e->getMessage()], 409);
  }
}

if ($accion === 'transcribir' && $metodo === 'POST') {
  $f = $_FILES['audio'] ?? null;
  if (!$f || ($f['error'] ?? 1) !== UPLOAD_ERR_OK) icc_json(['error' => 'No ha llegado el audio.'], 422);
  if ($f['size'] > 4 * 1024 * 1024) icc_json(['error' => 'El audio es demasiado largo.'], 413);
  $mime = in_array($f['type'], ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-wav'], true) ? $f['type'] : 'audio/webm';
  $ext = ['audio/webm' => 'webm', 'audio/ogg' => 'ogg', 'audio/mp4' => 'mp4', 'audio/mpeg' => 'mp3', 'audio/wav' => 'wav', 'audio/x-wav' => 'wav'][$mime];
  $r = icc_ia_transcribir($f['tmp_name'], 'voz.' . $ext, $mime, ['usuario_id' => $uid]);
  if (!$r['ok']) icc_json(['error' => $r['error']], !empty($r['sin_ia']) ? 501 : 502);
  icc_json(['texto' => $r['texto']]);
}

if ($accion === 'hablar' && $metodo === 'POST') {
  $b = icc_body();
  $r = icc_ia_hablar(trim((string)($b['texto'] ?? '')), ['usuario_id' => $uid]);
  if (!$r['ok']) icc_json(['error' => $r['error']], !empty($r['sin_ia']) ? 501 : 502);
  header('Content-Type: audio/mpeg');
  header('Cache-Control: no-store');
  header('Content-Length: ' . strlen($r['audio']));
  echo $r['audio'];
  exit;
}

if ($accion === 'config') {
  if (!icc_ve_config_ia($user)) icc_json(['error' => 'No encontrado'], 404);
  if ($metodo === 'GET') {
    $uso = icc_db()->query("SELECT COUNT(*) consultas, SUM(tipo = 'voz') voz, COUNT(DISTINCT usuario_id) personas FROM jarvis_registro WHERE ts >= NOW() - INTERVAL 30 DAY")->fetch();
    icc_json($cfg + ['uso_30_dias' => $uso]);
  }
  if ($metodo === 'PUT') {
    icc_require_csrf();
    $b = icc_body();
    $nombre = trim((string)($b['nombre'] ?? 'Jarvis'));
    icc_ajuste_guardar('jarvis_nombre', mb_substr($nombre !== '' ? $nombre : 'Jarvis', 0, 30), false, $uid);
    icc_ajuste_guardar('jarvis_activo', !empty($b['activo']) ? '1' : '0', false, $uid);
    icc_json(['ok' => true]);
  }
}

icc_json(['error' => 'Acción no soportada.'], 400);
