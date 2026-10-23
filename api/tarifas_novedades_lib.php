<?php
/**
 * ICC CRM · Novedades de tarifas: registro automatico de lo que cambia
 * tramitacion en los comparadores (energia, telefonia y comisiones).
 *
 * Lo usan api/cmp_energia.php y api/cmp_telefonia.php al guardar o borrar.
 * Si no esta importada sql/migracion_tarifas_novedades.sql, no hace nada:
 * nunca debe romper el guardado de una tarifa.
 */

/** true si existe la tabla de novedades. */
function nov_disponible(): bool {
  static $ok = null;
  if ($ok === null) {
    try {
      icc_db()->query('SELECT 1 FROM tarifas_novedades LIMIT 0');
      $ok = true;
    } catch (PDOException $e) {
      $ok = false;
    }
  }
  return $ok;
}

/** Numero con coma decimal y sin ceros sobrantes (0,1290 -> 0,129). */
function nov_num(float $v, int $dec = 6): string {
  $s = rtrim(rtrim(number_format($v, $dec, ',', '.'), '0'), ',');
  return $s === '' || $s === '-0' ? '0' : $s;
}

/**
 * Compara dos valores numericos y devuelve el cambio listo para mostrar.
 * sentido: 'baja' (mejor precio para el cliente), 'sube' o 'igual'.
 */
function nov_cambio_num(string $label, float $antes, float $despues, string $unidad, int $dec = 6): ?array {
  if (abs($antes - $despues) < 0.0000005) return null;
  $pct = $antes > 0 ? round(($despues - $antes) / $antes * 100, 1) : null;
  return [
    'label' => $label,
    'antes' => nov_num($antes, $dec),
    'despues' => nov_num($despues, $dec),
    'unidad' => $unidad,
    'pct' => $pct,
    'sentido' => $despues < $antes ? 'baja' : 'sube',
  ];
}

function nov_cambio_txt(string $label, $antes, $despues): ?array {
  $a = trim((string)$antes);
  $d = trim((string)$despues);
  if ($a === $d) return null;
  return ['label' => $label, 'antes' => $a === '' ? '—' : $a, 'despues' => $d === '' ? '—' : $d, 'unidad' => '', 'pct' => null, 'sentido' => 'igual'];
}

/** Tendencia global de una lista de cambios: 'baja', 'sube', 'mixta' o 'neutra'. */
function nov_tendencia(array $cambios): string {
  $bajan = 0;
  $suben = 0;
  foreach ($cambios as $c) {
    if (($c['sentido'] ?? '') === 'baja') $bajan++;
    if (($c['sentido'] ?? '') === 'sube') $suben++;
  }
  if ($bajan && !$suben) return 'baja';
  if ($suben && !$bajan) return 'sube';
  if ($bajan && $suben) return 'mixta';
  return 'neutra';
}

/** Resumen corto de un cambio: "energía P1 0,129 → 0,124 €/kWh (−3,9 %)". */
function nov_texto_cambio(array $c): string {
  $t = $c['label'] . ' ' . $c['antes'] . ' → ' . $c['despues'] . ($c['unidad'] ? ' ' . $c['unidad'] : '');
  if ($c['pct'] !== null) $t .= ' (' . ($c['pct'] > 0 ? '+' : '−') . str_replace('.', ',', (string)abs($c['pct'])) . ' %)';
  return $t;
}

/**
 * Guarda una novedad y avisa al equipo. $detalle se guarda como JSON.
 * Nunca lanza: si algo falla se registra en el log y el guardado sigue.
 */
function nov_registrar(string $tipo, string $accion, string $titulo, array $detalle, ?int $referenciaId, ?int $autorId): void {
  if (!nov_disponible()) return;
  try {
    $titulo = function_exists('mb_substr') ? mb_substr($titulo, 0, 255) : substr($titulo, 0, 255);
    $db = icc_db();
    $db->prepare('INSERT INTO tarifas_novedades (tipo, accion, titulo, detalle, referencia_id, autor_id) VALUES (?, ?, ?, ?, ?, ?)')
      ->execute([$tipo, $accion, $titulo, json_encode($detalle, JSON_UNESCAPED_UNICODE), $referenciaId, $autorId]);
    nov_notificar_equipo($titulo, $autorId);
  } catch (Throwable $e) {
    error_log('ICC novedades de tarifas: ' . $e->getMessage());
  }
}

/**
 * Aviso en la campana a quien usa los comparadores (menos a quien hizo el
 * cambio). Para no inundar: si el usuario ya tiene un aviso de novedades sin
 * leer de los ultimos 30 minutos, se actualiza ese mismo aviso con el total.
 */
