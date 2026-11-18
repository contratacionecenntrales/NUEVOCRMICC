<?php
/**
 * ICC CRM · Automatizaciones y Embudos (fase 4). Motor propio de flujos (sin
 * n8n ni Make): un flujo = un disparador + un arbol de pasos + un objetivo.
 *
 * Como se ejecuta: el latido (cron) lee los cambios del CRM (clientes nuevos,
 * cambios de fase, presupuestos, citas) y deja eventos en una cola; procesa la
 * cola, revisa cada hora los «dias sin actividad» y avanza las inscripciones
 * cuyo siguiente paso ya toca.
 *
 * Normas: nunca se escribe a quien tiene «No contactar» o pidio la baja; un
 * flujo no puede tener bucles (se valida al guardar); al quitar un paso, quien
 * esperaba en el sale del flujo; opcion de enviar solo en horario laboral.
 */
require_once __DIR__ . '/motor_lib.php';

const FL_DISPARADORES = [
  'lead_nuevo' => 'Lead nuevo',
  'formulario' => 'Formulario web o integración',
  'fase_cambiada' => 'Cambio de fase',
  'etiqueta_anadida' => 'Etiqueta añadida',
  'presupuesto_registrado' => 'Presupuesto registrado',
  'presupuesto_aceptado' => 'Presupuesto aceptado',
  'presupuesto_rechazado' => 'Presupuesto rechazado',
  'cita_agendada' => 'Cita agendada',
  'cita_realizada' => 'Cita realizada',
  'cita_no_asistida' => 'Cita no asistida',
  'llamada_resultado' => 'Llamada con un resultado',
  'dias_sin_actividad' => 'Días sin actividad',
  'contrato_registrado' => 'Contrato registrado (alta en trámite)',
  'contrato_activado' => 'Contrato activado',
  'contrato_incidencia' => 'Contrato con incidencia o KO',
  'aniversario_contrato' => 'Aniversario del contrato (renovación)',
  'inscripcion_manual' => 'Inscripción manual',
];

/** Servicios de ICC (sector de contratos y presupuestos). */
const FL_SERVICIOS = ['energia' => 'Energía', 'telecomunicaciones' => 'Telefonía', 'alarmas' => 'Alarmas', 'seguros' => 'Seguros'];
/** Disparadores que se pueden filtrar por servicio. */
const FL_DISP_SERVICIO = ['presupuesto_registrado', 'presupuesto_aceptado', 'contrato_registrado', 'contrato_activado', 'contrato_incidencia', 'aniversario_contrato'];
/** Pie de los correos de las automatizaciones. */
const FL_FIRMA_ICC = "ICC Consultoría · Integral Connection Consulting\n100 % servicios · 100 % compañías · Reducción de costes garantizada\nintegralconnectionconsulting.es";

const FL_PASOS = [
  'correo' => ['✉️', 'Correo'],
  'esperar' => ['⏳', 'Esperar'],
  'esperar_cita' => ['📅', 'Esperar hasta antes de la cita'],
  'esperar_condicion' => ['⏱️', 'Esperar a que se cumpla'],
  'condicion' => ['🔀', 'Condición sí / no'],
  'ab' => ['🅰️', 'División A/B'],
  'tarea' => ['📋', 'Tarea para el gestor'],
  'llamada' => ['📞', 'Llamada del gestor'],
  'llamada_ia' => ['🤖', 'Llamada del agente de voz'],
  'whatsapp' => ['💬', 'WhatsApp'],
  'fase' => ['🎯', 'Cambiar de fase'],
  'etiqueta' => ['🏷️', 'Etiqueta'],
  'reparto' => ['🔄', 'Reparto rotativo'],
  'aviso' => ['🔔', 'Aviso'],
  'webhook' => ['🔗', 'Webhook saliente'],
];

const FL_FASES = ['lead_captado' => 'Lead', 'estudio_backoffice' => 'Auditoría', 'oferta_presentada' => 'Propuesta', 'en_cierre' => 'Negociación', 'cliente_activo' => 'Ganado', 'perdido' => 'Perdido'];

/* ===========================================================================
   PLANTILLAS: automatizaciones básicas, embudos lineales y embudos avanzados
   [nombre, grupo, disparador, cfg del disparador, pasos, objetivo, descripcion]
   ========================================================================= */
