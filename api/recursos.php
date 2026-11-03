<?php
/**
 * LABS COMMAND CENTER 360™ · Centro de Recursos y Formación
 *
 * - Ver los archivos dentro del CRM (PDF, presentaciones, vídeo, imágenes)
 *   con enlaces firmados de corta duración: el navegador no puede mandar la
 *   cabecera de sesión desde un <video>, así que el servidor firma la ruta,
 *   la persona y la caducidad. Admite peticiones parciales (Range) para que
 *   un vídeo empiece al momento y un PDF grande se abra página a página.
 * - Formación: secciones (formación / dosier), miniatura, páginas, duración,
 *   destacados y el progreso de cada persona.
 */
defined('LABS') || exit;

/** Duración de un enlace firmado (segundos). */
defined('LABS_FIRMA_DURA') || define('LABS_FIRMA_DURA', 4 * 3600);

/* --- Tablas: columnas nuevas de recursos y el progreso de formación ------- */
function labs_tablas_recursos(&$T, $AHORA)
{
    if (!isset($T['recursos'])) {
        return;
    }
    $r = &$T['recursos'];
    $r['cols'] += array('seccion' => array('t', 'dosier'), 'miniatura' => array('t'), 'paginas' => array('i'),
        'duracion' => array('i'), 'destacado' => array('i', 0), 'nivel' => array('t', ''), 'etiquetas' => array('t', ''),
        'ruta_formacion' => array('t', ''), 'orden' => array('i', 0), 'texto' => array('t'));
    $r['editar'] = function () {
        return labs_si(labs_puedo('recursos.subir'));
    };
    $r['antes_borrar'] = function ($v) {
        labs_papelera_recurso($v);
    };
    $r['editar_ok'] = function ($n) {
        return labs_puedo('recursos.subir');
    };
    $r['upd_cols'] = array('nombre', 'descripcion', 'categoria', 'seccion', 'miniatura', 'paginas', 'duracion', 'destacado', 'nivel', 'etiquetas', 'ruta_formacion', 'orden', 'texto', 'actualizado');
    $vieja = $r['valida'];
    $r['valida'] = function ($f) use ($vieja) {
        if (!labs_en($f['tipo'], labs_recursos_tipos())) {
            return 'Tipo de archivo no admitido en el centro de recursos.';
        }
        if (!labs_en($f['seccion'] ?? 'dosier', array('dosier', 'formacion'))) {
            return 'La sección debe ser «dosier» o «formacion».';
        }
        $m = $f['miniatura'] ?? null;
        if ($m !== null && $m !== '' && (strlen($m) > 300000 || !preg_match('#^data:image/(jpeg|webp|png);base64,[A-Za-z0-9+/=]+$#', $m))) {
            return 'La miniatura no es válida.';
        }
        if (!labs_largo($f['etiquetas'] ?? '', 0, 300) || !labs_largo($f['nivel'] ?? '', 0, 30)) {
            return 'Etiquetas o nivel demasiado largos.';
        }
        if (!labs_largo($f['ruta_formacion'] ?? '', 0, 60) || (int) ($f['orden'] ?? 0) < 0 || (int) ($f['orden'] ?? 0) > 999) {
            return 'La ruta de formación admite 60 caracteres y el paso va de 0 a 999.';
        }
        if (strlen((string) ($f['texto'] ?? '')) > 300000) {
            return 'El texto indexado es demasiado largo.';
        }
        // El resto de comprobaciones de siempre (salvo el tipo, que ya admite más).
        $f2 = $f;
        $f2['tipo'] = 'pdf';
        return call_user_func($vieja, $f2);
    };

    $T['recursos_progreso'] = array(
        'pk' => 'id', 'gen' => 'auto', 'ops' => array('select'),
        'cols' => array('id' => array('i'), 'recurso_id' => array('i'), 'usuario_id' => array('u'), 'avance' => array('i', 0),
            'posicion' => array('i', 0), 'completado' => array('s'), 'actualizado' => array('s', $AHORA)),
        'leer' => function () {
            return in_array(labs_mi_rol(), array('admin', 'manager'), true) ? '1=1' : 'usuario_id = ' . labs_uidq();
        },
    );
    // Cada fila del historial dice si fue una descarga o una vista.
    if (isset($T['recursos_descargas'])) {
        $T['recursos_descargas']['cols'] += array('accion' => array('t', 'descarga'));
        $crear = $T['recursos_descargas']['crear'];
        $T['recursos_descargas']['crear'] = function ($f) use ($crear) {
            return labs_en($f['accion'] ?? 'descarga', array('descarga', 'vista')) && call_user_func($crear, $f);
        };
    }
}

