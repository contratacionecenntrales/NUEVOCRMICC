<?php
/**
 * ICC CRM · Cron unico. Programa en Plesk (Herramientas y Configuracion >
 * Tareas programadas > Buscar una URL) cada 5 minutos:
 *   https://TU-DOMINIO/api/cron.php?token=EL_TOKEN_DEL_PANEL
 * El token se ve (y se regenera) en «Inteligencia artificial > Cron».
 */
require __DIR__ . '/config.php';
require_once __DIR__ . '/cron_lib.php';

header('Cache-Control: no-store');
if (icc_seg_bloqueo('ip', icc_ip())) icc_json(['error' => 'No autorizado.'], 403);
$token = (string)($_GET['token'] ?? '');
$esperado = icc_ajustes_ok() ? icc_cron_token() : '';
if ($esperado === '' || $token === '' || !hash_equals($esperado, $token)) {
  icc_seg_fallo('cron', null, 'cron_token', 'Token del cron incorrecto');
  icc_seg_freno('cron');
  icc_json(['error' => 'No autorizado.'], 403);
}
icc_json(['ok' => true, 'bloques' => icc_cron_ejecutar('cron')]);
