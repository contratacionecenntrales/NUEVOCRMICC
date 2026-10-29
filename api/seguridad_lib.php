<?php
/**
 * ICC CRM · Nucleo del Centro de Seguridad (adaptado del Centro de Seguridad
 * de Labs Command Center 360). Lo carga api/config.php.
 *
 * - Doble factor (TOTP, RFC 6238): codigo de 6 cifras del movil (Google o
 *   Microsoft Authenticator) + 10 codigos de recuperacion de un solo uso.
 * - Freno contra fuerza bruta pensado para que un atacante NO pueda dejar
 *   bloqueada a una persona legitima.
 * - Registro de cada intento de entrada y bloqueos temporales por IP o cuenta.
 * - Bitacora sellada: cada apunte lleva la huella del anterior; si alguien la
 *   toca por fuera del CRM (phpMyAdmin...), la verificacion lo detecta.
 * - Revision del servidor: archivos peligrosos en la web, configuracion y
 *   documentos fuera de la carpeta publica, prueba de ataque desde fuera.
 *
 * Mientras no se importe sql/migracion_seguridad.sql, todo esto se desactiva
 * solo y el CRM sigue funcionando como antes.
 */

/** true si existen las tablas de sql/migracion_seguridad.sql. */
function icc_seg_ok(): bool {
  static $ok = null;
  if ($ok === null) {
    try {
      icc_db()->query('SELECT 1 FROM seg_2fa LIMIT 0');
      icc_db()->query('SELECT 1 FROM seg_bitacora LIMIT 0');
      $ok = true;
    } catch (PDOException $e) {
      $ok = false;
    }
  }
  return $ok;
}

function icc_seg_q(string $sql, array $p = []): PDOStatement {
  $st = icc_db()->prepare($sql);
  $st->execute($p);
  return $st;
}

function icc_seg_fila(string $sql, array $p = []): ?array {
  $f = icc_seg_q($sql, $p)->fetch();
  return $f ?: null;
}

function icc_seg_navegador(): ?string {
  $ua = (string)($_SERVER['HTTP_USER_AGENT'] ?? '');
  return $ua === '' ? null : mb_substr($ua, 0, 255);
}

/* ===========================================================================
   DOBLE FACTOR (TOTP)
   ========================================================================= */
function icc_b32_codifica(string $bin): string {
  $abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  $bits = '';
  foreach (str_split($bin) as $c) $bits .= str_pad(decbin(ord($c)), 8, '0', STR_PAD_LEFT);
  $out = '';
  foreach (str_split($bits, 5) as $t) $out .= $abc[bindec(str_pad($t, 5, '0'))];
  return $out;
}

function icc_b32_decodifica(string $txt): string {
  $abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  $txt = strtoupper(preg_replace('/[^A-Za-z2-7]/', '', $txt));
  $bits = '';
  foreach (str_split($txt) as $c) $bits .= str_pad(decbin(strpos($abc, $c)), 5, '0', STR_PAD_LEFT);
  $out = '';
  foreach (str_split($bits, 8) as $b) if (strlen($b) === 8) $out .= chr(bindec($b));
  return $out;
}

/** Codigo de 6 cifras de un paso de 30 segundos. */
function icc_totp_codigo(string $secreto, int $paso): string {
  $clave = icc_b32_decodifica($secreto);
  $msg = pack('N2', ($paso >> 32) & 0xFFFFFFFF, $paso & 0xFFFFFFFF);
  $h = hash_hmac('sha1', $msg, $clave, true);
  $o = ord($h[19]) & 0x0F;
  $num = ((ord($h[$o]) & 0x7F) << 24) | (ord($h[$o + 1]) << 16) | (ord($h[$o + 2]) << 8) | ord($h[$o + 3]);
  return str_pad((string)($num % 1000000), 6, '0', STR_PAD_LEFT);
}

function icc_2fa(int $usuarioId): ?array {
  if (!icc_seg_ok()) return null;
  return icc_seg_fila('SELECT * FROM seg_2fa WHERE usuario_id = ?', [$usuarioId]);
}

function icc_2fa_activo(int $usuarioId): bool {
  $f = icc_2fa($usuarioId);
  return $f && (int)$f['activo'] === 1;
}

/**
 * Comprueba un codigo de 6 cifras o uno de recuperacion (XXXX-XXXX).
 * Devuelve 'ok', 'recuperacion' o false. Cada codigo sirve UNA sola vez.
 */
function icc_2fa_comprueba(int $usuarioId, string $codigo, bool $exigirActivo = true) {
  $f = icc_2fa($usuarioId);
  if (!$f || ($exigirActivo && (int)$f['activo'] !== 1)) return false;
  $codigo = strtoupper(trim($codigo));
  if (preg_match('/^\d{6}$/', $codigo)) {
    $ahora = (int)floor(time() / 30);
    foreach ([-1, 0, 1] as $d) {
      $p = $ahora + $d;
      if ($p > (int)$f['ultimo_paso'] && hash_equals(icc_totp_codigo($f['secreto'], $p), $codigo)) {
        // Atomico: si dos peticiones usan el mismo codigo a la vez, solo vale una.
        $n = icc_seg_q('UPDATE seg_2fa SET ultimo_paso = ? WHERE usuario_id = ? AND ultimo_paso < ?', [$p, $usuarioId, $p])->rowCount();
        return $n ? 'ok' : false;
      }
    }
    return false;
  }
  if ($exigirActivo && preg_match('/^[A-Z0-9]{4}-?[A-Z0-9]{4}$/', $codigo)) {
    $limpio = str_replace('-', '', $codigo);
    $antes = (string)$f['recuperacion'];
    $lista = json_decode($antes, true) ?: [];
    foreach ($lista as $i => $h) {
      if (hash_equals($h, hash('sha256', $limpio))) {
        unset($lista[$i]);
        $n = icc_seg_q('UPDATE seg_2fa SET recuperacion = ? WHERE usuario_id = ? AND recuperacion = ?',
          [json_encode(array_values($lista)), $usuarioId, $antes])->rowCount();
        return $n ? 'recuperacion' : false;
      }
    }
  }
  return false;
}

