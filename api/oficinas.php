<?php
/**
 * ICC CRM · Red de oficinas (delegaciones y distribuidores).
 * Requiere sql/migracion_oficinas.sql. Todas las metricas salen de los datos
 * reales de las personas de cada oficina (usuarios.oficina_id).
 *
 *  GET                         oficinas visibles con sus metricas y totales de la red
 *  GET    ?id=N                ficha de una oficina con su equipo (y, para Admin, personas asignables)
 *  POST   {nombre, provincia, ciudad, direccion, telefono, email, responsable_id}   crear (Admin)
 *  PUT    ?id=N {...campos, activa}                                                editar (Admin)
 *  PUT    ?id=N&action=miembros {agregar:[ids], quitar:[ids]}                       personas (Admin)
 *  POST   ?action=importar[&previa=1]  multipart archivo=CSV  vista previa / importacion (Admin)
 *  DELETE ?id=N[&desasignar=1]  borrar; si tiene personas hay que pedir desasignarlas (Admin)
 *
 * Privacidad: email y telefono de la oficina y de sus personas (responsable
 * incluido) solo se devuelven a Admin, Gerente, Coordinador y Super Admin.
 *
 * Visibilidad (privacidad entre distribuidores): Admin, Gerente, Coordinador y
 * Super Admin ven y gestionan todas. Jefe de equipo, backoffice y comercial
 * solo leen la ficha de SUS oficinas (ver ofi_visibles); del resto de la red
 * reciben unicamente agregados: oficinas activas, numero por provincia, numero
 * de provincias, actividad global del mes y la posicion de su oficina en el
 * ranking. Nunca nombres, responsables, direcciones ni cifras de otra oficina.
 */
require __DIR__ . '/config.php';

$user = icc_require_auth();
$metodo = $_SERVER['REQUEST_METHOD'];
$id = isset($_GET['id']) ? (int)$_GET['id'] : null;
$db = icc_db();
$gestiona = icc_es_admin_o_superior($user);

function ofi_disponible(PDO $db): bool {
  try {
    $db->query('SELECT o.id, u.oficina_id FROM oficinas o, usuarios u LIMIT 0');
    return true;
  } catch (PDOException $e) {
    return false;
  }
}

if (!ofi_disponible($db)) {
  icc_json(['error' => 'Para usar la red de oficinas importa antes sql/migracion_oficinas.sql en la base de datos', 'migracion_pendiente' => true], 409);
}
if ($metodo !== 'GET' && !$gestiona) {
  icc_json(['error' => 'Solo dirección puede crear, editar o borrar oficinas'], 403);
}

/** Las 52 provincias (mismo texto que js/oficinas.js). */
const OFI_PROVINCIAS = [
  'A Coruña', 'Álava', 'Albacete', 'Alicante', 'Almería', 'Asturias', 'Ávila', 'Badajoz', 'Barcelona', 'Bizkaia',
  'Burgos', 'Cáceres', 'Cádiz', 'Cantabria', 'Castellón', 'Ceuta', 'Ciudad Real', 'Córdoba', 'Cuenca', 'Gipuzkoa',
  'Girona', 'Granada', 'Guadalajara', 'Huelva', 'Huesca', 'Illes Balears', 'Jaén', 'La Rioja', 'Las Palmas', 'León',
  'Lleida', 'Lugo', 'Madrid', 'Málaga', 'Melilla', 'Murcia', 'Navarra', 'Ourense', 'Palencia', 'Pontevedra',
  'Salamanca', 'Santa Cruz de Tenerife', 'Segovia', 'Sevilla', 'Soria', 'Tarragona', 'Teruel', 'Toledo', 'Valencia', 'Valladolid',
  'Zamora', 'Zaragoza',
];

/** Otros nombres habituales de provincia (ya normalizados) => nombre oficial. */
const OFI_ALIAS_PROVINCIA = [
  'la coruna' => 'A Coruña', 'coruna' => 'A Coruña', 'a coruna' => 'A Coruña',
  'araba' => 'Álava', 'araba alava' => 'Álava', 'alava araba' => 'Álava',
  'alacant' => 'Alicante', 'alicante alacant' => 'Alicante',
  'vizcaya' => 'Bizkaia', 'biscay' => 'Bizkaia', 'guipuzcoa' => 'Gipuzkoa',
  'castello' => 'Castellón', 'castellon de la plana' => 'Castellón', 'castellon castello' => 'Castellón',
  'gerona' => 'Girona', 'lerida' => 'Lleida', 'orense' => 'Ourense',
  'baleares' => 'Illes Balears', 'islas baleares' => 'Illes Balears', 'balears' => 'Illes Balears', 'mallorca' => 'Illes Balears',
  'rioja' => 'La Rioja', 'palmas' => 'Las Palmas', 'gran canaria' => 'Las Palmas',
  'tenerife' => 'Santa Cruz de Tenerife', 'sc de tenerife' => 'Santa Cruz de Tenerife', 's c tenerife' => 'Santa Cruz de Tenerife',
  'valencia valencia' => 'Valencia', 'principado de asturias' => 'Asturias', 'comunidad de madrid' => 'Madrid',
  'region de murcia' => 'Murcia', 'navarra nafarroa' => 'Navarra', 'nafarroa' => 'Navarra',
];

