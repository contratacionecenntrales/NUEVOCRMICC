<?php
/**
 * ICC CRM · Agenda comercial.
 *
 * GET  (filtros)              citas del rango (?desde ?hasta ?fecha ?comercial_id ?estado ?sector ?tipo ?cliente_id ?q)
 * GET  ?id=X                  una cita con su cliente y el historial de citas con ese cliente
 * GET  ?resumen=anio&anio=Y   recuento de citas por dia de todo un año (vista Año)
 * GET  ?kpis=1&fecha=Y-m-d    indicadores para la cabecera de la agenda
 * POST                        nueva cita
 * PUT  ?id=X                  editar / mover / resumen / estado
 * DELETE ?id=X                borrar
 *
 * GET  ?equipos=1             equipos (Jefe de equipo + comerciales) a los que se pueden asignar visitas
 *
 * Visibilidad: comercial = las suyas; jefe de equipo = su equipo y las visitas
 * "por asignar" de su equipo; backoffice = las de sus comerciales asignados (o
 * todas si no tiene ninguno) y siempre las que el mismo concerto; admin = todas.
 * Las funciones nuevas (cliente vinculado, tipo, resumen, proximos pasos,
 * presupuesto) requieren sql/migracion_agenda_avanzada.sql, y las visitas
 * asignadas a un equipo, sql/migracion_citas_equipos.sql.
 */
require __DIR__ . '/config.php';

$user = icc_require_auth();
icc_require_permiso_metodo($user, ['GET' => 'agenda.ver', 'POST' => 'agenda.gestionar', 'PUT' => 'agenda.gestionar', 'DELETE' => 'agenda.gestionar']);
$metodo = $_SERVER['REQUEST_METHOD'];
$id = isset($_GET['id']) ? (int)$_GET['id'] : null;
$db = icc_db();

/** true si ya se importo sql/migracion_agenda_avanzada.sql. */
function agenda_v2(PDO $db): bool {
  static $ok = null;
  if ($ok === null) {
    try {
      $db->query('SELECT cliente_id, tipo, resumen FROM citas LIMIT 0');
      $ok = true;
    } catch (PDOException $e) {
      $ok = false;
    }
  }
  return $ok;
}

/** true si ya se importo sql/migracion_citas_equipos.sql (visitas por equipo). */
function agenda_v3(PDO $db): bool {
  static $ok = null;
  if ($ok === null) {
    try {
      $db->query('SELECT equipo_id, asignada_por, creado_por FROM citas LIMIT 0');
      $ok = true;
    } catch (PDOException $e) {
      $ok = false;
    }
  }
  return $ok;
}

/**
 * Equipos en los que $user puede dejar visitas (Jefe de equipo + los
 * comerciales de ese equipo que $user ve):
 *  - Admin y Backoffice sin comerciales asignados: todos los equipos.
 *  - Backoffice con comerciales asignados: los equipos de esos comerciales.
 *  - Jefe de equipo: solo el suyo.
 *  - Comercial: ninguno.
 */
function agenda_equipos(PDO $db, array $user): array {
  static $cache = [];
  if (isset($cache[$user['id']])) return $cache[$user['id']];
  $equipos = [];
  if ($user['rol'] !== 'comercial') {
    $jefes = $db->query(
      "SELECT j.id, j.nombre, j.apellidos FROM usuarios j
       WHERE j.bloqueado = 0 AND (j.rol = 'jefe_de_equipo'
         OR (j.rol IN ('admin', 'super_admin', 'gerente', 'coordinador') AND EXISTS (SELECT 1 FROM usuarios x WHERE x.supervisor_id = j.id AND x.rol = 'comercial')))
       ORDER BY j.nombre"
    )->fetchAll();
    $stmt = $db->prepare("SELECT id, nombre, apellidos FROM usuarios WHERE supervisor_id = ? AND rol = 'comercial' AND bloqueado = 0 ORDER BY nombre");
    foreach ($jefes as $j) {
      if ($user['rol'] === 'jefe_de_equipo' && (int)$j['id'] !== (int)$user['id']) continue;
      $stmt->execute([$j['id']]);
      $comerciales = array_values(array_filter($stmt->fetchAll(), function ($c) use ($user) {
        return icc_puede_ver_comercial($user, (int)$c['id']);
      }));
      $restringido = icc_equipo_comercial_ids($user) !== null && $user['rol'] === 'backoffice';
      if ($restringido && !$comerciales) continue;
      $equipos[] = ['id' => (int)$j['id'], 'nombre' => $j['nombre'], 'apellidos' => $j['apellidos'], 'comerciales' => array_map(function ($c) {
        return ['id' => (int)$c['id'], 'nombre' => $c['nombre'], 'apellidos' => $c['apellidos']];
      }, $comerciales)];
    }
  }
  return $cache[$user['id']] = $equipos;
}

