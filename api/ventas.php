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

/** Dónde se le escapa el dinero al cliente (cuello de botella) y el pack que lo cierra. */
function labs_ventas_cuellos()
{
    return array(
        'captacion' => array('Captación de clientes', 'Pack 1 · El Capturador Web'),
        'embudo' => array('Embudo y conversión', 'Pack 2 · El Súper-Setter'),
        'atencion' => array('Atención por voz y datos', 'Pack 3 · El Cerebro Absoluto'),
    );
}

function labs_ventas_estados_presupuesto()
{
    return array('Borrador', 'Enviado', 'En revisión', 'Aceptado', 'Rechazado');
}

/** Importe en formato español: 2.800,00 €. */
function labs_ventas_euros($n)
{
    return number_format((float) $n, 2, ',', '.') . ' €';
}

/* --- Tablas ----------------------------------------------------------------- */
function labs_tablas_ventas(&$T, $AHORA)
{
    if (!isset($T['contactos'])) {
        return;
    }
    $T['contactos']['cols'] += array('sector' => array('t', ''), 'decisor_nombre' => array('t', ''), 'decisor_cargo' => array('t', ''),
        'decisor_telefono' => array('t', ''), 'decisor_email' => array('t', ''), 'proximo_paso' => array('t', ''),
        'cuello' => array('t', ''), 'fuga_anual' => array('n', 0));
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
        if (($f['cuello'] ?? '') !== '' && !isset(labs_ventas_cuellos()[$f['cuello']])) {
            return 'Cuello de botella no válido.';
        }
        if ((float) ($f['fuga_anual'] ?? 0) < 0 || (float) ($f['fuga_anual'] ?? 0) > 100000000) {
            return 'La fuga estimada no es válida.';
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
            $b = $f['bant'];
            if (($b['cuello'] ?? '') !== '' && !isset(labs_ventas_cuellos()[$b['cuello']])) {
                return 'Cuello de botella no válido.';
            }
            foreach (array('perdidas', 'ticket') as $k) {
                if (isset($b[$k]) && (!is_numeric($b[$k]) || $b[$k] < 0 || $b[$k] > 10000000)) {
                    return 'Los números de la fuga no son válidos.';
                }
            }
            return null;
        },
        'despues_crear' => function ($n) {
            labs_ventas_tras_llamada($n);
        },
    );

    /* Presupuestos: se guardan de verdad, ligados al contacto, con el importe calculado en el servidor. */
    if (isset($T['presupuestos'])) {
        $p = &$T['presupuestos'];
        $p['cols'] += array('contacto_id' => array('i'), 'datos' => array('j', array()));
        $p['crear'] = function ($f) {
            return labs_puedo('presu.crear') && $f['autor_id'] === labs_uid()
                && (empty($f['contacto_id']) || labs_contacto_visible_id($f['contacto_id']));
        };
        $p['editar'] = function () {
            return labs_puedo('presu.crear') ? (in_array(labs_mi_rol(), array('admin', 'manager'), true) ? '1=1' : 'autor_id = ' . labs_uidq()) : '1=0';
        };
        $p['upd_cols'] = array('estado');
        $p['antes_crear'] = function (&$n) {
            labs_ventas_presupuesto_calcula($n);
            // Código correlativo del año: PR-2026-0001.
            $anio = gmdate('Y');
            $ult = labs_fila("SELECT codigo FROM presupuestos WHERE codigo LIKE ? ORDER BY id DESC LIMIT 1", array('PR-' . $anio . '-%'));
            $num = $ult ? (int) substr($ult['codigo'], 8) + 1 : 1;
            $n['codigo'] = 'PR-' . $anio . '-' . str_pad((string) $num, 4, '0', STR_PAD_LEFT);
            while (labs_fila('SELECT 1 FROM presupuestos WHERE codigo = ?', array($n['codigo']))) {
                $num++;
                $n['codigo'] = 'PR-' . $anio . '-' . str_pad((string) $num, 4, '0', STR_PAD_LEFT);
            }
        };
        $p['valida'] = function ($f) {
            if (!labs_largo($f['cliente'], 2, 200)) {
                return 'Indica el cliente (entre 2 y 200 caracteres).';
            }
            if (!is_array($f['lineas']) || !$f['lineas'] || count($f['lineas']) > 40) {
                return 'El presupuesto necesita entre 1 y 40 líneas.';
            }
            foreach ($f['lineas'] as $l) {
                if (!is_array($l) || !labs_largo((string) ($l['n'] ?? ''), 2, 200) || !is_numeric($l['p'] ?? 0) || !is_numeric($l['m'] ?? 0)
                    || (float) ($l['p'] ?? 0) < 0 || (float) ($l['m'] ?? 0) < 0 || mb_strlen((string) ($l['d'] ?? '')) > 1500) {
                    return 'Hay una línea del presupuesto que no es válida.';
                }
            }
            if ((float) $f['iva'] < 0 || (float) $f['iva'] > 30) {
                return 'El IVA va de 0 a 30 %.';
            }
            if (!in_array($f['estado'], labs_ventas_estados_presupuesto(), true)) {
                return 'Estado de presupuesto no válido.';
            }
            if (!is_array($f['datos'])) {
                return 'Datos del presupuesto no válidos.';
            }
            $d = $f['datos'];
            if ((float) ($d['desc'] ?? 0) < 0 || (float) ($d['desc'] ?? 0) > 100 || (float) ($d['hito'] ?? 50) < 0 || (float) ($d['hito'] ?? 50) > 100) {
                return 'Descuento o hito de pago no válidos.';
            }
            if (($d['email'] ?? '') !== '' && !filter_var($d['email'], FILTER_VALIDATE_EMAIL)) {
                return 'El correo del cliente no es válido.';
            }
            if (($d['cuello'] ?? '') !== '' && !isset(labs_ventas_cuellos()[$d['cuello']])) {
                return 'Cuello de botella no válido.';
            }
            foreach (array('atencion' => 200, 'tel' => 40, 'titulo' => 200, 'iban' => 40, 'nota' => 2000) as $k => $max) {
                if (mb_strlen((string) ($d[$k] ?? '')) > $max) {
                    return 'El campo «' . $k . '» es demasiado largo.';
                }
            }
            return null;
        };
        $p['despues_crear'] = function ($n) {
            labs_ventas_tras_presupuesto($n);
        };
        $p['despues_editar'] = function ($v, $n) {
            labs_ventas_presupuesto_estado($v, $n);
        };
        unset($p);
    }
}

