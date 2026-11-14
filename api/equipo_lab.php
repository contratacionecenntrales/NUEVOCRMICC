<?php
/**
 * Zona de agentes · la empresa que aprende.
 *
 * - Laboratorio: experimentos A/B (ángulo del mensaje) y de nicho (sector o zona nuevos),
 *   evaluados con una prueba de dos proporciones.
 * - Cerebro: aprendizajes con evidencia y reglas (por ejemplo, el ángulo ganador de un sector,
 *   que el Motor aplica en adelante).
 * - Calidad: auditoría automática, hallazgos con responsable y puntuación de cada agente.
 * - Embudo multicanal: correo → teléfono → visita presencial (rutas por localidad).
 * - Ritmo: embudo inverso desde la facturación objetivo hasta la actividad semanal necesaria.
 */
defined('LABS') || exit;

/* --- Catálogo de herramientas (las de equipo.php + estas) ---------------------------------------- */
function labs_equipo_todas()
{
    static $t = null;
    if ($t !== null) {
        return $t;
    }
    $txt = function ($d, $max = 600) { return array('type' => 'string', 'description' => $d, 'maxLength' => $max); };
    $todos = array_keys(labs_equipo_roles());
    $angs = array_keys(labs_motor_angulos());
    $t = labs_equipo_herramientas() + labs_cierre_herramientas() + array(
        'ver_ritmo' => array(array('ceo', 'marketing', 'comercial', 'analista', 'coo'), 'lectura', 'Embudo inverso: cuántos clientes, propuestas, demos, interesados y empresas contactadas hacen falta para el objetivo del mes, con las tasas reales, y si la capacidad actual llega.', array(), array()),
        'ver_segmentos' => array(array('ceo', 'marketing', 'prospeccion', 'copy', 'analista', 'innovacion', 'qa'), 'lectura', 'Qué funciona: empresas, contactadas, respuestas positivas, bajas y clientes por sector, por localidad y por ángulo de mensaje.', array(), array()),
        'ver_experimentos' => array(array('ceo', 'marketing', 'copy', 'analista', 'innovacion', 'qa'), 'lectura', 'Experimentos del Laboratorio con sus variantes, muestras, tasas y p-valor.', array(), array()),
        'proponer_experimento' => array(array('innovacion', 'copy', 'analista', 'marketing'), 'bajo', 'Registra un experimento. Ángulo: compara dos ángulos de mensaje en un sector. Nicho: prueba un sector o zona nuevos con una extracción pequeña.',
            array('titulo' => $txt('Título corto', 200), 'hipotesis' => $txt('Qué crees que pasará y por qué', 800), 'palanca' => array('type' => 'string', 'enum' => array('angulo', 'nicho')),
                'sector' => $txt('Sector', 60), 'angulo_a' => array('type' => 'string', 'enum' => $angs), 'angulo_b' => array('type' => 'string', 'enum' => $angs),
                'localidades' => array('type' => 'array', 'items' => array('type' => 'string', 'maxLength' => 80), 'maxItems' => 10, 'description' => 'Solo nicho: dónde buscar'),
                'min_muestra' => array('type' => 'integer', 'minimum' => 10, 'maximum' => 300)), array('titulo', 'hipotesis', 'palanca', 'sector')),
        'lanzar_experimento' => array(array('innovacion', 'marketing'), 'medio', 'Pone en marcha un experimento propuesto: reparte al azar las empresas verificadas del sector entre dos campañas (A/B) o lanza la extracción del nicho.',
            array('experimento_id' => array('type' => 'integer')), array('experimento_id')),
        'evaluar_experimento' => array(array('analista', 'innovacion'), 'bajo', 'Evalúa un experimento en curso con la prueba de dos proporciones. Si hay conclusión, la cierra y la guarda en el cerebro de la empresa.',
            array('experimento_id' => array('type' => 'integer')), array('experimento_id')),
        'fijar_angulo_ganador' => array(array('copy', 'analista', 'marketing'), 'medio', 'Convierte el ángulo ganador de un experimento en el estándar de su sector: el Motor lo usará en todas las campañas nuevas de ese sector.',
            array('experimento_id' => array('type' => 'integer')), array('experimento_id')),
        'guardar_aprendizaje' => array($todos, 'bajo', 'Guarda en el cerebro de la empresa algo aprendido con datos (con su evidencia). Lo leerá todo el equipo.',
            array('titulo' => $txt('El aprendizaje en una frase', 200), 'texto' => $txt('Detalle', 1500), 'evidencia' => $txt('Datos que lo demuestran', 800),
                'confianza' => array('type' => 'integer', 'minimum' => 10, 'maximum' => 95)), array('titulo', 'evidencia')),
        'auditar' => array(array('qa', 'ceo', 'coo'), 'lectura', 'Lanza la auditoría: errores de agentes, propuestas rechazadas, campañas con bajas, oportunidades sin seguimiento, cobros vencidos, procesos atascados.', array(), array()),
        'registrar_hallazgos' => array(array('qa'), 'bajo', 'Registra como hallazgos los problemas de la auditoría (sin duplicar) y encarga cada uno a su responsable. Cierra solos los que ya no se dan.', array(), array()),
        'pausar_campana' => array(array('qa', 'marketing', 'cto'), 'medio', 'Pausa una campaña concreta (por ejemplo, por exceso de bajas o rebotes).',
            array('campana_id' => array('type' => 'integer'), 'motivo' => $txt('Por qué', 300)), array('campana_id', 'motivo')),
        'revisar_mi_equipo' => array(array('ceo', 'marketing', 'comercial', 'qa'), 'lectura', 'Puntuación de los agentes a tu cargo: acciones, errores, propuestas aprobadas y rechazadas, tareas y hallazgos abiertos, y su último informe.', array(), array()),
        'proponer_cambio_instrucciones' => array(array('ceo', 'marketing', 'comercial', 'qa'), 'alto', 'Propone nuevas instrucciones permanentes para un agente a tu cargo (para corregir cómo trabaja).',
            array('agente' => array('type' => 'string', 'enum' => $todos), 'instrucciones' => $txt('Las instrucciones completas', 2000), 'motivo' => $txt('Qué problema corrige', 500)), array('agente', 'instrucciones', 'motivo')),
        'ver_ramas' => array(array('coo', 'campo', 'ceo', 'innovacion', 'sdr'), 'lectura', 'Embudo multicanal: empresas que han agotado los correos sin respuesta (candidatas a teléfono), contactos sin localizar por teléfono (candidatos a visita) agrupados por localidad, y resultados de cada rama.', array(), array()),
        'escalar_lead' => array(array('coo'), 'medio', 'Pasa a otra rama a una empresa que no respondió a los 3 correos: «telefono» (llamada en la agenda de un gestor) o «visita» (candidata a ruta presencial).',
            array('lead_id' => array('type' => 'integer'), 'rama' => array('type' => 'string', 'enum' => array('telefono', 'visita'))), array('lead_id', 'rama')),
        'planificar_ruta_visitas' => array(array('campo', 'coo'), 'medio', 'Planifica una ruta de visitas presenciales (2 a 6 empresas de la misma localidad) para un gestor, en huecos libres de un mismo día, con briefing de cada empresa.',
            array('contacto_ids' => array('type' => 'array', 'items' => array('type' => 'integer'), 'minItems' => 1, 'maxItems' => 6), 'gestor_id' => array('type' => 'string'),
                'dias' => array('type' => 'integer', 'minimum' => 1, 'maximum' => 15)), array('contacto_ids')),
    );
    return $t;
}

/* --- Estadística ------------------------------------------------------------------------------------ */
function labs_equipo_phi($x)
{
    // Distribución normal acumulada (aproximación de Abramowitz y Stegun, error < 1e-7).
    $t = 1 / (1 + 0.2316419 * abs($x));
    $d = 0.3989422804014327 * exp(-$x * $x / 2);
    $p = $d * $t * (0.319381530 + $t * (-0.356563782 + $t * (1.781477937 + $t * (-1.821255978 + $t * 1.330274429))));
    return $x >= 0 ? 1 - $p : $p;
}

/** Prueba de dos proporciones: devuelve [z, p-valor bilateral]. */
function labs_equipo_ztest($k1, $n1, $k2, $n2)
{
    if ($n1 < 1 || $n2 < 1) {
        return array(0, 1);
    }
    $p = ($k1 + $k2) / ($n1 + $n2);
    $se = sqrt($p * (1 - $p) * (1 / $n1 + 1 / $n2));
    if ($se <= 0) {
        return array(0, 1);
    }
    $z = ($k1 / $n1 - $k2 / $n2) / $se;
    return array(round($z, 3), round(2 * (1 - labs_equipo_phi(abs($z))), 4));
}

function labs_equipo_pct($k, $n)
{
    return $n ? round($k / $n * 100, 1) : 0;
}

/* --- Métricas de campaña y segmentos ------------------------------------------------------------------ */
function labs_equipo_stats_campana($cid)
{
    $q = function ($sql) use ($cid) { return (int) labs_q($sql, array($cid))->fetchColumn(); };
    $pos = "'" . implode("','", labs_motor_positivas()) . "'";
    return array(
        'empresas' => $q('SELECT COUNT(*) FROM motor_leads WHERE campana_id = ?'),
        'n' => $q("SELECT COUNT(DISTINCT lead_id) FROM motor_mensajes WHERE campana_id = ? AND sentido = 'salida' AND estado = 'enviado'"),
        'respuestas' => $q("SELECT COUNT(DISTINCT lead_id) FROM motor_mensajes WHERE campana_id = ? AND sentido = 'entrada' AND intencion <> 'fuera_oficina'"),
        'k' => $q("SELECT COUNT(DISTINCT lead_id) FROM motor_mensajes WHERE campana_id = ? AND sentido = 'entrada' AND intencion IN ($pos)"),
        'bajas' => $q("SELECT COUNT(*) FROM motor_leads WHERE campana_id = ? AND estado = 'baja'"),
        'pendientes' => $q("SELECT COUNT(*) FROM motor_mensajes WHERE campana_id = ? AND estado = 'pendiente'"),
    );
}