function fl_plantillas(): array {
  $c = function (string $a, string $t) { return ['tipo' => 'correo', 'cfg' => ['asunto' => $a, 'cuerpo' => $t]]; };
  $e = function (int $n, string $u) { return ['tipo' => 'esperar', 'cfg' => ['cantidad' => $n, 'unidad' => $u]]; };
  $w = function (string $m) { return ['tipo' => 'whatsapp', 'cfg' => ['mensaje' => $m]]; };
  $ll = function (int $min, string $m) { return ['tipo' => 'llamada', 'cfg' => ['en_minutos' => $min, 'motivo' => $m]]; };
  $ta = function (string $t, int $h = 24) { return ['tipo' => 'tarea', 'cfg' => ['titulo' => $t, 'en_horas' => $h]]; };
  $et = function (string $t) { return ['tipo' => 'etiqueta', 'cfg' => ['etiqueta' => $t]]; };
  // Cadena lineal: lista de pasos -> arbol.
  $lineal = function (array $pasos) {
    $nodos = [];
    foreach ($pasos as $i => $p) $nodos['p' . ($i + 1)] = $p + ['sig' => isset($pasos[$i + 1]) ? 'p' . ($i + 2) : null];
    return ['inicio' => 'p1', 'nodos' => $nodos];
  };
  $n = function (array $paso, array $salidas) { return $paso + $salidas; };
  return [
    /* ---------------- AUTOMATIZACIONES BÁSICAS DE LA OFICINA ---------------- */
    'lead_reparto' => ['Lead nuevo: reparto, bienvenida y llamada en 5 minutos', 'basica', 'lead_nuevo', [], $lineal([
      ['tipo' => 'reparto', 'cfg' => []],
      $c('Gracias por contactar con ICC', "Hola {{nombre}}:\n\nGracias por su interés. Soy {{gestor}}, de ICC Consultoría, y voy a ser su persona de contacto para todos sus servicios: luz, gas, telefonía, alarmas y seguros.\n\nEn breve le llamo para conocer su caso. Si lo prefiere, responda a este correo con una factura reciente o su póliza y empezamos a revisarla. Trabajamos con todas las compañías: si no encontramos una mejora real, se lo decimos y no cambia nada.\n\nUn saludo."),
      ['tipo' => 'llamada_ia', 'cfg' => ['motivo' => 'bienvenida', 'detalle' => 'Lead nuevo: llamar en minutos y pedir la factura']],
    ]), ['cita' => true], 'Asigna un gestor por turnos, envía la bienvenida y llama en minutos con el agente de voz (si está apagado, la llamada va a la agenda del gestor).'],
    'recordatorio_cita' => ['Recordatorio de cita 24 h y 2 h antes', 'basica', 'cita_agendada', [], $lineal([
      ['tipo' => 'esperar_cita', 'cfg' => ['horas' => 24]],
      $c('Le recordamos nuestra cita', "Hola {{nombre}}:\n\nLe recuerdo que tenemos una cita el {{fecha_cita}}. Si puede, tenga a mano sus últimas facturas (luz, gas, teléfono) y las pólizas que quiera revisar: así le damos respuesta en la misma reunión.\n\nSi necesita cambiarla, responda a este correo.\n\nUn saludo,\n{{gestor}}"),
      ['tipo' => 'esperar_cita', 'cfg' => ['horas' => 2]],
      $w('Hola {{nombre}}, le recuerdo nuestra cita de hoy ({{fecha_cita}}). ¡Hasta ahora! {{gestor}}, de ICC'),
    ]), [], 'Reduce las citas fallidas: correo el día antes y WhatsApp dos horas antes.'],
    'no_asistio' => ['No asistió: reprogramar', 'basica', 'cita_no_asistida', [], $lineal([
      $c('¿Buscamos otro momento?', "Hola {{nombre}}:\n\nNo pudimos vernos en la cita prevista. ¿Le viene bien que busquemos otro hueco esta semana? Responda con el día y la hora que mejor le encajen.\n\nUn saludo,\n{{gestor}}"),
      $ta('Reprogramar la cita no asistida', 24),
    ]), ['cita' => true], 'Correo para reprogramar y tarea para el gestor al día siguiente.'],
    'acuse_estudio' => ['Documentación recibida: estudio en 48 horas', 'basica', 'presupuesto_registrado', [], $lineal([
      $c('Hemos recibido su documentación', "Hola {{nombre}}:\n\nHemos recibido su documentación de {{servicio}}. Nuestro equipo la compara con todas las compañías del mercado y en 48 horas laborables le presentamos el estudio.\n\nSi no encontramos una mejora real, se lo diremos igual y no cambia nada.\n\nUn saludo,\n{{gestor}}"),
      $ta('Revisar que el estudio de {{servicio}} de {{empresa}} sale en 48 h', 24),
    ]), ['presupuesto_aceptado' => true], 'Confirma al cliente que tenemos su factura o póliza y recuerda al gestor el plazo de 48 horas.'],
    'seguimiento_presupuesto' => ['Seguimiento del estudio o propuesta', 'basica', 'presupuesto_registrado', [], $lineal([
      $e(3, 'dias'),
      $c('¿Ha podido revisar nuestra propuesta?', "Hola {{nombre}}:\n\n¿Ha podido revisar la propuesta de {{servicio}} que le enviamos? Si tiene cualquier duda, se la resuelvo en una llamada corta.\n\nUn saludo,\n{{gestor}}"),
      $e(3, 'dias'),
      $ll(0, 'Seguimiento de la propuesta de {{servicio}}'),
    ]), ['presupuesto_aceptado' => true], 'Correo a los 3 días y llamada a los 6 si no ha aceptado.'],
    'presupuesto_aceptado' => ['Propuesta aceptada: bienvenida y arranque', 'basica', 'presupuesto_aceptado', [], $lineal([
      $c('¡Bienvenido a ICC Consultoría!', "Hola {{nombre}}:\n\nGracias por confiar en nosotros. A partir de ahora nos encargamos de todo el cambio de {{servicio}}, sin cortes ni gestiones por su parte.\n\nEn los próximos días nuestro equipo de tramitación le pedirá la documentación necesaria. Cualquier duda, aquí estoy.\n\nUn saludo,\n{{gestor}}"),
      ['tipo' => 'fase', 'cfg' => ['estado' => 'cliente_activo']],
      $ta('Arranque de {{servicio}}: pedir documentación y tramitar', 24),
    ]), [], 'Bienvenida, pasa a «Ganado» y crea la tarea de tramitación.'],
    'contrato_tramite' => ['Contrato registrado: aviso de alta en trámite', 'basica', 'contrato_registrado', [], $lineal([
      $c('Su alta de {{servicio}} está en marcha', "Hola {{nombre}}:\n\nYa hemos tramitado su alta de {{servicio}}. No tiene que hacer nada más: nosotros hablamos con la compañía y le avisamos en cuanto esté activa.\n\nSi la compañía le llama para verificar los datos, puede confirmarlos con tranquilidad.\n\nUn saludo,\n{{gestor}}"),
      ['tipo' => 'aviso', 'cfg' => ['a' => 'gestor', 'mensaje' => 'Contrato de {{servicio}} registrado para {{empresa}}: vigila la activación.']],
    ]), [], 'Tranquiliza al cliente mientras la compañía activa el contrato.'],
    'contrato_activo' => ['Contrato activado: bienvenida y revisión de la primera factura', 'basica', 'contrato_activado', [], $lineal([
      $c('Su contrato de {{servicio}} ya está activo', "Hola {{nombre}}:\n\nSu contrato de {{servicio}} ya está activo. Cuando le llegue la primera factura, envíenosla respondiendo a este correo y comprobamos que todo está como acordamos.\n\nUn saludo,\n{{gestor}}"),
      $e(35, 'dias'),
      $c('¿Le ha llegado la primera factura?', "Hola {{nombre}}:\n\n¿Le ha llegado ya la primera factura de {{servicio}}? Envíenosla y la revisamos para confirmar que se aplica todo lo acordado.\n\nUn saludo,\n{{gestor}}"),
      $ta('Revisar la primera factura de {{servicio}} de {{empresa}}', 72),
    ]), [], 'Al activarse el contrato, bienvenida; a los 35 días pide la primera factura para comprobarla.'],
    'contrato_incidencia' => ['Contrato con incidencia: aviso inmediato', 'basica', 'contrato_incidencia', [], $lineal([
      ['tipo' => 'aviso', 'cfg' => ['a' => 'gestor', 'mensaje' => 'Incidencia en el contrato de {{servicio}} de {{empresa}}: revísala hoy.']],
      ['tipo' => 'aviso', 'cfg' => ['a' => 'direccion', 'mensaje' => 'Incidencia en un contrato de {{servicio}} ({{empresa}}).']],
      $ta('Resolver la incidencia del contrato de {{servicio}} y llamar al cliente', 2),
    ]), [], 'Avisa al gestor y a dirección y crea una tarea en 2 horas. No escribe al cliente: eso lo decide una persona.'],
    'renovacion_anual' => ['Renovación anual: revisar antes de que se renueve', 'basica', 'aniversario_contrato', ['dias' => 330], $lineal([
      $ta('Revisar la tarifa de {{servicio}} de {{empresa}} antes de la renovación', 24),
      $c('Revisamos su contrato de {{servicio}} antes de que se renueve', "Hola {{nombre}}:\n\nSe acerca el año de su contrato de {{servicio}}. Antes de que se renueve, volvemos a compararlo con todas las compañías para que siga pagando lo justo.\n\nSi quiere, envíenos su última factura y se lo confirmamos.\n\nUn saludo,\n{{gestor}}"),
      $e(5, 'dias'),
      $ll(0, 'Renovación anual de {{servicio}}: confirmar la revisión'),
    ]), [], 'Un mes antes del aniversario: tarea, correo y llamada para revisar la tarifa.'],
    'perdido_recuperar' => ['Perdido: recuperar a los 90 días', 'basica', 'fase_cambiada', ['fase' => 'perdido'], $lineal([
      $e(90, 'dias'),
      $c('¿Revisamos de nuevo sus costes?', "Hola {{nombre}}:\n\nHace unos meses hablamos sobre sus servicios. Los precios del mercado han cambiado: ¿le parece que revisemos de nuevo su luz, telefonía, alarma o seguros, sin compromiso?\n\nUn saludo,\n{{gestor}}"),
      $ta('Recontactar cliente perdido (90 días)', 48),
    ]), ['fase' => 'oferta_presentada'], 'A los 90 días vuelve a ofrecer el estudio.'],
    'informe_ahorro' => ['Informe de ahorro y «recomienda» (a los 60 días del contrato)', 'basica', 'contrato_activado', [], ['inicio' => 'p1', 'nodos' => [
      'p1' => $n($e(60, 'dias'), ['sig' => 'p2']),
      'p2' => $n(['tipo' => 'condicion', 'cfg' => ['tipo' => 'tiene_ahorro', 'valor' => '']], ['si' => 'p3', 'no' => 'p4']),
      'p3' => $n($c('Su ahorro con ICC Consultoría', "Hola {{nombre}}:\n\nYa llevamos dos meses con su nuevo contrato de {{servicio}}. Según el estudio que le hicimos, {{empresa}} ahorra {{ahorro}}.\n\nSi conoce a otra empresa que pueda estar pagando de más en luz, teléfono, alarma o seguros, responda a este correo con su contacto y le haremos el mismo estudio gratuito.\n\nGracias por su confianza,\n{{gestor}}"), ['sig' => 'p5']),
      'p4' => $n($c('¿Qué tal con su nuevo contrato?', "Hola {{nombre}}:\n\nYa llevamos dos meses con su nuevo contrato de {{servicio}}. ¿Le ha llegado todo como acordamos? Si quiere, revisamos juntos su última factura.\n\nY si conoce a otra empresa que pueda estar pagando de más, responda con su contacto y le haremos el estudio gratuito.\n\nUn saludo,\n{{gestor}}"), ['sig' => 'p5']),
      'p5' => $n($ta('Llamar a {{empresa}}: confirmar el ahorro y pedir un referido', 120), ['sig' => null]),
    ]], [], 'A los 60 días de activarse un contrato, le cuenta al cliente su ahorro real (de su estudio, nunca inventado), le pide un referido y deja una llamada al gestor.'],
    'resena_referidos' => ['Cliente activo: satisfacción y referidos', 'basica', 'fase_cambiada', ['fase' => 'cliente_activo'], $lineal([
      $e(30, 'dias'),
      $c('¿Qué tal todo?', "Hola {{nombre}}:\n\nYa llevamos un mes trabajando juntos. ¿Cómo lo está viendo? Si está contento, nos ayudaría mucho una recomendación: ¿conoce a otra empresa que pueda estar pagando de más en luz, teléfono, alarma o seguros?\n\nGracias,\n{{gestor}}"),
    ]), [], 'Al mes de ser cliente pide opinión y referidos.'],

    /* ---------------- EMBUDOS PROFESIONALES LINEALES (por servicio) ---------------- */
    'embudo_energia' => ['Embudo Energía: estudio de la factura de luz y gas', 'lineal', 'etiqueta_anadida', ['etiqueta' => ICC_INTERESES['energia']], $lineal([
      $e(1, 'dias'), // primero la bienvenida y la llamada del gestor
      $c('Su estudio de luz y gas', "Hola {{nombre}}:\n\nGracias por su interés. Para preparar el estudio de {{empresa}} solo necesitamos su última factura de luz (y de gas, si tiene). Puede enviarla respondiendo a este correo.\n\nRevisamos la potencia contratada, los excesos, la energía reactiva y la tarifa, y la comparamos con todas las compañías. Si no hay mejora real, se lo decimos y no cambia nada.\n\nUn saludo,\n{{gestor}}"),
      $e(2, 'dias'),
      $c('Lo que miramos en su factura de luz', "Hola {{nombre}}:\n\nPara que sepa qué revisamos: si la potencia contratada encaja con su consumo real, si paga recargos por excesos o por energía reactiva y si su tarifa sigue siendo la adecuada.\n\n¿Me envía su factura y se lo confirmo en 48 horas?\n\nUn saludo,\n{{gestor}}"),
      $e(2, 'dias'),
      $w('Hola {{nombre}}, soy {{gestor}} de ICC. ¿Me puede enviar por aquí una foto de su última factura de luz? En 48 h le digo si se puede mejorar.'),
      $e(1, 'dias'),
      $ll(0, 'Embudo Energía: pedir la factura por teléfono'),
      $e(5, 'dias'),
      $c('¿Cierro su estudio de energía?', "Hola {{nombre}}:\n\nNo quiero insistir más. Si ahora no es buen momento, lo dejamos aquí. Cuando quiera el estudio, responda a este correo con su factura.\n\nUn saludo,\n{{gestor}}"),
    ]), ['fase' => 'estudio_backoffice', 'cita' => true], 'Se activa con la etiqueta «Interés: Energía». Empieza al día siguiente de la bienvenida: correo, explicación, WhatsApp, llamada y cierre en 11 días. Termina al pasar a Auditoría o al agendar una reunión.'],
    'embudo_telefonia' => ['Embudo Telefonía: auditoría de líneas, fibra y centralita', 'lineal', 'etiqueta_anadida', ['etiqueta' => ICC_INTERESES['telecomunicaciones']], $lineal([
      $e(1, 'dias'), // primero la bienvenida y la llamada del gestor
      $c('Revisión de su telefonía', "Hola {{nombre}}:\n\nGracias por su interés. Para revisar la telefonía de {{empresa}} necesitamos su última factura de teléfono e internet. Puede enviarla respondiendo a este correo.\n\nMiramos líneas y servicios que ya no se usan, permanencias, y si conviene unificar fibra, móviles y centralita. Comparamos con todas las compañías.\n\nUn saludo,\n{{gestor}}"),
      $e(2, 'dias'),
      $c('Cuántas líneas usa de verdad', "Hola {{nombre}}:\n\nUna pregunta: ¿cuántas líneas móviles y fijas usan hoy en {{empresa}}? Es habitual pagar alguna que ya nadie usa.\n\nCon su factura se lo confirmo en 48 horas.\n\nUn saludo,\n{{gestor}}"),
      $e(2, 'dias'),
      $w('Hola {{nombre}}, soy {{gestor}} de ICC. ¿Me envía por aquí una foto de su factura de teléfono? Le digo en 48 h si se puede mejorar.'),
      $e(1, 'dias'),
      $ll(0, 'Embudo Telefonía: pedir la factura y número de líneas'),
      $e(5, 'dias'),
      $c('¿Cierro su revisión de telefonía?', "Hola {{nombre}}:\n\nSi ahora no es buen momento, lo dejamos aquí. Cuando quiera la revisión, responda a este correo con su factura.\n\nUn saludo,\n{{gestor}}"),
    ]), ['fase' => 'estudio_backoffice', 'cita' => true], 'Se activa con «Interés: Telefonía». Misma cadencia de 10 días, centrada en líneas, permanencias y centralita.'],
    'embudo_alarmas' => ['Embudo Alarmas: visita de seguridad', 'lineal', 'etiqueta_anadida', ['etiqueta' => ICC_INTERESES['alarmas']], $lineal([
      $e(1, 'dias'), // primero la bienvenida y la llamada del gestor
      $c('La seguridad de {{empresa}}', "Hola {{nombre}}:\n\nGracias por su interés. Revisamos la alarma de {{empresa}}: cuota, mantenimiento, conexión a central receptora y estado de los equipos, comparando con todas las compañías de seguridad.\n\n¿Le parece que pasemos a verla? Son 20 minutos y sin compromiso.\n\nUn saludo,\n{{gestor}}"),
      $e(2, 'dias'),
      $w('Hola {{nombre}}, soy {{gestor}} de ICC. ¿Qué día le viene bien que pasemos a revisar la alarma? Son 20 minutos.'),
      $e(2, 'dias'),
      $ll(0, 'Embudo Alarmas: agendar la visita de seguridad'),
      $e(5, 'dias'),
      $c('¿Dejamos la visita para más adelante?', "Hola {{nombre}}:\n\nSi ahora no es buen momento para la visita, lo dejamos aquí. Cuando quiera, responda a este correo y la agendamos.\n\nUn saludo,\n{{gestor}}"),
    ]), ['cita' => true], 'Se activa con «Interés: Alarmas». Objetivo: agendar la visita técnica.'],
    'embudo_seguros' => ['Embudo Seguros: revisión de pólizas antes del vencimiento', 'lineal', 'etiqueta_anadida', ['etiqueta' => ICC_INTERESES['seguros']], $lineal([
      $e(1, 'dias'), // primero la bienvenida y la llamada del gestor
      $c('Revisión de sus seguros', "Hola {{nombre}}:\n\nGracias por su interés. Para revisar los seguros de {{empresa}} necesitamos las pólizas que quiera comparar (responsabilidad civil, multirriesgo, vehículos…) y su fecha de vencimiento.\n\nComparamos coberturas y precio con todas las compañías. Si no hay mejora real, se lo decimos.\n\nUn saludo,\n{{gestor}}"),
      $e(3, 'dias'),
      $c('¿Cuándo vence su póliza?', "Hola {{nombre}}:\n\nLo más importante es la fecha de vencimiento: hay que revisar la póliza antes de que se renueve sola. ¿Me la indica?\n\nUn saludo,\n{{gestor}}"),
      $e(2, 'dias'),
      $ll(0, 'Embudo Seguros: pedir pólizas y fechas de vencimiento'),
      $e(5, 'dias'),
      $c('¿Lo vemos antes del vencimiento?', "Hola {{nombre}}:\n\nSi ahora no es el momento, lo dejamos aquí. Le recomendamos revisar sus pólizas un mes antes de que venzan: responda a este correo y lo hacemos.\n\nUn saludo,\n{{gestor}}"),
    ]), ['fase' => 'estudio_backoffice', 'cita' => true], 'Se activa con «Interés: Seguros». Pide pólizas y vencimientos para revisarlas a tiempo.'],
    'lead_magnet' => ['Embudo Lead Magnet → diagnóstico gratuito', 'lineal', 'formulario', [], $lineal([
      ['tipo' => 'reparto', 'cfg' => []],
      $c('Su diagnóstico de costes', "Hola {{nombre}}:\n\nGracias por descargar la guía. El siguiente paso más útil es un diagnóstico gratuito: en 48 horas le decimos si está pagando de más en luz, gas, teléfono, alarma o seguros.\n\n¿Me envía una factura reciente respondiendo a este correo?\n\nUn saludo,\n{{gestor}}"),
      $e(2, 'dias'),
      $c('¿Le preparo el diagnóstico?', "Hola {{nombre}}:\n\n¿Le preparo el diagnóstico gratuito de {{empresa}}? Solo necesito una factura.\n\nUn saludo,\n{{gestor}}"),
      $e(3, 'dias'),
      $ll(0, 'Lead magnet: ofrecer el diagnóstico gratuito por teléfono'),
    ]), ['fase' => 'estudio_backoffice'], 'Para el formulario de tu web: reparto, diagnóstico, recordatorio y llamada.'],
    'rescate_omnicanal' => ['Rescate omnicanal 2-24-48 h', 'lineal', 'llamada_resultado', ['resultado' => 'no_contesta'], $lineal([
      $e(2, 'horas'),
      $w('Hola {{nombre}}, le he llamado hace un rato de ICC Consultoría por la revisión de sus facturas. ¿Cuándo le viene bien que le llame?'),
      $e(22, 'horas'),
      $c('Intenté localizarle', "Hola {{nombre}}:\n\nIntenté llamarle ayer. ¿Me dice qué día y hora le viene mejor?\n\nUn saludo,\n{{gestor}}"),
      $e(24, 'horas'),
      $ll(0, 'Rescate 48 h: último intento por teléfono'),
    ]), ['cita' => true], 'Cuando una llamada no contesta: WhatsApp a las 2 h, correo a las 24 h y llamada a las 48 h.'],

    /* ---------------- EMBUDOS PROFESIONALES AVANZADOS (ramas, A/B, esperas) ---------------- */
    'auditoria_integral' => ['Auditoría integral 100 % servicios (ramas y A/B)', 'avanzado', 'etiqueta_anadida', ['etiqueta' => ICC_INTERESES['integral']], ['inicio' => 'p1', 'nodos' => [
      'p1' => $n(['tipo' => 'reparto', 'cfg' => []], ['sig' => 'p0']),
      'p0' => $n($e(1, 'dias'), ['sig' => 'p2']),
      'p2' => $n(['tipo' => 'condicion', 'cfg' => ['tipo' => 'tiene_email', 'valor' => '']], ['si' => 'p3', 'no' => 'p10']),
      'p3' => $n($c('Auditoría de costes de {{empresa}}', "Hola {{nombre}}:\n\nGracias por su interés. En una sola revisión miramos luz, gas, telefonía, alarma y seguros de {{empresa}}, comparando con todas las compañías del mercado.\n\nSi no encontramos una mejora real, se lo decimos y no cambia nada. Si la hay, nos encargamos de todos los trámites con un único interlocutor.\n\n¿Le encaja una reunión de 15 minutos esta semana? Responda con el día y la hora que mejor le vengan.\n\nUn saludo,\n{{gestor}}"), ['sig' => 'p4']),
      'p4' => $n(['tipo' => 'esperar_condicion', 'cfg' => ['tipo' => 'cita_futura', 'valor' => '', 'max_horas' => 72]], ['si' => 'p5', 'no' => 'p6']),
      'p5' => $n($et('Auditoría agendada'), ['sig' => null]),
      'p6' => $n(['tipo' => 'ab', 'cfg' => []], ['a' => 'p7', 'b' => 'p8']),
      'p7' => $n($w('Hola {{nombre}}, soy {{gestor}} de ICC. ¿Le va bien una reunión de 15 minutos para revisar luz, teléfono, alarma y seguros de {{empresa}}?'), ['sig' => 'p9']),
      'p8' => $n($ll(0, 'Auditoría integral: agendar la reunión de 15 minutos'), ['sig' => 'p9']),
      'p9' => $n($e(4, 'dias'), ['sig' => 'p11']),
      'p10' => $n($ll(0, 'Auditoría integral (sin correo): llamar y pedir un correo de contacto'), ['sig' => null]),
      'p11' => $n(['tipo' => 'condicion', 'cfg' => ['tipo' => 'fase', 'valor' => 'lead_captado']], ['si' => 'p12', 'no' => null]),
      'p12' => $n($c('¿Lo dejamos para más adelante?', "Hola {{nombre}}:\n\nNo quiero insistir. Si ahora no es buen momento para la auditoría, lo dejamos aquí. Cuando quiera, responda a este correo con cualquier factura y empezamos por ahí.\n\nUn saludo,\n{{gestor}}"), ['sig' => 'p13']),
      'p13' => $n($ta('Auditoría integral sin respuesta: decidir si seguir o pasar a perdido', 24), ['sig' => null]),
    ]], ['cita' => true], 'Se activa con «Interés: Auditoría integral» (lo pone el Motor cuando alguien responde con interés). Al día siguiente: si no tiene correo, llamada; si lo tiene, propuesta de reunión y espera 72 h a que agende; si no, A/B entre WhatsApp y llamada; a los 4 días, último correo y decisión del gestor.'],
    'venta_cruzada' => ['Venta cruzada: completar el 100 % de servicios', 'avanzado', 'fase_cambiada', ['fase' => 'cliente_activo'], ['inicio' => 'p1', 'nodos' => [
      'p1' => $n($e(45, 'dias'), ['sig' => 'p2']),
      'p2' => $n(['tipo' => 'condicion', 'cfg' => ['tipo' => 'tiene_servicio', 'valor' => 'energia']], ['si' => 'p4', 'no' => 'p3']),
      'p3' => $n($c('¿Revisamos también su luz?', "Hola {{nombre}}:\n\nYa nos encargamos de parte de sus servicios. ¿Le gustaría que revisáramos también su factura de luz y gas? Comparamos con todas las compañías y, si no hay mejora, se lo decimos.\n\nUn saludo,\n{{gestor}}"), ['sig' => 'p20']),
      'p4' => $n(['tipo' => 'condicion', 'cfg' => ['tipo' => 'tiene_servicio', 'valor' => 'telecomunicaciones']], ['si' => 'p6', 'no' => 'p5']),
      'p5' => $n($c('¿Y su telefonía?', "Hola {{nombre}}:\n\nYa revisamos su energía. ¿Le gustaría que hiciéramos lo mismo con la telefonía e internet de {{empresa}}? Con una factura le decimos si se puede mejorar.\n\nUn saludo,\n{{gestor}}"), ['sig' => 'p20']),
      'p6' => $n(['tipo' => 'condicion', 'cfg' => ['tipo' => 'tiene_servicio', 'valor' => 'alarmas']], ['si' => 'p8', 'no' => 'p7']),
      'p7' => $n($c('La seguridad de {{empresa}}', "Hola {{nombre}}:\n\nYa llevamos su energía y su telefonía. ¿Revisamos también la alarma? Comparamos cuota, mantenimiento y conexión a central receptora con todas las compañías.\n\nUn saludo,\n{{gestor}}"), ['sig' => 'p20']),
      'p8' => $n(['tipo' => 'condicion', 'cfg' => ['tipo' => 'tiene_servicio', 'valor' => 'seguros']], ['si' => 'p10', 'no' => 'p9']),
      'p9' => $n($c('¿Cuándo vence su seguro?', "Hola {{nombre}}:\n\nNos falta un servicio para completar su revisión: los seguros. ¿Me indica cuándo vence su póliza principal y la revisamos antes de que se renueve?\n\nUn saludo,\n{{gestor}}"), ['sig' => 'p20']),
      'p10' => $n($c('Gracias por confiar en ICC', "Hola {{nombre}}:\n\nYa nos encargamos de todos sus servicios. Gracias por su confianza. Si conoce a otra empresa a la que podamos ayudar, nos encantará atenderla igual de bien.\n\nUn saludo,\n{{gestor}}"), ['sig' => null]),
      'p20' => $n($e(5, 'dias'), ['sig' => 'p21']),
      'p21' => $n(['tipo' => 'condicion', 'cfg' => ['tipo' => 'cita_futura', 'valor' => '']], ['si' => null, 'no' => 'p22']),
      'p22' => $n($ll(0, 'Venta cruzada: ofrecer el siguiente servicio'), ['sig' => null]),
    ]], ['cita' => true], 'A los 45 días de ser cliente, mira qué servicios le faltan (energía → telefonía → alarmas → seguros) y ofrece el siguiente; si los tiene todos, pide referidos. Llamada a los 5 días si no ha agendado.'],
    'setter_bant' => ['Setter BANT (urgencia, A/B y espera a la respuesta)', 'avanzado', 'formulario', [], ['inicio' => 'p1', 'nodos' => [
      'p1' => ['tipo' => 'reparto', 'cfg' => [], 'sig' => 'p2'],
      'p2' => ['tipo' => 'condicion', 'cfg' => ['tipo' => 'etiqueta', 'valor' => 'Urgente'], 'si' => 'p3', 'no' => 'p4'],
      'p3' => ['tipo' => 'llamada', 'cfg' => ['en_minutos' => 5, 'motivo' => 'Urgente: llamar ya y cualificar (gasto, decisor, necesidad, plazo)'], 'sig' => null],
      'p4' => ['tipo' => 'ab', 'cfg' => [], 'a' => 'p5', 'b' => 'p6'],
      'p5' => ['tipo' => 'correo', 'cfg' => ['asunto' => 'Cuatro preguntas rápidas', 'cuerpo' => "Hola {{nombre}}:\n\nPara preparar su estudio, ¿me responde a cuatro preguntas?\n1. ¿Cuánto pagan al mes entre luz, gas, teléfono, alarma y seguros?\n2. ¿Quién decide estos contratos?\n3. ¿Qué es lo que más le preocupa?\n4. ¿Para cuándo le gustaría tenerlo resuelto?\n\nGracias,\n{{gestor}}"], 'sig' => 'p7'],
      'p6' => ['tipo' => 'whatsapp', 'cfg' => ['mensaje' => 'Hola {{nombre}}, soy {{gestor}} de ICC Consultoría. ¿Le va bien una llamada de 5 minutos para ver sus facturas?'], 'sig' => 'p7'],
      'p7' => ['tipo' => 'esperar_condicion', 'cfg' => ['tipo' => 'cita_futura', 'valor' => '', 'max_horas' => 48], 'si' => null, 'no' => 'p8'],
      'p8' => ['tipo' => 'llamada', 'cfg' => ['en_minutos' => 0, 'motivo' => 'Setter: no ha respondido en 48 h'], 'sig' => null],
    ]], ['cita' => true], 'Formulario web: si está etiquetado «Urgente», llamada en 5 min; si no, A/B correo o WhatsApp y espera 48 h a que agende.'],
    'reactivacion' => ['Reactivación de la base dormida con A/B', 'avanzado', 'dias_sin_actividad', ['dias' => 120], ['inicio' => 'p1', 'nodos' => [
      'p1' => ['tipo' => 'ab', 'cfg' => [], 'a' => 'p2', 'b' => 'p3'],
      'p2' => ['tipo' => 'correo', 'cfg' => ['asunto' => '¿Sigue pagando lo mismo?', 'cuerpo' => "Hola {{nombre}}:\n\nHace tiempo que no hablamos. ¿Sigue pagando lo mismo de luz, teléfono, alarma y seguros? Le revisamos las facturas gratis, con todas las compañías.\n\nUn saludo,\n{{gestor}}"], 'sig' => 'p4'],
      'p3' => ['tipo' => 'correo', 'cfg' => ['asunto' => 'Una pregunta, {{nombre}}', 'cuerpo' => "Hola {{nombre}}:\n\n¿Le interesaría saber si {{empresa}} puede pagar menos en sus servicios este año? Responda «sí» y le preparo el estudio.\n\nUn saludo,\n{{gestor}}"], 'sig' => 'p4'],
      'p4' => ['tipo' => 'esperar', 'cfg' => ['cantidad' => 5, 'unidad' => 'dias'], 'sig' => 'p5'],
      'p5' => ['tipo' => 'tarea', 'cfg' => ['titulo' => 'Reactivación: llamar si no ha respondido', 'en_horas' => 24], 'sig' => null],
    ]], ['cita' => true], 'Contactos sin actividad en 120 días: A/B de dos correos y tarea de llamada.'],
  ];
}