function nov_notificar_equipo(string $titulo, ?int $autorId): void {
  $db = icc_db();
  $usuarios = $db->query('SELECT id, rol FROM usuarios WHERE bloqueado = 0')->fetchAll();
  $buscar = $db->prepare(
    "SELECT id, mensaje FROM notificaciones
     WHERE user_id = ? AND tipo = 'tarifas_novedades' AND leido = 0 AND created_at >= (NOW() - INTERVAL 30 MINUTE)
     ORDER BY id DESC LIMIT 1"
  );
  $actualizar = $db->prepare('UPDATE notificaciones SET mensaje = ?, created_at = NOW() WHERE id = ?');
  $corto = function_exists('mb_substr') ? mb_substr($titulo, 0, 160) : substr($titulo, 0, 160);
  foreach ($usuarios as $u) {
    if ($autorId !== null && (int)$u['id'] === $autorId) continue;
    if (!icc_tiene_permiso(['id' => (int)$u['id'], 'rol' => $u['rol']], 'comparador.usar')) continue;
    $buscar->execute([$u['id']]);
    $previa = $buscar->fetch();
    if ($previa) {
      // "🔔 3 novedades de tarifas · la última: ..."
      $n = preg_match('/^🔔 (\d+) novedades/u', $previa['mensaje'], $m) ? (int)$m[1] + 1 : 2;
      $actualizar->execute(['🔔 ' . $n . ' novedades de tarifas · la última: ' . $corto, $previa['id']]);
    } else {
      icc_notificar((int)$u['id'], 'tarifas', 'tarifas_novedades', '🔔 Novedad de tarifas: ' . $corto);
    }
  }
}

// ----------------------------------------------------------------- ENERGIA

/** Etiquetas y unidades de los campos de una tarifa de energia. */
function nov_ene_campos(string $tipoSuministro): array {
  $energia = $tipoSuministro === 'gas' ? 'término variable' : 'energía';
  $campos = [];
  for ($i = 1; $i <= 6; $i++) $campos['pe' . $i] = [$energia . ' P' . $i, '€/kWh'];
  for ($i = 1; $i <= 6; $i++) $campos['pp' . $i] = ['potencia P' . $i, '€/kW·día'];
  $campos['termino_fijo_dia'] = ['término fijo', '€/día'];
  $campos['ssaa_kwh'] = ['servicios de ajuste', '€/kWh'];
  $campos['compensacion_kwh'] = ['compensación excedentes', '€/kWh'];
  return $campos;
}

function nov_ene_nombre(array $t): string {
  return $t['comercializadora'] . ' · ' . $t['nombre'] . ' (' . $t['peaje'] . ')';
}

/** Novedad tras crear o editar una tarifa de energia ($antes = null al crearla). */
function nov_ene_guardada(?array $antes, array $despues, int $autorId): void {
  if (!nov_disponible()) return;
  $nombre = nov_ene_nombre($despues);
  $etiquetaTipo = $despues['tipo'] === 'gas' ? 'gas' : 'luz';
  if ($antes === null) {
    $precios = [];
    foreach (nov_ene_campos($despues['tipo']) as $c => $def) {
      if ((float)$despues[$c] > 0) $precios[] = ['label' => $def[0], 'antes' => '', 'despues' => nov_num((float)$despues[$c]), 'unidad' => $def[1], 'pct' => null, 'sentido' => 'igual'];
    }
    $accion = (int)$despues['activo'] === 1 ? 'alta' : 'cambio';
    $titulo = 'Nueva tarifa de ' . $etiquetaTipo . ': ' . $nombre . ((int)$despues['activo'] === 1 ? '' : ' (desactivada)');
    nov_registrar('energia', $accion, $titulo, [
      'tendencia' => 'neutra', 'cambios' => $precios, 'tarifa' => nov_ene_ficha($despues),
    ], (int)$despues['id'], $autorId);
    return;
  }

  $cambios = [];
  foreach (nov_ene_campos($despues['tipo']) as $c => $def) {
    $cm = nov_cambio_num($def[0], (float)$antes[$c], (float)$despues[$c], $def[1]);
    if ($cm) $cambios[] = $cm;
  }
  if ((int)$antes['permanencia_meses'] !== (int)$despues['permanencia_meses']) {
    $cambios[] = ['label' => 'permanencia', 'antes' => (int)$antes['permanencia_meses'] . ' meses', 'despues' => (int)$despues['permanencia_meses'] . ' meses',
      'unidad' => '', 'pct' => null, 'sentido' => (int)$despues['permanencia_meses'] < (int)$antes['permanencia_meses'] ? 'baja' : 'sube'];
  }
  $textos = [
    'comercializadora' => 'comercializadora', 'nombre' => 'nombre', 'peaje' => 'peaje', 'modalidad' => 'modalidad',
    'cliente' => 'tipo de cliente', 'rol' => 'catálogo', 'comision_tramos' => 'comisión', 'valoracion' => 'valoración',
  ];
  foreach ($textos as $c => $label) {
    $cm = nov_cambio_txt($label, $antes[$c] ?? '', $despues[$c] ?? '');
    if ($cm) $cambios[] = $cm;
  }
  if (trim((string)($antes['ventajas'] ?? '')) !== trim((string)($despues['ventajas'] ?? ''))) {
    $cambios[] = ['label' => 'argumentario de venta', 'antes' => '', 'despues' => 'actualizado', 'unidad' => '', 'pct' => null, 'sentido' => 'igual'];
  }

  $activaAntes = (int)$antes['activo'] === 1;
  $activaAhora = (int)$despues['activo'] === 1;
  if (!$cambios && $activaAntes === $activaAhora) return; // se guardo sin cambiar nada

  if ($activaAntes && !$activaAhora) {
    $accion = 'baja';
    $titulo = 'Retirada del catálogo: ' . $nombre;
  } elseif (!$activaAntes && $activaAhora) {
    $accion = 'alta';
    $titulo = 'Vuelve al catálogo: ' . $nombre;
  } else {
    $accion = 'cambio';
    $precios = array_values(array_filter($cambios, function ($c) { return $c['pct'] !== null; }));
    if (count($precios) === 1) {
      $titulo = $nombre . ': ' . nov_texto_cambio($precios[0]);
    } elseif ($precios) {
      $tend = nov_tendencia($precios);
      $titulo = $nombre . ': ' . ($tend === 'baja' ? 'bajan' : ($tend === 'sube' ? 'suben' : 'cambian')) . ' ' . count($precios) . ' precios';
    } else {
      $titulo = $nombre . ': ' . implode(', ', array_map(function ($c) { return $c['label']; }, array_slice($cambios, 0, 3))) . ' actualizado';
    }
  }
  nov_registrar('energia', $accion, $titulo, [
    'tendencia' => nov_tendencia($cambios), 'cambios' => $cambios, 'tarifa' => nov_ene_ficha($despues),
  ], (int)$despues['id'], $autorId);
}