function labs_equipo_segmentos()
{
    if (!labs_tabla_existe('motor_leads')) {
        return array('por_sector' => array(), 'por_localidad' => array(), 'por_angulo' => array());
    }
    $pos = "'" . implode("','", labs_motor_positivas()) . "'";
    $base = "COUNT(*) empresas,
        SUM(EXISTS (SELECT 1 FROM motor_mensajes m WHERE m.lead_id = l.id AND m.sentido = 'salida' AND m.estado = 'enviado')) contactadas,
        SUM(EXISTS (SELECT 1 FROM motor_mensajes m WHERE m.lead_id = l.id AND m.sentido = 'entrada' AND m.intencion IN ($pos))) positivas,
        SUM(l.estado = 'baja') bajas,
        SUM(l.contacto_id IS NOT NULL AND EXISTS (SELECT 1 FROM presupuestos p WHERE p.contacto_id = l.contacto_id AND p.estado = 'Aceptado')) clientes";
    $fmt = function ($filas, $k) {
        $o = array();
        foreach ($filas as $f) {
            $o[] = array($k => $f['g'] !== '' && $f['g'] !== null ? $f['g'] : '(sin dato)', 'empresas' => (int) $f['empresas'], 'contactadas' => (int) $f['contactadas'],
                'positivas' => (int) $f['positivas'], 'tasa_positiva' => labs_equipo_pct($f['positivas'], $f['contactadas']), 'bajas' => (int) $f['bajas'],
                'tasa_bajas' => labs_equipo_pct($f['bajas'], $f['contactadas']), 'clientes' => (int) $f['clientes']);
        }
        return $o;
    };
    return array(
        'por_sector' => $fmt(labs_q("SELECT LOWER(l.sector) g, $base FROM motor_leads l GROUP BY LOWER(l.sector) ORDER BY contactadas DESC, empresas DESC LIMIT 20")->fetchAll(), 'sector'),
        'por_localidad' => $fmt(labs_q("SELECT l.localidad g, $base FROM motor_leads l GROUP BY l.localidad ORDER BY contactadas DESC, empresas DESC LIMIT 20")->fetchAll(), 'localidad'),
        'por_angulo' => $fmt(labs_q("SELECT COALESCE(NULLIF(c.angulo, ''), 'normativa') g, $base FROM motor_leads l JOIN motor_campanas c ON c.id = l.campana_id GROUP BY g ORDER BY contactadas DESC")->fetchAll(), 'angulo'),
    );
}

/* --- Ritmo: embudo inverso ------------------------------------------------------------------------------ */
function labs_equipo_ritmo()
{
    $g = labs_equipo_cfg()['general'];
    $mad = labs_equipo_madrid();
    $ini = labs_equipo_utc((clone $mad)->modify('first day of this month')->setTime(0, 0));
    $hace = gmdate('Y-m-d H:i:s', time() - 90 * 86400);
    $n = function ($sql, $p = array()) { return (float) labs_q($sql, $p)->fetchColumn(); };
    $ticket = $n("SELECT AVG(base) FROM presupuestos WHERE estado = 'Aceptado' AND creado >= ?", array($hace)) ?: 2800;
    $hecho = $n("SELECT COALESCE(SUM(base), 0) FROM presupuestos WHERE estado = 'Aceptado' AND creado >= ?", array($ini));
    $objetivo = (float) $g['objetivo_facturacion'];
    $falta = max(0, $objetivo - $hecho);
    // Tasas observadas en 90 días, suavizadas hacia valores de referencia del sector (sin datos no se inventa nada).
    $motor = labs_tabla_existe('motor_leads');
    $pos = $motor ? "'" . implode("','", labs_motor_positivas()) . "'" : "''";
    $contactadas = $motor ? $n("SELECT COUNT(DISTINCT lead_id) FROM motor_mensajes WHERE sentido = 'salida' AND estado = 'enviado' AND creado >= ?", array($hace)) : 0;
    $interesadas = $motor ? $n("SELECT COUNT(DISTINCT lead_id) FROM motor_mensajes WHERE sentido = 'entrada' AND intencion IN ($pos) AND creado >= ?", array($hace)) : 0;
    $demos = $n("SELECT COUNT(DISTINCT contacto_id) FROM citas WHERE tipo IN ('demo', 'visita') AND estado = 'realizada' AND inicio >= ?", array($hace));
    $propuestas = $n('SELECT COUNT(DISTINCT contacto_id) FROM presupuestos WHERE contacto_id IS NOT NULL AND creado >= ?', array($hace));
    $ganados = $n("SELECT COUNT(DISTINCT contacto_id) FROM presupuestos WHERE estado = 'Aceptado' AND contacto_id IS NOT NULL AND creado >= ?", array($hace));
    $suav = function ($k, $nn, $ref) { return ($k + $ref * 20) / ($nn + 20); };
    $t = array('contacto_a_interes' => $suav($interesadas, $contactadas, 0.03), 'interes_a_demo' => $suav($demos, max($demos, $interesadas), 0.5),
        'demo_a_propuesta' => $suav($propuestas, max($propuestas, $demos), 0.6), 'propuesta_a_cliente' => $suav($ganados, max($ganados, $propuestas), 0.35));
    $clientes = (int) ceil($falta / max(1, $ticket));
    $nec = array('clientes' => $clientes);
    $nec['propuestas'] = (int) ceil($clientes / $t['propuesta_a_cliente']);
    $nec['demos'] = (int) ceil($nec['propuestas'] / $t['demo_a_propuesta']);
    $nec['interesados'] = (int) ceil($nec['demos'] / $t['interes_a_demo']);
    $nec['empresas_a_contactar'] = (int) ceil($nec['interesados'] / $t['contacto_a_interes']);
    $fin = (clone $mad)->modify('last day of this month')->setTime(23, 59);
    $lab = 0;
    for ($d = clone $mad; $d <= $fin; $d->modify('+1 day')) {
        $lab += (int) $d->format('N') < 6 ? 1 : 0;
    }
    $lab = max(1, $lab);
    $cap = $motor ? (int) labs_motor_cfg()['envio']['limite_diario'] * $lab : 0;
    $en_pipe = array('propuestas' => (int) $n("SELECT COUNT(*) FROM contactos WHERE activo = 1 AND fase IN ('propuesta', 'negociacion')"),
        'demos' => (int) $n("SELECT COUNT(*) FROM contactos WHERE activo = 1 AND fase = 'demo'"));
    $diag = $falta <= 0 ? 'Objetivo del mes cumplido.' : ($cap < $nec['empresas_a_contactar']
        ? 'Con el correo no llega: hacen falta ' . number_format($nec['empresas_a_contactar'], 0, ',', '.') . ' empresas contactadas y la capacidad de envío es de ' . number_format($cap, 0, ',', '.') .
            '. Hay que reforzar las ramas de teléfono y visita (convierten más por contacto) y priorizar los segmentos con mejor tasa.'
        : 'La capacidad de envío llega; el foco es mantener el ritmo semanal y subir la tasa de respuesta con experimentos.');
    return array('objetivo' => $objetivo, 'facturado_mes' => $hecho, 'falta' => $falta, 'ticket_medio' => round($ticket), 'tasas' => array_map(function ($x) { return round($x * 100, 1); }, $t),
        'necesario' => $nec, 'en_pipeline' => $en_pipe, 'dias_laborables_restantes' => $lab, 'por_semana' => (int) ceil($nec['empresas_a_contactar'] / max(1, $lab / 5)),
        'capacidad_envio_mes' => $cap, 'diagnostico' => $diag, 'datos_reales' => array('contactadas_90d' => (int) $contactadas, 'interesadas_90d' => (int) $interesadas, 'propuestas_90d' => (int) $propuestas, 'ganados_90d' => (int) $ganados));
}

/* --- Laboratorio ------------------------------------------------------------------------------------------ */
function labs_equipo_exp($id)
{
    $e = labs_fila('SELECT * FROM equipo_experimentos WHERE id = ?', array((int) $id));
    if ($e) {
        $e['variantes'] = json_decode((string) $e['variantes'], true) ?: array();
        $e['resultado'] = json_decode((string) $e['resultado'], true) ?: null;
    }
    return $e;
}

/** Experimento con las cifras actuales de cada variante y la prueba estadística. */
function labs_equipo_exp_vivo($e)
{
    $v = array();
    foreach ($e['variantes'] as $x) {
        $s = !empty($x['campana_id']) ? labs_equipo_stats_campana($x['campana_id']) : array('empresas' => 0, 'n' => 0, 'respuestas' => 0, 'k' => 0, 'bajas' => 0, 'pendientes' => 0);
        $x['stats'] = $s + array('tasa' => labs_equipo_pct($s['k'], $s['n']), 'tasa_bajas' => labs_equipo_pct($s['bajas'], $s['n']));
        $v[] = $x;
    }
    if ($e['palanca'] === 'nicho' && $v) {
        // El nicho se compara con el resto de campañas (la referencia).
        $ids = array_filter(array_map(function ($x) { return (int) ($x['campana_id'] ?? 0); }, $v));
        $pos = "'" . implode("','", labs_motor_positivas()) . "'";
        $no = $ids ? ' AND campana_id NOT IN (' . implode(',', $ids) . ')' : '';
        $n = (int) labs_q("SELECT COUNT(DISTINCT lead_id) FROM motor_mensajes WHERE sentido = 'salida' AND estado = 'enviado' AND campana_id IS NOT NULL$no")->fetchColumn();
        $k = (int) labs_q("SELECT COUNT(DISTINCT lead_id) FROM motor_mensajes WHERE sentido = 'entrada' AND intencion IN ($pos) AND campana_id IS NOT NULL$no")->fetchColumn();
        $v[] = array('clave' => 'REF', 'descripcion' => 'Referencia: el resto de campañas', 'stats' => array('n' => $n, 'k' => $k, 'tasa' => labs_equipo_pct($k, $n), 'bajas' => 0, 'tasa_bajas' => 0, 'empresas' => 0, 'respuestas' => 0, 'pendientes' => 0));
    }
    if (count($v) >= 2) {
        list($z, $p) = labs_equipo_ztest($v[0]['stats']['k'], $v[0]['stats']['n'], $v[1]['stats']['k'], $v[1]['stats']['n']);
        $e['prueba'] = array('z' => $z, 'p' => $p);
    }
    $e['vivo'] = $v;
    return $e;
}

function labs_equipo_h_ver_experimentos($e, $rol)
{
    $r = array();
    foreach (labs_q("SELECT id FROM equipo_experimentos ORDER BY FIELD(estado, 'en_curso', 'propuesto', 'concluido', 'detenido'), id DESC LIMIT 15")->fetchAll(PDO::FETCH_COLUMN) as $id) {
        $x = labs_equipo_exp_vivo(labs_equipo_exp($id));
        $r[] = array('id' => (int) $x['id'], 'titulo' => $x['titulo'], 'palanca' => $x['palanca'], 'sector' => $x['sector'], 'estado' => $x['estado'], 'ganador' => $x['ganador'],
            'min_muestra' => (int) $x['min_muestra'], 'variantes' => array_map(function ($v) { return array('clave' => $v['clave'], 'que' => $v['descripcion'] ?? '', 'contactadas' => $v['stats']['n'],
                'positivas' => $v['stats']['k'], 'tasa' => $v['stats']['tasa'], 'bajas' => $v['stats']['bajas']); }, $x['vivo']), 'p_valor' => $x['prueba']['p'] ?? null);
    }
    return array('experimentos' => $r);
}

