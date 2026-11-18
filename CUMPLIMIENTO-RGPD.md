# Labs Command Center 360™ — Cumplimiento RGPD

Lo que el CRM hace para cumplir el RGPD y la LOPDGDD y poder demostrarlo ante
la AEPD. Todo está en el panel, en **Sistema → Cumplimiento RGPD** (solo
administración).

> Te ayuda a cumplir y a dejar pruebas de que cumples. No sustituye el consejo
> de un asesor o delegado de protección de datos.

## Qué incluye

| Obligación | Qué hace el CRM |
|---|---|
| **Copias de seguridad** (art. 32.1.c) | Copia diaria automática de la base de datos y los documentos, cifrada con AES-256-GCM, en la carpeta privada del hosting. Se guardan las 14 últimas. Se puede crear, descargar, subir y restaurar desde el panel. Restaurar solo lo hace la cuenta raíz: antes guarda una copia de lo actual y después cierra todas las sesiones. Una copia retocada o cortada se rechaza. |
| **Registro de brechas** (art. 33.5) | Cada brecha se registra con su cuenta atrás de **72 h** para avisar a la AEPD. El CRM genera el borrador de notificación para la AEPD, la carta a los afectados (art. 34) y la ficha del registro. |
| **Alertas automáticas** | Avisa, también por correo, si detecta: fuerza bruta, ataques a cuentas de administración, entrada de administración desde una conexión nueva, doble factor quitado, uso de códigos de recuperación, descargas masivas de documentos (a partir de 100 en 10 min se cortan), archivos expuestos, bitácora manipulada (abre una brecha sola) o copias que fallan. |
| **Derechos de las personas** (arts. 15-22) | Busca a una persona en contactos, contratos, candidaturas y cuentas. Exporta sus datos en un zip (informe legible + `datos.json`). Suprime contactos y candidaturas. Los contratos se **bloquean** (art. 32 LOPDGDD): se conservan por obligación legal, pero solo los ve administración. Registro de solicitudes con plazo de **1 mes** (prórroga de 2 meses). |
| **Conservación** (art. 5.1.e) | Los leads sin actividad en 24 meses se anonimizan solos; los registros de acceso se borran a los 180 días. Plazos configurables. |
| **Información** (art. 13) | La página de firma muestra la información de protección de datos y exige marcar «He leído…». La pantalla de acceso avisa de que se registran IP y navegador. |
| **Documentación** (art. 30) | Genera el registro de actividades de tratamiento, el anexo de medidas de seguridad, el protocolo ante brechas, la cláusula informativa y el compromiso de confidencialidad para el equipo. |

## Puesta en marcha (una sola vez)

1. **Ajustes**: revisa los datos del responsable, el correo de privacidad y el
   correo que recibirá las alertas.
2. **Tarea diaria en Hostalia**: copia la URL de *Ajustes* y créala en Plesk →
   *Tareas programadas* → *Obtener una URL* → *Diariamente*. Así la copia se
   hace aunque nadie entre al CRM.
3. **Clave de las copias** (cuenta raíz, *Copias* → *Ver la clave*): guárdala
   fuera del servidor. Sin ella las copias no se pueden abrir.
4. Descarga de vez en cuando una copia y guárdala fuera del hosting.
5. Genera los **Documentos**, revísalos con tu asesor y que cada persona del
   equipo firme su compromiso de confidencialidad.
6. Activa el **SSL** en Hostalia: es la medida pendiente más importante.

## Cómo se ha probado

- **60 pruebas** del servidor: cifrado y descifrado de copias con una
  implementación independiente, rechazo de copias manipuladas o cortadas,
  restauración completa, detección de la bitácora manipulada, plazos (31 de
  enero + 1 mes = 28 de febrero), bloqueo de contratos sin puerta trasera,
  descargas masivas y tarea programada.
- **27 comprobaciones** del módulo en el navegador y **26** del recorrido
  completo, incluida la firma con el aviso de privacidad.
- La actualización desde la versión anterior de la base de datos se hace sola
  al entrar.
