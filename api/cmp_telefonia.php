<?php
/**
 * ICC CRM · Comparador de Telefonia (comparador/telefonia).
 *
 *   ?recurso=config      GET  numeracion y usuario · PUT (Admin)
 *   ?recurso=perfiles    GET  tarifas de mercado guardadas
 *                        POST crear/actualizar por nombre (Admin, Jefe de equipo, Backoffice)
 *                        DELETE &id= (Admin)
 *   ?recurso=informes    GET  lista segun jerarquia (&id= uno, &cliente_id= de un cliente)
 *                        POST guardar (crea, o actualiza si llega "id")
 *                        DELETE &id=
 *   ?recurso=comisiones  GET  tabla de comisiones · POST (Admin)
 *   ?recurso=pdf&id=     GET  descarga el PDF archivado · POST lo archiva
 */
require __DIR__ . '/cmp_comun.php';
require_once __DIR__ . '/tarifas_novedades_lib.php';

$user = cmp_actor();
icc_require_csrf();
$db = icc_db();
$metodo = $_SERVER['REQUEST_METHOD'];
$recurso = $_GET['recurso'] ?? '';

function tel_informe_visible(array $user, int $id): ?array {
  $stmt = icc_db()->prepare(
    'SELECT i.*, u.nombre AS usuario_nombre FROM cmp_tel_informes i
     JOIN usuarios u ON u.id = i.usuario_id WHERE i.id = ? LIMIT 1'
  );
  $stmt->execute([$id]);
  $f = $stmt->fetch();
  return $f && cmp_puede_ver_usuario($user, (int)$f['usuario_id']) ? $f : null;
}

function tel_informe_out(array $f, bool $conDatos): array {
  $o = [
    'id' => (int)$f['id'],
    'numero' => $f['numero'],
    'usuario_id' => (int)$f['usuario_id'],
    'usuario_nombre' => $f['usuario_nombre'] ?? null,
    'cliente_id' => $f['cliente_id'] !== null ? (int)$f['cliente_id'] : null,
    'cliente_nombre' => $f['cliente_nombre'],
    'operador_actual' => $f['operador_actual'],
    'operador_propuesto' => $f['operador_propuesto'],
    'coste_actual_anual' => $f['coste_actual_anual'] !== null ? (float)$f['coste_actual_anual'] : null,
    'coste_propuesto_anual' => $f['coste_propuesto_anual'] !== null ? (float)$f['coste_propuesto_anual'] : null,
    'ahorro_anual' => $f['ahorro_anual'] !== null ? (float)$f['ahorro_anual'] : null,
    'tiene_pdf' => !empty($f['pdf_ruta']),
    'created_at' => $f['created_at'],
    'updated_at' => $f['updated_at'],
  ];
  if ($conDatos) $o['datos'] = json_decode($f['datos'], true);
  return $o;
}

// ==================================================================== CONFIG
if ($recurso === 'config') {
  if ($metodo === 'GET') icc_json(cmp_config_publica() + ['usuario' => cmp_usuario_publico($user)]);
  if ($metodo === 'PUT') cmp_guardar_config($user);
  icc_json(['error' => 'Metodo no soportado.'], 405);
}

