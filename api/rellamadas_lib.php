<?php
/**
 * ICC CRM · Rellamadas de backoffice (agente «Jefatura de Backoffice»).
 *
 * Cada mañana (y cada hora si se queda sin trabajo) pone en la agenda de la
 * persona de backoffice elegida (por defecto, Daniela) rellamadas a clientes
 * con presupuesto presentado y sin respuesta, para que lo acepten y empiecen a
 * ahorrar. Cada rellamada lleva su guion. Ella marca el resultado con un clic:
 *  - Acepta: presupuesto a «documentacion», cliente a Negociacion, tarea de
 *    preparar el contrato y aviso al gestor.
 *  - Lo piensa: nueva rellamada a los 3 dias laborables (o el dia acordado).
 *  - No contesta: se reintenta al dia siguiente; a la 3.a, pasa al gestor.
 *  - No acepta: pasa al gestor con la objecion (nunca se marca perdido solo).
 * «Da cana»: parte diario con lo que tiene hoy y lo de ayer, y aviso a
 * coordinacion si acumula 3 o mas rellamadas atrasadas.
 */
require_once __DIR__ . '/agentes_lib.php';

const RL_RESULTADOS = ['acepta' => 'Acepta', 'lo_piensa' => 'Lo piensa', 'no_contesta' => 'No contesta', 'no_acepta' => 'No acepta'];

const RL_GUION = "1) «Buenos días, {nombre}. Le llamo de ICC Consultoría por la propuesta de ahorro en {servicio} que le preparamos.»\n"
  . "2) «¿Ha podido verla? ¿Le surgió alguna duda?» (escucha; si hay una duda: «Aparte de eso, ¿hay algo más que le impida seguir?»)\n"
  . "3) «Si lo dejamos en marcha esta semana, empieza a ahorrar desde la próxima factura. ¿Le preparo la documentación hoy o prefiere mañana por la mañana?»\n"
  . "4) Si lo piensa: «¿Qué día le llamo para cerrarlo? ¿El jueves a las 10 le va bien?»\n"
  . "Nunca prometas cifras que no estén en su estudio ni descuentos.";

function rl_config(): array {
  $db = icc_db();
  $u = (int)icc_ajuste('rellamadas_usuario', '0');
  if (!$u) {
    $u = (int)$db->query("SELECT id FROM usuarios WHERE rol = 'backoffice' AND bloqueado = 0 ORDER BY nombre LIKE 'Daniela%' DESC, id LIMIT 1")->fetchColumn();
  }
  return [
    'activo' => (string)icc_ajuste('rellamadas_activo', '1') === '1',
    'usuario_id' => $u ?: null,
    'max_dia' => max(1, min(80, (int)icc_ajuste('rellamadas_max_dia', '25'))),
    'dias_sin_contacto' => max(1, min(30, (int)icc_ajuste('rellamadas_dias', '2'))),
    // Objetivos del día y presión durante la jornada (avisos de ritmo e inactividad, cierre a dirección).
    'objetivo' => max(1, min(80, (int)icc_ajuste('rellamadas_objetivo', '20'))),
    'objetivo_aceptados' => max(0, min(20, (int)icc_ajuste('rellamadas_objetivo_aceptados', '2'))),
    'presion' => (string)icc_ajuste('rellamadas_presion', '1') === '1',
  ];
}

/** Siguiente dia laborable (a partir de manana) + $n-1 laborables. */
function rl_laborable(int $n = 1): string {
  $d = icc_madrid();
  while ($n > 0) { $d = $d->modify('+1 day'); if (icc_es_laborable($d)) $n--; }
  return $d->format('Y-m-d');
}

