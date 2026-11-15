<?php
/**
 * ICC CRM · Correo propio: envio SMTP, lectura IMAP y lector MIME.
 * Sin depender de la extension imap de PHP ni de librerias externas.
 *
 *  icc_smtp_enviar($cuenta, $mensaje)  -> ['ok', 'message_id', 'error']
 *  icc_imap_nuevos($cuenta, $ultimoUid, $uidValidity, $max) -> ['ok', 'mensajes', 'ultimo_uid', 'uidvalidity', 'error']
 *  icc_mime_leer($crudo)               -> ['de', 'de_nombre', 'para', 'asunto', 'message_id', 'in_reply_to',
 *                                          'references', 'fecha', 'texto', 'html', 'adjuntos', 'cabeceras', 'automatico']
 *
 * $cuenta: host_smtp, puerto_smtp, seguridad_smtp (ssl|starttls|ninguna),
 *          host_imap, puerto_imap, seguridad_imap, usuario, clave (en claro, solo en memoria),
 *          email, nombre.
 */

/* ===========================================================================
   CONEXION
   ========================================================================= */
function icc_correo_conectar(string $host, int $puerto, string $seguridad, int $timeout = 20) {
  $ctx = stream_context_create(['ssl' => ['verify_peer' => true, 'verify_peer_name' => true, 'SNI_enabled' => true, 'peer_name' => $host]]);
  $dest = ($seguridad === 'ssl' ? 'ssl://' : 'tcp://') . $host . ':' . $puerto;
  $s = @stream_socket_client($dest, $errno, $errstr, $timeout, STREAM_CLIENT_CONNECT, $ctx);
  if (!$s) throw new RuntimeException('No se puede conectar con ' . $host . ':' . $puerto . ($errstr ? ' (' . $errstr . ')' : ''));
  stream_set_timeout($s, $timeout);
  return $s;
}

function icc_correo_starttls($s): void {
  if (!@stream_socket_enable_crypto($s, true, STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT | (defined('STREAM_CRYPTO_METHOD_TLSv1_3_CLIENT') ? STREAM_CRYPTO_METHOD_TLSv1_3_CLIENT : 0))) {
    throw new RuntimeException('No se ha podido activar el cifrado (STARTTLS).');
  }
}

/* ===========================================================================
   SMTP
   ========================================================================= */
function icc_smtp_leer($s): array {
  $texto = '';
  $codigo = 0;
  while (($l = fgets($s, 2048)) !== false) {
    $texto .= $l;
    if (strlen($l) >= 4 && $l[3] === ' ') { $codigo = (int)substr($l, 0, 3); break; }
    if (strlen($l) < 4) { $codigo = (int)substr($l, 0, 3); break; }
  }
  if ($texto === '') throw new RuntimeException('El servidor de correo no responde.');
  return [$codigo, $texto];
}

function icc_smtp_cmd($s, string $cmd, array $esperados, string $mostrar = null): string {
  fwrite($s, $cmd . "\r\n");
  [$c, $t] = icc_smtp_leer($s);
  if (!in_array($c, $esperados, true)) throw new RuntimeException('SMTP ' . ($mostrar ?? strtok($cmd, ' ')) . ': ' . trim($t));
  return $t;
}

/** Codifica una cabecera con tildes (RFC 2047). */
function icc_mime_cabecera(string $v): string {
  if (!preg_match('/[^\x20-\x7E]/', $v)) return $v;
  return '=?UTF-8?B?' . base64_encode($v) . '?=';
}

function icc_mime_direccion(string $email, string $nombre = ''): string {
  $nombre = trim(str_replace(['"', "\r", "\n"], '', $nombre));
  return $nombre === '' ? '<' . $email . '>' : icc_mime_cabecera($nombre) . ' <' . $email . '>';
}

