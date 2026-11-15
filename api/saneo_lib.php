<?php
/**
 * ICC CRM · Agente de mantenimiento del pipeline (fase 6). Sin IA: reglas
 * deterministas. Corrige solo lo que el Pipeline marca como «requiere accion»:
 *
 *  - Sin proxima accion -> paso tipico de su fase y fecha real en la agenda de
 *    su gestor (maximo N al dia por gestor, laborables, 9:30-13:40 y 16:00-18:40).
 *  - Sin valor -> su ahorro estudiado; si no, lo vendido a su sector (2 ventas o
 *    mas); si no, el valor de entrada. Nunca vuelve a poner valor a un deal al
 *    que una persona se lo quito.
 *  - Sin gestor (o gestor dado de baja) -> el comercial activo con menos deals.
 *  - SLA vencido -> no se maquilla: van primero, con «Rescate (SLA vencido): ...».
 *  - Deal muerto (SLA vencido, 2 reprogramaciones y 45 dias sin actividad) ->
 *    «para revisar»: una persona lo marca perdido (con motivo) o lo mantiene.
 *
 * Cada cambio guarda su valor anterior, agrupado por pasada, y deja nota en el
 * historial del cliente. Una pasada se deshace entera (solo lo que nadie ha
 * tocado despues).
 */

const SN_SLA = ['lead_captado' => 7, 'estudio_backoffice' => 5, 'oferta_presentada' => 10, 'en_cierre' => 14];
const SN_PASO = [
  'lead_captado' => 'Llamar para cualificar y pedir una factura',
  'estudio_backoffice' => 'Revisar con el cliente el estudio de sus facturas',
  'oferta_presentada' => 'Seguimiento de la propuesta',
  'en_cierre' => 'Cerrar la firma del contrato',
];

function sn_config(): array {
  $f = json_decode((string)icc_ajuste('saneo_arreglar', ''), true);
  return [
    'auto' => (string)icc_ajuste('saneo_auto', '1') === '1',
    'arreglar' => is_array($f) ? $f + ['proximo' => true, 'valor' => true, 'gestor' => true, 'rescate' => true] : ['proximo' => true, 'valor' => true, 'gestor' => true, 'rescate' => true],
    'crear_llamadas' => (string)icc_ajuste('saneo_crear_llamadas', '0') === '1',
    'max_dia' => max(1, (int)icc_ajuste('saneo_max_dia', '15')),
    'proponer_perdidos' => (string)icc_ajuste('saneo_proponer_perdidos', '1') === '1',
    'dias_muerto' => max(7, (int)icc_ajuste('saneo_dias_muerto', '45')),
    'valor_entrada' => max(0, (float)icc_ajuste('saneo_valor_entrada', '300')),
  ];
}

