<?php
/**
 * Elite Energy · envío de formularios por correo electrónico.
 * Recibe los formularios de la web y los manda a DESTINO con la factura adjunta.
 * Requiere un hosting con PHP y la función mail() activa (lo habitual en hostings españoles).
 */

declare(strict_types=1);

const DESTINO   = 'info@eliteeenergy.es';                 // Buzón que recibe las solicitudes
const REMITENTE = 'web@eliteeenergy.es';                  // Debe ser del mismo dominio que la web
const MAX_MB    = 8;
const TIPOS_OK  = [
    'application/pdf' => 'pdf', 'image/jpeg' => 'jpg', 'image/png' => 'png',
    'image/webp' => 'webp', 'image/heic' => 'heic', 'image/heif' => 'heic',
];

function volver(string $error): never {
    header('Location: contacto.html?error=' . rawurlencode($error) . '#form-msg', true, 303);
    exit;
}

function campo(string $nombre, int $max = 200): string {
    $v = trim((string)($_POST[$nombre] ?? ''));
    $v = str_replace(["\r", "\0"], '', $v);
    return mb_substr($v, 0, $max);
}

function linea(string $v): string {
    return trim(preg_replace('/[\r\n]+/', ' ', $v) ?? '');
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Location: contacto.html', true, 303);
    exit;
}

// Antispam: campo trampa vacío y un mínimo de 3 segundos rellenando el formulario
if (campo('web') !== '') { header('Location: gracias.html', true, 303); exit; }
$ts = (int)substr(campo('ts', 20), 0, 13);
$ahora = (int)round(microtime(true) * 1000);
if ($ts > 0 && ($ahora - $ts) < 3000) { header('Location: gracias.html', true, 303); exit; }

$nombre   = linea(campo('nombre', 80));
$telefono = linea(campo('telefono', 20));
$email    = linea(campo('email', 120));
$priv     = campo('privacidad', 5);

if ($nombre === '' || !preg_match('/^[0-9 +]{9,15}$/', $telefono) || !filter_var($email, FILTER_VALIDATE_EMAIL) || $priv !== 'si') {
    volver('datos');
}

$origen = preg_replace('/[^a-z0-9-]/', '', strtolower(campo('origen', 60))) ?: 'web';
$datos = [
    'Formulario'          => $origen === 'colaboradores' ? 'Alta de colaborador / distribuidor' : 'Solicitud de cliente',
    'Página'              => $origen,
    'Nombre'              => $nombre,
    'Empresa'             => linea(campo('empresa', 100)),
    'Teléfono'            => $telefono,
    'Correo'              => $email,
    'Interés'             => linea(campo('interes', 30)),
    'Perfil'              => linea(campo('perfil', 60)),
    'Experiencia'         => linea(campo('experiencia', 60)),
    'Zona'                => linea(campo('zona', 60)),
    'Mensaje'             => campo('mensaje', 2000),
    'Acepta privacidad'   => 'Sí',
    'Acepta comerciales'  => campo('comercial', 5) === 'si' ? 'Sí' : 'No',
    'Fecha'               => date('d/m/Y H:i'),
    'IP'                  => $_SERVER['REMOTE_ADDR'] ?? '',
];

$texto = "Nueva solicitud desde la web de Elite Energy\n\n";
foreach ($datos as $k => $v) {
    if ($v === '') continue;
    $texto .= mb_str_pad($k . ':', 20) . ($k === 'Mensaje' ? "\n" . $v : $v) . "\n";
}

// Adjunto opcional
$adjunto = null;
if (!empty($_FILES['factura']) && ($_FILES['factura']['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE) {
    $f = $_FILES['factura'];
    if ($f['error'] !== UPLOAD_ERR_OK || $f['size'] > MAX_MB * 1024 * 1024 || !is_uploaded_file($f['tmp_name'])) {
        volver('archivo');
    }
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($f['tmp_name']) ?: '';
    if (!isset(TIPOS_OK[$mime])) volver('archivo');
    $adjunto = [
        'nombre' => 'factura-' . trim((string)preg_replace('/[^a-z0-9]+/', '-', strtolower((string)(iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $nombre) ?: 'cliente'))), '-') . '.' . TIPOS_OK[$mime],
        'mime'   => $mime,
        'datos'  => chunk_split(base64_encode((string)file_get_contents($f['tmp_name']))),
    ];
}

$asunto = mb_encode_mimeheader('[Web] ' . ($origen === 'colaboradores' ? 'Nuevo colaborador' : 'Nueva solicitud') . ': ' . $nombre, 'UTF-8', 'B');
$frontera = 'ee_' . bin2hex(random_bytes(12));
$cabeceras = [
    'From: ' . mb_encode_mimeheader('Web Elite Energy', 'UTF-8', 'B') . ' <' . REMITENTE . '>',
    'Reply-To: ' . $email,
    'MIME-Version: 1.0',
];

if ($adjunto) {
    $cabeceras[] = "Content-Type: multipart/mixed; boundary=\"$frontera\"";
    $cuerpo = "--$frontera\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n" . $texto . "\r\n"
            . "--$frontera\r\nContent-Type: {$adjunto['mime']}; name=\"{$adjunto['nombre']}\"\r\n"
            . "Content-Transfer-Encoding: base64\r\nContent-Disposition: attachment; filename=\"{$adjunto['nombre']}\"\r\n\r\n"
            . $adjunto['datos'] . "\r\n--$frontera--";
} else {
    $cabeceras[] = 'Content-Type: text/plain; charset=UTF-8';
    $cabeceras[] = 'Content-Transfer-Encoding: 8bit';
    $cuerpo = $texto;
}

$ok = mail(DESTINO, $asunto, $cuerpo, implode("\r\n", $cabeceras), '-f' . REMITENTE);
if (!$ok) volver('envio');

header('Location: gracias.html', true, 303);
exit;
