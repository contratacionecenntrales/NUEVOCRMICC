<?php
/**
 * ICC CRM · Comparador de Energia (comparador/energia).
 *
 *   ?recurso=config    GET  numeracion, usuario y servicios activos (IA, SIPS) · PUT (Admin)
 *   ?recurso=tarifas   GET  catalogo (&todas=1 incluye las desactivadas)
 *                      POST crear o actualizar (Admin, Jefe de equipo, Backoffice)
 *                      DELETE &id= (Admin)
 *   ?recurso=informes  GET  lista segun jerarquia (&id= uno, &cliente_id= de un cliente)
 *                      POST guardar (crea, o actualiza si llega "id")
 *                      DELETE &id=
 *   ?recurso=pdf&id=   GET  descarga el PDF archivado · POST lo archiva
 *
 * Las comisiones solo se envian a usuarios con sesion y nunca salen en el PDF.
 */
require __DIR__ . '/cmp_comun.php';

$user = cmp_actor();
icc_require_csrf();
$db = icc_db();
$metodo = $_SERVER['REQUEST_METHOD'];
$recurso = $_GET['recurso'] ?? '';

const ENE_CAMPOS_NUM = ['pp1', 'pp2', 'pp3', 'pp4', 'pp5', 'pp6', 'pe1', 'pe2', 'pe3', 'pe4', 'pe5', 'pe6', 'termino_fijo_dia', 'ssaa_kwh', 'compensacion_kwh'];

function ene_tarifa_out(array $f): array {
  $o = [
    'id' => (int)$f['id'], 'tipo' => $f['tipo'], 'peaje' => $f['peaje'], 'rol' => $f['rol'],
    'comercializadora' => $f['comercializadora'], 'nombre' => $f['nombre'], 'modalidad' => $f['modalidad'],
    'cliente' => $f['cliente'], 'permanencia_meses' => (int)$f['permanencia_meses'],
    'comision_tramos' => $f['comision_tramos'], 'valoracion' => $f['valoracion'], 'ventajas' => $f['ventajas'],
    'activo' => (int)$f['activo'] === 1, 'updated_at' => $f['updated_at'],
  ];
  foreach (ENE_CAMPOS_NUM as $c) $o[$c] = (float)$f[$c];
  return $o;
}

function ene_informe_visible(array $user, int $id): ?array {
  $stmt = icc_db()->prepare(
    'SELECT i.*, u.nombre AS usuario_nombre FROM cmp_ene_informes i
     JOIN usuarios u ON u.id = i.usuario_id WHERE i.id = ? LIMIT 1'
  );
  $stmt->execute([$id]);
  $f = $stmt->fetch();
  return $f && cmp_puede_ver_usuario($user, (int)$f['usuario_id']) ? $f : null;
}

function ene_informe_out(array $f, bool $conDatos): array {
  $o = [
    'id' => (int)$f['id'], 'numero' => $f['numero'], 'usuario_id' => (int)$f['usuario_id'],
    'usuario_nombre' => $f['usuario_nombre'] ?? null,
    'cliente_id' => $f['cliente_id'] !== null ? (int)$f['cliente_id'] : null,
    'tipo' => $f['tipo'], 'cliente_nombre' => $f['cliente_nombre'], 'cups' => $f['cups'],
    'comercializadora_actual' => $f['comercializadora_actual'], 'tarifa_propuesta' => $f['tarifa_propuesta'],
    'coste_actual_anual' => $f['coste_actual_anual'] !== null ? (float)$f['coste_actual_anual'] : null,
    'coste_propuesto_anual' => $f['coste_propuesto_anual'] !== null ? (float)$f['coste_propuesto_anual'] : null,
    'ahorro_anual' => $f['ahorro_anual'] !== null ? (float)$f['ahorro_anual'] : null,
    'tiene_pdf' => !empty($f['pdf_ruta']),
    'created_at' => $f['created_at'], 'updated_at' => $f['updated_at'],
  ];
  if ($conDatos) $o['datos'] = json_decode($f['datos'], true);
  return $o;
}

// ==================================================================== CONFIG
if ($recurso === 'config') {
  if ($metodo === 'GET') {
    icc_json(cmp_config_publica() + [
      'usuario' => cmp_usuario_publico($user),
      'ia' => defined('ICC_ANTHROPIC_API_KEY') && ICC_ANTHROPIC_API_KEY !== '',
      'sips' => defined('ICC_SIPS_URL') && ICC_SIPS_URL !== '',
      'csrf' => icc_ensure_csrf(),
    ]);
  }
  if ($metodo === 'PUT') cmp_guardar_config($user);
  icc_json(['error' => 'Metodo no soportado.'], 405);
}

