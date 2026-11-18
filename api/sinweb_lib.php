<?php
/**
 * ICC CRM · Campaña de llamadas a negocios de Asturias SIN página web.
 *
 * Los negocios salen del Motor (Google Places guarda su teléfono y su web): los
 * que no tienen web y sí teléfono forman la campaña. Se reparten entre
 * comerciales; cada uno llama desde su lista con el guion y marca el resultado:
 *  - Interesado: pasa al CRM con la etiqueta «Interés: Página web» y visita o
 *    llamada en la agenda del gestor.
 *  - Volver a llamar: el día y la hora acordados.
 *  - No contesta: se reintenta el siguiente día laborable en la otra franja
 *    (mañana/tarde); al 4.º intento, agotado.
 *  - No le interesa / No llamar más (este último, nunca más en ninguna campaña).
 */
require_once __DIR__ . '/agentes_lib.php';

const SW_RESULTADOS = ['interesado' => 'Interesado', 'volver' => 'Volver a llamar', 'no_contesta' => 'No contesta', 'no_interesa' => 'No le interesa', 'no_llamar' => 'No llamar más'];
const SW_ESTADOS = ['' => 'Sin asignar', 'pendiente' => 'Por llamar', 'volver' => 'Volver a llamar', 'no_contesta' => 'No contesta', 'interesado' => 'Interesado', 'no_interesa' => 'No le interesa', 'no_llamar' => 'No llamar más', 'agotado' => 'Sin contacto (4 intentos)'];

const SW_GUION = "1) «Buenos días, ¿hablo con el responsable de {negocio}? Le llamo de ICC Consultoría, aquí en Asturias. Le robo un minuto.»\n"
  . "2) «He visto {negocio} en Google Maps, pero no tiene página web. Hoy la mayoría de clientes busca en el móvil antes de ir: sin web, se van a la competencia que sí aparece.»\n"
  . "3) «En ICC hacemos webs para negocios de {sector} como el suyo, sencillas y que se encuentran en Google, y de paso revisamos gratis su factura de luz y teléfono: 100 % servicios con un solo interlocutor.»\n"
  . "4) «¿Le parece que pase a verle 15 minutos y le enseño ejemplos? ¿Mejor el martes por la mañana o el jueves por la tarde?»\n"
  . "Si no quiere que le volvamos a llamar: «Entendido, no volveremos a llamarle», y marca «No llamar más». Nunca des precios cerrados ni prometas posiciones en Google.";

function sw_guion(): string { return (string)icc_ajuste('sinweb_guion', '') ?: SW_GUION; }

/** Condicion SQL de los negocios de la campaña (sin web, con telefono, sin baja). */
function sw_where(): string {
  return "l.web = '' AND l.telefono <> '' AND l.estado NOT IN ('baja','descartado') AND l.cliente_id IS NULL";
}

/** Busca negocios en Places y devuelve cuantos nuevos sin web con telefono. */
function sw_buscar(array $sectores, array $ubicaciones, ?int $autor): array {
  $db = icc_db();
  $antes = (int)$db->query('SELECT COALESCE(MAX(id), 0) FROM motor_leads')->fetchColumn();
  $consultas = 0; $errores = [];
  foreach (array_slice($sectores, 0, 10) as $s) {
    if (!isset(MOTOR_SECTORES[$s])) continue;
    $r = motor_extraer($s, '', array_slice($ubicaciones, 0, max(1, (int)floor(40 / max(1, count($sectores))))), $autor, 2, 'places');
    $consultas += (int)$r['consultas'];
    $errores = array_merge($errores, $r['errores']);
  }
  $st = $db->prepare("SELECT COUNT(*) total, SUM(l.web = '' AND l.telefono <> '') sinweb FROM motor_leads l WHERE l.id > ?");
  $st->execute([$antes]);
  $n = $st->fetch();
  return ['consultas' => $consultas, 'nuevos' => (int)$n['total'], 'sin_web' => (int)$n['sinweb'], 'errores' => array_values(array_unique($errores))];
}

/** Reparte negocios sin asignar entre comerciales (por igual). Devuelve [usuario => n]. */
function sw_repartir(array $usuarios, int $porPersona, array $filtro, ?int $uid): array {
  $db = icc_db();
  $usuarios = array_values(array_filter(array_map('intval', $usuarios)));
  if (!$usuarios) return [];
  $w = [sw_where(), "l.llamada_estado = ''"]; $p = [];
  if (!empty($filtro['comarca'])) { $w[] = 'l.comarca = ?'; $p[] = (string)$filtro['comarca']; }
  if (!empty($filtro['sector'])) { $w[] = 'l.sector = ?'; $p[] = (string)$filtro['sector']; }
  $st = $db->prepare('SELECT l.id FROM motor_leads l WHERE ' . implode(' AND ', $w) . ' ORDER BY l.comarca, l.concejo, l.id LIMIT ' . (count($usuarios) * max(1, min(200, $porPersona))));
  $st->execute($p);
  $out = array_fill_keys($usuarios, 0);
  foreach ($st->fetchAll(PDO::FETCH_COLUMN) as $i => $id) {
    $u = $usuarios[$i % count($usuarios)];
    $db->prepare("UPDATE motor_leads SET llamada_estado = 'pendiente', llamada_asignado = ?, llamada_proxima = NOW() WHERE id = ?")->execute([$u, $id]);
    $out[$u]++;
  }
  foreach ($out as $u => $n) if ($n) icc_notificar($u, 'cuenta', 'sinweb', 'Campaña «negocios sin web»: tienes ' . $n . ' negocios nuevos para llamar. Ábrelos en «Campaña sin web».');
  return $out;
}

