<?php
/**
 * Automatizaciones y embudos: un motor propio (sin n8n ni Make) que ejecuta flujos sobre el CRM.
 *
 * Un flujo tiene un disparador (lead nuevo o formulario web, cambio de fase, etiqueta,
 * presupuesto, cita, llamada, días sin actividad o inscripción manual), unos pasos en forma de
 * árbol (correo, esperas, condición sí/no, división A/B, tareas en la agenda, fase, etiquetas,
 * reparto, aviso, WhatsApp, webhook) y un objetivo: quien lo cumple sale del embudo. Los hooks del
 * CRM dejan eventos en una cola y el latido (panel abierto o cron) inscribe y hace avanzar a cada
 * contacto paso a paso.
 */
defined('LABS') || exit;

/* --- Catálogos ----------------------------------------------------------------------------------- */
function labs_flujos_disparadores()
{
    return array(
        'contacto_creado' => 'Lead nuevo en el CRM', 'formulario' => 'Formulario web o integración (webhook de entrada)', 'fase_cambia' => 'Cambia de fase en el pipeline',
        'etiqueta_anadida' => 'Se le añade una etiqueta', 'presupuesto_creado' => 'Presupuesto registrado', 'presupuesto_aceptado' => 'Presupuesto aceptado',
        'presupuesto_rechazado' => 'Presupuesto rechazado', 'cita_creada' => 'Cita agendada', 'cita_realizada' => 'Cita realizada', 'cita_no_asistio' => 'No asistió a la cita',
        'llamada_registrada' => 'Llamada registrada con un resultado', 'sin_actividad' => 'Días sin actividad', 'manual' => 'Inscripción manual');
}

function labs_flujos_nodos()
{
    return array('correo' => 'Enviar correo', 'esperar' => 'Esperar', 'esperar_cita' => 'Esperar hasta antes de la cita', 'esperar_hasta' => 'Esperar a que se cumpla una condición',
        'condicion' => 'Condición (sí / no)', 'ab' => 'División A/B', 'tarea' => 'Tarea en la agenda del gestor', 'whatsapp' => 'WhatsApp (tarea con el mensaje listo)',
        'fase' => 'Mover de fase', 'etiqueta' => 'Etiqueta', 'asignar' => 'Asignar gestor', 'aviso' => 'Aviso interno', 'webhook' => 'Webhook (Make, n8n, Zapier…)', 'fin' => 'Fin');
}

function labs_flujos_campos()
{
    return array('fase' => 'Fase del pipeline', 'etiqueta' => 'Etiquetas', 'sector' => 'Sector', 'origen' => 'Origen', 'valor' => 'Valor del deal (€)', 'cuello' => 'Cuello de botella',
        'tiene_email' => 'Tiene correo', 'tiene_telefono' => 'Tiene teléfono', 'decisor' => 'Decisor identificado', 'cita_futura' => 'Tiene reunión agendada (demo, visita o firma)',
        'presupuesto' => 'Estado del último presupuesto', 'llamada' => 'Resultado de la última llamada', 'respondio' => 'Ha respondido por correo');
}

/* --- Eventos: los hooks del CRM dejan aquí lo que pasa ------------------------------------------------- */
function labs_flujos_evento($tipo, $cid, $datos = array())
{
    if (!$cid || !labs_tabla_existe('flujo_eventos')) {
        return;
    }
    static $hay = null;
    if ($hay === null) {
        $hay = (int) labs_q("SELECT COUNT(*) FROM flujos WHERE estado = 'activo'")->fetchColumn() > 0;
    }
    if (!$hay) {
        return;   // sin flujos activos no se acumula nada
    }
    labs_q('INSERT INTO flujo_eventos (tipo, contacto_id, datos, ts, procesado) VALUES (?,?,?,?,0)', array($tipo, (int) $cid, json_encode($datos, JSON_UNESCAPED_UNICODE), labs_ahora()));
}

/** Engancha los hooks de contactos, presupuestos, citas y llamadas (encadenados con los que ya había). */
function labs_tablas_flujos(&$T)
{
    $encadena = function ($tabla, $hook, $fn) use (&$T) {
        if (!isset($T[$tabla])) {
            return;
        }
        $antes = $T[$tabla][$hook] ?? null;
        $T[$tabla][$hook] = function () use ($antes, $fn) {
            $a = func_get_args();
            if ($antes) {
                call_user_func_array($antes, $a);
            }
            call_user_func_array($fn, $a);
        };
    };
    $encadena('contactos', 'despues_crear', function ($n) {
        labs_flujos_evento('contacto_creado', $n['id'], array('origen' => $n['origen']));
    });
    $encadena('contactos', 'despues_editar', function ($v, $n) {
        if ($n['fase'] !== $v['fase']) {
            labs_flujos_evento('fase_cambia', $n['id'], array('de' => $v['fase'], 'a' => $n['fase']));
        }
        $antes = array_map('mb_strtolower', array_filter(array_map('trim', explode(',', (string) $v['etiquetas']))));
        foreach (array_filter(array_map('trim', explode(',', (string) $n['etiquetas']))) as $e) {
            if (!in_array(mb_strtolower($e), $antes, true)) {
                labs_flujos_evento('etiqueta_anadida', $n['id'], array('etiqueta' => $e));
            }
        }
    });
    $encadena('presupuestos', 'despues_crear', function ($n) {
        labs_flujos_evento('presupuesto_creado', $n['contacto_id'], array('presupuesto_id' => $n['id'], 'codigo' => $n['codigo']));
    });
    $encadena('presupuestos', 'despues_editar', function ($v, $n) {
        if ($n['estado'] !== $v['estado'] && in_array($n['estado'], array('Aceptado', 'Rechazado'), true)) {
            labs_flujos_evento($n['estado'] === 'Aceptado' ? 'presupuesto_aceptado' : 'presupuesto_rechazado', $n['contacto_id'], array('presupuesto_id' => $n['id'], 'codigo' => $n['codigo']));
        }
    });
    $encadena('citas', 'despues_crear', function ($n) {
        labs_flujos_evento('cita_creada', $n['contacto_id'], array('cita_id' => $n['id'], 'tipo' => $n['tipo']));
    });
    $encadena('citas', 'despues_editar', function ($v, $n) {
        if ($n['estado'] !== $v['estado'] && in_array($n['estado'], array('realizada', 'no_asistio'), true)) {
            labs_flujos_evento($n['estado'] === 'realizada' ? 'cita_realizada' : 'cita_no_asistio', $n['contacto_id'], array('cita_id' => $n['id'], 'tipo' => $n['tipo']));
        }
    });
    $encadena('llamadas', 'despues_crear', function ($n) {
        labs_flujos_evento('llamada_registrada', $n['contacto_id'], array('resultado' => $n['resultado']));
    });
}

/* --- Flujos ------------------------------------------------------------------------------------------- */
function labs_flujo($id)
{
    $f = labs_fila('SELECT * FROM flujos WHERE id = ?', array((int) $id));
    if ($f) {
        foreach (array('disparador', 'pasos', 'objetivo', 'opciones') as $k) {
            $f[$k] = json_decode((string) $f[$k], true) ?: array();
        }
    }
    return $f;
}

function labs_flujo_nodo($f, $id)
{
    foreach ($f['pasos'] as $n) {
        if (($n['id'] ?? '') === $id) {
            return $n;
        }
    }
    return null;
}

/** Comprueba que el árbol de pasos es válido: nodos conocidos, enlaces existentes y sin bucles. */
function labs_flujo_valida($f)
{
    $nodos = labs_flujos_nodos();
    $ids = array();
    if (!is_array($f['pasos']) || !$f['pasos'] || count($f['pasos']) > 80) {
        return 'Un flujo necesita entre 1 y 80 pasos.';
    }
    foreach ($f['pasos'] as $n) {
        if (!is_array($n) || !preg_match('/^[a-z0-9_-]{1,20}$/', (string) ($n['id'] ?? '')) || !isset($nodos[$n['tipo'] ?? ''])) {
            return 'Hay un paso con un tipo o identificador no válido.';
        }
        if (isset($ids[$n['id']])) {
            return 'Hay dos pasos con el mismo identificador.';
        }
        $ids[$n['id']] = $n;
    }
    foreach ($ids as $n) {
        foreach (array('sig', 'si', 'no', 'a', 'b') as $k) {
            if (!empty($n[$k]) && !isset($ids[$n[$k]])) {
                return 'Un paso apunta a otro que no existe (' . $n[$k] . ').';
            }
        }
        $p = $n['params'] ?? array();
        if ($n['tipo'] === 'correo' && (mb_strlen(trim((string) ($p['asunto'] ?? ''))) < 2 || mb_strlen(trim((string) ($p['cuerpo'] ?? ''))) < 5)) {
            return 'Un correo necesita asunto y texto.';
        }
        if ($n['tipo'] === 'webhook' && !preg_match(labs_motor_pruebas() ? '#^https?://#i' : '#^https://#i', (string) ($p['url'] ?? ''))) {
            return 'El webhook necesita una dirección https://.';
        }
        if ($n['tipo'] === 'fase' && !isset(labs_fases()[$p['fase'] ?? ''])) {
            return 'Fase no válida en un paso.';
        }
    }
    // Sin bucles: cada contacto avanza siempre hacia delante.
    $visto = array();
    $recorre = function ($id, $camino) use (&$recorre, $ids, &$visto) {
        if ($id === null || $id === '') {
            return true;
        }
        if (isset($camino[$id])) {
            return false;
        }
        $camino[$id] = 1;
        $visto[$id] = 1;
        $n = $ids[$id];
        foreach (array('sig', 'si', 'no', 'a', 'b') as $k) {
            if (!empty($n[$k]) && !$recorre($n[$k], $camino)) {
                return false;
            }
        }
        return true;
    };
    if (!$recorre($f['pasos'][0]['id'], array())) {
        return 'El flujo tiene un bucle: un paso vuelve a otro anterior.';
    }
    if (!isset(labs_flujos_disparadores()[$f['disparador']['tipo'] ?? ''])) {
        return 'Elige el disparador del flujo.';
    }
    return null;
}