function agenda_equipo_ids(PDO $db, array $user): array {
  return array_map(function ($e) { return $e['id']; }, agenda_equipos($db, $user));
}

/** Puede $user ver (y por tanto gestionar) esta cita. */
function agenda_cita_visible(PDO $db, array $user, array $cita): bool {
  $comercialId = $cita['comercial_id'] ?? null;
  if ($comercialId !== null && icc_puede_ver_comercial($user, $comercialId)) return true;
  // Agendas compartidas (solo agenda) con un Backoffice.
  if ($comercialId !== null && in_array((int)$comercialId, icc_agendas_compartidas($user), true)) return true;
  if (!agenda_v3($db)) return false;
  if ($comercialId === null && icc_equipo_comercial_ids($user) === null) return true;
  if ($user['rol'] === 'backoffice' && (int)($cita['creado_por'] ?? 0) === (int)$user['id']) return true;
  return $comercialId === null && $cita['equipo_id'] !== null
    && in_array((int)$cita['equipo_id'], agenda_equipo_ids($db, $user), true);
}

function agenda_nombre_usuario(PDO $db, ?int $id): string {
  if (!$id) return '';
  $stmt = $db->prepare('SELECT nombre, apellidos FROM usuarios WHERE id = ?');
  $stmt->execute([$id]);
  $u = $stmt->fetch();
  return $u ? trim($u['nombre'] . ' ' . $u['apellidos']) : '';
}

function agenda_texto_cita(array $c): string {
  return $c['cliente_nombre'] . ' el ' . date('d/m/Y', strtotime($c['fecha'])) . ' a las ' . substr($c['hora_inicio'], 0, 5);
}

/**
 * Avisos de la campana tras crear o cambiar una cita ($antes = null al crearla):
 *  - al comercial cuando le asignan una visita (si no se la asigna el mismo),
 *  - al Jefe de equipo cuando entra una visita "por asignar" en su equipo,
 *  - a quien la concerto cuando se marca como realizada o KO.
 */
function agenda_notificar_cambios(PDO $db, array $user, ?array $antes, array $despues): void {
  $yo = (int)$user['id'];
  $quien = trim($user['nombre'] . ' ' . ($user['apellidos'] ?? ''));
  $tipo = 'cita:' . $despues['id'];
  $comercialNuevo = $despues['comercial_id'] !== null ? (int)$despues['comercial_id'] : null;
  $comercialAntes = $antes && $antes['comercial_id'] !== null ? (int)$antes['comercial_id'] : null;
  $equipoNuevo = isset($despues['equipo_id']) && $despues['equipo_id'] !== null ? (int)$despues['equipo_id'] : null;

  if ($comercialNuevo !== null && $comercialNuevo !== $yo && ($antes === null || $comercialAntes !== $comercialNuevo)) {
    icc_notificar($comercialNuevo, 'agenda', $tipo, '📅 ' . $quien . ' te ha asignado una visita: ' . agenda_texto_cita($despues));
  }
  $antesEnBandeja = $antes && $comercialAntes === null ? (int)($antes['equipo_id'] ?? 0) : null;
  if ($comercialNuevo === null && $equipoNuevo !== null && $equipoNuevo !== $yo && $antesEnBandeja !== $equipoNuevo) {
    icc_notificar($equipoNuevo, 'agenda', $tipo, '📥 Visita por asignar en tu equipo (concertada por ' . $quien . '): ' . agenda_texto_cita($despues));
  }
  $creador = isset($despues['creado_por']) && $despues['creado_por'] !== null ? (int)$despues['creado_por'] : null;
  if ($antes && $creador !== null && $creador !== $yo && $creador !== $comercialNuevo
      && $antes['estado'] !== $despues['estado'] && in_array($despues['estado'], ['realizada', 'ko'], true)) {
    $resultado = $despues['estado'] === 'realizada' ? 'realizada ✅' : 'KO ❌';
    icc_notificar($creador, 'agenda', $tipo, 'Resultado de la visita que concertaste: ' . agenda_texto_cita($despues) . ' — ' . $resultado . ' (' . $quien . ')');
  }
}

