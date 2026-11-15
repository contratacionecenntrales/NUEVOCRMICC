<?php
/**
 * ICC CRM · Cron unico. Una sola tarea programada del hosting llama cada 5
 * minutos a api/cron.php?token=... y aqui se reparten los trabajos (bloques).
 * Cada bloque tiene su propio intervalo, va en su propio try/catch (si uno
 * falla, los demas siguen) y deja constancia en cron_registro.
 * Mientras alguien tiene el panel abierto, api/latido.php hace de cron de
 * respaldo (como mucho una pasada cada 5 minutos).
 */

/** Bloques: nombre => [cada_minutos, funcion]. Las fases siguientes anaden los suyos con icc_cron_registrar(). */
function &icc_cron_bloques_ref(): array {
  static $bloques = null;
  if ($bloques === null) {
    $bloques = [
      'copias' => [60, function (): string {
        if (ICC_MODO_DEMO) return 'Modo demostración: sin copias.';
        icc_copias_auto();
        return 'Copia diaria comprobada.';
      }],
      'purga' => [720, function (): string {
        $db = icc_db();
        $n = 0;
        // RGPD: registros de IA 90 dias, del cron 30 dias, acciones de IA 1 ano.
        $n += $db->exec('DELETE FROM ia_registro WHERE ts < NOW() - INTERVAL 90 DAY');
        $n += $db->exec('DELETE FROM cron_registro WHERE ts < NOW() - INTERVAL 30 DAY');
        $n += $db->exec('DELETE FROM ia_acciones WHERE ts < NOW() - INTERVAL 365 DAY');
        // Correos 1 ano y registros del Motor 180 dias.
        foreach (['DELETE FROM motor_mensajes WHERE created_at < NOW() - INTERVAL 365 DAY', 'DELETE FROM motor_log WHERE ts < NOW() - INTERVAL 180 DAY',
                  'DELETE FROM flujo_registro WHERE ts < NOW() - INTERVAL 180 DAY', 'DELETE FROM flujo_eventos WHERE procesado = 1 AND ts < NOW() - INTERVAL 30 DAY',
                  'DELETE FROM equipo_acciones WHERE ts < NOW() - INTERVAL 365 DAY AND estado <> \'pendiente\'', 'DELETE FROM equipo_turnos WHERE inicio < NOW() - INTERVAL 180 DAY',
                  'DELETE FROM jarvis_registro WHERE ts < NOW() - INTERVAL 90 DAY', 'DELETE FROM jarvis_usadas WHERE ts < NOW() - INTERVAL 2 DAY',
                  'DELETE FROM mail_mensajes WHERE created_at < NOW() - INTERVAL 365 DAY'] as $sql) {
          try { $n += $db->exec($sql); } catch (Throwable $e) { /* tabla aun no creada */ }
        }
        return $n . ' registros antiguos borrados.';
      }],
    ];
  }
  return $bloques;
}

function icc_cron_registrar(string $nombre, int $cadaMinutos, callable $fn): void {
  $b = &icc_cron_bloques_ref();
  $b[$nombre] = [max(1, $cadaMinutos), $fn];
}

function icc_cron_bloques(): array {
  return icc_cron_bloques_ref();
}

/** Token del cron: el del archivo privado manda; si no hay, se genera uno y se guarda cifrado. */
function icc_cron_token(): string {
  if (defined('ICC_CRON_TOKEN') && ICC_CRON_TOKEN !== '') return ICC_CRON_TOKEN;
  $t = (string)icc_ajuste('cron_token', '');
  if ($t === '' && icc_ajustes_ok()) {
    $t = bin2hex(random_bytes(24));
    icc_ajuste_guardar('cron_token', $t, true);
  }
  return $t;
}

function icc_cron_anotar(string $origen, string $bloque, bool $ok, int $ms, string $mensaje): void {
  try {
    icc_db()->prepare('INSERT INTO cron_registro (origen, bloque, ok, ms, mensaje) VALUES (?, ?, ?, ?, ?)')
      ->execute([$origen, $bloque, $ok ? 1 : 0, $ms, mb_substr($mensaje, 0, 500)]);
  } catch (Throwable $e) { error_log('ICC cron_anotar: ' . $e->getMessage()); }
}

/**
 * Ejecuta los bloques que toquen. $forzar ignora los intervalos (boton
 * «Ejecutar ahora»). Devuelve [bloque => ['ok', 'ms', 'mensaje'|'saltado']].
 */
function icc_cron_ejecutar(string $origen, bool $forzar = false): array {
  $dir = rtrim(ICC_STORAGE_DIR, '/');
  if (!is_dir($dir)) @mkdir($dir, 0750, true);
  $lock = @fopen($dir . '/.cron.lock', 'c');
  if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) return ['_' => ['ok' => true, 'saltado' => true, 'mensaje' => 'Ya hay una pasada en marcha.']];
  @set_time_limit(280);
  @ignore_user_abort(true);
  $out = [];
  try {
    icc_ajuste_guardar('cron_ultimo', date('Y-m-d H:i:s') . '|' . $origen);
    foreach (icc_cron_bloques() as $nombre => [$cada, $fn]) {
      $ultimo = (string)icc_ajuste('cron_ultimo_' . $nombre, '');
      if (!$forzar && $ultimo !== '' && strtotime($ultimo) > time() - $cada * 60 + 30) {
        $out[$nombre] = ['ok' => true, 'saltado' => true];
        continue;
      }
      $t0 = microtime(true);
      try {
        $msg = (string)$fn();
        $ok = true;
      } catch (Throwable $e) {
        $msg = 'Error: ' . $e->getMessage();
        $ok = false;
        error_log('ICC cron ' . $nombre . ': ' . $e->getMessage());
      }
      $ms = (int)round((microtime(true) - $t0) * 1000);
      icc_ajuste_guardar('cron_ultimo_' . $nombre, date('Y-m-d H:i:s'));
      icc_cron_anotar($origen, $nombre, $ok, $ms, $msg);
      $out[$nombre] = ['ok' => $ok, 'ms' => $ms, 'mensaje' => $msg];
    }
  } finally {
    flock($lock, LOCK_UN);
    fclose($lock);
  }
  return $out;
}

/* ---------------------------------------------------------------------------
   Bloques de cada modulo, en el orden del latido: Motor -> buzones ->
   mantenimiento del pipeline -> flujos -> turnos de los agentes.
   ------------------------------------------------------------------------- */
require_once __DIR__ . '/motor_lib.php';
icc_cron_registrar('motor', 1, function (): string { return motor_tick(); });
icc_cron_registrar('motor_analisis', 5, function (): string { return motor_analizar_pendientes(); });
require_once __DIR__ . '/agentes_lib.php';
require_once __DIR__ . '/correo_agentes_lib.php';
icc_cron_registrar('buzones', 1, function (): string { return ca_tick(); });
require_once __DIR__ . '/flujos_lib.php';
require_once __DIR__ . '/saneo_lib.php';
icc_cron_registrar('saneo', 60, function (): string { return sn_tick(); });
icc_cron_registrar('flujos', 1, function (): string { return fl_tick(); });
icc_cron_registrar('agentes', 5, function (): string { return eq_tick(); });
