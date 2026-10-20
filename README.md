# ICC CRM · Integral Connection Consulting

CRM comercial para Integral Connection Consulting: leads/clientes, contratos
(energía/telecomunicaciones), agentes, biblioteca de ficheros, proformas/facturas
e informes. Backend **PHP + MySQL propio**, alojado por completo en tu hosting
(Hostalia u otro con PHP 8 y MySQL), sin ningún servicio externo.

## Estructura

```
icc-crm/
  index.html          SPA: login, dashboard, clientes, contratos, agentes,
                       ficheros, proformas, informes
  firmar.html          Firma digital biométrica de un cliente
  subir.html           Enlace público (sin login) para que el cliente suba facturas
  .htaccess            Cabeceras de seguridad + HTTPS forzado + charset (Apache)
  css/app.css           Tema oscuro corporativo (marino / antracita / esmeralda-cian)
  js/
    config.js            Catálogos compartidos (estados, servicios, carpetas...)
    api.js                Cliente fetch para la API PHP (sesión por cookie + CSRF)
    util.js               Helpers (formato, toasts, modales)
    auth.js                Sesión/rol del usuario (contra api/auth.php)
    data.js                 Acceso a datos: llama a todos los endpoints de api/
    views.js                 Pantallas del CRM
    app.js                    Router + barra de navegación superior
    firmar.js, subir.js        Lógica de firmar.html / subir.html
    diag.js                     Diagnóstico de arranque visible en pantalla
  api/                  Backend PHP (ver más abajo)
  sql/schema.sql        Esquema MySQL completo, para importar una vez
  storage/               Archivos subidos (facturas, estudios, firmas, ficheros,
                          proformas) — protegido por storage/.htaccess: solo se
                          sirven a través de api/descargar.php con sesión válida
  assets/logo.svg        Isotipo IC
  comparador/            Comparadores de Energía (energia/) y Telefonía
                          (telefonia/): páginas propias que usan la sesión
                          del CRM; vendor/ trae las librerías de PDF
```

## Pipeline comercial

Menú **Pipeline**: tablero con cada cliente como oportunidad, por fases
(Lead → Auditoría → Propuesta → Negociación → Ganado / Perdido). Se arrastra
cada tarjeta a su fase (al pasar a Perdido pide el motivo); las fases se
siguen moviendo solas con la subida de facturas, los estudios y las firmas.

- Cada tarjeta: valor estimado, días en la fase (🧊 estancada si supera el
  límite de la fase), próxima cita de la agenda o aviso "Sin próxima acción",
  ahorro encontrado para el cliente, servicios, comercial y cierre previsto.
- Indicadores: valor en juego, previsión ponderada por probabilidad de la
  fase (10/25/50/75 %), tasa de cierre, ciclo medio de venta, conversión
  entre fases, previsión por mes, motivos de pérdida y pipeline por comercial.
- Filtros por comercial, servicio, tipo de cliente, texto y solo estancadas;
  exportación a CSV (Excel). Cada uno ve lo de su jerarquía.
- Valor y fecha de cierre prevista requieren importar una vez
  `sql/migracion_pipeline_oportunidades.sql`.

## Comparador (Energía y Telefonía)

Menú **Comparador** → panel con el histórico de auditorías de los dos
comparadores (cada uno ve las suyas; el jefe de equipo, las de su equipo;
backoffice, las de sus comerciales asignados; admin, todas), con acceso
para abrir cada informe, descargar su PDF o borrarlo.

- **Energía** (`comparador/energia/`): asistente de 5 pasos para luz o gas
  (subir factura con IA, CUPS por SIPS o datos a mano; estudio mensual o
  anual), comparativa con vuestras tarifas (ranking por coste y comisión)
  y con las de mercado, e informe de 3 páginas en PDF.
- **Telefonía** (`comparador/telefonia/`): auditoría de fibra, fijo y
  móvil frente a las operadoras, ranking interno por comisión e informe
  de 3 páginas en PDF.
