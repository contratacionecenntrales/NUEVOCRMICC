<?php
/**
 * Ficha avanzada de cada agente: area privada compartida entre el propio
 * agente y sus superiores (su Jefe de equipo y Admin/Super Admin). Nadie
 * mas la ve: ni otros comerciales, ni otros jefes de equipo, ni backoffice.
 * Requiere sql/migracion_ficha_agente.sql.
 */
require __DIR__ . '/config.php';

$user = icc_require_auth();
$metodo = $_SERVER['REQUEST_METHOD'];
$id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
$db = icc_db();

// Campos que el propio agente puede mantener al dia (datos personales).
const FICHA_CAMPOS_PERSONALES = ['dni', 'fecha_nacimiento', 'direccion', 'poblacion', 'provincia', 'codigo_postal', 'email_personal', 'iban', 'contacto_emergencia'];
// Campos de gestion: solo los fija su Jefe de equipo o Admin/Super Admin.
const FICHA_CAMPOS_GESTION = ['tipo_relacion', 'fecha_incorporacion', 'zona', 'sectores', 'objetivo_contratos_mes', 'objetivo_kw_mes', 'objetivo_facturacion_mes', 'observaciones'];
const FICHA_CAMPOS_FECHA = ['fecha_nacimiento', 'fecha_incorporacion'];
const FICHA_CAMPOS_NUMERO = ['objetivo_contratos_mes', 'objetivo_kw_mes', 'objetivo_facturacion_mes'];
const FICHA_TIPOS_RELACION = ['autonomo', 'empleado', 'colaborador', 'subagente', 'otro'];
const FICHA_TIPOS_SEGUIMIENTO = ['nota', 'reunion', 'objetivo', 'formacion', 'incidencia', 'reconocimiento'];

/**
 * Nivel de acceso de $user a la ficha de $objetivo:
 *  'gestor'  -> superior directo (ve y edita todo).
 *  'propia'  -> es su propia ficha (ve todo, edita sus datos personales).
 *  null      -> sin acceso.
 */
function icc_ficha_acceso(array $user, array $objetivo): ?string {
  $esPropia = (int)$user['id'] === (int)$objetivo['id'];
  $objetivoAdminTier = in_array($objetivo['rol'], ['admin', 'super_admin'], true);

  if (icc_es_super_admin($user)) return 'gestor';
  if (icc_es_admin_o_superior($user)) {
    if ($esPropia) return 'gestor';
    return $objetivoAdminTier ? null : 'gestor';
  }
  if ($esPropia) return 'propia';
  if ($user['rol'] === 'jefe_de_equipo' && (int)$objetivo['supervisor_id'] === (int)$user['id']) {
    return 'gestor';
  }
  return null;
}

function icc_ficha_cortar(string $texto, int $max): string {
  return function_exists('mb_substr') ? mb_substr($texto, 0, $max) : substr($texto, 0, $max);
}

function icc_ficha_cargar_objetivo(PDO $db, int $id): array {
  $stmt = $db->prepare('SELECT id, nombre, apellidos, email, telefono, empresa, cif, tipo, rol, supervisor_id, bloqueado, created_at FROM usuarios WHERE id = ?');
  $stmt->execute([$id]);
  $objetivo = $stmt->fetch();
  if (!$objetivo) icc_json(['error' => 'Agente no encontrado'], 404);
  return $objetivo;
}

function icc_ficha_notificar(PDO $db, int $destinoId, int $agenteId, string $mensaje): void {
  icc_notificar($destinoId, 'ficha_agente', 'ficha_agente:' . $agenteId, $mensaje);
}

/** Ejecuta una consulta de resumen; si la tabla aun no existe, devuelve $porDefecto. */
function icc_ficha_consulta(PDO $db, string $sql, array $params, $porDefecto, bool $todas = false) {
  try {
    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    return $todas ? $stmt->fetchAll() : $stmt->fetch();
  } catch (Exception $e) {
    error_log('ICC ficha agente (resumen): ' . $e->getMessage());
    return $porDefecto;
  }
}

if (!$id) icc_json(['error' => 'Falta id'], 400);
$objetivo = icc_ficha_cargar_objetivo($db, $id);
$acceso = icc_ficha_acceso($user, $objetivo);
if ($acceso === null) {
  icc_json(['error' => 'Esta ficha es privada: solo la ven el propio agente y sus superiores'], 403);
}

