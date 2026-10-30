<?php
/**
 * LABS COMMAND CENTER 360™ · Registro de tablas
 *
 * Para cada tabla que el panel puede tocar: sus columnas (tipo y valor por
 * defecto), qué operaciones admite y QUIÉN puede hacer cada una.
 *
 * Es la traducción de las políticas RLS y los disparadores de los guiones de
 * Supabase (01 a 17). Una tabla que no está aquí no existe para el panel.
 *
 * Tipos: i entero · n número · t texto · b sí/no · j JSON · s fecha y hora ·
 *        d fecha · u identificador (uuid)
 *
 * Reglas (todas opcionales; si falta una, esa operación no ve ni toca nada):
 *   leer($u)           → condición SQL de las filas que puede ver
 *   crear($fila)       → true si puede insertar esa fila
 *   editar($u)         → condición SQL de las filas que puede modificar
 *   editar_ok($fila)   → true si la fila, ya modificada, sigue siendo válida
 *   borrar($u)         → condición SQL de las filas que puede borrar
 *   valida($fila)      → null, o el mensaje de error si un dato no es válido
 *   antes_crear / antes_editar / despues_crear / despues_editar /
 *   antes_borrar / despues_borrar / al_final  → lo que hacían los disparadores
 */
defined('LABS') || exit;

function labs_si($cond)
{
    return $cond ? '1=1' : '1=0';
}

function labs_uidq()
{
    return labs_quote(labs_uid());
}

function labs_falla_check($tabla, $msg = null)
{
    throw new ErrorApi($msg ?: 'Un dato no es válido (tabla «' . $tabla . '»).', 400, '23514');
}

/* Comprobaciones de formato reutilizables. */
function labs_largo($v, $min, $max)
{
    $n = mb_strlen(trim((string) $v));
    return $n >= $min && $n <= $max;
}

function labs_en($v, $lista)
{
    return in_array($v, $lista, true);
}

/** Condición SQL: el contacto $col es visible para el usuario con sesión. */
function labs_contacto_visible($col)
{
    $amplio = in_array(labs_mi_rol(), array('admin', 'manager', 'backoffice'), true);
    return 'EXISTS (SELECT 1 FROM contactos cx WHERE cx.id = ' . $col . ' AND ' .
        ($amplio ? '1=1' : 'cx.gestor_id = ' . labs_uidq()) . ')';
}

function labs_contacto_visible_id($id)
{
    if ($id === null) {
        return false;
    }
    return (bool) labs_fila('SELECT 1 FROM contactos WHERE id = ? AND ' . labs_contacto_visible('contactos.id'), array($id));
}

/** Condición SQL: el ticket $col lo ve el usuario (gestor de soporte, autor o asignado). */
function labs_ticket_visible($col)
{
    if (labs_puedo('soporte.gestionar')) {
        return 'EXISTS (SELECT 1 FROM tickets tx WHERE tx.id = ' . $col . ')';
    }
    $u = labs_uidq();
    return 'EXISTS (SELECT 1 FROM tickets tx WHERE tx.id = ' . $col . ' AND (tx.creado_por = ' . $u . ' OR tx.asignado_a = ' . $u . '))';
}

/** Condición SQL equivalente a dirijo_agente($col). */
function labs_dirijo_sql($col)
{
    $rol = labs_mi_rol();
    if ($rol === 'admin') {
        return '1=1';
    }
    if ($rol === null) {
        return '1=0';
    }
    return 'EXISTS (SELECT 1 FROM perfiles px WHERE px.id = ' . $col . ' AND px.superior_id = ' . labs_uidq() . ')';
}

