<?php
/**
 * Barrido de Asturias: el primer paso del embudo, en automático.
 *
 * Una matriz sector × concejo (los 78 concejos de las 8 comarcas oficiales) que el agente de
 * Prospección recorre sin saltarse ninguna casilla, por prioridad (concejos grandes primero y
 * sectores que mejor convierten), con un presupuesto diario de consultas a Google Places. Lo que
 * encuentra entra directamente en la campaña «siempre activa» de su sector, que Marketing abre y
 * mantiene: del scraping al correo sin pasos manuales. A los 90 días cada casilla se vuelve a
 * barrer para captar negocios nuevos.
 */
defined('LABS') || exit;

function labs_barrido_comarcas()
{
    return array(
        'Comarca de Gijón' => array('Gijón', 'Carreño', 'Villaviciosa'),
        'Comarca de Oviedo' => array('Oviedo', 'Siero', 'Llanera', 'Noreña', 'Nava', 'Grado', 'Las Regueras', 'Candamo', 'Morcín', 'Ribera de Arriba', 'Riosa', 'Santo Adriano', 'Proaza',
            'Quirós', 'Teverga', 'Somiedo', 'Belmonte de Miranda', 'Yernes y Tameza', 'Sariego', 'Salas'),
        'Comarca de Avilés' => array('Avilés', 'Castrillón', 'Corvera de Asturias', 'Gozón', 'Illas', 'Cudillero', 'Muros de Nalón', 'Pravia', 'Soto del Barco'),
        'Comarca del Caudal' => array('Mieres', 'Lena', 'Aller'),
        'Comarca del Nalón' => array('Langreo', 'San Martín del Rey Aurelio', 'Laviana', 'Bimenes', 'Caso', 'Sobrescobio'),
        'Comarca del Oriente' => array('Llanes', 'Cangas de Onís', 'Ribadesella', 'Parres', 'Piloña', 'Colunga', 'Caravia', 'Cabranes', 'Cabrales', 'Onís', 'Amieva', 'Ponga',
            'Peñamellera Alta', 'Peñamellera Baja', 'Ribadedeva'),
        'Comarca del Narcea' => array('Cangas del Narcea', 'Tineo', 'Allande', 'Degaña', 'Ibias'),
        'Comarca del Eo-Navia' => array('Navia', 'Valdés', 'Vegadeo', 'Castropol', 'Tapia de Casariego', 'El Franco', 'Coaña', 'Boal', 'Villayón', 'Illano', 'Pesoz', 'Grandas de Salime',
            'San Tirso de Abres', 'Taramundi', 'Santa Eulalia de Oscos', 'San Martín de Oscos', 'Villanueva de Oscos'),
    );
}

/** Prioridad del concejo: 1 los grandes núcleos, 2 las villas, 3 el resto. */
function labs_barrido_tier($c)
{
    if (in_array($c, array('Gijón', 'Oviedo', 'Avilés', 'Siero', 'Langreo', 'Mieres'), true)) {
        return 1;
    }
    if (in_array($c, array('Castrillón', 'San Martín del Rey Aurelio', 'Corvera de Asturias', 'Llanera', 'Villaviciosa', 'Llanes', 'Cangas del Narcea', 'Laviana', 'Carreño',
        'Valdés', 'Lena', 'Aller', 'Gozón', 'Grado', 'Navia', 'Tineo', 'Piloña', 'Pravia', 'Cangas de Onís', 'Noreña', 'Nava', 'Parres', 'Ribadesella', 'Cudillero', 'Salas'), true)) {
        return 2;
    }
    return 3;
}

/** Sectores con necesidad clara de atención y captación automatizadas (palabra de búsqueda => nombre, CNAE). */
function labs_barrido_sectores()
{
    return array(
        'inmobiliaria' => array('Inmobiliarias', '6831'), 'clínica dental' => array('Clínicas dentales', '8623'), 'clínica estética' => array('Clínicas estéticas', '9602'),
        'fisioterapia' => array('Fisioterapia', '8690'), 'asesoría' => array('Asesorías y gestorías', '6920'), 'abogados' => array('Despachos de abogados', '6910'),
        'taller mecánico' => array('Talleres mecánicos', '4520'), 'restaurante' => array('Restaurantes', '5610'), 'hotel' => array('Hoteles y alojamientos', '5510'),
        'gimnasio' => array('Gimnasios', '9313'), 'academia' => array('Academias', '8559'), 'peluquería' => array('Peluquerías', '9602'), 'óptica' => array('Ópticas', '4778'),
        'clínica veterinaria' => array('Veterinarias', '7500'), 'autoescuela' => array('Autoescuelas', '8553'), 'psicólogo' => array('Psicología', '8690'),
        'podología' => array('Podología', '8690'), 'agencia de seguros' => array('Seguros', '6622'), 'reformas' => array('Reformas y construcción', '4399'),
        'concesionario' => array('Concesionarios', '4511'),
    );
}