/** Correo valido y en forma estandar (dominio con tildes a punycode). null si no vale. */
function icc_email_normal(string $email): ?string {
  $email = strtolower(trim($email, " \t\r\n<>.;,"));
  if (substr_count($email, '@') !== 1) return null;
  [$local, $dominio] = explode('@', $email);
  if ($local === '' || $dominio === '' || preg_match('/[^\x21-\x7E]/', $local)) return null; // tildes en la parte local: fuera
  if (preg_match('/[^\x21-\x7E]/', $dominio)) {
    if (!function_exists('idn_to_ascii')) return null;
    $a = idn_to_ascii($dominio, IDNA_DEFAULT, INTL_IDNA_VARIANT_UTS46);
    if (!$a) return null;
    $dominio = $a;
  }
  $email = $local . '@' . $dominio;
  return filter_var($email, FILTER_VALIDATE_EMAIL) ? $email : null;
}

/**
 * Envia un correo. $m: para, para_nombre, asunto, texto, (html), responder_a,
 * in_reply_to, references, cabeceras (array extra), adjuntos [[nombre, mime, ruta|datos]].
 */
function icc_smtp_enviar(array $c, array $m): array {
  if (defined('ICC_MODO_DEMO') && ICC_MODO_DEMO) return ['ok' => false, 'error' => 'Desactivado en la demostración.'];
  $para = icc_email_normal((string)($m['para'] ?? ''));
  $de = icc_email_normal((string)($c['email'] ?? ''));
  if (!$para) return ['ok' => false, 'error' => 'Destinatario no válido.'];
  if (!$de) return ['ok' => false, 'error' => 'Remitente no válido.'];
  $dominio = substr($de, strpos($de, '@') + 1);
  $mid = '<' . bin2hex(random_bytes(12)) . '.' . time() . '@' . $dominio . '>';
  $sep = 'icc-' . bin2hex(random_bytes(10));
  $cab = [
    'Date: ' . date('r'),
    'From: ' . icc_mime_direccion($de, (string)($c['nombre'] ?? '')),
    'To: ' . icc_mime_direccion($para, (string)($m['para_nombre'] ?? '')),
    'Subject: ' . icc_mime_cabecera((string)($m['asunto'] ?? '')),
    'Message-ID: ' . $mid,
    'MIME-Version: 1.0',
  ];
  if (!empty($m['responder_a']) && ($r = icc_email_normal((string)$m['responder_a']))) $cab[] = 'Reply-To: ' . $r;
  if (!empty($m['in_reply_to'])) $cab[] = 'In-Reply-To: ' . $m['in_reply_to'];
  if (!empty($m['references'])) $cab[] = 'References: ' . trim((string)$m['references']);
  foreach ((array)($m['cabeceras'] ?? []) as $h) $cab[] = str_replace(["\r", "\n"], '', (string)$h);

  $texto = chunk_split(base64_encode(str_replace(["\r\n", "\r"], "\n", (string)$m['texto'])));
  $cuerpoTexto = "Content-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . $texto;
  $adjuntos = (array)($m['adjuntos'] ?? []);
  if ($adjuntos) {
    $cab[] = 'Content-Type: multipart/mixed; boundary="' . $sep . '"';
    $cuerpo = "--$sep\r\n" . $cuerpoTexto;
    foreach ($adjuntos as $a) {
      $datos = isset($a['datos']) ? (string)$a['datos'] : (string)@file_get_contents((string)$a['ruta']);
      if ($datos === '') continue;
      $nombre = str_replace(['"', "\r", "\n"], '', (string)$a['nombre']);
      $cuerpo .= "--$sep\r\nContent-Type: " . ($a['mime'] ?? 'application/octet-stream') . '; name="' . icc_mime_cabecera($nombre) . "\"\r\n"
        . "Content-Transfer-Encoding: base64\r\nContent-Disposition: attachment; filename=\"" . icc_mime_cabecera($nombre) . "\"\r\n\r\n"
        . chunk_split(base64_encode($datos));
    }
    $cuerpo .= "--$sep--\r\n";
  } else {
    $cab[] = 'Content-Type: text/plain; charset=UTF-8';
    $cab[] = 'Content-Transfer-Encoding: base64';
    $cuerpo = $texto;
  }
  $datos = implode("\r\n", $cab) . "\r\n\r\n" . $cuerpo;
  // Puntos al inicio de linea (RFC 5321).
  $datos = preg_replace('/^\./m', '..', $datos);

  try {
    $seg = (string)($c['seguridad_smtp'] ?? 'starttls');
    $s = icc_correo_conectar((string)$c['host_smtp'], (int)$c['puerto_smtp'], $seg);
    [$cod, $t] = icc_smtp_leer($s);
    if ($cod !== 220) throw new RuntimeException('SMTP: ' . trim($t));
    $yo = preg_replace('/[^a-z0-9.\-]/i', '', (string)($_SERVER['SERVER_NAME'] ?? 'crm.local')) ?: 'crm.local';
    $ehlo = icc_smtp_cmd($s, 'EHLO ' . $yo, [250]);
    if ($seg === 'starttls') {
      icc_smtp_cmd($s, 'STARTTLS', [220]);
      icc_correo_starttls($s);
      $ehlo = icc_smtp_cmd($s, 'EHLO ' . $yo, [250]);
    }
    if ((string)($c['usuario'] ?? '') !== '') {
      if (stripos($ehlo, 'PLAIN') !== false) {
        icc_smtp_cmd($s, 'AUTH PLAIN ' . base64_encode("\0" . $c['usuario'] . "\0" . $c['clave']), [235], 'AUTH');
      } else {
        icc_smtp_cmd($s, 'AUTH LOGIN', [334]);
        icc_smtp_cmd($s, base64_encode((string)$c['usuario']), [334], 'AUTH');
        icc_smtp_cmd($s, base64_encode((string)$c['clave']), [235], 'AUTH');
      }
    }
    icc_smtp_cmd($s, 'MAIL FROM:<' . $de . '>', [250]);
    icc_smtp_cmd($s, 'RCPT TO:<' . $para . '>', [250, 251]);
    icc_smtp_cmd($s, 'DATA', [354]);
    fwrite($s, $datos . "\r\n.\r\n");
    [$cod, $t] = icc_smtp_leer($s);
    if ($cod !== 250) throw new RuntimeException('SMTP DATA: ' . trim($t));
    @fwrite($s, "QUIT\r\n");
    fclose($s);
    return ['ok' => true, 'message_id' => $mid, 'crudo' => $datos];
  } catch (Throwable $e) {
    if (isset($s) && is_resource($s)) @fclose($s);
    return ['ok' => false, 'error' => mb_substr($e->getMessage(), 0, 250)];
  }
}

