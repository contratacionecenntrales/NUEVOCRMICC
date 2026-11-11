# Labs Command Center 360™ — Next-Gen

Sala de Ventas, Pipeline IA, Agenda comercial y Ficha 360° con configurador de
asistentes de IA. Todo con datos reales de la base de datos de Hostalia; se
instala con el zip, sin tocar SQL (la base de datos se actualiza sola, versión 11).

## Módulos

| Módulo | Qué hace |
|---|---|
| **Sala de Ventas** | Métricas en directo (contratos firmados, valor ganado, pipeline abierto y ponderado, citas, leads, puntos), latencia real del servidor, asistentes IA en producción, llamadas de voz y WhatsApp del periodo. Ranking con podio y puntos, actividad en directo y ticker, objetivo del mes con proyección, análisis automático y embudo de la red. Hoy · Semana · Mes y **Modo TV** a pantalla completa. Se refresca cada 15 s. |
| **Pipeline IA** | Kanban con arrastrar y soltar: Lead entrante → Cualificación → Demo IA → Propuesta → Negociación → Firmado → Despliegue → En producción (y Perdido, con motivo). Tarjetas con temperatura del lead, temporizador de SLA por fase, soluciones (Voz · WhatsApp · Embudo), valor y acciones rápidas (llamar, WhatsApp, agendar, mover, ficha). Previsión ponderada, motivos de pérdida y pipeline por comercial. En el móvil se mueve con el botón «Mover». |
| **Agenda Comercial** | Vistas día (rejilla por horas), semana (arrastra una cita a otro día), equipo, mes y lista. KPIs: citas de hoy, semana y mes, asistencia, pasadas sin cerrar y realizadas sin resumen. Filtros por persona, tipo, estado y sector. Desde la cita: confirmar, realizada con resumen, no asistió, cancelar, reprogramar, **recordatorio por WhatsApp** y **llamada de prueba del asistente**. |
| **Ficha 360°** | Al pulsar un contacto (o una tarjeta del pipeline, o una cita): resumen (fase, SLA, valor, temperatura, estado del asistente, próxima cita) y **timeline omnicanal** con llamadas y sus transcripciones, WhatsApp, correos, notas, firma, citas e IA, filtrable por canal. **Documentos & Firma**: genera el contrato en un clic, lo envía por SMS o email y sigue en tiempo real Emitido → Enviado → Abierto → Firmado. **Configurador IA**: asistente de voz (número, modelo GPT-4o, voz, system prompt, transferencias, «📞 Probar llamada ahora»), bot de WhatsApp (canal, base de conocimiento RAG con PDFs y vista previa del chat) y embudos con plantillas y **webhook propio del cliente**. Botón **⚡ Desplegar & Aprovisionar** con consola de logs en directo. |

Puntos del ranking: cita realizada 2 · demo 3 · propuesta 5 · firma 15.

## Centro de Formación y Recursos

Formaciones y dosieres que **se ven dentro del CRM** y se descargan:

- **Visor propio**: PDF página a página (con miniaturas, zoom, pantalla
  completa y salto de página), presentaciones **PPTX** dibujadas diapositiva a
  diapositiva (textos, imágenes, formas, tablas y colores del tema), **vídeo**
  MP4/WEBM con velocidad de reproducción e **imágenes**. Word y Excel se
  descargan. Atajos: ← → para pasar, + − para el zoom, F pantalla completa,
  Esc para cerrar.
- Los archivos se leen con un **enlace firmado** de 4 horas, ligado a la
  persona y al archivo: el vídeo empieza al momento y un PDF grande se abre sin
  bajarlo entero (peticiones por partes). Si la cuenta se suspende, el enlace
  deja de valer.
- **Formación**: sección Formación o Dosier, categoría, nivel, destacados,
  portadas automáticas (primera página, fotograma del vídeo o miniatura de la
  presentación), páginas y duración. Cada persona lleva su **progreso**
  («Continúa donde lo dejaste», en curso, completados) y dirección ve en las
  estadísticas cuántos lo vieron, descargaron, empezaron y completaron.
- Subida de varios archivos a la vez arrastrándolos (hasta 1 GB por archivo,
  por trozos). Las portadas de los dosieres que ya había se generan solas la
  primera vez que dirección abre el centro.
- El lector de PDF (pdf.js 3.11, licencia Apache 2.0) va en `vendor/pdfjs/`,
  sin depender de internet. Se usa con la evaluación de código desactivada.

### Documentos corporativos y ruta de onboarding

