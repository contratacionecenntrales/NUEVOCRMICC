<?php
/**
 * ICC CRM · Retorno (lo que firma y ahorra). Direccion lo ve todo; los jefes de
 * equipo, su equipo. «Optimizar ahora» (el CRO), coordinacion y admin.
 *
 * GET  ?action=panel[&dias=90]
 * POST ?action=optimizar
 */
require __DIR__ . '/config.php';
require_once __DIR__ . '/retorno_lib.php';
require_once __DIR__ . '/flujos_lib.php';

$user = icc_require_auth();
if (!icc_ve_ia_equipo($user)) icc_json(['error' => 'No encontrado'], 404);
$metodo = $_SERVER['REQUEST_METHOD'];
$accion = (string)($_GET['action'] ?? 'panel');
if ($metodo !== 'GET') icc_require_csrf();
$visibles = icc_equipo_comercial_ids($user);

if ($accion === 'panel' && $metodo === 'GET') {
  $p = rt_panel((int)($_GET['dias'] ?? 90), $visibles);
  $cro = icc_db()->query("SELECT inicio, resumen FROM equipo_turnos WHERE agente = 'cro' ORDER BY id DESC LIMIT 1")->fetch() ?: null;
  icc_json($p + ['recomendaciones' => rt_recomendaciones($p), 'cro' => $cro, 'es_config' => icc_ve_config_ia($user), 'equipo' => $visibles !== null]);
}
if ($accion === 'optimizar' && $metodo === 'POST') {
  if (!icc_ve_config_ia($user)) icc_json(['error' => 'Solo coordinación y administración.'], 403);
  icc_json(['ok' => true, 'texto' => rt_optimizar('cro')]);
}
icc_json(['error' => 'Acción no soportada.'], 400);