/** elige_responsable_ticket(): el responsable activo de ese rol con menos incidencias abiertas. */
function labs_elige_responsable($rol)
{
    $f = labs_fila("SELECT p.id FROM perfiles p WHERE p.rol = ? AND p.estado = 'Activo'
                    ORDER BY (SELECT COUNT(*) FROM tickets t WHERE t.asignado_a = p.id
                              AND t.estado NOT IN ('resuelto','cerrado')) ASC, p.id ASC LIMIT 1", array($rol));
    return $f ? $f['id'] : null;
}

function labs_tablas()
{
    static $T = null;
    if ($T !== null) {
        return $T;
    }
    $T = array();
    $AHORA = '@ahora';
    $HOY = '@hoy';

    /* ===================================================================
       PERFILES · 01, 06, 08, 12, 14, 15, 17
       =================================================================== */
    $T['perfiles'] = array(
        'pk' => 'id', 'gen' => null,
        'ops' => array('select', 'update', 'delete'),
        'cols' => array(
            'id' => array('u'), 'raiz' => array('b', false), 'nombre' => array('t'), 'apellidos' => array('t', ''),
            'email' => array('t'), 'prefijo' => array('t', '+34'), 'telefono' => array('t', ''), 'extension' => array('t', ''),
            'rol' => array('t', 'commercial'), 'estado' => array('t', 'Activo'), 'rel' => array('t'),
            'avatar_url' => array('t'), 'google' => array('b', false), 'doble_factor' => array('b', false),
            'debe_cambiar' => array('b', true), 'permisos' => array('j', array()), 'preferencias' => array('j', array()),
            'api_token' => array('t'), 'alta' => array('d', $HOY), 'ultimo_acceso' => array('s'),
            'modulos_visibles' => array('j'), 'rol_personalizado_id' => array('u'), 'superior_id' => array('u'),
            'empresa' => array('t', ''), 'cif' => array('t', ''), 'cargo' => array('t', ''),
            'creado' => array('s', $AHORA), 'actualizado' => array('s', $AHORA),
        ),
        'leer' => function () {
            if (in_array(labs_mi_rol(), array('admin', 'manager'), true)) {
                return '1=1';
            }
            $c = 'id = ' . labs_uidq();
            if (labs_puedo('sys.alta_agentes')) {
                $c .= " OR rol = 'commercial'";
            }
            return $c;
        },
        // Cada uno su ficha; el admin, todas; el jefe, las de su equipo (gestiono).
        'editar' => function () {
            $u = labs_usuario();
            $c = 'id = ' . labs_uidq();
            if (labs_activo()) {
                if ($u['raiz'] || $u['rol'] === 'admin') {
                    return '1=1';
                }
                if ($u['rol'] === 'manager') {
                    $c .= " OR (raiz = 0 AND id <> " . labs_uidq() . " AND superior_id = " . labs_uidq() .
                        " AND rol NOT IN ('admin','manager'))";
                }
            }
            return $c;
        },
        'editar_ok' => function () {
            return true;
        },
        'borrar' => function () {
            return labs_si(labs_soy_admin());
        },
        'valida' => function ($f) {
            if (!labs_largo($f['nombre'], 2, 60)) {
                return 'El nombre debe tener entre 2 y 60 caracteres.';
            }
            if (!preg_match('/^\+\d{1,3}$/', (string) $f['prefijo'])) {
                return 'El prefijo debe ser internacional, como +34.';
            }
            if (!preg_match('/^\d{0,6}$/', (string) $f['extension'])) {
                return 'La extensión solo admite hasta 6 cifras.';
            }
            if (!labs_en($f['rol'], array('admin', 'manager', 'commercial', 'backoffice'))) {
                return 'Rol no válido.';
            }
            if (!labs_en($f['estado'], array('Activo', 'Suspendido', 'Dado de baja'))) {
                return 'Estado no válido.';
            }
            if (!preg_match('/^[A-Za-z0-9-]{0,20}$/', (string) $f['cif'])) {
                return 'El CIF solo admite letras, números y guiones.';
            }
            if (mb_strlen((string) $f['empresa']) > 120) {
                return 'El nombre de la empresa es demasiado largo.';
            }
            // Foto de perfil: solo una imagen incrustada o una dirección https, y de tamaño razonable.
            $av = $f['avatar_url'];
            if ($av !== null && $av !== '') {
                if (strlen($av) > 400000) {
                    return 'La foto de perfil es demasiado grande (máximo unos 300 KB).';
                }
                if (!preg_match('#^(data:image/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+|https://[^\s"\'<>]+)$#', $av)) {
                    return 'La foto de perfil tiene que ser una imagen PNG, JPG, WEBP o GIF.';
                }
            }
            return null;
        },
        'antes_crear' => function (&$n) {
            labs_perfil_protege_raiz(null, $n);
            labs_perfil_valida_superior(null, $n, array('superior_id', 'rol', 'raiz'));
        },
        'antes_editar' => function ($v, &$n, $cols) {
            // El correo es también el usuario de acceso: solo se cambia por
            // la administración de usuarios, que lo cambia a la vez en la
            // identidad. Por aquí se podría dejar desincronizado.
            if ($n['email'] !== $v['email']) {
                throw new ErrorApi('El correo se cambia desde Usuarios y Accesos (administración).', 403, '42501', 'CORREO_SOLO_ADMIN');
            }
            // El cargo (p. ej. «Coordinador») lo pone solo administración: nadie se pone títulos a sí mismo.
            if ((string) $n['cargo'] !== (string) $v['cargo']) {
                $yo = labs_usuario(true);
                if (!$yo['raiz'] && labs_mi_rol() !== 'admin') {
                    throw new ErrorApi('El cargo lo asigna administración.', 403, '42501', 'CARGO_SOLO_ADMIN');
                }
                if ((int) $v['raiz'] === 1 && !$yo['raiz']) {
                    throw new ErrorApi('El cargo del Super Administrador solo lo cambia él mismo.', 403, '42501', 'RAIZ_PROTEGIDA');
                }
                $n['cargo'] = mb_substr(trim((string) $n['cargo']), 0, 60);
            }
            // Mismo orden en que Postgres lanzaba los disparadores.
            labs_perfil_limita_jefe($v, $n);
            labs_perfil_protege_raiz($v, $n);
            labs_perfil_sin_autoescalada($v, $n);
            if (array_intersect($cols, array('superior_id', 'rol', 'raiz'))) {
                labs_perfil_valida_superior($v, $n, $cols);
            }
        },
        'antes_borrar' => function ($v) {
            if ((int) $v['raiz'] === 1) {
                throw new ErrorApi('El Super Administrador de raíz no se puede eliminar.', 400, '23514', 'RAIZ_INDESTRUCTIBLE');
            }
        },
        'despues_crear' => function ($n) {
            labs_perfil_anota(null, $n);
        },
        'despues_editar' => function ($v, $n) {
            labs_perfil_anota($v, $n);
            // Suspender o dar de baja corta en el acto todas sus sesiones abiertas.
            if ($n['estado'] !== 'Activo' && $v['estado'] === 'Activo') {
                labs_q('DELETE FROM tokens_sesion WHERE usuario_id = ?', array($n['id']));
            }
        },
        'despues_borrar' => function ($v) {
            labs_perfil_anota($v, null);
            // La identidad (cuenta y sesiones) se va con la ficha.
            labs_q('DELETE FROM cuentas WHERE id = ?', array($v['id']));
        },
        // exige_un_admin(): al terminar, tiene que quedar al menos un admin activo.
        'al_final' => function () {
            if (!labs_fila("SELECT 1 FROM perfiles WHERE rol = 'admin' AND estado = 'Activo'")) {
                throw new ErrorApi('No puedes dejar el sistema sin ningún administrador activo.', 400, '23514', 'ULTIMO_ADMIN');
            }
        },
    );

    /* =================================================================== */
    $T['permisos_catalogo'] = array(
        'pk' => 'clave', 'gen' => null, 'ops' => array('select'),
        'cols' => array('clave' => array('t'), 'grupo' => array('t'), 'nombre' => array('t'),
            'descripcion' => array('t', ''), 'orden' => array('i', 0)),
        'leer' => function () {
            return labs_si(labs_uid() !== null);
        },
    );

    /* La bitácora solo la escribe el servidor (06-endurecimiento). */
    $T['bitacora'] = array(
        'pk' => 'id', 'gen' => 'uuid', 'ops' => array('select'),
        'cols' => array('id' => array('u'), 'ts' => array('s', $AHORA), 'actor_id' => array('u'),
            'actor_nombre' => array('t', 'sistema'), 'actor_rol' => array('t'), 'destino_id' => array('u'),
            'destino_nombre' => array('t'), 'accion' => array('t'), 'detalle' => array('t', ''),
            'ip' => array('t'), 'agente' => array('t')),
        'leer' => function () {
            if (in_array(labs_mi_rol(), array('admin', 'manager'), true)) {
                return '1=1';
            }
            return 'destino_id = ' . labs_uidq();
        },
    );

    $T['accesos_raiz'] = array(
        'pk' => 'id', 'gen' => 'uuid', 'ops' => array('select'),
        'cols' => array('id' => array('u'), 'ts' => array('s', $AHORA), 'evento' => array('t'), 'usuario' => array('u'),
            'email' => array('t'), 'ip' => array('t'), 'agente' => array('t'), 'motivo' => array('t')),
        'leer' => function () {
            return labs_si(labs_soy_admin());
        },
    );

    $T['sesiones'] = array(
        'pk' => 'id', 'gen' => 'uuid', 'ops' => array('select', 'insert', 'update', 'delete'),
        'cols' => array('id' => array('u'), 'usuario_id' => array('u'), 'dispositivo' => array('t', ''),
            'ip' => array('t'), 'ubicacion' => array('t'), 'inicio' => array('s', $AHORA), 'visto' => array('s', $AHORA)),
        'leer' => function () {
            return labs_soy_admin() ? '1=1' : 'usuario_id = ' . labs_uidq();
        },
        'crear' => function ($f) {
            return $f['usuario_id'] === labs_uid();
        },
        'antes_crear' => function (&$n) {
            // La IP la pone el servidor: el navegador no la conoce.
            if (empty($n['ip'])) {
                $n['ip'] = labs_ip();
            }
        },
        'borrar' => function () {
            return labs_soy_admin() ? '1=1' : 'usuario_id = ' . labs_uidq();
        },
    );

    /* ===================================================================
       NEGOCIO · expedientes, candidatos, presupuestos (01)
       =================================================================== */
    $T['expedientes'] = array(
        'pk' => 'id', 'gen' => 'auto', 'ops' => array('select', 'insert', 'update', 'delete'),
        'cols' => array('id' => array('i'), 'empresa' => array('t'), 'sector' => array('t', ''), 'contacto' => array('t', ''),
            'telefono' => array('t', ''), 'email' => array('t', ''), 'mrr' => array('n', 0), 'estado' => array('t', 'Auditoría inicial'),
            'hito' => array('i', 0), 'satisfaccion' => array('i'), 'gestor_id' => array('u'), 'backoffice_id' => array('u'),
            'alta' => array('d', $HOY), 'creado' => array('s', $AHORA), 'actualizado' => array('s', $AHORA)),
        'actualizado' => true,
        'leer' => function () {
            return labs_si(labs_puedo('exp.ver'));
        },
        'crear' => function () {
            return labs_puedo('exp.ver');
        },
        'editar' => function () {
            return labs_si(labs_puedo('exp.estado') || labs_puedo('exp.hitos'));
        },
        'editar_ok' => function () {
            return labs_puedo('exp.estado') || labs_puedo('exp.hitos');
        },
        'borrar' => function () {
            return labs_si(labs_puedo('exp.borrar'));
        },
        'valida' => function ($f) {
            if ((int) $f['hito'] < 0 || (int) $f['hito'] > 5) {
                return 'El hito va de 0 a 5.';
            }
            if ($f['satisfaccion'] !== null && ((int) $f['satisfaccion'] < 0 || (int) $f['satisfaccion'] > 100)) {
                return 'La satisfacción va de 0 a 100.';
            }
            return null;
        },
    );

    $T['expediente_log'] = array(
        'pk' => 'id', 'gen' => 'auto', 'ops' => array('select', 'insert', 'update', 'delete'),
        'cols' => array('id' => array('i'), 'expediente_id' => array('i'), 'autor_id' => array('u'), 'autor_nombre' => array('t', ''),
            'autor_rol' => array('t'), 'tipo' => array('t', 'avance'), 'texto' => array('t'), 'ts' => array('s', $AHORA)),
        'leer' => function () {
            return labs_si(labs_puedo('exp.ver'));
        },
        'crear' => function ($f) {
            return labs_puedo('exp.ver') && $f['autor_id'] === labs_uid();
        },
    );

    $T['expediente_docs'] = array(
        'pk' => 'id', 'gen' => 'auto', 'ops' => array('select', 'insert', 'update', 'delete'),
        'cols' => array('id' => array('i'), 'expediente_id' => array('i'), 'nombre' => array('t'), 'tipo' => array('t', ''),
            'ruta' => array('t'), 'subido_por' => array('u'), 'ts' => array('s', $AHORA)),
        'leer' => function () {
            return labs_si(labs_puedo('exp.ver'));
        },
        'crear' => function ($f) {
            return labs_puedo('exp.docs') && $f['subido_por'] === labs_uid();
        },
        'borrar' => function () {
            return labs_si(labs_puedo('exp.borrar'));
        },
    );

    $T['candidatos'] = array(
        'pk' => 'id', 'gen' => 'auto', 'ops' => array('select', 'insert', 'update', 'delete'),
        'cols' => array('id' => array('i'), 'nombre' => array('t'), 'puesto' => array('t', ''), 'email' => array('t', ''),
            'telefono' => array('t', ''), 'fase' => array('t', 'Solicitud recibida'), 'nota' => array('i'), 'origen' => array('t', ''),
            'responsable_id' => array('u'), 'creado' => array('s', $AHORA), 'actualizado' => array('s', $AHORA)),
        'actualizado' => true,
        'leer' => function () {
            return labs_si(labs_puedo('hr.ver'));
        },
        'crear' => function () {
            return labs_puedo('hr.mover');
        },
        'editar' => function () {
            return labs_si(labs_puedo('hr.mover'));
        },
        'editar_ok' => function () {
            return labs_puedo('hr.mover');
        },
        'valida' => function ($f) {
            return ($f['nota'] !== null && ((int) $f['nota'] < 0 || (int) $f['nota'] > 10)) ? 'La nota va de 0 a 10.' : null;
        },
    );

    $T['presupuestos'] = array(
        'pk' => 'id', 'gen' => 'auto', 'ops' => array('select', 'insert', 'update', 'delete'),
        'cols' => array('id' => array('i'), 'codigo' => array('t'), 'cliente' => array('t'), 'expediente_id' => array('i'),
            'autor_id' => array('u'), 'lineas' => array('j', array()), 'base' => array('n', 0), 'iva' => array('n', 21),
            'total' => array('n', 0), 'estado' => array('t', 'Borrador'), 'creado' => array('s', $AHORA)),
        'leer' => function () {
            return labs_si(labs_puedo('presu.ver'));
        },
        'crear' => function ($f) {
            return labs_puedo('presu.crear') && $f['autor_id'] === labs_uid();
        },
        'editar' => function () {
            return labs_puedo('presu.crear') ? 'autor_id = ' . labs_uidq() : '1=0';
        },
        'editar_ok' => function () {
            return labs_puedo('presu.crear');
        },
    );

    /* ===================================================================
       MISSION CONTROL Y CONTRATOS · 04, 05, 06
       =================================================================== */
    $T['agentes'] = array(
        'pk' => 'id', 'gen' => null, 'ops' => array('select', 'insert', 'update', 'delete'),
        'cols' => array('id' => array('t'), 'nombre' => array('t'), 'tipo' => array('t'), 'estado' => array('t', 'offline'),
            'descripcion' => array('t', ''), 'autonomia' => array('t', 'Sugiere y espera aprobación'), 'webhook' => array('t'),
            'metricas' => array('j', array()), 'ultimo_latido' => array('s'), 'creado' => array('s', $AHORA),
            'actualizado' => array('s', $AHORA)),
        'actualizado' => true,
        'leer' => function () {
            return labs_si(in_array(labs_mi_rol(), array('admin', 'manager'), true));
        },
        'crear' => function () {
            return labs_soy_admin();
        },
        'editar' => function () {
            return labs_si(labs_soy_admin());
        },
        'editar_ok' => function () {
            return labs_soy_admin();
        },
        'borrar' => function () {
            return labs_si(labs_soy_admin());
        },
        'valida' => function ($f) {
            if (!labs_en($f['tipo'], array('email', 'whatsapp', 'voice', 'content', 'marketing', 'ceo'))) {
                return 'Tipo de agente no válido.';
            }
            if (!labs_en($f['estado'], array('active', 'paused', 'working', 'offline'))) {
                return 'Estado de agente no válido.';
            }
            if (!labs_en($f['autonomia'], array('Actúa solo', 'Sugiere y espera aprobación', 'Solo informa'))) {
                return 'Autonomía no válida.';
            }
            if ($f['webhook'] !== null && !preg_match('#^https://#', (string) $f['webhook'])) {
                return 'El webhook tiene que empezar por https://';
            }
            return null;
        },
    );

    $T['agente_acciones'] = array(
        'pk' => 'id', 'gen' => 'auto', 'ops' => array('select'),
        'cols' => array('id' => array('i'), 'agente_id' => array('t'), 'ts' => array('s', $AHORA), 'accion' => array('t'),
            'detalle' => array('t', ''), 'resultado' => array('t', 'ok'), 'expediente_id' => array('i'), 'aprobado_por' => array('u')),
        'leer' => function () {
            return labs_si(in_array(labs_mi_rol(), array('admin', 'manager'), true));
        },
    );

    // Contratos bloqueados (art. 32 LOPDGDD): solo los ve administración.
    $contratos_ve = function () {
        if (labs_mi_rol() === 'admin') {
            return '1=1';
        }
        if (in_array(labs_mi_rol(), array('manager', 'backoffice'), true)) {
            return 'bloqueado = 0';
        }
        return 'gestor_id = ' . labs_uidq() . ' AND bloqueado = 0';
    };
    $T['contratos'] = array(
        'pk' => 'id', 'gen' => 'auto', 'ops' => array('select', 'insert', 'update', 'delete'),
        // 06-endurecimiento: estado, token y firma solo los cambia el circuito de firma.
        'upd_cols' => array('cliente', 'cif', 'domicilio', 'representante', 'email', 'telefono',
            'servicio', 'setup', 'mensual', 'meses', 'iva', 'inicio', 'observaciones',
            'gestor_id', 'expediente_id', 'documento_ruta'),
        'cols' => array('id' => array('i'), 'codigo' => array('t'), 'cliente' => array('t'), 'cif' => array('t', ''),
            'domicilio' => array('t', ''), 'representante' => array('t', ''), 'email' => array('t', ''), 'telefono' => array('t', ''),
            'servicio' => array('t'), 'setup' => array('n', 0), 'mensual' => array('n', 0), 'meses' => array('i', 12),
            'iva' => array('n', 21), 'inicio' => array('d', $HOY), 'observaciones' => array('t', ''),
            'estado' => array('t', 'Borrador'), 'enviado_el' => array('s'), 'enviado_por' => array('t'),
            'firmado_el' => array('d'), 'gestor_id' => array('u'), 'expediente_id' => array('i'),
            'documento_ruta' => array('t'), 'token' => array('u'), 'token_expira' => array('s'),
            'token_usado' => array('b', false), 'firma_img' => array('t'), 'firma_nombre' => array('t'),
            'firma_dni' => array('t'), 'firma_ip' => array('t'), 'firma_ua' => array('t'),
            'firma_huella' => array('t'), 'firmado_ts' => array('s'), 'datos_contrato' => array('j', array()),
            'bloqueado' => array('b', false),
            'creado' => array('s', $AHORA), 'actualizado' => array('s', $AHORA)),
        'actualizado' => true,
        'leer' => $contratos_ve,
        'crear' => function ($f) {
            return labs_puedo('presu.crear') && $f['gestor_id'] === labs_uid();
        },
        'antes_crear' => function (&$n) {
            // Un contrato nace siempre en borrador y sin token: el enlace de
            // firma lo emite nuevo_enlace_firma().
            $n['estado'] = 'Borrador';
            foreach (array('token', 'token_expira', 'firma_img', 'firma_nombre', 'firma_dni', 'firma_ip',
                         'firma_ua', 'firma_huella', 'firmado_ts', 'firmado_el', 'enviado_el') as $k) {
                $n[$k] = null;
            }
            $n['token_usado'] = false;
            $n['bloqueado'] = false;
        },
        'editar' => $contratos_ve,
        'editar_ok' => function ($f) {
            return in_array(labs_mi_rol(), array('admin', 'manager', 'backoffice'), true) || $f['gestor_id'] === labs_uid();
        },
        'borrar' => function () {
            return labs_si(labs_puedo('exp.borrar'));
        },
        'valida' => function ($f) {
            if ((int) $f['meses'] < 1 || (int) $f['meses'] > 120) {
                return 'La duración del contrato va de 1 a 120 meses.';
            }
            if ($f['enviado_por'] !== null && !labs_en($f['enviado_por'], array('whatsapp', 'email'))) {
                return 'Canal de envío no válido.';
            }
            return null;
        },
    );

    $T['firma_eventos'] = array(
        'pk' => 'id', 'gen' => 'auto', 'ops' => array('select'),
        'cols' => array('id' => array('i'), 'contrato_id' => array('i'), 'ts' => array('s', $AHORA), 'evento' => array('t'),
            'ip' => array('t'), 'ua' => array('t'), 'detalle' => array('t', '')),
        'leer' => function () {
            if (labs_mi_rol() === 'admin') {
                return '1=1';
            }
            if (in_array(labs_mi_rol(), array('manager', 'backoffice'), true)) {
                return 'EXISTS (SELECT 1 FROM contratos c WHERE c.id = firma_eventos.contrato_id AND c.bloqueado = 0)';
            }
            return 'EXISTS (SELECT 1 FROM contratos c WHERE c.id = firma_eventos.contrato_id AND c.bloqueado = 0 AND c.gestor_id = ' . labs_uidq() . ')';
        },
    );

    /* ===================================================================
       CONTACTOS · 07
       =================================================================== */
    $T['contactos'] = array(
        'pk' => 'id', 'gen' => 'auto', 'ops' => array('select', 'insert', 'update', 'delete'),
        'cols' => array('id' => array('i'), 'tipo' => array('t', 'lead'), 'nombre' => array('t'), 'empresa' => array('t', ''),
            'email' => array('t', ''), 'prefijo' => array('t', '+34'), 'telefono' => array('t', ''), 'origen' => array('t', ''),
            'estado' => array('t', 'Nuevo'), 'especificaciones' => array('t', ''), 'gestor_id' => array('u'),
            'expediente_id' => array('i'), 'etiquetas' => array('t', ''), 'ref_externa' => array('t'),
            'ultima_actividad' => array('s'), 'proximo_contacto' => array('s'),
            'creado' => array('s', $AHORA), 'actualizado' => array('s', $AHORA)),
        'actualizado' => true,
        'leer' => function () {
            if (!labs_puedo('contactos.ver')) {
                return '1=0';
            }
            return in_array(labs_mi_rol(), array('admin', 'manager', 'backoffice'), true) ? '1=1' : 'gestor_id = ' . labs_uidq();
        },
        'crear' => function ($f) {
            return labs_puedo('contactos.crea') && $f['gestor_id'] === labs_uid();
        },
        'editar' => function () {
            if (!labs_puedo('contactos.editar')) {
                return '1=0';
            }
            return in_array(labs_mi_rol(), array('admin', 'manager', 'backoffice'), true) ? '1=1' : 'gestor_id = ' . labs_uidq();
        },
        'editar_ok' => function ($f) {
            return labs_puedo('contactos.editar') &&
                (in_array(labs_mi_rol(), array('admin', 'manager', 'backoffice'), true) || $f['gestor_id'] === labs_uid());
        },
        'borrar' => function () {
            return labs_si(labs_puedo('contactos.borrar'));
        },
        'valida' => function ($f) {
            if (!labs_largo($f['nombre'], 2, 120)) {
                return 'El nombre debe tener entre 2 y 120 caracteres.';
            }
            if (!preg_match('/^\+\d{1,3}$/', (string) $f['prefijo'])) {
                return 'El prefijo debe ser internacional, como +34.';
            }
            if (!labs_en($f['tipo'], array('lead', 'cliente'))) {
                return 'El tipo debe ser lead o cliente.';
            }
            if (!labs_en($f['estado'], array('Nuevo', 'Contactado', 'Cualificado', 'Propuesta enviada', 'Cliente', 'Perdido'))) {
                return 'Estado de contacto no válido.';
            }
            if (mb_strlen((string) $f['etiquetas']) > 500) {
                return 'Demasiadas etiquetas (máximo 500 caracteres).';
            }
            if ($f['email'] !== '' && !filter_var($f['email'], FILTER_VALIDATE_EMAIL)) {
                return 'El correo no es válido.';
            }
            return null;
        },
    );

    $texto_corto = function ($f) {
        $t = (string) $f['texto'];
        return (trim($t) === '' || mb_strlen($t) > 2000) ? 'El texto no puede estar vacío ni pasar de 2000 caracteres.' : null;
    };

    $T['contacto_eventos'] = array(
        'pk' => 'id', 'gen' => 'auto', 'ops' => array('select', 'insert'),
        'cols' => array('id' => array('i'), 'contacto_id' => array('i'), 'autor_id' => array('u'), 'tipo' => array('t', 'nota'),
            'texto' => array('t'), 'ts' => array('s', $AHORA)),
        'leer' => function () {
            return labs_puedo('contactos.ver') ? labs_contacto_visible('contacto_eventos.contacto_id') : '1=0';
        },
        'crear' => function ($f) {
            return $f['autor_id'] === labs_uid() && labs_puedo('contactos.notas') && labs_contacto_visible_id($f['contacto_id']);
        },
        'valida' => function ($f) use ($texto_corto) {
            if (!labs_en($f['tipo'], array('estado', 'evento', 'nota', 'llamada', 'whatsapp', 'correo', 'reunion'))) {
                return 'Tipo de anotación no válido.';
            }
            return $texto_corto($f);
        },
    );

    $T['contacto_comentarios'] = array(
        'pk' => 'id', 'gen' => 'auto', 'ops' => array('select', 'insert'),
        'cols' => array('id' => array('i'), 'contacto_id' => array('i'), 'autor_id' => array('u'), 'texto' => array('t'),
            'ts' => array('s', $AHORA)),
        'leer' => function () {
            return labs_puedo('contactos.ver') ? labs_contacto_visible('contacto_comentarios.contacto_id') : '1=0';
        },
        'crear' => function ($f) {
            return $f['autor_id'] === labs_uid() && labs_puedo('contactos.comentar') && labs_contacto_visible_id($f['contacto_id']);
        },
        'valida' => $texto_corto,
    );

    $T['contacto_documentos'] = array(
        'pk' => 'id', 'gen' => 'auto', 'ops' => array('select', 'insert', 'delete'),
        'cols' => array('id' => array('i'), 'contacto_id' => array('i'), 'nombre' => array('t'), 'tipo' => array('t', ''),
            'ruta' => array('t'), 'tamano_bytes' => array('i'), 'subido_por' => array('u'), 'ts' => array('s', $AHORA)),
        'leer' => function () {
            return labs_puedo('contactos.ver') ? labs_contacto_visible('contacto_documentos.contacto_id') : '1=0';
        },
        'crear' => function ($f) {
            return $f['subido_por'] === labs_uid() && labs_puedo('contactos.docs') && labs_contacto_visible_id($f['contacto_id']);
        },
        'borrar' => function () {
            return labs_puedo('contactos.borrar') ? labs_contacto_visible('contacto_documentos.contacto_id') : '1=0';
        },
        // Al borrar el registro se borra también el archivo del almacén.
        'despues_borrar' => function ($v) {
            labs_almacen_borra_archivo($v['ruta']);
        },
    );

    /* ===================================================================
       ROLES PERSONALIZADOS · 08
       =================================================================== */
    $T['roles_personalizados'] = array(
        'pk' => 'id', 'gen' => 'uuid', 'ops' => array('select', 'insert', 'update', 'delete'),
        'cols' => array('id' => array('u'), 'nombre' => array('t'), 'descripcion' => array('t', ''),
            'basado_en' => array('t', 'commercial'), 'permisos' => array('j', array()), 'modulos_visibles' => array('j', array()),
            'creado_por' => array('u'), 'creado' => array('s', $AHORA), 'actualizado' => array('s', $AHORA)),
        'actualizado' => true,
        'leer' => function () {
            return labs_si(labs_puedo('roles.gestionar'));
        },
        'crear' => function ($f) {
            return labs_puedo('roles.gestionar') && $f['creado_por'] === labs_uid();
        },
        'editar' => function () {
            return labs_si(labs_puedo('roles.gestionar'));
        },
        'editar_ok' => function () {
            return labs_puedo('roles.gestionar');
        },
        'borrar' => function () {
            return labs_si(labs_puedo('roles.gestionar'));
        },
        'valida' => function ($f) {
            if (!labs_largo($f['nombre'], 2, 60)) {
                return 'El nombre del rol debe tener entre 2 y 60 caracteres.';
            }
            if (!labs_en($f['basado_en'], array('admin', 'manager', 'commercial', 'backoffice'))) {
                return 'Rol base no válido.';
            }
            return null;
        },
    );

    /* ===================================================================
       CENTRO DE RECURSOS · 09
       =================================================================== */
    $T['recursos'] = array(
        'pk' => 'id', 'gen' => 'auto', 'ops' => array('select', 'insert', 'update', 'delete'),
        'cols' => array('id' => array('i'), 'categoria' => array('t', 'General'), 'nombre' => array('t'),
            'descripcion' => array('t', ''), 'tipo' => array('t', 'pdf'), 'ruta' => array('t'), 'tamano_bytes' => array('i'),
            'subido_por' => array('u'), 'creado' => array('s', $AHORA), 'actualizado' => array('s', $AHORA)),
        'actualizado' => true,
        'leer' => function () {
            return labs_si(labs_puedo('recursos.ver'));
        },
        'crear' => function ($f) {
            return labs_puedo('recursos.subir') && $f['subido_por'] === labs_uid();
        },
        'borrar' => function () {
            return labs_si(labs_puedo('recursos.borrar'));
        },
        'despues_borrar' => function ($v) {
            labs_almacen_borra_archivo($v['ruta']);
        },
        'valida' => function ($f) {
            if (!labs_largo($f['categoria'], 2, 60)) {
                return 'La categoría debe tener entre 2 y 60 caracteres.';
            }
            if (!labs_largo($f['nombre'], 2, 160)) {
                return 'El nombre debe tener entre 2 y 160 caracteres.';
            }
            if (!labs_en($f['tipo'], array('pdf', 'pptx'))) {
                return 'Solo se admiten dosieres PDF o PPTX.';
            }
            return null;
        },
    );

    $T['recursos_descargas'] = array(
        'pk' => 'id', 'gen' => 'auto', 'ops' => array('select', 'insert'),
        'cols' => array('id' => array('i'), 'recurso_id' => array('i'), 'usuario_id' => array('u'), 'ts' => array('s', $AHORA)),
        'leer' => function () {
            return in_array(labs_mi_rol(), array('admin', 'manager'), true) ? '1=1' : 'usuario_id = ' . labs_uidq();
        },
        'crear' => function ($f) {
            return labs_puedo('recursos.ver') && $f['usuario_id'] === labs_uid();
        },
    );

    /* ===================================================================
       SOPORTE Y TICKETS · 10, 11
       =================================================================== */
    $tickets_ve = function () {
        if (labs_puedo('soporte.gestionar')) {
            return '1=1';
        }
        $u = labs_uidq();
        return '(creado_por = ' . $u . ' OR asignado_a = ' . $u . ')';
    };
    $cols_ticket = array('id' => array('i'), 'titulo' => array('t'), 'descripcion' => array('t'),
        'categoria' => array('t', 'Plataforma'), 'prioridad' => array('t', 'media'), 'estado' => array('t', 'abierto'),
        'nivel_escalado' => array('i', 0), 'creado_por' => array('u'), 'asignado_a' => array('u'),
        'creado' => array('s', $AHORA), 'actualizado' => array('s', $AHORA));

    $T['tickets'] = array(
        'pk' => 'id', 'gen' => 'auto', 'ops' => array('select', 'insert', 'update', 'delete'),
        'cols' => $cols_ticket,
        'actualizado' => true,
        'leer' => $tickets_ve,
        'crear' => function ($f) {
            return labs_puedo('soporte.ver') && $f['creado_por'] === labs_uid();
        },
        // tickets_auto_asigna: alta y crítica suben a Nivel 1 y se asignan solas.
        'antes_crear' => function (&$n) {
            if (in_array($n['prioridad'], array('alta', 'critica'), true)) {
                $n['nivel_escalado'] = max((int) $n['nivel_escalado'], 1);
                if (empty($n['asignado_a'])) {
                    $n['asignado_a'] = labs_elige_responsable('manager');
                }
            }
        },
        'editar' => function () {
            return labs_si(labs_puedo('soporte.gestionar'));
        },
        'editar_ok' => function () {
            return labs_puedo('soporte.gestionar');
        },
        // tickets_registra_cambio: deja rastro de cada cambio de estado o asignación.
        'despues_editar' => function ($v, $n) {
            if ($v['estado'] !== $n['estado'] || $v['asignado_a'] !== $n['asignado_a']) {
                labs_q('INSERT INTO ticket_eventos (ticket_id, autor_id, tipo, texto, creado) VALUES (?,?,?,?,?)', array(
                    $n['id'], labs_uid(), 'cambio_estado',
                    'Estado: ' . $v['estado'] . ' → ' . $n['estado'] . ($v['asignado_a'] !== $n['asignado_a'] ? ' · Reasignada' : ''),
                    labs_ahora()));
            }
        },
        'valida' => function ($f) {
            if (!labs_largo($f['titulo'], 4, 160)) {
                return 'El título debe tener entre 4 y 160 caracteres.';
            }
            if (mb_strlen(trim((string) $f['descripcion'])) < 10) {
                return 'Describe la incidencia con al menos 10 caracteres.';
            }
            if (!labs_largo($f['categoria'], 2, 60)) {
                return 'Categoría no válida.';
            }
            if (!labs_en($f['prioridad'], array('baja', 'media', 'alta', 'critica'))) {
                return 'Prioridad no válida.';
            }
            if (!labs_en($f['estado'], array('abierto', 'en_progreso', 'escalado', 'resuelto', 'cerrado'))) {
                return 'Estado no válido.';
            }
            if (!in_array((int) $f['nivel_escalado'], array(0, 1, 2), true)) {
                return 'Nivel de escalado no válido.';
            }
            return null;
        },
    );

    // tickets_panel: la Mesa de Incidencias, con el cálculo de SLA (11-soporte-global).
    $sla = "CASE t.prioridad WHEN 'critica' THEN 4 WHEN 'alta' THEN 24 WHEN 'media' THEN 72 ELSE 168 END";
    $T['tickets_panel'] = array(
        'pk' => 'id', 'gen' => null, 'ops' => array('select'),
        'fuente' => "(SELECT t.*, $sla AS sla_horas,
                       ROUND(TIMESTAMPDIFF(SECOND, t.creado, UTC_TIMESTAMP(6)) / 3600.0, 1) AS horas_abierta,
                       (t.estado NOT IN ('resuelto','cerrado')
                        AND TIMESTAMPDIFF(SECOND, t.creado, UTC_TIMESTAMP(6)) / 3600.0 > $sla) AS sla_vencida
                     FROM tickets t) AS tickets_panel",
        'cols' => $cols_ticket + array('sla_horas' => array('i'), 'horas_abierta' => array('n'), 'sla_vencida' => array('b')),
        'leer' => $tickets_ve,
    );

    $T['ticket_eventos'] = array(
        'pk' => 'id', 'gen' => 'auto', 'ops' => array('select', 'insert'),
        'cols' => array('id' => array('i'), 'ticket_id' => array('i'), 'autor_id' => array('u'),
            'tipo' => array('t', 'comentario'), 'texto' => array('t'), 'creado' => array('s', $AHORA)),
        'leer' => function () {
            return labs_ticket_visible('ticket_eventos.ticket_id');
        },
        'crear' => function ($f) {
            return $f['autor_id'] === labs_uid() &&
                (bool) labs_fila('SELECT 1 FROM tickets WHERE id = ? AND ' . labs_ticket_visible('tickets.id'), array($f['ticket_id']));
        },
        'valida' => function ($f) {
            if (!labs_en($f['tipo'], array('comentario', 'cambio_estado', 'escalado'))) {
                return 'Tipo de evento no válido.';
            }
            return trim((string) $f['texto']) === '' ? 'El comentario no puede estar vacío.' : null;
        },
    );

    /* ===================================================================
       FICHAS DE AGENTE · 13, 14
       =================================================================== */
    $T['agente_fichas'] = array(
        'pk' => 'agente_id', 'gen' => null, 'ops' => array('select', 'insert', 'update', 'delete'),
        'cols' => array('agente_id' => array('u'), 'zona' => array('t', ''), 'equipo' => array('t', ''),
            'especialidad' => array('t', ''), 'incorporacion' => array('d'), 'objetivo_mensual' => array('n'),
            'objetivos' => array('t', ''), 'plan_accion' => array('t', ''), 'formacion' => array('t', ''),
            'actualizado' => array('s', $AHORA), 'actualizado_por' => array('u')),
        'leer' => function () {
            return '(' . labs_dirijo_sql('agente_fichas.agente_id') . ' OR agente_id = ' . labs_uidq() . ')';
        },
        'crear' => function ($f) {
            return labs_dirijo_agente($f['agente_id']);
        },
        'editar' => function () {
            return labs_dirijo_sql('agente_fichas.agente_id');
        },
        'editar_ok' => function ($f) {
            return labs_dirijo_agente($f['agente_id']);
        },
        'borrar' => function () {
            return labs_si(labs_soy_admin());
        },
        'antes_crear' => function (&$n) {
            labs_ficha_sella($n);
        },
        'antes_editar' => function ($v, &$n) {
            labs_ficha_sella($n);
        },
        'valida' => function ($f) {
            foreach (array('zona' => 120, 'equipo' => 120, 'especialidad' => 200, 'objetivos' => 4000,
                         'plan_accion' => 4000, 'formacion' => 4000) as $k => $max) {
                if (mb_strlen((string) $f[$k]) > $max) {
                    return 'El campo «' . $k . '» admite como máximo ' . $max . ' caracteres.';
                }
            }
            if ($f['objetivo_mensual'] !== null && (float) $f['objetivo_mensual'] < 0) {
                return 'El objetivo mensual no puede ser negativo.';
            }
            return null;
        },
    );

    $T['agente_seguimiento'] = array(
        'pk' => 'id', 'gen' => 'auto', 'ops' => array('select', 'insert', 'update', 'delete'),
        'cols' => array('id' => array('i'), 'agente_id' => array('u'), 'autor_id' => array('u'), 'autor_nombre' => array('t', ''),
            'tipo' => array('t', 'nota'), 'titulo' => array('t'), 'texto' => array('t', ''), 'fecha' => array('d'),
            'hecho' => array('b', false), 'creado' => array('s', $AHORA)),
        'leer' => function () {
            return '(' . labs_dirijo_sql('agente_seguimiento.agente_id') . ' OR agente_id = ' . labs_uidq() . ')';
        },
        'crear' => function ($f) {
            return labs_dirijo_agente($f['agente_id']) || ($f['agente_id'] === labs_uid() && $f['tipo'] === 'nota');
        },
        'editar' => function () {
            return '(' . labs_dirijo_sql('agente_seguimiento.agente_id') . ' OR agente_id = ' . labs_uidq() . ')';
        },
        'editar_ok' => function ($f) {
            return labs_dirijo_agente($f['agente_id']) || $f['agente_id'] === labs_uid();
        },
        'borrar' => function () {
            $u = labs_uidq();
            return '(' . labs_dirijo_sql('agente_seguimiento.agente_id') . ' OR (agente_id = ' . $u . ' AND autor_id = ' . $u . '))';
        },
        // agente_seguimiento_guarda
        'antes_crear' => function (&$n) {
            if (!labs_es_agente($n['agente_id'])) {
                throw new ErrorApi('Solo los agentes (Gestión Comercial) tienen ficha de agente.', 400, '23514', 'NO_ES_AGENTE');
            }
            $u = labs_usuario();
            if ($u) {
                $n['autor_id'] = $u['id'];
                $n['autor_nombre'] = labs_nombre($u);
            }
            $n['creado'] = labs_ahora();
        },
        'antes_editar' => function ($v, &$n) {
            if (labs_uid() !== null && !labs_dirijo_agente($v['agente_id'])) {
                foreach (array('agente_id', 'autor_id', 'autor_nombre', 'tipo', 'titulo', 'texto', 'fecha', 'creado') as $k) {
                    if ((string) $v[$k] !== (string) $n[$k]) {
                        throw new ErrorApi('Solo puedes marcar como hecha una tarea de tu ficha.', 403, '42501', 'SOLO_HECHO');
                    }
                }
            }
            $n['agente_id'] = $v['agente_id'];
            $n['autor_id'] = $v['autor_id'];
            $n['creado'] = $v['creado'];
        },
        'valida' => function ($f) {
            if (!labs_en($f['tipo'], array('nota', 'tarea', 'objetivo', 'reunion', 'evaluacion'))) {
                return 'Tipo de seguimiento no válido.';
            }
            if (!labs_largo($f['titulo'], 1, 160)) {
                return 'El título debe tener entre 1 y 160 caracteres.';
            }
            if (mb_strlen((string) $f['texto']) > 4000) {
                return 'El texto admite como máximo 4000 caracteres.';
            }
            return null;
        },
    );

    return $T;
}