/**
 * Comercial y equipo de la cita segun lo pedido en $body. Devuelve null si
 * en una edicion ($actual) no se pide cambiar la asignacion.
 */
function agenda_resolver_asignacion(PDO $db, array $user, array $body, ?array $actual, bool $v3): ?array {
  $pideComercial = array_key_exists('comercial_id', $body);
  $pideEquipo = $v3 && array_key_exists('equipo_id', $body) && $body['equipo_id'] !== null && $body['equipo_id'] !== '';
  $supervisorDe = function (int $id) use ($db): ?int {
    $stmt = $db->prepare("SELECT supervisor_id FROM usuarios WHERE id = ?");
    $stmt->execute([$id]);
    $s = $stmt->fetch();
    return $s && $s['supervisor_id'] !== null ? (int)$s['supervisor_id'] : null;
  };

  // Un comercial solo agenda para si mismo y nunca reasigna.
  if ($user['rol'] === 'comercial') {
    return $actual === null ? ['comercial_id' => (int)$user['id'], 'equipo_id' => $supervisorDe((int)$user['id'])] : null;
  }
  if ($actual !== null && !$pideComercial && !$pideEquipo) return null;

  $comercialId = $pideComercial && $body['comercial_id'] !== null && $body['comercial_id'] !== '' ? (int)$body['comercial_id'] : null;
  $equipoId = $pideEquipo ? (int)$body['equipo_id'] : null;

  if ($comercialId !== null) {
    $esAgendaCompartida = in_array($comercialId, icc_agendas_compartidas($user), true);
    if (!icc_puede_ver_comercial($user, $comercialId) && !$esAgendaCompartida) icc_json(['error' => 'No puedes asignar citas a ese comercial'], 403);
    $equipoComercial = $comercialId === (int)$user['id'] && $user['rol'] === 'jefe_de_equipo' ? (int)$user['id'] : $supervisorDe($comercialId);
    if ($equipoId !== null && $equipoComercial !== $equipoId && $comercialId !== $equipoId) {
      icc_json(['error' => 'Ese comercial no pertenece al equipo elegido'], 400);
    }
    return ['comercial_id' => $comercialId, 'equipo_id' => $equipoId ?? $equipoComercial];
  }

  // Sin comercial: queda "por asignar" en la bandeja de un equipo.
  if (!$v3) {
    // Sin la migracion no existe la bandeja: se mantiene el comportamiento anterior.
    return $actual === null ? ['comercial_id' => (int)$user['id']] : null;
  }
  if ($equipoId === null && $actual !== null && $pideComercial) $equipoId = $actual['equipo_id'] !== null ? (int)$actual['equipo_id'] : null;
  if ($equipoId === null) {
    if ($actual === null && !$pideComercial) return ['comercial_id' => (int)$user['id'], 'equipo_id' => $supervisorDe((int)$user['id'])];
    icc_json(['error' => 'Elige el equipo al que se asigna la visita'], 400);
  }
  if (!in_array($equipoId, agenda_equipo_ids($db, $user), true)) {
    icc_json(['error' => 'No puedes asignar visitas a ese equipo'], 403);
  }
  return ['comercial_id' => null, 'equipo_id' => $equipoId];
}

$v2 = agenda_v2($db);
$v3 = $v2 && agenda_v3($db);
$sectoresValidos = $v2
  ? ['energia', 'telecomunicaciones', 'alarmas', 'multisectorial', 'seguros', 'financiero']
  : ['energia', 'telecomunicaciones', 'alarmas', 'multisectorial'];
$estadosValidos = $v2
  ? ['programada', 'confirmada', 'realizada', 'reprogramada', 'ko']
  : ['programada', 'realizada', 'reprogramada', 'ko'];
$tiposValidos = ['visita', 'llamada', 'reunion', 'videollamada', 'seguimiento', 'firma', 'otro'];

/**
 * Devuelve un aviso (no bloqueante) si ya existe otra cita del mismo
 * comercial que se solapa en horario con la franja dada, en la misma
 * fecha. Nunca impide guardar.
 */
