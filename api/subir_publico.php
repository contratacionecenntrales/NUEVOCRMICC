<?php
// Endpoint publico (sin login): el propio cliente sube su factura via enlace
// con token. Solo permite escribir en la carpeta de facturas de ESE cliente.
require __DIR__ . '/config.php';

$metodo = $_SERVER['REQUEST_METHOD'];
$token = $_GET['token'] ?? ($_POST['token'] ?? '');

if ($token === '' || !preg_match('/^[a-f0-9-]{36}$/i', $token)) {
  icc_json(['error' => 'Enlace no valido'], 400);
}

$stmt = icc_db()->prepare('SELECT id, razon_social, estado FROM clientes WHERE upload_token = ?');
$stmt->execute([$token]);
$cliente = $stmt->fetch();
if (!$cliente) {
  icc_json(['error' => 'Enlace no valido o caducado'], 404);
}

if ($metodo === 'GET') {
  icc_json(['razon_social' => $cliente['razon_social']]);
}

if ($metodo === 'POST') {
  if (empty($_FILES['archivo']) || $_FILES['archivo']['error'] !== UPLOAD_ERR_OK) {
    icc_json(['error' => 'No se recibio ningun archivo valido'], 400);
  }
  $archivo = $_FILES['archivo'];
  if ($archivo['size'] > 15 * 1024 * 1024) {
    icc_json(['error' => 'El archivo supera los 15 MB'], 400);
  }
  $permitidos = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'];
  $finfo = new finfo(FILEINFO_MIME_TYPE);
  $mime = $finfo->file($archivo['tmp_name']);
  if (!in_array($mime, $permitidos, true)) {
    icc_json(['error' => 'Formato no permitido. Sube un PDF o una foto (JPG/PNG).'], 400);
  }

  $carpeta = ICC_STORAGE_DIR . '/facturas/' . $token;
  if (!is_dir($carpeta)) mkdir($carpeta, 0755, true);

  $nombreFinal = time() . '-' . icc_slug_archivo($archivo['name']);
  $destino = $carpeta . '/' . $nombreFinal;
  if (!move_uploaded_file($archivo['tmp_name'], $destino)) {
    icc_json(['error' => 'No se pudo guardar el archivo'], 500);
  }

  $ins = icc_db()->prepare(
    'INSERT INTO documentos (cliente_id, tipo, ruta_archivo, nombre_archivo, subido_por) VALUES (?, "factura", ?, ?, NULL)'
  );
  $ins->execute([$cliente['id'], $token . '/' . $nombreFinal, $archivo['name']]);

  if ($cliente['estado'] === 'lead_captado') {
    icc_db()->prepare('UPDATE clientes SET estado = "estudio_backoffice" WHERE id = ?')->execute([$cliente['id']]);
    icc_db()->prepare(
      'INSERT INTO historial_estado (cliente_id, estado_anterior, estado_nuevo, cambiado_por) VALUES (?, "lead_captado", "estudio_backoffice", NULL)'
    )->execute([$cliente['id']]);
  }

  icc_json(['ok' => true]);
}

icc_json(['error' => 'Metodo no permitido'], 405);