- El zip puede traer documentos en `api/semilla/` (carpeta cerrada al
  público). La primera petición los pasa al almacén privado con su ficha
  completa (sección, categoría, nivel, descripción, portada, páginas y
  texto), y la carpeta se borra. Si ya existía uno con el mismo nombre
  (traído del CRM anterior) se completa en vez de duplicarse; volver a subir
  el zip no duplica ni hace reaparecer lo que se haya borrado.
- **Rutas de formación**: los recursos con la misma ruta forman un itinerario
  por pasos (orden editable), con el progreso de cada persona, el siguiente
  paso recomendado y el tiempo estimado. Incluida: «Onboarding Account
  Manager» sustituida por la organización actual (ver abajo).
- **Cómo se ordena el Centro de Recursos**: arriba, la **Formación de inicio
  del Gestor Comercial** (Manual del Gestor Comercial → Rutina diaria del
  Account Manager → Kit de Venta Rápido → AI Act); después, **Material para
  el cliente** (Presentación Corporativa y Packs de Servicios), con botón de
  presentar a pantalla completa; y al final la biblioteca con el resto, sin
  repetir lo de arriba. Lo destacado sale primero en su categoría.
- **Buscar dentro de los documentos**: el texto de cada PDF se indexa (al
  cargarlo o al subirlo) y la tarjeta enseña el fragmento que coincide.

## Copias de seguridad y papelera

- **Copia diaria automática**: cada día, tras la primera visita, el servidor
  hace una copia cifrada (AES-256-GCM) de la base de datos y los documentos en
  la carpeta privada (fuera de la web). Una vez por semana es completa, con los
  dosieres. Se guardan las 14 últimas y siempre la última completa. Se ven,
  descargan y restauran en *Cumplimiento RGPD → Copias* (restaurar: cuenta
  raíz). Para que se haga aunque nadie entre, programa en Plesk la URL de la
  tarea diaria que aparece en esa misma pantalla.
- **Papelera (30 días)**: borrar un contacto (con historial, comentarios,
  documentos, configuración IA y movimientos del pipeline), un documento de una
  ficha o un recurso del Centro de Recursos no lo elimina en el acto. Queda en
  la papelera con sus archivos y se recupera con un clic desde *Contactos →
  Papelera* o *Centro de Recursos → Papelera*: restaurar contactos es de
  administración; documentos y recursos, también jefatura. Las citas y los
  contratos vuelven a unirse al contacto. A los 30 días se purga sola; admin
  puede eliminar antes. El derecho al olvido (RGPD) no pasa por la papelera y
  borra también lo que hubiera de esa persona en ella.

## Contactos con IA

- **Puntuación IA** (0-100) y temperatura de cada contacto: fase, actividad
  reciente, seguimiento, datos completos, señales de las etiquetas y valor. Es
  la misma que usan el pipeline y la ficha.
- **Siguiente paso** recomendado en cada fila (llamar por seguimiento vencido,
  primer contacto, agendar demo, enviar propuesta, reactivar…).
- **Radar IA**: leads calientes sin seguimiento, seguimientos vencidos, SLA
  vencido, nuevos de la semana, inactivos y fichas incompletas; cada uno
  filtra la lista con un clic. **Mejores oportunidades** del momento.
- Filtros visuales: leads/clientes, temperatura, fase del pipeline, estado,
  etiqueta, seguimiento y responsable; orden por actividad, puntuación, valor,
  seguimiento, alta o nombre; vista en tabla o tarjetas (tarjetas en el móvil)
  con llamada, WhatsApp y correo directos.

### Desactivar o eliminar contactos

- **Desactivar / Reactivar** (botón en la ficha): cualquiera que pueda editar
  el contacto. Un contacto desactivado sale de la lista, el pipeline, las
  cifras y el radar, pero conserva todo; se ve en el filtro «Desactivados».
  Queda anotado en el historial.
- **Eliminar** (solo el rol administrador: admin y coordinación): pide
  escribir ELIMINAR. Borra la ficha, el historial, los comentarios, los
  documentos (también del almacén) y la configuración de IA; las citas y los
  contratos se conservan sin contacto. Queda en el registro de auditoría.

## Proceso de venta: llamadas, embudo y agenda

Método del Kit de Venta Rápido: **la llamada vende la visita, la visita vende
el sistema**. Todo queda registrado en el CRM.

- **Tipo de negocio** en cada contacto (Clínica estética, Clínica dental,
  Centro médico, Despacho legal / asesoría, Inmobiliaria, Hotel, Restauración,
  Gimnasio… o el texto que se escriba). Al importar o actualizar, el CRM lo
  deduce del nombre y las etiquetas si falta.