function icc_aviso_solape_cita(PDO $db, int $comercialId, string $fecha, string $horaInicio, string $horaFin, ?int $excluirId = null): ?string {
  $sql = "SELECT cliente_nombre, hora_inicio, hora_fin FROM citas
          WHERE comercial_id = ? AND fecha = ? AND estado != 'ko'
            AND hora_inicio < ? AND hora_fin > ?";
  $params = [$comercialId, $fecha, $horaFin, $horaInicio];
  if ($excluirId !== null) {
    $sql .= ' AND id != ?';
    $params[] = $excluirId;
  }
  $stmt = $db->prepare($sql . ' LIMIT 1');
  $stmt->execute($params);
  $choque = $stmt->fetch();
  if (!$choque) return null;
  return 'Ojo: se solapa con la cita de ' . $choque['cliente_nombre'] . ' de ' . substr($choque['hora_inicio'], 0, 5) .
    ' a ' . substr($choque['hora_fin'], 0, 5) . '. Se ha guardado igualmente.';
}

function agenda_hora_valida($h): bool {
  return is_string($h) && preg_match('/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/', $h) === 1;
}

function agenda_fecha_valida($f): bool {
  return is_string($f) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $f) === 1;
}

/** Condicion de visibilidad (alias "c" = citas). */
function agenda_where_base(array $user, array &$where, array &$params): void {
  $db = icc_db();
  $v3 = agenda_v3($db);
  $ids = icc_equipo_comercial_ids($user);
  if ($ids !== null) {
    $o = ['c.comercial_id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')'];
    array_push($params, ...$ids);
    if ($v3) {
      if ($user['rol'] === 'backoffice') {
        $o[] = 'c.creado_por = ?';
        $params[] = (int)$user['id'];
      }
    }
    $compartidas = icc_agendas_compartidas($user);
    if ($compartidas) {
      $o[] = 'c.comercial_id IN (' . implode(',', array_fill(0, count($compartidas), '?')) . ')';
      array_push($params, ...$compartidas);
    }
    if ($v3) {
      $equipos = agenda_equipo_ids($db, $user);
      if ($equipos) {
        $o[] = '(c.comercial_id IS NULL AND c.equipo_id IN (' . implode(',', array_fill(0, count($equipos), '?')) . '))';
        array_push($params, ...$equipos);
      }
    }
    $where[] = '(' . implode(' OR ', $o) . ')';
  }
  if (!empty($_GET['comercial_id']) && (icc_puede_ver_comercial($user, (int)$_GET['comercial_id'])
      || in_array((int)$_GET['comercial_id'], icc_agendas_compartidas($user), true))) {
    $where[] = 'c.comercial_id = ?';
    $params[] = (int)$_GET['comercial_id'];
  }
  if ($v3 && !empty($_GET['sin_asignar'])) $where[] = 'c.comercial_id IS NULL';
  if ($v3 && !empty($_GET['equipo_id'])) {
    $where[] = 'c.equipo_id = ?';
    $params[] = (int)$_GET['equipo_id'];
  }
}

function agenda_cliente_visible(PDO $db, array $user, int $clienteId): ?array {
  $stmt = $db->prepare('SELECT * FROM clientes WHERE id = ?');
  $stmt->execute([$clienteId]);
  $cliente = $stmt->fetch();
  return $cliente && icc_puede_ver_comercial($user, $cliente['comercial_id']) ? $cliente : null;
}

