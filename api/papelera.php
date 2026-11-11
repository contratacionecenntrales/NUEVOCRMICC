<?php
/**
 * LABS COMMAND CENTER 360™ · Papelera (30 días)
 *
 * Lo que se borra desde el panel (contactos con todo su historial, documentos
 * de un contacto y recursos del Centro de Recursos) no desaparece en el acto:
 * se guarda una foto de sus datos y sus archivos pasan a documentos/papelera/.
 * Administración lo recupera con un clic durante 30 días; después se purga solo.
 * La supresión por derecho al olvido (RGPD) NO pasa por aquí: borra del todo.
 */
defined('LABS') || exit;

defined('LABS_PAPELERA_DIAS') || define('LABS_PAPELERA_DIAS', 30);

function labs_papelera_dir()
{
    return rtrim(LABS_STORAGE_DIR, '/') . '/documentos/papelera';
}

/** Mueve un archivo del almacén a la papelera; devuelve el nombre guardado o null. */
function labs_papelera_mueve($ruta, $pid)
{
    try {
        $ruta = labs_almacen_ruta($ruta);
    } catch (ErrorApi $e) {
        return null;
    }
    $f = labs_almacen_localiza($ruta);
    if (!$f) {
        return null;
    }
    $dir = labs_papelera_dir() . '/' . $pid;
    if (!is_dir($dir) && !@mkdir($dir, 0750, true)) {
        return null;
    }
    $nombre = substr(hash('sha256', $ruta), 0, 16) . '-' . basename($ruta);
    return @rename($f, $dir . '/' . $nombre) ? $nombre : null;
}

/** Guarda en la papelera. $archivos: rutas del almacén que se apartan. */
function labs_papelera_guarda($tipo, $ref_id, $titulo, $datos, $archivos)
{
    $ahora = labs_ahora();
    labs_q('INSERT INTO papelera (tipo, ref_id, titulo, datos, archivos, tamano, borrado_por, borrado, expira) VALUES (?,?,?,?,?,?,?,?,?)', array(
        $tipo, (int) $ref_id, mb_substr($titulo, 0, 200), json_encode($datos, JSON_UNESCAPED_UNICODE), '[]', 0, labs_uid(), $ahora,
        gmdate('Y-m-d H:i:s', time() + LABS_PAPELERA_DIAS * 86400)));
    $pid = (int) labs_db()->lastInsertId();
    $guardados = array();
    $tam = 0;
    foreach (array_unique($archivos) as $ruta) {
        $n = labs_papelera_mueve($ruta, $pid);
        if ($n) {
            $guardados[] = array('ruta' => $ruta, 'n' => $n);
            $tam += (int) @filesize(labs_papelera_dir() . '/' . $pid . '/' . $n);
        }
    }
    labs_q('UPDATE papelera SET archivos = ?, tamano = ? WHERE id = ?', array(json_encode($guardados), $tam, $pid));
    return $pid;
}

/** Filas de una tabla (todas sus columnas) para la foto. */
function labs_papelera_filas($sql, $params)
{
    return labs_q($sql, $params)->fetchAll(PDO::FETCH_ASSOC);
}

/** Archivos que hay en una carpeta del almacén (rutas relativas a documentos/). */
function labs_papelera_archivos_de($carpeta)
{
    $out = array();
    $base = rtrim(LABS_STORAGE_DIR, '/') . '/documentos/';
    foreach (array($base . $carpeta, rtrim(LABS_STORAGE_WEB, '/') . '/documentos/' . $carpeta) as $dir) {
        if (!is_dir($dir)) {
            continue;
        }
        $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS));
        foreach ($it as $a) {
            if ($a->isFile()) {
                $out[] = $carpeta . '/' . substr($a->getPathname(), strlen($dir) + 1);
            }
        }
    }
    return $out;
}