// ----------------------------------------------------------------------- GET
if ($metodo === 'GET') {
  try {
    $stmt = $db->prepare('SELECT * FROM agentes_ficha WHERE usuario_id = ?');
    $stmt->execute([$id]);
    $ficha = $stmt->fetch() ?: null;

    $stmt = $db->prepare(
      'SELECT s.*, u.nombre AS autor_nombre, u.rol AS autor_rol FROM agentes_seguimiento s
       LEFT JOIN usuarios u ON u.id = s.autor_id
       WHERE s.usuario_id = ? ORDER BY s.fecha DESC, s.id DESC'
    );
    $stmt->execute([$id]);
    $seguimiento = $stmt->fetchAll();
  } catch (Exception $e) {
    icc_json(['error' => icc_mensaje_error('Falta preparar la base de datos: importa sql/migracion_ficha_agente.sql', $e, $user)], 500);
  }

  $supervisor = null;
  if ($objetivo['supervisor_id']) {
    $stmt = $db->prepare('SELECT id, nombre, apellidos, rol FROM usuarios WHERE id = ?');
    $stmt->execute([$objetivo['supervisor_id']]);
    $supervisor = $stmt->fetch() ?: null;
  }

  // Resumen de actividad en vivo: se calcula siempre a partir de los datos
  // reales del agente (clientes, contratos...), asi la ficha esta siempre
  // sincronizada con lo que el propio agente ve en su CRM.
  $clientesPorEstado = icc_ficha_consulta($db, 'SELECT estado, COUNT(*) AS total FROM clientes WHERE comercial_id = ? GROUP BY estado', [$id], [], true);
  $contratos = icc_ficha_consulta(
    $db,
    "SELECT COUNT(*) AS total,
            SUM(fecha_alta >= DATE_FORMAT(CURDATE(), '%Y-%m-01')) AS mes,
            COALESCE(SUM(CASE WHEN fecha_alta >= DATE_FORMAT(CURDATE(), '%Y-%m-01') THEN kw END), 0) AS kw_mes,
            COALESCE(SUM(kw), 0) AS kw_total
     FROM contratos WHERE comercial_id = ?",
    [$id],
    ['total' => 0, 'mes' => 0, 'kw_mes' => 0, 'kw_total' => 0]
  );
  $contratosPorEstado = icc_ficha_consulta($db, 'SELECT estado, COUNT(*) AS total FROM contratos WHERE comercial_id = ? GROUP BY estado', [$id], [], true);
  $presupuestos = icc_ficha_consulta($db, "SELECT COUNT(*) AS total, SUM(estado <> 'cerrado') AS abiertos FROM presupuestos WHERE comercial_id = ?", [$id], ['total' => 0, 'abiertos' => 0]);
  $proformas = icc_ficha_consulta(
    $db,
    "SELECT COUNT(*) AS total,
            COALESCE(SUM(CASE WHEN fecha >= DATE_FORMAT(CURDATE(), '%Y-%m-01') THEN importe END), 0) AS facturado_mes,
            COALESCE(SUM(CASE WHEN estado_pago = 'pendiente' THEN importe END), 0) AS pendiente_cobro
     FROM proformas WHERE comercial_id = ?",
    [$id],
    ['total' => 0, 'facturado_mes' => 0, 'pendiente_cobro' => 0]
  );
  $citas = icc_ficha_consulta(
    $db,
    "SELECT SUM(fecha >= CURDATE() AND estado = 'programada') AS proximas,
            SUM(fecha >= DATE_FORMAT(CURDATE(), '%Y-%m-01') AND estado = 'realizada') AS realizadas_mes
     FROM citas WHERE comercial_id = ?",
    [$id],
    ['proximas' => 0, 'realizadas_mes' => 0]
  );
  $ultimosContratos = icc_ficha_consulta(
    $db,
    'SELECT id, titular, sector, comercializadora, kw, estado, fecha_alta FROM contratos WHERE comercial_id = ? ORDER BY fecha_alta DESC, id DESC LIMIT 8',
    [$id],
    [],
    true
  );
  $proximasCitas = icc_ficha_consulta(
    $db,
    "SELECT id, cliente_nombre, fecha, hora_inicio, sector FROM citas WHERE comercial_id = ? AND fecha >= CURDATE() AND estado = 'programada' ORDER BY fecha, hora_inicio LIMIT 5",
    [$id],
    [],
    true
  );

  // Carpeta personal de Ficheros: solo la ven el propio agente y Admin.
  $carpetaPersonalId = null;
  if ((int)$user['id'] === $id || icc_es_admin_o_superior($user)) {
    $carpeta = icc_ficha_consulta($db, 'SELECT id FROM ficheros_carpetas WHERE propietario_id = ? ORDER BY id LIMIT 1', [$id], false);
    if ($carpeta) $carpetaPersonalId = (int)$carpeta['id'];
  }

  icc_json([
    'agente' => $objetivo,
    'supervisor' => $supervisor,
    'ficha' => $ficha,
    'seguimiento' => $seguimiento,
    'resumen' => [
      'clientes_por_estado' => $clientesPorEstado,
      'contratos' => $contratos,
      'contratos_por_estado' => $contratosPorEstado,
      'presupuestos' => $presupuestos,
      'proformas' => $proformas,
      'citas' => $citas,
      'ultimos_contratos' => $ultimosContratos,
      'proximas_citas' => $proximasCitas,
    ],
    'carpeta_personal_id' => $carpetaPersonalId,
    'permisos' => [
      'acceso' => $acceso,
      'editar_personal' => true,
      'editar_gestion' => $acceso === 'gestor',
    ],
  ]);
}

