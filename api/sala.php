<?php
/**
 * ICC CRM · Sala de ventas en directo (datos reales de la base de datos).
 *
 * GET ?periodo=hoy|semana|mes   todo en una llamada: actividad, KPIs, rankings,
 *                               objetivos del mes y mapa por provincias.
 * GET ?solo_eventos=1&desde=Y-m-d H:i:s   solo la actividad nueva (refresco).
 *
 * Privacidad: los rankings son cifras agregadas y nombres de comerciales
 * (internos). En la actividad, el nombre del cliente y el enlace solo salen si
 * quien consulta puede ver a ese comercial; si no, un texto generico.
 *
 * Puntos del ranking (documentado tambien en la pantalla):
 *   contrato OK = 10 · contrato dado de alta = 5 · cita realizada = 2 · cliente nuevo = 1
 */
require __DIR__ . '/config.php';

$user = icc_require_auth();
if ($_SERVER['REQUEST_METHOD'] !== 'GET') icc_json(['error' => 'Metodo no permitido'], 405);
$db = icc_db();

function sala_existe(PDO $db, string $sql): bool {
  try {
    $db->query($sql);
    return true;
  } catch (PDOException $e) {
    return false;
  }
}

function sala_filas(PDO $db, string $sql, array $params = []): array {
  try {
    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    return $stmt->fetchAll();
  } catch (PDOException $e) {
    error_log('ICC sala: ' . $e->getMessage());
    return [];
  }
}

$ahora = (string)$db->query('SELECT NOW()')->fetchColumn();
$hoy = substr($ahora, 0, 10);

$conCmpEne = sala_existe($db, 'SELECT 1 FROM cmp_ene_informes LIMIT 0');
$conCmpTel = sala_existe($db, 'SELECT 1 FROM cmp_tel_informes LIMIT 0');
$conNovedades = sala_existe($db, 'SELECT 1 FROM tarifas_novedades LIMIT 0');
$conOficinas = sala_existe($db, 'SELECT 1 FROM oficinas LIMIT 0') && sala_existe($db, 'SELECT oficina_id FROM usuarios LIMIT 0');
$conFicha = sala_existe($db, 'SELECT provincia, objetivo_contratos_mes, objetivo_kw_mes FROM agentes_ficha LIMIT 0');

// Usuarios (nombre visible) — solo nombres internos.
$colsUsuarios = 'id, nombre, apellidos, rol, supervisor_id, bloqueado' . ($conOficinas ? ', oficina_id' : '');
$usuarios = [];
foreach (sala_filas($db, "SELECT $colsUsuarios FROM usuarios") as $u) $usuarios[(int)$u['id']] = $u;
$nombre = function ($id) use ($usuarios): string {
  if ($id === null || !isset($usuarios[(int)$id])) return '';
  $u = $usuarios[(int)$id];
  return trim($u['nombre'] . ' ' . ($u['apellidos'] ?? ''));
};