/** Crea (si no existen) los flujos de esas plantillas y, si se pide, los activa. Devuelve [creados, activos]. */
function fl_instalar(array $claves, ?int $uid, bool $activar = true): array {
  $db = icc_db();
  $pl = fl_plantillas();
  $creados = 0; $activos = 0;
  foreach ($claves as $clave) {
    if (!isset($pl[$clave])) continue;
    $st = $db->prepare('SELECT id, estado FROM flujos WHERE plantilla = ? ORDER BY id LIMIT 1');
    $st->execute([$clave]);
    $f = $st->fetch();
    if (!$f) {
      [$nombre, , $disp, $cfg, $pasos, $obj] = $pl[$clave];
      $db->prepare("INSERT INTO flujos (nombre, descripcion, disparador, disparador_cfg, filtro, pasos, objetivo, plantilla, token_entrada, creado_por, estado) VALUES (?, ?, ?, ?, '{}', ?, ?, ?, ?, ?, ?)")
        ->execute([$nombre, mb_substr((string)($pl[$clave][6] ?? ''), 0, 500), $disp, json_encode($cfg ?: new stdClass(), JSON_UNESCAPED_UNICODE), json_encode($pasos, JSON_UNESCAPED_UNICODE),
          json_encode($obj ?: new stdClass()), $clave, $disp === 'formulario' ? bin2hex(random_bytes(16)) : null, $uid, $activar ? 'activo' : 'borrador']);
      $creados++;
      if ($activar) $activos++;
    } elseif ($activar) {
      if ($f['estado'] !== 'activo') $db->prepare("UPDATE flujos SET estado = 'activo' WHERE id = ?")->execute([$f['id']]);
      $activos++;
    }
  }
  return [$creados, $activos];
}