/** Clientes con presupuesto presentado sin respuesta a los que toca rellamar hoy. */
function rl_candidatos(): array {
  $cfg = rl_config();
  $db = icc_db();
  $filas = $db->query("SELECT c.id, c.razon_social, c.contacto_nombre, c.decisor_nombre, c.contacto_telefono, c.telefono, c.comercial_id, c.estado, c.valor_estimado, c.ultima_actividad, c.updated_at,
      p.id pid, p.sector, p.estado pestado, p.updated_at pact
    FROM clientes c JOIN presupuestos p ON p.id = (SELECT MAX(p2.id) FROM presupuestos p2 WHERE p2.cliente_id = c.id)
    WHERE c.estado IN ('oferta_presentada','en_cierre') AND c.no_contactar = 0 AND p.estado NOT IN ('cerrado','documentacion_contrato')
      AND NOT EXISTS (SELECT 1 FROM citas ci WHERE ci.cliente_id = c.id AND ci.fecha >= CURDATE() AND ci.estado IN ('programada','confirmada','reprogramada'))
      AND NOT EXISTS (SELECT 1 FROM rellamadas r WHERE r.cliente_id = c.id AND r.estado = 'pendiente')
    ORDER BY c.valor_estimado DESC, p.updated_at")->fetchAll();
  $out = [];
  foreach ($filas as $f) {
    if (trim((string)($f['contacto_telefono'] ?: $f['telefono'])) === '') continue;
    $ult = max(strtotime((string)$f['pact']), strtotime((string)($f['ultima_actividad'] ?: $f['updated_at'])));
    if ($ult > time() - $cfg['dias_sin_contacto'] * 86400) continue;
    // Historial de rellamadas de este cliente.
    $st = $db->prepare('SELECT estado, rellamar_desde FROM rellamadas WHERE cliente_id = ? ORDER BY id DESC LIMIT 3');
    $st->execute([$f['id']]);
    $h = $st->fetchAll();
    if ($h) {
      if (in_array($h[0]['estado'], ['acepta', 'no_acepta'], true)) continue; // ya decidido o en manos del gestor
      if ($h[0]['rellamar_desde'] && $h[0]['rellamar_desde'] > date('Y-m-d')) continue;
      if (count($h) === 3 && count(array_filter($h, function ($x) { return $x['estado'] === 'no_contesta'; })) === 3) continue; // ya escalado
    }
    $f['intento'] = count($h) + 1;
    $out[] = $f;
  }
  return $out;
}

/** Asigna las rellamadas de hoy en la agenda de backoffice. */
function rl_asignar(?int $limite = null): string {
  $cfg = rl_config();
  if (!$cfg['activo'] || !$cfg['usuario_id']) return 'Rellamadas: ' . (!$cfg['usuario_id'] ? 'no hay nadie de backoffice' : 'apagadas') . '.';
  $db = icc_db();
  $u = (int)$cfg['usuario_id'];
  $hoy = (int)$db->query("SELECT COUNT(*) FROM rellamadas WHERE usuario_id = $u AND created_at >= CURDATE()")->fetchColumn();
  $max = max($cfg['max_dia'], $cfg['objetivo']); // nunca menos trabajo que el objetivo
  $cupo = min($limite ?? $max, $max - $hoy);
  if ($cupo <= 0) return 'Rellamadas: cupo de hoy completo (' . $hoy . ').';
  $n = 0;
  foreach (rl_candidatos() as $c) {
    if ($n >= $cupo) break;
    $h = eq_primer_hueco($u, 15);
    if (!$h) break;
    $nombre = trim((string)($c['contacto_nombre'] ?: $c['decisor_nombre'])) ?: $c['razon_social'];
    $serv = ['energia' => 'luz y gas', 'telecomunicaciones' => 'telefonía', 'alarmas' => 'alarma', 'seguros' => 'seguros'][$c['sector']] ?? 'sus servicios';
    $guion = strtr(RL_GUION, ['{nombre}' => $nombre, '{servicio}' => $serv]);
    $cita = eq_crear_cita($u, (int)$c['id'], 'llamada', $h[0], $h[1], 15, (string)$c['razon_social'],
      'Rellamada de presupuesto · intento ' . $c['intento'] . ": que acepte la propuesta y empiece a ahorrar.\n\n" . $guion . "\n\nMarca el resultado en Rellamadas.", (string)($c['contacto_telefono'] ?: $c['telefono']));
    $db->prepare('INSERT INTO rellamadas (cliente_id, presupuesto_id, usuario_id, cita_id, intento, fecha) VALUES (?, ?, ?, ?, ?, ?)')
      ->execute([$c['id'], $c['pid'], $u, $cita, $c['intento'], $h[0]]);
    icc_nota_cliente((int)$c['id'], 'Jefatura de Backoffice: rellamada para aceptar el presupuesto (intento ' . $c['intento'] . ') el ' . $h[0] . ' a las ' . $h[1] . '.', 'agente:backoffice_jefe');
    $n++;
  }
  return 'Rellamadas: ' . $n . ' nuevas en la agenda' . ($hoy ? ' (' . ($hoy + $n) . ' hoy)' : '') . '.';
}

/** Numeros de una persona de backoffice. */
function rl_numeros(int $u): array {
  $db = icc_db();
  $q = function (string $sql) use ($db, $u) { $st = $db->prepare($sql); $st->execute([$u]); return (int)$st->fetchColumn(); };
  return [
    'hoy' => $q("SELECT COUNT(*) FROM rellamadas WHERE usuario_id = ? AND estado = 'pendiente' AND fecha <= CURDATE()"),
    'atrasadas' => $q("SELECT COUNT(*) FROM rellamadas WHERE usuario_id = ? AND estado = 'pendiente' AND fecha < CURDATE()"),
    'hechas_hoy' => $q("SELECT COUNT(*) FROM rellamadas WHERE usuario_id = ? AND estado <> 'pendiente' AND resuelta_en >= CURDATE()"),
    'aceptan_semana' => $q("SELECT COUNT(*) FROM rellamadas WHERE usuario_id = ? AND estado = 'acepta' AND resuelta_en >= NOW() - INTERVAL 7 DAY"),
    'hechas_semana' => $q("SELECT COUNT(*) FROM rellamadas WHERE usuario_id = ? AND estado <> 'pendiente' AND estado <> 'cancelada' AND resuelta_en >= NOW() - INTERVAL 7 DAY"),
    'ayer' => $db->query("SELECT estado, COUNT(*) n FROM rellamadas WHERE usuario_id = " . $u . " AND resuelta_en >= CURDATE() - INTERVAL 1 DAY AND resuelta_en < CURDATE() GROUP BY estado")->fetchAll(PDO::FETCH_KEY_PAIR),
    'aceptados_hoy' => $q("SELECT COUNT(*) FROM rellamadas WHERE usuario_id = ? AND estado = 'acepta' AND resuelta_en >= CURDATE()"),
  ];
}

/** Parte diario a backoffice y aviso a coordinacion si se acumulan atrasadas. */
function rl_parte(bool $forzar = false): string {
  $cfg = rl_config();
  if (!$cfg['usuario_id']) return '';
  $u = (int)$cfg['usuario_id'];
  $clave = 'rellamadas_parte_' . $u;
  if (!$forzar && (string)icc_ajuste($clave, '') === date('Y-m-d')) return 'Parte de hoy ya enviado.';
  $n = rl_numeros($u);
  $ayer = $n['ayer'];
  $txt = 'Jefatura de Backoffice: hoy tienes ' . $n['hoy'] . ' rellamada' . ($n['hoy'] === 1 ? '' : 's') . ' para que acepten su presupuesto'
    . ($n['atrasadas'] ? ' (' . $n['atrasadas'] . ' atrasadas: empieza por ellas)' : '') . '.'
    . ($ayer ? ' Ayer: ' . (int)($ayer['acepta'] ?? 0) . ' aceptaron, ' . (int)($ayer['lo_piensa'] ?? 0) . ' lo piensan, ' . (int)($ayer['no_contesta'] ?? 0) . ' no contestaron.' : '')
    . ' Objetivo de hoy: ' . $cfg['objetivo'] . ' llamadas y ' . rl_pl($cfg['objetivo_aceptados'], 'aceptado', 'aceptados') . '.'
    . ' Esta semana: ' . $n['aceptan_semana'] . ' aceptados de ' . $n['hechas_semana'] . ' llamadas. ¡A por ellos!';
  icc_notificar($u, 'cuenta', 'rellamadas', mb_substr($txt, 0, 480));
  if ($n['atrasadas'] >= 3) {
    $nombre = (string)icc_db()->query('SELECT nombre FROM usuarios WHERE id = ' . $u)->fetchColumn();
    foreach (icc_db()->query("SELECT id FROM usuarios WHERE rol IN ('coordinador','admin','super_admin') AND bloqueado = 0")->fetchAll(PDO::FETCH_COLUMN) as $d)
      icc_notificar((int)$d, 'cuenta', 'rellamadas', $nombre . ' tiene ' . $n['atrasadas'] . ' rellamadas de presupuesto atrasadas. Revísalas con ella en Rellamadas.');
  }
  icc_ajuste_guardar($clave, date('Y-m-d'));
  return 'Parte enviado (' . $n['hoy'] . ' para hoy, ' . $n['atrasadas'] . ' atrasadas).';
}

/* ===========================================================================
   PRESIÓN DURANTE LA JORNADA: objetivo, ritmo, racha y avisos
   Jornada de llamadas: 9:00-14:00 y 16:00-19:00 (480 minutos, laborables).
   ========================================================================= */
const RL_JORNADA = [['09:00', '14:00'], ['16:00', '19:00']];
function rl_pl(int $n, string $uno, string $varios): string { return $n . ' ' . ($n === 1 ? $uno : $varios); }

/** Llamadas que debería llevar a esta hora para llegar al objetivo. */
function rl_esperadas(int $objetivo, ?DateTimeImmutable $ahora = null): int {
  $ahora = $ahora ?: icc_madrid();
  if (!icc_es_laborable($ahora)) return 0;
  $min = function (string $h) { [$a, $b] = explode(':', $h); return (int)$a * 60 + (int)$b; };
  $now = $min($ahora->format('H:i')); $hecho = 0; $total = 0;
  foreach (RL_JORNADA as [$d, $h]) { $total += $min($h) - $min($d); $hecho += max(0, min($now, $min($h)) - $min($d)); }
  return (int)ceil($objetivo * $hecho / $total);
}
function rl_en_jornada(?DateTimeImmutable $ahora = null): bool {
  $ahora = $ahora ?: icc_madrid();
  if (!icc_es_laborable($ahora)) return false;
  $hm = $ahora->format('H:i');
  foreach (RL_JORNADA as [$d, $h]) if ($hm >= $d && $hm < $h) return true;
  return false;
}

/** Marcador del día: objetivo, ritmo, aceptados, racha y récord. */
function rl_marcador(int $u, ?DateTimeImmutable $ahora = null): array {
  $ahora = $ahora ?: icc_madrid();
  $cfg = rl_config();
  $db = icc_db();
  $n = rl_numeros($u);
  // Solo se le exige el trabajo que existe: si no hay más presupuestos que rellamar, el objetivo baja a lo disponible.
  $candidatas = count(rl_candidatos());
  $efectivo = max(0, min($cfg['objetivo'], $n['hechas_hoy'] + $n['hoy'] + $candidatas));
  $esperadas = min($efectivo, rl_esperadas($efectivo, $ahora));
  // Llamadas por día de los últimos 60 días (para la racha y el récord).
  $dias = $db->query("SELECT DATE(resuelta_en) d, COUNT(*) n, SUM(estado = 'acepta') a FROM rellamadas WHERE usuario_id = $u AND estado NOT IN ('pendiente','cancelada') AND resuelta_en >= CURDATE() - INTERVAL 60 DAY GROUP BY DATE(resuelta_en)")->fetchAll(PDO::FETCH_UNIQUE);
  $racha = 0;
  $d = icc_madrid()->modify('-1 day');
  for ($i = 0; $i < 60; $i++, $d = $d->modify('-1 day')) {
    if (!icc_es_laborable($d)) continue;
    if ((int)($dias[$d->format('Y-m-d')]['n'] ?? 0) >= $cfg['objetivo']) $racha++; else break;
  }
  if ($n['hechas_hoy'] >= $cfg['objetivo']) $racha++;
  $record = 0; foreach ($dias as $x) $record = max($record, (int)$x['n']);
  $valor = (float)$db->query("SELECT COALESCE(SUM(c.valor_estimado), 0) FROM rellamadas r JOIN clientes c ON c.id = r.cliente_id WHERE r.usuario_id = $u AND r.estado = 'acepta' AND r.resuelta_en >= NOW() - INTERVAL 7 DAY")->fetchColumn();
  $ultima = $db->query("SELECT MAX(resuelta_en) FROM rellamadas WHERE usuario_id = $u AND resuelta_en >= CURDATE()")->fetchColumn();
  return ['objetivo' => $cfg['objetivo'], 'objetivo_efectivo' => $efectivo, 'sin_trabajo' => $n['hoy'] + $candidatas === 0, 'candidatas' => $candidatas, 'objetivo_aceptados' => $cfg['objetivo_aceptados'], 'hechas' => $n['hechas_hoy'], 'aceptados' => $n['aceptados_hoy'],
    'esperadas' => $esperadas, 'diferencia' => $n['hechas_hoy'] - $esperadas, 'pendientes' => $n['hoy'], 'atrasadas' => $n['atrasadas'],
    'racha' => $racha, 'record' => $record, 'valor_aceptado_semana' => round($valor, 2), 'ultima_marca' => $ultima ?: null, 'en_jornada' => rl_en_jornada($ahora)];
}

/** La siguiente llamada que toca (atrasadas primero, luego por hora). */
function rl_siguiente(int $u): ?array {
  $f = icc_db()->query("SELECT c.razon_social, COALESCE(NULLIF(c.contacto_telefono, ''), c.telefono) tel FROM rellamadas r JOIN clientes c ON c.id = r.cliente_id LEFT JOIN citas ci ON ci.id = r.cita_id
    WHERE r.usuario_id = $u AND r.estado = 'pendiente' AND r.fecha <= CURDATE() ORDER BY r.fecha, ci.hora_inicio, c.valor_estimado DESC LIMIT 1")->fetch();
  return $f ?: null;
}

function rl_direccion(): array {
  return array_map('intval', icc_db()->query("SELECT id FROM usuarios WHERE rol IN ('coordinador','gerente','admin','super_admin') AND bloqueado = 0")->fetchAll(PDO::FETCH_COLUMN));
}

/** Un aviso por clave y día. Devuelve true si toca enviarlo (y lo marca). */
function rl_una_vez(int $u, string $clave): bool {
  $k = 'rellamadas_aviso_' . $u . '_' . $clave;
  if ((string)icc_ajuste($k, '') === date('Y-m-d')) return false;
  icc_ajuste_guardar($k, date('Y-m-d'));
  return true;
}

/**
 * Cron cada 15 minutos: rellamadas del día (sin depender de la Zona de agentes) y presión:
 * ritmo a las 11:30, 13:30 y 17:30, aviso si pasa 1 hora sin marcar nada, y cierre del día
 * a ella y a dirección a las 19:00.
 */
function rl_presion(?DateTimeImmutable $ahora = null): string {
  $cfg = rl_config();
  if (!$cfg['activo'] || !$cfg['usuario_id']) return 'Rellamadas apagadas o sin persona.';
  $ahora = $ahora ?: icc_madrid();
  if (!icc_es_laborable($ahora)) return 'Hoy no es laborable.';
  $u = (int)$cfg['usuario_id'];
  $hm = $ahora->format('H:i');
  $out = [];
  if ($hm >= '08:30' && $hm < '19:00') $out[] = rl_tick();
  if (!$cfg['presion']) return implode(' ', $out) ?: 'Sin presión.';
  $m = rl_marcador($u, $ahora);
  $sig = rl_siguiente($u);
  $sigTxt = $sig ? ' Siguiente: ' . $sig['razon_social'] . ($sig['tel'] ? ' (' . $sig['tel'] . ')' : '') . '.' : '';
  $nombre = (string)icc_db()->query('SELECT nombre FROM usuarios WHERE id = ' . $u)->fetchColumn();
  // 1) Ritmo en tres momentos del día (solo dentro de la hora siguiente, para no soltar avisos atrasados).
  foreach (['11:30' => '12:30', '13:30' => '14:00', '17:30' => '18:30'] as $desde => $hasta) {
    if ($hm < $desde || $hm >= $hasta || !rl_una_vez($u, 'ritmo' . str_replace(':', '', $desde))) continue;
    if ($m['sin_trabajo'] && !rl_una_vez($u, 'listadia')) continue; // «lista al día», una sola vez
    if ($m['sin_trabajo']) $txt = '✅ Lista al día: ' . rl_pl($m['hechas'], 'llamada hecha', 'llamadas hechas') . ' y no quedan presupuestos por rellamar. Aprovecha para preparar contratos y documentación.';
    elseif ($m['diferencia'] >= 0) $txt = '💪 Vas por delante: ' . $m['hechas'] . ' de ' . rl_pl($m['objetivo_efectivo'], 'llamada', 'llamadas') . ' (a esta hora tocaban ' . $m['esperadas'] . ') y ' . $m['aceptados'] . ' de ' . rl_pl($m['objetivo_aceptados'], 'aceptado', 'aceptados') . '. ¡Sigue así!' . $sigTxt;
    else $txt = '⏱️ Vas ' . -$m['diferencia'] . ' por detrás: llevas ' . rl_pl($m['hechas'], 'llamada', 'llamadas') . ' y a esta hora tocaban ' . $m['esperadas'] . ' (objetivo ' . $m['objetivo_efectivo'] . '). Te ' . ($m['pendientes'] === 1 ? 'queda 1' : 'quedan ' . $m['pendientes']) . ' en la lista. ¡Dale!' . $sigTxt;
    icc_notificar($u, 'cuenta', 'rellamadas', mb_substr($txt, 0, 480));
    $out[] = 'aviso de ritmo ' . $desde;
    // Muy por detrás a media tarde: lo sabe coordinación.
    if ($desde === '17:30' && !$m['sin_trabajo'] && $m['hechas'] < $m['esperadas'] * 0.6 && $m['esperadas'] - $m['hechas'] >= 3) foreach (rl_direccion() as $d)
      icc_notificar($d, 'cuenta', 'rellamadas', $nombre . ' lleva ' . $m['hechas'] . ' de ' . rl_pl($m['objetivo_efectivo'], 'rellamada', 'rellamadas') . ' a las 17:30 (tocaban ' . $m['esperadas'] . '). Échale un cable o revisa qué la frena.');
  }
  // 2) Una hora sin marcar nada con llamadas pendientes (máx. 4 al día, una por hora).
  if (rl_en_jornada($ahora) && $m['pendientes'] > 0) {
    $inicio = $hm >= '16:00' ? $ahora->setTime(16, 0)->getTimestamp() : $ahora->setTime(9, 0)->getTimestamp();
    // Cuenta desde la última marca o desde que empezó el tramo (lo que sea más reciente: la pausa de comer no cuenta).
    $ref = max($inicio, $m['ultima_marca'] ? (int)strtotime($m['ultima_marca']) : 0);
    $kUlt = 'rellamadas_inactiva_' . $u;
    [$fUlt, $nUlt] = array_pad(explode('|', (string)icc_ajuste($kUlt, '')), 2, '0');
    $nHoy = substr($fUlt, 0, 10) === date('Y-m-d') ? (int)$nUlt : 0;
    $t = $ahora->getTimestamp();
    if ($t - $ref >= 3600 && (!$nHoy || $t - strtotime($fUlt) >= 3600) && $nHoy < 4) {
      icc_notificar($u, 'cuenta', 'rellamadas', '📵 Llevas más de una hora sin marcar ninguna rellamada y tienes ' . rl_pl($m['pendientes'], 'pendiente', 'pendientes') . '. Coge el móvil: cada llamada es un cliente que puede empezar a ahorrar hoy.' . $sigTxt);
      icc_ajuste_guardar($kUlt, $ahora->format('Y-m-d H:i:s') . '|' . ($nHoy + 1));
      $out[] = 'aviso de inactividad';
    }
  }
  // 3) Cierre del día a ella y a dirección.
  if ($hm >= '19:00' && $hm < '21:00' && $m['objetivo_efectivo'] === 0 && $m['hechas'] === 0 && rl_una_vez($u, 'cierre')) {
    icc_notificar($u, 'cuenta', 'rellamadas', '📋 Hoy no había presupuestos por rellamar. Mañana, más.');
    $out[] = 'cierre (sin trabajo)';
  }
  if ($hm >= '19:00' && $hm < '21:00' && rl_una_vez($u, 'cierre')) {
    $ok = $m['hechas'] >= $m['objetivo_efectivo'];
    $pct = (int)round($m['hechas'] / max(1, $m['objetivo_efectivo']) * 100);
    icc_notificar($u, 'cuenta', 'rellamadas', ($ok ? '🏆 Objetivo cumplido: ' : '📋 Cierre del día: ') . $m['hechas'] . ' de ' . rl_pl($m['objetivo_efectivo'], 'llamada', 'llamadas') . ' y ' . rl_pl($m['aceptados'], 'aceptado', 'aceptados') . '.'
      . ($m['objetivo_efectivo'] < $m['objetivo'] ? ' (Hoy solo había ' . $m['objetivo_efectivo'] . ' para llamar.)' : '')
      . ($m['racha'] ? ' Racha: ' . $m['racha'] . ' día' . ($m['racha'] === 1 ? '' : 's') . ' cumpliendo.' : '') . ($ok ? ' ¡Gran día!' : ' Mañana a por ello desde primera hora.'));
    // ¿Segundo día seguido por debajo de la mitad?
    $ayer = $ahora->modify('-1 day');
    while (!icc_es_laborable($ayer)) $ayer = $ayer->modify('-1 day');
    $fa = $ayer->format('Y-m-d');
    $nAyer = (int)icc_db()->query("SELECT COUNT(*) FROM rellamadas WHERE usuario_id = $u AND estado NOT IN ('pendiente','cancelada') AND DATE(resuelta_en) = '$fa'")->fetchColumn();
    $aAyer = (int)icc_db()->query("SELECT COUNT(*) FROM rellamadas WHERE usuario_id = $u AND estado <> 'cancelada' AND fecha <= '$fa' AND (estado = 'pendiente' OR DATE(resuelta_en) >= '$fa')")->fetchColumn();
    // Segundo día seguido por debajo de la mitad, contando solo el trabajo que había.
    $dos = $pct < 50 && $aAyer > 0 && $nAyer < min($m['objetivo'], $aAyer) / 2;
    foreach (rl_direccion() as $d) icc_notificar($d, 'cuenta', 'rellamadas', 'Backoffice · ' . $nombre . ' hoy: ' . $m['hechas'] . '/' . $m['objetivo_efectivo'] . ' rellamadas (' . $pct . ' %), ' . rl_pl($m['aceptados'], 'aceptado', 'aceptados')
      . ($m['atrasadas'] ? ', ' . $m['atrasadas'] . ' atrasadas' : '') . '. ' . ($ok ? '✅ Objetivo cumplido.' : '❌ Por debajo del objetivo.') . ($dos ? ' Segundo día seguido por debajo de la mitad: hablad con ella.' : ''));
    $out[] = 'cierre del día';
  }
  return implode(' · ', $out) ?: 'Sin avisos.';
}

/** Al marcar un resultado: celebrar los objetivos en el momento en que se cumplen. */
function rl_celebrar(int $u): void {
  $m = rl_marcador($u);
  if ($m['hechas'] >= $m['objetivo'] && rl_una_vez($u, 'objetivo')) {
    icc_notificar($u, 'cuenta', 'rellamadas', '🎯 ¡Objetivo del día cumplido: ' . $m['hechas'] . ' rellamadas! Lo que hagas a partir de ahora es extra.');
  }
  if ($m['objetivo_aceptados'] > 0 && $m['aceptados'] >= $m['objetivo_aceptados'] && rl_una_vez($u, 'aceptados')) {
    icc_notificar($u, 'cuenta', 'rellamadas', '🔥 ' . rl_pl($m['aceptados'], 'presupuesto aceptado', 'presupuestos aceptados') . ' hoy: objetivo conseguido.');
    $nombre = (string)icc_db()->query('SELECT nombre FROM usuarios WHERE id = ' . $u)->fetchColumn();
    foreach (rl_direccion() as $d) icc_notificar($d, 'cuenta', 'rellamadas', '🔥 ' . $nombre . ' ya lleva ' . rl_pl($m['aceptados'], 'presupuesto aceptado', 'presupuestos aceptados') . ' hoy en rellamadas.');
  }
}

/** Turno del agente: asignar y dar el parte. */
function rl_tick(): string {
  $a = rl_asignar();
  return $a . ' ' . rl_parte();
}

/** Resultado de una rellamada (lo marca la persona). */
function rl_resultado(int $id, string $estado, string $motivo, ?string $fecha, int $uid): string {
  $db = icc_db();
  if (!isset(RL_RESULTADOS[$estado])) throw new InvalidArgumentException('Resultado no válido.');
  $st = $db->prepare('SELECT * FROM rellamadas WHERE id = ?');
  $st->execute([$id]);
  $r = $st->fetch();
  if (!$r) throw new InvalidArgumentException('Rellamada no encontrada.');
  if ($r['estado'] !== 'pendiente') throw new InvalidArgumentException('Esta rellamada ya tiene resultado.');
  if ($estado === 'no_acepta' && trim($motivo) === '') throw new InvalidArgumentException('Escribe el motivo: el gestor lo necesita para responder la objeción.');
  $c = eq_cliente((int)$r['cliente_id']);
  $cid = (int)$r['cliente_id'];
  $quien = (string)$db->query('SELECT nombre FROM usuarios WHERE id = ' . $uid)->fetchColumn();
  $rellamar = null; $hecho = '';
  switch ($estado) {
    case 'acepta':
      if ($r['presupuesto_id']) $db->prepare("UPDATE presupuestos SET estado = 'documentacion_contrato' WHERE id = ? AND estado <> 'cerrado'")->execute([$r['presupuesto_id']]);
      if ($c && $c['estado'] !== 'en_cierre') {
        $db->prepare("UPDATE clientes SET estado = 'en_cierre' WHERE id = ?")->execute([$cid]);
        $db->prepare('INSERT INTO historial_estado (cliente_id, estado_anterior, estado_nuevo, cambiado_por) VALUES (?, ?, ?, ?)')->execute([$cid, $c['estado'], 'en_cierre', $uid]);
      }
      $db->prepare("INSERT INTO equipo_tareas (origen, asignado_agente, asignado_usuario, titulo, detalle, cliente_id, vence) VALUES ('rellamadas', 'backoffice_jefe', ?, ?, ?, ?, CURDATE())")
        ->execute([$r['usuario_id'], 'Preparar el contrato de ' . ($c['razon_social'] ?? 'cliente') . ' (ha aceptado el presupuesto)', 'Pedir la documentación que falte y dejar el contrato listo para firmar hoy.', $cid]);
      if ($c && $c['comercial_id']) icc_notificar((int)$c['comercial_id'], 'cuenta', 'rellamadas', '¡' . $c['razon_social'] . ' acepta el presupuesto! (rellamada de ' . $quien . '). Backoffice prepara el contrato.', $cid);
      $hecho = 'acepta: pasa a Negociación y se prepara el contrato';
      break;
    case 'lo_piensa':
      $rellamar = $fecha && preg_match('/^\d{4}-\d{2}-\d{2}$/', $fecha) && $fecha > date('Y-m-d') ? $fecha : rl_laborable(3);
      $hecho = 'lo piensa: nueva rellamada desde el ' . $rellamar;
      break;
    case 'no_contesta':
      $st = $db->prepare("SELECT COUNT(*) FROM (SELECT estado FROM rellamadas WHERE cliente_id = ? AND id <> ? ORDER BY id DESC LIMIT 2) t WHERE estado = 'no_contesta'");
      $st->execute([$cid, $id]);
      if ((int)$st->fetchColumn() >= 2 && $c) {
        $g = $c['comercial_id'] ? (int)$c['comercial_id'] : null;
        if ($g && ($h = eq_primer_hueco($g, 15))) eq_crear_cita($g, $cid, 'llamada', $h[0], $h[1], 15, (string)$c['razon_social'], 'Backoffice no ha localizado al cliente en 3 rellamadas: prueba tú (otro teléfono, WhatsApp o visita).');
        if ($g) icc_notificar($g, 'cuenta', 'rellamadas', 'Backoffice no localiza a ' . $c['razon_social'] . ' tras 3 rellamadas: te toca a ti.', $cid);
        $hecho = 'no contesta por 3.a vez: pasa al gestor';
      } else { $rellamar = rl_laborable(1); $hecho = 'no contesta: se reintenta el ' . $rellamar; }
      break;
    case 'no_acepta':
      if ($c && $c['comercial_id']) {
        $g = (int)$c['comercial_id'];
        if ($h = eq_primer_hueco($g, 15)) eq_crear_cita($g, $cid, 'llamada', $h[0], $h[1], 15, (string)$c['razon_social'], "No acepta el presupuesto: «" . mb_substr($motivo, 0, 300) . "».\nTécnica: aislar la objeción («Aparte de eso, ¿hay algo más?») y proponer una alternativa sin descuento.");
        icc_notificar($g, 'cuenta', 'rellamadas', $c['razon_social'] . ' no acepta el presupuesto: «' . mb_substr($motivo, 0, 200) . '». Tienes una llamada para tratar la objeción.', $cid);
      }
      $hecho = 'no acepta: pasa al gestor con la objeción';
      break;
  }
  $db->prepare('UPDATE rellamadas SET estado = ?, motivo = ?, rellamar_desde = ?, resuelta_en = NOW() WHERE id = ?')->execute([$estado, mb_substr($motivo, 0, 500), $rellamar, $id]);
  if ($r['cita_id']) $db->prepare("UPDATE citas SET estado = 'realizada', notas = CONCAT(COALESCE(notas, ''), ?) WHERE id = ?")->execute(["\n\nResultado: " . RL_RESULTADOS[$estado] . ($motivo !== '' ? ' · ' . mb_substr($motivo, 0, 300) : ''), $r['cita_id']]);
  $db->prepare('UPDATE clientes SET ultima_actividad = NOW() WHERE id = ?')->execute([$cid]);
  if ((int)$r['usuario_id'] === $uid) rl_celebrar($uid);
  icc_nota_cliente($cid, 'Rellamada de presupuesto (' . $quien . '): ' . $hecho . ($motivo !== '' ? '. Nota: ' . mb_substr($motivo, 0, 400) : '') . '.', 'rellamadas', $uid);
  return ucfirst($hecho) . '.';
}