- **Quien decide**: nombre, cargo, móvil directo y correo del gerente o
  responsable, en la ficha y en el modo llamada.
- **Empezar a llamar** (Contactos): elige sector y fase y el CRM prepara la
  cola: primero los seguimientos de hoy o vencidos, después por puntuación IA.
  Al guardar cada llamada pasa al siguiente.
- **Modo llamada** (desde la cola, la ficha, la tarjeta del embudo o el panel
  de venta), en tres columnas:
  1. con quién hablar (decisor, botones de llamada, llamadas anteriores);
  2. guion de su sector en 6 pasos (presentación, dato del sector, puente
     honesto, gancho, doble opción, confirmar), qué decir si coge recepción,
     preguntas BANT y respuestas a las 6 objeciones típicas;
  3. registro: con quién has hablado, resultado, notas, grabación y siguiente
     paso con fecha.
- **Grabación**: con el micrófono del ordenador o del móvil (llamada en
  altavoz) o adjuntando el audio de la grabadora del móvil (MP3, M4A, WAV,
  OGG, WEBM). Solo se guarda si se marca «He avisado de que la llamada se
  graba». Se escucha desde la ficha y el panel de venta con un enlace firmado.
- **Al guardar**, el servidor anota la llamada en el historial, pone el
  próximo paso, crea la cita en la agenda y avanza la fase si toca (nunca la
  hace retroceder): cita → Demo, pide propuesta → Propuesta, cierre verbal →
  Negociación; «No interesado» puede marcarlo como perdido.
- **Embudo**: cada fase muestra su objetivo; cada tarjeta, el tipo de negocio
  y el próximo paso (en rojo si está vencido). **Pulsar un cliente** abre el
  panel de venta: barra de fases, objetivo de la fase actual y qué hay que
  hacer para pasar a la siguiente, próximo paso, quien decide, llamadas con
  sus grabaciones, últimos movimientos y botones Llamar con guion, Agendar,
  Pasar a la siguiente fase y Ficha completa.

| Fase | Objetivo | Paso para salir de ella |
|---|---|---|
| Lead entrante | Hablar con quien decide | Llamar al decisor y conseguir la visita |
| Cualificación | Necesidad, presupuesto y plazo (BANT) | Agendar la visita o la demo |
| Demo IA | Visita o demo en su móvil | Enviar la propuesta del pack que encaja |
| Propuesta | Propuesta enviada y repasada | Seguimiento a las 48 horas |
| Negociación | Resolver objeciones y fijar la firma | Enviar el contrato a firma |
| Firmado / Despliegue / Producción | Kick-off, lanzamiento, cliente contento | Pedir reseña o referido |

### Diagnóstico del cuello de botella y cuenta de la fuga

En el modo llamada, encima del guion, se elige por dónde se le escapa el dinero
al cliente. Cada opción cambia el gancho del guion, las preguntas de
diagnóstico, las objeciones que salen primero y el pack recomendado:

| Cuello de botella | Señales | Pack |
|---|---|---|
| Captación de clientes | Web o ficha de Google con visitas pero sin contactos; boca a boca | Pack 1 · El Capturador Web · 1.700 € + IVA |
| Embudo y conversión | Anuncios, WhatsApp desbordado, respuesta lenta, sin seguimiento | Pack 2 · El Súper-Setter · 2.800 € + IVA |
| Atención por voz y datos | Teléfono que comunica, varios canales sin conectar, datos a mano | Pack 3 · El Cerebro Absoluto · 3.900 € + IVA (agente de voz aparte) |

- **La cuenta de la fuga**: clientes que se le escapan al mes × lo que deja cada
  uno × 12, con la frase para decírsela con sus propios números y el contraste
  de precio. Sin la cuenta, el CRM recuerda que el precio no se dice todavía.
- Al guardar la llamada, el cuello de botella y la fuga anual quedan en la
  ficha, en la tarjeta del embudo y en el panel de venta.
- **Guardar y presupuestar** guarda la llamada y abre el presupuesto con el
  cliente, la persona que decide y el pack que encaja.
- Botón **Brief**: abre el brief de formación de ese cuello de botella encima de
  la llamada (Escape lo cierra y deja la llamada abierta).

### Presupuestos (ahora se guardan de verdad)

- Catálogo con los **packs oficiales** (pago único) primero, con lo que lleva y
  lo que no lleva cada uno; el resto de servicios aparece como «confirma el
  importe con dirección antes de enviarlo».
