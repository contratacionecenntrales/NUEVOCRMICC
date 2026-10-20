<?php
/**
 * ICC CRM · Diagnostico y limpieza de almacenamiento (solo Admin).
 *
 * GET: comprueba, para cada archivo registrado en la base de datos, si el
 * archivo fisico sigue presente en storage/. Nunca recupera nada: solo
 * dice cuales faltan.
 *
 * DELETE: limpia los registros cuyo archivo fisico ya no existe (vuelve a
 * comprobar cada uno en el momento de borrar, nunca se fia de una lista
 * que venga del navegador). En "ficheros", "documentos" y "firmas" el
 * archivo ES el registro, asi que se borra la fila entera. En
 * "proformas" el archivo es solo un adjunto de un registro de negocio
 * (una factura): ahi se conserva la fila y solo se desvincula el
 * archivo perdido (ruta_archivo a NULL), para no perder datos de
 * negocio por un archivo que ya no esta.
 */
require __DIR__ . '/config.php';

$user = icc_require_role(['admin', 'super_admin']);
$metodo = $_SERVER['REQUEST_METHOD'];

$db = icc_db();

function icc_ruta_ficheros($f) { return ICC_STORAGE_DIR . '/ficheros/' . $f['ruta_archivo']; }
function icc_ruta_documentos($f) {
  $base = $f['tipo'] === 'estudio' ? 'estudios' : 'facturas';
  return ICC_STORAGE_DIR . '/' . $base . '/' . $f['ruta_archivo'];
}
function icc_ruta_firmas($f) { return ICC_STORAGE_DIR . '/firmas/' . $f['ruta_archivo']; }
function icc_ruta_proformas($f) { return ICC_STORAGE_DIR . '/proformas/' . $f['ruta_archivo']; }

$tablas = [
  ['tabla' => 'ficheros', 'sql' => 'SELECT id, nombre_archivo, ruta_archivo FROM ficheros', 'ruta' => 'icc_ruta_ficheros', 'modo' => 'borrar_fila'],
  ['tabla' => 'documentos', 'sql' => 'SELECT id, nombre_archivo, ruta_archivo, tipo, presupuesto_id FROM documentos', 'ruta' => 'icc_ruta_documentos', 'modo' => 'borrar_fila'],
  ['tabla' => 'firmas', 'sql' => 'SELECT id, NULL AS nombre_archivo, ruta_archivo FROM firmas', 'ruta' => 'icc_ruta_firmas', 'modo' => 'borrar_fila'],
  ['tabla' => 'proformas', 'sql' => 'SELECT id, ruta_archivo AS nombre_archivo, ruta_archivo FROM proformas', 'ruta' => 'icc_ruta_proformas', 'modo' => 'limpiar_ruta'],
];

if ($metodo === 'GET') {
  $resultado = [];
  foreach ($tablas as $t) {
    $faltan = [];
    $total = 0;
    $stmt = $db->query($t['sql']);
    foreach ($stmt as $fila) {
      if ($fila['ruta_archivo'] === null || $fila['ruta_archivo'] === '') continue;
      $total++;
      if (!is_file($t['ruta']($fila))) {
        $faltan[] = [
          'tabla' => $t['tabla'],
          'id' => (int)$fila['id'],
          'nombre_archivo' => $fila['nombre_archivo'] ?? null,
          'ruta_archivo' => $fila['ruta_archivo'],
        ];
      }
    }
    $resultado[] = ['tabla' => $t['tabla'], 'total' => $total, 'faltan' => $faltan, 'modo' => $t['modo']];
  }
  icc_json(['resultado' => $resultado]);
}

if ($metodo === 'DELETE') {
  icc_require_csrf();
  $limpiados = [];
  foreach ($tablas as $t) {
    $n = 0;
    $stmt = $db->query($t['sql']);
    foreach ($stmt as $fila) {
      if ($fila['ruta_archivo'] === null || $fila['ruta_archivo'] === '') continue;
      if (is_file($t['ruta']($fila))) continue;

      if ($t['modo'] === 'borrar_fila') {
        $db->prepare("DELETE FROM {$t['tabla']} WHERE id = ?")->execute([(int)$fila['id']]);
        if ($t['tabla'] === 'documentos' && !empty($fila['presupuesto_id'])) {
          icc_recalcular_estado_presupuesto($db, (int)$fila['presupuesto_id']);
        }
      } else {
        $db->prepare("UPDATE {$t['tabla']} SET ruta_archivo = NULL, nombre_archivo = NULL WHERE id = ?")->execute([(int)$fila['id']]);
      }
      $n++;
    }
    $limpiados[] = ['tabla' => $t['tabla'], 'limpiados' => $n, 'modo' => $t['modo']];
  }
  icc_json(['ok' => true, 'limpiados' => $limpiados]);
}

icc_json(['error' => 'Metodo no permitido'], 405);