// ------------------------------------------------- PUT: guardar datos de ficha
if ($metodo === 'PUT') {
  icc_require_csrf();
  $body = icc_body();
  $campos = $acceso === 'gestor' ? array_merge(FICHA_CAMPOS_PERSONALES, FICHA_CAMPOS_GESTION) : FICHA_CAMPOS_PERSONALES;

  $valores = [];
  foreach ($campos as $campo) {
    if (!array_key_exists($campo, $body)) continue;
    $valor = is_string($body[$campo]) ? trim($body[$campo]) : $body[$campo];
    if (in_array($campo, FICHA_CAMPOS_FECHA, true)) {
      if ($valor === '' || $valor === null) {
        $valor = null;
      } elseif (!preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)$valor)) {
        icc_json(['error' => 'Fecha no valida en ' . $campo], 400);
      }
    } elseif (in_array($campo, FICHA_CAMPOS_NUMERO, true)) {
      if ($valor === '' || $valor === null) {
        $valor = null;
      } elseif (!is_numeric($valor) || $valor < 0) {
        icc_json(['error' => 'Valor numerico no valido en ' . $campo], 400);
      }
    } elseif ($campo === 'tipo_relacion') {
      if ($valor === '' || $valor === null) {
        $valor = null;
      } elseif (!in_array($valor, FICHA_TIPOS_RELACION, true)) {
        icc_json(['error' => 'Tipo de relacion no valido'], 400);
      }
    } else {
      $valor = icc_ficha_cortar((string)$valor, $campo === 'observaciones' ? 5000 : 255);
    }
    $valores[$campo] = $valor;
  }
  if (!$valores) icc_json(['ok' => true]);

  $columnas = array_keys($valores);
  $sql = 'INSERT INTO agentes_ficha (usuario_id, actualizado_por, ' . implode(', ', $columnas) . ') VALUES (?, ?, ' .
    implode(', ', array_fill(0, count($columnas), '?')) . ') ON DUPLICATE KEY UPDATE actualizado_por = VALUES(actualizado_por), ' .
    implode(', ', array_map(function ($c) { return "$c = VALUES($c)"; }, $columnas));
  try {
    $db->prepare($sql)->execute(array_merge([$id, $user['id']], array_values($valores)));
  } catch (Exception $e) {
    icc_json(['error' => icc_mensaje_error('No se pudo guardar la ficha', $e, $user)], 500);
  }
  icc_json(['ok' => true]);
}

// ------------------------------------------- POST: nueva entrada de seguimiento
if ($metodo === 'POST') {
  icc_require_csrf();
  $body = icc_body();
  $tipo = $body['tipo'] ?? 'nota';
  $titulo = trim((string)($body['titulo'] ?? ''));
  $contenido = trim((string)($body['contenido'] ?? ''));
  $fecha = trim((string)($body['fecha'] ?? '')) ?: date('Y-m-d');

  if (!in_array($tipo, FICHA_TIPOS_SEGUIMIENTO, true)) icc_json(['error' => 'Tipo de entrada no valido'], 400);
  if ($titulo === '') icc_json(['error' => 'Pon un titulo a la entrada'], 400);
  if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $fecha)) icc_json(['error' => 'Fecha no valida'], 400);

  try {
    $db->prepare('INSERT INTO agentes_seguimiento (usuario_id, autor_id, tipo, titulo, contenido, fecha) VALUES (?, ?, ?, ?, ?, ?)')
      ->execute([$id, $user['id'], $tipo, icc_ficha_cortar($titulo, 190), icc_ficha_cortar($contenido, 10000), $fecha]);
    $nuevoId = (int)$db->lastInsertId();
  } catch (Exception $e) {
    icc_json(['error' => icc_mensaje_error('No se pudo guardar la entrada', $e, $user)], 500);
  }

  // Sincronizacion: el otro lado se entera al momento (campana de avisos).
  if ((int)$user['id'] !== $id) {
    icc_ficha_notificar($db, $id, $id, $user['nombre'] . ' ha anadido "' . $titulo . '" a tu ficha de agente');
  } elseif ($objetivo['supervisor_id']) {
    icc_ficha_notificar($db, (int)$objetivo['supervisor_id'], $id, $objetivo['nombre'] . ' ha anadido "' . $titulo . '" a su ficha de agente');
  }

  icc_json(['id' => $nuevoId], 201);
}

// --------------------------------------- DELETE: borrar entrada de seguimiento
if ($metodo === 'DELETE') {
  icc_require_csrf();
  $segId = (int)($_GET['seguimiento_id'] ?? 0);
  $stmt = $db->prepare('SELECT id, autor_id FROM agentes_seguimiento WHERE id = ? AND usuario_id = ?');
  $stmt->execute([$segId, $id]);
  $entrada = $stmt->fetch();
  if (!$entrada) icc_json(['error' => 'Entrada no encontrada'], 404);
  // Cada uno borra lo suyo; un superior puede borrar cualquier entrada de la ficha.
  if ($acceso !== 'gestor' && (int)$entrada['autor_id'] !== (int)$user['id']) {
    icc_json(['error' => 'Solo puedes borrar las entradas que has escrito tu'], 403);
  }
  $db->prepare('DELETE FROM agentes_seguimiento WHERE id = ?')->execute([$segId]);
  icc_json(['ok' => true]);
}

icc_json(['error' => 'Metodo no permitido'], 405);