/* ===========================================================================
   VALIDACION DEL ARBOL
   ========================================================================= */
function fl_salidas(array $n): array {
  $t = $n['tipo'] ?? '';
  if (in_array($t, ['condicion', 'esperar_condicion'], true)) return ['si' => $n['si'] ?? null, 'no' => $n['no'] ?? null];
  if ($t === 'ab') return ['a' => $n['a'] ?? null, 'b' => $n['b'] ?? null];
  return ['sig' => $n['sig'] ?? null];
}

/** Devuelve el arbol limpio o lanza un error legible (bucles, referencias rotas, tipos). */
function fl_validar(array $p): array {
  $nodos = (array)($p['nodos'] ?? []);
  $inicio = (string)($p['inicio'] ?? '');
  if (!$nodos) throw new InvalidArgumentException('El flujo necesita al menos un paso.');
  if (count($nodos) > 60) throw new InvalidArgumentException('Como mucho 60 pasos por flujo.');
  if (!isset($nodos[$inicio])) throw new InvalidArgumentException('Falta el primer paso.');
  $limpio = [];
  foreach ($nodos as $id => $n) {
    if (!preg_match('/^[a-z0-9_]{1,20}$/i', (string)$id)) throw new InvalidArgumentException('Identificador de paso no válido.');
    $tipo = (string)($n['tipo'] ?? '');
    if (!isset(FL_PASOS[$tipo])) throw new InvalidArgumentException('Tipo de paso desconocido: ' . $tipo);
    $cfg = is_array($n['cfg'] ?? null) ? $n['cfg'] : [];
    if ($tipo === 'correo' && (trim((string)($cfg['asunto'] ?? '')) === '' || trim((string)($cfg['cuerpo'] ?? '')) === '')) throw new InvalidArgumentException('Un correo necesita asunto y texto.');
    if ($tipo === 'webhook' && !preg_match('#^https://#i', (string)($cfg['url'] ?? ''))) throw new InvalidArgumentException('El webhook necesita una dirección https://.');
    if ($tipo === 'fase' && !isset(FL_FASES[$cfg['estado'] ?? ''])) throw new InvalidArgumentException('Elige la fase del paso «Cambiar de fase».');
    $limpio[$id] = ['tipo' => $tipo, 'cfg' => $cfg];
    foreach (fl_salidas($n) as $k => $dest) {
      if ($dest !== null && $dest !== '' && !isset($nodos[$dest])) throw new InvalidArgumentException('Un paso apunta a otro que no existe.');
      $limpio[$id][$k] = $dest === '' ? null : $dest;
    }
  }
  // Sin bucles: DFS con colores.
  $color = [];
  $visitar = function ($id) use (&$visitar, &$color, $limpio) {
    if (($color[$id] ?? 0) === 1) throw new InvalidArgumentException('El flujo tiene un bucle: un paso vuelve a uno anterior.');
    if (($color[$id] ?? 0) === 2) return;
    $color[$id] = 1;
    foreach (fl_salidas($limpio[$id]) as $d) if ($d) $visitar($d);
    $color[$id] = 2;
  };
  $visitar($inicio);
  // Pasos sueltos (no alcanzables) fuera.
  foreach (array_keys($limpio) as $id) if (!isset($color[$id])) unset($limpio[$id]);
  return ['inicio' => $inicio, 'nodos' => $limpio];
}

