<?php
/**
 * ICC CRM · Puesta en marcha de la capa de IA (coordinacion, admin y super admin).
 *
 * GET  ?action=estado         lista de comprobacion en directo + piloto automatico
 * POST ?action=piloto {encender}
 * POST ?action=aprender       ciclo de aprendizaje ahora
 */
require __DIR__ . '/config.php';
require_once __DIR__ . '/aprendizaje_lib.php';
require_once __DIR__ . '/flujos_lib.php';
require_once __DIR__ . '/saneo_lib.php';

$user = icc_require_auth();
if (!icc_ve_config_ia($user)) icc_json(['error' => 'No encontrado'], 404);
$metodo = $_SERVER['REQUEST_METHOD'];
$accion = (string)($_GET['action'] ?? 'estado');
if ($metodo !== 'GET') icc_require_csrf();
$body = $metodo === 'GET' ? [] : icc_body();

if ($accion === 'estado' && $metodo === 'GET') {
  $l = apr_checklist();
  $n = ['ok' => 0, 'aviso' => 0, 'falta' => 0];
  foreach ($l as $x) $n[$x['estado']]++;
  icc_json(['lista' => $l, 'resumen' => $n, 'piloto' => (string)icc_ajuste('piloto_automatico', '0') === '1', 'aviso_legal' => motor_config()['aviso_legal'] !== '',
    'flujos_piloto' => array_map(function ($k) { return fl_plantillas()[$k][0]; }, APR_FLUJOS_PILOTO),
    'memoria' => icc_db()->query("SELECT tipo, texto, evidencia, confianza, created_at FROM equipo_memoria WHERE activo = 1 AND tipo IN ('aprendizaje','aviso','regla') ORDER BY id DESC LIMIT 8")->fetchAll(),
    'ejemplos' => ['motor' => count(apr_ejemplos('motor'))], 'aprendizaje_ultimo' => (string)icc_ajuste('aprendizaje_ultimo', '')]);
}
if ($accion === 'piloto' && $metodo === 'POST') {
  icc_json(['ok' => true, 'hecho' => apr_piloto(!empty($body['encender']), (int)$user['id'])]);
}
if ($accion === 'aprender' && $metodo === 'POST') {
  icc_json(['ok' => true, 'texto' => apr_ciclo()]);
}
icc_json(['error' => 'Acción no soportada.'], 400);