function labs_recursos_tipos()
{
    return array('pdf', 'pptx', 'mp4', 'webm', 'png', 'jpg', 'webp', 'docx', 'xlsx');
}

/* --- Firma de enlaces ------------------------------------------------------ */
function labs_firma_clave()
{
    return hash_hmac('sha256', 'labs-enlaces-firmados-v1', labs_clave_copias(), true);
}

function labs_b64u($s)
{
    return rtrim(strtr(base64_encode($s), '+/', '-_'), '=');
}

function labs_b64u_dec($s)
{
    return base64_decode(strtr($s, '-_', '+/') . str_repeat('=', (4 - strlen($s) % 4) % 4), true);
}

/** Crea el token de una ruta para la persona con sesión (comprueba antes el permiso). */
function labs_almacen_firma_token($ruta, $segundos)
{
    $u = labs_usuario(true);
    $ruta = labs_almacen_ruta($ruta);
    if (!labs_almacen_permiso($ruta, 'leer')) {
        throw new ErrorApi('No tienes permiso para ver este archivo.', 403, 'Unauthorized');
    }
    if (!labs_almacen_localiza($ruta)) {
        throw new ErrorApi('El archivo no está en el almacén.', 404, 'NoSuchKey');
    }
    $seg = max(60, min(LABS_FIRMA_DURA, (int) $segundos ?: LABS_FIRMA_DURA));
    $datos = labs_b64u(json_encode(array('r' => $ruta, 'u' => $u['id'], 'e' => time() + $seg)));
    return $datos . '.' . labs_b64u(hash_hmac('sha256', $datos, labs_firma_clave(), true));
}

function labs_almacen_url_firmada($ruta, $token)
{
    // Como Supabase: ruta relativa al API (el panel le pone delante la dirección del servidor).
    return '/storage/v1/object/sign/documentos/' . $ruta . '?token=' . $token;
}

/** POST /storage/v1/object/sign/documentos/<ruta>  ·  {expiresIn} → {signedURL} */
function labs_almacen_firmar($ruta, $b)
{
    $u = labs_usuario(true);
    if (labs_freno('firmas|' . $u['id'], 300, 600)) {
        throw new ErrorApi('Demasiados archivos abiertos seguidos. Espera unos minutos.', 429, 'FRENO');
    }
    $t = labs_almacen_firma_token($ruta, $b['expiresIn'] ?? 0);
    return array('signedURL' => labs_almacen_url_firmada($ruta, $t), 'token' => $t,
        'expira' => gmdate('c', time() + max(60, min(LABS_FIRMA_DURA, (int) ($b['expiresIn'] ?? 0) ?: LABS_FIRMA_DURA))));
}

