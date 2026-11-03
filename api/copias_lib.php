<?php
/**
 * ICC CRM · Copias de seguridad automaticas y restauracion individual.
 * Lo carga api/config.php.
 *
 * - Copia de la BASE DE DATOS (todas las tablas) cada dia, sola: la primera
 *   peticion con sesion del dia la crea al terminar de responder (no hace
 *   falta cron, aunque tambien vale la tarea programada de api/backup.php).
 *   Formato: storage/_backups/bd/bd-AAAA-MM-DD-HHMMSS[-motivo].json.gz
 * - Copia de los ARCHIVOS (storage/) cada dia si ha cambiado algo.
 * - Copia extra de la base de datos justo antes de cada borrado (cuentas,
 *   contratos, facturas, presupuestos, citas, ficheros), como mucho una cada
 *   10 minutos: asi tambien se recupera lo creado y borrado el mismo dia.
 * - Restauracion INDIVIDUAL (api/copias.php): un cliente, una cuenta, una
 *   factura, un contrato... con todo lo que cuelga de el, sin tocar el resto.
 */

const ICC_COPIAS_BD_DIAS = 30;     // dias que se guardan las copias de la base de datos
const ICC_COPIAS_BD_MINIMO = 10;   // copias que se guardan siempre, aunque sean viejas
const ICC_COPIAS_ARCHIVOS_MAX = 14;

function icc_copias_dir(): string {
  return rtrim(ICC_STORAGE_DIR, '/') . '/_backups';
}
function icc_copias_dir_bd(): string {
  $d = icc_copias_dir() . '/bd';
  if (!is_dir($d)) @mkdir($d, 0750, true);
  return $d;
}

/** Copias de la base de datos, la mas reciente primero. */
function icc_copias_bd_lista(): array {
  $out = [];
  foreach (glob(icc_copias_dir_bd() . '/bd-*.json.gz') ?: [] as $r) {
    $n = basename($r);
    if (!preg_match('/^bd-(\d{4}-\d{2}-\d{2})-(\d{2})(\d{2})(\d{2})(?:-([a-z0-9-]+))?\.json\.gz$/', $n, $m)) continue;
    $out[] = ['nombre' => $n, 'fecha' => $m[1] . ' ' . $m[2] . ':' . $m[3] . ':' . $m[4], 'motivo' => isset($m[5]) ? str_replace('-', ' ', $m[5]) : 'diaria', 'tamano' => filesize($r)];
  }
  usort($out, function ($a, $b) { return strcmp($b['nombre'], $a['nombre']); });
  return $out;
}

/** Vuelca todas las tablas a un .json.gz (una fila por linea, sin cargarlo todo en memoria). */
function icc_copia_bd_crear(string $motivo = ''): string {
  $db = icc_db();
  $motivo = trim(preg_replace('/[^a-z0-9]+/', '-', strtolower(iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $motivo) ?: '')), '-');
  $nombre = 'bd-' . date('Y-m-d-His') . ($motivo !== '' ? '-' . substr($motivo, 0, 40) : '') . '.json.gz';
  $ruta = icc_copias_dir_bd() . '/' . $nombre;
  $tmp = $ruta . '.parcial';
  $gz = gzopen($tmp, 'wb6');
  if (!$gz) throw new RuntimeException('No se pudo crear la copia de la base de datos');
  $tablas = $db->query("SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE' ORDER BY table_name")->fetchAll(PDO::FETCH_COLUMN);
  gzwrite($gz, json_encode(['tipo' => 'icc-copia-bd', 'version' => 1, 'creada' => date('Y-m-d H:i:s'), 'tablas' => $tablas], JSON_UNESCAPED_UNICODE) . "\n");
  $db->setAttribute(PDO::MYSQL_ATTR_USE_BUFFERED_QUERY, false);
  try {
    foreach ($tablas as $t) {
      // Ni los intentos de acceso ni las sesiones hacen falta para restaurar.
      if (in_array($t, ['seg_intentos', 'seg_accesos', 'usuarios_sesiones', 'notificaciones'], true)) continue;
      $st = $db->query('SELECT * FROM `' . str_replace('`', '', $t) . '`');
      while ($f = $st->fetch(PDO::FETCH_ASSOC)) gzwrite($gz, json_encode(['t' => $t, 'f' => $f], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE) . "\n");
      $st->closeCursor();
    }
  } finally {
    $db->setAttribute(PDO::MYSQL_ATTR_USE_BUFFERED_QUERY, true);
  }
  gzclose($gz);
  rename($tmp, $ruta);
  @chmod($ruta, 0640);
  icc_copias_bd_limpiar();
  return $nombre;
}

/** Borra las copias de la base de datos de mas de 30 dias (dejando siempre las 10 ultimas). */
function icc_copias_bd_limpiar(): void {
  $lista = icc_copias_bd_lista();
  $limite = date('Y-m-d', strtotime('-' . ICC_COPIAS_BD_DIAS . ' days'));
  foreach (array_slice($lista, ICC_COPIAS_BD_MINIMO) as $c) {
    if (substr($c['fecha'], 0, 10) < $limite) @unlink(icc_copias_dir_bd() . '/' . $c['nombre']);
  }
}

