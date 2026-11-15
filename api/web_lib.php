<?php
/**
 * ICC CRM · Lectura de webs de empresas y Google Places (Motor de prospeccion).
 * - Solo direcciones publicas (nunca IPs internas), maximo 1,5 MB por pagina,
 *   respeta robots.txt y se identifica como bot del CRM.
 * - El texto de las webs es DATO: nunca se usa como instruccion para la IA.
 */

const ICC_WEB_AGENTE = 'ICC-CRM-Prospeccion/1.0 (+contacto en el aviso legal de la empresa)';

function icc_web_simulador(): bool {
  return defined('ICC_IA_SIMULADOR') && ICC_IA_SIMULADOR === true;
}

/** true si el host resuelve solo a IPs publicas (evita que nos hagan leer la red interna). */
function icc_web_host_publico(string $host): bool {
  if (icc_web_simulador()) return true;
  if ($host === '' || preg_match('/^(localhost|.*\.local|.*\.internal)$/i', $host)) return false;
  $ips = filter_var($host, FILTER_VALIDATE_IP) ? [$host] : (gethostbynamel($host) ?: []);
  if (!$ips) return false;
  foreach ($ips as $ip) {
    if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) return false;
  }
  return true;
}

/** GET simple. Devuelve [codigo, cuerpo, url_final, error]. Sigue hasta 4 redirecciones comprobando cada salto. */
function icc_web_get(string $url, int $timeout = 8, int $max = 1500000): array {
  for ($salto = 0; $salto < 5; $salto++) {
    $p = parse_url($url);
    if (!$p || !in_array(strtolower($p['scheme'] ?? ''), ['http', 'https'], true)) return [0, '', $url, 'URL no válida'];
    if (!icc_web_host_publico((string)($p['host'] ?? ''))) return [0, '', $url, 'Dirección no pública'];
    $ch = curl_init($url);
    $cuerpo = '';
    curl_setopt_array($ch, [
      CURLOPT_RETURNTRANSFER => false, CURLOPT_FOLLOWLOCATION => false, CURLOPT_TIMEOUT => $timeout, CURLOPT_CONNECTTIMEOUT => 5,
      CURLOPT_USERAGENT => ICC_WEB_AGENTE, CURLOPT_HTTPHEADER => ['Accept: text/html,*/*;q=0.5', 'Accept-Language: es-ES,es;q=0.9'],
      CURLOPT_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS, CURLOPT_ENCODING => '',
      CURLOPT_WRITEFUNCTION => function ($ch, $d) use (&$cuerpo, $max) { $cuerpo .= $d; return strlen($cuerpo) > $max ? 0 : strlen($d); },
    ]);
    curl_exec($ch);
    $codigo = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $loc = (string)curl_getinfo($ch, CURLINFO_REDIRECT_URL);
    $err = curl_errno($ch) && strlen($cuerpo) <= $max ? curl_error($ch) : '';
    curl_close($ch);
    if ($codigo >= 300 && $codigo < 400 && $loc !== '') { $url = $loc; continue; }
    return [$codigo, $cuerpo, $url, $err];
  }
  return [0, '', $url, 'Demasiadas redirecciones'];
}

/** robots.txt: true si nuestro agente (o *) puede leer esa ruta. */
function icc_web_robots_ok(string $url): bool {
  static $cache = [];
  $p = parse_url($url);
  $base = ($p['scheme'] ?? 'https') . '://' . ($p['host'] ?? '') . (isset($p['port']) ? ':' . $p['port'] : '');
  if (!array_key_exists($base, $cache)) {
    [$cod, $txt] = icc_web_get($base . '/robots.txt', 5, 200000);
    $reglas = [];
    if ($cod === 200) {
      $aplica = false;
      foreach (preg_split('/\r?\n/', $txt) as $l) {
        $l = trim(preg_replace('/#.*/', '', $l));
        if (preg_match('/^user-agent:\s*(.+)$/i', $l, $m)) { $ua = trim($m[1]); $aplica = $ua === '*' || stripos(ICC_WEB_AGENTE, $ua) !== false; continue; }
        if ($aplica && preg_match('/^disallow:\s*(.*)$/i', $l, $m) && trim($m[1]) !== '') $reglas[] = trim($m[1]);
      }
    }
    $cache[$base] = $reglas;
  }
  $ruta = ($p['path'] ?? '/') ?: '/';
  foreach ($cache[$base] as $r) if (strpos($ruta, rtrim($r, '*')) === 0) return false;
  return true;
}

