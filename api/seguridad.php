<?php
/**
 * LABS COMMAND CENTER 360™ · Centro de Seguridad (servidor)
 *
 * Rutas (api/index.php?ruta=/seguridad/...):
 *   Cualquier usuario con sesión, sobre SU cuenta:
 *     GET  /2fa                    estado de su doble factor
 *     POST /2fa/iniciar            secreto nuevo para escanear
 *     POST /2fa/activar {codigo}   lo activa y devuelve los códigos de recuperación
 *     POST /2fa/desactivar {codigo}
 *     GET  /mis-sesiones · POST /mis-sesiones/cerrar {id | "otras"}
 *   Solo administración:
 *     GET  /estado                 comprobaciones y puntuación
 *     GET  /exposicion             prueba real desde fuera con archivos cebo
 *     GET  /accesos                últimas entradas y ataques
 *     GET  /sesiones · POST /sesiones/cerrar {id | usuario_id}
 *     GET  /bloqueos · POST /bloqueos/quitar {id}
 *     GET  /bitacora               verifica la cadena de la bitácora
 *     POST /limpiar {rutas}        borra archivos peligrosos detectados
 *     POST /proteger-config        lleva la configuración a la carpeta privada
 *     POST /mover-archivos         lleva los documentos a la carpeta privada
 *     POST /2fa/reiniciar {usuario_id}   quita el doble factor de otra persona
 */
defined('LABS') || exit;

