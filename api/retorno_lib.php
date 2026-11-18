<?php
/**
 * ICC CRM · Retorno: lo que de verdad firma y ahorra.
 *
 * Mide de principio a fin (canal → lead → presupuesto → firma) por canal,
 * sector y gestor, el valor firmado, el ahorro estudiado que ICC genera a sus
 * clientes (de los estudios e informes del comparador, nunca inventado), el
 * pipeline ponderado, la venta cruzada pendiente y las renovaciones. El agente
 * «CRO · Director de Retorno» usa estos datos cada dia para mover el esfuerzo a
 * lo que firma (prioridad del barrido por firmas, campañas siempre activas de
 * los sectores ganadores, venta cruzada a los clientes de un solo servicio) y
 * envia el parte semanal a direccion.
 */
require_once __DIR__ . '/agentes_lib.php';

const RT_CANALES = ['motor' => 'Motor (correo en frío)', 'sin_web' => 'Campaña sin web (llamadas)', 'formulario' => 'Formulario web', 'correo' => 'Correo entrante', 'voz' => 'Agente de voz', 'manual' => 'Comerciales (alta manual)'];
const RT_PROB = ['lead_captado' => 0.10, 'estudio_backoffice' => 0.25, 'oferta_presentada' => 0.50, 'en_cierre' => 0.75];
const RT_SERVICIOS = ['energia' => 'Energía', 'telecomunicaciones' => 'Telefonía', 'alarmas' => 'Alarmas', 'seguros' => 'Seguros', 'financiero' => 'Financiero'];

/** Ahorro anual estudiado de cada cliente (ultimo estudio de cada fuente). [cliente_id => euros] */
function rt_ahorros(): array {
  $db = icc_db();
  $q = function (string $sql) use ($db) { try { return $db->query($sql)->fetchAll(PDO::FETCH_KEY_PAIR); } catch (Throwable $e) { return []; } };
  $est = $q('SELECT e.cliente_id, e.ahorro_estimado FROM estudios e JOIN (SELECT cliente_id, MAX(id) id FROM estudios WHERE cliente_id IS NOT NULL GROUP BY cliente_id) u ON u.id = e.id');
  $ene = $q('SELECT i.cliente_id, i.ahorro_anual FROM cmp_ene_informes i JOIN (SELECT cliente_id, MAX(id) id FROM cmp_ene_informes WHERE cliente_id IS NOT NULL GROUP BY cliente_id) u ON u.id = i.id');
  $tel = $q('SELECT i.cliente_id, i.ahorro_anual FROM cmp_tel_informes i JOIN (SELECT cliente_id, MAX(id) id FROM cmp_tel_informes WHERE cliente_id IS NOT NULL GROUP BY cliente_id) u ON u.id = i.id');
  $aud = $q('SELECT a.cliente_id, SUM(a.ahorro_anual) FROM comparador_auditorias a JOIN (SELECT cliente_id, sector, MAX(id) id FROM comparador_auditorias WHERE cliente_id IS NOT NULL GROUP BY cliente_id, sector) u ON u.id = a.id GROUP BY a.cliente_id');
  $out = [];
  foreach (array_unique(array_merge(array_keys($est), array_keys($ene), array_keys($tel), array_keys($aud))) as $cid) {
    // Solo ahorro positivo: un estudio en el que la propuesta sale mas cara no es ahorro generado.
    $comparador = max(0, (float)($ene[$cid] ?? 0)) + max(0, (float)($tel[$cid] ?? 0)) + max(0, (float)($aud[$cid] ?? 0));
    $out[(int)$cid] = round(max(0, (float)($est[$cid] ?? 0), $comparador), 2);
  }
  return $out;
}

function rt_ahorro_cliente(int $cid): float { return (float)(rt_ahorros()[$cid] ?? 0); }

/** Canal de un cliente. */
function rt_canal(array $c, array $etiquetas): string {
  if (in_array('Interés: Página web', $etiquetas, true)) return 'sin_web';
  if ($c['origen'] === 'motor') return 'motor';
  if (in_array($c['origen'], ['formulario', 'correo'], true)) return $c['origen'];
  return 'manual';
}

/** Servicios contratados (contratos vigentes) por cliente. [cliente_id => [sector, ...]] */
function rt_servicios(): array {
  $out = [];
  foreach (icc_db()->query("SELECT DISTINCT cliente_id, sector FROM contratos WHERE cliente_id IS NOT NULL AND estado NOT IN ('ko','decomisionado')")->fetchAll() as $r) $out[(int)$r['cliente_id']][] = $r['sector'];
  return $out;
}