/** El importe lo calcula el servidor a partir de las líneas (no se fía del navegador). */
function labs_ventas_presupuesto_calcula(&$n)
{
    $suma = 0;
    $lineas = array();
    foreach ((array) $n['lineas'] as $l) {
        if (!is_array($l)) {
            continue;
        }
        $l = array('id' => mb_substr((string) ($l['id'] ?? ''), 0, 40), 'code' => mb_substr((string) ($l['code'] ?? ''), 0, 12),
            'n' => trim((string) ($l['n'] ?? '')), 'd' => trim((string) ($l['d'] ?? '')),
            'p' => round((float) ($l['p'] ?? 0), 2), 'm' => round((float) ($l['m'] ?? 0), 2));   // un negativo lo rechaza la validación
        $suma += $l['p'];
        $lineas[] = $l;
    }
    $n['lineas'] = $lineas;
    $d = is_array($n['datos'] ?? null) ? $n['datos'] : array();
    $desc = min(100, max(0, (float) ($d['desc'] ?? 0)));
    $n['base'] = round($suma * (1 - $desc / 100), 2);
    $n['total'] = round($n['base'] * (1 + (float) $n['iva'] / 100), 2);
}

/** Al registrar un presupuesto de un contacto: historial, valor del deal, fase y seguimiento a las 48 h. */
function labs_ventas_tras_presupuesto($n)
{
    if (empty($n['contacto_id'])) {
        return;
    }
    $c = labs_fila('SELECT * FROM contactos WHERE id = ?', array($n['contacto_id']));
    if (!$c) {
        return;
    }
    $ahora = labs_ahora();
    $nombres = array();
    $mensual = 0;
    foreach ((array) $n['lineas'] as $l) {
        $nombres[] = $l['n'];
        $mensual += (float) $l['m'];
    }
    $txt = 'Presupuesto ' . $n['codigo'] . ' · ' . labs_ventas_euros($n['base']) . ' + IVA (' . labs_ventas_euros($n['total']) . ' con IVA)' .
        ($mensual ? ' · ' . labs_ventas_euros($mensual) . '/mes' : '') . "\n" . mb_substr(implode(' · ', $nombres), 0, 900);
    $d = is_array($n['datos']) ? $n['datos'] : array();
    if (($d['cuello'] ?? '') !== '') {
        $txt .= "\nCuello de botella: " . labs_ventas_cuellos()[$d['cuello']][0];
    }
    // Seguimiento a las 48 h laborables, a las 10:00 (hora de Madrid).
    $f = new DateTime('now', new DateTimeZone('Europe/Madrid'));
    $dias = 0;
    while ($dias < 2) {
        $f->modify('+1 day');
        if ((int) $f->format('N') < 6) {
            $dias++;
        }
    }
    $f->setTime(10, 0);
    $f->setTimezone(new DateTimeZone('UTC'));
    $ini = $f->format('Y-m-d H:i:s');
    $fin = gmdate('Y-m-d H:i:s', $f->getTimestamp() + 20 * 60);
    $paso = 'Seguimiento del presupuesto ' . $n['codigo'];
    labs_q('INSERT INTO citas (contacto_id, titulo, tipo, inicio, fin, comercial_id, estado, sector, lugar, notas, resumen, creado_por, creado, actualizado)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)', array($c['id'], mb_substr($paso . ' · ' . ($c['empresa'] !== '' ? $c['empresa'] : $c['nombre']), 0, 200),
        'seguimiento', $ini, $fin, $n['autor_id'], 'programada', mb_substr((string) $c['sector'], 0, 60), '',
        'Repasar el presupuesto con quien decide y resolver dudas. Cerrar con fecha de firma o auditoría técnica.', '', $n['autor_id'], $ahora, $ahora));
    $cambios = array('ultima_actividad' => $ahora, 'valor' => (float) $n['base'], 'proximo_contacto' => $ini, 'proximo_paso' => mb_substr($paso, 0, 200));
    if (($d['cuello'] ?? '') !== '') {
        $cambios['cuello'] = $d['cuello'];
    }
    $orden = array_keys(labs_fases());
    $actual = array_search($c['fase'], $orden, true);
    if ($c['fase'] !== 'perdido' && $actual !== false && $actual < array_search('propuesta', $orden, true)) {
        $cambios['fase'] = 'propuesta';
    }
    labs_q('INSERT INTO contacto_eventos (contacto_id, autor_id, tipo, texto, ts) VALUES (?,?,?,?,?)', array($c['id'], $n['autor_id'], 'presupuesto', mb_substr($txt, 0, 2000), $ahora));
    $def = labs_tabla('contactos');
    labs_actualiza_fila('contactos', $def, labs_fila_php($def, $c), $cambios, true);
}