/** Comprueba usuario y contrasena SMTP sin enviar nada. */
function icc_smtp_probar(array $c): array {
  try {
    $seg = (string)($c['seguridad_smtp'] ?? 'starttls');
    $s = icc_correo_conectar((string)$c['host_smtp'], (int)$c['puerto_smtp'], $seg, 12);
    [$cod, $t] = icc_smtp_leer($s);
    if ($cod !== 220) throw new RuntimeException(trim($t));
    $ehlo = icc_smtp_cmd($s, 'EHLO crm.local', [250]);
    if ($seg === 'starttls') { icc_smtp_cmd($s, 'STARTTLS', [220]); icc_correo_starttls($s); $ehlo = icc_smtp_cmd($s, 'EHLO crm.local', [250]); }
    if ((string)($c['usuario'] ?? '') !== '') {
      icc_smtp_cmd($s, 'AUTH LOGIN', [334]);
      icc_smtp_cmd($s, base64_encode((string)$c['usuario']), [334], 'AUTH');
      icc_smtp_cmd($s, base64_encode((string)$c['clave']), [235], 'AUTH');
    }
    @fwrite($s, "QUIT\r\n");
    fclose($s);
    return ['ok' => true];
  } catch (Throwable $e) {
    return ['ok' => false, 'error' => mb_substr($e->getMessage(), 0, 250)];
  }
}

/* ===========================================================================
   IMAP (LOGIN, SELECT, UID SEARCH, UID FETCH BODY.PEEK[]: nunca marca como leido)
   ========================================================================= */
