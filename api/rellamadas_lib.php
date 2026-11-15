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
    'max_dia' => max(1, min(60, (int)icc_ajuste('rellamadas_max_dia', '15'))),
    'dias_sin_contacto' => max(1, min(30, (int)icc_ajuste('rellamadas_dias', '2'))),
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
  $cupo = min($limite ?? $cfg['max_dia'], $cfg['max_dia'] - $hoy);
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
  icc_nota_cliente($cid, 'Rellamada de presupuesto (' . $quien . '): ' . $hecho . ($motivo !== '' ? '. Nota: ' . mb_substr($motivo, 0, 400) : '') . '.', 'rellamadas', $uid);
  return ucfirst($hecho) . '.';
}