/** Resultado de una llamada. */
function sw_resultado(int $leadId, string $res, string $nota, ?string $cuando, int $uid): string {
  $db = icc_db();
  if (!isset(SW_RESULTADOS[$res])) throw new InvalidArgumentException('Resultado no válido.');
  $st = $db->prepare('SELECT * FROM motor_leads WHERE id = ?');
  $st->execute([$leadId]);
  $l = $st->fetch();
  if (!$l) throw new InvalidArgumentException('Negocio no encontrado.');
  $nota = mb_substr(trim($nota), 0, 500);
  $fecha = $cuando && preg_match('/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/', $cuando) ? str_replace('T', ' ', substr($cuando, 0, 16)) . ':00' : null;
  if ($res === 'volver' && !$fecha) throw new InvalidArgumentException('Indica el día y la hora para volver a llamar.');
  $db->prepare('INSERT INTO motor_llamadas (lead_id, usuario_id, resultado, nota) VALUES (?, ?, ?, ?)')->execute([$leadId, $uid, $res, $nota]);
  $estado = $res; $proxima = null; $hecho = '';
  switch ($res) {
    case 'interesado':
      // Gestor: quien llama si es comercial o jefe de equipo; si no, el asignado o el menos cargado.
      $rol = (string)$db->query('SELECT rol FROM usuarios WHERE id = ' . $uid)->fetchColumn();
      $gestor = in_array($rol, ['comercial', 'jefe_de_equipo'], true) ? $uid : ((int)$l['llamada_asignado'] ?: eq_gestor_menos_cargado());
      $cid = motor_a_crm($l, null, 'Llamada de la campaña «negocios sin web»: ' . ($nota ?: 'interesado'), $uid, 'Campaña sin web: interesado en página web');
      $db->prepare('UPDATE clientes SET comercial_id = COALESCE(comercial_id, ?) WHERE id = ?')->execute([$gestor, $cid]);
      if (function_exists('icc_etiquetar_cliente')) icc_etiquetar_cliente($cid, ICC_INTERESES['web']);
      if ($gestor) {
        if ($fecha) { eq_crear_cita($gestor, $cid, 'visita', substr($fecha, 0, 10), substr($fecha, 11, 5), 45, (string)$l['nombre'], 'Campaña sin web: visita para enseñar ejemplos de páginas web y revisar sus facturas. ' . $nota, (string)$l['telefono'], '', (string)$l['direccion']); $hecho = 'pasa al CRM con visita el ' . substr($fecha, 0, 16); }
        elseif ($h = eq_primer_hueco($gestor, 15)) { eq_crear_cita($gestor, $cid, 'llamada', $h[0], $h[1], 15, (string)$l['nombre'], 'Campaña sin web: interesado en página web; cerrar la visita. ' . $nota, (string)$l['telefono']); $hecho = 'pasa al CRM con llamada el ' . $h[0] . ' a las ' . $h[1]; }
      }
      $hecho = $hecho ?: 'pasa al CRM';
      break;
    case 'volver': $proxima = $fecha; $hecho = 'volver a llamar el ' . substr($fecha, 0, 16); break;
    case 'no_contesta':
      $n = (int)$l['llamada_intentos'] + 1;
      if ($n >= 4) { $estado = 'agotado'; $hecho = 'cuarto intento sin respuesta: sale de la lista'; }
      else {
        // Siguiente laborable, en la otra franja (manana <-> tarde).
        $d = icc_madrid(); do { $d = $d->modify('+1 day'); } while (!icc_es_laborable($d));
        $proxima = $d->format('Y-m-d') . (icc_madrid()->format('H') < 14 ? ' 17:00:00' : ' 10:00:00');
        $hecho = 'se reintenta el ' . substr($proxima, 0, 16);
      }
      $db->prepare('UPDATE motor_leads SET llamada_intentos = ? WHERE id = ?')->execute([$n, $leadId]);
      break;
    case 'no_interesa': $db->prepare("UPDATE motor_leads SET estado = 'descartado' WHERE id = ?")->execute([$leadId]); $hecho = 'no le interesa'; break;
    case 'no_llamar':
      // Nunca mas, en ninguna campaña (tambien otros registros con el mismo telefono).
      $tel = preg_replace('/\D/', '', (string)$l['telefono']);
      $db->prepare("UPDATE motor_leads SET estado = 'baja', llamada_estado = 'no_llamar', llamada_proxima = NULL WHERE id = ? OR (telefono <> '' AND REPLACE(REPLACE(telefono, ' ', ''), '+34', '') = ?)")->execute([$leadId, substr($tel, -9)]);
      $hecho = 'no se le volverá a llamar';
      break;
  }
  if ($res !== 'no_llamar') $db->prepare('UPDATE motor_leads SET llamada_estado = ?, llamada_proxima = ?, llamada_nota = ?, llamada_en = NOW(), llamada_asignado = COALESCE(llamada_asignado, ?) WHERE id = ?')->execute([$estado, $proxima, $nota, $uid, $leadId]);
  else $db->prepare('UPDATE motor_leads SET llamada_nota = ?, llamada_en = NOW() WHERE id = ?')->execute([$nota, $leadId]);
  return ucfirst($hecho) . '.';
}
