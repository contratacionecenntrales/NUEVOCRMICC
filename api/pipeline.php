<?php
/**
 * ICC CRM · Pipeline comercial (tablero de oportunidades).
 *
 *   GET            oportunidades visibles + metricas
 *                  (?comercial_id ?tipo_cliente ?servicio ?q ?cerrados_dias=90)
 *   PUT ?id=X      mover de fase y/o editar valor y fecha de cierre prevista
 *                  { estado, motivo_perdida, valor_estimado, fecha_cierre_prevista }
 *
 * Cada cliente es una oportunidad; su fase es clientes.estado (la misma que
 * mueven solas la subida de facturas, los estudios y las firmas). Los dias
 * en fase salen de historial_estado. Valor y fecha de cierre requieren
 * sql/migracion_pipeline_oportunidades.sql (sin ella el tablero funciona
 * igual, sin importes).
 */
require __DIR__ . '/config.php';

$user = icc_require_auth();
icc_require_permiso_metodo($user, ['GET' => 'clientes.ver', 'PUT' => 'clientes.editar']);
$db = icc_db();
$metodo = $_SERVER['REQUEST_METHOD'];

const PIPE_ESTADOS = ['lead_captado', 'estudio_backoffice', 'oferta_presentada', 'en_cierre', 'cliente_activo', 'perdido'];

function pipe_tiene(PDO $db, string $sql): bool {
  try {
    $db->query($sql);
    return true;
  } catch (PDOException $e) {
    return false;
  }
}

$conValor = pipe_tiene($db, 'SELECT valor_estimado, fecha_cierre_prevista FROM clientes LIMIT 0');
$conCitas = pipe_tiene($db, 'SELECT cliente_id FROM citas LIMIT 0');
$conPresupuestos = pipe_tiene($db, 'SELECT cliente_id FROM presupuestos LIMIT 0');
$conCmp = pipe_tiene($db, 'SELECT cliente_id, ahorro_anual FROM cmp_ene_informes LIMIT 0') && pipe_tiene($db, 'SELECT cliente_id, ahorro_anual FROM cmp_tel_informes LIMIT 0');

/** Condicion de visibilidad por jerarquia sobre clientes "c". */
function pipe_where_visibles(array $user, array &$params): string {
  $ids = icc_equipo_comercial_ids($user);
  if ($ids === null) return '1 = 1';
  array_push($params, ...$ids);
  return 'c.comercial_id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')';
}