// ======================================================================= GET
if ($metodo === 'GET') {
  $joinCliente = $v2 ? ' LEFT JOIN clientes cl ON cl.id = c.cliente_id' : '';
  $colsCliente = $v2 ? ', cl.razon_social AS cliente_razon_social, cl.estado AS cliente_estado' : '';
  if ($v3) {
    $joinCliente .= ' LEFT JOIN usuarios eq ON eq.id = c.equipo_id LEFT JOIN usuarios cr ON cr.id = c.creado_por';
    $colsCliente .= ', eq.nombre AS equipo_nombre, cr.nombre AS creado_por_nombre, cr.rol AS creado_por_rol';
  }

  if (!empty($_GET['equipos'])) {
    $compartidas = [];
    $idsCompartidas = icc_agendas_compartidas($user);
    if ($idsCompartidas) {
      $stmt = $db->prepare('SELECT id, nombre, apellidos, rol FROM usuarios WHERE bloqueado = 0 AND id IN (' . implode(',', array_fill(0, count($idsCompartidas), '?')) . ') ORDER BY nombre');
      $stmt->execute($idsCompartidas);
      $compartidas = array_map(function ($u) {
        return ['id' => (int)$u['id'], 'nombre' => $u['nombre'], 'apellidos' => $u['apellidos'], 'rol' => $u['rol']];
      }, $stmt->fetchAll());
    }
    icc_json(['equipos' => $v3 ? agenda_equipos($db, $user) : [], 'agenda_v3' => $v3, 'agendas_compartidas' => $compartidas]);
  }

  try {
    // --- Una cita con su cliente e historial
    if ($id !== null) {
      $stmt = $db->prepare("SELECT c.*, u.nombre AS comercial_nombre$colsCliente FROM citas c LEFT JOIN usuarios u ON u.id = c.comercial_id$joinCliente WHERE c.id = ?");
      $stmt->execute([$id]);
      $cita = $stmt->fetch();
      if (!$cita || !agenda_cita_visible($db, $user, $cita)) icc_json(['error' => 'Cita no encontrada'], 404);

      $cliente = null;
      $historial = [];
      $presupuestos = [];
      if ($v2 && $cita['cliente_id']) {
        $cliente = agenda_cliente_visible($db, $user, (int)$cita['cliente_id']);
        if ($cliente) {
          unset($cliente['upload_token']);
          $stmt = $db->prepare(
            'SELECT c.id, c.fecha, c.hora_inicio, c.hora_fin, c.tipo, c.estado, c.sector, c.resumen, c.proximos_pasos, u.nombre AS comercial_nombre
             FROM citas c LEFT JOIN usuarios u ON u.id = c.comercial_id
             WHERE c.cliente_id = ? ORDER BY c.fecha DESC, c.hora_inicio DESC LIMIT 50'
          );
          $stmt->execute([$cita['cliente_id']]);
          $historial = $stmt->fetchAll();
          $stmt = $db->prepare('SELECT id, sector, estado, created_at FROM presupuestos WHERE cliente_id = ? ORDER BY created_at DESC LIMIT 20');
          $stmt->execute([$cita['cliente_id']]);
          $presupuestos = $stmt->fetchAll();
        }
      } elseif ($v2) {
        // Sin cliente vinculado: historial por nombre de negocio (mismo comercial/equipo).
        $params = [$cita['cliente_nombre'], $id];
        $where = ['c.cliente_nombre = ?', 'c.id <> ?'];
        agenda_where_base($user, $where, $params);
        $stmt = $db->prepare('SELECT c.id, c.fecha, c.hora_inicio, c.hora_fin, c.tipo, c.estado, c.sector, c.resumen, c.proximos_pasos FROM citas c WHERE ' . implode(' AND ', $where) . ' ORDER BY c.fecha DESC LIMIT 30');
        $stmt->execute($params);
        $historial = $stmt->fetchAll();
      }
      icc_json(['cita' => $cita, 'cliente' => $cliente, 'historial' => $historial, 'presupuestos' => $presupuestos, 'agenda_v2' => $v2, 'agenda_v3' => $v3]);
    }

    // --- Recuento por dia de todo un año (vista Año)
    if (($_GET['resumen'] ?? '') === 'anio') {
      $anio = (int)($_GET['anio'] ?? date('Y'));
      $where = ['c.fecha BETWEEN ? AND ?'];
      $params = [sprintf('%04d-01-01', $anio), sprintf('%04d-12-31', $anio)];
      agenda_where_base($user, $where, $params);
      $stmt = $db->prepare(
        "SELECT c.fecha, COUNT(*) AS total, SUM(c.estado = 'realizada') AS realizadas, SUM(c.estado = 'ko') AS ko
         FROM citas c WHERE " . implode(' AND ', $where) . ' GROUP BY c.fecha ORDER BY c.fecha'
      );
      $stmt->execute($params);
      icc_json(['dias' => $stmt->fetchAll(), 'anio' => $anio]);
    }

    // --- Indicadores
    if (!empty($_GET['kpis'])) {
      $ref = agenda_fecha_valida($_GET['fecha'] ?? '') ? $_GET['fecha'] : date('Y-m-d');
      $where = [];
      $params = [];
      agenda_where_base($user, $where, $params);
      $w = $where ? ' AND ' . implode(' AND ', $where) : '';
      $sinResumen = $v2 ? "SUM(c.estado = 'realizada' AND (c.resumen IS NULL OR c.resumen = '') AND c.fecha >= (? - INTERVAL 60 DAY))" : '0';
      $sql = "SELECT
          SUM(c.fecha = ? AND c.estado <> 'ko') AS hoy,
          SUM(c.fecha BETWEEN (? - INTERVAL WEEKDAY(?) DAY) AND (? - INTERVAL WEEKDAY(?) DAY + INTERVAL 6 DAY)) AS semana,
          SUM(c.fecha BETWEEN DATE_FORMAT(?, '%Y-%m-01') AND LAST_DAY(?)) AS mes,
          SUM(c.fecha BETWEEN DATE_FORMAT(?, '%Y-%m-01') AND LAST_DAY(?) AND c.estado = 'realizada') AS mes_realizadas,
          SUM(c.fecha BETWEEN DATE_FORMAT(?, '%Y-%m-01') AND LAST_DAY(?) AND c.estado = 'ko') AS mes_ko,
          SUM(c.fecha < ? AND c.estado IN ('programada', 'confirmada', 'reprogramada')) AS sin_cerrar,
          $sinResumen AS sin_resumen" . ($v3 ? ",
          SUM(c.comercial_id IS NULL AND c.estado <> 'ko') AS por_asignar" : '') . "
        FROM citas c WHERE 1 = 1$w";
      $p = [$ref, $ref, $ref, $ref, $ref, $ref, $ref, $ref, $ref, $ref, $ref, $ref];
      if ($v2) $p[] = $ref;
      $stmt = $db->prepare($sql);
      $stmt->execute(array_merge($p, $params));
      $k = array_map('intval', $stmt->fetch());
      icc_json(['kpis' => $k, 'agenda_v2' => $v2, 'agenda_v3' => $v3]);
    }

    // --- Listado del rango
    $where = [];
    $params = [];
    agenda_where_base($user, $where, $params);
    if (agenda_fecha_valida($_GET['fecha'] ?? '')) {
      $where[] = 'c.fecha = ?';
      $params[] = $_GET['fecha'];
    }
    if (agenda_fecha_valida($_GET['desde'] ?? '')) {
      $where[] = 'c.fecha >= ?';
      $params[] = $_GET['desde'];
    }
    if (agenda_fecha_valida($_GET['hasta'] ?? '')) {
      $where[] = 'c.fecha <= ?';
      $params[] = $_GET['hasta'];
    }
    if (!empty($_GET['estado']) && in_array($_GET['estado'], $estadosValidos, true)) {
      $where[] = 'c.estado = ?';
      $params[] = $_GET['estado'];
    }
    if (!empty($_GET['sector']) && in_array($_GET['sector'], $sectoresValidos, true)) {
      $where[] = 'c.sector = ?';
      $params[] = $_GET['sector'];
    }
    if ($v2 && !empty($_GET['tipo']) && in_array($_GET['tipo'], $tiposValidos, true)) {
      $where[] = 'c.tipo = ?';
      $params[] = $_GET['tipo'];
    }
    if ($v2 && !empty($_GET['cliente_id'])) {
      $where[] = 'c.cliente_id = ?';
      $params[] = (int)$_GET['cliente_id'];
    }
    if (!empty($_GET['q'])) {
      $q = '%' . trim($_GET['q']) . '%';
      $where[] = '(c.cliente_nombre LIKE ? OR c.contacto_nombre LIKE ? OR c.telefono LIKE ? OR c.notas LIKE ?' . ($v2 ? ' OR c.resumen LIKE ?' : '') . ')';
      array_push($params, $q, $q, $q, $q);
      if ($v2) $params[] = $q;
    }

    $sql = "SELECT c.*, u.nombre AS comercial_nombre$colsCliente FROM citas c LEFT JOIN usuarios u ON u.id = c.comercial_id$joinCliente";
    if ($where) $sql .= ' WHERE ' . implode(' AND ', $where);
    $sql .= ' ORDER BY c.fecha ASC, c.hora_inicio ASC LIMIT 3000';
    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    icc_json(['citas' => $stmt->fetchAll(), 'agenda_v2' => $v2, 'agenda_v3' => $v3]);
  } catch (Exception $e) {
    icc_json(['error' => icc_mensaje_error('No se pudo cargar la agenda (¿falta importar sql/migracion_agenda.sql?)', $e, $user)], 500);
  }
}

