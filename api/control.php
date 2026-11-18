<?php
/**
 * ICC CRM · Control 360 · Ahorro siempre.
 * Cada persona ve los clientes de su cartera (jefes, su equipo; dirección y backoffice, según sus permisos).
 *
 * GET  ?action=panel · ficha&cliente=ID · buscar&q=texto
 * POST ?action=subir (multipart: cliente, factura) · leer {id} · auditar {cliente} · enviar {cliente}
 *      pedir {cliente} · alta {cliente, activo} · estado {id, estado} · ejecutar · ajustes {activo, pedir}
 */
require __DIR__ . '/config.php';
require_once __DIR__ . '/control_lib.php';

$user = icc_require_auth();
$metodo = $_SERVER['REQUEST_METHOD'];
$accion = (string)($_GET['action'] ?? 'panel');
if ($metodo !== 'GET') icc_require_csrf();
$body = ($metodo === 'GET' || $accion === 'subir') ? [] : icc_body();
$db = icc_db();
$uid = (int)$user['id'];
$vis = icc_equipo_comercial_ids($user);
$direccion = in_array($user['rol'], ['coordinador', 'gerente', 'admin', 'super_admin'], true);

function cx_visible(int $cid, ?array $vis): bool {
  if ($cid <= 0) return false;
  $st = icc_db()->prepare('SELECT comercial_id FROM clientes WHERE id = ?');
  $st->execute([$cid]);
  $g = $st->fetchColumn();
  if ($g === false) return false;
  return $vis === null || in_array((int)$g, $vis, true);
}
function cx_err(Throwable $e): void {
  if ($e instanceof InvalidArgumentException) icc_json(['error' => $e->getMessage()], 422);
  error_log('ICC control: ' . $e->getMessage());
  icc_json(['error' => 'No se ha podido completar: ' . $e->getMessage()], 502);
}