/* --- Inscripción ----------------------------------------------------------------------------------------- */
function labs_flujo_coincide($f, $tipo, $c, $datos)
{
    $d = $f['disparador'];
    if (($d['tipo'] ?? '') !== $tipo) {
        return false;
    }
    $v = mb_strtolower(trim((string) ($d['valor'] ?? '')));
    if ($v !== '') {
        if ($tipo === 'fase_cambia' && mb_strtolower((string) ($datos['a'] ?? '')) !== $v) {
            return false;
        }
        if ($tipo === 'etiqueta_anadida' && mb_strtolower((string) ($datos['etiqueta'] ?? '')) !== $v) {
            return false;
        }
        if ($tipo === 'llamada_registrada' && (string) ($datos['resultado'] ?? '') !== $v) {
            return false;
        }
        if (strpos($tipo, 'cita_') === 0 && (string) ($datos['tipo'] ?? '') !== $v) {
            return false;
        }
    }
    if (!empty($d['excluir_formularios']) && mb_strpos((string) $c['origen'], 'Formulario') === 0) {
        return false;   // los formularios ya tienen su propio embudo
    }
    foreach (array('origen' => 'origen', 'sector' => 'sector') as $k => $col) {
        $x = mb_strtolower(trim((string) ($d[$k] ?? '')));
        if ($x !== '' && mb_strpos(mb_strtolower((string) $c[$col]), $x) === false) {
            return false;
        }
    }
    return true;
}

function labs_flujo_inscribe($f, $cid, $datos = array())
{
    $c = labs_fila('SELECT * FROM contactos WHERE id = ? AND activo = 1', array((int) $cid));
    if (!$c || !$f['pasos']) {
        return null;
    }
    $re = !empty($f['opciones']['reentrada']);
    $ya = labs_fila("SELECT id, estado FROM flujo_inscripciones WHERE flujo_id = ? AND contacto_id = ? ORDER BY id DESC LIMIT 1", array($f['id'], $c['id']));
    if ($ya && ($ya['estado'] === 'activa' || !$re)) {
        return null;
    }
    if (labs_flujo_objetivo_cumplido($f, $c)) {
        return null;   // ya cumple la meta: no se le mete en el embudo
    }
    labs_q('INSERT INTO flujo_inscripciones (flujo_id, contacto_id, paso, estado, proximo, paso_desde, variante, datos, entrada, actualizado) VALUES (?,?,?,?,?,?,?,?,?,?)',
        array($f['id'], $c['id'], $f['pasos'][0]['id'], 'activa', labs_ahora(), labs_ahora(), '', json_encode($datos, JSON_UNESCAPED_UNICODE), labs_ahora(), labs_ahora()));
    $iid = (int) labs_db()->lastInsertId();
    labs_flujo_registra($f['id'], $iid, $c['id'], '', 'entrada', 'Entra en el flujo', true);
    return $iid;
}

function labs_flujo_registra($fid, $iid, $cid, $paso, $accion, $res, $ok)
{
    labs_q('INSERT INTO flujo_registro (flujo_id, inscripcion_id, contacto_id, paso, accion, resultado, ok, ts) VALUES (?,?,?,?,?,?,?,?)',
        array($fid, $iid, $cid, mb_substr((string) $paso, 0, 20), mb_substr($accion, 0, 30), mb_substr((string) $res, 0, 500), $ok ? 1 : 0, labs_ahora()));
}

/* --- Condiciones y objetivo -------------------------------------------------------------------------------- */
function labs_flujo_condicion($c, $p, $ins = null)
{
    $campo = (string) ($p['campo'] ?? '');
    $op = (string) ($p['op'] ?? 'es');
    $val = mb_strtolower(trim((string) ($p['valor'] ?? '')));
    $orden = array_keys(labs_fases());
    switch ($campo) {
        case 'fase':
            if ($op === 'alcanza') {
                return $c['fase'] !== 'perdido' && array_search($c['fase'], $orden, true) >= array_search($val, $orden, true);
            }
            $x = $c['fase'];
            break;
        case 'etiqueta':
            $tags = array_map('mb_strtolower', array_filter(array_map('trim', explode(',', (string) $c['etiquetas']))));
            return $op === 'no_es' ? !in_array($val, $tags, true) : in_array($val, $tags, true);
        case 'sector':
        case 'origen':
        case 'cuello':
            $x = $c[$campo];
            break;
        case 'valor':
            $n = (float) $c['valor'];
            return $op === 'menor' ? $n < (float) $val : ($op === 'mayor' ? $n > (float) $val : $n == (float) $val);
        case 'tiene_email':
            return ($c['email'] !== '' || $c['decisor_email'] !== '') === ($op !== 'no_es');
        case 'tiene_telefono':
            return ($c['telefono'] !== '' || $c['decisor_telefono'] !== '') === ($op !== 'no_es');
        case 'decisor':
            return (trim((string) $c['decisor_nombre']) !== '') === ($op !== 'no_es');
        case 'cita_futura':
            // Reuniones reales: las llamadas y tareas que pone el propio flujo no cuentan como «tener cita».
            $r = (bool) labs_fila("SELECT 1 FROM citas WHERE contacto_id = ? AND tipo IN ('demo', 'visita', 'firma', 'prueba_ia') AND estado IN ('programada', 'confirmada') AND inicio >= ?", array($c['id'], labs_ahora()));
            return $r === ($op !== 'no_es');
        case 'presupuesto':
            $x = (string) labs_q('SELECT estado FROM presupuestos WHERE contacto_id = ? ORDER BY id DESC LIMIT 1', array($c['id']))->fetchColumn();
            break;
        case 'llamada':
            $x = (string) labs_q('SELECT resultado FROM llamadas WHERE contacto_id = ? ORDER BY inicio DESC LIMIT 1', array($c['id']))->fetchColumn();
            break;
        case 'respondio':
            $desde = $ins ? $ins['entrada'] : gmdate('Y-m-d H:i:s', time() - 30 * 86400);
            $r = (bool) labs_fila("SELECT 1 FROM contacto_eventos WHERE contacto_id = ? AND tipo = 'correo' AND texto LIKE 'Respuesta por correo%' AND ts >= ?", array($c['id'], $desde));
            return $r === ($op !== 'no_es');
        default:
            return false;
    }
    $x = mb_strtolower((string) $x);
    if ($op === 'contiene') {
        return $val !== '' && mb_strpos($x, $val) !== false;
    }
    return $op === 'no_es' ? $x !== $val : $x === $val;
}

function labs_flujo_objetivo_cumplido($f, $c)
{
    $o = $f['objetivo'];
    if (empty($o['tipo'])) {
        return false;
    }
    if ($o['tipo'] === 'fase') {
        return labs_flujo_condicion($c, array('campo' => 'fase', 'op' => 'alcanza', 'valor' => $o['valor'] ?? 'demo'));
    }
    if ($o['tipo'] === 'cita') {
        return labs_flujo_condicion($c, array('campo' => 'cita_futura', 'op' => 'es'));
    }
    if ($o['tipo'] === 'presupuesto_aceptado') {
        return (bool) labs_fila("SELECT 1 FROM presupuestos WHERE contacto_id = ? AND estado = 'Aceptado'", array($c['id']));
    }
    if ($o['tipo'] === 'etiqueta') {
        return labs_flujo_condicion($c, array('campo' => 'etiqueta', 'op' => 'es', 'valor' => $o['valor'] ?? ''));
    }
    return false;
}

/* --- Ejecución de los pasos ----------------------------------------------------------------------------------- */
function labs_flujo_vars($c, $ins)
{
    $g = $c['gestor_id'] ? labs_fila('SELECT nombre, apellidos, telefono, email FROM perfiles WHERE id = ?', array($c['gestor_id'])) : null;
    $d = json_decode((string) ($ins['datos'] ?? ''), true) ?: array();
    $cita = !empty($d['cita_id']) ? labs_fila('SELECT inicio, lugar FROM citas WHERE id = ?', array($d['cita_id'])) : null;
    $p = labs_fila('SELECT codigo, base FROM presupuestos WHERE contacto_id = ? ORDER BY id DESC LIMIT 1', array($c['id']));
    $nom = trim((string) $c['decisor_nombre']) !== '' ? $c['decisor_nombre'] : $c['nombre'];
    return array('{{nombre}}' => preg_replace('/\s.*/u', '', trim($nom)), '{{nombre_completo}}' => $nom, '{{empresa}}' => labs_equipo_nombre_contacto($c),
        '{{sector}}' => $c['sector'], '{{gestor}}' => $g ? trim($g['nombre'] . ' ' . $g['apellidos']) : 'el equipo de Labs24k', '{{gestor_telefono}}' => $g ? $g['telefono'] : '',
        '{{fecha_cita}}' => $cita ? labs_fecha_madrid($cita['inicio']) : '', '{{lugar_cita}}' => $cita ? $cita['lugar'] : '',
        '{{presupuesto}}' => $p ? $p['codigo'] : '', '{{importe}}' => $p ? labs_ventas_euros($p['base']) . ' + IVA' : '');
}

