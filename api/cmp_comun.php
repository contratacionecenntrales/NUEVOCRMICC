<?php
/**
 * ICC CRM · Comun a los comparadores de Energia y Telefonia
 * (comparador/energia y comparador/telefonia).
 *
 * Usan la misma sesion, los mismos usuarios y la misma jerarquia que el resto
 * del CRM. Requiere sql/migracion_comparadores.sql.
 *
 * Rol que ven las paginas de los comparadores:
 *   admin            -> Admin y Super Admin
 *   jefe_equipo      -> Jefe de equipo, o cualquiera con el permiso
 *                       "tarifas.gestionar" (Backoffice por defecto)
 *   gestor_comercial -> el resto
 */
require_once __DIR__ . '/config.php';

const CMP_TABLAS = ['cmp_config', 'cmp_limites', 'cmp_ene_tarifas', 'cmp_ene_informes', 'cmp_tel_perfiles', 'cmp_tel_comisiones', 'cmp_tel_informes'];

/** Usuario del CRM con sesion y permiso para usar el comparador. */
function cmp_actor(): array {
  $user = icc_require_auth();
  icc_require_permiso($user, 'comparador.usar');
  if (!cmp_instalado()) {
    icc_json(['error' => 'Falta importar sql/migracion_comparadores.sql en la base de datos.'], 503);
  }
  return $user;
}

function cmp_instalado(): bool {
  static $ok = null;
  if ($ok === null) {
    try {
      foreach (CMP_TABLAS as $t) icc_db()->query("SELECT 1 FROM $t LIMIT 0");
      $ok = true;
    } catch (PDOException $e) {
      $ok = false;
    }
  }
  return $ok;
}

function cmp_rol(array $user): string {
  if (icc_es_admin_o_superior($user)) return 'admin';
  if ($user['rol'] === 'jefe_de_equipo' || icc_tiene_permiso($user, 'tarifas.gestionar')) return 'jefe_equipo';
  return 'gestor_comercial';
}

/** Puede editar catalogos y tarifas de mercado (no borrarlos). */
function cmp_puede_catalogo(array $user): bool {
  return cmp_rol($user) !== 'gestor_comercial';
}

function cmp_usuario_publico(array $user): array {
  return [
    'id' => (int)$user['id'],
    'email' => $user['email'],
    'nombre' => trim($user['nombre'] . ' ' . ($user['apellidos'] ?? '')),
    'rol' => cmp_rol($user),
  ];
}

/** Puede ver los informes de este comercial (misma jerarquia que el CRM). */
function cmp_puede_ver_usuario(array $user, int $usuarioId): bool {
  return icc_puede_ver_comercial($user, $usuarioId);
}

/** Condicion SQL "columna IN (...)" segun la jerarquia ('' si ve todo). */
function cmp_where_visibles(array $user, string $columna, array &$params): string {
  $ids = icc_equipo_comercial_ids($user);
  if ($ids === null) return '1 = 1';
  array_push($params, ...$ids);
  return $columna . ' IN (' . implode(',', array_fill(0, count($ids), '?')) . ')';
}

/** Cuerpo JSON de la peticion (maximo 1 MB salvo que se indique otro). */
function cmp_body(int $max = 1048576): array {
  $raw = file_get_contents('php://input');
  if ($raw === '' || $raw === false) return [];
  if (strlen($raw) > $max) icc_json(['error' => 'La peticion es demasiado grande.'], 413);
  $data = json_decode($raw, true);
  return is_array($data) ? $data : [];
}

function cmp_txt($valor, int $max): ?string {
  if ($valor === null || is_array($valor)) return null;
  $valor = trim((string)$valor);
  if ($valor === '') return null;
  return function_exists('mb_substr') ? mb_substr($valor, 0, $max) : substr($valor, 0, $max);
}

function cmp_num($valor, int $dec = 2): ?float {
  return is_numeric($valor) ? round((float)$valor, $dec) : null;
}

/** Cliente del CRM al que se vincula un informe (solo si quien guarda lo ve). */
function cmp_cliente_vinculado(array $user, $clienteId): ?int {
  $clienteId = (int)$clienteId;
  if ($clienteId <= 0) return null;
  $stmt = icc_db()->prepare('SELECT id, comercial_id FROM clientes WHERE id = ?');
  $stmt->execute([$clienteId]);
  $c = $stmt->fetch();
  return $c && icc_puede_ver_comercial($user, $c['comercial_id']) ? (int)$c['id'] : null;
}