/** GET /storage/v1/object/sign/documentos/<ruta>?token=… · sirve el archivo (con Range). */
function labs_almacen_servir_firmado($ruta, $token)
{
    $ruta = labs_almacen_ruta($ruta);
    $partes = explode('.', (string) $token);
    if (count($partes) !== 2) {
        throw new ErrorApi('Enlace no válido.', 400, 'InvalidSignature');
    }
    $esperada = labs_b64u(hash_hmac('sha256', $partes[0], labs_firma_clave(), true));
    if (!hash_equals($esperada, $partes[1])) {
        throw new ErrorApi('Enlace no válido.', 400, 'InvalidSignature');
    }
    $d = json_decode((string) labs_b64u_dec($partes[0]), true);
    if (!is_array($d) || ($d['r'] ?? '') !== $ruta || (int) ($d['e'] ?? 0) < time()) {
        throw new ErrorApi('El enlace ha caducado. Vuelve a abrir el archivo.', 400, 'InvalidSignature');
    }
    // La persona sigue existiendo y activa (una cuenta suspendida deja de poder ver).
    $p = labs_fila('SELECT estado FROM perfiles WHERE id = ?', array((string) ($d['u'] ?? '')));
    if (!$p || $p['estado'] !== 'Activo') {
        throw new ErrorApi('Enlace no válido.', 403, 'Unauthorized');
    }
    $fichero = labs_almacen_localiza($ruta);
    if (!$fichero) {
        throw new ErrorApi('El archivo no está en el almacén.', 404, 'NoSuchKey');
    }
    $tipos = labs_almacen_tipos();
    $ext = strtolower(pathinfo($ruta, PATHINFO_EXTENSION));
    $total = filesize($fichero);
    $ini = 0;
    $fin = $total - 1;
    $parcial = false;
    $rango = isset($_SERVER['HTTP_RANGE']) ? (string) $_SERVER['HTTP_RANGE'] : '';
    if ($rango !== '' && preg_match('/^bytes=(\d*)-(\d*)$/', trim($rango), $m) && ($m[1] !== '' || $m[2] !== '')) {
        if ($m[1] === '') {
            $ini = max(0, $total - (int) $m[2]);
        } else {
            $ini = (int) $m[1];
            $fin = $m[2] === '' ? $total - 1 : min((int) $m[2], $total - 1);
        }
        if ($ini > $fin || $ini >= $total) {
            labs_cabeceras_seguras();
            http_response_code(416);
            header('Content-Range: bytes */' . $total);
            exit;
        }
        $parcial = true;
    }
    labs_cabeceras_seguras();
    // Se puede guardar en la caché privada del navegador mientras dure el enlace.
    header('Cache-Control: private, max-age=3600');
    header_remove('Pragma');
    header('Content-Type: ' . (isset($tipos[$ext]) ? $tipos[$ext] : 'application/octet-stream'));
    header('Content-Disposition: inline; filename="' . basename($ruta) . '"');
    header('Accept-Ranges: bytes');
    if ($parcial) {
        http_response_code(206);
        header('Content-Range: bytes ' . $ini . '-' . $fin . '/' . $total);
    }
    header('Content-Length: ' . ($fin - $ini + 1));
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'HEAD') {
        exit;
    }
    $f = fopen($fichero, 'rb');
    fseek($f, $ini);
    $queda = $fin - $ini + 1;
    @set_time_limit(0);
    while ($queda > 0 && !feof($f) && !connection_aborted()) {
        $trozo = fread($f, (int) min(1048576, $queda));
        if ($trozo === false || $trozo === '') {
            break;
        }
        echo $trozo;
        $queda -= strlen($trozo);
        flush();
    }
    fclose($f);
    exit;
}