// ================================================= PERFILES (tarifas de mercado)
if ($recurso === 'perfiles') {
  if ($metodo === 'GET') {
    $filas = $db->query('SELECT id, nombre, datos, updated_at FROM cmp_tel_perfiles ORDER BY nombre')->fetchAll();
    icc_json(array_map(function ($f) {
      return ['id' => (int)$f['id'], 'nombre' => $f['nombre'], 'datos' => json_decode($f['datos'], true), 'updated_at' => $f['updated_at']];
    }, $filas));
  }
  if (!cmp_puede_catalogo($user)) {
    icc_json(['error' => 'Solo administradores, jefes de equipo y backoffice pueden modificar las tarifas de mercado.'], 403);
  }
  if ($metodo === 'POST') {
    $body = cmp_body();
    $nombre = cmp_txt($body['nombre'] ?? '', 150);
    $datos = $body['datos'] ?? null;
    if (!$nombre || !is_array($datos) || !isset($datos['ops']) || !is_array($datos['ops'])) {
      icc_json(['error' => 'Faltan el nombre o las operadoras del perfil.'], 422);
    }
    $json = json_encode($datos, JSON_UNESCAPED_UNICODE);
    $stmt = $db->prepare('SELECT id, datos FROM cmp_tel_perfiles WHERE nombre = ? LIMIT 1');
    $stmt->execute([$nombre]);
    $previo = $stmt->fetch();
    $id = $previo ? (int)$previo['id'] : 0;
    if ($id) {
      $db->prepare('UPDATE cmp_tel_perfiles SET datos = ?, actualizado_por = ? WHERE id = ?')->execute([$json, $user['id'], $id]);
    } else {
      $db->prepare('INSERT INTO cmp_tel_perfiles (nombre, datos, actualizado_por) VALUES (?, ?, ?)')->execute([$nombre, $json, $user['id']]);
      $id = (int)$db->lastInsertId();
    }
    // Novedad para el equipo: cuotas y promociones que han cambiado.
    $datosAntes = $previo ? json_decode($previo['datos'], true) : null;
    nov_tel_perfil_guardado(is_array($datosAntes) ? $datosAntes : null, $datos, $nombre, (int)$id, (int)$user['id']);
    icc_json(['id' => (int)$id, 'nombre' => $nombre]);
  }
  if ($metodo === 'DELETE') {
    if (!icc_es_admin_o_superior($user)) icc_json(['error' => 'Solo un administrador puede borrar perfiles de tarifas.'], 403);
    $stmt = $db->prepare('SELECT id, nombre FROM cmp_tel_perfiles WHERE id = ?');
    $stmt->execute([(int)($_GET['id'] ?? 0)]);
    $previo = $stmt->fetch();
    $db->prepare('DELETE FROM cmp_tel_perfiles WHERE id = ?')->execute([(int)($_GET['id'] ?? 0)]);
    if ($previo) nov_tel_perfil_borrado($previo['nombre'], (int)$previo['id'], (int)$user['id']);
    icc_json(['ok' => true]);
  }
  icc_json(['error' => 'Metodo no soportado.'], 405);
}

// ================================================================== INFORMES
if ($recurso === 'informes') {
  if ($metodo === 'GET') {
    if (isset($_GET['id'])) {
      $f = tel_informe_visible($user, (int)$_GET['id']);
      if (!$f) icc_json(['error' => 'Informe no encontrado o sin permiso.'], 404);
      icc_json(tel_informe_out($f, true));
    }
    $params = [];
    $where = [cmp_where_visibles($user, 'i.usuario_id', $params)];
    if (!empty($_GET['cliente_id'])) {
      $where[] = 'i.cliente_id = ?';
      $params[] = (int)$_GET['cliente_id'];
    }
    $stmt = $db->prepare(
      'SELECT i.id, i.numero, i.usuario_id, i.cliente_id, i.cliente_nombre, i.operador_actual, i.operador_propuesto,
              i.coste_actual_anual, i.coste_propuesto_anual, i.ahorro_anual, i.pdf_ruta, i.created_at, i.updated_at,
              u.nombre AS usuario_nombre
       FROM cmp_tel_informes i JOIN usuarios u ON u.id = i.usuario_id
       WHERE ' . implode(' AND ', $where) . ' ORDER BY i.updated_at DESC, i.id DESC LIMIT 300'
    );
    $stmt->execute($params);
    icc_json(array_map(function ($f) { return tel_informe_out($f, false); }, $stmt->fetchAll()));
  }

  if ($metodo === 'POST') {
    $body = cmp_body();
    $datos = $body['datos'] ?? null;
    if (!is_array($datos)) icc_json(['error' => 'Faltan los datos del informe.'], 422);
    $id = !empty($body['id']) ? (int)$body['id'] : 0;
    $existente = null;
    if ($id) {
      $existente = tel_informe_visible($user, $id);
      if (!$existente) icc_json(['error' => 'Informe no encontrado o sin permiso.'], 404);
    }
    $numero = cmp_resolver_numero(cmp_txt($body['numero'] ?? '', 40), $existente, 'cmp_tel_informes', $id);
    if (!isset($datos['presupuesto']) || !is_array($datos['presupuesto'])) $datos['presupuesto'] = [];
    $datos['presupuesto']['numero'] = $numero;
    $json = json_encode($datos, JSON_UNESCAPED_UNICODE);
    if ($json === false || strlen($json) > 500000) icc_json(['error' => 'El informe es demasiado grande.'], 413);

    $clienteId = array_key_exists('cliente_id', $body)
      ? cmp_cliente_vinculado($user, $body['cliente_id'])
      : ($existente ? ($existente['cliente_id'] !== null ? (int)$existente['cliente_id'] : null) : null);
    $campos = [
      $clienteId,
      cmp_txt($body['cliente_nombre'] ?? null, 150),
      cmp_txt($body['operador_actual'] ?? null, 150),
      cmp_txt($body['operador_propuesto'] ?? null, 150),
      cmp_num($body['coste_actual_anual'] ?? null),
      cmp_num($body['coste_propuesto_anual'] ?? null),
      cmp_num($body['ahorro_anual'] ?? null),
    ];
    if ($existente) {
      $db->prepare(
        'UPDATE cmp_tel_informes SET numero = ?, cliente_id = ?, cliente_nombre = ?, operador_actual = ?, operador_propuesto = ?,
           coste_actual_anual = ?, coste_propuesto_anual = ?, ahorro_anual = ?, datos = ? WHERE id = ?'
      )->execute(array_merge([$numero], $campos, [$json, $id]));
    } else {
      $db->prepare(
        'INSERT INTO cmp_tel_informes (numero, usuario_id, cliente_id, cliente_nombre, operador_actual, operador_propuesto,
           coste_actual_anual, coste_propuesto_anual, ahorro_anual, datos) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )->execute(array_merge([$numero, $user['id']], $campos, [$json]));
      $id = (int)$db->lastInsertId();
    }
    icc_json(tel_informe_out(tel_informe_visible($user, $id), false), $existente ? 200 : 201);
  }

  if ($metodo === 'DELETE') {
    $id = (int)($_GET['id'] ?? 0);
    $f = tel_informe_visible($user, $id);
    if (!$f) icc_json(['error' => 'Informe no encontrado o sin permiso.'], 404);
    $db->prepare('DELETE FROM cmp_tel_informes WHERE id = ?')->execute([$id]);
    if (!empty($f['pdf_ruta']) && strpos($f['pdf_ruta'], '..') === false) @unlink(ICC_STORAGE_DIR . '/comparador/' . $f['pdf_ruta']);
    icc_json(['ok' => true]);
  }
  icc_json(['error' => 'Metodo no soportado.'], 405);
}