- Se abren desde la ficha, el panel del embudo o el modo llamada, ya ligados al
  cliente. **Registrar presupuesto** lo guarda con un código correlativo
  (PR-año-número) que pone el servidor, igual que el importe (calculado a partir
  de las líneas, el descuento y el IVA; no se puede cambiar a mano).
- Al registrarlo: queda en el historial del cliente, el valor del deal pasa a
  ser el del presupuesto, el cliente pasa a **Propuesta** y se agenda el
  **seguimiento a las 48 horas laborables**.
- Estados: Borrador, Enviado, En revisión, Aceptado, Rechazado. **Aceptado**
  pasa el deal a Negociación. Cada cambio queda en el historial (filtro
  «Presupuestos»). Si se borra el cliente, sus presupuestos se conservan; al
  restaurarlo desde la papelera vuelven a ligarse.

## Briefs de speech telefónico (Centro de Formación)

Ruta **«Speech telefónico · nivel experto»**, con 7 briefs que se leen en el
propio CRM (índice, progreso, autoevaluación e impresión a PDF):

1. Encuentra el cuello de botella en 3 minutos
2. Speech A · Captación: cuando no le entran clientes (Pack 1)
3. Speech B · Embudo: cuando le entran y se pierden (Pack 2)
4. Speech C · Asistentes de voz y datos: cuando no da abasto (Pack 3 + voz)
5. Objeciones nivel experto: rebatir sin discutir
6. Del teléfono al presupuesto: cerrar con números
7. Chuleta de bolsillo: la IA sin tecnicismos

Están basados en el Kit de Venta Rápido, el Manual del Gestor Comercial y la
Comparativa de Packs, sin cifras inventadas. Como los documentos corporativos,
su contenido viaja solo en el zip personal (`api/semilla/`) y entra solo al
Centro de Formación la primera vez.

## Real o simulación

Sin integraciones configuradas, el CRM funciona entero en **modo simulación**
y lo dice en pantalla: los despliegues validan la configuración y muestran los
pasos, la llamada de prueba genera una conversación de ejemplo (marcada
«[SIMULACIÓN]» en el historial) y la vista previa de WhatsApp responde con la
base de conocimiento. Nada se crea en Twilio, OpenAI ni n8n.

Para pasar a real, administración entra en una ficha → **Configurador IA →
Integraciones**:

- **Twilio** (Account SID, Auth Token y número remitente): los enlaces de firma
  salen por SMS desde el servidor. Sin Twilio, «Enviar por SMS» abre la app de
  mensajes del móvil con el texto y el enlace listos.
- **Orquestador n8n / Make** (URL https y token opcional): recibe los
  despliegues y las llamadas de prueba. Desde ahí se crea el asistente en
  Twilio, OpenAI y ElevenLabs.
- **ElevenLabs** (API key): el ▶ de cada voz suena con la voz real. Sin clave,
  se oye una aproximación con la voz del navegador.
- Con Twilio conectado, el buscador de números muestra números libres reales.

El correo de firma se envía con el correo del propio hosting; si el servidor
no puede, se abre el programa de correo con el mensaje listo.

## Configurador de IA a 1 clic

En cada ficha, pestaña **Configurador IA**, con tres pestañas y el porcentaje
de «listo para desplegar» arriba:

- **📞 Asistente de Voz IA**
  1. Línea: número nuevo de Twilio (local por prefijo, móvil o 900, con
     buscador), SIP Trunk de la centralita del cliente o desvío desde su número.
  2. Motor: GPT-4o Realtime, GPT-4o, GPT-4o mini, GPT-4.1 y GPT-4.1 mini, con
     latencia, coste por minuto y capacidad; creatividad y longitud de respuesta.
  3. Voz: 10 voces de ElevenLabs con ▶ escucha (o el ID de una voz propia o
     clonada), estabilidad, claridad, velocidad del habla y velocidad de respuesta.
  4. System prompt con plantillas (inmobiliaria, clínicas, cierres B2B,
     restaurantes, soporte) y variables `[Nombre_Empresa]`, `[Nombre_Agente]`,
     `[Servicio_Principal]`, `[Telefono_Soporte]`, `[Horario]`, `[Web]`,
     `[Direccion]`. Se rellenan con la ficha y se pueden sobrescribir; «Ver vista
     final» muestra lo que dirá el asistente.
  5. Reglas de transferencia a humano: cuándo, a qué número y qué dice antes.
  6. Zona de pruebas: «📞 Probar Llamada de Voz Ahora» con registro en vivo
     (conexión, marcado, conversación, fin).
