<?php
/**
 * ICC CRM · Generador de la DEMOSTRACION (datos de ejemplo, NO reales)
 *
 * SOLO para una instalacion aparte (p. ej. demo.crm...) con su propia base
 * de datos y ICC_MODO_DEMO = true en api/config.local.php. Borra TODO el
 * contenido de esa base de datos y la rellena con datos ficticios:
 * empresas "Demo ...", emails @demo.invalid, CIF de prueba.
 *
 * Uso (desde la carpeta del CRM, por SSH o consola; nunca por web):
 *   php sql/demo/generar_demo.php --confirmar
 *   php sql/demo/generar_demo.php --confirmar --oficinas=12 --comerciales=6 --meses=9 --semilla=7
 *   php sql/demo/generar_demo.php --refrescar      (mueve las fechas para que la actividad acabe hoy)
 *
 * Opciones:
 *   --oficinas=N      oficinas / equipos (por defecto 6, maximo 60)
 *   --comerciales=N   comerciales por oficina (por defecto 5, maximo 30)
 *   --meses=N         meses de historia (por defecto 6, maximo 24)
 *   --semilla=N       semilla del azar: misma semilla = mismos datos (por defecto 2026)
 */

if (php_sapi_name() !== 'cli') {
  http_response_code(403);
  exit('Solo se puede ejecutar desde la linea de comandos.');
}

$_SERVER['SCRIPT_NAME'] = 'generar_demo.php';
$_SERVER['REQUEST_METHOD'] = 'GET';
require __DIR__ . '/../../api/config.php';

function salir(string $msg, int $codigo = 1): void {
  fwrite($codigo ? STDERR : STDOUT, $msg . PHP_EOL);
  exit($codigo);
}

if (!ICC_MODO_DEMO) {
  salir("ABORTADO: esta instalacion no esta en modo demostracion.\n" .
    "El generador BORRA toda la base de datos, asi que solo funciona con\n" .
    "define('ICC_MODO_DEMO', true); en api/config.local.php de una instalacion APARTE con su propia BD.");
}

$opc = getopt('', ['confirmar', 'refrescar', 'oficinas:', 'comerciales:', 'meses:', 'semilla:']);
$db = icc_db();
$db->exec('SET NAMES utf8mb4');

function tabla_existe(PDO $db, string $t): bool {
  try { $db->query("SELECT 1 FROM `$t` LIMIT 0"); return true; } catch (PDOException $e) { return false; }
}
function columna_existe(PDO $db, string $t, string $c): bool {
  $s = $db->prepare('SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?');
  $s->execute([$t, $c]);
  return (int)$s->fetchColumn() > 0;
}

// ------------------------------------------------------------- --refrescar
if (isset($opc['refrescar'])) {
  // Ultima actividad pasada (contratos y citas ya ocurridas) -> hoy.
  $ultima = $db->query("SELECT GREATEST(
      COALESCE((SELECT MAX(fecha_alta) FROM contratos), '1970-01-01'),
      COALESCE((SELECT MAX(fecha) FROM citas WHERE estado IN ('realizada','ko')), '1970-01-01'))")->fetchColumn();
  $dias = (int)$db->query("SELECT DATEDIFF(CURDATE(), " . $db->quote($ultima) . ")")->fetchColumn();
  if ($ultima === '1970-01-01' || $dias <= 0) salir("Nada que refrescar: la actividad ya llega a hoy.", 0);
  $cambios = [
    'clientes' => ['created_at', 'updated_at', 'fecha_cierre_prevista'],
    'historial_estado' => ['created_at'],
    'presupuestos' => ['created_at', 'updated_at', 'fecha_permanencia'],
    'contratos' => ['fecha_alta', 'fecha_activacion', 'created_at', 'updated_at'],
    'citas' => ['fecha', 'created_at', 'updated_at', 'asignada_en'],
    'proformas' => ['fecha', 'created_at'],
    'cmp_ene_informes' => ['created_at', 'updated_at'],
    'cmp_tel_informes' => ['created_at', 'updated_at'],
    'notificaciones' => ['created_at'],
  ];
  foreach ($cambios as $t => $cols) {
    if (!tabla_existe($db, $t)) continue;
    $sets = [];
    foreach ($cols as $c) if (columna_existe($db, $t, $c)) $sets[] = "`$c` = DATE_ADD(`$c`, INTERVAL $dias DAY)";
    if ($sets) $db->exec("UPDATE `$t` SET " . implode(', ', $sets));
  }
  salir("Demo refrescada: fechas movidas $dias dias; la actividad termina hoy.", 0);
}