// ============================================================ POST / PUT comun
/**
 * Lee y valida los campos de una cita del cuerpo de la peticion.
 * $parcial = true en PUT (solo los campos presentes).
 */
function agenda_leer_campos(PDO $db, array $user, array $body, bool $parcial, bool $v2, array $sectoresValidos, array $estadosValidos, array $tiposValidos, ?array $actual = null): array {
  $c = [];
  $texto = ['cliente_nombre' => 200, 'contacto_nombre' => 150, 'telefono' => 30, 'direccion' => 500, 'notas' => 5000];
  if ($v2) $texto += ['email' => 190, 'proximos_pasos' => 500, 'resumen' => 20000];
  foreach ($texto as $campo => $max) {
    if (array_key_exists($campo, $body)) $c[$campo] = substr(trim((string)$body[$campo]), 0, $max);
  }
  if (array_key_exists('fecha', $body)) {
    if (!agenda_fecha_valida($body['fecha'])) icc_json(['error' => 'Fecha no valida'], 400);
    $c['fecha'] = $body['fecha'];
  }
  foreach (['hora_inicio', 'hora_fin'] as $campo) {
    if (array_key_exists($campo, $body)) {
      if (!agenda_hora_valida($body[$campo])) icc_json(['error' => 'Hora no valida (formato HH:MM)'], 400);
      $c[$campo] = strlen($body[$campo]) === 5 ? $body[$campo] . ':00' : $body[$campo];
    }
  }
  if (array_key_exists('sector', $body)) {
    if (!in_array($body['sector'], $sectoresValidos, true)) icc_json(['error' => 'Sector no valido'], 400);
    $c['sector'] = $body['sector'];
  }
  if (array_key_exists('estado', $body)) {
    if (!in_array($body['estado'], $estadosValidos, true)) icc_json(['error' => 'Estado no valido'], 400);
    $c['estado'] = $body['estado'];
  }
  if ($v2 && array_key_exists('tipo', $body)) {
    if (!in_array($body['tipo'], $tiposValidos, true)) icc_json(['error' => 'Tipo de cita no valido'], 400);
    $c['tipo'] = $body['tipo'];
  }
  if ($v2 && array_key_exists('cliente_id', $body)) {
    if ($body['cliente_id'] === null || $body['cliente_id'] === '' || (int)$body['cliente_id'] === 0) {
      $c['cliente_id'] = null;
    } else {
      $cliente = agenda_cliente_visible($db, $user, (int)$body['cliente_id']);
      if (!$cliente) icc_json(['error' => 'Cliente no encontrado'], 404);
      $c['cliente_id'] = (int)$cliente['id'];
      if (empty($c['cliente_nombre']) && !$parcial) $c['cliente_nombre'] = $cliente['razon_social'];
    }
  }
  if ($v2 && array_key_exists('presupuesto_id', $body)) {
    $presId = (int)$body['presupuesto_id'];
    $clienteDeCita = $c['cliente_id'] ?? ($actual['cliente_id'] ?? null);
    if ($presId) {
      $stmt = $db->prepare('SELECT id FROM presupuestos WHERE id = ? AND cliente_id = ?');
      $stmt->execute([$presId, (int)$clienteDeCita]);
      if (!$stmt->fetch()) icc_json(['error' => 'El presupuesto no pertenece al cliente de la cita'], 400);
    }
    $c['presupuesto_id'] = $presId ?: null;
  }

  // Validaciones de conjunto (con los valores finales).
  $fin = array_merge($actual ?? [], $c);
  if (!$parcial) {
    foreach (['cliente_nombre' => 'Indica el negocio o cliente', 'fecha' => 'Indica la fecha', 'hora_inicio' => 'Indica la hora de inicio', 'hora_fin' => 'Indica la hora de fin'] as $campo => $msg) {
      if (empty($fin[$campo])) icc_json(['error' => $msg], 400);
    }
  }
  if (isset($fin['cliente_nombre']) && trim((string)$fin['cliente_nombre']) === '') icc_json(['error' => 'Indica el negocio o cliente'], 400);
  if (!empty($fin['hora_inicio']) && !empty($fin['hora_fin']) && $fin['hora_fin'] <= $fin['hora_inicio']) {
    icc_json(['error' => 'La hora de fin debe ser posterior a la de inicio'], 400);
  }
  return $c;
}