final class IccImap {
  private $s;
  private int $n = 0;

  public function __construct(array $c) {
    $seg = (string)($c['seguridad_imap'] ?? 'ssl');
    $this->s = icc_correo_conectar((string)$c['host_imap'], (int)$c['puerto_imap'], $seg);
    $saludo = fgets($this->s, 2048);
    if ($saludo === false || stripos($saludo, '* OK') !== 0) throw new RuntimeException('IMAP: el servidor no saluda.');
    if ($seg === 'starttls') { $this->cmd('STARTTLS'); icc_correo_starttls($this->s); }
    $this->cmd('LOGIN ' . $this->cadena((string)$c['usuario']) . ' ' . $this->cadena((string)$c['clave']), 'LOGIN');
  }

  private function cadena(string $v): string {
    return '"' . str_replace(['\\', '"'], ['\\\\', '\\"'], $v) . '"';
  }

  /** Envia un comando y devuelve las lineas sin etiquetar; los literales {n} se leen enteros. */
  public function cmd(string $cmd, string $mostrar = null): array {
    $tag = 'A' . (++$this->n);
    fwrite($this->s, $tag . ' ' . $cmd . "\r\n");
    $lineas = [];
    while (true) {
      $l = fgets($this->s, 8192);
      if ($l === false) throw new RuntimeException('IMAP: conexión cortada.');
      while (preg_match('/\{(\d+)\}\r\n$/', $l, $mm)) {
        $falta = (int)$mm[1];
        $lit = '';
        while ($falta > 0) {
          $trozo = fread($this->s, min(65536, $falta));
          if ($trozo === false || $trozo === '') throw new RuntimeException('IMAP: conexión cortada.');
          $lit .= $trozo;
          $falta -= strlen($trozo);
        }
        $resto = fgets($this->s, 8192);
        $lineas[] = ['literal' => $lit, 'cab' => $l];
        $l = $resto === false ? '' : $resto;
        if (strpos($l, $tag . ' ') === 0) break;
      }
      if (strpos($l, $tag . ' ') === 0) {
        if (stripos($l, $tag . ' OK') !== 0) throw new RuntimeException('IMAP ' . ($mostrar ?? strtok($cmd, ' ')) . ': ' . trim(substr($l, strlen($tag) + 1)));
        return $lineas;
      }
      if ($l !== '') $lineas[] = $l;
    }
  }

  public function seleccionar(string $buzon = 'INBOX'): int {
    $validity = 0;
    foreach ($this->cmd('SELECT ' . $this->cadena($buzon)) as $l) {
      if (is_string($l) && preg_match('/UIDVALIDITY (\d+)/i', $l, $m)) $validity = (int)$m[1];
    }
    return $validity;
  }

  /** UIDs mayores que $desde. */
  public function uids(int $desde): array {
    $out = [];
    foreach ($this->cmd('UID SEARCH UID ' . ($desde + 1) . ':*') as $l) {
      if (is_string($l) && stripos($l, '* SEARCH') === 0) {
        foreach (preg_split('/\s+/', trim(substr($l, 8))) as $u) if ($u !== '' && (int)$u > $desde) $out[] = (int)$u;
      }
    }
    sort($out);
    return $out;
  }

  /** UIDs de los mensajes recibidos desde una fecha (para "gestionar los ultimos 7 dias"). */
  public function uidsDesdeFecha(string $fechaImap): array {
    $out = [];
    foreach ($this->cmd('UID SEARCH SINCE ' . $fechaImap) as $l) {
      if (is_string($l) && stripos($l, '* SEARCH') === 0) {
        foreach (preg_split('/\s+/', trim(substr($l, 8))) as $u) if ($u !== '') $out[] = (int)$u;
      }
    }
    sort($out);
    return $out;
  }

  public function crudo(int $uid): ?string {
    foreach ($this->cmd('UID FETCH ' . $uid . ' (BODY.PEEK[])') as $l) {
      if (is_array($l)) return $l['literal'];
    }
    return null;
  }