try {
  if ($accion === 'panel' && $metodo === 'GET') icc_json(cx_panel($vis) + ['direccion' => $direccion]);

  if ($accion === 'ficha' && $metodo === 'GET') {
    $cid = (int)($_GET['cliente'] ?? 0);
    if (!cx_visible($cid, $vis)) icc_json(['error' => 'No encontrado.'], 404);
    icc_json(cx_ficha($cid));
  }

  if ($accion === 'buscar' && $metodo === 'GET') {
    $q = '%' . str_replace(['%', '_'], ['\\%', '\\_'], trim((string)($_GET['q'] ?? ''))) . '%';
    $w = $vis === null ? '' : ' AND comercial_id IN (' . implode(',', array_map('intval', $vis ?: [0])) . ')';
    $st = $db->prepare("SELECT id, razon_social, estado FROM clientes WHERE (razon_social LIKE ? OR cif LIKE ?)$w ORDER BY razon_social LIMIT 12");
    $st->execute([$q, $q]);
    icc_json(['clientes' => $st->fetchAll()]);
  }

  if ($metodo !== 'POST') icc_json(['error' => 'Acción no válida.'], 400);

  if ($accion === 'subir') {
    $cid = (int)($_POST['cliente'] ?? 0);
    if (!cx_visible($cid, $vis)) icc_json(['error' => 'No encontrado.'], 404);
    if (empty($_FILES['factura'])) icc_json(['error' => 'No ha llegado ninguna factura.'], 422);
    @set_time_limit(300);
    $fid = cx_guardar_subida($cid, $_FILES['factura'], $uid);
    $r = cx_leer($fid);
    $aud = $r === 'leida' ? cx_auditar_cliente($cid, $uid) : [];
    $msg = ['leida' => 'Factura leída y estudio actualizado.', 'sin IA' => 'Factura guardada. Se leerá cuando la IA esté activada.', 'descartada' => 'Guardada, pero no parece una factura de energía, telefonía, alarma o seguro.'][$r] ?? 'Factura guardada; la lectura se reintentará sola.';
    icc_json(['ok' => true, 'texto' => $msg, 'estudios' => count($aud)]);
  }

  $cid = (int)($body['cliente'] ?? 0);
  if ($accion === 'leer') {
    $id = (int)($body['id'] ?? 0);
    $c = (int)$db->query('SELECT cliente_id FROM facturas_cliente WHERE id = ' . $id)->fetchColumn();
    if (!cx_visible($c, $vis)) icc_json(['error' => 'No encontrado.'], 404);
    @set_time_limit(300);
    $db->prepare("UPDATE facturas_cliente SET estado = 'pendiente', intentos = 0, error = '' WHERE id = ?")->execute([$id]);
    $r = cx_leer($id);
    if ($r === 'leida') cx_auditar_cliente($c, $uid);
    icc_json(['ok' => true, 'texto' => $r === 'leida' ? 'Factura leída y estudio actualizado.' : 'Resultado: ' . $r]);
  }
  if ($accion === 'auditar') {
    if (!cx_visible($cid, $vis)) icc_json(['error' => 'No encontrado.'], 404);
    @set_time_limit(200);
    $l = cx_auditar_cliente($cid, $uid);
    icc_json(['ok' => true, 'texto' => $l ? count($l) . ' servicios revisados con las tarifas de hoy.' : 'Aún no hay facturas leídas de este cliente.']);
  }
  if ($accion === 'enviar') {
    if (!cx_visible($cid, $vis)) icc_json(['error' => 'No encontrado.'], 404);
    icc_json(['ok' => true, 'texto' => cx_enviar_informe($cid, $uid)]);
  }
  if ($accion === 'pedir') {
    if (!cx_visible($cid, $vis)) icc_json(['error' => 'No encontrado.'], 404);
    cx_alta($cid);
    icc_json(['ok' => true, 'texto' => cx_pedir_facturas($cid, $uid)]);
  }
  if ($accion === 'alta') {
    if (!cx_visible($cid, $vis)) icc_json(['error' => 'No encontrado.'], 404);
    $act = !isset($body['activo']) || !empty($body['activo']) ? 1 : 0;
    $db->prepare('INSERT INTO control_clientes (cliente_id, activo) VALUES (?, ?) ON DUPLICATE KEY UPDATE activo = VALUES(activo)')->execute([$cid, $act]);
    icc_nota_cliente($cid, $act ? 'Alta en Control 360: revisión mensual de sus facturas.' : 'Baja de la revisión mensual de Control 360.', 'control', $uid);
    icc_json(['ok' => true]);
  }
  if ($accion === 'estado') {
    $id = (int)($body['id'] ?? 0);
    $c = (int)$db->query('SELECT cliente_id FROM control_auditorias WHERE id = ' . $id)->fetchColumn();
    if (!cx_visible($c, $vis)) icc_json(['error' => 'No encontrado.'], 404);
    $e = in_array($body['estado'] ?? '', ['borrador', 'revisada', 'descartada'], true) ? $body['estado'] : 'borrador';
    $db->prepare("UPDATE control_auditorias SET estado = ?, revisado_por = ? WHERE id = ? AND estado <> 'enviada'")->execute([$e, $uid, $id]);
    icc_json(['ok' => true]);
  }
  if ($accion === 'ejecutar') {
    if (!$direccion && !icc_ve_ia_equipo($user)) icc_json(['error' => 'No permitido.'], 403);
    @set_time_limit(300);
    icc_json(['ok' => true, 'texto' => cx_tick()]);
  }
  if ($accion === 'ajustes') {
    if (!$direccion) icc_json(['error' => 'Solo dirección cambia los ajustes de Control 360.'], 403);
    if (isset($body['activo'])) icc_ajuste_guardar('control_activo', !empty($body['activo']) ? '1' : '0', false, $uid);
    if (isset($body['pedir'])) icc_ajuste_guardar('control_pedir_facturas', !empty($body['pedir']) ? '1' : '0', false, $uid);
    icc_json(['ok' => true]);
  }
  icc_json(['error' => 'Acción no válida.'], 400);
} catch (Throwable $e) {
  cx_err($e);
}