function labs_equipo_h_proponer_experimento($e, $rol)
{
    $pal = in_array($e['palanca'] ?? '', array('angulo', 'nicho'), true) ? $e['palanca'] : 'angulo';
    $sector = trim(mb_substr((string) ($e['sector'] ?? ''), 0, 60));
    $angs = labs_motor_angulos();
    if ($sector === '') {
        throw new Exception('Indica el sector del experimento.');
    }
    if ($pal === 'angulo') {
        $a = (string) ($e['angulo_a'] ?? '');
        $b = (string) ($e['angulo_b'] ?? '');
        if (!isset($angs[$a]) || !isset($angs[$b]) || $a === $b) {
            throw new Exception('Elige dos ángulos distintos del catálogo: ' . implode(', ', array_keys($angs)) . '.');
        }
        $var = array(array('clave' => 'A', 'angulo' => $a, 'descripcion' => 'Ángulo «' . $angs[$a][0] . '»'), array('clave' => 'B', 'angulo' => $b, 'descripcion' => 'Ángulo «' . $angs[$b][0] . '»'));
    } else {
        $locs = array_values(array_filter(array_map(function ($x) { return mb_substr(trim((string) $x), 0, 80); }, (array) ($e['localidades'] ?? array()))));
        if (!$locs) {
            $locs = array_slice(array_values(array_filter(array_map('trim', explode(',', labs_equipo_cfg()['general']['zonas'])))), 0, 5);
        }
        $var = array(array('clave' => 'A', 'angulo' => labs_equipo_angulo_sector($sector) ?: 'normativa', 'localidades' => $locs,
            'descripcion' => 'Nicho «' . $sector . '» en ' . implode(', ', array_slice($locs, 0, 4))));
    }
    if (labs_fila("SELECT 1 FROM equipo_experimentos WHERE estado IN ('propuesto', 'en_curso') AND palanca = ? AND LOWER(sector) = LOWER(?)", array($pal, $sector))) {
        throw new Exception('Ya hay un experimento abierto de ese tipo para «' . $sector . '».');
    }
    labs_q('INSERT INTO equipo_experimentos (titulo, hipotesis, palanca, sector, variantes, metrica, min_muestra, estado, creado_por, creado) VALUES (?,?,?,?,?,?,?,?,?,?)',
        array(mb_substr(trim((string) ($e['titulo'] ?? '')) ?: 'Experimento ' . $sector, 0, 200), mb_substr((string) ($e['hipotesis'] ?? ''), 0, 800), $pal, $sector,
            json_encode($var, JSON_UNESCAPED_UNICODE), 'positivas', max(10, min(300, (int) ($e['min_muestra'] ?? 30))), 'propuesto', $rol, labs_ahora()));
    $id = (int) labs_db()->lastInsertId();
    return array('experimento_id' => $id, 'resumen' => 'Experimento #' . $id . ' propuesto: ' . ($pal === 'angulo' ? $var[0]['descripcion'] . ' frente a ' . $var[1]['descripcion'] . ' en ' . $sector : $var[0]['descripcion']));
}

function labs_equipo_h_lanzar_experimento($e, $rol)
{
    labs_equipo_motor_disponible();
    $x = labs_equipo_exp($e['experimento_id'] ?? 0);
    if (!$x || $x['estado'] !== 'propuesto') {
        throw new Exception('Solo se lanza un experimento propuesto.');
    }
    $creador = labs_uid() ?: (labs_q("SELECT id FROM perfiles WHERE estado = 'Activo' AND rol = 'admin' ORDER BY raiz DESC LIMIT 1")->fetchColumn() ?: null);
    $ccaa = labs_equipo_cfg()['general']['ccaa'];
    $nueva = function ($nombre, $v) use ($x, $creador, $ccaa) {
        labs_q('INSERT INTO motor_campanas (nombre, sector, ccaa, comarca, localidades, estado, modo, creado_por, creado, actualizado, angulo, experimento_id, variante) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
            array(mb_substr($nombre, 0, 120), $x['sector'], $ccaa, '', json_encode($v['localidades'] ?? array(), JSON_UNESCAPED_UNICODE), 'activa', 'aprobacion', $creador, labs_ahora(), labs_ahora(),
                $v['angulo'] ?? '', $x['id'], $v['clave']));
        return (int) labs_db()->lastInsertId();
    };
    $var = $x['variantes'];
    if ($x['palanca'] === 'angulo') {
        $ids = labs_q("SELECT id FROM motor_leads WHERE estado = 'listo' AND campana_id IS NULL AND LOWER(sector) LIKE ? ORDER BY id LIMIT 400", array('%' . mb_strtolower($x['sector']) . '%'))->fetchAll(PDO::FETCH_COLUMN);
        if (count($ids) < 10) {
            throw new Exception('Hacen falta al menos 10 empresas verificadas de «' . $x['sector'] . '» fuera de campaña (hay ' . count($ids) . '). Pide a Prospección que busque más.');
        }
        shuffle($ids);   // reparto al azar: la única diferencia entre A y B es el ángulo
        $mitad = (int) ceil(count($ids) / 2);
        foreach ($var as $i => $v) {
            $cid = $nueva('Exp #' . $x['id'] . ' · ' . $v['clave'] . ' · ' . $x['sector'] . ' · ' . labs_motor_angulos()[$v['angulo']][0], $v);
            $var[$i]['campana_id'] = $cid;
            $parte = $i === 0 ? array_slice($ids, 0, $mitad) : array_slice($ids, $mitad);
            labs_motor_mete_en_campana(array_map('intval', $parte), $cid);
            $var[$i]['empresas'] = count($parte);
        }
        $res = 'Experimento #' . $x['id'] . ' en marcha: ' . count($ids) . ' empresas de «' . $x['sector'] . '» repartidas al azar entre A y B';
    } else {
        if (labs_motor_secreto('places_key') === null) {
            throw new Exception('Falta la clave de Google Places para buscar el nicho.');
        }
        $cid = $nueva('Exp #' . $x['id'] . ' · nicho · ' . $x['sector'], $var[0]);
        $var[0]['campana_id'] = $cid;
        labs_motor_tarea_crea(array('sectores' => array($x['sector']), 'localidades' => $var[0]['localidades'] ?: array('Gijón'), 'ccaa' => $ccaa, 'fuentes' => array('places', 'web'),
            'max' => 40, 'campana_id' => $cid), $creador);
        $res = 'Experimento #' . $x['id'] . ' en marcha: búsqueda de «' . $x['sector'] . '» en ' . implode(', ', array_slice($var[0]['localidades'], 0, 4)) . ' con su propia campaña';
    }
    labs_q("UPDATE equipo_experimentos SET estado = 'en_curso', variantes = ?, lanzado = ? WHERE id = ?", array(json_encode($var, JSON_UNESCAPED_UNICODE), labs_ahora(), $x['id']));
    labs_motor_log('campana', $res . ' (Laboratorio de la zona de agentes).');
    return array('resumen' => $res);
}

/** Decide si un experimento tiene conclusión; si la tiene, lo cierra y lo guarda en el cerebro. */
function labs_equipo_h_evaluar_experimento($e, $rol)
{
    $x = labs_equipo_exp($e['experimento_id'] ?? 0);
    if (!$x || $x['estado'] !== 'en_curso') {
        throw new Exception('Solo se evalúa un experimento en curso.');
    }
    $x = labs_equipo_exp_vivo($x);
    $v = $x['vivo'];
    $min = (int) $x['min_muestra'];
    $p = $x['prueba']['p'] ?? 1;
    $a = $v[0]['stats'];
    $b = $v[1]['stats'] ?? null;
    $estado = 'en_curso';
    $ganador = '';
    $concl = '';
    foreach ($v as $vv) {
        if ($vv['clave'] !== 'REF' && $vv['stats']['n'] >= 20 && $vv['stats']['tasa_bajas'] >= 5) {
            $estado = 'detenido';
            $concl = 'Detenido: la variante ' . $vv['clave'] . ' tiene un ' . $vv['stats']['tasa_bajas'] . ' % de bajas (riesgo para la reputación del dominio).';
        }
    }
    if ($estado === 'en_curso' && $b && $a['n'] >= $min && $b['n'] >= $min) {
        if ($p < 0.1) {
            $gana = $a['tasa'] >= $b['tasa'] ? 0 : 1;
            $estado = 'concluido';
            $ganador = $v[$gana]['clave'];
            $concl = 'Gana ' . $v[$gana]['descripcion'] . ': ' . $v[$gana]['stats']['tasa'] . ' % de respuestas positivas frente a ' . $v[1 - $gana]['stats']['tasa'] .
                ' % (n = ' . $a['n'] . ' y ' . $b['n'] . ', p = ' . $p . ').';
        } elseif ($a['n'] >= 3 * $min && $b['n'] >= 3 * $min) {
            $estado = 'concluido';
            $concl = 'Sin diferencia clara entre variantes tras ' . ($a['n'] + $b['n']) . ' empresas contactadas (p = ' . $p . '). Se mantiene el estándar actual.';
        }
    }
    $situacion = array('variantes' => array_map(function ($vv) { return array('clave' => $vv['clave'], 'contactadas' => $vv['stats']['n'], 'positivas' => $vv['stats']['k'], 'tasa' => $vv['stats']['tasa']); }, $v),
        'p_valor' => $p, 'muestra_minima' => $min);
    if ($estado === 'en_curso') {
        return array('resumen' => 'Experimento #' . $x['id'] . ': aún sin conclusión (A ' . $a['n'] . '/' . $min . ($b ? ', ' . $v[1]['clave'] . ' ' . $b['n'] . '/' . $min : '') . ' contactadas).', 'situacion' => $situacion);
    }
    labs_q('UPDATE equipo_experimentos SET estado = ?, ganador = ?, resultado = ?, concluido = ? WHERE id = ?',
        array($estado, $ganador, json_encode($situacion + array('conclusion' => $concl), JSON_UNESCAPED_UNICODE), labs_ahora(), $x['id']));
    foreach ($x['variantes'] as $vv) {
        if (!empty($vv['campana_id']) && $estado === 'detenido') {
            labs_q("UPDATE motor_campanas SET estado = 'pausada', actualizado = ? WHERE id = ?", array(labs_ahora(), $vv['campana_id']));
            labs_q("UPDATE motor_mensajes SET estado = 'pendiente' WHERE campana_id = ? AND estado = 'aprobado'", array($vv['campana_id']));
        }
    }
    labs_equipo_memoriza(array('area' => 'marketing', 'tipo' => $estado === 'detenido' ? 'aviso' : 'aprendizaje', 'clave' => 'exp:' . $x['id'],
        'titulo' => mb_substr($x['titulo'] . ' · ' . ($ganador ? 'gana ' . $ganador : ($estado === 'detenido' ? 'detenido' : 'sin diferencia')), 0, 200),
        'texto' => $concl . ($x['hipotesis'] ? "\nHipótesis: " . $x['hipotesis'] : ''), 'evidencia' => json_encode($situacion, JSON_UNESCAPED_UNICODE),
        'confianza' => $ganador ? (int) round((1 - $p) * 100) : 60, 'origen' => 'experimento:' . $x['id']));
    return array('resumen' => 'Experimento #' . $x['id'] . ' ' . ($estado === 'detenido' ? 'detenido' : 'concluido') . ': ' . $concl, 'ganador' => $ganador);
}

