<?php
/**
 * ICC CRM · Latido del panel. Mientras alguien tiene el CRM abierto, el
 * navegador llama aqui cada 5 minutos; si el cron del hosting no ha pasado en
 * ese tiempo, se hace una pasada despues de responder (nadie nota la espera).
 */
require __DIR__ . '/config.php';
require_once __DIR__ . '/cron_lib.php';

icc_require_auth();
icc_require_csrf();
if ($_SERVER['REQUEST_METHOD'] !== 'POST') icc_json(['error' => 'Metodo no soportado.'], 405);
if (ICC_MODO_DEMO || !icc_ajustes_ok()) icc_json(['ok' => true]);

$ultimo = explode('|', (string)icc_ajuste('cron_ultimo', ''))[0];
$toca = $ultimo === '' || strtotime($ultimo) < time() - 300;
if (!$toca) icc_json(['ok' => true]);

// Responder ya y trabajar despues.
if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
ignore_user_abort(true);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
$cuerpo = json_encode(['ok' => true, 'pasada' => true]);
header('Content-Length: ' . strlen($cuerpo));
echo $cuerpo;
if (function_exists('fastcgi_finish_request')) @fastcgi_finish_request(); else { @ob_flush(); flush(); }
icc_cron_ejecutar('panel');