/** Novedad al borrar una tarifa de energia. */
function nov_ene_borrada(array $antes, int $autorId): void {
  nov_registrar('energia', 'baja', 'Tarifa eliminada: ' . nov_ene_nombre($antes), [
    'tendencia' => 'neutra', 'cambios' => [], 'tarifa' => nov_ene_ficha($antes),
  ], (int)$antes['id'], $autorId);
}

/** Datos minimos de la tarifa para pintar la ficha de la novedad. */
function nov_ene_ficha(array $t): array {
  return [
    'comercializadora' => $t['comercializadora'], 'nombre' => $t['nombre'], 'peaje' => $t['peaje'],
    'suministro' => $t['tipo'], 'modalidad' => $t['modalidad'], 'cliente' => $t['cliente'], 'rol' => $t['rol'],
  ];
}

// --------------------------------------------------------------- TELEFONIA

/** Novedad tras guardar un perfil de tarifas de mercado ($antes = null si es nuevo). */
function nov_tel_perfil_guardado(?array $antesDatos, array $despuesDatos, string $nombre, int $id, int $autorId): void {
  if (!nov_disponible()) return;
  $opsDespues = nov_tel_ops($despuesDatos);
  if ($antesDatos === null) {
    $lineas = [];
    foreach ($opsDespues as $op => $o) {
      $lineas[] = ['label' => $op, 'antes' => '', 'despues' => nov_num((float)($o['cuota'] ?? 0), 2), 'unidad' => '€/mes', 'pct' => null, 'sentido' => 'igual'];
    }
    nov_registrar('telefonia', 'alta', 'Nuevo perfil de tarifas de telefonía: ' . $nombre . ' (' . count($opsDespues) . (count($opsDespues) === 1 ? ' operadora)' : ' operadoras)'),
      ['tendencia' => 'neutra', 'cambios' => $lineas, 'perfil' => $nombre], $id, $autorId);
    return;
  }
  $opsAntes = nov_tel_ops($antesDatos);
  $cambios = [];
  foreach ($opsDespues as $op => $o) {
    if (!isset($opsAntes[$op])) {
      $cambios[] = ['label' => $op, 'antes' => 'no estaba', 'despues' => nov_num((float)($o['cuota'] ?? 0), 2) . ' €/mes', 'unidad' => '', 'pct' => null, 'sentido' => 'igual'];
      continue;
    }
    $a = $opsAntes[$op];
    $cm = nov_cambio_num($op . ' · cuota', (float)($a['cuota'] ?? 0), (float)($o['cuota'] ?? 0), '€/mes', 2);
    if ($cm) $cambios[] = $cm;
    $promoA = trim(($a['promoPrecio'] ?? '') . ' ' . ($a['promoMeses'] ?? '') . ' ' . ($a['promoTexto'] ?? ''));
    $promoD = trim(($o['promoPrecio'] ?? '') . ' ' . ($o['promoMeses'] ?? '') . ' ' . ($o['promoTexto'] ?? ''));
    if ($promoA !== $promoD) $cambios[] = ['label' => $op . ' · promoción', 'antes' => $promoA ?: '—', 'despues' => $promoD ?: '—', 'unidad' => '', 'pct' => null, 'sentido' => 'igual'];
  }
  foreach ($opsAntes as $op => $a) {
    if (!isset($opsDespues[$op])) {
      $cambios[] = ['label' => $op, 'antes' => nov_num((float)($a['cuota'] ?? 0), 2) . ' €/mes', 'despues' => 'retirada', 'unidad' => '', 'pct' => null, 'sentido' => 'igual'];
    }
  }
  if (trim((string)($antesDatos['fechaTarifas'] ?? '')) !== trim((string)($despuesDatos['fechaTarifas'] ?? ''))) {
    $cambios[] = nov_cambio_txt('fecha de tarifas', $antesDatos['fechaTarifas'] ?? '', $despuesDatos['fechaTarifas'] ?? '');
  }
  $cambios = array_values(array_filter($cambios));
  if (!$cambios) return;
  $cuotas = array_values(array_filter($cambios, function ($c) { return $c['pct'] !== null; }));
  if (count($cuotas) === 1 && count($cambios) === 1) {
    $titulo = 'Telefonía · ' . $nombre . ': ' . nov_texto_cambio($cuotas[0]);
  } else {
    $titulo = 'Telefonía · ' . $nombre . ': ' . count($cambios) . ' ' . (count($cambios) === 1 ? 'cambio' : 'cambios') .
      ($cuotas ? ' (' . count($cuotas) . ' de cuota)' : '');
  }
  nov_registrar('telefonia', 'cambio', $titulo, ['tendencia' => nov_tendencia($cambios), 'cambios' => $cambios, 'perfil' => $nombre], $id, $autorId);
}