function labs_barrido_sectores_activos()
{
    $todos = labs_barrido_sectores();
    $g = trim((string) labs_equipo_cfg()['general']['barrido_sectores']);
    if ($g === '') {
        return array_keys($todos);
    }
    $out = array();
    foreach (array_map('trim', explode(',', mb_strtolower($g))) as $s) {
        if ($s !== '') {
            $out[] = $s;
        }
    }
    return array_values(array_unique($out));
}

/** Crea las casillas que falten, cierra las de extracciones terminadas y reabre las de más de 90 días. */
function labs_barrido_sincroniza()
{
    $sect = labs_barrido_sectores_activos();
    $hay = array();
    foreach (labs_q('SELECT sector, concejo FROM motor_cobertura')->fetchAll() as $f) {
        $hay[$f['sector'] . '|' . $f['concejo']] = 1;
    }
    $ahora = labs_ahora();
    foreach (labs_barrido_comarcas() as $com => $cs) {
        foreach ($cs as $c) {
            foreach ($sect as $s) {
                if (!isset($hay[$s . '|' . $c])) {
                    labs_q('INSERT INTO motor_cobertura (sector, concejo, comarca, tier, estado, empresas, actualizado) VALUES (?,?,?,?,?,0,?)', array($s, $c, $com, labs_barrido_tier($c), 'pendiente', $ahora));
                }
            }
        }
    }
    foreach (labs_q("SELECT DISTINCT m.tarea_id, t.estado FROM motor_cobertura m JOIN motor_tareas t ON t.id = m.tarea_id WHERE m.estado = 'en_cola' AND t.estado IN ('hecha', 'error')")->fetchAll() as $t) {
        foreach (labs_q("SELECT id, sector, concejo FROM motor_cobertura WHERE tarea_id = ? AND estado = 'en_cola'", array($t['tarea_id']))->fetchAll() as $m) {
            $n = (int) labs_q('SELECT COUNT(*) FROM motor_leads WHERE LOWER(sector) = ? AND localidad = ?', array(mb_strtolower($m['sector']), $m['concejo']))->fetchColumn();
            labs_q('UPDATE motor_cobertura SET estado = ?, empresas = ?, ultima = ?, actualizado = ? WHERE id = ?', array($t['estado'] === 'error' ? 'pendiente' : 'hecho', $n, $ahora, $ahora, $m['id']));
        }
    }
    labs_q("UPDATE motor_cobertura SET estado = 'pendiente', actualizado = ? WHERE estado = 'hecho' AND ultima < ?", array($ahora, gmdate('Y-m-d H:i:s', time() - 90 * 86400)));
}