// ----------------------------------------------------------------- Actividad
function sala_eventos(PDO $db, array $user, string $desde, callable $nombre, bool $conCmpEne, bool $conCmpTel, bool $conNovedades): array {
  $ev = [];
  $puedeVer = function ($comercialId) use ($user): bool {
    return $comercialId !== null && icc_puede_ver_comercial($user, (int)$comercialId);
  };
  $add = function (array $e) use (&$ev) { $ev[] = $e; };

  foreach (sala_filas($db, 'SELECT id, comercial_id, cliente_id, sector, kw, titular, created_at FROM contratos WHERE created_at > ? ORDER BY created_at DESC LIMIT 40', [$desde]) as $r) {
    $ve = $puedeVer($r['comercial_id']);
    $add(['id' => 'contrato-' . $r['id'], 'tipo' => 'contrato', 'fecha' => $r['created_at'], 'comercial_id' => $r['comercial_id'] !== null ? (int)$r['comercial_id'] : null,
      'quien' => $nombre($r['comercial_id']), 'cliente' => $ve ? $r['titular'] : null, 'sector' => $r['sector'],
      'kw' => $r['kw'] !== null ? (float)$r['kw'] : null, 'href' => $ve ? '#/contratos?q=' . rawurlencode((string)$r['titular']) : null]);
  }
  foreach (sala_filas($db, "SELECT id, comercial_id, sector, kw, titular, estado, updated_at FROM contratos WHERE estado IN ('ok','verificado') AND updated_at > created_at + INTERVAL 1 MINUTE AND updated_at > ? ORDER BY updated_at DESC LIMIT 40", [$desde]) as $r) {
    $ve = $puedeVer($r['comercial_id']);
    $add(['id' => 'contrato_ok-' . $r['id'] . '-' . $r['updated_at'], 'tipo' => 'contrato_ok', 'fecha' => $r['updated_at'], 'comercial_id' => $r['comercial_id'] !== null ? (int)$r['comercial_id'] : null,
      'quien' => $nombre($r['comercial_id']), 'cliente' => $ve ? $r['titular'] : null, 'sector' => $r['sector'], 'estado' => $r['estado'],
      'kw' => $r['kw'] !== null ? (float)$r['kw'] : null, 'href' => $ve ? '#/contratos?estado=' . $r['estado'] : null]);
  }
  foreach (sala_filas($db, 'SELECT id, comercial_id, razon_social, created_at FROM clientes WHERE created_at > ? ORDER BY created_at DESC LIMIT 40', [$desde]) as $r) {
    $ve = $puedeVer($r['comercial_id']);
    $add(['id' => 'cliente-' . $r['id'], 'tipo' => 'cliente', 'fecha' => $r['created_at'], 'comercial_id' => $r['comercial_id'] !== null ? (int)$r['comercial_id'] : null,
      'quien' => $nombre($r['comercial_id']), 'cliente' => $ve ? $r['razon_social'] : null, 'href' => $ve ? '#/clientes/' . $r['id'] : null]);
  }
  foreach (sala_filas($db, "SELECT h.id, h.cliente_id, h.estado_nuevo, h.cambiado_por, h.created_at, c.razon_social, c.comercial_id
                            FROM historial_estado h JOIN clientes c ON c.id = h.cliente_id
                            WHERE h.created_at > ? AND h.estado_nuevo <> 'lead_captado' AND (h.estado_anterior IS NULL OR h.estado_anterior <> h.estado_nuevo)
                            ORDER BY h.created_at DESC LIMIT 40", [$desde]) as $r) {
    $ve = $puedeVer($r['comercial_id']);
    $add(['id' => 'fase-' . $r['id'], 'tipo' => 'fase', 'fecha' => $r['created_at'], 'comercial_id' => $r['comercial_id'] !== null ? (int)$r['comercial_id'] : null,
      'quien' => $nombre($r['comercial_id'] ?? $r['cambiado_por']), 'cliente' => $ve ? $r['razon_social'] : null, 'estado' => $r['estado_nuevo'],
      'href' => $ve ? '#/pipeline?fase=' . $r['estado_nuevo'] : null]);
  }
  foreach (sala_filas($db, 'SELECT id, comercial_id, creado_por, cliente_nombre, sector, fecha, created_at FROM citas WHERE created_at > ? ORDER BY created_at DESC LIMIT 40', [$desde]) as $r) {
    $ve = $puedeVer($r['comercial_id']) || (int)($r['creado_por'] ?? 0) === (int)$user['id'];
    $add(['id' => 'cita-' . $r['id'], 'tipo' => 'cita', 'fecha' => $r['created_at'], 'comercial_id' => $r['comercial_id'] !== null ? (int)$r['comercial_id'] : null,
      'quien' => $nombre($r['creado_por'] ?? $r['comercial_id']), 'para' => $r['comercial_id'] !== null && (int)$r['comercial_id'] !== (int)($r['creado_por'] ?? 0) ? $nombre($r['comercial_id']) : '',
      'cliente' => $ve ? $r['cliente_nombre'] : null, 'sector' => $r['sector'], 'dia' => $r['fecha'], 'href' => $ve ? '#/agenda?vista=dia&fecha=' . $r['fecha'] . '&cita=' . $r['id'] : null]);
  }
  foreach (sala_filas($db, "SELECT id, comercial_id, cliente_nombre, sector, fecha, updated_at FROM citas WHERE estado = 'realizada' AND updated_at > ? AND updated_at > created_at + INTERVAL 1 MINUTE ORDER BY updated_at DESC LIMIT 40", [$desde]) as $r) {
    $ve = $puedeVer($r['comercial_id']);
    $add(['id' => 'cita_ok-' . $r['id'], 'tipo' => 'cita_ok', 'fecha' => $r['updated_at'], 'comercial_id' => $r['comercial_id'] !== null ? (int)$r['comercial_id'] : null,
      'quien' => $nombre($r['comercial_id']), 'cliente' => $ve ? $r['cliente_nombre'] : null, 'sector' => $r['sector'],
      'href' => $ve ? '#/agenda?vista=dia&fecha=' . $r['fecha'] . '&cita=' . $r['id'] : null]);
  }
  foreach (sala_filas($db, "SELECT p.id, p.comercial_id, p.sector, p.updated_at, c.razon_social FROM presupuestos p LEFT JOIN clientes c ON c.id = p.cliente_id
                            WHERE p.estado = 'cerrado' AND p.updated_at > ? ORDER BY p.updated_at DESC LIMIT 40", [$desde]) as $r) {
    $ve = $puedeVer($r['comercial_id']);
    $add(['id' => 'presupuesto-' . $r['id'], 'tipo' => 'presupuesto', 'fecha' => $r['updated_at'], 'comercial_id' => $r['comercial_id'] !== null ? (int)$r['comercial_id'] : null,
      'quien' => $nombre($r['comercial_id']), 'cliente' => $ve ? $r['razon_social'] : null, 'sector' => $r['sector'], 'href' => $ve ? '#/presupuestos/' . $r['id'] : null]);
  }
  foreach ([['cmp_ene_informes', 'energia', $conCmpEne], ['cmp_tel_informes', 'telefonia', $conCmpTel]] as $cfg) {
    if (!$cfg[2]) continue;
    foreach (sala_filas($db, "SELECT id, usuario_id, cliente_nombre, ahorro_anual, created_at FROM {$cfg[0]} WHERE created_at > ? ORDER BY created_at DESC LIMIT 40", [$desde]) as $r) {
      $ve = $puedeVer($r['usuario_id']);
      $add(['id' => 'informe_' . $cfg[1] . '-' . $r['id'], 'tipo' => 'informe', 'fecha' => $r['created_at'], 'comercial_id' => $r['usuario_id'] !== null ? (int)$r['usuario_id'] : null,
        'quien' => $nombre($r['usuario_id']), 'cliente' => $ve ? $r['cliente_nombre'] : null, 'sector' => $cfg[1],
        'ahorro' => $r['ahorro_anual'] !== null ? (float)$r['ahorro_anual'] : null, 'href' => $ve ? '#/comparador' : null]);
    }
  }
  if ($conNovedades) {
    foreach (sala_filas($db, 'SELECT id, tipo, accion, titulo, autor_id, created_at FROM tarifas_novedades WHERE created_at > ? ORDER BY created_at DESC LIMIT 40', [$desde]) as $r) {
      $add(['id' => 'tarifa-' . $r['id'], 'tipo' => 'tarifa', 'fecha' => $r['created_at'], 'comercial_id' => null, 'quien' => $nombre($r['autor_id']),
        'cliente' => null, 'sector' => $r['tipo'], 'accion' => $r['accion'], 'titulo' => $r['titulo'], 'href' => '#/comparador/novedades']);
    }
  }
  usort($ev, function ($a, $b) { return strcmp((string)$b['fecha'], (string)$a['fecha']); });
  return array_slice($ev, 0, 40);
}

$desde = isset($_GET['desde']) && preg_match('/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}(:\d{2})?)?$/', $_GET['desde']) ? $_GET['desde'] : null;

if (!empty($_GET['solo_eventos'])) {
  $eventos = sala_eventos($db, $user, $desde ?? date('Y-m-d H:i:s', strtotime($ahora . ' -1 day')), $nombre, $conCmpEne, $conCmpTel, $conNovedades);
  icc_json(['ahora' => $ahora, 'eventos' => $eventos]);
}

// ------------------------------------------------------------------ Periodo
$periodo = in_array($_GET['periodo'] ?? '', ['hoy', 'semana', 'mes'], true) ? $_GET['periodo'] : 'mes';
$inicioMes = substr($hoy, 0, 7) . '-01';
if ($periodo === 'hoy') {
  $inicio = $hoy;
} elseif ($periodo === 'semana') {
  $inicio = date('Y-m-d', strtotime($hoy . ' -' . ((int)date('N', strtotime($hoy)) - 1) . ' days'));
} else {
  $inicio = $inicioMes;
}

/** Actividad por comercial desde $desdeFecha (incluida) hasta hoy. */
function sala_actividad(PDO $db, string $desdeFecha, string $hoy): array {
  $act = [];
  $sumar = function ($id, $clave, $valor) use (&$act) {
    if ($id === null) return;
    $id = (int)$id;
    if (!isset($act[$id])) $act[$id] = ['contratos' => 0, 'ok' => 0, 'kw' => 0.0, 'citas' => 0, 'clientes' => 0];
    $act[$id][$clave] += $valor;
  };
  foreach (sala_filas($db, 'SELECT comercial_id, COUNT(*) n, COALESCE(SUM(kw), 0) kw FROM contratos WHERE fecha_alta >= ? AND fecha_alta <= ? GROUP BY comercial_id', [$desdeFecha, $hoy]) as $r) {
    $sumar($r['comercial_id'], 'contratos', (int)$r['n']);
    $sumar($r['comercial_id'], 'kw', (float)$r['kw']);
  }
  foreach (sala_filas($db, "SELECT comercial_id, COUNT(*) n FROM contratos WHERE estado = 'ok' AND COALESCE(fecha_activacion, fecha_alta) >= ? AND COALESCE(fecha_activacion, fecha_alta) <= ? GROUP BY comercial_id", [$desdeFecha, $hoy]) as $r) {
    $sumar($r['comercial_id'], 'ok', (int)$r['n']);
  }
  foreach (sala_filas($db, "SELECT comercial_id, COUNT(*) n FROM citas WHERE estado = 'realizada' AND fecha >= ? AND fecha <= ? GROUP BY comercial_id", [$desdeFecha, $hoy]) as $r) {
    $sumar($r['comercial_id'], 'citas', (int)$r['n']);
  }
  foreach (sala_filas($db, 'SELECT comercial_id, COUNT(*) n FROM clientes WHERE created_at >= ? GROUP BY comercial_id', [$desdeFecha . ' 00:00:00']) as $r) {
    $sumar($r['comercial_id'], 'clientes', (int)$r['n']);
  }
  foreach ($act as &$a) {
    $a['kw'] = round($a['kw'], 2);
    $a['puntos'] = $a['ok'] * 10 + $a['contratos'] * 5 + $a['citas'] * 2 + $a['clientes'];
  }
  return $act;
}

$act = sala_actividad($db, $inicio, $hoy);
$vacio = ['contratos' => 0, 'ok' => 0, 'kw' => 0.0, 'citas' => 0, 'clientes' => 0, 'puntos' => 0];
$ordenar = function (array &$lista) {
  usort($lista, function ($a, $b) {
    return [$b['puntos'], $b['ok'], $b['contratos'], $b['kw']] <=> [$a['puntos'], $a['ok'], $a['contratos'], $a['kw']] ?: strcmp($a['nombre'], $b['nombre']);
  });
};

// Por comercial: comerciales y jefes activos (y cualquiera con actividad).
$porComercial = [];
foreach ($usuarios as $id => $u) {
  $tiene = isset($act[$id]);
  if (!$tiene && ((int)$u['bloqueado'] === 1 || !in_array($u['rol'], ['comercial', 'jefe_de_equipo'], true))) continue;
  $porComercial[] = array_merge(['id' => $id, 'nombre' => $nombre($id), 'rol' => $u['rol']], $act[$id] ?? $vacio);
}
$ordenar($porComercial);
$miPosicion = null;
foreach ($porComercial as $i => $fila) if ($fila['id'] === (int)$user['id']) $miPosicion = $i + 1;

// Por equipo: el jefe y sus comerciales.
$equipos = [];
foreach ($usuarios as $id => $u) {
  $lider = $u['rol'] === 'jefe_de_equipo' ? $id : ($u['rol'] === 'comercial' && $u['supervisor_id'] !== null ? (int)$u['supervisor_id'] : null);
  if ($lider === null || !isset($usuarios[$lider])) continue;
  if (!isset($equipos[$lider])) $equipos[$lider] = array_merge(['id' => $lider, 'nombre' => 'Equipo de ' . $nombre($lider), 'personas' => 0], $vacio);
  $equipos[$lider]['personas']++;
  foreach ($act[$id] ?? [] as $k => $v) $equipos[$lider][$k] += $v;
}
$porEquipo = array_values($equipos);
foreach ($porEquipo as &$e) $e['kw'] = round($e['kw'], 2);
unset($e);
$ordenar($porEquipo);

// Por oficina (si existe la red de oficinas).
$porOficina = [];
$oficinas = $conOficinas ? sala_filas($db, 'SELECT id, nombre, provincia, ciudad FROM oficinas WHERE activa = 1') : [];
if ($conOficinas) {
  $ofi = [];
  foreach ($oficinas as $o) $ofi[(int)$o['id']] = array_merge(['id' => (int)$o['id'], 'nombre' => $o['nombre'], 'provincia' => $o['provincia'], 'personas' => 0], $vacio);
  foreach ($usuarios as $id => $u) {
    $oid = isset($u['oficina_id']) && $u['oficina_id'] !== null ? (int)$u['oficina_id'] : null;
    if ($oid === null || !isset($ofi[$oid])) continue;
    $ofi[$oid]['personas']++;
    foreach ($act[$id] ?? [] as $k => $v) $ofi[$oid][$k] += $v;
  }
  $porOficina = array_values($ofi);
  foreach ($porOficina as &$o) $o['kw'] = round($o['kw'], 2);
  unset($o);
  $ordenar($porOficina);
}

// KPIs del periodo (toda la empresa).
$kpis = $vacio + ['activos' => 0];
foreach ($act as $a) {
  foreach (['contratos', 'ok', 'kw', 'citas', 'clientes', 'puntos'] as $k) $kpis[$k] += $a[$k];
  if ($a['puntos'] > 0) $kpis['activos']++;
}
$kpis['kw'] = round($kpis['kw'], 2);

// Objetivos del mes: suma de los objetivos de las fichas de agentes activos;
// si nadie tiene objetivo, 20 contratos OK (el mismo que usa Inicio).
$actMes = $periodo === 'mes' ? $act : sala_actividad($db, $inicioMes, $hoy);
$okMes = 0;
$kwMes = 0.0;
foreach ($actMes as $a) {
  $okMes += $a['ok'];
  $kwMes += $a['kw'];
}
$objContratos = 0;
$objKw = 0.0;
$miObjetivo = null;
if ($conFicha) {
  foreach (sala_filas($db, 'SELECT f.usuario_id, f.objetivo_contratos_mes, f.objetivo_kw_mes FROM agentes_ficha f JOIN usuarios u ON u.id = f.usuario_id WHERE u.bloqueado = 0') as $f) {
    $objContratos += (int)$f['objetivo_contratos_mes'];
    $objKw += (float)$f['objetivo_kw_mes'];
    if ((int)$f['usuario_id'] === (int)$user['id'] && (int)$f['objetivo_contratos_mes'] > 0) {
      $miObjetivo = ['objetivo' => (int)$f['objetivo_contratos_mes'], 'ok' => (int)($actMes[(int)$user['id']]['ok'] ?? 0)];
    }
  }
}
$objetivos = [
  'contratos' => ['objetivo' => $objContratos > 0 ? $objContratos : 20, 'actual' => $okMes, 'fuente' => $objContratos > 0 ? 'fichas' : 'por_defecto'],
  'kw' => $objKw > 0 ? ['objetivo' => round($objKw, 2), 'actual' => round($kwMes, 2)] : null,
  'mio' => $miObjetivo,
  'dias_mes' => (int)date('t', strtotime($hoy)),
  'dia' => (int)substr($hoy, 8, 2),
];

// Mapa por provincia: oficinas si existen; si no, la provincia de la ficha de cada agente.
$mapa = [];
$fuenteMapa = 'ninguna';
if ($conOficinas && $oficinas) {
  $fuenteMapa = 'oficinas';
  $provDeOficina = [];
  foreach ($oficinas as $o) {
    if (trim($o['provincia']) === '') continue;
    $p = trim($o['provincia']);
    $provDeOficina[(int)$o['id']] = $p;
    if (!isset($mapa[$p])) $mapa[$p] = ['provincia' => $p, 'oficinas' => 0, 'personas' => 0, 'contratos' => 0, 'puntos' => 0];
    $mapa[$p]['oficinas']++;
  }
  foreach ($usuarios as $id => $u) {
    $p = $provDeOficina[(int)($u['oficina_id'] ?? 0)] ?? null;
    if ($p === null) continue;
    $mapa[$p]['personas']++;
    $mapa[$p]['contratos'] += $act[$id]['contratos'] ?? 0;
    $mapa[$p]['puntos'] += $act[$id]['puntos'] ?? 0;
  }
} elseif ($conFicha) {
  foreach (sala_filas($db, "SELECT f.usuario_id, f.provincia FROM agentes_ficha f JOIN usuarios u ON u.id = f.usuario_id WHERE u.bloqueado = 0 AND f.provincia <> ''") as $f) {
    $fuenteMapa = 'fichas';
    $p = trim($f['provincia']);
    if (!isset($mapa[$p])) $mapa[$p] = ['provincia' => $p, 'oficinas' => 0, 'personas' => 0, 'contratos' => 0, 'puntos' => 0];
    $mapa[$p]['personas']++;
    $mapa[$p]['contratos'] += $act[(int)$f['usuario_id']]['contratos'] ?? 0;
    $mapa[$p]['puntos'] += $act[(int)$f['usuario_id']]['puntos'] ?? 0;
  }
}

$eventos = sala_eventos($db, $user, $desde ?? date('Y-m-d H:i:s', strtotime($ahora . ' -30 days')), $nombre, $conCmpEne, $conCmpTel, $conNovedades);

icc_json([
  'ahora' => $ahora,
  'periodo' => $periodo,
  'inicio' => $inicio,
  'kpis' => $kpis,
  'eventos' => $eventos,
  'ranking' => [
    'comerciales' => array_slice($porComercial, 0, 50),
    'equipos' => $porEquipo,
    'oficinas' => $porOficina,
    'mi_posicion' => $miPosicion,
    'total_comerciales' => count($porComercial),
  ],
  'objetivos' => $objetivos,
  'mapa' => ['fuente' => $fuenteMapa, 'provincias' => array_values($mapa)],
  'con_oficinas' => $conOficinas,
]);