// ====================================================================== POST
if ($metodo === 'POST' && $id === null) {
  icc_require_csrf();
  $body = icc_body();
  $campos = agenda_leer_campos($db, $user, $body, false, $v2, $sectoresValidos, $estadosValidos, $tiposValidos);
  $asignacion = agenda_resolver_asignacion($db, $user, $body, null, $v3);
  $comercialId = $asignacion['comercial_id'];
  $campos['comercial_id'] = $comercialId;
  if ($v3) {
    $campos['equipo_id'] = $asignacion['equipo_id'] ?? null;
    if ($comercialId !== null && $comercialId !== (int)$user['id']) {
      $campos['asignada_por'] = (int)$user['id'];
      $campos['asignada_en'] = date('Y-m-d H:i:s');
    }
  }
  if (!isset($campos['sector'])) $campos['sector'] = 'energia';
  if ($v2) $campos['creado_por'] = (int)$user['id'];

  try {
    $cols = array_keys($campos);
    $db->prepare('INSERT INTO citas (' . implode(', ', $cols) . ') VALUES (' . implode(', ', array_fill(0, count($cols), '?')) . ')')
      ->execute(array_values($campos));
    $nuevoId = (int)$db->lastInsertId();
    if ($v3) agenda_notificar_cambios($db, $user, null, $campos + ['id' => $nuevoId, 'estado' => $campos['estado'] ?? 'programada']);
    icc_json([
      'id' => $nuevoId,
      'aviso' => $comercialId !== null ? icc_aviso_solape_cita($db, $comercialId, $campos['fecha'], $campos['hora_inicio'], $campos['hora_fin'], $nuevoId) : null,
    ], 201);
  } catch (Exception $e) {
    icc_json(['error' => icc_mensaje_error('No se pudo guardar la cita', $e, $user)], 500);
  }
}

