<?php
/**
 * LABS COMMAND CENTER 360™ · Configurador de IA a 1 clic (servidor)
 *
 * - Números: GET /ia/numeros (Twilio real si hay credenciales; si no, sugerencias simuladas).
 * - Voces: POST /ia/voz-preview (ElevenLabs real si hay clave; si no, el panel usa la voz del navegador).
 * - Secretos por cliente (token de MetaTok / Meta / 360dialog): POST|GET /ia/secreto/<id>,
 *   cifrados con AES-256-GCM y nunca devueltos al navegador.
 * - Despliegue en 4 fases: POST /ia/desplegar/<id> {mover_pipeline, enviar_credenciales, canal}.
 * - Llamada de prueba con estados: POST /ia/probar-llamada.
 *
 * Todo lo externo pasa por el orquestador (n8n/Make) configurado en Integraciones IA.
 * Sin él, el despliegue es una simulación y se dice en cada paso.
 */
defined('LABS') || exit;

/* --- Variables del system prompt ------------------------------------------ */
function labs_ia_variables($c, $voz)
{
    $v = is_array($voz['variables'] ?? null) ? $voz['variables'] : array();
    $base = array(
        'Nombre_Empresa' => $c['empresa'] !== '' ? $c['empresa'] : $c['nombre'],
        'Nombre_Agente' => trim((string) ($voz['nombre_agente'] ?? '')) ?: 'Laura',
        'Telefono_Soporte' => trim($c['prefijo'] . ' ' . $c['telefono']),
        'Servicio_Principal' => '', 'Horario' => '', 'Web' => '', 'Direccion' => '',
    );
    foreach ($v as $k => $x) {
        if (preg_match('/^[A-Za-z_]{2,40}$/', (string) $k) && trim((string) $x) !== '') {
            $base[$k] = mb_substr(trim((string) $x), 0, 300);
        }
    }
    return $base;
}

function labs_ia_resuelve($texto, $vars)
{
    return preg_replace_callback('/\[([A-Za-z_]{2,40})\]/', function ($m) use ($vars) {
        return isset($vars[$m[1]]) && $vars[$m[1]] !== '' ? $vars[$m[1]] : $m[0];
    }, (string) $texto);
}

/** Lee la configuración de voz en el formato nuevo o en el antiguo (v10). */
function labs_ia_voz_norm($v)
{
    $v = is_array($v) ? $v : array();
    $linea = is_array($v['linea'] ?? null) ? $v['linea'] : array('tipo' => 'twilio', 'numero' => $v['numero'] ?? '');
    $motor = is_array($v['motor'] ?? null) ? $v['motor'] : array('modelo' => $v['modelo'] ?? 'gpt-4o', 'temperatura' => $v['temperatura'] ?? 0.4);
    $voz = is_array($v['voz'] ?? null) ? $v['voz'] : array('proveedor' => 'openai', 'nombre' => (string) ($v['voz'] ?? 'nova'));
    $tr = array();
    foreach ((array) ($v['transferencias'] ?? array()) as $t) {
        if (!is_array($t)) {
            continue;
        }
        $tr[] = array('cuando' => (string) ($t['cuando'] ?? $t['si'] ?? ''), 'destino' => (string) ($t['destino'] ?? $t['a'] ?? ''),
            'mensaje' => (string) ($t['mensaje'] ?? ''));
    }
    return array('activo' => !empty($v['activo']), 'linea' => $linea, 'motor' => $motor, 'voz' => $voz,
        'nombre_agente' => (string) ($v['nombre_agente'] ?? ''), 'saludo' => (string) ($v['saludo'] ?? ''),
        'prompt' => (string) ($v['prompt'] ?? ''), 'variables' => $v['variables'] ?? array(), 'transferencias' => $tr,
        'plantilla' => (string) ($v['plantilla'] ?? ''));
}