/* --- Ganchos de borrado (los engancha esquema.php) ------------------------ */
function labs_papelera_contacto($c)
{
    $id = (int) $c['id'];
    $datos = array(
        'contacto' => labs_fila('SELECT * FROM contactos WHERE id = ?', array($id)),
        'eventos' => labs_papelera_filas('SELECT * FROM contacto_eventos WHERE contacto_id = ?', array($id)),
        'comentarios' => labs_papelera_filas('SELECT * FROM contacto_comentarios WHERE contacto_id = ?', array($id)),
        'documentos' => labs_papelera_filas('SELECT * FROM contacto_documentos WHERE contacto_id = ?', array($id)),
        'ia_config' => labs_tabla_existe('ia_config') ? labs_papelera_filas('SELECT * FROM ia_config WHERE contacto_id = ?', array($id)) : array(),
        'pipeline' => labs_tabla_existe('pipeline_movimientos') ? labs_papelera_filas('SELECT * FROM pipeline_movimientos WHERE contacto_id = ?', array($id)) : array(),
        'llamadas' => labs_tabla_existe('llamadas') ? labs_papelera_filas('SELECT * FROM llamadas WHERE contacto_id = ?', array($id)) : array(),
        'citas' => labs_tabla_existe('citas') ? labs_q('SELECT id FROM citas WHERE contacto_id = ?', array($id))->fetchAll(PDO::FETCH_COLUMN) : array(),
        'contratos' => labs_q('SELECT id FROM contratos WHERE contacto_id = ?', array($id))->fetchAll(PDO::FETCH_COLUMN),
    );
    $rutas = labs_papelera_archivos_de('contactos/' . $id);
    foreach ($datos['documentos'] as $d) {
        $rutas[] = $d['ruta'];
    }
    labs_papelera_guarda('contacto', $id, $c['nombre'] . ($c['empresa'] !== '' ? ' · ' . $c['empresa'] : ''), $datos, $rutas);
}

function labs_papelera_documento($d)
{
    $c = labs_fila('SELECT nombre FROM contactos WHERE id = ?', array((int) $d['contacto_id']));
    labs_papelera_guarda('documento', (int) $d['id'], $d['nombre'] . ($c ? ' · ' . $c['nombre'] : ''),
        array('documento' => labs_fila('SELECT * FROM contacto_documentos WHERE id = ?', array((int) $d['id']))), array($d['ruta']));
}

function labs_papelera_recurso($r)
{
    $id = (int) $r['id'];
    labs_papelera_guarda('recurso', $id, $r['nombre'], array(
        'recurso' => labs_fila('SELECT * FROM recursos WHERE id = ?', array($id)),
        'progreso' => labs_tabla_existe('recursos_progreso') ? labs_papelera_filas('SELECT * FROM recursos_progreso WHERE recurso_id = ?', array($id)) : array(),
    ), array($r['ruta']));
}

function labs_tabla_existe($t)
{
    static $cache = array();
    if (!isset($cache[$t])) {
        $cache[$t] = (bool) labs_fila('SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?', array($t));
    }
    return $cache[$t];
}

/* --- Restaurar ------------------------------------------------------------- */
/** Inserta una fila con sus columnas originales (solo las que existen hoy en la tabla). */
function labs_papelera_inserta($tabla, $fila)
{
    if (!$fila) {
        return;
    }
    $cols = labs_q('SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ?', array($tabla))->fetchAll(PDO::FETCH_COLUMN);
    $f = array_intersect_key($fila, array_flip($cols));
    labs_q('INSERT INTO `' . $tabla . '` (`' . implode('`, `', array_keys($f)) . '`) VALUES (' . implode(',', array_fill(0, count($f), '?')) . ')', array_values($f));
}