/* ===========================================================================
   DISPARADORES DE PERFILES (traducción de los de Postgres)
   ========================================================================= */

/** limita_jefe (17): lo que un Jefe de Equipo puede cambiar de su equipo. */
function labs_perfil_limita_jefe($v, &$n)
{
    $yo = labs_usuario();
    if (!$yo || $yo['id'] === $n['id']) {
        return;
    }
    // El administrador no tiene límites extra.
    if (!empty($yo['sin_ficha']) || $yo['raiz'] || $yo['rol'] === 'admin') {
        return;
    }
    if (!in_array($n['rol'], array('commercial', 'backoffice'), true)) {
        throw new ErrorApi('Un Jefe de Equipo solo puede asignar los roles Gestión Comercial o Back Office.', 403, '42501', 'ROL_NO_PERMITIDO');
    }
    if ($n['email'] !== $v['email']) {
        throw new ErrorApi('El correo solo lo cambia un Administrador.', 403, '42501', 'CORREO_SOLO_ADMIN');
    }
    $n['raiz'] = $v['raiz'];
    $n['modulos_visibles'] = $v['modulos_visibles'];
    $n['rol_personalizado_id'] = $v['rol_personalizado_id'];
    $n['api_token'] = $v['api_token'];
    $n['permisos'] = $n['rol'] !== $v['rol'] ? labs_permisos_de_rol($n['rol']) : $v['permisos'];
}