/** Cambio de estado de un presupuesto: queda en el historial; aceptado lleva el deal a negociación. */
function labs_ventas_presupuesto_estado($v, $n)
{
    if ($v['estado'] === $n['estado'] || empty($n['contacto_id'])) {
        return;
    }
    $c = labs_fila('SELECT * FROM contactos WHERE id = ?', array($n['contacto_id']));
    if (!$c) {
        return;
    }
    labs_q('INSERT INTO contacto_eventos (contacto_id, autor_id, tipo, texto, ts) VALUES (?,?,?,?,?)', array($c['id'], labs_uid(), 'presupuesto',
        'Presupuesto ' . $n['codigo'] . ': ' . $v['estado'] . ' → ' . $n['estado'], labs_ahora()));
    $orden = array_keys(labs_fases());
    $actual = array_search($c['fase'], $orden, true);
    if ($n['estado'] === 'Aceptado' && $c['fase'] !== 'perdido' && $actual !== false && $actual < array_search('negociacion', $orden, true)) {
        $def = labs_tabla('contactos');
        labs_actualiza_fila('contactos', $def, labs_fila_php($def, $c), array('fase' => 'negociacion', 'ultima_actividad' => labs_ahora()), true);
    }
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
    $cambios = array('ultima_actividad' => $ahora);
    $cuellos = labs_ventas_cuellos();
    if (($b['cuello'] ?? '') !== '' && isset($cuellos[$b['cuello']])) {
        $txt .= "\nCuello de botella: " . $cuellos[$b['cuello']][0] . ' → ' . $cuellos[$b['cuello']][1];
        $cambios['cuello'] = $b['cuello'];
    }
    if (!empty($b['perdidas']) && !empty($b['ticket'])) {
        $anual = round((float) $b['perdidas'] * (float) $b['ticket'] * 12, 2);
        $txt .= "\nFuga que reconoce el cliente: " . rtrim(rtrim(number_format((float) $b['perdidas'], 1, ',', '.'), '0'), ',') . ' clientes/mes × ' .
            labs_ventas_euros($b['ticket']) . ' × 12 = ' . labs_ventas_euros($anual) . ' al año';
        $cambios['fuga_anual'] = $anual;
    }
    if (trim((string) $n['notas']) !== '') {
        $txt .= "\n" . mb_substr(trim($n['notas']), 0, 1500);
    }
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