/** Correos genericos de empresa (info@, contacto@...) que aparecen en el HTML. */
function icc_web_correos(string $html, string $dominioWeb): array {
  $html = html_entity_decode(str_replace(['[at]', '(at)', ' arroba '], '@', $html), ENT_QUOTES | ENT_HTML5, 'UTF-8');
  preg_match_all('/(?:mailto:)?([A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-\x{00C0}-\x{024F}]+\.[A-Za-z]{2,})/u', $html, $m);
  $genericos = '/^(info|informacion|contacto|contact|hola|hello|comercial|ventas|administracion|admin|oficina|gerencia|empresa|atencion|clientes|reservas|pedidos|central|correo|general|recepcion)\b/i';
  $out = [];
  foreach (array_unique($m[1]) as $e) {
    $n = icc_email_normal($e);
    if (!$n || preg_match('/\.(png|jpe?g|gif|webp|svg)$/i', $n) || preg_match('/(sentry|wixpress|example|ejemplo|dominio)\./i', $n)) continue;
    if (preg_match($genericos, $n)) $out[] = $n;
  }
  // Primero los del propio dominio de la web.
  usort($out, function ($a, $b) use ($dominioWeb) {
    return (int)(substr($b, -strlen($dominioWeb)) === $dominioWeb) - (int)(substr($a, -strlen($dominioWeb)) === $dominioWeb);
  });
  return array_values(array_unique($out));
}

function icc_web_mx_ok(string $email): bool {
  $dom = substr($email, strpos($email, '@') + 1);
  if (icc_web_simulador()) return strpos($dom, 'sinmx') === false;
  return function_exists('checkdnsrr') && (checkdnsrr($dom, 'MX') || checkdnsrr($dom, 'A'));
}

/**
 * Analiza la web de una empresa: portada, contacto y aviso legal.
 * Devuelve email, telefono, cif, razon_social, madurez[], extracto (texto para la IA).
 */
function icc_web_analizar(string $web): array {
  $out = ['ok' => false, 'email' => '', 'emails' => [], 'telefono' => '', 'cif' => '', 'razon_social' => '', 'madurez' => [], 'extracto' => '', 'error' => ''];
  if (!preg_match('#^https?://#i', $web)) $web = 'https://' . $web;
  if (!icc_web_robots_ok($web)) { $out['error'] = 'robots.txt no permite leer la web'; return $out; }
  [$cod, $html, $final, $err] = icc_web_get($web);
  if ($cod !== 200 || $html === '') { $out['error'] = $err ?: 'La web no responde (' . $cod . ')'; return $out; }
  $host = strtolower((string)parse_url($final, PHP_URL_HOST));
  $dominio = preg_replace('/^www\./', '', $host);
  $paginas = [$html];
  // Enlaces a contacto y aviso legal del mismo dominio.
  preg_match_all('#href=["\']([^"\'\#]+)["\']#i', $html, $m);
  $extra = [];
  foreach ($m[1] as $href) {
    if (!preg_match('/contact|aviso[-_ ]?legal|legal|quienes|nosotros|empresa/i', $href)) continue;
    $abs = preg_match('#^https?://#i', $href) ? $href : rtrim(preg_replace('#^(https?://[^/]+).*$#', '$1', $final), '/') . '/' . ltrim($href, '/');
    if (strtolower((string)parse_url($abs, PHP_URL_HOST)) !== $host) continue;
    $extra[$abs] = 1;
    if (count($extra) >= 3) break;
  }
  foreach (array_keys($extra) as $u) {
    if (!icc_web_robots_ok($u)) continue;
    [$c2, $h2] = icc_web_get($u, 6);
    if ($c2 === 200) $paginas[] = $h2;
  }
  $todo = implode("\n", $paginas);
  $texto = icc_html_a_texto($todo);
  $out['emails'] = icc_web_correos($todo, $dominio);
  $out['email'] = $out['emails'][0] ?? '';
  if (preg_match('/(?:tel:|\b)(\+?34[\s.]?)?([6789]\d{2}[\s.]?\d{2,3}[\s.]?\d{2,3}[\s.]?\d{0,3})/', $todo, $t)) $out['telefono'] = preg_replace('/[^\d+]/', '', $t[0]);
  if (preg_match('/\b(CIF|NIF)[:\s]*([A-HJNP-SUVW]-?\d{7}[0-9A-J])\b/i', $texto, $c)) $out['cif'] = strtoupper(str_replace('-', '', $c[2]));
  if (preg_match('/\b([A-ZÁÉÍÓÚÑ0-9][\wÁÉÍÓÚÑáéíóúñ.,&\- ]{2,80}?,?\s(S\.?L\.?U?|S\.?A\.?|S\.?L\.?L\.?|S\.?COOP\.?))\b/u', $texto, $r)) $out['razon_social'] = trim($r[1]);
  // Madurez digital.
  $mad = [];
  if (!preg_match('/tawk\.to|intercom|crisp\.chat|tidio|drift\.com|zendesk|hubspot.*chat|livechat|chatbot|landbot|manychat|botpress/i', $html)) $mad[] = 'sin_chatbot';
  elseif (!preg_match('/inteligencia artificial|asistente virtual|\bIA\b|\bAI\b/u', $texto)) $mad[] = 'chat_sin_aviso_ia';
  if (!preg_match('/wa\.me|api\.whatsapp|whatsapp/i', $html)) $mad[] = 'sin_whatsapp';
  if (!preg_match('/<meta[^>]+name=["\']viewport/i', $html)) $mad[] = 'sin_movil';
  if (preg_match('/©\s*(?:\d{4}\s*-\s*)?(19\d{2}|20[01]\d|202[0-2])\b/u', $texto) || preg_match('/jquery[.-]1\.|<table[^>]+width=["\']\d{3}/i', $html)) $mad[] = 'web_anticuada';
  if (stripos($final, 'https://') !== 0) $mad[] = 'sin_https';
  $out['madurez'] = $mad;
  $out['extracto'] = mb_substr(preg_replace('/\s+/', ' ', $texto), 0, 1800);
  $out['ok'] = true;
  return $out;
}

