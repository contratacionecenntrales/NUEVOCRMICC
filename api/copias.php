<?php
/**
 * ICC CRM · Restauracion individual desde las copias de seguridad (solo direccion).
 *
 * GET  ?action=lista                                copias de la base de datos y de los archivos
 * POST ?action=crear                                copia completa ahora (base de datos + archivos)
 * GET  ?action=buscar&copia=&tipo=&q=               registros de esa copia (cliente, usuario, contrato...)
 * GET  ?action=detalle&copia=&tipo=&id=             que se recuperaria (filas que faltan, vinculos, archivos)
 * POST ?action=restaurar {copia, tipo, id, modo, devolver}
 *        modo = "faltan"  recupera lo que falta (nunca pisa lo que hay)
 *        modo = "version" ademas vuelve el registro principal a como estaba en la copia
 *        devolver = true  (cuentas) le devuelve los clientes, contratos... que tenia
 *
 * GET  ?action=papelera                            lo borrado (que, quien, cuando, dias que quedan)
 * POST ?action=papelera_restaurar {id}             lo restaura con la copia tomada justo antes del borrado
 * POST ?action=papelera_descartar {id}             lo quita de la lista
 *
 * Todo lo que se restaura queda en la bitacora sellada del Centro de Seguridad.
 */
require __DIR__ . '/config.php';

$user = icc_require_auth();
// Para quien no las gestiona, esta direccion "no existe".
if (!icc_ve_copias($user)) icc_json(['error' => 'No encontrado'], 404);
$metodo = $_SERVER['REQUEST_METHOD'];
$accion = (string)($_GET['action'] ?? '');
$db = icc_db();
if ($metodo !== 'GET') icc_require_csrf();
$body = $metodo === 'GET' ? [] : icc_body();

$TIPOS = icc_copias_tipos();
// Tablas que nunca se restauran (registros tecnicos que se regeneran solos).
const COPIAS_SIN_RESTAURAR = ['papelera', 'usuarios_sesiones', 'seg_intentos', 'seg_accesos', 'seg_bloqueos', 'seg_bitacora', 'seg_ajustes', 'notificaciones', 'logs_impersonacion', 'tarifas_novedades_vistas'];

function copias_norm($t): string {
  $t = mb_strtolower((string)$t, 'UTF-8');
  return strtr($t, ['á' => 'a', 'é' => 'e', 'í' => 'i', 'ó' => 'o', 'ú' => 'u', 'ü' => 'u', 'ñ' => 'n']);
}

function copias_tipo(array $TIPOS, string $tipo): array {
  if (!isset($TIPOS[$tipo])) icc_json(['error' => 'Tipo no válido'], 400);
  return $TIPOS[$tipo];
}

function copias_nombre(): string {
  $c = (string)($_GET['copia'] ?? $GLOBALS['body']['copia'] ?? '');
  if (!preg_match('/^bd-[0-9a-z-]+\.json\.gz$/', $c) || !is_file(icc_copias_dir_bd() . '/' . $c)) icc_json(['error' => 'Esa copia no existe'], 404);
  return $c;
}

