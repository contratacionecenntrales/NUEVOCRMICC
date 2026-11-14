<?php
/**
 * Zona de agentes · Cierre de ventas y coordinación de equipos comerciales.
 *
 * - Cierre (closer): cada presupuesto abierto sigue una cadencia de cierre que alterna canales
 *   (correo de resumen → llamada → correo de valor → visita o llamada de dirección → correo de
 *   ruptura → decisión), con una «temperatura» de la oportunidad y alternativas ante objeciones
 *   (pago en hitos o pack inferior). Lo que habla con el cliente o toca dinero, con aprobación.
 * - Coordinación: vigila a cada gestor humano (seguimientos vencidos, actividad, cierres), le
 *   pone tareas concretas en su agenda y reasigna oportunidades calientes si alguien se para.
 */
defined('LABS') || exit;

/** Pasos de la cadencia: número => [clave, días desde el presupuesto, qué se hace]. */
function labs_cierre_pasos()
{
    return array(
        1 => array('resumen', 0, 'Correo de resumen (en menos de 24 h): lo que nos contó, su fuga frente a la inversión y fecha propuesta'),
        2 => array('llamada', 2, 'Llamada del gestor: resolver dudas y fijar el siguiente paso con fecha'),
        3 => array('valor', 5, 'Correo de valor: caso de su sector, plan de arranque en 3 semanas y pago por hitos'),
        4 => array('escalado', 8, 'Escalado: visita presencial (propuestas grandes) o llamada de dirección'),
        5 => array('ruptura', 12, 'Correo de ruptura: «¿cierro tu expediente?» con tres respuestas de un número'),
        6 => array('decision', 19, 'Decisión: perdido con motivo y recontacto a los 90 días'),
    );
}

function labs_cierre_estado($pid)
{
    $e = labs_fila('SELECT * FROM equipo_cierre WHERE presupuesto_id = ?', array((int) $pid));
    return $e ?: array('presupuesto_id' => (int) $pid, 'paso' => 0, 'ultimo_toque' => null);
}

function labs_cierre_marca($pid, $paso)
{
    labs_q('INSERT INTO equipo_cierre (presupuesto_id, paso, ultimo_toque, actualizado) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE paso = VALUES(paso), ultimo_toque = VALUES(ultimo_toque), actualizado = VALUES(actualizado)',
        array((int) $pid, (int) $paso, labs_ahora(), labs_ahora()));
}

/** Temperatura 0-100: cuánto de cerca está el cliente de firmar, con señales del CRM. */
function labs_cierre_temperatura($p, $c)
{
    $t = 30;
    $t += $c && trim((string) $c['decisor_nombre']) !== '' ? 15 : 0;
    $t += $c && (float) $c['fuga_anual'] > 0 ? 15 : 0;
    if ($c) {
        $t += labs_fila("SELECT 1 FROM citas WHERE contacto_id = ? AND tipo IN ('demo', 'visita') AND estado = 'realizada'", array($c['id'])) ? 15 : 0;
        $t += labs_fila("SELECT 1 FROM llamadas WHERE contacto_id = ? AND resultado IN ('interesado', 'propuesta', 'cierre_verbal') AND inicio >= ?", array($c['id'], gmdate('Y-m-d H:i:s', time() - 14 * 86400))) ? 15 : 0;
        $t += labs_fila("SELECT 1 FROM llamadas WHERE contacto_id = ? AND resultado = 'cierre_verbal'", array($c['id'])) ? 10 : 0;
        $ult = $c['ultima_actividad'] ?: $c['creado'];
        $dias = max(0, (time() - strtotime($ult . ' UTC')) / 86400 - 3);
        $t -= (int) round(3 * $dias);
    }
    $t -= (int) floor(max(0, (time() - strtotime($p['creado'] . ' UTC')) / 86400 - 14));
    return max(0, min(100, $t));
}