/* --- HTTP genérico (GET o POST, cuerpo completo hasta $max bytes) ----------- */
function labs_http($metodo, $url, $cuerpo = null, $cab = array(), $auth = null, $max = 2097152)
{
    if (!function_exists('curl_init')) {
        return array(0, '', 'El hosting no tiene la extensión curl de PHP.');
    }
    $c = curl_init($url);
    $h = array('User-Agent: Labs24k-CRM/1.0');
    foreach ($cab as $k => $x) {
        $h[] = $k . ': ' . $x;
    }
    $op = array(CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 20, CURLOPT_CONNECTTIMEOUT => 6, CURLOPT_HTTPHEADER => $h,
        CURLOPT_FOLLOWLOCATION => false, CURLOPT_PROTOCOLS => CURLPROTO_HTTPS);
    if ($metodo === 'POST') {
        $op[CURLOPT_POST] = true;
        $op[CURLOPT_POSTFIELDS] = $cuerpo;
    }
    curl_setopt_array($c, $op);
    if ($auth) {
        curl_setopt($c, CURLOPT_USERPWD, $auth);
    }
    $r = curl_exec($c);
    $cod = (int) curl_getinfo($c, CURLINFO_RESPONSE_CODE);
    $err = $r === false ? curl_error($c) : '';
    curl_close($c);
    return array($cod, $r === false ? '' : substr((string) $r, 0, $max), $err);
}

/* --- Números de teléfono -------------------------------------------------- */
function labs_ia_numeros($pares)
{
    $p = function ($k) use ($pares) {
        foreach ($pares as $x) {
            if ($x[0] === $k) {
                return $x[1];
            }
        }
        return '';
    };
    $tipo = in_array($p('tipo'), array('local', 'movil', 'gratuito'), true) ? $p('tipo') : 'local';
    $area = preg_replace('/\D/', '', (string) $p('area'));
    $area = $area !== '' ? substr($area, 0, 3) : '984';
    $a = labs_ia_ajustes();
    if ($a['twilio_sid'] !== '' && $a['twilio_token'] !== '') {
        if (labs_freno('numeros|' . labs_uid(), 40, 3600)) {
            throw new ErrorApi('Demasiadas búsquedas de números seguidas.', 429, 'FRENO');
        }
        $ruta = array('local' => 'Local', 'movil' => 'Mobile', 'gratuito' => 'TollFree')[$tipo];
        $q = http_build_query(array('PageSize' => 8, 'VoiceEnabled' => 'true') + ($tipo === 'local' ? array('Contains' => '+34' . $area . '*******') : array()));
        list($cod, $resp, $err) = labs_http('GET', 'https://api.twilio.com/2010-04-01/Accounts/' . rawurlencode($a['twilio_sid']) .
            '/AvailablePhoneNumbers/ES/' . $ruta . '.json?' . $q, null, array('Accept' => 'application/json'), $a['twilio_sid'] . ':' . $a['twilio_token']);
        $d = json_decode($resp, true);
        if ($cod >= 200 && $cod < 300 && isset($d['available_phone_numbers'])) {
            $l = array_map(function ($n) {
                return array('numero' => $n['phone_number'], 'nombre' => $n['friendly_name'] ?? $n['phone_number'],
                    'zona' => trim(($n['locality'] ?? '') . ' ' . ($n['region'] ?? '')), 'voz' => !empty($n['capabilities']['voice']),
                    'sms' => !empty($n['capabilities']['SMS']));
            }, $d['available_phone_numbers']);
            return array('modo' => 'real', 'numeros' => $l);
        }
        return array('modo' => 'real', 'numeros' => array(), 'aviso' => 'Twilio no ha devuelto números (' . ($d['message'] ?? ($err ?: 'HTTP ' . $cod)) .
            '). En España los números locales necesitan un «regulatory bundle» aprobado en Twilio.');
    }
    $zonas = array('984' => 'Gijón · Asturias', '985' => 'Oviedo · Asturias', '91' => 'Madrid', '93' => 'Barcelona', '96' => 'Valencia', '95' => 'Sevilla');
    $l = array();
    for ($i = 0; $i < 6; $i++) {
        $num = $tipo === 'movil' ? '+34 6' . random_int(10, 99) . ' ' . random_int(100, 999) . ' ' . random_int(100, 999) :
            ($tipo === 'gratuito' ? '+34 900 ' . random_int(100, 999) . ' ' . random_int(100, 999) :
                '+34 ' . $area . ' ' . str_pad((string) random_int(0, 999), 3, '0', STR_PAD_LEFT) . ' ' . str_pad((string) random_int(0, 999), 3, '0', STR_PAD_LEFT));
        $l[] = array('numero' => $num, 'nombre' => $num, 'zona' => $zonas[$area] ?? ('Prefijo ' . $area), 'voz' => true, 'sms' => $tipo !== 'local');
    }
    return array('modo' => 'simulacion', 'numeros' => $l, 'aviso' => 'Números de ejemplo: sin Twilio conectado no se reserva ninguno.');
}