/** Minusculas, sin tildes ni signos y con un solo espacio: para comparar textos. */
function ofi_norm(string $t): string {
  $t = mb_strtolower(trim($t), 'UTF-8');
  $t = strtr($t, ['á' => 'a', 'à' => 'a', 'ä' => 'a', 'â' => 'a', 'é' => 'e', 'è' => 'e', 'ë' => 'e', 'ê' => 'e',
    'í' => 'i', 'ì' => 'i', 'ï' => 'i', 'î' => 'i', 'ó' => 'o', 'ò' => 'o', 'ö' => 'o', 'ô' => 'o',
    'ú' => 'u', 'ù' => 'u', 'ü' => 'u', 'û' => 'u', 'ñ' => 'n', 'ç' => 'c', 'l·l' => 'll']);
  $t = preg_replace('/[^a-z0-9]+/', ' ', $t);
  return trim(preg_replace('/\s+/', ' ', $t));
}

/** Provincia oficial que corresponde a $texto, o null. */
function ofi_provincia(string $texto): ?string {
  $n = ofi_norm($texto);
  if ($n === '') return null;
  foreach (OFI_PROVINCIAS as $p) if (ofi_norm($p) === $n) return $p;
  return OFI_ALIAS_PROVINCIA[$n] ?? null;
}

/** La provincia mas parecida a $texto (para sugerirla cuando no es valida). */
function ofi_provincia_parecida(string $texto): string {
  $n = ofi_norm($texto);
  $mejor = OFI_PROVINCIAS[0];
  $mejorD = PHP_INT_MAX;
  $candidatos = [];
  foreach (OFI_PROVINCIAS as $p) $candidatos[ofi_norm($p)] = $p;
  foreach (OFI_ALIAS_PROVINCIA as $a => $p) $candidatos[$a] = $p;
  $ordena = function (string $t): string { $a = str_split(str_replace(' ', '', $t)); sort($a); return implode('', $a); };
  $nOrd = $ordena($n);
  foreach ($candidatos as $c => $p) {
    // Distancia de edicion + letras traspuestas (mismas letras en otro orden)
    // + penalizacion si cambia la inicial (casi nunca es la errata).
    $d = levenshtein($n, $c) + 0.5 * levenshtein($nOrd, $ordena($c)) + ($n !== '' && $n[0] !== $c[0] ? 1 : 0);
    if ($n !== '' && (strpos($c, $n) === 0 || strpos($n, $c) === 0)) $d = min($d, 1);
    if ($d < $mejorD) { $mejorD = $d; $mejor = $p; }
  }
  return $mejor;
}

/**
 * Oficinas "propias" de $user, las unicas de las que puede ver la ficha
 * (null = todas, solo Admin). Siempre: la suya (usuarios.oficina_id) y las que
 * dirige como responsable. Ademas: comercial sin oficina, la de su jefe; jefe
 * de equipo, las de su equipo; backoffice, las de sus comerciales asignados.
 */
function ofi_visibles(PDO $db, array $user): ?array {
  if (icc_es_admin_o_superior($user)) return null;
  $uid = (int)$user['id'];
  $ids = [];
  $col = function (string $sql, array $p) use ($db, &$ids) {
    $stmt = $db->prepare($sql);
    $stmt->execute($p);
    foreach ($stmt->fetchAll(PDO::FETCH_NUM) as $f) if ($f[0] !== null) $ids[] = (int)$f[0];
  };
  $col('SELECT oficina_id FROM usuarios WHERE id = ?', [$uid]);
  $col('SELECT id FROM oficinas WHERE responsable_id = ?', [$uid]);
  if ($user['rol'] === 'comercial' && !$ids) {
    $col('SELECT j.oficina_id FROM usuarios u JOIN usuarios j ON j.id = u.supervisor_id WHERE u.id = ?', [$uid]);
  }
  if ($user['rol'] === 'jefe_de_equipo') {
    $col('SELECT DISTINCT oficina_id FROM usuarios WHERE supervisor_id = ? AND oficina_id IS NOT NULL', [$uid]);
  }
  if ($user['rol'] === 'backoffice') {
    // Aunque vea toda la cartera, de la red solo ve las oficinas de sus comerciales.
    $com = array_map('intval', icc_backoffice_asignados($uid));
    if ($com) {
      $col('SELECT DISTINCT oficina_id FROM usuarios WHERE oficina_id IS NOT NULL AND id IN (' . implode(',', array_fill(0, count($com), '?')) . ')', $com);
    }
  }
  return array_values(array_unique($ids));
}

/**
 * Metricas por oficina con datos reales: personas, comerciales, clientes,
 * contratos, contratos del mes, OK del mes, kW en cartera (OK), citas del
 * mes y conversion (clientes activos / clientes).
 */
