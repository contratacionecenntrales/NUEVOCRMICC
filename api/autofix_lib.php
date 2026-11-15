<?php
/**
 * ICC CRM · Autocorrector (mantenimiento automatico con memoria).
 *
 * Cada 10 minutos (cron, tambien de noche) revisa todos los procesos y arregla
 * solo lo que «requiere accion»:
 *  - Puesta en marcha: enciende lo que es un interruptor (agentes, automatizaciones,
 *    mantenimiento, aprendizaje, Jarvis).
 *  - Pipeline: pasa el mantenimiento al momento (proximo paso, valor, gestor,
 *    rescate) con llamadas; a los deals muertos les da una llamada de rescate y,
 *    si siguen igual a los 14 dias, los pasa a perdido con recontacto a 90 dias.
 *  - Correo: vuelve a probar los buzones con error y reprocesa los correos atascados.
 *  - Motor: reintenta los envios con error temporal.
 *  - Agente de voz: llamadas sin informe o con error -> llamada del gestor.
 *  - Cron: vuelve a ejecutar el bloque que fallo.
 * Lo que necesita a una persona (claves, contrasenas, cron del hosting, aprobar
 * correos...) se avisa a direccion con instrucciones, una vez al dia.
 *
 * Memoria (autofix_memoria): cada incidencia con su clave, intentos y veces. Tras
 * 3 intentos fallidos deja de insistir y pasa a una persona; si un problema se
 * repite, lo anota en el cerebro de la empresa.
 */
require_once __DIR__ . '/agentes_lib.php';
require_once __DIR__ . '/saneo_lib.php';
require_once __DIR__ . '/correo_agentes_lib.php';
require_once __DIR__ . '/flujos_lib.php';
require_once __DIR__ . '/aprendizaje_lib.php';
require_once __DIR__ . '/cron_lib.php';

function af_config(): array {
  return [
    'activo' => (string)icc_ajuste('autofix_activo', '1') === '1',
    'perdidos' => (string)icc_ajuste('autofix_perdidos', '1') === '1',
    'interruptores' => (string)icc_ajuste('autofix_interruptores', '1') === '1',
  ];
}

/** Direccion que recibe los avisos (coordinacion, admin y super admin). */
function af_direccion(): array {
  return array_map('intval', icc_db()->query("SELECT id FROM usuarios WHERE rol IN ('coordinador','admin','super_admin') AND bloqueado = 0")->fetchAll(PDO::FETCH_COLUMN));
}

/**
 * Detecta las incidencias abiertas ahora. Cada una:
 * [clave, proceso, titulo, detalle, enlace, arreglo (callable que devuelve [ok, texto]) o null si es de una persona].
 */
