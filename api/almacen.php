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
    $datos = file_get_contents('php://input');
    if ($datos === false || $datos === '') {
        throw new ErrorApi('El archivo ha llegado vacío. Si pesa mucho, revisa el límite de subida de PHP en el hosting.', 400, 'EmptyBody');
    }
    if (strlen($datos) > LABS_MAX_ARCHIVO) {
        throw new ErrorApi('El archivo supera el tamaño máximo.', 413, 'EntityTooLarge');
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
    labs_usuario(true);
    $ruta = labs_almacen_ruta($ruta);
    if (!labs_almacen_permiso($ruta, 'leer')) {
        throw new ErrorApi('No tienes permiso para descargar este archivo.', 403, 'Unauthorized');
    }
    $fichero = labs_almacen_fichero($ruta);
    if (!is_file($fichero)) {
        throw new ErrorApi('El archivo no está en el almacén.', 404, 'NoSuchKey');
    }
    $tipos = labs_almacen_tipos();
    $ext = strtolower(pathinfo($ruta, PATHINFO_EXTENSION));
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
    $f = labs_almacen_fichero($ruta);
    if (is_file($f)) {
        @unlink($f);
    }
}
