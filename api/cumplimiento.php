<?php
/**
 * LABS COMMAND CENTER 360™ · Cumplimiento RGPD / LOPDGDD (servidor)
 *
 * - Copias de seguridad cifradas (AES-256-GCM), diarias y con restauración (art. 32.1.c RGPD).
 * - Registro de brechas con plazo de 72 h (arts. 33 y 34) y alertas automáticas.
 * - Derechos de las personas: búsqueda, exportación, supresión y bloqueo
 *   (arts. 15-22 RGPD, art. 32 LOPDGDD), con registro de solicitudes y su plazo de un mes.
 * - Plazos de conservación aplicados solos (art. 5.1.e).
 *
 * Rutas: api/index.php?ruta=/rgpd/... (solo administración; restaurar, solo la cuenta raíz).
 * Este módulo ayuda a cumplir; no sustituye el criterio de un asesor o DPO.
 */
defined('LABS') || exit;

/* ===========================================================================
   AJUSTES
   ========================================================================= */
function labs_ajuste($clave, $defecto = null)
{
    $f = labs_fila('SELECT valor FROM ajustes WHERE clave = ?', array($clave));
    return $f ? $f['valor'] : $defecto;
}

function labs_pon_ajuste($clave, $valor)
{
    labs_q('INSERT INTO ajustes (clave, valor) VALUES (?,?) ON DUPLICATE KEY UPDATE valor = VALUES(valor)', array($clave, (string) $valor));
}

function labs_rgpd_defectos()
{
    $raiz = labs_fila('SELECT email FROM perfiles WHERE raiz = 1 LIMIT 1');
    return array(
        'responsable_nombre' => 'GRUPO EVOLVIX GLOBAL, S.L.',
        'responsable_cif' => 'B21779673',
        'responsable_direccion' => 'Paseo de la Castellana, 95, planta 22, 28046 Madrid',
        'email_privacidad' => 'admin@labs24k.com',
        'dpo' => '',
        'email_alertas' => $raiz ? $raiz['email'] : LABS_RAIZ_EMAIL,
        'conservar_leads_meses' => '24',
        'conservar_accesos_dias' => '180',
        'copias_guardar' => '14',
        'copias_activas' => '1',
    );
}

function labs_rgpd_ajustes()
{
    $out = array();
    foreach (labs_rgpd_defectos() as $k => $def) {
        $out[$k] = labs_ajuste('rgpd.' . $k, $def);
    }
    return $out;
}

/* ===========================================================================
   ALERTAS
   ========================================================================= */
/**
 * Crea una alerta (una sola vez por $clave). Las graves se envían también por
 * correo al responsable. Devuelve el id o null si ya existía.
 */
function labs_alerta($tipo, $gravedad, $titulo, $detalle = '', $clave = null, $correo = null)
{
    try {
        $n = labs_q('INSERT IGNORE INTO alertas (ts, tipo, gravedad, titulo, detalle, clave) VALUES (?,?,?,?,?,?)',
            array(labs_ahora(), $tipo, $gravedad, mb_substr($titulo, 0, 200), (string) $detalle, $clave === null ? null : substr($clave, 0, 160)))->rowCount();
    } catch (PDOException $e) {
        return null;   // la tabla aún no existe (base sin actualizar): no se rompe nada
    }
    if (!$n) {
        return null;
    }
    $id = (int) labs_db()->lastInsertId();
    if ($correo === true || ($correo === null && in_array($gravedad, array('alta', 'critica'), true))) {
        labs_email_alerta('[' . strtoupper($gravedad) . '] ' . $titulo, $detalle);
    }
    return $id;
}

function labs_email_alerta($asunto, $texto)
{
    if (!function_exists('mail') || labs_freno('email-alertas', 12, 3600)) {
        return false;
    }
    $para = labs_ajuste('rgpd.email_alertas', null);
    if (!$para) {
        $d = labs_rgpd_defectos();
        $para = $d['email_alertas'];
    }
    if (!filter_var($para, FILTER_VALIDATE_EMAIL)) {
        return false;
    }
    $host = preg_replace('/[^a-z0-9.-]/i', '', isset($_SERVER['SERVER_NAME']) ? $_SERVER['SERVER_NAME'] : 'localhost');
    $cuerpo = $texto . "\n\n— Centro de Seguridad · Labs Command Center 360\n" . ($host ? 'https://' . $host . "/\n" : '');
    $cab = 'From: Labs24k CRM <no-reply@' . $host . ">\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit";
    return @mail($para, '=?UTF-8?B?' . base64_encode('Labs24k CRM · ' . $asunto) . '?=', $cuerpo, $cab);
}

/* ===========================================================================
   INCIDENTES (BRECHAS)
   ========================================================================= */
function labs_codigo_siguiente($tabla, $prefijo)
{
    $anio = date('Y');
    $f = labs_fila('SELECT COUNT(*) n FROM ' . $tabla . ' WHERE codigo LIKE ?', array($prefijo . '-' . $anio . '-%'));
    return $prefijo . '-' . $anio . '-' . str_pad((string) ((int) $f['n'] + 1), 3, '0', STR_PAD_LEFT);
}

function labs_incidente_crea($d, $origen = 'manual')
{
    $titulo = trim((string) ($d['titulo'] ?? ''));
    if (mb_strlen($titulo) < 4) {
        throw new ErrorApi('Ponle un título al incidente (mínimo 4 caracteres).', 400, 'P0001');
    }
    $u = labs_usuario();
    $detectado = !empty($d['detectado']) ? labs_entra('incidentes', 'detectado', 's', $d['detectado']) : labs_ahora();
    $codigo = labs_codigo_siguiente('incidentes', 'BR');
    labs_q('INSERT INTO incidentes (codigo, detectado, titulo, descripcion, origen, tipo, riesgo, estado, creado_por, creado, actualizado)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)', array(
        $codigo, $detectado, mb_substr($titulo, 0, 200), (string) ($d['descripcion'] ?? ''), $origen,
        labs_valor_lista($d['tipo'] ?? 'confidencialidad', array('confidencialidad', 'integridad', 'disponibilidad'), 'confidencialidad'),
        'pendiente', 'abierto', $u && empty($u['sin_ficha']) ? $u['id'] : null, labs_ahora(), labs_ahora()));
    $id = (int) labs_db()->lastInsertId();
    labs_anota('Brecha registrada', $codigo . ' · ' . $titulo . ' (plazo AEPD: 72 h desde la detección)', null, $u ?: null);
    return $id;
}

function labs_valor_lista($v, $lista, $defecto)
{
    return in_array($v, $lista, true) ? $v : $defecto;
}

