<?php
require __DIR__ . '/config.php';

$user = icc_require_auth();
icc_require_permiso_metodo($user, ['GET' => 'ficheros.ver', 'DELETE' => 'ficheros.borrar']);
$metodo = $_SERVER['REQUEST_METHOD'];

function icc_cargar_carpeta_fichero(PDO $db, int $carpetaId): ?array {
  $stmt = $db->prepare('SELECT * FROM ficheros_carpetas WHERE id = ?');
  $stmt->execute([$carpetaId]);
  $carpeta = $stmt->fetch();
  return $carpeta ?: null;
}

if ($metodo === 'GET') {
  $carpetaId = (int)($_GET['carpeta_id'] ?? 0);
  if (!$carpetaId) icc_json(['error' => 'Falta carpeta_id'], 400);
  $db = icc_db();
  $carpeta = icc_cargar_carpeta_fichero($db, $carpetaId);
  if (!$carpeta || !icc_carpeta_fichero_visible($user, $carpeta)) icc_json(['error' => 'Carpeta no encontrada'], 404);

  $stmt = $db->prepare('SELECT f.*, u.nombre AS subido_por_nombre FROM ficheros f LEFT JOIN usuarios u ON u.id = f.subido_por WHERE carpeta_id = ? ORDER BY f.created_at DESC');
  $stmt->execute([$carpetaId]);
  $ficheros = $stmt->fetchAll();
  foreach ($ficheros as &$f) {
    $rutaFisica = ICC_STORAGE_DIR . '/ficheros/' . $f['ruta_archivo'];
    $f['existe'] = is_file($rutaFisica);
    $f['tamano'] = $f['existe'] ? (int)filesize($rutaFisica) : null;
  }
  icc_json(['ficheros' => $ficheros]);
}

if ($metodo === 'POST') {
  icc_require_csrf();
  $carpetaId = (int)($_POST['carpeta_id'] ?? 0);
  if (!$carpetaId) icc_json(['error' => 'Falta carpeta_id'], 400);
  $db = icc_db();
  $carpeta = icc_cargar_carpeta_fichero($db, $carpetaId);
  if (!$carpeta || !icc_carpeta_fichero_visible($user, $carpeta)) icc_json(['error' => 'Carpeta no encontrada'], 404);

  $puedeSubir = $carpeta['propietario_id'] === null
    ? icc_tiene_permiso($user, 'ficheros.subir')
    : icc_es_admin_o_superior($user);
  if (!$puedeSubir) icc_json(['error' => 'No tienes permiso para subir archivos en esta carpeta'], 403);

  if (empty($_FILES['archivo']) || $_FILES['archivo']['error'] !== UPLOAD_ERR_OK) {
    icc_json(['error' => 'No se recibio ningun archivo valido'], 400);
  }
  $archivo = $_FILES['archivo'];
  if ($archivo['size'] > 30 * 1024 * 1024) icc_json(['error' => 'El archivo supera los 30 MB'], 400);

  $extensionesPermitidas = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'zip', 'png', 'jpg', 'jpeg'];
  $extension = strtolower(pathinfo($archivo['name'], PATHINFO_EXTENSION));
  if (!in_array($extension, $extensionesPermitidas, true)) {
    icc_json(['error' => 'Tipo de archivo no permitido'], 400);
  }

  $destinoDir = ICC_STORAGE_DIR . '/ficheros/' . $carpetaId;
  if (!is_dir($destinoDir)) mkdir($destinoDir, 0755, true);
  $nombreFinal = time() . '-' . icc_slug_archivo($archivo['name']);
  if (!move_uploaded_file($archivo['tmp_name'], $destinoDir . '/' . $nombreFinal)) {
    icc_json(['error' => 'No se pudo guardar el archivo'], 500);
  }

  $ins = $db->prepare('INSERT INTO ficheros (carpeta_id, nombre_archivo, ruta_archivo, subido_por) VALUES (?, ?, ?, ?)');
  $ins->execute([$carpetaId, $archivo['name'], $carpetaId . '/' . $nombreFinal, $user['id']]);
  icc_json(['id' => (int)$db->lastInsertId()], 201);
}

if ($metodo === 'DELETE') {
  icc_require_csrf();
  $id = (int)($_GET['id'] ?? 0);
  if (!$id) icc_json(['error' => 'Falta id'], 400);
  $db = icc_db();

  // El borrado del registro nunca debe depender de que el archivo fisico
  // siga en el servidor: si ya no esta (borrado, ZIP mal extraido...), se
  // limpia igualmente la referencia en BD para poder subir uno nuevo.
  try {
    $stmt = $db->prepare('SELECT f.ruta_archivo, c.propietario_id FROM ficheros f LEFT JOIN ficheros_carpetas c ON c.id = f.carpeta_id WHERE f.id = ?');
    $stmt->execute([$id]);
    $fichero = $stmt->fetch();
    if ($fichero && $fichero['propietario_id'] !== null && !icc_carpeta_fichero_visible($user, $fichero)) {
      icc_json(['error' => 'No encontrado'], 404);
    }
    if ($fichero) {
      try {
        $ruta = ICC_STORAGE_DIR . '/ficheros/' . $fichero['ruta_archivo'];
        if (is_file($ruta)) @unlink($ruta);
      } catch (Throwable $eArchivo) {
        error_log('ICC borrar fichero (archivo fisico): ' . $eArchivo->getMessage());
      }
      $db->prepare('DELETE FROM ficheros WHERE id = ?')->execute([$id]);
    }
    icc_json(['ok' => true]);
  } catch (Throwable $e) {
    error_log('ICC borrar fichero: ' . $e->getMessage());
    icc_json(['error' => 'No se pudo borrar el registro'], 500);
  }
}

icc_json(['error' => 'Metodo no permitido'], 405);
