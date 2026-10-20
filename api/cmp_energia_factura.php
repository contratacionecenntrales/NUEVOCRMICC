<?php
/**
 * ICC CRM · Lectura de facturas de luz y gas con IA (Claude, de Anthropic)
 * para el comparador de Energia.
 *
 *   POST (multipart/form-data) campo "factura": PDF, JPG, PNG o WEBP (max. 10 MB)
 *   -> { datos: {...} } con los campos que rellena el comparador.
 *
 * Necesita ICC_ANTHROPIC_API_KEY en api/config.local.php (ICC_ANTHROPIC_MODEL
 * es opcional). La factura solo se envia a la API de Anthropic para leerla;
 * no se guarda en el servidor.
 */
require __DIR__ . '/cmp_comun.php';

$user = cmp_actor();
icc_require_csrf();
if ($_SERVER['REQUEST_METHOD'] !== 'POST') icc_json(['error' => 'Metodo no soportado.'], 405);

if (ICC_ANTHROPIC_API_KEY === '') {
  icc_json(['error' => 'La lectura con IA no esta activada. Anade ICC_ANTHROPIC_API_KEY en api/config.local.php o rellena los datos a mano.'], 501);
}
if (!function_exists('curl_init')) icc_json(['error' => 'El servidor no tiene la extension cURL de PHP.'], 500);

// 60 lecturas por hora y usuario, para que un error no dispare el gasto.
$claveLimite = 'factura-ia:' . $user['id'];
if (cmp_limite_superado($claveLimite, 60, 3600)) {
  icc_json(['error' => 'Has llegado al limite de 60 facturas por hora. Espera un poco o rellena los datos a mano.'], 429);
}