function labs_equipo_h_fijar_angulo_ganador($e, $rol)
{
    $x = labs_equipo_exp($e['experimento_id'] ?? 0);
    if (!$x || $x['estado'] !== 'concluido' || $x['ganador'] === '' || $x['palanca'] !== 'angulo') {
        throw new Exception('Solo se fija el ángulo de un experimento de ángulo con ganador.');
    }
    $ang = '';
    foreach ($x['variantes'] as $v) {
        if ($v['clave'] === $x['ganador']) {
            $ang = $v['angulo'];
        }
    }
    $clave = 'angulo:' . mb_strtolower(trim($x['sector']));
    labs_q("UPDATE equipo_memoria SET activo = 0 WHERE tipo = 'regla' AND clave = ?", array($clave));
    labs_equipo_memoriza(array('area' => 'marketing', 'tipo' => 'regla', 'clave' => $clave, 'titulo' => 'Estándar para ' . $x['sector'] . ': ángulo «' . labs_motor_angulos()[$ang][0] . '»',
        'texto' => $ang, 'evidencia' => 'Experimento #' . $x['id'] . ': ' . ($x['resultado']['conclusion'] ?? ''), 'confianza' => 80, 'origen' => 'experimento:' . $x['id']));
    return array('resumen' => 'Desde ahora, los correos de «' . $x['sector'] . '» usan el ángulo «' . labs_motor_angulos()[$ang][0] . '»');
}

/** Regla aprendida: el ángulo estándar para el sector de una empresa (o null). */
function labs_equipo_angulo_sector($sector)
{
    static $reglas = null;
    if ($reglas === null) {
        $reglas = labs_tabla_existe('equipo_memoria') ? labs_q("SELECT clave, texto FROM equipo_memoria WHERE tipo = 'regla' AND activo = 1 AND clave LIKE 'angulo:%'")->fetchAll() : array();
    }
    $s = mb_strtolower((string) $sector);
    foreach ($reglas as $r) {
        $k = substr($r['clave'], 7);
        if ($k !== '' && $s !== '' && (mb_strpos($s, $k) !== false || mb_strpos($k, $s) !== false) && isset(labs_motor_angulos()[$r['texto']])) {
            return $r['texto'];
        }
    }
    return null;
}

/* --- Cerebro ----------------------------------------------------------------------------------------------- */
function labs_equipo_memoriza($m)
{
    labs_q('INSERT INTO equipo_memoria (area, tipo, clave, titulo, texto, evidencia, confianza, origen, activo, creado) VALUES (?,?,?,?,?,?,?,?,1,?)',
        array(mb_substr((string) ($m['area'] ?? 'general'), 0, 20), mb_substr((string) ($m['tipo'] ?? 'aprendizaje'), 0, 12), mb_substr((string) ($m['clave'] ?? ''), 0, 120),
            mb_substr((string) $m['titulo'], 0, 200), mb_substr((string) ($m['texto'] ?? ''), 0, 4000), mb_substr((string) ($m['evidencia'] ?? ''), 0, 4000),
            max(0, min(100, (int) ($m['confianza'] ?? 50))), mb_substr((string) ($m['origen'] ?? ''), 0, 40), labs_ahora()));
    return (int) labs_db()->lastInsertId();
}

function labs_equipo_h_guardar_aprendizaje($e, $rol)
{
    $t = trim((string) ($e['titulo'] ?? ''));
    if (mb_strlen($t) < 6 || trim((string) ($e['evidencia'] ?? '')) === '') {
        throw new Exception('Un aprendizaje necesita una frase clara y los datos que lo demuestran.');
    }
    if (labs_fila('SELECT 1 FROM equipo_memoria WHERE activo = 1 AND titulo = ?', array(mb_substr($t, 0, 200)))) {
        return array('resumen' => 'Ese aprendizaje ya estaba en el cerebro.', 'repetida' => true);
    }
    $id = labs_equipo_memoriza(array('area' => labs_equipo_roles()[$rol]['dep'], 'tipo' => 'aprendizaje', 'titulo' => $t, 'texto' => $e['texto'] ?? '', 'evidencia' => $e['evidencia'],
        'confianza' => (int) ($e['confianza'] ?? 60), 'origen' => 'agente:' . $rol));
    return array('memoria_id' => $id, 'resumen' => 'Aprendizaje guardado: ' . $t);
}

