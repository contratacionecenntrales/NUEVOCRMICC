<?php
/**
 * LABS COMMAND CENTER 360™ · Funciones del servidor
 * Lo que en Supabase eran funciones de Postgres (rest/v1/rpc/...).
 */
defined('LABS') || exit;

function labs_rpc($fn, $a)
{
    $publicas = array('contrato_para_firma', 'firma_contrato');
    $todas = array('alta_usuario', 'restablece_clave', 'borra_usuario', 'escala_ticket',
        'nuevo_enlace_firma', 'contrato_para_firma', 'firma_contrato', 'puedo', 'mi_rol', 'soy_admin');
    if (!in_array($fn, $todas, true)) {
        throw new ErrorApi('No existe la función «' . $fn . '».', 404, 'PGRST202');
    }
    if (!in_array($fn, $publicas, true)) {
        labs_usuario(true);
    } elseif (labs_freno('firma|' . labs_ip(), 60, 600)) {
        // La página de firma es pública: se frena a quien la martillee
        // (probar tokens al azar o llenar el registro de eventos).
        throw new ErrorApi('Demasiadas peticiones seguidas. Espera unos minutos.', 429, 'FRENO');
    }
    $a = is_array($a) ? $a : array();
    $arg = function ($k, $def = null) use ($a) {
        return array_key_exists($k, $a) ? $a[$k] : $def;
    };

    switch ($fn) {
        case 'puedo':
            return labs_puedo((string) $arg('p_clave'));
        case 'mi_rol':
            return labs_mi_rol();
        case 'soy_admin':
            return labs_soy_admin();
        case 'alta_usuario':
            return labs_rpc_alta_usuario($arg);
        case 'restablece_clave':
            return labs_rpc_restablece_clave((string) $arg('p_id'), $arg('p_password'));
        case 'borra_usuario':
            return labs_rpc_borra_usuario((string) $arg('p_id'));
        case 'escala_ticket':
            return labs_rpc_escala_ticket($arg('p_id'));
        case 'nuevo_enlace_firma':
            return labs_rpc_nuevo_enlace((string) $arg('p_codigo'), $arg('p_dias', 30));
        case 'contrato_para_firma':
            return labs_rpc_contrato_para_firma($arg('p_token'));
        case 'firma_contrato':
            return labs_rpc_firma_contrato($arg);
    }
    return null;
}

/* ---------------------------------------------------------------------------
   ALTA DE USUARIOS (16-alta-por-sql)
   ------------------------------------------------------------------------- */
function labs_rpc_alta_usuario($arg)
{
    $yo = labs_usuario(true);
    if (!labs_activo()) {
        throw new ErrorApi('Sesión no válida o cuenta inactiva.', 400, 'P0001', 'SIN_SESION');
    }
    if ($yo['raiz'] || $yo['rol'] === 'admin') {
        $permitidos = array('admin', 'manager', 'commercial', 'backoffice');
    } elseif ($yo['rol'] === 'manager') {
        $permitidos = array('commercial', 'backoffice');
    } elseif (labs_puedo('sys.alta_agentes')) {
        $permitidos = array('commercial');
    } else {
        throw new ErrorApi('No tienes permiso para dar de alta usuarios (tu cuenta figura como: ' . $yo['rol'] . ').',
            400, 'P0001', 'ROL_INSUFICIENTE');
    }
    $rol = (string) $arg('p_rol');
    if (!in_array($rol, $permitidos, true)) {
        throw new ErrorApi('Con tu rol solo puedes dar de alta: ' . implode(', ', $permitidos) . '.', 400, 'P0001', 'ROL_NO_PERMITIDO');
    }
    $nombre = trim((string) $arg('p_nombre', ''));
    $ape = trim((string) $arg('p_apellidos', ''));
    $email = mb_strtolower(trim((string) $arg('p_email', '')));
    $prefijo = (string) $arg('p_prefijo', '+34');
    $clave = $arg('p_password');

    if (mb_strlen($nombre) < 2) {
        throw new ErrorApi('Nombre no válido.', 400, 'P0001', 'NOMBRE_INVALIDO');
    }
    if (!preg_match('/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/', $email)) {
        throw new ErrorApi('Correo no válido.', 400, 'P0001', 'EMAIL_INVALIDO');
    }
    if (labs_fila('SELECT 1 FROM cuentas WHERE LOWER(email) = ?', array($email)) ||
        labs_fila('SELECT 1 FROM perfiles WHERE LOWER(email) = ?', array($email))) {
        throw new ErrorApi('Ya existe una cuenta con ese correo.', 400, 'P0001', 'EMAIL_DUPLICADO');
    }
    if ($prefijo !== '' && !preg_match('/^\+\d{1,3}$/', $prefijo)) {
        throw new ErrorApi('El prefijo debe ser internacional, como +34.', 400, 'P0001', 'PREFIJO_INVALIDO');
    }
    if (labs_revisa_clave_basica($clave)) {
        throw new ErrorApi('La contraseña necesita al menos 10 caracteres, con mayúscula, minúscula, número y símbolo.',
            400, 'P0001', 'CLAVE_DEBIL');
    }
    $superior = (($yo['raiz'] || $yo['rol'] === 'admin') && $arg('p_superior')) ? (string) $arg('p_superior') : $yo['id'];
    $sup = labs_fila("SELECT rol, raiz FROM perfiles WHERE id = ? AND estado = 'Activo'", array($superior));
    if (!$sup || labs_rango($sup['rol'], (int) $sup['raiz'] === 1) <= labs_rango($rol, false)) {
        $r = labs_fila('SELECT id FROM perfiles WHERE raiz = 1 LIMIT 1');
        $superior = $r ? $r['id'] : null;
    }
    return labs_crea_usuario(array(
        'nombre' => $nombre, 'apellidos' => $ape, 'email' => $email,
        'prefijo' => $prefijo !== '' ? $prefijo : '+34',
        'telefono' => trim((string) $arg('p_telefono', '')), 'extension' => trim((string) $arg('p_extension', '')),
        'rol' => $rol, 'google' => (bool) $arg('p_google', false), 'superior_id' => $superior,
    ), $clave);
}