- Desde la ficha de un cliente ("+ Nueva auditoría de factura"), desde un
  presupuesto ("Ejecutar Comparador") o desde una cita ("Auditar factura")
  el estudio se abre con los datos del cliente y queda vinculado a su ficha.
- Al descargar el PDF, el informe se guarda con su número de presupuesto y
  una copia del PDF queda en `storage/comparador/` (solo se descarga con
  sesión y permiso).
- Catálogo de energía y tarifas de mercado de telefonía: los editan Admin,
  jefes de equipo y backoffice (permiso "Gestionar tarifas del
  comparador"); solo Admin borra tarifas, cambia comisiones o numeración.
  Las comisiones nunca salen en el PDF del cliente.
- **Lectura de facturas con IA** (opcional, de pago por uso): crea una
  clave en https://console.anthropic.com y añádela en `api/config.local.php`:
  `define('ICC_ANTHROPIC_API_KEY', 'sk-ant-...');`. Límite: 60 facturas por
  hora y usuario. La factura solo se envía para leerla; no se guarda.
- **SIPS** (cuando contratéis un proveedor): `ICC_SIPS_URL` (con `{cups}`),
  `ICC_SIPS_TOKEN` e `ICC_SIPS_HEADER` en `api/config.local.php`.
  `api/cmp_energia_sips.php` entiende el formato estándar de la CNMC.
- Revisad cada mes las tarifas de mercado del catálogo y rellenad las
  comisiones de vuestras tarifas propias antes de usarlo con clientes.

## Backend (`api/`)

Todos los endpoints devuelven JSON y usan sesión PHP por cookie (`icc_sesion`).
Las peticiones que modifican datos (POST/PUT/DELETE) requieren la cabecera
`X-CSRF-Token` con el token que entrega `api/auth.php?action=me` — `js/api.js`
ya lo gestiona automáticamente.

- `config.php` — conexión MySQL (PDO) y helpers. Las credenciales van en
  `config.local.php` (copia `config.local.example.php`; está en `.gitignore`).
- `auth.php` — login / logout / sesión actual (`?action=me|login|logout`). No hay
  alta pública: las cuentas del equipo las crea un administrador desde "Agentes"
  (`agentes.php`, acción `POST`, solo rol `admin`).
- `clientes.php`, `documentos.php`, `estudios.php`, `firmas.php`, `notificaciones.php`
  — el flujo de leads original (ver más abajo)
- `contratos.php`, `agentes.php`, `ficheros.php`, `proformas.php`, `informes.php`, `citas.php`
  — los módulos nuevos
- `subir_publico.php` — subida de factura sin login, validada por `upload_token`
- `descargar.php` — descarga protegida de cualquier archivo subido (comprueba
  sesión + propiedad del expediente antes de servir el fichero)

## Flujo de negocio (leads → cliente activo)

1. **Alta de ficha** — el comercial crea el cliente (razón social, CIF, contacto,
   sector, servicios de interés) → estado `Lead Captado`.
2. **Subida de facturas** — desde la ficha (comercial) o vía el enlace público
   `subir.html?token=...` (el propio cliente, sin login). Al llegar la primera
   factura el expediente pasa automáticamente a `Estudio en Backoffice`.
3. **Estudio de backoffice** — backoffice sube el PDF del estudio comparativo de
   ahorro desde la ficha del cliente. Al publicarlo, el estado pasa a
   `Oferta Presentada` y se notifica al comercial (campana de notificaciones).
4. **Defensa y firma** — el comercial accede a `firmar.html` para capturar la
   firma manuscrita del cliente (con hash SHA-256, IP y user-agent como
   evidencia). Al firmar, el expediente pasa a `En Cierre`. El comercial marca
   manualmente `Cliente Activo` cuando el alta con la compañía se completa.

Todo cambio de estado queda auditado en la tabla `historial_estado`.

## Roles

- **Comercial / Agente** (por defecto al registrarse): ve y gestiona solo sus
  propios clientes, contratos y proformas.
- **Backoffice**: ve todo, sube estudios comparativos y gestiona agentes/ficheros.
- **Jefe de equipo**: ve y gestiona clientes/contratos/proformas/estudios/
  comparador de los comerciales que tiene asignados (sin límite de tamaño
  de equipo, asignados por Admin desde Agentes), además de los suyos propios — nunca los de otros
  equipos ni los del resto de la empresa. Gestiona su equipo desde
  "Agentes": **crea usuarios** (siempre como Comercial y dentro de su
  equipo; al crearlo ve los datos de acceso para copiarlos), abre la ficha
  de cada comercial con "⚙️ Gestionar" (datos, bloqueo, restablecer
  contraseña, sesiones abiertas, historial y permisos — solo puede conceder
  los permisos que él mismo tiene) y entra en su cuenta con "👁️ Ver como".
  Esas tres capacidades son permisos del módulo "Equipo" (`usuarios.crear`,
  `usuarios.gestionar`, `usuarios.ver_como`), activos por defecto y que
  Admin puede retirar a cada jefe desde su ficha → Roles y permisos. No puede cambiar
  roles ni reasignar a quién pertenece cada comercial (eso sigue siendo
  solo de Administrador/Super Administrador). Si un comercial no tiene jefe
  asignado, solo Backoffice/Admin/Super Admin ven sus datos.
- **Administrador**: ve todo, gestiona roles y bloqueo de usuarios desde
  "Agentes", y borra contratos/proformas/ficheros. No puede tocar (rol,
  bloqueo, borrado, "Ver como") ninguna cuenta que sea Admin o Super Admin,
  ni crear una nueva — eso es exclusivo de Super Administrador.
- **Super Administrador**: todo lo de Administrador, más el control exclusivo
  sobre las propias cuentas de Admin/Super Admin: es el único que puede
  crear una cuenta Admin/Super Admin, cambiarle el rol, bloquearla,
  eliminarla o entrar en ella con "Ver como". Pensado para quien lleva el
  negocio por encima del día a día de administración (hoy, Juan).

**"Ver como"**: en "Agentes", el botón "👁️ Ver como" junto a cada usuario
(menos la propia cuenta, y menos las cuentas de Admin/Super Admin si quien
lo usa es un Admin normal; un Jefe de equipo solo lo tiene sobre los
comerciales de su equipo) hace que el CRM se muestre exactamente como lo
ve ese usuario — su dashboard, su agenda, sus permisos reales — útil para
soporte o para comprobar qué ve un comercial sin pedirle la contraseña.
Mientras está activo aparece una franja naranja permanente arriba de todo
con el botón "Volver a mi cuenta". No se puede entrar en la propia cuenta
ni encadenar un "Ver como" dentro de otro. Cada entrada y salida queda
registrada (quién, a quién y cuándo) en Agentes → "🕵️ Historial de 'Ver
como'".

"Ficheros" (biblioteca corporativa: Dosieres, Comercializadoras,
materiales de formación...) es siempre visible para todo el mundo, con
carpetas y subcarpetas ilimitadas; solo Backoffice/Jefe de equipo/Admin
pueden subir o crear carpetas nuevas. La única excepción son las carpetas
personales de "Facturación de Comerciales": cada comercial tiene la suya
(creada automáticamente al darlo de alta) y ahí sí hay privacidad estricta,
solo la ve él mismo y Administración — ni siquiera su propio Jefe de
equipo.

El comercial tiene control completo sobre sus propios contratos (crear,
editar y borrar) en cualquiera de los 5 sectores: alarmas, energía,
telecomunicaciones, seguros y financiero — con cualquier compañía (el campo
"Compañía" es de texto libre, no una lista cerrada, porque trabajáis con
todas). El campo "Sector" permite filtrar y sacar informes por línea de
negocio.

### Bootstrap del primer administrador

No existe alta pública: nadie puede crear una cuenta entrando a la web,
solo un administrador puede crear usuarios nuevos desde "Agentes". Para
crear ese primerísimo administrador (cuando la tabla `usuarios` está vacía),
ejecuta una vez en phpMyAdmin, sustituyendo el email:

```sql
INSERT INTO usuarios (nombre, email, password_hash, rol)
VALUES ('Direccion', 'direccion@integralconnectionconsulting.es',
'$2y$12$Gye5sNnDzFdUkW12C7tnr.47f0r99eksaKIf6mhYQcBTpmhEj7.tq', 'admin');
```

Esa contraseña temporal es `ICC-temporal-2026`. Entra con ella y
**cámbiala inmediatamente** desde "Agentes" → busca tu propio usuario →
escribe una contraseña nueva en su fila y guarda. A partir de ahí, ese
administrador puede crear el resto de cuentas del equipo (con el rol que
corresponda) y bloquear/desbloquear usuarios, todo desde "Agentes" en el
propio CRM — ya no hace falta volver a tocar la base de datos a mano.

## Despliegue en Hostalia (hosting con PHP + MySQL)

1. **Crear la base de datos**: panel de Hostalia → *Bases de datos MySQL* →
   crea una base de datos y un usuario con todos los permisos sobre ella.
   Apunta host, nombre de la BD, usuario y contraseña.
2. **Importar el esquema**: phpMyAdmin (o el gestor de BD del panel) → entra
   en tu base de datos vacía → pestaña *Importar* → sube `sql/schema.sql` →
   Continuar. Crea todas las tablas necesarias de una sola vez.
   Si ya tenías el CRM desplegado con una versión anterior de `schema.sql`
   (sin la columna `sector` en contratos), importa además una vez
   `sql/migracion_sectores.sql` para ponerte al día sin perder datos.
   Si además te faltan el rol "Jefe de equipo" o la carpeta "Recursos
   generales" en Ficheros, importa también `sql/migracion_roles.sql`.
   Si quieres que un Jefe de equipo solo vea a su equipo asignado (en vez
   de a toda la empresa), importa también `sql/migracion_jerarquia_equipos.sql`
   y asigna cada comercial a su jefe desde Agentes → columna "Jefe de equipo"
   (solo Admin puede asignarlo, sin límite de comerciales por jefe). En esa
   misma columna, cada Jefe de equipo puede tener a su vez un Admin/Super
   Admin responsable (jerarquía Admin → Jefe de equipo → Comerciales).
   Para la **ficha de cada agente** (Agentes → clic en el nombre, o "Mi
   ficha" para el propio agente), importa también
   `sql/migracion_ficha_agente.sql`. Es un área privada: solo la ven el
   propio agente, su Jefe de equipo y Admin/Super Admin. Incluye datos
   personales (los mantiene el agente), gestión y objetivos mensuales (los
   fija su jefe o dirección), un historial de seguimiento (reuniones,
   objetivos, formaciones, incidencias...) con aviso en la campana al otro
   lado, y su actividad real en el CRM calculada en vivo.
   Para la **ficha de usuario avanzada** (pestañas Información, Roles y
   permisos, Disponibilidad y agenda, Notificaciones y Seguridad avanzada),
   importa también `sql/migracion_usuarios_avanzado.sql` (una sola vez).
   Añade foto de perfil, prefijo/extensión y Nº de relación; permisos
   granulares por módulo que el servidor aplica de verdad (con excepciones
   al rol y "Restablecer al rol"); horario y estado de disponibilidad;
   preferencias de avisos; y seguridad: restablecer contraseña (se muestra
   una vez y obliga a cambiarla), exigir cambio en el próximo acceso,
   sesiones activas con cierre remoto, bloqueo temporal tras 5 intentos
   fallidos e historial completo de la cuenta. Las cuentas nuevas creadas
   desde Agentes deben cambiar la contraseña provisional al entrar.
   Mientras no importes esta migración el CRM sigue funcionando igual.
   Para el **Comparador** (menú Comparador: Energía y Telefonía), importa
   también `sql/migracion_comparadores.sql` (se puede repetir sin duplicar
   nada). Crea sus tablas y carga el catálogo inicial de energía (NAGINI,
   NET y 9 comercializadoras de mercado de octubre de 2026), las comisiones
   de telefonía y 6 perfiles de tarifas de mercado de las operadoras. La
   numeración de presupuestos continúa en ICC-09-2838365 y es compartida
   por los dos comparadores. Ver la sección "Comparador" más abajo.
   Para la **agenda avanzada** (vistas Día/Semana/Mes/Año/Lista, citas a
   cualquier minuto, arrastrar para mover, citas vinculadas a clientes del
   CRM, tipo de cita, resumen de la reunión, próximos pasos y "pasar a
   presupuesto"), importa también `sql/migracion_agenda_avanzada.sql` (una
   sola vez). La pantalla está en `js/agenda.js`.
   Si te falta la sección "Presupuestos", importa también
   `sql/migracion_presupuestos.sql` (añade el tipo de cliente
   Residencial/Empresa/Prime y la tabla de presupuestos por sector), y
   despues `sql/migracion_presupuestos_v2.sql` (añade CUPS/comercializadora/
   tarifa/potencias para energía, datos de servicio actual para el resto de
   sectores, y dirección de suministro en la ficha de cliente).
   Si en "Ficheros" solo ves un listado fijo de carpetas sin poder crear
   subcarpetas dentro (por ejemplo, dentro de "Comercializadoras"), importa
   también `sql/migracion_ficheros_carpetas.sql`: convierte Ficheros en un
   explorador de verdad, con subcarpetas anidadas, botones "Ver" y
   "Descargar" independientes por archivo, y crea automáticamente una
   carpeta raíz "Facturación de Comerciales" en la que, a partir de ahora,
   cada nuevo comercial que des de alta desde "Agentes" recibe su propia
   subcarpeta privada (para nóminas/comisiones/facturación individual):
   solo la ve ese comercial y Administración, nunca el resto del equipo.
   El resto de Ficheros/Dosieres sigue siendo visible para todo el mundo,
   igual que antes.
   Si al crear un Presupuesto con un CUPS/tipo de suministro/consumo anual
   o al marcar un cliente como "Perdido" con motivo te da error, importa
   también `sql/migracion_pipeline_ventas.sql` (añade tipo de suministro,
   consumo anual estimado y fecha de fin de permanencia a Presupuestos, y
   el motivo de pérdida a Clientes).
   Si en "Tipo de cliente" quieres ver Residencial/Pyme/Comunidad de
   vecinos/Gran cuenta (en vez de Residencial/Empresa/Prime), importa
   también `sql/migracion_tipo_cliente.sql` (traslada automáticamente
   Empresa→Pyme y Prime→Gran cuenta en los clientes que ya tuvieras).
   Si en "Facturado por" (Proformas) quieres ver ICC/Elite Energy/Evolvix
   Global (en vez de EVE/AETRON), importa también
   `sql/migracion_facturado_por.sql` (traslada EVE→ICC y AETRON→Elite
   Energy en las proformas que ya tuvieras; revisa luego si alguna debiera
   ser Evolvix Global y cámbiala a mano).
   Si todavía te aparece la sección "Comisiones" en el menú (se quitó del
   CRM), importa también `sql/migracion_quitar_comisiones.sql` para borrar
   esa tabla y sus datos de la base de datos. Es irreversible. Los PDF que
   hubiera adjuntos se quedan sin usar en `storage/comisiones/`: bórralos a
   mano desde el gestor de archivos de Hostalia si quieres liberar espacio.
   Si te falta la sección "Agenda" (visitas y llamadas comerciales), importa
   también `sql/migracion_agenda.sql`.
   Si no te aparece el botón "Ver como" junto a cada agente (solo para
   Admin), importa también `sql/migracion_ver_como.sql`.
   Si no existe todavía el rol "Super Administrador", importa también
   `sql/migracion_super_admin.sql` — añade el rol y de paso sube al admin
   actual (si solo hay uno) a Super Admin, y a Maria Álvarez a Admin. Si tras
   importarlo Juan sigue apareciendo como "Administrador" (porque ya hubiera
   más de un admin en ese momento, p.ej. por haber subido a Maria a mano
   antes de importar la migración), importa además `sql/fix_roles_super_admin.sql`,
   que sube los roles de Juan y Maria por email, sin depender de cuántos
   admins haya.
   Para poder asignar a cada usuario de Backoffice solo algunos comerciales
   (p. ej. Daniela solo con parte del equipo de Maria), importa también
   `sql/migracion_backoffice_asignaciones.sql`. Después, en Agentes, el Admin
   pulsa el botón "👥" de ese usuario de Backoffice y marca sus comerciales.
   Un Backoffice sin ninguno marcado sigue viendo toda la empresa.
   Para que Backoffice pueda concertar visitas y dejarlas en la bandeja
   "Visitas por asignar" del Jefe de equipo (que luego las reparte entre
   sus comerciales), importa también `sql/migracion_citas_equipos.sql`
   (requiere haber importado antes `sql/migracion_agenda_avanzada.sql`).
3. **Configurar la conexión**: copia `api/config.local.example.php` como
   `api/config.local.php` y rellena `ICC_DB_HOST`, `ICC_DB_NAME`,
   `ICC_DB_USER`, `ICC_DB_PASS` con los datos del paso 1 (ese archivo no
   se sube a git).
4. **Subir los archivos**: por FTP/SFTP o el gestor de archivos de Hostalia,
   sube **todo el contenido** de `icc-crm/` (no la carpeta en sí) a la raíz
   del dominio/subdominio: deben quedar `index.html`, `firmar.html`,
   `subir.html`, `.htaccess`, `css/`, `js/`, `api/`, `sql/`, `storage/` y
   `assets/` al mismo nivel.
5. **Permisos de `storage/`**: debe ser escribible por PHP. Si al subir un
   archivo da error de guardado, sube el permiso de esa carpeta a `755` o
   `775` desde el gestor de archivos/FTP (clic derecho → permisos/CHMOD).
   **Importante:** en cada actualización posterior del código, no vuelvas a
   subir/extraer la carpeta `storage/` encima de la que ya tienes en el
   servidor — ahí viven los archivos reales que suba el equipo (facturas,
   estudios, firmas, ficheros, proformas) y algunos gestores de archivos
   **borran** lo que no está en el ZIP al extraer una carpeta encima. Basta
   con crearla una vez (con su `.htaccess` dentro) y no tocarla más.
6. Verifica que el dominio tiene **certificado SSL activo** (el `.htaccess`
   fuerza HTTPS). Si aún no lo tienes, usa temporalmente
   `.htaccess.SIN-SSL-TEMPORAL.txt` (instrucciones dentro del propio archivo)
   y actívalo en cuanto Hostalia emita el certificado.
7. No existe alta pública de usuarios: crea el primer administrador con el
   SQL de la sección "Bootstrap del primer administrador" de arriba.
8. Si la web da error 500 nada más subir el `.htaccess`, renómbralo
   temporalmente a `htaccess.txt` y contacta con soporte de Hostalia para
   confirmar que `mod_headers` y `mod_rewrite` están activos en tu plan.
9. No hace falta `npm install` ni build: el frontend es HTML/JS estático y el
   backend es PHP plano (sin Composer ni frameworks).

### Copias de seguridad automáticas (para que un borrado no vuelva a doler)

Para que un incidente como el de arriba no vuelva a suponer una pérdida
real de archivos, el CRM puede crear copias de seguridad de `storage/`
(un ZIP con todo lo subido hasta ese momento) tanto a mano como solo, cada
noche, sin que nadie tenga que acordarse:

1. **Desde el propio CRM** (cuentas Admin): en "Ficheros" tienes el enlace
   "🗄️ Copias de seguridad", con un botón "+ Crear copia ahora" y el
   listado de las últimas copias para descargarlas a tu ordenador. Se
   guardan en `storage/_backups/` (protegida igual que el resto de
   `storage/`, nunca accesible por URL directa) y se conservan las
   últimas 14 — las más viejas se borran solas.
2. **Automáticas cada noche, sin que nadie tenga que entrar** (recomendado):
   edita `api/config.local.php` y cambia `ICC_BACKUP_TOKEN` por una cadena larga
   y aleatoria tuya (cualquier texto raro de 30-40 caracteres sirve). Luego,
   en el panel de Hostalia/Plesk, entra en **Herramientas y Configuración →
   Tareas programadas** (o "Programador de tareas" / "Cron Jobs", el
   nombre varía) y crea una tarea que cada noche visite esta URL (elige
   "Ejecutar un comando" tipo `curl` o la opción de "solicitar una URL" si
   tu panel la ofrece):

   ```
   https://crm.integralconnectionconsulting.es/api/backup.php?accion=crear&token=TU_TOKEN_AQUI
   ```

   Sustituye `TU_TOKEN_AQUI` por el mismo token que pusiste en
   `ICC_BACKUP_TOKEN`. Con eso, cada noche se genera solo una copia nueva
   sin que nadie tenga que acordarse de entrar a pulsar el botón.
3. Baja de vez en cuando alguna copia a tu propio ordenador (o a un Drive/
   Dropbox) para tener también una copia fuera del hosting — así, aunque
   pase algo grave con toda la cuenta de Hostalia, no dependes solo de
   ella.

### Si `storage/` ha desaparecido del servidor (borrado accidental)

Si un día entras al gestor de archivos de Hostalia y la carpeta `storage/`
ya no está (verás la web funcionando pero cualquier archivo antiguo da
"Archivo no encontrado" al abrirlo), es que algún ZIP se extrajo encima de
`storage/` y el gestor de archivos borró lo que no venía dentro del ZIP.
Esto **no se puede arreglar con código**: los archivos ya subidos
(facturas, firmas, estudios, ficheros, proformas) no viven en este
repositorio ni en ningún sitio que Claude pueda recuperar, solo existían en
esa carpeta del servidor. Pasos a seguir, en este orden:

1. **Antes de subir nada más**, contacta con soporte de Hostalia y pregunta
   si tu plan de hosting guarda copias de seguridad automáticas y si
   pueden restaurar la carpeta `storage/` a una fecha anterior al borrado.
   Es la única vía real para recuperar los archivos ya subidos.
2. Mientras tanto, la propia app sigue funcionando con normalidad para
   todo lo nuevo: en cuanto alguien suba un archivo, el backend vuelve a
   crear automáticamente las subcarpetas que hagan falta.
3. Para dejar la estructura y los permisos ya listos sin esperar a la
   primera subida, extrae el ZIP de despliegue más reciente **incluyendo
   esta vez sí la carpeta `storage/`** que trae dentro (solo con su
   `.htaccess` y las subcarpetas vacías, cero riesgo de sobreescribir nada
   porque ya no hay nada que proteger). En **cualquier actualización
   posterior**, vuelve a la regla de siempre: nunca subas/extraigas
   `storage/` encima de la que ya tengas con archivos reales dentro.
4. Desde "Ficheros" (con una cuenta Admin) tienes un enlace "🔍 Comprobar
   archivos que faltan" que revisa **todas** las tablas con archivos
   (ficheros, documentos, firmas, proformas) y te dice
   exactamente cuáles siguen sin encontrarse en el servidor, para que
   sepas el alcance real y qué hay que volver a subir a mano si Hostalia
   no puede restaurarlos.

## Enlace rápido de subida de facturas

Cada cliente tiene un `upload_token` único (UUID). Desde su ficha en el CRM
hay un botón "Copiar" que genera el enlace `subir.html?token=...` listo para
enviar por email/WhatsApp al cliente, sin que este necesite ninguna cuenta.