function labs_flujo_texto($t, $vars)
{
    return strtr((string) $t, $vars);
}

/** Siguiente hueco «de oficina» (L-V, 9:00 a 19:00, hora de Madrid) para no escribir de madrugada. */
function labs_flujo_en_horario(&$cuando)
{
    $f = labs_equipo_madrid();
    $h = (int) $f->format('G');
    if ((int) $f->format('N') < 6 && $h >= 9 && $h < 19) {
        return true;
    }
    do {
        if ($h >= 19 || (int) $f->format('N') >= 6) {
            $f->modify('+1 day');
        }
        $f->setTime(9, 5);
        $h = 9;
    } while ((int) $f->format('N') >= 6);
    $cuando = labs_equipo_utc($f);
    return false;
}

/** Hace avanzar una inscripción hasta la próxima espera (o el final). */
function labs_flujo_avanza($ins)
{
    $f = labs_flujo($ins['flujo_id']);
    if (!$f || $f['estado'] !== 'activo') {
        return;
    }
    $c = labs_fila('SELECT * FROM contactos WHERE id = ?', array($ins['contacto_id']));
    $fin = function ($estado, $txt) use ($ins, $f) {
        labs_q('UPDATE flujo_inscripciones SET estado = ?, proximo = NULL, actualizado = ? WHERE id = ?', array($estado, labs_ahora(), $ins['id']));
        labs_flujo_registra($f['id'], $ins['id'], $ins['contacto_id'], $ins['paso'], $estado, $txt, $estado !== 'error');
    };
    if (!$c || !(int) $c['activo']) {
        $fin('cancelada', 'El contacto ya no está activo');
        return;
    }
    $paso = $ins['paso'];
    for ($i = 0; $i < 25; $i++) {
        if (labs_flujo_objetivo_cumplido($f, $c)) {
            $fin('objetivo', 'Ha cumplido el objetivo del flujo');
            return;
        }
        $n = labs_flujo_nodo($f, $paso);
        if (!$n || $n['tipo'] === 'fin') {
            $fin('completada', 'Ha terminado el flujo');
            return;
        }
        $p = $n['params'] ?? array();
        $sig = $n['sig'] ?? null;
        $vars = labs_flujo_vars($c, $ins);
        try {
            switch ($n['tipo']) {
                case 'esperar':
                    if (empty($ins['_esperado'])) {
                        $seg = max(1, (int) ($p['cantidad'] ?? 1)) * array('minutos' => 60, 'horas' => 3600, 'dias' => 86400)[$p['unidad'] ?? 'dias'] ?? 86400;
                        $cuando = gmdate('Y-m-d H:i:s', time() + $seg);
                        labs_q('UPDATE flujo_inscripciones SET paso = ?, proximo = ?, paso_desde = ?, actualizado = ? WHERE id = ?', array($sig ?: '', $cuando, labs_ahora(), labs_ahora(), $ins['id']));
                        labs_flujo_registra($f['id'], $ins['id'], $c['id'], $n['id'], 'esperar', 'Espera ' . (int) ($p['cantidad'] ?? 1) . ' ' . ($p['unidad'] ?? 'dias'), true);
                        if (!$sig) {
                            $fin('completada', 'Ha terminado el flujo');
                        }
                        return;
                    }
                    break;
                case 'esperar_cita':
                    $d = json_decode((string) $ins['datos'], true) ?: array();
                    $cita = !empty($d['cita_id']) ? labs_fila('SELECT inicio, estado FROM citas WHERE id = ?', array($d['cita_id']))
                        : labs_fila("SELECT inicio, estado FROM citas WHERE contacto_id = ? AND estado IN ('programada', 'confirmada') AND inicio >= ? ORDER BY inicio LIMIT 1", array($c['id'], labs_ahora()));
                    if ($cita && in_array($cita['estado'], array('programada', 'confirmada'), true)) {
                        $t = strtotime($cita['inicio'] . ' UTC') - max(0, (int) ($p['horas_antes'] ?? 24)) * 3600;
                        if ($t > time() + 60) {
                            labs_q('UPDATE flujo_inscripciones SET paso = ?, proximo = ?, paso_desde = ?, actualizado = ? WHERE id = ?', array($sig ?: '', gmdate('Y-m-d H:i:s', $t), labs_ahora(), labs_ahora(), $ins['id']));
                            labs_flujo_registra($f['id'], $ins['id'], $c['id'], $n['id'], 'esperar', 'Espera hasta ' . (int) ($p['horas_antes'] ?? 24) . ' h antes de la cita', true);
                            return;
                        }
                    } else {
                        $fin('cancelada', 'La cita ya no está programada');
                        return;
                    }
                    break;
                case 'esperar_hasta':
                    if (labs_flujo_condicion($c, $p, $ins)) {
                        $sig = $n['si'] ?? $sig;
                        labs_flujo_registra($f['id'], $ins['id'], $c['id'], $n['id'], 'condicion', 'Se cumple: sigue por «sí»', true);
                    } elseif (time() - strtotime(($ins['paso'] === $n['id'] ? $ins['paso_desde'] : labs_ahora()) . ' UTC') >= max(1, (int) ($p['max_dias'] ?? 3)) * 86400) {
                        $sig = $n['no'] ?? null;
                        labs_flujo_registra($f['id'], $ins['id'], $c['id'], $n['id'], 'condicion', 'No se cumplió a tiempo: sigue por «no»', true);
                    } else {
                        $desde = $ins['paso'] === $n['id'] ? $ins['paso_desde'] : labs_ahora();
                        labs_q('UPDATE flujo_inscripciones SET paso = ?, proximo = ?, paso_desde = ?, actualizado = ? WHERE id = ?', array($n['id'], gmdate('Y-m-d H:i:s', time() + 3600), $desde, labs_ahora(), $ins['id']));
                        return;
                    }
                    break;
                case 'condicion':
                    $ok = labs_flujo_condicion($c, $p, $ins);
                    $sig = $ok ? ($n['si'] ?? null) : ($n['no'] ?? null);
                    labs_flujo_registra($f['id'], $ins['id'], $c['id'], $n['id'], 'condicion', ($ok ? 'Sí' : 'No') . ': ' . (labs_flujos_campos()[$p['campo'] ?? ''] ?? '?'), true);
                    break;
                case 'ab':
                    $var = mt_rand(1, 100) <= max(1, min(99, (int) ($p['pct_a'] ?? 50))) ? 'A' : 'B';
                    labs_q('UPDATE flujo_inscripciones SET variante = ? WHERE id = ?', array($var, $ins['id']));
                    $sig = $var === 'A' ? ($n['a'] ?? null) : ($n['b'] ?? null);
                    labs_flujo_registra($f['id'], $ins['id'], $c['id'], $n['id'], 'ab', 'Variante ' . $var, true);
                    break;
                case 'correo':
                    $cuando = null;
                    if (!empty($f['opciones']['solo_horario']) && !labs_flujo_en_horario($cuando)) {
                        labs_q('UPDATE flujo_inscripciones SET paso = ?, proximo = ?, actualizado = ? WHERE id = ?', array($n['id'], $cuando, labs_ahora(), $ins['id']));
                        return;
                    }
                    labs_flujo_correo($f, $ins, $c, $n, $vars);
                    break;
                case 'tarea':
                case 'whatsapp':
                    labs_flujo_tarea($f, $ins, $c, $n, $vars);
                    break;
                case 'fase':
                    // Un cliente no retrocede de fase por un flujo; hacia fases de cliente sí se avanza.
                    $cli = array('firmado', 'despliegue', 'produccion');
                    if ($c['fase'] !== $p['fase'] && (in_array($p['fase'], $cli, true) || !in_array($c['fase'], $cli, true))) {
                        labs_equipo_actualiza_contacto($c, array('fase' => $p['fase']));
                    }
                    labs_flujo_registra($f['id'], $ins['id'], $c['id'], $n['id'], 'fase', 'Fase: ' . labs_fases()[$p['fase']][0], true);
                    break;
                case 'etiqueta':
                    $tags = array_values(array_filter(array_map('trim', explode(',', (string) $c['etiquetas']))));
                    $e = trim(mb_substr((string) ($p['etiqueta'] ?? ''), 0, 40));
                    $low = array_map('mb_strtolower', $tags);
                    if (($p['accion'] ?? 'anadir') === 'quitar') {
                        $tags = array_values(array_filter($tags, function ($x) use ($e) { return mb_strtolower($x) !== mb_strtolower($e); }));
                    } elseif ($e !== '' && !in_array(mb_strtolower($e), $low, true)) {
                        $tags[] = $e;
                    }
                    labs_equipo_actualiza_contacto($c, array('etiquetas' => mb_substr(implode(', ', $tags), 0, 500)));
                    labs_flujo_registra($f['id'], $ins['id'], $c['id'], $n['id'], 'etiqueta', (($p['accion'] ?? 'anadir') === 'quitar' ? 'Quita «' : 'Añade «') . $e . '»', true);
                    break;
                case 'asignar':
                    $g = !empty($p['gestor_id']) ? labs_fila("SELECT id, nombre FROM perfiles WHERE id = ? AND estado = 'Activo'", array($p['gestor_id'])) : labs_flujo_reparto();
                    if ($g) {
                        labs_equipo_actualiza_contacto($c, array('gestor_id' => $g['id']));
                        labs_q("UPDATE citas SET comercial_id = ? WHERE contacto_id = ? AND estado IN ('programada', 'confirmada') AND inicio >= ?", array($g['id'], $c['id'], labs_ahora()));
                    }
                    labs_flujo_registra($f['id'], $ins['id'], $c['id'], $n['id'], 'asignar', $g ? 'Asignado a ' . $g['nombre'] : 'No hay gestores activos', (bool) $g);
                    break;
                case 'aviso':
                    labs_q('INSERT INTO contacto_eventos (contacto_id, autor_id, tipo, texto, ts) VALUES (?,?,?,?,?)', array($c['id'], null, 'evento',
                        mb_substr('[Flujo · ' . $f['nombre'] . '] ' . labs_flujo_texto($p['mensaje'] ?? '', $vars), 0, 2000), labs_ahora()));
                    labs_flujo_registra($f['id'], $ins['id'], $c['id'], $n['id'], 'aviso', mb_substr(labs_flujo_texto($p['mensaje'] ?? '', $vars), 0, 200), true);
                    break;
                case 'webhook':
                    labs_flujo_webhook($f, $ins, $c, $n);
                    break;
            }
        } catch (Throwable $x) {
            $fin('error', 'Error en «' . (labs_flujos_nodos()[$n['tipo']] ?? $n['tipo']) . '»: ' . mb_substr($x->getMessage(), 0, 300));
            return;
        }
        $c = labs_fila('SELECT * FROM contactos WHERE id = ?', array($c['id']));
        $paso = $sig;
        $ins['paso'] = $sig;
        $ins['paso_desde'] = labs_ahora();
        $ins['_esperado'] = false;
        labs_q('UPDATE flujo_inscripciones SET paso = ?, paso_desde = ?, actualizado = ? WHERE id = ?', array($sig ?: '', labs_ahora(), labs_ahora(), $ins['id']));
        if (!$sig) {
            $fin('completada', 'Ha terminado el flujo');
            return;
        }
    }
}

