<?php
require __DIR__ . '/config.php';

$user = icc_require_auth();
$metodo = $_SERVER['REQUEST_METHOD'];

if ($metodo === 'GET') {
  $clienteId = (int)($_GET['cliente_id'] ?? 0);
  if (!$clienteId) icc_json(['error' => 'Falta cliente_id'], 400);
  $db = icc_db();
  $stmt = $db->prepare('SELECT * FROM clientes WHERE id = ?');
  $stmt->execute([$clienteId]);
  $cliente = $stmt->fetch();
  $visible = $cliente && icc_puede_ver_comercial($user, $cliente['comercial_id']);
  if (!$visible) icc_json(['error' => 'No encontrado'], 404);

  $stmt = $db->prepare('SELECT id, cliente_id, documento_id, firmante_nombre, firmante_dni, ruta_archivo, hash_integridad, firmado_en FROM firmas WHERE cliente_id = ? ORDER BY firmado_en DESC');
  $stmt->execute([$clienteId]);
  icc_json(['firmas' => $stmt->fetchAll()]);
}

if ($metodo === 'POST') {
  icc_require_csrf();
  $clienteId = (int)($_POST['cliente_id'] ?? 0);
  $firmanteNombre = trim($_POST['firmante_nombre'] ?? '');
  $firmanteDni = trim($_POST['firmante_dni'] ?? '');
  if (!$clienteId || $firmanteNombre === '' || $firmanteDni === '') {
    icc_json(['error' => 'Faltan datos del firmante'], 400);
  }
  if (empty($_FILES['archivo']) || $_FILES['archivo']['error'] !== UPLOAD_ERR_OK) {
    icc_json(['error' => 'Falta la imagen de la firma'], 400);
  }

  $db = icc_db();
  $stmt = $db->prepare('SELECT * FROM clientes WHERE id = ?');
  $stmt->execute([$clienteId]);
  $cliente = $stmt->fetch();
  $visible = $cliente && icc_puede_ver_comercial($user, $cliente['comercial_id']);
  if (!$visible) icc_json(['error' => 'No encontrado'], 404);

  $archivo = $_FILES['archivo'];
  $contenido = file_get_contents($archivo['tmp_name']);
  $hash = hash('sha256', $contenido);

  $carpeta = ICC_STORAGE_DIR . '/firmas/' . $cliente['upload_token'];
  if (!is_dir($carpeta)) mkdir($carpeta, 0755, true);
  $nombreFinal = 'firma-' . time() . '.png';
  if (!move_uploaded_file($archivo['tmp_name'], $carpeta . '/' . $nombreFinal)) {
    icc_json(['error' => 'No se pudo guardar la firma'], 500);
  }

  $db->beginTransaction();
  try {
    $ins = $db->prepare(
      'INSERT INTO firmas (cliente_id, firmante_nombre, firmante_dni, ruta_archivo, hash_integridad, ip, user_agent, firmado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );
    $ins->execute([
      $clienteId,
      $firmanteNombre,
      $firmanteDni,
      $cliente['upload_token'] . '/' . $nombreFinal,
      $hash,
      $_SERVER['REMOTE_ADDR'] ?? null,
      substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 255),
      $user['id'],
    ]);

    if (in_array($cliente['estado'], ['lead_captado', 'estudio_backoffice', 'oferta_presentada'], true)) {
      $db->prepare('UPDATE clientes SET estado = "en_cierre" WHERE id = ?')->execute([$clienteId]);
      $db->prepare('INSERT INTO historial_estado (cliente_id, estado_anterior, estado_nuevo, cambiado_por) VALUES (?, ?, "en_cierre", ?)')
        ->execute([$clienteId, $cliente['estado'], $user['id']]);
    }

    $db->commit();
    icc_json(['ok' => true, 'hash' => $hash], 201);
  } catch (Exception $e) {
    $db->rollBack();
    icc_json(['error' => icc_mensaje_error('No se pudo registrar la firma', $e, $user)], 500);
  }
}

icc_json(['error' => 'Metodo no permitido'], 405);