/* --- Formación: progreso y resumen ---------------------------------------- */
function labs_recursos($metodo, $sub, $b, $pares)
{
    $u = labs_usuario(true);
    if (!labs_puedo('recursos.ver')) {
        throw new ErrorApi('No tienes acceso al centro de recursos.', 403, '42501');
    }
    if ($sub === '/progreso' && $metodo === 'POST') {
        $id = (int) ($b['recurso_id'] ?? 0);
        if (!labs_fila('SELECT id FROM recursos WHERE id = ?', array($id))) {
            throw new ErrorApi('Ese recurso no existe.', 404, 'PGRST116');
        }
        $avance = max(0, min(100, (int) ($b['avance'] ?? 0)));
        $pos = max(0, min(100000000, (int) ($b['posicion'] ?? 0)));
        $ya = labs_fila('SELECT id, avance, completado FROM recursos_progreso WHERE recurso_id = ? AND usuario_id = ?', array($id, $u['id']));
        $completado = $avance >= 95 ? labs_ahora() : null;
        if ($ya) {
            // El avance no retrocede (volver a la página 1 no borra lo hecho), la posición sí.
            labs_q('UPDATE recursos_progreso SET avance = GREATEST(avance, ?), posicion = ?, completado = COALESCE(completado, ?), actualizado = ? WHERE id = ?',
                array($avance, $pos, $completado, labs_ahora(), $ya['id']));
        } else {
            labs_q('INSERT INTO recursos_progreso (recurso_id, usuario_id, avance, posicion, completado, actualizado) VALUES (?,?,?,?,?,?)',
                array($id, $u['id'], $avance, $pos, $completado, labs_ahora()));
        }
        $f = labs_fila('SELECT recurso_id, avance, posicion, completado, actualizado FROM recursos_progreso WHERE recurso_id = ? AND usuario_id = ?', array($id, $u['id']));
        return array(200, array('recurso_id' => (int) $f['recurso_id'], 'avance' => (int) $f['avance'], 'posicion' => (int) $f['posicion'],
            'completado' => $f['completado'], 'actualizado' => $f['actualizado']));
    }
    if ($sub === '/resumen' && $metodo === 'GET') {
        // Vistas, descargas y quién ha terminado cada formación (solo dirección).
        $todo = in_array(labs_mi_rol(), array('admin', 'manager'), true);
        $filas = labs_q('SELECT r.id, ' .
            "(SELECT COUNT(*) FROM recursos_descargas d WHERE d.recurso_id = r.id AND d.accion = 'vista') AS vistas, " .
            "(SELECT COUNT(*) FROM recursos_descargas d WHERE d.recurso_id = r.id AND d.accion = 'descarga') AS descargas, " .
            '(SELECT COUNT(*) FROM recursos_progreso p WHERE p.recurso_id = r.id AND p.completado IS NOT NULL) AS completados, ' .
            '(SELECT COUNT(*) FROM recursos_progreso p WHERE p.recurso_id = r.id) AS empezados FROM recursos r')->fetchAll();
        $mios = labs_q('SELECT recurso_id, avance, posicion, completado, actualizado FROM recursos_progreso WHERE usuario_id = ?', array($u['id']))->fetchAll();
        $out = array();
        foreach ($filas as $f) {
            $out[$f['id']] = $todo ? array('vistas' => (int) $f['vistas'], 'descargas' => (int) $f['descargas'],
                'completados' => (int) $f['completados'], 'empezados' => (int) $f['empezados'])
                : array('vistas' => (int) $f['vistas']);
        }
        $p = array();
        foreach ($mios as $m) {
            $p[$m['recurso_id']] = array('avance' => (int) $m['avance'], 'posicion' => (int) $m['posicion'],
                'completado' => $m['completado'], 'actualizado' => $m['actualizado']);
        }
        $equipo = labs_q("SELECT COUNT(*) FROM perfiles WHERE estado = 'Activo'")->fetchColumn();
        return array(200, array('recursos' => (object) $out, 'mio' => (object) $p, 'equipo' => (int) $equipo, 'direccion' => $todo));
    }
    throw new ErrorApi('Ruta no encontrada.', 404, 'PGRST000');
}

/* --- Documentos incluidos en el despliegue (api/semilla/) ----------------
 * api/semilla/recursos.php devuelve la lista (clave, archivo, nombre, sección,
 * categoría, nivel, descripción, ruta de formación, paso, destacado, portada,
 * páginas y texto). Cada documento entra una sola vez: si ya existe uno con
 * el mismo nombre (por ejemplo, traído del CRM anterior) se completa en vez
 * de duplicarlo. El archivo pasa al almacén privado y se borra de api/. */
