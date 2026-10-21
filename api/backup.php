<?php
/**
 * ICC CRM · Copias de seguridad de storage/ (facturas, estudios, firmas,
 * ficheros, proformas...) para que un borrado accidental o una mala
 * extraccion de ZIP en el hosting no vuelva a perder archivos ya subidos.
 *
 * Dos formas de entrar:
 *  - Con sesion de Admin (boton "Crear copia ahora" / listado / descarga
 *    desde el propio CRM).
 *  - Con ?token=ICC_BACKUP_TOKEN, sin sesion: para que una tarea
 *    programada (cron) del hosting pueda llamar a esta URL sola, cada
 *    noche, via curl/wget (Plesk: Herramientas y Configuracion > Tareas
 *    programadas). Ver README.
 *
 * Los ZIPs se guardan en storage/_backups/, que hereda la proteccion de
 * storage/.htaccess (nunca se sirven por URL directa) y solo se descargan
 * a traves de esta misma API con sesion de Admin. Se conservan los
 * ultimos 14; los mas viejos se borran solos al crear una copia nueva.
 */
require __DIR__ . '/config.php';

const ICC_BACKUP_MAX = 14;

$tokenValido = !empty($_GET['token']) && hash_equals(ICC_BACKUP_TOKEN, $_GET['token'])
  && ICC_BACKUP_TOKEN !== 'CAMBIA_ESTE_TOKEN_POR_UNO_LARGO_Y_SECRETO';

$metodo = $_SERVER['REQUEST_METHOD'];
$accion = $_GET['accion'] ?? 'crear';

$dirBackups = ICC_STORAGE_DIR . '/_backups';
if (!is_dir($dirBackups)) mkdir($dirBackups, 0755, true);

function icc_listar_backups(string $dir): array {
  $archivos = glob($dir . '/backup-*.zip') ?: [];
  rsort($archivos);
  return array_map(function ($ruta) {
    return [
      'nombre' => basename($ruta),
      'tamano' => filesize($ruta),
      'fecha' => date('Y-m-d H:i:s', filemtime($ruta)),
    ];
  }, $archivos);
}

function icc_crear_backup(string $storageDir, string $dirBackups): string {
  $nombre = 'backup-' . date('Y-m-d-His') . '.zip';
  $destino = $dirBackups . '/' . $nombre;

  $zip = new ZipArchive();
  if ($zip->open($destino, ZipArchive::CREATE) !== true) {
    throw new RuntimeException('No se pudo crear el archivo ZIP');
  }

  $iterator = new RecursiveIteratorIterator(
    new RecursiveDirectoryIterator($storageDir, FilesystemIterator::SKIP_DOTS)
  );
  foreach ($iterator as $archivo) {
    $rutaCompleta = $archivo->getPathname();
    if (strpos($rutaCompleta, $dirBackups) === 0) continue; // nunca te metas a ti mismo
    $rutaRelativa = substr($rutaCompleta, strlen($storageDir) + 1);
    $zip->addFile($rutaCompleta, $rutaRelativa);
  }
  $zip->close();

  $archivos = glob($dirBackups . '/backup-*.zip') ?: [];
  rsort($archivos);
  foreach (array_slice($archivos, ICC_BACKUP_MAX) as $viejo) {
    @unlink($viejo);
  }

  return $nombre;
}

if ($accion === 'crear' && $metodo === 'GET') {
  if (!$tokenValido) icc_require_role(ICC_ROLES_ADMIN);
  try {
    $nombre = icc_crear_backup(ICC_STORAGE_DIR, $dirBackups);
    icc_json(['ok' => true, 'archivo' => $nombre]);
  } catch (Throwable $e) {
    error_log('ICC backup: ' . $e->getMessage());
    icc_json(['error' => 'No se pudo crear la copia de seguridad'], 500);
  }
}

if ($accion === 'listar' && $metodo === 'GET') {
  icc_require_role(ICC_ROLES_ADMIN);
  icc_json(['backups' => icc_listar_backups($dirBackups)]);
}

if ($accion === 'descargar' && $metodo === 'GET') {
  icc_require_role(ICC_ROLES_ADMIN);
  $nombre = basename($_GET['archivo'] ?? '');
  if (!preg_match('/^backup-[0-9-]+\.zip$/', $nombre)) icc_json(['error' => 'Nombre invalido'], 400);
  $ruta = $dirBackups . '/' . $nombre;
  if (!is_file($ruta)) icc_json(['error' => 'No encontrado'], 404);
  header('Content-Type: application/zip');
  header('Content-Length: ' . filesize($ruta));
  header('Content-Disposition: attachment; filename="' . $nombre . '"');
  header('Cache-Control: private, max-age=0, no-store');
  readfile($ruta);
  exit;
}

icc_json(['error' => 'Peticion no valida'], 404);