function labs_incidente_actualiza($id, $d)
{
    $i = labs_fila('SELECT * FROM incidentes WHERE id = ? FOR UPDATE', array((int) $id));
    if (!$i) {
        throw new ErrorApi('Ese incidente no existe.', 404, 'NO_ENCONTRADO');
    }
    $sets = array();
    $vals = array();
    $txt = array('titulo' => 200, 'descripcion' => 20000, 'medio' => 60, 'categorias_datos' => 2000, 'categorias_interesados' => 2000,
        'consecuencias' => 20000, 'medidas' => 20000, 'registro_aepd' => 60, 'decision' => 20000);
    foreach ($txt as $k => $max) {
        if (array_key_exists($k, $d)) {
            $sets[] = $k . ' = ?';
            $vals[] = mb_substr((string) $d[$k], 0, $max);
        }
    }
    foreach (array('num_interesados', 'num_registros') as $k) {
        if (array_key_exists($k, $d)) {
            $sets[] = $k . ' = ?';
            $vals[] = ($d[$k] === '' || $d[$k] === null) ? null : max(0, (int) $d[$k]);
        }
    }
    $listas = array(
        'tipo' => array('confidencialidad', 'integridad', 'disponibilidad'),
        'riesgo' => array('pendiente', 'sin_riesgo', 'riesgo', 'alto'),
        'estado' => array('abierto', 'evaluando', 'notificado', 'cerrado'),
    );
    foreach ($listas as $k => $l) {
        if (array_key_exists($k, $d)) {
            $sets[] = $k . ' = ?';
            $vals[] = labs_valor_lista($d[$k], $l, $i[$k]);
        }
    }
    foreach (array('detectado', 'inicio', 'resuelto', 'notificado_aepd', 'comunicado_afectados') as $k) {
        if (array_key_exists($k, $d)) {
            $sets[] = $k . ' = ?';
            $vals[] = ($d[$k] === '' || $d[$k] === null) ? null : labs_entra('incidentes', $k, 's', $d[$k]);
        }
    }
    if (!$sets) {
        return;
    }
    $sets[] = 'actualizado = ?';
    $vals[] = labs_ahora();
    $vals[] = $i['id'];
    labs_q('UPDATE incidentes SET ' . implode(', ', $sets) . ' WHERE id = ?', $vals);
    $cambios = array_map(function ($s) {
        return trim(explode('=', $s)[0]);
    }, $sets);
    labs_anota('Brecha actualizada', $i['codigo'] . ' · ' . implode(', ', array_diff($cambios, array('actualizado'))));
}

function labs_incidentes_lista()
{
    $l = labs_q('SELECT * FROM incidentes ORDER BY (estado = \'cerrado\'), detectado DESC LIMIT 200')->fetchAll();
    foreach ($l as &$i) {
        foreach (array('detectado', 'inicio', 'resuelto', 'notificado_aepd', 'comunicado_afectados', 'creado', 'actualizado') as $k) {
            $i[$k] = labs_sale('s', $i[$k]);
        }
        $i['id'] = (int) $i['id'];
        $i['num_interesados'] = $i['num_interesados'] === null ? null : (int) $i['num_interesados'];
        $i['num_registros'] = $i['num_registros'] === null ? null : (int) $i['num_registros'];
    }
    return $l;
}

/* ===========================================================================
   COPIAS DE SEGURIDAD CIFRADAS
   Formato .labsbak: "LABSBAK1" + trozos [4 bytes longitud][12 iv][16 etiqueta][cifrado]
   con AES-256-GCM (cada trozo autenticado con su número de orden) y un trozo
   final vacío que impide cortar el archivo sin que se note.
   ========================================================================= */
function labs_dir_copias()
{
    $dir = LABS_DIR_PRIVADO !== '' ? LABS_DIR_PRIVADO . '/copias' : rtrim(LABS_STORAGE_WEB, '/') . '/copias';
    if (!is_dir($dir) && !@mkdir($dir, 0750, true)) {
        throw new ErrorApi('No se ha podido crear la carpeta de copias.', 500, 'COPIAS');
    }
    if (!is_file($dir . '/.htaccess')) {
        @file_put_contents($dir . '/.htaccess', "Require all denied\n");
    }
    return $dir;
}

function labs_clave_copias()
{
    if (LABS_DIR_PRIVADO !== '') {
        $f = LABS_DIR_PRIVADO . '/clave-copias.key';
        if (!is_file($f)) {
            if (!is_dir(LABS_DIR_PRIVADO)) {
                @mkdir(LABS_DIR_PRIVADO, 0750, true);
            }
            @file_put_contents($f, base64_encode(random_bytes(32)), LOCK_EX);
            @chmod($f, 0640);
        }
        $k = base64_decode(trim((string) @file_get_contents($f)), true);
    } else {
        $v = labs_ajuste('clave_copias');
        if (!$v) {
            $v = base64_encode(random_bytes(32));
            labs_pon_ajuste('clave_copias', $v);
        }
        $k = base64_decode($v, true);
    }
    if (!$k || strlen($k) !== 32) {
        throw new ErrorApi('La clave de las copias está dañada.', 500, 'COPIAS');
    }
    return $k;
}

function labs_cifra_archivo($origen, $destino, $clave)
{
    $in = fopen($origen, 'rb');
    $out = fopen($destino, 'wb');
    fwrite($out, 'LABSBAK1');
    $n = 0;
    while (true) {
        $trozo = fread($in, 1048576);
        $fin = ($trozo === '' || $trozo === false);
        $iv = random_bytes(12);
        $tag = '';
        $aad = 'LABSBAK1' . ($fin ? 'FIN' : 'TRZ') . pack('N', $n);
        $ct = openssl_encrypt($fin ? '' : $trozo, 'aes-256-gcm', $clave, OPENSSL_RAW_DATA, $iv, $tag, $aad);
        fwrite($out, pack('N', strlen($ct)) . $iv . $tag . $ct);
        $n++;
        if ($fin) {
            break;
        }
    }
    fclose($in);
    fclose($out);
}

function labs_descifra_archivo($origen, $destino, $clave)
{
    $in = fopen($origen, 'rb');
    if (fread($in, 8) !== 'LABSBAK1') {
        fclose($in);
        throw new ErrorApi('Ese archivo no es una copia de seguridad del CRM.', 400, 'COPIA_INVALIDA');
    }
    $out = fopen($destino, 'wb');
    $n = 0;
    $ok = false;
    while (!feof($in)) {
        $cab = fread($in, 4);
        if (strlen($cab) < 4) {
            break;
        }
        $len = unpack('N', $cab)[1];
        $iv = fread($in, 12);
        $tag = fread($in, 16);
        $ct = $len ? fread($in, $len) : '';
        $fin = $len === 0;
        $pt = openssl_decrypt($ct, 'aes-256-gcm', $clave, OPENSSL_RAW_DATA, $iv, $tag, 'LABSBAK1' . ($fin ? 'FIN' : 'TRZ') . pack('N', $n));
        if ($pt === false) {
            fclose($in);
            fclose($out);
            @unlink($destino);
            throw new ErrorApi('La copia está dañada o se cifró con otra clave.', 400, 'COPIA_INVALIDA');
        }
        if ($fin) {
            $ok = true;
            break;
        }
        fwrite($out, $pt);
        $n++;
    }
    fclose($in);
    fclose($out);
    if (!$ok) {
        @unlink($destino);
        throw new ErrorApi('La copia está incompleta (se cortó al copiarla).', 400, 'COPIA_INVALIDA');
    }
}