if (!isset($opc['confirmar'])) {
  salir("Este script BORRA toda la base de datos '" . ICC_DB_NAME . "' y la rellena con datos de ejemplo.\n" .
    "Si es la base de datos de la DEMOSTRACION, repite con --confirmar.");
}

$nOficinas = max(1, min(60, (int)($opc['oficinas'] ?? 6)));
$nComerciales = max(1, min(30, (int)($opc['comerciales'] ?? 5)));
$nMeses = max(1, min(24, (int)($opc['meses'] ?? 6)));
$semilla = (int)($opc['semilla'] ?? 2026);
mt_srand($semilla);

function azar(array $a) { return $a[mt_rand(0, count($a) - 1)]; }
function entre(int $a, int $b): int { return mt_rand($a, $b); }
function prob(float $p): bool { return mt_rand() / mt_getrandmax() < $p; }
function fecha_hace(int $dias): string { return date('Y-m-d', strtotime("-$dias days")); }
function hora_hace(int $dias): string { return date('Y-m-d H:i:s', strtotime("-$dias days") - mt_rand(0, 8 * 3600)); }

// ------------------------------------------------------------- 1. Vaciar
$db->exec('SET FOREIGN_KEY_CHECKS = 0');
$tablas = $db->query("SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'")->fetchAll(PDO::FETCH_COLUMN);
$conservar = ['cmp_ene_tarifas', 'cmp_tel_comisiones', 'cmp_tel_perfiles', 'cmp_config', 'cmp_limites', 'tarifa_mercado'];
foreach ($tablas as $t) {
  if (!in_array($t, $conservar, true)) $db->exec("DELETE FROM `$t`");
}
$db->exec('SET FOREIGN_KEY_CHECKS = 1');

// ------------------------------------------------------------- 2. Catalogos
$ciudades = [
  ['Madrid', 'Madrid'], ['Barcelona', 'Barcelona'], ['Valencia', 'Valencia'], ['Sevilla', 'Sevilla'], ['Bilbao', 'Bizkaia'],
  ['Gijón', 'Asturias'], ['Oviedo', 'Asturias'], ['Málaga', 'Málaga'], ['Zaragoza', 'Zaragoza'], ['Murcia', 'Murcia'],
  ['Palma', 'Illes Balears'], ['Las Palmas', 'Las Palmas'], ['Alicante', 'Alicante'], ['Valladolid', 'Valladolid'],
  ['Vigo', 'Pontevedra'], ['A Coruña', 'A Coruña'], ['Granada', 'Granada'], ['Santander', 'Cantabria'], ['Pamplona', 'Navarra'],
  ['Córdoba', 'Córdoba'], ['Salamanca', 'Salamanca'], ['Burgos', 'Burgos'], ['León', 'León'], ['Cádiz', 'Cádiz'],
  ['Almería', 'Almería'], ['Logroño', 'La Rioja'], ['Badajoz', 'Badajoz'], ['Toledo', 'Toledo'], ['Tarragona', 'Tarragona'], ['Girona', 'Girona'],
];
$nombres = ['Alba', 'Bruno', 'Carla', 'Diego', 'Elena', 'Fran', 'Gloria', 'Hugo', 'Irene', 'Javier', 'Lucía', 'Mario', 'Nuria', 'Óscar', 'Paula',
  'Raúl', 'Sara', 'Tomás', 'Úrsula', 'Víctor', 'Ainhoa', 'Bea', 'Celia', 'Dani', 'Eva', 'Fede', 'Gema', 'Iván', 'Jorge', 'Lola'];