function labs_barrido_resumen()
{
    if (!labs_tabla_existe('motor_cobertura')) {
        return null;
    }
    labs_barrido_sincroniza();
    $sect = labs_barrido_sectores_activos();
    $in = "'" . implode("','", array_map('addslashes', $sect)) . "'";
    $t = labs_q("SELECT COUNT(*) total, SUM(estado = 'hecho') hechas, SUM(estado = 'en_cola') en_cola, COALESCE(SUM(empresas), 0) empresas FROM motor_cobertura WHERE sector IN ($in)")->fetch();
    $com = array();
    foreach (labs_q("SELECT comarca, COUNT(*) total, SUM(estado = 'hecho') hechas, SUM(estado = 'en_cola') en_cola, COALESCE(SUM(empresas), 0) empresas FROM motor_cobertura WHERE sector IN ($in) GROUP BY comarca")->fetchAll() as $f) {
        $com[$f['comarca']] = array('total' => (int) $f['total'], 'hechas' => (int) $f['hechas'], 'en_cola' => (int) $f['en_cola'], 'empresas' => (int) $f['empresas']);
    }
    $mat = array();
    foreach (labs_q("SELECT sector, comarca, COUNT(*) total, SUM(estado = 'hecho') hechas, SUM(estado = 'en_cola') en_cola, COALESCE(SUM(empresas), 0) empresas FROM motor_cobertura WHERE sector IN ($in) GROUP BY sector, comarca")->fetchAll() as $f) {
        $mat[$f['sector']][$f['comarca']] = array('pct' => (int) round($f['hechas'] / max(1, $f['total']) * 100), 'cola' => (int) $f['en_cola'], 'empresas' => (int) $f['empresas']);
    }
    $hoy = labs_equipo_utc(labs_equipo_madrid()->setTime(0, 0));
    $g = labs_equipo_cfg()['general'];
    return array('total' => (int) $t['total'], 'hechas' => (int) $t['hechas'], 'en_cola' => (int) $t['en_cola'], 'empresas' => (int) $t['empresas'],
        'pct' => (int) round($t['hechas'] / max(1, $t['total']) * 100), 'por_comarca' => $com, 'matriz' => $mat,
        'sectores' => array_map(function ($s) { $x = labs_barrido_sectores()[$s] ?? array(ucfirst($s), ''); return array('q' => $s, 'n' => $x[0], 'cnae' => $x[1]); }, $sect),
        'consultas_hoy' => labs_barrido_consultas_hoy(), 'consultas_dia' => (int) $g['places_consultas_dia'], 'activo' => (bool) $g['barrido'],
        'campanas_siempre' => labs_q("SELECT id, nombre, sector, estado, modo FROM motor_campanas WHERE nombre LIKE 'Siempre activa · %' ORDER BY nombre")->fetchAll());
}

/** Consultas a Google Places lanzadas hoy por el barrido (cada casilla, hasta 3 páginas). */
function labs_barrido_consultas_hoy()
{
    $hoy = labs_equipo_utc(labs_equipo_madrid()->setTime(0, 0));
    return 3 * (int) labs_q("SELECT COUNT(*) FROM motor_cobertura WHERE lanzada >= ?", array($hoy))->fetchColumn();
}

/** Campaña siempre activa de un sector (o null). */
function labs_barrido_campana($sector)
{
    return labs_fila("SELECT * FROM motor_campanas WHERE nombre LIKE 'Siempre activa · %' AND LOWER(sector) = ? AND estado = 'activa' ORDER BY id LIMIT 1", array(mb_strtolower(trim($sector))));
}

/** Llamado por el Motor cuando una empresa queda verificada sin campaña. */
function labs_barrido_auto_campana($lead_id)
{
    $l = labs_fila('SELECT id, sector, campana_id, estado FROM motor_leads WHERE id = ?', array($lead_id));
    if (!$l || $l['campana_id'] || $l['estado'] !== 'listo') {
        return;
    }
    $k = labs_barrido_campana($l['sector']);
    if ($k) {
        labs_q("UPDATE motor_leads SET campana_id = ?, estado = 'en_campana', proximo_envio = ? WHERE id = ?", array($k['id'], labs_ahora(), $l['id']));
    }
}

/* --- Herramientas ----------------------------------------------------------------------------- */
function labs_barrido_herramientas()
{
    return array(
        'ver_barrido' => array(array('prospeccion', 'marketing', 'ceo', 'innovacion', 'analista', 'cto'), 'lectura', 'Cobertura del barrido de Asturias: casillas sector × concejo hechas, en cola y pendientes, por comarca y sector, empresas encontradas, consultas de hoy y campañas siempre activas.', array(), array()),
        'barrer_asturias' => array(array('prospeccion'), 'medio', 'Lanza la siguiente tanda del barrido de Asturias: las casillas pendientes de más prioridad (concejos grandes y sectores que mejor convierten), dentro del presupuesto diario de consultas. Las empresas entran directas en la campaña siempre activa de su sector si existe.',
            array('casillas' => array('type' => 'integer', 'minimum' => 1, 'maximum' => 30, 'description' => 'Cuántas casillas lanzar (por defecto 12)'),
                'sector' => array('type' => 'string', 'description' => 'Opcional: centrarse en un sector')), array()),
        'activar_campana_siempre' => array(array('marketing'), 'medio', 'Abre (o reactiva) la campaña siempre activa de un sector: todas las empresas verificadas de ese sector entran solas en su secuencia de correos, con el ángulo estándar del sector.',
            array('sector' => array('type' => 'string', 'description' => 'Sector (palabra de búsqueda, p. ej. «inmobiliaria»)')), array('sector')),
    );
}