$f = $_FILES['factura'] ?? null;
if (!$f || ($f['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
  $codigo = $f['error'] ?? UPLOAD_ERR_NO_FILE;
  icc_json(['error' => in_array($codigo, [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true)
    ? 'La factura pesa mas de lo que admite el servidor. Prueba con un PDF mas ligero o una foto.'
    : 'No ha llegado ninguna factura.'], 422);
}
if ($f['size'] > 10 * 1024 * 1024) icc_json(['error' => 'La factura pesa mas de 10 MB.'], 413);
$bytes = file_get_contents($f['tmp_name']);
if ($bytes === false || $bytes === '') icc_json(['error' => 'No se ha podido leer el archivo.'], 422);

// Tipo real por la cabecera del archivo, no por la extension.
if (strncmp($bytes, '%PDF', 4) === 0) $mime = 'application/pdf';
elseif (strncmp($bytes, "\x89PNG", 4) === 0) $mime = 'image/png';
elseif (strncmp($bytes, "\xFF\xD8\xFF", 3) === 0) $mime = 'image/jpeg';
elseif (substr($bytes, 0, 4) === 'RIFF' && substr($bytes, 8, 4) === 'WEBP') $mime = 'image/webp';
else icc_json(['error' => 'Formato no admitido. Sube un PDF, JPG o PNG.'], 415);

$bloque = [
  'type' => $mime === 'application/pdf' ? 'document' : 'image',
  'source' => ['type' => 'base64', 'media_type' => $mime, 'data' => base64_encode($bytes)],
];
unset($bytes);

$instrucciones = <<<TXT
Eres un analista de facturas de energia en Espana. Lee la factura adjunta (luz o gas natural) y rellena los campos del esquema con sus datos.

Reglas:
- Numeros con punto decimal, sin simbolo de euro. Si un dato no aparece, usa 0 (o "" en textos). No inventes.
- Precios SIN impuestos, tal y como aparecen en el detalle de la factura.
- Precio de potencia en €/kW·dia. Si la factura lo da en €/kW·ano, divide entre 365; si da €/kW·mes, conviertelo a dia con los dias del periodo.
- Las listas por periodo tienen siempre 6 valores (P1 a P6).
- En 2.0TD hay 2 potencias (P1 punta, P2 valle) y 3 consumos (P1 punta, P2 llano, P3 valle); deja el resto a 0.
- Si la factura tiene un unico precio de energia para todo el consumo, repitelo en los periodos que tengan consumo.
- Si hay varios tramos de precio en el mismo periodo, pon el precio medio ponderado.
- "importe_ssaa": servicios de ajuste / coste de red / mecanismo de ajuste cobrados aparte, en euros (0 si no hay).
- "total_factura": importe total a pagar con impuestos.
- Gas: "termino_fijo_dia" en €/dia, consumo en kWh en la posicion P1 y su precio en "precio_energia_kwh" P1.
- "zona": canarias si el suministro esta en Canarias (IGIC), ceuta_melilla si esta en Ceuta o Melilla (IPSI); si no, peninsula.
- Fechas en formato AAAA-MM-DD ("" si no aparecen).
- "observaciones": una frase con cualquier cargo raro que convenga revisar (servicios anadidos, penalizaciones...), o "".
TXT;

$numeros6 = ['type' => 'array', 'items' => ['type' => 'number']];
$esquema = [
  'type' => 'object',
  'additionalProperties' => false,
  'properties' => [
    'tipo' => ['type' => 'string', 'enum' => ['luz', 'gas']],
    'cliente_nombre' => ['type' => 'string'],
    'cif_nif' => ['type' => 'string'],
    'direccion_suministro' => ['type' => 'string'],
    'cups' => ['type' => 'string'],
    'comercializadora' => ['type' => 'string'],
    'nombre_tarifa' => ['type' => 'string'],
    'tarifa_acceso' => ['type' => 'string', 'enum' => ['2.0TD', '3.0TD', '6.1TD', '6.2TD', '6.3TD', '6.4TD', 'RL.1', 'RL.2', 'RL.3', 'RL.4', 'RL.5', 'RL.6', '']],
    'zona' => ['type' => 'string', 'enum' => ['peninsula', 'canarias', 'ceuta_melilla']],
    'tipo_cliente' => ['type' => 'string', 'enum' => ['residencial', 'pyme']],
    'fecha_inicio' => ['type' => 'string'],
    'fecha_fin' => ['type' => 'string'],
    'dias' => ['type' => 'number'],
    'potencia_kw' => $numeros6,
    'precio_potencia_kw_dia' => $numeros6,
    'consumo_kwh' => $numeros6,
    'precio_energia_kwh' => $numeros6,
    'termino_fijo_dia' => ['type' => 'number'],
    'total_factura' => ['type' => 'number'],
    'importe_ssaa' => ['type' => 'number'],
    'energia_reactiva' => ['type' => 'number'],
    'excesos_potencia' => ['type' => 'number'],
    'alquiler_equipos' => ['type' => 'number'],
    'autoconsumo' => ['type' => 'boolean'],
    'excedentes_kwh' => ['type' => 'number'],
    'precio_compensacion_kwh' => ['type' => 'number'],
    'observaciones' => ['type' => 'string'],
  ],
];
$esquema['required'] = array_keys($esquema['properties']);

$modelo = ICC_ANTHROPIC_MODEL !== '' ? ICC_ANTHROPIC_MODEL : 'claude-sonnet-5-5';
$payload = [
  'model' => $modelo,
  // El modelo razona antes de contestar: margen de sobra para no cortar el JSON.
  'max_tokens' => 16000,
  'output_config' => [
    'effort' => 'low',
    'format' => ['type' => 'json_schema', 'schema' => $esquema],
  ],
  'messages' => [[
    'role' => 'user',
    'content' => [$bloque, ['type' => 'text', 'text' => $instrucciones]],
  ]],
];
$cabeceras = [
  'content-type: application/json',
  'x-api-key: ' . ICC_ANTHROPIC_API_KEY,
  'anthropic-version: 2023-06-01',
];
// Si el modelo rechaza la peticion por una salvaguarda, la API reintenta sola
// con el modelo de respaldo recomendado (solo los modelos que lo admiten).
if (preg_match('/^claude-(sonnet-5-5|opus-5-5|opus-5|fable-5-1)$/', $modelo)) {
  $payload['fallbacks'] = 'default';
  $cabeceras[] = 'anthropic-beta: server-side-fallback-2026-07-01';
}

cmp_limite_sumar($claveLimite, 3600);

$ch = curl_init(ICC_ANTHROPIC_URL);
curl_setopt_array($ch, [
  CURLOPT_POST => true,
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_TIMEOUT => 240,
  CURLOPT_CONNECTTIMEOUT => 15,
  CURLOPT_HTTPHEADER => $cabeceras,
  CURLOPT_POSTFIELDS => json_encode($payload),
]);
$respuesta = curl_exec($ch);
$http = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
$errCurl = curl_error($ch);
curl_close($ch);

if ($respuesta === false) {
  error_log('[icc-energia-ia] cURL: ' . $errCurl);
  icc_json(['error' => 'No se ha podido contactar con el servicio de IA. Intentalo de nuevo o rellena los datos a mano.'], 502);
}
$r = json_decode($respuesta, true);
if ($http !== 200 || !is_array($r)) {
  error_log('[icc-energia-ia] HTTP ' . $http . ' ' . (is_array($r) ? ($r['error']['message'] ?? '') : ''));
  $msg = $http === 401 ? 'La clave de la API de Anthropic no es valida (revisa api/config.local.php).'
    : ($http === 429 || $http === 529 ? 'El servicio de IA esta saturado. Espera un minuto y vuelve a probar.'
    : 'El servicio de IA no ha podido leer la factura. Prueba con otra imagen o rellena los datos a mano.');
  icc_json(['error' => $msg], 502);
}
$parada = $r['stop_reason'] ?? '';
if ($parada === 'refusal') {
  icc_json(['error' => 'El servicio de IA no ha querido procesar este archivo. Rellena los datos a mano.'], 422);
}
if ($parada === 'max_tokens') {
  error_log('[icc-energia-ia] respuesta cortada por max_tokens');
  icc_json(['error' => 'La factura es demasiado larga para leerla de una vez. Sube solo las paginas con el detalle de consumo.'], 422);
}

$texto = '';
foreach ($r['content'] ?? [] as $c) {
  if (($c['type'] ?? '') === 'text') $texto .= $c['text'];
}
$datos = json_decode($texto, true);
if (!is_array($datos)) {
  icc_json(['error' => 'No se han podido extraer datos de esta factura. Comprueba que se lee bien o rellenalos a mano.'], 422);
}

// Limpieza: solo campos conocidos y tipos correctos.
$cortar = function (string $v, int $max) { return function_exists('mb_substr') ? mb_substr($v, 0, $max) : substr($v, 0, $max); };
$txt = function ($k, $max = 150) use ($datos, $cortar) { return $cortar(trim(is_scalar($datos[$k] ?? null) ? (string)$datos[$k] : ''), $max); };
$n = function ($k) use ($datos) { return is_numeric($datos[$k] ?? null) ? round((float)$datos[$k], 6) : 0.0; };
$arr = function ($k) use ($datos) {
  $v = is_array($datos[$k] ?? null) ? array_values($datos[$k]) : [];
  $out = [];
  for ($i = 0; $i < 6; $i++) $out[] = is_numeric($v[$i] ?? null) ? round((float)$v[$i], 6) : 0.0;
  return $out;
};
$fecha = function ($k) use ($datos) {
  $v = (string)($datos[$k] ?? '');
  return preg_match('/^\d{4}-\d{2}-\d{2}$/', $v) ? $v : '';
};
$peajesOk = ['2.0TD', '3.0TD', '6.1TD', '6.2TD', '6.3TD', '6.4TD', 'RL.1', 'RL.2', 'RL.3', 'RL.4', 'RL.5', 'RL.6'];
$peaje = strtoupper(str_replace(' ', '', (string)($datos['tarifa_acceso'] ?? '')));

icc_json(['datos' => [
  'tipo' => ($datos['tipo'] ?? '') === 'gas' ? 'gas' : 'luz',
  'cliente_nombre' => $txt('cliente_nombre'),
  'cif_nif' => $txt('cif_nif', 20),
  'direccion_suministro' => $txt('direccion_suministro', 200),
  'cups' => strtoupper(preg_replace('/\s+/', '', $txt('cups', 30))),
  'comercializadora' => $txt('comercializadora'),
  'nombre_tarifa' => $txt('nombre_tarifa'),
  'tarifa_acceso' => in_array($peaje, $peajesOk, true) ? $peaje : '',
  'zona' => in_array($datos['zona'] ?? '', ['canarias', 'ceuta_melilla'], true) ? $datos['zona'] : 'peninsula',
  'tipo_cliente' => ($datos['tipo_cliente'] ?? '') === 'residencial' ? 'residencial' : 'pyme',
  'fecha_inicio' => $fecha('fecha_inicio'),
  'fecha_fin' => $fecha('fecha_fin'),
  'dias' => (int)$n('dias'),
  'potencia_kw' => $arr('potencia_kw'),
  'precio_potencia_kw_dia' => $arr('precio_potencia_kw_dia'),
  'consumo_kwh' => $arr('consumo_kwh'),
  'precio_energia_kwh' => $arr('precio_energia_kwh'),
  'termino_fijo_dia' => $n('termino_fijo_dia'),
  'total_factura' => $n('total_factura'),
  'importe_ssaa' => $n('importe_ssaa'),
  'energia_reactiva' => $n('energia_reactiva'),
  'excesos_potencia' => $n('excesos_potencia'),
  'alquiler_equipos' => $n('alquiler_equipos'),
  'autoconsumo' => !empty($datos['autoconsumo']),
  'excedentes_kwh' => $n('excedentes_kwh'),
  'precio_compensacion_kwh' => $n('precio_compensacion_kwh'),
  'observaciones' => $txt('observaciones', 300),
]]);