function ofi_metricas(PDO $db, ?array $soloIds = null): array {
  $mesIni = date('Y-m-01');
  $mesFin = date('Y-m-t');
  $m = [];
  $add = function (string $sql, array $params, string $campo) use ($db, &$m) {
    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    foreach ($stmt->fetchAll() as $f) {
      $m[(int)$f['oficina_id']][$campo] = $f['v'] === null ? 0 : (float)$f['v'];
    }
  };
  $add("SELECT oficina_id, COUNT(*) v FROM usuarios WHERE oficina_id IS NOT NULL AND bloqueado = 0 GROUP BY oficina_id", [], 'personas');
  $add("SELECT oficina_id, COUNT(*) v FROM usuarios WHERE oficina_id IS NOT NULL AND bloqueado = 0 AND rol = 'comercial' GROUP BY oficina_id", [], 'comerciales');
  $add("SELECT u.oficina_id, COUNT(*) v FROM clientes c JOIN usuarios u ON u.id = c.comercial_id WHERE u.oficina_id IS NOT NULL GROUP BY u.oficina_id", [], 'clientes');
  $add("SELECT u.oficina_id, COUNT(*) v FROM clientes c JOIN usuarios u ON u.id = c.comercial_id WHERE u.oficina_id IS NOT NULL AND c.estado = 'cliente_activo' GROUP BY u.oficina_id", [], 'clientes_activos');
  $add("SELECT u.oficina_id, COUNT(*) v FROM contratos k JOIN usuarios u ON u.id = k.comercial_id WHERE u.oficina_id IS NOT NULL GROUP BY u.oficina_id", [], 'contratos');
  $add("SELECT u.oficina_id, COUNT(*) v FROM contratos k JOIN usuarios u ON u.id = k.comercial_id WHERE u.oficina_id IS NOT NULL AND k.fecha_alta BETWEEN ? AND ? GROUP BY u.oficina_id", [$mesIni, $mesFin], 'contratos_mes');
  $add("SELECT u.oficina_id, COUNT(*) v FROM contratos k JOIN usuarios u ON u.id = k.comercial_id WHERE u.oficina_id IS NOT NULL AND k.estado = 'ok' AND COALESCE(k.fecha_activacion, k.fecha_alta) BETWEEN ? AND ? GROUP BY u.oficina_id", [$mesIni, $mesFin], 'ok_mes');
  $add("SELECT u.oficina_id, SUM(k.kw) v FROM contratos k JOIN usuarios u ON u.id = k.comercial_id WHERE u.oficina_id IS NOT NULL AND k.estado = 'ok' GROUP BY u.oficina_id", [], 'kw');
  $add("SELECT u.oficina_id, COUNT(*) v FROM citas c JOIN usuarios u ON u.id = c.comercial_id WHERE u.oficina_id IS NOT NULL AND c.estado <> 'ko' AND c.fecha BETWEEN ? AND ? GROUP BY u.oficina_id", [$mesIni, $mesFin], 'citas_mes');
  $out = [];
  foreach ($m as $oid => $v) {
    if ($soloIds !== null && !in_array($oid, $soloIds, true)) continue;
    $base = ['personas' => 0, 'comerciales' => 0, 'clientes' => 0, 'clientes_activos' => 0, 'contratos' => 0, 'contratos_mes' => 0, 'ok_mes' => 0, 'kw' => 0, 'citas_mes' => 0];
    $v = array_merge($base, $v);
    foreach ($v as $k => $x) $v[$k] = $k === 'kw' ? round($x, 2) : (int)$x;
    $v['conversion'] = $v['clientes'] ? (int)round($v['clientes_activos'] * 100 / $v['clientes']) : null;
    $out[$oid] = $v;
  }
  return $out;
}

function ofi_vacias(): array {
  return ['personas' => 0, 'comerciales' => 0, 'clientes' => 0, 'clientes_activos' => 0, 'contratos' => 0, 'contratos_mes' => 0, 'ok_mes' => 0, 'kw' => 0, 'citas_mes' => 0, 'conversion' => null];
}

function ofi_cargar(PDO $db, int $id): ?array {
  $stmt = $db->prepare(
    "SELECT o.*, r.nombre AS responsable_nombre, r.apellidos AS responsable_apellidos, r.rol AS responsable_rol
     FROM oficinas o LEFT JOIN usuarios r ON r.id = o.responsable_id WHERE o.id = ?"
  );
  $stmt->execute([$id]);
  $o = $stmt->fetch();
  return $o ?: null;
}

/** Valida y normaliza los campos de una oficina del cuerpo de la peticion. */
function ofi_campos(PDO $db, array $body, bool $parcial): array {
  $campos = [];
  $texto = ['nombre' => 150, 'provincia' => 60, 'ciudad' => 100, 'direccion' => 255, 'telefono' => 30, 'email' => 190];
  foreach ($texto as $k => $max) {
    if (!array_key_exists($k, $body)) continue;
    $v = trim((string)$body[$k]);
    if (mb_strlen($v) > $max) icc_json(['error' => 'El campo ' . $k . ' es demasiado largo'], 400);
    $campos[$k] = $v;
  }
  if (!$parcial || array_key_exists('nombre', $campos)) {
    if (($campos['nombre'] ?? '') === '') icc_json(['error' => 'Pon un nombre a la oficina'], 400);
  }
  if (isset($campos['provincia']) && $campos['provincia'] !== '') {
    $prov = ofi_provincia($campos['provincia']);
    if ($prov === null) icc_json(['error' => 'La provincia no es válida. ¿Querías decir ' . ofi_provincia_parecida($campos['provincia']) . '?'], 400);
    $campos['provincia'] = $prov;
  }
  if (isset($campos['email']) && $campos['email'] !== '' && !filter_var($campos['email'], FILTER_VALIDATE_EMAIL)) {
    icc_json(['error' => 'El email de la oficina no es válido'], 400);
  }
  if (array_key_exists('responsable_id', $body)) {
    $rid = $body['responsable_id'] === '' || $body['responsable_id'] === null ? null : (int)$body['responsable_id'];
    if ($rid !== null) {
      $stmt = $db->prepare('SELECT id FROM usuarios WHERE id = ? AND bloqueado = 0');
      $stmt->execute([$rid]);
      if (!$stmt->fetch()) icc_json(['error' => 'El responsable elegido no existe o está bloqueado'], 400);
    }
    $campos['responsable_id'] = $rid;
  }
  if (array_key_exists('activa', $body)) $campos['activa'] = $body['activa'] ? 1 : 0;
  return $campos;
}

