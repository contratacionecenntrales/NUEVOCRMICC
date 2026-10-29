<?php
/**
 * LABS COMMAND CENTER 360™ · Puerta de entrada del backend
 *
 * El panel llama siempre a  api/index.php?ruta=/<lo que antes pedía a Supabase>
 *   /auth/v1/token?grant_type=password|refresh_token   entrar / renovar
 *   /auth/v1/logout[?scope=local]                      salir
 *   /auth/v1/recover · /auth/v1/settings
 *   /rest/v1/<tabla>?<consulta>                        leer y escribir tablas
 *   /rest/v1/rpc/<función>                             funciones del servidor
 *   /storage/v1/object[/authenticated]/documentos/...  archivos
 *   /functions/v1/admin-usuarios[/id[/acción]]         administración de usuarios
 *   /estado                                            comprobación de la instalación
 *   /seguridad/...                                     Centro de Seguridad y doble factor
 *   /rgpd/...                                          Cumplimiento RGPD (copias, brechas, derechos)
 *   /mantenimiento?clave=...                           tarea programada diaria (Plesk)
 *
 * Hostalia bloquea a veces PATCH y DELETE: el panel los manda como POST con
 * la cabecera X-HTTP-Method-Override, igual que en el CRM de IC.
 */
define('LABS', true);
require __DIR__ . '/config.php';
require __DIR__ . '/nucleo.php';
require __DIR__ . '/esquema.php';
require __DIR__ . '/rest.php';
require __DIR__ . '/rpc.php';
require __DIR__ . '/auth.php';
require __DIR__ . '/almacen.php';
require __DIR__ . '/admin.php';
require __DIR__ . '/totp.php';
require __DIR__ . '/seguridad.php';
require __DIR__ . '/cumplimiento.php';
require __DIR__ . '/importacion.php';

ini_set('display_errors', '0');

$metodo = strtoupper(isset($_SERVER['REQUEST_METHOD']) ? $_SERVER['REQUEST_METHOD'] : 'GET');
$sobre = strtoupper((string) labs_cabecera('X-HTTP-Method-Override'));
if ($metodo === 'POST' && in_array($sobre, array('PATCH', 'PUT', 'DELETE'), true)) {
    $metodo = $sobre;
}

$ruta_completa = isset($_GET['ruta']) ? (string) $_GET['ruta'] : '';
$p = strpos($ruta_completa, '?');
$ruta = $p === false ? $ruta_completa : substr($ruta_completa, 0, $p);
$qs = $p === false ? '' : substr($ruta_completa, $p + 1);
$pares = labs_parse_query($qs);
$param = function ($k) use ($pares) {
    foreach ($pares as $par) {
        if ($par[0] === $k) {
            return $par[1];
        }
    }
    return null;
};

/** Cuerpo JSON de la petición (las subidas de archivos lo leen aparte). */
function labs_cuerpo_json()
{
    $largo = isset($_SERVER['CONTENT_LENGTH']) ? (int) $_SERVER['CONTENT_LENGTH'] : 0;
    if ($largo > LABS_MAX_JSON) {
        throw new ErrorApi('La petición es demasiado grande.', 413, 'PGRST413');
    }
    $raw = file_get_contents('php://input', false, null, 0, LABS_MAX_JSON + 1);
    if ($raw !== false && strlen($raw) > LABS_MAX_JSON) {
        throw new ErrorApi('La petición es demasiado grande.', 413, 'PGRST413');
    }
    if ($raw === '' || $raw === false) {
        return array();
    }
    $d = json_decode($raw, true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        throw new ErrorApi('El cuerpo de la petición no es JSON válido.', 400, 'PGRST102');
    }
    return $d;
}

