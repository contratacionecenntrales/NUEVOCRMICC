<?php
/**
 * ICC CRM · Motor de prospeccion IA (fase 2): datos fijos, redaccion,
 * envio con limites, respuestas y paso al CRM. Lo usan api/motor.php, el cron
 * y la Zona de agentes.
 *
 * Normativa: LSSI art. 21 (por defecto cada correo se aprueba, remitente
 * identificado y baja en un clic; el modo autonomo exige aceptar el aviso
 * legal) y RGPD (lista de exclusion respetada en todos los canales).
 */
require_once __DIR__ . '/correo_lib.php';
require_once __DIR__ . '/web_lib.php';

/* ===========================================================================
   DATOS FIJOS: sectores, angulos y Asturias (8 comarcas, 78 concejos)
   ========================================================================= */
/** clave => [nombre, CNAE, busqueda en Google, prioridad (1 = mejor conversion)] */
const MOTOR_SECTORES = [
  'hosteleria' => ['Restaurantes', '5610', 'restaurante', 1],
  'bares' => ['Bares y cafeterías', '5630', 'bar cafetería', 2],
  'hoteles' => ['Hoteles y alojamientos', '5510', 'hotel', 1],
  'panaderias' => ['Panaderías y obradores', '1071', 'panadería obrador', 1],
  'supermercados' => ['Supermercados y alimentación', '4711', 'supermercado', 2],
  'carnicerias' => ['Carnicerías y charcuterías', '4722', 'carnicería', 2],
  'talleres' => ['Talleres de vehículos', '4520', 'taller mecánico', 1],
  'industria' => ['Industria y metal', '2562', 'taller metalúrgico industria', 1],
  'carpinterias' => ['Carpinterías', '1623', 'carpintería', 2],
  'imprentas' => ['Imprentas y artes gráficas', '1812', 'imprenta', 3],
  'farmacias' => ['Farmacias', '4773', 'farmacia', 3],
  'clinicas' => ['Clínicas y centros de salud', '8623', 'clínica dental', 2],
  'residencias' => ['Residencias de mayores', '8731', 'residencia de mayores', 1],
  'gimnasios' => ['Gimnasios y centros deportivos', '9313', 'gimnasio', 1],
  'peluquerias' => ['Peluquerías y estética', '9602', 'peluquería', 3],
  'lavanderias' => ['Lavanderías y tintorerías', '9601', 'lavandería', 2],
  'academias' => ['Academias y formación', '8559', 'academia', 3],
  'inmobiliarias' => ['Inmobiliarias', '6831', 'inmobiliaria', 3],
  'asesorias' => ['Asesorías y gestorías', '6920', 'asesoría gestoría', 3],
  'fincas' => ['Administración de fincas', '6832', 'administrador de fincas', 1],
];

/** Angulos del mensaje (los prueba el Laboratorio). */
const MOTOR_ANGULOS = [
  'auditoria_integral' => 'Auditoría de costes 100 % servicios',
  'ahorro_factura' => 'Ahorro en la factura de luz y gas',
  'potencia' => 'Potencia contratada, excesos y reactiva',
  'telefonia' => 'Telefonía, fibra, móviles y centralita',
  'alarmas' => 'Alarmas y seguridad',
  'seguros' => 'Seguros de empresa',
  'caso_sector' => 'Caso de su sector',
  'pregunta_corta' => 'Pregunta corta',
  'estudio_gratuito' => 'Estudio gratuito de facturas',
];

/** Servicio (sector del CRM) de cada angulo: etiqueta de interes al pasar al CRM. */
const MOTOR_ANGULO_SERVICIO = ['ahorro_factura' => 'energia', 'potencia' => 'energia', 'estudio_gratuito' => 'energia', 'telefonia' => 'telecomunicaciones', 'alarmas' => 'alarmas', 'seguros' => 'seguros'];

/** Etiqueta de interes por servicio (disparan los embudos de Automatizaciones). */
const ICC_INTERESES = ['energia' => 'Interés: Energía', 'telecomunicaciones' => 'Interés: Telefonía', 'alarmas' => 'Interés: Alarmas', 'seguros' => 'Interés: Seguros', 'integral' => 'Interés: Auditoría integral', 'web' => 'Interés: Página web'];

/** Pone una etiqueta a un cliente y avisa a las automatizaciones si es nueva. */
function icc_etiquetar_cliente(int $clienteId, string $etiqueta): void {
  try {
    $st = icc_db()->prepare('INSERT IGNORE INTO cliente_etiquetas (cliente_id, etiqueta) VALUES (?, ?)');
    $st->execute([$clienteId, mb_substr($etiqueta, 0, 60)]);
    if ($st->rowCount()) icc_db()->prepare("INSERT INTO flujo_eventos (tipo, cliente_id, datos) VALUES ('etiqueta_anadida', ?, ?)")->execute([$clienteId, json_encode(['etiqueta' => $etiqueta], JSON_UNESCAPED_UNICODE)]);
  } catch (Throwable $e) { /* sin tablas de automatizaciones */ }
}

/** Identidades del agente de Outreach. Cada campaña usa una. */
const MOTOR_PERFILES = [
  'icc' => ['nombre' => 'ICC Consultoría · 100 % servicios · 100 % compañías', 'empresa' => 'Integral Connection Consulting',
    'firma' => "Equipo comercial\nICC Consultoría · Integral Connection Consulting\n100 % servicios · 100 % compañías · Reducción de costes garantizada\nintegralconnectionconsulting.es",
    'responsable' => 'Integral Connection Consulting', 'tono' => 'cercano y profesional, de usted', 'palabras' => 120, 'asunto_palabras' => 6,
    'angulos' => ['auditoria_integral', 'ahorro_factura', 'potencia', 'telefonia', 'alarmas', 'seguros', 'caso_sector', 'pregunta_corta', 'estudio_gratuito'],
    'pasos' => [1 => 'día 1: correo inicial', 2 => 'día 3: seguimiento corto con un caso de su sector o con otro de nuestros servicios', 3 => 'día 7: último toque ofreciendo el estudio gratuito; si no es el momento, no escribimos más']],
];

/** Zonas de Asturias de uso comun (atajos del Radar). */
const MOTOR_ZONAS = [
  'Área metropolitana de Oviedo' => ['Oviedo', 'Siero', 'Llanera', 'Noreña', 'Ribera de Arriba', 'Las Regueras'],
  'Comarca de Gijón' => ['Gijón', 'Carreño', 'Villaviciosa'],
  'Comarca de Avilés' => ['Avilés', 'Castrillón', 'Corvera de Asturias', 'Gozón', 'Illas', 'Soto del Barco', 'Muros de Nalón', 'Pravia', 'Cudillero'],
  'Cuencas Mineras' => ['Mieres', 'Lena', 'Aller', 'Langreo', 'San Martín del Rey Aurelio', 'Laviana', 'Caso', 'Sobrescobio'],
  'Oriente' => ['Llanes', 'Ribadesella', 'Cangas de Onís', 'Parres', 'Piloña', 'Colunga', 'Cabrales'],
  'Occidente' => ['Navia', 'Valdés', 'Tapia de Casariego', 'Vegadeo', 'Castropol', 'Cangas del Narcea', 'Tineo'],
];

/** Prefijos de correo generico de empresa (B2B, RGPD). */
const MOTOR_PREFIJOS = 'info, informacion, contacto, contact, hola, comercial, ventas, administracion, admin, oficina, gerencia, empresa, atencion, clientes, reservas, pedidos, central, general, recepcion';

const MOTOR_MADUREZ = [
  'sin_chatbot' => 'Sin chatbot', 'sin_whatsapp' => 'Sin WhatsApp', 'chat_sin_aviso_ia' => 'Chat sin aviso de IA',
  'web_anticuada' => 'Web anticuada', 'sin_movil' => 'Sin versión móvil', 'sin_https' => 'Sin https',
];