/** Panel completo. $dias: periodo de las altas; $visibles: gestores visibles (null = todos). */
function rt_panel(int $dias = 90, ?array $visibles = null): array {
  $db = icc_db();
  $dias = max(7, min(730, $dias));
  $w = $visibles === null ? '1 = 1' : 'c.comercial_id IN (' . implode(',', array_map('intval', $visibles ?: [0])) . ')';
  $clientes = $db->query("SELECT c.id, c.razon_social, c.origen, c.estado, c.sector, c.valor_estimado, c.comercial_id, c.created_at,
      (SELECT MAX(h.created_at) FROM historial_estado h WHERE h.cliente_id = c.id AND h.estado_nuevo = 'cliente_activo') firmado_en,
      (SELECT COUNT(*) FROM presupuestos p WHERE p.cliente_id = c.id) presupuestos
    FROM clientes c WHERE $w")->fetchAll();
  $etq = [];
  foreach ($db->query("SELECT cliente_id, etiqueta FROM cliente_etiquetas")->fetchAll() as $r) $etq[(int)$r['cliente_id']][] = $r['etiqueta'];
  $ahorros = rt_ahorros();
  $servicios = rt_servicios();
  $desde = date('Y-m-d H:i:s', time() - $dias * 86400);
  $vacio = ['leads' => 0, 'con_presupuesto' => 0, 'firmados' => 0, 'valor' => 0.0, 'ahorro' => 0.0];
  $canal = []; $sector = []; $gestor = [];
  $tot = ['firmados' => 0, 'valor' => 0.0, 'ahorro_periodo' => 0.0, 'leads' => 0, 'pipeline' => 0.0, 'pipeline_ponderado' => 0.0, 'activos' => 0, 'ahorro_cartera' => 0.0, 'monoservicio' => 0];
  foreach ($clientes as $c) {
    $cid = (int)$c['id'];
    $ah = (float)($ahorros[$cid] ?? 0);
    if ($c['estado'] === 'cliente_activo') {
      $tot['activos']++; $tot['ahorro_cartera'] += $ah;
      if (count(array_unique($servicios[$cid] ?? [])) <= 1) $tot['monoservicio']++;
    }
    if (isset(RT_PROB[$c['estado']])) { $tot['pipeline'] += (float)$c['valor_estimado']; $tot['pipeline_ponderado'] += (float)$c['valor_estimado'] * RT_PROB[$c['estado']]; }
    $nuevo = $c['created_at'] >= $desde;
    $firmado = $c['firmado_en'] && $c['firmado_en'] >= $desde;
    if (!$nuevo && !$firmado) continue;
    $k = rt_canal($c, $etq[$cid] ?? []);
    $s = (string)$c['sector'] ?: 'Sin sector';
    $g = (int)$c['comercial_id'];
    foreach ([[&$canal, $k], [&$sector, $s], [&$gestor, $g]] as $par) {
      $arr = &$par[0]; $clave = $par[1];
      if (!isset($arr[$clave])) $arr[$clave] = $vacio;
      if ($nuevo) { $arr[$clave]['leads']++; if ((int)$c['presupuestos'] > 0) $arr[$clave]['con_presupuesto']++; }
      if ($firmado) { $arr[$clave]['firmados']++; $arr[$clave]['valor'] += (float)$c['valor_estimado']; $arr[$clave]['ahorro'] += $ah; }
      unset($arr);
    }
    if ($nuevo) $tot['leads']++;
    if ($firmado) { $tot['firmados']++; $tot['valor'] += (float)$c['valor_estimado']; $tot['ahorro_periodo'] += $ah; }
  }
  $fin = function (array $l, callable $nombre) {
    $out = [];
    foreach ($l as $k => $v) $out[] = ['clave' => (string)$k, 'nombre' => $nombre($k)] + $v + ['tasa' => $v['leads'] ? round($v['firmados'] / $v['leads'] * 100, 1) : null];
    usort($out, function ($a, $b) { return [$b['firmados'], $b['valor']] <=> [$a['firmados'], $a['valor']]; });
    return $out;
  };
  $nombres = $db->query("SELECT id, CONCAT(nombre, ' ', COALESCE(apellidos, '')) FROM usuarios")->fetchAll(PDO::FETCH_KEY_PAIR);
  // Contratos por mes y servicio (6 meses).
  $wc = $visibles === null ? '1 = 1' : 'comercial_id IN (' . implode(',', array_map('intval', $visibles ?: [0])) . ')';
  $meses = $db->query("SELECT DATE_FORMAT(fecha_alta, '%Y-%m') mes, sector, COUNT(*) n FROM contratos WHERE fecha_alta >= DATE_FORMAT(CURDATE() - INTERVAL 5 MONTH, '%Y-%m-01') AND estado NOT IN ('ko','decomisionado') AND $wc GROUP BY mes, sector ORDER BY mes")->fetchAll();
  $renov = (int)$db->query("SELECT COUNT(*) FROM contratos WHERE estado IN ('ok','verificado','en_distribuidora') AND $wc AND COALESCE(fecha_activacion, fecha_alta) BETWEEN CURDATE() - INTERVAL 365 DAY AND CURDATE() - INTERVAL 305 DAY")->fetchColumn();
  return [
    'dias' => $dias, 'totales' => array_map(function ($v) { return is_float($v) ? round($v, 2) : $v; }, $tot) + ['renovaciones_60' => $renov, 'tasa' => $tot['leads'] ? round($tot['firmados'] / $tot['leads'] * 100, 1) : null],
    'canales' => $fin($canal, function ($k) { return RT_CANALES[$k] ?? $k; }),
    'sectores' => $fin($sector, function ($k) { return (string)$k; }),
    'gestores' => $fin($gestor, function ($k) use ($nombres) { return $k ? trim((string)($nombres[$k] ?? '#' . $k)) : 'Sin gestor'; }),
    'meses' => $meses, 'servicios' => RT_SERVICIOS,
  ];
}

/** Recomendaciones accionables a partir del panel. */
function rt_recomendaciones(array $p): array {
  $r = [];
  $conTasa = function (array $l, int $min) { return array_values(array_filter($l, function ($x) use ($min) { return $x['leads'] >= $min && $x['tasa'] !== null; })); };
  $canales = $conTasa($p['canales'], 5);
  if (count($canales) >= 2) {
    usort($canales, function ($a, $b) { return $b['tasa'] <=> $a['tasa']; });
    $r[] = ['🏆', 'El canal que más firma es «' . $canales[0]['nombre'] . '» (' . $canales[0]['tasa'] . ' % de los leads firman). Dale más volumen.', '#/motor'];
    $peor = end($canales);
    if ($peor['tasa'] < $canales[0]['tasa'] / 2) $r[] = ['🔧', '«' . $peor['nombre'] . '» convierte poco (' . $peor['tasa'] . ' %): revisa su mensaje o su guion antes de darle más volumen.', '#/motor'];
  }
  $sect = array_values(array_filter($conTasa($p['sectores'], 5), function ($x) { return $x['clave'] !== 'Sin sector'; }));
  if ($sect) { usort($sect, function ($a, $b) { return $b['tasa'] <=> $a['tasa']; }); $r[] = ['🎯', 'El sector que más firma es ' . $sect[0]['nombre'] . ' (' . $sect[0]['tasa'] . ' %). El CRO prioriza el barrido de Asturias por firmas.', '#/sin-web']; }
  if ($p['totales']['monoservicio'] > 0) $r[] = ['📦', $p['totales']['monoservicio'] . ($p['totales']['monoservicio'] === 1 ? ' cliente activo solo tiene' : ' clientes activos solo tienen') . ' un servicio: venta cruzada (100 % servicios). El CRO los mete en el embudo de venta cruzada.', '#/automatizaciones'];
  if ($p['totales']['renovaciones_60'] > 0) $r[] = ['🔁', $p['totales']['renovaciones_60'] . ($p['totales']['renovaciones_60'] === 1 ? ' contrato cumple' : ' contratos cumplen') . ' un año en los próximos 60 días: revisión antes de que se renueven.', '#/automatizaciones'];
  $parados = 0;
  try { $parados = count(array_filter(eq_presupuestos_parados(), function ($x) { return $x['parado']; })); } catch (Throwable $e) { /* sin datos */ }
  if ($parados) $r[] = ['🔥', $parados . ' presupuestos parados: la Jefatura de ventas y backoffice los empujan.', '#/zona-agentes'];
  if ($p['totales']['ahorro_cartera'] > 0) $r[] = ['💶', 'ICC ahorra a sus clientes activos ' . number_format($p['totales']['ahorro_cartera'], 0, ',', '.') . ' € al año (según sus estudios). Úsalo en cada llamada y en el informe de ahorro para pedir referidos.', '#/automatizaciones'];
  return array_map(function ($x) { return ['icono' => $x[0], 'texto' => $x[1], 'enlace' => $x[2]]; }, $r);
}

/**
 * Optimizacion diaria del CRO: prioridad del barrido por firmas, campañas
 * siempre activas de los 3 sectores que mas firman, venta cruzada a los
 * clientes de un solo servicio y parte semanal a direccion.
 */
function rt_optimizar(string $agente = 'cro'): string {
  $db = icc_db();
  $hechos = [];
  // 1) Firmas por sector del Motor (180 dias): leads del Motor que acabaron en cliente activo.
  $f = $db->query("SELECT l.sector, COUNT(*) leads, SUM(c.estado = 'cliente_activo') firmas FROM motor_leads l JOIN clientes c ON c.id = l.cliente_id
                   WHERE l.sector <> '' AND l.updated_at >= NOW() - INTERVAL 180 DAY GROUP BY l.sector HAVING leads >= 5")->fetchAll();
  $tasas = [];
  foreach ($f as $x) $tasas[$x['sector']] = round($x['firmas'] / max(1, $x['leads']), 4);
  if ($tasas) {
    arsort($tasas);
    icc_ajuste_guardar('barrido_prioridad_firmas', json_encode($tasas));
    $hechos[] = 'barrido priorizado por firmas (' . (MOTOR_SECTORES[array_key_first($tasas)][0] ?? array_key_first($tasas)) . ' primero)';
    foreach (array_slice(array_keys(array_filter($tasas, function ($t) { return $t > 0; })), 0, 3) as $s) { try { eq_usar($agente, 'activar_campana_siempre', ['sector' => $s], null); } catch (Throwable $e) { /* sigue */ } }
  }
  // 2) Venta cruzada: activos con un solo servicio, firmados hace mas de 45 dias, que no esten ya en el embudo.
  $vc = $db->query("SELECT id FROM flujos WHERE plantilla = 'venta_cruzada' AND estado = 'activo' ORDER BY id LIMIT 1")->fetch();
  if ($vc && function_exists('fl_inscribir')) {
    $flujo = $db->query('SELECT * FROM flujos WHERE id = ' . (int)$vc['id'])->fetch();
    $serv = rt_servicios(); $n = 0;
    foreach ($db->query("SELECT c.id FROM clientes c WHERE c.estado = 'cliente_activo' AND c.no_contactar = 0 AND c.updated_at < NOW() - INTERVAL 45 DAY
                         AND NOT EXISTS (SELECT 1 FROM flujo_inscripciones i WHERE i.flujo_id = " . (int)$vc['id'] . " AND i.cliente_id = c.id AND i.created_at >= NOW() - INTERVAL 180 DAY) LIMIT 50")->fetchAll(PDO::FETCH_COLUMN) as $cid) {
      if (count(array_unique($serv[(int)$cid] ?? [])) > 1) continue;
      // Ya entra en el embudo en su paso de condiciones (sin la espera de 45 dias).
      if ($iid = fl_inscribir($flujo, (int)$cid, 'cro')) { $db->prepare("UPDATE flujo_inscripciones SET paso_id = 'p2' WHERE id = ?")->execute([$iid]); $n++; }
      if ($n >= 20) break;
    }
    if ($n) $hechos[] = $n . ' clientes de un solo servicio a venta cruzada';
  }
  // 3) Parte semanal a direccion.
  if ((string)icc_ajuste('cro_parte', '') < date('Y-m-d', strtotime('-6 days'))) {
    $p = rt_panel(7);
    $t = $p['totales'];
    $txt = 'CRO · Parte semanal: ' . $t['firmados'] . ' clientes firmados (' . number_format($t['valor'], 0, ',', '.') . ' €), ' . $t['leads'] . ' leads nuevos'
      . ($t['tasa'] !== null ? ' (' . $t['tasa'] . ' % firman)' : '') . '. Pipeline ponderado: ' . number_format($t['pipeline_ponderado'], 0, ',', '.') . ' €. Ahorro que generamos a la cartera: '
      . number_format($t['ahorro_cartera'], 0, ',', '.') . ' €/año.' . ($p['canales'] ? ' Mejor canal: ' . $p['canales'][0]['nombre'] . '.' : '');
    foreach ($db->query("SELECT id FROM usuarios WHERE rol IN ('coordinador','gerente','admin','super_admin') AND bloqueado = 0")->fetchAll(PDO::FETCH_COLUMN) as $u) icc_notificar((int)$u, 'cuenta', 'cro', mb_substr($txt, 0, 480));
    icc_ajuste_guardar('cro_parte', date('Y-m-d'));
    $hechos[] = 'parte semanal enviado';
  }
  return $hechos ? 'CRO: ' . implode(' · ', $hechos) : 'CRO: sin cambios (falta muestra de firmas por sector).';
}
