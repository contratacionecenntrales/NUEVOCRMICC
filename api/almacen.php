<?php
/**
 * LABS COMMAND CENTER 360™ · Almacén de archivos (lo que hacía Supabase Storage)
 *
 * Los archivos se guardan en LABS_STORAGE_DIR/documentos/... y solo se sirven
 * a través de este script, comprobando los permisos de quien los pide.
 */
defined('LABS') || exit;

function labs_almacen_tipos()
{
    return array(
        'pdf' => 'application/pdf', 'png' => 'image/png', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg',
        'webp' => 'image/webp', 'csv' => 'text/csv', 'txt' => 'text/plain',
        'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'xlsx' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'pptx' => 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    );
}

/** Valida la ruta pedida: sin «..», sin rutas absolutas, solo caracteres seguros. */
function labs_almacen_ruta($ruta)
{
    $ruta = (string) $ruta;
    if ($ruta === '' || strlen($ruta) > 400 || !preg_match('#^[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)*$#', $ruta)
        || preg_match('#(^|/)\.{1,2}(/|$)#', $ruta)) {
        throw new ErrorApi('Ruta de archivo no válida.', 400, 'InvalidKey');
    }
    return $ruta;
}

function labs_almacen_fichero($ruta)
{
    return rtrim(LABS_STORAGE_DIR, '/') . '/documentos/' . $ruta;
}

/**
 * Dónde está de verdad un archivo. Si se subió antes de existir la carpeta
 * privada (en storage/ dentro de la web), se traslada allí la primera vez que
 * se pide, para que deje de estar en la carpeta pública.
 */
function labs_almacen_localiza($ruta)
{
    $nuevo = labs_almacen_fichero($ruta);
    if (is_file($nuevo)) {
        return $nuevo;
    }
    $viejo = rtrim(LABS_STORAGE_WEB, '/') . '/documentos/' . $ruta;
    if ($viejo !== $nuevo && is_file($viejo)) {
        $dir = dirname($nuevo);
        if ((is_dir($dir) || @mkdir($dir, 0750, true)) && @rename($viejo, $nuevo)) {
            return $nuevo;
        }
        return $viejo;
    }
    return null;
}

/** Comprueba que el contenido es de verdad del tipo que dice su extensión. */
function labs_almacen_contenido_ok($ext, $datos)
{
    $ini = substr($datos, 0, 16);
    switch ($ext) {
        case 'pdf':
            return strpos($ini, '%PDF-') === 0 || strpos(substr($datos, 0, 1024), '%PDF-') !== false;
        case 'png':
            return strpos($ini, "\x89PNG\r\n\x1a\n") === 0;
        case 'jpg':
        case 'jpeg':
            return strpos($ini, "\xFF\xD8\xFF") === 0;
        case 'webp':
            return strpos($ini, 'RIFF') === 0 && substr($ini, 8, 4) === 'WEBP';
        case 'docx':
        case 'xlsx':
        case 'pptx':
            return strpos($ini, "PK\x03\x04") === 0;
        case 'csv':
        case 'txt':
            // Texto: nada de código que un navegador pudiera ejecutar.
            return !preg_match('/<\s*(script|html|svg|iframe|object|embed|\?php)/i', substr($datos, 0, 65536));
    }
    return false;
}

/** ¿Puede el usuario hacer $accion (leer · subir · borrar) sobre esta ruta? */
function labs_almacen_permiso($ruta, $accion)
{
    $partes = explode('/', $ruta);
    if ($partes[0] === 'contactos') {
        $perm = array('leer' => 'contactos.ver', 'subir' => 'contactos.docs', 'borrar' => 'contactos.borrar');
        return labs_puedo($perm[$accion]) && isset($partes[1]) && ctype_digit($partes[1])
            && labs_contacto_visible_id((int) $partes[1]);
    }
    if ($partes[0] === 'recursos') {
        $perm = array('leer' => 'recursos.ver', 'subir' => 'recursos.subir', 'borrar' => 'recursos.borrar');
        return labs_puedo($perm[$accion]);
    }
    $perm = array('leer' => 'exp.ver', 'subir' => 'exp.docs', 'borrar' => 'exp.borrar');
    return labs_puedo($perm[$accion]);
}

function labs_almacen_subir($ruta)
{
    labs_usuario(true);
    $ruta = labs_almacen_ruta($ruta);
    if (!labs_almacen_permiso($ruta, 'subir')) {
        throw new ErrorApi('No tienes permiso para subir este archivo.', 403, 'Unauthorized');
    }
    $ext = strtolower(pathinfo($ruta, PATHINFO_EXTENSION));
    $tipos = labs_almacen_tipos();
    if (!isset($tipos[$ext])) {
        throw new ErrorApi('Ese tipo de archivo no está permitido.', 415, 'InvalidMimeType');
    }
    $declarado = isset($_SERVER['CONTENT_LENGTH']) ? (int) $_SERVER['CONTENT_LENGTH'] : 0;
    if ($declarado > LABS_MAX_ARCHIVO) {
        throw new ErrorApi('El archivo supera el tamaño máximo.', 413, 'EntityTooLarge');
    }
    $datos = file_get_contents('php://input', false, null, 0, LABS_MAX_ARCHIVO + 1);
    if ($datos === false || $datos === '') {
        throw new ErrorApi('El archivo ha llegado vacío. Si pesa mucho, revisa el límite de subida de PHP en el hosting.', 400, 'EmptyBody');
    }
    if (strlen($datos) > LABS_MAX_ARCHIVO) {
        throw new ErrorApi('El archivo supera el tamaño máximo.', 413, 'EntityTooLarge');
    }
    if (!labs_almacen_contenido_ok($ext, $datos)) {
        throw new ErrorApi('El contenido del archivo no corresponde a un .' . $ext . ' válido.', 415, 'InvalidMimeType');
    }
    $fichero = labs_almacen_fichero($ruta);
    $upsert = strtolower((string) labs_cabecera('x-upsert')) === 'true';
    if (is_file($fichero) && !$upsert) {
        throw new ErrorApi('Ya existe un archivo con ese nombre.', 409, 'Duplicate');
    }
    $dir = dirname($fichero);
    if (!is_dir($dir) && !@mkdir($dir, 0750, true)) {
        throw new ErrorApi('No se ha podido crear la carpeta del almacén. Revisa los permisos de ' . LABS_STORAGE_DIR, 500, 'StorageError');
    }
    if (@file_put_contents($fichero, $datos, LOCK_EX) === false) {
        throw new ErrorApi('No se ha podido guardar el archivo en el servidor.', 500, 'StorageError');
    }
    return array('Key' => 'documentos/' . $ruta, 'Id' => labs_uuid());
}

function labs_almacen_descargar($ruta)
{
    $u = labs_usuario(true);
    // Descargas masivas: señal típica de robo de datos con una cuenta robada.
    if (labs_freno('descargas100|' . $u['id'], 100, 600)) {
        labs_alerta('descarga_masiva', 'alta', 'Descargas bloqueadas: más de 100 documentos en 10 minutos',
            'La cuenta ' . ($u['email'] ?? $u['id']) . ' ha intentado descargar más de 100 documentos en 10 minutos desde ' . labs_ip() .
            '. Se han frenado las descargas. Si no es normal, suspende la cuenta y valora si es una brecha.', 'descarga100|' . $u['id'] . '|' . gmdate('Y-m-d-H'));
        throw new ErrorApi('Demasiadas descargas seguidas. Espera unos minutos.', 429, 'FRENO');
    }
    if (labs_freno('descargas30|' . $u['id'], 30, 600)) {
        labs_alerta('descarga_masiva', 'alta', 'Muchas descargas de documentos seguidas',
            'La cuenta ' . ($u['email'] ?? $u['id']) . ' ha descargado más de 30 documentos en 10 minutos desde ' . labs_ip() . '. Comprueba que es un uso normal.',
            'descarga30|' . $u['id'] . '|' . gmdate('Y-m-d-H'));
    }
    $ruta = labs_almacen_ruta($ruta);
    if (!labs_almacen_permiso($ruta, 'leer')) {
        throw new ErrorApi('No tienes permiso para descargar este archivo.', 403, 'Unauthorized');
    }
    $fichero = labs_almacen_localiza($ruta);
    if (!$fichero) {
        throw new ErrorApi('El archivo no está en el almacén.', 404, 'NoSuchKey');
    }
    $tipos = labs_almacen_tipos();
    $ext = strtolower(pathinfo($ruta, PATHINFO_EXTENSION));
    labs_cabeceras_seguras();
    header('Content-Type: ' . (isset($tipos[$ext]) ? $tipos[$ext] : 'application/octet-stream'));
    header('Content-Length: ' . filesize($fichero));
    header('Content-Disposition: attachment; filename="' . basename($ruta) . '"');
    header('Cache-Control: private, no-store');
    header('X-Content-Type-Options: nosniff');
    readfile($fichero);
    exit;
}

function labs_almacen_borrar($ruta)
{
    labs_usuario(true);
    $ruta = labs_almacen_ruta($ruta);
    if (!labs_almacen_permiso($ruta, 'borrar')) {
        throw new ErrorApi('No tienes permiso para borrar este archivo.', 403, 'Unauthorized');
    }
    labs_almacen_borra_archivo($ruta);
    return array('message' => 'Successfully deleted');
}

/** Borra el archivo físico (si existe). Lo usan también los registros al borrarse. */
function labs_almacen_borra_archivo($ruta)
{
    try {
        $ruta = labs_almacen_ruta($ruta);
    } catch (ErrorApi $e) {
        return;
    }
    foreach (array(labs_almacen_fichero($ruta), rtrim(LABS_STORAGE_WEB, '/') . '/documentos/' . $ruta) as $f) {
        if (is_file($f)) {
            @unlink($f);
        }
    }
}
