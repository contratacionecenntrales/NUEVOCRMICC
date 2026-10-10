<?php
require __DIR__ . '/config.php';

$user = icc_require_auth();
$metodo = $_SERVER['REQUEST_METHOD'];

function icc_obtener_cliente_o_404(PDO $db, int $clienteId, array $user): array {
  $stmt = $db->prepare('SELECT * FROM clientes WHERE id = ?');
  $stmt->execute([$clienteId]);
  $cliente = $stmt->fetch();
  $esVisible = $cliente && icc_puede_ver_comercial($user, $cliente['comercial_id']);
  if (!$esVisible) icc_json(['error' => 'No encontrado'], 404);
  return $cliente;
}

if ($metodo === 'GET') {
  $clienteId = (int)($_GET['cliente_id'] ?? 0);
  if (!$clienteId) icc_json(['error' => 'Falta cliente_id'], 400);
  $db = icc_db();
  icc_obtener_cliente_o_404($db, $clienteId, $user);

  if (isset($_GET['presupuesto_id']) && $_GET['presupuesto_id'] !== '') {
    $stmt = $db->prepare('SELECT * FROM documentos WHERE cliente_id = ? AND presupuesto_id = ? ORDER BY created_at DESC');
    $stmt->execute([$clienteId, (int)$_GET['presupuesto_id']]);
  } else {
    $stmt = $db->prepare('SELECT * FROM documentos WHERE cliente_id = ? ORDER BY created_at DESC');
    $stmt->execute([$clienteId]);
  }
  icc_json(['documentos' => $stmt->fetchAll()]);
}

if ($metodo === 'POST') {
  icc_require_csrf();
  $clienteId = (int)($_POST['cliente_id'] ?? 0);
  $tipo = $_POST['tipo'] ?? 'factura';
  $notas = trim($_POST['notas'] ?? '');
  $presupuestoId = !empty($_POST['presupuesto_id']) ? (int)$_POST['presupuesto_id'] : null;
  $tiposValidos = ['factura', 'estudio', 'contrato_firmado', 'otro'];
  if (!$clienteId || !in_array($tipo, $tiposValidos, true)) icc_json(['error' => 'Datos invalidos'], 400);

  $db = icc_db();
  $cliente = icc_obtener_cliente_o_404($db, $clienteId, $user);

  if ($presupuestoId !== null) {
    $stmt = $db->prepare('SELECT id FROM presupuestos WHERE id = ? AND cliente_id = ?');
    $stmt->execute([$presupuestoId, $clienteId]);
    if (!$stmt->fetch()) icc_json(['error' => 'Presupuesto no encontrado'], 404);
  }

  if (empty($_FILES['archivo']) || $_FILES['archivo']['error'] !== UPLOAD_ERR_OK) {
    icc_json(['error' => 'No se recibio ningun archivo valido'], 400);
  }
  $archivo = $_FILES['archivo'];
  if ($archivo['size'] > 20 * 1024 * 1024) icc_json(['error' => 'El archivo supera los 20 MB'], 400);
  $extensionesPermitidas = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'png', 'jpg', 'jpeg', 'heic'];
  if (!in_array(strtolower(pathinfo($archivo['name'], PATHINFO_EXTENSION)), $extensionesPermitidas, true)) {
    icc_json(['error' => 'Tipo de archivo no permitido'], 400);
  }

  $carpetaTipo = $tipo === 'estudio' ? 'estudios' : 'facturas';
  $carpeta = ICC_STORAGE_DIR . '/' . $carpetaTipo . '/' . $cliente['upload_token'];
  if (!is_dir($carpeta)) mkdir($carpeta, 0755, true);
  $nombreFinal = time() . '-' . icc_slug_archivo($archivo['name']);
  if (!move_uploaded_file($archivo['tmp_name'], $carpeta . '/' . $nombreFinal)) {
    icc_json(['error' => 'No se pudo guardar el archivo'], 500);
  }

  $ins = $db->prepare(
    'INSERT INTO documentos (cliente_id, presupuesto_id, tipo, ruta_archivo, nombre_archivo, subido_por, notas) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  $ins->execute([$clienteId, $presupuestoId, $tipo, $cliente['upload_token'] . '/' . $nombreFinal, $archivo['name'], $user['id'], $notas]);
  $documentoId = (int)$db->lastInsertId();

  if ($tipo === 'factura' && $cliente['estado'] === 'lead_captado') {
    $db->prepare('UPDATE clientes SET estado = "estudio_backoffice" WHERE id = ?')->execute([$clienteId]);
    $db->prepare('INSERT INTO historial_estado (cliente_id, estado_anterior, estado_nuevo, cambiado_por) VALUES (?, "lead_captado", "estudio_backoffice", ?)')
      ->execute([$clienteId, $user['id']]);
  }

  if ($presupuestoId !== null) {
    icc_recalcular_estado_presupuesto($db, $presupuestoId);
  }

  icc_json(['id' => $documentoId], 201);
}

icc_json(['error' => 'Metodo no permitido'], 405);