- **💬 Bot de WhatsApp**: MetaTok, Meta Cloud API, Twilio o 360dialog; el token
  de la instancia se guarda **cifrado** en el servidor y no vuelve al navegador.
  Personalidad, horario y mensajes, base de conocimiento arrastrando PDF, TXT,
  CSV o DOCX (hasta 300 MB) y chat de prueba a la derecha que responde con ese
  conocimiento.
- **⚡ Embudo Automático**: plantillas de workflow de n8n y el webhook del cliente.

**⚡ Desplegar Sistema & Aprovisionar API** abre primero la comprobación
(qué falta, mover el pipeline, enviar credenciales por SMS, email o ambos) y
luego una consola flotante con las 4 fases:

1. **Twilio**: compra o reserva el número y enruta la voz entrante (o SIP /
   WhatsApp).
2. **OpenAI**: crea el Assistant con el prompt ya resuelto y el vector store con
   los documentos.
3. **ElevenLabs + n8n**: sincroniza la voz, aplica las transferencias y activa
   los nodos del embudo.
4. **Pipeline y credenciales**: mueve el deal a «En producción» (real) o
   «Despliegue» (simulación), nunca hacia atrás, y envía las credenciales al
   cliente. En simulación **no se envía nada al cliente** y lo dice.

No despliega si falta el valor de alguna variable usada en el prompt, si el
prompt es demasiado corto o si falta el número.

### Lo que recibe el orquestador

```json
{"evento": "desplegar", "origen": "labs24k-crm", "ts": "…",
 "contacto": {"id": 12, "nombre": "…", "empresa": "…", "email": "…", "telefono": "…"},
 "voz": {"activo": true, "linea": {"tipo": "twilio", "numero": "+34 984…"},
         "motor": {"modelo": "gpt-4o-realtime", "temperatura": 0.3, "max_tokens": 250},
         "voz": {"proveedor": "elevenlabs", "id": "FGY2WhTYpPnrIDTdsKH5", "nombre": "Laura",
                 "estabilidad": 0.5, "claridad": 0.75, "velocidad": 1, "latencia": 2},
         "nombre_agente": "Laura", "saludo": "…", "prompt": "… [Nombre_Empresa] …",
         "prompt_resuelto": "… Clínica Dental Sonrisa …", "variables": {"Nombre_Empresa": "…"},
         "transferencias": [{"cuando": "Es una urgencia", "destino": "+34…", "mensaje": "…"}]},
 "whatsapp": {"activo": true, "proveedor": "metatok", "numero": "+34…", "instancia": "…",
              "bienvenida": "…", "conocimiento": "…", "rag": [{"nombre": "tarifas.pdf", "ruta": "contactos/12/…"}]},
 "embudo": {"activo": true, "plantilla": "cita", "pasos": [{"t": "…", "on": true}]},
 "secretos": {"whatsapp_token": "…", "sip_password": "…"},
 "webhook_entrada": "https://crm.labs24k.com/api/index.php?ruta=%2Fhook%2F…"}
```

Los módulos inactivos llegan como `null`. Los `secretos` solo viajan del
servidor al orquestador (https), nunca al navegador.

`{"evento": "llamada_prueba", "contacto_id": 12, "telefono": "+34…", "voz": {…}}`
para la llamada de prueba. Cabecera `X-Labs-Token` si se configura el token.

### Webhook de entrada de cada cliente

Cada ficha tiene su URL (Configurador IA → Embudo). Acepta `POST` JSON:

- `{"transcripcion": [{"quien": "IA", "texto": "…"}, …], "duracion": 42, "grabacion": "https://…"}`
  → llamada con transcripción en el timeline.
- `{"mensaje": "…", "de": "+34…"}` → mensaje de WhatsApp.
- Cualquier otro JSON → se guarda como evento del webhook.

No necesita sesión, pero el token es secreto y aleatorio, se puede regenerar y
tiene freno de peticiones.

## Seguridad

Las reglas de siempre siguen mandando: un comercial solo ve y mueve sus deals,
sus citas y la configuración IA de sus contactos; no puede asignar citas a
otros, ni desplegar, ver webhooks, generar contratos o enviar firmas de
contactos ajenos. Las claves de Twilio, n8n y ElevenLabs y los tokens de WhatsApp de cada cliente
(cifrados con AES-256-GCM) nunca se devuelven al navegador.
Las tablas nuevas (citas, ia_config, pipeline_movimientos) entran en las copias
de seguridad cifradas.

## Pruebas

45 + 25 + 30 + 32 + 32 pruebas del servidor y 34 + 36 + 49 + 36 + 37 comprobaciones en el navegador, incluido el móvil,
además de todas las anteriores del CRM.