/** Política básica de la base de datos (la de 16 y 17). Devuelve true si es débil. */
function labs_revisa_clave_basica($p)
{
    return !is_string($p) || mb_strlen($p) < 10 || mb_strlen($p) > 200
        || !preg_match('/[A-ZÁÉÍÓÚÑ]/u', $p) || !preg_match('/[a-záéíóúñ]/u', $p)
        || !preg_match('/[0-9]/', $p) || !preg_match('/[^A-Za-z0-9]/', $p);
}

/** Crea identidad + ficha. Devuelve la ficha como la ve el panel. */
function labs_crea_usuario($d, $clave)
{
    $id = labs_uuid();
    $ahora = labs_ahora();
    labs_q('INSERT INTO cuentas (id, email, clave_hash, creado, actualizado) VALUES (?,?,?,?,?)',
        array($id, $d['email'], labs_hash_clave($clave), $ahora, $ahora));
    $def = labs_tabla('perfiles');
    $fila = labs_inserta_fila('perfiles', $def, array(
        'id' => $id, 'nombre' => $d['nombre'], 'apellidos' => $d['apellidos'], 'email' => $d['email'],
        'prefijo' => $d['prefijo'], 'telefono' => $d['telefono'], 'extension' => $d['extension'],
        'rol' => $d['rol'], 'estado' => 'Activo', 'rel' => labs_nueva_relacion(), 'google' => $d['google'],
        'debe_cambiar' => true, 'permisos' => labs_permisos_de_rol($d['rol']),
        'api_token' => labs_token_api(), 'superior_id' => $d['superior_id'],
    ), true);
    return labs_fila_salida($def, $fila, array_keys($def['cols']));
}

/* ---------------------------------------------------------------------------
   CONTRASEÑA Y BORRADO (17-jefe-gestiona-equipo)
   ------------------------------------------------------------------------- */
function labs_rpc_restablece_clave($id, $clave)
{
    if (!labs_gestiono($id)) {
        throw new ErrorApi('Solo puedes restablecer la contraseña de las personas que gestionas.', 400, 'P0001', 'NO_GESTIONAS');
    }
    if (labs_revisa_clave_basica($clave)) {
        throw new ErrorApi('La contraseña necesita al menos 10 caracteres, con mayúscula, minúscula, número y símbolo.',
            400, 'P0001', 'CLAVE_DEBIL');
    }
    labs_pon_clave($id, $clave);
    return true;
}

/** Cambia la contraseña, obliga a cambiarla al entrar y cierra sus sesiones. */
function labs_pon_clave($id, $clave)
{
    labs_q('UPDATE cuentas SET clave_hash = ?, actualizado = ? WHERE id = ?',
        array(labs_hash_clave($clave), labs_ahora(), $id));
    labs_q('UPDATE perfiles SET debe_cambiar = 1 WHERE id = ?', array($id));
    labs_q('DELETE FROM sesiones WHERE usuario_id = ?', array($id));
    labs_q('DELETE FROM tokens_sesion WHERE usuario_id = ?', array($id));
    $el = labs_fila('SELECT id, nombre, apellidos FROM perfiles WHERE id = ?', array($id));
    labs_anota('Contraseña restablecida', 'Deberá cambiarla en el próximo acceso. Sesiones cerradas.', $el);
}

