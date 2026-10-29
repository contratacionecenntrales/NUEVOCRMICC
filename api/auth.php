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
              ver_como_de, ip, agente, creado, ultimo_uso) VALUES (?,?,?,?,?,?,?,?,?,?)', array(
        $usuario_id, hash('sha256', $acceso), hash('sha256', $renov),
        $exp_a->format('Y-m-d H:i:s.u'), $exp_r->format('Y-m-d H:i:s.u'),
        $ver_como_de, labs_ip(), labs_navegador(), labs_ahora(), labs_ahora()));
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

/**
 * Defensa contra la fuerza bruta, pensada para que un atacante NO pueda
 * dejar bloqueada a una persona legítima (por ejemplo, a la cuenta raíz):
 *  - 8 fallos de la misma cuenta desde la misma IP en 15 min → esa IP no puede
 *    probar más esa cuenta (los demás sí pueden entrar).
 *  - 30 fallos desde una IP en 15 min (cualquier cuenta) → IP bloqueada 1 hora.
 *  - 100 fallos desde una IP en 24 h → IP bloqueada 24 horas.
 *  - 40 fallos contra una misma cuenta desde muchas IPs en 15 min (ataque
 *    repartido) → esa cuenta se frena 15 min para todos.
 * Devuelve el mensaje de bloqueo, o null si puede intentarlo.
 */
