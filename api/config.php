<?php
/**
 * ICC CRM · Configuracion de backend PHP + MySQL para Hostalia.
 * EDITA estas 4 constantes con los datos de tu base de datos MySQL
 * (Hostalia: panel -> Bases de datos MySQL -> crea una y copia aqui
 * host/nombre/usuario/contrasena).
 */
// Las credenciales reales NO se guardan en el repositorio: van en
// api/config.local.php (ignorado por git; copia config.local.example.php).
// Ese archivo puede definir cualquiera de las constantes ICC_* de abajo.
if (is_file(__DIR__ . '/config.local.php')) {
  require __DIR__ . '/config.local.php';
}
defined('ICC_DB_HOST') || define('ICC_DB_HOST', 'localhost');
defined('ICC_DB_NAME') || define('ICC_DB_NAME', 'icc_crm');
defined('ICC_DB_USER') || define('ICC_DB_USER', 'usuario');
defined('ICC_DB_PASS') || define('ICC_DB_PASS', '');

// Carpeta (fuera de acceso publico directo, protegida por storage/.htaccess)
// donde se guardan los archivos subidos. Ruta absoluta en el servidor.
defined('ICC_STORAGE_DIR') || define('ICC_STORAGE_DIR', __DIR__ . '/../storage');

// Token secreto para que una tarea programada (cron) pueda pedir una copia
// de seguridad de storage/ sin necesitar sesion de usuario (ver
// api/backup.php y la seccion "Copias de seguridad automaticas" del
// README). Cambialo por una cadena larga y aleatoria tuya.
defined('ICC_BACKUP_TOKEN') || define('ICC_BACKUP_TOKEN', 'CAMBIA_ESTE_TOKEN_POR_UNO_LARGO_Y_SECRETO');

// -----------------------------------------------------------------------------
error_reporting(E_ALL);
ini_set('display_errors', '0'); // nunca mostrar errores PHP crudos al cliente
ini_set('log_errors', '1');

$esHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
  || (!empty($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https');

session_set_cookie_params([
  'lifetime' => 0,
  'path' => '/',
  'secure' => $esHttps,
  'httponly' => true,
  'samesite' => 'Lax',
]);
session_name('icc_sesion');
session_start();

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

// Algunos hostings compartidos bloquean el metodo HTTP DELETE (y a veces
// PUT) a nivel de servidor, antes de que llegue a este script, devolviendo
// un 405 en blanco. js/api.js evita eso enviando esos borrados como POST
// normal con esta cabecera; aqui se "deshace" el disfraz para que el resto
// del codigo (que sigue comprobando $_SERVER['REQUEST_METHOD']) no tenga
// que cambiar nada.
if ($_SERVER['REQUEST_METHOD'] === 'POST' && !empty($_SERVER['HTTP_X_HTTP_METHOD_OVERRIDE'])) {
  $metodoReal = strtoupper($_SERVER['HTTP_X_HTTP_METHOD_OVERRIDE']);
  if (in_array($metodoReal, ['DELETE', 'PUT'], true)) {
    $_SERVER['REQUEST_METHOD'] = $metodoReal;
  }
}

function icc_db(): PDO {
  static $pdo = null;
  if ($pdo === null) {
    try {
      $pdo = new PDO(
        'mysql:host=' . ICC_DB_HOST . ';port=3306;dbname=' . ICC_DB_NAME . ';charset=utf8mb4',
        ICC_DB_USER,
        ICC_DB_PASS,
        [
          PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
          PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
          PDO::ATTR_EMULATE_PREPARES => false,
        ]
      );
    } catch (PDOException $e) {
      error_log('ICC DB connection error: ' . $e->getMessage());
      icc_json(['error' => 'No se pudo conectar con la base de datos. Revisa api/config.php.'], 500);
    }
  }
  return $pdo;
}

function icc_json($data, int $status = 200): void {
  http_response_code($status);
  echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  exit;
}

function icc_body(): array {
  $raw = file_get_contents('php://input');
  if ($raw === false || $raw === '') return [];
  $data = json_decode($raw, true);
  return is_array($data) ? $data : [];
}

/**
 * $forzar vuelve a consultar la base de datos aunque ya haya una cache de
 * una llamada anterior en la misma peticion: necesario justo despues de
 * cambiar $_SESSION['user_id'] (entrar/salir de "Ver como"), donde la
 * cache seguiria devolviendo al usuario de antes del cambio.
 */
function icc_current_user(bool $forzar = false): ?array {
  if (empty($_SESSION['user_id'])) return null;
  static $cache = null;
  if ($cache !== null && !$forzar) return $cache;
  $stmt = icc_db()->prepare('SELECT id, nombre, apellidos, email, telefono, empresa, cif, tipo, rol, bloqueado FROM usuarios WHERE id = ?');
  $stmt->execute([$_SESSION['user_id']]);
  $user = $stmt->fetch();
  if (!$user || (int)$user['bloqueado'] === 1) {
    session_destroy();
    return null;
  }
  $cache = $user;
  return $user;
}

/**
 * Datos del admin real cuando esta en modo "Ver como" (null si no lo esta).
 */
function icc_info_impersonacion(): ?array {
  if (empty($_SESSION['impersonador_id'])) return null;
  $stmt = icc_db()->prepare('SELECT id, nombre FROM usuarios WHERE id = ?');
  $stmt->execute([$_SESSION['impersonador_id']]);
  $admin = $stmt->fetch();
  if (!$admin) return null;
  return ['admin_id' => (int)$admin['id'], 'admin_nombre' => $admin['nombre']];
}

/**
 * Cierra el log de la impersonacion activa y devuelve la sesion al admin
 * original. Se usa tanto al pulsar "Volver a mi cuenta" como al cerrar
 * sesion mientras se esta en modo "Ver como".
 */
function icc_cerrar_impersonacion_actual(): void {
  if (!empty($_SESSION['impersonacion_log_id'])) {
    icc_db()->prepare('UPDATE logs_impersonacion SET finalizado_en = NOW() WHERE id = ?')
      ->execute([$_SESSION['impersonacion_log_id']]);
  }
  $_SESSION['user_id'] = $_SESSION['impersonador_id'] ?? null;
  unset($_SESSION['impersonador_id'], $_SESSION['impersonacion_log_id']);
}

function icc_require_auth(): array {
  $user = icc_current_user();
  if (!$user) icc_json(['error' => 'No has iniciado sesion'], 401);
  return $user;
}

function icc_require_role(array $roles): array {
  $user = icc_require_auth();
  if (!in_array($user['rol'], $roles, true)) {
    icc_json(['error' => 'No tienes permiso para esta accion'], 403);
  }
  return $user;
}

/**
 * Jerarquia por encima de "comercial/backoffice/jefe_de_equipo": Admin ve y
 * gestiona todo el negocio; Super Admin es lo mismo mas el control exclusivo
 * sobre las propias cuentas de Admin/Super Admin (ver api/agentes.php).
 */
function icc_es_admin_o_superior(array $user): bool {
  return in_array($user['rol'], ['admin', 'super_admin'], true);
}

function icc_es_super_admin(array $user): bool {
  return $user['rol'] === 'super_admin';
}

/**
 * Ids de comercial_id que un usuario puede ver/gestionar.
 * null = sin restriccion (backoffice/admin/super_admin ven todo).
 * array = solo esos ids (jefe_de_equipo: su equipo + el mismo; comercial: solo el mismo).
 */
function icc_equipo_comercial_ids(array $user): ?array {
  if ($user['rol'] === 'backoffice' || icc_es_admin_o_superior($user)) return null;
  if ($user['rol'] === 'jefe_de_equipo') {
    static $cache = [];
    if (isset($cache[$user['id']])) return $cache[$user['id']];
    $stmt = icc_db()->prepare('SELECT id FROM usuarios WHERE supervisor_id = ?');
    $stmt->execute([$user['id']]);
    $ids = array_map('intval', array_column($stmt->fetchAll(), 'id'));
    $ids[] = (int)$user['id'];
    $cache[$user['id']] = $ids;
    return $ids;
  }
  return [(int)$user['id']];
}

function icc_puede_ver_comercial(array $user, $comercialId): bool {
  $ids = icc_equipo_comercial_ids($user);
  if ($ids === null) return true;
  return $comercialId !== null && in_array((int)$comercialId, $ids, true);
}

function icc_require_csrf(): void {
  $metodo = $_SERVER['REQUEST_METHOD'];
  if (in_array($metodo, ['GET', 'HEAD', 'OPTIONS'], true)) return;
  $enviado = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
  if (empty($_SESSION['csrf']) || !hash_equals($_SESSION['csrf'], $enviado)) {
    icc_json(['error' => 'Token de seguridad invalido, recarga la pagina'], 419);
  }
}

function icc_ensure_csrf(): string {
  if (empty($_SESSION['csrf'])) {
    $_SESSION['csrf'] = bin2hex(random_bytes(32));
  }
  return $_SESSION['csrf'];
}

/**
 * Mensaje de error para el cliente: siempre queda el detalle real en el
 * log del servidor, y ademas se lo muestra a un Admin en la propia
 * respuesta (nunca a comercial/backoffice/jefe) para poder diagnosticar
 * sin tener que ir a mirar los logs del hosting.
 */
function icc_mensaje_error(string $generico, Throwable $e, array $user): string {
  error_log($generico . ': ' . $e->getMessage());
  if (icc_es_admin_o_superior($user)) {
    return $generico . ' — detalle: ' . $e->getMessage();
  }
  return $generico;
}

function icc_uuid(): string {
  $data = random_bytes(16);
  $data[6] = chr((ord($data[6]) & 0x0f) | 0x40);
  $data[8] = chr((ord($data[8]) & 0x3f) | 0x80);
  return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
}

function icc_slug_archivo(string $nombre): string {
  $nombre = preg_replace('/[^A-Za-z0-9._-]+/', '-', $nombre);
  return trim($nombre, '-') ?: 'archivo';
}

/**
 * Visibilidad de una carpeta de Ficheros. Carpeta compartida
 * (propietario_id NULL): visible para cualquier usuario autenticado —
 * biblioteca corporativa (Dosieres, Comerciales, formacion...).
 * Carpeta personal (propietario_id fijado): solo su dueno o Admin/Super Admin
 * (privacidad estricta para facturacion/nominas/comisiones individuales).
 */
function icc_carpeta_fichero_visible(array $user, array $carpeta): bool {
  if ($carpeta['propietario_id'] === null) return true;
  return icc_es_admin_o_superior($user) || (int)$carpeta['propietario_id'] === (int)$user['id'];
}

/**
 * Se dispara al dar de alta un comercial/agente: crea automaticamente su
 * carpeta personal de facturacion dentro de "Facturacion de Comerciales",
 * aislada del resto del equipo (solo la ve el propio usuario y Admin).
 */
function icc_crear_carpeta_personal_fichero(PDO $db, int $usuarioId, string $nombre): void {
  $stmt = $db->prepare("SELECT id FROM ficheros_carpetas WHERE nombre = 'Facturacion de Comerciales' AND parent_id IS NULL LIMIT 1");
  $stmt->execute();
  $raiz = $stmt->fetch();
  if (!$raiz) {
    $db->prepare("INSERT INTO ficheros_carpetas (nombre, parent_id, propietario_id, creado_por) VALUES ('Facturacion de Comerciales', NULL, NULL, NULL)")->execute();
    $raizId = (int)$db->lastInsertId();
  } else {
    $raizId = (int)$raiz['id'];
  }

  $stmt = $db->prepare('SELECT id FROM ficheros_carpetas WHERE parent_id = ? AND propietario_id = ? LIMIT 1');
  $stmt->execute([$raizId, $usuarioId]);
  if ($stmt->fetch()) return;

  $db->prepare('INSERT INTO ficheros_carpetas (nombre, parent_id, propietario_id, creado_por) VALUES (?, ?, ?, ?)')
    ->execute([$nombre !== '' ? $nombre : ('Usuario #' . $usuarioId), $raizId, $usuarioId, $usuarioId]);
}

/**
 * Recalcula el estado de un presupuesto segun los documentos que tenga
 * adjuntos (factura -> estudio -> documentacion de contrato). Nunca lo
 * hace retroceder desde "cerrado" (eso solo lo cambia la accion explicita
 * de cerrar/reabrir).
 */
function icc_recalcular_estado_presupuesto(PDO $db, int $presupuestoId): void {
  $stmt = $db->prepare('SELECT estado FROM presupuestos WHERE id = ?');
  $stmt->execute([$presupuestoId]);
  $actual = $stmt->fetch();
  if (!$actual || $actual['estado'] === 'cerrado') return;

  $stmt = $db->prepare('SELECT DISTINCT tipo FROM documentos WHERE presupuesto_id = ?');
  $stmt->execute([$presupuestoId]);
  $tipos = array_column($stmt->fetchAll(), 'tipo');

  if (in_array('contrato_firmado', $tipos, true)) {
    $nuevo = 'documentacion_contrato';
  } elseif (in_array('estudio', $tipos, true)) {
    $nuevo = 'estudio_adjunto';
  } elseif (in_array('factura', $tipos, true)) {
    $nuevo = 'factura_subida';
  } else {
    $nuevo = 'borrador';
  }

  if ($nuevo !== $actual['estado']) {
    $db->prepare('UPDATE presupuestos SET estado = ? WHERE id = ?')->execute([$nuevo, $presupuestoId]);
  }
}

/**
 * Genera un .xlsx valido (Excel de verdad, no CSV) a mano con ZipArchive,
 * sin depender de ninguna libreria externa/Composer. Devuelve el
 * contenido binario del archivo, listo para servirlo o guardarlo.
 * $cabeceras: array de textos para la fila 1. $filas: array de arrays
 * (cada uno con el mismo numero de columnas que $cabeceras).
 */
function icc_xlsx_columna(int $n): string {
  $letra = '';
  while ($n > 0) {
    $resto = ($n - 1) % 26;
    $letra = chr(65 + $resto) . $letra;
    $n = intdiv($n - 1, 26);
  }
  return $letra;
}

function icc_generar_xlsx(array $cabeceras, array $filas, string $nombreHoja = 'Datos'): string {
  $escapar = function ($texto) {
    return htmlspecialchars((string)$texto, ENT_QUOTES | ENT_XML1, 'UTF-8');
  };

  $filaAXml = function (array $valores, int $numFila) use ($escapar) {
    $celdas = '';
    $col = 1;
    foreach ($valores as $valor) {
      $ref = icc_xlsx_columna($col) . $numFila;
      $esNumero = $valor !== null && $valor !== '' && is_numeric($valor);
      if ($esNumero) {
        $celdas .= '<c r="' . $ref . '"><v>' . $escapar($valor) . '</v></c>';
      } else {
        $celdas .= '<c r="' . $ref . '" t="inlineStr"><is><t xml:space="preserve">' . $escapar($valor ?? '') . '</t></is></c>';
      }
      $col++;
    }
    return '<row r="' . $numFila . '">' . $celdas . '</row>';
  };

  $filasXml = $filaAXml($cabeceras, 1);
  $n = 2;
  foreach ($filas as $fila) {
    $filasXml .= $filaAXml($fila, $n);
    $n++;
  }

  $sheetXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' .
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' .
    '<sheetData>' . $filasXml . '</sheetData></worksheet>';

  $contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' .
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' .
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' .
    '<Default Extension="xml" ContentType="application/xml"/>' .
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' .
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' .
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' .
    '</Types>';

  $relsRaiz = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' .
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' .
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' .
    '</Relationships>';

  $workbookXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' .
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' .
    '<sheets><sheet name="' . $escapar($nombreHoja) . '" sheetId="1" r:id="rId1"/></sheets></workbook>';

  $workbookRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' .
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' .
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' .
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' .
    '</Relationships>';

  $stylesXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' .
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' .
    '<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>' .
    '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' .
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' .
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' .
    '<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>' .
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' .
    '</styleSheet>';

  $tmp = tempnam(sys_get_temp_dir(), 'icc_xlsx_');
  $zip = new ZipArchive();
  $zip->open($tmp, ZipArchive::OVERWRITE);
  $zip->addFromString('[Content_Types].xml', $contentTypes);
  $zip->addFromString('_rels/.rels', $relsRaiz);
  $zip->addFromString('xl/workbook.xml', $workbookXml);
  $zip->addFromString('xl/_rels/workbook.xml.rels', $workbookRels);
  $zip->addFromString('xl/styles.xml', $stylesXml);
  $zip->addFromString('xl/worksheets/sheet1.xml', $sheetXml);
  $zip->close();

  $contenido = file_get_contents($tmp);
  unlink($tmp);
  return $contenido;
}
