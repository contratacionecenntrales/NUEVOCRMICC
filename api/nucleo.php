<?php
/**
 * LABS COMMAND CENTER 360™ · Núcleo del backend
 * Conexión a MySQL, respuestas JSON, sesión del usuario y las comprobaciones
 * de permisos que antes hacían las funciones mi_rol(), soy_admin(), puedo()...
 * de Supabase.
 */
defined('LABS') || exit;

require_once __DIR__ . '/migraciones.php';

/* ---------------------------------------------------------------------------
   ERRORES CON LA FORMA QUE ENTIENDE EL PANEL
   El panel lee message / error_description / hint, como hacía con Supabase.
   ------------------------------------------------------------------------- */
class ErrorApi extends Exception
{
    public $estado;
    public $codigo;
    public $pista;
    public $extra;

    public function __construct($mensaje, $estado = 400, $codigo = 'P0001', $pista = null, $extra = array())
    {
        parent::__construct($mensaje);
        $this->estado = $estado;
        $this->codigo = $codigo;
        $this->pista = $pista;
        $this->extra = $extra;
    }
}

function labs_json($datos, $estado = 200)
{
    http_response_code($estado);
    labs_cabeceras_seguras();
    header('Content-Type: application/json; charset=utf-8');
    if ($estado === 204) {
        exit;
    }
    echo json_encode($datos, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION);
    exit;
}

/**
 * Cabeceras de seguridad que pone el propio PHP. No dependen del .htaccess:
 * siguen ahí aunque el hosting sirva con nginx o ignore el .htaccess.
 */
function labs_cabeceras_seguras()
{
    if (function_exists('header_remove')) {
        header_remove('X-Powered-By');
    }
    header('Cache-Control: no-store, max-age=0');
    header('Pragma: no-cache');
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: DENY');
    header('Referrer-Policy: no-referrer');
    header('Cross-Origin-Resource-Policy: same-origin');
    header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    header('Permissions-Policy: geolocation=(), camera=(), microphone=(), payment=(), usb=()');
}

function labs_falla(ErrorApi $e)
{
    $cuerpo = array(
        'code'    => $e->codigo,
        'message' => $e->getMessage(),
        'hint'    => $e->pista,
        'details' => null,
    );
    foreach ($e->extra as $k => $v) {
        $cuerpo[$k] = $v;
    }
    labs_json($cuerpo, $e->estado);
}

/* ---------------------------------------------------------------------------
   BASE DE DATOS
   ------------------------------------------------------------------------- */
function labs_db()
{
    static $db = null;
    if ($db) {
        return $db;
    }
    $dsn = 'mysql:host=' . LABS_DB_HOST . ';port=' . LABS_DB_PORT . ';dbname=' . LABS_DB_NAME . ';charset=utf8mb4';
    try {
        $db = new PDO($dsn, LABS_DB_USER, LABS_DB_PASS, array(
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
            PDO::ATTR_STRINGIFY_FETCHES  => false,
        ));
    } catch (PDOException $e) {
        throw new ErrorApi('No se ha podido conectar con la base de datos MySQL. Revisa la configuración (api/instalar.php dice el motivo).',
            503, 'BD_SIN_CONEXION', LABS_DEPURAR ? $e->getMessage() : labs_causa_bd($e));
    }
    // Horas en UTC (el panel las convierte a la hora local) y modo estricto:
    // un dato que no cabe da error en vez de recortarse en silencio.
    $db->exec("SET time_zone = '+00:00'");
    $db->exec("SET SESSION sql_mode = 'STRICT_ALL_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'");
    // Tablas y columnas nuevas de cada versión: se crean solas (migraciones.php).
    labs_migra($db);
    $GLOBALS['labs_db_ok'] = true;
    return $db;
}

/** true si ya hay conexión con MySQL en esta petición. */
function labs_db_lista()
{
    return !empty($GLOBALS['labs_db_ok']);
}

/**
 * Explica en claro por qué no conecta MySQL, sin mostrar ninguna contraseña.
 * Lo usa api/instalar.php para que el fallo se pueda arreglar sin adivinar.
 */