// ------------------------------------------------------------- Numeracion
function cmp_cfg(string $clave, string $defecto): string {
  $stmt = icc_db()->prepare('SELECT valor FROM cmp_config WHERE clave = ? LIMIT 1');
  $stmt->execute([$clave]);
  $v = $stmt->fetchColumn();
  return $v === false ? $defecto : (string)$v;
}

/** Numero usado ya en cualquiera de los dos comparadores (salvo el propio informe). */
function cmp_numero_usado(string $numero, string $tablaPropia = '', int $idPropio = 0): bool {
  foreach (['cmp_ene_informes', 'cmp_tel_informes'] as $tabla) {
    $stmt = icc_db()->prepare("SELECT id FROM $tabla WHERE numero = ? LIMIT 1");
    $stmt->execute([$numero]);
    $id = $stmt->fetchColumn();
    if ($id && !($tabla === $tablaPropia && (int)$id === $idPropio)) return true;
  }
  return false;
}

/** Siguiente numero de presupuesto, compartido por Energia y Telefonia. */
function cmp_siguiente_numero(): string {
  $db = icc_db();
  $prefijo = cmp_cfg('prefijo', 'ICC-09-');
  for ($intento = 0; $intento < 20; $intento++) {
    $db->beginTransaction();
    try {
      // El UPDATE bloquea la fila hasta el commit: dos guardados simultaneos
      // nunca reciben el mismo numero.
      $upd = $db->prepare("UPDATE cmp_config SET valor = CAST(valor AS UNSIGNED) + 1 WHERE clave = 'siguiente'");
      $upd->execute();
      if ($upd->rowCount() === 0) {
        $db->prepare("INSERT INTO cmp_config (clave, valor) VALUES ('siguiente', '2838366')")->execute();
        $actual = 2838365;
      } else {
        $actual = (int)cmp_cfg('siguiente', '1') - 1;
      }
      $db->commit();
    } catch (Throwable $e) {
      $db->rollBack();
      throw $e;
    }
    $numero = $prefijo . $actual;
    if (!cmp_numero_usado($numero)) return $numero;
  }
  icc_json(['error' => 'No se ha podido asignar un numero de presupuesto.'], 500);
  return '';
}

/**
 * Numero final al guardar: el que ya tenia, el escrito a mano si esta libre,
 * o el siguiente de la numeracion.
 */
function cmp_resolver_numero(?string $pedido, ?array $existente, string $tabla, int $id): string {
  if ($existente && (!$pedido || $pedido === $existente['numero'])) return $existente['numero'];
  if (!$pedido) return cmp_siguiente_numero();
  if (cmp_numero_usado($pedido, $tabla, $id)) {
    if ($existente) icc_json(['error' => 'Ese numero de presupuesto ya esta usado en otro informe.'], 409);
    return cmp_siguiente_numero();
  }
  // El comercial dejo el numero que proponia la pagina: se avanza el contador.
  if (!$existente && $pedido === cmp_cfg('prefijo', 'ICC-09-') . cmp_cfg('siguiente', '0')) {
    return cmp_siguiente_numero();
  }
  return $pedido;
}

function cmp_config_publica(): array {
  return ['prefijo' => cmp_cfg('prefijo', 'ICC-09-'), 'siguiente' => (int)cmp_cfg('siguiente', '2838365')];
}

/** PUT de la numeracion (solo Admin). */
function cmp_guardar_config(array $user): void {
  if (!icc_es_admin_o_superior($user)) icc_json(['error' => 'Solo un administrador puede cambiar la numeracion.'], 403);
  $body = cmp_body();
  $stmt = icc_db()->prepare('REPLACE INTO cmp_config (clave, valor) VALUES (?, ?)');
  if (isset($body['prefijo'])) $stmt->execute(['prefijo', cmp_txt($body['prefijo'], 20) ?? 'ICC-09-']);
  if (isset($body['siguiente'])) {
    $n = (int)$body['siguiente'];
    if ($n < 1) icc_json(['error' => 'El siguiente numero no es valido.'], 422);
    $stmt->execute(['siguiente', (string)$n]);
  }
  icc_json(['ok' => true]);
}