/** Hijos de cada tabla segun las claves ajenas actuales: [tabla => [[hija, columna, regla], ...]] */
function copias_hijos(PDO $db): array {
  $out = [];
  $q = $db->query("SELECT k.referenced_table_name padre, k.table_name hija, k.column_name col, r.delete_rule regla
                   FROM information_schema.key_column_usage k
                   JOIN information_schema.referential_constraints r ON r.constraint_schema = k.constraint_schema AND r.constraint_name = k.constraint_name
                   WHERE k.table_schema = DATABASE() AND k.referenced_table_name IS NOT NULL AND k.referenced_column_name = 'id'");
  foreach ($q->fetchAll() as $f) {
    if (in_array($f['hija'], COPIAS_SIN_RESTAURAR, true)) continue;
    $out[$f['padre']][] = [$f['hija'], $f['col'], $f['regla']];
  }
  return $out;
}

/**
 * Plan de restauracion: el registro principal y todo lo que cuelga de el en la
 * copia (hasta 3 niveles). Para cada fila: si falta hoy se inserta; si existe
 * pero perdio el vinculo (quedo a NULL) se vuelve a vincular.
 */
function copias_plan(PDO $db, string $copia, string $tabla, int $id, bool $devolver): array {
  $hijos = copias_hijos($db);
  $todo = [];
  $porTabla = [];
  // Una pasada por la copia por nivel (las copias son pequenas; asi no se carga todo).
  $pendientes = [[$tabla, 'id', [$id => true], null, null]];
  for ($nivel = 0; $nivel < 4 && $pendientes; $nivel++) {
    $siguientes = [];
    $filtros = $pendientes;
    $filas = icc_copia_leer($copia, function ($t, $f) use ($filtros) {
      foreach ($filtros as $x) {
        if ($x[0] === $t && isset($f[$x[1]]) && isset($x[2][(string)$f[$x[1]]])) return true;
      }
      return false;
    });
    foreach ($filtros as $x) {
      [$t, $col, $ids, $padre, $regla] = $x;
      foreach ($filas[$t] ?? [] as $f) {
        if (!isset($f[$col]) || !isset($ids[(string)$f[$col]])) continue;
        $clave = $t . '#' . ($f['id'] ?? md5(json_encode($f)));
        if (isset($todo[$clave])) continue;
        $todo[$clave] = ['tabla' => $t, 'fila' => $f, 'col' => $col === 'id' ? null : $col, 'regla' => $regla, 'nivel' => $nivel];
        if (isset($f['id'])) $porTabla[$t][(string)$f['id']] = true;
      }
    }
    foreach ($filtros as $x) {
      $t = $x[0];
      if (empty($porTabla[$t])) continue;
      foreach ($hijos[$t] ?? [] as [$hija, $colHija, $regla]) {
        $siguientes[$hija . '|' . $colHija] = [$hija, $colHija, $porTabla[$t], $t, $regla];
      }
    }
    $pendientes = array_values($siguientes);
  }
  // Estado de cada fila hoy.
  $acciones = [];
  foreach ($todo as $x) {
    $t = $x['tabla'];
    $f = $x['fila'];
    if (!isset($f['id'])) continue;
    $hoy = null;
    try {
      $st = $db->prepare('SELECT * FROM `' . $t . '` WHERE id = ?');
      $st->execute([$f['id']]);
      $hoy = $st->fetch() ?: null;
    } catch (PDOException $e) { continue; }
    if (!$hoy) { $acciones[] = $x + ['accion' => 'insertar']; continue; }
    if ($x['col'] !== null && $hoy[$x['col']] === null && $f[$x['col']] !== null) { $acciones[] = $x + ['accion' => 'vincular']; continue; }
    // Devolver: lo que se traspaso a otra persona al borrar la cuenta vuelve a su dueno.
    if ($devolver && $x['col'] !== null && $x['nivel'] === 1 && $hoy[$x['col']] !== null && (string)$hoy[$x['col']] !== (string)$f[$x['col']]) {
      $acciones[] = $x + ['accion' => 'devolver'];
    }
  }
  return $acciones;
}

/** Busca en los ZIP de archivos el que falte y lo devuelve a su sitio. */
function copias_restaurar_archivo(string $ruta): bool {
  $ruta = ltrim(str_replace('\\', '/', $ruta), '/');
  if ($ruta === '' || strpos($ruta, '..') !== false) return false;
  $base = rtrim(ICC_STORAGE_DIR, '/');
  $zips = glob(icc_copias_dir() . '/backup-*.zip') ?: [];
  rsort($zips);
  foreach ($zips as $z) {
    $zip = new ZipArchive();
    if ($zip->open($z) !== true) continue;
    for ($i = 0; $i < $zip->numFiles; $i++) {
      $n = $zip->getNameIndex($i);
      if ($n === $ruta || substr($n, -strlen('/' . $ruta)) === '/' . $ruta) {
        if (strpos($n, '..') !== false || strpos($n, '_backups/') === 0) continue;
        $destino = $base . '/' . $n;
        if (is_file($destino)) { $zip->close(); return true; }
        if (!is_dir(dirname($destino))) @mkdir(dirname($destino), 0755, true);
        $datos = $zip->getFromIndex($i);
        $zip->close();
        return $datos !== false && @file_put_contents($destino, $datos) !== false;
      }
    }
    $zip->close();
  }
  return false;
}

function copias_archivos_de(array $x): array {
  $f = $x['fila'];
  $out = [];
  foreach (['ruta_archivo', 'avatar_ruta', 'pdf_ruta', 'foto_ruta'] as $c) {
    if (!empty($f[$c])) $out[] = ($c === 'avatar_ruta' ? 'avatares/' : ($c === 'foto_ruta' ? 'anuncios/' : '')) . $f[$c];
  }
  return $out;
}

function copias_archivo_existe(string $ruta): bool {
  $base = rtrim(ICC_STORAGE_DIR, '/');
  if (is_file($base . '/' . $ruta)) return true;
  foreach (['facturas', 'estudios', 'firmas', 'proformas', 'ficheros', 'comparador', 'documentos'] as $d) {
    if (is_file($base . '/' . $d . '/' . $ruta)) return true;
  }
  return (bool)glob($base . '/*/' . $ruta) || (bool)glob($base . '/*/*/' . $ruta);
}

function copias_titulo(array $cfg, array $f): string {
  $t = trim(implode(' ', array_map(function ($c) use ($f) { return (string)($f[$c] ?? ''); }, $cfg['titulo'])));
  return $t !== '' ? $t : '#' . ($f['id'] ?? '');
}

/* ------------------------------------------------------------------------- */

if ($accion === 'lista' && $metodo === 'GET') {
  $archivos = [];
  foreach (glob(icc_copias_dir() . '/backup-*.zip') ?: [] as $r) $archivos[] = ['nombre' => basename($r), 'tamano' => filesize($r), 'fecha' => date('Y-m-d H:i:s', filemtime($r))];
  usort($archivos, function ($a, $b) { return strcmp($b['nombre'], $a['nombre']); });
  icc_json(['bd' => icc_copias_bd_lista(), 'archivos' => $archivos, 'tipos' => array_map(function ($t) { return $t['nombre']; }, $TIPOS),
    'dias' => ICC_COPIAS_BD_DIAS, 'carpeta_privada' => ICC_DIR_PRIVADO !== '' && strpos(ICC_STORAGE_DIR, ICC_DIR_PRIVADO) === 0]);
}

if ($accion === 'crear' && $metodo === 'POST') {
  @set_time_limit(300);
  try {
    $bd = icc_copia_bd_crear('manual');
    $ar = icc_copia_archivos_crear();
  } catch (Throwable $e) {
    error_log('ICC copia manual: ' . $e->getMessage());
    icc_json(['error' => 'No se pudo crear la copia: ' . $e->getMessage()], 500);
  }
  icc_seg_anota('Copia de seguridad manual', $bd . ' + ' . $ar, icc_usuario_real_id());
  icc_json(['ok' => true, 'bd' => $bd, 'archivos' => $ar]);
}

if ($accion === 'buscar' && $metodo === 'GET') {
  $cfg = copias_tipo($TIPOS, (string)($_GET['tipo'] ?? ''));
  $copia = copias_nombre();
  $q = copias_norm(trim((string)($_GET['q'] ?? '')));
  $tabla = $cfg['tabla'];
  $filas = icc_copia_leer($copia, function ($t, $f) use ($tabla, $q, $cfg) {
    if ($t !== $tabla) return false;
    if ($q === '') return true;
    foreach ($cfg['campos'] as $c) if (isset($f[$c]) && strpos(copias_norm($f[$c]), $q) !== false) return true;
    return isset($f['id']) && (string)$f['id'] === $q;
  })[$tabla] ?? [];
  usort($filas, function ($a, $b) { return ($b['id'] ?? 0) <=> ($a['id'] ?? 0); });
  $filas = array_slice($filas, 0, 60);
  $ids = array_map(function ($f) { return (int)$f['id']; }, $filas);
  $hoy = [];
  if ($ids) {
    $st = $db->query('SELECT * FROM `' . $tabla . '` WHERE id IN (' . implode(',', $ids) . ')');
    foreach ($st->fetchAll() as $f) $hoy[(int)$f['id']] = $f;
  }
  $out = [];
  foreach ($filas as $f) {
    $id = (int)$f['id'];
    $estado = !isset($hoy[$id]) ? 'borrado' : 'existe';
    if ($estado === 'existe') {
      foreach ($f as $c => $v) {
        if (in_array($c, ['updated_at', 'ultimo_acceso', 'password_actualizada_en', 'vistas'], true)) continue;
        if (array_key_exists($c, $hoy[$id]) && (string)$hoy[$id][$c] !== (string)$v) { $estado = 'cambiado'; break; }
      }
    }
    $out[] = ['id' => $id, 'titulo' => copias_titulo($cfg, $f), 'sub' => implode(' · ', array_filter(array_map(function ($c) use ($f) { return (string)($f[$c] ?? ''); }, $cfg['sub']))), 'estado' => $estado];
  }
  icc_json(['resultados' => $out, 'tipo' => $cfg['nombre']]);
}

if ($accion === 'detalle' && $metodo === 'GET') {
  $cfg = copias_tipo($TIPOS, (string)($_GET['tipo'] ?? ''));
  $copia = copias_nombre();
  $plan = copias_plan($db, $copia, $cfg['tabla'], (int)($_GET['id'] ?? 0), !empty($_GET['devolver']));
  $resumen = [];
  $archivos = 0;
  foreach ($plan as $x) {
    $resumen[$x['tabla']][$x['accion']] = ($resumen[$x['tabla']][$x['accion']] ?? 0) + 1;
    foreach (copias_archivos_de($x) as $r) if (!copias_archivo_existe($r)) $archivos++;
  }
  icc_json(['resumen' => $resumen, 'archivos_faltan' => $archivos, 'total' => count($plan)]);
}

/** Restaura un registro (y lo que cuelga de el) desde una copia. Devuelve el resumen. */
function copias_restaurar(PDO $db, array $cfg, string $copia, int $id, string $modo, bool $devolver): array {
  @set_time_limit(300);
  // Antes de tocar nada, una copia de como esta ahora (por si hay que deshacer).
  icc_copia_bd_crear('antes de restaurar');
  $plan = copias_plan($db, $copia, $cfg['tabla'], $id, $devolver);
  $columnas = [];
  $hechos = ['insertadas' => 0, 'vinculadas' => 0, 'devueltas' => 0, 'actualizada' => 0, 'omitidas' => 0, 'archivos' => 0, 'archivos_sin_copia' => 0];
  $db->beginTransaction();
  try {
    foreach ($plan as $x) {
      $t = $x['tabla'];
      if (!isset($columnas[$t])) $columnas[$t] = $db->query('SHOW COLUMNS FROM `' . $t . '`')->fetchAll(PDO::FETCH_COLUMN);
      $f = array_intersect_key($x['fila'], array_flip($columnas[$t]));
      if ($x['accion'] === 'insertar') {
        $cols = array_keys($f);
        $st = $db->prepare('INSERT IGNORE INTO `' . $t . '` (`' . implode('`, `', $cols) . '`) VALUES (' . implode(', ', array_fill(0, count($cols), '?')) . ')');
        $st->execute(array_values($f));
        if ($st->rowCount()) $hechos['insertadas']++; else $hechos['omitidas']++;
      } elseif ($x['accion'] === 'vincular' || $x['accion'] === 'devolver') {
        $db->prepare('UPDATE `' . $t . '` SET `' . $x['col'] . '` = ? WHERE id = ?')->execute([$f[$x['col']], $f['id']]);
        $hechos[$x['accion'] === 'vincular' ? 'vinculadas' : 'devueltas']++;
      }
    }
    // Volver el registro principal a la version de la copia.
    if ($modo === 'version') {
      $principal = icc_copia_leer($copia, function ($t, $f) use ($cfg, $id) { return $t === $cfg['tabla'] && (int)($f['id'] ?? 0) === $id; })[$cfg['tabla']][0] ?? null;
      if ($principal) {
        $cols = $columnas[$cfg['tabla']] ?? $db->query('SHOW COLUMNS FROM `' . $cfg['tabla'] . '`')->fetchAll(PDO::FETCH_COLUMN);
        $f = array_intersect_key($principal, array_flip($cols));
        unset($f['id']);
        if ($f) {
          $db->prepare('UPDATE `' . $cfg['tabla'] . '` SET `' . implode('` = ?, `', array_keys($f)) . '` = ? WHERE id = ?')->execute(array_merge(array_values($f), [$id]));
          $hechos['actualizada'] = 1;
        }
      }
    }
    $db->commit();
  } catch (Throwable $e) {
    $db->rollBack();
    error_log('ICC restaurar: ' . $e->getMessage());
    icc_json(['error' => 'No se pudo restaurar: ' . $e->getMessage()], 500);
  }
  // Archivos (facturas subidas, fotos, PDFs...) que falten en el disco.
  foreach ($plan as $x) {
    foreach (copias_archivos_de($x) as $r) {
      if (copias_archivo_existe($r)) continue;
      if (copias_restaurar_archivo($r)) $hechos['archivos']++; else $hechos['archivos_sin_copia']++;
    }
  }
  icc_seg_anota('Restauración desde copia', $cfg['nombre'] . ' #' . $id . ' desde ' . $copia . ' (' . $modo . ($devolver ? ', devolviendo sus datos' : '') . '): '
    . $hechos['insertadas'] . ' recuperados, ' . $hechos['vinculadas'] . ' revinculados, ' . $hechos['devueltas'] . ' devueltos, ' . $hechos['archivos'] . ' archivos', icc_usuario_real_id());
  return $hechos;
}

if ($accion === 'restaurar' && $metodo === 'POST') {
  $cfg = copias_tipo($TIPOS, (string)($body['tipo'] ?? ''));
  $copia = copias_nombre();
  $id = (int)($body['id'] ?? 0);
  $modo = ($body['modo'] ?? 'faltan') === 'version' ? 'version' : 'faltan';
  $devolver = !empty($body['devolver']) && $cfg['tabla'] === 'usuarios';
  $hechos = copias_restaurar($db, $cfg, $copia, $id, $modo, $devolver);
  icc_json(['ok' => true] + $hechos);
}

/* ------------------------------------------------------------- Papelera */
if ($accion === 'papelera' && $metodo === 'GET') {
  if (!icc_papelera_ok()) icc_json(['elementos' => [], 'disponible' => false]);
  $filas = $db->query("SELECT * FROM papelera WHERE descartado = 0 AND borrado_en > NOW() - INTERVAL " . (int)ICC_COPIAS_BD_DIAS . " DAY ORDER BY borrado_en DESC LIMIT 300")->fetchAll();
  $out = [];
  foreach ($filas as $f) {
    $cfg = $TIPOS[$f['tipo']] ?? null;
    if (!$cfg) continue;
    $existe = false;
    try {
      $st = $db->prepare('SELECT 1 FROM `' . $cfg['tabla'] . '` WHERE id = ?');
      $st->execute([$f['ref_id']]);
      $existe = (bool)$st->fetchColumn();
    } catch (PDOException $e) { /* tabla que ya no existe */ }
    // Si el registro sigue ahi y nadie lo restauro, el borrado no llego a hacerse.
    if ($existe && $f['restaurado_en'] === null) continue;
    $dias = ICC_COPIAS_BD_DIAS - (int)floor((time() - strtotime($f['borrado_en'])) / 86400);
    $out[] = ['id' => (int)$f['id'], 'tipo' => $f['tipo'], 'tipo_nombre' => $cfg['nombre'], 'ref_id' => (int)$f['ref_id'], 'titulo' => $f['titulo'], 'detalle' => $f['detalle'],
      'borrado_por' => $f['borrado_por_nombre'] ?: 'Desconocido', 'como' => $f['como_nombre'], 'borrado_en' => $f['borrado_en'], 'dias_restantes' => max(0, $dias),
      'restaurado_en' => $f['restaurado_en'], 'restaurado_por' => $f['restaurado_por_nombre'],
      'copia_disponible' => is_file(icc_copias_dir_bd() . '/' . $f['copia'])];
  }
  icc_json(['elementos' => $out, 'disponible' => true, 'dias' => ICC_COPIAS_BD_DIAS]);
}

if ($accion === 'papelera_restaurar' && $metodo === 'POST') {
  if (!icc_papelera_ok()) icc_json(['error' => 'Falta importar la base de datos completa'], 409);
  $st = $db->prepare('SELECT * FROM papelera WHERE id = ? AND descartado = 0');
  $st->execute([(int)($body['id'] ?? 0)]);
  $p = $st->fetch();
  if (!$p) icc_json(['error' => 'Ese elemento ya no está en la papelera'], 404);
  if ($p['restaurado_en'] !== null) icc_json(['error' => 'Ya se restauró el ' . date('d/m/Y H:i', strtotime($p['restaurado_en']))], 409);
  $cfg = copias_tipo($TIPOS, $p['tipo']);
  if (!is_file(icc_copias_dir_bd() . '/' . $p['copia'])) icc_json(['error' => 'La copia de ese borrado ya no existe (han pasado más de ' . ICC_COPIAS_BD_DIAS . ' días).'], 410);
  $hechos = copias_restaurar($db, $cfg, $p['copia'], (int)$p['ref_id'], 'faltan', $cfg['tabla'] === 'usuarios');
  $yo = $db->prepare("SELECT TRIM(CONCAT(nombre, ' ', COALESCE(apellidos, ''))) FROM usuarios WHERE id = ?");
  $yo->execute([icc_usuario_real_id()]);
  $db->prepare('UPDATE papelera SET restaurado_en = NOW(), restaurado_por_nombre = ? WHERE id = ?')->execute([(string)$yo->fetchColumn(), $p['id']]);
  icc_json(['ok' => true] + $hechos);
}

if ($accion === 'papelera_descartar' && $metodo === 'POST') {
  if (icc_papelera_ok()) $db->prepare('UPDATE papelera SET descartado = 1 WHERE id = ?')->execute([(int)($body['id'] ?? 0)]);
  icc_json(['ok' => true]);
}

icc_json(['error' => 'Acción no válida'], 404);
