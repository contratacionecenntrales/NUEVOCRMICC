<?php
/**
 * LABS COMMAND CENTER 360™ · Next-Gen: pipeline IA, agenda, ficha 360, Sala de Ventas
 *
 * - Pipeline: fase de cada contacto (Lead entrante → En producción), valor del deal,
 *   soluciones (voz · whatsapp · embudo) y tiempo en la fase (SLA). Cada cambio de fase
 *   queda en pipeline_movimientos y en el historial del contacto.
 * - Agenda: tabla citas, con reglas por rol.
 * - Configurador IA por contacto (ia_config): asistente de voz, bot de WhatsApp y embudo.
 * - Integraciones reales opcionales: Twilio (SMS de firma) y un webhook de n8n/Make que
 *   recibe los despliegues y las llamadas de prueba. Sin claves, todo funciona en modo
 *   simulación y se dice siempre que es una simulación.
 * - Webhook de entrada por contacto: /hook/<token> (público, con freno).
 * - Sala de Ventas: /sala?periodo=hoy|semana|mes (métricas, ranking y actividad).
 */
defined('LABS') || exit;

/* ===========================================================================
   FASES DEL PIPELINE
   ========================================================================= */
function labs_fases()
{
    // clave => [nombre, días de SLA en la fase, estado del contacto equivalente, probabilidad %]
    return array(
        'lead'         => array('Lead entrante', 1, 'Nuevo', 5),
        'cualificacion' => array('Cualificación', 3, 'Contactado', 15),
        'demo'         => array('Demo IA', 5, 'Cualificado', 30),
        'propuesta'    => array('Propuesta', 7, 'Propuesta enviada', 50),
        'negociacion'  => array('Negociación', 10, 'Propuesta enviada', 70),
        'firmado'      => array('Firmado', 3, 'Cliente', 100),
        'despliegue'   => array('Despliegue', 14, 'Cliente', 100),
        'produccion'   => array('En producción', 0, 'Cliente', 100),
        'perdido'      => array('Perdido', 0, 'Perdido', 0),
    );
}

function labs_fase_de_estado($estado)
{
    $m = array('Nuevo' => 'lead', 'Contactado' => 'cualificacion', 'Cualificado' => 'demo',
        'Propuesta enviada' => 'propuesta', 'Cliente' => 'produccion', 'Perdido' => 'perdido');
    return isset($m[$estado]) ? $m[$estado] : 'lead';
}

function labs_soluciones_validas($s)
{
    $l = array_filter(array_map('trim', explode(',', (string) $s)));
    foreach ($l as $x) {
        if (!in_array($x, array('voz', 'whatsapp', 'embudo'), true)) {
            return false;
        }
    }
    return true;
}

/* ===========================================================================
   TABLAS (se añaden al registro de api/esquema.php)
   ========================================================================= */