function labs_equipo_h_ver_barrido($e, $rol)
{
    $r = labs_barrido_resumen();
    if (!$r) {
        throw new Exception('El barrido no está disponible.');
    }
    unset($r['matriz']);
    $r['siguientes'] = labs_q("SELECT sector, concejo, tier FROM motor_cobertura WHERE estado = 'pendiente' ORDER BY tier, id LIMIT 10")->fetchAll();
    return $r;
}

function labs_equipo_h_barrer_asturias($e, $rol)
{
    labs_equipo_motor_disponible();
    if (labs_motor_secreto('places_key') === null) {
        throw new Exception('Falta la clave de Google Places en la Fábrica de agentes del Motor. Pídesela a la dirección.');
    }
    labs_barrido_sincroniza();
    $g = labs_equipo_cfg()['general'];
    $quedan = (int) floor(((int) $g['places_consultas_dia'] - labs_barrido_consultas_hoy()) / 3);
    if ($quedan <= 0) {
        throw new Exception('Presupuesto diario de consultas a Google Places agotado; mañana sigue el barrido.');
    }
    $n = max(1, min(30, (int) ($e['casillas'] ?? 12), $quedan));
    // Prioridad: concejo (1 grandes, 2 villas, 3 resto); dentro, el sector con mejor tasa de respuestas positivas.
    $tasa = array();
    foreach (labs_equipo_segmentos()['por_sector'] as $x) {
        $tasa[$x['sector']] = $x['contactadas'] >= 10 ? $x['tasa_positiva'] : 0;
    }
    $p = array();
    $sql = "SELECT id, sector, concejo, comarca, tier FROM motor_cobertura WHERE estado = 'pendiente'";
    if (!empty($e['sector'])) {
        $sql .= ' AND sector = ' . labs_db()->quote(mb_strtolower(trim($e['sector'])));
    }
    $filas = labs_q($sql . ' ORDER BY tier, id LIMIT 600')->fetchAll();
    usort($filas, function ($a, $b) use ($tasa) { return ($a['tier'] <=> $b['tier']) ?: (($tasa[$b['sector']] ?? 0) <=> ($tasa[$a['sector']] ?? 0)) ?: ($a['id'] <=> $b['id']); });
    foreach (array_slice($filas, 0, $n) as $f) {
        $p[$f['sector']][] = $f;
    }
    if (!$p) {
        return array('resumen' => 'Barrido de Asturias completo: no quedan casillas pendientes (se reabren a los 90 días).');
    }
    $lanzadas = 0;
    $txt = array();
    foreach ($p as $s => $cs) {
        foreach (array_chunk($cs, 8) as $grupo) {
            $k = labs_barrido_campana($s);
            $tid = labs_motor_tarea_crea(array('sectores' => array($s), 'localidades' => array_map(function ($c) { return $c['concejo']; }, $grupo), 'ccaa' => 'Asturias',
                'comarca' => count(array_unique(array_map(function ($c) { return $c['comarca']; }, $grupo))) === 1 ? $grupo[0]['comarca'] : '', 'fuentes' => array('places', 'web'),
                'max' => 60 * count($grupo), 'campana_id' => $k ? (int) $k['id'] : null), labs_uid());
            foreach ($grupo as $c) {
                labs_q("UPDATE motor_cobertura SET estado = 'en_cola', tarea_id = ?, lanzada = ?, actualizado = ? WHERE id = ?", array($tid, labs_ahora(), labs_ahora(), $c['id']));
                $lanzadas++;
            }
            $txt[] = $s . ' en ' . implode(', ', array_slice(array_map(function ($c) { return $c['concejo']; }, $grupo), 0, 4)) . (count($grupo) > 4 ? '…' : '') . ($k ? ' (directo a su campaña)' : '');
        }
    }
    return array('casillas' => $lanzadas, 'resumen' => 'Barrido de Asturias: ' . $lanzadas . ' casillas en marcha · ' . implode(' · ', $txt));
}