function labs_flujo_reparto()
{
    // Reparto rotativo entre los comerciales activos: al que lleva más tiempo sin recibir un lead.
    return labs_fila("SELECT p.id, p.nombre FROM perfiles p WHERE p.estado = 'Activo' AND p.rol IN ('commercial', 'manager')
                      ORDER BY (SELECT MAX(c.creado) FROM contactos c WHERE c.gestor_id = p.id) IS NOT NULL, (SELECT MAX(c.creado) FROM contactos c WHERE c.gestor_id = p.id), p.nombre LIMIT 1");
}

function labs_flujo_correo($f, $ins, $c, $n, $vars)
{
    $p = $n['params'];
    $para = labs_motor_email_ascii($c['decisor_email'] !== '' ? $c['decisor_email'] : $c['email']);
    $tags = mb_strtolower((string) $c['etiquetas']);
    if ($para === '' || mb_strpos($tags, 'no contactar') !== false || (labs_tabla_existe('motor_bajas') && labs_motor_bloqueado($para))) {
        labs_flujo_registra($f['id'], $ins['id'], $c['id'], $n['id'], 'correo', $para === '' ? 'Sin correo válido: se salta' : 'Pidió no recibir correos: se salta', true);
        return;
    }
    $asunto = mb_substr(labs_flujo_texto($p['asunto'], $vars), 0, 150);
    $o = labs_motor_cfg()['outreach'];
    $cuerpo = labs_flujo_texto($p['cuerpo'], $vars) . "\n\n" . trim($vars['{{gestor}}'] . "\n" . $o['empresa'] . ($vars['{{gestor_telefono}}'] ? ' · ' . $vars['{{gestor_telefono}}'] : '')) .
        "\n\n—\nRecibes este correo porque estás en contacto con Labs24k. Si no quieres recibir más, responde con la palabra BAJA.";
    $ok = false;
    $nota = '';
    try {
        labs_motor_smtp_envia($para, $asunto, $cuerpo, '<flujo-' . $f['id'] . '-' . $ins['id'] . '-' . bin2hex(random_bytes(4)) . '@labs24k>', null);
        $ok = true;
    } catch (Exception $x) {
        $nota = $x->getMessage();
    }
    labs_q('INSERT INTO contacto_eventos (contacto_id, autor_id, tipo, texto, ts) VALUES (?,?,?,?,?)', array($c['id'], null, 'correo',
        mb_substr(($ok ? '[Flujo · ' . $f['nombre'] . '] Correo enviado a ' . $para : '[Flujo · ' . $f['nombre'] . '] Correo no enviado (' . $nota . ')') . "\nAsunto: " . $asunto . "\n" . $cuerpo, 0, 2000), labs_ahora()));
    labs_flujo_registra($f['id'], $ins['id'], $c['id'], $n['id'], 'correo', ($ok ? 'Enviado: ' : 'No enviado (' . mb_substr($nota, 0, 120) . '): ') . $asunto, $ok);
}

function labs_flujo_tarea($f, $ins, $c, $n, $vars)
{
    $p = $n['params'];
    $g = $c['gestor_id'] ? labs_fila("SELECT id FROM perfiles WHERE id = ? AND estado = 'Activo'", array($c['gestor_id'])) : null;
    $g = $g ?: labs_flujo_reparto();
    if (!$g) {
        throw new Exception('No hay ningún gestor activo para la tarea.');
    }
    $min = max(0, (int) ($p['en_minutos'] ?? 0));
    $ini = gmdate('Y-m-d H:i:s', time() + $min * 60);
    if (!empty($p['en_dias'])) {
        $d = labs_equipo_laborable(max(1, (int) $p['en_dias']), 10);
        $ini = labs_equipo_utc($d);
    }
    $titulo = labs_flujo_texto($p['titulo'] ?? 'Seguimiento', $vars);
    $notas = labs_flujo_texto($p['notas'] ?? '', $vars);
    $tipo = in_array($p['tipo'] ?? '', array('llamada', 'seguimiento', 'visita', 'interna'), true) ? $p['tipo'] : 'seguimiento';
    if ($n['tipo'] === 'whatsapp') {
        $tel = preg_replace('/[^\d]/', '', ($c['prefijo'] ?: '+34') . ($c['decisor_telefono'] !== '' ? $c['decisor_telefono'] : $c['telefono']));
        $msg = labs_flujo_texto($p['mensaje'] ?? '', $vars);
        $titulo = 'WhatsApp · ' . labs_equipo_nombre_contacto($c);
        $notas = "Mensaje listo para enviar (pulsa el enlace desde el móvil):\nhttps://wa.me/" . $tel . '?text=' . rawurlencode($msg) . "\n\n" . $msg;
        $tipo = 'seguimiento';
    }
    labs_q('INSERT INTO citas (contacto_id, titulo, tipo, inicio, fin, comercial_id, estado, sector, lugar, notas, resumen, creado_por, creado, actualizado) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        array($c['id'], mb_substr($titulo . ($n['tipo'] === 'whatsapp' ? '' : ' · ' . labs_equipo_nombre_contacto($c)), 0, 200), $tipo, $ini, gmdate('Y-m-d H:i:s', strtotime($ini . ' UTC') + 900), $g['id'],
            'programada', mb_substr((string) $c['sector'], 0, 60), '', mb_substr('[Flujo · ' . $f['nombre'] . "]\n" . $notas, 0, 4000), '', $g['id'], labs_ahora(), labs_ahora()));
    $cambios = array('proximo_paso' => mb_substr($titulo, 0, 200));
    if (!$c['proximo_contacto'] || $c['proximo_contacto'] > $ini || $c['proximo_contacto'] < labs_ahora()) {
        $cambios['proximo_contacto'] = $ini;
    }
    labs_equipo_actualiza_contacto($c, $cambios);
    labs_flujo_registra($f['id'], $ins['id'], $c['id'], $n['id'], $n['tipo'], ($n['tipo'] === 'whatsapp' ? 'WhatsApp preparado' : 'Tarea: ' . $titulo) . ' (' . labs_fecha_madrid($ini) . ')', true);
}

function labs_flujo_webhook($f, $ins, $c, $n)
{
    $url = (string) $n['params']['url'];
    $datos = array('flujo' => $f['nombre'], 'paso' => $n['id'], 'contacto' => array('id' => (int) $c['id'], 'nombre' => $c['nombre'], 'empresa' => $c['empresa'], 'email' => $c['email'],
        'telefono' => trim($c['prefijo'] . ' ' . $c['telefono']), 'sector' => $c['sector'], 'fase' => $c['fase'], 'etiquetas' => $c['etiquetas'], 'decisor' => $c['decisor_nombre']),
        'fecha' => gmdate('c'));
    $r = labs_motor_http($url, 'POST', json_encode($datos, JSON_UNESCAPED_UNICODE), array('Content-Type' => 'application/json'), 20000);
    $ok = (int) $r[0] >= 200 && (int) $r[0] < 300;
    labs_flujo_registra($f['id'], $ins['id'], $c['id'], $n['id'], 'webhook', ($ok ? 'Enviado a ' : 'Sin respuesta correcta de ') . parse_url($url, PHP_URL_HOST), $ok);
}

