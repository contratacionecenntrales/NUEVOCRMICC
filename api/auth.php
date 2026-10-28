<?php
/**
 * LABS COMMAND CENTER 360™ · Acceso (lo que hacía Supabase Auth)
 * Entrada con correo y contraseña, renovación de la sesión y salida.
 */
defined('LABS') || exit;

/** Emite un par de fichas (acceso + renovación) para el usuario. */
function labs_emite_sesion($usuario_id, $email, $ver_como_de = null)
{
    $acceso = rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
    $renov = rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
    $ahora = new DateTime('now', new DateTimeZone('UTC'));
    $exp_a = clone $ahora;
    $exp_a->modify('+' . (int) LABS_ACCESO_SEGUNDOS . ' seconds');
    $exp_r = clone $ahora;
    $exp_r->modify('+' . (int) LABS_RENOVACION_DIAS . ' days');
    labs_q('INSERT INTO tokens_sesion (usuario_id, acceso_hash, renovacion_hash, acceso_expira, renovacion_expira,
              ver_como_de, ip, agente, creado) VALUES (?,?,?,?,?,?,?,?,?)', array(
        $usuario_id, hash('sha256', $acceso), hash('sha256', $renov),
        $exp_a->format('Y-m-d H:i:s.u'), $exp_r->format('Y-m-d H:i:s.u'),
        $ver_como_de, labs_ip(), labs_navegador(), labs_ahora()));
    // Limpieza: fichas caducadas de cualquiera.
    labs_q('DELETE FROM tokens_sesion WHERE renovacion_expira < ?', array(labs_ahora()));
    return labs_respuesta_sesion($acceso, $renov, $exp_a, $usuario_id, $email);
}

function labs_respuesta_sesion($acceso, $renov, $exp_a, $usuario_id, $email)
{
    return array(
        'access_token' => $acceso,
        'token_type' => 'bearer',
        'expires_in' => (int) LABS_ACCESO_SEGUNDOS,
        'expires_at' => $exp_a->getTimestamp(),
        'refresh_token' => $renov,
        'user' => array('id' => $usuario_id, 'email' => $email),
    );
}

function labs_registra_raiz($evento, $usuario, $email, $motivo = null)
{
    labs_q('INSERT INTO accesos_raiz (id, ts, evento, usuario, email, ip, agente, motivo) VALUES (?,?,?,?,?,?,?,?)',
        array(labs_uuid(), labs_ahora(), $evento, $usuario, $email, labs_ip(), labs_navegador(), $motivo));
}

/** Freno a la fuerza bruta: 8 fallos por cuenta o 30 por IP en 15 minutos. */
function labs_demasiados_intentos($email)
{
    $desde = new DateTime('now', new DateTimeZone('UTC'));
    $desde->modify('-15 minutes');
    $d = $desde->format('Y-m-d H:i:s.u');
    $por_cuenta = labs_fila('SELECT COUNT(*) n FROM intentos_acceso WHERE email = ? AND ts > ?', array($email, $d));
    $por_ip = labs_fila('SELECT COUNT(*) n FROM intentos_acceso WHERE ip = ? AND ts > ?', array(labs_ip(), $d));
    return (int) $por_cuenta['n'] >= 8 || (int) $por_ip['n'] >= 30;
}