function labs_tablas_copia()
{
    $todas = array('cuentas', 'cuentas_2fa', 'roles_personalizados', 'perfiles', 'permisos_catalogo', 'bitacora', 'accesos_raiz',
        'sesiones', 'expedientes', 'expediente_log', 'expediente_docs', 'candidatos', 'presupuestos', 'agentes', 'agente_acciones',
        'contratos', 'firma_eventos', 'contactos', 'contacto_eventos', 'contacto_comentarios', 'contacto_documentos', 'recursos',
        'recursos_descargas', 'tickets', 'ticket_eventos', 'agente_fichas', 'agente_seguimiento', 'ajustes', 'registro_accesos',
        'bloqueos', 'incidentes', 'alertas', 'solicitudes_rgpd');
    $hay = labs_q('SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE()')->fetchAll(PDO::FETCH_COLUMN);
    return array_values(array_intersect($todas, $hay));
}

/** Volcado SQL completo de las tablas del CRM. */
function labs_volcado_sql($fichero)
{
    $db = labs_db();
    $f = fopen($fichero, 'wb');
    fwrite($f, "-- Copia de seguridad · Labs Command Center 360 · " . gmdate('Y-m-d H:i:s') . " UTC\n");
    fwrite($f, "SET NAMES utf8mb4;\nSET time_zone = '+00:00';\nSET FOREIGN_KEY_CHECKS = 0;\n");
    foreach (labs_tablas_copia() as $t) {
        $crear = $db->query('SHOW CREATE TABLE `' . $t . '`')->fetch(PDO::FETCH_NUM);
        fwrite($f, "DROP TABLE IF EXISTS `" . $t . "`;\n" . str_replace(";\n", ";", $crear[1]) . ";\n");
        $st = $db->query('SELECT * FROM `' . $t . '`', PDO::FETCH_ASSOC);
        $lote = array();
        $cols = null;
        while ($r = $st->fetch()) {
            if ($cols === null) {
                $cols = '`' . implode('`,`', array_keys($r)) . '`';
            }
            $vals = array();
            foreach ($r as $v) {
                $vals[] = $v === null ? 'NULL' : $db->quote((string) $v);
            }
            $lote[] = '(' . implode(',', $vals) . ')';
            if (count($lote) >= 200) {
                fwrite($f, 'INSERT INTO `' . $t . '` (' . $cols . ') VALUES ' . implode(",", $lote) . ";\n");
                $lote = array();
            }
        }
        if ($lote) {
            fwrite($f, 'INSERT INTO `' . $t . '` (' . $cols . ') VALUES ' . implode(",", $lote) . ";\n");
        }
    }
    fwrite($f, "SET FOREIGN_KEY_CHECKS = 1;\n");
    fclose($f);
}

function labs_copia_crea($motivo = 'manual')
{
    if (!class_exists('ZipArchive') || !function_exists('openssl_encrypt')) {
        throw new ErrorApi('El hosting no tiene las extensiones zip y openssl de PHP: actívalas en Hostalia → Configuración de PHP.', 500, 'COPIAS');
    }
    @set_time_limit(300);
    $dir = labs_dir_copias();
    $sello = gmdate('Ymd-His');
    $sql = $dir . '/.tmp-' . $sello . '.sql';
    $zip = $dir . '/.tmp-' . $sello . '.zip';
    labs_volcado_sql($sql);
    $z = new ZipArchive();
    if ($z->open($zip, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
        @unlink($sql);
        throw new ErrorApi('No se ha podido preparar la copia.', 500, 'COPIAS');
    }
    $z->addFile($sql, 'base-de-datos.sql');
    $docs = 0;
    foreach (array_unique(array(rtrim(LABS_STORAGE_DIR, '/') . '/documentos', rtrim(LABS_STORAGE_WEB, '/') . '/documentos')) as $base) {
        if (!is_dir($base)) {
            continue;
        }
        $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($base, FilesystemIterator::SKIP_DOTS));
        foreach ($it as $a) {
            if ($a->isFile()) {
                $rel = 'documentos/' . substr($a->getPathname(), strlen($base) + 1);
                if ($z->locateName($rel) === false) {
                    $z->addFile($a->getPathname(), $rel);
                    $docs++;
                }
            }
        }
    }
    $z->addFromString('LEEME.txt', "Copia de seguridad de Labs Command Center 360.\nCreada: " . gmdate('Y-m-d H:i:s') .
        " UTC\nMotivo: " . $motivo . "\nContiene la base de datos y " . $docs . " documento(s).\n");
    $z->close();
    @unlink($sql);
    $nombre = 'copia-' . $sello . ($motivo === 'automatica' ? '-auto' : ($motivo === 'antes-de-restaurar' ? '-previa' : '')) . '.labsbak';
    labs_cifra_archivo($zip, $dir . '/' . $nombre, labs_clave_copias());
    @unlink($zip);
    @chmod($dir . '/' . $nombre, 0640);
    // Se guardan las N más recientes.
    $max = max(3, (int) labs_ajuste('rgpd.copias_guardar', '14'));
    $l = labs_copias_lista();
    foreach (array_slice($l, $max) as $vieja) {
        @unlink($dir . '/' . $vieja['nombre']);
    }
    labs_pon_ajuste('copia_ultima', labs_ahora());
    return array('nombre' => $nombre, 'documentos' => $docs, 'tamano' => filesize($dir . '/' . $nombre));
}

function labs_copias_lista()
{
    $dir = labs_dir_copias();
    $l = array();
    foreach (glob($dir . '/*.labsbak') ?: array() as $f) {
        $l[] = array('nombre' => basename($f), 'tamano' => filesize($f), 'creado' => gmdate('Y-m-d\TH:i:s\Z', filemtime($f)));
    }
    usort($l, function ($a, $b) {
        return strcmp($b['creado'] . $b['nombre'], $a['creado'] . $a['nombre']);
    });
    return $l;
}

function labs_copia_ruta($nombre)
{
    $nombre = basename((string) $nombre);
    if (!preg_match('/^[A-Za-z0-9._-]+\.labsbak$/', $nombre) || !is_file(labs_dir_copias() . '/' . $nombre)) {
        throw new ErrorApi('Esa copia no existe.', 404, 'NO_ENCONTRADO');
    }
    return labs_dir_copias() . '/' . $nombre;
}