/* ===========================================================================
   UTILIDADES
   ========================================================================= */
function fl_registro(int $flujo, ?int $insc, ?int $cliente, string $paso, string $accion, string $detalle = ''): void {
  icc_db()->prepare('INSERT INTO flujo_registro (flujo_id, inscripcion_id, cliente_id, paso_id, accion, detalle) VALUES (?, ?, ?, ?, ?, ?)')
    ->execute([$flujo, $insc, $cliente, $paso, $accion, mb_substr($detalle, 0, 500)]);
}

function fl_evento(string $tipo, ?int $clienteId, array $datos = []): void {
  icc_db()->prepare('INSERT INTO flujo_eventos (tipo, cliente_id, datos) VALUES (?, ?, ?)')->execute([$tipo, $clienteId, json_encode($datos, JSON_UNESCAPED_UNICODE)]);
}

function fl_etiquetar(int $clienteId, string $etiqueta, bool $quitar = false): void {
  $etiqueta = mb_substr(trim($etiqueta), 0, 60);
  if ($etiqueta === '') return;
  if ($quitar) { icc_db()->prepare('DELETE FROM cliente_etiquetas WHERE cliente_id = ? AND etiqueta = ?')->execute([$clienteId, $etiqueta]); return; }
  $st = icc_db()->prepare('INSERT IGNORE INTO cliente_etiquetas (cliente_id, etiqueta) VALUES (?, ?)');
  $st->execute([$clienteId, $etiqueta]);
  if ($st->rowCount()) fl_evento('etiqueta_anadida', $clienteId, ['etiqueta' => $etiqueta]);
}

function fl_tiene_etiqueta(int $clienteId, string $etiqueta): bool {
  $st = icc_db()->prepare('SELECT 1 FROM cliente_etiquetas WHERE cliente_id = ? AND etiqueta = ?');
  $st->execute([$clienteId, $etiqueta]);
  return (bool)$st->fetchColumn();
}

function fl_email_cliente(array $c): string {
  return (string)($c['decisor_email'] ?: ($c['contacto_email'] ?: $c['email']));
}

function fl_proxima_cita(int $clienteId): ?array {
  $st = icc_db()->prepare("SELECT * FROM citas WHERE cliente_id = ? AND CONCAT(fecha, ' ', hora_inicio) >= NOW() AND estado IN ('programada','confirmada','reprogramada') ORDER BY fecha, hora_inicio LIMIT 1");
  $st->execute([$clienteId]);
  return $st->fetch() ?: null;
}

function fl_variables(array $c, string $texto, array $ctx = []): string {
  $db = icc_db();
  $gestor = $c['comercial_id'] ? trim((string)$db->query('SELECT CONCAT(nombre, " ", COALESCE(apellidos, "")) FROM usuarios WHERE id = ' . (int)$c['comercial_id'])->fetchColumn()) : 'el equipo de ICC';
  $cita = fl_proxima_cita((int)$c['id']);
  $st = $db->prepare('SELECT id, sector FROM presupuestos WHERE cliente_id = ? ORDER BY id DESC LIMIT 1');
  $st->execute([$c['id']]);
  $p = $st->fetch();
  $serv = (string)($ctx['servicio'] ?? '');
  if ($serv === '') {
    $st = $db->prepare('SELECT sector FROM contratos WHERE cliente_id = ? ORDER BY id DESC LIMIT 1');
    $st->execute([$c['id']]);
    $serv = (string)($st->fetchColumn() ?: ($p['sector'] ?? ''));
  }
  $nombre = trim((string)$c['contacto_nombre']) !== '' ? strtok(trim((string)$c['contacto_nombre']), ' ') : trim((string)$c['razon_social']);
  return strtr($texto, [
    '{{nombre}}' => $nombre ?: 'buenos días', '{{empresa}}' => (string)$c['razon_social'], '{{gestor}}' => $gestor,
    '{{fecha_cita}}' => $cita ? date('d/m/Y', strtotime($cita['fecha'])) . ' a las ' . substr($cita['hora_inicio'], 0, 5) : 'la fecha acordada',
    '{{presupuesto}}' => $p ? 'presupuesto #' . $p['id'] . ' (' . $p['sector'] . ')' : 'nuestra propuesta',
    '{{ahorro}}' => (function () use ($c) { if (!function_exists('rt_ahorro_cliente')) require_once __DIR__ . '/retorno_lib.php'; $a = rt_ahorro_cliente((int)$c['id']); return $a > 0 ? number_format($a, 0, ',', '.') . ' € al año' : 'lo que se acordó en su estudio'; })(),
    '{{servicio}}' => mb_strtolower(FL_SERVICIOS[$serv] ?? 'sus servicios'), '{{web}}' => 'integralconnectionconsulting.es',
    '{{importe}}' => (float)$c['valor_estimado'] > 0 ? number_format((float)$c['valor_estimado'], 0, ',', '.') . ' €' : 'el importe acordado',
  ]);
}

function fl_en_horario(): bool {
  $d = icc_madrid();
  return icc_es_laborable($d) && $d->format('H:i') >= '09:00' && $d->format('H:i') < '19:00';
}

function fl_siguiente_horario(): string {
  $d = icc_madrid();
  if (!icc_es_laborable($d) || $d->format('H:i') >= '19:00') $d = icc_siguiente_laborable('09:00', $d);
  elseif ($d->format('H:i') < '09:00') $d = $d->setTime(9, 0);
  return $d->setTimezone(new DateTimeZone(date_default_timezone_get()))->format('Y-m-d H:i:s');
}

/** El cliente ya tiene contratado ese servicio con ICC (contrato vigente o presupuesto cerrado). */
function fl_tiene_servicio(int $clienteId, string $sector): bool {
  $db = icc_db();
  $st = $db->prepare("SELECT 1 FROM contratos WHERE cliente_id = ? AND sector = ? AND estado NOT IN ('ko','decomisionado') LIMIT 1");
  $st->execute([$clienteId, $sector]);
  if ($st->fetchColumn()) return true;
  $st = $db->prepare("SELECT 1 FROM presupuestos WHERE cliente_id = ? AND sector = ? AND estado = 'cerrado' LIMIT 1");
  $st->execute([$clienteId, $sector]);
  return (bool)$st->fetchColumn();
}

function fl_condicion(array $c, array $cfg): bool {
  $db = icc_db();
  $v = (string)($cfg['valor'] ?? '');
  switch ((string)($cfg['tipo'] ?? '')) {
    case 'etiqueta': return fl_tiene_etiqueta((int)$c['id'], $v);
    case 'fase': return $c['estado'] === $v;
    case 'cita_futura': return fl_proxima_cita((int)$c['id']) !== null;
    case 'presupuesto_aceptado':
      $st = $db->prepare("SELECT 1 FROM presupuestos WHERE cliente_id = ? AND estado = 'cerrado'");
      $st->execute([$c['id']]);
      return (bool)$st->fetchColumn();
    case 'tiene_telefono': return (string)($c['contacto_telefono'] ?: $c['telefono']) !== '';
    case 'tiene_email': return fl_email_cliente($c) !== '';
    case 'origen': return $c['origen'] === $v;
    case 'tiene_servicio': return fl_tiene_servicio((int)$c['id'], $v);
    case 'tiene_ahorro': if (!function_exists('rt_ahorro_cliente')) require_once __DIR__ . '/retorno_lib.php'; return rt_ahorro_cliente((int)$c['id']) > 0;
    case 'interes_servicio': return fl_tiene_etiqueta((int)$c['id'], ICC_INTERESES[$v] ?? ('Interés: ' . $v));
  }
  return false;
}

