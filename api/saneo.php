<?php
/*
 * Agente de mantenimiento del pipeline: corrige solo lo que el panel marca como «requiere acción».
 *
 * - Sin próxima acción → le pone el paso típico de su fase y una fecha real, repartiendo la carga
 *   de cada gestor (máximo N al día, en horario laborable de Madrid). Los de SLA vencido van primero
 *   y como «Rescate».
 * - Sin valor → valor estimado: su presupuesto, el pack de su cuello de botella, lo que se ha
 *   vendido de verdad a su sector o, si no hay nada, el pack de entrada.
 * - Sin gestor (o gestor dado de baja) → al comercial activo con menos deals abiertos.
 * - SLA vencido → no se maquilla (solo desaparece al cambiar de fase): se le pone una acción de
 *   rescate prioritaria y, si lleva mucho tiempo muerto pese a los rescates, se propone a una
 *   persona marcarlo como perdido (nunca lo hace solo).
 *
 * Memoria (saneo_registro): cada cambio con su valor anterior, para deshacer un lote entero, para
 * no volver a tocar lo que una persona ha corregido después y para saber cuántas veces se ha
 * reprogramado un deal sin que nadie haga nada.
 */
defined('LABS') || exit;

function labs_saneo_config_def()
{
    return array('automatico' => true, 'proximo_paso' => true, 'valor' => true, 'gestor' => true, 'rescate_sla' => true,
        'crear_llamadas' => false, 'por_gestor_dia' => 15, 'proponer_perdidos' => true, 'dias_muerto' => 45);
}

function labs_saneo_cfg()
{
    $c = json_decode((string) labs_ajuste('saneo.config', ''), true);
    $d = labs_saneo_config_def();
    return is_array($c) ? array_merge($d, array_intersect_key($c, $d)) : $d;
}

function labs_saneo_pasos()
{
    return array(
        'lead' => 'Llamar al decisor y conseguir la visita',
        'cualificacion' => 'Confirmar necesidad, presupuesto y plazo (BANT) y agendar la demo',
        'demo' => 'Hacer la demo y enviar la propuesta del pack que encaja',
        'propuesta' => 'Seguimiento de la propuesta: resolver dudas y pedir la decisión',
        'negociacion' => 'Resolver objeciones y fijar la fecha de firma',
        'firmado' => 'Kick-off y toma de datos',
        'despliegue' => 'Validar con el cliente y lanzar',
    );
}

/** Abiertos sobre los que trabaja (los de producción y perdidos no requieren acción). */
function labs_saneo_where()
{
    return "c.activo = 1 AND c.fase NOT IN ('perdido', 'produccion')";
}

function labs_saneo_sla_vencido($c)
{
    $f = labs_fases()[$c['fase']] ?? null;
    if (!$f || !$f[1] || !$c['fase_desde']) {
        return false;
    }
    return strtotime(substr($c['fase_desde'], 0, 19) . ' UTC') + $f[1] * 86400 < time();
}

function labs_saneo_gestores()
{
    return labs_q("SELECT id, nombre, apellidos FROM perfiles WHERE estado = 'Activo' AND rol IN ('commercial', 'manager', 'admin') ORDER BY rol = 'commercial' DESC, nombre")->fetchAll();
}

/** Diagnóstico: lo mismo que marca el panel. */
function labs_saneo_diagnostico()
{
    $ahora = labs_ahora();
    $r = array('abiertos' => 0, 'sin_accion' => 0, 'sin_valor' => 0, 'sla_vencido' => 0, 'sin_gestor' => 0);
    $activos = array();
    foreach (labs_saneo_gestores() as $g) {
        $activos[$g['id']] = true;
    }
    foreach (labs_q('SELECT c.id, c.fase, c.fase_desde, c.valor, c.gestor_id, c.proximo_contacto FROM contactos c WHERE ' . labs_saneo_where())->fetchAll() as $c) {
        $r['abiertos']++;
        if (!$c['proximo_contacto'] || $c['proximo_contacto'] < $ahora) {
            $r['sin_accion']++;
        }
        if ((float) $c['valor'] <= 0 && !in_array($c['fase'], array('firmado', 'despliegue'), true)) {
            $r['sin_valor']++;
        }
        if (labs_saneo_sla_vencido($c)) {
            $r['sla_vencido']++;
        }
        if (!$c['gestor_id'] || !isset($activos[$c['gestor_id']])) {
            $r['sin_gestor']++;
        }
    }
    $r['candidatos_perdido'] = count(labs_saneo_candidatos());
    return $r;
}