function labs_papelera_devuelve_archivos($p)
{
    foreach (json_decode($p['archivos'], true) ?: array() as $a) {
        $origen = labs_papelera_dir() . '/' . (int) $p['id'] . '/' . basename($a['n']);
        if (!is_file($origen)) {
            continue;
        }
        $destino = labs_almacen_fichero(labs_almacen_ruta($a['ruta']));
        if (!is_dir(dirname($destino))) {
            @mkdir(dirname($destino), 0750, true);
        }
        @rename($origen, $destino);
    }
    @rmdir(labs_papelera_dir() . '/' . (int) $p['id']);
}

function labs_papelera_restaura($p)
{
    $d = json_decode($p['datos'], true) ?: array();
    if ($p['tipo'] === 'contacto') {
        $c = $d['contacto'] ?? null;
        if (!$c) {
            throw new ErrorApi('La copia de este contacto está incompleta.', 400, 'PAPELERA');
        }
        if (labs_fila('SELECT 1 FROM contactos WHERE id = ?', array($c['id']))) {
            throw new ErrorApi('Ya existe un contacto con ese número: no se puede restaurar encima.', 409, 'PAPELERA');
        }
        labs_papelera_inserta('contactos', $c);
        foreach (array('eventos' => 'contacto_eventos', 'comentarios' => 'contacto_comentarios', 'documentos' => 'contacto_documentos',
                     'ia_config' => 'ia_config', 'pipeline' => 'pipeline_movimientos', 'llamadas' => 'llamadas') as $k => $t) {
            foreach (($d[$k] ?? array()) as $f) {
                if (labs_tabla_existe($t)) {
                    labs_papelera_inserta($t, $f);
                }
            }
        }
        foreach (($d['citas'] ?? array()) as $cid) {
            labs_q('UPDATE citas SET contacto_id = ? WHERE id = ? AND contacto_id IS NULL', array($c['id'], (int) $cid));
        }
        foreach (($d['contratos'] ?? array()) as $kid) {
            labs_q('UPDATE contratos SET contacto_id = ? WHERE id = ? AND contacto_id IS NULL', array($c['id'], (int) $kid));
        }
        labs_q('INSERT INTO contacto_eventos (contacto_id, autor_id, tipo, texto, ts) VALUES (?,?,?,?,?)',
            array($c['id'], labs_uid(), 'evento', 'Contacto restaurado desde la papelera.', labs_ahora()));
    } elseif ($p['tipo'] === 'documento') {
        $doc = $d['documento'] ?? null;
        if (!$doc || !labs_fila('SELECT 1 FROM contactos WHERE id = ?', array($doc['contacto_id']))) {
            throw new ErrorApi('El contacto de este documento ya no existe: restaura antes el contacto.', 409, 'PAPELERA');
        }
        labs_papelera_inserta('contacto_documentos', $doc);
    } elseif ($p['tipo'] === 'recurso') {
        $r = $d['recurso'] ?? null;
        if (!$r || labs_fila('SELECT 1 FROM recursos WHERE id = ?', array($r['id']))) {
            throw new ErrorApi('Ese recurso ya existe o la copia está incompleta.', 409, 'PAPELERA');
        }
        labs_papelera_inserta('recursos', $r);
        foreach (($d['progreso'] ?? array()) as $f) {
            if (labs_fila('SELECT 1 FROM perfiles WHERE id = ?', array($f['usuario_id']))) {
                labs_papelera_inserta('recursos_progreso', $f);
            }
        }
    } else {
        throw new ErrorApi('Tipo desconocido.', 400, 'PAPELERA');
    }
    labs_papelera_devuelve_archivos($p);
    labs_q('DELETE FROM papelera WHERE id = ?', array($p['id']));
    labs_anota('Restaurado de la papelera', ucfirst($p['tipo']) . ' «' . $p['titulo'] . '»');
}

function labs_papelera_elimina($p)
{
    foreach (json_decode($p['archivos'], true) ?: array() as $a) {
        @unlink(labs_papelera_dir() . '/' . (int) $p['id'] . '/' . basename($a['n']));
    }
    @rmdir(labs_papelera_dir() . '/' . (int) $p['id']);
    labs_q('DELETE FROM papelera WHERE id = ?', array($p['id']));
}

