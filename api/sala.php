<?php
/**
 * ICC CRM · Sala de ventas en directo (datos reales de la base de datos).
 *
 * GET ?periodo=hoy|semana|mes   todo en una llamada: actividad, KPIs, rankings,
 *                               objetivos del mes y mapa por provincias.
 * GET ?solo_eventos=1&desde=Y-m-d H:i:s   solo la actividad nueva (refresco).
 * GET ?solo_eventos=1&ventana=168         actividad de las ultimas N horas (cinta).
 *
 * Privacidad: direccion (Admin, Gerente, Coordinador, Super Admin) ve todos los
 * nombres. El resto ve nombres solo de su propio equipo (y de quien tiene
 * asignado); de los demas, "Comercial · Provincia" o "Equipo · Provincia".
 * Nunca salen emails ni telefonos. El nombre del cliente y el enlace solo
 * salen si quien consulta puede ver a ese comercial.
 *
 * Anuncios de direccion (api/anuncios.php): salen como eventos y en el mapa.
 * Insights: frases calculadas con los datos reales del CRM.
 *
 * Puntos del ranking (documentado tambien en la pantalla):
 *   contrato OK = 10 · contrato dado de alta = 5 · cita realizada = 2 · cliente nuevo = 1
 */
require __DIR__ . '/config.php';
require __DIR__ . '/anuncios_lib.php';

$user = icc_require_auth();
if ($_SERVER['REQUEST_METHOD'] !== 'GET') icc_json(['error' => 'Metodo no permitido'], 405);
// La sala completa (rankings, objetivos, mapa) es para todos menos los comerciales.
// Los comerciales solo reciben la actividad de la cinta en directo (solo_eventos).
if ((string)$user['rol'] === 'comercial' && empty($_GET['solo_eventos'])) {
  icc_json(['error' => 'La sala de ventas no está disponible para tu perfil'], 403);
}
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
$colsUsuarios = 'id, nombre, apellidos, rol, supervisor_id, bloqueado, avatar_ruta' . ($conOficinas ? ', oficina_id' : '');
$usuarios = [];
foreach (sala_filas($db, "SELECT $colsUsuarios FROM usuarios") as $u) $usuarios[(int)$u['id']] = $u;
$nombreReal = function ($id) use ($usuarios): string {
  if ($id === null || !isset($usuarios[(int)$id])) return '';
  $u = $usuarios[(int)$id];
  return trim($u['nombre'] . ' ' . ($u['apellidos'] ?? ''));
};

// Provincia de cada persona: la de su oficina y, si no, la de su ficha.
$provDe = [];
if ($conFicha) {
  foreach (sala_filas($db, "SELECT usuario_id, provincia FROM agentes_ficha WHERE provincia <> ''") as $f) $provDe[(int)$f['usuario_id']] = trim($f['provincia']);
}
if ($conOficinas) {
  foreach (sala_filas($db, "SELECT u.id, o.provincia FROM usuarios u JOIN oficinas o ON o.id = u.oficina_id WHERE o.provincia <> ''") as $f) $provDe[(int)$f['id']] = trim($f['provincia']);
}

