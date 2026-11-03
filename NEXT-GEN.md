# Labs Command Center 360™ — Next-Gen

Sala de Ventas, Pipeline IA, Agenda comercial y Ficha 360° con configurador de
asistentes de IA. Todo con datos reales de la base de datos de Hostalia; se
instala con el zip, sin tocar SQL (la base de datos se actualiza sola, versión 6).

## Módulos

| Módulo | Qué hace |
|---|---|
| **Sala de Ventas** | Métricas en directo (contratos firmados, valor ganado, pipeline abierto y ponderado, citas, leads, puntos), latencia real del servidor, asistentes IA en producción, llamadas de voz y WhatsApp del periodo. Ranking con podio y puntos, actividad en directo y ticker, objetivo del mes con proyección, análisis automático y embudo de la red. Hoy · Semana · Mes y **Modo TV** a pantalla completa. Se refresca cada 15 s. |
| **Pipeline IA** | Kanban con arrastrar y soltar: Lead entrante → Cualificación → Demo IA → Propuesta → Negociación → Firmado → Despliegue → En producción (y Perdido, con motivo). Tarjetas con temperatura del lead, temporizador de SLA por fase, soluciones (Voz · WhatsApp · Embudo), valor y acciones rápidas (llamar, WhatsApp, agendar, mover, ficha). Previsión ponderada, motivos de pérdida y pipeline por comercial. En el móvil se mueve con el botón «Mover». |
| **Agenda Comercial** | Vistas día (rejilla por horas), semana (arrastra una cita a otro día), equipo, mes y lista. KPIs: citas de hoy, semana y mes, asistencia, pasadas sin cerrar y realizadas sin resumen. Filtros por persona, tipo, estado y sector. Desde la cita: confirmar, realizada con resumen, no asistió, cancelar, reprogramar, **recordatorio por WhatsApp** y **llamada de prueba del asistente**. |
| **Ficha 360°** | Al pulsar un contacto (o una tarjeta del pipeline, o una cita): resumen (fase, SLA, valor, temperatura, estado del asistente, próxima cita) y **timeline omnicanal** con llamadas y sus transcripciones, WhatsApp, correos, notas, firma, citas e IA, filtrable por canal. **Documentos & Firma**: genera el contrato en un clic, lo envía por SMS o email y sigue en tiempo real Emitido → Enviado → Abierto → Firmado. **Configurador IA**: asistente de voz (número, modelo GPT-4o, voz, system prompt, transferencias, «📞 Probar llamada ahora»), bot de WhatsApp (canal, base de conocimiento RAG con PDFs y vista previa del chat) y embudos con plantillas y **webhook propio del cliente**. Botón **⚡ Desplegar & Aprovisionar** con consola de logs en directo. |

Puntos del ranking: cita realizada 2 · demo 3 · propuesta 5 · firma 15.

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
  Vapi/Telnyx/Twilio y OpenAI.

El correo de firma se envía con el correo del propio hosting; si el servidor
no puede, se abre el programa de correo con el mensaje listo.

### Lo que recibe el orquestador

```json
{"evento": "desplegar", "origen": "labs24k-crm", "ts": "…",
 "contacto": {"id": 12, "nombre": "…", "empresa": "…", "email": "…", "telefono": "…"},
 "voz": {"activo": true, "proveedor": "vapi", "numero": "+34…", "modelo": "gpt-4o", "voz": "nova",
         "temperatura": 0.4, "nombre_agente": "Laura", "saludo": "…", "prompt": "…",
         "transferencias": [{"si": "urgencia", "a": "+34…"}]},
 "whatsapp": {"activo": true, "proveedor": "twilio", "numero": "+34…", "bienvenida": "…",
              "conocimiento": "…", "rag": [{"nombre": "tarifas.pdf", "ruta": "contactos/12/…"}]},
 "embudo": {"activo": true, "plantilla": "captacion", "pasos": [{"t": "…", "on": true}]},
 "webhook_entrada": "https://crm.labs24k.com/api/index.php?ruta=%2Fhook%2F…"}
```

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
contactos ajenos. Los tokens de Twilio y n8n nunca se devuelven al navegador.
Las tablas nuevas (citas, ia_config, pipeline_movimientos) entran en las copias
de seguridad cifradas.

## Pruebas

45 pruebas del servidor y 43 comprobaciones en el navegador, incluido el móvil,
además de todas las anteriores del CRM.