/* --- Vista previa de voz ElevenLabs --------------------------------------- */
function labs_ia_voz_preview($b)
{
    $clave = (string) labs_ajuste('ia.elevenlabs_key', '');
    if ($clave === '') {
        return array('sin_clave' => true);
    }
    $id = (string) ($b['voz_id'] ?? '');
    if (!preg_match('/^[A-Za-z0-9]{10,40}$/', $id)) {
        throw new ErrorApi('Voz no válida.', 400, 'P0001');
    }
    if (labs_freno('vozprev|' . labs_uid(), 30, 3600)) {
        throw new ErrorApi('Demasiadas pruebas de voz seguidas. Espera un rato.', 429, 'FRENO');
    }
    $texto = mb_substr(trim((string) ($b['texto'] ?? '')) ?: 'Hola, soy tu asistente virtual. ¿En qué puedo ayudarte?', 0, 240);
    $cuerpo = json_encode(array('text' => $texto, 'model_id' => 'eleven_multilingual_v2', 'voice_settings' => array(
        'stability' => max(0, min(1, (float) ($b['estabilidad'] ?? 0.5))), 'similarity_boost' => max(0, min(1, (float) ($b['claridad'] ?? 0.75))),
        'speed' => max(0.7, min(1.2, (float) ($b['velocidad'] ?? 1))))), JSON_UNESCAPED_UNICODE);
    list($cod, $resp, $err) = labs_http('POST', 'https://api.elevenlabs.io/v1/text-to-speech/' . $id . '?output_format=mp3_44100_64', $cuerpo,
        array('xi-api-key' => $clave, 'Content-Type' => 'application/json', 'Accept' => 'audio/mpeg'));
    if ($cod < 200 || $cod >= 300 || $resp === '') {
        $m = json_decode($resp, true);
        throw new ErrorApi('ElevenLabs no ha generado la muestra: ' . (is_array($m) ? ($m['detail']['message'] ?? json_encode($m['detail'] ?? $m)) : ($err ?: 'HTTP ' . $cod)), 502, 'ELEVENLABS');
    }
    return array('audio' => 'data:audio/mpeg;base64,' . base64_encode($resp));
}