$apellidos = ['Demo', 'Ejemplo', 'Prueba', 'Muestra', 'Ficticio', 'Simulado'];
$negocios = ['Bar', 'Panadería', 'Farmacia', 'Taller', 'Clínica', 'Hotel', 'Gimnasio', 'Academia', 'Ferretería', 'Restaurante', 'Peluquería',
  'Óptica', 'Frutería', 'Gestoría', 'Inmobiliaria', 'Floristería', 'Autoescuela', 'Comunidad de vecinos', 'Bodega', 'Carnicería'];
$comercializadoras = ['Iberdrola', 'Endesa', 'Naturgy', 'Repsol', 'TotalEnergies', 'Holaluz', 'Factor Energía', 'Plenitude'];
$operadores = ['Movistar', 'Vodafone', 'Orange', 'MásMóvil', 'Yoigo', 'Digi', 'O2'];
$tarifas = ['2.0TD', '3.0TD', '6.1TD', 'RL.1', 'RL.2'];
$sectores = ['energia', 'energia', 'energia', 'telecomunicaciones', 'telecomunicaciones', 'alarmas', 'seguros'];
$tiposCliente = ['residencial', 'pyme', 'pyme', 'pyme', 'comunidad_vecinos', 'gran_cuenta'];
$estadosCliente = ['lead_captado', 'estudio_backoffice', 'oferta_presentada', 'en_cierre', 'cliente_activo', 'cliente_activo', 'cliente_activo', 'perdido'];
$motivos = ['Precio', 'Permanencia con su compañía', 'No contesta', 'Se va con la competencia', 'No le interesa ahora'];

