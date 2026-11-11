<?php
/**
 * LABS COMMAND CENTER 360™ · Proceso de venta
 *
 * - Cada contacto tiene sector (lista o texto libre) y la persona que decide
 *   (gerente o responsable): nombre, cargo, teléfono directo y correo.
 * - Cada llamada queda registrada en «llamadas»: con quién se habló, resultado,
 *   cualificación BANT, notas, duración y, si la hay, la grabación (con el aviso
 *   de grabación al interlocutor). Al guardarla:
 *     · se anota en el historial del contacto,
 *     · el siguiente paso pasa a la agenda (cita) y a «próximo seguimiento»,
 *     · la fase del pipeline avanza sola según el resultado (nunca hacia atrás).
 */
defined('LABS') || exit;

function labs_ventas_resultados()
{
    // clave => [texto, fase mínima a la que lleva (o null)]
    return array(
        'no_contesta' => array('No contesta', null),
        'buzon' => array('Buzón de voz', null),
        'datos_erroneos' => array('Número equivocado', null),
        'filtro' => array('No me pasan con quien decide', null),
        'llamar_luego' => array('Volver a llamar', null),
        'interesado' => array('Interesado', 'cualificacion'),
        'cita' => array('Cita o visita agendada', 'demo'),
        'propuesta' => array('Pide propuesta', 'propuesta'),
        'cierre_verbal' => array('Cierre verbal (pendiente de firma)', 'negociacion'),
        'no_interesado' => array('No interesado', null),
    );
}

function labs_ventas_con_quien()
{
    return array('decisor' => 'el decisor', 'recepcion' => 'recepción / un empleado', 'otro' => 'otra persona', 'nadie' => 'nadie');
}

function labs_ventas_pasos()
{
    // tipo de siguiente paso => [texto, tipo de cita en la agenda, minutos]
    return array(
        'llamada' => array('Llamada', 'llamada', 15), 'visita' => array('Visita', 'visita', 45), 'demo' => array('Demo de IA', 'demo', 45),
        'propuesta' => array('Enviar / repasar propuesta', 'seguimiento', 20), 'firma' => array('Firma', 'firma', 30),
        'seguimiento' => array('Seguimiento', 'seguimiento', 15),
    );
}

