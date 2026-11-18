<?php
/**
 * ICC CRM · Plan del día de backoffice (supervisión). Backoffice ve el suyo; dirección y jefes de
 * equipo, el de cualquier persona de backoffice. Los ajustes, coordinación y admin.
 *
 * GET  ?action=ver[&usuario=ID][&fecha=AAAA-MM-DD]
 * POST ?action=rehacer {usuario?} · hecha {id} (tarea) · PUT ?action=config {activo, correo, carga_max}
 */
require __DIR__ . '/config.php';
require_once __DIR__ . '/supervision_lib.php';

$user = icc_require_auth();
$esBack = $user['rol'] === 'backoffice';
$esDir = icc_ve_ia_equipo($user);
if (!$esBack && !$esDir) icc_json(['error' => 'No encontrado'], 404);
$metodo = $_SERVER['REQUEST_METHOD'];
$accion = (string)($_GET['action'] ?? 'ver');
if ($metodo !== 'GET') icc_require_csrf();
$body = $metodo === 'GET' ? [] : icc_body();
$db = icc_db();
$uid = (int)$user['id'];
$cfg = sv_config();
$pedido = (int)($_GET['usuario'] ?? ($body['usuario'] ?? 0));
$quien = $esBack ? $uid : ($pedido ?: (int)$cfg['usuario_id']);
if (!$esBack && $quien) {
  $st = $db->prepare("SELECT 1 FROM usuarios WHERE id = ? AND rol = 'backoffice'");
  $st->execute([$quien]);
  if (!$st->fetchColumn()) icc_json(['error' => 'Elige una persona de backoffice.'], 422);
}

if ($accion === 'ver' && $metodo === 'GET') {
  $fecha = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)($_GET['fecha'] ?? '')) ? $_GET['fecha'] : null;
  $plan = $quien ? sv_ver($quien, $fecha) : null;
  if ($plan && $esBack && !$plan['leido_at']) $db->prepare('UPDATE plan_diario SET leido_at = NOW() WHERE usuario_id = ? AND fecha = ?')->execute([$uid, $plan['fecha']]);
  $back = $db->query("SELECT id, CONCAT(nombre, ' ', COALESCE(apellidos, '')) nombre FROM usuarios WHERE rol = 'backoffice' AND bloqueado = 0 ORDER BY nombre")->fetchAll();
  $dias = $quien ? $db->query('SELECT fecha FROM plan_diario WHERE usuario_id = ' . (int)$quien . ' ORDER BY fecha DESC LIMIT 10')->fetchAll(PDO::FETCH_COLUMN) : [];
  $nombre = $quien ? (string)$db->query('SELECT nombre FROM usuarios WHERE id = ' . (int)$quien)->fetchColumn() : '';
  icc_json(['plan' => $plan, 'usuario' => $quien, 'nombre' => $nombre, 'backoffice' => $back, 'dias' => $dias, 'tipos' => SV_TIPOS, 'config' => $cfg,
    'es_back' => $esBack, 'es_dir' => $esDir, 'es_config' => icc_ve_config_ia($user), 'marcador' => $quien ? rl_marcador($quien) : null]);
}
if ($accion === 'rehacer' && $metodo === 'POST') {
  if (!$quien) icc_json(['error' => 'No hay nadie de backoffice.'], 422);
  @set_time_limit(200);
  $existe = (int)$db->query('SELECT COUNT(*) FROM plan_diario WHERE usuario_id = ' . (int)$quien . " AND fecha = '" . icc_madrid()->format('Y-m-d') . "'")->fetchColumn();
  icc_json(['ok' => true, 'texto' => sv_plan($quien, $existe > 0)]);
}
if ($accion === 'hecha' && $metodo === 'POST') {
  $id = (int)($body['id'] ?? 0);
  $st = $db->prepare('SELECT asignado_usuario FROM equipo_tareas WHERE id = ?');
  $st->execute([$id]);
  $dueno = $st->fetchColumn();
  if ($dueno === false || ($esBack && (int)$dueno !== $uid)) icc_json(['error' => 'No encontrada.'], 404);
  $db->prepare("UPDATE equipo_tareas SET estado = 'hecha', cerrada_en = NOW() WHERE id = ? AND estado = 'abierta'")->execute([$id]);
  icc_json(['ok' => true]);
}
if ($accion === 'config' && $metodo === 'PUT') {
  if (!icc_ve_config_ia($user)) icc_json(['error' => 'Solo la administración cambia estos ajustes.'], 403);
  icc_ajuste_guardar('supervision_activo', !empty($body['activo']) ? '1' : '0', false, $uid);
  icc_ajuste_guardar('supervision_correo', !empty($body['correo']) ? '1' : '0', false, $uid);
  icc_ajuste_guardar('supervision_carga_max', (string)max(10, min(100, (int)($body['carga_max'] ?? 35))), false, $uid);
  icc_json(['ok' => true]);
}
icc_json(['error' => 'Acción no soportada.'], 400);