/* --- Latido ----------------------------------------------------------------------------------------------------- */
function labs_flujos_tick()
{
    if (!labs_tabla_existe('flujos') || !(int) labs_q("SELECT GET_LOCK('labs_flujos', 0)")->fetchColumn()) {
        return array('ocupado' => true);
    }
    $r = array('eventos' => 0, 'inscritos' => 0, 'pasos' => 0);
    try {
        $activos = array();
        foreach (labs_q("SELECT id FROM flujos WHERE estado = 'activo'")->fetchAll(PDO::FETCH_COLUMN) as $id) {
            $activos[] = labs_flujo($id);
        }
        foreach (labs_q('SELECT * FROM flujo_eventos WHERE procesado = 0 ORDER BY id LIMIT 300')->fetchAll() as $ev) {
            $c = labs_fila('SELECT * FROM contactos WHERE id = ?', array($ev['contacto_id']));
            $d = json_decode((string) $ev['datos'], true) ?: array();
            if ($c) {
                foreach ($activos as $f) {
                    if (labs_flujo_coincide($f, $ev['tipo'], $c, $d) && labs_flujo_inscribe($f, $c['id'], $d)) {
                        $r['inscritos']++;
                    }
                }
            }
            labs_q('UPDATE flujo_eventos SET procesado = 1 WHERE id = ?', array($ev['id']));
            $r['eventos']++;
        }
        // Días sin actividad: se revisa como mucho una vez por hora.
        if ((int) labs_ajuste('flujos.sin_actividad', 0) < time() - 3600) {
            labs_pon_ajuste('flujos.sin_actividad', (string) time());
            foreach ($activos as $f) {
                if (($f['disparador']['tipo'] ?? '') !== 'sin_actividad') {
                    continue;
                }
                $dias = max(1, (int) ($f['disparador']['dias'] ?? 14));
                $fases = array_filter(array_map('trim', explode(',', (string) ($f['disparador']['valor'] ?? ''))));
                $w = $fases ? ' AND fase IN (' . implode(',', array_map(function ($x) { return labs_db()->quote($x); }, $fases)) . ')' : " AND fase NOT IN ('perdido', 'produccion')";
                foreach (labs_q("SELECT id FROM contactos WHERE activo = 1 AND COALESCE(ultima_actividad, creado) < ?$w AND NOT EXISTS (SELECT 1 FROM flujo_inscripciones i WHERE i.flujo_id = ? AND i.contacto_id = contactos.id AND (i.estado = 'activa' OR i.entrada >= ?)) LIMIT 50",
                    array(gmdate('Y-m-d H:i:s', time() - $dias * 86400), $f['id'], gmdate('Y-m-d H:i:s', time() - $dias * 86400)))->fetchAll(PDO::FETCH_COLUMN) as $cid) {
                    if (labs_flujo_inscribe($f, $cid)) {
                        $r['inscritos']++;
                    }
                }
            }
        }
        foreach (labs_q("SELECT i.* FROM flujo_inscripciones i JOIN flujos f ON f.id = i.flujo_id WHERE i.estado = 'activa' AND f.estado = 'activo' AND i.proximo <= ? ORDER BY i.proximo LIMIT 120", array(labs_ahora()))->fetchAll() as $ins) {
            // Llegar por el reloj a un paso de espera ya cumplida: no se vuelve a esperar.
            $ins['_esperado'] = false;
            labs_flujo_avanza($ins);
            $r['pasos']++;
        }
    } finally {
        labs_q("SELECT RELEASE_LOCK('labs_flujos')");
    }
    return $r;
}