  public function cerrar(): void {
    try { $this->cmd('LOGOUT'); } catch (Throwable $e) { /* da igual */ }
    @fclose($this->s);
  }
}

/**
 * Lee los correos nuevos de una cuenta. Si cambia el UIDVALIDITY, relee desde
 * el principio (quien llama descarta duplicados por Message-ID). Si $ultimoUid
 * es null (buzon recien conectado), no devuelve nada y fija el punto de partida.
 */
function icc_imap_nuevos(array $c, ?int $ultimoUid, ?int $uidValidity, int $max = 20, ?int $diasAtras = null): array {
  if (defined('ICC_MODO_DEMO') && ICC_MODO_DEMO) return ['ok' => false, 'error' => 'Desactivado en la demostración.'];
  try {
    $imap = new IccImap($c);
    $validity = $imap->seleccionar('INBOX');
    $releer = $uidValidity !== null && $uidValidity !== 0 && $validity !== $uidValidity;
    if ($ultimoUid === null) {
      // Empieza "desde ahora": solo fija el ultimo UID (o los ultimos N dias si se pide).
      $todos = $imap->uids(0);
      $ultimo = $todos ? max($todos) : 0;
      $lista = $diasAtras ? $imap->uidsDesdeFecha(date('d-M-Y', strtotime('-' . $diasAtras . ' days'))) : [];
    } else {
      $lista = $imap->uids($releer ? 0 : $ultimoUid);
      $ultimo = $releer ? 0 : $ultimoUid;
    }
    $lista = array_slice($lista, 0, $max);
    $mensajes = [];
    foreach ($lista as $uid) {
      $crudo = $imap->crudo($uid);
      if ($crudo !== null) $mensajes[] = ['uid' => $uid, 'crudo' => $crudo];
      if ($ultimoUid !== null) $ultimo = max($ultimo, $uid);
    }
    $imap->cerrar();
    return ['ok' => true, 'mensajes' => $mensajes, 'ultimo_uid' => $ultimo, 'uidvalidity' => $validity, 'releido' => $releer];
  } catch (Throwable $e) {
    return ['ok' => false, 'error' => mb_substr($e->getMessage(), 0, 250)];
  }
}

function icc_imap_probar(array $c): array {
  try {
    $imap = new IccImap($c);
    $imap->seleccionar('INBOX');
    $imap->cerrar();
    return ['ok' => true];
  } catch (Throwable $e) {
    return ['ok' => false, 'error' => mb_substr($e->getMessage(), 0, 250)];
  }
}

/* ===========================================================================
   LECTOR MIME
   ========================================================================= */
function icc_mime_a_utf8(string $t, string $charset): string {
  $charset = strtoupper(trim($charset, " \"'"));
  if ($charset === '' || $charset === 'UTF-8' || $charset === 'US-ASCII') {
    return mb_check_encoding($t, 'UTF-8') ? $t : mb_convert_encoding($t, 'UTF-8', 'ISO-8859-1');
  }
  if ($charset === 'ISO-8859-1' || $charset === 'LATIN1') $charset = 'WINDOWS-1252';
  $r = @iconv($charset, 'UTF-8//TRANSLIT', $t);
  if ($r === false) $r = @mb_convert_encoding($t, 'UTF-8', $charset);
  return $r === false || $r === null ? mb_convert_encoding($t, 'UTF-8', 'ISO-8859-1') : $r;
}

/** Cabecera con =?charset?B|Q?...?= o con tildes sin codificar, a UTF-8. */
function icc_mime_decodificar_cabecera(string $v): string {
  $v = preg_replace('/\?=\s+=\?/', '?==?', trim($v));
  $out = preg_replace_callback('/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/', function ($m) {
    $d = strtoupper($m[2]) === 'B' ? base64_decode($m[3]) : quoted_printable_decode(str_replace('_', ' ', $m[3]));
    return icc_mime_a_utf8((string)$d, $m[1]);
  }, $v);
  return mb_check_encoding($out, 'UTF-8') ? $out : mb_convert_encoding($out, 'UTF-8', 'ISO-8859-1');
}

