<?php
/**
 * ICC CRM · Webhook del agente de voz (Vapi). Publico, protegido por secreto:
 * cabecera X-Vapi-Secret (o ?t=SECRETO en la URL del servidor de Vapi).
 * Recibe «status-update» y «end-of-call-report»; el resto se ignora.
 */
require __DIR__ . '/config.php';
require_once __DIR__ . '/voz_lib.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex');
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); echo '{"error":"Solo POST"}'; exit; }
$secreto = (string)icc_ajuste('voz_secreto', '');
$dado = (string)($_SERVER['HTTP_X_VAPI_SECRET'] ?? ($_GET['t'] ?? ''));
if ($secreto === '' || !hash_equals($secreto, $dado)) { http_response_code(401); echo '{"error":"No autorizado"}'; exit; }
$raw = file_get_contents('php://input', false, null, 0, 2 * 1024 * 1024);
$p = json_decode((string)$raw, true);
if (!is_array($p)) { http_response_code(400); echo '{"error":"JSON no valido"}'; exit; }
try { $r = voz_webhook($p); }
catch (Throwable $e) { error_log('voz_webhook: ' . $e->getMessage()); http_response_code(500); echo '{"error":"Error interno"}'; exit; }
echo json_encode(['ok' => true, 'resultado' => $r], JSON_UNESCAPED_UNICODE);