// ======================================================================= GET
if ($metodo === 'GET') {
  $params = [];
  $where = [pipe_where_visibles($user, $params)];
  if (!empty($_GET['comercial_id']) && icc_puede_ver_comercial($user, (int)$_GET['comercial_id'])) {
    $where[] = 'c.comercial_id = ?';
    $params[] = (int)$_GET['comercial_id'];
  }
  if (!empty($_GET['tipo_cliente'])) {
    $where[] = 'c.tipo_cliente = ?';
    $params[] = (string)$_GET['tipo_cliente'];
  }
  if (!empty($_GET['servicio'])) {
    $where[] = 'EXISTS (SELECT 1 FROM cliente_servicios cs WHERE cs.cliente_id = c.id AND cs.servicio = ?)';
    $params[] = (string)$_GET['servicio'];
  }
  if (!empty($_GET['q'])) {
    $q = '%' . trim((string)$_GET['q']) . '%';
    $where[] = '(c.razon_social LIKE ? OR c.cif LIKE ? OR c.contacto_nombre LIKE ? OR c.contacto_telefono LIKE ?)';
    array_push($params, $q, $q, $q, $q);
  }
  // Ganados y perdidos solo de los ultimos N dias (las fases abiertas, todas).
  $cerradosDias = max(7, min(3650, (int)($_GET['cerrados_dias'] ?? 90)));

  $desde = '(SELECT MAX(h.created_at) FROM historial_estado h WHERE h.cliente_id = c.id AND h.estado_nuevo = c.estado)';
  $cols = "c.id, c.razon_social, c.cif, c.contacto_nombre, c.contacto_telefono, c.telefono, c.comercial_id, c.estado,
           c.tipo_cliente, c.sector, c.motivo_perdida, c.created_at,
           u.nombre AS comercial_nombre, u.apellidos AS comercial_apellidos,
           COALESCE($desde, c.created_at) AS estado_desde";
  if ($conValor) $cols .= ', c.valor_estimado, c.fecha_cierre_prevista';
  if ($conCitas) {
    $cols .= ", (SELECT CONCAT(ci.fecha, ' ', ci.hora_inicio, '|', ci.tipo) FROM citas ci
                 WHERE ci.cliente_id = c.id AND ci.fecha >= CURDATE() AND ci.estado IN ('programada','confirmada','reprogramada')
                 ORDER BY ci.fecha, ci.hora_inicio LIMIT 1) AS proxima_cita";
    $cols .= ", (SELECT MAX(ci.fecha) FROM citas ci WHERE ci.cliente_id = c.id AND ci.fecha <= CURDATE()) AS ultima_cita";
  }
  $ahorros = ['(SELECT MAX(e.ahorro_estimado) FROM estudios e WHERE e.cliente_id = c.id)'];
  if ($conCmp) {
    $ahorros[] = '(SELECT MAX(x.ahorro_anual) FROM cmp_ene_informes x WHERE x.cliente_id = c.id)';
    $ahorros[] = '(SELECT MAX(x.ahorro_anual) FROM cmp_tel_informes x WHERE x.cliente_id = c.id)';
  }
  $cols .= ', GREATEST(' . implode(', ', array_map(function ($a) { return "COALESCE($a, 0)"; }, $ahorros)) . ') AS ahorro_cliente';
  if ($conPresupuestos) $cols .= ', (SELECT COUNT(*) FROM presupuestos p WHERE p.cliente_id = c.id) AS n_presupuestos';

  $sql = "SELECT $cols FROM clientes c LEFT JOIN usuarios u ON u.id = c.comercial_id
          WHERE " . implode(' AND ', $where) . "
          HAVING c.estado NOT IN ('cliente_activo','perdido') OR estado_desde >= (NOW() - INTERVAL $cerradosDias DAY)
          ORDER BY estado_desde ASC LIMIT 2000";
  $stmt = $db->prepare($sql);
  $stmt->execute($params);
  $filas = $stmt->fetchAll();

  // Servicios de interes de cada oportunidad.
  $servicios = [];
  if ($filas) {
    $ids = array_column($filas, 'id');
    $st = $db->prepare('SELECT cliente_id, servicio FROM cliente_servicios WHERE cliente_id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')');
    $st->execute($ids);
    foreach ($st->fetchAll() as $s) $servicios[$s['cliente_id']][] = $s['servicio'];
  }
  $ahora = time();
  $oportunidades = array_map(function ($f) use ($servicios, $conValor, $ahora) {
    $proxima = null;
    if (!empty($f['proxima_cita'])) {
      [$cuando, $tipo] = array_pad(explode('|', $f['proxima_cita']), 2, '');
      $proxima = ['fecha' => substr($cuando, 0, 10), 'hora' => substr($cuando, 11, 5), 'tipo' => $tipo];
    }
    return [
      'id' => (int)$f['id'],
      'razon_social' => $f['razon_social'],
      'cif' => $f['cif'],
      'contacto' => $f['contacto_nombre'],
      'telefono' => $f['contacto_telefono'] ?: $f['telefono'],
      'comercial_id' => $f['comercial_id'] !== null ? (int)$f['comercial_id'] : null,
      'comercial_nombre' => trim(($f['comercial_nombre'] ?? '') . ' ' . ($f['comercial_apellidos'] ?? '')),
      'estado' => $f['estado'],
      'tipo_cliente' => $f['tipo_cliente'],
      'motivo_perdida' => $f['motivo_perdida'],
      'servicios' => $servicios[$f['id']] ?? [],
      'valor_estimado' => $conValor && $f['valor_estimado'] !== null ? (float)$f['valor_estimado'] : null,
      'fecha_cierre_prevista' => $conValor ? $f['fecha_cierre_prevista'] : null,
      'estado_desde' => $f['estado_desde'],
      'dias_en_fase' => max(0, (int)floor(($ahora - strtotime($f['estado_desde'])) / 86400)),
      'proxima_cita' => $proxima,
      'ultima_cita' => $f['ultima_cita'] ?? null,
      'ahorro_cliente' => (float)$f['ahorro_cliente'] > 0 ? (float)$f['ahorro_cliente'] : null,
      'n_presupuestos' => isset($f['n_presupuestos']) ? (int)$f['n_presupuestos'] : null,
      'created_at' => $f['created_at'],
    ];
  }, $filas);

  // Metricas del periodo (mismos filtros de visibilidad y comercial).
  $mParams = [];
  $mWhere = [pipe_where_visibles($user, $mParams)];
  if (!empty($_GET['comercial_id']) && icc_puede_ver_comercial($user, (int)$_GET['comercial_id'])) {
    $mWhere[] = 'c.comercial_id = ?';
    $mParams[] = (int)$_GET['comercial_id'];
  }
  $w = implode(' AND ', $mWhere);
  $stmt = $db->prepare(
    "SELECT h.estado_nuevo, COUNT(DISTINCT h.cliente_id) AS n,
            AVG(CASE WHEN h.estado_nuevo = 'cliente_activo' THEN DATEDIFF(h.created_at, c.created_at) END) AS ciclo
     FROM historial_estado h JOIN clientes c ON c.id = h.cliente_id
     WHERE $w AND h.estado_nuevo IN ('cliente_activo','perdido') AND h.created_at >= (NOW() - INTERVAL $cerradosDias DAY)
       AND c.estado = h.estado_nuevo
     GROUP BY h.estado_nuevo"
  );
  $stmt->execute($mParams);
  $ganados = 0; $perdidos = 0; $ciclo = null;
  foreach ($stmt->fetchAll() as $r) {
    if ($r['estado_nuevo'] === 'cliente_activo') { $ganados = (int)$r['n']; $ciclo = $r['ciclo'] !== null ? round((float)$r['ciclo']) : null; }
    else $perdidos = (int)$r['n'];
  }
  $stmt = $db->prepare(
    "SELECT COALESCE(NULLIF(TRIM(c.motivo_perdida), ''), 'Sin motivo') AS motivo, COUNT(*) AS n
     FROM clientes c WHERE $w AND c.estado = 'perdido'
       AND COALESCE((SELECT MAX(h.created_at) FROM historial_estado h WHERE h.cliente_id = c.id AND h.estado_nuevo = 'perdido'), c.created_at) >= (NOW() - INTERVAL $cerradosDias DAY)
     GROUP BY motivo ORDER BY n DESC LIMIT 8"
  );
  $stmt->execute($mParams);
  $motivos = array_map(function ($r) { return ['motivo' => $r['motivo'], 'n' => (int)$r['n']]; }, $stmt->fetchAll());

  icc_json([
    'oportunidades' => $oportunidades,
    'metricas' => [
      'ganados' => $ganados,
      'perdidos' => $perdidos,
      'tasa_cierre' => $ganados + $perdidos ? round($ganados / ($ganados + $perdidos) * 100) : null,
      'ciclo_medio_dias' => $ciclo,
      'motivos_perdida' => $motivos,
      'cerrados_dias' => $cerradosDias,
    ],
    'con_valor' => $conValor,
    'con_citas' => $conCitas,
  ]);
}