/* --- Plantillas: automatizaciones básicas de la agencia y embudos profesionales -------------------------------- */
function labs_flujos_plantillas()
{
    $c = function ($id, $as, $cu, $sig = null) { return array('id' => $id, 'tipo' => 'correo', 'params' => array('asunto' => $as, 'cuerpo' => $cu), 'sig' => $sig); };
    $w = function ($id, $n, $u, $sig = null) { return array('id' => $id, 'tipo' => 'esperar', 'params' => array('cantidad' => $n, 'unidad' => $u), 'sig' => $sig); };
    $t = function ($id, $tit, $tipo, $notas, $sig = null, $min = 0, $dias = 0) { return array('id' => $id, 'tipo' => 'tarea', 'params' => array('titulo' => $tit, 'tipo' => $tipo, 'notas' => $notas, 'en_minutos' => $min, 'en_dias' => $dias), 'sig' => $sig); };
    $e = function ($id, $tag, $sig = null) { return array('id' => $id, 'tipo' => 'etiqueta', 'params' => array('accion' => 'anadir', 'etiqueta' => $tag), 'sig' => $sig); };
    $firma = '';
    return array(
        /* ---- Automatizaciones básicas ---- */
        'bienvenida' => array('grupo' => 'basica', 'nombre' => 'Lead nuevo: reparto, bienvenida y llamada en 5 minutos', 'icono' => 'userPlus',
            'descripcion' => 'Cada lead que entra se reparte al gestor que lleva más tiempo sin recibir uno, recibe un correo de bienvenida al momento y el gestor tiene la llamada en la agenda a los 5 minutos (la velocidad es lo que más convierte).',
            'disparador' => array('tipo' => 'contacto_creado', 'excluir_formularios' => true), 'objetivo' => array('tipo' => 'fase', 'valor' => 'cualificacion'), 'opciones' => array('solo_horario' => false),
            'pasos' => array(array('id' => 'n1', 'tipo' => 'asignar', 'params' => array(), 'sig' => 'n2'), $e('n2', 'Nuevo lead', 'n3'),
                $c('n3', 'Gracias por contactar con Labs24k, {{nombre}}', "Hola {{nombre}}:\n\nGracias por escribirnos. Soy {{gestor}} y voy a ser tu persona de contacto en Labs24k.\n\nTe llamo en unos minutos para entender qué necesitáis en {{empresa}}. Si prefieres otro momento, respóndeme a este correo con el día y la hora.", 'n4'),
                $t('n4', 'Llamar al lead nuevo (menos de 5 minutos)', 'llamada', 'Lead recién entrado: llamar ya. Objetivo: localizar a quien decide, detectar el cuello de botella y cerrar la demo.', null, 5))),
        'recordatorio_cita' => array('grupo' => 'basica', 'nombre' => 'Recordatorio de cita 24 h y 2 h antes', 'icono' => 'calendar',
            'descripcion' => 'Cuando se agenda una demo, el cliente recibe un recordatorio el día antes y el gestor un aviso de WhatsApp 2 horas antes. Reduce las citas a las que nadie acude.',
            'disparador' => array('tipo' => 'cita_creada', 'valor' => 'demo'), 'objetivo' => array(), 'opciones' => array('solo_horario' => false),
            'pasos' => array(array('id' => 'n1', 'tipo' => 'esperar_cita', 'params' => array('horas_antes' => 24), 'sig' => 'n2'),
                $c('n2', 'Mañana nos vemos, {{nombre}}', "Hola {{nombre}}:\n\nTe recuerdo nuestra cita: {{fecha_cita}}.\n\nVamos a ver con vuestro caso real cómo atender y captar clientes en automático. Si te surge algo, respóndeme y lo movemos.", 'n3'),
                array('id' => 'n3', 'tipo' => 'esperar_cita', 'params' => array('horas_antes' => 2), 'sig' => 'n4'),
                array('id' => 'n4', 'tipo' => 'whatsapp', 'params' => array('mensaje' => 'Hola {{nombre}}, te espero hoy a las {{fecha_cita}}. Cualquier cosa me dices. {{gestor}} (Labs24k)'), 'sig' => null))),
        'no_show' => array('grupo' => 'basica', 'nombre' => 'No asistió a la cita: reprogramar', 'icono' => 'refresh',
            'descripcion' => 'Si alguien no se presenta, recibe un correo amable para reprogramar y el gestor tiene una llamada al día siguiente. Sale del flujo en cuanto tiene una nueva cita.',
            'disparador' => array('tipo' => 'cita_no_asistio'), 'objetivo' => array('tipo' => 'cita'), 'opciones' => array('solo_horario' => true),
            'pasos' => array($c('n1', '¿Buscamos otro momento, {{nombre}}?', "Hola {{nombre}}:\n\nHoy no hemos podido vernos; no pasa nada, a todos se nos complica el día.\n\n¿Te va bien que lo movamos a otro día de esta semana? Respóndeme con el que mejor te encaje.", 'n2'),
                $t('n2', 'Llamar para reprogramar la demo', 'llamada', 'No asistió a la cita. Llamar con tono amable y cerrar nueva fecha.', null, 0, 1))),
        'seguimiento_presupuesto' => array('grupo' => 'basica', 'nombre' => 'Presupuesto: seguimiento a los 2 días', 'icono' => 'calc',
            'descripcion' => 'Tras registrar un presupuesto, si a los 2 días no está aceptado, el gestor tiene una llamada en la agenda. (El agente de Cierre de la zona de agentes hace la cadencia completa.)',
            'disparador' => array('tipo' => 'presupuesto_creado'), 'objetivo' => array('tipo' => 'presupuesto_aceptado'), 'opciones' => array('solo_horario' => true),
            'pasos' => array($w('n1', 2, 'dias', 'n2'), $t('n2', 'Seguimiento del presupuesto {{presupuesto}}', 'llamada', '¿Lo has podido revisar? ¿Qué necesitarías ver para decidir? Cerrar fecha.'))),
        'onboarding' => array('grupo' => 'basica', 'nombre' => 'Presupuesto aceptado: bienvenida y arranque', 'icono' => 'check',
            'descripcion' => 'Cuando un cliente acepta, recibe la bienvenida con los siguientes pasos, se etiqueta como Cliente y el equipo tiene la reunión de arranque en la agenda.',
            'disparador' => array('tipo' => 'presupuesto_aceptado'), 'objetivo' => array(), 'opciones' => array('solo_horario' => true),
            'pasos' => array($e('n1', 'Cliente', 'n2'),
                $c('n2', 'Bienvenido a Labs24k, {{nombre}}: siguientes pasos', "Hola {{nombre}}:\n\n¡Gracias por confiar en nosotros! Estos son los siguientes pasos:\n\n1. Firma del contrato (te llega el enlace en breve).\n2. Primer pago según la propuesta {{presupuesto}}.\n3. Auditoría técnica con nuestro equipo para conectar lo que ya usáis.\n\nCualquier duda, aquí estoy.", 'n3'),
                $t('n3', 'Preparar contrato y reunión de arranque', 'interna', 'Cliente nuevo: preparar contrato, enlace de firma y reunión de arranque con el equipo técnico.', null, 30))),
        'perdido_nurturing' => array('grupo' => 'basica', 'nombre' => 'Perdido: recuperar a los 90 días', 'icono' => 'clock',
            'descripcion' => 'Quien pasa a «Perdido» no se olvida: a los 90 días recibe un correo para ver si algo ha cambiado y el gestor tiene una llamada. Sale si vuelve a avanzar.',
            'disparador' => array('tipo' => 'fase_cambia', 'valor' => 'perdido'), 'objetivo' => array('tipo' => 'fase', 'valor' => 'cualificacion'), 'opciones' => array('solo_horario' => true),
            'pasos' => array($w('n1', 90, 'dias', 'n2'),
                $c('n2', '{{nombre}}, ¿ha cambiado algo en {{empresa}}?', "Hola {{nombre}}:\n\nHace unos meses hablamos sobre cómo atender y captar clientes en automático. ¿Ha cambiado algo desde entonces? ¿Seguís perdiendo consultas fuera de horario?\n\nSi te apetece, lo vemos en 10 minutos.", 'n3'),
                $t('n3', 'Llamada de recuperación (90 días)', 'llamada', 'Cliente perdido hace 90 días: preguntar qué ha cambiado.', null, 0, 2))),
        'resenas' => array('grupo' => 'basica', 'nombre' => 'Cliente en producción: reseña y referidos', 'icono' => 'trend',
            'descripcion' => 'A los 30 días de estar en producción, el cliente recibe un correo pidiendo una reseña en Google y si conoce a alguien a quien le pueda servir.',
            'disparador' => array('tipo' => 'fase_cambia', 'valor' => 'produccion'), 'objetivo' => array(), 'opciones' => array('solo_horario' => true),
            'pasos' => array($w('n1', 30, 'dias', 'n2'),
                $c('n2', '¿Qué tal estos 30 días, {{nombre}}?', "Hola {{nombre}}:\n\nYa lleváis un mes con el sistema funcionando. ¿Cómo lo estáis notando?\n\nSi estáis contentos, nos ayudaría muchísimo una reseña en Google. Y si conoces a alguien a quien le pueda venir bien, preséntanoslo: lo cuidaremos igual que a vosotros.", null))),
        /* ---- Embudos profesionales ---- */
        'embudo_lead_magnet' => array('grupo' => 'embudo', 'nombre' => 'Embudo lineal · Lead Magnet → Diagnóstico', 'icono' => 'filter',
            'descripcion' => 'Para quien descarga un recurso (guía del AI Act, checklist…) desde una landing: entrega inmediata y una secuencia de 4 correos de valor que lleva al diagnóstico gratuito, con llamada al final. Sale en cuanto agenda.',
            'disparador' => array('tipo' => 'formulario'), 'objetivo' => array('tipo' => 'cita'), 'opciones' => array('solo_horario' => true),
            'pasos' => array(array('id' => 'n1', 'tipo' => 'asignar', 'params' => array(), 'sig' => 'n2'),
                $c('n2', 'Aquí tienes tu guía, {{nombre}}', "Hola {{nombre}}:\n\nAquí tienes la guía que pediste. Léela con calma: en 5 minutos sabrás qué obliga la normativa y cómo aprovecharla para atender mejor a tus clientes.\n\nMañana te cuento el error más común que vemos en {{sector}}.", 'n3'),
                $w('n3', 1, 'dias', 'n4'),
                $c('n4', 'El error más común en {{sector}}', "Hola {{nombre}}:\n\nEl error que más vemos: los clientes que escriben o llaman fuera de horario se van al primero que les responde. Casi nadie lo mide, y es dinero que se pierde cada semana.\n\n¿Sabes cuántas consultas os llegan cuando estáis cerrados?", 'n5'),
                $w('n5', 2, 'dias', 'n6'),
                $c('n6', 'Así lo resolvió un negocio como {{empresa}}', "Hola {{nombre}}:\n\nTe cuento cómo funciona en la práctica: un asistente atiende al momento (avisando de que es una IA), resuelve lo básico y deja la cita hecha en la agenda del equipo. Sin cambiar vuestra forma de trabajar.\n\n¿Te enseño cómo quedaría en {{empresa}}?", 'n7'),
                $w('n7', 2, 'dias', 'n8'),
                $c('n8', 'Diagnóstico gratuito de 15 minutos', "Hola {{nombre}}:\n\nTe propongo algo sencillo: 15 minutos para revisar cómo atendéis hoy a los clientes que llegan por la web, el teléfono y WhatsApp, y te dejo un mini informe con lo que se podría automatizar.\n\nRespóndeme con un día y una hora que te vengan bien.", 'n9'),
                $w('n9', 2, 'dias', 'n10'),
                $t('n10', 'Llamar: ofrecer el diagnóstico gratuito', 'llamada', 'Ha recibido la secuencia del lead magnet y no ha agendado. Llamar para ofrecer el diagnóstico de 15 minutos.'))),
        'embudo_bant' => array('grupo' => 'embudo', 'nombre' => 'Embudo avanzado · Setter BANT (cualifica y reparte)', 'icono' => 'target',
            'descripcion' => 'Formulario con presupuesto y urgencia. Si el lead está cualificado (etiqueta «Urgente» o decisor identificado) va directo al gestor con llamada en 5 minutos; si no, entra en una secuencia de nutrición con test A/B de asunto y, en cuanto responde, pasa a llamada.',
            'disparador' => array('tipo' => 'formulario'), 'objetivo' => array('tipo' => 'fase', 'valor' => 'demo'), 'opciones' => array('solo_horario' => true),
            'pasos' => array(array('id' => 'n1', 'tipo' => 'asignar', 'params' => array(), 'sig' => 'n2'),
                array('id' => 'n2', 'tipo' => 'condicion', 'params' => array('campo' => 'etiqueta', 'op' => 'es', 'valor' => 'Urgente'), 'si' => 'n3', 'no' => 'n5'),
                $t('n3', 'Lead caliente: llamar en 5 minutos', 'llamada', 'Lead cualificado y con urgencia. Llamar ya y cerrar la demo esta semana.', 'n4', 5),
                $c('n4', '{{nombre}}, te llamo en unos minutos', "Hola {{nombre}}:\n\nHe visto tu solicitud y te llamo en unos minutos para concretar. Si no te viene bien ahora, respóndeme con la hora que prefieras.", null),
                array('id' => 'n5', 'tipo' => 'ab', 'params' => array('pct_a' => 50), 'a' => 'n6', 'b' => 'n7'),
                $c('n6', '¿Cuántos clientes se os escapan fuera de horario?', "Hola {{nombre}}:\n\nGracias por tu interés. Una pregunta rápida: ¿quién atiende en {{empresa}} a los clientes que escriben por la noche o el fin de semana?\n\nRespóndeme y te cuento cómo lo resuelven otros negocios de {{sector}}.", 'n8'),
                $c('n7', 'Una idea para {{empresa}}', "Hola {{nombre}}:\n\nGracias por tu interés. Te dejo una idea concreta: un asistente que responde al momento, filtra a quien va en serio y deja la cita en la agenda de tu equipo.\n\n¿Te encaja verlo en 10 minutos?", 'n8'),
                array('id' => 'n8', 'tipo' => 'esperar_hasta', 'params' => array('campo' => 'respondio', 'op' => 'es', 'max_dias' => 3), 'si' => 'n9', 'no' => 'n10'),
                $t('n9', 'Ha respondido: llamar hoy', 'llamada', 'Respondió al correo de nutrición. Llamar hoy mismo.', null, 10),
                $c('n10', 'Te dejo un caso de {{sector}}', "Hola {{nombre}}:\n\nPor si te sirve, así funciona en un negocio de {{sector}}: atención inmediata, cualificación automática y la cita hecha sin que nadie toque el teléfono.\n\nSi quieres, lo vemos con tu caso.", 'n11'),
                $w('n11', 2, 'dias', 'n12'),
                $t('n12', 'Llamar al lead de nutrición', 'llamada', 'Lead del embudo BANT sin respuesta tras la nutrición. Llamar.'))),
        'embudo_rescate' => array('grupo' => 'embudo', 'nombre' => 'Embudo avanzado · Rescate omnicanal 2-24-48 h', 'icono' => 'phone',
            'descripcion' => 'Para leads que no responden al primer contacto: a las 2 h un correo, si tiene teléfono un WhatsApp preparado para el gestor, a las 24 h llamada y a las 48 h el último correo. Sale en cuanto tiene una cita.',
            'disparador' => array('tipo' => 'llamada_registrada', 'valor' => 'no_contesta'), 'objetivo' => array('tipo' => 'cita'), 'opciones' => array('solo_horario' => true),
            'pasos' => array($w('n1', 2, 'horas', 'n2'),
                $c('n2', 'Te he intentado llamar, {{nombre}}', "Hola {{nombre}}:\n\nTe he intentado llamar hace un rato. Te escribía por tu interés en atender y captar clientes en automático. ¿Cuándo te viene bien que hablemos 10 minutos?", 'n3'),
                array('id' => 'n3', 'tipo' => 'condicion', 'params' => array('campo' => 'tiene_telefono', 'op' => 'es'), 'si' => 'n4', 'no' => 'n5'),
                array('id' => 'n4', 'tipo' => 'whatsapp', 'params' => array('mensaje' => 'Hola {{nombre}}, soy {{gestor}} de Labs24k. Te he intentado llamar: ¿cuándo te va bien que hablemos 10 minutos?'), 'sig' => 'n5'),
                $w('n5', 1, 'dias', 'n6'),
                $t('n6', 'Rescate 24 h: segunda llamada', 'llamada', 'Segundo intento de llamada del rescate omnicanal.', 'n7'),
                $w('n7', 1, 'dias', 'n8'),
                $c('n8', '¿Lo dejamos para más adelante, {{nombre}}?', "Hola {{nombre}}:\n\nNo quiero ser pesado. Si ahora no es buen momento, dime cuándo te escribo y lo retomamos. Si ya no os interesa, con un «no» me vale.", null))),
        'embudo_reactivacion' => array('grupo' => 'embudo', 'nombre' => 'Embudo de reactivación de la base dormida', 'icono' => 'bolt',
            'descripcion' => 'Contactos sin actividad durante 45 días: test A/B de dos correos de reenganche, espera de 3 días a ver si avanzan y, si no, llamada del gestor. La base dormida suele ser lo primero que da resultado.',
            'disparador' => array('tipo' => 'sin_actividad', 'dias' => 45, 'valor' => 'lead,cualificacion'), 'objetivo' => array('tipo' => 'fase', 'valor' => 'demo'), 'opciones' => array('solo_horario' => true),
            'pasos' => array(array('id' => 'n1', 'tipo' => 'ab', 'params' => array('pct_a' => 50), 'a' => 'n2', 'b' => 'n3'),
                $c('n2', '{{nombre}}, ¿seguís con esto en mente?', "Hola {{nombre}}:\n\nHace tiempo hablamos sobre automatizar la atención en {{empresa}}. ¿Seguís con ello en mente? Si es que sí, te cuento las novedades en 10 minutos.", 'n4'),
                $c('n3', 'Novedad para negocios de {{sector}}', "Hola {{nombre}}:\n\nTenemos algo nuevo para negocios de {{sector}}: atención por WhatsApp y web que responde al momento y deja la cita hecha. ¿Te lo enseño?", 'n4'),
                array('id' => 'n4', 'tipo' => 'esperar_hasta', 'params' => array('campo' => 'respondio', 'op' => 'es', 'max_dias' => 3), 'si' => 'n5', 'no' => 'n6'),
                $t('n5', 'Respondió a la reactivación: llamar', 'llamada', 'Contacto dormido que ha respondido. Llamar hoy.', null, 10),
                $t('n6', 'Llamada de reactivación', 'llamada', 'Contacto dormido sin respuesta a la reactivación. Llamar una vez y, si no, cerrar.', null, 0, 1))),
    );
}

