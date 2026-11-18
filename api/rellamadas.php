<?php
/**
 * ICC CRM · Rellamadas de presupuestos. Backoffice ve y marca las suyas;
 * direccion y jefes de equipo las ven todas. Los ajustes, coordinacion y admin.
 *
 * GET  ?action=lista[&usuario=]             pendientes, resultados recientes, numeros y ajustes
 * POST ?action=resultado {id, estado, motivo?, fecha?}
 * POST ?action=asignar                      rellamadas de hoy ahora (mas trabajo)
 * PUT  ?action=config {usuario_id, max_dia, dias, activo, objetivo, objetivo_aceptados, presion}
 */
require __DIR__ . '/config.php';
require_once __DIR__ . '/rellamadas_lib.php';

$user = icc_require_auth();
$esBack = $user['rol'] === 'backoffice';
$esDir = icc_ve_ia_equipo($user);
if (!$esBack && !$esDir) icc_json(['error' => 'No encontrado'], 404);
$metodo = $_SERVER['REQUEST_METHOD'];
$accion = (string)($_GET['action'] ?? 'lista');
if ($metodo !== 'GET') icc_require_csrf();
$body = $metodo === 'GET' ? [] : icc_body();
$db = icc_db();
$uid = (int)$user['id'];
$cfg = rl_config();
// Backoffice solo ve lo suyo; direccion elige (por defecto, la persona configurada).
$quien = $esBack ? $uid : ((int)($_GET['usuario'] ?? 0) ?: (int)$cfg['usuario_id']);

if ($accion === 'lista' && $metodo === 'GET') {
  $sel = "SELECT r.*, c.razon_social, c.contacto_nombre, c.decisor_nombre, c.contacto_telefono, c.telefono, c.valor_estimado, c.estado fase, p.sector, p.estado pestado,
            CONCAT(g.nombre, ' ', COALESCE(g.apellidos, '')) gestor, ci.hora_inicio
          FROM rellamadas r JOIN clientes c ON c.id = r.cliente_id LEFT JOIN presupuestos p ON p.id = r.presupuesto_id LEFT JOIN usuarios g ON g.id = c.comercial_id LEFT JOIN citas ci ON ci.id = r.cita_id WHERE r.usuario_id = ?";
  $st = $db->prepare($sel . " AND r.estado = 'pendiente' ORDER BY r.fecha, ci.hora_inicio");
  $st->execute([$quien]);
  $pend = $st->fetchAll();
  $st = $db->prepare($sel . " AND r.estado <> 'pendiente' AND r.resuelta_en >= NOW() - INTERVAL 14 DAY ORDER BY r.resuelta_en DESC LIMIT 60");
  $st->execute([$quien]);
  $hechas = $st->fetchAll();
  $back = $db->query("SELECT id, CONCAT(nombre, ' ', COALESCE(apellidos, '')) nombre FROM usuarios WHERE rol = 'backoffice' AND bloqueado = 0 ORDER BY nombre")->fetchAll();
  $yo = $quien ? (string)$db->query('SELECT nombre FROM usuarios WHERE id = ' . (int)$quien)->fetchColumn() : '';
  icc_json(['pendientes' => $pend, 'hechas' => $hechas, 'numeros' => $quien ? rl_numeros($quien) : null, 'marcador' => $quien ? rl_marcador($quien) : null, 'nombre' => $yo, 'candidatas' => count(rl_candidatos()), 'resultados' => RL_RESULTADOS,
    'config' => $cfg, 'usuario' => $quien, 'backoffice' => $back, 'es_back' => $esBack, 'es_dir' => $esDir, 'es_config' => icc_ve_config_ia($user)]);
}

if ($accion === 'resultado' && $metodo === 'POST') {
  $id = (int)($body['id'] ?? 0);
  $st = $db->prepare('SELECT usuario_id FROM rellamadas WHERE id = ?');
  $st->execute([$id]);
  $dueno = $st->fetchColumn();
  if ($dueno === false || ($esBack && (int)$dueno !== $uid)) icc_json(['error' => 'No encontrada.'], 404);
  try { icc_json(['ok' => true, 'texto' => rl_resultado($id, (string)($body['estado'] ?? ''), trim((string)($body['motivo'] ?? '')), isset($body['fecha']) ? (string)$body['fecha'] : null, $uid)]); }
  catch (InvalidArgumentException $e) { icc_json(['error' => $e->getMessage()], 422); }
}

if ($accion === 'asignar' && $metodo === 'POST') {
  if ($esBack && (int)$cfg['usuario_id'] !== $uid) icc_json(['error' => 'Las rellamadas están asignadas a otra persona de backoffice.'], 403);
  icc_json(['ok' => true, 'texto' => rl_asignar()]);
}

if ($accion === 'config' && $metodo === 'PUT') {
  if (!icc_ve_config_ia($user)) icc_json(['error' => 'Solo la administración cambia estos ajustes.'], 403);
  $u = (int)($body['usuario_id'] ?? 0);
  if ($u) {
    $st = $db->prepare("SELECT 1 FROM usuarios WHERE id = ? AND rol = 'backoffice' AND bloqueado = 0");
    $st->execute([$u]);
    if (!$st->fetchColumn()) icc_json(['error' => 'Elige una persona de backoffice.'], 422);
  }
  icc_ajuste_guardar('rellamadas_usuario', (string)$u, false, $uid);
  icc_ajuste_guardar('rellamadas_max_dia', (string)max(1, min(80, (int)($body['max_dia'] ?? 25))), false, $uid);
  icc_ajuste_guardar('rellamadas_dias', (string)max(1, min(30, (int)($body['dias'] ?? 2))), false, $uid);
  icc_ajuste_guardar('rellamadas_activo', !empty($body['activo']) ? '1' : '0', false, $uid);
  icc_ajuste_guardar('rellamadas_objetivo', (string)max(1, min(80, (int)($body['objetivo'] ?? 20))), false, $uid);
  icc_ajuste_guardar('rellamadas_objetivo_aceptados', (string)max(0, min(20, (int)($body['objetivo_aceptados'] ?? 2))), false, $uid);
  icc_ajuste_guardar('rellamadas_presion', !empty($body['presion']) ? '1' : '0', false, $uid);
  icc_json(['ok' => true]);
}

icc_json(['error' => 'Acción no soportada.'], 400);
