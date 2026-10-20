<?php
/**
 * ICC CRM · Consulta de un CUPS en el SIPS (Sistema de Informacion de Puntos
 * de Suministro) a traves de un proveedor externo, para el comparador de Energia.
 *
 *   GET ?cups=ES0031...  -> { datos: { tarifa_acceso, potencia_kw[6], consumo_kwh[6], ... } }
 *
 * PREPARADO PARA CONECTAR. Cuando contrateis un proveedor de SIPS, anadid en
 * api/config.local.php:
 *   define('ICC_SIPS_URL', 'https://proveedor.example/api/sips?cups={cups}');  // {cups} se sustituye
 *   define('ICC_SIPS_TOKEN', 'vuestro-token');
 *   define('ICC_SIPS_HEADER', 'Authorization: Bearer');   // como envia el token ese proveedor
 *
 * ene_sips_normalizar() entiende el formato estandar de la CNMC
 * (codigoTarifaATREnVigor, potenciasContratadasEnWP1..., consumoEnergiaActivaEnWhP1...).
 * Si vuestro proveedor usa otros nombres, solo hay que ajustar esa funcion.
 */
require __DIR__ . '/cmp_comun.php';

$user = cmp_actor();

$cups = strtoupper(preg_replace('/\s+/', '', (string)($_GET['cups'] ?? '')));
if (!preg_match('/^ES\d{16}[A-Z]{2}(\d[A-Z]{1,2})?$/', $cups)) {
  icc_json(['error' => 'El CUPS no tiene un formato valido (ES + 16 cifras + 2 letras).'], 422);
}
if (ICC_SIPS_URL === '') {
  icc_json(['error' => 'La consulta al SIPS aun no esta conectada. Introduce potencia y consumo a mano o sube la factura.'], 501);
}
if (!function_exists('curl_init')) icc_json(['error' => 'El servidor no tiene la extension cURL de PHP.'], 500);
if (cmp_limite_superado('sips:' . $user['id'], 200, 3600)) {
  icc_json(['error' => 'Has llegado al limite de consultas al SIPS por hora.'], 429);
}
cmp_limite_sumar('sips:' . $user['id'], 3600);

$url = str_replace('{cups}', rawurlencode($cups), ICC_SIPS_URL);
$cabeceras = ['Accept: application/json'];
if (ICC_SIPS_TOKEN !== '') $cabeceras[] = trim(ICC_SIPS_HEADER . ' ' . ICC_SIPS_TOKEN);
$ch = curl_init($url);
curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 40, CURLOPT_HTTPHEADER => $cabeceras]);
$resp = curl_exec($ch);
$http = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);
$r = is_string($resp) ? json_decode($resp, true) : null;
if ($http !== 200 || !is_array($r)) {
  error_log('[icc-sips] HTTP ' . $http);
  icc_json(['error' => $http === 404 ? 'El SIPS no tiene datos de ese CUPS.' : 'El proveedor de SIPS no ha respondido. Intentalo mas tarde.'], 502);
}

icc_json(['datos' => ene_sips_normalizar($r, $cups)]);

/** Busca una clave sin distinguir mayúsculas en un array (y en su primer elemento si es lista). */
function ene_sips_valor(array $a, string $clave)
{
    foreach ($a as $k => $v) {
        if (is_string($k) && strcasecmp($k, $clave) === 0) {
            return $v;
        }
    }
    return null;
}

function ene_sips_normalizar(array $r, string $cups): array
{
    // Muchos proveedores envuelven la respuesta: { data: { ps: {...}, consumos: [...] } }
    $base = $r['data'] ?? $r['datos'] ?? $r;
    $ps = $base['ps'] ?? $base['puntoSuministro'] ?? $base['supply_point'] ?? $base;
    if (isset($ps[0]) && is_array($ps[0])) {
        $ps = $ps[0];
    }
    $consumos = $base['consumos'] ?? $base['consumptions'] ?? [];

    $mapaPeajes = ['018' => '2.0TD', '019' => '3.0TD', '020' => '6.1TD', '021' => '6.2TD', '022' => '6.3TD', '023' => '6.4TD'];
    $peaje = (string) (ene_sips_valor($ps, 'codigoTarifaATREnVigor') ?? ene_sips_valor($ps, 'tarifa') ?? '');
    $peaje = $mapaPeajes[$peaje] ?? strtoupper(str_replace(' ', '', $peaje));

    $potencias = [];
    for ($i = 1; $i <= 6; $i++) {
        $w = ene_sips_valor($ps, "potenciasContratadasEnWP$i");
        $kw = ene_sips_valor($ps, "potenciaP$i");
        $potencias[] = is_numeric($w) ? round($w / 1000, 3) : (is_numeric($kw) ? (float) $kw : 0.0);
    }

    // Consumo de los últimos 12 meses por periodo (Wh → kWh).
    $sumas = array_fill(0, 6, 0.0);
    if (is_array($consumos)) {
        $consumos = array_values(array_filter($consumos, 'is_array'));
        usort($consumos, function ($a, $b) { return strcmp((string) (ene_sips_valor($b, 'fechaFinMesConsumo') ?? ''), (string) (ene_sips_valor($a, 'fechaFinMesConsumo') ?? '')); });
        $dias = 0;
        foreach ($consumos as $c) {
            if (!is_array($c) || $dias >= 365) {
                break;
            }
            $ini = strtotime((string) (ene_sips_valor($c, 'fechaInicioMesConsumo') ?? ''));
            $fin = strtotime((string) (ene_sips_valor($c, 'fechaFinMesConsumo') ?? ''));
            $dias += ($ini && $fin) ? max(1, (int) round(($fin - $ini) / 86400)) : 30;
            for ($i = 1; $i <= 6; $i++) {
                $wh = ene_sips_valor($c, "consumoEnergiaActivaEnWhP$i");
                $sumas[$i - 1] += is_numeric($wh) ? $wh / 1000 : 0;
            }
        }
    }

    return [
        'cups' => $cups,
        'tipo' => substr($peaje, 0, 2) === 'RL' ? 'gas' : 'luz',
        'tarifa_acceso' => $peaje,
        'distribuidora' => (string) (ene_sips_valor($ps, 'nombreEmpresaDistribuidora') ?? ene_sips_valor($ps, 'distribuidora') ?? ''),
        'potencia_kw' => $potencias,
        'consumo_kwh' => array_map(function ($v) { return round($v, 1); }, $sumas),
        'fecha_ultimo_cambio_comercializadora' => (string) (ene_sips_valor($ps, 'fechaUltimoCambioComercializador') ?? ''),
    ];
}
