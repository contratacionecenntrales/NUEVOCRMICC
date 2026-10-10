<?php
/**
 * ICC CRM · Catalogo de tarifas propias del Comparador (energia/telefonia/alarmas).
 * Lectura: cualquier usuario autenticado. Escritura: backoffice/jefe_de_equipo/admin.
 */
require __DIR__ . '/config.php';

$user = icc_require_auth();
$metodo = $_SERVER['REQUEST_METHOD'];

const ICC_CATALOGOS = [
  'energia' => [
    'tabla' => 'tarifa_energia',
    'orden' => 'nombre_tarifa',
    'columnas' => [
      'proveedor', 'nombre_tarifa', 'tipo', 'segmento', 'descripcion',
      'precio_potencia_p1', 'precio_potencia_p2', 'precio_potencia_p3',
      'precio_potencia_p4', 'precio_potencia_p5', 'precio_potencia_p6',
      'precio_energia_p1', 'precio_energia_p2', 'precio_energia_p3',
      'precio_energia_p4', 'precio_energia_p5', 'precio_energia_p6',
      'termino_fijo_mensual', 'alquiler_equipo_dia',
      'comision_captacion', 'permanencia_meses', 'activo', 'destacada',
    ],
    'booleanos' => ['activo', 'destacada'],
    'numericos' => [
      'precio_potencia_p1', 'precio_potencia_p2', 'precio_potencia_p3',
      'precio_potencia_p4', 'precio_potencia_p5', 'precio_potencia_p6',
      'precio_energia_p1', 'precio_energia_p2', 'precio_energia_p3',
      'precio_energia_p4', 'precio_energia_p5', 'precio_energia_p6',
      'termino_fijo_mensual', 'alquiler_equipo_dia', 'comision_captacion',
    ],
    'enteros' => ['permanencia_meses'],
    'listas' => [],
  ],
  'telefonia' => [
    'tabla' => 'tarifa_telefonia',
    'orden' => 'nombre_tarifa',
    'columnas' => [
      'proveedor', 'nombre_tarifa', 'tipo', 'descripcion',
      'gb_datos', 'datos_ilimitados', 'llamadas_ilimitadas', 'minutos_incluidos',
      'velocidad_fibra_mb', 'lineas_moviles_incluidas', 'lineas_fijas_incluidas', 'extras',
      'precio_mensual', 'permanencia_meses', 'comision_captacion', 'activo', 'destacada',
    ],
    'booleanos' => ['activo', 'destacada', 'datos_ilimitados', 'llamadas_ilimitadas'],
    'numericos' => ['gb_datos', 'minutos_incluidos', 'velocidad_fibra_mb', 'precio_mensual', 'comision_captacion'],
    'enteros' => ['lineas_moviles_incluidas', 'lineas_fijas_incluidas', 'permanencia_meses'],
    'listas' => ['extras'],
  ],
  'alarmas' => [
    'tabla' => 'tarifa_alarmas',
    'orden' => 'nombre_kit',
    'columnas' => [
      'proveedor', 'nombre_kit', 'tipo_kit', 'descripcion', 'equipamiento',
      'num_camaras', 'num_sensores', 'num_mandos', 'conexion_movil', 'central_receptora',
      'cuota_mensual', 'coste_instalacion', 'permanencia_meses', 'comision_captacion',
      'activo', 'destacada',
    ],
    'booleanos' => ['activo', 'destacada', 'conexion_movil', 'central_receptora'],
    'numericos' => ['cuota_mensual', 'coste_instalacion', 'comision_captacion'],
    'enteros' => ['num_camaras', 'num_sensores', 'num_mandos', 'permanencia_meses'],
    'listas' => ['equipamiento'],
  ],
];

function icc_tarifa_normalizar(array $fila, array $def): array {
  foreach ($def['booleanos'] as $campo) {
    if (array_key_exists($campo, $fila)) $fila[$campo] = (bool)(int)$fila[$campo];
  }
  foreach ($def['numericos'] as $campo) {
    if (array_key_exists($campo, $fila) && $fila[$campo] !== null) $fila[$campo] = (float)$fila[$campo];
  }
  foreach ($def['enteros'] as $campo) {
    if (array_key_exists($campo, $fila) && $fila[$campo] !== null) $fila[$campo] = (int)$fila[$campo];
  }
  if (array_key_exists('id', $fila)) $fila['id'] = (int)$fila['id'];
  foreach ($def['listas'] as $campo) {
    if (array_key_exists($campo, $fila) && $fila[$campo] !== null && $fila[$campo] !== '') {
      $fila[$campo] = array_map('trim', explode(',', $fila[$campo]));
    } elseif (array_key_exists($campo, $fila)) {
      $fila[$campo] = [];
    }
  }
  return $fila;
}

