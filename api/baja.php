<?php
/**
 * ICC CRM · Baja en un clic (enlace del pie de los correos del Motor y de las
 * automatizaciones). Publica, sin sesion; el enlace va firmado (HMAC).
 *  GET  ?t=...          pagina de confirmacion
 *  GET  ?t=...&ok=1     confirma la baja
 *  POST ?t=...          List-Unsubscribe-Post (RFC 8058): baja directa desde el gestor de correo
 */
require __DIR__ . '/config.php';

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex');

function baja_pagina(string $titulo, string $texto, string $boton = ''): void {
  echo '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">'
    . '<title>' . htmlspecialchars($titulo) . '</title><style>body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#0B1220;color:#E5E7EB;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:16px}'
    . 'main{max-width:460px;background:#111A2E;border:1px solid #1F2A44;border-radius:16px;padding:28px}h1{font-size:21px;margin:0 0 10px}p{color:#9CA3AF;line-height:1.55}'
    . 'a.b{display:inline-block;margin-top:10px;background:#10B981;color:#04221A;font-weight:700;padding:11px 18px;border-radius:10px;text-decoration:none}</style></head><body><main>'
    . '<h1>' . htmlspecialchars($titulo) . '</h1><p>' . $texto . '</p>' . $boton . '<p style="font-size:12px;margin-top:22px">Integral Connection Consulting</p></main></body></html>';
  exit;
}

$t = (string)($_GET['t'] ?? '');
$partes = explode('.', $t);
$ok = false; $email = '';
if (count($partes) === 2) {
  $datos = (string)base64_decode(strtr($partes[0], '-_', '+/'));
  if ($datos !== '' && icc_firma_ok('baja|' . $datos, $partes[1])) {
    $email = substr($datos, strpos($datos, '.') + 1);
    $ok = filter_var($email, FILTER_VALIDATE_EMAIL) !== false;
  }
}
if (!$ok) { http_response_code(400); baja_pagina('Enlace no válido', 'Este enlace de baja no es correcto o está incompleto. Si quiere dejar de recibir correos, responda al correo con la palabra «BAJA».'); }

$confirmar = $_SERVER['REQUEST_METHOD'] === 'POST' || ($_GET['ok'] ?? '') === '1';
if ($confirmar) {
  icc_baja_anotar($email, 'email', 'Baja con el enlace del correo', 'enlace');
  try {
    icc_db()->prepare("UPDATE motor_leads SET estado = 'baja', proximo_envio = NULL WHERE email = ?")->execute([$email]);
    icc_db()->prepare("UPDATE motor_mensajes m JOIN motor_leads l ON l.id = m.lead_id SET m.estado = 'descartado' WHERE l.email = ? AND m.estado IN ('pendiente','aprobado','borrador')")->execute([$email]);
  } catch (Throwable $e) { /* sin motor */ }
  if ($_SERVER['REQUEST_METHOD'] === 'POST') { http_response_code(200); echo 'OK'; exit; }
  baja_pagina('Baja confirmada', 'No volveremos a escribir a <b>' . htmlspecialchars($email) . '</b> por ningún canal. Sentimos las molestias.');
}
baja_pagina('¿Darse de baja?', 'Dejaremos de enviar correos comerciales a <b>' . htmlspecialchars($email) . '</b> y no volveremos a contactar por ningún canal.',
  '<a class="b" href="?t=' . htmlspecialchars(rawurlencode($t)) . '&amp;ok=1">Confirmar la baja</a>');
