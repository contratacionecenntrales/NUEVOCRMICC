<?php
/**
 * ICC CRM · Auditorias del Comparador y Auditor Inteligente, siempre ligadas
 * a un cliente del CRM. Misma visibilidad que el resto del CRM: el comercial
 * ve las de sus clientes, el jefe de equipo las de su equipo y
 * backoffice/admin todas.
 *
 * GET  ?cliente_id=X   auditorias de un cliente (ficha del cliente)
 * GET  ?id=X           una auditoria completa (para verla o volver a descargar su PDF)
 * GET  (sin filtros)   historico + indicadores (?sector, ?tipo, ?gestor_id, ?q, ?desde, ?hasta)
 * POST                 guarda una auditoria nueva
 * DELETE ?id=X         la borra (quien la creo o Admin)
 */
require __DIR__ . '/config.php';

$user = icc_require_auth();
icc_require_permiso_metodo($user, ['GET' => 'comparador.usar', 'POST' => 'comparador.usar', 'DELETE' => 'comparador.usar']);
$metodo = $_SERVER['REQUEST_METHOD'];
$db = icc_db();

const AUD_SECTORES = ['energia', 'telefonia', 'alarmas', 'pack_integral'];
const AUD_TIPOS = ['comparativa', 'telecom_avanzada'];

/** true si ya se importo sql/migracion_comparador_auditor.sql. */
function aud_v2(PDO $db): bool {
  static $ok = null;
  if ($ok === null) {
    try {
      $db->query('SELECT tipo_informe FROM comparador_auditorias LIMIT 0');
      $ok = true;
    } catch (PDOException $e) {
      $ok = false;
    }
  }
  return $ok;
}

function aud_cliente_visible(array $cliente, array $user): bool {
  return icc_puede_ver_comercial($user, $cliente['comercial_id'] ?? null);
}

function aud_normalizar(array $f, bool $conDetalle = true): array {
  foreach (['id', 'cliente_id', 'gestor_id', 'documento_id', 'comercial_id'] as $c) {
    if (array_key_exists($c, $f)) $f[$c] = $f[$c] !== null ? (int)$f[$c] : null;
  }
  foreach (['coste_actual_anual', 'coste_propuesto_anual', 'ahorro_anual', 'ahorro_porcentaje'] as $c) {
    if (array_key_exists($c, $f)) $f[$c] = $f[$c] !== null ? (float)$f[$c] : null;
  }
  if (!array_key_exists('tipo_informe', $f)) $f['tipo_informe'] = 'comparativa';
  if ($conDetalle) {
    if (isset($f['datos_entrada'])) $f['datos_entrada'] = json_decode($f['datos_entrada'], true);
    if (isset($f['resultado'])) $f['resultado'] = json_decode($f['resultado'], true);
  } else {
    unset($f['datos_entrada'], $f['resultado']);
  }
  return $f;
}

/** Condicion SQL de visibilidad por equipo sobre la tabla de clientes "c". */
function aud_where_equipo(array $user, array &$params): string {
  $ids = icc_equipo_comercial_ids($user);
  if ($ids === null) return '1 = 1';
  if (!$ids) return '1 = 0';
  array_push($params, ...$ids);
  return 'c.comercial_id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')';
}