function icc_tarifa_serializar_lista($valor): ?string {
  if (is_array($valor)) return implode(',', array_map('trim', $valor));
  return $valor === null ? null : (string)$valor;
}

$catalogo = $_GET['catalogo'] ?? '';
if (!isset(ICC_CATALOGOS[$catalogo])) {
  icc_json(['error' => 'Catalogo no valido. Usa energia, telefonia o alarmas.'], 400);
}
$def = ICC_CATALOGOS[$catalogo];
$tabla = $def['tabla'];
$db = icc_db();

if ($metodo === 'GET') {
  $soloActivas = ($_GET['soloActivas'] ?? '1') !== '0';
  $sql = "SELECT * FROM `$tabla`" . ($soloActivas ? ' WHERE activo = 1' : '') . ' ORDER BY `' . $def['orden'] . '` ASC';
  $filas = $db->query($sql)->fetchAll();
  icc_json(['tarifas' => array_map(fn($f) => icc_tarifa_normalizar($f, $def), $filas)]);
}

// A partir de aqui, solo backoffice/jefe_de_equipo/admin puede escribir
icc_require_permiso($user, 'tarifas.gestionar');
icc_require_csrf();

if ($metodo === 'POST') {
  $body = icc_body();
  $campos = [];
  $marcadores = [];
  $valores = [];
  foreach ($def['columnas'] as $col) {
    if (!array_key_exists($col, $body)) continue;
    $valor = $body[$col];
    if (in_array($col, $def['listas'], true)) {
      $valor = icc_tarifa_serializar_lista($valor);
    } elseif (in_array($col, $def['booleanos'], true)) {
      $valor = $valor ? 1 : 0;
    }
    $campos[] = "`$col`";
    $marcadores[] = '?';
    $valores[] = $valor;
  }
  if (empty($campos)) icc_json(['error' => 'No se han recibido campos validos'], 422);

  $sql = "INSERT INTO `$tabla` (" . implode(', ', $campos) . ') VALUES (' . implode(', ', $marcadores) . ')';
  $db->prepare($sql)->execute($valores);
  $id = (int)$db->lastInsertId();
  $stmt = $db->prepare("SELECT * FROM `$tabla` WHERE id = ?");
  $stmt->execute([$id]);
  icc_json(icc_tarifa_normalizar($stmt->fetch(), $def), 201);
}

if ($metodo === 'PUT') {
  $id = (int)($_GET['id'] ?? 0);
  if ($id <= 0) icc_json(['error' => 'Falta el id'], 422);
  $body = icc_body();
  $sets = [];
  $valores = [];
  foreach ($def['columnas'] as $col) {
    if (!array_key_exists($col, $body)) continue;
    $valor = $body[$col];
    if (in_array($col, $def['listas'], true)) {
      $valor = icc_tarifa_serializar_lista($valor);
    } elseif (in_array($col, $def['booleanos'], true)) {
      $valor = $valor ? 1 : 0;
    }
    $sets[] = "`$col` = ?";
    $valores[] = $valor;
  }
  if (empty($sets)) icc_json(['error' => 'No se han recibido campos validos'], 422);
  $valores[] = $id;
  $db->prepare("UPDATE `$tabla` SET " . implode(', ', $sets) . ' WHERE id = ?')->execute($valores);
  $stmt = $db->prepare("SELECT * FROM `$tabla` WHERE id = ?");
  $stmt->execute([$id]);
  $fila = $stmt->fetch();
  if (!$fila) icc_json(['error' => 'Tarifa no encontrada'], 404);
  icc_json(icc_tarifa_normalizar($fila, $def));
}

if ($metodo === 'DELETE') {
  $id = (int)($_GET['id'] ?? 0);
  if ($id <= 0) icc_json(['error' => 'Falta el id'], 422);
  $db->prepare("DELETE FROM `$tabla` WHERE id = ?")->execute([$id]);
  icc_json(['ok' => true]);
}

icc_json(['error' => 'Metodo no permitido'], 405);