function labs_saneo_candidatos()
{
    return labs_q("SELECT r.contacto_id, r.despues motivo, r.ts, c.nombre, c.empresa, c.fase, c.ultima_actividad FROM saneo_registro r JOIN contactos c ON c.id = r.contacto_id
                   WHERE r.campo = 'candidato_perdido' AND r.deshecho = 0 AND c.activo = 1 AND c.fase NOT IN ('perdido', 'produccion', 'firmado', 'despliegue')
                   ORDER BY r.id DESC LIMIT 50")->fetchAll();
}

/** Valor estimado y por qué. */
function labs_saneo_valor($c)
{
    $p = labs_fila("SELECT total, codigo FROM presupuestos WHERE contacto_id = ? AND estado <> 'Rechazado' AND total > 0 ORDER BY id DESC LIMIT 1", array($c['id']));
    if ($p) {
        return array((float) $p['total'], 'su presupuesto ' . $p['codigo']);
    }
    $packs = array('captacion' => array(1700, 'Pack 1'), 'embudo' => array(2800, 'Pack 2'), 'atencion' => array(3900, 'Pack 3'));
    if (isset($packs[$c['cuello']])) {
        return array((float) $packs[$c['cuello']][0], $packs[$c['cuello']][1] . ', el de su cuello de botella');
    }
    if (trim((string) $c['sector']) !== '') {
        $m = labs_fila("SELECT AVG(p.total) m, COUNT(*) n FROM presupuestos p JOIN contactos k ON k.id = p.contacto_id WHERE p.estado = 'Aceptado' AND p.total > 0 AND k.sector = ?", array($c['sector']));
        if ($m && (int) $m['n'] >= 2) {
            return array(round((float) $m['m'] / 100) * 100, 'lo que se ha vendido a ' . $c['sector'] . ' (' . (int) $m['n'] . ' ventas)');
        }
    }
    return array(1700.0, 'pack de entrada, a falta de más datos');
}

/** Huecos de un día laborable (hora de Madrid): mañanas y tardes, cada 20 minutos. */
function labs_saneo_huecos()
{
    $h = array();
    for ($m = 9 * 60 + 30; $m <= 13 * 60 + 40; $m += 20) {
        $h[] = $m;
    }
    for ($m = 16 * 60; $m <= 18 * 60 + 40; $m += 20) {
        $h[] = $m;
    }
    return $h;
}

/** Reparte fechas: primer día laborable con sitio en la agenda del gestor. */
function labs_saneo_fecha($gid, &$carga, $cap)
{
    $tz = new DateTimeZone('Europe/Madrid');
    $d = new DateTime('now', $tz);
    if ((int) $d->format('G') >= 17) {
        $d->modify('+1 day');
    }
    $huecos = labs_saneo_huecos();
    $cap = max(1, min(count($huecos), (int) $cap));
    for ($i = 0; $i < 60; $i++, $d->modify('+1 day')) {
        if ((int) $d->format('N') >= 6) {
            continue;
        }
        $k = $gid . '|' . $d->format('Y-m-d');
        $n = $carga[$k] ?? 0;
        if ($n >= $cap) {
            continue;
        }
        $hoy = $d->format('Y-m-d') === (new DateTime('now', $tz))->format('Y-m-d');
        $min = $hoy ? (int) $d->format('G') * 60 + (int) $d->format('i') + 30 : 0;
        $hueco = null;
        foreach ($huecos as $j => $m) {
            if ($j >= $n && $m >= $min) {
                $hueco = $m;
                break;
            }
        }
        if ($hueco === null) {
            continue;
        }
        $carga[$k] = $n + 1;
        $f = DateTime::createFromFormat('Y-m-d H:i', $d->format('Y-m-d') . ' ' . sprintf('%02d:%02d', intdiv($hueco, 60), $hueco % 60), $tz);
        return $f->setTimezone(new DateTimeZone('UTC'));
    }
    return (new DateTime('now', new DateTimeZone('UTC')))->modify('+1 day');
}

function labs_saneo_anota($lote, $cid, $campo, $antes, $despues, $origen)
{
    labs_q('INSERT INTO saneo_registro (lote, contacto_id, campo, antes, despues, origen, ts) VALUES (?,?,?,?,?,?,?)',
        array($lote, (int) $cid, $campo, mb_substr((string) $antes, 0, 300), mb_substr((string) $despues, 0, 300), $origen, labs_ahora()));
}

/** Una pasada de mantenimiento. Devuelve el resumen. */
function labs_saneo_ejecuta($origen = 'manual', $limite = 600)
{
    $cfg = labs_saneo_cfg();
    $lote = gmdate('ymdHis') . substr(bin2hex(random_bytes(3)), 0, 4);
    $ahora = labs_ahora();
    $res = array('lote' => $lote, 'revisados' => 0, 'proximo_paso' => 0, 'rescates' => 0, 'valor' => 0, 'gestor' => 0, 'llamadas' => 0, 'candidatos_perdido' => 0, 'errores' => 0);
    $gestores = labs_saneo_gestores();
    $activos = array();
    foreach ($gestores as $g) {
        $activos[$g['id']] = $g;
    }
    // Carga de cada gestor por día (próximos pasos ya fijados) para no saturar ninguna agenda.
    $carga = array();
    $abiertos = array();
    foreach (labs_q("SELECT c.gestor_id, c.proximo_contacto FROM contactos c WHERE " . labs_saneo_where() . " AND c.proximo_contacto >= ?", array($ahora))->fetchAll() as $x) {
        $k = $x['gestor_id'] . '|' . (new DateTime(substr($x['proximo_contacto'], 0, 19), new DateTimeZone('UTC')))->setTimezone(new DateTimeZone('Europe/Madrid'))->format('Y-m-d');
        $carga[$k] = ($carga[$k] ?? 0) + 1;
    }
    foreach (labs_q("SELECT gestor_id, COUNT(*) n FROM contactos c WHERE " . labs_saneo_where() . " AND gestor_id IS NOT NULL GROUP BY gestor_id")->fetchAll() as $x) {
        $abiertos[$x['gestor_id']] = (int) $x['n'];
    }
    // Memoria: lo que ya se tocó antes.
    $mem = array();
    foreach (labs_q("SELECT contacto_id, campo, COUNT(*) n, MAX(ts) ult FROM saneo_registro WHERE deshecho = 0 GROUP BY contacto_id, campo")->fetchAll() as $x) {
        $mem[(int) $x['contacto_id']][$x['campo']] = array((int) $x['n'], $x['ult']);
    }
    $lista = labs_q('SELECT c.* FROM contactos c WHERE ' . labs_saneo_where() . ' ORDER BY c.fase_desde ASC LIMIT ' . (int) $limite)->fetchAll();
    // Primero los de SLA vencido (los que más se enfrían).
    usort($lista, function ($a, $b) {
        return (int) labs_saneo_sla_vencido($b) - (int) labs_saneo_sla_vencido($a);
    });
    $pasos = labs_saneo_pasos();
    foreach ($lista as $c) {
        $res['revisados']++;
        $id = (int) $c['id'];
        $m = $mem[$id] ?? array();
        $set = array();
        $notas = array();
        try {
            // 1 · Gestor
            $gid = $c['gestor_id'];
            if ($cfg['gestor'] && (!$gid || !isset($activos[$gid])) && $gestores && !isset($m['gestor_humano'])) {
                $menos = null;
                foreach ($gestores as $g) {
                    if ($menos === null || ($abiertos[$g['id']] ?? 0) < ($abiertos[$menos['id']] ?? 0)) {
                        $menos = $g;
                    }
                }
                $set['gestor_id'] = $menos['id'];
                $abiertos[$menos['id']] = ($abiertos[$menos['id']] ?? 0) + 1;
                labs_saneo_anota($lote, $id, 'gestor_id', (string) $gid, $menos['id'], $origen);
                $notas[] = 'gestor asignado: ' . trim($menos['nombre'] . ' ' . $menos['apellidos']);
                $gid = $menos['id'];
                $res['gestor']++;
            }
            // 2 · Valor (una sola vez: si una persona lo vuelve a poner a 0, se respeta)
            if ($cfg['valor'] && (float) $c['valor'] <= 0 && !in_array($c['fase'], array('firmado', 'despliegue'), true) && !isset($m['valor'])) {
                list($v, $porque) = labs_saneo_valor($c);
                $set['valor'] = $v;
                labs_saneo_anota($lote, $id, 'valor', (string) $c['valor'], (string) $v, $origen);
                $notas[] = 'valor estimado ' . number_format($v, 0, ',', '.') . ' € (' . $porque . ')';
                $res['valor']++;
            }
            // 3 · Próxima acción
            $vencido = labs_saneo_sla_vencido($c);
            $sin = !$c['proximo_contacto'] || $c['proximo_contacto'] < $ahora;
            if ($cfg['proximo_paso'] && $sin && $gid) {
                $paso = $pasos[$c['fase']] ?? 'Seguimiento';
                if ($vencido && $cfg['rescate_sla']) {
                    $paso = 'Rescate (SLA vencido): ' . $paso;
                }
                $f = labs_saneo_fecha($gid, $carga, $cfg['por_gestor_dia']);
                $set['proximo_contacto'] = $f->format('Y-m-d H:i:s');
                $set['proximo_paso'] = mb_substr($paso, 0, 200);
                labs_saneo_anota($lote, $id, 'proximo_contacto', (string) $c['proximo_contacto'], $set['proximo_contacto'], $origen);
                labs_saneo_anota($lote, $id, 'proximo_paso', (string) $c['proximo_paso'], $set['proximo_paso'], $origen);
                $madrid = (clone $f)->setTimezone(new DateTimeZone('Europe/Madrid'));
                $notas[] = 'próximo paso «' . $paso . '» el ' . $madrid->format('d/m H:i');
                $res[$vencido ? 'rescates' : 'proximo_paso']++;
                if ($cfg['crear_llamadas']) {
                    $fin = (clone $f)->modify('+15 minutes');
                    labs_q('INSERT INTO citas (contacto_id, titulo, tipo, inicio, fin, comercial_id, estado, sector, lugar, notas, resumen, creado_por, creado, actualizado) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                        array($id, mb_substr($paso . ' · ' . ($c['empresa'] ?: $c['nombre']), 0, 200), 'llamada', $set['proximo_contacto'], $fin->format('Y-m-d H:i:s'), $gid, 'programada',
                            mb_substr((string) $c['sector'], 0, 80), '', 'Programada por el agente de mantenimiento del pipeline.', '', $gid, $ahora, $ahora));
                    labs_saneo_anota($lote, $id, 'cita', '', (string) labs_db()->lastInsertId(), $origen);
                    $res['llamadas']++;
                }
                // 4 · Muerto pese a los rescates: se propone a una persona marcarlo como perdido.
                $reprog = $m['proximo_contacto'][0] ?? 0;
                $sinact = !$c['ultima_actividad'] || $c['ultima_actividad'] < labs_hace((int) $cfg['dias_muerto'] * 86400);
                $mant = isset($m['mantener']) && $m['mantener'][1] > labs_hace((int) $cfg['dias_muerto'] * 86400);
                if ($cfg['proponer_perdidos'] && $vencido && $sinact && $reprog >= 2 && !isset($m['candidato_perdido']) && !$mant) {
                    labs_saneo_anota($lote, $id, 'candidato_perdido', '', 'Reprogramado ' . $reprog . ' veces sin actividad en ' . $cfg['dias_muerto'] . ' días', $origen);
                    $res['candidatos_perdido']++;
                }
            }
            if ($set) {
                $sql = array();
                $val = array();
                foreach ($set as $k => $v) {
                    $sql[] = '`' . $k . '` = ?';
                    $val[] = $v;
                }
                $val[] = $id;
                labs_q('UPDATE contactos SET ' . implode(', ', $sql) . ', actualizado = actualizado WHERE id = ?', $val);
                labs_q('INSERT INTO contacto_eventos (contacto_id, autor_id, tipo, texto, ts) VALUES (?,?,?,?,?)',
                    array($id, null, 'ia', mb_substr('Agente de mantenimiento: ' . implode('; ', $notas) . '.', 0, 2000), $ahora));
            }
        } catch (Throwable $x) {
            $res['errores']++;
        }
    }
    labs_pon_ajuste('saneo.ultimo', json_encode(array('ts' => $ahora, 'origen' => $origen) + $res));
    return $res;
}