/** Restaura una copia: base de datos y documentos. Antes hace una copia de lo actual. */
function labs_copia_restaura($nombre)
{
    @set_time_limit(600);
    $ruta = labs_copia_ruta($nombre);
    $dir = labs_dir_copias();
    $zip = $dir . '/.tmp-restaurar-' . gmdate('Ymd-His') . '.zip';
    labs_descifra_archivo($ruta, $zip, labs_clave_copias());
    $z = new ZipArchive();
    if ($z->open($zip) !== true || $z->locateName('base-de-datos.sql') === false) {
        @unlink($zip);
        throw new ErrorApi('La copia no contiene la base de datos.', 400, 'COPIA_INVALIDA');
    }
    $previa = labs_copia_crea('antes-de-restaurar');
    $db = labs_db();
    if ($db->inTransaction()) {
        $db->commit();
    }
    $sql = $z->getFromName('base-de-datos.sql');
    $db->exec('SET FOREIGN_KEY_CHECKS = 0');
    $sentencias = 0;
    foreach (explode(";\n", $sql) as $s) {
        $s = trim($s);
        if ($s === '' || strpos($s, '--') === 0) {
            continue;
        }
        $db->exec($s);
        $sentencias++;
    }
    $db->exec('SET FOREIGN_KEY_CHECKS = 1');
    // Documentos: se sustituyen por los de la copia (sin salirse de la carpeta).
    $base = rtrim(LABS_STORAGE_DIR, '/') . '/documentos';
    if (is_dir($base)) {
        labs_borra_arbol($base);
    }
    $docs = 0;
    for ($i = 0; $i < $z->numFiles; $i++) {
        $n = $z->getNameIndex($i);
        if (strpos($n, 'documentos/') !== 0 || substr($n, -1) === '/') {
            continue;
        }
        $rel = substr($n, strlen('documentos/'));
        if (!preg_match('#^[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)*$#', $rel) || preg_match('#(^|/)\.{1,2}(/|$)#', $rel)) {
            continue;   // nombre sospechoso (zip slip): se ignora
        }
        $dest = $base . '/' . $rel;
        if (!is_dir(dirname($dest))) {
            @mkdir(dirname($dest), 0750, true);
        }
        file_put_contents($dest, $z->getFromIndex($i));
        $docs++;
    }
    $z->close();
    @unlink($zip);
    // Todas las sesiones fuera: la base ya no es la de antes.
    $db->exec('DELETE FROM tokens_sesion');
    $db->beginTransaction();
    labs_anota('Copia de seguridad restaurada', basename($ruta) . ' · ' . $docs . ' documento(s). Copia previa: ' . $previa['nombre']);
    labs_alerta('restauracion', 'media', 'Se ha restaurado una copia de seguridad', 'Copia ' . basename($ruta) . '. Se ha guardado antes una copia del estado anterior (' . $previa['nombre'] . ').', null, true);
    return array('ok' => true, 'sentencias' => $sentencias, 'documentos' => $docs, 'previa' => $previa['nombre']);
}

/* ===========================================================================
   DERECHOS DE LAS PERSONAS
   ========================================================================= */