/** Empieza la activacion: secreto nuevo (aun inactivo) y su enlace otpauth://. */
function icc_2fa_inicia(int $usuarioId, string $email): array {
  $f = icc_2fa($usuarioId);
  if ($f && (int)$f['activo'] === 1) icc_json(['error' => 'El doble factor ya está activado en esta cuenta.'], 409);
  $secreto = icc_b32_codifica(random_bytes(20));
  icc_seg_q('INSERT INTO seg_2fa (usuario_id, secreto, activo, ultimo_paso, recuperacion, creado) VALUES (?, ?, 0, 0, NULL, NOW())
             ON DUPLICATE KEY UPDATE secreto = VALUES(secreto), ultimo_paso = 0, creado = NOW()', [$usuarioId, $secreto]);
  $etiqueta = rawurlencode('ICC CRM:' . $email);
  return [
    'secreto' => $secreto,
    'otpauth' => 'otpauth://totp/' . $etiqueta . '?secret=' . $secreto . '&issuer=' . rawurlencode('ICC CRM') . '&algorithm=SHA1&digits=6&period=30',
  ];
}

/** Termina la activacion con un codigo correcto. Devuelve los codigos de recuperacion. */
function icc_2fa_activa(int $usuarioId, string $codigo): array {
  if (icc_2fa_comprueba($usuarioId, $codigo, false) !== 'ok') {
    icc_json(['error' => 'El código no es correcto. Comprueba que la hora del móvil es automática y prueba con el siguiente.'], 400);
  }
  $abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  $claros = [];
  $hashes = [];
  for ($i = 0; $i < 10; $i++) {
    $c = '';
    for ($j = 0; $j < 8; $j++) $c .= $abc[random_int(0, strlen($abc) - 1)];
    $claros[] = substr($c, 0, 4) . '-' . substr($c, 4);
    $hashes[] = hash('sha256', $c);
  }
  icc_seg_q('UPDATE seg_2fa SET activo = 1, activado = NOW(), recuperacion = ? WHERE usuario_id = ?', [json_encode($hashes), $usuarioId]);
  return $claros;
}

function icc_2fa_quita(int $usuarioId): void {
  if (icc_seg_ok()) icc_seg_q('DELETE FROM seg_2fa WHERE usuario_id = ?', [$usuarioId]);
}

/* ===========================================================================
   FRENO CONTRA FUERZA BRUTA, BLOQUEOS Y REGISTRO DE ACCESOS
   ========================================================================= */
function icc_seg_bloqueo(string $tipo, ?string $valor): ?array {
  if (!icc_seg_ok() || $valor === null || $valor === '') return null;
  return icc_seg_fila('SELECT hasta, motivo FROM seg_bloqueos WHERE tipo = ? AND valor = ? AND hasta > NOW()', [$tipo, $valor]);
}

function icc_seg_bloquea(string $tipo, ?string $valor, int $minutos, string $motivo): void {
  if (!icc_seg_ok() || $valor === null || $valor === '') return;
  icc_seg_q('INSERT INTO seg_bloqueos (tipo, valor, hasta, motivo, creado) VALUES (?, ?, NOW() + INTERVAL ? MINUTE, ?, NOW())
             ON DUPLICATE KEY UPDATE hasta = VALUES(hasta), motivo = VALUES(motivo), creado = NOW()',
    [$tipo, mb_substr($valor, 0, 190), $minutos, mb_substr($motivo, 0, 255)]);
  icc_seg_anota('Bloqueo automático', ($tipo === 'ip' ? 'IP ' : 'Cuenta ') . $valor . ' durante ' . $minutos . ' min: ' . $motivo, null);
}

/**
 * Pensado para que un atacante NO pueda dejar fuera a una persona legitima:
 *  - 8 fallos de la misma cuenta desde la misma IP en 15 min: esa IP no puede
 *    probar mas esa cuenta (desde otras conexiones si se puede entrar).
 *  - 30 fallos desde una IP en 15 min: IP bloqueada 1 hora.
 *  - 100 fallos desde una IP en 24 h: IP bloqueada 24 horas.
 *  - 40 fallos contra una cuenta desde muchas IPs en 15 min (ataque
 *    repartido): esa cuenta se frena 15 minutos para todos.
 * Devuelve el mensaje de bloqueo, o null si puede intentarlo.
 */
function icc_seg_freno(string $email): ?string {
  if (!icc_seg_ok()) return null;
  $ip = icc_ip();
  if (icc_seg_bloqueo('ip', $ip)) return 'Demasiados intentos fallidos desde tu conexión. Vuelve a probar más tarde.';
  $n = icc_seg_fila('SELECT COALESCE(SUM(email = ? AND ip <=> ?), 0) cuenta_ip, COALESCE(SUM(ip <=> ?), 0) ip15, COALESCE(SUM(email = ?), 0) cuenta
                     FROM seg_intentos WHERE ts > NOW() - INTERVAL 15 MINUTE', [$email, $ip, $ip, $email]);
  if ((int)$n['ip15'] >= 30) {
    icc_seg_bloquea('ip', $ip, 60, '30 intentos fallidos en 15 minutos');
    return 'Demasiados intentos fallidos desde tu conexión. Vuelve a probar en una hora.';
  }
  $dia = icc_seg_fila('SELECT COUNT(*) n FROM seg_intentos WHERE ip <=> ? AND ts > NOW() - INTERVAL 1 DAY', [$ip]);
  if ((int)$dia['n'] >= 100) {
    icc_seg_bloquea('ip', $ip, 24 * 60, '100 intentos fallidos en 24 horas');
    return 'Demasiados intentos fallidos desde tu conexión. Vuelve a probar mañana.';
  }
  if ((int)$n['cuenta_ip'] >= 8) return 'Demasiados intentos fallidos. Espera 15 minutos y vuelve a probar.';
  if ((int)$n['cuenta'] >= 40) return 'Esta cuenta está recibiendo muchos intentos fallidos y se ha frenado 15 minutos por seguridad.';
  return null;
}

/** Deja constancia de cada intento de entrada (180 dias). */
function icc_seg_registra(?int $usuarioId, ?string $email, string $resultado, ?string $detalle = null): void {
  if (!icc_seg_ok()) return;
  try {
    icc_seg_q('INSERT INTO seg_accesos (usuario_id, email, ip, agente, resultado, detalle) VALUES (?, ?, ?, ?, ?, ?)',
      [$usuarioId, $email === null ? null : mb_substr($email, 0, 190), icc_ip(), icc_seg_navegador(), $resultado,
       $detalle === null ? null : mb_substr($detalle, 0, 255)]);
    if (mt_rand(1, 100) === 1) {
      icc_seg_q('DELETE FROM seg_accesos WHERE ts < NOW() - INTERVAL 180 DAY');
      icc_seg_q('DELETE FROM seg_intentos WHERE ts < NOW() - INTERVAL 2 DAY');
      icc_seg_q('DELETE FROM seg_bloqueos WHERE hasta < NOW() - INTERVAL 7 DAY');
    }
  } catch (Exception $e) {
    error_log('ICC seguridad registro: ' . $e->getMessage());
  }
}

/** Intento fallido: cuenta para el freno y queda en el registro. */
function icc_seg_fallo(string $email, ?int $usuarioId, string $resultado, string $detalle): void {
  if (!icc_seg_ok()) return;
  icc_seg_q('INSERT INTO seg_intentos (email, ip) VALUES (?, ?)', [mb_substr($email, 0, 190), icc_ip()]);
  icc_seg_registra($usuarioId, $email, $resultado, $detalle);
}

/** Cifrado de contrasenas: Argon2id si el servidor lo tiene; si no, bcrypt reforzado. */
function icc_hash_password(string $clave): string {
  if (defined('PASSWORD_ARGON2ID')) return password_hash($clave, PASSWORD_ARGON2ID);
  return password_hash($clave, PASSWORD_BCRYPT, ['cost' => 12]);
}

function icc_password_anticuada(string $hash): bool {
  if (defined('PASSWORD_ARGON2ID')) return password_needs_rehash($hash, PASSWORD_ARGON2ID);
  return password_needs_rehash($hash, PASSWORD_BCRYPT, ['cost' => 12]);
}

/* ===========================================================================
   BITACORA SELLADA
   ========================================================================= */
function icc_seg_eslabon(string $previa, array $f): string {
  return hash('sha256', implode("\x1f", [$previa, (string)$f['seq'], (string)$f['ts'], (string)$f['actor_id'], (string)$f['actor_nombre'],
    (string)$f['destino_id'], (string)$f['accion'], (string)$f['detalle']]));
}

/** Anota un apunte encadenado. Nunca rompe la peticion. */
function icc_seg_anota(string $accion, string $detalle = '', ?int $actorId = null, ?int $destinoId = null): void {
  if (!icc_seg_ok()) return;
  $db = icc_db();
  try {
    $db->query("SELECT GET_LOCK('icc_bitacora', 5)");
    $nombre = 'sistema';
    if ($actorId) {
      $a = icc_seg_fila('SELECT TRIM(CONCAT(COALESCE(nombre, ""), " ", COALESCE(apellidos, ""))) n FROM usuarios WHERE id = ?', [$actorId]);
      if ($a && $a['n'] !== '') $nombre = $a['n'];
    }
    $ts = (string)$db->query('SELECT NOW()')->fetchColumn();
    $previa = icc_seg_fila("SELECT valor FROM seg_ajustes WHERE clave = 'bitacora_cadena'");
    $previa = $previa ? (string)$previa['valor'] : '';
    // Se inserta con una huella provisional para conocer el numero (seq) y se sella.
    icc_seg_q('INSERT INTO seg_bitacora (ts, actor_id, actor_nombre, destino_id, accion, detalle, ip, cadena) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [$ts, $actorId, mb_substr($nombre, 0, 190), $destinoId, mb_substr($accion, 0, 200), $detalle, icc_ip(), str_repeat('0', 64)]);
    $seq = (int)$db->lastInsertId();
    $cadena = icc_seg_eslabon($previa, ['seq' => $seq, 'ts' => $ts, 'actor_id' => $actorId, 'actor_nombre' => mb_substr($nombre, 0, 190),
      'destino_id' => $destinoId, 'accion' => mb_substr($accion, 0, 200), 'detalle' => $detalle]);
    icc_seg_q('UPDATE seg_bitacora SET cadena = ? WHERE seq = ?', [$cadena, $seq]);
    icc_seg_q("INSERT INTO seg_ajustes (clave, valor) VALUES ('bitacora_cadena', ?) ON DUPLICATE KEY UPDATE valor = VALUES(valor)", [$cadena]);
  } catch (Exception $e) {
    error_log('ICC bitacora: ' . $e->getMessage());
  } finally {
    try { $db->query("SELECT RELEASE_LOCK('icc_bitacora')"); } catch (Exception $e) { /* nada */ }
  }
}

/** Recorre la bitacora y comprueba que nadie la ha tocado por fuera del CRM. */
function icc_seg_verifica_bitacora(): array {
  if (!icc_seg_ok()) return ['ok' => true, 'apuntes' => 0, 'mensaje' => 'Falta importar sql/migracion_seguridad.sql.'];
  $previa = '';
  $n = 0;
  $st = icc_seg_q('SELECT seq, ts, actor_id, actor_nombre, destino_id, accion, detalle, cadena FROM seg_bitacora ORDER BY seq');
  while ($f = $st->fetch()) {
    if (icc_seg_eslabon($previa, $f) !== $f['cadena']) {
      return ['ok' => false, 'apuntes' => $n, 'rota_en' => (int)$f['seq'],
        'mensaje' => 'El apunte nº ' . $f['seq'] . ' («' . $f['accion'] . '») se ha modificado o falta uno anterior.'];
    }
    $previa = $f['cadena'];
    $n++;
  }
  $ultima = icc_seg_fila("SELECT valor FROM seg_ajustes WHERE clave = 'bitacora_cadena'");
  if ($ultima && (string)$ultima['valor'] !== $previa) {
    return ['ok' => false, 'apuntes' => $n, 'rota_en' => null, 'mensaje' => 'Faltan apuntes al final de la bitácora: alguien ha borrado los más recientes.'];
  }
  return ['ok' => true, 'apuntes' => $n, 'rota_en' => null, 'mensaje' => $n . ' apuntes encadenados, ninguno modificado ni borrado.'];
}

/* ===========================================================================
   REVISION DEL SERVIDOR
   ========================================================================= */
function icc_seg_dir_web(): string {
  return rtrim(str_replace('\\', '/', dirname(__DIR__)), '/');
}

/** Lo que no deberia estar en la carpeta publica. */
function icc_seg_peligrosos(): array {
  $web = icc_seg_dir_web();
  $out = [];
  $mal = '/\.(zip|sql|txt|md|bak|old|log|env|tar|gz|tgz|7z|rar|sh|py|orig|swp|csv)$/i';
  foreach (@scandir($web) ?: [] as $e) {
    if ($e === '.' || $e === '..' || $e === '.user.ini' || $e === 'robots.txt' || strpos($e, '.htaccess') === 0) continue;
    $ruta = $web . '/' . $e;
    if (is_file($ruta) && preg_match($mal, $e)) {
      $out[] = ['ruta' => $e, 'tipo' => 'archivo', 'tamano' => filesize($ruta),
        'motivo' => preg_match('/\.(zip|sql|txt|csv)$/i', $e) ? 'Puede contener contraseñas o datos: no debe estar en la web.' : 'Archivo de trabajo que no debe estar en la web.'];
    }
    if (is_dir($ruta) && $e === 'ACTUALIZAR-BASE-DE-DATOS') {
      $out[] = ['ruta' => $e . '/', 'tipo' => 'carpeta', 'tamano' => null,
        'motivo' => 'Carpeta de instalación con la base de datos completa: bórrala en cuanto la hayas importado.'];
    }
    // Copias antiguas del CRM (un zip extraido en una subcarpeta, por ejemplo).
    if (is_dir($ruta) && !in_array($e, ['api', 'storage', 'sql', 'js', 'css', 'assets', 'comparador'], true) && is_file($ruta . '/api/config.php')) {
      $out[] = ['ruta' => $e . '/', 'tipo' => 'carpeta', 'tamano' => null,
        'motivo' => 'Copia antigua del CRM, con su propia configuración y su propia puerta de entrada.'];
    }
  }
  if (ICC_CONFIG_EN === 'privada' && is_file(__DIR__ . '/config.local.php')) {
    $out[] = ['ruta' => 'api/config.local.php', 'tipo' => 'archivo', 'tamano' => filesize(__DIR__ . '/config.local.php'),
      'motivo' => 'Copia de la configuración (con la contraseña de MySQL) que ya está en la carpeta privada.'];
  }
  return $out;
}

function icc_seg_borra_arbol(string $ruta): bool {
  if (is_link($ruta) || is_file($ruta)) return @unlink($ruta);
  foreach (@scandir($ruta) ?: [] as $e) if ($e !== '.' && $e !== '..') icc_seg_borra_arbol($ruta . '/' . $e);
  return @rmdir($ruta);
}

/** Borra SOLO rutas que el propio analisis ha marcado como peligrosas. */
function icc_seg_limpia(array $pedidas, int $actorId): array {
  $web = icc_seg_dir_web();
  $permitidas = [];
  foreach (icc_seg_peligrosos() as $p) $permitidas[$p['ruta']] = true;
  $hechas = [];
  $fallidas = [];
  foreach ($pedidas as $r) {
    $r = (string)$r;
    if (!isset($permitidas[$r])) continue;
    $real = $r === 'api/config.local.php' ? realpath(__DIR__ . '/config.local.php') : realpath($web . '/' . rtrim($r, '/'));
    if (!$real || strpos(str_replace('\\', '/', $real), realpath($web) . '/') !== 0) continue;
    if (icc_seg_borra_arbol($real)) $hechas[] = $r; else $fallidas[] = $r;
  }
  if ($hechas) icc_seg_anota('Archivos peligrosos eliminados', implode(', ', $hechas), $actorId);
  return ['ok' => !$fallidas, 'borrados' => $hechas, 'fallidos' => $fallidas];
}

/** Lleva api/config.local.php a la carpeta privada del hosting. */
function icc_seg_protege_config(int $actorId): array {
  if (ICC_DIR_PRIVADO === '') icc_json(['error' => 'Este hosting no tiene carpeta privada accesible: la configuración se queda en api/, protegida por el .htaccess.'], 409);
  $origen = __DIR__ . '/config.local.php';
  $destino = ICC_DIR_PRIVADO . '/config.php';
  if (ICC_CONFIG_EN === 'privada') {
    if (is_file($origen)) @unlink($origen);
    return ['ok' => true, 'mensaje' => 'La configuración ya estaba en la carpeta privada.'];
  }
  if (!is_file($origen)) icc_json(['error' => 'No se encuentra api/config.local.php.'], 404);
  if (!is_dir(ICC_DIR_PRIVADO) && !@mkdir(ICC_DIR_PRIVADO, 0750, true)) icc_json(['error' => 'No se ha podido crear la carpeta privada.'], 500);
  @file_put_contents(ICC_DIR_PRIVADO . '/.htaccess', "Require all denied\n");
  $contenido = file_get_contents($origen);
  if (@file_put_contents($destino, $contenido, LOCK_EX) === false || file_get_contents($destino) !== $contenido) {
    icc_json(['error' => 'No se ha podido copiar la configuración a la carpeta privada.'], 500);
  }
  @chmod($destino, 0640);
  $borrada = @unlink($origen);
  icc_seg_anota('Configuración protegida', 'La configuración de MySQL se ha llevado a la carpeta privada del hosting.', $actorId);
  return ['ok' => true, 'mensaje' => $borrada ? 'Configuración llevada a la carpeta privada.'
    : 'Copiada a la carpeta privada, pero no se ha podido borrar api/config.local.php: bórralo a mano.'];
}

function icc_seg_cuenta_archivos(string $dir): int {
  if (!is_dir($dir)) return 0;
  $n = 0;
  $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS));
  foreach ($it as $f) if ($f->isFile() && $f->getFilename() !== '.htaccess') $n++;
  return $n;
}

/**
 * Lleva los documentos de storage/ (dentro de la web) a la carpeta privada.
 * Se copian primero a una carpeta temporal; solo cuando TODO esta copiado se
 * activa la carpeta privada y se borran los originales. Si algo falla, el
 * CRM sigue usando storage/ como hasta ahora.
 */
function icc_seg_mueve_archivos(int $actorId): array {
  if (ICC_DIR_PRIVADO === '') icc_json(['error' => 'Este hosting no tiene carpeta privada: los documentos se quedan en storage/, protegidos por el .htaccess.'], 409);
  $origen = rtrim(ICC_STORAGE_WEB, '/');
  $final = ICC_DIR_PRIVADO . '/storage';
  if (rtrim(ICC_STORAGE_DIR, '/') === $final) return ['ok' => true, 'movidos' => 0, 'mensaje' => 'Los documentos ya están en la carpeta privada.'];
  $tmp = ICC_DIR_PRIVADO . '/storage.copiando';
  if (is_dir($tmp)) icc_seg_borra_arbol($tmp);
  if (!@mkdir($tmp, 0750, true)) icc_json(['error' => 'No se ha podido crear la carpeta privada de documentos.'], 500);
  @set_time_limit(600);
  $n = 0;
  $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($origen, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::SELF_FIRST);
  foreach ($it as $f) {
    $rel = substr(str_replace('\\', '/', $f->getPathname()), strlen($origen) + 1);
    if ($rel === '.htaccess') continue;
    $d = $tmp . '/' . $rel;
    if ($f->isDir()) {
      if (!is_dir($d) && !@mkdir($d, 0750, true)) { icc_seg_borra_arbol($tmp); icc_json(['error' => 'No se ha podido copiar la carpeta ' . $rel], 500); }
    } elseif (!@copy($f->getPathname(), $d) || filesize($d) !== $f->getSize()) {
      icc_seg_borra_arbol($tmp);
      icc_json(['error' => 'No se ha podido copiar ' . $rel . '. No se ha cambiado nada.'], 500);
    } else {
      $n++;
    }
  }
  @file_put_contents($tmp . '/.htaccess', "Require all denied\n");
  if (!@rename($tmp, $final)) { icc_seg_borra_arbol($tmp); icc_json(['error' => 'No se ha podido activar la carpeta privada. No se ha cambiado nada.'], 500); }
  // Ya esta activa: los originales de la web sobran.
  foreach (@scandir($origen) ?: [] as $e) {
    if ($e !== '.' && $e !== '..' && $e !== '.htaccess') icc_seg_borra_arbol($origen . '/' . $e);
  }
  icc_seg_anota('Documentos protegidos', $n . ' archivo(s) llevados a la carpeta privada del hosting.', $actorId);
  return ['ok' => true, 'movidos' => $n, 'mensaje' => $n . ' documento(s) llevados a la carpeta privada.'];
}

/* ===========================================================================
   PRUEBA DE ATAQUE DESDE FUERA (el servidor se pide a si mismo archivos cebo)
   ========================================================================= */
function icc_seg_url_base(): ?string {
  $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
    || (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && strtolower($_SERVER['HTTP_X_FORWARDED_PROTO']) === 'https');
  $host = (string)($_SERVER['SERVER_NAME'] ?? '');
  if (!preg_match('/^[a-z0-9.-]+$/i', $host)) return null;
  $puerto = (int)($_SERVER['SERVER_PORT'] ?? 0);
  $hp = $host . (($puerto && $puerto !== 80 && $puerto !== 443) ? ':' . $puerto : '');
  $base = rtrim(str_replace('\\', '/', dirname(dirname($_SERVER['SCRIPT_NAME'] ?? '/api/x.php'))), '/');
  return ($https ? 'https' : 'http') . '://' . $hp . $base;
}

/** Pide una URL: [codigo, cuerpo (hasta 4 KB), cabeceras]. */
function icc_seg_pide(string $url, bool $soloCabeceras = false): array {
  if (function_exists('curl_init')) {
    $c = curl_init($url);
    curl_setopt_array($c, [
      CURLOPT_RETURNTRANSFER => true, CURLOPT_HEADER => true, CURLOPT_FOLLOWLOCATION => false,
      CURLOPT_TIMEOUT => 6, CURLOPT_CONNECTTIMEOUT => 4, CURLOPT_NOBODY => $soloCabeceras,
      CURLOPT_SSL_VERIFYPEER => false, CURLOPT_SSL_VERIFYHOST => 0, // prueba contra uno mismo
      CURLOPT_USERAGENT => 'ICC-Autoprueba/1.0',
    ]);
    $r = curl_exec($c);
    if ($r === false) { curl_close($c); return [0, '', '']; }
    $codigo = (int)curl_getinfo($c, CURLINFO_HTTP_CODE);
    $tc = (int)curl_getinfo($c, CURLINFO_HEADER_SIZE);
    curl_close($c);
    return [$codigo, substr($r, $tc, 4096), substr($r, 0, $tc)];
  }
  $ctx = stream_context_create(['http' => ['method' => $soloCabeceras ? 'HEAD' : 'GET', 'timeout' => 6, 'ignore_errors' => true, 'follow_location' => 0],
    'ssl' => ['verify_peer' => false, 'verify_peer_name' => false]]);
  $cuerpo = @file_get_contents($url, false, $ctx, 0, 4096);
  $cab = isset($http_response_header) ? implode("\r\n", $http_response_header) : '';
  $codigo = preg_match('#HTTP/\S+\s+(\d{3})#', $cab, $m) ? (int)$m[1] : 0;
  return [$codigo, (string)$cuerpo, $cab];
}

function icc_seg_exposicion(): array {
  $base = icc_seg_url_base();
  if (!$base) return ['comprobable' => false, 'mensaje' => 'No se ha podido saber la dirección del sitio.', 'pruebas' => []];
  $web = icc_seg_dir_web();
  $secreto = bin2hex(random_bytes(12));
  $nombre = 'cebo-seguridad-' . substr($secreto, 0, 10);
  $storageWeb = rtrim(ICC_STORAGE_WEB, '/');
  $cebos = [
    ['Documento subido (storage/)', 'storage/' . $nombre . '.pdf', $storageWeb . '/' . $nombre . '.pdf'],
    ['Copia de base de datos (.sql) en la web', $nombre . '.sql', $web . '/' . $nombre . '.sql'],
    ['Archivo comprimido (.zip) en la web', $nombre . '.zip', $web . '/' . $nombre . '.zip'],
    ['Nota de texto (.txt) en la web', $nombre . '.txt', $web . '/' . $nombre . '.txt'],
    ['Copia de seguridad (.bak) en la web', $nombre . '.bak', $web . '/' . $nombre . '.bak'],
  ];
  $pruebas = [];
  $alguna = false;
  foreach ($cebos as $cb) {
    if (@file_put_contents($cb[2], 'ICC-CEBO-' . $secreto) === false) {
      $pruebas[] = ['prueba' => $cb[0], 'resultado' => 'sin_probar', 'detalle' => 'No se ha podido crear el archivo cebo.'];
      continue;
    }
    [$cod, $cuerpo] = icc_seg_pide($base . '/' . $cb[1]);
    @unlink($cb[2]);
    if ($cod === 0) {
      $pruebas[] = ['prueba' => $cb[0], 'resultado' => 'sin_probar', 'detalle' => 'El servidor no ha podido llamarse a sí mismo.'];
      continue;
    }
    $alguna = true;
    $fuga = strpos($cuerpo, 'ICC-CEBO-' . $secreto) !== false;
    $pruebas[] = ['prueba' => $cb[0], 'resultado' => $fuga ? 'expuesto' : 'protegido',
      'detalle' => $fuga ? 'Se ha podido descargar desde fuera (HTTP ' . $cod . '). El .htaccess no se está aplicando a este tipo de archivo.'
        : 'Bloqueado desde fuera (HTTP ' . $cod . ').'];
  }
  // La configuracion con la contrasena de MySQL nunca debe verse.
  if (ICC_CONFIG_EN === 'web') {
    [$cod, $cuerpo] = icc_seg_pide($base . '/api/config.local.php');
    if ($cod) {
      $alguna = true;
      $fuga = stripos($cuerpo, 'ICC_DB_PASS') !== false || stripos($cuerpo, 'define(') !== false;
      $pruebas[] = ['prueba' => 'Configuración con la contraseña de MySQL', 'resultado' => $fuga ? 'expuesto' : 'protegido',
        'detalle' => $fuga ? '¡Se puede leer desde fuera! Llévala a la carpeta privada ahora mismo.' : 'No se puede leer desde fuera (HTTP ' . $cod . ').'];
    }
  }
  foreach (icc_seg_peligrosos() as $p) {
    if ($p['tipo'] !== 'archivo' || strpos($p['ruta'], '/') !== false) continue;
    [$cod] = icc_seg_pide($base . '/' . rawurlencode($p['ruta']), true);
    if ($cod) {
      $alguna = true;
      $ok = !($cod >= 200 && $cod < 300);
      $pruebas[] = ['prueba' => 'Archivo real: ' . $p['ruta'], 'resultado' => $ok ? 'protegido' : 'expuesto',
        'detalle' => $ok ? 'Bloqueado desde fuera (HTTP ' . $cod . '), pero sobra: mejor eliminarlo.' : 'Cualquiera lo puede descargar ahora mismo (HTTP ' . $cod . '). Elimínalo.'];
    }
  }
  [$cod, , $cab] = icc_seg_pide($base . '/index.html', true);
  if ($cod) {
    $alguna = true;
    $faltan = [];
    foreach (['Content-Security-Policy', 'X-Frame-Options', 'X-Content-Type-Options', 'Referrer-Policy'] as $h) {
      if (stripos($cab, "\n" . $h . ':') === false && stripos($cab, $h . ':') !== 0) $faltan[] = $h;
    }
    $pruebas[] = ['prueba' => 'Cabeceras de seguridad de la página', 'resultado' => $faltan ? 'aviso' : 'protegido',
      'detalle' => $faltan ? 'Llegan sin: ' . implode(', ', $faltan) . '. Revisa que el .htaccess está subido.' : 'El navegador recibe la política de seguridad completa.'];
  }
  return ['comprobable' => $alguna, 'base' => $base, 'pruebas' => $pruebas,
    'mensaje' => $alguna ? '' : 'El servidor no ha podido llamarse a sí mismo: haz la prueba desde fuera.'];
}

/* ===========================================================================
   ESTADO GENERAL Y PUNTUACION
   ========================================================================= */
function icc_seg_estado(): array {
  $c = [];
  $add = function ($id, $titulo, $estado, $detalle, $accion = null, $peso = 10) use (&$c) {
    $c[] = ['id' => $id, 'titulo' => $titulo, 'estado' => $estado, 'detalle' => $detalle, 'accion' => $accion, 'peso' => $peso];
  };
  $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
    || (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && strtolower($_SERVER['HTTP_X_FORWARDED_PROTO']) === 'https');
  $add('https', 'Conexión cifrada (SSL)', $https ? 'ok' : 'mal',
    $https ? 'El CRM funciona por https: contraseñas y datos viajan cifrados.'
      : 'Sin certificado SSL: las contraseñas viajan sin cifrar y cualquiera en la misma red (wifi de un hotel, una cafetería) las puede leer. Actívalo gratis en Hostalia → Certificados SSL (Let\'s Encrypt) y sube el .htaccess con SSL.', null, 20);

  $add('config', 'Contraseña de MySQL fuera de la web', ICC_CONFIG_EN === 'privada' ? 'ok' : 'aviso',
    ICC_CONFIG_EN === 'privada' ? 'La configuración está en la carpeta privada del hosting, inalcanzable desde un navegador.'
      : (ICC_DIR_PRIVADO !== '' ? 'Está en api/config.local.php, dentro de la web. Llévala a la carpeta privada con un clic.'
        : 'Está en api/config.local.php. Este hosting no ofrece carpeta privada accesible, así que la protege el .htaccess.'),
    (ICC_CONFIG_EN !== 'privada' && ICC_DIR_PRIVADO !== '') ? 'proteger-config' : null, 12);

  $privado = ICC_DIR_PRIVADO !== '' && strpos(ICC_STORAGE_DIR, ICC_DIR_PRIVADO) === 0;
  $enWeb = $privado ? icc_seg_cuenta_archivos(ICC_STORAGE_WEB) : 0;
  $add('almacen', 'Documentos fuera de la web', $privado && !$enWeb ? 'ok' : 'aviso',
    $privado ? ($enWeb ? 'Se guardan en la carpeta privada, pero quedan ' . $enWeb . ' archivo(s) antiguos en storage/.' : 'Facturas, contratos y fotos se guardan en la carpeta privada del hosting.')
      : (ICC_DIR_PRIVADO !== '' ? 'Se guardan en storage/, dentro de la web y protegidos por el .htaccess. Llévalos a la carpeta privada con un clic.'
        : 'Se guardan en storage/, protegidos por el .htaccess. Sin carpeta privada no se puede hacer más.'),
    ICC_DIR_PRIVADO !== '' && !$privado ? 'mover-archivos' : null, 10);

  $pel = icc_seg_peligrosos();
  $add('peligrosos', 'Archivos sobrantes en la carpeta pública', $pel ? 'mal' : 'ok',
    $pel ? count($pel) . ' archivo(s) o carpeta(s) que no deberían estar en la web (copias, zips, SQL, notas).'
      : 'No hay copias, zips, SQL ni notas olvidadas en la carpeta pública.', $pel ? 'limpiar' : null, 15);

  $roles = "'" . implode("','", ICC_ROLES_ADMIN) . "'";
  $admins = icc_seg_q("SELECT u.id, TRIM(CONCAT(u.nombre, ' ', COALESCE(u.apellidos, ''))) nombre, u.rol, COALESCE(f.activo, 0) con2fa
                       FROM usuarios u LEFT JOIN seg_2fa f ON f.usuario_id = u.id
                       WHERE u.rol IN ($roles) AND u.bloqueado = 0 ORDER BY u.rol = 'super_admin' DESC, u.nombre")->fetchAll();
  $sin = array_values(array_filter($admins, function ($a) { return !(int)$a['con2fa']; }));
  $add('2fa', 'Doble factor en las cuentas de dirección', $sin ? 'mal' : 'ok',
    $sin ? 'Sin doble factor: ' . implode(', ', array_map(function ($a) { return $a['nombre']; }, $sin)) . '. Con la contraseña sola se puede entrar a todo.'
      : 'Todas las cuentas de dirección piden el código del móvil.', $sin ? 'activar-2fa' : null, 18);

  $bit = icc_seg_verifica_bitacora();
  $add('bitacora', 'Bitácora sin manipular', $bit['ok'] ? 'ok' : 'mal', $bit['mensaje'], null, 8);

  $v = PHP_VERSION;
  $add('php', 'Versión de PHP del hosting', version_compare($v, '8.1', '>=') ? 'ok' : (version_compare($v, '7.4', '>=') ? 'aviso' : 'mal'),
    'PHP ' . $v . (version_compare($v, '8.1', '>=') ? ': recibe parches de seguridad.' : ': ya no recibe parches. Súbela a 8.2 o superior en Hostalia → Configuración de PHP.'), null, 5);

  $add('demo', 'Modo demostración desactivado', ICC_MODO_DEMO ? 'aviso' : 'ok',
    ICC_MODO_DEMO ? 'Esta instalación está en modo demostración: no la uses con datos reales.' : 'La instalación trabaja con datos reales y sin atajos de demostración.', null, 2);

  $fallos = icc_seg_fila("SELECT COUNT(*) n, COUNT(DISTINCT ip) ips FROM seg_accesos WHERE resultado IN ('fallo','mfa_fallo','bloqueado') AND ts > NOW() - INTERVAL 1 DAY");
  $bloq = icc_seg_fila('SELECT COUNT(*) n FROM seg_bloqueos WHERE hasta > NOW()');
  $add('ataques', 'Intentos de entrada en las últimas 24 h', (int)$fallos['n'] >= 30 ? 'aviso' : 'ok',
    (int)$fallos['n'] . ' intento(s) fallido(s) desde ' . (int)$fallos['ips'] . ' conexión(es); ' . (int)$bloq['n'] . ' bloqueo(s) activo(s).', null, 2);

  $total = 0;
  $hecho = 0;
  foreach ($c as $x) {
    $total += $x['peso'];
    $hecho += $x['estado'] === 'ok' ? $x['peso'] : ($x['estado'] === 'aviso' ? $x['peso'] / 2 : 0);
  }
  $ses = icc_seg_fila('SELECT COUNT(*) n FROM usuarios_sesiones WHERE cerrada_en IS NULL AND ultima_actividad > NOW() - INTERVAL ? HOUR', [ICC_INACTIVIDAD_HORAS]);
  return [
    'puntuacion' => (int)round($hecho * 100 / max(1, $total)),
    'comprobaciones' => $c,
    'peligrosos' => $pel,
    'admins' => array_map(function ($a) {
      return ['id' => (int)$a['id'], 'nombre' => $a['nombre'], 'rol' => $a['rol'], 'con2fa' => (bool)(int)$a['con2fa']];
    }, $admins),
    'resumen' => ['sesiones' => (int)$ses['n'], 'fallos24h' => (int)$fallos['n'], 'bloqueos' => (int)$bloq['n'], 'apuntes' => $bit['apuntes'], 'https' => $https],
  ];
}