/** Deshace un lote: solo lo que nadie ha vuelto a tocar después. */
function labs_saneo_deshacer($lote)
{
    $n = 0;
    foreach (labs_q("SELECT * FROM saneo_registro WHERE lote = ? AND deshecho = 0 ORDER BY id DESC", array($lote))->fetchAll() as $r) {
        if ($r['campo'] === 'cita') {
            labs_q("DELETE FROM citas WHERE id = ? AND estado = 'programada'", array((int) $r['despues']));
        } elseif (in_array($r['campo'], array('valor', 'proximo_paso', 'proximo_contacto', 'gestor_id'), true)) {
            $act = labs_fila('SELECT `' . $r['campo'] . '` v FROM contactos WHERE id = ?', array($r['contacto_id']));
            $igual = $act && ($r['campo'] === 'valor' ? abs((float) $act['v'] - (float) $r['despues']) < 0.01 : substr((string) $act['v'], 0, 19) === substr($r['despues'], 0, 19));
            if (!$igual) {
                continue;
            }
            $antes = $r['antes'] === '' ? ($r['campo'] === 'valor' ? 0 : ($r['campo'] === 'proximo_paso' ? '' : null)) : $r['antes'];
            labs_q('UPDATE contactos SET `' . $r['campo'] . '` = ?, actualizado = actualizado WHERE id = ?', array($antes, $r['contacto_id']));
        }
        labs_q('UPDATE saneo_registro SET deshecho = 1 WHERE id = ?', array($r['id']));
        $n++;
    }
    return $n;
}