function icc_mime_partir(string $crudo): array {
  $crudo = str_replace("\r\n", "\n", $crudo);
  $p = strpos($crudo, "\n\n");
  $cabTxt = $p === false ? $crudo : substr($crudo, 0, $p);
  $cuerpo = $p === false ? '' : substr($crudo, $p + 2);
  $cab = [];
  $cabTxt = preg_replace("/\n[ \t]+/", ' ', $cabTxt);
  foreach (explode("\n", $cabTxt) as $l) {
    $i = strpos($l, ':');
    if ($i === false) continue;
    $k = strtolower(trim(substr($l, 0, $i)));
    $val = trim(substr($l, $i + 1));
    $cab[$k] = isset($cab[$k]) ? $cab[$k] . "\n" . $val : $val;
  }
  return [$cab, $cuerpo];
}

function icc_mime_param(string $cab, string $param): string {
  if (preg_match('/' . preg_quote($param, '/') . '\*?=\s*"?([^";]+)"?/i', $cab, $m)) {
    $v = trim($m[1]);
    if (preg_match("/^([A-Za-z0-9\-]+)''(.*)$/", $v, $mm)) return icc_mime_a_utf8(rawurldecode($mm[2]), $mm[1]);
    return icc_mime_decodificar_cabecera($v);
  }
  return '';
}

function icc_mime_parte(array $cab, string $cuerpo, array &$r, int $nivel = 0): void {
  $tipo = strtolower(trim(strtok($cab['content-type'] ?? 'text/plain', ';')));
  $ct = $cab['content-type'] ?? '';
  if (strpos($tipo, 'multipart/') === 0 && $nivel < 8) {
    $b = icc_mime_param($ct, 'boundary');
    if ($b === '') return;
    $trozos = explode('--' . $b, $cuerpo);
    array_shift($trozos);
    foreach ($trozos as $t) {
      if (strpos($t, '--') === 0) break;
      [$c2, $b2] = icc_mime_partir(ltrim($t, "\n"));
      icc_mime_parte($c2, $b2, $r, $nivel + 1);
    }
    return;
  }
  $enc = strtolower(trim($cab['content-transfer-encoding'] ?? ''));
  if ($enc === 'base64') $datos = (string)base64_decode(preg_replace('/\s+/', '', $cuerpo));
  elseif ($enc === 'quoted-printable') $datos = quoted_printable_decode($cuerpo);
  else $datos = $cuerpo;
  $disp = strtolower($cab['content-disposition'] ?? '');
  $nombre = icc_mime_param($cab['content-disposition'] ?? '', 'filename') ?: icc_mime_param($ct, 'name');
  if ($nombre !== '' || strpos($disp, 'attachment') === 0 || (strpos($tipo, 'text/') !== 0 && $tipo !== 'message/rfc822')) {
    $r['adjuntos'][] = ['nombre' => $nombre !== '' ? $nombre : 'adjunto', 'mime' => $tipo, 'datos' => $datos, 'tamano' => strlen($datos)];
    return;
  }
  $charset = icc_mime_param($ct, 'charset');
  $txt = icc_mime_a_utf8($datos, $charset);
  if ($tipo === 'text/html') { if ($r['html'] === '') $r['html'] = $txt; }
  elseif ($r['texto'] === '') $r['texto'] = $txt;
}

/** HTML a texto legible. */
function icc_html_a_texto(string $html): string {
  $html = preg_replace('#<(script|style|head)[^>]*>.*?</\1>#is', ' ', $html);
  $html = preg_replace('#<br\s*/?>#i', "\n", $html);
  $html = preg_replace('#</(p|div|li|tr|h[1-6]|blockquote)>#i', "\n", $html);
  $t = html_entity_decode(strip_tags($html), ENT_QUOTES | ENT_HTML5, 'UTF-8');
  $t = preg_replace("/[ \t\x{00A0}]+/u", ' ', $t);
  return trim(preg_replace("/\n\s*\n\s*\n+/", "\n\n", $t));
}