// ======================================================================= GET
if ($metodo === 'GET' && $id === null) {
  $visibles = ofi_visibles($db, $user);
  $sql = "SELECT o.*, r.nombre AS responsable_nombre, r.apellidos AS responsable_apellidos, r.rol AS responsable_rol, r.avatar_ruta AS responsable_avatar
          FROM oficinas o LEFT JOIN usuarios r ON r.id = o.responsable_id";
  $params = [];
  if ($visibles !== null) {
    // Fuera de dirección solo se cargan las filas de sus propias oficinas: del
    // resto de la red no sale ningún dato concreto, solo agregados (abajo).
    $sql .= ' WHERE o.id IN (' . ($visibles ? implode(',', array_fill(0, count($visibles), '?')) : 'NULL') . ')';
    $params = $visibles;
  }
  $sql .= ' ORDER BY o.activa DESC, o.nombre ASC';
  try {
    $stmt = $db->prepare($sql);
    $stmt->execute($params);
  } catch (PDOException $e) {
    // Sin la columna avatar_ruta (instalaciones antiguas).
    $stmt = $db->prepare(str_replace(', r.avatar_ruta AS responsable_avatar', '', $sql));
    $stmt->execute($params);
  }
  $oficinas = $stmt->fetchAll();
  $metricas = ofi_metricas($db, $visibles);
  foreach ($oficinas as &$o) {
    $o['id'] = (int)$o['id'];
    $o['activa'] = (int)$o['activa'];
    $o['responsable_id'] = $o['responsable_id'] !== null ? (int)$o['responsable_id'] : null;
    $o['metricas'] = $metricas[$o['id']] ?? ofi_vacias();
    if (!$gestiona) unset($o['email'], $o['telefono']);
  }
  unset($o);
  if ($gestiona) {
    $sinOficina = (int)$db->query("SELECT COUNT(*) FROM usuarios WHERE oficina_id IS NULL AND bloqueado = 0 AND rol IN ('comercial','jefe_de_equipo','backoffice')")->fetchColumn();
    icc_json(['oficinas' => $oficinas, 'puede_gestionar' => true, 'mes' => date('Y-m'), 'personas_sin_oficina' => $sinOficina]);
  }

  // Resto de la red: solo agregados anonimos (sin nombres, ciudades ni cifras por oficina).
  $activas = $db->query('SELECT id, provincia FROM oficinas WHERE activa = 1')->fetchAll();
  $todas = ofi_metricas($db, null);
  $porProvincia = [];
  $red = ['oficinas_activas' => count($activas), 'contratos_mes' => 0, 'ok_mes' => 0, 'kw' => 0.0];
  $puntos = [];
  foreach ($activas as $a) {
    if ($a['provincia'] !== '') $porProvincia[$a['provincia']] = ($porProvincia[$a['provincia']] ?? 0) + 1;
    $m = $todas[(int)$a['id']] ?? ofi_vacias();
    $red['contratos_mes'] += $m['contratos_mes'];
    $red['ok_mes'] += $m['ok_mes'];
    $red['kw'] += $m['kw'];
    // Puntuacion del ranking del mes: OK primero, altas como desempate.
    $puntos[(int)$a['id']] = $m['ok_mes'] * 100000 + $m['contratos_mes'];
  }
  ksort($porProvincia);
  $red['kw'] = round($red['kw'], 1);
  $red['provincias'] = $porProvincia;
  $red['n_provincias'] = count($porProvincia);
  // Posicion de cada oficina propia: «tu oficina es la nº X de N».
  foreach ($oficinas as &$o) {
    if (!$o['activa'] || !isset($puntos[$o['id']])) { $o['posicion'] = null; continue; }
    $mejor = 0;
    foreach ($puntos as $p) if ($p > $puntos[$o['id']]) $mejor++;
    $o['posicion'] = $mejor + 1;
  }
  unset($o);
  icc_json(['oficinas' => $oficinas, 'puede_gestionar' => false, 'mes' => date('Y-m'), 'red' => $red]);
}