/* --- Formulario de entrada (landing, web, Make, Zapier, Meta Lead Ads…) ---------------------------------------------- */
function labs_flujos_entrada($token, $b)
{
    $f = labs_fila("SELECT id FROM flujos WHERE token = ? AND estado = 'activo'", array((string) $token));
    if (!$f || strlen((string) $token) < 24) {
        throw new ErrorApi('Formulario no válido.', 404, 'PGRST116');
    }
    $f = labs_flujo($f['id']);
    if (trim((string) ($b['web_extra'] ?? '')) !== '') {
        return array('ok' => true);   // campo trampa para robots: se ignora sin decir nada
    }
    $email = labs_motor_email_ascii($b['email'] ?? '');
    $tel = preg_replace('/[^\d+]/', '', (string) ($b['telefono'] ?? ''));
    $nombre = trim(mb_substr((string) ($b['nombre'] ?? ''), 0, 120));
    if ($nombre === '' || ($email === '' && strlen($tel) < 9)) {
        throw new ErrorApi('Faltan el nombre y un correo o teléfono.', 400, 'FLUJO');
    }
    $hace = gmdate('Y-m-d H:i:s', time() - 3600);
    if ((int) labs_q("SELECT COUNT(*) FROM contactos WHERE origen LIKE 'Formulario%' AND creado >= ?", array($hace))->fetchColumn() > 300) {
        throw new ErrorApi('Demasiadas solicitudes; inténtalo más tarde.', 429, 'FLUJO');
    }
    $c = $email !== '' ? labs_fila('SELECT * FROM contactos WHERE email = ? OR decisor_email = ? LIMIT 1', array($email, $email)) : null;
    $tags = array_filter(array_map('trim', explode(',', (string) ($b['etiquetas'] ?? ''))));
    if (!empty($b['urgencia']) && preg_match('/alta|urgente|ya|inmediat/i', (string) $b['urgencia'])) {
        $tags[] = 'Urgente';
    }
    if (!$c) {
        $g = labs_flujo_reparto();
        $esp = trim(implode("\n", array_filter(array(!empty($b['mensaje']) ? 'Mensaje: ' . mb_substr((string) $b['mensaje'], 0, 1500) : '',
            !empty($b['presupuesto']) ? 'Presupuesto indicado: ' . mb_substr((string) $b['presupuesto'], 0, 80) : '', !empty($b['urgencia']) ? 'Urgencia: ' . mb_substr((string) $b['urgencia'], 0, 80) : ''))));
        $fila = labs_inserta_fila('contactos', labs_tabla('contactos'), array('nombre' => $nombre, 'empresa' => mb_substr((string) ($b['empresa'] ?? ''), 0, 200), 'email' => $email,
            'telefono' => mb_substr(ltrim($tel, '+'), 0, 20), 'origen' => mb_substr('Formulario · ' . $f['nombre'], 0, 120), 'estado' => 'Nuevo', 'gestor_id' => $g ? $g['id'] : null,
            'sector' => mb_substr((string) ($b['sector'] ?? ''), 0, 60), 'especificaciones' => $esp, 'etiquetas' => mb_substr(implode(', ', array_unique($tags)), 0, 500), 'fase' => 'lead'), true);
        $c = labs_fila('SELECT * FROM contactos WHERE id = ?', array($fila['id']));
    } elseif ($tags) {
        $todas = array_unique(array_merge(array_filter(array_map('trim', explode(',', (string) $c['etiquetas']))), $tags));
        labs_equipo_actualiza_contacto($c, array('etiquetas' => mb_substr(implode(', ', $todas), 0, 500)));
    }
    labs_q('INSERT INTO contacto_eventos (contacto_id, autor_id, tipo, texto, ts) VALUES (?,?,?,?,?)', array($c['id'], null, 'evento',
        mb_substr('Formulario recibido («' . $f['nombre'] . '»)' . (!empty($b['mensaje']) ? ': ' . $b['mensaje'] : ''), 0, 2000), labs_ahora()));
    $iid = labs_flujo_inscribe($f, $c['id'], array('formulario' => 1));
    if ($iid) {
        labs_flujo_avanza(labs_fila('SELECT * FROM flujo_inscripciones WHERE id = ?', array($iid)));   // la bienvenida sale al instante
    }
    return array('ok' => true, 'contacto_id' => (int) $c['id'], 'redirect' => (string) ($f['opciones']['gracias'] ?? ''));
}

/* --- API /flujos -------------------------------------------------------------------------------------------------- */
function labs_flujos_permitido()
{
    labs_usuario(true);
    if (!in_array(labs_mi_rol(), array('admin', 'manager'), true)) {
        throw new ErrorApi('Las automatizaciones son solo para dirección y jefes de equipo.', 403, '42501');
    }
}

function labs_flujos_stats($id)
{
    $s = array();
    foreach (labs_q('SELECT estado, COUNT(*) n FROM flujo_inscripciones WHERE flujo_id = ? GROUP BY estado', array($id))->fetchAll() as $f) {
        $s[$f['estado']] = (int) $f['n'];
    }
    $tot = array_sum($s);
    $ab = array();
    foreach (labs_q("SELECT variante, COUNT(*) n, SUM(estado = 'objetivo') o FROM flujo_inscripciones WHERE flujo_id = ? AND variante <> '' GROUP BY variante", array($id))->fetchAll() as $f) {
        $ab[$f['variante']] = array('n' => (int) $f['n'], 'objetivo' => (int) $f['o']);
    }
    $pasos = array();
    foreach (labs_q('SELECT paso, COUNT(*) n FROM flujo_inscripciones WHERE flujo_id = ? AND estado = \'activa\' GROUP BY paso', array($id))->fetchAll() as $f) {
        $pasos[$f['paso']] = (int) $f['n'];
    }
    return array('total' => $tot, 'activas' => $s['activa'] ?? 0, 'completadas' => $s['completada'] ?? 0, 'objetivo' => $s['objetivo'] ?? 0, 'error' => $s['error'] ?? 0,
        'cancelada' => $s['cancelada'] ?? 0, 'conversion' => $tot ? round(($s['objetivo'] ?? 0) / $tot * 100, 1) : 0, 'ab' => $ab, 'por_paso' => $pasos,
        'correos' => (int) labs_q("SELECT COUNT(*) FROM flujo_registro WHERE flujo_id = ? AND accion = 'correo' AND ok = 1 AND resultado LIKE 'Enviado%'", array($id))->fetchColumn(),
        'tareas' => (int) labs_q("SELECT COUNT(*) FROM flujo_registro WHERE flujo_id = ? AND accion IN ('tarea', 'whatsapp')", array($id))->fetchColumn());
}