/** Cron: una pasada por hora si está en automático. */
function labs_saneo_tick()
{
    if (!labs_tabla_existe('saneo_registro') || !labs_saneo_cfg()['automatico']) {
        return null;
    }
    $u = json_decode((string) labs_ajuste('saneo.ultimo', ''), true);
    if (is_array($u) && !empty($u['ts']) && $u['ts'] > labs_hace(3600)) {
        return null;
    }
    return labs_saneo_ejecuta('automatico');
}

function labs_saneo_permitido()
{
    labs_usuario(true);
    if (!in_array(labs_mi_rol(), array('admin', 'manager'), true)) {
        throw new ErrorApi('El mantenimiento del pipeline es para dirección y jefes de equipo.', 403, '42501');
    }
}

/* --- Rutas: /saneo/... ------------------------------------------------------------------------ */
function labs_saneo($metodo, $sub, $b)
{
    labs_saneo_permitido();
    if ($sub === '/estado' && $metodo === 'GET') {
        $lotes = labs_q("SELECT lote, MIN(origen) origen, MIN(ts) ts, COUNT(DISTINCT contacto_id) contactos, SUM(campo = 'valor') valores, SUM(campo = 'proximo_paso') pasos, SUM(campo = 'gestor_id') gestores,
                                SUM(deshecho) deshechos, COUNT(*) cambios FROM saneo_registro WHERE lote <> '' GROUP BY lote ORDER BY MIN(id) DESC LIMIT 8")->fetchAll();
        $ult = json_decode((string) labs_ajuste('saneo.ultimo', ''), true);
        return array(200, array('config' => labs_saneo_cfg(), 'diagnostico' => labs_saneo_diagnostico(), 'ultimo' => is_array($ult) ? $ult : null,
            'lotes' => $lotes, 'candidatos' => labs_saneo_candidatos(), 'admin' => labs_soy_admin()));
    }
    if ($sub === '/ejecutar' && $metodo === 'POST') {
        $r = labs_saneo_ejecuta('manual');
        labs_anota('Mantenimiento del pipeline', $r['revisados'] . ' revisados · ' . ($r['proximo_paso'] + $r['rescates']) . ' próximos pasos · ' . $r['valor'] . ' valores · ' . $r['gestor'] . ' gestores');
        return array(200, array('ok' => true, 'resultado' => $r, 'diagnostico' => labs_saneo_diagnostico()));
    }
    if ($sub === '/config' && $metodo === 'POST') {
        if (!labs_soy_admin()) {
            throw new ErrorApi('Solo la administración cambia cómo trabaja el agente.', 403, '42501');
        }
        $c = labs_saneo_cfg();
        foreach ((array) ($b['config'] ?? array()) as $k => $v) {
            if (array_key_exists($k, $c)) {
                $c[$k] = is_bool($c[$k]) ? (bool) $v : (int) $v;
            }
        }
        $c['por_gestor_dia'] = max(1, min(22, $c['por_gestor_dia']));
        $c['dias_muerto'] = max(14, min(365, $c['dias_muerto']));
        labs_pon_ajuste('saneo.config', json_encode($c));
        return array(200, array('ok' => true, 'config' => $c));
    }
    if ($sub === '/deshacer' && $metodo === 'POST') {
        $lote = (string) ($b['lote'] ?? '');
        if (!preg_match('/^[0-9a-f]{12,20}$/', $lote)) {
            throw new ErrorApi('Lote no válido.', 400, 'SANEO');
        }
        $n = labs_saneo_deshacer($lote);
        labs_anota('Mantenimiento del pipeline deshecho', 'Lote ' . $lote . ' · ' . $n . ' cambios');
        return array(200, array('ok' => true, 'deshechos' => $n, 'diagnostico' => labs_saneo_diagnostico()));
    }
    if (preg_match('#^/candidato/(\d+)$#', $sub, $m) && $metodo === 'POST') {
        $id = (int) $m[1];
        $r = labs_fila("SELECT id FROM saneo_registro WHERE contacto_id = ? AND campo = 'candidato_perdido' AND deshecho = 0", array($id));
        if (!$r) {
            throw new ErrorApi('Ese contacto no está propuesto como perdido.', 404, 'SANEO');
        }
        if (($b['accion'] ?? '') === 'perder') {
            $mot = trim(mb_substr((string) ($b['motivo'] ?? ''), 0, 200));
            if ($mot === '') {
                throw new ErrorApi('Escribe el motivo de la pérdida.', 400, 'SANEO');
            }
            $def = labs_tabla('contactos');
            labs_actualiza_fila('contactos', $def, labs_fila_php($def, labs_fila('SELECT * FROM contactos WHERE id = ?', array($id))), array('fase' => 'perdido', 'motivo_perdida' => $mot), true);
            labs_evento_contacto($id, 'nota', 'Marcado como perdido (propuesta del agente de mantenimiento): ' . $mot);
        } elseif (($b['accion'] ?? '') === 'mantener') {
            labs_saneo_anota('', $id, 'mantener', '', 'Una persona decide mantenerlo', 'persona');
            labs_evento_contacto($id, 'nota', 'Se mantiene abierto (revisado tras la propuesta del agente de mantenimiento).');
        } else {
            throw new ErrorApi('Acción no válida.', 400, 'SANEO');
        }
        labs_q("UPDATE saneo_registro SET deshecho = 1 WHERE id = ?", array($r['id']));
        return array(200, array('ok' => true, 'diagnostico' => labs_saneo_diagnostico()));
    }
    throw new ErrorApi('Ruta desconocida.', 404, 'PGRST116');
}