/** comarca => [concejos]. Prioridad del barrido: grandes nucleos, villas, resto. */
const MOTOR_ASTURIAS = [
  'Avilés' => ['Avilés', 'Castrillón', 'Corvera de Asturias', 'Cudillero', 'Gozón', 'Illas', 'Muros de Nalón', 'Pravia', 'Soto del Barco'],
  'Caudal' => ['Aller', 'Lena', 'Mieres'],
  'Eo-Navia' => ['Boal', 'Castropol', 'Coaña', 'El Franco', 'Grandas de Salime', 'Illano', 'Navia', 'Pesoz', 'San Martín de Oscos', 'San Tirso de Abres', 'Santa Eulalia de Oscos', 'Tapia de Casariego', 'Taramundi', 'Valdés', 'Vegadeo', 'Villanueva de Oscos', 'Villayón'],
  'Gijón' => ['Carreño', 'Gijón', 'Villaviciosa'],
  'Nalón' => ['Caso', 'Langreo', 'Laviana', 'San Martín del Rey Aurelio', 'Sobrescobio'],
  'Narcea' => ['Allande', 'Cangas del Narcea', 'Degaña', 'Ibias', 'Tineo'],
  'Oriente' => ['Amieva', 'Cabrales', 'Cangas de Onís', 'Caravia', 'Colunga', 'Llanes', 'Onís', 'Parres', 'Peñamellera Alta', 'Peñamellera Baja', 'Piloña', 'Ponga', 'Ribadedeva', 'Ribadesella'],
  'Oviedo' => ['Belmonte de Miranda', 'Bimenes', 'Cabranes', 'Candamo', 'Grado', 'Las Regueras', 'Llanera', 'Morcín', 'Nava', 'Noreña', 'Oviedo', 'Proaza', 'Quirós', 'Ribera de Arriba', 'Riosa', 'Salas', 'Santo Adriano', 'Sariego', 'Siero', 'Somiedo', 'Teverga', 'Yernes y Tameza'],
];
const MOTOR_NUCLEOS = ['Oviedo', 'Gijón', 'Avilés', 'Siero', 'Langreo', 'Mieres'];
const MOTOR_VILLAS = ['Castrillón', 'San Martín del Rey Aurelio', 'Corvera de Asturias', 'Llanera', 'Villaviciosa', 'Laviana', 'Carreño', 'Cangas del Narcea', 'Llanes', 'Valdés', 'Lena', 'Navia', 'Gozón', 'Grado', 'Tineo', 'Piloña', 'Pravia', 'Aller', 'Cangas de Onís', 'Ribadesella', 'Salas', 'Vegadeo', 'Noreña', 'Castropol', 'Nava', 'Cudillero', 'Tapia de Casariego', 'Parres', 'Colunga'];

/** Pasos de la secuencia: dia 1, dia 3 y dia 7. */
const MOTOR_CADENCIA = [1 => 0, 2 => 2, 3 => 6];

const MOTOR_PROMPT = <<<TXT
# ROL
Eres consultor senior de ICC Consultoría (Integral Connection Consulting, integralconnectionconsulting.es), consultoría B2B multiservicio con oficina en Asturias. Lema: «100 % servicios, 100 % compañías, reducción de costes garantizada». Escribes correos a gerentes, administradores y responsables de compras de empresas en España que todavía no nos conocen.

# QUIÉNES SOMOS
- 100 % servicios: energía (luz y gas: potencia contratada, excesos, energía reactiva, tarifas, autoconsumo), telefonía e internet (fibra, móviles, centralita, líneas de empresa), alarmas y seguridad (alarmas conectadas a central receptora, videovigilancia) y seguros de empresa (responsabilidad civil, multirriesgo, flotas, colectivos).
- 100 % compañías: trabajamos con todas las compañías del mercado, no con una sola, así que comparamos de verdad y recomendamos lo que conviene al cliente.
- Reducción de costes garantizada: si en el estudio no encontramos una mejora real, se lo decimos y no cambia nada. Un único interlocutor para todos sus servicios y nos encargamos de los trámites del cambio.

# OBJETIVO
Conseguir que nos envíe una factura (luz, gas o teléfono) o su póliza para un estudio gratuito, o una llamada o visita de 15 minutos (presencial en Asturias o por videollamada) para una auditoría de costes de sus servicios.

# GANCHOS POR SERVICIO (úsalos con rigor; el ángulo de la campaña dice cuál toca)
- Energía: potencia sobredimensionada, recargos por excesos de potencia o energía reactiva, tarifas que ya no encajan con su consumo, permanencias.
- Telefonía: líneas y servicios que ya no se usan, permanencias, unificar fibra, móviles y centralita en una sola factura.
- Alarmas: cuotas y mantenimiento, conexión a central receptora, equipos antiguos.
- Seguros: pólizas que se renuevan solas cada año sin revisar coberturas ni precio, coberturas duplicadas o que faltan.
- Auditoría integral: revisar de una vez energía, telefonía, alarmas y seguros con un solo interlocutor.

# LÍMITES
- Nunca inventes datos. No des cifras de ahorro, porcentajes, precios, descuentos ni regalos. No nombres compañías concretas ni hables mal de su proveedor actual.
- Si en los datos vienen «ofertas_exclusivas_del_mes», puedes mencionar UNA tal cual (con su compañía y condiciones) como gancho: «este mes tenemos ofertas exclusivas». Nunca inventes otras ni las exageres.
- «Reducción de costes garantizada» solo con el sentido de arriba (si no hay mejora real, se lo decimos y no cambia nada).

# REDACCIÓN
- Español de España, de usted, cercano y profesional. Texto plano: sin negritas, emojis ni enlaces. Sin «Estimado/a señor/a».
- Asunto: como máximo el número de palabras que te pasamos, frase natural en minúsculas, sin palabras de spam (gratis, oferta, urgente). Ejemplos: «facturas de [empresa]», «una duda sobre su factura de luz», «revisión de costes en [empresa]».
- Cuerpo: como máximo el límite de palabras que te pasamos, en párrafos cortos:
  1) Primera línea: un detalle REAL de su empresa, sector o localidad, sacado de los datos que te pasamos.
  2) Conecta su actividad con un coste concreto del servicio del ángulo.
  3) Qué hace ICC: 100 % servicios, 100 % compañías, y que si no hay mejora real se lo decimos.
  4) Cierre con una pregunta fácil de contestar, por ejemplo: «¿Me envía su última factura y en 48 horas le digo si se puede mejorar?» o «¿Le encaja una llamada de 10 minutos el jueves por la mañana?».
- Seguimiento (día 3): más corto, con un caso de su sector o mencionando otro de nuestros servicios. Último (día 7): ofrece el estudio gratuito y di que, si no es el momento, no le escribiremos más.
- No pongas firma ni aviso de baja: los añade el sistema.
TXT;

function motor_config(): array {
  $ag = json_decode((string)icc_ajuste('motor_agente', ''), true);
  $smtp = json_decode((string)icc_ajuste('motor_smtp', ''), true);
  $imap = json_decode((string)icc_ajuste('motor_imap', ''), true);
  return [
    'agente' => [
      'firma' => (string)($ag['firma'] ?? "Equipo comercial\nIntegral Connection Consulting"),
      'tono' => (string)($ag['tono'] ?? 'cercano y profesional'),
      'modelo' => (string)($ag['modelo'] ?? ''),
      'prompt' => (string)($ag['prompt'] ?? MOTOR_PROMPT),
    ],
    'responsable' => (string)icc_ajuste('motor_responsable', 'Integral Connection Consulting'),
    'smtp' => is_array($smtp) ? $smtp : [],
    'imap' => is_array($imap) ? $imap : [],
    'limite_dia' => max(1, min(500, (int)icc_ajuste('motor_limite_dia', '35'))),
    'pausa_min' => max(1, (int)icc_ajuste('motor_pausa_min', '4')),
    'pausa_max' => max(1, (int)icc_ajuste('motor_pausa_max', '9')),
    'hora_desde' => (string)icc_ajuste('motor_hora_desde', '09:00'),
    'hora_hasta' => (string)icc_ajuste('motor_hora_hasta', '19:00'),
    'pausado' => (string)icc_ajuste('motor_pausado', '0') === '1',
    'solo_laborables' => (string)icc_ajuste('motor_solo_laborables', '1') === '1',
    'aviso_legal' => (string)icc_ajuste('motor_aviso_legal', ''),
    'gestor_defecto' => (int)icc_ajuste('motor_gestor_defecto', '0') ?: null,
  ];
}

function motor_log(string $tipo, string $mensaje, ?int $leadId = null, ?int $campanaId = null): void {
  try {
    icc_db()->prepare('INSERT INTO motor_log (tipo, mensaje, lead_id, campana_id) VALUES (?, ?, ?, ?)')->execute([$tipo, mb_substr($mensaje, 0, 500), $leadId, $campanaId]);
  } catch (Throwable $e) { /* sin tabla */ }
}