if ($metodo === 'GET' && $id !== null) {
  $visibles = ofi_visibles($db, $user);
  if ($visibles !== null && !in_array($id, $visibles, true)) icc_json(['error' => 'Oficina no encontrada'], 404);
  $o = ofi_cargar($db, $id);
  if (!$o) icc_json(['error' => 'Oficina no encontrada'], 404);
  $o['id'] = (int)$o['id'];
  $o['activa'] = (int)$o['activa'];
  $o['metricas'] = ofi_metricas($db, [$id])[$id] ?? ofi_vacias();
  // Contacto privado: email y telefono solo para direccion (tampoco viajan en el JSON).
  if (!$gestiona) unset($o['email'], $o['telefono']);

  $cols = 'u.id, u.nombre, u.apellidos, u.email, u.telefono, u.rol, u.bloqueado, u.supervisor_id';
  if (icc_v52()) $cols .= ', u.avatar_ruta, u.ultimo_acceso';
  $stmt = $db->prepare("SELECT $cols FROM usuarios u WHERE u.oficina_id = ? ORDER BY u.bloqueado ASC, FIELD(u.rol, 'coordinador','gerente','admin','super_admin','jefe_de_equipo','backoffice','comercial'), u.nombre");
  $stmt->execute([$id]);
  $miembros = $stmt->fetchAll();

  // Actividad de cada persona del mes (solo de quien el usuario puede ver).
  $mesIni = date('Y-m-01');
  $mesFin = date('Y-m-t');
  $q = [
    'clientes' => 'SELECT COUNT(*) FROM clientes WHERE comercial_id = ?',
    'contratos_mes' => 'SELECT COUNT(*) FROM contratos WHERE comercial_id = ? AND fecha_alta BETWEEN ? AND ?',
    'ok_mes' => "SELECT COUNT(*) FROM contratos WHERE comercial_id = ? AND estado = 'ok' AND COALESCE(fecha_activacion, fecha_alta) BETWEEN ? AND ?",
    'citas_mes' => "SELECT COUNT(*) FROM citas WHERE comercial_id = ? AND estado <> 'ko' AND fecha BETWEEN ? AND ?",
  ];
  foreach ($miembros as &$p) {
    $p['id'] = (int)$p['id'];
    $p['visible'] = icc_puede_ver_comercial($user, $p['id']);
    foreach ($q as $k => $sql) {
      if (!$p['visible']) { $p[$k] = null; continue; }
      $stmt = $db->prepare($sql);
      $stmt->execute($k === 'clientes' ? [$p['id']] : [$p['id'], $mesIni, $mesFin]);
      $p[$k] = (int)$stmt->fetchColumn();
    }
    if (!$gestiona) unset($p['ultimo_acceso'], $p['email'], $p['telefono']);
  }
  unset($p);

  $disponibles = [];
  if ($gestiona) {
    $stmt = $db->prepare(
      "SELECT u.id, u.nombre, u.apellidos, u.rol, u.email, u.oficina_id, o.nombre AS oficina_nombre
       FROM usuarios u LEFT JOIN oficinas o ON o.id = u.oficina_id
       WHERE u.bloqueado = 0 AND (u.oficina_id IS NULL OR u.oficina_id <> ?)
       ORDER BY (u.oficina_id IS NOT NULL), u.nombre"
    );
    $stmt->execute([$id]);
    $disponibles = $stmt->fetchAll();
  }
  icc_json(['oficina' => $o, 'miembros' => $miembros, 'disponibles' => $disponibles, 'puede_gestionar' => $gestiona, 'mes' => date('Y-m')]);
}

// ================================================================== IMPORTAR
/**
 * Importacion masiva desde CSV (Excel: "CSV UTF-8" o "CSV delimitado por punto
 * y coma"). Separador ; , o tabulador autodetectado; UTF-8 (con o sin BOM) o
 * Windows-1252 convertido. Coincidencia por nombre + ciudad sin distinguir
 * mayusculas ni tildes: reimportar el mismo archivo no duplica nada.
 * Con previa=1 solo analiza y no escribe. Las celdas vacias no borran datos.
 */