/** Quita el historial citado ("El ... escribio:", lineas con ">", "-----Mensaje original-----"). */
function icc_quitar_citado(string $t): string {
  $t = str_replace("\r\n", "\n", $t);
  $cortes = ['/^\s*El .{3,200}escribi[oó]:\s*$/mu', '/^\s*On .{3,200}wrote:\s*$/mu', '/^-{2,}\s*(Mensaje original|Original Message)\s*-{2,}/mi', '/^\s*De:\s.+\n\s*(Enviado|Fecha|Sent):/mi', '/^\s*From:\s.+\n\s*(Sent|Date):/mi'];
  foreach ($cortes as $re) {
    if (preg_match($re, $t, $m, PREG_OFFSET_CAPTURE)) $t = substr($t, 0, $m[0][1]);
  }
  $lineas = array_filter(explode("\n", $t), function ($l) { return strpos(ltrim($l), '>') !== 0; });
  return trim(implode("\n", $lineas));
}

function icc_mime_leer(string $crudo): array {
  [$cab, $cuerpo] = icc_mime_partir($crudo);
  $r = ['texto' => '', 'html' => '', 'adjuntos' => []];
  icc_mime_parte($cab, $cuerpo, $r);
  $de = icc_mime_decodificar_cabecera($cab['from'] ?? '');
  $email = '';
  $nombre = '';
  if (preg_match('/^(.*)<([^>]+)>/', $de, $m)) { $nombre = trim($m[1], " \"'"); $email = $m[2]; }
  else $email = trim($de);
  $texto = $r['texto'] !== '' ? $r['texto'] : icc_html_a_texto($r['html']);
  $auto = icc_correo_es_automatico($cab, (string)icc_email_normal($email));
  return [
    'de' => (string)icc_email_normal($email), 'de_nombre' => $nombre,
    'para' => icc_mime_decodificar_cabecera($cab['to'] ?? ''),
    'asunto' => icc_mime_decodificar_cabecera($cab['subject'] ?? ''),
    'message_id' => trim($cab['message-id'] ?? ''),
    'in_reply_to' => trim($cab['in-reply-to'] ?? ''),
    'references' => trim($cab['references'] ?? ''),
    'fecha' => ($ts = strtotime($cab['date'] ?? '')) ? date('Y-m-d H:i:s', $ts) : date('Y-m-d H:i:s'),
    'texto' => $texto, 'texto_limpio' => icc_quitar_citado($texto), 'html' => $r['html'],
    'adjuntos' => $r['adjuntos'], 'cabeceras' => $cab, 'automatico' => $auto,
  ];
}

/** Correos automaticos: no gastan IA ni se contestan. Devuelve el motivo o ''. */
function icc_correo_es_automatico(array $cab, string $email): string {
  $local = strtolower(strtok($email, '@') ?: '');
  if (preg_match('/^(no-?reply|noreply|no-?response|mailer-daemon|postmaster|bounce[s]?|notificaciones?|notifications?|do-?not-?reply)/', $local)) return 'remitente automático';
  if (isset($cab['auto-submitted']) && strtolower(trim($cab['auto-submitted'])) !== 'no') return 'Auto-Submitted';
  if (isset($cab['precedence']) && preg_match('/bulk|list|junk/i', $cab['precedence'])) return 'Precedence';
  if (isset($cab['list-id'])) return 'List-Id';
  if (isset($cab['list-unsubscribe'])) return 'boletín';
  if (isset($cab['x-autoreply']) || isset($cab['x-autorespond'])) return 'respuesta automática';
  $asunto = strtolower(icc_mime_decodificar_cabecera($cab['subject'] ?? ''));
  if (preg_match('/^(respuesta autom|auto(matic)? ?reply|fuera de la oficina|out of office|undeliverable|delivery status|mail delivery failed|no se puede entregar)/u', $asunto)) return 'respuesta automática';
  if (isset($cab['content-type']) && stripos($cab['content-type'], 'report-type=delivery-status') !== false) return 'rebote';
  return '';
}