function labs_tablas_nextgen(&$T, $AHORA, $HOY)
{
    $amplio = function () {
        return in_array(labs_mi_rol(), array('admin', 'manager', 'backoffice'), true);
    };

    /* --- Contactos: campos de pipeline y sus reglas --------------------- */
    $T['contactos']['cols'] += array(
        'fase' => array('t', 'lead'), 'valor' => array('n', 0), 'soluciones' => array('t', ''),
        'fase_desde' => array('s'), 'motivo_perdida' => array('t', ''),
    );
    $valida_base = $T['contactos']['valida'];
    $T['contactos']['valida'] = function ($f) use ($valida_base) {
        $e = $valida_base($f);
        if ($e) {
            return $e;
        }
        if (!array_key_exists($f['fase'], labs_fases())) {
            return 'Fase del pipeline no válida.';
        }
        if ((float) $f['valor'] < 0 || (float) $f['valor'] > 10000000) {
            return 'El valor del deal tiene que estar entre 0 y 10.000.000 €.';
        }
        if (!labs_soluciones_validas($f['soluciones'])) {
            return 'Las soluciones posibles son voz, whatsapp y embudo.';
        }
        if (mb_strlen((string) $f['motivo_perdida']) > 200) {
            return 'El motivo de pérdida es demasiado largo.';
        }
        return null;
    };
    $T['contactos']['antes_crear'] = function (&$n) {
        if (!$n['fase'] || $n['fase'] === 'lead') {
            $n['fase'] = labs_fase_de_estado($n['estado']);
        }
        $n['fase_desde'] = labs_ahora();
    };
    $T['contactos']['antes_editar'] = function ($v, &$n, $cols) {
        $fases = labs_fases();
        if ($n['fase'] !== $v['fase']) {
            // Mover en el pipeline arrastra el estado y, si se gana, lo hace cliente.
            if (!isset($fases[$n['fase']])) {
                throw new ErrorApi('Fase del pipeline no válida.', 400, 'P0001');
            }
            $n['estado'] = $fases[$n['fase']][2];
            if (in_array($n['fase'], array('firmado', 'despliegue', 'produccion'), true)) {
                $n['tipo'] = 'cliente';
            }
            if ($n['fase'] !== 'perdido') {
                $n['motivo_perdida'] = '';
            }
            $n['fase_desde'] = labs_ahora();
        } elseif ($n['estado'] !== $v['estado'] && isset($fases[$v['fase']]) && $fases[$v['fase']][2] !== $n['estado']) {
            // Cambiar el estado desde la ficha coloca el contacto en su fase.
            $n['fase'] = labs_fase_de_estado($n['estado']);
            $n['fase_desde'] = labs_ahora();
        }
    };
    $T['contactos']['despues_editar'] = function ($v, $n) {
        if ($n['fase'] !== $v['fase']) {
            $fases = labs_fases();
            labs_q('INSERT INTO pipeline_movimientos (contacto_id, de, a, valor, autor_id, ts) VALUES (?,?,?,?,?,?)',
                array($n['id'], $v['fase'], $n['fase'], (float) $n['valor'], labs_uid(), labs_ahora()));
            labs_q('INSERT INTO contacto_eventos (contacto_id, autor_id, tipo, texto, ts) VALUES (?,?,?,?,?)', array(
                $n['id'], labs_uid(), 'estado', 'Pipeline: ' . $fases[$v['fase']][0] . ' → ' . $fases[$n['fase']][0] .
                ($n['fase'] === 'perdido' && $n['motivo_perdida'] ? ' · Motivo: ' . $n['motivo_perdida'] : ''), labs_ahora()));
        }
    };

    $T['contratos']['cols']['contacto_id'] = array('i');

    /* --- Citas de la agenda --------------------------------------------- */
    $T['citas'] = array(
        'pk' => 'id', 'gen' => 'auto', 'ops' => array('select', 'insert', 'update', 'delete'),
        'cols' => array('id' => array('i'), 'contacto_id' => array('i'), 'titulo' => array('t'), 'tipo' => array('t', 'demo'),
            'inicio' => array('s'), 'fin' => array('s'), 'comercial_id' => array('u'), 'estado' => array('t', 'programada'),
            'sector' => array('t', ''), 'lugar' => array('t', ''), 'notas' => array('t', ''), 'resumen' => array('t', ''),
            'creado_por' => array('u'), 'creado' => array('s', $AHORA), 'actualizado' => array('s', $AHORA)),
        'actualizado' => true,
        'leer' => function () use ($amplio) {
            return $amplio() ? '1=1' : '(comercial_id = ' . labs_uidq() . ' OR creado_por = ' . labs_uidq() . ')';
        },
        'crear' => function ($f) use ($amplio) {
            $jefe = in_array(labs_mi_rol(), array('admin', 'manager'), true);
            return labs_activo() && $f['creado_por'] === labs_uid() && ($jefe || $f['comercial_id'] === labs_uid())
                && ($f['contacto_id'] === null || labs_contacto_visible_id($f['contacto_id']));
        },
        'editar' => function () use ($amplio) {
            return $amplio() ? '1=1' : '(comercial_id = ' . labs_uidq() . ' OR creado_por = ' . labs_uidq() . ')';
        },
        'editar_ok' => function ($f) {
            return in_array(labs_mi_rol(), array('admin', 'manager', 'backoffice'), true) || $f['comercial_id'] === labs_uid();
        },
        'borrar' => function () use ($amplio) {
            return $amplio() ? '1=1' : 'creado_por = ' . labs_uidq();
        },
        'valida' => function ($f) {
            if (!labs_largo($f['titulo'], 2, 200)) {
                return 'El título de la cita debe tener entre 2 y 200 caracteres.';
            }
            if (!labs_en($f['tipo'], array('demo', 'llamada', 'visita', 'firma', 'seguimiento', 'prueba_ia', 'interna'))) {
                return 'Tipo de cita no válido.';
            }
            if (!labs_en($f['estado'], array('programada', 'confirmada', 'realizada', 'no_asistio', 'cancelada'))) {
                return 'Estado de cita no válido.';
            }
            if (!$f['inicio'] || !$f['fin'] || $f['fin'] <= $f['inicio']) {
                return 'La cita tiene que acabar después de empezar.';
            }
            if (!$f['comercial_id']) {
                return 'Falta la persona que atiende la cita.';
            }
            foreach (array('notas', 'resumen') as $k) {
                if (mb_strlen((string) $f[$k]) > 4000) {
                    return 'Las notas y el resumen no pueden pasar de 4000 caracteres.';
                }
            }
            return null;
        },
        'despues_crear' => function ($n) {
            if ($n['contacto_id']) {
                labs_q('INSERT INTO contacto_eventos (contacto_id, autor_id, tipo, texto, ts) VALUES (?,?,?,?,?)', array(
                    $n['contacto_id'], labs_uid(), 'evento', 'Cita agendada: ' . $n['titulo'] . ' · ' . labs_fecha_madrid($n['inicio']), labs_ahora()));
            }
        },
        'despues_editar' => function ($v, $n) {
            if ($n['contacto_id'] && $n['estado'] !== $v['estado']) {
                $txt = array('realizada' => 'Cita realizada', 'no_asistio' => 'No asistió a la cita', 'cancelada' => 'Cita cancelada',
                    'confirmada' => 'Cita confirmada', 'programada' => 'Cita reprogramada');
                labs_q('INSERT INTO contacto_eventos (contacto_id, autor_id, tipo, texto, ts) VALUES (?,?,?,?,?)', array(
                    $n['contacto_id'], labs_uid(), 'evento', $txt[$n['estado']] . ': ' . $n['titulo'] .
                    ($n['resumen'] ? "\nResumen: " . $n['resumen'] : ''), labs_ahora()));
                labs_q('UPDATE contactos SET ultima_actividad = ? WHERE id = ?', array(labs_ahora(), $n['contacto_id']));
            }
        },
    );

    /* --- Configuración IA de cada contacto ------------------------------ */
    $T['ia_config'] = array(
        'pk' => 'contacto_id', 'gen' => null, 'ops' => array('select', 'insert', 'update'),
        'upd_cols' => array('voz', 'whatsapp', 'embudo'),
        'cols' => array('contacto_id' => array('i'), 'voz' => array('j', array()), 'whatsapp' => array('j', array()),
            'embudo' => array('j', array()), 'estado' => array('t', 'borrador'), 'desplegado' => array('s'),
            'webhook_token' => array('t'), 'creado' => array('s', $AHORA), 'actualizado' => array('s', $AHORA)),
        'actualizado' => true,
        'leer' => function () {
            return labs_contacto_visible('ia_config.contacto_id');
        },
        'crear' => function ($f) {
            return labs_puedo('contactos.editar') && labs_contacto_visible_id($f['contacto_id']);
        },
        'antes_crear' => function (&$n) {
            $n['estado'] = 'borrador';
            $n['desplegado'] = null;
            $n['webhook_token'] = null;
        },
        'editar' => function () {
            return labs_puedo('contactos.editar') ? labs_contacto_visible('ia_config.contacto_id') : '1=0';
        },
        'editar_ok' => function ($f) {
            return labs_puedo('contactos.editar');
        },
        'valida' => function ($f) {
            foreach (array('voz', 'whatsapp', 'embudo') as $k) {
                if (strlen(json_encode($f[$k])) > 200000) {
                    return 'La configuración es demasiado grande.';
                }
            }
            return null;
        },
    );

    $T['pipeline_movimientos'] = array(
        'pk' => 'id', 'gen' => 'auto', 'ops' => array('select'),
        'cols' => array('id' => array('i'), 'contacto_id' => array('i'), 'de' => array('t'), 'a' => array('t'),
            'valor' => array('n', 0), 'autor_id' => array('u'), 'ts' => array('s')),
        'leer' => function () {
            return labs_contacto_visible('pipeline_movimientos.contacto_id');
        },
    );
}

/** Fecha legible en hora de Madrid (para los textos del historial). */
function labs_fecha_madrid($utc)
{
    try {
        $d = new DateTime((string) $utc, new DateTimeZone('UTC'));
        $d->setTimezone(new DateTimeZone('Europe/Madrid'));
        return $d->format('d/m/Y H:i');
    } catch (Exception $e) {
        return (string) $utc;
    }
}

/* ===========================================================================
   INTEGRACIONES (Twilio · n8n/Make)
   ========================================================================= */
function labs_ia_ajustes()
{
    return array(
        'twilio_sid' => (string) labs_ajuste('ia.twilio_sid', ''),
        'twilio_token' => (string) labs_ajuste('ia.twilio_token', ''),
        'twilio_from' => (string) labs_ajuste('ia.twilio_from', ''),
        'n8n_url' => (string) labs_ajuste('ia.n8n_url', ''),
        'n8n_token' => (string) labs_ajuste('ia.n8n_token', ''),
    );
}