/* --- Secretos por cliente (cifrados) -------------------------------------- */
function labs_ia_cifra($texto)
{
    $iv = random_bytes(12);
    $tag = '';
    $ct = openssl_encrypt($texto, 'aes-256-gcm', labs_clave_copias(), OPENSSL_RAW_DATA, $iv, $tag, 'labs-ia-secreto');
    return base64_encode($iv . $tag . $ct);
}
function labs_ia_descifra($b64)
{
    $r = base64_decode((string) $b64, true);
    if ($r === false || strlen($r) < 29) {
        return null;
    }
    $pt = openssl_decrypt(substr($r, 28), 'aes-256-gcm', labs_clave_copias(), OPENSSL_RAW_DATA, substr($r, 0, 12), substr($r, 12, 16), 'labs-ia-secreto');
    return $pt === false ? null : $pt;
}
function labs_ia_secretos($contacto_id)
{
    $f = labs_fila('SELECT secretos FROM ia_config WHERE contacto_id = ?', array((int) $contacto_id));
    $s = $f ? json_decode((string) $f['secretos'], true) : null;
    return is_array($s) ? $s : array();
}
function labs_ia_secreto($metodo, $id, $b)
{
    $c = labs_contacto_para_ia($id);
    labs_ia_config_de($c['id']);
    $s = labs_ia_secretos($c['id']);
    if ($metodo === 'POST') {
        $k = (string) ($b['clave'] ?? '');
        if (!in_array($k, array('whatsapp_token', 'whatsapp_instancia', 'sip_password'), true)) {
            throw new ErrorApi('Secreto no admitido.', 400, 'P0001');
        }
        $v = trim((string) ($b['valor'] ?? ''));
        if ($v === '') {
            unset($s[$k]);
        } else {
            $s[$k] = labs_ia_cifra(mb_substr($v, 0, 500));
        }
        labs_q('UPDATE ia_config SET secretos = ? WHERE contacto_id = ?', array(json_encode($s), $c['id']));
        labs_anota('Credencial de integración guardada', 'Contacto #' . $c['id'] . ' · ' . $k . ($v === '' ? ' (borrada)' : ''));
    }
    return array('guardados' => array_keys($s));
}