function labs_rpc_borra_usuario($id)
{
    if (!labs_gestiono($id)) {
        throw new ErrorApi('Solo puedes borrar las cuentas de las personas que gestionas.', 400, 'P0001', 'NO_GESTIONAS');
    }
    labs_borra_usuario($id);
    return true;
}

function labs_borra_usuario($id)
{
    $def = labs_tabla('perfiles');
    $f = labs_fila('SELECT * FROM perfiles WHERE id = ? FOR UPDATE', array($id));
    if ($f) {
        labs_borra_fila('perfiles', $def, labs_fila_php($def, $f));
        call_user_func($def['al_final']);
    } else {
        labs_q('DELETE FROM cuentas WHERE id = ?', array($id));
    }
}

/* ---------------------------------------------------------------------------
   SOPORTE (10)
   ------------------------------------------------------------------------- */
function labs_rpc_escala_ticket($id)
{
    if (!labs_puedo('soporte.escalar')) {
        throw new ErrorApi('No tienes permiso para escalar incidencias a Nivel 2.', 400, 'P0001');
    }
    $def = labs_tabla('tickets');
    $f = labs_fila('SELECT * FROM tickets WHERE id = ? FOR UPDATE', array((int) $id));
    if (!$f) {
        throw new ErrorApi('La incidencia ' . (int) $id . ' no existe.', 400, 'P0001');
    }
    $v = labs_fila_php($def, $f);
    $resp = labs_elige_responsable('admin');
    labs_actualiza_fila('tickets', $def, $v, array(
        'nivel_escalado' => 2, 'estado' => 'escalado', 'asignado_a' => $resp ?: $v['asignado_a'],
    ), true);
    labs_q('INSERT INTO ticket_eventos (ticket_id, autor_id, tipo, texto, creado) VALUES (?,?,?,?,?)',
        array($v['id'], labs_uid(), 'escalado', 'Escalada a Responsable del Responsable (Nivel 2).', labs_ahora()));
    return null;
}

/* ---------------------------------------------------------------------------
   FIRMA DE CONTRATOS (05)
   ------------------------------------------------------------------------- */
function labs_firma_evento($contrato_id, $evento, $detalle = '')
{
    labs_q('INSERT INTO firma_eventos (contrato_id, ts, evento, ip, ua, detalle) VALUES (?,?,?,?,?,?)', array(
        $contrato_id, labs_ahora(), $evento, labs_ip(),
        isset($_SERVER['HTTP_USER_AGENT']) ? mb_substr($_SERVER['HTTP_USER_AGENT'], 0, 500) : null, $detalle));
}

function labs_rpc_nuevo_enlace($codigo, $dias)
{
    $dias = (int) $dias;
    if ($dias < 1 || $dias > 90) {
        $dias = 30;
    }
    $c = labs_fila('SELECT * FROM contratos WHERE codigo = ? FOR UPDATE', array($codigo));
    if (!$c) {
        throw new ErrorApi('No existe el contrato ' . $codigo, 400, 'P0001');
    }
    if (!(in_array(labs_mi_rol(), array('admin', 'manager', 'backoffice'), true) || $c['gestor_id'] === labs_uid())) {
        throw new ErrorApi('No tienes permiso sobre el contrato ' . $codigo, 400, 'P0001');
    }
    if ($c['estado'] === 'Firmado') {
        throw new ErrorApi('El contrato ' . $codigo . ' ya está firmado.', 400, 'P0001');
    }
    if ($c['estado'] === 'Anulado') {
        throw new ErrorApi('El contrato ' . $codigo . ' está anulado.', 400, 'P0001');
    }
    if ((int) $c['bloqueado'] === 1) {
        throw new ErrorApi('El contrato ' . $codigo . ' está bloqueado por protección de datos.', 400, 'P0001');
    }
    $tok = labs_uuid();
    $exp = new DateTime('now', new DateTimeZone('UTC'));
    $exp->modify('+' . $dias . ' days');
    labs_q("UPDATE contratos SET token = ?, token_expira = ?, token_usado = 0,
              estado = CASE WHEN estado = 'Borrador' THEN 'Enviado' ELSE estado END,
              enviado_el = COALESCE(enviado_el, ?), actualizado = ? WHERE id = ?",
        array($tok, $exp->format('Y-m-d H:i:s.u'), labs_ahora(), labs_ahora(), $c['id']));
    labs_firma_evento($c['id'], 'emitido', 'Caduca el ' . $exp->format('d/m/Y'));
    return array(array('token' => $tok, 'expira' => $exp->format('Y-m-d\TH:i:s.uP')));
}