function labs_post_json($url, $datos, $cab = array(), $auth = null, $form = false)
{
    if (!function_exists('curl_init')) {
        return array(0, '', 'El hosting no tiene la extensión curl de PHP.');
    }
    $c = curl_init($url);
    $h = array('Accept: application/json', 'User-Agent: Labs24k-CRM/1.0');
    foreach ($cab as $k => $v) {
        $h[] = $k . ': ' . $v;
    }
    $h[] = $form ? 'Content-Type: application/x-www-form-urlencoded' : 'Content-Type: application/json';
    curl_setopt_array($c, array(
        CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 12, CURLOPT_CONNECTTIMEOUT => 6,
        CURLOPT_HTTPHEADER => $h, CURLOPT_POSTFIELDS => $form ? http_build_query($datos) : json_encode($datos, JSON_UNESCAPED_UNICODE),
        CURLOPT_FOLLOWLOCATION => false, CURLOPT_PROTOCOLS => CURLPROTO_HTTPS | CURLPROTO_HTTP,
    ));
    if ($auth) {
        curl_setopt($c, CURLOPT_USERPWD, $auth);
    }
    $r = curl_exec($c);
    $cod = (int) curl_getinfo($c, CURLINFO_RESPONSE_CODE);
    $err = $r === false ? curl_error($c) : '';
    curl_close($c);
    return array($cod, $r === false ? '' : mb_substr((string) $r, 0, 4000), $err);
}

/** Llama al webhook de n8n/Make si está configurado. Devuelve null si no lo está. */
function labs_n8n($evento, $datos)
{
    $a = labs_ia_ajustes();
    if ($a['n8n_url'] === '') {
        return null;
    }
    $cab = $a['n8n_token'] !== '' ? array('X-Labs-Token' => $a['n8n_token']) : array();
    return labs_post_json($a['n8n_url'], array('evento' => $evento, 'origen' => 'labs24k-crm', 'ts' => gmdate('c')) + $datos, $cab);
}

function labs_contacto_para_ia($id, $editar = true)
{
    $c = labs_fila('SELECT * FROM contactos WHERE id = ? AND ' . labs_contacto_visible('contactos.id'), array((int) $id));
    if (!$c) {
        throw new ErrorApi('Ese contacto no existe o no lo puedes ver.', 404, 'NO_ENCONTRADO');
    }
    if ($editar && !labs_puedo('contactos.editar')) {
        throw new ErrorApi('No tienes permiso para configurar este contacto.', 403, 'ROL_INSUFICIENTE');
    }
    return $c;
}

function labs_ia_config_de($contacto_id)
{
    $f = labs_fila('SELECT * FROM ia_config WHERE contacto_id = ? FOR UPDATE', array((int) $contacto_id));
    if (!$f) {
        labs_q("INSERT INTO ia_config (contacto_id, voz, whatsapp, embudo, estado, creado, actualizado) VALUES (?, '{}', '{}', '{}', 'borrador', ?, ?)",
            array((int) $contacto_id, labs_ahora(), labs_ahora()));
        $f = labs_fila('SELECT * FROM ia_config WHERE contacto_id = ? FOR UPDATE', array((int) $contacto_id));
    }
    foreach (array('voz', 'whatsapp', 'embudo') as $k) {
        $f[$k] = json_decode((string) $f[$k], true) ?: array();
    }
    return $f;
}

function labs_evento_contacto($contacto_id, $tipo, $texto)
{
    labs_q('INSERT INTO contacto_eventos (contacto_id, autor_id, tipo, texto, ts) VALUES (?,?,?,?,?)',
        array((int) $contacto_id, labs_uid(), $tipo, mb_substr($texto, 0, 2000), labs_ahora()));
    labs_q('UPDATE contactos SET ultima_actividad = ? WHERE id = ?', array(labs_ahora(), (int) $contacto_id));
}

function labs_url_webhook($token)
{
    $b = labs_url_base();
    return $b ? $b . '/api/index.php?ruta=' . rawurlencode('/hook/' . $token) : null;
}

/* ===========================================================================
   CONTRATO DESDE LA FICHA + ENVÍO DE FIRMA
   ========================================================================= */
function labs_rpc_contrato_desde_contacto($arg)
{
    $u = labs_usuario(true);
    if (!labs_puedo('presu.crear')) {
        throw new ErrorApi('No tienes permiso para generar contratos.', 403, 'ROL_INSUFICIENTE');
    }
    $c = labs_contacto_para_ia($arg('p_contacto'), false);
    $servicio = trim((string) $arg('p_servicio', ''));
    if (mb_strlen($servicio) < 3) {
        throw new ErrorApi('Describe el servicio que se contrata.', 400, 'P0001');
    }
    $setup = max(0, (float) $arg('p_setup', 0));
    $mensual = max(0, (float) $arg('p_mensual', 0));
    $meses = max(1, min(120, (int) $arg('p_meses', 12)));
    $dias = max(1, min(90, (int) $arg('p_dias', 15)));
    $anio = gmdate('Y');
    $n = (int) labs_fila("SELECT COUNT(*) n FROM contratos WHERE codigo LIKE ?", array('LB-' . $anio . '-%'))['n'] + 1;
    do {
        $codigo = 'LB-' . $anio . '-' . str_pad((string) $n++, 3, '0', STR_PAD_LEFT);
    } while (labs_fila('SELECT 1 FROM contratos WHERE codigo = ?', array($codigo)));
    $tok = labs_uuid();
    $exp = new DateTime('now', new DateTimeZone('UTC'));
    $exp->modify('+' . $dias . ' days');
    $cliente = trim((string) $arg('p_cliente', '')) ?: ($c['empresa'] !== '' ? $c['empresa'] : $c['nombre']);
    labs_q('INSERT INTO contratos (codigo, cliente, cif, domicilio, representante, email, telefono, servicio, setup, mensual, meses, iva, inicio,
              observaciones, estado, enviado_el, gestor_id, token, token_expira, token_usado, datos_contrato, contacto_id, creado, actualizado)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,21,?,?,?,?,?,?,?,0,?,?,?,?)', array(
        $codigo, mb_substr($cliente, 0, 200), mb_substr((string) $arg('p_cif', ''), 0, 40), mb_substr((string) $arg('p_domicilio', ''), 0, 300),
        mb_substr((string) $arg('p_representante', $c['nombre']), 0, 200), mb_substr((string) $arg('p_email', $c['email']), 0, 190),
        mb_substr((string) $arg('p_telefono', trim($c['prefijo'] . ' ' . $c['telefono'])), 0, 40), mb_substr($servicio, 0, 300),
        $setup, $mensual, $meses, labs_hoy(), mb_substr((string) $arg('p_obs', ''), 0, 4000), 'Enviado', labs_ahora(), $u['id'], $tok,
        $exp->format('Y-m-d H:i:s.u'), json_encode(array('origen' => 'ficha360', 'soluciones' => $c['soluciones'])), (int) $c['id'],
        labs_ahora(), labs_ahora()));
    $cid = (int) labs_db()->lastInsertId();
    labs_firma_evento($cid, 'emitido', 'Generado desde la ficha 360 · caduca el ' . $exp->format('d/m/Y'));
    labs_evento_contacto($c['id'], 'firma', 'Contrato ' . $codigo . ' generado: ' . $servicio . ' · ' .
        number_format($setup, 2, ',', '.') . ' € de alta + ' . number_format($mensual, 2, ',', '.') . ' €/mes × ' . $meses . ' meses.');
    return array('id' => $cid, 'codigo' => $codigo, 'token' => $tok, 'url' => labs_url_base() . '/firmar.html#t=' . $tok);
}

