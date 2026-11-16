<?php
/**
 * ICC CRM · Webhook de WhatsApp (API oficial de Meta) para la Zona de entrevistas.
 * GET: verificacion (hub.mode, hub.verify_token, hub.challenge).
 * POST: mensajes y estados; firma X-Hub-Signature-256 con el App Secret (obligatoria).
 */
require __DIR__ . '/config.php';
require_once __DIR__ . '/rrhh_lib.php';

header('Cache-Control: no-store');
header('X-Robots-Tag: noindex');
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
  $ok = ($_GET['hub_mode'] ?? '') === 'subscribe' && hash_equals(rr_verify_token(), (string)($_GET['hub_verify_token'] ?? ''));
  http_response_code($ok ? 200 : 403);
  header('Content-Type: text/plain; charset=utf-8');
  echo $ok ? preg_replace('/[^0-9A-Za-z_-]/', '', (string)($_GET['hub_challenge'] ?? '')) : 'No autorizado';
  exit;
}
header('Content-Type: application/json; charset=utf-8');
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); echo '{"error":"Metodo no permitido"}'; exit; }
$raw = (string)file_get_contents('php://input', false, null, 0, 1024 * 1024);
$secreto = icc_descifrar((string)icc_ajuste('rrhh_wa_app_secret', ''));
$firma = (string)($_SERVER['HTTP_X_HUB_SIGNATURE_256'] ?? '');
if (!$secreto || !hash_equals('sha256=' . hash_hmac('sha256', $raw, $secreto), $firma)) { http_response_code(401); echo '{"error":"Firma no valida"}'; exit; }
$p = json_decode($raw, true);
if (!is_array($p)) { http_response_code(400); echo '{"error":"JSON no valido"}'; exit; }
$hechos = 0;
try {
  foreach ((array)($p['entry'] ?? []) as $entry) foreach ((array)($entry['changes'] ?? []) as $ch) {
    $v = (array)($ch['value'] ?? []);
    $phoneId = (string)($v['metadata']['phone_number_id'] ?? '');
    $nombres = [];
    foreach ((array)($v['contacts'] ?? []) as $c) $nombres[(string)($c['wa_id'] ?? '')] = (string)($c['profile']['name'] ?? '');
    foreach ((array)($v['messages'] ?? []) as $m) {
      $tipo = (string)($m['type'] ?? '');
      $texto = $tipo === 'text' ? (string)($m['text']['body'] ?? '') : ($tipo === 'button' ? (string)($m['button']['text'] ?? '') : ($tipo === 'interactive' ? (string)($m['interactive']['button_reply']['title'] ?? $m['interactive']['list_reply']['title'] ?? '') : ''));
      if ($texto === '') $texto = '[' . ($tipo ?: 'mensaje') . ' recibido: por ahora solo leemos texto]';
      rr_entrante($phoneId, (string)($m['from'] ?? ''), $nombres[(string)($m['from'] ?? '')] ?? '', $texto, (string)($m['id'] ?? ''));
      $hechos++;
    }
    foreach ((array)($v['statuses'] ?? []) as $s) {
      $estado = in_array($s['status'] ?? '', ['sent', 'delivered', 'read', 'failed'], true) ? ['sent' => 'enviado', 'delivered' => 'entregado', 'read' => 'leido', 'failed' => 'fallido'][$s['status']] : null;
      if ($estado && !empty($s['id'])) icc_db()->prepare("UPDATE rrhh_mensajes SET estado = ?, error = ? WHERE wa_id = ? AND direccion = 'salida' AND estado <> 'en_espera'")
        ->execute([$estado, $estado === 'fallido' ? mb_substr((string)($s['errors'][0]['title'] ?? 'Error de WhatsApp'), 0, 255) : null, (string)$s['id']]);
    }
  }
} catch (Throwable $e) { error_log('rrhh_webhook: ' . $e->getMessage()); }
echo json_encode(['ok' => true, 'mensajes' => $hechos]);