/** Purga lo caducado (lo llama el mantenimiento diario). */
function labs_papelera_purga()
{
    if (!labs_tabla_existe('papelera')) {
        return 0;
    }
    $n = 0;
    foreach (labs_q('SELECT * FROM papelera WHERE expira < ?', array(labs_ahora()))->fetchAll() as $p) {
        labs_papelera_elimina($p);
        $n++;
    }
    return $n;
}

/** Derecho al olvido: lo de esa persona que siga en la papelera también se borra. */
function labs_papelera_olvida_contacto($id, $email, $telefono)
{
    if (!labs_tabla_existe('papelera')) {
        return;
    }
    foreach (labs_q("SELECT * FROM papelera WHERE (tipo = 'contacto' AND ref_id = ?) OR (tipo = 'documento' AND datos LIKE ?)",
        array((int) $id, '%"contacto_id":"' . (int) $id . '"%'))->fetchAll() as $p) {
        labs_papelera_elimina($p);
    }
    foreach (array($email, $telefono) as $dato) {
        if ((string) $dato !== '' && mb_strlen($dato) >= 6) {
            foreach (labs_q("SELECT * FROM papelera WHERE tipo = 'contacto' AND datos LIKE ?", array('%' . json_encode($dato) . '%'))->fetchAll() as $p) {
                labs_papelera_elimina($p);
            }
        }
    }
}

/* --- Rutas: /papelera ------------------------------------------------------ */
function labs_papelera($metodo, $sub)
{
    labs_usuario(true);
    $rol = labs_mi_rol();
    if (!in_array($rol, array('admin', 'manager'), true)) {
        throw new ErrorApi('La papelera es de administración y jefatura.', 403, '42501');
    }
    if ($sub === '' && $metodo === 'GET') {
        $filas = labs_q("SELECT p.id, p.tipo, p.titulo, p.tamano, p.borrado, p.expira, p.borrado_por,
                         TRIM(CONCAT(COALESCE(f.nombre, ''), ' ', COALESCE(f.apellidos, ''))) AS por
                         FROM papelera p LEFT JOIN perfiles f ON f.id = p.borrado_por ORDER BY p.borrado DESC LIMIT 500")->fetchAll();
        foreach ($filas as &$f) {
            $f['id'] = (int) $f['id'];
            $f['tamano'] = (int) $f['tamano'];
            $f['puede_restaurar'] = $rol === 'admin' || $f['tipo'] !== 'contacto';
        }
        return array(200, array('elementos' => $filas, 'dias' => LABS_PAPELERA_DIAS));
    }
    if (preg_match('#^/(\d+)(/restaurar)?$#', $sub, $m)) {
        $p = labs_fila('SELECT * FROM papelera WHERE id = ? FOR UPDATE', array((int) $m[1]));
        if (!$p) {
            throw new ErrorApi('Eso ya no está en la papelera.', 404, 'PGRST116');
        }
        if (!empty($m[2]) && $metodo === 'POST') {
            if ($p['tipo'] === 'contacto' && $rol !== 'admin') {
                throw new ErrorApi('Restaurar contactos es de administración.', 403, '42501');
            }
            labs_papelera_restaura($p);
            return array(200, array('restaurado' => true, 'tipo' => $p['tipo'], 'ref_id' => (int) $p['ref_id']));
        }
        if (empty($m[2]) && $metodo === 'DELETE') {
            if ($rol !== 'admin') {
                throw new ErrorApi('Vaciar la papelera es de administración.', 403, '42501');
            }
            labs_papelera_elimina($p);
            labs_anota('Eliminado de la papelera', ucfirst($p['tipo']) . ' «' . $p['titulo'] . '» borrado definitivamente.');
            return array(200, array('eliminado' => true));
        }
    }
    throw new ErrorApi('Ruta no encontrada.', 404, 'PGRST000');
}