$db_iniciada = false;
try {
    if ($metodo === 'OPTIONS') {
        labs_json(null, 204);
    }

    /* --- Comprobación de la instalación (sin sesión) --------------------- */
    if ($ruta === '/estado') {
        // Solo sí/no: ni versiones ni rutas, que darían pistas a un atacante.
        $out = array('ok' => false, 'bd' => false, 'tablas' => false, 'raiz' => false, 'raiz_con_clave' => false,
            'almacen' => false);
        try {
            labs_db();
            $out['bd'] = true;
            $out['tablas'] = (bool) labs_fila("SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'perfiles'");
            if ($out['tablas']) {
                $r = labs_fila('SELECT c.clave_hash FROM perfiles p JOIN cuentas c ON c.id = p.id WHERE p.raiz = 1');
                $out['raiz'] = (bool) $r;
                $out['raiz_con_clave'] = $r && $r['clave_hash'];
            }
        } catch (ErrorApi $e) {
            $out['detalle'] = 'Sin conexión con la base de datos.';
        }
        $dir = rtrim(LABS_STORAGE_DIR, '/');
        $out['almacen'] = (is_dir($dir) || @mkdir($dir, 0750, true)) && is_writable($dir);
        $out['ok'] = $out['bd'] && $out['tablas'] && $out['raiz_con_clave'] && $out['almacen'];
        labs_json($out);
    }

    labs_db()->beginTransaction();
    $db_iniciada = true;
    // Contactos incluidos en el despliegue (api/importacion-pendiente.php): se cargan una vez.
    if (is_file(__DIR__ . '/importacion-pendiente.php')) {
        labs_importacion_pendiente();
    }
    $estado = 200;
    $resp = null;

    if (preg_match('#^/auth/v1/(token|logout|recover|settings|user)$#', $ruta, $m)) {
        /* --- Acceso ------------------------------------------------------- */
        if ($m[1] === 'token' && $metodo === 'POST') {
            $resp = labs_auth_token((string) $param('grant_type'), labs_cuerpo_json());
        } elseif ($m[1] === 'logout' && $metodo === 'POST') {
            labs_auth_salir((string) ($param('scope') ?: 'global'));
            $estado = 204;
        } elseif ($m[1] === 'recover' && $metodo === 'POST') {
            labs_auth_recuperar(labs_cuerpo_json());
            $resp = new stdClass();
        } elseif ($m[1] === 'settings') {
            $resp = array('external' => array('email' => true, 'google' => false), 'disable_signup' => true);
        } elseif ($m[1] === 'user') {
            $u = labs_usuario(true);
            $resp = array('id' => $u['id'], 'email' => isset($u['email']) ? $u['email'] : null);
        } else {
            throw new ErrorApi('Método no admitido.', 405, 'PGRST000');
        }
    } elseif (preg_match('#^/rest/v1/rpc/([a-z_0-9]+)$#', $ruta, $m)) {
        /* --- Funciones ---------------------------------------------------- */
        if ($metodo !== 'POST') {
            throw new ErrorApi('Las funciones se llaman con POST.', 405, 'PGRST000');
        }
        $resp = labs_rpc($m[1], labs_cuerpo_json());
        if ($resp === null) {
            $estado = 204;
        }
    } elseif (preg_match('#^/rest/v1/([a-z_]+)$#', $ruta, $m)) {
        /* --- Tablas ------------------------------------------------------- */
        labs_usuario(true);
        $tabla = $m[1];
        if ($metodo === 'GET') {
            $resp = labs_rest_leer($tabla, $pares);
        } elseif ($metodo === 'POST') {
            $resp = labs_rest_crear($tabla, $pares, labs_cuerpo_json());
            $estado = $resp === null ? 201 : 201;
        } elseif ($metodo === 'PATCH') {
            $resp = labs_rest_editar($tabla, $pares, labs_cuerpo_json());
        } elseif ($metodo === 'DELETE') {
            $resp = labs_rest_borrar($tabla, $pares);
        } else {
            throw new ErrorApi('Método no admitido.', 405, 'PGRST000');
        }
        if ($resp === null) {
            $estado = $metodo === 'POST' ? 201 : 204;
        }
    } elseif (preg_match('#^/storage/v1/object/(authenticated/)?documentos/(.+)$#', $ruta, $m)) {
        /* --- Archivos ----------------------------------------------------- */
        if ($metodo === 'GET') {
            labs_db()->commit();
            $db_iniciada = false;
            labs_almacen_descargar($m[2]);
        } elseif ($metodo === 'POST' || $metodo === 'PUT') {
            $resp = labs_almacen_subir($m[2]);
        } elseif ($metodo === 'DELETE') {
            $resp = labs_almacen_borrar($m[2]);
        } else {
            throw new ErrorApi('Método no admitido.', 405, 'PGRST000');
        }
    } elseif (preg_match('#^/seguridad(/[a-z0-9/_-]*)?$#', $ruta, $m)) {
        /* --- Centro de Seguridad y doble factor --------------------------- */
        $r = labs_seguridad($metodo, isset($m[1]) ? $m[1] : '', $metodo === 'GET' ? array() : labs_cuerpo_json(), $pares);
        $estado = $r[0];
        $resp = $r[1];
    } elseif (preg_match('#^/rgpd(/[a-z0-9/_-]*)?$#', $ruta, $m)) {
        /* --- Cumplimiento RGPD -------------------------------------------- */
        $sub = isset($m[1]) ? $m[1] : '';
        $crudo = $sub === '/copias/subir';
        $r = labs_rgpd($metodo, $sub, ($metodo === 'GET' || $crudo) ? array() : labs_cuerpo_json(), $pares);
        $estado = $r[0];
        $resp = $r[1];
    } elseif ($ruta === '/mantenimiento') {
        /* --- Tarea programada (Plesk → Tareas programadas → URL) ---------- */
        if (labs_freno('mant|' . labs_ip(), 20, 3600)) {
            throw new ErrorApi('Demasiadas peticiones.', 429, 'FRENO');
        }
        $clave = labs_ajuste('clave_cron');
        if (!$clave || !hash_equals($clave, (string) $param('clave'))) {
            labs_db()->commit();
            $db_iniciada = false;
            labs_json(array('ok' => false), 403);
        }
        $r = labs_mantenimiento(true);
        $resp = array('ok' => true, 'copia' => $r['copia'] ? $r['copia']['nombre'] : null, 'bitacora' => $r['bitacora']);
    } elseif (preg_match('#^/functions/v1/admin-usuarios(?:/([0-9a-fA-F-]{36}))?(?:/([a-z-]+))?/?$#', $ruta, $m)) {
        /* --- Administración de usuarios ---------------------------------- */
        $r = labs_admin($metodo, isset($m[1]) ? $m[1] : null, isset($m[2]) ? $m[2] : null,
            $metodo === 'DELETE' ? array() : labs_cuerpo_json());
        $estado = $r[0];
        $resp = $r[1];
    } else {
        throw new ErrorApi('Ruta desconocida: ' . $ruta, 404, 'PGRST125');
    }

    labs_db()->commit();
    $db_iniciada = false;
    // Copia diaria, plazos de conservación y vigilancia: tras responder, si toca.
    if ($ruta !== '/mantenimiento') {
        register_shutdown_function('labs_mantenimiento_diferido');
    }
    labs_json($resp, $estado);
} catch (ErrorApi $e) {
    if ($db_iniciada && labs_db()->inTransaction()) {
        labs_db()->rollBack();
    }
    labs_falla($e);
} catch (PDOException $e) {
    if ($db_iniciada && labs_db()->inTransaction()) {
        labs_db()->rollBack();
    }
    $errno = isset($e->errorInfo[1]) ? (int) $e->errorInfo[1] : 0;
    $mapa = array(
        1062 => array(409, '23505', 'Ya existe un registro con ese valor (duplicado).'),
        1451 => array(409, '23503', 'No se puede borrar: hay otros datos que dependen de este registro.'),
        1452 => array(409, '23503', 'El registro relacionado no existe.'),
        1406 => array(400, '22001', 'Un texto es demasiado largo para su campo.'),
        1264 => array(400, '22003', 'Un número está fuera del rango permitido.'),
        1366 => array(400, '22P02', 'Un valor no tiene el formato correcto.'),
        1292 => array(400, '22007', 'Una fecha no tiene el formato correcto.'),
        1048 => array(400, '23502', 'Falta un dato obligatorio.'),
        1364 => array(400, '23502', 'Falta un dato obligatorio.'),
        1146 => array(404, '42P01', 'Falta una tabla en la base de datos: importa sql/base-de-datos.sql.'),
    );
    $m = isset($mapa[$errno]) ? $mapa[$errno] : array(500, 'XX000', 'Error de la base de datos.');
    labs_falla(new ErrorApi($m[2], $m[0], $m[1], LABS_DEPURAR ? $e->getMessage() : null));
} catch (Throwable $e) {
    if ($db_iniciada) {
        try {
            if (labs_db()->inTransaction()) {
                labs_db()->rollBack();
            }
        } catch (Throwable $x) {
        }
    }
    error_log('Labs CRM: ' . $e->getMessage() . ' en ' . $e->getFile() . ':' . $e->getLine());
    labs_falla(new ErrorApi('Error interno del servidor.', 500, 'XX000', LABS_DEPURAR ? $e->getMessage() : null));
}