/* ===========================================================================
   GOOGLE PLACES (API oficial, places:searchText)
   ========================================================================= */
function icc_places_clave(): string {
  $p = (string)icc_ajuste('places_clave', '');
  if ($p !== '') return $p;
  return defined('ICC_PLACES_API_KEY') ? (string)ICC_PLACES_API_KEY : '';
}

/** Busca empresas. Devuelve ['ok', 'lugares' => [...], 'siguiente', 'error']. */
function icc_places_buscar(string $consulta, ?string $pagina = null): array {
  if (defined('ICC_MODO_DEMO') && ICC_MODO_DEMO) return ['ok' => false, 'error' => 'Desactivado en la demostración.'];
  $clave = icc_places_clave();
  if ($clave === '') return ['ok' => false, 'error' => 'Falta la clave de Google Places (Motor → Ajustes).'];
  $url = defined('ICC_PLACES_URL') && ICC_PLACES_URL !== '' ? ICC_PLACES_URL : 'https://places.googleapis.com/v1/places:searchText';
  $host = strtolower((string)parse_url($url, PHP_URL_HOST));
  if ($host !== 'places.googleapis.com' && !icc_web_simulador()) return ['ok' => false, 'error' => 'Dirección de Google Places no permitida.'];
  $cuerpo = ['textQuery' => $consulta, 'languageCode' => 'es', 'regionCode' => 'ES', 'pageSize' => 20];
  if ($pagina) $cuerpo['pageToken'] = $pagina;
  $ch = curl_init($url);
  curl_setopt_array($ch, [
    CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 20,
    CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'X-Goog-Api-Key: ' . $clave,
      'X-Goog-FieldMask: places.id,places.displayName,places.formattedAddress,places.websiteUri,places.nationalPhoneNumber,places.addressComponents,places.businessStatus,nextPageToken'],
    CURLOPT_POSTFIELDS => json_encode($cuerpo, JSON_UNESCAPED_UNICODE),
  ]);
  $r = curl_exec($ch);
  $cod = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
  curl_close($ch);
  $j = json_decode((string)$r, true);
  if ($cod !== 200 || !is_array($j)) {
    $m = is_array($j) ? (string)($j['error']['message'] ?? '') : '';
    return ['ok' => false, 'error' => 'Google Places ha devuelto un error (' . $cod . ')' . ($m ? ': ' . mb_substr($m, 0, 140) : '')];
  }
  $lugares = [];
  foreach ($j['places'] ?? [] as $p) {
    if (($p['businessStatus'] ?? 'OPERATIONAL') !== 'OPERATIONAL') continue;
    $cp = '';
    $loc = '';
    foreach ($p['addressComponents'] ?? [] as $c) {
      if (in_array('postal_code', $c['types'] ?? [], true)) $cp = (string)$c['longText'];
      if (in_array('locality', $c['types'] ?? [], true)) $loc = (string)$c['longText'];
    }
    $lugares[] = ['place_id' => (string)$p['id'], 'nombre' => (string)($p['displayName']['text'] ?? ''), 'direccion' => (string)($p['formattedAddress'] ?? ''),
      'web' => (string)($p['websiteUri'] ?? ''), 'telefono' => preg_replace('/\s+/', '', (string)($p['nationalPhoneNumber'] ?? '')), 'cp' => $cp, 'localidad' => $loc];
  }
  return ['ok' => true, 'lugares' => $lugares, 'siguiente' => $j['nextPageToken'] ?? null];
}