/** Operadoras de un perfil indexadas por nombre. */
function nov_tel_ops(array $datos): array {
  $out = [];
  foreach (($datos['ops'] ?? []) as $o) {
    if (!is_array($o)) continue;
    $n = trim((string)($o['nombre'] ?? ''));
    if ($n !== '') $out[$n] = $o;
  }
  return $out;
}

function nov_tel_perfil_borrado(string $nombre, int $id, int $autorId): void {
  nov_registrar('telefonia', 'baja', 'Perfil de tarifas de telefonía eliminado: ' . $nombre, ['tendencia' => 'neutra', 'cambios' => [], 'perfil' => $nombre], $id, $autorId);
}

/**
 * Novedad resumen tras guardar la tabla de comisiones (se guardan todas de
 * golpe): una sola novedad con los importes que han cambiado.
 */
function nov_tel_comisiones(array $antes, array $despues, int $autorId): void {
  if (!nov_disponible()) return;
  $cambios = [];
  foreach ($despues as $id => $d) {
    if (!isset($antes[$id])) continue;
    $a = $antes[$id];
    $etiqueta = trim($d['marca'] . ' · ' . $d['concepto'] . ($d['tramo'] !== '' && $d['tramo'] !== null ? ' ' . $d['tramo'] : ''));
    $cm = nov_cambio_num($etiqueta, (float)$a['importe'], (float)$d['importe'], '€', 2);
    if ($cm) {
      // En comisiones subir es bueno para el comercial: se marca al reves que un precio.
      $cm['sentido'] = $cm['sentido'] === 'sube' ? 'baja' : 'sube';
      $cm['es_comision'] = true;
      $cambios[] = $cm;
    }
    $aa = $a['importe_alta'] !== null ? (float)$a['importe_alta'] : null;
    $da = $d['importe_alta'] !== null ? (float)$d['importe_alta'] : null;
    if ($aa !== $da) {
      $cambios[] = ['label' => $etiqueta . ' · alta', 'antes' => $aa === null ? '—' : nov_num($aa, 2), 'despues' => $da === null ? '—' : nov_num($da, 2),
        'unidad' => '€', 'pct' => null, 'sentido' => 'igual', 'es_comision' => true];
    }
  }
  if (!$cambios) return;
  $suben = count(array_filter($cambios, function ($c) { return ($c['pct'] ?? null) !== null && $c['sentido'] === 'baja'; }));
  $titulo = 'Comisiones de telefonía actualizadas: ' . count($cambios) . ' ' . (count($cambios) === 1 ? 'cambio' : 'cambios') .
    ($suben ? ' (' . $suben . ' suben)' : '');
  nov_registrar('telefonia', 'cambio', $titulo, ['tendencia' => nov_tendencia($cambios), 'cambios' => $cambios, 'comisiones' => true], null, $autorId);
}