function labs_rpc_contrato_para_firma($token)
{
    if (!labs_es_uuid($token)) {
        return array('error' => $token ? 'no-existe' : 'sin-token');
    }
    $c = labs_fila('SELECT * FROM contratos WHERE token = ? AND bloqueado = 0', array(strtolower($token)));
    if (!$c) {
        return array('error' => 'no-existe');
    }
    labs_firma_evento($c['id'], 'abierto');
    if ((int) $c['token_usado'] === 1 || $c['estado'] === 'Firmado') {
        return array('error' => 'ya-firmado', 'firmado_ts' => labs_sale('s', $c['firmado_ts']), 'cliente' => $c['cliente']);
    }
    if ($c['token_expira'] !== null && $c['token_expira'] < labs_ahora()) {
        return array('error' => 'caducado', 'expira' => labs_sale('s', $c['token_expira']));
    }
    if ($c['estado'] === 'Anulado') {
        return array('error' => 'anulado');
    }
    $datos = json_decode($c['datos_contrato'], true);
    return array(
        'codigo' => $c['codigo'], 'expira' => labs_sale('s', $c['token_expira']),
        'cliente' => $c['cliente'], 'cif' => $c['cif'], 'dir' => $c['domicilio'], 'rep' => $c['representante'],
        'mail' => $c['email'], 'tel' => $c['telefono'], 'servicio' => $c['servicio'],
        'base' => 0 + $c['setup'], 'mensual' => 0 + $c['mensual'], 'iva' => 0 + $c['iva'],
        'fecha' => $c['inicio'], 'datos' => labs_json_objeto(is_array($datos) ? $datos : array()),
        'privacidad' => labs_privacidad_publica(),
    );
}

/** Datos del responsable para la información de protección de datos (art. 13 RGPD). */
function labs_privacidad_publica()
{
    $a = labs_rgpd_ajustes();
    return array('responsable' => $a['responsable_nombre'], 'cif' => $a['responsable_cif'],
        'direccion' => $a['responsable_direccion'], 'email' => $a['email_privacidad'], 'dpo' => $a['dpo']);
}

function labs_rpc_firma_contrato($arg)
{
    $token = $arg('p_token');
    $nombre = trim((string) $arg('p_nombre', ''));
    $dni = trim((string) $arg('p_dni', ''));
    $firma = (string) $arg('p_firma', '');
    $huella = $arg('p_huella');
    $datos = $arg('p_datos', array());
    if (!labs_es_uuid($token)) {
        return array('error' => 'no-existe');
    }
    $c = labs_fila('SELECT * FROM contratos WHERE token = ? AND bloqueado = 0 FOR UPDATE', array(strtolower($token)));
    if (!$c) {
        return array('error' => 'no-existe');
    }
    if ((int) $c['token_usado'] === 1 || $c['estado'] === 'Firmado') {
        return array('error' => 'ya-firmado');
    }
    if ($c['token_expira'] !== null && $c['token_expira'] < labs_ahora()) {
        return array('error' => 'caducado');
    }
    if ($c['estado'] === 'Anulado') {
        return array('error' => 'anulado');
    }
    if (mb_strlen($nombre) < 3) {
        return array('error' => 'falta-nombre');
    }
    if (mb_strlen($dni) < 8) {
        return array('error' => 'falta-dni');
    }
    if (strpos($firma, 'data:image/png;base64,') !== 0) {
        return array('error' => 'falta-firma');
    }
    if (strlen($firma) > 400000) {
        return array('error' => 'firma-demasiado-grande');
    }
    // La persona tiene que haber visto la información de protección de datos.
    if ($arg('p_privacidad', false) !== true) {
        return array('error' => 'falta-privacidad');
    }
    $previos = json_decode($c['datos_contrato'], true);
    $previos = is_array($previos) ? $previos : array();
    if (is_array($datos)) {
        $previos = array_merge($previos, $datos);
    }
    $ahora = labs_ahora();
    $previos['privacidad_informada'] = labs_sale('s', $ahora);
    labs_q('UPDATE contratos SET estado = ?, firma_img = ?, firma_nombre = ?, firma_dni = ?, firma_ip = ?, firma_ua = ?,
              firma_huella = ?, firmado_ts = ?, firmado_el = ?, representante = ?, datos_contrato = ?, token_usado = 1,
              actualizado = ? WHERE id = ?', array(
        'Firmado', $firma, $nombre, mb_strtoupper($dni), labs_ip(),
        isset($_SERVER['HTTP_USER_AGENT']) ? mb_substr($_SERVER['HTTP_USER_AGENT'], 0, 500) : null,
        $huella === null ? null : mb_substr((string) $huella, 0, 128), $ahora, labs_hoy(),
        $nombre !== '' ? $nombre : $c['representante'],
        json_encode($previos ?: new stdClass(), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $ahora, $c['id']));
    labs_firma_evento($c['id'], 'firmado', 'Firmado por ' . $nombre . ' · información de protección de datos aceptada');
    return array('ok' => true, 'codigo' => $c['codigo'], 'ts' => labs_sale('s', $ahora));
}