/** Oportunidades abiertas con lo que les pasa. $visibles: ids de comerciales (null = todas). */
function sn_diagnostico(?array $visibles = null): array {
  $db = icc_db();
  $w = '';
  if ($visibles !== null) $w = $visibles ? ' AND c.comercial_id IN (' . implode(',', array_map('intval', $visibles)) . ')' : ' AND 0';
  $filas = $db->query("SELECT c.*, u.bloqueado gestor_baja,
      COALESCE((SELECT MAX(h.created_at) FROM historial_estado h WHERE h.cliente_id = c.id AND h.estado_nuevo = c.estado), c.created_at) fase_desde,
      (SELECT COUNT(*) FROM citas ci WHERE ci.cliente_id = c.id AND ci.fecha >= CURDATE() AND ci.estado IN ('programada','confirmada','reprogramada')) citas_futuras,
      GREATEST(COALESCE(c.ultima_actividad, '2000-01-01'), c.updated_at, COALESCE((SELECT MAX(ci.updated_at) FROM citas ci WHERE ci.cliente_id = c.id), '2000-01-01')) actividad,
      m.reprogramaciones, m.mantener_hasta, m.valor_quitado
    FROM clientes c LEFT JOIN usuarios u ON u.id = c.comercial_id LEFT JOIN saneo_memoria m ON m.cliente_id = c.id
    WHERE c.estado IN ('lead_captado','estudio_backoffice','oferta_presentada','en_cierre') $w")->fetchAll();
  $cfg = sn_config();
  $out = [];
  foreach ($filas as $c) {
    $p = [];
    $dias = (int)floor((time() - strtotime($c['fase_desde'])) / 86400);
    $sla = $dias > (SN_SLA[$c['estado']] ?? 30);
    if (!(int)$c['citas_futuras'] && (!$c['proximo_contacto'] || strtotime($c['proximo_contacto']) < time())) $p[] = 'proximo';
    if ((float)$c['valor_estimado'] <= 0) $p[] = 'valor';
    if (!$c['comercial_id'] || (int)$c['gestor_baja'] === 1) $p[] = 'gestor';
    if ($sla) $p[] = 'sla';
    $inactivo = (int)floor((time() - strtotime($c['actividad'])) / 86400);
    $mantener = $c['mantener_hasta'] && $c['mantener_hasta'] >= date('Y-m-d');
    if ($sla && (int)$c['reprogramaciones'] >= 2 && $inactivo >= $cfg['dias_muerto'] && !$mantener) $p[] = 'muerto';
    if ($p) $out[] = ['c' => $c, 'problemas' => $p, 'dias_fase' => $dias, 'inactivo' => $inactivo];
  }
  // SLA vencidos primero.
  usort($out, function ($a, $b) { return (int)in_array('sla', $b['problemas'], true) - (int)in_array('sla', $a['problemas'], true) ?: $b['dias_fase'] <=> $a['dias_fase']; });
  return $out;
}

function sn_contadores(?array $visibles = null): array {
  $n = ['proximo' => 0, 'valor' => 0, 'gestor' => 0, 'sla' => 0, 'muerto' => 0, 'total' => 0];
  foreach (sn_diagnostico($visibles) as $d) { $n['total']++; foreach ($d['problemas'] as $p) $n[$p]++; }
  return $n;
}

function sn_valor(array $c): array {
  $db = icc_db();
  $st = $db->prepare('SELECT GREATEST(COALESCE((SELECT MAX(ahorro_estimado) FROM estudios WHERE cliente_id = ?), 0), COALESCE((SELECT MAX(ahorro_anual) FROM cmp_ene_informes WHERE cliente_id = ?), 0), COALESCE((SELECT MAX(ahorro_anual) FROM cmp_tel_informes WHERE cliente_id = ?), 0))');
  try { $st->execute([$c['id'], $c['id'], $c['id']]); $v = (float)$st->fetchColumn(); } catch (Throwable $e) { $v = 0; }
  if ($v > 0) return [round($v, 2), 'su ahorro estudiado'];
  if ($c['sector'] !== '') {
    $st = $db->prepare("SELECT COUNT(*), AVG(valor_estimado) FROM clientes WHERE estado = 'cliente_activo' AND sector = ? AND valor_estimado > 0");
    $st->execute([$c['sector']]);
    [$n, $media] = $st->fetch(PDO::FETCH_NUM);
    if ((int)$n >= 2) return [round((float)$media, 2), 'lo vendido a su sector (' . (int)$n . ' ventas)'];
  }
  return [sn_config()['valor_entrada'], 'el valor de entrada'];
}

/** Siguiente hueco del gestor respetando el maximo diario de esta pasada. */
function sn_hueco(int $gestor, array &$usados, int $max): ?array {
  $d = icc_madrid();
  for ($i = 0; $i < 15; $i++) {
    if ($i > 0 || $d->format('H:i') >= '18:00') $d = $d->modify('+1 day');
    if (!icc_es_laborable($d)) continue;
    $f = $d->format('Y-m-d');
    $clave = $gestor . '|' . $f;
    $st = icc_db()->prepare("SELECT COUNT(*) FROM clientes WHERE comercial_id = ? AND DATE(proximo_contacto) = ? AND estado NOT IN ('cliente_activo','perdido')");
    $st->execute([$gestor, $f]);
    $ya = (int)$st->fetchColumn();
    if ($ya + ($usados[$clave] ?? 0) >= $max) continue;
    $huecos = function_exists('eq_huecos') ? eq_huecos($gestor, $f, 20) : ['10:00'];
    // Quita los huecos ya repartidos en esta pasada.
    $huecos = array_values(array_diff($huecos, $usados['h|' . $clave] ?? []));
    if ($i === 0) $huecos = array_values(array_filter($huecos, function ($h) use ($d) { return $h > $d->modify('+30 minutes')->format('H:i'); }));
    if (!$huecos) continue;
    $usados[$clave] = ($usados[$clave] ?? 0) + 1;
    $usados['h|' . $clave][] = $huecos[0];
    return [$f, $huecos[0]];
  }
  return null;
}

/** Una pasada. Devuelve ['lote', 'cambios', 'texto']. */
function sn_pasada(string $origen = 'cron', ?int $usuarioId = null, ?array $visibles = null): array {
  $db = icc_db();
  $cfg = sn_config();
  $lote = bin2hex(random_bytes(8));
  $cambios = 0;
  $usados = [];
  $reg = function (int $cid, string $prob, string $campo, $antes, $despues, ?int $cita = null) use ($db, $lote, $origen, $usuarioId, &$cambios) {
    $db->prepare('INSERT INTO saneo_registro (lote, origen, usuario_id, cliente_id, problema, campo, antes, despues, cita_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      ->execute([$lote, $origen, $usuarioId, $cid, $prob, $campo, $antes === null ? null : (string)$antes, $despues === null ? null : (string)$despues, $cita]);
    $cambios++;
  };
  $resumen = ['proximo' => 0, 'valor' => 0, 'gestor' => 0, 'rescate' => 0, 'revisar' => 0];
  // Memoria: valores quitados a mano desde la ultima pasada.
  $db->exec("INSERT INTO saneo_memoria (cliente_id, valor_quitado) SELECT r.cliente_id, 1 FROM saneo_registro r JOIN clientes c ON c.id = r.cliente_id
             WHERE r.campo = 'valor_estimado' AND r.deshecho = 0 AND COALESCE(c.valor_estimado, 0) = 0 AND r.id = (SELECT MAX(r2.id) FROM saneo_registro r2 WHERE r2.cliente_id = r.cliente_id AND r2.campo = 'valor_estimado')
             ON DUPLICATE KEY UPDATE valor_quitado = 1");
  foreach (sn_diagnostico($visibles) as $d) {
    $c = $d['c'];
    $cid = (int)$c['id'];
    $notas = [];
    if (in_array('gestor', $d['problemas'], true) && $cfg['arreglar']['gestor'] && function_exists('eq_gestor_menos_cargado')) {
      $g = eq_gestor_menos_cargado($c['comercial_id'] ? (int)$c['comercial_id'] : null);
      if ($g) {
        $db->prepare('UPDATE clientes SET comercial_id = ? WHERE id = ?')->execute([$g, $cid]);
        $reg($cid, 'gestor', 'comercial_id', $c['comercial_id'], $g);
        $c['comercial_id'] = $g;
        $notas[] = 'gestor asignado (el de menos carga)';
        $resumen['gestor']++;
        icc_notificar($g, 'cuenta', 'saneo', 'Te han asignado ' . $c['razon_social'] . ' (mantenimiento del pipeline).', $cid);
      }
    }
    if (in_array('valor', $d['problemas'], true) && $cfg['arreglar']['valor'] && !(int)$c['valor_quitado']) {
      [$v, $de] = sn_valor($c);
      if ($v > 0) {
        $db->prepare('UPDATE clientes SET valor_estimado = ? WHERE id = ?')->execute([$v, $cid]);
        $reg($cid, 'valor', 'valor_estimado', $c['valor_estimado'], $v);
        $notas[] = 'valor estimado ' . number_format($v, 0, ',', '.') . ' € (' . $de . ')';
        $resumen['valor']++;
      }
    }
    $sla = in_array('sla', $d['problemas'], true);
    if (in_array('muerto', $d['problemas'], true) && $cfg['proponer_perdidos']) {
      $resumen['revisar']++;
      continue; // Lo decide una persona: no se toca.
    }
    if (in_array('proximo', $d['problemas'], true) && $c['comercial_id'] && (($sla && $cfg['arreglar']['rescate']) || (!$sla && $cfg['arreglar']['proximo']))) {
      $h = sn_hueco((int)$c['comercial_id'], $usados, $cfg['max_dia']);
      if ($h) {
        $paso = ($sla ? 'Rescate (SLA vencido): ' : '') . (SN_PASO[$c['estado']] ?? 'Seguimiento');
        $cuando = $h[0] . ' ' . $h[1] . ':00';
        $db->prepare('UPDATE clientes SET proximo_paso = ?, proximo_contacto = ? WHERE id = ?')->execute([$paso, $cuando, $cid]);
        $reg($cid, $sla ? 'sla' : 'proximo', 'proximo_paso', $c['proximo_paso'], $paso);
        $reg($cid, $sla ? 'sla' : 'proximo', 'proximo_contacto', $c['proximo_contacto'], $cuando);
        $cita = null;
        if ($cfg['crear_llamadas'] && function_exists('eq_crear_cita')) {
          $cita = eq_crear_cita((int)$c['comercial_id'], $cid, 'llamada', $h[0], $h[1], 20, $c['razon_social'], 'Mantenimiento del pipeline: ' . $paso, (string)($c['contacto_telefono'] ?: $c['telefono']), (string)($c['contacto_email'] ?: $c['email']));
          $reg($cid, $sla ? 'sla' : 'proximo', 'cita', null, $cita, $cita);
        }
        if ($c['proximo_contacto']) {
          $db->prepare('INSERT INTO saneo_memoria (cliente_id, reprogramaciones) VALUES (?, 1) ON DUPLICATE KEY UPDATE reprogramaciones = reprogramaciones + 1')->execute([$cid]);
        }
        $notas[] = $paso . ' el ' . date('d/m', strtotime($h[0])) . ' a las ' . $h[1] . ($cita ? ' (llamada en la agenda)' : '');
        $resumen[$sla ? 'rescate' : 'proximo']++;
      }
    }
    if ($notas) icc_nota_cliente($cid, 'Mantenimiento del pipeline: ' . implode('; ', $notas) . '.', 'saneo', $usuarioId);
  }
  icc_ajuste_guardar('saneo_ultima', date('Y-m-d H:i:s') . '|' . $lote . '|' . $cambios);
  $t = $cambios ? "Pasada: {$resumen['proximo']} próximos pasos, {$resumen['rescate']} rescates, {$resumen['valor']} valores, {$resumen['gestor']} gestores" : 'Pasada sin cambios';
  if ($resumen['revisar']) $t .= " · {$resumen['revisar']} para revisar";
  return ['lote' => $lote, 'cambios' => $cambios, 'texto' => $t . '.', 'resumen' => $resumen];
}

/** Deshace una pasada entera: solo lo que nadie ha tocado despues. */
function sn_deshacer(string $lote, ?int $usuarioId = null): array {
  $db = icc_db();
  $st = $db->prepare('SELECT * FROM saneo_registro WHERE lote = ? AND deshecho = 0 ORDER BY id DESC');
  $st->execute([$lote]);
  $hechos = 0; $saltados = 0;
  foreach ($st->fetchAll() as $r) {
    $ok = false;
    if ($r['campo'] === 'cita') {
      $del = $db->prepare("DELETE FROM citas WHERE id = ? AND estado = 'programada' AND updated_at <= created_at + INTERVAL 5 SECOND");
      $del->execute([$r['cita_id']]);
      $ok = $del->rowCount() > 0;
    } else {
      $campo = in_array($r['campo'], ['comercial_id', 'valor_estimado', 'proximo_paso', 'proximo_contacto'], true) ? $r['campo'] : null;
      if ($campo) {
        $act = $db->prepare("SELECT $campo FROM clientes WHERE id = ?");
        $act->execute([$r['cliente_id']]);
        $ahora = $act->fetchColumn();
        $igual = $campo === 'valor_estimado' ? abs((float)$ahora - (float)$r['despues']) < 0.01 : (string)$ahora === (string)$r['despues'];
        if ($igual) {
          $db->prepare("UPDATE clientes SET $campo = ? WHERE id = ?")->execute([$r['antes'] === null || $r['antes'] === '' ? ($campo === 'proximo_paso' ? '' : null) : $r['antes'], $r['cliente_id']]);
          $ok = true;
        }
      }
    }
    if ($ok) { $db->prepare('UPDATE saneo_registro SET deshecho = 1 WHERE id = ?')->execute([$r['id']]); $hechos++; }
    else $saltados++;
  }
  if ($hechos) {
    $db->prepare('UPDATE saneo_memoria m JOIN (SELECT DISTINCT cliente_id FROM saneo_registro WHERE lote = ? AND campo = "proximo_contacto" AND antes IS NOT NULL) x ON x.cliente_id = m.cliente_id SET m.reprogramaciones = GREATEST(0, m.reprogramaciones - 1)')->execute([$lote]);
    $ids = $db->prepare('SELECT DISTINCT cliente_id FROM saneo_registro WHERE lote = ? AND deshecho = 1');
    $ids->execute([$lote]);
    foreach ($ids->fetchAll(PDO::FETCH_COLUMN) as $cid) icc_nota_cliente((int)$cid, 'Se ha deshecho la pasada del mantenimiento del pipeline.', 'saneo', $usuarioId);
  }
  return ['deshechos' => $hechos, 'saltados' => $saltados];
}

/** Candidatos a deal muerto (para que una persona decida). */
function sn_candidatos(?array $visibles = null): array {
  $out = [];
  foreach (sn_diagnostico($visibles) as $d) if (in_array('muerto', $d['problemas'], true)) {
    $c = $d['c'];
    $out[] = ['id' => (int)$c['id'], 'razon_social' => $c['razon_social'], 'fase' => $c['estado'], 'dias_fase' => $d['dias_fase'], 'inactivo' => $d['inactivo'], 'reprogramaciones' => (int)$c['reprogramaciones'], 'valor' => (float)$c['valor_estimado']];
  }
  return $out;
}

/** Bloque del cron (cada hora). */
function sn_tick(): string {
  if (!sn_config()['auto']) return 'Automático apagado.';
  return sn_pasada('cron')['texto'];
}
