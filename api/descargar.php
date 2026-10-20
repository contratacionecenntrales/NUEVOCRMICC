<?php
require __DIR__ . '/config.php';

$user = icc_require_auth();

$tipo = $_GET['tipo'] ?? '';
$ruta = $_GET['ruta'] ?? '';
$tiposValidos = ['facturas', 'estudios', 'firmas', 'ficheros', 'proformas', 'avatares'];

if (!in_array($tipo, $tiposValidos, true) || $ruta === '') {
  icc_json(['error' => 'Peticion invalida'], 400);
}
// Evita path traversal: solo letras/numeros/guiones/puntos/barras simples.
if (!preg_match('#^[A-Za-z0-9_\-./]+$#', $ruta) || strpos($ruta, '..') !== false) {
  icc_json(['error' => 'Ruta invalida'], 400);
}

if (in_array($tipo, ['facturas', 'estudios', 'firmas'], true)) {
  $token = explode('/', $ruta)[0] ?? '';
  $stmt = icc_db()->prepare('SELECT id, comercial_id FROM clientes WHERE upload_token = ?');
  $stmt->execute([$token]);
  $cliente = $stmt->fetch();
  if (!$cliente) icc_json(['error' => 'No encontrado'], 404);

  $puedeVer = icc_puede_ver_comercial($user, $cliente['comercial_id']);
  if (!$puedeVer) icc_json(['error' => 'No tienes acceso a este archivo'], 403);
} elseif ($tipo === 'proformas') {
  $stmt = icc_db()->prepare('SELECT comercial_id FROM proformas WHERE ruta_archivo = ?');
  $stmt->execute([$ruta]);
  $proforma = $stmt->fetch();
  if (!$proforma) icc_json(['error' => 'No encontrado'], 404);
  $puedeVer = icc_puede_ver_comercial($user, $proforma['comercial_id']);
  if (!$puedeVer) icc_json(['error' => 'No tienes acceso a este archivo'], 403);
} elseif ($tipo === 'avatares') {
  // Fotos de perfil: visibles para cualquier usuario con sesion iniciada.
} elseif ($tipo === 'ficheros') {
  icc_require_permiso($user, 'ficheros.ver');
  // Carpetas compartidas (Ficheros/Dosieres/Comerciales...): visibles para
  // cualquier usuario autenticado. Carpetas personales (facturacion por
  // comercial): solo su dueno y Admin, nunca el resto del equipo.
  $stmt = icc_db()->prepare('SELECT carpeta_id FROM ficheros WHERE ruta_archivo = ?');
  $stmt->execute([$ruta]);
  $fichero = $stmt->fetch();
  if (!$fichero) icc_json(['error' => 'No encontrado'], 404);
  $stmt = icc_db()->prepare('SELECT * FROM ficheros_carpetas WHERE id = ?');
  $stmt->execute([$fichero['carpeta_id']]);
  $carpeta = $stmt->fetch();
  if (!$carpeta || !icc_carpeta_fichero_visible($user, $carpeta)) {
    icc_json(['error' => 'No tienes acceso a este archivo'], 403);
  }
}

$rutaCompleta = realpath(ICC_STORAGE_DIR . '/' . $tipo . '/' . $ruta);
$base = realpath(ICC_STORAGE_DIR . '/' . $tipo);
if ($rutaCompleta === false || $base === false || strpos($rutaCompleta, $base) !== 0 || !is_file($rutaCompleta)) {
  icc_json(['error' => 'Archivo no encontrado'], 404);
}

$forzarDescarga = !empty($_GET['descargar']);
$disposicion = $forzarDescarga ? 'attachment' : 'inline';

$mime = mime_content_type($rutaCompleta) ?: 'application/octet-stream';
header('Content-Type: ' . $mime);
header('Content-Length: ' . filesize($rutaCompleta));
header('Content-Disposition: ' . $disposicion . '; filename="' . basename($rutaCompleta) . '"');
header('Cache-Control: private, max-age=0, no-store');
readfile($rutaCompleta);
exit;