/** Objetivo cumplido: fase, reunion real (no creada por el flujo), presupuesto aceptado o etiqueta. */
function fl_objetivo(array $c, array $obj, array $insc): bool {
  if (!$obj) return false;
  if (!empty($obj['fase']) && $c['estado'] === $obj['fase']) return true;
  if (!empty($obj['etiqueta']) && fl_tiene_etiqueta((int)$c['id'], (string)$obj['etiqueta'])) return true;
  if (!empty($obj['presupuesto_aceptado']) && fl_condicion($c, ['tipo' => 'presupuesto_aceptado'])) return true;
  if (!empty($obj['cita'])) {
    $st = icc_db()->prepare("SELECT 1 FROM citas WHERE cliente_id = ? AND tipo IN ('reunion','visita','firma') AND created_at >= ? AND estado IN ('programada','confirmada','realizada','reprogramada')
                             AND (notas IS NULL OR notas NOT LIKE 'Automatización:%')");
    $st->execute([$c['id'], $insc['created_at']]);
    if ($st->fetchColumn()) return true;
  }
  return false;
}

function fl_reparto(?int $excepto = null): ?int {
  $g = array_values(array_map(function ($x) { return (int)$x['id']; }, eq_gestores_activos_fl()));
  if (!$g) return null;
  sort($g);
  $ult = (int)icc_ajuste('flujo_reparto_ultimo', '0');
  $sig = $g[0];
  foreach ($g as $id) if ($id > $ult) { $sig = $id; break; }
  icc_ajuste_guardar('flujo_reparto_ultimo', (string)$sig);
  return $sig;
}

function eq_gestores_activos_fl(): array {
  return icc_db()->query("SELECT id FROM usuarios WHERE bloqueado = 0 AND rol IN ('comercial','jefe_de_equipo') ORDER BY id")->fetchAll();
}

/* ===========================================================================
   EJECUCION DE PASOS
   ========================================================================= */
/**
 * Avanza una inscripcion hasta la siguiente espera (o el final).
 * Devuelve el numero de pasos ejecutados.
 */
function fl_avanzar(array $insc, array $flujo): int {
  $db = icc_db();
  $pasos = json_decode((string)$flujo['pasos'], true) ?: ['nodos' => []];
  $obj = json_decode((string)$flujo['objetivo'], true) ?: [];
  $iid = (int)$insc['id']; $fid = (int)$flujo['id']; $cid = (int)$insc['cliente_id'];
  $datos = json_decode((string)$insc['datos'], true) ?: [];
  $fin = function (string $estado, string $motivo, string $paso = '') use ($db, $iid, $fid, $cid) {
    $db->prepare('UPDATE flujo_inscripciones SET estado = ?, motivo = ?, paso_id = ?, proximo = NULL WHERE id = ?')->execute([$estado, mb_substr($motivo, 0, 255), $paso, $iid]);
    fl_registro($fid, $iid, $cid, $paso, $estado, $motivo);
  };
  $paso = (string)$insc['paso_id'];
  $hechos = 0;
  while ($hechos < 25) {
    $c = eq_cliente_fl($cid);
    if (!$c) { $fin('salido', 'El cliente ya no existe'); return $hechos; }
    if ((int)$c['no_contactar'] === 1 || (fl_email_cliente($c) !== '' && icc_excluido(fl_email_cliente($c)))) { $fin('salido', 'No contactar / baja', $paso); return $hechos; }
    if (fl_objetivo($c, $obj, $insc)) { $fin('objetivo', 'Objetivo cumplido', $paso); return $hechos; }
    if ($paso === '' || !isset($pasos['nodos'][$paso])) { $fin('terminado', 'Fin del flujo', $paso); return $hechos; }
    $n = $pasos['nodos'][$paso];
    $cfg = $n['cfg'] ?? [];
    $sig = $n['sig'] ?? null;
    $esperar = null; // fecha hasta la que se espera en ESTE paso antes de pasar a $sig
    switch ($n['tipo']) {
      case 'correo':
      case 'whatsapp':
        if (!empty($flujo['solo_horario']) && !fl_en_horario()) { $esperar = fl_siguiente_horario(); $sig = $paso; break; }
        if ($n['tipo'] === 'correo') {
          $email = fl_email_cliente($c);
          if ($email === '') { fl_registro($fid, $iid, $cid, $paso, 'omitido', 'Sin correo'); break; }
          $cuenta = motor_cuenta();
          if (!$cuenta) { fl_registro($fid, $iid, $cid, $paso, 'error', 'Sin buzón de salida configurado'); break; }
          $gestor = $c['comercial_id'] ? $db->query('SELECT CONCAT(nombre, " ", COALESCE(apellidos, "")) n, email FROM usuarios WHERE id = ' . (int)$c['comercial_id'])->fetch() : null;
          $baja = motor_enlace_baja(['id' => 'c' . $cid, 'email' => $email]);
          $texto = fl_variables($c, (string)$cfg['cuerpo'], $datos) . "\n\n--\n" . trim(($gestor ? trim($gestor['n']) . "\n" : '') . FL_FIRMA_ICC)
            . "\n\nSi no quiere recibir más correos nuestros: " . $baja;
          $r = icc_smtp_enviar($cuenta + ['nombre' => $gestor ? trim($gestor['n']) . ' · ICC' : ($cuenta['nombre'] ?? 'ICC')], [
            'para' => $email, 'asunto' => fl_variables($c, (string)$cfg['asunto'], $datos), 'texto' => $texto, 'responder_a' => $gestor['email'] ?? null,
            'cabeceras' => ['List-Unsubscribe: <' . $baja . '>', 'List-Unsubscribe-Post: List-Unsubscribe=One-Click'],
          ]);
          fl_registro($fid, $iid, $cid, $paso, $r['ok'] ? 'correo' : 'error', $r['ok'] ? fl_variables($c, (string)$cfg['asunto'], $datos) : $r['error']);
          if ($r['ok']) { icc_nota_cliente($cid, 'Automatización «' . $flujo['nombre'] . '» · correo: ' . fl_variables($c, (string)$cfg['asunto'], $datos), 'flujo'); $db->prepare('UPDATE clientes SET ultima_actividad = NOW() WHERE id = ?')->execute([$cid]); }
        } else {
          $tel = preg_replace('/\D/', '', (string)($c['contacto_telefono'] ?: $c['telefono']));
          if ($tel === '' || !$c['comercial_id']) { fl_registro($fid, $iid, $cid, $paso, 'omitido', 'Sin teléfono o sin gestor'); break; }
          if (strlen($tel) === 9) $tel = '34' . $tel;
          $msg = fl_variables($c, (string)$cfg['mensaje'], $datos);
          $h = eq_primer_hueco_fl((int)$c['comercial_id']);
          eq_crear_cita_fl((int)$c['comercial_id'], $cid, 'seguimiento', $h[0], $h[1], 10, $c['razon_social'], "Automatización: WhatsApp listo para enviar\n\n$msg\n\nAbrir: https://wa.me/$tel?text=" . rawurlencode($msg));
          fl_registro($fid, $iid, $cid, $paso, 'whatsapp', 'Tarea con el mensaje listo para ' . $tel);
        }
        break;
      case 'esperar':
        $mult = ['minutos' => 60, 'horas' => 3600, 'dias' => 86400][$cfg['unidad'] ?? 'dias'] ?? 86400;
        if (empty($datos['espera_' . $paso])) {
          $datos['espera_' . $paso] = 1;
          $esperar = date('Y-m-d H:i:s', time() + max(0, (int)($cfg['cantidad'] ?? 1)) * $mult);
          $sig = $paso;
        } else unset($datos['espera_' . $paso]);
        break;
      case 'esperar_cita':
        $cita = fl_proxima_cita($cid);
        if (!$cita) { fl_registro($fid, $iid, $cid, $paso, 'omitido', 'Sin cita futura'); break; }
        $t = strtotime($cita['fecha'] . ' ' . $cita['hora_inicio']) - (int)($cfg['horas'] ?? 24) * 3600;
        if ($t > time() + 30 && empty($datos['espera_' . $paso])) { $datos['espera_' . $paso] = 1; $esperar = date('Y-m-d H:i:s', $t); $sig = $paso; }
        else unset($datos['espera_' . $paso]);
        break;
      case 'esperar_condicion':
        if (fl_condicion($c, $cfg)) { unset($datos['limite_' . $paso]); $sig = $n['si'] ?? null; fl_registro($fid, $iid, $cid, $paso, 'condicion', 'Se cumple'); break; }
        if (empty($datos['limite_' . $paso])) $datos['limite_' . $paso] = time() + max(1, (int)($cfg['max_horas'] ?? 48)) * 3600;
        if (time() >= $datos['limite_' . $paso]) { unset($datos['limite_' . $paso]); $sig = $n['no'] ?? null; fl_registro($fid, $iid, $cid, $paso, 'condicion', 'No a tiempo'); break; }
        $esperar = date('Y-m-d H:i:s', min($datos['limite_' . $paso], time() + 3600)); // se revisa cada hora
        $sig = $paso;
        break;
      case 'condicion':
        $ok = fl_condicion($c, $cfg);
        $sig = $ok ? ($n['si'] ?? null) : ($n['no'] ?? null);
        fl_registro($fid, $iid, $cid, $paso, 'condicion', $ok ? 'Sí' : 'No');
        break;
      case 'ab':
        $var = $insc['variante'] ?: (random_int(0, 1) ? 'A' : 'B');
        $db->prepare('UPDATE flujo_inscripciones SET variante = ? WHERE id = ?')->execute([$var, $iid]);
        $insc['variante'] = $var;
        $sig = $var === 'A' ? ($n['a'] ?? null) : ($n['b'] ?? null);
        fl_registro($fid, $iid, $cid, $paso, 'ab', 'Variante ' . $var);
        break;
      case 'llamada_ia':
        // Agente de voz (Vapi). Fuera de su horario espera; si no puede llamar, la llamada pasa al gestor.
        if (function_exists('voz_o_persona')) {
          if (voz_config()['activo'] && !voz_en_horario() && empty($datos['voz_espera_' . $paso])) { $datos['voz_espera_' . $paso] = 1; $esperar = fl_siguiente_horario(); $sig = $paso; break; }
          unset($datos['voz_espera_' . $paso]);
          $mot = in_array($cfg['motivo'] ?? '', ['bienvenida', 'pedir_factura', 'seguimiento', 'presentar_estudio', 'recuperar'], true) ? $cfg['motivo'] : 'bienvenida';
          fl_registro($fid, $iid, $cid, $paso, 'llamada', voz_o_persona($c, $mot, fl_variables($c, (string)($cfg['detalle'] ?? ''), $datos), 'Automatización «' . $flujo['nombre'] . '»'));
        } else fl_registro($fid, $iid, $cid, $paso, 'omitido', 'Agente de voz no disponible');
        break;
      case 'tarea':
      case 'llamada':
        $g = $c['comercial_id'] ? (int)$c['comercial_id'] : null;
        if (!$g) { fl_registro($fid, $iid, $cid, $paso, 'omitido', 'Sin gestor'); break; }
        if ($n['tipo'] === 'llamada') {
          $min = (int)($cfg['en_minutos'] ?? 0);
          $cuando = icc_madrid('+' . max(0, $min) . ' minutes');
          $libre = $min <= 15 && icc_es_laborable($cuando) && $cuando->format('H:i') >= '09:00' && $cuando->format('H:i') < '19:00';
          $h = $libre ? [$cuando->format('Y-m-d'), $cuando->format('H:i')] : eq_primer_hueco_fl($g);
          eq_crear_cita_fl($g, $cid, 'llamada', $h[0], $h[1], 15, $c['razon_social'], 'Automatización: ' . fl_variables($c, (string)($cfg['motivo'] ?? 'Llamada'), $datos), (string)($c['contacto_telefono'] ?: $c['telefono']), fl_email_cliente($c));
          icc_notificar($g, 'cuenta', 'flujo_llamada', 'Llamada a ' . $c['razon_social'] . ' el ' . $h[0] . ' a las ' . $h[1] . ' (' . $flujo['nombre'] . ').', $cid);
          fl_registro($fid, $iid, $cid, $paso, 'llamada', $h[0] . ' ' . $h[1]);
        } else {
          $d = icc_madrid('+' . max(0, (int)($cfg['en_horas'] ?? 24)) . ' hours');
          while (!icc_es_laborable($d)) $d = $d->modify('+1 day');
          $h = eq_huecos_fl($g, $d->format('Y-m-d'));
          eq_crear_cita_fl($g, $cid, 'seguimiento', $d->format('Y-m-d'), $h ?: '10:00', 15, $c['razon_social'], 'Automatización: ' . fl_variables($c, (string)($cfg['titulo'] ?? 'Tarea'), $datos));
          fl_registro($fid, $iid, $cid, $paso, 'tarea', fl_variables($c, (string)($cfg['titulo'] ?? ''), $datos));
        }
        break;
      case 'fase':
        $nuevo = (string)($cfg['estado'] ?? '');
        if (isset(FL_FASES[$nuevo]) && $nuevo !== $c['estado']) {
          $db->prepare('UPDATE clientes SET estado = ? WHERE id = ?')->execute([$nuevo, $cid]);
          $db->prepare('INSERT INTO historial_estado (cliente_id, estado_anterior, estado_nuevo, cambiado_por) VALUES (?, ?, ?, NULL)')->execute([$cid, $c['estado'], $nuevo]);
          icc_nota_cliente($cid, 'Automatización «' . $flujo['nombre'] . '»: pasa a ' . FL_FASES[$nuevo] . '.', 'flujo');
        }
        fl_registro($fid, $iid, $cid, $paso, 'fase', FL_FASES[$nuevo] ?? $nuevo);
        break;
      case 'etiqueta':
        fl_etiquetar($cid, (string)($cfg['etiqueta'] ?? ''), !empty($cfg['quitar']));
        fl_registro($fid, $iid, $cid, $paso, 'etiqueta', (!empty($cfg['quitar']) ? 'Quita ' : 'Pone ') . ($cfg['etiqueta'] ?? ''));
        break;
      case 'reparto':
        if (!$c['comercial_id'] || !empty($cfg['forzar'])) {
          $g = fl_reparto();
          if ($g) { $db->prepare('UPDATE clientes SET comercial_id = ? WHERE id = ?')->execute([$g, $cid]); icc_notificar($g, 'cuenta', 'reparto', 'Te ha tocado un contacto nuevo: ' . $c['razon_social'] . '.', $cid); }
          fl_registro($fid, $iid, $cid, $paso, 'reparto', $g ? 'Gestor #' . $g : 'Sin gestores');
        } else fl_registro($fid, $iid, $cid, $paso, 'reparto', 'Ya tenía gestor');
        break;
      case 'aviso':
        $a = ($cfg['a'] ?? 'gestor') === 'direccion'
          ? array_map('intval', $db->query("SELECT id FROM usuarios WHERE rol IN ('coordinador','admin','super_admin') AND bloqueado = 0")->fetchAll(PDO::FETCH_COLUMN))
          : ($c['comercial_id'] ? [(int)$c['comercial_id']] : []);
        foreach ($a as $u) icc_notificar($u, 'cuenta', 'flujo_aviso', mb_substr(fl_variables($c, (string)($cfg['mensaje'] ?? 'Aviso de una automatización'), $datos), 0, 480), $cid);
        fl_registro($fid, $iid, $cid, $paso, 'aviso', count($a) . ' personas');
        break;
      case 'webhook':
        $url = (string)($cfg['url'] ?? '');
        $host = (string)parse_url($url, PHP_URL_HOST);
        if (!preg_match('#^https://#i', $url) || !icc_web_host_publico($host)) { fl_registro($fid, $iid, $cid, $paso, 'error', 'Webhook no permitido'); break; }
        $carga = ['evento' => 'flujo', 'flujo' => $flujo['nombre'], 'paso' => $paso, 'cliente' => ['id' => $cid, 'empresa' => $c['razon_social'], 'nombre' => $c['contacto_nombre'], 'email' => fl_email_cliente($c),
          'telefono' => $c['contacto_telefono'] ?: $c['telefono'], 'fase' => $c['estado'], 'sector' => $c['sector']]];
        $ch = curl_init($url);
        curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 10, CURLOPT_FOLLOWLOCATION => false,
          CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'X-ICC-Firma: ' . icc_firma('webhook|' . json_encode($carga))], CURLOPT_POSTFIELDS => json_encode($carga, JSON_UNESCAPED_UNICODE)]);
        curl_exec($ch);
        $cod = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        fl_registro($fid, $iid, $cid, $paso, $cod >= 200 && $cod < 300 ? 'webhook' : 'error', 'HTTP ' . $cod);
        break;
    }
    $hechos++;
    if ($esperar !== null) {
      $db->prepare('UPDATE flujo_inscripciones SET paso_id = ?, proximo = ?, datos = ? WHERE id = ?')->execute([$paso, $esperar, json_encode($datos), $iid]);
      return $hechos;
    }
    $paso = (string)($sig ?? '');
    $db->prepare('UPDATE flujo_inscripciones SET paso_id = ?, proximo = NOW(), datos = ? WHERE id = ?')->execute([$paso, json_encode($datos), $iid]);
  }
  return $hechos;
}