function labs_rgpd_busca($q)
{
    $q = trim((string) $q);
    if (mb_strlen($q) < 3) {
        throw new ErrorApi('Escribe al menos 3 letras (nombre, correo, teléfono o DNI).', 400, 'P0001');
    }
    $like = '%' . str_replace(array('\\', '%', '_'), array('\\\\', '\\%', '\\_'), $q) . '%';
    $out = array();
    foreach (labs_q('SELECT id, nombre, empresa, email, telefono, tipo, estado FROM contactos
                     WHERE nombre LIKE ? OR empresa LIKE ? OR email LIKE ? OR telefono LIKE ? LIMIT 50', array($like, $like, $like, $like))->fetchAll() as $r) {
        $out[] = array('tipo' => 'contacto', 'id' => (int) $r['id'], 'titulo' => $r['nombre'] . ($r['empresa'] ? ' · ' . $r['empresa'] : ''),
            'detalle' => trim(($r['email'] ?: '') . ' ' . ($r['telefono'] ?: '')) . ' · ' . $r['tipo'] . ' (' . $r['estado'] . ')');
    }
    foreach (labs_q('SELECT id, codigo, cliente, email, representante, firma_nombre, firma_dni, estado, bloqueado FROM contratos
                     WHERE cliente LIKE ? OR email LIKE ? OR telefono LIKE ? OR representante LIKE ? OR firma_nombre LIKE ? OR firma_dni LIKE ? OR cif LIKE ? LIMIT 50',
                     array($like, $like, $like, $like, $like, $like, $like))->fetchAll() as $r) {
        $out[] = array('tipo' => 'contrato', 'id' => (int) $r['id'], 'titulo' => $r['codigo'] . ' · ' . $r['cliente'],
            'detalle' => trim(($r['firma_nombre'] ?: $r['representante']) . ' ' . ($r['firma_dni'] ?: '') . ' ' . $r['email']) . ' · ' . $r['estado'] .
                ((int) $r['bloqueado'] ? ' · BLOQUEADO' : ''), 'bloqueado' => (bool) (int) $r['bloqueado']);
    }
    foreach (labs_q('SELECT id, nombre, email, telefono, fase FROM candidatos WHERE nombre LIKE ? OR email LIKE ? OR telefono LIKE ? LIMIT 50',
                     array($like, $like, $like))->fetchAll() as $r) {
        $out[] = array('tipo' => 'candidato', 'id' => (int) $r['id'], 'titulo' => $r['nombre'], 'detalle' => trim($r['email'] . ' ' . $r['telefono']) . ' · ' . $r['fase']);
    }
    foreach (labs_q('SELECT id, nombre, apellidos, email, rol, estado FROM perfiles WHERE nombre LIKE ? OR apellidos LIKE ? OR email LIKE ? OR telefono LIKE ? LIMIT 50',
                     array($like, $like, $like, $like))->fetchAll() as $r) {
        $out[] = array('tipo' => 'usuario', 'id' => $r['id'], 'titulo' => trim($r['nombre'] . ' ' . $r['apellidos']),
            'detalle' => $r['email'] . ' · cuenta del CRM (' . $r['rol'] . ', ' . $r['estado'] . ')');
    }
    return $out;
}

/** Reúne todos los datos de una persona para entregárselos (acceso / portabilidad). */
function labs_rgpd_datos($items)
{
    $datos = array();
    $docs = array();
    foreach ($items as $it) {
        list($tipo, $id) = array_pad(explode(':', (string) $it, 2), 2, '');
        if ($tipo === 'contacto') {
            $c = labs_fila('SELECT * FROM contactos WHERE id = ?', array((int) $id));
            if (!$c) {
                continue;
            }
            $c['seguimiento'] = labs_q('SELECT tipo, texto, ts FROM contacto_eventos WHERE contacto_id = ? ORDER BY ts', array($c['id']))->fetchAll();
            $c['comentarios'] = labs_q('SELECT texto, ts FROM contacto_comentarios WHERE contacto_id = ? ORDER BY ts', array($c['id']))->fetchAll();
            $c['documentos'] = labs_q('SELECT nombre, tipo, ruta, tamano_bytes, ts FROM contacto_documentos WHERE contacto_id = ?', array($c['id']))->fetchAll();
            foreach ($c['documentos'] as $d) {
                $docs[] = $d['ruta'];
            }
            unset($c['gestor_id']);
            $datos['contactos'][] = $c;
        } elseif ($tipo === 'contrato') {
            $c = labs_fila('SELECT codigo, cliente, cif, domicilio, representante, email, telefono, servicio, setup, mensual, meses, iva, inicio,
                                   estado, firmado_ts, firma_nombre, firma_dni, firma_ip, firma_ua, firma_huella, datos_contrato, creado
                            FROM contratos WHERE id = ?', array((int) $id));
            if (!$c) {
                continue;
            }
            $c['datos_contrato'] = json_decode((string) $c['datos_contrato'], true);
            $c['eventos_firma'] = labs_q('SELECT evento, ts, ip, ua, detalle FROM firma_eventos WHERE contrato_id = ? ORDER BY ts', array((int) $id))->fetchAll();
            $datos['contratos'][] = $c;
        } elseif ($tipo === 'candidato') {
            $c = labs_fila('SELECT nombre, puesto, email, telefono, fase, nota, origen, creado, actualizado FROM candidatos WHERE id = ?', array((int) $id));
            if ($c) {
                $datos['candidaturas'][] = $c;
            }
        } elseif ($tipo === 'usuario') {
            $c = labs_fila('SELECT nombre, apellidos, email, prefijo, telefono, extension, rol, estado, empresa, cif, alta, ultimo_acceso, creado FROM perfiles WHERE id = ?', array((string) $id));
            if ($c) {
                $c['accesos'] = labs_q('SELECT ts, ip, agente, resultado FROM registro_accesos WHERE usuario_id = ? ORDER BY ts DESC LIMIT 500', array((string) $id))->fetchAll();
                $datos['cuenta_crm'][] = $c;
            }
        }
    }
    return array($datos, $docs);
}

function labs_rgpd_exporta($items)
{
    if (!class_exists('ZipArchive')) {
        throw new ErrorApi('El hosting no tiene la extensión zip de PHP.', 500, 'ZIP');
    }
    list($datos, $docs) = labs_rgpd_datos($items);
    if (!$datos) {
        throw new ErrorApi('No hay datos que exportar con esa selección.', 404, 'NO_ENCONTRADO');
    }
    $aj = labs_rgpd_ajustes();
    $tmp = labs_dir_copias() . '/.tmp-export-' . bin2hex(random_bytes(6)) . '.zip';
    $z = new ZipArchive();
    $z->open($tmp, ZipArchive::CREATE | ZipArchive::OVERWRITE);
    $z->addFromString('datos.json', json_encode(array(
        'responsable' => $aj['responsable_nombre'] . ' (' . $aj['responsable_cif'] . ')',
        'generado' => gmdate('Y-m-d\TH:i:s\Z'),
        'base_legal' => 'Derecho de acceso (art. 15 RGPD) y de portabilidad (art. 20 RGPD).',
        'datos' => $datos,
    ), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    $h = function ($s) {
        return htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8');
    };
    $html = '<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Tus datos personales</title>' .
        '<style>body{font-family:Arial,sans-serif;max-width:900px;margin:30px auto;padding:0 16px;color:#111}h1{font-size:22px}' .
        'h2{font-size:17px;margin-top:28px;border-bottom:1px solid #ccc;padding-bottom:4px}table{border-collapse:collapse;width:100%;font-size:13px}' .
        'td,th{border:1px solid #ddd;padding:6px;text-align:left;vertical-align:top}th{background:#f4f4f4;width:220px}</style></head><body>' .
        '<h1>Copia de tus datos personales</h1><p>Responsable del tratamiento: <strong>' . $h($aj['responsable_nombre']) . '</strong> (CIF ' .
        $h($aj['responsable_cif']) . '), ' . $h($aj['responsable_direccion']) . '. Contacto: ' . $h($aj['email_privacidad']) . '.</p>' .
        '<p>Generado el ' . gmdate('d/m/Y H:i') . ' (UTC) en respuesta a tu solicitud de acceso. El archivo <em>datos.json</em> contiene lo mismo en formato estructurado (portabilidad).</p>';
    $pinta = function ($fila) use (&$pinta, $h) {
        $t = '<table>';
        foreach ($fila as $k => $v) {
            $t .= '<tr><th>' . $h($k) . '</th><td>' . (is_array($v) ? ($v ? implode('', array_map(function ($x) use ($pinta) {
                return is_array($x) ? $pinta($x) : htmlspecialchars((string) $x, ENT_QUOTES, 'UTF-8');
            }, $v)) : '—') : $h($v === null ? '—' : $v)) . '</td></tr>';
        }
        return $t . '</table>';
    };
    foreach ($datos as $grupo => $filas) {
        $html .= '<h2>' . $h(ucfirst(str_replace('_', ' ', $grupo))) . '</h2>';
        foreach ($filas as $f) {
            $html .= $pinta($f) . '<br>';
        }
    }
    $z->addFromString('informe.html', $html . '</body></html>');
    foreach ($docs as $ruta) {
        $f = labs_almacen_localiza($ruta);
        if ($f) {
            $z->addFile($f, 'documentos/' . basename($ruta));
        }
    }
    $z->close();
    labs_anota('Datos personales exportados (RGPD)', 'Selección: ' . implode(', ', $items));
    return $tmp;
}

function labs_rgpd_suprime($tipo, $id)
{
    if ($tipo === 'contacto') {
        $c = labs_fila('SELECT id, nombre FROM contactos WHERE id = ?', array((int) $id));
        if (!$c) {
            throw new ErrorApi('Ese contacto ya no existe.', 404, 'NO_ENCONTRADO');
        }
        foreach (labs_q('SELECT ruta FROM contacto_documentos WHERE contacto_id = ?', array($c['id']))->fetchAll(PDO::FETCH_COLUMN) as $r) {
            labs_almacen_borra_archivo($r);
        }
        labs_q('DELETE FROM contactos WHERE id = ?', array($c['id']));
        labs_anota('Datos suprimidos (RGPD)', 'Contacto #' . $c['id'] . ' eliminado con su historial, comentarios y documentos.');
        return 'Contacto eliminado con todo su historial y documentos.';
    }
    if ($tipo === 'candidato') {
        $n = labs_q('DELETE FROM candidatos WHERE id = ?', array((int) $id))->rowCount();
        if (!$n) {
            throw new ErrorApi('Ese candidato ya no existe.', 404, 'NO_ENCONTRADO');
        }
        labs_anota('Datos suprimidos (RGPD)', 'Candidatura #' . (int) $id . ' eliminada.');
        return 'Candidatura eliminada.';
    }
    if ($tipo === 'contrato') {
        // Los contratos se conservan por obligación legal (mercantil y fiscal): se BLOQUEAN.
        $n = labs_q('UPDATE contratos SET bloqueado = 1, actualizado = ? WHERE id = ?', array(labs_ahora(), (int) $id))->rowCount();
        if (!$n) {
            throw new ErrorApi('Ese contrato no existe o ya estaba bloqueado.', 404, 'NO_ENCONTRADO');
        }
        labs_anota('Datos bloqueados (art. 32 LOPDGDD)', 'Contrato #' . (int) $id . ' bloqueado: solo administración puede verlo, y solo para atender obligaciones legales.');
        return 'Contrato bloqueado: se conserva por obligación legal, pero ya solo lo ve administración.';
    }
    if ($tipo === 'usuario') {
        throw new ErrorApi('Las cuentas del CRM se dan de baja o se eliminan desde Usuarios y Accesos.', 400, 'P0001');
    }
    throw new ErrorApi('Tipo de dato desconocido.', 400, 'P0001');
}

/* ===========================================================================
   SOLICITUDES DE DERECHOS
   ========================================================================= */
function labs_solicitud_crea($d)
{
    $tipos = array('acceso', 'rectificacion', 'supresion', 'oposicion', 'limitacion', 'portabilidad');
    $persona = trim((string) ($d['persona'] ?? ''));
    if (mb_strlen($persona) < 2) {
        throw new ErrorApi('Indica el nombre de la persona que lo pide.', 400, 'P0001');
    }
    $recibida = !empty($d['recibida']) ? labs_entra('solicitudes_rgpd', 'recibida', 's', $d['recibida']) : labs_ahora();
    $vence = labs_suma_meses($recibida, 1);
    $codigo = labs_codigo_siguiente('solicitudes_rgpd', 'SD');
    $u = labs_usuario();
    labs_q('INSERT INTO solicitudes_rgpd (codigo, tipo, persona, contacto, recibida, vence, estado, notas, creado_por, creado) VALUES (?,?,?,?,?,?,?,?,?,?)',
        array($codigo, labs_valor_lista($d['tipo'] ?? 'acceso', $tipos, 'acceso'), mb_substr($persona, 0, 200),
            mb_substr((string) ($d['contacto'] ?? ''), 0, 190), $recibida, $vence, 'abierta',
            (string) ($d['notas'] ?? ''), $u['id'], labs_ahora()));
    $id = (int) labs_db()->lastInsertId();
    labs_anota('Solicitud de derechos registrada', $codigo . ' · ' . ($d['tipo'] ?? 'acceso') . ' · ' . $persona . ' (plazo: 1 mes)');
    return $id;
}

/**
 * Suma meses de fecha a fecha (art. 5 del Código Civil): si el mes de llegada
 * no tiene ese día, el plazo acaba el último día del mes (31 ene + 1 mes = 28 feb).
 */
function labs_suma_meses($fecha, $meses)
{
    $d = new DateTime($fecha, new DateTimeZone('UTC'));
    $dia = (int) $d->format('j');
    $d->setDate((int) $d->format('Y'), (int) $d->format('n') + $meses, 1);
    $d->setDate((int) $d->format('Y'), (int) $d->format('n'), min($dia, (int) $d->format('t')));
    return $d->format('Y-m-d H:i:s.u');
}

function labs_solicitud_actualiza($id, $d)
{
    $s = labs_fila('SELECT * FROM solicitudes_rgpd WHERE id = ? FOR UPDATE', array((int) $id));
    if (!$s) {
        throw new ErrorApi('Esa solicitud no existe.', 404, 'NO_ENCONTRADO');
    }
    $estado = labs_valor_lista($d['estado'] ?? $s['estado'], array('abierta', 'prorrogada', 'resuelta', 'denegada'), $s['estado']);
    $vence = $s['vence'];
    if ($estado === 'prorrogada' && $s['estado'] !== 'prorrogada') {
        // Art. 12.3: prórroga de dos meses más, avisando a la persona.
        $vence = labs_suma_meses($s['recibida'], 3);
    }
    labs_q('UPDATE solicitudes_rgpd SET estado = ?, vence = ?, notas = ?, respuesta = ?, resuelta = ? WHERE id = ?', array(
        $estado, $vence, (string) ($d['notas'] ?? $s['notas']), (string) ($d['respuesta'] ?? $s['respuesta']),
        in_array($estado, array('resuelta', 'denegada'), true) ? ($s['resuelta'] ?: labs_ahora()) : null, $s['id']));
    labs_anota('Solicitud de derechos actualizada', $s['codigo'] . ' → ' . $estado);
}

function labs_solicitudes_lista()
{
    $l = labs_q('SELECT * FROM solicitudes_rgpd ORDER BY (estado IN (\'resuelta\',\'denegada\')), vence ASC LIMIT 300')->fetchAll();
    foreach ($l as &$s) {
        foreach (array('recibida', 'vence', 'resuelta', 'creado') as $k) {
            $s[$k] = labs_sale('s', $s[$k]);
        }
        $s['id'] = (int) $s['id'];
    }
    return $l;
}

/* ===========================================================================
   CONSERVACIÓN Y MANTENIMIENTO
   ========================================================================= */
function labs_conservacion($aplicar)
{
    $aj = labs_rgpd_ajustes();
    $meses = max(6, (int) $aj['conservar_leads_meses']);
    $dias = max(30, (int) $aj['conservar_accesos_dias']);
    $limite_leads = (new DateTime('now', new DateTimeZone('UTC')))->modify('-' . $meses . ' months')->format('Y-m-d H:i:s.u');
    $leads = labs_q("SELECT id FROM contactos WHERE tipo = 'lead' AND actualizado < ? AND nombre NOT LIKE 'Anónimo #%'
                     AND id NOT IN (SELECT contacto_id FROM contacto_eventos WHERE ts >= ?)", array($limite_leads, $limite_leads))->fetchAll(PDO::FETCH_COLUMN);
    $accesos = (int) labs_fila('SELECT COUNT(*) n FROM registro_accesos WHERE ts < ?', array(labs_hace($dias * 86400)))['n'];
    $res = array('leads' => count($leads), 'accesos' => $accesos, 'meses' => $meses, 'dias' => $dias);
    if (!$aplicar) {
        return $res;
    }
    foreach ($leads as $id) {
        foreach (labs_q('SELECT ruta FROM contacto_documentos WHERE contacto_id = ?', array($id))->fetchAll(PDO::FETCH_COLUMN) as $r) {
            labs_almacen_borra_archivo($r);
        }
        labs_q('DELETE FROM contacto_documentos WHERE contacto_id = ?', array($id));
        labs_q('DELETE FROM contacto_comentarios WHERE contacto_id = ?', array($id));
        labs_q('DELETE FROM contacto_eventos WHERE contacto_id = ?', array($id));
        labs_q("UPDATE contactos SET nombre = ?, empresa = '', email = '', telefono = '', origen = '', especificaciones = '', etiquetas = '', ref_externa = NULL, actualizado = ? WHERE id = ?",
            array('Anónimo #' . $id, labs_ahora(), $id));
    }
    labs_q('DELETE FROM registro_accesos WHERE ts < ?', array(labs_hace($dias * 86400)));
    labs_q('DELETE FROM intentos_acceso WHERE ts < ?', array(labs_hace(30 * 86400)));
    labs_q('DELETE FROM bloqueos WHERE hasta < ?', array(labs_hace(7 * 86400)));
    labs_q('DELETE FROM frenos WHERE ventana < ?', array(labs_hace(86400)));
    labs_q('DELETE FROM alertas WHERE vista = 1 AND ts < ?', array(labs_hace(365 * 86400)));
    if ($res['leads'] || $res['accesos']) {
        labs_anota('Plazos de conservación aplicados', $res['leads'] . ' lead(s) sin actividad en ' . $meses . ' meses anonimizados; ' .
            $res['accesos'] . ' registro(s) de acceso de más de ' . $dias . ' días eliminados.', null, null);
    }
    labs_pon_ajuste('conservacion_ultima', labs_ahora());
    return $res;
}

/**
 * Tareas diarias: copia automática, plazos de conservación y vigilancia de
 * la bitácora. Se lanza sola tras las peticiones (como mucho cada 6 horas),
 * desde el Centro de Cumplimiento o desde una tarea programada de Hostalia.
 */
function labs_mantenimiento($forzar = false)
{
    $ultimo = labs_ajuste('mant_ultimo');
    if (!$forzar && $ultimo && $ultimo > labs_hace(6 * 3600)) {
        return array('hecho' => false);
    }
    labs_pon_ajuste('mant_ultimo', labs_ahora());
    $r = array('hecho' => true, 'copia' => null, 'conservacion' => null, 'bitacora' => null);
    try {
        $ultima = labs_ajuste('copia_ultima');
        if (labs_ajuste('rgpd.copias_activas', '1') === '1' && (!$ultima || $ultima < labs_hace(23 * 3600))) {
            $r['copia'] = labs_copia_crea('automatica');
        }
    } catch (Exception $e) {
        labs_alerta('copia_fallida', 'alta', 'No se ha podido hacer la copia de seguridad automática', $e->getMessage(), 'copia-fallida|' . gmdate('Y-m-d'));
    }
    $r['conservacion'] = labs_conservacion(true);
    $b = labs_verifica_bitacora();
    $r['bitacora'] = $b['ok'];
    if (!$b['ok']) {
        $id = labs_alerta('bitacora', 'critica', 'La bitácora ha sido manipulada', $b['mensaje'] .
            ' Alguien con acceso directo a la base de datos ha modificado o borrado registros. Trátalo como una posible brecha de integridad.',
            'bitacora-rota|' . md5($b['mensaje']));
        if ($id) {
            $inc = labs_incidente_crea(array('titulo' => 'Manipulación de la bitácora de auditoría', 'tipo' => 'integridad',
                'descripcion' => 'Detectado automáticamente. ' . $b['mensaje']), 'automatico');
            labs_q('UPDATE alertas SET incidente_id = ? WHERE id = ?', array($inc, $id));
        }
    }
    return $r;
}

/** Tras enviar la respuesta al navegador, hace el mantenimiento si toca (sin hacer esperar a nadie). */
function labs_mantenimiento_diferido()
{
    if (!labs_db_lista()) {
        return;
    }
    try {
        $db = labs_db();
        if ($db->inTransaction()) {
            return;
        }
        $ultimo = labs_ajuste('mant_ultimo');
        if ($ultimo && $ultimo > labs_hace(6 * 3600)) {
            return;
        }
        ignore_user_abort(true);
        if (function_exists('fastcgi_finish_request')) {
            fastcgi_finish_request();
        } else {
            // Sin FPM: se entrega lo ya escrito y se sigue trabajando.
            while (ob_get_level() > 0) {
                @ob_end_flush();
            }
            @flush();
        }
        $db->beginTransaction();
        labs_mantenimiento(false);
        $db->commit();
    } catch (Throwable $e) {
        try {
            if (labs_db()->inTransaction()) {
                labs_db()->rollBack();
            }
        } catch (Throwable $x) {
        }
        error_log('Labs CRM mantenimiento: ' . $e->getMessage());
    }
}

/* ===========================================================================
   RUTAS
   ========================================================================= */
function labs_rgpd($metodo, $sub, $b, $pares)
{
    $u = labs_usuario(true);
    if (!labs_soy_admin()) {
        throw new ErrorApi('El cumplimiento RGPD lo gestiona administración.', 403, 'ROL_INSUFICIENTE');
    }
    $p = function ($k) use ($pares) {
        foreach ($pares as $x) {
            if ($x[0] === $k) {
                return $x[1];
            }
        }
        return null;
    };
    $sub = rtrim($sub, '/');
    $b = is_array($b) ? $b : array();

    if ($sub === '/estado' && $metodo === 'GET') {
        labs_mantenimiento(false);
        $copias = labs_copias_lista();
        $inc = labs_incidentes_lista();
        $abiertos = array_values(array_filter($inc, function ($i) {
            return $i['estado'] !== 'cerrado';
        }));
        $sol = labs_solicitudes_lista();
        $sol_abiertas = array_values(array_filter($sol, function ($s) {
            return in_array($s['estado'], array('abierta', 'prorrogada'), true);
        }));
        $clave_cron = labs_ajuste('clave_cron');
        if (!$clave_cron) {
            $clave_cron = bin2hex(random_bytes(16));
            labs_pon_ajuste('clave_cron', $clave_cron);
        }
        $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
            || (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && strtolower($_SERVER['HTTP_X_FORWARDED_PROTO']) === 'https');
        return array(200, array(
            'ajustes' => labs_rgpd_ajustes(),
            'copias' => $copias,
            'copias_privadas' => LABS_DIR_PRIVADO !== '',
            'incidentes_abiertos' => count($abiertos),
            'alertas_nuevas' => (int) labs_fila('SELECT COUNT(*) n FROM alertas WHERE vista = 0')['n'],
            'solicitudes_abiertas' => count($sol_abiertas),
            'conservacion' => labs_conservacion(false),
            'https' => $https,
            'url_tarea' => labs_url_base() ? labs_url_base() . '/api/index.php?ruta=' . rawurlencode('/mantenimiento?clave=' . $clave_cron) : null,
            'zip' => class_exists('ZipArchive'),
            'raiz' => (bool) $u['raiz'],
        ));
    }
    if ($sub === '/ajustes' && $metodo === 'POST') {
        $def = labs_rgpd_defectos();
        foreach ($def as $k => $v) {
            if (!array_key_exists($k, $b)) {
                continue;
            }
            $val = trim((string) $b[$k]);
            if (in_array($k, array('email_privacidad', 'email_alertas'), true) && $val !== '' && !filter_var($val, FILTER_VALIDATE_EMAIL)) {
                throw new ErrorApi('El correo «' . $val . '» no es válido.', 400, 'P0001');
            }
            if (in_array($k, array('conservar_leads_meses', 'conservar_accesos_dias', 'copias_guardar'), true)) {
                $val = (string) max(1, (int) $val);
            }
            if ($k === 'copias_activas') {
                $val = $val === '1' || $val === 'true' ? '1' : '0';
            }
            labs_pon_ajuste('rgpd.' . $k, mb_substr($val, 0, 300));
        }
        labs_anota('Ajustes de RGPD actualizados', implode(', ', array_keys(array_intersect_key($b, $def))));
        return array(200, labs_rgpd_ajustes());
    }

    /* --- Alertas ------------------------------------------------------------ */
    if ($sub === '/alertas' && $metodo === 'GET') {
        $l = labs_q('SELECT * FROM alertas ORDER BY vista, ts DESC LIMIT 200')->fetchAll();
        foreach ($l as &$a) {
            $a['ts'] = labs_sale('s', $a['ts']);
            $a['id'] = (int) $a['id'];
            $a['vista'] = (bool) (int) $a['vista'];
            $a['incidente_id'] = $a['incidente_id'] === null ? null : (int) $a['incidente_id'];
        }
        unset($a);
        return array(200, $l);
    }
    if (preg_match('#^/alertas/(\d+)/(vista|incidente)$#', $sub, $m) && $metodo === 'POST') {
        $a = labs_fila('SELECT * FROM alertas WHERE id = ?', array((int) $m[1]));
        if (!$a) {
            throw new ErrorApi('Esa alerta no existe.', 404, 'NO_ENCONTRADO');
        }
        if ($m[2] === 'vista') {
            labs_q('UPDATE alertas SET vista = 1 WHERE id = ?', array($a['id']));
            return array(200, array('ok' => true));
        }
        $tipo = in_array($a['tipo'], array('bitacora', 'restauracion'), true) ? 'integridad' : ($a['tipo'] === 'copia_fallida' ? 'disponibilidad' : 'confidencialidad');
        $id = labs_incidente_crea(array('titulo' => $a['titulo'], 'descripcion' => (string) $a['detalle'], 'tipo' => $tipo, 'detectado' => labs_sale('s', $a['ts'])), 'alerta');
        labs_q('UPDATE alertas SET vista = 1, incidente_id = ? WHERE id = ?', array($id, $a['id']));
        return array(201, array('id' => $id));
    }

    /* --- Brechas ------------------------------------------------------------ */
    if ($sub === '/incidentes' && $metodo === 'GET') {
        return array(200, labs_incidentes_lista());
    }
    if ($sub === '/incidentes' && $metodo === 'POST') {
        $id = labs_incidente_crea($b);
        labs_incidente_actualiza($id, array_diff_key($b, array('titulo' => 1, 'detectado' => 1)));
        return array(201, array('id' => $id));
    }
    if (preg_match('#^/incidentes/(\d+)$#', $sub, $m) && $metodo === 'POST') {
        labs_incidente_actualiza((int) $m[1], $b);
        return array(200, array('ok' => true));
    }

    /* --- Copias de seguridad ----------------------------------------------- */
    if ($sub === '/copias' && $metodo === 'GET') {
        return array(200, labs_copias_lista());
    }
    if ($sub === '/copias/crear' && $metodo === 'POST') {
        $r = labs_copia_crea('manual');
        labs_anota('Copia de seguridad creada', $r['nombre'] . ' · ' . $r['documentos'] . ' documento(s)');
        return array(201, $r);
    }
    if ($sub === '/copias/descargar' && $metodo === 'GET') {
        $ruta = labs_copia_ruta($p('nombre'));
        labs_anota('Copia de seguridad descargada', basename($ruta));
        labs_db()->commit();
        labs_cabeceras_seguras();
        header('Content-Type: application/octet-stream');
        header('Content-Length: ' . filesize($ruta));
        header('Content-Disposition: attachment; filename="' . basename($ruta) . '"');
        readfile($ruta);
        exit;
    }
    if ($sub === '/copias/subir' && $metodo === 'POST') {
        $nombre = 'copia-subida-' . gmdate('Ymd-His') . '.labsbak';
        $dest = labs_dir_copias() . '/' . $nombre;
        $in = fopen('php://input', 'rb');
        $out = fopen($dest, 'wb');
        $n = stream_copy_to_stream($in, $out, 2147483647);
        fclose($in);
        fclose($out);
        $cab = (string) @file_get_contents($dest, false, null, 0, 8);
        if (!$n || $cab !== 'LABSBAK1') {
            @unlink($dest);
            throw new ErrorApi('Ese archivo no es una copia de seguridad del CRM (.labsbak).', 400, 'COPIA_INVALIDA');
        }
        try {
            $prueba = labs_dir_copias() . '/.tmp-prueba-' . bin2hex(random_bytes(4));
            labs_descifra_archivo($dest, $prueba, labs_clave_copias());
            @unlink($prueba);
        } catch (ErrorApi $e) {
            @unlink($dest);
            throw $e;
        }
        labs_anota('Copia de seguridad subida', $nombre);
        return array(201, array('nombre' => $nombre));
    }
    if ($sub === '/copias/restaurar' && $metodo === 'POST') {
        if (!$u['raiz']) {
            throw new ErrorApi('Restaurar una copia solo lo puede hacer la cuenta raíz.', 403, 'RAIZ');
        }
        if (($b['confirmacion'] ?? '') !== 'RESTAURAR') {
            throw new ErrorApi('Escribe RESTAURAR para confirmar.', 400, 'P0001');
        }
        if (labs_2fa_activo($u['id']) && !labs_2fa_comprueba($u['id'], $b['codigo'] ?? '')) {
            throw new ErrorApi('Hace falta un código válido del doble factor para restaurar.', 400, 'MFA_CODIGO');
        }
        return array(200, labs_copia_restaura($b['nombre'] ?? ''));
    }
    if ($sub === '/copias/clave' && $metodo === 'POST') {
        if (!$u['raiz']) {
            throw new ErrorApi('La clave de las copias solo la ve la cuenta raíz.', 403, 'RAIZ');
        }
        if (labs_2fa_activo($u['id']) && !labs_2fa_comprueba($u['id'], $b['codigo'] ?? '')) {
            throw new ErrorApi('Hace falta un código válido del doble factor.', 400, 'MFA_CODIGO');
        }
        labs_anota('Clave de las copias consultada', 'La cuenta raíz ha visto la clave de descifrado de las copias.');
        return array(200, array('clave' => base64_encode(labs_clave_copias())));
    }

    /* --- Derechos de las personas ------------------------------------------ */
    if ($sub === '/buscar' && $metodo === 'GET') {
        return array(200, labs_rgpd_busca($p('q')));
    }
    if ($sub === '/exportar' && $metodo === 'GET') {
        $items = array_filter(explode(',', (string) $p('items')));
        $tmp = labs_rgpd_exporta($items);
        labs_db()->commit();
        labs_cabeceras_seguras();
        header('Content-Type: application/zip');
        header('Content-Length: ' . filesize($tmp));
        header('Content-Disposition: attachment; filename="datos-personales-' . gmdate('Ymd') . '.zip"');
        readfile($tmp);
        @unlink($tmp);
        exit;
    }
    if ($sub === '/suprimir' && $metodo === 'POST') {
        $msg = labs_rgpd_suprime((string) ($b['tipo'] ?? ''), $b['id'] ?? 0);
        return array(200, array('ok' => true, 'mensaje' => $msg));
    }
    if ($sub === '/solicitudes' && $metodo === 'GET') {
        return array(200, labs_solicitudes_lista());
    }
    if ($sub === '/solicitudes' && $metodo === 'POST') {
        return array(201, array('id' => labs_solicitud_crea($b)));
    }
    if (preg_match('#^/solicitudes/(\d+)$#', $sub, $m) && $metodo === 'POST') {
        labs_solicitud_actualiza((int) $m[1], $b);
        return array(200, array('ok' => true));
    }

    /* --- Conservación -------------------------------------------------------- */
    if ($sub === '/conservacion/aplicar' && $metodo === 'POST') {
        return array(200, labs_conservacion(true));
    }
    if ($sub === '/mantenimiento' && $metodo === 'POST') {
        return array(200, labs_mantenimiento(true));
    }
    throw new ErrorApi('Operación de cumplimiento desconocida.', 404, 'RUTA_DESCONOCIDA');
}