/* --- Tablas ----------------------------------------------------------------- */
function labs_tablas_ventas(&$T, $AHORA)
{
    if (!isset($T['contactos'])) {
        return;
    }
    $T['contactos']['cols'] += array('sector' => array('t', ''), 'decisor_nombre' => array('t', ''), 'decisor_cargo' => array('t', ''),
        'decisor_telefono' => array('t', ''), 'decisor_email' => array('t', ''), 'proximo_paso' => array('t', ''));
    $vieja = $T['contactos']['valida'];
    $T['contactos']['valida'] = function ($f) use ($vieja) {
        $e = $vieja($f);
        if ($e) {
            return $e;
        }
        foreach (array('sector' => 60, 'decisor_nombre' => 120, 'decisor_cargo' => 80, 'decisor_telefono' => 40, 'decisor_email' => 190, 'proximo_paso' => 200) as $k => $max) {
            if (mb_strlen((string) ($f[$k] ?? '')) > $max) {
                return 'El campo «' . $k . '» es demasiado largo (máximo ' . $max . ').';
            }
        }
        if (($f['decisor_email'] ?? '') !== '' && !filter_var($f['decisor_email'], FILTER_VALIDATE_EMAIL)) {
            return 'El correo de la persona que decide no es válido.';
        }
        return null;
    };

    $T['llamadas'] = array(
        'pk' => 'id', 'gen' => 'auto', 'ops' => array('select', 'insert', 'update', 'delete'),
        'cols' => array('id' => array('i'), 'contacto_id' => array('i'), 'autor_id' => array('u'), 'inicio' => array('s', $AHORA),
            'duracion' => array('i', 0), 'con_quien' => array('t', 'nadie'), 'resultado' => array('t', 'no_contesta'),
            'bant' => array('j', array()), 'notas' => array('t', ''), 'grabacion' => array('t', ''), 'informado' => array('i', 0),
            'siguiente_tipo' => array('t', ''), 'siguiente_fecha' => array('s'), 'siguiente_nota' => array('t', ''),
            'perdido' => array('i', 0), 'creado' => array('s', $AHORA)),
        'leer' => function () {
            return labs_puedo('contactos.ver') ? labs_contacto_visible('llamadas.contacto_id') : '1=0';
        },
        'crear' => function ($f) {
            return labs_puedo('contactos.notas') && $f['autor_id'] === labs_uid() && labs_contacto_visible_id($f['contacto_id']);
        },
        // Se puede completar después (notas o grabación), solo quien la hizo o dirección.
        'editar' => function () {
            return in_array(labs_mi_rol(), array('admin', 'manager'), true) ? labs_contacto_visible('llamadas.contacto_id') : 'autor_id = ' . labs_uidq();
        },
        'editar_ok' => function ($f) {
            return labs_contacto_visible_id($f['contacto_id']);
        },
        'upd_cols' => array('notas', 'grabacion', 'informado', 'bant'),
        'borrar' => function () {
            return labs_si(labs_mi_rol() === 'admin');
        },
        'valida' => function ($f) {
            if (!isset(labs_ventas_resultados()[$f['resultado']])) {
                return 'Resultado de llamada no válido.';
            }
            if (!isset(labs_ventas_con_quien()[$f['con_quien']])) {
                return 'Indica con quién se ha hablado.';
            }
            if ((int) $f['duracion'] < 0 || (int) $f['duracion'] > 6 * 3600) {
                return 'Duración de la llamada no válida.';
            }
            if (mb_strlen((string) $f['notas']) > 8000 || mb_strlen((string) $f['siguiente_nota']) > 500) {
                return 'Las notas son demasiado largas.';
            }
            if ($f['siguiente_tipo'] !== '' && !isset(labs_ventas_pasos()[$f['siguiente_tipo']])) {
                return 'Tipo de siguiente paso no válido.';
            }
            if ($f['siguiente_tipo'] !== '' && !$f['siguiente_fecha']) {
                return 'Pon la fecha del siguiente paso.';
            }
            if ($f['grabacion'] !== '' && strpos((string) $f['grabacion'], 'contactos/' . (int) $f['contacto_id'] . '/llamadas/') !== 0) {
                return 'La grabación no pertenece a este contacto.';
            }
            if ($f['grabacion'] !== '' && !$f['informado']) {
                return 'Para guardar una grabación hay que haber avisado a la otra persona de que se graba.';
            }
            if (!is_array($f['bant'])) {
                return 'Cualificación no válida.';
            }
            return null;
        },
        'despues_crear' => function ($n) {
            labs_ventas_tras_llamada($n);
        },
    );
}