/** protege_raiz (01, 06): la cuenta de raíz no se borra, ni se degrada, ni se duplica. */
function labs_perfil_protege_raiz($v, &$n)
{
    $raiz_previa = $v !== null && (int) $v['raiz'] === 1;
    if ($raiz_previa) {
        if ($n['email'] !== $v['email']) {
            throw new ErrorApi('El correo de la cuenta de raíz no se cambia.', 400, '23514', 'RAIZ_EMAIL_FIJO');
        }
        if ($n['estado'] !== 'Activo') {
            throw new ErrorApi('La cuenta de raíz está siempre activa.', 400, '23514', 'RAIZ_SIEMPRE_ACTIVA');
        }
        if ($n['rol'] !== 'admin') {
            throw new ErrorApi('La cuenta de raíz es administradora de forma permanente.', 400, '23514', 'RAIZ_ROL_FIJO');
        }
        if (!$n['raiz']) {
            throw new ErrorApi('La marca de raíz no se puede retirar.', 400, '23514', 'RAIZ_MARCA_FIJA');
        }
    }
    if ($n['raiz']) {
        if (labs_fila('SELECT 1 FROM perfiles WHERE raiz = 1 AND id <> ?', array($n['id']))) {
            throw new ErrorApi('Ya existe un Super Administrador de raíz.', 409, '23505', 'RAIZ_UNICA');
        }
        if (!$raiz_previa && labs_uid() !== null) {
            throw new ErrorApi('La cuenta de raíz solo se crea al instalar la base de datos.', 403, '42501', 'RAIZ_SOLO_SISTEMA');
        }
        $n['rol'] = 'admin';
        $n['estado'] = 'Activo';
        $n['permisos'] = labs_permisos_de_rol('admin');
        $n['doble_factor'] = true;
    }
    $n['actualizado'] = labs_ahora();
}

