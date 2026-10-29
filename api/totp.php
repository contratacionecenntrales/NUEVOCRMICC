<?php
/**
 * LABS COMMAND CENTER 360™ · Doble factor (TOTP, RFC 6238)
 *
 * El mismo sistema que usan los bancos y Google: la aplicación del móvil
 * (Google Authenticator, Microsoft Authenticator, Authy...) genera un código
 * de 6 cifras que cambia cada 30 segundos. Sin el móvil, la contraseña sola
 * no basta para entrar.
 *
 * - Cada código sirve una sola vez (no se puede reutilizar uno interceptado).
 * - Se acepta el código anterior y el siguiente, por si el reloj del móvil va
 *   un poco desfasado.
 * - 10 códigos de recuperación de un solo uso para cuando se pierde el móvil.
 */
defined('LABS') || exit;

function labs_b32_codifica($bin)
{
    $abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    $bits = '';
    foreach (str_split($bin) as $c) {
        $bits .= str_pad(decbin(ord($c)), 8, '0', STR_PAD_LEFT);
    }
    $out = '';
    foreach (str_split($bits, 5) as $trozo) {
        $out .= $abc[bindec(str_pad($trozo, 5, '0'))];
    }
    return $out;
}

function labs_b32_decodifica($txt)
{
    $abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    $txt = strtoupper(preg_replace('/[^A-Za-z2-7]/', '', $txt));
    $bits = '';
    foreach (str_split($txt) as $c) {
        $bits .= str_pad(decbin(strpos($abc, $c)), 5, '0', STR_PAD_LEFT);
    }
    $out = '';
    foreach (str_split($bits, 8) as $byte) {
        if (strlen($byte) === 8) {
            $out .= chr(bindec($byte));
        }
    }
    return $out;
}

/** Código de 6 cifras para un paso de 30 segundos. */
function labs_totp_codigo($secreto_b32, $paso)
{
    $clave = labs_b32_decodifica($secreto_b32);
    $msg = pack('N2', ($paso >> 32) & 0xFFFFFFFF, $paso & 0xFFFFFFFF);
    $h = hash_hmac('sha1', $msg, $clave, true);
    $o = ord($h[19]) & 0x0F;
    $num = ((ord($h[$o]) & 0x7F) << 24) | (ord($h[$o + 1]) << 16) | (ord($h[$o + 2]) << 8) | ord($h[$o + 3]);
    return str_pad((string) ($num % 1000000), 6, '0', STR_PAD_LEFT);
}

function labs_totp_paso()
{
    return (int) floor(time() / 30);
}

/** Fila de doble factor del usuario (o null). */
function labs_2fa($usuario_id)
{
    return labs_fila('SELECT * FROM cuentas_2fa WHERE usuario_id = ?', array($usuario_id));
}

function labs_2fa_activo($usuario_id)
{
    $f = labs_2fa($usuario_id);
    return $f && (int) $f['activo'] === 1;
}

/**
 * Comprueba un código (6 cifras) o uno de recuperación (XXXX-XXXX).
 * Devuelve 'ok', 'recuperacion' o false. Marca el código como usado.
 */
function labs_2fa_comprueba($usuario_id, $codigo, $exigir_activo = true)
{
    $f = labs_fila('SELECT * FROM cuentas_2fa WHERE usuario_id = ? FOR UPDATE', array($usuario_id));
    if (!$f || ($exigir_activo && (int) $f['activo'] !== 1)) {
        return false;
    }
    $codigo = strtoupper(trim((string) $codigo));
    if (preg_match('/^\d{6}$/', $codigo)) {
        $ahora = labs_totp_paso();
        foreach (array(-1, 0, 1) as $d) {
            $p = $ahora + $d;
            if ($p > (int) $f['ultimo_paso'] && hash_equals(labs_totp_codigo($f['secreto'], $p), $codigo)) {
                labs_q('UPDATE cuentas_2fa SET ultimo_paso = ? WHERE usuario_id = ?', array($p, $usuario_id));
                return 'ok';
            }
        }
        return false;
    }
    if ($exigir_activo && preg_match('/^[A-Z0-9]{4}-?[A-Z0-9]{4}$/', $codigo)) {
        $limpio = str_replace('-', '', $codigo);
        $lista = json_decode((string) $f['recuperacion'], true) ?: array();
        foreach ($lista as $i => $h) {
            if (hash_equals($h, hash('sha256', $limpio))) {
                unset($lista[$i]);
                labs_q('UPDATE cuentas_2fa SET recuperacion = ? WHERE usuario_id = ?', array(json_encode(array_values($lista)), $usuario_id));
                return 'recuperacion';
            }
        }
    }
    return false;
}

/** Empieza la activación: secreto nuevo (aún inactivo) y su enlace otpauth://. */
function labs_2fa_inicia($usuario_id, $email)
{
    $secreto = labs_b32_codifica(random_bytes(20));
    labs_q('INSERT INTO cuentas_2fa (usuario_id, secreto, activo, ultimo_paso, recuperacion, creado) VALUES (?,?,0,0,NULL,?)
            ON DUPLICATE KEY UPDATE secreto = IF(activo = 1, secreto, VALUES(secreto)), creado = VALUES(creado)',
        array($usuario_id, $secreto, labs_ahora()));
    $f = labs_2fa($usuario_id);
    if ((int) $f['activo'] === 1) {
        throw new ErrorApi('El doble factor ya está activado en esta cuenta.', 409, 'MFA_YA_ACTIVO');
    }
    $etiqueta = rawurlencode('Labs24k CRM:' . $email);
    return array(
        'secreto' => $f['secreto'],
        'otpauth' => 'otpauth://totp/' . $etiqueta . '?secret=' . $f['secreto'] . '&issuer=' . rawurlencode('Labs24k CRM')
            . '&algorithm=SHA1&digits=6&period=30',
    );
}

/** Termina la activación con un código correcto. Devuelve los códigos de recuperación. */
function labs_2fa_activa($usuario_id, $codigo)
{
    if (labs_2fa_comprueba($usuario_id, $codigo, false) !== 'ok') {
        throw new ErrorApi('El código no es correcto. Comprueba que la hora del móvil es automática y prueba con el siguiente.', 400, 'MFA_CODIGO');
    }
    $abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    $claros = array();
    $hashes = array();
    for ($i = 0; $i < 10; $i++) {
        $c = '';
        for ($j = 0; $j < 8; $j++) {
            $c .= $abc[random_int(0, strlen($abc) - 1)];
        }
        $claros[] = substr($c, 0, 4) . '-' . substr($c, 4);
        $hashes[] = hash('sha256', $c);
    }
    labs_q('UPDATE cuentas_2fa SET activo = 1, activado = ?, recuperacion = ? WHERE usuario_id = ?',
        array(labs_ahora(), json_encode($hashes), $usuario_id));
    return $claros;
}

function labs_2fa_quita($usuario_id)
{
    labs_q('DELETE FROM cuentas_2fa WHERE usuario_id = ?', array($usuario_id));
}