/** Lo que pasa al guardar una llamada: historial, agenda y fase. */
function labs_ventas_tras_llamada($n)
{
    $c = labs_fila('SELECT * FROM contactos WHERE id = ?', array($n['contacto_id']));
    if (!$c) {
        return;
    }
    $res = labs_ventas_resultados();
    $pasos = labs_ventas_pasos();
    $quien = labs_ventas_con_quien();
    $ahora = labs_ahora();
    $min = (int) floor($n['duracion'] / 60);
    $seg = (int) $n['duracion'] % 60;
    $txt = 'Llamada · ' . ($n['con_quien'] === 'nadie' ? 'sin respuesta' : 'habló con ' . $quien[$n['con_quien']] .
        ($n['con_quien'] === 'decisor' && $c['decisor_nombre'] !== '' ? ' (' . $c['decisor_nombre'] . ($c['decisor_cargo'] !== '' ? ', ' . $c['decisor_cargo'] : '') . ')' : '')) .
        ' · Resultado: ' . $res[$n['resultado']][0] . ($n['duracion'] ? ' · ' . ($min ? $min . ' min ' : '') . $seg . ' s' : '') .
        ($n['grabacion'] !== '' ? ' · con grabación' : '');
    $b = is_array($n['bant']) ? $n['bant'] : array();
    $ok = array();
    foreach (array('presupuesto' => 'presupuesto', 'autoridad' => 'decide', 'necesidad' => 'necesidad', 'plazo' => 'plazo') as $k => $t) {
        if (!empty($b[$k])) {
            $ok[] = $t;
        }
    }
    if ($ok) {
        $txt .= ' · BANT: ' . implode(', ', $ok);
    }
    if (trim((string) $n['notas']) !== '') {
        $txt .= "\n" . mb_substr(trim($n['notas']), 0, 1500);
    }
    $cambios = array('ultima_actividad' => $ahora);
    if ($n['siguiente_tipo'] !== '' && $n['siguiente_fecha']) {
        $p = $pasos[$n['siguiente_tipo']];
        $paso = $p[0] . ($n['siguiente_nota'] !== '' ? ': ' . $n['siguiente_nota'] : '');
        $f = new DateTime($n['siguiente_fecha'], new DateTimeZone('UTC'));
        $f->setTimezone(new DateTimeZone('Europe/Madrid'));
        $txt .= "\nSiguiente paso: " . $paso . ' · ' . $f->format('d/m/Y H:i');
        $cambios['proximo_contacto'] = $n['siguiente_fecha'];
        $cambios['proximo_paso'] = mb_substr($paso, 0, 200);
        $fin = gmdate('Y-m-d H:i:s', strtotime($n['siguiente_fecha'] . ' UTC') + $p[2] * 60);
        labs_q('INSERT INTO citas (contacto_id, titulo, tipo, inicio, fin, comercial_id, estado, sector, lugar, notas, resumen, creado_por, creado, actualizado)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)', array($c['id'], mb_substr($p[0] . ' · ' . ($c['empresa'] !== '' ? $c['empresa'] : $c['nombre']), 0, 200),
            $p[1], $n['siguiente_fecha'], $fin, $n['autor_id'], 'programada', mb_substr((string) $c['sector'], 0, 60), '',
            mb_substr((string) $n['siguiente_nota'], 0, 4000), '', $n['autor_id'], $ahora, $ahora));
    } elseif (in_array($n['resultado'], array('no_interesado', 'datos_erroneos'), true)) {
        $cambios['proximo_contacto'] = null;
        $cambios['proximo_paso'] = '';
    }
    // La fase avanza sola con el resultado (nunca hacia atrás); «no interesado» solo si se marca perdido.
    $orden = array_keys(labs_fases());
    $actual = array_search($c['fase'], $orden, true);
    $meta = $res[$n['resultado']][1];
    if ($meta && $c['fase'] !== 'perdido' && $actual !== false && array_search($meta, $orden, true) > $actual && $actual < array_search('firmado', $orden, true)) {
        $cambios['fase'] = $meta;
    }
    if ($n['resultado'] === 'no_interesado' && !empty($n['perdido']) && !in_array($c['fase'], array('firmado', 'despliegue', 'produccion', 'perdido'), true)) {
        $cambios['fase'] = 'perdido';
        $cambios['motivo_perdida'] = mb_substr('No interesado' . ($n['notas'] !== '' ? ': ' . trim($n['notas']) : ''), 0, 200);
    }
    labs_q('INSERT INTO contacto_eventos (contacto_id, autor_id, tipo, texto, ts) VALUES (?,?,?,?,?)', array($c['id'], $n['autor_id'], 'llamada', mb_substr($txt, 0, 2000), $ahora));
    $def = labs_tabla('contactos');
    labs_actualiza_fila('contactos', $def, labs_fila_php($def, $c), $cambios, true);
}

/** Sector a partir del nombre, la empresa y las etiquetas (para los contactos que ya había). */
function labs_ventas_sector_de($texto)
{
    $t = labs_norma_texto($texto);
    $reglas = array(
        'Clínica estética' => '/estetic|medicina estetica|belleza|laser|depilac/',
        'Clínica dental' => '/dental|dentist|odontolog|ortodonc/',
        'Centro médico' => '/clinica|medic|salud|fisio|consulta|doctor|podolog|psicolog|nutricion|veterinar/',
        'Despacho legal / asesoría' => '/abogad|juridic|legal|despacho|bufete|asesor|gestoria|notari/',
        'Inmobiliaria' => '/inmobiliar|inmo\b|real estate|fincas|propiedades|vivienda/',
        'Hotel / alojamiento' => '/hotel|hostal|apartament|alojamiento|albergue|casa rural/',
        'Restauración' => '/restaurante|sidreria|cafeter|\bbar\b|gastro|pizzer|catering/',
        'Gimnasio / deporte' => '/gimnas|fitness|crossfit|pilates|yoga|deporte/',
        'Academia / formación' => '/academia|formacion|escuela|colegio|idiomas/',
        'Taller / automoción' => '/taller|motor|automo|neumatic|concesionar/',
    );
    foreach ($reglas as $s => $re) {
        if (preg_match($re, $t)) {
            return $s;
        }
    }
    return '';
}