/** impide_autoescalada (06, 08, 14): nadie se sube de rango a sí mismo. */
function labs_perfil_sin_autoescalada($v, $n)
{
    $uid = labs_uid();
    if ($uid === null || $uid !== $n['id']) {
        return;
    }
    $cambia = $n['rol'] !== $v['rol'] || $n['estado'] !== $v['estado']
        || !labs_json_igual($n['permisos'], $v['permisos'])
        || (bool) $n['debe_cambiar'] !== (bool) $v['debe_cambiar']
        || (bool) $n['doble_factor'] !== (bool) $v['doble_factor']
        || !labs_json_igual($n['modulos_visibles'], $v['modulos_visibles'])
        || $n['rol_personalizado_id'] !== $v['rol_personalizado_id']
        || $n['superior_id'] !== $v['superior_id'];
    // La raíz recibe sus permisos del sistema: no cuenta como autoescalada.
    if ($cambia && (int) $v['raiz'] === 1 && $n['rol'] === $v['rol'] && $n['estado'] === $v['estado']
        && (bool) $n['debe_cambiar'] === (bool) $v['debe_cambiar']
        && labs_json_igual($n['modulos_visibles'], $v['modulos_visibles'])
        && $n['rol_personalizado_id'] === $v['rol_personalizado_id'] && $n['superior_id'] === $v['superior_id']) {
        $cambia = false;
    }
    if ($cambia) {
        throw new ErrorApi('No puedes cambiar tu propio rol, estado, permisos, superior, doble factor, la marca de cambio de contraseña ni tus módulos visibles.',
            403, '42501', 'AUTO_ESCALADA');
    }
}