function labs_causa_bd(PDOException $e)
{
    $m = $e->getMessage();
    if (strpos($m, '[1044]') !== false || strpos($m, '[1049]') !== false || stripos($m, 'Unknown database') !== false) {
        return 'La base de datos indicada no existe o ese usuario no tiene acceso: revisa LABS_DB_NAME.';
    }
    if (strpos($m, '[1045]') !== false || stripos($m, 'Access denied for user') !== false && stripos($m, 'to database') === false) {
        return 'MySQL rechaza el usuario o la contraseña: revisa LABS_DB_USER y LABS_DB_PASS (¿has cambiado la contraseña en Hostalia?).';
    }
    if (strpos($m, '[2002]') !== false || strpos($m, '[2005]') !== false || stripos($m, 'getaddrinfo') !== false) {
        return 'No se encuentra el servidor MySQL: revisa LABS_DB_HOST (sin «:3306», el puerto va aparte).';
    }
    if (strpos($m, '[1040]') !== false || strpos($m, '[1203]') !== false) {
        return 'MySQL tiene demasiadas conexiones abiertas ahora mismo: espera un minuto y vuelve a probar.';
    }
    if (strpos($m, '[2006]') !== false || strpos($m, '[2013]') !== false) {
        return 'Se ha cortado la conexión con MySQL: vuelve a probar en un momento.';
    }
    return 'Error de MySQL ' . (preg_match('/\[(\d{4})\]/', $m, $x) ? $x[1] : 'desconocido') . '.';
}

/** Ejecuta una consulta preparada y devuelve el PDOStatement. */
function labs_q($sql, $params = array())
{
    $st = labs_db()->prepare($sql);
    $st->execute($params);
    return $st;
}

function labs_fila($sql, $params = array())
{
    $f = labs_q($sql, $params)->fetch();
    return $f === false ? null : $f;
}

function labs_quote($valor)
{
    if ($valor === null) {
        return 'NULL';
    }
    return labs_db()->quote((string) $valor);
}

/* ---------------------------------------------------------------------------
   UTILIDADES
   ------------------------------------------------------------------------- */
function labs_uuid()
{
    $b = random_bytes(16);
    $b[6] = chr((ord($b[6]) & 0x0f) | 0x40);
    $b[8] = chr((ord($b[8]) & 0x3f) | 0x80);
    $h = bin2hex($b);
    return substr($h, 0, 8) . '-' . substr($h, 8, 4) . '-' . substr($h, 12, 4) . '-' . substr($h, 16, 4) . '-' . substr($h, 20);
}

function labs_es_uuid($v)
{
    return is_string($v) && preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $v);
}

/** Ahora mismo, en UTC y con microsegundos, listo para MySQL. */
function labs_ahora()
{
    $d = new DateTime('now', new DateTimeZone('UTC'));
    return $d->format('Y-m-d H:i:s.u');
}

function labs_hoy()
{
    $d = new DateTime('now', new DateTimeZone('UTC'));
    return $d->format('Y-m-d');
}

function labs_ip()
{
    $ip = isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : null;
    // Solo si la petición llega a través del proxy del propio hosting (una
    // dirección interna) se mira X-Forwarded-For, y de esa lista se toma el
    // ÚLTIMO valor: el que añade el proxy. Los primeros los puede inventar
    // cualquiera para esquivar los bloqueos por IP.
    if (!empty($_SERVER['HTTP_X_FORWARDED_FOR']) &&
        ($ip === null || !filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE))) {
        $lista = array_map('trim', explode(',', $_SERVER['HTTP_X_FORWARDED_FOR']));
        $ultima = end($lista);
        if (filter_var($ultima, FILTER_VALIDATE_IP)) {
            $ip = $ultima;
        }
    }
    return $ip ? substr($ip, 0, 64) : null;
}

function labs_navegador()
{
    $ua = isset($_SERVER['HTTP_USER_AGENT']) ? $_SERVER['HTTP_USER_AGENT'] : '';
    return $ua === '' ? null : mb_substr($ua, 0, 255);
}