// ======================================================================= GET
if ($metodo === 'GET') {
  $columnasLista = 'a.id, a.cliente_id, a.gestor_id, a.sector, a.coste_actual_anual, a.coste_propuesto_anual,
    a.ahorro_anual, a.ahorro_porcentaje, a.created_at' . (aud_v2($db) ? ', a.tipo_informe, a.codigo, a.referencia_factura, a.documento_id' : '');

  // --- Una auditoria completa
  if (!empty($_GET['id'])) {
    $stmt = $db->prepare(
      'SELECT a.*, c.razon_social AS cliente_nombre, c.cif AS cliente_cif, c.comercial_id, c.contacto_nombre, c.contacto_telefono,
              c.contacto_email, c.telefono AS cliente_telefono, c.email AS cliente_email, c.direccion_suministro,
              u.nombre AS gestor_nombre, u.apellidos AS gestor_apellidos, u.email AS gestor_email, u.telefono AS gestor_telefono
       FROM comparador_auditorias a
       JOIN clientes c ON c.id = a.cliente_id
       LEFT JOIN usuarios u ON u.id = a.gestor_id
       WHERE a.id = ?'
    );
    $stmt->execute([(int)$_GET['id']]);
    $fila = $stmt->fetch();
    if (!$fila || !aud_cliente_visible($fila, $user)) icc_json(['error' => 'Auditoria no encontrada'], 404);
    icc_json(['auditoria' => aud_normalizar($fila)]);
  }

  // --- Las de un cliente (ficha del cliente)
  if (!empty($_GET['cliente_id'])) {
    $clienteId = (int)$_GET['cliente_id'];
    $stmt = $db->prepare('SELECT * FROM clientes WHERE id = ?');
    $stmt->execute([$clienteId]);
    $cliente = $stmt->fetch();
    if (!$cliente || !aud_cliente_visible($cliente, $user)) icc_json(['error' => 'No encontrado'], 404);

    $stmt = $db->prepare(
      "SELECT $columnasLista, a.datos_entrada, a.resultado, u.nombre AS gestor_nombre
       FROM comparador_auditorias a LEFT JOIN usuarios u ON u.id = a.gestor_id
       WHERE a.cliente_id = ? ORDER BY a.created_at DESC"
    );
    $stmt->execute([$clienteId]);
    icc_json(['auditorias' => array_map('aud_normalizar', $stmt->fetchAll())]);
  }

  // --- Historico con filtros + indicadores
  $params = [];
  $where = [aud_where_equipo($user, $params)];
  if (!empty($_GET['sector']) && in_array($_GET['sector'], AUD_SECTORES, true)) {
    $where[] = 'a.sector = ?';
    $params[] = $_GET['sector'];
  }
  if (!empty($_GET['tipo']) && in_array($_GET['tipo'], AUD_TIPOS, true) && aud_v2($db)) {
    $where[] = 'a.tipo_informe = ?';
    $params[] = $_GET['tipo'];
  }
  if (!empty($_GET['gestor_id'])) {
    $where[] = 'a.gestor_id = ?';
    $params[] = (int)$_GET['gestor_id'];
  }
  if (!empty($_GET['q'])) {
    $q = '%' . trim($_GET['q']) . '%';
    $where[] = aud_v2($db) ? '(c.razon_social LIKE ? OR c.cif LIKE ? OR a.referencia_factura LIKE ? OR a.codigo LIKE ?)' : '(c.razon_social LIKE ? OR c.cif LIKE ?)';
    array_push($params, $q, $q);
    if (aud_v2($db)) array_push($params, $q, $q);
  }
  foreach (['desde' => '>=', 'hasta' => '<='] as $campo => $op) {
    if (!empty($_GET[$campo]) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $_GET[$campo])) {
      $where[] = "DATE(a.created_at) $op ?";
      $params[] = $_GET[$campo];
    }
  }
  $whereSql = implode(' AND ', $where);

  $stmt = $db->prepare(
    "SELECT $columnasLista, c.razon_social AS cliente_nombre, c.cif AS cliente_cif, c.comercial_id, u.nombre AS gestor_nombre
     FROM comparador_auditorias a
     JOIN clientes c ON c.id = a.cliente_id
     LEFT JOIN usuarios u ON u.id = a.gestor_id
     WHERE $whereSql
     ORDER BY a.created_at DESC
     LIMIT 300"
  );
  $stmt->execute($params);
  $filas = array_map(function ($f) { return aud_normalizar($f, false); }, $stmt->fetchAll());

  $paramsKpi = [];
  $whereKpi = aud_where_equipo($user, $paramsKpi);
  $stmt = $db->prepare(
    "SELECT COUNT(*) AS total,
            SUM(a.created_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01')) AS mes,
            COALESCE(SUM(CASE WHEN a.ahorro_anual > 0 THEN a.ahorro_anual END), 0) AS ahorro_detectado,
            COALESCE(AVG(CASE WHEN a.ahorro_porcentaje > 0 THEN a.ahorro_porcentaje END), 0) AS ahorro_medio_pct,
            COUNT(DISTINCT a.cliente_id) AS clientes
     FROM comparador_auditorias a JOIN clientes c ON c.id = a.cliente_id
     WHERE $whereKpi"
  );
  $stmt->execute($paramsKpi);
  $kpi = $stmt->fetch();

  icc_json([
    'auditorias' => $filas,
    'indicadores' => [
      'total' => (int)$kpi['total'],
      'mes' => (int)$kpi['mes'],
      'ahorro_detectado' => (float)$kpi['ahorro_detectado'],
      'ahorro_medio_pct' => (float)$kpi['ahorro_medio_pct'],
      'clientes' => (int)$kpi['clientes'],
    ],
    'migracion_pendiente' => !aud_v2($db),
  ]);
}