/** valida_superior (14): el superior siempre tiene más rango. */
function labs_perfil_valida_superior($v, &$n, $cols)
{
    if ($n['raiz']) {
        $n['superior_id'] = null;
        return;
    }
    if ($n['superior_id'] === null || $n['superior_id'] === '') {
        $n['superior_id'] = null;
        return;
    }
    if ($n['superior_id'] === $n['id']) {
        throw new ErrorApi('Nadie puede ser su propio superior.', 400, '23514', 'SUPERIOR_PROPIO');
    }
    $sup = labs_fila('SELECT rol, raiz FROM perfiles WHERE id = ?', array($n['superior_id']));
    if (!$sup || labs_rango($sup['rol'], (int) $sup['raiz'] === 1) <= labs_rango($n['rol'], $n['raiz'])) {
        if ($v !== null && $n['superior_id'] === $v['superior_id']) {
            $n['superior_id'] = null;
            return;
        }
        throw new ErrorApi('El superior tiene que tener un rango mayor que la persona.', 400, '23514', 'SUPERIOR_RANGO');
    }
}

/** anota_cambio_perfil (01): cada cambio en una ficha queda en la bitácora. */
function labs_perfil_anota($v, $n)
{
    if ($v === null) {
        $accion = 'Cuenta creada';
        $partes = array($n['rol'] . ' · relación ' . $n['rel']);
        $dest = $n;
    } elseif ($n === null) {
        $accion = 'Cuenta eliminada';
        $partes = array('relación ' . $v['rel'] . ' · ' . $v['rol']);
        $dest = $v;
    } else {
        $accion = 'Ficha actualizada';
        $dest = $n;
        $partes = array();
        if ($n['nombre'] !== $v['nombre'] || $n['apellidos'] !== $v['apellidos']) {
            $partes[] = 'nombre';
        }
        if ($n['email'] !== $v['email']) {
            $partes[] = 'correo';
        }
        if ($n['rol'] !== $v['rol']) {
            $partes[] = 'rol → ' . $n['rol'];
        }
        if ($n['estado'] !== $v['estado']) {
            $partes[] = 'estado → ' . $n['estado'];
        }
        if ((bool) $n['google'] !== (bool) $v['google']) {
            $partes[] = $n['google'] ? 'Google autorizado' : 'Google revocado';
        }
        if (!labs_json_igual($n['permisos'], $v['permisos'])) {
            $partes[] = 'permisos';
        }
        if ($n['api_token'] !== $v['api_token']) {
            $partes[] = 'token de API rotado';
        }
        if ($n['avatar_url'] !== $v['avatar_url']) {
            $partes[] = 'foto de perfil';
        }
        if (!$partes) {
            return;
        }
    }
    labs_anota($accion, implode(', ', $partes), array('id' => $dest['id'], 'nombre' => $dest['nombre'], 'apellidos' => $dest['apellidos']));
}

/** agente_ficha_sella (13). */
function labs_ficha_sella(&$n)
{
    if (!labs_es_agente($n['agente_id'])) {
        throw new ErrorApi('Solo los agentes (Gestión Comercial) tienen ficha de agente.', 400, '23514', 'NO_ES_AGENTE');
    }
    $n['actualizado'] = labs_ahora();
    $n['actualizado_por'] = labs_uid();
}