/** Lo que un agente debe tener presente: reglas y aprendizajes de su área y generales. */
function labs_equipo_cerebro_para($rol)
{
    if (!labs_tabla_existe('equipo_memoria')) {
        return array();
    }
    $dep = labs_equipo_roles()[$rol]['dep'];
    return labs_q("SELECT tipo, titulo, texto, confianza, creado FROM equipo_memoria WHERE activo = 1 AND (area IN (?, 'general', 'direccion') OR tipo = 'regla' OR ? IN ('direccion', 'operaciones'))
                   ORDER BY tipo = 'regla' DESC, confianza DESC, id DESC LIMIT 12", array($dep, $dep))->fetchAll();
}

/* --- Calidad: auditoría, hallazgos y puntuación ---------------------------------------------------------------- */
function labs_equipo_puntuacion($rol, $dias = 7)
{
    $desde = gmdate('Y-m-d H:i:s', time() - $dias * 86400);
    $c = function ($sql, $p) { return (int) labs_q($sql, $p)->fetchColumn(); };
    $acc = $c("SELECT COUNT(*) FROM equipo_acciones WHERE agente = ? AND riesgo <> 'lectura' AND estado <> 'error' AND ts >= ?", array($rol, $desde));
    $err = $c("SELECT COUNT(*) FROM equipo_acciones WHERE agente = ? AND estado = 'error' AND ts >= ?", array($rol, $desde));
    $apr = $c("SELECT COUNT(*) FROM equipo_acciones WHERE agente = ? AND estado = 'aprobada' AND decidido >= ?", array($rol, $desde));
    $rec = $c("SELECT COUNT(*) FROM equipo_acciones WHERE agente = ? AND estado = 'rechazada' AND decidido >= ?", array($rol, $desde));
    $hal = $c("SELECT COUNT(*) FROM equipo_hallazgos WHERE responsable = ? AND estado = 'abierto'", array($rol));
    $tp = $c("SELECT COUNT(*) FROM equipo_tareas WHERE para = ? AND estado = 'pendiente'", array($rol));
    $th = $c("SELECT COUNT(*) FROM equipo_tareas WHERE para = ? AND estado = 'hecha' AND cerrada >= ?", array($rol, $desde));
    $turnos = $c('SELECT COUNT(*) FROM equipo_turnos WHERE agente = ? AND inicio >= ?', array($rol, $desde));
    $tasa_err = ($acc + $err) ? $err / ($acc + $err) : 0;
    $tasa_rec = ($apr + $rec) ? $rec / ($apr + $rec) : 0;
    $nota = max(0, min(100, (int) round(100 - 60 * $tasa_err - 30 * $tasa_rec - 5 * $hal - 2 * max(0, $tp - 3))));
    return array('rol' => $rol, 'turnos' => $turnos, 'acciones' => $acc, 'errores' => $err, 'aprobadas' => $apr, 'rechazadas' => $rec, 'tareas_pendientes' => $tp, 'tareas_hechas' => $th,
        'hallazgos_abiertos' => $hal, 'puntuacion' => $turnos || $acc || $err ? $nota : null);
}

function labs_equipo_h_revisar_mi_equipo($e, $rol)
{
    $subs = $rol === 'qa' ? array_keys(labs_equipo_roles()) : labs_equipo_subordinados($rol);
    $r = array();
    foreach ($subs as $s) {
        $u = labs_fila("SELECT resumen, inicio FROM equipo_turnos WHERE agente = ? AND estado = 'hecho' ORDER BY id DESC LIMIT 1", array($s));
        $r[] = labs_equipo_puntuacion($s) + array('nombre' => labs_equipo_roles()[$s]['nombre'], 'instrucciones' => labs_equipo_cfg()['agentes'][$s]['instrucciones'],
            'ultimo_informe' => $u ? mb_substr($u['resumen'], 0, 500) : null);
    }
    return array('equipo' => $r);
}

/** Lista de comprobaciones. Cada problema: clave estable, gravedad, responsable, título, detalle, evidencia. */
function labs_equipo_auditoria()
{
    $h = array();
    $ahora = labs_ahora();
    $c = function ($sql, $p = array()) { return (int) labs_q($sql, $p)->fetchColumn(); };
    $hace = function ($s) { return gmdate('Y-m-d H:i:s', time() - $s); };
    $roles = labs_equipo_roles();
    foreach (array_keys($roles) as $r) {
        $p = labs_equipo_puntuacion($r);
        if ($p['errores'] >= 3 && $p['errores'] / max(1, $p['acciones'] + $p['errores']) >= 0.25) {
            $h[] = array('agente-errores:' . $r, 'media', $r, $roles[$r]['nombre'] . ': demasiadas acciones fallidas', 'Revisa por qué fallan sus acciones y corrige la causa.',
                $p['errores'] . ' errores de ' . ($p['acciones'] + $p['errores']) . ' acciones en 7 días');
        }
        if ($p['rechazadas'] >= 4 && $p['rechazadas'] / max(1, $p['aprobadas'] + $p['rechazadas']) >= 0.5) {
            $h[] = array('agente-rechazos:' . $r, 'media', $roles[$r]['jefe'] ?: 'ceo', $roles[$r]['nombre'] . ': la dirección rechaza la mitad de sus propuestas',
                'Su jefe debe revisar sus instrucciones con los motivos de rechazo.', $p['rechazadas'] . ' rechazadas y ' . $p['aprobadas'] . ' aprobadas en 7 días');
        }
    }
    if (labs_tabla_existe('motor_campanas')) {
        foreach (labs_q("SELECT id, nombre FROM motor_campanas WHERE estado = 'activa'")->fetchAll() as $k) {
            $s = labs_equipo_stats_campana($k['id']);
            if ($s['n'] >= 20 && $s['bajas'] / $s['n'] >= 0.05) {
                $h[] = array('campana-bajas:' . $k['id'], 'alta', 'marketing', 'Campaña «' . $k['nombre'] . '» con demasiadas bajas', 'Un 5 % de bajas daña la reputación del dominio: pausar y revisar segmento y mensaje.',
                    $s['bajas'] . ' bajas de ' . $s['n'] . ' empresas contactadas (' . labs_equipo_pct($s['bajas'], $s['n']) . ' %)');
            }
        }
        $n = $c("SELECT COUNT(*) FROM motor_mensajes WHERE estado = 'error' AND creado >= ?", array($hace(86400)));
        if ($n >= 5) {
            $h[] = array('envios-error', 'alta', 'cto', 'Fallan los envíos de correo', 'Revisar el servidor SMTP y los límites del buzón.', $n . ' envíos con error en 24 h');
        }
        $n = $c("SELECT COUNT(*) FROM motor_leads WHERE estado = 'nuevo' AND creado < ?", array($hace(48 * 3600)));
        if ($n >= 10) {
            $h[] = array('leads-atascados', 'media', 'cto', 'Empresas sin analizar desde hace más de 48 h', 'El análisis de webs está atascado: revisar el cron y los errores del Motor.', $n . ' empresas en «nuevo»');
        }
        $n = $c("SELECT COUNT(*) FROM contactos c WHERE c.activo = 1 AND c.fase = 'cualificacion' AND c.origen LIKE 'Motor%' AND c.creado < ?
                 AND NOT EXISTS (SELECT 1 FROM llamadas l WHERE l.contacto_id = c.id)", array($hace(26 * 3600)));
        if ($n > 0) {
            $h[] = array('interesados-sin-llamada', 'alta', 'sdr', 'Interesados del Motor sin llamar en 24 h', 'La velocidad de respuesta es lo que más convierte: llamar hoy.', $n . ' contactos interesados sin ninguna llamada');
        }
    }
    foreach (labs_fases() as $f => $d) {
        if (!in_array($f, array('demo', 'propuesta', 'negociacion'), true)) {
            continue;
        }
        $n = $c("SELECT COUNT(*) FROM contactos c WHERE c.activo = 1 AND c.fase = ? AND COALESCE(c.fase_desde, c.creado) < ? AND (c.proximo_contacto IS NULL OR c.proximo_contacto < ?)
                 AND NOT EXISTS (SELECT 1 FROM citas t WHERE t.contacto_id = c.id AND t.estado IN ('programada', 'confirmada') AND t.inicio >= ?)", array($f, $hace($d[1] * 86400), $ahora, $ahora));
        if ($n > 0) {
            $h[] = array('sla:' . $f, 'alta', 'comercial', 'Oportunidades en «' . $d[0] . '» paradas más de ' . $d[1] . ' días', 'Cada oportunidad necesita fecha: llamar, visitar o dar por perdida.', $n . ' oportunidades sin próximo paso');
        }
    }
    $n = $c("SELECT COUNT(*) FROM presupuestos WHERE estado IN ('Borrador', 'Enviado', 'En revisión') AND contacto_id IS NOT NULL AND creado < ?", array($hace(7 * 86400)));
    if ($n > 0) {
        $h[] = array('presupuestos-frios', 'media', 'comercial', 'Presupuestos sin respuesta desde hace más de 7 días', 'Llamar a quien decide y cerrar con fecha.', $n . ' presupuestos abiertos');
    }
    $n = $c("SELECT COUNT(*) FROM equipo_cobros WHERE estado = 'pendiente' AND vence < ?", array(labs_equipo_madrid()->modify('-15 days')->format('Y-m-d')));
    if ($n > 0) {
        $h[] = array('cobros-vencidos', 'alta', 'finanzas', 'Cobros vencidos hace más de 15 días', 'Escalar: llamada de la dirección además del recordatorio.', $n . ' cobros');
    }
    $n = $c("SELECT COUNT(*) FROM equipo_experimentos WHERE estado = 'en_curso' AND lanzado < ?", array($hace(30 * 86400)));
    if ($n > 0) {
        $h[] = array('experimentos-largos', 'media', 'analista', 'Experimentos en curso desde hace más de 30 días', 'Concluir o ampliar la muestra: un test eterno no enseña nada.', $n . ' experimentos');
    }
    foreach (labs_q("SELECT para, COUNT(*) n FROM equipo_tareas WHERE estado = 'pendiente' AND para <> 'direccion' AND creado < ? GROUP BY para", array($hace(3 * 86400)))->fetchAll() as $t) {
        if (isset($roles[$t['para']])) {
            $h[] = array('tareas-viejas:' . $t['para'], 'baja', $roles[$t['para']]['jefe'] ?: 'ceo', $roles[$t['para']]['nombre'] . ' tiene tareas sin hacer desde hace más de 3 días', 'Revisar si están bloqueadas o reasignarlas.', $t['n'] . ' tareas');
        }
    }
    $n = $c("SELECT COUNT(*) FROM citas WHERE estado IN ('programada', 'confirmada') AND fin < ?", array($hace(2 * 86400)));
    if ($n > 0) {
        $h[] = array('citas-sin-cerrar', 'baja', 'coo', 'Citas pasadas sin cerrar en la agenda', 'Marcar realizada, no asistió o cancelada para que las cifras sean fiables.', $n . ' citas');
    }
    $out = array();
    foreach ($h as $x) {
        $out[] = array('clave' => $x[0], 'gravedad' => $x[1], 'responsable' => $x[2], 'titulo' => $x[3], 'detalle' => $x[4], 'evidencia' => $x[5]);
    }
    return $out;
}

function labs_equipo_h_auditar($e, $rol)
{
    $a = labs_equipo_auditoria();
    return array('hallazgos' => $a, 'total' => count($a), 'abiertos_registrados' => (int) labs_q("SELECT COUNT(*) FROM equipo_hallazgos WHERE estado = 'abierto'")->fetchColumn());
}

function labs_equipo_h_registrar_hallazgos($e, $rol)
{
    $a = labs_equipo_auditoria();
    $claves = array();
    $nuevos = 0;
    foreach ($a as $x) {
        $claves[] = $x['clave'];
        if (labs_fila("SELECT 1 FROM equipo_hallazgos WHERE clave = ? AND estado = 'abierto'", array($x['clave']))) {
            continue;
        }
        $para = isset(labs_equipo_roles()[$x['responsable']]) ? $x['responsable'] : 'direccion';
        labs_q('INSERT INTO equipo_tareas (de, para, titulo, detalle, prioridad, estado, creado) VALUES (?,?,?,?,?,?,?)',
            array($rol, $para, mb_substr('Hallazgo de calidad: ' . $x['titulo'], 0, 200), mb_substr($x['detalle'] . ' Evidencia: ' . $x['evidencia'], 0, 1500),
                $x['gravedad'] === 'alta' ? 'alta' : ($x['gravedad'] === 'media' ? 'media' : 'baja'), 'pendiente', labs_ahora()));
        $tid = (int) labs_db()->lastInsertId();
        labs_q('INSERT INTO equipo_hallazgos (clave, gravedad, responsable, titulo, detalle, evidencia, estado, detectado_por, tarea_id, creado) VALUES (?,?,?,?,?,?,?,?,?,?)',
            array($x['clave'], $x['gravedad'], $x['responsable'], mb_substr($x['titulo'], 0, 250), $x['detalle'], $x['evidencia'], 'abierto', $rol, $tid, labs_ahora()));
        $nuevos++;
    }
    // Lo que ya no se da, se cierra solo (y su tarea también).
    $resueltos = 0;
    foreach (labs_q("SELECT id, clave, tarea_id FROM equipo_hallazgos WHERE estado = 'abierto'")->fetchAll() as $o) {
        if (!in_array($o['clave'], $claves, true)) {
            labs_q("UPDATE equipo_hallazgos SET estado = 'resuelto', cerrado = ? WHERE id = ?", array(labs_ahora(), $o['id']));
            if ($o['tarea_id']) {
                labs_q("UPDATE equipo_tareas SET estado = 'hecha', resultado = 'Resuelto: la auditoría ya no lo detecta.', cerrada = ? WHERE id = ? AND estado = 'pendiente'", array(labs_ahora(), $o['tarea_id']));
            }
            $resueltos++;
        }
    }
    return array('nuevos' => $nuevos, 'resueltos' => $resueltos, 'resumen' => 'Auditoría: ' . count($a) . ' problemas (' . $nuevos . ' nuevos), ' . $resueltos . ' resueltos desde la anterior');
}

function labs_equipo_h_pausar_campana($e, $rol)
{
    labs_equipo_motor_disponible();
    $k = labs_fila('SELECT * FROM motor_campanas WHERE id = ?', array((int) ($e['campana_id'] ?? 0)));
    if (!$k) {
        throw new Exception('Esa campaña no existe.');
    }
    labs_q("UPDATE motor_campanas SET estado = 'pausada', actualizado = ? WHERE id = ?", array(labs_ahora(), $k['id']));
    labs_q("UPDATE motor_mensajes SET estado = 'pendiente' WHERE campana_id = ? AND estado = 'aprobado'", array($k['id']));
    labs_motor_log('campana', 'Campaña «' . $k['nombre'] . '» pausada por el agente de ' . labs_equipo_roles()[$rol]['nombre'] . ': ' . mb_substr((string) ($e['motivo'] ?? ''), 0, 200), null, $k['id']);
    return array('resumen' => 'Campaña «' . $k['nombre'] . '» pausada');
}

function labs_equipo_h_proponer_cambio_instrucciones($e, $rol)
{
    $ag = (string) ($e['agente'] ?? '');
    if (!isset(labs_equipo_roles()[$ag])) {
        throw new Exception('Ese agente no existe.');
    }
    if ($rol !== 'qa' && $rol !== 'ceo' && labs_equipo_roles()[$ag]['jefe'] !== $rol) {
        throw new Exception('Solo puedes cambiar las instrucciones de tu propio equipo.');
    }
    $g = json_decode((string) labs_ajuste('equipo.config', ''), true);
    $g = is_array($g) ? $g : labs_equipo_config_def();
    $g['agentes'][$ag] = (isset($g['agentes'][$ag]) && is_array($g['agentes'][$ag]) ? $g['agentes'][$ag] : labs_equipo_config_def()['agentes'][$ag]);
    $g['agentes'][$ag]['instrucciones'] = mb_substr(trim((string) ($e['instrucciones'] ?? '')), 0, 2000);
    labs_pon_ajuste('equipo.config', json_encode($g, JSON_UNESCAPED_UNICODE));
    labs_anota('equipo.config', 'Instrucciones de ' . labs_equipo_roles()[$ag]['nombre'] . ' cambiadas a propuesta de ' . labs_equipo_roles()[$rol]['nombre']);
    return array('resumen' => 'Nuevas instrucciones para ' . labs_equipo_roles()[$ag]['nombre']);
}

/* --- Embudo multicanal: correo → teléfono → visita -------------------------------------------------------------- */
function labs_equipo_candidatos_telefono($lim = 20)
{
    if (!labs_tabla_existe('motor_leads')) {
        return array();
    }
    return labs_q("SELECT id, empresa, sector, localidad, telefono, direccion, email, ultimo_envio FROM motor_leads WHERE estado = 'terminado' AND contacto_id IS NULL
                   AND ultimo_envio < ? ORDER BY telefono = '', madurez DESC, ultimo_envio LIMIT " . (int) $lim, array(gmdate('Y-m-d H:i:s', time() - 4 * 86400)))->fetchAll();
}

function labs_equipo_localidad_de($c)
{
    if (labs_tabla_existe('motor_leads')) {
        $l = labs_fila("SELECT localidad FROM motor_leads WHERE contacto_id = ? AND localidad <> '' LIMIT 1", array($c['id']));
        if ($l) {
            return $l['localidad'];
        }
    }
    $d = labs_equipo_direccion_de($c);
    if ($d !== '' && preg_match('/,\s*(?:\d{5}\s*)?([^,\d][^,]*)$/u', $d, $m)) {
        return trim($m[1]);
    }
    return '';
}

/** Contactos a los que el teléfono no ha llegado (o marcados para visita), agrupados por localidad. */
function labs_equipo_candidatos_visita()
{
    $filas = labs_q("SELECT c.* FROM contactos c WHERE c.activo = 1 AND c.fase IN ('lead', 'cualificacion')
          AND NOT EXISTS (SELECT 1 FROM citas t WHERE t.contacto_id = c.id AND ((t.estado IN ('programada', 'confirmada') AND t.inicio >= ?) OR (t.tipo = 'visita' AND t.inicio >= ?)))
          AND NOT EXISTS (SELECT 1 FROM llamadas l WHERE l.contacto_id = c.id AND l.resultado IN ('interesado', 'cita', 'propuesta', 'cierre_verbal'))
          AND ((SELECT COUNT(*) FROM llamadas l WHERE l.contacto_id = c.id AND l.resultado IN ('no_contesta', 'buzon', 'filtro', 'datos_erroneos')) >= 2 OR c.etiquetas LIKE '%Rama visita%')
          ORDER BY c.creado LIMIT 60", array(labs_ahora(), gmdate('Y-m-d H:i:s', time() - 60 * 86400)))->fetchAll();
    $g = array();
    foreach ($filas as $c) {
        $loc = labs_equipo_localidad_de($c);
        if ($loc === '' && labs_equipo_direccion_de($c) === '') {
            continue;   // sin dirección no se puede visitar
        }
        $g[$loc !== '' ? $loc : '(sin localidad)'][] = array('contacto_id' => (int) $c['id'], 'empresa' => labs_equipo_nombre_contacto($c), 'direccion' => labs_equipo_direccion_de($c));
    }
    uasort($g, function ($a, $b) { return count($b) - count($a); });
    return $g;
}

function labs_equipo_h_ver_ramas($e, $rol)
{
    $tel = labs_equipo_candidatos_telefono(15);
    $vis = labs_equipo_candidatos_visita();
    $c = function ($sql, $p = array()) { return (int) labs_q($sql, $p)->fetchColumn(); };
    return array(
        'candidatas_a_telefono' => array_map(function ($l) { return array('lead_id' => (int) $l['id'], 'empresa' => $l['empresa'], 'sector' => $l['sector'], 'localidad' => $l['localidad'],
            'tiene_telefono' => $l['telefono'] !== '', 'tiene_direccion' => $l['direccion'] !== ''); }, $tel),
        'candidatos_a_visita_por_localidad' => $vis,
        'resultados' => array(
            'rama_correo_interesados' => labs_tabla_existe('motor_leads') ? $c("SELECT COUNT(*) FROM motor_leads WHERE estado = 'derivado'") : 0,
            'rama_telefono_escalados' => $c("SELECT COUNT(*) FROM contactos WHERE etiquetas LIKE '%Rama teléfono%'"),
            'rama_telefono_avanzan' => $c("SELECT COUNT(*) FROM contactos WHERE etiquetas LIKE '%Rama teléfono%' AND fase NOT IN ('lead', 'perdido')"),
            'rama_visita_programadas' => $c("SELECT COUNT(*) FROM citas WHERE tipo = 'visita' AND titulo LIKE 'Visita en frío%'"),
            'rama_visita_realizadas' => $c("SELECT COUNT(*) FROM citas WHERE tipo = 'visita' AND titulo LIKE 'Visita en frío%' AND estado = 'realizada'")));
}

function labs_equipo_h_escalar_lead($e, $rol)
{
    labs_equipo_motor_disponible();
    $l = labs_fila('SELECT * FROM motor_leads WHERE id = ?', array((int) ($e['lead_id'] ?? 0)));
    $rama = ($e['rama'] ?? '') === 'visita' ? 'visita' : 'telefono';
    if (!$l || $l['contacto_id'] || !in_array($l['estado'], array('terminado', 'sin_email', 'listo'), true)) {
        throw new Exception('Esa empresa no se puede escalar (ya está en el CRM, respondió o pidió la baja).');
    }
    if ($l['email'] !== '' && labs_motor_bloqueado($l['email'])) {
        throw new Exception('Esa empresa pidió no ser contactada.');
    }
    if ($rama === 'telefono' && $l['telefono'] === '') {
        throw new Exception('No tiene teléfono: escálala a visita.');
    }
    if ($rama === 'visita' && $l['direccion'] === '') {
        throw new Exception('No tiene dirección para visitarla.');
    }
    $g = labs_equipo_gestor_para(null);
    if (!$g) {
        throw new Exception('No hay gestores humanos activos.');
    }
    $et = $rama === 'telefono' ? 'Rama teléfono' : 'Rama visita';
    $esp = trim(($l['direccion'] ? 'Dirección: ' . $l['direccion'] . "\n" : '') . ($l['cif'] ? 'CIF: ' . $l['cif'] . "\n" : '') . 'Captado por el Motor de Scraping IA; no respondió a los correos.');
    $s = json_decode((string) $l['senales'], true) ?: array();
    $fila = labs_inserta_fila('contactos', labs_tabla('contactos'), array('nombre' => mb_substr($l['empresa'], 0, 120), 'empresa' => mb_substr($l['empresa'], 0, 200),
        'email' => labs_motor_email_ascii($l['email']),
        'telefono' => $l['telefono'], 'origen' => mb_substr('Motor · ' . mb_strtolower($et), 0, 120), 'estado' => 'Nuevo', 'especificaciones' => $esp, 'gestor_id' => $g['id'],
        'sector' => mb_substr(labs_ventas_sector_de($l['sector'] . ' ' . $l['empresa']) ?: $l['sector'], 0, 60), 'web' => mb_substr(labs_motor_web_ascii($l['web']), 0, 200),
        'etiquetas' => 'Motor IA, ' . $et, 'fase' => 'lead'), true);
    labs_q('UPDATE motor_leads SET contacto_id = ? WHERE id = ?', array($fila['id'], $l['id']));
    $c = labs_equipo_contacto($fila['id']);
    labs_equipo_evento($c['id'], $rol, 'Pasa a la ' . mb_strtolower($et) . ': no respondió a los 3 correos' . (!empty($s['carencias']) ? '. Carencias detectadas en su web: ' . implode(', ', array_slice($s['carencias'], 0, 4)) : '') . '.');
    if ($rama === 'telefono') {
        $r = labs_equipo_h_programar_llamada(array('contacto_id' => $c['id'], 'gestor_id' => $g['id'], 'dias' => 1,
            'motivo' => 'Rama teléfono: no respondió a 3 correos. Mencionar el correo, localizar a quien decide y conseguir 10 minutos'), $rol);
        return array('contacto_id' => (int) $c['id'], 'resumen' => $l['empresa'] . ' pasa a teléfono · ' . $r['resumen']);
    }
    return array('contacto_id' => (int) $c['id'], 'resumen' => $l['empresa'] . ' pasa a la rama de visita presencial (' . ($l['localidad'] ?: 'sin localidad') . ')');
}

function labs_equipo_h_planificar_ruta_visitas($e, $rol)
{
    $ids = array_values(array_unique(array_map('intval', (array) ($e['contacto_ids'] ?? array()))));
    if (!$ids || count($ids) > 6) {
        throw new Exception('Una ruta lleva de 1 a 6 empresas.');
    }
    $cs = array();
    foreach ($ids as $id) {
        $c = labs_equipo_contacto($id);
        if (!$c) {
            throw new Exception('El contacto #' . $id . ' no existe.');
        }
        if (labs_fila("SELECT 1 FROM citas WHERE contacto_id = ? AND tipo = 'visita' AND estado IN ('programada', 'confirmada') AND inicio >= ?", array($id, labs_ahora()))) {
            continue;
        }
        $cs[] = $c;
    }
    if (!$cs) {
        throw new Exception('Todas esas empresas ya tienen visita programada.');
    }
    $g = labs_equipo_gestor_para($cs[0], $e['gestor_id'] ?? null);
    if (!$g) {
        throw new Exception('No hay gestores humanos activos.');
    }
    // Un mismo día, huecos de 45 minutos: 10:00, 11:00, 12:00, 13:00, 16:30 y 17:30.
    $huecos = array(array(10, 0), array(11, 0), array(12, 0), array(13, 0), array(16, 30), array(17, 30));
    $dia0 = max(1, min(15, (int) ($e['dias'] ?? 2)));
    $plan = null;
    for ($d = $dia0; $d < $dia0 + 10 && !$plan; $d++) {
        $libres = array();
        foreach ($huecos as $h) {
            $f = labs_equipo_laborable($d, $h[0], $h[1]);
            $ini = labs_equipo_utc($f);
            $fin = gmdate('Y-m-d H:i:s', $f->getTimestamp() + 45 * 60);
            if (!labs_fila("SELECT 1 FROM citas WHERE comercial_id = ? AND estado IN ('programada', 'confirmada') AND inicio < ? AND fin > ? LIMIT 1", array($g['id'], $fin, $ini))) {
                $libres[] = array($ini, $fin, $f->format('d/m H:i'));
            }
        }
        if (count($libres) >= count($cs)) {
            $plan = array_slice($libres, 0, count($cs));
        }
    }
    if (!$plan) {
        throw new Exception('El gestor no tiene huecos para esa ruta en las próximas dos semanas.');
    }
    $hechas = array();
    foreach ($cs as $i => $c) {
        $l = labs_tabla_existe('motor_leads') ? labs_fila('SELECT senales, paso FROM motor_leads WHERE contacto_id = ? LIMIT 1', array($c['id'])) : null;
        $s = $l ? (json_decode((string) $l['senales'], true) ?: array()) : array();
        $ll = (int) labs_q('SELECT COUNT(*) FROM llamadas WHERE contacto_id = ?', array($c['id']))->fetchColumn();
        $notas = "VISITA EN FRÍO (ruta preparada por el agente de " . labs_equipo_roles()[$rol]['nombre'] . ")\n" .
            'Intentos previos: ' . ($l ? (int) $l['paso'] . ' correos' : 'sin correos') . ' y ' . $ll . " llamadas sin localizar a quien decide.\n" .
            (!empty($s['carencias']) ? 'Carencias detectadas en su web: ' . implode(', ', array_slice($s['carencias'], 0, 4)) . "\n" : '') .
            "Objetivo: presentarte, dejar el dosier y conseguir 10 minutos con quien decide (o la cita para la demo).\n" .
            'Guion: brief 2 (captación) si no tiene forma de contacto fuera de horario; brief 3 (embudo) si hace anuncios; brief 4 (voz) si el teléfono no da abasto.';
        labs_q('INSERT INTO citas (contacto_id, titulo, tipo, inicio, fin, comercial_id, estado, sector, lugar, notas, resumen, creado_por, creado, actualizado) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
            array($c['id'], mb_substr('Visita en frío · ' . labs_equipo_nombre_contacto($c), 0, 200), 'visita', $plan[$i][0], $plan[$i][1], $g['id'], 'programada',
                mb_substr((string) $c['sector'], 0, 60), mb_substr(labs_equipo_direccion_de($c) ?: labs_equipo_localidad_de($c), 0, 250), $notas, '', $g['id'], labs_ahora(), labs_ahora()));
        labs_equipo_actualiza_contacto($c, array('proximo_contacto' => $plan[$i][0], 'proximo_paso' => mb_substr('Visita en frío con ' . $g['nombre'] . ' (' . $plan[$i][2] . ')', 0, 200)));
        labs_equipo_evento($c['id'], $rol, 'Visita presencial en ruta: ' . trim($g['nombre'] . ' ' . $g['apellidos']) . ', ' . $plan[$i][2] . '.', 'reunion');
        $hechas[] = labs_equipo_nombre_contacto($c) . ' (' . substr($plan[$i][2], 6) . ')';
    }
    return array('visitas' => count($hechas), 'gestor' => trim($g['nombre'] . ' ' . $g['apellidos']), 'dia' => substr($plan[0][2], 0, 5),
        'resumen' => 'Ruta de ' . count($hechas) . ' visitas para ' . $g['nombre'] . ' el ' . substr($plan[0][2], 0, 5) . ': ' . implode(', ', $hechas));
}

function labs_equipo_h_ver_ritmo($e, $rol)
{
    return labs_equipo_ritmo();
}

function labs_equipo_h_ver_segmentos($e, $rol)
{
    return labs_equipo_segmentos() + array('angulos_disponibles' => array_map(function ($a) { return $a[0]; }, labs_motor_angulos()));
}

/* --- Comprobaciones previas, descripciones y situación ---------------------------------------------------------------- */
function labs_equipo_valida_previa_lab($n, $e)
{
    if ($n === 'lanzar_experimento') {
        $x = labs_equipo_exp($e['experimento_id'] ?? 0);
        if (!$x || $x['estado'] !== 'propuesto') {
            return 'Solo se lanza un experimento propuesto.';
        }
    }
    if ($n === 'fijar_angulo_ganador') {
        $x = labs_equipo_exp($e['experimento_id'] ?? 0);
        if (!$x || $x['ganador'] === '' || $x['palanca'] !== 'angulo') {
            return 'Ese experimento no tiene un ángulo ganador.';
        }
    }
    if ($n === 'escalar_lead') {
        $l = labs_tabla_existe('motor_leads') ? labs_fila('SELECT contacto_id, estado FROM motor_leads WHERE id = ?', array((int) ($e['lead_id'] ?? 0))) : null;
        if (!$l || $l['contacto_id']) {
            return 'Esa empresa no existe o ya está en el CRM.';
        }
    }
    if ($n === 'proponer_cambio_instrucciones' && !isset(labs_equipo_roles()[$e['agente'] ?? ''])) {
        return 'Ese agente no existe.';
    }
    return labs_cierre_valida_previa($n, $e);
}

function labs_equipo_describe_lab($n, $e)
{
    $x = isset($e['experimento_id']) ? labs_fila('SELECT titulo FROM equipo_experimentos WHERE id = ?', array((int) $e['experimento_id'])) : null;
    switch ($n) {
        case 'proponer_experimento':
            return 'Experimento: ' . ($e['titulo'] ?? '') . ' (' . ($e['sector'] ?? '') . ')';
        case 'lanzar_experimento':
            return 'Lanzar el experimento #' . (int) ($e['experimento_id'] ?? 0) . ($x ? ' · ' . $x['titulo'] : '');
        case 'evaluar_experimento':
            return 'Evaluar el experimento #' . (int) ($e['experimento_id'] ?? 0);
        case 'fijar_angulo_ganador':
            return 'Fijar el ángulo ganador del experimento #' . (int) ($e['experimento_id'] ?? 0) . ($x ? ' · ' . $x['titulo'] : '') . ' como estándar del sector';
        case 'guardar_aprendizaje':
            return 'Aprendizaje: ' . ($e['titulo'] ?? '');
        case 'registrar_hallazgos':
            return 'Registrar los hallazgos de la auditoría';
        case 'pausar_campana':
            $k = labs_tabla_existe('motor_campanas') ? labs_fila('SELECT nombre FROM motor_campanas WHERE id = ?', array((int) ($e['campana_id'] ?? 0))) : null;
            return 'Pausar la campaña «' . ($k ? $k['nombre'] : '#' . (int) ($e['campana_id'] ?? 0)) . '»: ' . ($e['motivo'] ?? '');
        case 'proponer_cambio_instrucciones':
            return 'Nuevas instrucciones para ' . (labs_equipo_roles()[$e['agente'] ?? '']['nombre'] ?? '?') . ': ' . mb_substr((string) ($e['motivo'] ?? ''), 0, 150);
        case 'escalar_lead':
            $l = labs_tabla_existe('motor_leads') ? labs_fila('SELECT empresa FROM motor_leads WHERE id = ?', array((int) ($e['lead_id'] ?? 0))) : null;
            return ($l ? $l['empresa'] : 'Empresa #' . (int) ($e['lead_id'] ?? 0)) . ' pasa a la rama de ' . (($e['rama'] ?? '') === 'visita' ? 'visita presencial' : 'teléfono');
        case 'planificar_ruta_visitas':
            $ns = array();
            foreach (array_slice((array) ($e['contacto_ids'] ?? array()), 0, 6) as $id) {
                $c = labs_equipo_contacto($id);
                $ns[] = $c ? labs_equipo_nombre_contacto($c) : '#' . (int) $id;
            }
            return 'Ruta de visitas presenciales: ' . implode(', ', $ns);
    }
    return labs_cierre_describe($n, $e) ?: 'Consulta: ' . $n;
}

/** Contexto extra para el turno, según el puesto. */
function labs_equipo_situacion_lab($rol)
{
    $s = array('cerebro_de_la_empresa' => labs_equipo_cerebro_para($rol));
    if ($rol === 'ceo' || $rol === 'marketing' || $rol === 'comercial') {
        $s['ritmo_hacia_el_objetivo'] = labs_equipo_ritmo();
    }
    if (labs_equipo_subordinados($rol)) {
        $s['tu_equipo'] = array_map(function ($r) { return labs_equipo_puntuacion($r) + array('nombre' => labs_equipo_roles()[$r]['nombre']); }, labs_equipo_subordinados($rol));
    }
    if (in_array($rol, array('analista', 'innovacion', 'copy', 'marketing'), true)) {
        $s['laboratorio'] = labs_equipo_h_ver_experimentos(array(), $rol)['experimentos'];
    }
    $s += labs_cierre_situacion($rol);
    if ($rol === 'qa') {
        $s['hallazgos_abiertos'] = labs_q("SELECT id, gravedad, responsable, titulo, evidencia, creado FROM equipo_hallazgos WHERE estado = 'abierto' ORDER BY id DESC LIMIT 15")->fetchAll();
    }
    return $s;
}

/* --- Manual de reglas de los puestos nuevos (sin Claude) ----------------------------------------------------------------- */
function labs_equipo_reglas_lab($rol, $usa, $g)
{
    $motor = labs_tabla_existe('motor_leads');
    $lista = function ($s) { return array_values(array_filter(array_map('trim', explode(',', (string) $s)))); };
    $hecho = labs_cierre_reglas($rol, $usa);
    if ($rol === 'coo' && $motor) {
        $usa('ver_ramas', array());
        foreach (labs_equipo_candidatos_telefono(8) as $l) {
            if ($l['telefono'] !== '') {
                $usa('escalar_lead', array('lead_id' => (int) $l['id'], 'rama' => 'telefono'));
            } elseif ($l['direccion'] !== '') {
                $usa('escalar_lead', array('lead_id' => (int) $l['id'], 'rama' => 'visita'));
            }
            $hecho = true;
        }
    }
    if ($rol === 'campo') {
        foreach (array_slice(labs_equipo_candidatos_visita(), 0, 2, true) as $loc => $cs) {
            $usa('planificar_ruta_visitas', array('contacto_ids' => array_slice(array_map(function ($c) { return $c['contacto_id']; }, $cs), 0, 6)));
            $hecho = true;
        }
    }
    if ($rol === 'qa') {
        $usa('auditar', array());
        $usa('registrar_hallazgos', array());
        foreach (labs_equipo_auditoria() as $x) {
            if (strpos($x['clave'], 'campana-bajas:') === 0) {
                $usa('pausar_campana', array('campana_id' => (int) substr($x['clave'], 14), 'motivo' => $x['evidencia']));
            }
        }
        $hecho = true;
    }
    if ($rol === 'analista') {
        foreach (labs_q("SELECT id FROM equipo_experimentos WHERE estado = 'en_curso' ORDER BY id")->fetchAll(PDO::FETCH_COLUMN) as $id) {
            $usa('evaluar_experimento', array('experimento_id' => (int) $id));
            $hecho = true;
        }
    }
    if ($rol === 'copy') {
        foreach (labs_q("SELECT e.id FROM equipo_experimentos e WHERE e.estado = 'concluido' AND e.ganador <> '' AND e.palanca = 'angulo'
                         AND NOT EXISTS (SELECT 1 FROM equipo_memoria m WHERE m.tipo = 'regla' AND m.origen = CONCAT('experimento:', e.id))")->fetchAll(PDO::FETCH_COLUMN) as $id) {
            $usa('fijar_angulo_ganador', array('experimento_id' => (int) $id));
            $hecho = true;
        }
    }
    if ($rol === 'innovacion' && $motor) {
        $usa('ver_segmentos', array());
        $abierto = labs_fila("SELECT id, estado FROM equipo_experimentos WHERE estado IN ('propuesto', 'en_curso') ORDER BY id DESC LIMIT 1");
        if ($abierto && $abierto['estado'] === 'propuesto') {
            $usa('lanzar_experimento', array('experimento_id' => (int) $abierto['id']));
            $hecho = true;
        } elseif (!$abierto) {
            $seg = labs_fila("SELECT LOWER(sector) s, COUNT(*) n FROM motor_leads WHERE estado = 'listo' AND campana_id IS NULL AND sector <> '' GROUP BY LOWER(sector) ORDER BY n DESC LIMIT 1");
            if ($seg && (int) $seg['n'] >= 10) {
                // A: el estándar actual del sector; B: un ángulo que el cerebro aún no ha probado en él.
                $a = labs_equipo_angulo_sector($seg['s']) ?: 'normativa';
                $probados = labs_q("SELECT variantes FROM equipo_experimentos WHERE LOWER(sector) = ? AND palanca = 'angulo'", array($seg['s']))->fetchAll(PDO::FETCH_COLUMN);
                $usados = array($a);
                foreach ($probados as $vj) {
                    foreach (json_decode($vj, true) ?: array() as $v) {
                        $usados[] = $v['angulo'] ?? '';
                    }
                }
                $b = null;
                foreach (array('perdida', 'pregunta', 'caso', 'diagnostico', 'normativa') as $k) {
                    if (!in_array($k, $usados, true)) {
                        $b = $k;
                        break;
                    }
                }
                if ($b) {
                    $angs = labs_motor_angulos();
                    $r = $usa('proponer_experimento', array('titulo' => ucfirst($seg['s']) . ': «' . $angs[$a][0] . '» frente a «' . $angs[$b][0] . '»', 'palanca' => 'angulo', 'sector' => $seg['s'],
                        'hipotesis' => 'Con «' . $angs[$b][0] . '» la tasa de respuestas positivas en ' . $seg['s'] . ' supera al estándar actual («' . $angs[$a][0] . '»).',
                        'angulo_a' => $a, 'angulo_b' => $b, 'min_muestra' => 30));
                    if (!empty($r['experimento_id'])) {
                        $usa('lanzar_experimento', array('experimento_id' => (int) $r['experimento_id']));
                    }
                    $hecho = true;
                }
            } else {
                // No hay volumen para testear mensajes: se abre un nicho nuevo (un sector objetivo aún sin explorar).
                $hay = array_map('mb_strtolower', labs_q('SELECT DISTINCT sector FROM motor_leads')->fetchAll(PDO::FETCH_COLUMN));
                foreach (array_merge($lista($g['sectores']), array('clínica de fisioterapia', 'academia', 'gimnasio', 'asesoría', 'taller mecánico', 'hotel')) as $s) {
                    $s = mb_strtolower($s);
                    $visto = false;
                    foreach ($hay as $h) {
                        $visto = $visto || ($h !== '' && (mb_strpos($h, $s) !== false || mb_strpos($s, $h) !== false));
                    }
                    if (!$visto && !labs_fila("SELECT 1 FROM equipo_experimentos WHERE palanca = 'nicho' AND LOWER(sector) = ?", array($s))) {
                        $r = $usa('proponer_experimento', array('titulo' => 'Nicho nuevo: ' . $s, 'palanca' => 'nicho', 'sector' => $s,
                            'hipotesis' => 'El sector «' . $s . '» tiene carencias de atención parecidas a nuestros mejores segmentos y aún no lo hemos trabajado.', 'localidades' => array_slice($lista($g['zonas']), 0, 5)));
                        if (!empty($r['experimento_id'])) {
                            $usa('lanzar_experimento', array('experimento_id' => (int) $r['experimento_id']));
                        }
                        $hecho = true;
                        break;
                    }
                }
            }
        }
    }
    if ($rol === 'prospeccion' && $motor) {
        $usa('ver_motor', array());
        $en_curso = (int) labs_q("SELECT COUNT(*) FROM motor_tareas WHERE estado IN ('cola', 'en_curso')")->fetchColumn();
        $listos = (int) labs_q("SELECT COUNT(*) FROM motor_leads WHERE estado = 'listo' AND campana_id IS NULL")->fetchColumn();
        $reciente = labs_fila('SELECT 1 FROM motor_tareas WHERE creado >= ?', array(gmdate('Y-m-d H:i:s', time() - 20 * 3600)));
        if (!$en_curso && !$reciente && $listos < 15) {
            // Sectores: primero los que mejor convierten según el cerebro y los datos; zonas: las menos trabajadas.
            $seg = labs_equipo_segmentos()['por_sector'];
            usort($seg, function ($a, $b) { return $b['tasa_positiva'] <=> $a['tasa_positiva']; });
            $sect = array();
            foreach ($seg as $x) {
                if ($x['contactadas'] >= 10 && $x['tasa_positiva'] > 0 && $x['sector'] !== '(sin dato)') {
                    $sect[] = $x['sector'];
                }
            }
            $sect = array_slice(array_values(array_unique(array_merge($sect, $lista($g['sectores'])))), 0, 3);
            $zonas = $lista($g['zonas']);
            $cnt = array();
            foreach ($zonas as $z) {
                $cnt[$z] = (int) labs_q('SELECT COUNT(*) FROM motor_leads WHERE localidad = ?', array($z))->fetchColumn();
            }
            asort($cnt);
            $usa('motor_buscar_empresas', array('sectores' => $sect, 'localidades' => array_slice(array_keys($cnt), 0, 6), 'max' => 60));
            $hecho = true;
        }
    }
    return $hecho;
}

/* --- API del laboratorio, el cerebro y la calidad --------------------------------------------------------------------------- */
function labs_equipo_ruta_lab($metodo, $sub, $b, $u)
{
    if ($sub === '/lab' && $metodo === 'GET') {
        $ex = array();
        foreach (labs_q('SELECT id FROM equipo_experimentos ORDER BY id DESC LIMIT 30')->fetchAll(PDO::FETCH_COLUMN) as $id) {
            $ex[] = labs_equipo_exp_vivo(labs_equipo_exp($id));
        }
        $r = labs_equipo_h_ver_ramas(array(), 'coo');
        $r['candidatos_a_visita_por_localidad'] = array_map(function ($l) { return count($l); }, $r['candidatos_a_visita_por_localidad']);
        $r['candidatas_a_telefono'] = count($r['candidatas_a_telefono']);
        return array('experimentos' => $ex, 'ramas' => $r, 'angulos' => labs_tabla_existe('motor_leads') ? labs_motor_angulos() : array(), 'ritmo' => labs_equipo_ritmo());
    }
    if ($sub === '/cerebro' && $metodo === 'GET') {
        return array('memoria' => labs_q('SELECT * FROM equipo_memoria ORDER BY activo DESC, tipo = \'regla\' DESC, id DESC LIMIT 120')->fetchAll(), 'segmentos' => labs_equipo_segmentos(),
            'angulos' => labs_tabla_existe('motor_leads') ? labs_motor_angulos() : array());
    }
    if ($sub === '/calidad' && $metodo === 'GET') {
        $p = array();
        foreach (labs_equipo_roles() as $k => $x) {
            $p[] = labs_equipo_puntuacion($k) + array('nombre' => $x['nombre'], 'alias' => $x['alias'], 'jefe' => $x['jefe']);
        }
        return array('hallazgos' => labs_q("SELECT * FROM equipo_hallazgos ORDER BY estado = 'abierto' DESC, FIELD(gravedad, 'alta', 'media', 'baja'), id DESC LIMIT 80")->fetchAll(),
            'puntuaciones' => $p, 'auditoria' => labs_equipo_auditoria());
    }
    if ($sub === '/cierre' && $metodo === 'GET') {
        return array('presupuestos' => labs_cierre_abiertos(80), 'equipo_comercial' => labs_cierre_equipo_comercial(),
            'cadencia' => array_map(function ($x) { return array('clave' => $x[0], 'dia' => $x[1], 'que' => $x[2]); }, array_values(labs_cierre_pasos())));
    }
    if ($sub === '/auditar' && $metodo === 'POST') {
        return labs_equipo_h_registrar_hallazgos(array(), 'qa');
    }
    if (preg_match('#^/hallazgos/(\d+)/(resolver|descartar)$#', $sub, $m) && $metodo === 'POST') {
        $h = labs_fila("SELECT * FROM equipo_hallazgos WHERE id = ? AND estado = 'abierto'", array((int) $m[1]));
        if (!$h) {
            throw new ErrorApi('Ese hallazgo ya no está abierto.', 404, 'PGRST116');
        }
        labs_q('UPDATE equipo_hallazgos SET estado = ?, cerrado = ? WHERE id = ?', array($m[2] === 'resolver' ? 'resuelto' : 'descartado', labs_ahora(), $h['id']));
        if ($h['tarea_id']) {
            labs_q("UPDATE equipo_tareas SET estado = ?, resultado = ?, cerrada = ? WHERE id = ? AND estado = 'pendiente'",
                array($m[2] === 'resolver' ? 'hecha' : 'cancelada', $m[2] === 'resolver' ? 'Resuelto por la dirección.' : 'Descartado por la dirección.', labs_ahora(), $h['tarea_id']));
        }
        return array('ok' => true);
    }
    if ($sub === '/memoria' && $metodo === 'POST') {
        $t = trim((string) ($b['titulo'] ?? ''));
        if (mb_strlen($t) < 6) {
            throw new ErrorApi('Escribe el aprendizaje o la regla (al menos 6 caracteres).', 400, 'EQUIPO');
        }
        $id = labs_equipo_memoriza(array('area' => isset(labs_equipo_departamentos()[$b['area'] ?? '']) ? $b['area'] : 'general', 'tipo' => 'casa', 'titulo' => $t,
            'texto' => (string) ($b['texto'] ?? ''), 'evidencia' => 'Regla de la casa (dirección)', 'confianza' => 90, 'origen' => 'direccion:' . $u['id']));
        return array('id' => $id);
    }
    if (preg_match('#^/memoria/(\d+)/archivar$#', $sub, $m) && $metodo === 'POST') {
        labs_q('UPDATE equipo_memoria SET activo = 0 WHERE id = ?', array((int) $m[1]));
        return array('ok' => true);
    }
    if (preg_match('#^/experimentos/(\d+)/(lanzar|evaluar|detener)$#', $sub, $m) && $metodo === 'POST') {
        try {
            if ($m[2] === 'lanzar') {
                return labs_equipo_h_lanzar_experimento(array('experimento_id' => (int) $m[1]), 'innovacion');
            }
            if ($m[2] === 'evaluar') {
                return labs_equipo_h_evaluar_experimento(array('experimento_id' => (int) $m[1]), 'analista');
            }
        } catch (ErrorApi $x) {
            throw $x;
        } catch (Exception $x) {
            throw new ErrorApi($x->getMessage(), 400, 'EQUIPO');
        }
        $x = labs_equipo_exp($m[1]);
        if (!$x || !in_array($x['estado'], array('propuesto', 'en_curso'), true)) {
            throw new ErrorApi('Ese experimento ya está cerrado.', 400, 'EQUIPO');
        }
        foreach ($x['variantes'] as $v) {
            if (!empty($v['campana_id'])) {
                labs_q("UPDATE motor_campanas SET estado = 'pausada', actualizado = ? WHERE id = ?", array(labs_ahora(), $v['campana_id']));
            }
        }
        labs_q("UPDATE equipo_experimentos SET estado = 'detenido', concluido = ?, resultado = ? WHERE id = ?", array(labs_ahora(),
            json_encode(array('conclusion' => 'Detenido por la dirección.'), JSON_UNESCAPED_UNICODE), $x['id']));
        return array('ok' => true);
    }
    return null;
}