// ====================================================================== POST
if ($metodo === 'POST') {
  icc_require_csrf();
  $body = icc_body();
  $v2 = aud_v2($db);

  $clienteId = (int)($body['cliente_id'] ?? 0);
  $sector = $body['sector'] ?? '';
  $tipo = $body['tipo_informe'] ?? 'comparativa';
  if (!$clienteId) icc_json(['error' => 'Elige el cliente de la auditoria'], 400);
  if (!in_array($sector, AUD_SECTORES, true)) icc_json(['error' => 'Sector no valido'], 422);
  if (!in_array($tipo, AUD_TIPOS, true)) icc_json(['error' => 'Tipo de informe no valido'], 422);
  if (!$v2 && ($sector === 'pack_integral' || $tipo !== 'comparativa')) {
    icc_json(['error' => 'Falta importar sql/migracion_comparador_auditor.sql para guardar este tipo de auditoria'], 409);
  }

  $stmt = $db->prepare('SELECT * FROM clientes WHERE id = ?');
  $stmt->execute([$clienteId]);
  $cliente = $stmt->fetch();
  if (!$cliente || !aud_cliente_visible($cliente, $user)) icc_json(['error' => 'Cliente no encontrado'], 404);

  $documentoId = null;
  if ($v2 && !empty($body['documento_id'])) {
    $stmt = $db->prepare('SELECT id FROM documentos WHERE id = ? AND cliente_id = ?');
    $stmt->execute([(int)$body['documento_id'], $clienteId]);
    $documentoId = $stmt->fetch() ? (int)$body['documento_id'] : null;
  }

  $num = function ($v) { return $v === null || $v === '' || !is_numeric($v) ? null : round((float)$v, 2); };
  $columnas = ['cliente_id', 'gestor_id', 'sector', 'datos_entrada', 'resultado', 'coste_actual_anual', 'coste_propuesto_anual', 'ahorro_anual', 'ahorro_porcentaje'];
  $valores = [
    $clienteId,
    $user['id'],
    $sector,
    json_encode($body['datos_entrada'] ?? new stdClass(), JSON_UNESCAPED_UNICODE),
    json_encode($body['resultado'] ?? new stdClass(), JSON_UNESCAPED_UNICODE),
    $num($body['coste_actual_anual'] ?? null),
    $num($body['coste_propuesto_anual'] ?? null),
    $num($body['ahorro_anual'] ?? null),
    $num($body['ahorro_porcentaje'] ?? null),
  ];
  if ($v2) {
    array_push($columnas, 'tipo_informe', 'codigo', 'referencia_factura', 'documento_id');
    array_push(
      $valores,
      $tipo,
      substr(trim((string)($body['codigo'] ?? '')), 0, 40) ?: null,
      substr(trim((string)($body['referencia_factura'] ?? '')), 0, 190),
      $documentoId
    );
  }
  try {
    $db->prepare('INSERT INTO comparador_auditorias (' . implode(', ', $columnas) . ') VALUES (' . implode(', ', array_fill(0, count($columnas), '?')) . ')')
      ->execute($valores);
  } catch (Exception $e) {
    icc_json(['error' => icc_mensaje_error('No se pudo guardar la auditoria', $e, $user)], 500);
  }
  icc_json(['id' => (int)$db->lastInsertId()], 201);
}

// ==================================================================== DELETE
if ($metodo === 'DELETE') {
  icc_require_csrf();
  $id = (int)($_GET['id'] ?? 0);
  $stmt = $db->prepare('SELECT a.gestor_id, c.comercial_id FROM comparador_auditorias a JOIN clientes c ON c.id = a.cliente_id WHERE a.id = ?');
  $stmt->execute([$id]);
  $fila = $stmt->fetch();
  if (!$fila || !aud_cliente_visible($fila, $user)) icc_json(['error' => 'Auditoria no encontrada'], 404);
  if ((int)$fila['gestor_id'] !== (int)$user['id'] && !icc_es_admin_o_superior($user)) {
    icc_json(['error' => 'Solo quien hizo la auditoria o un Admin pueden borrarla'], 403);
  }
  $db->prepare('DELETE FROM comparador_auditorias WHERE id = ?')->execute([$id]);
  icc_json(['ok' => true]);
}

icc_json(['error' => 'Metodo no permitido'], 405);