/** Presupuestos abiertos con su paso de la cadencia, temperatura y qué toca ahora. */
function labs_cierre_abiertos($lim = 40)
{
    $out = array();
    $pasos = labs_cierre_pasos();
    foreach (labs_q("SELECT p.*, c.nombre AS c_nombre, c.empresa AS c_empresa, c.fase AS c_fase FROM presupuestos p JOIN contactos c ON c.id = p.contacto_id
                     WHERE p.estado IN ('Borrador', 'Enviado', 'En revisión') AND c.activo = 1 AND c.fase NOT IN ('perdido', 'firmado', 'despliegue', 'produccion')
                       AND NOT EXISTS (SELECT 1 FROM presupuestos q WHERE q.contacto_id = p.contacto_id AND q.id > p.id AND q.estado IN ('Borrador', 'Enviado', 'En revisión'))
                     ORDER BY p.creado LIMIT " . (int) $lim)->fetchAll() as $p) {
        $c = labs_equipo_contacto($p['contacto_id']);
        $e = labs_cierre_estado($p['id']);
        $dias = (int) floor((time() - strtotime($p['creado'] . ' UTC')) / 86400);
        $sig = (int) $e['paso'] + 1;
        // Una reunión real ya agendada (demo, visita o firma) manda: la cadencia espera a que pase.
        $espera = labs_fila("SELECT inicio FROM citas WHERE contacto_id = ? AND tipo IN ('demo', 'visita', 'firma') AND estado IN ('programada', 'confirmada') AND inicio >= ? ORDER BY inicio LIMIT 1", array($p['contacto_id'], labs_ahora()));
        $toca = isset($pasos[$sig]) && $dias >= $pasos[$sig][1] && !$espera && (!$e['ultimo_toque'] || strtotime($e['ultimo_toque'] . ' UTC') < time() - 20 * 3600);
        $d = json_decode((string) $p['datos'], true) ?: array();
        $out[] = array('presupuesto_id' => (int) $p['id'], 'codigo' => $p['codigo'], 'cliente' => $p['cliente'], 'contacto_id' => (int) $p['contacto_id'], 'base' => (float) $p['base'],
            'estado' => $p['estado'], 'dias' => $dias, 'paso' => (int) $e['paso'], 'ultimo_toque' => $e['ultimo_toque'], 'temperatura' => labs_cierre_temperatura($p, $c),
            'siguiente_paso' => isset($pasos[$sig]) ? array('n' => $sig, 'clave' => $pasos[$sig][0], 'que' => $pasos[$sig][2], 'dia' => $pasos[$sig][1]) : null,
            'toca_ahora' => $toca, 'espera_cita' => $espera ? $espera['inicio'] : null, 'gestor_id' => $p['autor_id'],
            'decisor' => $c ? $c['decisor_nombre'] : '', 'tiene_email' => $c && ($c['decisor_email'] !== '' || $c['email'] !== '' || ($d['email'] ?? '') !== ''),
            'cuello' => $c ? $c['cuello'] : '', 'fuga_anual' => $c ? (float) $c['fuga_anual'] : 0);
    }
    usort($out, function ($a, $b) { return ($b['toca_ahora'] <=> $a['toca_ahora']) ?: ($b['temperatura'] <=> $a['temperatura']); });
    return $out;
}

/** Correo al cliente (no comercial en frío: es su propio presupuesto). Firma y datos los pone el sistema. */
function labs_cierre_correo($c, $p, $asunto, $cuerpo)
{
    $d = json_decode((string) $p['datos'], true) ?: array();
    $para = labs_motor_email_ascii($c['decisor_email'] !== '' ? $c['decisor_email'] : ($c['email'] !== '' ? $c['email'] : ($d['email'] ?? '')));
    $o = labs_tabla_existe('motor_leads') ? labs_motor_cfg()['outreach'] : array('remitente_nombre' => '', 'remitente_cargo' => '', 'empresa' => 'Labs24k', 'telefono' => '');
    $g = $p['autor_id'] ? labs_fila('SELECT nombre, apellidos, telefono FROM perfiles WHERE id = ?', array($p['autor_id'])) : null;
    $firma = trim(($g ? trim($g['nombre'] . ' ' . $g['apellidos']) : $o['remitente_nombre']) . "\n" . $o['empresa'] . ($g && $g['telefono'] ? ' · ' . $g['telefono'] : ($o['telefono'] ? ' · ' . $o['telefono'] : '')));
    $cuerpo = trim($cuerpo) . "\n\n" . $firma;
    $enviado = false;
    $nota = '';
    if ($para === '') {
        $nota = 'el cliente no tiene un correo válido en la ficha';
    } elseif (!labs_tabla_existe('motor_leads')) {
        $nota = 'sin correo de salida configurado';
    } else {
        try {
            labs_motor_smtp_envia($para, $asunto, $cuerpo, '<cierre-' . $p['id'] . '-' . bin2hex(random_bytes(6)) . '@labs24k>', null);
            $enviado = true;
        } catch (Exception $x) {
            $nota = $x->getMessage();
        }
    }
    labs_q('INSERT INTO contacto_eventos (contacto_id, autor_id, tipo, texto, ts) VALUES (?,?,?,?,?)', array($c['id'], labs_uid(), 'correo',
        mb_substr(($enviado ? 'Correo de cierre enviado a ' . $para : 'Correo de cierre preparado, no enviado (' . $nota . '): envíalo a mano') . "\nAsunto: " . $asunto . "\n" . $cuerpo, 0, 2000), labs_ahora()));
    return array($enviado, $nota, $para);
}

/** Textos de la cadencia (cuando no los escribe Claude). Honestos: sin urgencias falsas ni cifras inventadas. */
function labs_cierre_plantilla($clave, $c, $p)
{
    $nom = trim((string) $c['decisor_nombre']) !== '' ? preg_replace('/\s.*/u', '', trim($c['decisor_nombre'])) : '';
    $hola = 'Hola' . ($nom !== '' ? ' ' . $nom : '') . ':';
    $emp = labs_equipo_nombre_contacto($c);
    $l = json_decode((string) $p['lineas'], true) ?: array();
    $pack = $l ? $l[0]['n'] : 'la propuesta';
    $d = json_decode((string) $p['datos'], true) ?: array();
    $dia = labs_tabla_existe('motor_leads') ? labs_motor_dia_cita() : 'jueves';
    $cuello = $c['cuello'] !== '' ? labs_ventas_cuellos()[$c['cuello']][0] : '';
    $fuga = (float) $c['fuga_anual'] > 0 ? labs_ventas_euros($c['fuga_anual']) : '';
    if ($clave === 'resumen') {
        return array('Resumen de la propuesta ' . $p['codigo'] . ' · ' . $emp,
            $hola . "\n\nGracias por vuestro tiempo. Te resumo lo que hemos visto para que lo tengas a mano:\n\n" .
            ($cuello !== '' ? '• Lo que nos contaste: el punto donde se os escapan clientes es «' . mb_strtolower($cuello) . '»' . ($fuga !== '' ? ', con una fuga estimada de unos ' . $fuga . ' al año' : '') . ".\n" : '') .
            '• Lo que proponemos: ' . $pack . ' · ' . labs_ventas_euros($p['base']) . ' + IVA, pago único' . (!empty($d['hito']) && (int) $d['hito'] < 100 ? ' (' . (int) $d['hito'] . ' % al arrancar)' : '') . ".\n" .
            "• Cómo arrancaríamos: auditoría técnica, configuración con vuestros datos y puesta en marcha con tu equipo.\n\n" .
            'Para avanzar solo hace falta tu visto bueno y fijar la fecha de la auditoría técnica. ¿Te va bien el ' . $dia . ", o prefieres otro día?\n\nCualquier duda, respóndeme a este correo.");
    }
    if ($clave === 'valor') {
        $caso = labs_tabla_existe('motor_leads') ? labs_motor_caso_sector($c['sector']) : 'un asistente que atiende al momento y deja la cita hecha';
        return array('Cómo arrancaríamos en ' . $emp,
            $hola . "\n\nPara que lo veas en concreto, en negocios como el vuestro el sistema funciona así: " . $caso . ".\n\n" .
            "El plan sería de tres semanas:\n1. Semana 1: auditoría técnica y acceso a lo que ya usáis.\n2. Semana 2: configuración con vuestros textos, horarios y servicios.\n3. Semana 3: puesta en marcha y ajustes con tu equipo.\n\n" .
            "Si os viene mejor, el pago puede ir en hitos ligados a cada fase.\n\n¿Qué tendría que pasar para que lo pusiéramos en marcha este mes?");
    }
    return array('¿Cierro tu expediente' . ($nom !== '' ? ', ' . $nom : '') . '?',
        $hola . "\n\nNo he vuelto a saber de vosotros sobre la propuesta " . $p['codigo'] . " y no quiero insistir de más. ¿Me dices cuál de estas es?\n\n" .
        "1. Seguimos interesados, pero ahora no es el momento (dime cuándo te escribo).\n2. Hay algo de la propuesta que no encaja (cuéntame qué y lo ajustamos).\n3. Lo dejamos aquí.\n\nCon un número me vale.");
}

/* --- Herramientas --------------------------------------------------------------------------- */
function labs_cierre_herramientas()
{
    $txt = function ($d, $max = 600) { return array('type' => 'string', 'description' => $d, 'maxLength' => $max); };
    return array(
        'ver_sala_de_cierre' => array(array('cierre', 'comercial', 'ceo', 'coordinador'), 'lectura', 'Presupuestos abiertos con su temperatura (0-100), días, paso de la cadencia de cierre y si toca actuar ya.', array(), array()),
        'avanzar_cierre' => array(array('cierre'), 'medio', 'Da el siguiente paso de la cadencia de cierre de un presupuesto (correo de resumen, llamada, correo de valor, escalado, correo de ruptura o decisión). Los correos y la decisión necesitan aprobación humana. Puedes escribir tú el asunto y el texto del correo.',
            array('presupuesto_id' => array('type' => 'integer'), 'asunto' => $txt('Asunto (solo pasos de correo; opcional)', 150), 'mensaje' => $txt('Texto del correo sin firma (opcional; si no, plantilla)', 2000)), array('presupuesto_id')),
        'proponer_alternativa' => array(array('cierre', 'comercial'), 'alto', 'Ante una objeción, prepara una alternativa en borrador: «hitos» (mismo pack en 3 pagos) o «pack_inferior» (el pack de debajo). Nunca un descuento sin contrapartida.',
            array('presupuesto_id' => array('type' => 'integer'), 'tipo' => array('type' => 'string', 'enum' => array('hitos', 'pack_inferior')), 'motivo' => $txt('La objeción que resuelve', 400)), array('presupuesto_id', 'tipo', 'motivo')),
        'ver_equipo_comercial' => array(array('coordinador', 'comercial', 'ceo', 'qa'), 'lectura', 'Cada gestor humano: cartera activa, seguimientos vencidos, llamadas en 7 días, citas, presupuestos abiertos y aceptados, y su jefe de equipo.', array(), array()),
        'encargar_a_gestor' => array(array('coordinador', 'comercial'), 'medio', 'Pone una tarea concreta en la agenda de un gestor humano (15 minutos en su primer hueco libre) con las instrucciones.',
            array('gestor_id' => array('type' => 'string'), 'titulo' => $txt('Qué tiene que hacer', 150), 'detalle' => $txt('Instrucciones concretas (con qué clientes y cómo)', 1500), 'contacto_id' => array('type' => 'integer')), array('gestor_id', 'titulo', 'detalle')),
        'reasignar_contacto' => array(array('coordinador'), 'medio', 'Pasa una oportunidad (y sus citas futuras) a otro gestor, por ejemplo si el actual está parado o saturado.',
            array('contacto_id' => array('type' => 'integer'), 'gestor_id' => array('type' => 'string'), 'motivo' => $txt('Por qué', 300)), array('contacto_id', 'gestor_id', 'motivo')),
    );
}

function labs_equipo_h_ver_sala_de_cierre($e, $rol)
{
    $a = labs_cierre_abiertos();
    return array('presupuestos' => $a, 'cadencia' => array_map(function ($x) { return 'Día ' . $x[1] . ': ' . $x[2]; }, labs_cierre_pasos()),
        'tocan_ahora' => count(array_filter($a, function ($x) { return $x['toca_ahora']; })));
}

function labs_equipo_h_avanzar_cierre($e, $rol)
{
    $p = labs_fila('SELECT * FROM presupuestos WHERE id = ?', array((int) ($e['presupuesto_id'] ?? 0)));
    if (!$p || !in_array($p['estado'], array('Borrador', 'Enviado', 'En revisión'), true) || !$p['contacto_id']) {
        throw new Exception('Ese presupuesto no está abierto o no tiene cliente.');
    }
    $c = labs_equipo_contacto($p['contacto_id']);
    if (!$c) {
        throw new Exception('El cliente de ese presupuesto ya no está activo.');
    }
    $st = labs_cierre_estado($p['id']);
    $pasos = labs_cierre_pasos();
    $n = (int) $st['paso'] + 1;
    if (!isset($pasos[$n])) {
        throw new Exception('La cadencia de ese presupuesto ya está completa.');
    }
    $clave = $pasos[$n][0];
    $emp = labs_equipo_nombre_contacto($c);
    if (in_array($clave, array('resumen', 'valor', 'ruptura'), true)) {
        list($as, $cu) = labs_cierre_plantilla($clave, $c, $p);
        if (trim((string) ($e['mensaje'] ?? '')) !== '') {
            $cu = trim($e['mensaje']);
            $as = trim((string) ($e['asunto'] ?? '')) !== '' ? mb_substr(trim($e['asunto']), 0, 150) : $as;
        }
        list($ok, $nota, $para) = labs_cierre_correo($c, $p, $as, $cu);
        if ($p['estado'] === 'Borrador' && $clave === 'resumen') {
            labs_q("UPDATE presupuestos SET estado = 'Enviado' WHERE id = ?", array($p['id']));
        }
        labs_cierre_marca($p['id'], $n);
        return array('contacto_id' => (int) $c['id'], 'enviado' => $ok, 'resumen' => 'Cierre ' . $p['codigo'] . ' · paso ' . $n . ' (' . $clave . '): ' . ($ok ? 'correo enviado a ' . $para : 'correo preparado para enviar a mano (' . $nota . ')'));
    }
    if ($clave === 'llamada') {
        $ya = labs_fila("SELECT inicio, comercial_id FROM citas WHERE contacto_id = ? AND tipo IN ('llamada', 'seguimiento') AND estado IN ('programada', 'confirmada') AND inicio >= ? ORDER BY inicio LIMIT 1",
            array($c['id'], gmdate('Y-m-d H:i:s', time() - 6 * 3600)));
        if ($ya) {
            labs_cierre_marca($p['id'], $n);
            return array('contacto_id' => (int) $c['id'], 'resumen' => 'Cierre ' . $p['codigo'] . ' · paso 2: la llamada de seguimiento ya estaba en la agenda (' . $ya['inicio'] . ' UTC)');
        }
        $r = labs_equipo_h_programar_llamada(array('contacto_id' => $c['id'], 'gestor_id' => $p['autor_id'], 'dias' => 0,
            'motivo' => 'Cierre ' . $p['codigo'] . ': confirmar que lo ha revisado, resolver dudas («¿qué necesitarías ver para decidir?») y cerrar fecha de arranque o de auditoría'), $rol);
        labs_cierre_marca($p['id'], $n);
        return array('contacto_id' => (int) $c['id'], 'resumen' => 'Cierre ' . $p['codigo'] . ' · paso 2: ' . $r['resumen']);
    }
    if ($clave === 'escalado') {
        $grande = (float) $p['base'] >= 2800 && labs_equipo_direccion_de($c) !== '';
        if ($grande && !labs_fila("SELECT 1 FROM citas WHERE contacto_id = ? AND tipo = 'visita' AND estado IN ('programada', 'confirmada') AND inicio >= ?", array($c['id'], labs_ahora()))) {
            $r = labs_equipo_h_enviar_gestor_demo(array('contacto_id' => $c['id'], 'presupuesto_id' => $p['id'], 'gestor_id' => $p['autor_id'], 'dias' => 1,
                'briefing' => 'Escalado de cierre: propuesta ' . $p['codigo'] . ' sin decisión tras ' . (int) floor((time() - strtotime($p['creado'] . ' UTC')) / 86400) . ' días. Ir con el presupuesto, repasar la fuga frente a la inversión, preguntar qué le frena y salir con fecha de firma.'), $rol);
        } else {
            $jefe = labs_q("SELECT id FROM perfiles WHERE estado = 'Activo' AND rol IN ('manager', 'admin') ORDER BY rol = 'manager' DESC, raiz LIMIT 1")->fetchColumn();
            $r = labs_equipo_h_programar_llamada(array('contacto_id' => $c['id'], 'gestor_id' => $jefe ?: $p['autor_id'], 'dias' => 0,
                'motivo' => 'Llamada de dirección sobre ' . $p['codigo'] . ': agradecer el interés, preguntar qué le frena y ofrecer una alternativa (pago en hitos o pack inferior)'), $rol);
        }
        labs_cierre_marca($p['id'], $n);
        return array('contacto_id' => (int) $c['id'], 'resumen' => 'Cierre ' . $p['codigo'] . ' · paso 4 (escalado): ' . $r['resumen']);
    }
    // Decisión: se cierra con motivo y se deja un recontacto a 90 días (nurturing), sin perder la cuenta.
    labs_q("UPDATE presupuestos SET estado = 'Rechazado' WHERE id = ?", array($p['id']));
    labs_equipo_actualiza_contacto($c, array('fase' => 'perdido', 'motivo_perdida' => 'Sin respuesta tras la cadencia de cierre (' . $p['codigo'] . ')'));
    $g = labs_equipo_gestor_para($c, $p['autor_id']);
    if ($g) {
        $f = labs_equipo_laborable(64, 10);
        labs_q('INSERT INTO citas (contacto_id, titulo, tipo, inicio, fin, comercial_id, estado, sector, lugar, notas, resumen, creado_por, creado, actualizado) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
            array($c['id'], mb_substr('Recontacto a 90 días · ' . $emp, 0, 200), 'seguimiento', labs_equipo_utc($f), gmdate('Y-m-d H:i:s', $f->getTimestamp() + 900), $g['id'], 'programada',
                mb_substr((string) $c['sector'], 0, 60), '', 'La propuesta ' . $p['codigo'] . ' se cerró sin respuesta. Volver a contactar: ¿ha cambiado algo? ¿Seguís perdiendo clientes fuera de horario?', '', $g['id'], labs_ahora(), labs_ahora()));
    }
    labs_equipo_evento($c['id'], $rol, 'Cadencia de cierre terminada sin respuesta: ' . $p['codigo'] . ' rechazado y recontacto a los 90 días.');
    labs_cierre_marca($p['id'], $n);
    return array('contacto_id' => (int) $c['id'], 'resumen' => 'Cierre ' . $p['codigo'] . ': sin respuesta tras la cadencia, perdido con recontacto a 90 días');
}

function labs_equipo_h_proponer_alternativa($e, $rol)
{
    $p = labs_fila('SELECT * FROM presupuestos WHERE id = ?', array((int) ($e['presupuesto_id'] ?? 0)));
    if (!$p || !in_array($p['estado'], array('Borrador', 'Enviado', 'En revisión'), true) || !$p['contacto_id']) {
        throw new Exception('Solo se prepara una alternativa de un presupuesto abierto.');
    }
    $l = json_decode((string) $p['lineas'], true) ?: array();
    $d = json_decode((string) $p['datos'], true) ?: array();
    $tipo = ($e['tipo'] ?? '') === 'pack_inferior' ? 'pack_inferior' : 'hitos';
    if ($tipo === 'pack_inferior') {
        $orden = array('pk3' => 'pk2', 'pk2' => 'pk1');
        $id = $l[0]['id'] ?? '';
        if (!isset($orden[$id])) {
            throw new Exception('No hay un pack inferior a ' . ($l[0]['n'] ?? 'ese') . '.');
        }
        $pk = labs_equipo_packs()[$orden[$id]];
        $l = array(array('id' => $orden[$id], 'code' => $pk['code'], 'n' => $pk['n'], 'd' => $pk['d'], 'p' => $pk['p'], 'm' => 0));
        $nota = 'Alternativa con el pack inferior para empezar; se puede ampliar después descontando lo invertido.';
    } else {
        $d['hito'] = 34;
        $nota = 'Alternativa: el mismo proyecto en 3 pagos ligados a cada fase (auditoría, configuración y puesta en marcha).';
    }
    $d['nota'] = mb_substr(trim($nota . ' ' . (string) ($e['motivo'] ?? '')), 0, 2000);
    $d['titulo'] = mb_substr(($d['titulo'] ?? 'Propuesta') . ' · alternativa', 0, 200);
    $fila = labs_inserta_fila('presupuestos', labs_tabla('presupuestos'), array('cliente' => $p['cliente'], 'autor_id' => $p['autor_id'], 'contacto_id' => (int) $p['contacto_id'],
        'lineas' => $l, 'iva' => (float) $p['iva'], 'estado' => 'Borrador', 'codigo' => '', 'datos' => $d), true);
    labs_equipo_evento($p['contacto_id'], $rol, 'Alternativa preparada (' . ($tipo === 'hitos' ? 'pago en 3 hitos' : 'pack inferior') . '): ' . $fila['codigo'] . ' frente a ' . $p['codigo'] . '. Motivo: ' . mb_substr((string) ($e['motivo'] ?? ''), 0, 300), 'nota');
    return array('presupuesto_id' => (int) $fila['id'], 'contacto_id' => (int) $p['contacto_id'], 'resumen' => 'Alternativa ' . $fila['codigo'] . ' (' . ($tipo === 'hitos' ? 'pago en 3 hitos' : 'pack inferior') . ') para ' . $p['cliente']);
}

/** Cada gestor humano con sus números. */
function labs_cierre_equipo_comercial()
{
    $ahora = labs_ahora();
    $h7 = gmdate('Y-m-d H:i:s', time() - 7 * 86400);
    $h30 = gmdate('Y-m-d H:i:s', time() - 30 * 86400);
    $f7 = gmdate('Y-m-d H:i:s', time() + 7 * 86400);
    $out = array();
    foreach (labs_q("SELECT p.id, p.nombre, p.apellidos, p.rol, s.nombre AS jefe FROM perfiles p LEFT JOIN perfiles s ON s.id = p.superior_id
                     WHERE p.estado = 'Activo' AND p.rol IN ('commercial', 'manager') ORDER BY p.nombre")->fetchAll() as $g) {
        $c = function ($sql, $par) { return (int) labs_q($sql, $par)->fetchColumn(); };
        $abiertos = $c("SELECT COUNT(*) FROM presupuestos WHERE autor_id = ? AND estado IN ('Borrador', 'Enviado', 'En revisión')", array($g['id']));
        $acept = $c("SELECT COUNT(*) FROM presupuestos WHERE autor_id = ? AND estado = 'Aceptado' AND creado >= ?", array($g['id'], $h30));
        $rech = $c("SELECT COUNT(*) FROM presupuestos WHERE autor_id = ? AND estado = 'Rechazado' AND creado >= ?", array($g['id'], $h30));
        $out[] = array('gestor_id' => $g['id'], 'nombre' => trim($g['nombre'] . ' ' . $g['apellidos']), 'rol' => $g['rol'], 'jefe_de_equipo' => $g['jefe'],
            'cartera_activa' => $c("SELECT COUNT(*) FROM contactos WHERE gestor_id = ? AND activo = 1 AND fase NOT IN ('perdido', 'produccion')", array($g['id'])),
            'seguimientos_vencidos' => $c("SELECT COUNT(*) FROM contactos WHERE gestor_id = ? AND activo = 1 AND fase NOT IN ('perdido', 'produccion', 'firmado', 'despliegue') AND proximo_contacto < ?", array($g['id'], gmdate('Y-m-d H:i:s', time() - 3600))),
            'oportunidades_calientes' => $c("SELECT COUNT(*) FROM contactos WHERE gestor_id = ? AND activo = 1 AND fase IN ('demo', 'propuesta', 'negociacion')", array($g['id'])),
            'llamadas_7d' => $c('SELECT COUNT(*) FROM llamadas WHERE autor_id = ? AND inicio >= ?', array($g['id'], $h7)),
            'citas_7d' => $c("SELECT COUNT(*) FROM citas WHERE comercial_id = ? AND estado IN ('programada', 'confirmada') AND inicio >= ? AND inicio < ?", array($g['id'], $ahora, $f7)),
            'presupuestos_abiertos' => $abiertos, 'aceptados_30d' => $acept, 'tasa_cierre' => ($acept + $rech) ? round($acept / ($acept + $rech) * 100) : null);
    }
    return $out;
}

function labs_equipo_h_ver_equipo_comercial($e, $rol)
{
    return array('gestores' => labs_cierre_equipo_comercial());
}

function labs_equipo_h_encargar_a_gestor($e, $rol)
{
    $g = labs_fila("SELECT id, nombre, apellidos FROM perfiles WHERE id = ? AND estado = 'Activo'", array((string) ($e['gestor_id'] ?? '')));
    if (!$g) {
        throw new Exception('Ese gestor no existe o no está activo.');
    }
    $tit = trim(mb_substr((string) ($e['titulo'] ?? ''), 0, 150));
    if (mb_strlen($tit) < 4) {
        throw new Exception('Escribe la tarea.');
    }
    if (labs_fila("SELECT 1 FROM citas WHERE comercial_id = ? AND titulo = ? AND estado IN ('programada', 'confirmada') AND inicio >= ?", array($g['id'], mb_substr('Coordinación: ' . $tit, 0, 200), labs_ahora()))) {
        return array('resumen' => 'Ya tenía esa tarea en la agenda: ' . $tit, 'repetida' => true);
    }
    $cid = !empty($e['contacto_id']) && labs_equipo_contacto($e['contacto_id']) ? (int) $e['contacto_id'] : null;
    list($ini, $fin) = labs_equipo_hueco($g['id'], 1, 15);
    labs_q('INSERT INTO citas (contacto_id, titulo, tipo, inicio, fin, comercial_id, estado, sector, lugar, notas, resumen, creado_por, creado, actualizado) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        array($cid, mb_substr('Coordinación: ' . $tit, 0, 200), $cid ? 'seguimiento' : 'interna', $ini, $fin, $g['id'], 'programada', '', '',
            mb_substr("Encargado por el agente de " . labs_equipo_roles()[$rol]['nombre'] . ":\n" . trim((string) ($e['detalle'] ?? '')), 0, 4000), '', $g['id'], labs_ahora(), labs_ahora()));
    return array('resumen' => 'Tarea en la agenda de ' . $g['nombre'] . ': ' . $tit);
}

function labs_equipo_h_reasignar_contacto($e, $rol)
{
    $c = labs_equipo_contacto($e['contacto_id'] ?? 0);
    $g = labs_fila("SELECT id, nombre, apellidos FROM perfiles WHERE id = ? AND estado = 'Activo' AND rol IN ('commercial', 'manager', 'admin')", array((string) ($e['gestor_id'] ?? '')));
    if (!$c || !$g) {
        throw new Exception('Contacto o gestor no válidos.');
    }
    if ($c['gestor_id'] === $g['id']) {
        return array('contacto_id' => (int) $c['id'], 'resumen' => labs_equipo_nombre_contacto($c) . ' ya era de ' . $g['nombre']);
    }
    $antes = $c['gestor_id'] ? labs_fila('SELECT nombre FROM perfiles WHERE id = ?', array($c['gestor_id'])) : null;
    labs_equipo_actualiza_contacto($c, array('gestor_id' => $g['id']));
    labs_q("UPDATE citas SET comercial_id = ? WHERE contacto_id = ? AND estado IN ('programada', 'confirmada') AND inicio >= ?", array($g['id'], $c['id'], labs_ahora()));
    labs_equipo_evento($c['id'], $rol, 'Oportunidad reasignada' . ($antes ? ' de ' . $antes['nombre'] : '') . ' a ' . trim($g['nombre'] . ' ' . $g['apellidos']) . ': ' . mb_substr((string) ($e['motivo'] ?? ''), 0, 300));
    return array('contacto_id' => (int) $c['id'], 'resumen' => labs_equipo_nombre_contacto($c) . ' pasa a ' . $g['nombre']);
}

/* --- Riesgo, descripciones, situación y manual de reglas ---------------------------------------- */
/** El riesgo de avanzar el cierre depende del paso: los correos al cliente y la decisión, con aprobación. */
function labs_cierre_riesgo($nombre, $e, $riesgo)
{
    if ($nombre !== 'avanzar_cierre') {
        return $riesgo;
    }
    $st = labs_cierre_estado($e['presupuesto_id'] ?? 0);
    $pasos = labs_cierre_pasos();
    $n = (int) $st['paso'] + 1;
    return isset($pasos[$n]) && in_array($pasos[$n][0], array('resumen', 'valor', 'ruptura', 'decision'), true) ? 'alto' : 'medio';
}

function labs_cierre_describe($n, $e)
{
    if ($n === 'avanzar_cierre') {
        $p = labs_fila('SELECT codigo, cliente FROM presupuestos WHERE id = ?', array((int) ($e['presupuesto_id'] ?? 0)));
        $st = labs_cierre_estado($e['presupuesto_id'] ?? 0);
        $pasos = labs_cierre_pasos();
        $k = (int) $st['paso'] + 1;
        return 'Cierre ' . ($p ? $p['codigo'] . ' · ' . $p['cliente'] : '?') . ' · paso ' . $k . ': ' . (isset($pasos[$k]) ? $pasos[$k][2] : 'completo');
    }
    if ($n === 'proponer_alternativa') {
        $p = labs_fila('SELECT codigo, cliente FROM presupuestos WHERE id = ?', array((int) ($e['presupuesto_id'] ?? 0)));
        return 'Alternativa (' . (($e['tipo'] ?? '') === 'pack_inferior' ? 'pack inferior' : 'pago en 3 hitos') . ') para ' . ($p ? $p['codigo'] . ' · ' . $p['cliente'] : '?') . ': ' . ($e['motivo'] ?? '');
    }
    if ($n === 'encargar_a_gestor') {
        $g = labs_fila('SELECT nombre FROM perfiles WHERE id = ?', array((string) ($e['gestor_id'] ?? '')));
        return 'Tarea para ' . ($g ? $g['nombre'] : 'un gestor') . ': ' . ($e['titulo'] ?? '');
    }
    if ($n === 'reasignar_contacto') {
        $c = labs_equipo_contacto($e['contacto_id'] ?? 0);
        $g = labs_fila('SELECT nombre FROM perfiles WHERE id = ?', array((string) ($e['gestor_id'] ?? '')));
        return 'Reasignar ' . ($c ? labs_equipo_nombre_contacto($c) : '?') . ' a ' . ($g ? $g['nombre'] : '?') . ': ' . ($e['motivo'] ?? '');
    }
    return null;
}

function labs_cierre_valida_previa($n, $e)
{
    if ($n === 'avanzar_cierre' || $n === 'proponer_alternativa') {
        $p = labs_fila('SELECT estado, contacto_id FROM presupuestos WHERE id = ?', array((int) ($e['presupuesto_id'] ?? 0)));
        if (!$p || !in_array($p['estado'], array('Borrador', 'Enviado', 'En revisión'), true) || !$p['contacto_id']) {
            return 'Ese presupuesto no está abierto o no tiene cliente.';
        }
    }
    return null;
}

function labs_cierre_situacion($rol)
{
    $s = array();
    if ($rol === 'cierre' || $rol === 'comercial') {
        $s['sala_de_cierre'] = array_slice(labs_cierre_abiertos(), 0, 15);
    }
    if ($rol === 'coordinador' || $rol === 'comercial') {
        $s['equipo_comercial'] = labs_cierre_equipo_comercial();
    }
    return $s;
}

function labs_cierre_reglas($rol, $usa)
{
    $hecho = false;
    if ($rol === 'cierre') {
        $usa('ver_sala_de_cierre', array());
        $n = 0;
        foreach (labs_cierre_abiertos() as $x) {
            if (!$x['toca_ahora'] || $n >= 6) {
                continue;
            }
            $usa('avanzar_cierre', array('presupuesto_id' => $x['presupuesto_id']));
            $n++;
            $hecho = true;
        }
        // Objeción de precio registrada en llamadas: alternativa en hitos (una vez por presupuesto).
        foreach (labs_q("SELECT DISTINCT p.id FROM presupuestos p JOIN llamadas l ON l.contacto_id = p.contacto_id
                         WHERE p.estado IN ('Enviado', 'En revisión') AND l.inicio >= p.creado AND (l.bant LIKE '%precio%' OR l.notas LIKE '%caro%' OR l.notas LIKE '%precio%')
                         AND NOT EXISTS (SELECT 1 FROM presupuestos q WHERE q.contacto_id = p.contacto_id AND q.id > p.id) LIMIT 3")->fetchAll(PDO::FETCH_COLUMN) as $pid) {
            $usa('proponer_alternativa', array('presupuesto_id' => (int) $pid, 'tipo' => 'hitos', 'motivo' => 'Objeción de precio en la última llamada: repartir la inversión en 3 pagos ligados a cada fase.'));
            $hecho = true;
        }
    }
    if ($rol === 'coordinador') {
        $eq = labs_cierre_equipo_comercial();
        $usa('ver_equipo_comercial', array());
        foreach ($eq as $g) {
            if ($g['seguimientos_vencidos'] >= 3) {
                $cs = labs_q("SELECT id, empresa, nombre, fase FROM contactos WHERE gestor_id = ? AND activo = 1 AND fase NOT IN ('perdido', 'produccion', 'firmado', 'despliegue') AND proximo_contacto < ?
                              ORDER BY FIELD(fase, 'negociacion', 'propuesta', 'demo', 'cualificacion', 'lead'), proximo_contacto LIMIT 5", array($g['gestor_id'], gmdate('Y-m-d H:i:s', time() - 3600)))->fetchAll();
                $usa('encargar_a_gestor', array('gestor_id' => $g['gestor_id'], 'titulo' => 'Ponerte al día con ' . $g['seguimientos_vencidos'] . ' seguimientos vencidos',
                    'detalle' => "Empieza por las oportunidades más avanzadas:\n" . implode("\n", array_map(function ($c) { return '- ' . ($c['empresa'] ?: $c['nombre']) . ' (' . labs_fases()[$c['fase']][0] . ')'; }, $cs)) .
                        "\nA cada una: llamada, resultado registrado y próximo paso con fecha."));
                $hecho = true;
            }
        }
        // Gestor parado (sin llamadas en 7 días) con oportunidades calientes: se reasignan al que tiene menos carga.
        $activos = array_values(array_filter($eq, function ($g) { return $g['llamadas_7d'] > 0 || $g['citas_7d'] > 0; }));
        usort($activos, function ($a, $b) { return $a['oportunidades_calientes'] <=> $b['oportunidades_calientes']; });
        foreach ($eq as $g) {
            if ($g['llamadas_7d'] === 0 && $g['citas_7d'] === 0 && $g['oportunidades_calientes'] > 0 && $activos && $activos[0]['gestor_id'] !== $g['gestor_id']) {
                foreach (labs_q("SELECT id FROM contactos WHERE gestor_id = ? AND activo = 1 AND fase IN ('negociacion', 'propuesta', 'demo') ORDER BY FIELD(fase, 'negociacion', 'propuesta', 'demo') LIMIT 3", array($g['gestor_id']))->fetchAll(PDO::FETCH_COLUMN) as $cid) {
                    $usa('reasignar_contacto', array('contacto_id' => (int) $cid, 'gestor_id' => $activos[0]['gestor_id'], 'motivo' => $g['nombre'] . ' no tiene actividad en 7 días y la oportunidad se enfría.'));
                }
                $hecho = true;
            }
        }
    }
    return $hecho;
}