// =================================================================== TARIFAS
if ($recurso === 'tarifas') {
  if ($metodo === 'GET') {
    $sql = 'SELECT * FROM cmp_ene_tarifas' . (!empty($_GET['todas']) ? '' : ' WHERE activo = 1') . ' ORDER BY tipo, peaje, rol, comercializadora, nombre';
    icc_json(array_map('ene_tarifa_out', $db->query($sql)->fetchAll()));
  }
  if (!cmp_puede_catalogo($user)) {
    icc_json(['error' => 'Solo administradores, jefes de equipo y backoffice pueden modificar el catalogo.'], 403);
  }
  if ($metodo === 'POST') {
    $b = cmp_body();
    $tipo = in_array($b['tipo'] ?? '', ['luz', 'gas'], true) ? $b['tipo'] : null;
    $peajes = $tipo === 'gas' ? ['RL.1', 'RL.2', 'RL.3', 'RL.4', 'RL.5', 'RL.6'] : ['2.0TD', '3.0TD', '6.1TD', '6.2TD', '6.3TD', '6.4TD'];
    $peaje = in_array($b['peaje'] ?? '', $peajes, true) ? $b['peaje'] : null;
    $comer = cmp_txt($b['comercializadora'] ?? '', 120);
    $nombre = cmp_txt($b['nombre'] ?? '', 150);
    if (!$tipo || !$peaje || !$comer || !$nombre) {
      icc_json(['error' => 'Faltan tipo, peaje, comercializadora o nombre de la tarifa.'], 422);
    }
    $vals = [
      'tipo' => $tipo, 'peaje' => $peaje,
      'rol' => ($b['rol'] ?? '') === 'mercado' ? 'mercado' : 'propia',
      'comercializadora' => $comer, 'nombre' => $nombre,
      'modalidad' => ($b['modalidad'] ?? '') === 'indexado' ? 'indexado' : 'fijo',
      'cliente' => in_array($b['cliente'] ?? '', ['residencial', 'pyme'], true) ? $b['cliente'] : 'todos',
      'permanencia_meses' => max(0, min(60, (int)($b['permanencia_meses'] ?? 0))),
      'comision_tramos' => cmp_txt($b['comision_tramos'] ?? null, 255),
      'valoracion' => cmp_txt($b['valoracion'] ?? null, 255),
      'ventajas' => cmp_txt($b['ventajas'] ?? null, 2000),
      'activo' => !isset($b['activo']) || $b['activo'] ? 1 : 0,
      'actualizado_por' => (int)$user['id'],
    ];
    foreach (ENE_CAMPOS_NUM as $c) {
      $v = cmp_num($b[$c] ?? 0, 6) ?? 0.0;
      if ($v < 0 || $v > 100) icc_json(['error' => "El valor de $c no es valido."], 422);
      $vals[$c] = $v;
    }
    $id = isset($b['id']) ? (int)$b['id'] : 0;
    $cols = array_keys($vals);
    if ($id) {
      $stmt = $db->prepare('SELECT id FROM cmp_ene_tarifas WHERE id = ?');
      $stmt->execute([$id]);
      if (!$stmt->fetch()) icc_json(['error' => 'Tarifa no encontrada.'], 404);
      $set = implode(', ', array_map(function ($c) { return "$c = ?"; }, $cols));
      $db->prepare("UPDATE cmp_ene_tarifas SET $set WHERE id = ?")->execute(array_merge(array_values($vals), [$id]));
    } else {
      $db->prepare('INSERT INTO cmp_ene_tarifas (' . implode(', ', $cols) . ') VALUES (' . implode(', ', array_fill(0, count($cols), '?')) . ')')
        ->execute(array_values($vals));
      $id = (int)$db->lastInsertId();
    }
    $stmt = $db->prepare('SELECT * FROM cmp_ene_tarifas WHERE id = ?');
    $stmt->execute([$id]);
    icc_json(ene_tarifa_out($stmt->fetch()));
  }
  if ($metodo === 'DELETE') {
    if (!icc_es_admin_o_superior($user)) icc_json(['error' => 'Solo un administrador puede borrar tarifas. Puedes desactivarla.'], 403);
    $db->prepare('DELETE FROM cmp_ene_tarifas WHERE id = ?')->execute([(int)($_GET['id'] ?? 0)]);
    icc_json(['ok' => true]);
  }
  icc_json(['error' => 'Metodo no soportado.'], 405);
}

