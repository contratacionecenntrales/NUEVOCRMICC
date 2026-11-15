<?php
/**
 * ICC CRM · Entrada publica de los flujos con disparador «formulario».
 * POST (formulario HTML o JSON) a ?t=TOKEN con: nombre, empresa, email, telefono,
 * sector, urgencia, mensaje. Campo trampa «website» (antirrobots) y como mucho
 * 10 envios por hora y conexion. Crea o reconoce el contacto, lo reparte y lo
 * mete en el embudo al instante.
 */
require __DIR__ . '/config.php';
require_once __DIR__ . '/agentes_lib.php';
require_once __DIR__ . '/flujos_lib.php';

header('Cache-Control: no-store');
header('X-Robots-Tag: noindex');
$esJson = stripos((string)($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json') !== false;
$responder = function (int $cod, string $msg, ?string $gracias = null) use ($esJson) {
  http_response_code($cod);
  if ($esJson) { header('Content-Type: application/json; charset=utf-8'); echo json_encode($cod < 300 ? ['ok' => true] : ['error' => $msg], JSON_UNESCAPED_UNICODE); exit; }
  if ($cod < 300 && $gracias) { header('Location: ' . $gracias, true, 303); exit; }
  header('Content-Type: text/html; charset=utf-8');
  echo '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' . ($cod < 300 ? 'Gracias' : 'No se ha podido enviar') . '</title>'
    . '<style>body{font-family:system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:16px;background:#F8FAFC;color:#0F172A}main{max-width:440px;text-align:center}</style></head><body><main><h1>'
    . ($cod < 300 ? '¡Gracias!' : 'No se ha podido enviar') . '</h1><p>' . htmlspecialchars($msg) . '</p></main></body></html>';
  exit;
};
if ($_SERVER['REQUEST_METHOD'] !== 'POST') $responder(405, 'Este enlace solo recibe formularios.');
$st = icc_db()->prepare("SELECT * FROM flujos WHERE token_entrada = ? AND disparador = 'formulario'");
$st->execute([(string)($_GET['t'] ?? '')]);
$flujo = $st->fetch();
if (!$flujo || !preg_match('/^[a-f0-9]{32}$/', (string)($_GET['t'] ?? ''))) $responder(404, 'Formulario no encontrado.');
$d = $esJson ? (json_decode((string)file_get_contents('php://input'), true) ?: []) : $_POST;
$g = function ($k, $max = 190) use ($d) { return mb_substr(trim((string)($d[$k] ?? '')), 0, $max); };
$gracias = $flujo['gracias_url'] ?: null;
// Campo trampa: los robots lo rellenan; respondemos como si nada.
if ($g('website') !== '') $responder(200, 'Hemos recibido sus datos.', $gracias);
// Limite por conexion.
$ip = icc_ip();
$n = icc_db()->prepare("SELECT COUNT(*) FROM flujo_eventos WHERE tipo = 'formulario' AND ts >= NOW() - INTERVAL 1 HOUR AND datos LIKE ?");
$n->execute(['%"ip":"' . $ip . '"%']);
if ((int)$n->fetchColumn() >= 10) $responder(429, 'Demasiados envíos seguidos. Inténtelo más tarde.');
$email = $g('email') !== '' ? icc_email_normal($g('email')) : null;
$tel = preg_replace('/[^\d+]/', '', $g('telefono', 40));
if (!$email && $tel === '') $responder(422, 'Necesitamos un correo o un teléfono para contactarle.');
if ($g('nombre') === '' && $g('empresa') === '') $responder(422, 'Indique su nombre o el de su empresa.');
$db = icc_db();
$cid = null;
if ($email) { $s = $db->prepare('SELECT id FROM clientes WHERE LOWER(email) = ? OR LOWER(contacto_email) = ? LIMIT 1'); $s->execute([$email, $email]); $cid = $s->fetchColumn() ?: null; }
if (!$cid && $tel !== '') { $s = $db->prepare('SELECT id FROM clientes WHERE telefono = ? OR contacto_telefono = ? LIMIT 1'); $s->execute([$tel, $tel]); $cid = $s->fetchColumn() ?: null; }
if (!$cid) {
  $gestor = fl_reparto();
  $db->prepare("INSERT INTO clientes (comercial_id, razon_social, cif, contacto_nombre, contacto_telefono, contacto_email, sector, tipo_cliente, telefono, email, direccion_suministro, upload_token, estado, origen, ultima_actividad)
                VALUES (?, ?, '', ?, ?, ?, ?, 'pyme', ?, ?, '', ?, 'lead_captado', 'formulario', NOW())")
    ->execute([$gestor, $g('empresa') ?: $g('nombre'), $g('nombre', 150), $tel, $email ?: '', $g('sector', 120), $tel, $email ?: '', icc_uuid()]);
  $cid = (int)$db->lastInsertId();
  $db->prepare('INSERT INTO historial_estado (cliente_id, estado_anterior, estado_nuevo, cambiado_por) VALUES (?, NULL, ?, NULL)')->execute([$cid, 'lead_captado']);
  if ($gestor) icc_notificar($gestor, 'cuenta', 'formulario', 'Nuevo contacto del formulario «' . $flujo['nombre'] . '»: ' . ($g('empresa') ?: $g('nombre')) . '.', $cid);
}
$cid = (int)$cid;
if (preg_match('/^(alta|urgente|muy alta)$/iu', $g('urgencia', 40))) fl_etiquetar($cid, 'Urgente');
icc_nota_cliente($cid, 'Formulario «' . $flujo['nombre'] . "»\n" . trim(($g('mensaje', 2000) !== '' ? 'Mensaje: ' . $g('mensaje', 2000) . "\n" : '') . ($g('urgencia', 40) !== '' ? 'Urgencia: ' . $g('urgencia', 40) : '')), 'formulario');
fl_evento('formulario', $cid, ['flujo_id' => (int)$flujo['id'], 'ip' => $ip]);
icc_db()->prepare("UPDATE flujo_eventos SET procesado = 1 WHERE tipo = 'formulario' AND cliente_id = ? AND procesado = 0")->execute([$cid]);
if ($flujo['estado'] === 'activo') {
  $i = fl_inscribir($flujo, $cid, 'formulario');
  if ($i) { $s = $db->prepare('SELECT * FROM flujo_inscripciones WHERE id = ?'); $s->execute([$i]); fl_avanzar($s->fetch(), $flujo); }
}
$responder(200, 'Hemos recibido sus datos. Le contactaremos muy pronto.', $gracias);