function labs_cabecera($nombre)
{
    $k = 'HTTP_' . strtoupper(str_replace('-', '_', $nombre));
    return isset($_SERVER[$k]) ? $_SERVER[$k] : null;
}

/** Compara dos valores JSON sin que importe el orden de las claves. */
function labs_json_igual($a, $b)
{
    return labs_normaliza($a) === labs_normaliza($b);
}

function labs_normaliza($v)
{
    if (is_string($v)) {
        $d = json_decode($v, true);
        if (json_last_error() === JSON_ERROR_NONE && (is_array($d))) {
            $v = $d;
        }
    }
    if (is_array($v)) {
        $lista = array_keys($v) === range(0, count($v) - 1);
        if (!$lista) {
            ksort($v);
        }
        foreach ($v as $k => $x) {
            $v[$k] = labs_normaliza($x);
        }
    }
    return $v;
}

/* ---------------------------------------------------------------------------
   PERMISOS POR ROL · equivalente a permisos_de_rol() de Supabase
   ------------------------------------------------------------------------- */
function labs_claves_permiso()
{
    static $claves = null;
    if ($claves === null) {
        $claves = labs_q('SELECT clave FROM permisos_catalogo ORDER BY orden')->fetchAll(PDO::FETCH_COLUMN);
    }
    return $claves;
}

function labs_permisos_de_rol($rol)
{
    $por_rol = array(
        'manager' => array('presu.ver', 'presu.crear', 'presu.dto', 'funnel.ver', 'exp.ver',
            'exp.estado', 'exp.hitos', 'exp.docs', 'hr.ver', 'hr.mover', 'hr.contratar',
            'com.llamadas', 'com.wsp', 'com.plant', 'sys.audit',
            'contactos.ver', 'contactos.crea', 'contactos.editar', 'contactos.notas',
            'contactos.comentar', 'contactos.docs', 'contactos.borrar',
            'recursos.ver', 'recursos.subir', 'recursos.borrar',
            'soporte.ver', 'soporte.gestionar', 'soporte.escalar'),
        'commercial' => array('presu.ver', 'presu.crear', 'funnel.ver', 'exp.ver', 'exp.docs',
            'com.llamadas', 'com.wsp',
            'contactos.ver', 'contactos.crea', 'contactos.editar', 'contactos.notas',
            'contactos.comentar', 'contactos.docs',
            'recursos.ver',
            'soporte.ver'),
        'backoffice' => array('exp.ver', 'exp.estado', 'exp.hitos', 'exp.docs', 'exp.borrar',
            'presu.ver', 'com.llamadas',
            'contactos.ver', 'contactos.editar', 'contactos.notas',
            'contactos.comentar', 'contactos.docs', 'contactos.borrar',
            'recursos.ver',
            'soporte.ver'),
    );
    $out = array();
    foreach (labs_claves_permiso() as $k) {
        $out[$k] = $rol === 'admin' ? true : (isset($por_rol[$rol]) && in_array($k, $por_rol[$rol], true));
    }
    return $out;
}

function labs_rango($rol, $raiz)
{
    if ($raiz) {
        return 4;
    }
    if ($rol === 'admin') {
        return 3;
    }
    if ($rol === 'manager') {
        return 2;
    }
    return 1;
}

/* ---------------------------------------------------------------------------
   SESIÓN · el token que el panel manda en cada petición
   ------------------------------------------------------------------------- */