function labs_ia_firma_enviar($b)
{
    labs_usuario(true);
    $def = labs_tabla('contratos');
    $ct = labs_fila('SELECT * FROM contratos WHERE id = ? AND ' . labs_regla($def, 'leer'), array((int) ($b['contrato_id'] ?? 0)));
    if (!$ct) {
        throw new ErrorApi('Ese contrato no existe o no lo puedes ver.', 404, 'NO_ENCONTRADO');
    }
    if ($ct['estado'] === 'Firmado' || (int) $ct['token_usado'] === 1) {
        throw new ErrorApi('Este contrato ya está firmado.', 400, 'P0001');
    }
    if (!$ct['token'] || ($ct['token_expira'] && $ct['token_expira'] < labs_ahora())) {
        throw new ErrorApi('El enlace de firma ha caducado: genera uno nuevo desde Contratos.', 400, 'P0001');
    }
    $url = labs_url_base() . '/firmar.html#t=' . $ct['token'];
    $canal = ($b['canal'] ?? '') === 'email' ? 'email' : 'sms';
    $destino = trim((string) ($b['destino'] ?? ''));
    $texto = 'Hola. Labs24k te envía el contrato ' . $ct['codigo'] . ' para firmar desde el móvil: ' . $url;
    if ($canal === 'sms') {
        $tel = preg_replace('/[^\d+]/', '', $destino ?: $ct['telefono']);
        if (strpos($tel, '+') !== 0) {
            $tel = '+34' . ltrim($tel, '0');
        }
        if (!preg_match('/^\+\d{8,15}$/', $tel)) {
            throw new ErrorApi('El teléfono no es válido para enviar un SMS.', 400, 'P0001');
        }
        if (labs_freno('sms|' . labs_uid(), 30, 3600)) {
            throw new ErrorApi('Demasiados SMS seguidos. Espera un rato.', 429, 'FRENO');
        }
        $a = labs_ia_ajustes();
        if ($a['twilio_sid'] !== '' && $a['twilio_token'] !== '' && $a['twilio_from'] !== '') {
            list($cod, $resp, $err) = labs_post_json('https://api.twilio.com/2010-04-01/Accounts/' . rawurlencode($a['twilio_sid']) . '/Messages.json',
                array('To' => $tel, 'From' => $a['twilio_from'], 'Body' => $texto), array(), $a['twilio_sid'] . ':' . $a['twilio_token'], true);
            $ok = $cod >= 200 && $cod < 300;
            labs_firma_evento($ct['id'], $ok ? 'enviado_sms' : 'error_sms', ($ok ? 'SMS enviado por Twilio a ' : 'Twilio rechazó el SMS a ') . labs_enmascara($tel));
            if ($ct['contacto_id']) {
                labs_evento_contacto($ct['contacto_id'], 'firma', ($ok ? 'Firma enviada por SMS (Twilio) a ' : 'Fallo al enviar la firma por SMS a ') . labs_enmascara($tel) . ' · ' . $ct['codigo']);
            }
            if (!$ok) {
                $m = json_decode($resp, true);
                throw new ErrorApi('Twilio no ha enviado el SMS: ' . ($m['message'] ?? ($err ?: 'código ' . $cod)), 502, 'TWILIO');
            }
            return array('modo' => 'real', 'canal' => 'sms', 'destino' => labs_enmascara($tel));
        }
        // Sin Twilio: se abre la aplicación de SMS del dispositivo con el texto listo.
        labs_firma_evento($ct['id'], 'enviado_sms', 'Preparado para enviar desde el móvil (sin Twilio) a ' . labs_enmascara($tel));
        if ($ct['contacto_id']) {
            labs_evento_contacto($ct['contacto_id'], 'firma', 'Firma preparada para SMS desde el móvil a ' . labs_enmascara($tel) . ' · ' . $ct['codigo']);
        }
        return array('modo' => 'manual', 'canal' => 'sms', 'destino' => labs_enmascara($tel),
            'enlace' => 'sms:' . $tel . '?body=' . rawurlencode($texto), 'texto' => $texto);
    }
    $mail = $destino ?: $ct['email'];
    if (!filter_var($mail, FILTER_VALIDATE_EMAIL)) {
        throw new ErrorApi('El correo no es válido.', 400, 'P0001');
    }
    if (labs_freno('mailfirma|' . labs_uid(), 30, 3600)) {
        throw new ErrorApi('Demasiados correos seguidos. Espera un rato.', 429, 'FRENO');
    }
    $host = preg_replace('/[^a-z0-9.-]/i', '', $_SERVER['SERVER_NAME'] ?? 'localhost');
    $cuerpo = "Hola,\n\nTe enviamos el contrato " . $ct['codigo'] . " (" . $ct['servicio'] . ") para que lo revises y lo firmes desde el móvil o el ordenador:\n\n" .
        $url . "\n\nEl enlace es personal y caduca el " . labs_fecha_madrid($ct['token_expira']) . ".\n\nUn saludo,\nLabs24k";
    $ok = function_exists('mail') && @mail($mail, '=?UTF-8?B?' . base64_encode('Contrato ' . $ct['codigo'] . ' para firmar · Labs24k') . '?=', $cuerpo,
        'From: Labs24k <no-reply@' . $host . ">\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit");
    labs_firma_evento($ct['id'], $ok ? 'enviado_email' : 'error_email', ($ok ? 'Correo enviado a ' : 'No se pudo enviar el correo a ') . labs_enmascara($mail));
    if ($ct['contacto_id']) {
        labs_evento_contacto($ct['contacto_id'], 'firma', ($ok ? 'Firma enviada por correo a ' : 'Fallo al enviar la firma por correo a ') . labs_enmascara($mail) . ' · ' . $ct['codigo']);
    }
    if (!$ok) {
        return array('modo' => 'manual', 'canal' => 'email', 'destino' => labs_enmascara($mail),
            'enlace' => 'mailto:' . $mail . '?subject=' . rawurlencode('Contrato ' . $ct['codigo'] . ' para firmar') . '&body=' . rawurlencode($cuerpo),
            'aviso' => 'El servidor no ha podido enviar el correo: se abre tu programa de correo con el mensaje listo.');
    }
    return array('modo' => 'real', 'canal' => 'email', 'destino' => labs_enmascara($mail));
}

function labs_enmascara($v)
{
    $v = (string) $v;
    if (strpos($v, '@') !== false) {
        list($a, $d) = explode('@', $v, 2);
        return mb_substr($a, 0, 2) . str_repeat('•', max(1, mb_strlen($a) - 2)) . '@' . $d;
    }
    return mb_substr($v, 0, 4) . str_repeat('•', max(0, mb_strlen($v) - 7)) . mb_substr($v, -3);
}