if ($metodo === 'POST' && $id === null && ($_GET['action'] ?? '') === 'importar') {
  icc_require_csrf();
  @set_time_limit(300);
  $previa = !empty($_GET['previa']);
  $corregir = !empty($_POST['corregir_provincias']);
  $f = $_FILES['archivo'] ?? null;
  if (!$f || ($f['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK || !is_uploaded_file($f['tmp_name'])) {
    icc_json(['error' => 'Elige un archivo CSV para importar'], 400);
  }
  if ($f['size'] > 5 * 1024 * 1024) icc_json(['error' => 'El archivo pesa más de 5 MB. Divídelo en varios.'], 400);
  $raw = (string)file_get_contents($f['tmp_name']);
  if (strncmp($raw, "PK", 2) === 0 || strncmp($raw, "\xD0\xCF\x11\xE0", 4) === 0) {
    icc_json(['error' => 'Es un archivo de Excel (.xlsx/.xls). En Excel usa Archivo › Guardar como › «CSV UTF-8 (delimitado por comas)» y sube ese archivo.'], 400);
  }
  // Codificacion
  $codificacion = 'UTF-8';
  if (strncmp($raw, "\xEF\xBB\xBF", 3) === 0) {
    $raw = substr($raw, 3);
  } elseif (strncmp($raw, "\xFF\xFE", 2) === 0 || strncmp($raw, "\xFE\xFF", 2) === 0) {
    $raw = mb_convert_encoding($raw, 'UTF-8', 'UTF-16');
    $codificacion = 'UTF-16';
  } elseif (!mb_check_encoding($raw, 'UTF-8')) {
    $raw = mb_convert_encoding($raw, 'UTF-8', 'Windows-1252');
    $codificacion = 'Windows-1252';
  }
  $raw = str_replace(["\r\n", "\r"], "\n", $raw);
  if (trim($raw) === '') icc_json(['error' => 'El archivo está vacío'], 400);
  // Separador: el mas frecuente en la cabecera (fuera de comillas)
  $cab = preg_replace('/"[^"]*"/', '', strtok($raw, "\n"));
  $cuentas = [';' => substr_count($cab, ';'), ',' => substr_count($cab, ','), "\t" => substr_count($cab, "\t")];
  arsort($cuentas);
  $sep = key($cuentas);
  if (reset($cuentas) === 0) $sep = ';';

  $fh = fopen('php://temp', 'r+');
  fwrite($fh, $raw);
  rewind($fh);
  $cabecera = fgetcsv($fh, 0, $sep, '"', '');
  $alias = [
    'nombre' => 'nombre', 'oficina' => 'nombre', 'tienda' => 'nombre', 'distribuidor' => 'nombre', 'nombre oficina' => 'nombre', 'nombre de la oficina' => 'nombre', 'denominacion' => 'nombre',
    'provincia' => 'provincia',
    'ciudad' => 'ciudad', 'localidad' => 'ciudad', 'municipio' => 'ciudad', 'poblacion' => 'ciudad',
    'direccion' => 'direccion', 'domicilio' => 'direccion', 'calle' => 'direccion',
    'telefono' => 'telefono', 'tel' => 'telefono', 'movil' => 'telefono', 'telefono contacto' => 'telefono',
    'email' => 'email', 'e mail' => 'email', 'correo' => 'email', 'correo electronico' => 'email', 'email oficina' => 'email',
    'responsable email' => 'responsable_email', 'email responsable' => 'responsable_email', 'responsable' => 'responsable_email', 'correo responsable' => 'responsable_email',
  ];
  $columnas = [];
  foreach ((array)$cabecera as $i => $c) {
    $n = ofi_norm((string)$c);
    if (isset($alias[$n]) && !in_array($alias[$n], $columnas, true)) $columnas[$i] = $alias[$n];
  }
  if (!in_array('nombre', $columnas, true)) {
    fclose($fh);
    icc_json(['error' => 'No encuentro la columna «nombre» en la primera fila. Usa la plantilla: nombre;provincia;ciudad;direccion;telefono;email;responsable_email'], 400);
  }
  $limites = ['nombre' => 150, 'provincia' => 60, 'ciudad' => 100, 'direccion' => 255, 'telefono' => 30, 'email' => 190];

  // Lo que ya existe, indexado por nombre + ciudad normalizados
  $existentes = [];
  foreach ($db->query('SELECT id, nombre, provincia, ciudad, direccion, telefono, email, responsable_id FROM oficinas')->fetchAll() as $o) {
    $existentes[ofi_norm($o['nombre']) . '|' . ofi_norm($o['ciudad'])] = $o;
  }
  $usuariosEmail = [];
  foreach ($db->query('SELECT id, email FROM usuarios WHERE bloqueado = 0')->fetchAll() as $u) {
    $usuariosEmail[mb_strtolower(trim((string)$u['email']))] = (int)$u['id'];
  }

  $filas = [];
  $vistos = [];
  $num = 1;
  $res = ['total' => 0, 'nuevas' => 0, 'actualizar' => 0, 'iguales' => 0, 'errores' => 0, 'avisos' => 0];
  while (($linea = fgetcsv($fh, 0, $sep, '"', '')) !== false) {
    $num++;
    if ($linea === [null] || trim(implode('', $linea)) === '') continue;
    $res['total']++;
    if ($res['total'] > 5000) { fclose($fh); icc_json(['error' => 'Máximo 5.000 filas por archivo. Divídelo en varios.'], 400); }
    $d = ['nombre' => '', 'provincia' => '', 'ciudad' => '', 'direccion' => '', 'telefono' => '', 'email' => '', 'responsable_email' => ''];
    foreach ($columnas as $i => $k) $d[$k] = trim(preg_replace('/\s+/u', ' ', (string)($linea[$i] ?? '')));
    $fila = ['fila' => $num, 'nombre' => $d['nombre'], 'ciudad' => $d['ciudad'], 'provincia' => $d['provincia'], 'errores' => [], 'avisos' => []];
    if ($d['nombre'] === '') $fila['errores'][] = 'Falta el nombre';
    foreach ($limites as $k => $max) {
      if (mb_strlen($d[$k]) > $max) $fila['errores'][] = 'El campo ' . $k . ' supera ' . $max . ' caracteres';
    }
    if ($d['provincia'] !== '') {
      $prov = ofi_provincia($d['provincia']);
      if ($prov === null) {
        $sug = ofi_provincia_parecida($d['provincia']);
        $fila['sugerencia'] = $sug;
        if ($corregir) {
          $fila['avisos'][] = 'Provincia «' . $d['provincia'] . '» corregida a ' . $sug;
          $prov = $sug;
        } else {
          $fila['errores'][] = 'Provincia no válida «' . $d['provincia'] . '». ¿Querías decir ' . $sug . '?';
        }
      }
      if ($prov !== null) { $d['provincia'] = $prov; $fila['provincia'] = $prov; }
    }
    if ($d['email'] !== '' && !filter_var($d['email'], FILTER_VALIDATE_EMAIL)) $fila['errores'][] = 'Email de la oficina no válido';
    $responsable = null;
    if ($d['responsable_email'] !== '') {
      $responsable = $usuariosEmail[mb_strtolower($d['responsable_email'])] ?? null;
      if ($responsable === null) $fila['avisos'][] = 'Responsable no encontrado entre los usuarios activos: se importa sin responsable';
    }
    $clave = ofi_norm($d['nombre']) . '|' . ofi_norm($d['ciudad']);
    if (!$fila['errores'] && isset($vistos[$clave])) {
      $fila['errores'][] = 'Repetida en el archivo (misma oficina que la fila ' . $vistos[$clave] . '): se ignora';
    }
    if ($fila['errores']) {
      $fila['accion'] = 'error';
      $res['errores']++;
    } else {
      $vistos[$clave] = $num;
      // Solo se escriben las celdas con valor: una celda vacia no borra lo que ya hay.
      $valores = [];
      foreach (['nombre', 'provincia', 'ciudad', 'direccion', 'telefono', 'email'] as $k) {
        if ($d[$k] !== '' || $k === 'ciudad') $valores[$k] = $d[$k];
      }
      if ($responsable !== null) $valores['responsable_id'] = $responsable;
      $actual = $existentes[$clave] ?? null;
      if ($actual === null) {
        $fila['accion'] = 'nueva';
        $res['nuevas']++;
      } else {
        $cambia = [];
        // Nombre y ciudad son la clave: se respeta como estan escritos en el CRM.
        unset($valores['nombre'], $valores['ciudad']);
        foreach ($valores as $k => $v) if ((string)$actual[$k] !== (string)$v) $cambia[$k] = $v;
        $fila['id'] = (int)$actual['id'];
        $fila['accion'] = $cambia ? 'actualizar' : 'igual';
        $fila['cambios'] = array_keys($cambia);
        $res[$cambia ? 'actualizar' : 'iguales']++;
        $valores = $cambia;
      }
      $fila['_valores'] = $valores;
    }
    if ($fila['avisos']) $res['avisos']++;
    $filas[] = $fila;
  }
  fclose($fh);
  if (!$res['total']) icc_json(['error' => 'El archivo solo tiene la cabecera: no hay oficinas que importar'], 400);
  $res['separador'] = $sep === "\t" ? 'tabulador' : $sep;
  $res['codificacion'] = $codificacion;
  $res['columnas'] = array_values($columnas);

  if ($previa) {
    // Para revisar: las filas con problemas y una muestra del resto. Nunca emails.
    $problemas = [];
    $muestra = [];
    foreach ($filas as $fl) {
      unset($fl['_valores']);
      if ($fl['errores'] || $fl['avisos']) { if (count($problemas) < 1000) $problemas[] = $fl; }
      elseif (count($muestra) < 15) $muestra[] = $fl;
    }
    icc_json(['previa' => true, 'resumen' => $res, 'problemas' => $problemas, 'muestra' => $muestra]);
  }

  // Escritura por lotes dentro de una transaccion: o entra todo o nada.
  $inicio = microtime(true);
  $creadas = 0;
  $actualizadas = 0;
  $db->beginTransaction();
  try {
    $cols = ['nombre', 'provincia', 'ciudad', 'direccion', 'telefono', 'email', 'responsable_id'];
    $nuevas = array_values(array_filter($filas, function ($fl) { return $fl['accion'] === 'nueva'; }));
    foreach (array_chunk($nuevas, 200) as $lote) {
      $marcas = [];
      $vals = [];
      foreach ($lote as $fl) {
        $marcas[] = '(' . implode(',', array_fill(0, count($cols), '?')) . ')';
        foreach ($cols as $c) $vals[] = $fl['_valores'][$c] ?? ($c === 'responsable_id' ? null : '');
      }
      $db->prepare('INSERT INTO oficinas (' . implode(',', $cols) . ') VALUES ' . implode(',', $marcas))->execute($vals);
      $creadas += count($lote);
    }
    foreach ($filas as $fl) {
      if ($fl['accion'] !== 'actualizar' || !$fl['_valores']) continue;
      $sets = implode(', ', array_map(function ($k) { return "$k = ?"; }, array_keys($fl['_valores'])));
      $db->prepare("UPDATE oficinas SET $sets WHERE id = ?")->execute(array_merge(array_values($fl['_valores']), [$fl['id']]));
      $actualizadas++;
    }
    // Cada responsable pasa a formar parte de su oficina si aun no tiene ninguna.
    $db->exec('UPDATE usuarios u JOIN oficinas o ON o.responsable_id = u.id SET u.oficina_id = o.id WHERE u.oficina_id IS NULL');
    $db->commit();
  } catch (Exception $e) {
    $db->rollBack();
    icc_json(['error' => icc_mensaje_error('No se pudo completar la importación; no se ha guardado nada', $e, $user)], 500);
  }
  icc_auditar((int)$user['id'], (int)$user['id'], 'oficinas_importar', "CSV {$res['total']} filas: $creadas nuevas, $actualizadas actualizadas, {$res['iguales']} sin cambios, {$res['errores']} con error");
  icc_json(['ok' => true, 'resumen' => $res, 'creadas' => $creadas, 'actualizadas' => $actualizadas, 'sin_cambios' => $res['iguales'], 'omitidas' => $res['errores'], 'ms' => (int)round((microtime(true) - $inicio) * 1000)]);
}

// ===================================================================== CREAR
if ($metodo === 'POST' && $id === null) {
  icc_require_csrf();
  $campos = ofi_campos($db, icc_body(), false);
  $stmt = $db->prepare('SELECT COUNT(*) FROM oficinas WHERE nombre = ? AND ciudad = ?');
  $stmt->execute([$campos['nombre'], $campos['ciudad'] ?? '']);
  if ((int)$stmt->fetchColumn() > 0) icc_json(['error' => 'Ya existe una oficina con ese nombre en esa ciudad'], 409);
  $cols = array_keys($campos);
  $db->prepare('INSERT INTO oficinas (' . implode(', ', $cols) . ') VALUES (' . implode(', ', array_fill(0, count($cols), '?')) . ')')
    ->execute(array_values($campos));
  $nuevo = (int)$db->lastInsertId();
  // El responsable pasa a formar parte de la oficina si aun no tiene ninguna.
  if (!empty($campos['responsable_id'])) {
    $db->prepare('UPDATE usuarios SET oficina_id = ? WHERE id = ? AND oficina_id IS NULL')->execute([$nuevo, $campos['responsable_id']]);
  }
  icc_json(['id' => $nuevo], 201);
}

// ================================================================= PERSONAS
if ($metodo === 'PUT' && $id !== null && ($_GET['action'] ?? '') === 'miembros') {
  icc_require_csrf();
  if (!ofi_cargar($db, $id)) icc_json(['error' => 'Oficina no encontrada'], 404);
  $body = icc_body();
  $limpiar = function ($lista) {
    return array_values(array_unique(array_filter(array_map('intval', is_array($lista) ? $lista : []))));
  };
  $agregar = $limpiar($body['agregar'] ?? []);
  $quitar = $limpiar($body['quitar'] ?? []);
  $db->beginTransaction();
  try {
    if ($agregar) {
      $marcas = implode(',', array_fill(0, count($agregar), '?'));
      $db->prepare("UPDATE usuarios SET oficina_id = ? WHERE id IN ($marcas)")->execute(array_merge([$id], $agregar));
    }
    if ($quitar) {
      $marcas = implode(',', array_fill(0, count($quitar), '?'));
      $db->prepare("UPDATE usuarios SET oficina_id = NULL WHERE oficina_id = ? AND id IN ($marcas)")->execute(array_merge([$id], $quitar));
    }
    $db->commit();
  } catch (Exception $e) {
    $db->rollBack();
    icc_json(['error' => icc_mensaje_error('No se pudieron guardar las personas de la oficina', $e, $user)], 500);
  }
  icc_json(['ok' => true, 'agregados' => count($agregar), 'quitados' => count($quitar)]);
}

// ==================================================================== EDITAR
if ($metodo === 'PUT' && $id !== null) {
  icc_require_csrf();
  if (!ofi_cargar($db, $id)) icc_json(['error' => 'Oficina no encontrada'], 404);
  $campos = ofi_campos($db, icc_body(), true);
  if (!$campos) icc_json(['error' => 'Nada que cambiar'], 400);
  if (isset($campos['nombre']) || isset($campos['ciudad'])) {
    $actual = ofi_cargar($db, $id);
    $stmt = $db->prepare('SELECT COUNT(*) FROM oficinas WHERE nombre = ? AND ciudad = ? AND id <> ?');
    $stmt->execute([$campos['nombre'] ?? $actual['nombre'], $campos['ciudad'] ?? $actual['ciudad'], $id]);
    if ((int)$stmt->fetchColumn() > 0) icc_json(['error' => 'Ya existe otra oficina con ese nombre en esa ciudad'], 409);
  }
  $sets = array_map(function ($k) { return "$k = ?"; }, array_keys($campos));
  $vals = array_values($campos);
  $vals[] = $id;
  $db->prepare('UPDATE oficinas SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($vals);
  if (!empty($campos['responsable_id'])) {
    $db->prepare('UPDATE usuarios SET oficina_id = ? WHERE id = ? AND oficina_id IS NULL')->execute([$id, $campos['responsable_id']]);
  }
  icc_json(['ok' => true]);
}

// ===================================================================== BORRAR
if ($metodo === 'DELETE' && $id !== null) {
  icc_require_csrf();
  if (!ofi_cargar($db, $id)) icc_json(['error' => 'Oficina no encontrada'], 404);
  $stmt = $db->prepare('SELECT COUNT(*) FROM usuarios WHERE oficina_id = ?');
  $stmt->execute([$id]);
  $personas = (int)$stmt->fetchColumn();
  if ($personas > 0 && empty($_GET['desasignar'])) {
    icc_json(['error' => 'La oficina tiene ' . $personas . ($personas === 1 ? ' persona' : ' personas') . '. Confirma que quedan sin oficina para borrarla.', 'personas' => $personas], 409);
  }
  $db->beginTransaction();
  try {
    // Sus personas no se tocan: solo quedan sin oficina. Clientes y contratos siguen igual.
    $db->prepare('UPDATE usuarios SET oficina_id = NULL WHERE oficina_id = ?')->execute([$id]);
    $db->prepare('DELETE FROM oficinas WHERE id = ?')->execute([$id]);
    $db->commit();
  } catch (Exception $e) {
    $db->rollBack();
    icc_json(['error' => icc_mensaje_error('No se pudo borrar la oficina', $e, $user)], 500);
  }
  icc_json(['ok' => true, 'personas_desasignadas' => $personas]);
}

icc_json(['error' => 'Peticion no valida'], 404);
