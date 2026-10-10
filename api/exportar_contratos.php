<?php
/**
 * ICC CRM · Exportacion de Contratos a CSV o Excel (.xlsx) de verdad, con
 * los mismos filtros que la pantalla de Contratos: rango de fechas,
 * comercial asignado, sector y estado. Respeta la misma visibilidad por
 * equipo que el resto del CRM (un comercial solo exporta lo suyo, un jefe
 * de equipo lo suyo y lo de su equipo, backoffice/admin todo).
 * ?formato=csv (por defecto) o ?formato=xlsx
 */
require __DIR__ . '/config.php';

$user = icc_require_auth();
icc_require_permiso_metodo($user, ['GET' => 'contratos.exportar']);
if ($_SERVER['REQUEST_METHOD'] !== 'GET') icc_json(['error' => 'Metodo no permitido'], 405);

$estadosValidos = ['tramitado', 'ok', 'ko', 'incidencias', 'verificado', 'decomisionado', 'en_distribuidora'];
$sectoresValidos = ['alarmas', 'energia', 'telecomunicaciones', 'seguros', 'financiero'];
$etiquetasSector = [
  'energia' => 'Energia', 'telecomunicaciones' => 'Telecomunicaciones', 'alarmas' => 'Alarmas',
  'seguros' => 'Seguros', 'financiero' => 'Financiero',
];
$etiquetasEstado = [
  'tramitado' => 'Tramitado', 'ok' => 'OK', 'ko' => 'KO', 'incidencias' => 'Incidencias',
  'verificado' => 'Verificado', 'decomisionado' => 'Decomisionado', 'en_distribuidora' => 'En Distribuidora',
];

$db = icc_db();
$where = [];
$params = [];

$idsEquipo = icc_equipo_comercial_ids($user);
if ($idsEquipo !== null) {
  $where[] = 'c.comercial_id IN (' . implode(',', array_fill(0, count($idsEquipo), '?')) . ')';
  array_push($params, ...$idsEquipo);
}
if (!empty($_GET['comercial_id']) && icc_puede_ver_comercial($user, (int)$_GET['comercial_id'])) {
  $where[] = 'c.comercial_id = ?';
  $params[] = (int)$_GET['comercial_id'];
}
if (!empty($_GET['estado']) && in_array($_GET['estado'], $estadosValidos, true)) {
  $where[] = 'c.estado = ?';
  $params[] = $_GET['estado'];
}
if (!empty($_GET['sector']) && in_array($_GET['sector'], $sectoresValidos, true)) {
  $where[] = 'c.sector = ?';
  $params[] = $_GET['sector'];
}
if (!empty($_GET['desde'])) {
  $where[] = 'c.fecha_alta >= ?';
  $params[] = $_GET['desde'];
}
if (!empty($_GET['hasta'])) {
  $where[] = 'c.fecha_alta <= ?';
  $params[] = $_GET['hasta'];
}

$sql = 'SELECT c.*, u.nombre AS comercial_nombre FROM contratos c LEFT JOIN usuarios u ON u.id = c.comercial_id';
if ($where) $sql .= ' WHERE ' . implode(' AND ', $where);
$sql .= ' ORDER BY c.fecha_alta DESC';

$stmt = $db->prepare($sql);
$stmt->execute($params);

$cabeceras = ['ID', 'Razon Social', 'NIF/CIF', 'Numero de contrato', 'CUPS', 'Sector', 'Comercializadora', 'Tarifa', 'kW', 'Estado', 'Fecha de alta', 'Comercial'];
$filas = [];
foreach ($stmt as $fila) {
  $cups = '';
  if ($fila['cliente_id']) {
    $stmtCups = $db->prepare('SELECT cups FROM presupuestos WHERE cliente_id = ? AND sector = ? AND cups <> "" ORDER BY updated_at DESC LIMIT 1');
    $stmtCups->execute([$fila['cliente_id'], $fila['sector']]);
    $filaCups = $stmtCups->fetch();
    $cups = $filaCups['cups'] ?? '';
  }
  $filas[] = [
    $fila['id'],
    $fila['titular'],
    $fila['cif_titular'],
    $fila['numero_contrato'],
    $cups,
    $etiquetasSector[$fila['sector']] ?? $fila['sector'],
    $fila['comercializadora'],
    $fila['tarifa'],
    $fila['kw'],
    $etiquetasEstado[$fila['estado']] ?? $fila['estado'],
    $fila['fecha_alta'],
    $fila['comercial_nombre'] ?? '',
  ];
}

$formato = ($_GET['formato'] ?? 'csv') === 'xlsx' ? 'xlsx' : 'csv';

if ($formato === 'xlsx') {
  $contenido = icc_generar_xlsx($cabeceras, $filas, 'Contratos');
  header('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  header('Content-Disposition: attachment; filename="contratos_' . date('Y-m-d_His') . '.xlsx"');
  header('Content-Length: ' . strlen($contenido));
  header('Cache-Control: private, max-age=0, no-store');
  echo $contenido;
  exit;
}

header('Content-Type: text/csv; charset=utf-8');
header('Content-Disposition: attachment; filename="contratos_' . date('Y-m-d_His') . '.csv"');
header('Cache-Control: private, max-age=0, no-store');

echo "\xEF\xBB\xBF"; // BOM UTF-8: para que Excel detecte bien tildes/enes
$salida = fopen('php://output', 'w');
fputcsv($salida, $cabeceras, ';');
foreach ($filas as $fila) {
  fputcsv($salida, $fila, ';');
}
fclose($salida);
exit;