function labs_semilla_recursos()
{
    $dir = __DIR__ . '/semilla';
    // La lista se acaba de subir con el zip: que PHP no use una copia anterior en caché.
    if (function_exists('opcache_invalidate')) {
        @opcache_invalidate($dir . '/recursos.php', true);
    }
    $lista = include $dir . '/recursos.php';
    if (!is_array($lista)) {
        $lista = array();
    }
    labs_q("SELECT GET_LOCK('labs_semilla', 20)");
    $raiz = labs_fila('SELECT id FROM perfiles WHERE raiz = 1 LIMIT 1');
    $ahora = labs_ahora();
    $hechos = 0;
    foreach ($lista as $d) {
        $clave = 'semilla.recurso.' . preg_replace('/[^a-z0-9._-]/', '', (string) ($d['clave'] ?? ''));
        $origen = $dir . '/' . basename((string) ($d['archivo'] ?? ''));
        if ($clave === 'semilla.recurso.' || labs_ajuste($clave)) {
            continue;
        }
        $meta = array('seccion' => $d['seccion'] ?? 'dosier', 'categoria' => $d['categoria'] ?? 'General', 'nivel' => $d['nivel'] ?? '',
            'descripcion' => $d['descripcion'] ?? '', 'ruta_formacion' => $d['ruta'] ?? '', 'orden' => (int) ($d['orden'] ?? 0),
            'destacado' => empty($d['destacado']) ? 0 : 1, 'miniatura' => $d['miniatura'] ?? null, 'paginas' => $d['paginas'] ?? null,
            'texto' => $d['texto'] ?? null, 'etiquetas' => $d['etiquetas'] ?? '');
        $ya = null;
        foreach (labs_q('SELECT id, nombre, ruta FROM recursos')->fetchAll() as $r) {
            if (labs_norma_texto($r['nombre']) === labs_norma_texto($d['nombre']) || in_array(labs_norma_texto($r['nombre']), (array) ($d['alias'] ?? array()), true)) {
                $ya = $r;
                break;
            }
        }
        if ($ya) {
            // Ya estaba (traído del CRM anterior): se completa con la ficha profesional, sin tocar su archivo.
            $cambios = array_merge($meta, array('nombre' => $d['nombre'], 'actualizado' => $ahora));
            $sets = array_map(function ($k) { return '`' . $k . '` = ?'; }, array_keys($cambios));
            labs_q('UPDATE recursos SET ' . implode(', ', $sets) . ' WHERE id = ?', array_merge(array_values($cambios), array($ya['id'])));
        } elseif (is_file($origen)) {
            $ruta = 'recursos/' . gmdate('YmdHis') . '-' . preg_replace('/[^A-Za-z0-9._-]/', '_', (string) ($d['nombre_archivo'] ?? basename($origen)));
            $destino = labs_almacen_fichero($ruta);
            if (!is_dir(dirname($destino)) && !@mkdir(dirname($destino), 0750, true)) {
                continue;
            }
            if (!@copy($origen, $destino)) {
                continue;
            }
            @chmod($destino, 0640);
            $cols = array_merge(array('nombre' => $d['nombre'], 'tipo' => 'pdf', 'ruta' => $ruta, 'tamano_bytes' => filesize($destino),
                'subido_por' => $raiz ? $raiz['id'] : null, 'creado' => $ahora, 'actualizado' => $ahora), $meta);
            labs_q('INSERT INTO recursos (`' . implode('`, `', array_keys($cols)) . '`) VALUES (' . implode(',', array_fill(0, count($cols), '?')) . ')', array_values($cols));
        } else {
            continue;
        }
        labs_pon_ajuste($clave, $ahora);
        $hechos++;
    }
    if ($hechos) {
        labs_anota('Documentos corporativos cargados', $hechos . ' documento(s) en el Centro de Recursos.', null, null);
    }
    // Fuera de la carpeta pública: lo que ya está cargado se borra, y también lo que
    // quede de un zip anterior que ya no está en la lista.
    $pendientes = array();
    foreach ($lista as $d) {
        $clave = 'semilla.recurso.' . preg_replace('/[^a-z0-9._-]/', '', (string) ($d['clave'] ?? ''));
        if (!labs_ajuste($clave)) {
            $pendientes[basename((string) ($d['archivo'] ?? ''))] = true;
        }
    }
    foreach (scandir($dir) ?: array() as $f) {
        if (!in_array($f, array('.', '..', '.htaccess', 'recursos.php', 'index.html'), true) && empty($pendientes[$f]) && is_file($dir . '/' . $f)) {
            @unlink($dir . '/' . $f);
        }
    }
    $quedan = array_diff(scandir($dir) ?: array(), array('.', '..', '.htaccess', 'recursos.php', 'index.html'));
    if (!$quedan) {
        @unlink($dir . '/recursos.php');
        @unlink($dir . '/.htaccess');
        @unlink($dir . '/index.html');
        @rmdir($dir);
    }
}