function labs_equipo_h_activar_campana_siempre($e, $rol)
{
    labs_equipo_motor_disponible();
    $s = mb_strtolower(trim(mb_substr((string) ($e['sector'] ?? ''), 0, 60)));
    if ($s === '') {
        throw new Exception('Indica el sector.');
    }
    $g = labs_equipo_cfg()['general'];
    $modo = $g['modo_campanas'] === 'autonomo' && labs_motor_cfg()['envio']['aviso_legal_aceptado'] ? 'autonomo' : 'aprobacion';
    $k = labs_fila("SELECT * FROM motor_campanas WHERE nombre LIKE 'Siempre activa · %' AND LOWER(sector) = ? ORDER BY id LIMIT 1", array($s));
    $nombre = 'Siempre activa · ' . (labs_barrido_sectores()[$s][0] ?? ucfirst($s));
    if ($k) {
        labs_q("UPDATE motor_campanas SET estado = 'activa', modo = ?, actualizado = ? WHERE id = ?", array($modo, labs_ahora(), $k['id']));
        $cid = (int) $k['id'];
    } else {
        $creador = labs_uid() ?: (labs_q("SELECT id FROM perfiles WHERE estado = 'Activo' AND rol = 'admin' ORDER BY raiz DESC LIMIT 1")->fetchColumn() ?: null);
        labs_q('INSERT INTO motor_campanas (nombre, sector, ccaa, comarca, localidades, estado, modo, creado_por, creado, actualizado, angulo) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
            array($nombre, $s, 'Asturias', '', '[]', 'activa', $modo, $creador, labs_ahora(), labs_ahora(), ''));
        $cid = (int) labs_db()->lastInsertId();
    }
    // Las verificadas de ese sector que esperaban, dentro; y las extracciones en curso del sector apuntan a esta campaña.
    $n = labs_q("UPDATE motor_leads SET campana_id = ?, estado = 'en_campana', proximo_envio = ? WHERE campana_id IS NULL AND estado = 'listo' AND LOWER(sector) = ?", array($cid, labs_ahora(), $s))->rowCount();
    labs_motor_log('campana', 'Campaña siempre activa «' . $nombre . '» (' . ($modo === 'autonomo' ? 'envío autónomo' : 'con aprobación') . '): ' . $n . ' empresas dentro.', null, $cid);
    return array('campana_id' => $cid, 'empresas' => $n, 'resumen' => 'Campaña «' . $nombre . '» activa (' . ($modo === 'autonomo' ? 'envío autónomo' : 'cada correo con aprobación') . ') con ' . $n . ' empresas');
}

function labs_barrido_describe($n, $e)
{
    if ($n === 'barrer_asturias') {
        return 'Barrido de Asturias: siguiente tanda de ' . (int) ($e['casillas'] ?? 12) . ' casillas' . (!empty($e['sector']) ? ' de ' . $e['sector'] : '');
    }
    if ($n === 'activar_campana_siempre') {
        return 'Abrir la campaña siempre activa de ' . ($e['sector'] ?? '?');
    }
    return null;
}

/** Manual de reglas: Prospección barre; Marketing abre una campaña siempre activa por sector con empresas. */
function labs_barrido_reglas($rol, $usa)
{
    if (!labs_tabla_existe('motor_cobertura') || !labs_equipo_cfg()['general']['barrido']) {
        return false;
    }
    if ($rol === 'prospeccion') {
        $usa('ver_barrido', array());
        if (!(int) labs_q("SELECT COUNT(*) FROM motor_tareas WHERE estado IN ('cola', 'en_curso')")->fetchColumn()) {
            $usa('barrer_asturias', array('casillas' => 12));
        }
        return true;
    }
    if ($rol === 'marketing') {
        $hecho = false;
        foreach (labs_q("SELECT LOWER(sector) s, COUNT(*) n FROM motor_leads WHERE estado = 'listo' AND campana_id IS NULL AND sector <> '' GROUP BY LOWER(sector) ORDER BY n DESC LIMIT 4")->fetchAll() as $x) {
            if (!labs_barrido_campana($x['s'])) {
                $usa('activar_campana_siempre', array('sector' => $x['s']));
                $hecho = true;
            }
        }
        return $hecho;
    }
    return false;
}