/** Huella de storage/ (rutas, tamanos y fechas) para saber si ha cambiado algo. */
function icc_copias_firma_archivos(): string {
  $base = rtrim(ICC_STORAGE_DIR, '/');
  $partes = [];
  if (!is_dir($base)) return '';
  $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($base, FilesystemIterator::SKIP_DOTS));
  foreach ($it as $f) {
    $p = str_replace('\\', '/', $f->getPathname());
    if (strpos($p, $base . '/_backups') === 0) continue;
    $partes[] = substr($p, strlen($base)) . ':' . $f->getSize() . ':' . $f->getMTime();
  }
  sort($partes);
  return md5(implode("\n", $partes));
}

/** ZIP de storage/ (sin las propias copias). */
function icc_copia_archivos_crear(): string {
  $base = rtrim(ICC_STORAGE_DIR, '/');
  $dir = icc_copias_dir();
  if (!is_dir($dir)) @mkdir($dir, 0750, true);
  $nombre = 'backup-' . date('Y-m-d-His') . '.zip';
  $zip = new ZipArchive();
  if ($zip->open($dir . '/' . $nombre, ZipArchive::CREATE) !== true) throw new RuntimeException('No se pudo crear el ZIP');
  $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($base, FilesystemIterator::SKIP_DOTS));
  foreach ($it as $f) {
    $p = str_replace('\\', '/', $f->getPathname());
    if (strpos($p, $base . '/_backups') === 0) continue;
    $zip->addFile($f->getPathname(), substr($p, strlen($base) + 1));
  }
  $zip->close();
  $todas = glob($dir . '/backup-*.zip') ?: [];
  rsort($todas);
  foreach (array_slice($todas, ICC_COPIAS_ARCHIVOS_MAX) as $v) @unlink($v);
  @file_put_contents($dir . '/.firma-archivos', icc_copias_firma_archivos());
  return $nombre;
}

/** Copia diaria automatica (base de datos y, si han cambiado, archivos). */
function icc_copias_auto(): void {
  $dir = icc_copias_dir();
  if (!is_dir($dir) && !@mkdir($dir, 0750, true)) return;
  $hoy = date('Y-m-d');
  $bdHoy = (bool)glob(icc_copias_dir_bd() . '/bd-' . $hoy . '-*.json.gz');
  $arHoy = (bool)glob($dir . '/backup-' . $hoy . '-*.zip');
  if ($bdHoy && $arHoy) return;
  $lock = @fopen($dir . '/.copias.lock', 'c');
  if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) return;
  try {
    @set_time_limit(300);
    @ignore_user_abort(true);
    if (!$bdHoy) icc_copia_bd_crear();
    if (!$arHoy) {
      $antes = @file_get_contents($dir . '/.firma-archivos');
      if ($antes === false || $antes !== icc_copias_firma_archivos()) icc_copia_archivos_crear();
      else @touch($dir . '/.sin-cambios-' . $hoy);
    }
  } catch (Throwable $e) {
    error_log('ICC copias automaticas: ' . $e->getMessage());
  } finally {
    flock($lock, LOCK_UN);
    fclose($lock);
  }
}

/** Copia extra justo antes de un borrado (como mucho una cada 10 minutos). */
function icc_copia_previa(string $motivo): void {
  try {
    foreach (array_slice(icc_copias_bd_lista(), 0, 3) as $c) {
      if (strtotime($c['fecha']) > time() - 600) return;
    }
    icc_copia_bd_crear('antes ' . $motivo);
  } catch (Throwable $e) {
    error_log('ICC copia previa: ' . $e->getMessage());
  }
}

/** Lee las filas de una copia que cumplen $filtro(tabla, fila). */
function icc_copia_leer(string $nombre, callable $filtro): array {
  if (!preg_match('/^bd-[0-9a-z-]+\.json\.gz$/', $nombre)) throw new RuntimeException('Copia no válida');
  $ruta = icc_copias_dir_bd() . '/' . $nombre;
  if (!is_file($ruta)) throw new RuntimeException('Esa copia ya no existe');
  $gz = gzopen($ruta, 'rb');
  $out = [];
  $primera = true;
  while (($l = gzgets($gz, 4 * 1024 * 1024)) !== false) {
    if ($primera) { $primera = false; continue; }
    $x = json_decode($l, true);
    if ($x && $filtro($x['t'], $x['f'])) $out[$x['t']][] = $x['f'];
  }
  gzclose($gz);
  return $out;
}

// Copia diaria automatica al terminar cualquier peticion con sesion iniciada
// (despues de enviar la respuesta, para que nadie note la espera).
register_shutdown_function(function () {
  if (empty($_SESSION['user_id']) || ICC_MODO_DEMO) return;
  $dir = icc_copias_dir();
  $hoy = date('Y-m-d');
  if (glob($dir . '/bd/bd-' . $hoy . '-*.json.gz') && (glob($dir . '/backup-' . $hoy . '-*.zip') || is_file($dir . '/.sin-cambios-' . $hoy))) return;
  if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
  if (function_exists('fastcgi_finish_request')) @fastcgi_finish_request();
  icc_copias_auto();
});