// Lider de equipo de cada persona (el jefe es su propio lider).
$liderDe = function ($id) use ($usuarios): ?int {
  if ($id === null || !isset($usuarios[(int)$id])) return null;
  $u = $usuarios[(int)$id];
  if ($u['rol'] === 'jefe_de_equipo') return (int)$id;
  if ($u['supervisor_id'] !== null && isset($usuarios[(int)$u['supervisor_id']])) return (int)$u['supervisor_id'];
  return null;
};
$esDireccion = icc_es_rol_admin((string)$user['rol']);
$miId = (int)$user['id'];
$miLider = $liderDe($miId);
$visiblesCache = [];
/** true si quien consulta puede ver el nombre de esta persona. */
$nombreVisible = function ($id) use (&$visiblesCache, $esDireccion, $miId, $miLider, $liderDe, $user, $usuarios): bool {
  if ($esDireccion) return true;
  if ($id === null) return false;
  $id = (int)$id;
  if (isset($visiblesCache[$id])) return $visiblesCache[$id];
  $ok = $id === $miId
    || ($miLider !== null && $liderDe($id) === $miLider)
    || icc_puede_ver_comercial($user, $id)
    // El personal interno (tramitacion, direccion) no es de la red de ventas.
    || (isset($usuarios[$id]) && !in_array($usuarios[$id]['rol'], ['comercial', 'jefe_de_equipo'], true));
  return $visiblesCache[$id] = $ok;
};
$etiquetaAnonima = function ($id) use ($usuarios, $provDe): string {
  $rol = isset($usuarios[(int)$id]) ? $usuarios[(int)$id]['rol'] : 'comercial';
  $base = $rol === 'jefe_de_equipo' ? 'Jefe de equipo' : 'Comercial';
  return isset($provDe[(int)$id]) ? $base . ' · ' . $provDe[(int)$id] : $base;
};
/** Foto de perfil de una persona, solo si su nombre es visible y es quien aparece en el evento. */
$fotoDe = function ($id, string $quien) use ($usuarios, $nombreVisible, $nombreReal): ?string {
  if (!$nombreVisible($id) || $nombreReal($id) !== $quien || empty($usuarios[(int)$id]['avatar_ruta'])) return null;
  return 'api/descargar.php?tipo=avatares&ruta=' . rawurlencode($usuarios[(int)$id]['avatar_ruta']);
};
/** Nombre que ve quien consulta: el real o el anonimo. */
$nombre = function ($id) use ($nombreReal, $nombreVisible, $etiquetaAnonima): string {
  if ($id === null) return '';
  if ($id !== null && (int)$id === 0) return '';
  return $nombreVisible($id) ? $nombreReal($id) : $etiquetaAnonima($id);
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

/** Anuncios vigentes de direccion (tabla de sql/migracion_anuncios.sql). */
function sala_anuncios(PDO $db): array {
  try {
    return icc_anuncios_vigentes($db);
  } catch (PDOException $e) {
    error_log('ICC sala anuncios: ' . $e->getMessage());
    return [];
  }
}

/** Anade la provincia a cada evento, quita el id del comercial y suma los anuncios. */
function sala_completar(array $eventos, array $anuncios, array $provDe, string $desde, ?callable $fotoDe = null): array {
  foreach ($eventos as &$e) {
    $cid = $e['comercial_id'];
    $e['provincia'] = $cid !== null && isset($provDe[$cid]) ? $provDe[$cid] : '';
    $e['foto'] = $fotoDe && $cid !== null ? $fotoDe($cid, (string)$e['quien']) : null;
    unset($e['comercial_id']);
  }
  unset($e);
  foreach ($anuncios as $a) {
    if ((string)$a['inicio'] <= $desde) continue;
    $eventos[] = ['id' => 'anuncio-' . $a['id'], 'tipo' => 'anuncio', 'fecha' => $a['inicio'], 'quien' => '', 'cliente' => null,
      'titulo' => $a['texto'], 'emoji' => $a['emoji'], 'provincia' => $a['provincia'], 'ciudad' => $a['ciudad'], 'foto' => $a['foto'], 'href' => null];
  }
  usort($eventos, function ($a, $b) { return strcmp((string)$b['fecha'], (string)$a['fecha']); });
  return array_slice($eventos, 0, 40);
}

$conAnuncios = sala_existe($db, 'SELECT 1 FROM anuncios LIMIT 0');
$anuncios = $conAnuncios ? sala_anuncios($db) : [];

$desde = isset($_GET['desde']) && preg_match('/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}(:\d{2})?)?$/', $_GET['desde']) ? $_GET['desde'] : null;

if (!empty($_GET['solo_eventos'])) {
  $ventana = max(1, min(720, (int)($_GET['ventana'] ?? 24)));
  $desdeEv = $desde ?? date('Y-m-d H:i:s', strtotime($ahora . ' -' . $ventana . ' hours'));
  $eventos = sala_completar(sala_eventos($db, $user, $desdeEv, $nombre, $conCmpEne, $conCmpTel, $conNovedades), $anuncios, $provDe, $desdeEv, $fotoDe);
  icc_json(['ahora' => $ahora, 'eventos' => $eventos, 'anuncios' => $anuncios]);
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
  $porComercial[] = array_merge(['id' => $id, 'nombre' => $nombreReal($id), 'rol' => $u['rol']], $act[$id] ?? $vacio);
}
$ordenar($porComercial);
$miPosicion = null;
foreach ($porComercial as $i => &$fila) {
  $fila['es_yo'] = $fila['id'] === $miId;
  if ($fila['es_yo']) $miPosicion = $i + 1;
  if (!$nombreVisible($fila['id'])) {
    $fila['nombre'] = $etiquetaAnonima($fila['id']);
    $fila['anonimo'] = true;
    $fila['id'] = null;
  }
}
unset($fila);

// Por equipo: el jefe y sus comerciales.
$equipos = [];
foreach ($usuarios as $id => $u) {
  $lider = $u['rol'] === 'jefe_de_equipo' ? $id : ($u['rol'] === 'comercial' && $u['supervisor_id'] !== null ? (int)$u['supervisor_id'] : null);
  if ($lider === null || !isset($usuarios[$lider])) continue;
  if (!isset($equipos[$lider])) {
    $propio = $esDireccion || $lider === $miLider || icc_puede_ver_comercial($user, $lider);
    $equipos[$lider] = array_merge(['id' => $propio ? $lider : null, 'nombre' => $propio ? 'Equipo de ' . $nombreReal($lider) : (isset($provDe[$lider]) ? 'Equipo · ' . $provDe[$lider] : 'Otro equipo'),
      'es_yo' => $lider === $miLider, 'anonimo' => !$propio, 'personas' => 0], $vacio);
  }
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
  $miOficina = isset($usuarios[$miId]['oficina_id']) && $usuarios[$miId]['oficina_id'] !== null ? (int)$usuarios[$miId]['oficina_id'] : null;
  foreach ($oficinas as $o) {
    $propia = $esDireccion || (int)$o['id'] === $miOficina;
    $ofi[(int)$o['id']] = array_merge(['id' => $propia ? (int)$o['id'] : null, 'nombre' => $propia ? $o['nombre'] : ($o['provincia'] !== '' ? 'Oficina · ' . $o['provincia'] : 'Otra oficina'),
      'provincia' => $o['provincia'], 'es_yo' => (int)$o['id'] === $miOficina, 'anonimo' => !$propia, 'personas' => 0], $vacio);
  }
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

$desdeEv = $desde ?? date('Y-m-d H:i:s', strtotime($ahora . ' -30 days'));
$eventos = sala_completar(sala_eventos($db, $user, $desdeEv, $nombre, $conCmpEne, $conCmpTel, $conNovedades), $anuncios, $provDe, $desdeEv, $fotoDe);

// --------------------------------------------------------------- Insights
// Frases calculadas con datos reales; si no hay datos suficientes, no salen.
$insights = [];
$diasMes = $objetivos['dias_mes'];
$diaMes = $objetivos['dia'];
$objC = $objetivos['contratos'];
if ($okMes > 0 && $diaMes > 0) {
  $proy = (int)round($okMes / $diaMes * $diasMes);
  $insights[] = ['ico' => '📈', 'tipo' => 'proyeccion', 'txt' => "Al ritmo actual el mes cerrará con unos $proy contratos OK" .
    ($proy >= $objC['objetivo'] ? ', por encima del objetivo de ' . $objC['objetivo'] . '.' : ' (objetivo: ' . $objC['objetivo'] . ').')];
}
$faltan = max(0, $objC['objetivo'] - $okMes);
$quedan = $diasMes - $diaMes + 1;
if ($faltan > 0 && $quedan > 0) {
  $ritmo = $faltan / $quedan;
  $insights[] = ['ico' => '🎯', 'tipo' => 'objetivo', 'txt' => "Faltan $faltan contratos OK en $quedan " . ($quedan === 1 ? 'día' : 'días') . ': ' .
    ($ritmo <= 1 ? 'basta con ' . ($ritmo < 1 ? 'menos de uno' : 'uno') . ' al día.' : 'hacen falta ' . number_format($ritmo, 1, ',', '.') . ' al día.')];
} elseif ($objC['objetivo'] > 0 && $okMes >= $objC['objetivo']) {
  $insights[] = ['ico' => '🏆', 'tipo' => 'objetivo', 'txt' => 'Objetivo del mes conseguido: ' . $okMes . ' contratos OK de ' . $objC['objetivo'] . '.'];
}
$topProv = null;
foreach ($mapa as $p) if ($p['puntos'] > 0 && ($topProv === null || $p['puntos'] > $topProv['puntos'])) $topProv = $p;
if ($topProv) {
  $insights[] = ['ico' => '📍', 'tipo' => 'provincia', 'txt' => $topProv['provincia'] . ' es la provincia más activa ' . ['hoy' => 'hoy', 'semana' => 'esta semana', 'mes' => 'este mes'][$periodo] . ' con ' . $topProv['puntos'] . ' puntos.'];
}
// Comercializadoras: este mes frente a los mismos dias del mes anterior.
$finAnt = date('Y-m-d', strtotime($inicioMes . ' -1 month +' . ($diaMes - 1) . ' days'));
$iniAnt = date('Y-m-d', strtotime($inicioMes . ' -1 month'));
if ($finAnt >= $inicioMes) $finAnt = date('Y-m-d', strtotime($inicioMes . ' -1 day'));
$porCia = [];
foreach (sala_filas($db, "SELECT comercializadora c, SUM(fecha_alta >= ?) ahora, SUM(fecha_alta >= ? AND fecha_alta <= ?) antes FROM contratos
                          WHERE comercializadora IS NOT NULL AND comercializadora <> '' AND fecha_alta >= ? AND fecha_alta <= ? GROUP BY comercializadora", [$inicioMes, $iniAnt, $finAnt, $iniAnt, $hoy]) as $r) {
  $porCia[] = ['c' => $r['c'], 'ahora' => (int)$r['ahora'], 'antes' => (int)$r['antes']];
}
usort($porCia, function ($a, $b) { return $b['ahora'] <=> $a['ahora']; });
if ($porCia && $porCia[0]['ahora'] > 0) {
  $c = $porCia[0];
  $txt = $c['c'] . ' lidera este mes con ' . $c['ahora'] . ($c['ahora'] === 1 ? ' contrato' : ' contratos');
  if ($c['antes'] > 0) {
    $var = (int)round(($c['ahora'] - $c['antes']) / $c['antes'] * 100);
    $txt .= ' (' . ($var >= 0 ? '+' : '') . $var . ' % frente al mismo punto del mes pasado)';
  }
  $insights[] = ['ico' => '⚡', 'tipo' => 'compania', 'txt' => $txt . '.'];
}
$hora = sala_filas($db, "SELECT HOUR(created_at) h, COUNT(*) n FROM (
    SELECT created_at FROM contratos WHERE created_at >= ? UNION ALL SELECT created_at FROM citas WHERE created_at >= ? UNION ALL SELECT created_at FROM clientes WHERE created_at >= ?
  ) t GROUP BY HOUR(created_at) ORDER BY n DESC LIMIT 1", [$inicioMes, $inicioMes, $inicioMes]);
if ($hora && (int)$hora[0]['n'] >= 3) {
  $h = (int)$hora[0]['h'];
  $insights[] = ['ico' => '⏱️', 'tipo' => 'hora', 'txt' => sprintf('La franja de %02d:00 a %02d:00 es la de más movimiento este mes.', $h, ($h + 1) % 24)];
}

// Provincias con actividad real en la ultima hora o con un anuncio vigente: laten en el mapa.
$pulsos = [];
$haceUnaHora = date('Y-m-d H:i:s', strtotime($ahora . ' -1 hour'));
foreach ($eventos as $e) if ($e['provincia'] !== '' && (string)$e['fecha'] >= $haceUnaHora) $pulsos[$e['provincia']] = true;
foreach ($anuncios as $a) if ($a['provincia'] !== '') $pulsos[$a['provincia']] = true;

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
  'mapa' => ['fuente' => $fuenteMapa, 'provincias' => array_values($mapa), 'pulsos' => array_keys($pulsos)],
  'anuncios' => $anuncios,
  'insights' => $insights,
  'anonimo' => !$esDireccion,
  'con_oficinas' => $conOficinas,
]);
