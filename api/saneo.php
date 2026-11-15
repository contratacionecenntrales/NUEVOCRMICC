<?php
/**
 * ICC CRM · Agente de mantenimiento del pipeline. Direccion y jefes de equipo
 * (los jefes, sobre su equipo); los ajustes, coordinacion y admin.
 *
 * GET  ?action=estado                       contadores, ultimas pasadas, candidatos a revisar
 * POST ?action=ejecutar                     «Arreglar ahora»
 * POST ?action=deshacer {lote}
 * POST ?action=candidato {cliente_id, decision: perdido|mantener, motivo}
 * GET|PUT ?action=config
 */
require __DIR__ . '/config.php';
require_once __DIR__ . '/agentes_lib.php';
require_once __DIR__ . '/saneo_lib.php';

$user = icc_require_auth();
if (!icc_ve_ia_equipo($user)) icc_json(['error' => 'No encontrado'], 404);
$metodo = $_SERVER['REQUEST_METHOD'];
$accion = (string)($_GET['action'] ?? 'estado');
if ($metodo !== 'GET') icc_require_csrf();
$body = $metodo === 'GET' ? [] : icc_body();
$db = icc_db();
$uid = (int)$user['id'];
$visibles = icc_equipo_comercial_ids($user);

function sn_lote_visible(string $lote, ?array $visibles): bool {
  if ($visibles === null) return true;
  $st = icc_db()->prepare('SELECT COUNT(*) FROM saneo_registro r JOIN clientes c ON c.id = r.cliente_id WHERE r.lote = ? AND (c.comercial_id IS NULL OR c.comercial_id NOT IN (' . ($visibles ? implode(',', array_map('intval', $visibles)) : '0') . '))');
  $st->execute([$lote]);
  return (int)$st->fetchColumn() === 0;
}

if ($accion === 'estado' && $metodo === 'GET') {
  $pas = $db->query("SELECT lote, MIN(ts) ts, MIN(origen) origen, MIN(usuario_id) usuario_id, COUNT(*) cambios, SUM(deshecho) deshechos, COUNT(DISTINCT cliente_id) clientes FROM saneo_registro GROUP BY lote ORDER BY MIN(id) DESC LIMIT 8")->fetchAll();
  $pas = array_values(array_filter($pas, function ($p) use ($visibles) { return sn_lote_visible($p['lote'], $visibles); }));
  icc_json(['contadores' => sn_contadores($visibles), 'pasadas' => $pas, 'candidatos' => sn_candidatos($visibles), 'config' => sn_config(), 'es_config' => icc_ve_config_ia($user)]);
}
if ($accion === 'ejecutar' && $metodo === 'POST') {
  @set_time_limit(120);
  $r = sn_pasada('manual', $uid, $visibles);
  icc_json(['ok' => true] + $r);
}
if ($accion === 'deshacer' && $metodo === 'POST') {
  $lote = (string)($body['lote'] ?? '');
  if (!preg_match('/^[a-f0-9]{16}$/', $lote)) icc_json(['error' => 'Pasada no válida.'], 422);
  if (!sn_lote_visible($lote, $visibles)) icc_json(['error' => 'Esa pasada incluye clientes de otros equipos: la deshace dirección.'], 403);
  icc_json(['ok' => true] + sn_deshacer($lote, $uid));
}
if ($accion === 'candidato' && $metodo === 'POST') {
  $cid = (int)($body['cliente_id'] ?? 0);
  $st = $db->prepare('SELECT * FROM clientes WHERE id = ?');
  $st->execute([$cid]);
  $c = $st->fetch();
  if (!$c || !icc_puede_ver_comercial($user, $c['comercial_id'])) icc_json(['error' => 'No encontrado.'], 404);
  if (($body['decision'] ?? '') === 'perdido') {
    $motivo = trim((string)($body['motivo'] ?? ''));
    if ($motivo === '') icc_json(['error' => 'Para marcarlo perdido hace falta un motivo.'], 422);
    $db->prepare("UPDATE clientes SET estado = 'perdido', motivo_perdida = ? WHERE id = ?")->execute([mb_substr($motivo, 0, 255), $cid]);
    $db->prepare('INSERT INTO historial_estado (cliente_id, estado_anterior, estado_nuevo, cambiado_por) VALUES (?, ?, ?, ?)')->execute([$cid, $c['estado'], 'perdido', $uid]);
    icc_nota_cliente($cid, 'Marcado como perdido al revisar el mantenimiento del pipeline: ' . $motivo, 'saneo', $uid);
  } else {
    $db->prepare('INSERT INTO saneo_memoria (cliente_id, mantener_hasta, reprogramaciones) VALUES (?, CURDATE() + INTERVAL 30 DAY, 0) ON DUPLICATE KEY UPDATE mantener_hasta = CURDATE() + INTERVAL 30 DAY, reprogramaciones = 0')->execute([$cid]);
    icc_nota_cliente($cid, 'Se decide mantener la oportunidad (revisión del mantenimiento del pipeline).', 'saneo', $uid);
  }
  icc_json(['ok' => true]);
}
if ($accion === 'config' && $metodo === 'PUT') {
  if (!icc_ve_config_ia($user)) icc_json(['error' => 'Solo la administración.'], 403);
  $a = (array)($body['arreglar'] ?? []);
  icc_ajuste_guardar('saneo_auto', !empty($body['auto']) ? '1' : '0', false, $uid);
  icc_ajuste_guardar('saneo_arreglar', json_encode(['proximo' => !empty($a['proximo']), 'valor' => !empty($a['valor']), 'gestor' => !empty($a['gestor']), 'rescate' => !empty($a['rescate'])]), false, $uid);
  icc_ajuste_guardar('saneo_crear_llamadas', !empty($body['crear_llamadas']) ? '1' : '0', false, $uid);
  icc_ajuste_guardar('saneo_max_dia', (string)max(1, min(60, (int)($body['max_dia'] ?? 15))), false, $uid);
  icc_ajuste_guardar('saneo_proponer_perdidos', !empty($body['proponer_perdidos']) ? '1' : '0', false, $uid);
  icc_ajuste_guardar('saneo_dias_muerto', (string)max(7, min(365, (int)($body['dias_muerto'] ?? 45))), false, $uid);
  icc_ajuste_guardar('saneo_valor_entrada', (string)max(0, (float)($body['valor_entrada'] ?? 300)), false, $uid);
  icc_json(['ok' => true]);
}
icc_json(['error' => 'Acción no soportada.'], 400);