// ================================================================== INFORMES
if ($recurso === 'informes') {
  if ($metodo === 'GET') {
    if (isset($_GET['id'])) {
      $f = ene_informe_visible($user, (int)$_GET['id']);
      if (!$f) icc_json(['error' => 'Informe no encontrado o sin permiso.'], 404);
      icc_json(ene_informe_out($f, true));
    }
    $params = [];
    $where = [cmp_where_visibles($user, 'i.usuario_id', $params)];
    if (!empty($_GET['cliente_id'])) {
      $where[] = 'i.cliente_id = ?';
      $params[] = (int)$_GET['cliente_id'];
    }
    $stmt = $db->prepare(
      'SELECT i.id, i.numero, i.usuario_id, i.cliente_id, i.tipo, i.cliente_nombre, i.cups, i.comercializadora_actual,
              i.tarifa_propuesta, i.coste_actual_anual, i.coste_propuesto_anual, i.ahorro_anual, i.pdf_ruta,
              i.created_at, i.updated_at, u.nombre AS usuario_nombre
       FROM cmp_ene_informes i JOIN usuarios u ON u.id = i.usuario_id
       WHERE ' . implode(' AND ', $where) . ' ORDER BY i.updated_at DESC, i.id DESC LIMIT 300'
    );
    $stmt->execute($params);
    icc_json(array_map(function ($f) { return ene_informe_out($f, false); }, $stmt->fetchAll()));
  }

  if ($metodo === 'POST') {
    $b = cmp_body();
    $datos = $b['datos'] ?? null;
    if (!is_array($datos)) icc_json(['error' => 'Faltan los datos del informe.'], 422);
    $id = !empty($b['id']) ? (int)$b['id'] : 0;
    $existente = null;
    if ($id) {
      $existente = ene_informe_visible($user, $id);
      if (!$existente) icc_json(['error' => 'Informe no encontrado o sin permiso.'], 404);
    }
    $numero = cmp_resolver_numero(cmp_txt($b['numero'] ?? '', 40), $existente, 'cmp_ene_informes', $id);
    if (!isset($datos['presupuesto']) || !is_array($datos['presupuesto'])) $datos['presupuesto'] = [];
    $datos['presupuesto']['numero'] = $numero;
    $json = json_encode($datos, JSON_UNESCAPED_UNICODE);
    if ($json === false || strlen($json) > 600000) icc_json(['error' => 'El informe es demasiado grande.'], 413);

    $clienteId = array_key_exists('cliente_id', $b)
      ? cmp_cliente_vinculado($user, $b['cliente_id'])
      : ($existente ? ($existente['cliente_id'] !== null ? (int)$existente['cliente_id'] : null) : null);
    $campos = [
      $clienteId,
      ($b['tipo'] ?? '') === 'gas' ? 'gas' : 'luz',
      cmp_txt($b['cliente_nombre'] ?? null, 150),
      cmp_txt($b['cups'] ?? null, 30),
      cmp_txt($b['comercializadora_actual'] ?? null, 150),
      cmp_txt($b['tarifa_propuesta'] ?? null, 150),
      cmp_num($b['coste_actual_anual'] ?? null),
      cmp_num($b['coste_propuesto_anual'] ?? null),
      cmp_num($b['ahorro_anual'] ?? null),
    ];
    if ($existente) {
      $db->prepare(
        'UPDATE cmp_ene_informes SET numero = ?, cliente_id = ?, tipo = ?, cliente_nombre = ?, cups = ?, comercializadora_actual = ?,
           tarifa_propuesta = ?, coste_actual_anual = ?, coste_propuesto_anual = ?, ahorro_anual = ?, datos = ? WHERE id = ?'
      )->execute(array_merge([$numero], $campos, [$json, $id]));
    } else {
      $db->prepare(
        'INSERT INTO cmp_ene_informes (numero, usuario_id, cliente_id, tipo, cliente_nombre, cups, comercializadora_actual,
           tarifa_propuesta, coste_actual_anual, coste_propuesto_anual, ahorro_anual, datos)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )->execute(array_merge([$numero, $user['id']], $campos, [$json]));
      $id = (int)$db->lastInsertId();
    }
    icc_json(ene_informe_out(ene_informe_visible($user, $id), false), $existente ? 200 : 201);
  }

  if ($metodo === 'DELETE') {
    $id = (int)($_GET['id'] ?? 0);
    $f = ene_informe_visible($user, $id);
    if (!$f) icc_json(['error' => 'Informe no encontrado o sin permiso.'], 404);
    $db->prepare('DELETE FROM cmp_ene_informes WHERE id = ?')->execute([$id]);
    if (!empty($f['pdf_ruta']) && strpos($f['pdf_ruta'], '..') === false) @unlink(ICC_STORAGE_DIR . '/comparador/' . $f['pdf_ruta']);
    icc_json(['ok' => true]);
  }
  icc_json(['error' => 'Metodo no soportado.'], 405);
}

// ======================================================================= PDF
if ($recurso === 'pdf') {
  $f = ene_informe_visible($user, (int)($_GET['id'] ?? 0));
  if (!$f) icc_json(['error' => 'Informe no encontrado o sin permiso.'], 404);
  if ($metodo === 'POST') cmp_pdf_guardar('cmp_ene_informes', 'energia', $f);
  if ($metodo === 'GET') cmp_pdf_descargar('energia', $f);
  icc_json(['error' => 'Metodo no soportado.'], 405);
}

icc_json(['error' => 'Recurso no valido. Usa config, tarifas, informes o pdf.'], 404);