function eq_cliente_fl(int $id): ?array {
  $st = icc_db()->prepare('SELECT * FROM clientes WHERE id = ?');
  $st->execute([$id]);
  return $st->fetch() ?: null;
}

function eq_huecos_fl(int $gestor, string $fecha): ?string {
  if (function_exists('eq_huecos')) { $h = eq_huecos($gestor, $fecha, 15); return $h[0] ?? null; }
  return null;
}

function eq_primer_hueco_fl(int $gestor): array {
  if (function_exists('eq_primer_hueco') && ($h = eq_primer_hueco($gestor, 15))) return $h;
  $d = icc_siguiente_laborable('10:00');
  return [$d->format('Y-m-d'), '10:00'];
}

function eq_crear_cita_fl(int $gestor, ?int $clienteId, string $tipo, string $fecha, string $hora, int $dur, string $nombre, string $notas, string $tel = '', string $email = ''): int {
  icc_db()->prepare("INSERT INTO citas (comercial_id, cliente_id, tipo, cliente_nombre, telefono, email, sector, fecha, hora_inicio, hora_fin, estado, notas)
                     VALUES (?, ?, ?, ?, ?, ?, 'energia', ?, ?, ?, 'programada', ?)")
    ->execute([$gestor, $clienteId, $tipo, mb_substr($nombre, 0, 200), mb_substr($tel, 0, 30), mb_substr($email, 0, 190), $fecha, substr($hora, 0, 5) . ':00', date('H:i:s', strtotime("$fecha $hora") + $dur * 60), mb_substr($notas, 0, 4000)]);
  return (int)icc_db()->lastInsertId();
}

/* ===========================================================================
   INSCRIPCIONES Y EVENTOS
   ========================================================================= */
function fl_inscribir(array $flujo, int $clienteId, string $origen = 'disparador', array $datos = []): ?int {
  $db = icc_db();
  $c = eq_cliente_fl($clienteId);
  if (!$c || (int)$c['no_contactar'] === 1) return null;
  $st = $db->prepare("SELECT 1 FROM flujo_inscripciones WHERE flujo_id = ? AND cliente_id = ? AND estado = 'en_curso'");
  $st->execute([$flujo['id'], $clienteId]);
  if ($st->fetchColumn()) return null;
  $f = json_decode((string)$flujo['filtro'], true) ?: [];
  if (!empty($f['origen']) && $c['origen'] !== $f['origen']) return null;
  if (!empty($f['sector']) && mb_stripos((string)$c['sector'], (string)$f['sector']) === false) return null;
  $pasos = json_decode((string)$flujo['pasos'], true);
  $db->prepare('INSERT INTO flujo_inscripciones (flujo_id, cliente_id, paso_id, proximo, datos) VALUES (?, ?, ?, NOW(), ?)')->execute([$flujo['id'], $clienteId, $pasos['inicio'] ?? '', json_encode($datos ?: new stdClass(), JSON_UNESCAPED_UNICODE)]);
  $id = (int)$db->lastInsertId();
  fl_registro((int)$flujo['id'], $id, $clienteId, '', 'inscrito', $origen);
  return $id;
}

/** Lee los cambios del CRM y deja eventos en la cola. */
function fl_detectar_cambios(): int {
  $db = icc_db();
  $n = 0;
  // Fases (y leads nuevos) desde historial_estado.
  $wm = (int)icc_ajuste('flujo_wm_historial', '-1');
  if ($wm < 0) { icc_ajuste_guardar('flujo_wm_historial', (string)(int)$db->query('SELECT COALESCE(MAX(id), 0) FROM historial_estado')->fetchColumn()); $wm = -2; }
  if ($wm >= 0) {
    $st = $db->prepare('SELECT id, cliente_id, estado_anterior, estado_nuevo FROM historial_estado WHERE id > ? ORDER BY id LIMIT 500');
    $st->execute([$wm]);
    foreach ($st->fetchAll() as $h) {
      if ($h['estado_anterior'] === null && $h['estado_nuevo'] === 'lead_captado') fl_evento('lead_nuevo', (int)$h['cliente_id']);
      else fl_evento('fase_cambiada', (int)$h['cliente_id'], ['fase' => $h['estado_nuevo'], 'antes' => $h['estado_anterior']]);
      if ($h['estado_nuevo'] === 'perdido') {
        $p = $db->prepare('SELECT 1 FROM presupuestos WHERE cliente_id = ? AND estado <> "cerrado"');
        $p->execute([$h['cliente_id']]);
        if ($p->fetchColumn()) fl_evento('presupuesto_rechazado', (int)$h['cliente_id']);
      }
      $wm = (int)$h['id']; $n++;
    }
    icc_ajuste_guardar('flujo_wm_historial', (string)$wm);
  }
  // Clientes nuevos sin historial (altas a mano).
  $wmc = (int)icc_ajuste('flujo_wm_clientes', '-1');
  if ($wmc < 0) icc_ajuste_guardar('flujo_wm_clientes', (string)(int)$db->query('SELECT COALESCE(MAX(id), 0) FROM clientes')->fetchColumn());
  else {
    $st = $db->prepare('SELECT c.id FROM clientes c WHERE c.id > ? AND NOT EXISTS (SELECT 1 FROM historial_estado h WHERE h.cliente_id = c.id) ORDER BY c.id LIMIT 500');
    $st->execute([$wmc]);
    foreach ($st->fetchAll(PDO::FETCH_COLUMN) as $cid) { fl_evento('lead_nuevo', (int)$cid); $n++; }
    icc_ajuste_guardar('flujo_wm_clientes', (string)max($wmc, (int)$db->query('SELECT COALESCE(MAX(id), 0) FROM clientes')->fetchColumn()));
  }
  // Presupuestos y citas: altas y cambios de estado.
  foreach (['presupuestos' => 'presupuesto', 'citas' => 'cita', 'contratos' => 'contrato'] as $tabla => $ent) {
    $clave = 'flujo_wm_' . $tabla;
    $desde = (string)icc_ajuste($clave, '');
    $ahora = (string)$db->query('SELECT NOW()')->fetchColumn();
    if ($desde === '') { icc_ajuste_guardar($clave, $ahora); continue; }
    $st = $db->prepare("SELECT * FROM $tabla WHERE updated_at >= ? OR created_at >= ? LIMIT 1000");
    $st->execute([$desde, $desde]);
    foreach ($st->fetchAll() as $r) {
      if (!$r['cliente_id']) continue;
      $v = $db->prepare('SELECT estado FROM flujo_vistos WHERE entidad = ? AND entidad_id = ?');
      $v->execute([$ent, $r['id']]);
      $antes = $v->fetchColumn();
      if ($antes === $r['estado']) continue;
      $db->prepare('INSERT INTO flujo_vistos (entidad, entidad_id, estado) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE estado = VALUES(estado)')->execute([$ent, $r['id'], $r['estado']]);
      $cid = (int)$r['cliente_id'];
      if ($ent === 'presupuesto') {
        if ($antes === false && $r['created_at'] >= $desde) fl_evento('presupuesto_registrado', $cid, ['presupuesto_id' => (int)$r['id'], 'sector' => $r['sector']]);
        if ($r['estado'] === 'cerrado') fl_evento('presupuesto_aceptado', $cid, ['presupuesto_id' => (int)$r['id'], 'sector' => $r['sector']]);
      } elseif ($ent === 'contrato') {
        $d = ['contrato_id' => (int)$r['id'], 'sector' => $r['sector']];
        // Un contrato cargado ya activo (p. ej. importado) no es un alta en tramite ni una activacion de hoy.
        $reciente = empty($r['fecha_activacion']) || $r['fecha_activacion'] >= date('Y-m-d', strtotime('-30 days'));
        if ($antes === false && $r['created_at'] >= $desde && in_array($r['estado'], ['tramitado', 'en_distribuidora'], true)) fl_evento('contrato_registrado', $cid, $d);
        if (in_array($r['estado'], ['ok', 'verificado'], true) && !in_array($antes, ['ok', 'verificado'], true) && $reciente) fl_evento('contrato_activado', $cid, $d);
        if (in_array($r['estado'], ['ko', 'incidencias'], true)) fl_evento('contrato_incidencia', $cid, $d + ['estado' => $r['estado']]);
      } else {
        if ($antes === false && $r['created_at'] >= $desde && strpos((string)$r['notas'], 'Automatización:') !== 0) fl_evento('cita_agendada', $cid, ['cita_id' => (int)$r['id'], 'tipo' => $r['tipo']]);
        if ($r['estado'] === 'realizada') fl_evento('cita_realizada', $cid, ['cita_id' => (int)$r['id'], 'tipo' => $r['tipo']]);
        if ($r['estado'] === 'ko') fl_evento($r['tipo'] === 'llamada' ? 'llamada_resultado' : 'cita_no_asistida', $cid, ['cita_id' => (int)$r['id'], 'tipo' => $r['tipo'], 'resultado' => 'no_contesta']);
      }
      $n++;
    }
    icc_ajuste_guardar($clave, $ahora);
  }
  return $n;
}

/** Procesa la cola: cada evento inscribe en los flujos activos cuyo disparador encaja. */
function fl_procesar_eventos(): int {
  $db = icc_db();
  $flujos = $db->query("SELECT * FROM flujos WHERE estado = 'activo'")->fetchAll();
  $n = 0;
  foreach ($db->query('SELECT * FROM flujo_eventos WHERE procesado = 0 ORDER BY id LIMIT 300')->fetchAll() as $e) {
    $datos = json_decode((string)$e['datos'], true) ?: [];
    foreach ($flujos as $f) {
      if ($f['disparador'] !== $e['tipo'] || !$e['cliente_id']) continue;
      $cfg = json_decode((string)$f['disparador_cfg'], true) ?: [];
      if ($e['tipo'] === 'fase_cambiada' && !empty($cfg['fase']) && ($datos['fase'] ?? '') !== $cfg['fase']) continue;
      if ($e['tipo'] === 'etiqueta_anadida' && !empty($cfg['etiqueta']) && mb_strtolower($datos['etiqueta'] ?? '') !== mb_strtolower($cfg['etiqueta'])) continue;
      if (in_array($e['tipo'], ['cita_agendada', 'cita_realizada'], true) && !empty($cfg['tipo_cita']) && ($datos['tipo'] ?? '') !== $cfg['tipo_cita']) continue;
      if ($e['tipo'] === 'formulario' && (int)($datos['flujo_id'] ?? 0) !== (int)$f['id']) continue;
      if (in_array($e['tipo'], FL_DISP_SERVICIO, true) && !empty($cfg['sector']) && ($datos['sector'] ?? '') !== $cfg['sector']) continue;
      if (fl_inscribir($f, (int)$e['cliente_id'], $e['tipo'], isset($datos['sector']) ? ['servicio' => (string)$datos['sector']] : [])) $n++;
    }
    $db->prepare('UPDATE flujo_eventos SET procesado = 1 WHERE id = ?')->execute([$e['id']]);
  }
  return $n;
}

/** Cada hora: clientes sin actividad desde hace N dias (segun cada flujo). */
function fl_dias_sin_actividad(): int {
  $db = icc_db();
  $n = 0;
  foreach ($db->query("SELECT * FROM flujos WHERE estado = 'activo' AND disparador = 'dias_sin_actividad'")->fetchAll() as $f) {
    $dias = max(1, (int)((json_decode((string)$f['disparador_cfg'], true) ?: [])['dias'] ?? 30));
    $st = $db->prepare("SELECT c.id FROM clientes c WHERE c.no_contactar = 0 AND COALESCE(c.ultima_actividad, c.updated_at) < NOW() - INTERVAL $dias DAY
                        AND NOT EXISTS (SELECT 1 FROM flujo_inscripciones i WHERE i.flujo_id = ? AND i.cliente_id = c.id AND i.created_at >= NOW() - INTERVAL $dias DAY) LIMIT 200");
    $st->execute([$f['id']]);
    foreach ($st->fetchAll(PDO::FETCH_COLUMN) as $cid) if (fl_inscribir($f, (int)$cid, 'dias_sin_actividad')) $n++;
  }
  // Aniversario del contrato: N dias desde la activacion (por defecto 330, un mes antes de renovar).
  foreach ($db->query("SELECT * FROM flujos WHERE estado = 'activo' AND disparador = 'aniversario_contrato'")->fetchAll() as $f) {
    $cfg = json_decode((string)$f['disparador_cfg'], true) ?: [];
    $dias = max(1, (int)($cfg['dias'] ?? 330));
    $sector = isset(FL_SERVICIOS[$cfg['sector'] ?? '']) ? $cfg['sector'] : '';
    $st = $db->prepare("SELECT ct.cliente_id, ct.sector FROM contratos ct JOIN clientes c ON c.id = ct.cliente_id
                        WHERE c.no_contactar = 0 AND ct.estado IN ('ok','verificado','en_distribuidora') AND (? = '' OR ct.sector = ?)
                          AND COALESCE(ct.fecha_activacion, ct.fecha_alta) BETWEEN CURDATE() - INTERVAL " . ($dias + 30) . " DAY AND CURDATE() - INTERVAL $dias DAY
                          AND NOT EXISTS (SELECT 1 FROM flujo_inscripciones i WHERE i.flujo_id = ? AND i.cliente_id = ct.cliente_id AND i.created_at >= NOW() - INTERVAL 300 DAY) LIMIT 200");
    $st->execute([$sector, $sector, $f['id']]);
    foreach ($st->fetchAll() as $r) if (fl_inscribir($f, (int)$r['cliente_id'], 'aniversario_contrato', ['servicio' => (string)$r['sector']])) $n++;
  }
  return $n;
}

/** Bloque del cron. */
function fl_tick(): string {
  if ((string)icc_ajuste('flujos_activo', '1') !== '1') return 'Automatizaciones apagadas.';
  $cambios = fl_detectar_cambios();
  $insc = fl_procesar_eventos();
  if ((string)icc_ajuste('flujo_ultima_inactividad', '') < date('Y-m-d H', time() - 3600)) {
    $insc += fl_dias_sin_actividad();
    icc_ajuste_guardar('flujo_ultima_inactividad', date('Y-m-d H'));
  }
  $db = icc_db();
  $pasos = 0;
  $flujos = [];
  foreach ($db->query("SELECT i.* FROM flujo_inscripciones i JOIN flujos f ON f.id = i.flujo_id WHERE i.estado = 'en_curso' AND f.estado = 'activo' AND i.proximo <= NOW() ORDER BY i.proximo LIMIT 100")->fetchAll() as $i) {
    if (!isset($flujos[$i['flujo_id']])) { $st = $db->prepare('SELECT * FROM flujos WHERE id = ?'); $st->execute([$i['flujo_id']]); $flujos[$i['flujo_id']] = $st->fetch(); }
    $pasos += fl_avanzar($i, $flujos[$i['flujo_id']]);
  }
  return "$cambios cambios · $insc inscritos · $pasos pasos";
}

/** Estadisticas de un flujo. */
function fl_estadisticas(int $id): array {
  $db = icc_db();
  $st = $db->prepare("SELECT SUM(estado = 'en_curso') en_curso, SUM(estado = 'terminado') terminados, SUM(estado = 'objetivo') objetivo, SUM(estado = 'salido') salidos, COUNT(*) total,
                      SUM(variante = 'A') a, SUM(variante = 'B') b, SUM(variante = 'A' AND estado = 'objetivo') a_obj, SUM(variante = 'B' AND estado = 'objetivo') b_obj FROM flujo_inscripciones WHERE flujo_id = ?");
  $st->execute([$id]);
  $r = array_map('intval', $st->fetch());
  $st = $db->prepare("SELECT accion, COUNT(*) n FROM flujo_registro WHERE flujo_id = ? GROUP BY accion");
  $st->execute([$id]);
  $acc = [];
  foreach ($st->fetchAll() as $x) $acc[$x['accion']] = (int)$x['n'];
  $st = $db->prepare("SELECT paso_id, COUNT(*) n FROM flujo_inscripciones WHERE flujo_id = ? AND estado = 'en_curso' GROUP BY paso_id");
  $st->execute([$id]);
  $porPaso = [];
  foreach ($st->fetchAll() as $x) $porPaso[$x['paso_id']] = (int)$x['n'];
  $cerrados = $r['terminados'] + $r['objetivo'] + $r['salidos'];
  return $r + ['conversion' => $r['total'] ? round($r['objetivo'] / $r['total'] * 100, 1) : 0, 'correos' => $acc['correo'] ?? 0, 'tareas' => ($acc['tarea'] ?? 0) + ($acc['llamada'] ?? 0) + ($acc['whatsapp'] ?? 0),
    'errores' => $acc['error'] ?? 0, 'por_paso' => $porPaso, 'cerrados' => $cerrados];
}