/** Cuenta SMTP/IMAP del Motor con su contrasena descifrada (solo en memoria). */
function motor_cuenta(): ?array {
  foreach (motor_buzones() as $b) {
    if (!empty($b['activo']) && !empty($b['host_smtp']) && motor_buzon_clave((string)$b['id']) !== '') return motor_buzon_cuenta($b);
  }
  return null;
}

/* ===========================================================================
   PERFILES DEL AGENTE DE OUTREACH
   ========================================================================= */
function motor_perfil(string $id): array {
  $id = isset(MOTOR_PERFILES[$id]) ? $id : 'icc';
  $base = MOTOR_PERFILES[$id] + ['id' => $id, 'prompt' => MOTOR_PROMPT, 'modelo' => '', 'activo' => true];
  $g = json_decode((string)icc_ajuste('motor_perfil_' . $id, ''), true);
  if (!is_array($g) && $id === 'icc') {
    // Compatibilidad con la configuracion anterior (un solo agente).
    $ag = json_decode((string)icc_ajuste('motor_agente', ''), true) ?: [];
    // Solo tono y modelo: la firma y el prompt antiguos se sustituyen por los de ICC Consultoria.
    $g = array_filter(['tono' => $ag['tono'] ?? null, 'modelo' => $ag['modelo'] ?? null, 'responsable' => icc_ajuste('motor_responsable', null)], function ($v) { return $v !== null && $v !== ''; });
  }
  foreach (['firma', 'responsable', 'tono', 'prompt', 'modelo'] as $k) if (isset($g[$k]) && trim((string)$g[$k]) !== '') $base[$k] = (string)$g[$k];
  if (isset($g['palabras'])) $base['palabras'] = max(40, min(250, (int)$g['palabras']));
  if (isset($g['activo'])) $base['activo'] = (bool)$g['activo'];
  return $base;
}

/* ===========================================================================
   BUZONES DE ENVIO (rotacion, limite por buzon y calentamiento)
   ========================================================================= */
function motor_buzones(): array {
  $l = json_decode((string)icc_ajuste('motor_buzones', ''), true);
  if (!is_array($l)) {
    $l = [];
    $s = json_decode((string)icc_ajuste('motor_smtp', ''), true) ?: [];
    $i = json_decode((string)icc_ajuste('motor_imap', ''), true) ?: [];
    if (!empty($s['host_smtp']) && !empty($s['email'])) {
      $l[] = $s + $i + ['id' => 'principal', 'limite' => (int)icc_ajuste('motor_limite_dia', '35'), 'calentamiento' => false, 'alta' => date('Y-m-d'), 'activo' => true, 'perfil' => ''];
    }
  }
  $l = array_values(array_filter($l, 'is_array'));
  foreach ($l as &$b) if (!isset(MOTOR_PERFILES[$b['perfil'] ?? ''])) $b['perfil'] = '';
  unset($b);
  return $l;
}

function motor_buzon_clave(string $id): string {
  $c = (string)icc_ajuste('motor_buzon_clave_' . $id, '');
  return $c !== '' ? $c : ($id === 'principal' ? (string)icc_ajuste('motor_smtp_clave', '') : '');
}

/** Envios permitidos hoy: con calentamiento, 10 el primer dia y +5 cada dia hasta su limite. */
function motor_buzon_limite_hoy(array $b): int {
  $lim = max(1, (int)($b['limite'] ?? 35));
  if (empty($b['calentamiento'])) return $lim;
  $dias = max(0, (int)floor((time() - strtotime((string)($b['alta'] ?? date('Y-m-d')))) / 86400));
  return min($lim, 10 + 5 * $dias);
}

function motor_buzon_enviados_hoy(string $email): int {
  $st = icc_db()->prepare("SELECT COUNT(*) FROM motor_mensajes WHERE buzon = ? AND estado = 'enviado' AND enviado_en >= CURDATE()");
  $st->execute([$email]);
  return (int)$st->fetchColumn();
}

function motor_buzon_cuenta(array $b): array {
  return $b + ['clave' => motor_buzon_clave((string)$b['id']), 'usuario' => ($b['usuario'] ?? '') ?: $b['email']];
}

/* ===========================================================================
   ALTA Y ANALISIS DE EMPRESAS
   ========================================================================= */
function motor_ubicar(string $texto): array {
  foreach (MOTOR_ASTURIAS as $comarca => $concejos) {
    foreach ($concejos as $c) if (mb_stripos($texto, $c) !== false) return [$c, $comarca];
  }
  return ['', ''];
}

/** Web sin esquema, www ni barra final, para detectar duplicados. */
function motor_web_norm(string $w): string {
  $w = strtolower(trim($w));
  $w = preg_replace('#^https?://#', '', $w);
  $w = preg_replace('#^www\.#', '', $w);
  return rtrim(preg_replace('#[?\#].*$#', '', $w), '/');
}

/** Inserta una empresa si no estaba (por place_id, web o correo). Devuelve id o null si ya existia. */
function motor_alta_lead(array $l, string $origen, ?int $autor): ?int {
  $db = icc_db();
  if (!empty($l['place_id'])) {
    $st = $db->prepare('SELECT id FROM motor_leads WHERE place_id = ?');
    $st->execute([$l['place_id']]);
    if ($st->fetchColumn()) return null;
  }
  $email = !empty($l['email']) ? icc_email_normal((string)$l['email']) : null;
  if ($email) {
    $st = $db->prepare('SELECT id FROM motor_leads WHERE email = ?');
    $st->execute([$email]);
    if ($st->fetchColumn()) return null;
  }
  if (!empty($l['web'])) {
    $norm = motor_web_norm((string)$l['web']);
    if ($norm !== '') {
      $st = $db->prepare("SELECT web FROM motor_leads WHERE web <> '' AND web LIKE ?");
      $st->execute(['%' . substr($norm, 0, strpos($norm . '/', '/')) . '%']);
      foreach ($st->fetchAll(PDO::FETCH_COLUMN) as $w) if (motor_web_norm($w) === $norm) return null;
    }
  }
  [$concejo, $comarca] = motor_ubicar(($l['localidad'] ?? '') . ' ' . ($l['direccion'] ?? ''));
  if ($concejo === '' && !empty($l['concejo'])) { $concejo = $l['concejo']; $comarca = $l['comarca'] ?? $comarca; }
  $db->prepare('INSERT INTO motor_leads (place_id, nombre, razon_social, cif, sector, direccion, localidad, concejo, comarca, cp, telefono, web, email, mx_ok, origen, creado_por)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    ->execute([$l['place_id'] ?? null, mb_substr((string)$l['nombre'], 0, 190), mb_substr((string)($l['razon_social'] ?? ''), 0, 190), mb_substr((string)($l['cif'] ?? ''), 0, 20),
      (string)($l['sector'] ?? ''), mb_substr((string)($l['direccion'] ?? ''), 0, 255), mb_substr((string)($l['localidad'] ?? ''), 0, 120), $concejo, $comarca,
      mb_substr((string)($l['cp'] ?? ''), 0, 10), mb_substr((string)($l['telefono'] ?? ''), 0, 40), mb_substr((string)($l['web'] ?? ''), 0, 255), $email ?: '',
      $email && icc_web_mx_ok($email) ? 1 : 0, $origen, $autor]);
  return (int)$db->lastInsertId();
}