// ------------------------------------------------------- Limites de uso
function cmp_limite_superado(string $clave, int $maximo, int $ventana): bool {
  $stmt = icc_db()->prepare('SELECT contador, inicio FROM cmp_limites WHERE clave = ? LIMIT 1');
  $stmt->execute([hash('sha256', $clave)]);
  $f = $stmt->fetch();
  return $f && (int)$f['inicio'] + $ventana >= time() && (int)$f['contador'] >= $maximo;
}

function cmp_limite_sumar(string $clave, int $ventana): void {
  $id = hash('sha256', $clave);
  $ahora = time();
  icc_db()->prepare(
    'INSERT INTO cmp_limites (clave, contador, inicio) VALUES (?, 1, ?)
     ON DUPLICATE KEY UPDATE contador = IF(inicio + ? < VALUES(inicio), 1, contador + 1),
                             inicio = IF(inicio + ? < VALUES(inicio), VALUES(inicio), inicio)'
  )->execute([$id, $ahora, $ventana, $ventana]);
}

// ------------------------------------------------------- PDF archivados
/**
 * Guarda el PDF de un informe en storage/comparador/<tipo>/AAAA/MM/
 * (protegido por storage/.htaccess; solo se descarga por cmp_pdf_descargar).
 */
function cmp_pdf_guardar(string $tabla, string $tipo, array $inf): void {
  $raw = file_get_contents('php://input');
  if ($raw === false || strlen($raw) > 14 * 1024 * 1024) icc_json(['error' => 'El PDF es demasiado grande.'], 413);
  $body = json_decode($raw, true);
  $pdf = base64_decode(is_array($body) ? (string)($body['pdf'] ?? '') : '', true);
  if ($pdf === false || strlen($pdf) < 1000 || strncmp($pdf, '%PDF-', 5) !== 0) {
    icc_json(['error' => 'El archivo recibido no es un PDF valido.'], 422);
  }
  $sub = date('Y') . '/' . date('m');
  $dir = ICC_STORAGE_DIR . '/comparador/' . $tipo . '/' . $sub;
  if (!is_dir($dir) && !mkdir($dir, 0755, true)) icc_json(['error' => 'No se pudo crear la carpeta de PDF en storage/.'], 500);
  $base = $inf['numero'] . '_' . ($inf['cliente_nombre'] ?: 'cliente');
  if (function_exists('iconv')) {
    $ascii = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $base);
    if ($ascii !== false && $ascii !== '') $base = $ascii;
  }
  $nombre = substr(icc_slug_archivo($base), 0, 120) . '.pdf';
  $relativa = $tipo . '/' . $sub . '/' . $nombre;
  if (file_put_contents(ICC_STORAGE_DIR . '/comparador/' . $relativa, $pdf, LOCK_EX) === false) {
    icc_json(['error' => 'No se pudo guardar el PDF en el servidor.'], 500);
  }
  if (!empty($inf['pdf_ruta']) && $inf['pdf_ruta'] !== $relativa && strpos($inf['pdf_ruta'], '..') === false) {
    @unlink(ICC_STORAGE_DIR . '/comparador/' . $inf['pdf_ruta']);
  }
  icc_db()->prepare("UPDATE $tabla SET pdf_ruta = ?, pdf_bytes = ?, pdf_fecha = NOW() WHERE id = ?")
    ->execute([$relativa, strlen($pdf), $inf['id']]);
  icc_json(['ok' => true, 'bytes' => strlen($pdf)]);
}

function cmp_pdf_descargar(string $tipo, array $inf): void {
  $rel = (string)($inf['pdf_ruta'] ?? '');
  if ($rel === '' || strpos($rel, '..') !== false || !preg_match('#^' . $tipo . '/\d{4}/\d{2}/[A-Za-z0-9_.-]+\.pdf$#', $rel)) {
    icc_json(['error' => 'Este informe aun no tiene PDF archivado.'], 404);
  }
  $ruta = ICC_STORAGE_DIR . '/comparador/' . $rel;
  if (!is_file($ruta)) icc_json(['error' => 'El PDF no esta en el servidor.'], 404);
  header('Content-Type: application/pdf');
  header('Content-Length: ' . filesize($ruta));
  header('Content-Disposition: attachment; filename="' . basename($rel) . '"');
  header('Cache-Control: private, max-age=0, no-store');
  readfile($ruta);
  exit;
}