function labs_freno_acceso($email)
{
    $ip = labs_ip();
    $b = labs_bloqueo('ip', $ip);
    if ($b) {
        return 'Demasiados intentos fallidos desde tu conexión. Vuelve a probar más tarde.';
    }
    $q15 = labs_hace(15 * 60);
    $n = labs_fila('SELECT
          SUM(email = ? AND ip <=> ?) AS cuenta_ip,
          SUM(ip <=> ?) AS ip15,
          SUM(email = ?) AS cuenta
        FROM intentos_acceso WHERE ts > ?', array($email, $ip, $ip, $email, $q15));
    if ((int) $n['ip15'] >= 30) {
        labs_bloquea('ip', $ip, 60, '30 intentos fallidos en 15 minutos');
        return 'Demasiados intentos fallidos desde tu conexión. Vuelve a probar en una hora.';
    }
    $dia = labs_fila('SELECT COUNT(*) n FROM intentos_acceso WHERE ip <=> ? AND ts > ?', array($ip, labs_hace(86400)));
    if ((int) $dia['n'] >= 100) {
        labs_bloquea('ip', $ip, 24 * 60, '100 intentos fallidos en 24 horas');
        return 'Demasiados intentos fallidos desde tu conexión. Vuelve a probar mañana.';
    }
    if ((int) $n['cuenta_ip'] >= 8) {
        return 'Demasiados intentos fallidos. Espera 15 minutos y vuelve a probar.';
    }
    if ((int) $n['cuenta'] >= 40) {
        return 'Esta cuenta está recibiendo muchos intentos fallidos y se ha frenado 15 minutos por seguridad.';
    }
    return null;
}

/** Responde un error de acceso guardando antes lo que haya que guardar. */
function labs_niega($estado, $error, $descripcion, $extra = array())
{
    if (labs_db()->inTransaction()) {
        labs_db()->commit();
    }
    labs_json(array_merge(array('error' => $error, 'error_description' => $descripcion), $extra), $estado);
}

/** Apunta un intento fallido (cuenta para el freno y para el Centro de Seguridad). */
function labs_fallo_acceso($email, $c, $resultado, $detalle)
{
    labs_q('INSERT INTO intentos_acceso (email, ip, ts) VALUES (?,?,?)', array($email, labs_ip(), labs_ahora()));
    labs_registra_acceso($c ? $c['id'] : null, $email, $resultado, $detalle);
    if ($email === mb_strtolower(LABS_RAIZ_EMAIL)) {
        labs_registra_raiz('FALLIDO', $c ? $c['id'] : null, $email, $detalle);
    }
}

function labs_auth_token($tipo, $cuerpo)
{
    if ($tipo === 'password') {
        $email = mb_strtolower(trim((string) (isset($cuerpo['email']) ? $cuerpo['email'] : '')));
        $clave = (string) (isset($cuerpo['password']) ? $cuerpo['password'] : '');
        $codigo = trim((string) (isset($cuerpo['codigo']) ? $cuerpo['codigo'] : ''));
        if ($email === '' || $clave === '' || mb_strlen($email) > 190 || strlen($clave) > 400) {
            labs_json(array('error' => 'invalid_request', 'error_description' => 'Faltan el correo o la contraseña.'), 400);
        }
        $freno = labs_freno_acceso($email);
        if ($freno) {
            labs_registra_acceso(null, $email, 'bloqueado', $freno);
            labs_niega(429, 'too_many_requests', $freno);
        }
        $c = labs_fila('SELECT id, email, clave_hash FROM cuentas WHERE LOWER(email) = ?', array($email));
        $ok = $c && $c['clave_hash'] && password_verify($clave, $c['clave_hash']);
        if (!$ok) {
            // Mismo tiempo de respuesta exista o no la cuenta: no delata quién está dado de alta.
            if (!$c || !$c['clave_hash']) {
                labs_hash_clave($clave);
            }
            labs_fallo_acceso($email, $c, 'fallo', $c && !$c['clave_hash'] ? 'Cuenta aún sin contraseña (api/instalar.php)' : 'Contraseña incorrecta');
            labs_niega(400, 'invalid_grant', 'Invalid login credentials');
        }

        // Cuenta suspendida o dada de baja: la contraseña es buena, pero no entra.
        $p = labs_fila('SELECT id, nombre, apellidos, raiz, rol, estado FROM perfiles WHERE id = ?', array($c['id']));
        if ($p && $p['estado'] !== 'Activo') {
            labs_registra_acceso($c['id'], $email, 'inactiva', 'Cuenta ' . $p['estado']);
            $txt = array('Suspendido' => 'suspendida', 'Dado de baja' => 'dada de baja');
            labs_niega(403, 'account_inactive', 'Tu cuenta está ' . (isset($txt[$p['estado']]) ? $txt[$p['estado']] : 'inactiva') . '. Contacta con tu administrador.');
        }

        // Doble factor: con la contraseña sola no basta.
        if (labs_2fa_activo($c['id'])) {
            if ($codigo === '') {
                labs_registra_acceso($c['id'], $email, 'mfa_pedido', null);
                labs_niega(401, 'mfa_required', 'Introduce el código de 6 cifras de tu aplicación de autenticación.', array('mfa' => true));
            }
            $r = labs_2fa_comprueba($c['id'], $codigo);
            if (!$r) {
                labs_fallo_acceso($email, $c, 'mfa_fallo', 'Código de doble factor incorrecto');
                labs_niega(401, 'mfa_invalid', 'El código no es correcto o ya se ha usado. Espera al siguiente y vuelve a probar.', array('mfa' => true));
            }
            if ($r === 'recuperacion') {
                labs_anota('Entrada con código de recuperación', 'Se ha gastado uno de los códigos de recuperación del doble factor.', $p ?: null, null);
            }
        }

        if (labs_clave_anticuada($c['clave_hash'])) {
            labs_q('UPDATE cuentas SET clave_hash = ? WHERE id = ?', array(labs_hash_clave($clave), $c['id']));
        }
        labs_q('DELETE FROM intentos_acceso WHERE email = ? AND ip <=> ?', array($email, labs_ip()));

        // Aviso si entra desde una conexión que nunca había usado.
        $conocida = labs_fila("SELECT 1 FROM registro_accesos WHERE usuario_id = ? AND resultado = 'ok' AND ip <=> ? LIMIT 1", array($c['id'], labs_ip()));
        $alguna = labs_fila("SELECT 1 FROM registro_accesos WHERE usuario_id = ? AND resultado = 'ok' LIMIT 1", array($c['id']));
        if ($alguna && !$conocida && $p) {
            labs_anota('Acceso desde una conexión nueva', 'IP ' . labs_ip() . ' · ' . mb_substr((string) labs_navegador(), 0, 120), $p, null);
        }
        labs_registra_acceso($c['id'], $email, 'ok', null);

        if ($p && (int) $p['raiz'] === 1) {
            labs_sincroniza_raiz();
            labs_registra_raiz('ENTRADA', $c['id'], $c['email']);
        }
        return labs_emite_sesion($c['id'], $c['email']);
    }

    if ($tipo === 'refresh_token') {
        $r = (string) (isset($cuerpo['refresh_token']) ? $cuerpo['refresh_token'] : '');
        $t = $r === '' ? null : labs_fila('SELECT t.id, t.usuario_id, t.creado, t.ultimo_uso, c.email FROM tokens_sesion t JOIN cuentas c ON c.id = t.usuario_id
                                           WHERE t.renovacion_hash = ? AND t.renovacion_expira > ? FOR UPDATE',
            array(hash('sha256', $r), labs_ahora()));
        if (!$t) {
            labs_json(array('error' => 'invalid_grant', 'error_description' => 'Invalid Refresh Token'), 400);
        }
        $motivo = labs_sesion_caducada($t);
        $activa = labs_fila("SELECT 1 FROM perfiles WHERE id = ? AND estado = 'Activo'", array($t['usuario_id']));
        if ($motivo || !$activa) {
            labs_q('DELETE FROM tokens_sesion WHERE id = ?', array($t['id']));
            labs_niega(400, 'invalid_grant', $motivo ?: 'La cuenta ya no está activa.');
        }
        // Rotación: la ficha de renovación usada deja de valer.
        $acceso = rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
        $renov = rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
        $exp_a = new DateTime('now', new DateTimeZone('UTC'));
        $exp_a->modify('+' . (int) LABS_ACCESO_SEGUNDOS . ' seconds');
        $exp_r = new DateTime('now', new DateTimeZone('UTC'));
        $exp_r->modify('+' . (int) LABS_RENOVACION_DIAS . ' days');
        labs_q('UPDATE tokens_sesion SET acceso_hash = ?, renovacion_hash = ?, acceso_expira = ?, renovacion_expira = ?, ultimo_uso = ?, ip = ? WHERE id = ?',
            array(hash('sha256', $acceso), hash('sha256', $renov), $exp_a->format('Y-m-d H:i:s.u'),
                $exp_r->format('Y-m-d H:i:s.u'), labs_ahora(), labs_ip(), $t['id']));
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
    // Freno propio: 5 avisos por IP cada hora. No cuenta como intento de
    // acceso, para que nadie pueda bloquear una cuenta pidiendo avisos.
    if ($email === '' || mb_strlen($email) > 190 || labs_freno('recuperar|' . labs_ip(), 5, 3600)) {
        return;
    }
    $p = labs_fila('SELECT id, nombre, apellidos FROM perfiles WHERE LOWER(email) = ?', array($email));
    if ($p) {
        labs_anota('Solicitud de nueva contraseña', 'Pedida desde la pantalla de acceso. Restablécela desde Usuarios y Accesos.',
            $p, null);
    }
}