/* ===========================================================================
   DESPLIEGUE Y LLAMADA DE PRUEBA
   ========================================================================= */
function labs_ia_desplegar($contacto_id)
{
    $c = labs_contacto_para_ia($contacto_id);
    $cfg = labs_ia_config_de($c['id']);
    $sol = array_filter(array_map('trim', explode(',', (string) $c['soluciones'])));
    $pasos = array();
    $paso = function ($nivel, $texto, $ms = 350) use (&$pasos) {
        $pasos[] = array('nivel' => $nivel, 'texto' => $texto, 'ms' => $ms);
    };
    $voz = $cfg['voz'];
    $wa = $cfg['whatsapp'];
    $emb = $cfg['embudo'];
    // Se despliega lo que está activado en el configurador (las soluciones del deal son solo orientativas).
    $usaVoz = !empty($voz['activo']);
    $usaWa = !empty($wa['activo']);
    $usaEmb = !empty($emb['activo']);
    if (!$usaVoz && !$usaWa && !$usaEmb) {
        throw new ErrorApi('Activa al menos un módulo (asistente de voz, bot de WhatsApp o embudo) antes de desplegar.', 400, 'P0001');
    }
    $faltan = array();
    if ($usaVoz && mb_strlen(trim((string) ($voz['prompt'] ?? ''))) < 20) {
        $faltan[] = 'el system prompt del asistente de voz (mínimo 20 caracteres)';
    }
    if ($usaWa && trim((string) ($wa['numero'] ?? '')) === '') {
        $faltan[] = 'el número del canal de WhatsApp';
    }
    if ($faltan) {
        throw new ErrorApi('Falta ' . implode(' y ', $faltan) . '.', 400, 'P0001');
    }
    if (!$cfg['webhook_token']) {
        $cfg['webhook_token'] = bin2hex(random_bytes(16));
        labs_q('UPDATE ia_config SET webhook_token = ? WHERE contacto_id = ?', array($cfg['webhook_token'], $c['id']));
    }
    $hook = labs_url_webhook($cfg['webhook_token']);
    $cliente = $c['empresa'] !== '' ? $c['empresa'] : $c['nombre'];
    $paso('info', 'Iniciando aprovisionamiento para «' . $cliente . '» (#' . $c['id'] . ')', 200);
    $paso('info', 'Validando configuración: ' . implode(' · ', array_filter(array($usaVoz ? 'Asistente de voz' : '', $usaWa ? 'Bot de WhatsApp' : '', $usaEmb ? 'Embudo' : ''))), 300);
    $a = labs_ia_ajustes();
    $real = $a['n8n_url'] !== '';
    if ($usaVoz) {
        $paso('info', 'Twilio › reservando número ' . ($voz['numero'] ?? 'nuevo') . ' para voz entrante/saliente', 500);
        $paso('info', 'OpenAI › modelo ' . ($voz['modelo'] ?? 'gpt-4o') . ' · temperatura ' . ($voz['temperatura'] ?? '0.4') . ' · voz «' . ($voz['voz'] ?? 'nova') . '»', 450);
        $paso('info', 'Cargando system prompt (' . mb_strlen((string) $voz['prompt']) . ' caracteres) y ' . count((array) ($voz['transferencias'] ?? array())) . ' regla(s) de transferencia', 350);
    }
    if ($usaWa) {
        $docs = count((array) ($wa['rag'] ?? array()));
        $paso('info', 'WhatsApp › canal ' . ($wa['proveedor'] ?? 'Twilio') . ' en ' . ($wa['numero'] ?? ''), 450);
        $paso('info', 'RAG › indexando ' . $docs . ' documento(s) y ' . mb_strlen((string) ($wa['conocimiento'] ?? '')) . ' caracteres de base de conocimiento', 600);
    }
    if ($usaEmb) {
        $paso('info', 'n8n › instalando plantilla «' . ($emb['plantilla'] ?? 'captacion') . '» con ' . count((array) ($emb['pasos'] ?? array())) . ' paso(s)', 500);
    }
    $paso('info', 'Webhook de entrada listo: ' . $hook, 250);
    $estado = 'desplegado';
    if ($real) {
        $paso('info', 'Enviando la configuración a tu orquestador (n8n/Make)…', 300);
        list($cod, $resp, $err) = labs_n8n('desplegar', array(
            'contacto' => array('id' => (int) $c['id'], 'nombre' => $c['nombre'], 'empresa' => $c['empresa'], 'email' => $c['email'],
                'telefono' => trim($c['prefijo'] . ' ' . $c['telefono'])),
            'voz' => $usaVoz ? $voz : null, 'whatsapp' => $usaWa ? $wa : null, 'embudo' => $usaEmb ? $emb : null, 'webhook_entrada' => $hook));
        if ($cod >= 200 && $cod < 300) {
            $paso('ok', 'Orquestador › aceptado (HTTP ' . $cod . ')' . ($resp ? ' · ' . mb_substr(preg_replace('/\s+/', ' ', $resp), 0, 140) : ''), 300);
        } else {
            $estado = 'error';
            $paso('error', 'Orquestador › ' . ($err ?: 'respondió HTTP ' . $cod) . '. Revisa la URL de n8n en Configuración → Integraciones IA.', 300);
        }
    } else {
        $paso('warn', 'MODO SIMULACIÓN: no hay orquestador configurado. Nada se ha creado en Twilio, OpenAI ni n8n. ' .
            'Conéctalo en Configuración → Integraciones IA para despliegues reales.', 400);
    }
    if ($estado === 'desplegado') {
        $paso('ok', $real ? '✔ Despliegue completado. El asistente está en producción.' : '✔ Simulación completada: la configuración es válida y está lista para desplegar.', 200);
    }
    labs_q('UPDATE ia_config SET estado = ?, desplegado = ?, actualizado = ? WHERE contacto_id = ?',
        array($real ? $estado : 'simulado', labs_ahora(), labs_ahora(), $c['id']));
    labs_evento_contacto($c['id'], 'ia', ($real ? ($estado === 'desplegado' ? 'Despliegue IA completado' : 'Despliegue IA con errores') : 'Despliegue IA simulado') .
        ' · ' . implode(', ', array_filter(array($usaVoz ? 'voz' : '', $usaWa ? 'WhatsApp' : '', $usaEmb ? 'embudo' : ''))));
    return array('modo' => $real ? 'real' : 'simulacion', 'ok' => $estado === 'desplegado', 'pasos' => $pasos, 'webhook' => $hook,
        'estado' => $real ? $estado : 'simulado');
}

