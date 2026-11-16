<?php
/**
 * ICC CRM · Formulario publico de candidatura de una vacante (?t=TOKEN).
 * GET muestra el formulario; POST da de alta al candidato con su consentimiento
 * y el agente de WhatsApp le escribe para la entrevista. Campo trampa y como
 * mucho 10 envios por hora y conexion.
 */
require __DIR__ . '/config.php';
require_once __DIR__ . '/rrhh_lib.php';

header('Cache-Control: no-store');
header('X-Robots-Tag: noindex');
header('Content-Type: text/html; charset=utf-8');
$tok = (string)($_GET['t'] ?? '');
$st = icc_db()->prepare("SELECT * FROM rrhh_vacantes WHERE token = ? AND estado = 'activa'");
$st->execute([preg_match('/^[a-f0-9]{32}$/', $tok) ? $tok : '-']);
$v = $st->fetch();
$h = function ($s) { return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8'); };
$pagina = function (string $titulo, string $cuerpo) use ($h) {
  echo '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' . $h($titulo) . '</title><style>'
    . 'body{font-family:system-ui,-apple-system,sans-serif;margin:0;background:#F1F5F9;color:#0F172A}main{max-width:520px;margin:0 auto;padding:24px 16px}'
    . '.c{background:#fff;border-radius:16px;padding:22px;box-shadow:0 2px 12px rgba(15,23,42,.08)}h1{font-size:22px;margin:0 0 6px}p{line-height:1.55;color:#334155}'
    . 'label{display:block;font-weight:600;font-size:14px;margin:14px 0 6px}input[type=text],input[type=tel],input[type=email]{width:100%;box-sizing:border-box;padding:12px;border:1px solid #CBD5E1;border-radius:10px;font-size:16px}'
    . '.ck{display:flex;gap:8px;align-items:flex-start;font-weight:400;font-size:13px;color:#334155}.ck input{margin-top:3px}button{margin-top:18px;width:100%;padding:14px;border:0;border-radius:12px;background:#10B981;color:#fff;font-size:16px;font-weight:700;cursor:pointer}'
    . '.d{font-size:14px;color:#475569}.t{position:absolute;left:-9999px}small{color:#64748B}</style></head><body><main><div class="c">' . $cuerpo . '</div><p><small>ICC Consultoría · Integral Connection Consulting</small></p></main></body></html>';
  exit;
};
if (!$v) { http_response_code(404); $pagina('Oferta no disponible', '<h1>Esta oferta ya no está disponible</h1><p>Gracias por tu interés.</p>'); }
$cfg = rr_config();
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
  $ip = substr(hash('sha256', ($_SERVER['REMOTE_ADDR'] ?? '') . date('YmdH')), 0, 16);
  $k = 'rrhh_form_' . $ip;
  $n = (int)icc_ajuste($k, '0');
  if (!empty($_POST['website']) || $n >= 10) $pagina('Gracias', '<h1>¡Gracias!</h1><p>Hemos recibido tu candidatura.</p>');
  icc_ajuste_guardar($k, (string)($n + 1));
  if (empty($_POST['acepto'])) $pagina('Falta tu consentimiento', '<h1>Falta tu consentimiento</h1><p>Para hacer la entrevista por WhatsApp necesitamos que lo aceptes. <a href="?t=' . $h($tok) . '">Volver</a></p>');
  try {
    $cid = rr_alta_candidato((string)($_POST['nombre'] ?? ''), (string)($_POST['telefono'] ?? ''), (string)($_POST['email'] ?? ''), 'formulario', true);
    rr_invitar((int)$v['id'], $cid);
  } catch (InvalidArgumentException $e) { $pagina('Revisa tus datos', '<h1>Revisa tus datos</h1><p>' . $h($e->getMessage()) . ' <a href="?t=' . $h($tok) . '">Volver</a></p>'); }
  $pagina('¡Candidatura recibida!', '<h1>¡Candidatura recibida!</h1><p>En unos minutos te escribiremos por <b>WhatsApp</b> para hacerte la entrevista (5-10 minutos, cuando te venga bien). Guarda nuestro número para no perderte el mensaje.</p>');
}
$det = array_filter([$v['ubicacion'], $v['modalidad'], $v['jornada'], $v['salario']]);
$pagina('Trabaja con nosotros · ' . $v['titulo'], '<h1>' . $h($v['titulo']) . '</h1><p class="d">' . $h(implode(' · ', $det)) . '</p>' . ($v['descripcion'] ? '<p>' . nl2br($h($v['descripcion'])) . '</p>' : '')
  . '<form method="post"><label>Nombre y apellidos<input type="text" name="nombre" required maxlength="160" autocomplete="name"></label>'
  . '<label>Teléfono móvil (WhatsApp)<input type="tel" name="telefono" required maxlength="20" autocomplete="tel" placeholder="600 000 000"></label>'
  . '<label>Correo electrónico (opcional)<input type="email" name="email" maxlength="190" autocomplete="email"></label><input class="t" name="website" tabindex="-1" autocomplete="off">'
  . '<label class="ck"><input type="checkbox" name="acepto" value="1" required><span>Acepto que ICC Consultoría trate mis datos para este proceso de selección y me contacte por WhatsApp. La entrevista la hace un asistente con inteligencia artificial y una persona revisa siempre el resultado. '
  . 'Mis datos se conservan ' . $cfg['meses_conservar'] . ' meses y puedo pedir su borrado en cualquier momento.' . ($cfg['privacidad_url'] ? ' <a href="' . $h($cfg['privacidad_url']) . '" target="_blank" rel="noopener">Política de privacidad</a>.' : '') . '</span></label>'
  . '<button type="submit">Enviar mi candidatura</button></form>');