function labs_seguridad($metodo, $sub, $b, $pares)
{
    $u = labs_usuario(true);
    if (!labs_activo()) {
        throw new ErrorApi('Tu cuenta no está activa.', 403, 'ROL_INSUFICIENTE');
    }
    $sub = rtrim($sub, '/');
    $b = is_array($b) ? $b : array();

    /* --- Doble factor de la propia cuenta --------------------------------- */
    if ($sub === '/2fa' && $metodo === 'GET') {
        $f = labs_2fa($u['id']);
        return array(200, array(
            'activo' => $f && (int) $f['activo'] === 1,
            'activado' => $f && $f['activado'] ? labs_sale('s', $f['activado']) : null,
            'recuperacion_restantes' => $f && (int) $f['activo'] === 1 ? count(json_decode((string) $f['recuperacion'], true) ?: array()) : 0,
        ));
    }
    if ($u['ver_como_de'] && strpos($sub, '/2fa') === 0) {
        throw new ErrorApi('El doble factor solo lo gestiona la propia persona, no desde «Ver como».', 403, 'VER_COMO');
    }
    if ($sub === '/2fa/iniciar' && $metodo === 'POST') {
        return array(200, labs_2fa_inicia($u['id'], $u['email']));
    }
    if ($sub === '/2fa/activar' && $metodo === 'POST') {
        $codigos = labs_2fa_activa($u['id'], isset($b['codigo']) ? $b['codigo'] : '');
        labs_anota('Doble factor activado', 'Desde ahora necesita el código del móvil para entrar.', $u);
        return array(200, array('ok' => true, 'codigos' => $codigos));
    }
    if ($sub === '/2fa/desactivar' && $metodo === 'POST') {
        if (!labs_2fa_comprueba($u['id'], isset($b['codigo']) ? $b['codigo'] : '')) {
            throw new ErrorApi('El código no es correcto: para quitar el doble factor hace falta un código válido.', 400, 'MFA_CODIGO');
        }
        labs_2fa_quita($u['id']);
        labs_anota('Doble factor desactivado', 'La cuenta vuelve a entrar solo con contraseña.', $u);
        labs_alerta('2fa', 'media', 'Doble factor desactivado: ' . ($u['email'] ?? ''), 'La cuenta vuelve a entrar solo con contraseña (desde ' . labs_ip() . ').', null, true);
        return array(200, array('ok' => true));
    }

    /* --- Sesiones de la propia cuenta ------------------------------------- */
    if ($sub === '/mis-sesiones' && $metodo === 'GET') {
        return array(200, labs_lista_sesiones($u['id']));
    }
    if ($sub === '/mis-sesiones/cerrar' && $metodo === 'POST') {
        if (isset($b['id']) && $b['id'] === 'otras') {
            $n = labs_q('DELETE FROM tokens_sesion WHERE usuario_id = ? AND id <> ?', array($u['id'], $u['token_id']))->rowCount();
        } else {
            $n = labs_q('DELETE FROM tokens_sesion WHERE usuario_id = ? AND id = ?', array($u['id'], (int) ($b['id'] ?? 0)))->rowCount();
        }
        if ($n) {
            labs_anota('Sesiones cerradas', $n . ' sesión(es) cerrada(s) por la propia persona.', $u);
        }
        return array(200, array('ok' => true, 'cerradas' => $n));
    }

    /* --- A partir de aquí, solo administración ---------------------------- */
    if (!labs_soy_admin()) {
        throw new ErrorApi('El Centro de Seguridad es solo para administración.', 403, 'ROL_INSUFICIENTE');
    }

    if ($sub === '/estado' && $metodo === 'GET') {
        return array(200, labs_seguridad_estado());
    }
    if ($sub === '/exposicion' && $metodo === 'GET') {
        return array(200, labs_prueba_exposicion());
    }
    if ($sub === '/bitacora' && $metodo === 'GET') {
        return array(200, labs_verifica_bitacora());
    }
    if ($sub === '/accesos' && $metodo === 'GET') {
        $lista = labs_q('SELECT r.ts, r.email, r.ip, r.agente, r.resultado, r.detalle,
                                TRIM(CONCAT(COALESCE(p.nombre, \'\'), \' \', COALESCE(p.apellidos, \'\'))) AS nombre
                         FROM registro_accesos r LEFT JOIN perfiles p ON p.id = r.usuario_id
                         ORDER BY r.ts DESC LIMIT 250')->fetchAll();
        foreach ($lista as &$f) {
            $f['ts'] = labs_sale('s', $f['ts']);
        }
        unset($f);
        $atacantes = labs_q("SELECT ip, COUNT(*) AS fallos, COUNT(DISTINCT email) AS cuentas, MAX(ts) AS ultimo
                             FROM registro_accesos WHERE resultado IN ('fallo','mfa_fallo','bloqueado') AND ts > ?
                             GROUP BY ip ORDER BY fallos DESC LIMIT 20", array(labs_hace(7 * 86400)))->fetchAll();
        foreach ($atacantes as &$f) {
            $f['ultimo'] = labs_sale('s', $f['ultimo']);
            $f['fallos'] = (int) $f['fallos'];
            $f['cuentas'] = (int) $f['cuentas'];
        }
        unset($f);
        return array(200, array('accesos' => $lista, 'atacantes' => $atacantes));
    }
    if ($sub === '/sesiones' && $metodo === 'GET') {
        return array(200, labs_lista_sesiones(null));
    }
    if ($sub === '/sesiones/cerrar' && $metodo === 'POST') {
        if (!empty($b['usuario_id'])) {
            $el = labs_fila('SELECT id, nombre, apellidos, raiz FROM perfiles WHERE id = ?', array((string) $b['usuario_id']));
            if ($el && (int) $el['raiz'] === 1 && !$u['raiz']) {
                throw new ErrorApi('Las sesiones de la cuenta raíz solo las cierra la propia raíz.', 403, 'RAIZ_PROTEGIDA');
            }
            $n = labs_q('DELETE FROM tokens_sesion WHERE usuario_id = ?', array((string) $b['usuario_id']))->rowCount();
            labs_anota('Sesiones cerradas', $n . ' sesión(es) cerrada(s) desde el Centro de Seguridad.', $el);
        } else {
            $t = labs_fila('SELECT t.id, t.usuario_id, p.nombre, p.apellidos, p.raiz FROM tokens_sesion t LEFT JOIN perfiles p ON p.id = t.usuario_id WHERE t.id = ?',
                array((int) ($b['id'] ?? 0)));
            if (!$t) {
                throw new ErrorApi('Esa sesión ya no existe.', 404, 'NO_ENCONTRADO');
            }
            if ((int) $t['raiz'] === 1 && !$u['raiz']) {
                throw new ErrorApi('Las sesiones de la cuenta raíz solo las cierra la propia raíz.', 403, 'RAIZ_PROTEGIDA');
            }
            $n = labs_q('DELETE FROM tokens_sesion WHERE id = ?', array($t['id']))->rowCount();
            labs_anota('Sesión cerrada', 'Cerrada desde el Centro de Seguridad.', array('id' => $t['usuario_id'], 'nombre' => $t['nombre'], 'apellidos' => $t['apellidos']));
        }
        return array(200, array('ok' => true, 'cerradas' => $n));
    }
    if ($sub === '/bloqueos' && $metodo === 'GET') {
        $l = labs_q('SELECT id, tipo, valor, hasta, motivo, creado FROM bloqueos WHERE hasta > ? ORDER BY creado DESC', array(labs_ahora()))->fetchAll();
        foreach ($l as &$f) {
            $f['hasta'] = labs_sale('s', $f['hasta']);
            $f['creado'] = labs_sale('s', $f['creado']);
            $f['id'] = (int) $f['id'];
        }
        unset($f);
        return array(200, $l);
    }
    if ($sub === '/bloqueos/quitar' && $metodo === 'POST') {
        $f = labs_fila('SELECT tipo, valor FROM bloqueos WHERE id = ?', array((int) ($b['id'] ?? 0)));
        if ($f) {
            labs_q('DELETE FROM bloqueos WHERE id = ?', array((int) $b['id']));
            if ($f['tipo'] === 'ip') {
                labs_q('DELETE FROM intentos_acceso WHERE ip = ?', array($f['valor']));
            }
            labs_anota('Bloqueo retirado', 'Se desbloquea ' . ($f['tipo'] === 'ip' ? 'la IP ' : 'la cuenta ') . $f['valor'] . '.');
        }
        return array(200, array('ok' => true));
    }
    if ($sub === '/limpiar' && $metodo === 'POST') {
        return array(200, labs_limpia_peligrosos(isset($b['rutas']) && is_array($b['rutas']) ? $b['rutas'] : array()));
    }
    if ($sub === '/proteger-config' && $metodo === 'POST') {
        return array(200, labs_protege_config());
    }
    if ($sub === '/mover-archivos' && $metodo === 'POST') {
        return array(200, labs_mueve_archivos());
    }
    if ($sub === '/2fa/reiniciar' && $metodo === 'POST') {
        $el = labs_fila('SELECT id, nombre, apellidos, raiz FROM perfiles WHERE id = ?', array((string) ($b['usuario_id'] ?? '')));
        if (!$el) {
            throw new ErrorApi('Usuario no encontrado.', 404, 'NO_ENCONTRADO');
        }
        if ((int) $el['raiz'] === 1 && !$u['raiz']) {
            throw new ErrorApi('El doble factor de la cuenta raíz solo lo quita la propia raíz.', 403, 'RAIZ_PROTEGIDA');
        }
        labs_2fa_quita($el['id']);
        labs_q('DELETE FROM tokens_sesion WHERE usuario_id = ?', array($el['id']));
        labs_anota('Doble factor reiniciado', 'Lo ha quitado la administración (móvil perdido). Sesiones cerradas.', $el);
        labs_alerta('2fa', 'media', 'Doble factor reiniciado a ' . trim($el['nombre'] . ' ' . $el['apellidos']), 'Lo ha quitado la administración desde ' . labs_ip() . '.', null, true);
        return array(200, array('ok' => true));
    }
    throw new ErrorApi('Operación de seguridad desconocida.', 404, 'RUTA_DESCONOCIDA');
}

/* ---------------------------------------------------------------------------
   SESIONES
   ------------------------------------------------------------------------- */
function labs_lista_sesiones($usuario_id)
{
    $u = labs_usuario();
    $sql = 'SELECT t.id, t.usuario_id, t.ip, t.agente, t.creado, t.ultimo_uso, t.ver_como_de,
                   TRIM(CONCAT(COALESCE(p.nombre, \'\'), \' \', COALESCE(p.apellidos, \'\'))) AS nombre, p.email, p.rol, p.raiz
            FROM tokens_sesion t LEFT JOIN perfiles p ON p.id = t.usuario_id
            WHERE t.renovacion_expira > ?' . ($usuario_id ? ' AND t.usuario_id = ?' : '') . ' ORDER BY COALESCE(t.ultimo_uso, t.creado) DESC';
    $params = array(labs_ahora());
    if ($usuario_id) {
        $params[] = $usuario_id;
    }
    $out = array();
    foreach (labs_q($sql, $params)->fetchAll() as $f) {
        if (labs_sesion_caducada($f)) {
            continue;
        }
        $out[] = array(
            'id' => (int) $f['id'], 'usuario_id' => $f['usuario_id'], 'nombre' => $f['nombre'], 'email' => $f['email'],
            'rol' => $f['rol'], 'raiz' => (int) $f['raiz'] === 1, 'ip' => $f['ip'], 'agente' => $f['agente'],
            'creado' => labs_sale('s', $f['creado']), 'ultimo_uso' => labs_sale('s', $f['ultimo_uso'] ?: $f['creado']),
            'ver_como' => (bool) $f['ver_como_de'], 'actual' => (int) $f['id'] === (int) $u['token_id'],
        );
    }
    return $out;
}

/* ---------------------------------------------------------------------------
   ARCHIVOS PELIGROSOS EN LA CARPETA PÚBLICA
   ------------------------------------------------------------------------- */

/** Lo que no debería estar en la carpeta pública. Devuelve lista de rutas relativas. */
function labs_busca_peligrosos()
{
    $web = rtrim(LABS_DIR_WEB, '/');
    $out = array();
    $ext_mal = '/\.(zip|sql|txt|md|bak|old|log|env|tar|gz|tgz|7z|rar|csv|sh|py|ini~|orig|swp)$/i';
    foreach (@scandir($web) ?: array() as $e) {
        if ($e === '.' || $e === '..' || $e === '.htaccess' || $e === '.user.ini' || $e === 'robots.txt') {
            continue;
        }
        $ruta = $web . '/' . $e;
        if (is_file($ruta) && preg_match($ext_mal, $e)) {
            $out[] = array('ruta' => $e, 'tipo' => 'archivo', 'tamano' => filesize($ruta),
                'motivo' => preg_match('/\.(zip|sql|txt)$/i', $e) ? 'Puede contener contraseñas o datos: no debe estar en la web.' : 'Archivo de trabajo que no debe estar en la web.');
        }
        // Copias antiguas del CRM (por ejemplo, la carpeta web/ de un zip mal extraído).
        if (is_dir($ruta) && !in_array($e, array('api', 'storage'), true) && is_file($ruta . '/api/nucleo.php')) {
            $out[] = array('ruta' => $e . '/', 'tipo' => 'carpeta', 'tamano' => null,
                'motivo' => 'Copia antigua del CRM, con su propia configuración y su propia puerta de entrada.');
        }
    }
    // Configuración duplicada: si ya está en la carpeta privada, la de la web sobra.
    if (LABS_CONFIG_EN === 'privada' && is_file(__DIR__ . '/config.local.php')) {
        $out[] = array('ruta' => 'api/config.local.php', 'tipo' => 'archivo', 'tamano' => filesize(__DIR__ . '/config.local.php'),
            'motivo' => 'Copia de la configuración (con la contraseña de MySQL) que ya está en la carpeta privada.');
    }
    return $out;
}

function labs_borra_arbol($ruta)
{
    if (is_link($ruta) || is_file($ruta)) {
        return @unlink($ruta);
    }
    foreach (@scandir($ruta) ?: array() as $e) {
        if ($e !== '.' && $e !== '..') {
            labs_borra_arbol($ruta . '/' . $e);
        }
    }
    return @rmdir($ruta);
}

/** Borra SOLO rutas que el propio análisis ha marcado como peligrosas. */
function labs_limpia_peligrosos($pedidas)
{
    $web = rtrim(LABS_DIR_WEB, '/');
    $permitidas = array();
    foreach (labs_busca_peligrosos() as $p) {
        $permitidas[$p['ruta']] = $p;
    }
    $hechas = array();
    $fallidas = array();
    foreach ($pedidas as $r) {
        $r = (string) $r;
        if (!isset($permitidas[$r])) {
            continue;
        }
        $real = realpath($web . '/' . rtrim($r, '/'));
        if (!$real || strpos($real, realpath($web) . '/') !== 0) {
            continue;
        }
        if (labs_borra_arbol($real)) {
            $hechas[] = $r;
        } else {
            $fallidas[] = $r;
        }
    }
    if ($hechas) {
        labs_anota('Archivos peligrosos eliminados', implode(', ', $hechas));
    }
    return array('ok' => !$fallidas, 'borrados' => $hechas, 'fallidos' => $fallidas);
}

/** Lleva api/config.local.php a la carpeta privada del hosting. */
function labs_protege_config()
{
    if (LABS_DIR_PRIVADO === '') {
        throw new ErrorApi('Este hosting no tiene carpeta privada accesible: la configuración tiene que quedarse en api/.', 409, 'SIN_PRIVADA');
    }
    $origen = __DIR__ . '/config.local.php';
    if (LABS_CONFIG_EN === 'privada') {
        if (is_file($origen)) {
            @unlink($origen);
        }
        return array('ok' => true, 'mensaje' => 'La configuración ya estaba en la carpeta privada.');
    }
    if (!is_file($origen)) {
        throw new ErrorApi('No se encuentra api/config.local.php.', 404, 'NO_ENCONTRADO');
    }
    if (!is_dir(LABS_DIR_PRIVADO) && !@mkdir(LABS_DIR_PRIVADO, 0750, true)) {
        throw new ErrorApi('No se ha podido crear la carpeta privada.', 500, 'SIN_PRIVADA');
    }
    @file_put_contents(LABS_DIR_PRIVADO . '/.htaccess', "Require all denied\n");
    $contenido = file_get_contents($origen);
    if (@file_put_contents(LABS_CONFIG_PRIVADA, $contenido, LOCK_EX) === false || file_get_contents(LABS_CONFIG_PRIVADA) !== $contenido) {
        throw new ErrorApi('No se ha podido copiar la configuración a la carpeta privada.', 500, 'COPIA');
    }
    @chmod(LABS_CONFIG_PRIVADA, 0640);
    $borrada = @unlink($origen);
    labs_anota('Configuración protegida', 'La configuración de MySQL se ha llevado a la carpeta privada del hosting.');
    return array('ok' => true, 'mensaje' => $borrada ? 'Configuración llevada a la carpeta privada.'
        : 'Copiada a la carpeta privada, pero no se ha podido borrar api/config.local.php: bórralo a mano.');
}

/** Lleva los documentos subidos de storage/ (en la web) a la carpeta privada. */
function labs_mueve_archivos()
{
    $origen = rtrim(LABS_STORAGE_WEB, '/') . '/documentos';
    $destino = rtrim(LABS_STORAGE_DIR, '/') . '/documentos';
    if ($origen === $destino) {
        throw new ErrorApi('Este hosting no tiene carpeta privada: los archivos tienen que quedarse en storage/.', 409, 'SIN_PRIVADA');
    }
    $n = 0;
    $mal = 0;
    if (is_dir($origen)) {
        $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($origen, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST);
        foreach ($it as $f) {
            $rel = substr($f->getPathname(), strlen($origen) + 1);
            if ($f->isFile()) {
                $d = $destino . '/' . $rel;
                if ((is_dir(dirname($d)) || @mkdir(dirname($d), 0750, true)) && @rename($f->getPathname(), $d)) {
                    $n++;
                } else {
                    $mal++;
                }
            } elseif ($f->isDir()) {
                @rmdir($f->getPathname());
            }
        }
    }
    if ($n) {
        labs_anota('Documentos protegidos', $n . ' archivo(s) llevados a la carpeta privada del hosting.');
    }
    return array('ok' => $mal === 0, 'movidos' => $n, 'fallidos' => $mal);
}

function labs_archivos_en_web()
{
    $origen = rtrim(LABS_STORAGE_WEB, '/') . '/documentos';
    if (!is_dir($origen) || $origen === rtrim(LABS_STORAGE_DIR, '/') . '/documentos') {
        return 0;
    }
    $n = 0;
    $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($origen, FilesystemIterator::SKIP_DOTS));
    foreach ($it as $f) {
        if ($f->isFile()) {
            $n++;
        }
    }
    return $n;
}

/* ---------------------------------------------------------------------------
   PRUEBA DE EXPOSICIÓN · el servidor se ataca a sí mismo desde fuera
   ------------------------------------------------------------------------- */
function labs_url_base()
{
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && strtolower($_SERVER['HTTP_X_FORWARDED_PROTO']) === 'https');
    $host = isset($_SERVER['SERVER_NAME']) ? $_SERVER['SERVER_NAME'] : '';
    if (!preg_match('/^[a-z0-9.-]+$/i', $host)) {
        return null;
    }
    $puerto = isset($_SERVER['SERVER_PORT']) ? (int) $_SERVER['SERVER_PORT'] : 0;
    $hp = $host . (($puerto && $puerto !== 80 && $puerto !== 443) ? ':' . $puerto : '');
    $base = rtrim(str_replace('\\', '/', dirname(dirname($_SERVER['SCRIPT_NAME'] ?? '/api/index.php'))), '/');
    return ($https ? 'https' : 'http') . '://' . $hp . $base;
}

/** Pide una URL y devuelve [código, cuerpo (hasta 4 KB), cabeceras]. */
function labs_pide($url, $solo_cabeceras = false)
{
    if (function_exists('curl_init')) {
        $c = curl_init($url);
        curl_setopt_array($c, array(
            CURLOPT_RETURNTRANSFER => true, CURLOPT_HEADER => true, CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_TIMEOUT => 6, CURLOPT_CONNECTTIMEOUT => 4, CURLOPT_NOBODY => $solo_cabeceras,
            CURLOPT_SSL_VERIFYPEER => false, CURLOPT_SSL_VERIFYHOST => 0,   // es una prueba contra uno mismo
            CURLOPT_RANGE => $solo_cabeceras ? null : '0-4095', CURLOPT_USERAGENT => 'Labs24k-Autoprueba/1.0',
        ));
        $r = curl_exec($c);
        if ($r === false) {
            curl_close($c);
            return array(0, '', '');
        }
        $codigo = (int) curl_getinfo($c, CURLINFO_HTTP_CODE);
        $tc = (int) curl_getinfo($c, CURLINFO_HEADER_SIZE);
        curl_close($c);
        return array($codigo, substr($r, $tc, 4096), substr($r, 0, $tc));
    }
    $ctx = stream_context_create(array(
        'http' => array('method' => $solo_cabeceras ? 'HEAD' : 'GET', 'timeout' => 6, 'ignore_errors' => true, 'follow_location' => 0),
        'ssl' => array('verify_peer' => false, 'verify_peer_name' => false),
    ));
    $cuerpo = @file_get_contents($url, false, $ctx, 0, 4096);
    $cab = isset($http_response_header) ? implode("\r\n", $http_response_header) : '';
    $codigo = preg_match('#HTTP/\S+\s+(\d{3})#', $cab, $m) ? (int) $m[1] : 0;
    return array($codigo, (string) $cuerpo, $cab);
}

function labs_prueba_exposicion()
{
    $base = labs_url_base();
    if (!$base) {
        return array('comprobable' => false, 'mensaje' => 'No se ha podido saber la dirección del sitio.', 'pruebas' => array());
    }
    $web = rtrim(LABS_DIR_WEB, '/');
    $secreto = bin2hex(random_bytes(12));
    $nombre = 'cebo-seguridad-' . substr($secreto, 0, 10);
    $cebos = array(
        array('Documento subido (storage/)', 'storage/' . $nombre . '.pdf', $web . '/storage/' . $nombre . '.pdf'),
        array('Copia de base de datos (.sql) en la web', $nombre . '.sql', $web . '/' . $nombre . '.sql'),
        array('Archivo comprimido (.zip) en la web', $nombre . '.zip', $web . '/' . $nombre . '.zip'),
        array('Nota de texto (.txt) en la web', $nombre . '.txt', $web . '/' . $nombre . '.txt'),
    );
    $pruebas = array();
    $alguna = false;
    foreach ($cebos as $cb) {
        if (@file_put_contents($cb[2], 'LABS-CEBO-' . $secreto) === false) {
            $pruebas[] = array('prueba' => $cb[0], 'resultado' => 'sin_probar', 'detalle' => 'No se ha podido crear el archivo cebo.');
            continue;
        }
        list($cod, $cuerpo) = labs_pide($base . '/' . $cb[1]);
        @unlink($cb[2]);
        if ($cod === 0) {
            $pruebas[] = array('prueba' => $cb[0], 'resultado' => 'sin_probar', 'detalle' => 'El servidor no ha podido llamarse a sí mismo.');
            continue;
        }
        $alguna = true;
        $fuga = strpos($cuerpo, 'LABS-CEBO-' . $secreto) !== false;
        $pruebas[] = array('prueba' => $cb[0], 'resultado' => $fuga ? 'expuesto' : 'protegido',
            'detalle' => $fuga ? 'Se ha podido descargar desde fuera (HTTP ' . $cod . '). El .htaccess no se está aplicando a este tipo de archivo.'
                : 'Bloqueado desde fuera (HTTP ' . $cod . ').');
    }
    // Archivos peligrosos reales que siguen en la web: ¿se pueden descargar ahora mismo?
    foreach (labs_busca_peligrosos() as $p) {
        if ($p['tipo'] !== 'archivo' || strpos($p['ruta'], '/') !== false) {
            continue;
        }
        list($cod) = labs_pide($base . '/' . rawurlencode($p['ruta']), true);
        if ($cod) {
            $alguna = true;
            $pruebas[] = array('prueba' => 'Archivo real: ' . $p['ruta'], 'resultado' => ($cod >= 200 && $cod < 300) ? 'expuesto' : 'protegido',
                'detalle' => ($cod >= 200 && $cod < 300) ? 'Cualquiera lo puede descargar ahora mismo (HTTP ' . $cod . '). Elimínalo.' : 'Bloqueado desde fuera (HTTP ' . $cod . '), pero sobra: mejor eliminarlo.');
        }
    }
    // Cabeceras de seguridad del panel tal y como llegan al navegador.
    list($cod, , $cab) = labs_pide($base . '/index.html', true);
    if ($cod) {
        $alguna = true;
        $tiene = function ($n) use ($cab) {
            return stripos($cab, "\n" . $n . ':') !== false || stripos($cab, $n . ':') === 0;
        };
        $faltan = array();
        foreach (array('Content-Security-Policy', 'X-Frame-Options', 'X-Content-Type-Options', 'Referrer-Policy') as $h) {
            if (!$tiene($h)) {
                $faltan[] = $h;
            }
        }
        $pruebas[] = array('prueba' => 'Cabeceras de seguridad del panel', 'resultado' => $faltan ? 'aviso' : 'protegido',
            'detalle' => $faltan ? 'Llegan sin: ' . implode(', ', $faltan) . '. El panel lleva su propia política de respaldo, pero conviene revisar el .htaccess.'
                : 'El navegador recibe la política de seguridad completa.');
    }
    $expuestos = array_filter($pruebas, function ($x) {
        return $x['resultado'] === 'expuesto';
    });
    if ($expuestos) {
        labs_alerta('exposicion', 'alta', 'Hay archivos que se pueden descargar desde fuera',
            implode("\n", array_map(function ($x) {
                return '· ' . $x['prueba'] . ': ' . $x['detalle'];
            }, $expuestos)) . "\nSi contienen datos personales y alguien los ha descargado, es una brecha: regístrala.",
            'exposicion|' . md5(implode('|', array_column($expuestos, 'prueba'))) . '|' . gmdate('Y-m-d'));
    }
    return array('comprobable' => $alguna, 'base' => $base, 'pruebas' => $pruebas,
        'mensaje' => $alguna ? '' : 'El servidor no ha podido llamarse a sí mismo: haz la prueba desde fuera.');
}

/* ---------------------------------------------------------------------------
   ESTADO GENERAL Y PUNTUACIÓN
   ------------------------------------------------------------------------- */
function labs_seguridad_estado()
{
    $c = array();
    $add = function ($id, $titulo, $estado, $detalle, $accion = null, $peso = 10) use (&$c) {
        $c[] = array('id' => $id, 'titulo' => $titulo, 'estado' => $estado, 'detalle' => $detalle, 'accion' => $accion, 'peso' => $peso);
    };

    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && strtolower($_SERVER['HTTP_X_FORWARDED_PROTO']) === 'https');
    $add('https', 'Conexión cifrada (SSL)', $https ? 'ok' : 'mal',
        $https ? 'El panel funciona por https: contraseñas y datos viajan cifrados.'
            : 'Sin certificado SSL: las contraseñas viajan sin cifrar y cualquiera en la misma red (wifi de un hotel, una cafetería) las puede leer. Actívalo gratis en Hostalia → Certificados SSL (Let\'s Encrypt).', null, 20);

    $add('config', 'Contraseña de MySQL fuera de la web',
        LABS_CONFIG_EN === 'privada' ? 'ok' : 'aviso',
        LABS_CONFIG_EN === 'privada' ? 'La configuración está en la carpeta privada del hosting, inalcanzable desde un navegador.'
            : (LABS_DIR_PRIVADO !== '' ? 'Está en api/config.local.php, dentro de la web. Llévala a la carpeta privada con un clic.'
                : 'Está en api/config.local.php. Este hosting no ofrece carpeta privada accesible, así que la protege el .htaccess.'),
        (LABS_CONFIG_EN !== 'privada' && LABS_DIR_PRIVADO !== '') ? 'proteger-config' : null, 12);

    $en_web = labs_archivos_en_web();
    $privado = LABS_DIR_PRIVADO !== '' && strpos(LABS_STORAGE_DIR, LABS_DIR_PRIVADO) === 0;
    $add('almacen', 'Documentos fuera de la web', ($privado && !$en_web) ? 'ok' : 'aviso',
        $privado ? ($en_web ? 'Los nuevos se guardan en la carpeta privada, pero quedan ' . $en_web . ' antiguos en storage/.'
                            : 'Los documentos se guardan en la carpeta privada del hosting.')
            : 'Se guardan en storage/, protegido por .htaccess. Sin carpeta privada no se puede hacer más.',
        ($privado && $en_web) ? 'mover-archivos' : null, 10);

    $pel = labs_busca_peligrosos();
    $add('peligrosos', 'Archivos sobrantes en la carpeta pública', $pel ? 'mal' : 'ok',
        $pel ? count($pel) . ' archivo(s) o carpeta(s) que no deberían estar en la web (copias, zips, SQL, notas).'
            : 'No hay copias, zips, SQL ni notas olvidadas en la carpeta pública.', $pel ? 'limpiar' : null, 15);

    $admins = labs_q("SELECT p.id, TRIM(CONCAT(p.nombre, ' ', p.apellidos)) AS nombre, p.raiz, (f.activo = 1) AS con2fa
                      FROM perfiles p LEFT JOIN cuentas_2fa f ON f.usuario_id = p.id
                      WHERE p.rol = 'admin' AND p.estado = 'Activo'")->fetchAll();
    $sin = array_values(array_filter($admins, function ($a) {
        return !(int) $a['con2fa'];
    }));
    $add('2fa', 'Doble factor en las cuentas de administración', $sin ? 'mal' : 'ok',
        $sin ? 'Sin doble factor: ' . implode(', ', array_map(function ($a) {
            return $a['nombre'];
        }, $sin)) . '. Con la contraseña sola se puede entrar a todo.'
            : 'Todas las cuentas de administración piden el código del móvil.', $sin ? 'activar-2fa' : null, 18);

    $bit = labs_verifica_bitacora();
    $add('bitacora', 'Bitácora sin manipular', $bit['ok'] ? 'ok' : 'mal', $bit['mensaje'], null, 8);

    // Copias de seguridad (art. 32.1.c RGPD: poder recuperar los datos tras un incidente).
    $ultima = labs_ajuste('copia_ultima');
    $copia_ok = $ultima && $ultima > labs_hace(48 * 3600);
    $add('copias', 'Copias de seguridad cifradas', $copia_ok ? 'ok' : 'mal',
        $copia_ok ? 'Última copia: ' . substr($ultima, 0, 16) . ' (UTC). Se hace una cada día, cifrada, en la carpeta privada.'
            : ($ultima ? 'La última copia es de ' . substr($ultima, 0, 16) . ' (UTC): hace más de 2 días.' : 'Todavía no hay ninguna copia.') .
              ' Hazla en Cumplimiento RGPD → Copias.', null, 10);

    // Brechas abiertas cuyo plazo de 72 h para avisar a la AEPD ya ha vencido (art. 33).
    try {
        $tarde = (int) labs_fila("SELECT COUNT(*) n FROM incidentes WHERE estado IN ('abierto','evaluando') AND riesgo <> 'sin_riesgo'
                                  AND notificado_aepd IS NULL AND detectado < ?", array(labs_hace(72 * 3600)))['n'];
    } catch (PDOException $e) {
        $tarde = 0;
    }
    $add('brechas', 'Brechas de seguridad dentro de plazo', $tarde ? 'mal' : 'ok',
        $tarde ? $tarde . ' brecha(s) abierta(s) han pasado las 72 h sin decidir si se notifica a la AEPD. Resuélvelo en Cumplimiento RGPD → Brechas.'
            : 'No hay brechas abiertas fuera de plazo.', null, 10);

    $v = PHP_VERSION;
    $add('php', 'Versión de PHP del hosting', version_compare($v, '8.1', '>=') ? 'ok' : (version_compare($v, '7.4', '>=') ? 'aviso' : 'mal'),
        'PHP ' . $v . (version_compare($v, '8.1', '>=') ? ': recibe parches de seguridad.' : ': ya no recibe parches. Súbela a 8.2 o superior en Hostalia → Configuración de PHP.'), null, 5);

    $fallos = labs_fila("SELECT COUNT(*) n, COUNT(DISTINCT ip) ips FROM registro_accesos WHERE resultado IN ('fallo','mfa_fallo','bloqueado') AND ts > ?", array(labs_hace(86400)));
    $bloq = labs_fila('SELECT COUNT(*) n FROM bloqueos WHERE hasta > ?', array(labs_ahora()));
    $add('ataques', 'Intentos de entrada en las últimas 24 h', (int) $fallos['n'] >= 30 ? 'aviso' : 'ok',
        (int) $fallos['n'] . ' intento(s) fallido(s) desde ' . (int) $fallos['ips'] . ' conexión(es); ' . (int) $bloq['n'] . ' bloqueo(s) activo(s).', null, 2);

    $total = 0;
    $hecho = 0;
    foreach ($c as $x) {
        $total += $x['peso'];
        $hecho += $x['estado'] === 'ok' ? $x['peso'] : ($x['estado'] === 'aviso' ? $x['peso'] / 2 : 0);
    }
    $ses = labs_fila('SELECT COUNT(*) n FROM tokens_sesion WHERE renovacion_expira > ?', array(labs_ahora()));
    return array(
        'puntuacion' => (int) round($hecho * 100 / max(1, $total)),
        'comprobaciones' => $c,
        'peligrosos' => $pel,
        'admins' => array_map(function ($a) {
            return array('id' => $a['id'], 'nombre' => $a['nombre'], 'raiz' => (int) $a['raiz'] === 1, 'con2fa' => (bool) (int) $a['con2fa']);
        }, $admins),
        'resumen' => array(
            'sesiones' => (int) $ses['n'], 'fallos24h' => (int) $fallos['n'], 'bloqueos' => (int) $bloq['n'],
            'apuntes' => $bit['apuntes'], 'https' => $https,
        ),
    );
}