$clave = 'Demo2026!';
$hash = password_hash($clave, PASSWORD_DEFAULT);
$insUsuario = $db->prepare('INSERT INTO usuarios (nombre, apellidos, email, password_hash, telefono, empresa, rol, supervisor_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
$crear = function (string $nombre, string $ape, string $email, string $rol, ?int $sup = null) use ($db, $insUsuario, $hash): int {
  $insUsuario->execute([$nombre, $ape, $email, $hash, '600 000 ' . str_pad((string)mt_rand(0, 999), 3, '0', STR_PAD_LEFT), 'ICC Demo S.L.', $rol, $sup]);
  return (int)$db->lastInsertId();
};

// ------------------------------------------------------------- 3. Personas
$admin = $crear('Admin', 'Demo', 'demo-admin@demo.invalid', 'super_admin');
$gerente = $crear('Gerente', 'Demo', 'demo-gerente@demo.invalid', 'gerente');
$coord = $crear('Coordinador', 'Demo', 'demo-coordinador@demo.invalid', 'coordinador');
$bo1 = $crear('Backoffice', 'Demo', 'demo-backoffice@demo.invalid', 'backoffice');
$bo2 = $crear('Tramitación', 'Demo', 'demo-tramitacion@demo.invalid', 'backoffice');

$hayOficinas = tabla_existe($db, 'oficinas') && columna_existe($db, 'usuarios', 'oficina_id');
$jefes = [];
$comerciales = []; // id => ['oficina' => idx, 'ciudad' => ...]
$oficinaIds = [];
for ($o = 0; $o < $nOficinas; $o++) {
  [$ciudad, $provincia] = $ciudades[$o % count($ciudades)];
  $sufijo = $o >= count($ciudades) ? ' ' . (intdiv($o, count($ciudades)) + 1) : '';
  $jefe = $crear(azar($nombres), 'Jefe Demo', 'demo-jefe' . ($o + 1) . '@demo.invalid', 'jefe_de_equipo', $o % 2 ? $coord : $gerente);
  $jefes[] = $jefe;
  $oficinaId = null;
  if ($hayOficinas) {
    $db->prepare('INSERT INTO oficinas (nombre, provincia, ciudad, direccion, telefono, email, responsable_id, activa) VALUES (?, ?, ?, ?, ?, ?, ?, 1)')
      ->execute(['Oficina Demo ' . $ciudad . $sufijo, $provincia, $ciudad, 'Calle Ejemplo ' . ($o + 1), '900 000 ' . str_pad((string)$o, 3, '0', STR_PAD_LEFT),
        'oficina' . ($o + 1) . '@demo.invalid', $jefe]);
    $oficinaId = (int)$db->lastInsertId();
    $oficinaIds[] = $oficinaId;
    $db->prepare('UPDATE usuarios SET oficina_id = ? WHERE id = ?')->execute([$oficinaId, $jefe]);
  }
  for ($c = 0; $c < $nComerciales; $c++) {
    $n = count($comerciales) + 1;
    $id = $crear(azar($nombres), azar($apellidos) . ' ' . $n, 'demo-comercial' . $n . '@demo.invalid', 'comercial', $jefe);
    if ($oficinaId) $db->prepare('UPDATE usuarios SET oficina_id = ? WHERE id = ?')->execute([$oficinaId, $id]);
    $comerciales[$id] = ['ciudad' => $ciudad, 'provincia' => $provincia, 'nivel' => mt_rand(40, 140) / 100];
  }
}
// Backoffice: la primera lleva las primeras oficinas.
if (tabla_existe($db, 'backoffice_equipos')) {
  foreach (array_slice($jefes, 0, max(1, intdiv(count($jefes), 2))) as $j) {
    $db->prepare('INSERT IGNORE INTO backoffice_equipos (backoffice_id, jefe_id) VALUES (?, ?)')->execute([$bo1, $j]);
  }
}
$db->exec("UPDATE usuarios SET numero_relacion = CONCAT('DEMO-', LPAD(id, 5, '0'))");
if (tabla_existe($db, 'agentes_ficha')) {
  foreach ($comerciales as $id => $info) {
    $db->prepare('INSERT INTO agentes_ficha (usuario_id, poblacion, provincia, tipo_relacion, zona, objetivo_contratos_mes, objetivo_kw_mes) VALUES (?, ?, ?, ?, ?, ?, ?)')
      ->execute([$id, $info['ciudad'], $info['provincia'], azar(['autonomo', 'colaborador', 'empleado']), $info['ciudad'], entre(4, 10), entre(60, 200)]);
  }
}

// Carpetas de Ficheros por defecto + personales.
foreach (['Formación', 'Comercializadoras', 'Eficiencia energetica', 'Telefonia', 'Alarmas y Seguridad', 'Recursos generales', 'Facturacion de Comerciales'] as $carpeta) {
  $db->prepare('INSERT INTO ficheros_carpetas (nombre, parent_id, propietario_id, creado_por) VALUES (?, NULL, NULL, NULL)')->execute([$carpeta]);
}
foreach ($comerciales as $id => $info) {
  $nombre = $db->query('SELECT nombre FROM usuarios WHERE id = ' . (int)$id)->fetchColumn();
  icc_crear_carpeta_personal_fichero($db, $id, $nombre);
}

// ------------------------------------------------------------- 4. Actividad
$diasHistoria = $nMeses * 30;
$insCliente = $db->prepare('INSERT INTO clientes (comercial_id, razon_social, cif, contacto_nombre, contacto_telefono, contacto_email, tipo_cliente, telefono, email,
  direccion_suministro, estado, motivo_perdida, valor_estimado, fecha_cierre_prevista, upload_token, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
$conValor = columna_existe($db, 'clientes', 'valor_estimado');
if (!$conValor) {
  $insCliente = $db->prepare('INSERT INTO clientes (comercial_id, razon_social, cif, contacto_nombre, contacto_telefono, contacto_email, tipo_cliente, telefono, email,
    direccion_suministro, estado, motivo_perdida, upload_token, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
}
$insServicio = tabla_existe($db, 'cliente_servicios') ? $db->prepare('INSERT INTO cliente_servicios (cliente_id, servicio) VALUES (?, ?)') : null;
$insHist = $db->prepare('INSERT INTO historial_estado (cliente_id, estado_anterior, estado_nuevo, cambiado_por, created_at) VALUES (?, ?, ?, ?, ?)');
$insPres = $db->prepare('INSERT INTO presupuestos (cliente_id, comercial_id, sector, tipo_suministro, cups, comercializadora_actual, tarifa_actual, consumo_anual_kwh,
  fecha_permanencia, estado, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
$insContrato = $db->prepare('INSERT INTO contratos (cliente_id, comercial_id, sector, numero_contrato, titular, cif_titular, tarifa, comercializadora, kw, estado,
  fecha_alta, fecha_activacion, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
$conEquipo = columna_existe($db, 'citas', 'equipo_id');
$insCita = $db->prepare('INSERT INTO citas (comercial_id, ' . ($conEquipo ? 'equipo_id, ' : '') . 'cliente_id, tipo, cliente_nombre, contacto_nombre, telefono, direccion, sector, fecha,
  hora_inicio, hora_fin, estado, resumen, creado_por, created_at) VALUES (?,' . ($conEquipo ? '?,' : '') . '?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
$insProforma = $db->prepare('INSERT INTO proformas (numero, facturado_por, comercial_id, cliente_email, importe, estado_pago, fecha, notas, created_at) VALUES (?,?,?,?,?,?,?,?,?)');

$orden = ['lead_captado', 'estudio_backoffice', 'oferta_presentada', 'en_cierre', 'cliente_activo'];
$nCli = 0; $nCon = 0; $nCit = 0; $nPre = 0; $nPro = 0; $nInf = 0;
$supervisorDe = $db->query('SELECT id, supervisor_id FROM usuarios')->fetchAll(PDO::FETCH_KEY_PAIR);
foreach ($comerciales as $cid => $info) {
  $clientesComercial = (int)round(entre(6, 10) * $nMeses / 3 * $info['nivel']);
  for ($k = 0; $k < $clientesComercial; $k++) {
    $nCli++;
    $hace = entre(1, $diasHistoria);
    $alta = hora_hace($hace);
    $estado = azar($estadosCliente);
    if ($hace < 10 && $estado === 'cliente_activo') $estado = azar(['lead_captado', 'estudio_backoffice', 'oferta_presentada']);
    $sector = azar($sectores);
    $razon = 'Demo ' . azar($negocios) . ' Ejemplo ' . $nCli;
    $cif = 'B' . str_pad((string)(10000000 + $nCli), 8, '0', STR_PAD_LEFT);
    $valor = $estado === 'perdido' ? null : entre(120, 2400);
    $params = [$cid, $razon, $cif, azar($nombres) . ' Demo', '600 111 ' . str_pad((string)($nCli % 1000), 3, '0', STR_PAD_LEFT),
      'cliente' . $nCli . '@demo.invalid', azar($tiposCliente), '900 111 ' . str_pad((string)($nCli % 1000), 3, '0', STR_PAD_LEFT),
      'info' . $nCli . '@demo.invalid', 'Calle Demo ' . entre(1, 99) . ', ' . $info['ciudad'], $estado, $estado === 'perdido' ? azar($motivos) : ''];
    if ($conValor) array_push($params, $valor, in_array($estado, ['oferta_presentada', 'en_cierre'], true) ? date('Y-m-d', strtotime('+' . entre(3, 45) . ' days')) : null);
    array_push($params, bin2hex(random_bytes(8)) . '-demo-' . $nCli, $alta, $alta);
    $insCliente->execute($params);
    $cliId = (int)$db->lastInsertId();
    if ($insServicio) $insServicio->execute([$cliId, $sector === 'telecomunicaciones' ? 'telecomunicaciones' : $sector]);

    // Historial de fases hasta el estado actual.
    $hasta = $estado === 'perdido' ? entre(1, 3) : array_search($estado, $orden, true);
    $previo = null;
    for ($f = 0; $f <= $hasta; $f++) {
      $diaF = max(0, $hace - $f * entre(2, 9));
      $insHist->execute([$cliId, $previo, $orden[$f], $cid, hora_hace($diaF)]);
      $previo = $orden[$f];
    }
    if ($estado === 'perdido') $insHist->execute([$cliId, $previo, 'perdido', $cid, hora_hace(max(0, $hace - 12))]);

    // Presupuesto en las fases de estudio en adelante.
    if ($hasta >= 1 && in_array($sector, ['energia', 'telecomunicaciones', 'alarmas', 'seguros'], true)) {
      $nPre++;
      $estPres = $estado === 'cliente_activo' ? 'cerrado' : azar(['borrador', 'factura_subida', 'estudio_adjunto', 'documentacion_contrato']);
      $insPres->execute([$cliId, $cid, $sector, $sector === 'energia' ? azar(['electricidad', 'electricidad', 'gas', 'dual']) : null,
        $sector === 'energia' ? 'ES0021' . str_pad((string)$nCli, 14, '0', STR_PAD_LEFT) . 'DM' : '', $sector === 'energia' ? azar($comercializadoras) : azar($operadores),
        $sector === 'energia' ? azar($tarifas) : 'Fibra + móvil', $sector === 'energia' ? entre(2500, 60000) : null,
        prob(.3) ? date('Y-m-d', strtotime('+' . entre(5, 55) . ' days')) : null, $estPres, hora_hace(max(0, $hace - 3)), hora_hace(max(0, $hace - entre(3, 20)))]);
    }

    // Contrato para los clientes activos.
    if ($estado === 'cliente_activo') {
      $nCon++;
      $diaAlta = max(0, $hace - entre(8, 25));
      $estCon = $diaAlta < 6 ? 'tramitado' : azar(['ok', 'ok', 'ok', 'verificado', 'en_distribuidora', 'incidencias', 'ko']);
      $sectorCon = in_array($sector, ['energia', 'telecomunicaciones', 'alarmas', 'seguros'], true) ? $sector : 'energia';
      $insContrato->execute([$cliId, $cid, $sectorCon, 'DEMO-' . str_pad((string)$nCon, 6, '0', STR_PAD_LEFT), $razon, $cif,
        $sectorCon === 'energia' ? azar($tarifas) : '', $sectorCon === 'energia' ? azar($comercializadoras) : azar($operadores),
        $sectorCon === 'energia' ? entre(30, 1500) / 10 : null, $estCon, fecha_hace($diaAlta),
        in_array($estCon, ['ok', 'verificado'], true) ? fecha_hace(max(0, $diaAlta - entre(3, 15))) : null, hora_hace($diaAlta), hora_hace(max(0, $diaAlta - 2))]);
    }

    // Citas: pasadas y algunas futuras.
    $citas = entre(1, 3);
    for ($ci = 0; $ci < $citas; $ci++) {
      $nCit++;
      $futura = prob(.25) && $estado !== 'perdido' && $estado !== 'cliente_activo';
      $dia = $futura ? date('Y-m-d', strtotime('+' . entre(0, 21) . ' days')) : fecha_hace(max(0, $hace - $ci * entre(2, 8)));
      $h = entre(9, 18);
      $estCita = $futura ? azar(['programada', 'programada', 'confirmada']) : azar(['realizada', 'realizada', 'realizada', 'ko', 'reprogramada']);
      $creador = prob(.35) ? azar([$bo1, $bo2]) : $cid;
      $p = [$cid];
      if ($conEquipo) $p[] = $supervisorDe[$cid] ?? null;
      array_push($p, $cliId, azar(['visita', 'visita', 'llamada', 'reunion', 'firma']), $razon, azar($nombres) . ' Demo', '600 222 ' . str_pad((string)($nCit % 1000), 3, '0', STR_PAD_LEFT),
        'Calle Demo ' . entre(1, 99) . ', ' . $info['ciudad'], $sector === 'telecomunicaciones' ? 'telecomunicaciones' : ($sector === 'energia' ? 'energia' : 'multisectorial'),
        $dia, sprintf('%02d:%s:00', $h, azar(['00', '30'])), sprintf('%02d:%s:00', $h + 1, azar(['00', '30'])), $estCita,
        $estCita === 'realizada' ? 'Visita de ejemplo (demo): presentada la propuesta.' : null, $creador, hora_hace(max(0, $hace - $ci)));
      $insCita->execute($p);
    }
  }

  // Proformas mensuales.
  for ($m = 0; $m < $nMeses; $m++) {
    $nPro++;
    $fecha = date('Y-m-d', strtotime('-' . ($m * 30 + entre(0, 5)) . ' days'));
    $insProforma->execute(['DEMO-PF-' . str_pad((string)$nPro, 5, '0', STR_PAD_LEFT), azar(['ICC', 'ELITE_ENERGY', 'EVOLVIX_GLOBAL']), $cid,
      'comercial@demo.invalid', entre(150, 1800), $m === 0 && prob(.6) ? 'pendiente' : (prob(.15) ? 'pendiente' : 'pagada'), $fecha, 'Proforma de ejemplo (demo)', $fecha . ' 10:00:00']);
  }
}

// Informes de los comparadores (resumen; el detalle de la herramienta va vacio).
foreach (['cmp_ene_informes' => 'energia', 'cmp_tel_informes' => 'telefonia'] as $t => $tipo) {
  if (!tabla_existe($db, $t)) continue;
  $clientes = $db->query("SELECT id, razon_social, comercial_id FROM clientes WHERE estado IN ('oferta_presentada','en_cierre','cliente_activo') ORDER BY RAND(" . $semilla . ") LIMIT " . (int)max(5, $nCli / 6))->fetchAll();
  foreach ($clientes as $i => $c) {
    $nInf++;
    $actual = entre(900, 9000);
    $propuesto = (int)round($actual * (entre(72, 96) / 100));
    $dias = entre(0, $diasHistoria);
    if ($tipo === 'energia') {
      $db->prepare('INSERT INTO cmp_ene_informes (numero, usuario_id, cliente_id, tipo, cliente_nombre, comercializadora_actual, tarifa_propuesta, coste_actual_anual, coste_propuesto_anual, ahorro_anual, datos, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
        ->execute(['DEMO-E-' . str_pad((string)$nInf, 5, '0', STR_PAD_LEFT), $c['comercial_id'], $c['id'], 'luz', $c['razon_social'], azar($comercializadoras),
          'Tarifa Demo Fija', $actual, $propuesto, $actual - $propuesto, '{"demo":true}', hora_hace($dias)]);
    } else {
      $db->prepare('INSERT INTO cmp_tel_informes (numero, usuario_id, cliente_id, cliente_nombre, operador_actual, operador_propuesto, coste_actual_anual, coste_propuesto_anual, ahorro_anual, datos, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
        ->execute(['DEMO-T-' . str_pad((string)$nInf, 5, '0', STR_PAD_LEFT), $c['comercial_id'], $c['id'], $c['razon_social'], azar($operadores), azar($operadores),
          $actual, $propuesto, $actual - $propuesto, '{"demo":true}', hora_hace($dias)]);
    }
  }
}

echo "Demo generada (semilla $semilla): $nOficinas oficinas" . ($hayOficinas ? '' : ' (como equipos: la tabla oficinas no existe)') .
  ", " . count($comerciales) . " comerciales, $nCli clientes, $nPre presupuestos, $nCon contratos, $nCit citas, $nPro proformas, $nInf informes." . PHP_EOL . PHP_EOL;
echo "Accesos de la demostracion (contraseña para todos: $clave)" . PHP_EOL;
foreach ([['Super Admin', 'demo-admin@demo.invalid'], ['Gerente', 'demo-gerente@demo.invalid'], ['Coordinador', 'demo-coordinador@demo.invalid'],
  ['Backoffice', 'demo-backoffice@demo.invalid'], ['Jefe de equipo', 'demo-jefe1@demo.invalid'], ['Comercial', 'demo-comercial1@demo.invalid']] as [$rol, $email]) {
  echo str_pad($rol, 16) . $email . PHP_EOL;
}