// ======================================================================= PUT
if ($metodo === 'PUT') {
  icc_require_csrf();
  $id = (int)($_GET['id'] ?? 0);
  $stmt = $db->prepare('SELECT * FROM clientes WHERE id = ?');
  $stmt->execute([$id]);
  $cliente = $stmt->fetch();
  if (!$cliente || !icc_puede_ver_comercial($user, $cliente['comercial_id'])) icc_json(['error' => 'Oportunidad no encontrada'], 404);

  $body = icc_body();
  $sets = [];
  $valores = [];
  $nuevoEstado = null;
  if (array_key_exists('estado', $body)) {
    if (!in_array($body['estado'], PIPE_ESTADOS, true)) icc_json(['error' => 'Fase no valida'], 400);
    if ($body['estado'] !== $cliente['estado']) {
      $nuevoEstado = $body['estado'];
      $sets[] = 'estado = ?';
      $valores[] = $nuevoEstado;
      if ($nuevoEstado === 'perdido') {
        $motivo = trim((string)($body['motivo_perdida'] ?? ''));
        if ($motivo === '') icc_json(['error' => 'Indica el motivo por el que se ha perdido'], 400);
        $sets[] = 'motivo_perdida = ?';
        $valores[] = function_exists('mb_substr') ? mb_substr($motivo, 0, 255) : substr($motivo, 0, 255);
      }
    }
  }
  if ($conValor && array_key_exists('valor_estimado', $body)) {
    $v = $body['valor_estimado'];
    if ($v !== null && $v !== '' && (!is_numeric($v) || (float)$v < 0 || (float)$v > 99999999)) icc_json(['error' => 'Valor estimado no valido'], 400);
    $sets[] = 'valor_estimado = ?';
    $valores[] = $v === null || $v === '' ? null : round((float)$v, 2);
  }
  if ($conValor && array_key_exists('fecha_cierre_prevista', $body)) {
    $fc = (string)($body['fecha_cierre_prevista'] ?? '');
    if ($fc !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $fc)) icc_json(['error' => 'Fecha de cierre no valida'], 400);
    $sets[] = 'fecha_cierre_prevista = ?';
    $valores[] = $fc !== '' ? $fc : null;
  }
  if (!$sets) icc_json(['ok' => true]);

  $db->beginTransaction();
  try {
    $valores[] = $id;
    $db->prepare('UPDATE clientes SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($valores);
    if ($nuevoEstado !== null) {
      $db->prepare('INSERT INTO historial_estado (cliente_id, estado_anterior, estado_nuevo, cambiado_por) VALUES (?, ?, ?, ?)')
        ->execute([$id, $cliente['estado'], $nuevoEstado, $user['id']]);
    }
    $db->commit();
  } catch (Exception $e) {
    $db->rollBack();
    icc_json(['error' => icc_mensaje_error('No se pudo actualizar la oportunidad', $e, $user)], 500);
  }
  // Aviso al comercial cuando otra persona gana o pierde su oportunidad.
  if ($nuevoEstado !== null && in_array($nuevoEstado, ['cliente_activo', 'perdido'], true)
      && $cliente['comercial_id'] && (int)$cliente['comercial_id'] !== (int)$user['id']) {
    icc_notificar((int)$cliente['comercial_id'], 'cuenta', 'pipeline',
      ($nuevoEstado === 'cliente_activo' ? '🎉 ' : '') . $user['nombre'] . ' ha marcado ' . $cliente['razon_social'] . ' como ' . ($nuevoEstado === 'cliente_activo' ? 'ganado' : 'perdido'), $id);
  }
  icc_json(['ok' => true]);
}

icc_json(['error' => 'Metodo no permitido'], 405);
