<?php
/**
 * LABS COMMAND CENTER 360™ · Administración de usuarios
 * Lo que hacía la Edge Function «admin-usuarios» de Supabase:
 *   POST   ''              alta de usuario
 *   POST   /{id}/correo    cambio de correo
 *   POST   /{id}/password  restablecer contraseña
 *   POST   /{id}/ver-como  abrir la cuenta de alguien de tu equipo
 *   DELETE /{id}           borrar cuenta
 * Devuelve array(código HTTP, cuerpo).
 */
defined('LABS') || exit;

function labs_admin($metodo, $id, $accion, $b)
{
    $quien = labs_usuario(true);
    if (!empty($quien['sin_ficha'])) {
        throw new ErrorApi('No tienes permiso para esta operación (tu cuenta figura como: sin ficha en perfiles).', 403, 'ROL_INSUFICIENTE');
    }
    $activo = $quien['estado'] === 'Activo';
    $es_admin = $activo && $quien['rol'] === 'admin';
    $delegados = $quien['rol'] === 'manager' ? array('commercial', 'backoffice') : array('commercial');
    $alta_delegada = !$es_admin && $activo && $metodo === 'POST' && !$id &&
        ($quien['rol'] === 'manager' || (isset($quien['permisos']['sys.alta_agentes']) && $quien['permisos']['sys.alta_agentes'] === true));
    $ver_como = $activo && $metodo === 'POST' && $id && $accion === 'ver-como';

    if (!$es_admin && !$alta_delegada && !$ver_como) {
        $rol_txt = $quien['rol'] . ($quien['estado'] !== 'Activo' ? ', ' . $quien['estado'] : '');
        throw new ErrorApi('No tienes permiso para esta operación (tu cuenta figura como: ' . $rol_txt . ').', 403, 'ROL_INSUFICIENTE');
    }
    $b = is_array($b) ? $b : array();

    /* --- VER COMO -------------------------------------------------------- */
    if ($ver_como) {
        if ($quien['ver_como_de']) {
            throw new ErrorApi('Ya estás dentro de otra cuenta. Vuelve primero a la tuya.', 409, 'VER_COMO');
        }
        $destino = labs_fila('SELECT id, nombre, apellidos, email, rol, estado, raiz, superior_id FROM perfiles WHERE id = ?', array($id));
        if (!$destino) {
            throw new ErrorApi('Usuario no encontrado.', 404, 'NO_ENCONTRADO');
        }
        if ($destino['id'] === $quien['id']) {
            throw new ErrorApi('Ya estás en tu cuenta.', 409, 'MISMA_CUENTA');
        }
        if ((int) $destino['raiz'] === 1) {
            throw new ErrorApi('En la cuenta del Super Administrador no se puede entrar.', 403, 'RAIZ_PROTEGIDA');
        }
        $a_su_cargo = $destino['superior_id'] === $quien['id'];
        $por_rango = $quien['raiz'] || ($quien['rol'] === 'admin' && $destino['rol'] !== 'admin');
        if (!$a_su_cargo && !$por_rango) {
            throw new ErrorApi('Solo puedes entrar en las cuentas de las personas que tienes a tu cargo.', 403, 'NO_ES_DE_TU_EQUIPO');
        }
        if ($destino['estado'] !== 'Activo') {
            throw new ErrorApi('Esa cuenta no está activa.', 409, 'CUENTA_INACTIVA');
        }
        $nombre = trim($destino['nombre'] . ' ' . $destino['apellidos']);
        labs_anota('Entrada con «Ver como»', labs_nombre($quien) . ' ha entrado en su cuenta.', $destino);
        $s = labs_emite_sesion($destino['id'], $destino['email'], $quien['id']);
        return array(200, array('sesion' => array(
            'access_token' => $s['access_token'], 'refresh_token' => $s['refresh_token'],
            'expires_in' => $s['expires_in'], 'user' => array('id' => $destino['id'])),
            'agente' => array('id' => $destino['id'], 'nombre' => $nombre, 'email' => $destino['email'])));
    }

    /* --- ALTA ------------------------------------------------------------- */
    if ($metodo === 'POST' && !$id) {
        $nombre = trim((string) ($b['nombre'] ?? ''));
        $apellidos = trim((string) ($b['apellidos'] ?? ''));
        $email = mb_strtolower(trim((string) ($b['email'] ?? '')));
        $rol = (string) ($b['rol'] ?? '');
        if (mb_strlen($nombre) < 2) {
            throw new ErrorApi('Nombre no válido.', 400, 'NOMBRE_INVALIDO');
        }
        if (!preg_match('/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i', $email)) {
            throw new ErrorApi('Correo no válido.', 400, 'EMAIL_INVALIDO');
        }
        if (!in_array($rol, array('admin', 'manager', 'commercial', 'backoffice'), true)) {
            throw new ErrorApi('Rol no válido.', 400, 'ROL_INVALIDO');
        }
        if ($alta_delegada && !in_array($rol, $delegados, true)) {
            throw new ErrorApi($quien['rol'] === 'manager'
                ? 'Solo puedes dar de alta cuentas de Gestión Comercial o Back Office.'
                : 'Solo puedes dar de alta agentes (Gestión Comercial).', 403, 'ROL_NO_PERMITIDO');
        }
        $prefijo = isset($b['prefijo']) && $b['prefijo'] !== '' ? (string) $b['prefijo'] : '+34';
        if (!preg_match('/^\+\d{1,3}$/', $prefijo)) {
            throw new ErrorApi('El prefijo debe ser internacional, como +34.', 400, 'PREFIJO_INVALIDO');
        }
        $superior = $quien['id'];
        if ($es_admin && !empty($b['superior_id'])) {
            $sup = labs_fila('SELECT id, estado FROM perfiles WHERE id = ?', array((string) $b['superior_id']));
            if (!$sup || $sup['estado'] !== 'Activo') {
                throw new ErrorApi('El superior elegido no es válido.', 400, 'SUPERIOR_INVALIDO');
            }
            $superior = $sup['id'];
        }
        $sf = labs_fila('SELECT rol, raiz FROM perfiles WHERE id = ?', array($superior));
        if (!$sf || labs_rango($sf['rol'], (int) $sf['raiz'] === 1) <= labs_rango($rol, false)) {
            $r = labs_fila('SELECT id FROM perfiles WHERE raiz = 1 LIMIT 1');
            $superior = $r ? $r['id'] : null;
        }
        if (labs_fila('SELECT 1 FROM cuentas WHERE LOWER(email) = ?', array($email)) ||
            labs_fila('SELECT 1 FROM perfiles WHERE LOWER(email) = ?', array($email))) {
            throw new ErrorApi('Ya existe una cuenta con ese correo.', 409, 'EMAIL_DUPLICADO');
        }
        $clave = (string) ($b['password'] ?? '');
        if ($clave === '') {
            $clave = labs_clave_aleatoria();
        }
        $faltan = labs_revisa_clave($clave, array('email' => $email, 'nombre' => $nombre, 'apellidos' => $apellidos));
        if ($faltan) {
            throw new ErrorApi('La contraseña necesita ' . implode(', ', $faltan) . '.', 400, 'CLAVE_DEBIL');
        }
        $perfil = labs_crea_usuario(array(
            'nombre' => $nombre, 'apellidos' => $apellidos, 'email' => $email, 'prefijo' => $prefijo,
            'telefono' => trim((string) ($b['telefono'] ?? '')), 'extension' => (string) ($b['extension'] ?? ''),
            'rol' => $rol, 'google' => ($b['google'] ?? false) === true, 'superior_id' => $superior,
        ), $clave);
        if ($alta_delegada) {
            labs_anota('Cuenta creada', 'Alta delegada (' . $rol . ') · relación ' . $perfil['rel'], $perfil);
        }
        return array(201, array('usuario' => $perfil, 'passwordInicial' => $clave));
    }

    if (!$id || !labs_es_uuid($id)) {
        throw new ErrorApi('Operación no reconocida.', 404, 'RUTA_DESCONOCIDA');
    }

    /* --- CAMBIO DE CORREO -------------------------------------------------- */
    if ($metodo === 'POST' && $accion === 'correo') {
        $nuevo = mb_strtolower(trim((string) ($b['email'] ?? '')));
        if (!preg_match('/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i', $nuevo)) {
            throw new ErrorApi('Correo no válido.', 400, 'EMAIL_INVALIDO');
        }
        $destino = labs_fila('SELECT id, nombre, apellidos, email, raiz FROM perfiles WHERE id = ?', array($id));
        if (!$destino) {
            throw new ErrorApi('Usuario no encontrado.', 404, 'NO_ENCONTRADO');
        }
        if ((int) $destino['raiz'] === 1) {
            throw new ErrorApi('El correo de la cuenta de raíz no se cambia.', 409, 'RAIZ_EMAIL_FIJO');
        }
        if ($destino['email'] === $nuevo) {
            return array(200, array('ok' => true, 'email' => $nuevo));
        }
        if (labs_fila('SELECT 1 FROM cuentas WHERE LOWER(email) = ? AND id <> ?', array($nuevo, $id)) ||
            labs_fila('SELECT 1 FROM perfiles WHERE LOWER(email) = ? AND id <> ?', array($nuevo, $id))) {
            throw new ErrorApi('Ya existe una cuenta con ese correo.', 409, 'EMAIL_DUPLICADO');
        }
        labs_q('UPDATE cuentas SET email = ?, actualizado = ? WHERE id = ?', array($nuevo, labs_ahora(), $id));
        labs_q('UPDATE perfiles SET email = ?, actualizado = ? WHERE id = ?', array($nuevo, labs_ahora(), $id));
        labs_anota('Correo cambiado', $destino['email'] . ' → ' . $nuevo, $destino);
        return array(200, array('ok' => true, 'email' => $nuevo));
    }

    /* --- RESTABLECER CONTRASEÑA ------------------------------------------- */
    if ($metodo === 'POST' && $accion === 'password') {
        $destino = labs_fila('SELECT id, nombre, apellidos, email FROM perfiles WHERE id = ?', array($id));
        if (!$destino) {
            throw new ErrorApi('Usuario no encontrado.', 404, 'NO_ENCONTRADO');
        }
        $clave = (string) ($b['password'] ?? '');
        if ($clave === '') {
            $clave = labs_clave_aleatoria();
        }
        $faltan = labs_revisa_clave($clave, $destino);
        if ($faltan) {
            throw new ErrorApi('La contraseña necesita ' . implode(', ', $faltan) . '.', 400, 'CLAVE_DEBIL');
        }
        labs_pon_clave($id, $clave);
        return array(200, array('ok' => true, 'passwordInicial' => $clave));
    }

    /* --- BORRAR ------------------------------------------------------------ */
    if ($metodo === 'DELETE') {
        $destino = labs_fila('SELECT id, nombre, apellidos, rel, rol, raiz FROM perfiles WHERE id = ?', array($id));
        if (!$destino) {
            throw new ErrorApi('Usuario no encontrado.', 404, 'NO_ENCONTRADO');
        }
        if ((int) $destino['raiz'] === 1) {
            labs_anota('Intento bloqueado sobre la cuenta de raíz', 'Se intentó eliminar el Super Administrador de raíz.', $destino);
            // La anotación se guarda aunque la operación se rechace.
            labs_db()->commit();
            labs_db()->beginTransaction();
            throw new ErrorApi('El Super Administrador de raíz no se puede eliminar.', 409, 'RAIZ_INDESTRUCTIBLE');
        }
        if ($destino['id'] === $quien['id']) {
            throw new ErrorApi('No puedes eliminar tu propia cuenta.', 409, 'AUTO_BORRADO');
        }
        labs_borra_usuario($id);
        return array(200, array('ok' => true));
    }

    throw new ErrorApi('Operación no reconocida.', 404, 'RUTA_DESCONOCIDA');
}