/* --- Despliegue en 4 fases ------------------------------------------------- */
function labs_ia_desplegar($contacto_id, $op = array())
{
    $c = labs_contacto_para_ia($contacto_id);
    $cfg = labs_ia_config_de($c['id']);
    $V = labs_ia_voz_norm($cfg['voz']);
    $W = $cfg['whatsapp'];
    $E = $cfg['embudo'];
    $usaVoz = $V['activo'];
    $usaWa = !empty($W['activo']);
    $usaEmb = !empty($E['activo']);
    if (!$usaVoz && !$usaWa && !$usaEmb) {
        throw new ErrorApi('Activa al menos un módulo (asistente de voz, bot de WhatsApp o embudo) antes de desplegar.', 400, 'P0001');
    }
    $vars = labs_ia_variables($c, $V);
    $prompt = labs_ia_resuelve($V['prompt'], $vars);
    $faltan = array();
    if ($usaVoz && mb_strlen(trim($prompt)) < 20) {
        $faltan[] = 'el system prompt del asistente de voz (mínimo 20 caracteres)';
    }
    if ($usaVoz && preg_match_all('/\[([A-Za-z_]{2,40})\]/', $prompt, $m) && $m[1]) {
        $faltan[] = 'el valor de ' . implode(', ', array_map(function ($x) {
            return '[' . $x . ']';
        }, array_unique($m[1])));
    }
    if ($usaVoz && ($V['linea']['tipo'] ?? 'twilio') === 'sip' && trim((string) ($V['linea']['sip_uri'] ?? '')) === '') {
        $faltan[] = 'la dirección SIP del trunk';
    }
    if ($usaWa && trim((string) ($W['numero'] ?? '')) === '') {
        $faltan[] = 'el número del canal de WhatsApp';
    }
    if ($faltan) {
        throw new ErrorApi('Falta ' . implode(' y ', $faltan) . '.', 400, 'P0001');
    }
    if (!$cfg['webhook_token']) {
        $cfg['webhook_token'] = bin2hex(random_bytes(16));
        labs_q('UPDATE ia_config SET webhook_token = ? WHERE contacto_id = ?', array($cfg['webhook_token'], $c['id']));
    }
    $hook = labs_url_webhook($cfg['webhook_token']);
    $real = labs_ia_ajustes()['n8n_url'] !== '';
    $pasos = array();
    $paso = function ($fase, $nivel, $texto, $ms = 380) use (&$pasos) {
        $pasos[] = array('fase' => $fase, 'nivel' => $nivel, 'texto' => $texto, 'ms' => $ms);
    };
    $cliente = $c['empresa'] !== '' ? $c['empresa'] : $c['nombre'];
    $sim = $real ? '' : ' [simulación]';
    $paso(0, 'info', 'Pre-vuelo: configuración válida para «' . $cliente . '» · ' .
        implode(' + ', array_filter(array($usaVoz ? 'Voz IA' : '', $usaWa ? 'WhatsApp' : '', $usaEmb ? 'Embudo' : ''))), 250);

    // Fase 1 · Twilio
    if ($usaVoz) {
        $L = $V['linea'];
        if (($L['tipo'] ?? 'twilio') === 'sip') {
            $paso(1, 'info', 'Twilio Elastic SIP Trunking › creando trunk hacia ' . ($L['sip_uri'] ?? '') . $sim, 550);
        } elseif (($L['tipo'] ?? '') === 'cliente') {
            $paso(1, 'info', 'Twilio › verificando el número del cliente ' . ($L['numero'] ?? '') . ' para desvío' . $sim, 500);
        } else {
            $paso(1, 'info', 'Twilio › comprando y reservando ' . (($L['numero'] ?? '') ?: 'un número local') . $sim, 600);
        }
        $paso(1, 'info', 'Twilio › enrutando voz entrante al webhook del asistente (TwiML App)' . $sim, 400);
    }
    if ($usaWa) {
        $paso(1, 'info', ucfirst((string) ($W['proveedor'] ?? 'metatok')) . ' › vinculando la instancia de WhatsApp ' . ($W['numero'] ?? '') . $sim, 450);
    }
    // Fase 2 · OpenAI
    $docs = count((array) ($W['rag'] ?? array()));
    if ($usaVoz) {
        $paso(2, 'info', 'OpenAI › creando Assistant «' . $vars['Nombre_Agente'] . '» con ' . ($V['motor']['modelo'] ?? 'gpt-4o') .
            ' (temperatura ' . ($V['motor']['temperatura'] ?? '0.4') . ', ' . mb_strlen($prompt) . ' caracteres de prompt)' . $sim, 650);
    }
    if ($usaWa || $docs) {
        $paso(2, 'info', 'OpenAI › vector store con ' . $docs . ' documento(s) y ' . mb_strlen((string) ($W['conocimiento'] ?? '')) . ' caracteres de conocimiento' . $sim, 700);
    }
    // Fase 3 · ElevenLabs + n8n
    if ($usaVoz) {
        $vz = $V['voz'];
        $paso(3, 'info', (($vz['proveedor'] ?? '') === 'elevenlabs' ? 'ElevenLabs' : 'Voz') . ' › sincronizando voz «' . ($vz['nombre'] ?? '') . '»' .
            (isset($vz['estabilidad']) ? ' · estabilidad ' . $vz['estabilidad'] . ' · claridad ' . ($vz['claridad'] ?? '') . ' · velocidad ' . ($vz['velocidad'] ?? '') : '') . $sim, 550);
        foreach ($V['transferencias'] as $t) {
            if ($t['destino'] !== '') {
                $paso(3, 'info', 'Regla de transferencia › si «' . $t['cuando'] . '» → ' . $t['destino'], 220);
            }
        }
    }
    $paso(3, 'info', 'n8n › activando nodos' . ($usaEmb ? ' del embudo «' . ($E['plantilla'] ?? '') . '» (' . count(array_filter((array) ($E['pasos'] ?? array()), function ($x) {
        return !empty($x['on']);
    })) . ' pasos)' : '') . ' y el webhook de entrada' . $sim, 500);
    $estado = 'desplegado';
    $detalle = array();
    if ($real) {
        $sec = array();
        foreach (labs_ia_secretos($c['id']) as $k => $x) {
            $sec[$k] = labs_ia_descifra($x);
        }
        list($cod, $resp, $err) = labs_n8n('desplegar', array(
            'contacto' => array('id' => (int) $c['id'], 'nombre' => $c['nombre'], 'empresa' => $c['empresa'], 'email' => $c['email'],
                'telefono' => trim($c['prefijo'] . ' ' . $c['telefono'])),
            'voz' => $usaVoz ? array_merge($V, array('prompt_resuelto' => $prompt, 'variables' => $vars)) : null,
            'whatsapp' => $usaWa ? $W : null, 'embudo' => $usaEmb ? $E : null, 'secretos' => $sec, 'webhook_entrada' => $hook));
        if ($cod >= 200 && $cod < 300) {
            $detalle = json_decode($resp, true) ?: array();
            $paso(3, 'ok', 'Orquestador › aceptado (HTTP ' . $cod . ')' . (isset($detalle['numero']) ? ' · número ' . $detalle['numero'] : '') .
                (isset($detalle['assistant_id']) ? ' · assistant ' . $detalle['assistant_id'] : ''), 300);
        } else {
            $estado = 'error';
            $paso(3, 'error', 'Orquestador › ' . ($err ?: 'respondió HTTP ' . $cod) . '. Revisa la URL de n8n en Integraciones IA.', 300);
        }
    } else {
        $paso(3, 'warn', 'MODO SIMULACIÓN: no hay orquestador conectado. Nada se ha creado en Twilio, OpenAI, ElevenLabs ni n8n.', 400);
    }

    // Fase 4 · Pipeline y credenciales
    $orden = array_keys(labs_fases());
    if (!empty($op['mover_pipeline']) && $estado === 'desplegado') {
        $destino = $real ? 'produccion' : 'despliegue';
        if ($c['fase'] !== 'perdido' && array_search($c['fase'], $orden) < array_search($destino, $orden)) {
            $def = labs_tabla('contactos');
            labs_actualiza_fila('contactos', $def, labs_fila_php($def, labs_fila('SELECT * FROM contactos WHERE id = ? FOR UPDATE', array($c['id']))),
                array('fase' => $destino), true);
            $paso(4, 'ok', 'Pipeline › «' . $cliente . '» pasa a ' . labs_fases()[$destino][0], 350);
        } else {
            $paso(4, 'info', 'Pipeline › ya estaba en ' . labs_fases()[$c['fase']][0] . ': no se mueve', 250);
        }
    }
    if (!empty($op['enviar_credenciales'])) {
        $canal = in_array($op['canal'] ?? '', array('sms', 'email', 'ambos'), true) ? $op['canal'] : 'email';
        $num = $detalle['numero'] ?? ($V['linea']['numero'] ?? '');
        $msg = 'Hola ' . $c['nombre'] . ', tu asistente de IA de Labs24k ya está activo.' . ($usaVoz && $num ? ' Teléfono del asistente: ' . $num . '.' : '') .
            ($usaWa ? ' WhatsApp: ' . ($W['numero'] ?? '') . '.' : '') . ' Para cualquier cambio, responde a este mensaje.';
        if (!$real || $estado !== 'desplegado') {
            $paso(4, 'warn', 'Credenciales › SIMULACIÓN: no se envía nada al cliente. Se enviaría por ' . $canal . ' a ' .
                labs_enmascara($canal === 'sms' ? trim($c['prefijo'] . $c['telefono']) : $c['email']) . '.', 300);
        } else {
            if (in_array($canal, array('sms', 'ambos'), true)) {
                $a = labs_ia_ajustes();
                $tel = preg_replace('/[^\d+]/', '', $c['prefijo'] . $c['telefono']);
                if ($a['twilio_sid'] !== '' && $a['twilio_token'] !== '' && $a['twilio_from'] !== '' && preg_match('/^\+\d{8,15}$/', $tel)) {
                    list($cod2) = labs_post_json('https://api.twilio.com/2010-04-01/Accounts/' . rawurlencode($a['twilio_sid']) . '/Messages.json',
                        array('To' => $tel, 'From' => $a['twilio_from'], 'Body' => $msg), array(), $a['twilio_sid'] . ':' . $a['twilio_token'], true);
                    $paso(4, $cod2 >= 200 && $cod2 < 300 ? 'ok' : 'error', 'Credenciales › SMS ' . ($cod2 >= 200 && $cod2 < 300 ? 'enviado' : 'no enviado (HTTP ' . $cod2 . ')') . ' a ' . labs_enmascara($tel), 300);
                } else {
                    $paso(4, 'warn', 'Credenciales › sin Twilio o sin teléfono válido: no se envía SMS', 250);
                }
            }
            if (in_array($canal, array('email', 'ambos'), true)) {
                $host = preg_replace('/[^a-z0-9.-]/i', '', $_SERVER['SERVER_NAME'] ?? 'localhost');
                $ok = filter_var($c['email'], FILTER_VALIDATE_EMAIL) && function_exists('mail') && @mail($c['email'],
                    '=?UTF-8?B?' . base64_encode('Tu asistente de IA ya está activo · Labs24k') . '?=', $msg . "\n\nLabs24k",
                    'From: Labs24k <no-reply@' . $host . ">\r\nContent-Type: text/plain; charset=UTF-8");
                $paso(4, $ok ? 'ok' : 'warn', 'Credenciales › correo ' . ($ok ? 'enviado a ' . labs_enmascara($c['email']) : 'no enviado (sin correo válido o el servidor no puede enviar)'), 300);
            }
        }
    }
    if ($estado === 'desplegado') {
        $paso(4, 'ok', $real ? '✔ Sistema desplegado y en producción.' : '✔ Simulación completada: la configuración es válida y está lista para desplegar en real.', 200);
    }
    labs_q('UPDATE ia_config SET estado = ?, desplegado = ?, actualizado = ? WHERE contacto_id = ?',
        array($real ? $estado : 'simulado', labs_ahora(), labs_ahora(), $c['id']));
    labs_evento_contacto($c['id'], 'ia', ($real ? ($estado === 'desplegado' ? 'Despliegue IA completado' : 'Despliegue IA con errores') : 'Despliegue IA simulado') .
        ' · ' . implode(', ', array_filter(array($usaVoz ? 'voz' : '', $usaWa ? 'WhatsApp' : '', $usaEmb ? 'embudo' : ''))));
    $fila = labs_fila('SELECT fase FROM contactos WHERE id = ?', array($c['id']));
    return array('modo' => $real ? 'real' : 'simulacion', 'ok' => $estado === 'desplegado', 'pasos' => $pasos, 'webhook' => $hook,
        'estado' => $real ? $estado : 'simulado', 'fase' => $fila['fase'], 'numero' => $detalle['numero'] ?? ($V['linea']['numero'] ?? ''));
}