/** Lee la web de la empresa y completa correo, telefono, CIF, razon social y madurez. */
function motor_analizar(int $leadId): array {
  $db = icc_db();
  $st = $db->prepare('SELECT * FROM motor_leads WHERE id = ?');
  $st->execute([$leadId]);
  $l = $st->fetch();
  if (!$l) return ['ok' => false, 'error' => 'No existe'];
  if ($l['web'] === '') {
    $db->prepare('UPDATE motor_leads SET analizado_en = NOW(), analisis_error = ? WHERE id = ?')->execute(['Sin web', $leadId]);
    return ['ok' => false, 'error' => 'Sin web'];
  }
  $sc = motor_scraper();
  $r = icc_web_analizar($l['web'], $sc['prefijos']);
  if (!$r['ok']) {
    $db->prepare('UPDATE motor_leads SET analizado_en = NOW(), analisis_error = ? WHERE id = ?')->execute([mb_substr($r['error'], 0, 255), $leadId]);
    return $r;
  }
  $email = $l['email'] !== '' ? $l['email'] : $r['email'];
  $db->prepare('UPDATE motor_leads SET email = ?, mx_ok = ?, telefono = IF(telefono = "", ?, telefono), cif = IF(cif = "", ?, cif), razon_social = IF(razon_social = "", ?, razon_social),
                madurez = ?, extracto = ?, analizado_en = NOW(), analisis_error = NULL WHERE id = ?')
    ->execute([$email, $email !== '' && icc_web_mx_ok($email) ? 1 : 0, $r['telefono'], $r['cif'], mb_substr($r['razon_social'], 0, 190), implode(',', $r['madurez']), $r['extracto'], $leadId]);
  // Filtro de cualificacion IA: carencias reales, detalle para personalizar y encaje.
  if ($sc['cualificar_ia'] && icc_ia_disponible() && $r['extracto'] !== '') {
    $q = icc_ia_chat([
      ['role' => 'system', 'content' => 'Analizas la web de una empresa para un equipo comercial B2B. Devuelve: un detalle real y concreto de su negocio que sirva para personalizar un correo (una frase, sin inventar), sus carencias digitales y un encaje de 0 a 100 como cliente de servicios de ahorro energético, telecomunicaciones o implantación de IA.'],
      ['role' => 'user', 'content' => 'Señales técnicas detectadas: ' . implode(', ', $r['madurez']) . "\n\n" . icc_ia_datos('TEXTO DE SU WEB', $r['extracto'], 2500)],
    ], ['tipo' => 'motor_cualificar', 'max_tokens' => 1200, 'esfuerzo' => 'minimal', 'sin_limite' => true,
        'esquema' => ['nombre' => 'cualificacion', 'schema' => ['type' => 'object', 'additionalProperties' => false, 'required' => ['detalle', 'carencias', 'encaje'], 'properties' => [
          'detalle' => ['type' => 'string'], 'encaje' => ['type' => 'integer'],
          'carencias' => ['type' => 'array', 'items' => ['type' => 'string', 'enum' => ['sin_chatbot', 'sin_whatsapp', 'chat_sin_aviso_ia', 'sin_politica_ia', 'web_anticuada', 'sin_movil', 'sin_https', 'sin_captacion']]]]]]]);
    if ($q['ok']) {
      $mad = array_values(array_unique(array_merge($r['madurez'], (array)$q['json']['carencias'])));
      $db->prepare('UPDATE motor_leads SET madurez = ?, resumen = ?, puntuacion = ? WHERE id = ?')
        ->execute([implode(',', $mad), mb_substr(trim((string)$q['json']['detalle']), 0, 500), max(0, min(100, (int)$q['json']['encaje'])), $leadId]);
    }
  }
  return $r;
}

function motor_scraper(): array {
  $c = json_decode((string)icc_ajuste('motor_scraper', ''), true) ?: [];
  $pref = array_values(array_filter(array_map(function ($x) { return strtolower(trim($x)); }, explode(',', (string)($c['prefijos'] ?? MOTOR_PREFIJOS))), function ($x) { return preg_match('/^[a-z0-9._-]{2,30}$/', $x); }));
  return ['prefijos' => $pref ?: array_map('trim', explode(',', MOTOR_PREFIJOS)), 'cualificar_ia' => !isset($c['cualificar_ia']) || !empty($c['cualificar_ia']),
    'puntuacion_min' => max(0, min(100, (int)($c['puntuacion_min'] ?? 0)))];
}

/** Rastreo directo de webs corporativas (lista pegada). */
function motor_alta_webs(array $urls, string $sector, ?int $autor): array {
  $nuevos = []; $repetidos = 0;
  foreach (array_slice($urls, 0, 100) as $u) {
    $u = trim((string)$u);
    if ($u === '' || !preg_match('#^(https?://)?[a-z0-9\-]+(\.[a-z0-9\-]+)+(:\d{2,5})?(/\S*)?$#i', $u)) continue;
    $host = preg_replace('/^www\./', '', strtolower((string)parse_url((preg_match('#^https?://#', $u) ? '' : 'https://') . $u, PHP_URL_HOST)));
    $nombre = ucfirst(explode('.', $host)[0]);
    $id = motor_alta_lead(['nombre' => $nombre, 'web' => (preg_match('#^https?://#', $u) ? '' : 'https://') . $u, 'sector' => $sector], 'manual', $autor);
    $id ? $nuevos[] = $id : $repetidos++;
  }
  if ($nuevos) motor_log('radar', count($nuevos) . ' webs corporativas añadidas para rastrear');
  return ['nuevos' => $nuevos, 'repetidos' => $repetidos];
}

/** Rebote: ese correo no vuelve a usarse y la empresa sale de su secuencia. */
function motor_rebote(int $leadId, string $email, string $motivo = 'Rebote del servidor'): void {
  $db = icc_db();
  $db->prepare("UPDATE motor_leads SET rebotado = 1, mx_ok = 0, estado = 'descartado', proximo_envio = NULL WHERE id = ?")->execute([$leadId]);
  $db->prepare("UPDATE motor_mensajes SET estado = 'descartado', error = 'Rebote' WHERE lead_id = ? AND estado IN ('pendiente','aprobado','borrador')")->execute([$leadId]);
  motor_log('rebote', $email . ': ' . $motivo . ' (no se volverá a usar)', $leadId);
}

/** Radar: busca en Google Places "sector en ubicacion" (hasta $paginas paginas) y da de alta lo nuevo. */
function motor_extraer(string $sector, string $palabra, array $ubicaciones, ?int $autor, int $paginas = 2, string $origen = 'places'): array {
  $consultas = 0; $nuevos = []; $vistos = 0; $errores = [];
  $termino = trim($palabra) !== '' ? trim($palabra) : (MOTOR_SECTORES[$sector][2] ?? $sector);
  foreach ($ubicaciones as $u) {
    $u = trim((string)$u);
    if ($u === '') continue;
    $q = $termino . ' en ' . $u . (preg_match('/^\d{5}$/', $u) ? '' : (mb_stripos($u, 'asturias') === false ? ', Asturias' : ''));
    $token = null;
    for ($p = 0; $p < $paginas; $p++) {
      $r = icc_places_buscar($q, $token);
      $consultas++;
      if (!$r['ok']) { $errores[] = $r['error']; break; }
      foreach ($r['lugares'] as $lug) {
        $vistos++;
        $id = motor_alta_lead($lug + ['sector' => $sector, 'concejo' => motor_ubicar($u)[0] ?: '', 'comarca' => motor_ubicar($u)[1] ?: ''], $origen, $autor);
        if ($id) $nuevos[] = $id;
      }
      $token = $r['siguiente'];
      if (!$token) break;
    }
  }
  if ($nuevos) motor_log('radar', count($nuevos) . ' empresas nuevas de ' . (MOTOR_SECTORES[$sector][0] ?? $sector) . ' en ' . implode(', ', array_slice($ubicaciones, 0, 3)));
  return ['consultas' => $consultas, 'vistos' => $vistos, 'nuevos' => $nuevos, 'errores' => array_values(array_unique($errores))];
}

/* ===========================================================================
   REDACCION (IA o plantilla)
   ========================================================================= */
function motor_plantilla(array $lead, string $angulo, int $paso): array {
  $empresa = $lead['nombre'];
  $sector = mb_strtolower(MOTOR_SECTORES[$lead['sector']][0] ?? 'su sector');
  $lugar = $lead['concejo'] ?: ($lead['localidad'] ?: 'Asturias');
  if ($paso === 2) {
    return ['asunto' => 'Re: ' . motor_plantilla($lead, $angulo, 1)['asunto'],
      'cuerpo' => "Buenos días:\n\nLe escribí hace unos días por si les interesaba que revisáramos los costes de $empresa. Además de luz y gas, revisamos telefonía, alarmas y seguros, y trabajamos con todas las compañías.\n\n¿Le viene bien que le llame diez minutos esta semana, o prefiere que le envíe la información por aquí?\n\nUn saludo."];
  }
  if ($paso >= 3) {
    return ['asunto' => '¿Cierro su expediente?',
      'cuerpo' => "Buenos días:\n\nNo quiero insistir más de la cuenta. Si ahora no es buen momento, no le escribiré más.\n\nSi en algún momento quiere el estudio gratuito de sus facturas de luz, gas, teléfono, alarma o seguros, respóndame a este correo. Si no encontramos una mejora real, se lo decimos y no cambia nada.\n\nUn saludo."];
  }
  $t = [
    'auditoria_integral' => ['Revisión de costes en ' . $empresa, "Buenos días:\n\nEn ICC revisamos de una vez la luz, el gas, la telefonía, la alarma y los seguros de negocios de $sector en $lugar, comparando con todas las compañías del mercado.\n\nSi no encontramos una mejora real, se lo decimos y no cambia nada. Si la hay, nos encargamos de todos los trámites.\n\n¿Le encaja una llamada de diez minutos esta semana para ver el caso de $empresa?\n\nUn saludo."],
    'telefonia' => ['Telefonía de ' . $empresa, "Buenos días:\n\nEn muchos negocios de $sector se siguen pagando líneas, permanencias o servicios que ya no se usan, repartidos en varias facturas.\n\nRevisamos la fibra, los móviles y la centralita de $empresa con todas las compañías y le decimos si se puede mejorar. Si no, no cambia nada.\n\n¿Me envía su última factura de teléfono?\n\nUn saludo."],
    'alarmas' => ['La alarma de ' . $empresa, "Buenos días:\n\n¿Cuándo revisaron por última vez el contrato de la alarma de $empresa? Las cuotas y el mantenimiento suelen quedarse igual años aunque cambien las necesidades del negocio.\n\nComparamos con todas las compañías de seguridad y le decimos si hay una opción mejor conectada a central receptora. Sin compromiso.\n\n¿Lo vemos en diez minutos?\n\nUn saludo."],
    'seguros' => ['Seguros de ' . $empresa, "Buenos días:\n\nLas pólizas de empresa se renuevan solas cada año y pocas veces se revisan sus coberturas o su precio.\n\nRevisamos los seguros de negocios de $sector en $lugar (responsabilidad civil, multirriesgo, vehículos) con todas las compañías. Si no hay una mejora real, se lo decimos.\n\n¿Me indica cuándo vence su póliza principal?\n\nUn saludo."],
    'ahorro_factura' => ['Factura de luz de ' . $empresa, "Buenos días:\n\nTrabajamos con negocios de $sector en $lugar revisando sus facturas de luz y gas. En muchos casos encontramos términos de potencia o precios de energía que ya no encajan con su consumo real.\n\n¿Le parece que revisemos su última factura? Es gratuito y sin compromiso: si no podemos mejorarla, se lo diremos igual.\n\nUn saludo."],
    'potencia' => ['Potencia contratada en ' . $empresa, "Buenos días:\n\nEn negocios de $sector es habitual pagar más potencia de la que se usa, o tener recargos por excesos o energía reactiva que pasan desapercibidos en la factura.\n\nSi nos envía una factura reciente, le decimos en dos días si su contrato está bien ajustado. Sin compromiso.\n\nUn saludo."],
    'caso_sector' => ['Otros negocios de ' . $sector . ' en Asturias', "Buenos días:\n\nAsesoramos a varios negocios de $sector en Asturias con sus contratos de luz, gas, telefonía, alarmas y seguros, y casi todos tenían algo que ajustar: potencia, tarifa, pólizas sin revisar o servicios que ya no usaban.\n\n¿Le interesa que miremos el caso de $empresa? Solo necesitamos una factura.\n\nUn saludo."],
    'pregunta_corta' => ['Una pregunta rápida', "Buenos días:\n\n¿Quién se encarga en $empresa de revisar los contratos de luz y teléfono?\n\nSi es usted, me gustaría proponerle una revisión gratuita de sus facturas.\n\nGracias."],
    'estudio_gratuito' => ['Estudio gratuito de sus facturas', "Buenos días:\n\nOfrecemos a negocios de $lugar un estudio gratuito de sus facturas de luz, gas y telefonía: comparamos su contrato con todas las compañías del mercado y le explicamos qué se puede mejorar.\n\n¿Le gustaría que preparásemos el de $empresa?\n\nUn saludo."],
  ];
  [$asunto, $cuerpo] = $t[$angulo] ?? $t['auditoria_integral'];
  return ['asunto' => $asunto, 'cuerpo' => $cuerpo];
}

/** Redacta el correo de un paso. Con IA si esta disponible; si no, plantilla del angulo. */
function motor_redactar(array $lead, array $campana, int $paso, ?int $usuarioId = null): array {
  $perfil = motor_perfil((string)($campana['perfil'] ?? 'icc'));
  $angulo = in_array($campana['angulo'] ?? '', $perfil['angulos'], true) ? $campana['angulo'] : $perfil['angulos'][0];
  if (icc_ia_disponible()) {
    $datos = [
      'empresa' => $lead['nombre'], 'razon_social' => $lead['razon_social'], 'sector' => MOTOR_SECTORES[$lead['sector']][0] ?? $lead['sector'],
      'localidad' => $lead['concejo'] ?: $lead['localidad'], 'comarca' => $lead['comarca'] ?? '', 'angulo' => MOTOR_ANGULOS[$angulo] ?? $angulo, 'paso' => $paso,
      'tipo' => $perfil['pasos'][$paso] ?? 'seguimiento', 'detalle_de_su_negocio' => $lead['resumen'] ?? '',
      'carencias_digitales' => array_values(array_map(function ($m) { return MOTOR_MADUREZ[$m] ?? $m; }, array_filter(explode(',', (string)($lead['madurez'] ?? ''))))),
      'limite_palabras' => $paso === 1 ? $perfil['palabras'] : (int)round($perfil['palabras'] * 0.7), 'limite_palabras_asunto' => $perfil['asunto_palabras'],
      'ofertas_exclusivas_del_mes' => function_exists('rc_ofertas') ? array_map(function ($o) { return trim($o['titulo'] . ($o['compania'] ? ' (' . $o['compania'] . ')' : '') . ($o['condiciones'] ? ': ' . $o['condiciones'] : '')); }, array_slice(rc_ofertas(), 0, 3)) : [],
    ];
    $r = icc_ia_chat([
      ['role' => 'system', 'content' => $perfil['prompt'] . "\nTono: " . $perfil['tono'] . '.'
        . (function_exists('apr_ejemplos_texto') ? apr_ejemplos_texto('motor_' . $perfil['id'], 'Correos que dirección corrigió y aprobó') . apr_ejemplos_texto('motor', 'Otros correos corregidos y aprobados') : '')],
      ['role' => 'user', 'content' => "Datos de la empresa (JSON):\n" . json_encode($datos, JSON_UNESCAPED_UNICODE) . "\n\n" . icc_ia_datos('TEXTO DE SU WEB', (string)$lead['extracto'], 1800)],
    ], ['tipo' => 'motor_correo', 'usuario_id' => $usuarioId, 'modelo' => $perfil['modelo'] ?: null, 'max_tokens' => 2500,
        'esquema' => ['nombre' => 'correo', 'schema' => ['type' => 'object', 'additionalProperties' => false, 'required' => ['asunto', 'cuerpo'],
          'properties' => ['asunto' => ['type' => 'string'], 'cuerpo' => ['type' => 'string']]]]]);
    if ($r['ok'] && trim((string)$r['json']['cuerpo']) !== '' && !preg_match('/\d+\s?(%|€|euros)/iu', $r['json']['cuerpo'] . $r['json']['asunto'])) {
      return ['asunto' => mb_substr(trim($r['json']['asunto']), 0, 200), 'cuerpo' => trim($r['json']['cuerpo']), 'ia' => true];
    }
  }
  return motor_plantilla($lead, $angulo, $paso) + ['ia' => false];
}

function motor_enlace_baja(array $lead): string {
  $d = $lead['id'] . '.' . $lead['email'];
  return icc_url_base() . '/api/baja.php?t=' . rtrim(strtr(base64_encode($d), '+/', '-_'), '=') . '.' . icc_firma('baja|' . $d);
}

/** Firma, motivo del contacto, responsable y baja: siempre los pone el sistema. */
function motor_pie(array $lead, string $perfilId = 'icc'): string {
  $p = motor_perfil($perfilId);
  return "\n\n--\n" . trim($p['firma']) . "\n\n"
    . 'Le escribimos porque ' . $lead['nombre'] . ' figura públicamente como empresa de ' . mb_strtolower(MOTOR_SECTORES[$lead['sector']][0] ?? 'su sector')
    . ' y creemos que puede interesarle. Responsable del tratamiento: ' . $p['responsable'] . '. '
    . "Si no quiere recibir más correos nuestros, pulse aquí y no volveremos a escribirle: " . motor_enlace_baja($lead) . ' (o responda «BAJA»).';
}

/** Crea el correo del siguiente paso de un lead segun el modo de su campana. */
function motor_preparar_paso(array $lead, array $campana, ?int $usuarioId = null): ?int {
  if ($lead['email'] === '' || !$lead['mx_ok'] || icc_excluido($lead['email'])) return null;
  $paso = (int)$lead['paso'] + 1;
  if ($paso > 3) return null;
  $red = motor_redactar($lead, $campana, $paso, $usuarioId);
  $cfg = motor_config();
  $estado = $campana['modo'] === 'borradores' ? 'borrador'
    : ($campana['modo'] === 'autonomo' && $cfg['aviso_legal'] !== '' ? 'aprobado' : 'pendiente');
  icc_db()->prepare('INSERT INTO motor_mensajes (lead_id, campana_id, paso, asunto, cuerpo, estado, angulo, ia) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    ->execute([$lead['id'], $campana['id'], $paso, $red['asunto'], $red['cuerpo'], $estado, $campana['angulo'], $red['ia'] ? 1 : 0]);
  $id = (int)icc_db()->lastInsertId();
  motor_log('redactado', 'Correo ' . $paso . ' para ' . $lead['nombre'] . ($red['ia'] ? ' (IA)' : ' (plantilla)') . ($estado === 'pendiente' ? ' · para revisar' : ''), (int)$lead['id'], (int)$campana['id']);
  return $id;
}

/** Mete empresas en una campana (solo las que tienen correo verificado y no estan excluidas). */
function motor_meter_en_campana(array $leadIds, int $campanaId): int {
  $db = icc_db();
  $n = 0;
  $st = $db->prepare("UPDATE motor_leads SET campana_id = ?, estado = 'en_campana', paso = 0, proximo_envio = NOW()
                      WHERE id = ? AND email <> '' AND mx_ok = 1 AND rebotado = 0 AND estado IN ('nuevo','en_campana','contactado')
                        AND (puntuacion IS NULL OR puntuacion >= ?)");
  foreach ($leadIds as $id) {
    $l = $db->prepare('SELECT email FROM motor_leads WHERE id = ?');
    $l->execute([(int)$id]);
    $email = (string)$l->fetchColumn();
    if ($email === '' || icc_excluido($email)) continue;
    $st->execute([$campanaId, (int)$id, motor_scraper()['puntuacion_min']]);
    $n += $st->rowCount();
  }
  return $n;
}

/* ===========================================================================
   ENVIO (cron): limite diario, pausa aleatoria, horario y laborables
   ========================================================================= */
function motor_puede_enviar_ahora(array $cfg): string {
  if ($cfg['pausado']) return 'Motor en pausa';
  $ahora = icc_madrid();
  if ($cfg['solo_laborables'] && !icc_es_laborable($ahora)) return 'Fin de semana';
  $h = $ahora->format('H:i');
  if ($h < $cfg['hora_desde'] || $h >= $cfg['hora_hasta']) return 'Fuera de horario';
  if (!motor_buzones()) return 'Sin buzón de envío';
  return '';
}

function motor_enviar_mensaje(int $msgId, ?int $usuarioId = null, ?array $buzon = null): array {
  $db = icc_db();
  $st = $db->prepare('SELECT m.*, l.email, l.nombre, l.sector, l.id lead, l.paso lead_paso, COALESCE(c.perfil, "icc") perfil FROM motor_mensajes m JOIN motor_leads l ON l.id = m.lead_id LEFT JOIN motor_campanas c ON c.id = m.campana_id WHERE m.id = ?');
  $st->execute([$msgId]);
  $m = $st->fetch();
  if (!$m || !in_array($m['estado'], ['aprobado', 'pendiente'], true)) return ['ok' => false, 'error' => 'Este correo ya no se puede enviar.'];
  if (icc_excluido($m['email'])) {
    $db->prepare("UPDATE motor_mensajes SET estado = 'descartado', error = 'En la lista de exclusión' WHERE id = ?")->execute([$msgId]);
    return ['ok' => false, 'error' => 'La empresa está en la lista de exclusión.'];
  }
  $cuenta = $buzon ? motor_buzon_cuenta($buzon) : motor_cuenta();
  if (!$cuenta) return ['ok' => false, 'error' => 'Falta configurar el buzón de envío del Motor.'];
  $lead = ['id' => $m['lead'], 'email' => $m['email'], 'nombre' => $m['nombre'], 'sector' => $m['sector']];
  $baja = motor_enlace_baja($lead);
  // Seguimientos en el mismo hilo.
  $prev = $db->prepare("SELECT message_id FROM motor_mensajes WHERE lead_id = ? AND direccion = 'salida' AND estado = 'enviado' AND message_id IS NOT NULL ORDER BY id DESC LIMIT 1");
  $prev->execute([$m['lead']]);
  $hilo = (string)$prev->fetchColumn();
  $r = icc_smtp_enviar($cuenta, [
    'para' => $m['email'], 'asunto' => $m['asunto'], 'texto' => $m['cuerpo'] . motor_pie($lead, (string)$m['perfil']),
    'in_reply_to' => $hilo ?: null, 'references' => $hilo ?: null,
    'cabeceras' => ['List-Unsubscribe: <' . $baja . '>, <mailto:' . $cuenta['email'] . '?subject=BAJA>', 'List-Unsubscribe-Post: List-Unsubscribe=One-Click'],
  ]);
  if (!$r['ok']) {
    $db->prepare("UPDATE motor_mensajes SET estado = 'error', error = ? WHERE id = ?")->execute([$r['error'], $msgId]);
    motor_log('error', 'No se pudo enviar a ' . $m['nombre'] . ': ' . $r['error'], (int)$m['lead'], (int)$m['campana_id']);
    return $r;
  }
  $db->prepare("UPDATE motor_mensajes SET estado = 'enviado', enviado_en = NOW(), message_id = ?, buzon = ?, aprobado_por = COALESCE(aprobado_por, ?) WHERE id = ?")->execute([$r['message_id'], $cuenta['email'], $usuarioId, $msgId]);
  $paso = (int)$m['paso'];
  $sig = MOTOR_CADENCIA[$paso + 1] ?? null;
  $db->prepare("UPDATE motor_leads SET paso = ?, ultimo_envio = NOW(), estado = 'contactado', proximo_envio = " . ($sig === null ? 'NULL' : 'NOW() + INTERVAL ' . ($sig - MOTOR_CADENCIA[$paso]) . ' DAY') . ' WHERE id = ?')
    ->execute([$paso, $m['lead']]);
  motor_log('enviado', 'Correo ' . $paso . ' enviado a ' . $m['nombre'], (int)$m['lead'], (int)$m['campana_id']);
  return ['ok' => true];
}

/** Bloque del cron: prepara los pasos que tocan y envia como mucho un correo. */
function motor_tick(): string {
  if (defined('ICC_MODO_DEMO') && ICC_MODO_DEMO) return 'Modo demostración.';
  $db = icc_db();
  $cfg = motor_config();
  $preparados = 0;
  if (!$cfg['pausado']) {
    $leads = $db->query("SELECT l.*, c.id camp_id, c.modo, c.angulo, c.perfil, c.nombre camp_nombre FROM motor_leads l JOIN motor_campanas c ON c.id = l.campana_id
                         WHERE c.estado = 'activa' AND l.estado IN ('en_campana','contactado') AND l.paso < 3 AND l.proximo_envio <= NOW() AND l.canal = 'correo'
                           AND NOT EXISTS (SELECT 1 FROM motor_mensajes m WHERE m.lead_id = l.id AND m.direccion = 'salida' AND m.estado IN ('pendiente','aprobado','borrador'))
                         ORDER BY l.proximo_envio LIMIT 8")->fetchAll();
    foreach ($leads as $l) {
      if (motor_preparar_paso($l, ['id' => $l['camp_id'], 'modo' => $l['modo'], 'angulo' => $l['angulo'], 'perfil' => $l['perfil']])) $preparados++;
    }
  }
  $motivo = motor_puede_enviar_ahora($cfg);
  $enviado = '';
  if ($motivo === '') {
    // Cada buzon envia como mucho uno por pasada, con su limite diario, su
    // calentamiento y su pausa aleatoria; los seguimientos salen del mismo buzon.
    $libres = [];
    foreach (motor_buzones() as $b) {
      if (empty($b['activo']) || motor_buzon_clave((string)$b['id']) === '') continue;
      $h = (string)icc_ajuste('motor_hueco_' . $b['id'], '');
      if ($h !== '' && strtotime($h) > time()) continue;
      if (motor_buzon_enviados_hoy((string)$b['email']) >= motor_buzon_limite_hoy($b)) continue;
      $libres[$b['email']] = $b;
    }
    $n = 0; $err = 0;
    if ($libres) {
      $todos = array_column(motor_buzones(), 'email');
      $cola = $db->query("SELECT m.id, c.perfil, (SELECT m2.buzon FROM motor_mensajes m2 WHERE m2.lead_id = m.lead_id AND m2.estado = 'enviado' AND m2.buzon IS NOT NULL ORDER BY m2.id DESC LIMIT 1) buzon_previo
                          FROM motor_mensajes m JOIN motor_campanas c ON c.id = m.campana_id WHERE m.direccion = 'salida' AND m.estado = 'aprobado' AND c.estado = 'activa' ORDER BY m.paso DESC, m.id LIMIT 50")->fetchAll();
      foreach ($cola as $c) {
        if (!$libres) break;
        $elegido = null;
        if ($c['buzon_previo'] && in_array($c['buzon_previo'], $todos, true)) $elegido = $libres[$c['buzon_previo']] ?? null;
        else foreach ($libres as $b) if (($b['perfil'] ?? '') === '' || $b['perfil'] === $c['perfil']) { $elegido = $b; break; }
        if (!$elegido) continue;
        $r = motor_enviar_mensaje((int)$c['id'], null, $elegido);
        $r['ok'] ? $n++ : $err++;
        icc_ajuste_guardar('motor_hueco_' . $elegido['id'], date('Y-m-d H:i:s', time() + random_int($cfg['pausa_min'] * 60, max($cfg['pausa_min'], $cfg['pausa_max']) * 60)));
        unset($libres[$elegido['email']]);
      }
    }
    $enviado = $n || $err ? $n . ' enviados' . ($err ? ' · ' . $err . ' con error' : '') : ($libres ? '' : 'Buzones en pausa o en su límite de hoy');
  }
  $leidas = motor_leer_respuestas();
  return trim($preparados . ' preparados · ' . ($enviado ?: ($motivo ?: 'nada que enviar')) . ($leidas !== '' ? ' · ' . $leidas : ''));
}

/** Bloque del cron: analiza webs pendientes (10 por pasada). */
function motor_analizar_pendientes(): string {
  $ids = icc_db()->query("SELECT id FROM motor_leads WHERE analizado_en IS NULL AND web <> '' AND estado = 'nuevo' ORDER BY id LIMIT 10")->fetchAll(PDO::FETCH_COLUMN);
  foreach ($ids as $id) motor_analizar((int)$id);
  return count($ids) . ' webs analizadas.';
}

/* ===========================================================================
   RESPUESTAS
   ========================================================================= */
const MOTOR_CLASES = [
  'quiere_info' => 'Quiere información', 'pide_presupuesto' => 'Pide presupuesto', 'acepta_reunion' => 'Acepta reunión',
  'no_interesa' => 'No le interesa', 'baja' => 'Pide la baja', 'fuera_oficina' => 'Fuera de la oficina',
];

function motor_clasificar(string $texto, ?int $usuarioId = null): array {
  $t = mb_strtolower($texto);
  $regla = null;
  if (preg_match('/\b(baja|darme de baja|no me escrib|no vuelvan|elimin(en|ar) mis datos|unsubscribe|stop)\b/u', $t)) $regla = 'baja';
  elseif (preg_match('/(fuera de (la )?oficina|de vacaciones|out of office|ausente hasta|regreso el)/u', $t)) $regla = 'fuera_oficina';
  if ($regla !== null) return ['clase' => $regla, 'ia' => false];
  if (icc_ia_disponible()) {
    $r = icc_ia_chat([
      ['role' => 'system', 'content' => 'Clasificas respuestas a correos comerciales de una consultoría de energía. Devuelve solo la clase.'],
      ['role' => 'user', 'content' => icc_ia_datos('RESPUESTA DEL CLIENTE', $texto, 3000)],
    ], ['tipo' => 'motor_clasificar', 'usuario_id' => $usuarioId, 'max_tokens' => 800, 'esfuerzo' => 'minimal',
        'esquema' => ['nombre' => 'clase', 'schema' => ['type' => 'object', 'additionalProperties' => false, 'required' => ['clase'],
          'properties' => ['clase' => ['type' => 'string', 'enum' => array_keys(MOTOR_CLASES)]]]]]);
    if ($r['ok'] && isset(MOTOR_CLASES[$r['json']['clase'] ?? ''])) return ['clase' => $r['json']['clase'], 'ia' => true];
  }
  if ($regla) return ['clase' => $regla, 'ia' => false];
  if (preg_match('/(presupuesto|precio|cu[aá]nto|tarifa|oferta)/u', $t)) $c = 'pide_presupuesto';
  elseif (preg_match('/(reuni[oó]n|llam(a|e|ad)|cita|qued(ar|amos)|ma[ñn]ana|el (lunes|martes|mi[eé]rcoles|jueves|viernes))/u', $t)) $c = 'acepta_reunion';
  elseif (preg_match('/(no (nos|me) interesa|no gracias|no estamos interesados|ya tenemos|no necesitamos)/u', $t)) $c = 'no_interesa';
  else $c = 'quiere_info';
  return ['clase' => $c, 'ia' => false];
}

/**
 * Procesa la respuesta de una empresa: para la secuencia, aplica la baja o la
 * pasa al CRM si hay interes (fase Lead, conversacion en su historial y llamada
 * al dia laborable siguiente para su gestor).
 */
function motor_procesar_respuesta(int $leadId, string $asunto, string $texto, string $origen, ?int $usuarioId = null): array {
  $db = icc_db();
  $st = $db->prepare('SELECT l.*, c.gestor_id, c.creado_por camp_autor, c.angulo camp_angulo FROM motor_leads l LEFT JOIN motor_campanas c ON c.id = l.campana_id WHERE l.id = ?');
  $st->execute([$leadId]);
  $l = $st->fetch();
  if (!$l) return ['ok' => false, 'error' => 'Empresa no encontrada'];
  $cl = motor_clasificar($texto, $usuarioId);
  $db->prepare("INSERT INTO motor_mensajes (lead_id, campana_id, paso, direccion, asunto, cuerpo, estado, clasificacion, ia) VALUES (?, ?, ?, 'entrada', ?, ?, 'recibido', ?, ?)")
    ->execute([$leadId, $l['campana_id'], (int)$l['paso'], mb_substr($asunto, 0, 255), mb_substr($texto, 0, 20000), $cl['clase'], $cl['ia'] ? 1 : 0]);
  $out = ['ok' => true, 'clase' => $cl['clase'], 'cliente_id' => null];
  if ($cl['clase'] === 'fuera_oficina') {
    motor_log('respuesta', $l['nombre'] . ': fuera de la oficina (la secuencia sigue)', $leadId, $l['campana_id'] ? (int)$l['campana_id'] : null);
    return $out;
  }
  // Cualquier otra respuesta para la secuencia.
  $db->prepare("UPDATE motor_mensajes SET estado = 'descartado', error = 'La empresa ha respondido' WHERE lead_id = ? AND direccion = 'salida' AND estado IN ('pendiente','aprobado','borrador')")->execute([$leadId]);
  $nuevoEstado = 'respondido';
  if ($cl['clase'] === 'baja') {
    icc_baja_anotar($l['email'], 'email', 'Pidió la baja respondiendo al correo', $origen);
    $nuevoEstado = 'baja';
  } elseif (in_array($cl['clase'], ['quiere_info', 'pide_presupuesto', 'acepta_reunion'], true)) {
    $gestor = $l['gestor_id'] ? (int)$l['gestor_id'] : (motor_config()['gestor_defecto'] ?: ($l['camp_autor'] ? (int)$l['camp_autor'] : null));
    $conv = motor_conversacion($leadId);
    $out['cliente_id'] = motor_a_crm($l, $gestor, $conv, $usuarioId, MOTOR_CLASES[$cl['clase']]);
    // Ha mostrado interes: etiqueta del servicio de la campana (arranca su embudo en Automatizaciones).
    icc_etiquetar_cliente((int)$out['cliente_id'], ICC_INTERESES[MOTOR_ANGULO_SERVICIO[$l['camp_angulo'] ?? ''] ?? 'integral']);
    $nuevoEstado = 'en_crm';
  }
  $db->prepare('UPDATE motor_leads SET estado = ?, proximo_envio = NULL WHERE id = ?')->execute([$nuevoEstado, $leadId]);
  motor_log('respuesta', $l['nombre'] . ': ' . MOTOR_CLASES[$cl['clase']], $leadId, $l['campana_id'] ? (int)$l['campana_id'] : null);
  return $out;
}

function motor_conversacion(int $leadId): string {
  $st = icc_db()->prepare('SELECT direccion, asunto, cuerpo, COALESCE(enviado_en, created_at) f FROM motor_mensajes WHERE lead_id = ? AND estado IN ("enviado","recibido") ORDER BY id');
  $st->execute([$leadId]);
  $t = '';
  foreach ($st->fetchAll() as $m) $t .= ($m['direccion'] === 'salida' ? '→ Enviado ' : '← Recibido ') . $m['f'] . ' · ' . $m['asunto'] . "\n" . trim((string)$m['cuerpo']) . "\n\n";
  return trim($t);
}

/** Pasa una empresa al CRM (o la reconoce si ya existia). Devuelve el id del cliente. */
function motor_a_crm(array $l, ?int $gestorId, string $conversacion, ?int $autorId, string $motivo = 'Interesado'): int {
  $db = icc_db();
  $cid = null;
  if ($l['email'] !== '' || $l['cif'] !== '') {
    $st = $db->prepare('SELECT id FROM clientes WHERE (? <> "" AND (LOWER(email) = ? OR LOWER(contacto_email) = ?)) OR (? <> "" AND cif = ?) LIMIT 1');
    $st->execute([$l['email'], $l['email'], $l['email'], $l['cif'], $l['cif']]);
    $cid = $st->fetchColumn() ?: null;
  }
  if (!$cid) {
    $db->prepare("INSERT INTO clientes (comercial_id, razon_social, cif, contacto_nombre, contacto_telefono, contacto_email, sector, tipo_cliente, telefono, email, direccion_suministro, upload_token, estado, origen, ultima_actividad)
                  VALUES (?, ?, ?, '', ?, ?, ?, 'pyme', ?, ?, ?, ?, 'lead_captado', 'motor', NOW())")
      ->execute([$gestorId, $l['razon_social'] ?: $l['nombre'], $l['cif'], $l['telefono'], $l['email'], MOTOR_SECTORES[$l['sector']][0] ?? $l['sector'], $l['telefono'], $l['email'], $l['direccion'], icc_uuid()]);
    $cid = (int)$db->lastInsertId();
    $db->prepare('INSERT INTO historial_estado (cliente_id, estado_anterior, estado_nuevo, cambiado_por) VALUES (?, NULL, ?, ?)')->execute([$cid, 'lead_captado', $autorId]);
  }
  $cid = (int)$cid;
  $db->prepare('UPDATE motor_leads SET cliente_id = ?, estado = "en_crm" WHERE id = ?')->execute([$cid, $l['id']]);
  icc_nota_cliente($cid, 'Motor de prospección · ' . $motivo . ".\n\n" . $conversacion, 'motor', $autorId);
  if ($gestorId) {
    $cuando = icc_siguiente_laborable('10:00');
    $db->prepare("INSERT INTO citas (comercial_id, cliente_id, tipo, cliente_nombre, telefono, email, sector, fecha, hora_inicio, hora_fin, estado, notas, creado_por)
                  VALUES (?, ?, 'llamada', ?, ?, ?, 'energia', ?, ?, ?, 'programada', ?, ?)")
      ->execute([$gestorId, $cid, $l['razon_social'] ?: $l['nombre'], $l['telefono'], $l['email'], $cuando->format('Y-m-d'), $cuando->format('H:i:s'), $cuando->modify('+15 minutes')->format('H:i:s'),
        'Llamar: ha respondido al correo del Motor (' . $motivo . ').', $autorId]);
    icc_notificar($gestorId, 'cuenta', 'motor_lead', 'Nuevo interesado del Motor: ' . ($l['razon_social'] ?: $l['nombre']) . '. Tienes una llamada el ' . $cuando->format('d/m') . ' a las 10:00.', $cid);
  }
  return $cid;
}

/** Lee el buzon del Motor por IMAP (si esta configurado) y procesa las respuestas. */
function motor_leer_respuestas(): string {
  $n = 0; $reb = 0; $err = 0;
  foreach (motor_buzones() as $b) {
    if (empty($b['activo']) || empty($b['host_imap'])) continue;
    $sufijo = $b['id'] === 'principal' ? '' : '_' . $b['id'];
    $cuenta = motor_buzon_cuenta($b);
    $ultimo = icc_ajuste('motor_imap_uid' . $sufijo, null);
    $validity = icc_ajuste('motor_imap_validity' . $sufijo, null);
    $r = icc_imap_nuevos($cuenta, $ultimo === null ? null : (int)$ultimo, $validity === null ? null : (int)$validity, 20);
    if (!$r['ok']) { motor_log('error', 'Respuestas de ' . $b['email'] . ': ' . $r['error']); $err++; continue; }
    icc_ajuste_guardar('motor_imap_uid' . $sufijo, (string)$r['ultimo_uid']);
    icc_ajuste_guardar('motor_imap_validity' . $sufijo, (string)$r['uidvalidity']);
    [$a, $c] = motor_procesar_entrantes($r['mensajes']);
    $n += $a; $reb += $c;
  }
  return trim(($n ? $n . ' respuestas leídas' : '') . ($reb ? ' · ' . $reb . ' rebotes' : '') . ($err ? ' · ' . $err . ' buzones con error' : ''), ' ·');
}

/** Procesa correos entrantes del Motor. Devuelve [respuestas, rebotes]. */
function motor_procesar_entrantes(array $mensajes): array {
  $n = 0; $reb = 0;
  $db = icc_db();
  foreach ($mensajes as $msg) {
    $p = icc_mime_leer($msg['crudo']);
    if ($p['de'] === '') continue;
    // Rebotes: el correo no existe -> ese lead no vuelve a usarse (protege la reputacion del dominio).
    $local = strtolower(strtok($p['de'], '@') ?: '');
    if ($p['automatico'] === 'rebote' || in_array($local, ['mailer-daemon', 'postmaster'], true) || preg_match('/(undeliverable|delivery status|no se puede entregar|mail delivery failed|returned mail)/i', $p['asunto'])) {
      $texto = $p['texto'] . ' ' . ($p['cabeceras']['x-failed-recipients'] ?? '');
      preg_match_all('/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/', $texto, $mm);
      foreach (array_unique(array_map('strtolower', $mm[0])) as $e) {
        $st = $db->prepare("SELECT id FROM motor_leads WHERE email = ? AND rebotado = 0 LIMIT 1");
        $st->execute([$e]);
        if ($lid = $st->fetchColumn()) { motor_rebote((int)$lid, $e); $reb++; }
      }
      continue;
    }
    if ($p['message_id'] !== '') {
      $st = $db->prepare("SELECT 1 FROM motor_mensajes WHERE message_id = ? AND direccion = 'entrada'");
      $st->execute([$p['message_id']]);
      if ($st->fetchColumn()) continue;
    }
    $lead = null;
    if ($p['in_reply_to'] !== '') {
      $st = $db->prepare('SELECT lead_id FROM motor_mensajes WHERE message_id = ? LIMIT 1');
      $st->execute([$p['in_reply_to']]);
      $lead = $st->fetchColumn() ?: null;
    }
    if (!$lead) {
      $st = $db->prepare('SELECT id FROM motor_leads WHERE email = ? ORDER BY id DESC LIMIT 1');
      $st->execute([$p['de']]);
      $lead = $st->fetchColumn() ?: null;
    }
    if (!$lead) continue;
    if ($p['automatico'] && !preg_match('/fuera de la oficina|out of office|vacaciones/i', $p['asunto'] . ' ' . $p['texto'])) continue;
    $res = motor_procesar_respuesta((int)$lead, $p['asunto'], $p['texto_limpio'] ?: $p['texto'], 'imap');
    if ($p['message_id'] !== '') $db->prepare("UPDATE motor_mensajes SET message_id = ? WHERE lead_id = ? AND direccion = 'entrada' ORDER BY id DESC LIMIT 1")->execute([$p['message_id'], $lead]);
    if ($res['ok']) $n++;
  }
  return [$n, $reb];
}