function labs_ia_probar_llamada($b)
{
    $c = labs_contacto_para_ia($b['contacto_id'] ?? 0);
    $cfg = labs_ia_config_de($c['id']);
    $voz = $cfg['voz'];
    $pedido = trim((string) ($b['telefono'] ?? ''));
    $tel = preg_replace('/[^\d+]/', '', $pedido === '' ? $c['prefijo'] . $c['telefono'] : $pedido);
    if (!preg_match('/^\+?\d{8,15}$/', $tel)) {
        throw new ErrorApi('Indica un teléfono válido para la llamada de prueba.', 400, 'P0001');
    }
    if (labs_freno('llamada|' . labs_uid(), 20, 3600)) {
        throw new ErrorApi('Demasiadas llamadas de prueba seguidas. Espera un rato.', 429, 'FRENO');
    }
    $r = labs_n8n('llamada_prueba', array('contacto_id' => (int) $c['id'], 'telefono' => $tel, 'voz' => $voz));
    if ($r !== null) {
        list($cod, $resp, $err) = $r;
        $ok = $cod >= 200 && $cod < 300;
        labs_evento_contacto($c['id'], 'llamada', ($ok ? 'Llamada de prueba lanzada a ' : 'No se pudo lanzar la llamada de prueba a ') . labs_enmascara($tel) .
            ($ok ? '' : ' (' . ($err ?: 'HTTP ' . $cod) . ')'));
        if (!$ok) {
            throw new ErrorApi('El orquestador no ha lanzado la llamada: ' . ($err ?: 'HTTP ' . $cod), 502, 'N8N');
        }
        return array('modo' => 'real', 'mensaje' => 'Llamada lanzada. La transcripción llegará al historial por el webhook.');
    }
    // Simulación: conversación de ejemplo a partir de la configuración.
    $agente = trim((string) ($voz['nombre_agente'] ?? '')) ?: 'Laura';
    $empresa = $c['empresa'] !== '' ? $c['empresa'] : 'la empresa';
    $saludo = trim((string) ($voz['saludo'] ?? '')) ?: 'Hola, soy ' . $agente . ', la asistente virtual de ' . $empresa . '. ¿En qué puedo ayudarte?';
    $trans = array(
        array('quien' => 'IA', 'texto' => $saludo),
        array('quien' => 'Cliente', 'texto' => 'Hola, quería información sobre vuestros servicios y precios.'),
        array('quien' => 'IA', 'texto' => 'Claro. Te cuento lo principal y, si quieres, te reservo una cita con un asesor. ¿Te viene bien esta semana?'),
        array('quien' => 'Cliente', 'texto' => 'Sí, el jueves por la mañana.'),
        array('quien' => 'IA', 'texto' => 'Perfecto, te dejo el jueves a las 10:00. Te llegará la confirmación por WhatsApp. ¡Gracias!'),
    );
    $lineas = array_map(function ($l) {
        return $l['quien'] . ': ' . $l['texto'];
    }, $trans);
    labs_evento_contacto($c['id'], 'llamada', "[SIMULACIÓN] Llamada de prueba del asistente «" . $agente . "» a " . labs_enmascara($tel) . " · 1 min 12 s\n" . implode("\n", $lineas));
    return array('modo' => 'simulacion', 'transcripcion' => $trans, 'duracion' => 72,
        'mensaje' => 'Simulación: no hay orquestador configurado, no se ha llamado a nadie.');
}

/* ===========================================================================
   WEBHOOK DE ENTRADA (público)
   ========================================================================= */
function labs_hook_entrada($token)
{
    if (!preg_match('/^[a-f0-9]{32}$/', $token)) {
        throw new ErrorApi('Webhook no válido.', 404, 'NO_ENCONTRADO');
    }
    if (labs_freno('hook|' . labs_ip(), 300, 3600) || labs_freno('hookt|' . $token, 240, 3600)) {
        throw new ErrorApi('Demasiadas peticiones.', 429, 'FRENO');
    }
    $cfg = labs_fila('SELECT contacto_id FROM ia_config WHERE webhook_token = ?', array($token));
    if (!$cfg) {
        throw new ErrorApi('Webhook no válido.', 404, 'NO_ENCONTRADO');
    }
    $raw = (string) file_get_contents('php://input', false, null, 0, 65537);
    if (strlen($raw) > 65536) {
        throw new ErrorApi('Demasiado grande.', 413, 'PGRST413');
    }
    $d = json_decode($raw, true);
    $tipo = 'webhook';
    $texto = 'Webhook recibido';
    if (is_array($d)) {
        $ev = (string) ($d['evento'] ?? $d['type'] ?? '');
        if (isset($d['transcripcion']) || isset($d['transcript'])) {
            $tipo = 'llamada';
            $t = $d['transcripcion'] ?? $d['transcript'];
            $texto = 'Llamada del asistente' . (isset($d['duracion']) ? ' · ' . (int) $d['duracion'] . ' s' : '') . "\n" .
                (is_array($t) ? implode("\n", array_map(function ($l) {
                    return is_array($l) ? (($l['quien'] ?? $l['role'] ?? '?') . ': ' . ($l['texto'] ?? $l['content'] ?? '')) : (string) $l;
                }, $t)) : (string) $t);
            if (!empty($d['grabacion']) && preg_match('#^https://#', (string) $d['grabacion'])) {
                $texto .= "\nGrabación: " . $d['grabacion'];
            }
        } elseif (isset($d['mensaje']) || isset($d['message'])) {
            $tipo = 'whatsapp';
            $texto = 'WhatsApp · ' . (string) ($d['de'] ?? $d['from'] ?? 'cliente') . ': ' . (string) ($d['mensaje'] ?? $d['message']);
        } else {
            $texto = 'Webhook ' . ($ev ?: 'recibido') . ' · ' . mb_substr(json_encode($d, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), 0, 1500);
        }
    } elseif ($raw !== '') {
        $texto = 'Webhook recibido · ' . mb_substr($raw, 0, 1500);
    }
    labs_q('INSERT INTO contacto_eventos (contacto_id, autor_id, tipo, texto, ts) VALUES (?,?,?,?,?)',
        array($cfg['contacto_id'], null, $tipo, mb_substr($texto, 0, 2000), labs_ahora()));
    labs_q('UPDATE contactos SET ultima_actividad = ? WHERE id = ?', array(labs_ahora(), $cfg['contacto_id']));
    return array('ok' => true);
}

/* ===========================================================================
   SALA DE VENTAS
   ========================================================================= */
