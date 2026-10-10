<?php
require __DIR__ . '/config.php';

$user = icc_require_auth();
$metodo = $_SERVER['REQUEST_METHOD'];

if ($metodo === 'GET') {
  $clienteId = (int)($_GET['cliente_id'] ?? 0);
  if (!$clienteId) icc_json(['error' => 'Falta cliente_id'], 400);
  $db = icc_db();
  $stmt = $db->prepare('SELECT c.* FROM clientes c WHERE c.id = ?');
  $stmt->execute([$clienteId]);
  $cliente = $stmt->fetch();
  $visible = $cliente && icc_puede_ver_comercial($user, $cliente['comercial_id']);
  if (!$visible) icc_json(['error' => 'No encontrado'], 404);

  $stmt = $db->prepare('SELECT * FROM estudios WHERE cliente_id = ? ORDER BY created_at DESC');
  $stmt->execute([$clienteId]);
  icc_json(['estudios' => $stmt->fetchAll()]);
}

if ($metodo === 'POST') {
  $user = icc_require_role(['backoffice', 'jefe_de_equipo', 'admin', 'super_admin']);
  icc_require_csrf();

  $clienteId = (int)($_POST['cliente_id'] ?? 0);
  $ahorro = $_POST['ahorro_estimado'] ?? null;
  $resumen = trim($_POST['resumen'] ?? '');
  if (!$clienteId) icc_json(['error' => 'Falta cliente_id'], 400);
  if (empty($_FILES['archivo']) || $_FILES['archivo']['error'] !== UPLOAD_ERR_OK) {
    icc_json(['error' => 'Sube el PDF del estudio comparativo'], 400);
  }

  $db = icc_db();
  $stmt = $db->prepare('SELECT * FROM clientes WHERE id = ?');
  $stmt->execute([$clienteId]);
  $cliente = $stmt->fetch();
  if (!$cliente) icc_json(['error' => 'Cliente no encontrado'], 404);

  $archivo = $_FILES['archivo'];
  if ($archivo['size'] > 20 * 1024 * 1024) icc_json(['error' => 'El archivo supera los 20 MB'], 400);
  if (strtolower(pathinfo($archivo['name'], PATHINFO_EXTENSION)) !== 'pdf') {
    icc_json(['error' => 'El estudio comparativo debe ser un PDF'], 400);
  }
  $carpeta = ICC_STORAGE_DIR . '/estudios/' . $cliente['upload_token'];
  if (!is_dir($carpeta)) mkdir($carpeta, 0755, true);
  $nombreFinal = time() . '-' . icc_slug_archivo($archivo['name']);
  if (!move_uploaded_file($archivo['tmp_name'], $carpeta . '/' . $nombreFinal)) {
    icc_json(['error' => 'No se pudo guardar el archivo'], 500);
  }

  $db->beginTransaction();
  try {
    $insDoc = $db->prepare(
      'INSERT INTO documentos (cliente_id, tipo, ruta_archivo, nombre_archivo, subido_por) VALUES (?, "estudio", ?, ?, ?)'
    );
    $insDoc->execute([$clienteId, $cliente['upload_token'] . '/' . $nombreFinal, $archivo['name'], $user['id']]);
    $documentoId = (int)$db->lastInsertId();

    $insEst = $db->prepare(
      'INSERT INTO estudios (cliente_id, documento_id, ahorro_estimado, resumen, elaborado_por) VALUES (?, ?, ?, ?, ?)'
    );
    $insEst->execute([$clienteId, $documentoId, $ahorro !== '' ? $ahorro : null, $resumen, $user['id']]);

    if (in_array($cliente['estado'], ['lead_captado', 'estudio_backoffice'], true)) {
      $db->prepare('UPDATE clientes SET estado = "oferta_presentada" WHERE id = ?')->execute([$clienteId]);
      $db->prepare('INSERT INTO historial_estado (cliente_id, estado_anterior, estado_nuevo, cambiado_por) VALUES (?, ?, "oferta_presentada", ?)')
        ->execute([$clienteId, $cliente['estado'], $user['id']]);

      if (!empty($cliente['comercial_id'])) {
        $mensaje = 'Estudio de ahorro listo para ' . $cliente['razon_social'] . '. Ya puedes defender la propuesta y pasar a la firma.';
        $db->prepare('INSERT INTO notificaciones (user_id, cliente_id, tipo, mensaje) VALUES (?, ?, "oferta_presentada", ?)')
          ->execute([$cliente['comercial_id'], $clienteId, $mensaje]);
      }
    }

    $db->commit();
    icc_json(['id' => (int)$db->lastInsertId()], 201);
  } catch (Exception $e) {
    $db->rollBack();
    icc_json(['error' => icc_mensaje_error('No se pudo publicar el estudio', $e, $user)], 500);
  }
}

icc_json(['error' => 'Metodo no permitido'], 405);