// ================================================================ COMISIONES
// Lectura para todo el equipo (ranking interno); cambios solo Admin.
// Nunca se imprimen en el PDF del cliente.
if ($recurso === 'comisiones') {
  if ($metodo === 'GET') {
    $filas = $db->query('SELECT id, marca, concepto, tramo, importe, importe_alta, nota FROM cmp_tel_comisiones ORDER BY marca, concepto, tramo')->fetchAll();
    icc_json(array_map(function ($f) {
      return [
        'id' => (int)$f['id'], 'marca' => $f['marca'], 'concepto' => $f['concepto'], 'tramo' => $f['tramo'],
        'importe' => (float)$f['importe'], 'importe_alta' => $f['importe_alta'] !== null ? (float)$f['importe_alta'] : null,
        'nota' => $f['nota'],
      ];
    }, $filas));
  }
  if ($metodo === 'POST') {
    if (!icc_es_admin_o_superior($user)) icc_json(['error' => 'Solo un administrador puede cambiar las comisiones.'], 403);
    $filas = cmp_body()['filas'] ?? null;
    if (!is_array($filas) || count($filas) > 1000) icc_json(['error' => 'Faltan las filas de comisiones.'], 422);
    $leerComisiones = function () use ($db) {
      $out = [];
      foreach ($db->query('SELECT id, marca, concepto, tramo, importe, importe_alta FROM cmp_tel_comisiones')->fetchAll() as $f) $out[(int)$f['id']] = $f;
      return $out;
    };
    $comisionesAntes = $leerComisiones();
    $stmt = $db->prepare('UPDATE cmp_tel_comisiones SET importe = ?, importe_alta = ? WHERE id = ?');
    $n = 0;
    foreach ($filas as $f) {
      if (!is_array($f) || !isset($f['id']) || !is_numeric($f['importe'] ?? null)) continue;
      $alta = isset($f['importe_alta']) && is_numeric($f['importe_alta']) ? (float)$f['importe_alta'] : null;
      $stmt->execute([(float)$f['importe'], $alta, (int)$f['id']]);
      $n++;
    }
    // Una sola novedad resumen con los importes que han cambiado.
    nov_tel_comisiones($comisionesAntes, $leerComisiones(), (int)$user['id']);
    icc_json(['ok' => true, 'actualizadas' => $n]);
  }
  icc_json(['error' => 'Metodo no soportado.'], 405);
}

// ======================================================================= PDF
if ($recurso === 'pdf') {
  $f = tel_informe_visible($user, (int)($_GET['id'] ?? 0));
  if (!$f) icc_json(['error' => 'Informe no encontrado o sin permiso.'], 404);
  if ($metodo === 'POST') cmp_pdf_guardar('cmp_tel_informes', 'telefonia', $f);
  if ($metodo === 'GET') cmp_pdf_descargar('telefonia', $f);
  icc_json(['error' => 'Metodo no soportado.'], 405);
}

icc_json(['error' => 'Recurso no valido. Usa config, perfiles, informes, comisiones o pdf.'], 404);