function af_detectar(): array {
  $db = icc_db();
  $cfg = af_config();
  $l = [];
  $q = function (string $sql) use ($db) { try { return $db->query($sql)->fetchAll(); } catch (Throwable $e) { return []; } };

  // 1. Puesta en marcha.
  $interruptor = [
    'agentes' => function () { icc_ajuste_guardar('equipo_activo', '1'); return [true, 'Zona de agentes encendida']; },
    'flujos' => function () { [$c, $a] = fl_instalar(APR_FLUJOS_PILOTO, null, true); return [$a > 0, $a . ' automatizaciones activas' . ($c ? ' (' . $c . ' nuevas)' : '')]; },
    'saneo' => function () { icc_ajuste_guardar('saneo_auto', '1'); return [true, 'Mantenimiento del pipeline encendido']; },
    'aprendizaje' => function () { icc_ajuste_guardar('aprendizaje_auto', '1'); return [true, 'Aprendizaje diario encendido']; },
    'jarvis' => function () { icc_ajuste_guardar('jarvis_activo', '1'); return [true, 'Jarvis encendido']; },
  ];
  $opcional = ['https', 'dosieres', 'voz', 'legal', 'piloto', 'conocimiento', 'imap_motor'];
  foreach (apr_checklist() as $i) {
    if ($i['estado'] === 'ok' || $i['id'] === 'buzones') continue; // los buzones se revisan uno a uno (3)
    $fix = $cfg['interruptores'] ? ($interruptor[$i['id']] ?? null) : null;
    if (!$fix && $i['estado'] === 'aviso' && in_array($i['id'], $opcional, true)) continue; // recomendaciones, no errores
    $l[] = ['puesta:' . $i['id'], 'Puesta en marcha', $i['titulo'], $i['texto'], $i['enlace'] ?: '#/puesta-en-marcha', $fix];
  }

  // 2. Pipeline «requiere accion».
  $n = sn_contadores();
  $arreglable = $n['proximo'] + $n['valor'] + $n['gestor'];
  if ($arreglable > 0) {
    $l[] = ['pipeline', 'Pipeline', 'El pipeline requiere acción en ' . $arreglable . ' oportunidades',
      ($n['proximo'] ? $n['proximo'] . ' sin próximo paso · ' : '') . ($n['valor'] ? $n['valor'] . ' sin valor · ' : '') . ($n['gestor'] ? $n['gestor'] . ' sin gestor' : ''), '#/pipeline',
      function () {
        // Todo encendido: proximo paso con llamada real, valor, gestor y rescate.
        icc_ajuste_guardar('saneo_arreglar', json_encode(['proximo' => true, 'valor' => true, 'gestor' => true, 'rescate' => true]));
        icc_ajuste_guardar('saneo_crear_llamadas', '1');
        $antes = sn_contadores();
        $r = sn_pasada('autocorrector');
        $despues = sn_contadores();
        $ok = ($despues['proximo'] + $despues['valor'] + $despues['gestor']) < ($antes['proximo'] + $antes['valor'] + $antes['gestor']) || $r['cambios'] > 0;
        return [$ok, $r['texto']];
      }];
  }
  // Estancadas (dias en fase por encima de su alerta) sin plan: empujon de la Jefatura o llamada de rescate.
  $sinPlan = [];
  foreach (sn_diagnostico() as $d) if (in_array('sla', $d['problemas'], true) && !in_array('muerto', $d['problemas'], true) && !af_tiene_plan((int)$d['c']['id'])) $sinPlan[] = $d['c'];
  if ($sinPlan) {
    $l[] = ['estancadas', 'Pipeline', count($sinPlan) . ' oportunidades estancadas sin plan para avanzar', implode(', ', array_slice(array_column($sinPlan, 'razon_social'), 0, 6)) . (count($sinPlan) > 6 ? '…' : ''), '#/pipeline?estancadas=1',
      function () use ($sinPlan) {
        $hechos = 0;
        foreach (array_slice($sinPlan, 0, 12) as $c) {
          $st = icc_db()->prepare("SELECT 1 FROM presupuestos WHERE cliente_id = ? AND estado <> 'cerrado' LIMIT 1");
          $st->execute([$c['id']]);
          $t = $st->fetchColumn() ? eq_empujar_presupuestos('autocorrector', null, (int)$c['id']) : voz_o_persona(eq_cliente((int)$c['id']), 'recuperar', 'Oportunidad estancada en su fase: acordar el siguiente paso', 'Autocorrector');
          if ($t !== '' && strpos($t, 'ningún') === false && strpos($t, 'Sin gestor') === false) $hechos++;
        }
        return [$hechos > 0, $hechos . ' oportunidades estancadas con plan (empujón o llamada)'];
      }];
  }
  foreach (sn_diagnostico() as $d) {
    if (!in_array('muerto', $d['problemas'], true)) continue;
    $c = $d['c'];
    $l[] = ['muerto:' . (int)$c['id'], 'Pipeline', 'Oportunidad sin vida: ' . $c['razon_social'], $d['inactivo'] . ' días sin actividad, SLA vencido y reprogramada varias veces.', '#/pipeline',
      function () use ($c, $cfg) { return af_rescatar_muerto($c, $cfg['perdidos']); }];
  }

  // 3. Buzones del agente de correo con error.
  foreach ($q("SELECT id, email, error FROM mail_cuentas WHERE activo = 1 AND clave IS NOT NULL AND error IS NOT NULL AND error <> ''") as $b) {
    $l[] = ['buzon:' . (int)$b['id'], 'Correo', 'El buzón ' . $b['email'] . ' da error', (string)$b['error'], '#/agente-correo',
      function () use ($b) {
        $c = ca_cuenta((int)$b['id'], true);
        $r = icc_imap_probar($c);
        if ($r['ok']) { icc_db()->prepare('UPDATE mail_cuentas SET error = NULL WHERE id = ?')->execute([$b['id']]); return [true, 'Conexión recuperada']; }
        return [false, (string)($r['error'] ?? 'Sigue sin conectar') . (preg_match('/(auth|login|contrase|password|credencial)/i', (string)($r['error'] ?? '')) ? ' · Revisa la contraseña del buzón.' : '')];
      }];
  }
  // 4. Correos atascados (error, o sin gestionar en 30 minutos).
  foreach ($q("SELECT m.id, m.asunto, m.estado, a.email FROM mail_mensajes m JOIN mail_cuentas a ON a.id = m.cuenta_id
               WHERE m.estado = 'error' OR (m.estado = 'nuevo' AND m.created_at < NOW() - INTERVAL 30 MINUTE) ORDER BY m.id LIMIT 20") as $m) {
    $l[] = ['correo:' . (int)$m['id'], 'Correo', 'Correo sin gestionar en ' . $m['email'], '«' . mb_substr((string)$m['asunto'], 0, 120) . '» (' . $m['estado'] . ')', '#/agente-correo',
      function () use ($m) {
        icc_db()->prepare("UPDATE mail_mensajes SET estado = 'nuevo' WHERE id = ?")->execute([$m['id']]);
        $e = ca_procesar((int)$m['id']);
        return [$e !== 'error' && $e !== 'nuevo', 'Reprocesado: ' . $e];
      }];
  }
  // 5. Motor: envios con error.
  foreach ($q("SELECT m.id, m.error, l.nombre FROM motor_mensajes m JOIN motor_leads l ON l.id = m.lead_id WHERE m.estado = 'error' AND m.direccion = 'salida' AND l.rebotado = 0 ORDER BY m.id LIMIT 20") as $m) {
    $temporal = (bool)preg_match('/(timeout|tiempo|temporal|connection|conex|refused|4\d\d\b|try again|greylist)/i', (string)$m['error']);
    $l[] = ['motor:' . (int)$m['id'], 'Motor', 'Correo del Motor no enviado: ' . $m['nombre'], (string)$m['error'], '#/motor',
      $temporal ? function () use ($m) { icc_db()->prepare("UPDATE motor_mensajes SET estado = 'aprobado', error = NULL WHERE id = ?")->execute([$m['id']]); return [true, 'Vuelve a la cola de envío']; } : null];
  }
  // 6. Agente de voz: sin informe en 2 horas o con error -> llamada del gestor.
  foreach ($q("SELECT * FROM voz_llamadas WHERE cliente_id IS NOT NULL AND ((estado = 'en_curso' AND updated_at < NOW() - INTERVAL 2 HOUR) OR (estado = 'error' AND created_at >= NOW() - INTERVAL 7 DAY AND COALESCE(error, '') NOT LIKE '%pasa al gestor%')) ORDER BY id LIMIT 20") as $v) {
    $l[] = ['voz:' . (int)$v['id'], 'Agente de voz', 'Llamada del agente de voz sin resultado', ($v['estado'] === 'error' ? (string)$v['error'] : 'Vapi no ha mandado el informe en 2 horas (revisa la Server URL y el secreto).'), '#/zona-agentes',
      function () use ($v) {
        $db = icc_db();
        $db->prepare("UPDATE voz_llamadas SET estado = 'error', error = ? WHERE id = ?")->execute([mb_substr(($v['error'] ?: 'Sin informe de Vapi') . ' · pasa al gestor', 0, 255), $v['id']]);
        $c = eq_cliente((int)$v['cliente_id']);
        $g = $c && $c['comercial_id'] ? (int)$c['comercial_id'] : eq_gestor_menos_cargado();
        if (!$c || !$g || !($h = eq_primer_hueco($g, 15))) return [false, 'Sin gestor o sin huecos'];
        eq_crear_cita($g, (int)$c['id'], 'llamada', $h[0], $h[1], 15, (string)$c['razon_social'], 'Autocorrector: la llamada del agente de voz no se completó (' . (VOZ_MOTIVOS[$v['motivo']] ?? $v['motivo']) . '). Llamar.');
        return [true, 'Llamada del gestor el ' . $h[0] . ' a las ' . $h[1]];
      }];
  }
  // 7. Bloques del cron que fallaron en su ultima pasada.
  if (function_exists('icc_cron_bloques')) {
    foreach ($q("SELECT r.bloque, r.mensaje FROM cron_registro r JOIN (SELECT bloque, MAX(id) id FROM cron_registro WHERE ts >= NOW() - INTERVAL 1 DAY GROUP BY bloque) u ON u.id = r.id WHERE r.ok = 0") as $b) {
      if ($b['bloque'] === 'autofix' || !isset(icc_cron_bloques()[$b['bloque']])) continue;
      $l[] = ['cron:' . $b['bloque'], 'Cron', 'El proceso «' . $b['bloque'] . '» falló en su última pasada', (string)$b['mensaje'], '#/inteligencia-artificial',
        function () use ($b) {
          $t0 = microtime(true);
          try { $msg = (string)(icc_cron_bloques()[$b['bloque']][1])(); $ok = true; } catch (Throwable $e) { $msg = 'Error: ' . $e->getMessage(); $ok = false; }
          icc_cron_anotar('autofix', $b['bloque'], $ok, (int)round((microtime(true) - $t0) * 1000), $msg);
          return [$ok, mb_substr($msg, 0, 200)];
        }];
    }
  }
  // 8. La IA falla (clave, saldo o limite): los agentes siguen con su manual de reglas.
  $ia = $q("SELECT SUM(ok = 0) mal, SUM(ok = 1) bien, MAX(CASE WHEN ok = 0 THEN error END) err FROM ia_registro WHERE ts >= NOW() - INTERVAL 1 HOUR");
  if ($ia && (int)$ia[0]['mal'] >= 5 && !(int)$ia[0]['bien']) {
    $l[] = ['ia', 'IA', 'Las llamadas a OpenAI están fallando', mb_substr((string)$ia[0]['err'], 0, 300) . ' · Mientras tanto los agentes trabajan con su manual de reglas. Revisa la clave y el saldo de OpenAI.', '#/inteligencia-artificial', null];
  }
  // 9. Lo que espera a una persona desde hace mas de 48 horas (por diseno no se aprueba solo).
  $pend = (int)(($q("SELECT COUNT(*) n FROM equipo_acciones WHERE estado = 'pendiente' AND ts < NOW() - INTERVAL 2 DAY")[0]['n'] ?? 0))
    + (int)(($q("SELECT COUNT(*) n FROM mail_mensajes WHERE estado = 'para_aprobar' AND created_at < NOW() - INTERVAL 2 DAY")[0]['n'] ?? 0))
    + (int)(($q("SELECT COUNT(*) n FROM motor_mensajes WHERE estado = 'pendiente' AND created_at < NOW() - INTERVAL 2 DAY")[0]['n'] ?? 0));
  if ($pend) $l[] = ['aprobar', 'Aprobaciones', $pend . ' decisiones esperan a una persona desde hace más de 48 horas', 'Presupuestos, correos a clientes, cobros o correos del Motor: por seguridad no se aprueban solos. Revísalos en «Para aprobar» o activa el envío autónomo del Motor si aceptas el aviso legal.', '#/zona-agentes', null];
  return $l;
}

/** Tiene un plan en marcha: cita futura o llamada del agente de voz en las ultimas 48 horas. */
function af_tiene_plan(int $cid): bool {
  $st = icc_db()->prepare("SELECT (SELECT COUNT(*) FROM citas WHERE cliente_id = ? AND fecha >= CURDATE() AND estado IN ('programada','confirmada','reprogramada'))
    + (SELECT COUNT(*) FROM voz_llamadas WHERE cliente_id = ? AND estado IN ('pendiente','en_curso','terminada') AND created_at >= NOW() - INTERVAL 2 DAY)
    + (SELECT COUNT(*) FROM equipo_tareas WHERE cliente_id = ? AND estado = 'abierta' AND created_at >= NOW() - INTERVAL 3 DAY)");
  $st->execute([$cid, $cid, $cid]);
  return (int)$st->fetchColumn() > 0;
}

/** Deal muerto: llamada de rescate; si a los 14 dias sigue igual, perdido con recontacto a 90 dias. */
function af_rescatar_muerto(array $c, bool $perdidos): array {
  $db = icc_db();
  $st = $db->prepare('SELECT intentos, primera FROM autofix_memoria WHERE clave = ?');
  $st->execute(['muerto:' . (int)$c['id']]);
  $m = $st->fetch();
  $c = eq_cliente((int)$c['id']);
  if (!$m || (int)$m['intentos'] === 0) {
    $t = voz_o_persona($c, 'recuperar', 'Oportunidad parada mucho tiempo: confirmar si sigue interesado', 'Autocorrector');
    return [true, 'Llamada de rescate: ' . $t];
  }
  if ($perdidos && strtotime((string)$m['primera']) < time() - 14 * 86400) {
    $db->prepare("UPDATE clientes SET estado = 'perdido' WHERE id = ?")->execute([$c['id']]);
    $db->prepare('INSERT INTO historial_estado (cliente_id, estado_anterior, estado_nuevo, cambiado_por) VALUES (?, ?, ?, NULL)')->execute([$c['id'], $c['estado'], 'perdido']);
    icc_nota_cliente((int)$c['id'], 'Autocorrector: pasa a Perdido (sin actividad tras la llamada de rescate). Se volverá a contactar a los 90 días.', 'autocorrector');
    return [true, 'Pasa a perdido con recontacto a 90 días'];
  }
  return [false, 'Esperando el resultado de la llamada de rescate'];
}

/** Una pasada del Autocorrector. Devuelve el resumen. */
function af_tick(bool $forzar = false): string {
  $cfg = af_config();
  if (!$cfg['activo'] && !$forzar) return 'Autocorrector apagado.';
  $db = icc_db();
  $vistas = [];
  $arregladas = 0; $persona = 0; $fallos = 0;
  foreach (af_detectar() as [$clave, $proceso, $titulo, $detalle, $enlace, $fix]) {
    $vistas[] = $clave;
    $st = $db->prepare('SELECT * FROM autofix_memoria WHERE clave = ?');
    $st->execute([$clave]);
    $m = $st->fetch();
    if (!$m) {
      $db->prepare('INSERT INTO autofix_memoria (clave, proceso, titulo, detalle, enlace) VALUES (?, ?, ?, ?, ?)')->execute([$clave, $proceso, mb_substr($titulo, 0, 200), mb_substr($detalle, 0, 1000), $enlace]);
      $st->execute([$clave]);
      $m = $st->fetch();
    } elseif ($m['estado'] === 'arreglada') {
      // Vuelve a pasar: nuevo episodio.
      $db->prepare("UPDATE autofix_memoria SET estado = 'abierta', intentos = 0, veces = veces + 1, primera = NOW(), ultima = NOW(), titulo = ?, detalle = ? WHERE id = ?")->execute([mb_substr($titulo, 0, 200), mb_substr($detalle, 0, 1000), $m['id']]);
      $m['estado'] = 'abierta'; $m['intentos'] = 0; $m['veces']++;
      if ((int)$m['veces'] === 3) apr_memoria('aviso', 'Se repite: «' . $titulo . '» (' . $m['veces'] . ' veces). Busca la causa: ' . mb_substr($detalle, 0, 200), 'Autocorrector: ' . $m['veces'] . ' episodios', 70, '', '', 'autocorrector');
    } else {
      $db->prepare('UPDATE autofix_memoria SET ultima = NOW(), titulo = ?, detalle = ? WHERE id = ?')->execute([mb_substr($titulo, 0, 200), mb_substr($detalle, 0, 1000), $m['id']]);
    }
    // Arreglo automatico (como mucho 3 intentos por episodio, con pausa creciente).
    if ($fix && $m['estado'] === 'abierta' && (int)$m['intentos'] < 3) {
      // Pausa creciente entre intentos: 10 minutos y despues 1 hora.
      $espera = [0, 10, 60][(int)$m['intentos']] * 60;
      if (!$forzar && (int)$m['intentos'] > 0 && $m['aviso_en'] && strtotime((string)$m['aviso_en']) > time() - $espera) continue;
      try { [$ok, $texto] = $fix(); } catch (Throwable $e) { $ok = false; $texto = 'Error: ' . $e->getMessage(); }
      $db->prepare('UPDATE autofix_memoria SET intentos = intentos + 1, accion = ?, aviso_en = NOW(), estado = ?, arreglada_en = IF(? = 1, NOW(), arreglada_en) WHERE id = ?')
        ->execute([mb_substr((string)$texto, 0, 500), $ok ? 'arreglada' : ((int)$m['intentos'] + 1 >= 3 ? 'persona' : 'abierta'), $ok ? 1 : 0, $m['id']]);
      if ($ok) { $arregladas++; continue; }
      $fallos++;
      if ((int)$m['intentos'] + 1 < 3) continue;
      $m['estado'] = 'persona'; $m['aviso_en'] = null; $m['accion'] = (string)$texto;
    }
    // Necesita a una persona: aviso a direccion una vez al dia.
    if ($m['estado'] !== 'persona') $db->prepare("UPDATE autofix_memoria SET estado = 'persona' WHERE id = ?")->execute([$m['id']]);
    if (!$m['aviso_en'] || strtotime((string)$m['aviso_en']) < time() - 86400 || ($fix && (int)$m['intentos'] + 1 >= 3)) {
      foreach (af_direccion() as $u) icc_notificar($u, 'cuenta', 'autocorrector', mb_substr('Autocorrector · necesita a una persona: ' . $titulo . '. ' . $detalle . ($m['accion'] ? ' (Intentado: ' . $m['accion'] . ')' : ''), 0, 480));
      $db->prepare('UPDATE autofix_memoria SET aviso_en = NOW() WHERE id = ?')->execute([$m['id']]);
    }
    $persona++;
  }
  // Lo que ya no aparece: arreglado (por el Autocorrector o por una persona).
  $abiertas = $db->query("SELECT id, clave FROM autofix_memoria WHERE estado IN ('abierta','persona')")->fetchAll();
  foreach ($abiertas as $a) if (!in_array($a['clave'], $vistas, true)) {
    $db->prepare("UPDATE autofix_memoria SET estado = 'arreglada', arreglada_en = NOW(), accion = IF(accion = '', 'Resuelto', accion) WHERE id = ?")->execute([$a['id']]);
  }
  icc_ajuste_guardar('autofix_ultimo', date('Y-m-d H:i:s'));
  return 'Autocorrector: ' . count($vistas) . ' incidencias · ' . $arregladas . ' arregladas · ' . $persona . ' para una persona' . ($fallos ? ' · ' . $fallos . ' reintentos pendientes' : '');
}

/** Memoria para mostrar (abiertas primero). */
function af_memoria(int $limite = 80): array {
  return icc_db()->query("SELECT * FROM autofix_memoria ORDER BY FIELD(estado, 'persona', 'abierta', 'arreglada'), ultima DESC LIMIT " . max(1, min(300, $limite)))->fetchAll();
}