/* --- Llamada de prueba con estados ----------------------------------------- */
function labs_ia_probar_llamada($b)
{
    $c = labs_contacto_para_ia($b['contacto_id'] ?? 0);
    $cfg = labs_ia_config_de($c['id']);
    $V = labs_ia_voz_norm($cfg['voz']);
    $pedido = trim((string) ($b['telefono'] ?? ''));
    $tel = preg_replace('/[^\d+]/', '', $pedido === '' ? $c['prefijo'] . $c['telefono'] : $pedido);
    if (!preg_match('/^\+?\d{8,15}$/', $tel)) {
        throw new ErrorApi('Indica un teléfono válido para la llamada de prueba.', 400, 'P0001');
    }
    if (labs_freno('llamada|' . labs_uid(), 20, 3600)) {
        throw new ErrorApi('Demasiadas llamadas de prueba seguidas. Espera un rato.', 429, 'FRENO');
    }
    $vars = labs_ia_variables($c, $V);
    $prompt = labs_ia_resuelve($V['prompt'], $vars);
    $r = labs_n8n('llamada_prueba', array('contacto_id' => (int) $c['id'], 'telefono' => $tel,
        'voz' => array_merge($V, array('prompt_resuelto' => $prompt, 'variables' => $vars))));
    if ($r !== null) {
        list($cod, $resp, $err) = $r;
        $ok = $cod >= 200 && $cod < 300;
        labs_evento_contacto($c['id'], 'llamada', ($ok ? 'Llamada de prueba lanzada a ' : 'No se pudo lanzar la llamada de prueba a ') . labs_enmascara($tel) .
            ($ok ? '' : ' (' . ($err ?: 'HTTP ' . $cod) . ')'));
        if (!$ok) {
            throw new ErrorApi('El orquestador no ha lanzado la llamada: ' . ($err ?: 'HTTP ' . $cod), 502, 'N8N');
        }
        return array('modo' => 'real', 'estados' => array(
            array('t' => 'Orquestador › llamada solicitada', 'ms' => 300), array('t' => 'Twilio › marcando ' . labs_enmascara($tel), 'ms' => 600)),
            'mensaje' => 'Llamada lanzada. La transcripción llegará al historial por el webhook.');
    }
    $agente = $vars['Nombre_Agente'];
    $empresa = $vars['Nombre_Empresa'];
    $saludo = labs_ia_resuelve(trim($V['saludo']) ?: 'Hola, soy ' . $agente . ', la asistente virtual de ' . $empresa . '. ¿En qué puedo ayudarte?', $vars);
    $tr = array_values(array_filter($V['transferencias'], function ($t) {
        return $t['destino'] !== '';
    }));
    $trans = array(
        array('quien' => 'IA', 'texto' => $saludo),
        array('quien' => 'Cliente', 'texto' => 'Hola, quería información' . ($vars['Servicio_Principal'] ? ' sobre ' . $vars['Servicio_Principal'] : ' sobre vuestros servicios') . '.'),
        array('quien' => 'IA', 'texto' => 'Claro. Te cuento lo principal y, si quieres, te reservo una cita con un asesor. ¿Te viene bien esta semana?'),
        array('quien' => 'Cliente', 'texto' => $tr ? 'Prefiero hablar con una persona.' : 'Sí, el jueves por la mañana.'),
        array('quien' => 'IA', 'texto' => $tr ? (($tr[0]['mensaje'] ?: 'Por supuesto, te paso con un compañero ahora mismo.') . ' (transferencia a ' . $tr[0]['destino'] . ')') :
            'Perfecto, te dejo el jueves a las 10:00. Te llegará la confirmación por WhatsApp. ¡Gracias!'),
    );
    $vz = $V['voz'];
    labs_evento_contacto($c['id'], 'llamada', '[SIMULACIÓN] Llamada de prueba del asistente «' . $agente . '» a ' . labs_enmascara($tel) . " · 1 min 12 s\n" .
        implode("\n", array_map(function ($l) {
            return $l['quien'] . ': ' . $l['texto'];
        }, $trans)));
    return array('modo' => 'simulacion', 'transcripcion' => $trans, 'duracion' => 72,
        'estados' => array(
            array('t' => 'Conectando con Twilio (simulación)…', 'ms' => 500),
            array('t' => 'Marcando ' . labs_enmascara($tel) . '…', 'ms' => 700),
            array('t' => 'Llamada conectada · ' . ($V['motor']['modelo'] ?? 'gpt-4o') . ' + voz «' . ($vz['nombre'] ?? '') . '»', 'ms' => 600),
            array('t' => 'Transcribiendo en tiempo real…', 'ms' => 700),
            array('t' => 'Llamada finalizada · 1 min 12 s', 'ms' => 300)),
        'mensaje' => 'Simulación: no hay orquestador configurado, no se ha llamado a nadie.');
}