function labs_token_peticion()
{
    $t = labs_cabecera('X-Sesion');
    if (!$t) {
        $a = labs_cabecera('Authorization');
        if (!$a && isset($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
            $a = $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
        }
        if ($a && stripos($a, 'Bearer ') === 0) {
            $t = trim(substr($a, 7));
        }
    }
    return ($t && preg_match('/^[A-Za-z0-9_-]{20,200}$/', $t)) ? $t : null;
}

/**
 * Usuario con sesión: la fila de perfiles (decodificada) más el id del token.
 * null si no hay sesión. Lanza 401 si el token ha caducado, para que el panel
 * lo renueve solo.
 */
function labs_usuario($exigir = false)
{
    static $cache = false;
    if ($cache !== false) {
        if (!$cache && $exigir) {
            throw new ErrorApi('Sesión no iniciada.', 401, 'PGRST301');
        }
        return $cache;
    }
    $cache = null;
    $t = labs_token_peticion();
    if ($t) {
        $tok = labs_fila('SELECT id, usuario_id, acceso_expira, ver_como_de, creado, ultimo_uso FROM tokens_sesion WHERE acceso_hash = ?',
            array(hash('sha256', $t)));
        if (!$tok) {
            throw new ErrorApi('La sesión no es válida o se ha cerrado.', 401, 'PGRST301');
        }
        if ($tok['acceso_expira'] < labs_ahora()) {
            throw new ErrorApi('JWT expired', 401, 'PGRST301');
        }
        // Inactividad y duración máxima: una sesión olvidada no vale para siempre.
        $motivo = labs_sesion_caducada($tok);
        if ($motivo) {
            labs_q('DELETE FROM tokens_sesion WHERE id = ?', array($tok['id']));
            throw new ErrorApi($motivo, 401, 'PGRST301');
        }
        if (!$tok['ultimo_uso'] || $tok['ultimo_uso'] < labs_hace(60)) {
            labs_q('UPDATE tokens_sesion SET ultimo_uso = ?, ip = ? WHERE id = ?', array(labs_ahora(), labs_ip(), $tok['id']));
        }
        $p = labs_fila('SELECT * FROM perfiles WHERE id = ?', array($tok['usuario_id']));
        if ($p) {
            $p['permisos'] = json_decode($p['permisos'], true) ?: array();
            $p['raiz'] = (int) $p['raiz'] === 1;
            $p['token_id'] = (int) $tok['id'];
            $p['ver_como_de'] = $tok['ver_como_de'];
            $cache = $p;
        } else {
            // Identidad sin ficha: tiene sesión pero ningún permiso.
            $cache = array('id' => $tok['usuario_id'], 'sin_ficha' => true, 'estado' => '',
                'rol' => '', 'raiz' => false, 'permisos' => array(), 'superior_id' => null,
                'nombre' => '', 'apellidos' => '', 'token_id' => (int) $tok['id'], 'ver_como_de' => $tok['ver_como_de']);
        }
    }
    if (!$cache && $exigir) {
        throw new ErrorApi('Sesión no iniciada.', 401, 'PGRST301');
    }
    return $cache;
}

function labs_uid()
{
    $u = labs_usuario();
    return $u ? $u['id'] : null;
}

function labs_activo()
{
    $u = labs_usuario();
    return $u && empty($u['sin_ficha']) && $u['estado'] === 'Activo';
}

/** mi_rol(): el rol si la cuenta está activa; null si no. */
function labs_mi_rol()
{
    $u = labs_usuario();
    return labs_activo() ? $u['rol'] : null;
}

function labs_soy_admin()
{
    return labs_mi_rol() === 'admin';
}

function labs_puedo($clave)
{
    $u = labs_usuario();
    return labs_activo() && isset($u['permisos'][$clave]) && $u['permisos'][$clave] === true;
}

/** gestiono(): el usuario con sesión gestiona la cuenta $id (admin, o jefe de su equipo). */
function labs_gestiono($id)
{
    $yo = labs_usuario();
    if (!labs_activo()) {
        return false;
    }
    $el = labs_fila('SELECT id, rol, raiz, superior_id FROM perfiles WHERE id = ?', array($id));
    if (!$el || (int) $el['raiz'] === 1 || $el['id'] === $yo['id']) {
        return false;
    }
    if ($yo['raiz'] || $yo['rol'] === 'admin') {
        return true;
    }
    return $yo['rol'] === 'manager' && $el['superior_id'] === $yo['id']
        && labs_rango($el['rol'], false) < labs_rango($yo['rol'], $yo['raiz']);
}

/** dirijo_agente(): el admin, o el superior directo del agente. */
function labs_dirijo_agente($agente_id)
{
    $rol = labs_mi_rol();
    if ($rol === 'admin') {
        return true;
    }
    if ($rol === null) {
        return false;
    }
    return (bool) labs_fila('SELECT 1 FROM perfiles WHERE id = ? AND superior_id = ?', array($agente_id, labs_uid()));
}

function labs_es_agente($id)
{
    return (bool) labs_fila("SELECT 1 FROM perfiles WHERE id = ? AND rol = 'commercial'", array($id));
}

function labs_nombre($p)
{
    return trim(($p['nombre'] ?? '') . ' ' . ($p['apellidos'] ?? ''));
}

/**
 * Apunte en la bitácora. Solo lo escribe el servidor: el panel no puede.
 *
 * Cada apunte lleva una «cadena»: la huella SHA-256 de su contenido junto con
 * la del apunte anterior. Si alguien borra o retoca un apunte directamente en
 * la base de datos, la cadena se rompe en ese punto y el Centro de Seguridad
 * lo detecta (labs_verifica_bitacora).
 */
function labs_anota($accion, $detalle = '', $destino = null, $actor = 'yo')
{
    $a = $actor === 'yo' ? labs_usuario() : $actor;
    $tiene_ficha = $a && empty($a['sin_ficha']);
    $fila = array(
        'id' => labs_uuid(), 'ts' => labs_ahora(),
        'actor_id' => $tiene_ficha ? $a['id'] : null,
        'actor_nombre' => $tiene_ficha ? (labs_nombre($a) ?: 'sistema') : 'sistema',
        'actor_rol' => $tiene_ficha ? $a['rol'] : null,
        'destino_id' => $destino ? $destino['id'] : null,
        'destino_nombre' => $destino ? labs_nombre($destino) : null,
        'accion' => mb_substr($accion, 0, 200), 'detalle' => (string) $detalle,
        'ip' => labs_ip(), 'agente' => labs_navegador(),
    );
    labs_q("INSERT IGNORE INTO ajustes (clave, valor) VALUES ('bitacora_cadena', '')");
    $previa = labs_fila("SELECT valor FROM ajustes WHERE clave = 'bitacora_cadena' FOR UPDATE");
    $fila['cadena'] = labs_eslabon((string) $previa['valor'], $fila);
    labs_q('INSERT INTO bitacora (id, ts, actor_id, actor_nombre, actor_rol, destino_id, destino_nombre, accion, detalle, ip, agente, cadena)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', array_values($fila));
    labs_q("UPDATE ajustes SET valor = ? WHERE clave = 'bitacora_cadena'", array($fila['cadena']));
}

/** Huella de un apunte de la bitácora encadenada con la del anterior. */
function labs_eslabon($previa, $f)
{
    $ts = substr((string) $f['ts'], 0, 26);
    return hash('sha256', implode("\x1f", array($previa, $f['id'], $ts, (string) $f['actor_id'], $f['actor_nombre'],
        (string) $f['destino_id'], $f['accion'], $f['detalle'])));
}

/** Recorre la bitácora y comprueba que nadie la ha tocado por fuera del panel. */
function labs_verifica_bitacora()
{
    $previa = '';
    $n = 0;
    $st = labs_q('SELECT seq, id, ts, actor_id, actor_nombre, destino_id, accion, detalle, cadena FROM bitacora
                  WHERE cadena IS NOT NULL ORDER BY seq');
    while ($f = $st->fetch()) {
        if (strlen($f['ts']) === 19) {
            $f['ts'] .= '.000000';
        }
        if (labs_eslabon($previa, $f) !== $f['cadena']) {
            return array('ok' => false, 'apuntes' => $n, 'rota_en' => (int) $f['seq'],
                'mensaje' => 'El apunte nº ' . $f['seq'] . ' («' . $f['accion'] . '») se ha modificado o falta uno anterior.');
        }
        $previa = $f['cadena'];
        $n++;
    }
    $ultima = labs_fila("SELECT valor FROM ajustes WHERE clave = 'bitacora_cadena'");
    if ($ultima && (string) $ultima['valor'] !== $previa) {
        return array('ok' => false, 'apuntes' => $n, 'rota_en' => null,
            'mensaje' => 'Faltan apuntes al final de la bitácora: alguien ha borrado los más recientes.');
    }
    return array('ok' => true, 'apuntes' => $n, 'rota_en' => null, 'huella' => $previa,
        'mensaje' => $n . ' apuntes encadenados, ninguno modificado ni borrado.');
}

/* ---------------------------------------------------------------------------
   SESIONES, FRENOS, BLOQUEOS Y REGISTRO DE ACCESOS
   ------------------------------------------------------------------------- */

/** Fecha de hace $segundos, en el mismo formato que guarda MySQL. */
function labs_hace($segundos)
{
    $d = new DateTime('now', new DateTimeZone('UTC'));
    $d->modify('-' . (int) $segundos . ' seconds');
    return $d->format('Y-m-d H:i:s.u');
}

/** null si la sesión sigue viva; si no, el motivo. */
function labs_sesion_caducada($tok)
{
    if ($tok['creado'] < labs_hace(LABS_RENOVACION_DIAS * 86400)) {
        return 'La sesión ha llegado a su duración máxima. Vuelve a entrar.';
    }
    $uso = $tok['ultimo_uso'] ?: $tok['creado'];
    if ($uso < labs_hace(LABS_INACTIVIDAD_HORAS * 3600)) {
        return 'La sesión se ha cerrado por inactividad. Vuelve a entrar.';
    }
    return null;
}

/**
 * Freno genérico: true si $clave ha superado $max peticiones en $segundos.
 * Sirve para lo que se puede llamar sin sesión (firma pública, avisos...).
 */
function labs_freno($clave, $max, $segundos)
{
    $clave = substr($clave, 0, 160);
    labs_q('INSERT IGNORE INTO frenos (clave, ventana, contador) VALUES (?,?,0)', array($clave, labs_ahora()));
    $f = labs_fila('SELECT ventana, contador FROM frenos WHERE clave = ? FOR UPDATE', array($clave));
    if ($f['ventana'] < labs_hace($segundos)) {
        labs_q('UPDATE frenos SET ventana = ?, contador = 1 WHERE clave = ?', array(labs_ahora(), $clave));
        return false;
    }
    labs_q('UPDATE frenos SET contador = contador + 1 WHERE clave = ?', array($clave));
    if (mt_rand(1, 50) === 1) {
        labs_q('DELETE FROM frenos WHERE ventana < ?', array(labs_hace(86400)));
    }
    return (int) $f['contador'] + 1 > $max;
}

/** Bloqueo activo para una IP o una cuenta (o null). */
function labs_bloqueo($tipo, $valor)
{
    if ($valor === null || $valor === '') {
        return null;
    }
    return labs_fila('SELECT hasta, motivo FROM bloqueos WHERE tipo = ? AND valor = ? AND hasta > ?',
        array($tipo, $valor, labs_ahora()));
}

function labs_bloquea($tipo, $valor, $minutos, $motivo)
{
    if ($valor === null || $valor === '') {
        return;
    }
    $hasta = new DateTime('now', new DateTimeZone('UTC'));
    $hasta->modify('+' . (int) $minutos . ' minutes');
    labs_q('INSERT INTO bloqueos (tipo, valor, hasta, motivo, creado) VALUES (?,?,?,?,?)
            ON DUPLICATE KEY UPDATE hasta = VALUES(hasta), motivo = VALUES(motivo), creado = VALUES(creado)',
        array($tipo, mb_substr($valor, 0, 190), $hasta->format('Y-m-d H:i:s.u'), mb_substr($motivo, 0, 255), labs_ahora()));
}

/** Deja constancia de cada intento de entrada, bueno o malo. */
function labs_registra_acceso($usuario_id, $email, $resultado, $detalle = null)
{
    labs_q('INSERT INTO registro_accesos (ts, usuario_id, email, ip, agente, resultado, detalle) VALUES (?,?,?,?,?,?,?)',
        array(labs_ahora(), $usuario_id, $email === null ? null : mb_substr($email, 0, 190), labs_ip(), labs_navegador(),
            $resultado, $detalle === null ? null : mb_substr($detalle, 0, 255)));
    if (mt_rand(1, 100) === 1) {
        labs_q('DELETE FROM registro_accesos WHERE ts < ?', array(labs_hace(180 * 86400)));
    }
}

/** Cifrado de contraseñas: Argon2id si el servidor lo tiene; si no, bcrypt reforzado. */
function labs_hash_clave($clave)
{
    if (defined('PASSWORD_ARGON2ID')) {
        return password_hash($clave, PASSWORD_ARGON2ID);
    }
    return password_hash($clave, PASSWORD_BCRYPT, array('cost' => 12));
}

function labs_clave_anticuada($hash)
{
    if (defined('PASSWORD_ARGON2ID')) {
        return password_needs_rehash($hash, PASSWORD_ARGON2ID);
    }
    return password_needs_rehash($hash, PASSWORD_BCRYPT, array('cost' => 12));
}

/* ---------------------------------------------------------------------------
   CONTRASEÑAS · la misma política que tenía Supabase
   ------------------------------------------------------------------------- */
function labs_revisa_clave($p, $datos = array())
{
    $f = array();
    if (!is_string($p) || mb_strlen($p) < 10) {
        $f[] = 'al menos 10 caracteres';
    }
    if (!is_string($p)) {
        return $f;
    }
    if (mb_strlen($p) > 200) {
        $f[] = 'un máximo de 200 caracteres';
    }
    if (!preg_match('/[A-ZÁÉÍÓÚÑ]/u', $p)) {
        $f[] = 'una mayúscula';
    }
    if (!preg_match('/[a-záéíóúñ]/u', $p)) {
        $f[] = 'una minúscula';
    }
    if (!preg_match('/[0-9]/', $p)) {
        $f[] = 'un número';
    }
    if (!preg_match('/[^A-Za-z0-9]/', $p)) {
        $f[] = 'un símbolo';
    }
    if (preg_match('/(.)\1{3,}/u', $p)) {
        $f[] = 'no repetir el mismo carácter cuatro veces';
    }
    $partes = array();
    if (!empty($datos['email'])) {
        $partes[] = explode('@', $datos['email'])[0];
    }
    if (!empty($datos['nombre'])) {
        $partes[] = $datos['nombre'];
    }
    if (!empty($datos['apellidos'])) {
        $partes[] = $datos['apellidos'];
    }
    foreach ($partes as $x) {
        if (mb_strlen($x) > 2 && mb_stripos($p, $x) !== false) {
            $f[] = 'no contener su nombre ni su correo';
            break;
        }
    }
    return $f;
}

function labs_clave_aleatoria()
{
    $may = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    $min = 'abcdefghijkmnopqrstuvwxyz';
    $num = '23456789';
    $sig = '!@#$%&*';
    $az = function ($s) {
        return $s[random_int(0, strlen($s) - 1)];
    };
    $base = array($az($may), $az($may), $az($min), $az($min), $az($min), $az($min),
        $az($num), $az($num), $az($sig), $az($sig), $az($min), $az($num));
    for ($i = count($base) - 1; $i > 0; $i--) {
        $j = random_int(0, $i);
        $t = $base[$i];
        $base[$i] = $base[$j];
        $base[$j] = $t;
    }
    return implode('', $base);
}

function labs_nueva_relacion()
{
    do {
        $rel = '0-' . random_int(100, 999) . '-' . random_int(100, 999);
    } while (labs_fila('SELECT 1 FROM perfiles WHERE rel = ?', array($rel)));
    return $rel;
}

function labs_token_api()
{
    return 'lk_' . bin2hex(random_bytes(16));
}

/** La raíz siempre lleva todos los permisos del catálogo, también los nuevos. */
function labs_sincroniza_raiz()
{
    labs_q('UPDATE perfiles SET permisos = ?, rol = ?, estado = ?, doble_factor = 1 WHERE raiz = 1',
        array(json_encode(labs_permisos_de_rol('admin')), 'admin', 'Activo'));
}