function labs_flujos($metodo, $sub, $b, $pares)
{
    if (preg_match('#^/entrada/([a-f0-9]{24,64})$#', $sub, $m) && $metodo === 'POST') {
        return array(200, labs_flujos_entrada($m[1], $b));
    }
    if ($sub === '/tick' && $metodo === 'POST') {
        labs_usuario(true);
        return array(200, labs_flujos_tick());
    }
    labs_flujos_permitido();
    $u = labs_usuario(true);
    if ($sub === '' && $metodo === 'GET') {
        $out = array();
        foreach (labs_q('SELECT id FROM flujos ORDER BY estado = \'activo\' DESC, id DESC')->fetchAll(PDO::FETCH_COLUMN) as $id) {
            $f = labs_flujo($id);
            $f['stats'] = labs_flujos_stats($id);
            $out[] = $f;
        }
        $hoy = gmdate('Y-m-d H:i:s', time() - 86400);
        return array(200, array('flujos' => $out, 'disparadores' => labs_flujos_disparadores(), 'nodos' => labs_flujos_nodos(), 'campos' => labs_flujos_campos(), 'fases' => array_map(function ($f) { return $f[0]; }, labs_fases()),
            'plantillas' => array_map(function ($p) { return array_intersect_key($p, array_flip(array('grupo', 'nombre', 'descripcion', 'icono', 'disparador', 'pasos', 'objetivo'))); }, labs_flujos_plantillas()),
            'actividad' => labs_q('SELECT r.*, f.nombre flujo, c.empresa, c.nombre contacto FROM flujo_registro r LEFT JOIN flujos f ON f.id = r.flujo_id LEFT JOIN contactos c ON c.id = r.contacto_id ORDER BY r.id DESC LIMIT 60')->fetchAll(),
            'resumen' => array('activos' => (int) labs_q("SELECT COUNT(*) FROM flujos WHERE estado = 'activo'")->fetchColumn(),
                'en_curso' => (int) labs_q("SELECT COUNT(*) FROM flujo_inscripciones WHERE estado = 'activa'")->fetchColumn(),
                'objetivos' => (int) labs_q("SELECT COUNT(*) FROM flujo_inscripciones WHERE estado = 'objetivo'")->fetchColumn(),
                'acciones_24h' => (int) labs_q('SELECT COUNT(*) FROM flujo_registro WHERE ts >= ?', array($hoy))->fetchColumn(),
                'smtp' => labs_tabla_existe('motor_leads') && labs_motor_cfg()['envio']['smtp_host'] !== ''),
            'url_base' => (((!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || strtolower((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https') ? 'https://' : 'http://') . ($_SERVER['HTTP_HOST'] ?? 'crm.labs24k.com')));
    }
    if ($sub === '/plantilla' && $metodo === 'POST') {
        $p = labs_flujos_plantillas()[$b['clave'] ?? ''] ?? null;
        if (!$p) {
            throw new ErrorApi('Esa plantilla no existe.', 404, 'PGRST116');
        }
        $id = labs_flujos_guarda(array('nombre' => $p['nombre'], 'tipo' => $p['grupo'] === 'embudo' ? 'embudo' : 'automatizacion', 'descripcion' => $p['descripcion'],
            'disparador' => $p['disparador'], 'pasos' => $p['pasos'], 'objetivo' => $p['objetivo'], 'opciones' => $p['opciones'], 'plantilla' => $b['clave']), $u, null);
        return array(200, array('id' => $id));
    }
    if ($sub === '/guardar' && $metodo === 'POST') {
        return array(200, array('id' => labs_flujos_guarda($b, $u, !empty($b['id']) ? (int) $b['id'] : null)));
    }
    if (preg_match('#^/(\d+)/(activar|pausar|borrar|inscribir)$#', $sub, $m) && $metodo === 'POST') {
        $f = labs_flujo($m[1]);
        if (!$f) {
            throw new ErrorApi('Ese flujo no existe.', 404, 'PGRST116');
        }
        if ($m[2] === 'activar') {
            $e = labs_flujo_valida($f);
            if ($e) {
                throw new ErrorApi($e, 400, 'FLUJO');
            }
            $smtp = labs_tabla_existe('motor_leads') && labs_motor_cfg()['envio']['smtp_host'] !== '';
            labs_q("UPDATE flujos SET estado = 'activo', token = COALESCE(token, ?), actualizado = ? WHERE id = ?", array(bin2hex(random_bytes(16)), labs_ahora(), $f['id']));
            labs_anota('flujos', 'Flujo activado: ' . $f['nombre']);
            return array(200, array('ok' => true, 'aviso' => $smtp ? '' : 'Sin correo de salida configurado: los correos quedarán preparados en el historial del contacto. Configúralo en el Motor → Fábrica de agentes.'));
        }
        if ($m[2] === 'pausar') {
            labs_q("UPDATE flujos SET estado = 'pausado', actualizado = ? WHERE id = ?", array(labs_ahora(), $f['id']));
            return array(200, array('ok' => true));
        }
        if ($m[2] === 'borrar') {
            labs_q("UPDATE flujo_inscripciones SET estado = 'cancelada', proximo = NULL WHERE flujo_id = ? AND estado = 'activa'", array($f['id']));
            labs_q('DELETE FROM flujos WHERE id = ?', array($f['id']));
            labs_anota('flujos', 'Flujo eliminado: ' . $f['nombre']);
            return array(200, array('ok' => true));
        }
        // Inscripción manual por lote: fase y/o etiqueta.
        if ($f['estado'] !== 'activo') {
            throw new ErrorApi('Activa el flujo antes de inscribir contactos.', 400, 'FLUJO');
        }
        $w = array('activo = 1');
        $p = array();
        if (!empty($b['fase']) && isset(labs_fases()[$b['fase']])) {
            $w[] = 'fase = ?';
            $p[] = $b['fase'];
        }
        if (!empty($b['etiqueta'])) {
            $w[] = 'etiquetas LIKE ?';
            $p[] = '%' . mb_substr((string) $b['etiqueta'], 0, 40) . '%';
        }
        if (!empty($b['contacto_ids'])) {
            $w[] = 'id IN (' . implode(',', array_map('intval', array_slice((array) $b['contacto_ids'], 0, 500))) . ')';
        }
        if (count($w) === 1) {
            throw new ErrorApi('Elige una fase, una etiqueta o unos contactos.', 400, 'FLUJO');
        }
        $n = 0;
        foreach (labs_q('SELECT id FROM contactos WHERE ' . implode(' AND ', $w) . ' LIMIT 500', $p)->fetchAll(PDO::FETCH_COLUMN) as $cid) {
            $n += labs_flujo_inscribe($f, $cid, array('manual' => 1)) ? 1 : 0;
        }
        return array(200, array('inscritos' => $n));
    }
    throw new ErrorApi('Ruta no encontrada.', 404, 'PGRST000');
}

function labs_flujos_guarda($b, $u, $id)
{
    $nombre = trim(mb_substr((string) ($b['nombre'] ?? ''), 0, 120));
    if (mb_strlen($nombre) < 3) {
        throw new ErrorApi('Ponle nombre al flujo.', 400, 'FLUJO');
    }
    $f = array('nombre' => $nombre, 'disparador' => is_array($b['disparador'] ?? null) ? $b['disparador'] : array(), 'pasos' => is_array($b['pasos'] ?? null) ? array_values($b['pasos']) : array(),
        'objetivo' => is_array($b['objetivo'] ?? null) ? $b['objetivo'] : array(), 'opciones' => is_array($b['opciones'] ?? null) ? $b['opciones'] : array());
    $e = labs_flujo_valida($f);
    if ($e) {
        throw new ErrorApi($e, 400, 'FLUJO');
    }
    $tipo = ($b['tipo'] ?? '') === 'embudo' ? 'embudo' : 'automatizacion';
    $j = function ($x) { return json_encode($x, JSON_UNESCAPED_UNICODE); };
    if ($id) {
        $act = labs_flujo($id);
        if (!$act) {
            throw new ErrorApi('Ese flujo no existe.', 404, 'PGRST116');
        }
        // Si se quitan pasos, quien estaba en ellos termina el flujo con limpieza.
        $ids = array_map(function ($n) { return $n['id']; }, $f['pasos']);
        foreach (labs_q("SELECT id, paso FROM flujo_inscripciones WHERE flujo_id = ? AND estado = 'activa'", array($id))->fetchAll() as $i) {
            if ($i['paso'] !== '' && !in_array($i['paso'], $ids, true)) {
                labs_q("UPDATE flujo_inscripciones SET estado = 'cancelada', proximo = NULL WHERE id = ?", array($i['id']));
            }
        }
        labs_q('UPDATE flujos SET nombre = ?, tipo = ?, descripcion = ?, disparador = ?, pasos = ?, objetivo = ?, opciones = ?, actualizado = ? WHERE id = ?',
            array($nombre, $tipo, mb_substr((string) ($b['descripcion'] ?? $act['descripcion']), 0, 1000), $j($f['disparador']), $j($f['pasos']), $j($f['objetivo']), $j($f['opciones']), labs_ahora(), $id));
        return (int) $id;
    }
    labs_q('INSERT INTO flujos (nombre, tipo, descripcion, estado, disparador, pasos, objetivo, opciones, plantilla, token, creado_por, creado, actualizado) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
        array($nombre, $tipo, mb_substr((string) ($b['descripcion'] ?? ''), 0, 1000), 'borrador', $j($f['disparador']), $j($f['pasos']), $j($f['objetivo']), $j($f['opciones']),
            mb_substr((string) ($b['plantilla'] ?? ''), 0, 40), bin2hex(random_bytes(16)), $u['id'], labs_ahora(), labs_ahora()));
    return (int) labs_db()->lastInsertId();
}