function labs_sala($periodo)
{
    labs_usuario(true);
    if (!labs_activo()) {
        throw new ErrorApi('Tu cuenta no está activa.', 403, 'ROL_INSUFICIENTE');
    }
    $tz = new DateTimeZone('Europe/Madrid');
    $ini = new DateTime('today', $tz);
    if ($periodo === 'semana') {
        $ini->modify('monday this week');
    } elseif ($periodo !== 'hoy') {
        $periodo = 'mes';
        $ini->modify('first day of this month');
    }
    $fin_mes = new DateTime('last day of this month 23:59:59', $tz);
    $desde = (clone $ini)->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s.u');
    $mes_desde = (new DateTime('first day of this month 00:00', $tz))->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s.u');
    $hoy_desde = (new DateTime('today', $tz))->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s.u');

    $gente = labs_q("SELECT id, TRIM(CONCAT(nombre, ' ', apellidos)) n, avatar_url, rol, cargo FROM perfiles
                     WHERE estado = 'Activo' AND raiz = 0 AND rol IN ('commercial','manager','admin')")->fetchAll();
    $por = array();
    foreach ($gente as $g) {
        $por[$g['id']] = array('id' => $g['id'], 'nombre' => $g['n'], 'avatar' => $g['avatar_url'], 'rol' => $g['rol'], 'cargo' => $g['cargo'],
            'citas' => 0, 'demos' => 0, 'propuestas' => 0, 'firmados' => 0, 'valor' => 0.0, 'puntos' => 0);
    }
    foreach (labs_q("SELECT comercial_id id, COUNT(*) n FROM citas WHERE estado = 'realizada' AND inicio >= ? GROUP BY comercial_id", array($desde))->fetchAll() as $r) {
        if (isset($por[$r['id']])) {
            $por[$r['id']]['citas'] = (int) $r['n'];
        }
    }
    foreach (labs_q("SELECT autor_id id, a, COUNT(*) n, SUM(valor) v FROM pipeline_movimientos WHERE ts >= ? AND a IN ('demo','propuesta','firmado') GROUP BY autor_id, a",
        array($desde))->fetchAll() as $r) {
        if (!isset($por[$r['id']])) {
            continue;
        }
        $k = array('demo' => 'demos', 'propuesta' => 'propuestas', 'firmado' => 'firmados')[$r['a']];
        $por[$r['id']][$k] = (int) $r['n'];
        if ($r['a'] === 'firmado') {
            $por[$r['id']]['valor'] = (float) $r['v'];
        }
    }
    foreach ($por as &$p) {
        $p['puntos'] = $p['citas'] * 2 + $p['demos'] * 3 + $p['propuestas'] * 5 + $p['firmados'] * 15;
    }
    unset($p);
    $ranking = array_values($por);
    usort($ranking, function ($a, $b) {
        return $b['puntos'] - $a['puntos'] ?: ($b['valor'] <=> $a['valor']) ?: strcmp($a['nombre'], $b['nombre']);
    });

    $n = function ($sql, $par = array()) {
        $f = labs_fila($sql, $par);
        return $f ? (float) array_values($f)[0] : 0;
    };
    $firmados = (int) $n("SELECT COUNT(*) FROM pipeline_movimientos WHERE a = 'firmado' AND ts >= ?", array($desde));
    $perdidos = (int) $n("SELECT COUNT(*) FROM pipeline_movimientos WHERE a = 'perdido' AND ts >= ?", array($desde));
    $kpis = array(
        'firmados' => $firmados,
        'valor_ganado' => $n("SELECT COALESCE(SUM(valor),0) FROM pipeline_movimientos WHERE a = 'firmado' AND ts >= ?", array($desde)),
        'pipeline_abierto' => $n("SELECT COALESCE(SUM(valor),0) FROM contactos WHERE fase NOT IN ('firmado','despliegue','produccion','perdido')"),
        'pipeline_ponderado' => 0,
        'deals_abiertos' => (int) $n("SELECT COUNT(*) FROM contactos WHERE fase NOT IN ('firmado','despliegue','produccion','perdido')"),
        'citas_realizadas' => (int) $n("SELECT COUNT(*) FROM citas WHERE estado = 'realizada' AND inicio >= ?", array($desde)),
        'citas_hoy' => (int) $n("SELECT COUNT(*) FROM citas WHERE estado IN ('programada','confirmada') AND inicio >= ? AND inicio < DATE_ADD(?, INTERVAL 1 DAY)", array($hoy_desde, $hoy_desde)),
        'leads_nuevos' => (int) $n('SELECT COUNT(*) FROM contactos WHERE creado >= ?', array($desde)),
        'ia_produccion' => (int) $n("SELECT COUNT(*) FROM ia_config WHERE estado = 'desplegado'"),
        'ia_configurados' => (int) $n("SELECT COUNT(*) FROM ia_config WHERE estado IN ('desplegado','simulado')"),
        'llamadas_ia' => (int) $n("SELECT COUNT(*) FROM contacto_eventos WHERE tipo = 'llamada' AND ts >= ?", array($desde)),
        'whatsapp' => (int) $n("SELECT COUNT(*) FROM contacto_eventos WHERE tipo = 'whatsapp' AND ts >= ?", array($desde)),
        'tasa_cierre' => ($firmados + $perdidos) ? round($firmados * 100 / ($firmados + $perdidos)) : null,
        'puntos_equipo' => array_sum(array_column($ranking, 'puntos')),
    );
    foreach (labs_q("SELECT fase, COALESCE(SUM(valor),0) v FROM contactos WHERE fase NOT IN ('firmado','despliegue','produccion','perdido') GROUP BY fase")->fetchAll() as $r) {
        $kpis['pipeline_ponderado'] += (float) $r['v'] * labs_fases()[$r['fase']][3] / 100;
    }
    $objetivo = max(1, (int) labs_ajuste('sala.objetivo_mes', '10'));
    $firmados_mes = (int) $n("SELECT COUNT(*) FROM pipeline_movimientos WHERE a = 'firmado' AND ts >= ?", array($mes_desde));
    $dia = (int) (new DateTime('now', $tz))->format('j');
    $dias = (int) $fin_mes->format('j');

    // Actividad en directo: historial de contactos, firmas y citas.
    $feed = labs_q("SELECT 'contacto' origen, e.tipo, e.texto, e.ts, c.id contacto_id, c.nombre contacto, TRIM(CONCAT(p.nombre,' ',p.apellidos)) autor
                    FROM contacto_eventos e JOIN contactos c ON c.id = e.contacto_id LEFT JOIN perfiles p ON p.id = e.autor_id
                    WHERE e.ts >= ? ORDER BY e.ts DESC LIMIT 40", array(labs_hace(14 * 86400)))->fetchAll();
    foreach (labs_q("SELECT 'firma' origen, f.evento tipo, f.detalle texto, f.ts, k.contacto_id, k.cliente contacto, NULL autor
                     FROM firma_eventos f JOIN contratos k ON k.id = f.contrato_id WHERE f.ts >= ? AND f.evento IN ('abierto','firmado')
                     ORDER BY f.ts DESC LIMIT 20", array(labs_hace(14 * 86400)))->fetchAll() as $f) {
        $f['texto'] = $f['tipo'] === 'firmado' ? 'Contrato firmado por el cliente' : 'El cliente ha abierto el contrato';
        $feed[] = $f;
    }
    usort($feed, function ($a, $b) {
        return strcmp($b['ts'], $a['ts']);
    });
    $feed = array_slice($feed, 0, 40);
    foreach ($feed as &$f) {
        $f['ts'] = labs_sale('s', $f['ts']);
        $f['texto'] = mb_substr((string) $f['texto'], 0, 220);
        $f['contacto_id'] = $f['contacto_id'] === null ? null : (int) $f['contacto_id'];
    }
    unset($f);
    // Actividad por hora del día (últimos 30 días) para el «análisis en directo».
    $horas = array_fill(0, 24, 0);
    foreach (labs_q("SELECT HOUR(CONVERT_TZ(ts, '+00:00', ?)) h, COUNT(*) n FROM contacto_eventos WHERE ts >= ? GROUP BY h",
        array((new DateTime('now', $tz))->format('P'), labs_hace(30 * 86400)))->fetchAll() as $r) {
        if ($r['h'] !== null) {
            $horas[(int) $r['h']] = (int) $r['n'];
        }
    }
    $serie = array();
    foreach (labs_q("SELECT DATE(CONVERT_TZ(ts, '+00:00', ?)) d, COUNT(*) n FROM contacto_eventos WHERE ts >= ? GROUP BY d ORDER BY d",
        array((new DateTime('now', $tz))->format('P'), labs_hace(14 * 86400)))->fetchAll() as $r) {
        $serie[] = array('d' => $r['d'], 'n' => (int) $r['n']);
    }
    $fases = array();
    foreach (labs_q("SELECT fase, COUNT(*) n, COALESCE(SUM(valor),0) v FROM contactos GROUP BY fase")->fetchAll() as $r) {
        $fases[$r['fase']] = array('n' => (int) $r['n'], 'v' => (float) $r['v']);
    }
    return array(
        'periodo' => $periodo, 'kpis' => $kpis, 'ranking' => $ranking, 'feed' => $feed, 'horas' => $horas, 'serie' => $serie, 'fases' => $fases,
        'objetivo' => array('meta' => $objetivo, 'hechos' => $firmados_mes, 'dia' => $dia, 'dias' => $dias,
            'proyeccion' => $dia ? (int) round($firmados_mes / $dia * $dias) : 0),
        'ahora' => gmdate('Y-m-d\TH:i:s\Z'),
    );
}

/* ===========================================================================
   RUTAS /ia/...
   ========================================================================= */
function labs_ia($metodo, $sub, $b, $pares)
{
    $u = labs_usuario(true);
    if (!labs_activo()) {
        throw new ErrorApi('Tu cuenta no está activa.', 403, 'ROL_INSUFICIENTE');
    }
    $b = is_array($b) ? $b : array();
    $sub = rtrim($sub, '/');
    if ($sub === '/ajustes') {
        if (labs_mi_rol() !== 'admin') {
            throw new ErrorApi('Las integraciones las configura administración.', 403, 'ROL_INSUFICIENTE');
        }
        if ($metodo === 'POST') {
            $sid = trim((string) ($b['twilio_sid'] ?? labs_ajuste('ia.twilio_sid', '')));
            if ($sid !== '' && !preg_match('/^AC[a-f0-9]{32}$/i', $sid)) {
                throw new ErrorApi('El Account SID de Twilio empieza por AC y tiene 34 caracteres.', 400, 'P0001');
            }
            $from = trim((string) ($b['twilio_from'] ?? labs_ajuste('ia.twilio_from', '')));
            if ($from !== '' && !preg_match('/^(\+\d{8,15}|[A-Za-z0-9 ]{3,11})$/', $from)) {
                throw new ErrorApi('El remitente de Twilio debe ser un número en formato +34600000000.', 400, 'P0001');
            }
            $url = trim((string) ($b['n8n_url'] ?? labs_ajuste('ia.n8n_url', '')));
            if ($url !== '' && !preg_match('#^https://[^\s/$.?\#].[^\s]*$#i', $url)) {
                throw new ErrorApi('La URL del webhook de n8n/Make tiene que empezar por https://', 400, 'P0001');
            }
            labs_pon_ajuste('ia.twilio_sid', $sid);
            labs_pon_ajuste('ia.twilio_from', $from);
            labs_pon_ajuste('ia.n8n_url', $url);
            foreach (array('twilio_token', 'n8n_token') as $k) {
                if (array_key_exists($k, $b) && $b[$k] !== '********') {
                    labs_pon_ajuste('ia.' . $k, mb_substr(trim((string) $b[$k]), 0, 200));
                }
            }
            if (isset($b['objetivo_mes'])) {
                labs_pon_ajuste('sala.objetivo_mes', (string) max(1, min(10000, (int) $b['objetivo_mes'])));
            }
            labs_anota('Integraciones IA actualizadas', 'Twilio: ' . ($sid ? 'configurado' : 'no') . ' · Orquestador: ' . ($url ? parse_url($url, PHP_URL_HOST) : 'no'));
        }
        $a = labs_ia_ajustes();
        return array(200, array('twilio_sid' => $a['twilio_sid'], 'twilio_from' => $a['twilio_from'],
            'twilio_token' => $a['twilio_token'] !== '' ? '********' : '', 'n8n_url' => $a['n8n_url'],
            'n8n_token' => $a['n8n_token'] !== '' ? '********' : '', 'objetivo_mes' => (int) labs_ajuste('sala.objetivo_mes', '10'),
            'sms_real' => $a['twilio_sid'] !== '' && $a['twilio_token'] !== '' && $a['twilio_from'] !== '', 'orquestador' => $a['n8n_url'] !== ''));
    }
    if ($sub === '/estado' && $metodo === 'GET') {
        $a = labs_ia_ajustes();
        return array(200, array('sms_real' => $a['twilio_sid'] !== '' && $a['twilio_token'] !== '' && $a['twilio_from'] !== '',
            'orquestador' => $a['n8n_url'] !== '', 'correo' => function_exists('mail')));
    }
    if ($sub === '/firma-enviar' && $metodo === 'POST') {
        return array(200, labs_ia_firma_enviar($b));
    }
    if (preg_match('#^/desplegar/(\d+)$#', $sub, $m) && $metodo === 'POST') {
        return array(200, labs_ia_desplegar((int) $m[1]));
    }
    if ($sub === '/probar-llamada' && $metodo === 'POST') {
        return array(200, labs_ia_probar_llamada($b));
    }
    if (preg_match('#^/webhook/(\d+)$#', $sub, $m) && $metodo === 'GET') {
        $c = labs_contacto_para_ia((int) $m[1], false);
        $f = labs_fila('SELECT webhook_token FROM ia_config WHERE contacto_id = ?', array($c['id']));
        return array(200, array('url' => $f && $f['webhook_token'] ? labs_url_webhook($f['webhook_token']) : null));
    }
    if (preg_match('#^/webhook/(\d+)$#', $sub, $m) && $metodo === 'POST') {
        $c = labs_contacto_para_ia((int) $m[1]);
        labs_ia_config_de($c['id']);
        $tok = bin2hex(random_bytes(16));
        labs_q('UPDATE ia_config SET webhook_token = ? WHERE contacto_id = ?', array($tok, $c['id']));
        labs_anota('Webhook de contacto regenerado', 'Contacto #' . $c['id']);
        return array(200, array('url' => labs_url_webhook($tok)));
    }
    throw new ErrorApi('Operación desconocida.', 404, 'RUTA_DESCONOCIDA');
}