// ======================================================================= PUT
if ($metodo === 'PUT' && $id !== null) {
  icc_require_csrf();
  try {
    $stmt = $db->prepare('SELECT * FROM citas WHERE id = ?');
    $stmt->execute([$id]);
    $cita = $stmt->fetch();
    if (!$cita || !agenda_cita_visible($db, $user, $cita)) icc_json(['error' => 'No encontrado'], 404);

    $body = icc_body();
    $campos = agenda_leer_campos($db, $user, $body, true, $v2, $sectoresValidos, $estadosValidos, $tiposValidos, $cita);
    // Reasignar (a un comercial o a la bandeja de un equipo): solo quien
    // gestiona equipo, y siempre a alguien/un equipo que ya pueda ver.
    $asignacion = agenda_resolver_asignacion($db, $user, $body, $cita, $v3);
    if ($asignacion !== null) {
      $cambiaComercial = $asignacion['comercial_id'] !== ($cita['comercial_id'] !== null ? (int)$cita['comercial_id'] : null);
      $campos['comercial_id'] = $asignacion['comercial_id'];
      if ($v3) {
        $campos['equipo_id'] = $asignacion['equipo_id'] ?? null;
        if ($cambiaComercial) {
          $campos['asignada_por'] = (int)$user['id'];
          $campos['asignada_en'] = date('Y-m-d H:i:s');
        }
      }
    }
    if (!$campos) icc_json(['ok' => true]);

    $sets = array_map(function ($k) { return "$k = ?"; }, array_keys($campos));
    $valores = array_values($campos);
    $valores[] = $id;
    $db->prepare('UPDATE citas SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($valores);

    $stmt = $db->prepare('SELECT * FROM citas WHERE id = ?');
    $stmt->execute([$id]);
    $a = $stmt->fetch();
    if ($v3 && $a) agenda_notificar_cambios($db, $user, $cita, $a);
    icc_json([
      'ok' => true,
      'aviso' => $a && $a['estado'] !== 'ko' && $a['comercial_id'] !== null && (isset($campos['fecha']) || isset($campos['hora_inicio']) || isset($campos['hora_fin']) || !empty($campos['comercial_id']))
        ? icc_aviso_solape_cita($db, (int)$a['comercial_id'], $a['fecha'], $a['hora_inicio'], $a['hora_fin'], $id)
        : null,
    ]);
  } catch (Exception $e) {
    icc_json(['error' => icc_mensaje_error('No se pudo actualizar la cita', $e, $user)], 500);
  }
}

// ==================================================================== DELETE
if ($metodo === 'DELETE' && $id !== null) {
  icc_require_csrf();
  try {
    $stmt = $db->prepare('SELECT * FROM citas WHERE id = ?');
    $stmt->execute([$id]);
    $cita = $stmt->fetch();
    if (!$cita || !agenda_cita_visible($db, $user, $cita)) icc_json(['error' => 'No encontrado'], 404);
    $db->prepare('DELETE FROM citas WHERE id = ?')->execute([$id]);
    icc_json(['ok' => true]);
  } catch (Exception $e) {
    icc_json(['error' => icc_mensaje_error('No se pudo borrar la cita', $e, $user)], 500);
  }
}

icc_json(['error' => 'Peticion no valida'], 404);