function labs_auth_token($tipo, $cuerpo)
{
    if ($tipo === 'password') {
        $email = mb_strtolower(trim((string) (isset($cuerpo['email']) ? $cuerpo['email'] : '')));
        $clave = (string) (isset($cuerpo['password']) ? $cuerpo['password'] : '');
        if ($email === '' || $clave === '') {
            labs_json(array('error' => 'invalid_request', 'error_description' => 'Faltan el correo o la contraseña.'), 400);
        }
        if (labs_demasiados_intentos($email)) {
            labs_json(array('error' => 'too_many_requests',
                'error_description' => 'Demasiados intentos fallidos. Espera 15 minutos y vuelve a probar.'), 429);
        }
        $c = labs_fila('SELECT id, email, clave_hash FROM cuentas WHERE LOWER(email) = ?', array($email));
        $ok = $c && $c['clave_hash'] && password_verify($clave, $c['clave_hash']);
        if (!$ok) {
            // Se calcula un hash igual para que el tiempo de respuesta no
            // delate si la cuenta existe.
            if (!$c) {
                password_hash($clave, PASSWORD_DEFAULT);
            }
            labs_q('INSERT INTO intentos_acceso (email, ip, ts) VALUES (?,?,?)', array($email, labs_ip(), labs_ahora()));
            if ($email === mb_strtolower(LABS_RAIZ_EMAIL)) {
                labs_registra_raiz('FALLIDO', $c ? $c['id'] : null, $email,
                    $c && !$c['clave_hash'] ? 'La cuenta aún no tiene contraseña (api/instalar.php)' : 'Contraseña incorrecta');
            }
            // El intento fallido tiene que quedar guardado aunque se responda error.
            if (labs_db()->inTransaction()) {
                labs_db()->commit();
            }
            labs_json(array('error' => 'invalid_grant', 'error_description' => 'Invalid login credentials'), 400);
        }
        if (password_needs_rehash($c['clave_hash'], PASSWORD_DEFAULT)) {
            labs_q('UPDATE cuentas SET clave_hash = ? WHERE id = ?', array(password_hash($clave, PASSWORD_DEFAULT), $c['id']));
        }
        labs_q('DELETE FROM intentos_acceso WHERE email = ?', array($email));
        $p = labs_fila('SELECT raiz FROM perfiles WHERE id = ?', array($c['id']));
        if ($p && (int) $p['raiz'] === 1) {
            labs_sincroniza_raiz();
            labs_registra_raiz('ENTRADA', $c['id'], $c['email']);
        }
        return labs_emite_sesion($c['id'], $c['email']);
    }

    if ($tipo === 'refresh_token') {
        $r = (string) (isset($cuerpo['refresh_token']) ? $cuerpo['refresh_token'] : '');
        $t = $r === '' ? null : labs_fila('SELECT t.id, t.usuario_id, c.email FROM tokens_sesion t JOIN cuentas c ON c.id = t.usuario_id
                                           WHERE t.renovacion_hash = ? AND t.renovacion_expira > ? FOR UPDATE',
            array(hash('sha256', $r), labs_ahora()));
        if (!$t) {
            labs_json(array('error' => 'invalid_grant', 'error_description' => 'Invalid Refresh Token'), 400);
        }
        // Rotación: la ficha de renovación usada deja de valer.
        $acceso = rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
        $renov = rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
        $exp_a = new DateTime('now', new DateTimeZone('UTC'));
        $exp_a->modify('+' . (int) LABS_ACCESO_SEGUNDOS . ' seconds');
        $exp_r = new DateTime('now', new DateTimeZone('UTC'));
        $exp_r->modify('+' . (int) LABS_RENOVACION_DIAS . ' days');
        labs_q('UPDATE tokens_sesion SET acceso_hash = ?, renovacion_hash = ?, acceso_expira = ?, renovacion_expira = ? WHERE id = ?',
            array(hash('sha256', $acceso), hash('sha256', $renov), $exp_a->format('Y-m-d H:i:s.u'),
                $exp_r->format('Y-m-d H:i:s.u'), $t['id']));
        return labs_respuesta_sesion($acceso, $renov, $exp_a, $t['usuario_id'], $t['email']);
    }

    labs_json(array('error' => 'unsupported_grant_type', 'error_description' => 'Tipo de acceso no admitido.'), 400);
    return null;
}

/** Salida. scope=local cierra solo esta sesión; global (por defecto), todas. */
function labs_auth_salir($ambito)
{
    $t = labs_token_peticion();
    if (!$t) {
        return;
    }
    $tok = labs_fila('SELECT id, usuario_id, ver_como_de FROM tokens_sesion WHERE acceso_hash = ?', array(hash('sha256', $t)));
    if (!$tok) {
        return;
    }
    if ($ambito === 'local' || $tok['ver_como_de']) {
        labs_q('DELETE FROM tokens_sesion WHERE id = ?', array($tok['id']));
    } elseif ($ambito === 'others') {
        labs_q('DELETE FROM tokens_sesion WHERE usuario_id = ? AND id <> ? AND ver_como_de IS NULL', array($tok['usuario_id'], $tok['id']));
    } else {
        labs_q('DELETE FROM tokens_sesion WHERE usuario_id = ? AND ver_como_de IS NULL', array($tok['usuario_id']));
    }
}

/**
 * «He olvidado mi contraseña». No se manda ningún correo: se avisa al
 * administrador en la bitácora de esa cuenta, que es lo que el panel promete.
 * Siempre responde lo mismo, exista o no la cuenta.
 */
function labs_auth_recuperar($cuerpo)
{
    $email = mb_strtolower(trim((string) (isset($cuerpo['email']) ? $cuerpo['email'] : '')));
    if ($email === '' || labs_demasiados_intentos($email)) {
        return;
    }
    labs_q('INSERT INTO intentos_acceso (email, ip, ts) VALUES (?,?,?)', array($email, labs_ip(), labs_ahora()));
    $p = labs_fila('SELECT id, nombre, apellidos FROM perfiles WHERE LOWER(email) = ?', array($email));
    if ($p) {
        labs_anota('Solicitud de nueva contraseña', 'Pedida desde la pantalla de acceso. Restablécela desde Usuarios y Accesos.',
            $p, null);
    }
}
