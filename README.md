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
- **Lectura de facturas con IA** (opcional, de pago por uso): usa la clave de
  OpenAI de **IA → Ajustes de IA y cron** (ver más abajo). Límite: 60
  facturas por hora y usuario. La factura solo se envía para leerla; no se guarda.
- **SIPS** (cuando contratéis un proveedor): `ICC_SIPS_URL` (con `{cups}`),
  `ICC_SIPS_TOKEN` e `ICC_SIPS_HEADER` en `api/config.local.php`.
  `api/cmp_energia_sips.php` entiende el formato estándar de la CNMC.
- Revisad cada mes las tarifas de mercado del catálogo y rellenad las
  comisiones de vuestras tarifas propias antes de usarlo con clientes.

## Ficheros (biblioteca de documentos)

- Solo **Administración** (admin y super admin) puede crear, renombrar, ordenar, subir y borrar carpetas y archivos. El resto del equipo solo consulta y descarga. Lo comprueba el servidor (`icc_puede_gestionar_ficheros`), así que ningún ajuste de permisos lo puede abrir a otros roles.
- La raíz se muestra por secciones, en este orden: **Formación → Energía → Telefonía → Alarmas y seguridad → Seguros → General y administración**. La sección se deduce del nombre de la carpeta; Admin puede fijarla a mano con ✏️.
- **↕ Ordenar carpetas** permite colocar cada carpeta con ◀ ▶; el orden se guarda al momento y lo ve todo el equipo.
- Para elegir sección a mano y ordenar hay que importar una vez `sql/migracion_ficheros_orden.sql`. Sin ella todo funciona igual, con orden automático (sección y nombre).
- La carpeta «Facturacion de Comerciales» la usa el CRM para las carpetas personales y no se puede renombrar ni borrar.

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

> **Agendas compartidas con Backoffice (v68):** desde Agentes → Backoffice → «comerciales asignados», un Admin puede marcar jefes de equipo o cargos de dirección cuya **agenda** gestiona ese backoffice (p. ej. Daniela agenda a Juan y a María). De esas personas solo ve y edita su agenda —concierta, mueve y edita citas—; no ve sus clientes, contratos, presupuestos, proformas ni informes, y al abrir sus citas no aparece la ficha del cliente. Con sus comerciales asignados lo sigue viendo todo. Requiere `sql/migracion_backoffice_agendas.sql` (deja ya a Daniela con las agendas de Juan y María).


> **Gerente** y **Coordinador** (desde la v67) tienen exactamente los mismos poderes que **Administrador**: ven y gestionan todo el negocio, pueden ser responsables de jefes de equipo y, como cualquier Admin, solo un **Super Administrador** puede asignar estos roles o gestionar sus cuentas. Requieren importar `sql/migracion_gerente_coordinador.sql`, que además deja a Juan (info@integralconnectionconsulting.es) como responsable de María y su equipo.


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

## Base de datos en un solo paso

`sql/base-de-datos-completa-v102.sql` deja cualquier base de datos al día para la v102 importándolo una sola vez en phpMyAdmin:
- Con datos (v55 en adelante): no borra nada; crea solo las tablas, columnas, índices y relaciones que falten y amplía los roles. Deja a Daniela con todo el equipo de María y las agendas de Juan y María.
- Vacía: crea el CRM completo y un Super Administrador inicial (info@integralconnectionconsulting.es, contraseña provisional `CambiaEsta-2026`, que el CRM obliga a cambiar).
- Se puede ejecutar varias veces sin errores ni duplicados. Los datos de ejemplo de los comparadores solo se cargan si esas tablas están vacías.

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

## Menú en tablet y móvil

Por debajo de 1180 px el menú superior se sustituye por un **menú lateral** (`css/_menu.css`, `pintarDrawer` en `js/app.js`): botón ☰, panel que se desliza desde la izquierda con la ficha del usuario, secciones (Ventas, Herramientas, Equipo, Sistema) con iconos, submenús desplegables, la página actual resaltada y «Cerrar sesión». Se cierra con ✕, tocando fuera, con Esc o al elegir una opción.

## Sala de ventas, cinta en directo y anuncios

- **Sala de ventas** (`#/sala-ventas`, modo TV con `?tv=1`), visible para todos menos los comerciales (ellos siguen viendo la cinta en directo y las celebraciones): ranking, objetivo del mes, mapa por provincias, actividad y «Análisis en directo». Todo sale de los datos reales del CRM (`api/sala.php`) y se refresca cada 30 s; las cifras solo se mueven cuando entra un movimiento real.
- **Privacidad**: dirección (Admin, Gerente, Coordinador, Super Admin) ve todos los nombres. El resto ve con nombre solo a su propio equipo; de los demás, «Comercial · Provincia», «Equipo · Provincia» u «Oficina · Provincia». Nunca se envían emails ni teléfonos.
- **Cinta en directo** (desactivada: `MOSTRAR_CINTA = false` en `js/cinta.js`): franja bajo el menú en todas las pantallas con los anuncios y los últimos movimientos (anónimos fuera de tu equipo). Se puede pausar y respeta «reducir movimiento».
- **Anuncios de dirección** (`api/anuncios.php`, tabla de `sql/migracion_anuncios.sql`): en la sala, botón «📣 Anuncios». Texto, ciudad y provincia (la provincia late en el mapa), y duración: solo hoy, una semana o hasta una fecha. Caducan solos.
- **Celebración a pantalla completa** (`js/estelar.js`): cada anuncio se abre una vez en cada navegador con fuegos artificiales y la foto del protagonista (la subida en el anuncio o, si no, su foto de perfil). Las ventas nuevas que entran mientras se trabaja también se celebran (foto solo si es de tu equipo). Clic en un anuncio de la cinta o de la sala para volver a verlo; en modo TV se repiten cada 5 minutos.
- **Oficinas** solo la ven Coordinador, Admin y Super Admin (menú, ruta, `api/oficinas.php` con 404 y datos de oficinas de la Sala de ventas).
- **Novedades de tarifas** (`#/comparador/novedades`) y **Oficinas** (`#/oficinas`): ver `sql/migracion_tarifas_novedades.sql` y `sql/migracion_oficinas.sql` (las dos van incluidas en la base de datos completa).

## Copias de seguridad diarias y restauración individual

Menú **Seguridad → Papelera y copias** (`#/copias-seguridad`, `api/copias.php`, `api/copias_lib.php`). **Solo Coordinador, Admin y Super Admin**: para el resto (Gerente incluido) no existe, ni en el menú, ni en el Centro de Seguridad, ni en la bitácora; las direcciones de la API responden 404.

- **Papelera**: cada borrado (cuentas, contratos, facturas, presupuestos, citas, ficheros, carpetas, oficinas) queda apuntado con qué es, quién lo borró (también si fue desde «Ver como») y cuándo, con la copia tomada justo antes. Se restaura con un clic durante 30 días (una cuenta, devolviéndole sus clientes, contratos y citas).

- **Automáticas cada día**, sin configurar nada: la primera vez que alguien usa el CRM en el día se hace (después de responder) una copia de **toda la base de datos** (`storage/_backups/bd/`, 30 días, mínimo 10) y, si ha cambiado algo, de **los archivos** (`storage/_backups/backup-*.zip`, últimas 14). Si se quiere a hora fija, sirve también la tarea programada de `api/backup.php?token=…`.
- **Copia extra justo antes de cada borrado** (cuentas, contratos, facturas, presupuestos, citas, ficheros, carpetas, oficinas, limpieza): como mucho una cada 10 minutos.
- **Restauración individual**: se elige la copia, qué se busca (cliente, cuenta, contrato, factura, documento, presupuesto, cita o archivo) y se restaura solo eso con todo lo que cuelga de él (contratos, citas, historial, documentos y sus archivos), sin tocar el resto. Dos modos: «Recuperar lo que falta» o «Volver a como estaba». Para una cuenta borrada, opción de **devolverle sus clientes, contratos y citas** traspasados. Antes de restaurar se hace una copia del estado actual y todo queda en la bitácora sellada.
- **Exportar datos es solo de dirección**: los botones de exportar (contratos, pipeline, facturas, cartera de clientes) no salen al resto y `api/exportar_contratos.php` responde 403 aunque alguien tenga el permiso a medida.

## Formación y recursos (portada de Ficheros)

Menú **Formación y recursos** (`#/ficheros`, `js/biblioteca.js`, `api/biblioteca.php`, columnas y tabla de `sql/migracion_ficheros_biblioteca.sql`). Las carpetas de siempre siguen en **Todas las carpetas** (`#/ficheros/carpetas`).

- **Formación de inicio del Gestor Comercial**: los documentos que debe ver un comercial nuevo, en orden, con su progreso (se completa al llegar a la última página o con «Marcar como completado»). Dirección, jefes y backoffice ven el progreso de su equipo. Si dirección aún no la ha fijado, se propone sola con los documentos de formación.
- **Dosieres corporativos por división**: una tarjeta por división (ICC Corporativo, Energía, Telefonía, Alarmas y seguridad, Seguros) con su dosier para descargar. La división se deduce del nombre del archivo o de su carpeta, y dirección puede elegirla en Organizar.
- **Secciones**: Material para el cliente, Cómo tramitar, Formación por área (Energía, Telefonía, Alarmas…), Ofertas tácticas y Otros recursos. Cada archivo se clasifica solo por su nombre y su carpeta, y dirección puede cambiarlo.
- **Títulos profesionales** automáticos (sin guiones, versiones ni «copia», con tildes y marcas bien escritas) que dirección puede reescribir, con una frase de para qué sirve y los minutos.
- **Miniaturas reales** de los PDF y **modo presentación a pantalla completa** (flechas, deslizar en el móvil, tecla F) con pdf.js (`assets/vendor/pdfjs`, licencia Apache 2.0).
- Botón **Organizar biblioteca** (solo dirección): títulos, sección, descripción, minutos y orden de la ruta. Las carpetas personales de facturación nunca aparecen aquí.

## Centro de Seguridad (blindaje, adaptado del CRM de Labs)

Comerciales y jefes de equipo no ven nada de seguridad: sin menú ni Centro de Seguridad (la API les responde 404), sin avisos de conexión nueva y, en su ficha, la pestaña es solo «Contraseña» para poder cambiarla.

Menú **Seguridad → Centro de Seguridad** (`#/seguridad`, `api/seguridad.php`, `api/seguridad_lib.php`, tablas de `sql/migracion_seguridad.sql`, incluidas en la base de datos completa).

- **Doble factor (2FA)**: contraseña + código de 6 cifras de Google o Microsoft Authenticator (QR propio, sin librerías externas: `js/qr.js`). Cada código sirve una vez; 10 códigos de recuperación de un solo uso. Dirección puede quitárselo a quien pierda el móvil (el del Super Admin, solo el propio Super Admin). Cada persona lo activa desde Mi ficha → Seguridad avanzada.
- **Freno contra fuerza bruta** sin que un atacante pueda dejar fuera a nadie: 8 fallos cuenta+IP en 15 min frenan esa IP para esa cuenta; 30 fallos de una IP en 15 min la bloquean 1 h; 100 en 24 h, 24 h; 40 fallos repartidos contra una cuenta la frenan 15 min. Mismo tiempo de respuesta exista o no la cuenta.
- **Registro de accesos** (180 días), conexiones sospechosas, bloqueos con botón para quitarlos y aviso a la persona cuando entra desde una conexión nueva.
- **Bitácora sellada**: cada evento de cuenta lleva la huella del anterior; si alguien lo cambia o borra desde phpMyAdmin, se detecta.
- **Revisión del servidor** con puntuación: SSL, configuración y documentos fuera de la web (se mueven a la carpeta privada `private/` de Hostalia con un clic), archivos sobrantes (zips, SQL, la carpeta `ACTUALIZAR-BASE-DE-DATOS`…) que se borran con un clic, versión de PHP e intentos de entrada.
- **Prueba de ataque desde fuera**: el servidor deja archivos cebo y trata de descargarlos como un atacante.
- Sesiones que caducan solas (72 h sin uso, 30 días como máximo), contraseñas con Argon2id o bcrypt reforzado (se actualizan al entrar), cabeceras de seguridad también desde PHP y `.htaccess` que bloquea más tipos de archivo y las piezas internas de la API.

## Enlace rápido de subida de facturas

Cada cliente tiene un `upload_token` único (UUID). Desde su ficha en el CRM
hay un botón "Copiar" que genera el enlace `subir.html?token=...` listo para
enviar por email/WhatsApp al cliente, sin que este necesite ninguna cuenta.

## Modo demostración (instalación aparte con datos de ejemplo)

Sirve para enseñar el CRM a posibles oficinas o distribuidores sin tocar los
datos reales. **Todo lo que se ve en la demo es inventado y así se indica**:
una franja amarilla «DEMO · Datos de ejemplo, no reales» fija arriba en todas
las pantallas (acceso, CRM, firma, modo TV), que no se puede cerrar ni quitar
desde la página, y «DEMO ·» delante del título de la pestaña.

> ⚠️ **Nunca** actives el modo demo ni ejecutes el generador sobre la base de
> datos real: el generador **borra todas las tablas** de la BD configurada.
> La demo va siempre en otra carpeta/subdominio y con **otra base de datos**.

Montarla (por ejemplo en `demo.crm.tudominio.es`):

1. Crea el subdominio en Hostalia apuntando a una carpeta nueva y sube ahí el
   mismo zip del CRM.
2. Crea una base de datos **nueva y vacía** e importa
   `sql/base-de-datos-completa-v102.sql` (más las migraciones nuevas si las hay).
3. Crea `api/config.local.php` de esa carpeta con los datos de la BD nueva y
   añade `define('ICC_MODO_DEMO', true);`.
4. Rellena la demo por SSH (el generador no se puede abrir desde el navegador):
   `php sql/demo/generar_demo.php --confirmar`
   Opciones: `--oficinas=6 --comerciales=5 --meses=6 --semilla=2026`
   (misma semilla = mismos datos).
5. Antes de cada presentación: `php sql/demo/generar_demo.php --refrescar`
   mueve las fechas para que la actividad acabe hoy (sin regenerar nada).

Accesos (contraseña `Demo2026!`): `demo-admin@demo.invalid` (Super Admin),
`demo-gerente@`, `demo-coordinador@`, `demo-backoffice@`, `demo-tramitacion@`,
`demo-jefe1@`…, `demo-comercial1@`… (todos `@demo.invalid`).
Empresas «Demo … Ejemplo N», CIF `B1000xxxx`, emails `@demo.invalid`.

Desactivado en la demo (responde «Desactivado en la demostración»): copias de
seguridad, limpieza de archivos, firma digital, enlace público de subida de
facturas, lectura de facturas con IA, consulta SIPS y borrado de cuentas.

En la instalación real `ICC_MODO_DEMO` no se define (vale `false`) y no
aparece nada de esto.


## Inteligencia artificial y cron único (v87, fase 1 de 7)

Menú **🤖 IA → ⚙️ Ajustes de IA y cron** (`#/inteligencia-artificial`,
`api/ia.php`), solo Coordinador, Admin y Super Admin.

- **Solo OpenAI** (`api/ia_lib.php`): Chat Completions con herramientas y
  respuestas JSON estrictas, `gpt-4o-mini-transcribe` (voz a texto) y
  `gpt-4o-mini-tts` (texto a voz). `ICC_IA_PROVEEDOR = 'solo_openai'` impide
  llamar a cualquier otro servidor. Modelo por defecto `gpt-5-mini`.
- **La clave**: créala en platform.openai.com (con límite de gasto mensual) y
  pégala en el panel; se guarda **cifrada** y nunca vuelve a mostrarse. También
  puede ir en el archivo privado: `define('ICC_OPENAI_API_KEY', 'sk-...');`
  (la del panel manda). Sin clave, todo funciona con plantillas y reglas.
- La clave de cifrado se genera sola la primera vez en la carpeta privada
  (`clave-cifrado.key`). **Inclúyela en tus copias**: sin ella no se pueden
  leer los secretos guardados (bastaría con volver a pegar la clave de OpenAI).
- Registros: cada consulta en `ia_registro` (90 días), cada cambio de la IA en
  `ia_acciones` con el valor anterior (1 año) y notas en `cliente_notas`.
  Límite diario de consultas por persona (300 por defecto).
- **Cron único** (`api/cron.php`): en Plesk → Herramientas y Configuración →
  Tareas programadas → «Buscar una URL», **cada 5 minutos**, la URL que
  muestra el panel (lleva el token; «Cambiar el token» la invalida). Mientras
  alguien tiene el CRM abierto, el panel hace de reloj de respaldo
  (`api/latido.php`). Bloques de esta fase: copias de seguridad y limpieza de
  registros (RGPD). Cada bloque queda en `cron_registro` (30 días).
- Tablas nuevas: `sql/migracion_ia_base.sql` (incluida en la base de datos completa v87).

## Capa de IA completa (v88, fases 2 a 7)

Menú **🤖 IA** (dirección y jefes de equipo; los ajustes, coordinación, admin y super admin). Jarvis, para todo el equipo.
Todo funciona sin IA (plantillas y reglas) y nunca se inventa nada. Tablas: `sql/migracion_motor.sql`,
`migracion_agentes.sql`, `migracion_flujos.sql`, `migracion_jarvis.sql`, `migracion_saneo.sql` y
`migracion_correo_agentes.sql` (todas incluidas en la base de datos completa v88).

- **Motor de prospección** (`#/motor`, `api/motor.php`, `motor_lib.php`, `web_lib.php`): Google Places
  (clave en *Agente y ajustes*) y lectura de webs respetando robots.txt; solo correos genéricos con MX;
  CSV; campañas con aprobación de cada correo (por defecto, LSSI art. 21), solo borradores o autónomo (exige
  aceptar el aviso legal); cadencia 1-3-7; límite diario, pausa de 4 a 9 min, horario; baja en un clic
  (`api/baja.php`, List-Unsubscribe); respuestas por IMAP o pegadas; interesados al CRM con llamada.
- **Zona de agentes** (`#/zona-agentes`, `api/equipo.php`, `agentes_lib.php`): 15 agentes por turnos;
  autonomía *observa / propone / actúa*; presupuestos, contratos, cobros, correos a clientes, perdidos,
  reasignaciones e instrucciones siempre esperan aprobación de dirección. Barrido de Asturias (20 sectores ×
  78 concejos, presupuesto diario), Laboratorio A/B, cerebro, calidad, cierre, cobros y ritmo. Se enciende en
  *Ajustes* (viene apagada).
- **Automatizaciones** (`#/automatizaciones`, `api/flujos.php`, `flujos_lib.php`, `api/flujo_entrada.php`):
  13 disparadores, 14 pasos, 11 plantillas, editor visual, formulario web público.
- **Jarvis** (`api/jarvis.php`, `jarvis_lib.php`, `js/jarvis.js`): botón en la cabecera, núcleo flotante o
  Alt+J. Los cambios se confirman en tarjetas firmadas. **El micrófono necesita https** (el texto y la voz
  de respuesta funcionan ya).
- **Mantenimiento del pipeline** (`api/saneo.php`, `saneo_lib.php`): tarjeta en el Pipeline; cada hora;
  se puede deshacer cada pasada.
- **Agente de correo** (`#/agente-correo`, `api/correo.php`, `correo_agentes_lib.php`, `correo_lib.php`):
  conecta cada buzón (botón *Datos de Hostalia*: IMAP `imap.servidor-correo.net` 993 SSL, SMTP
  `smtp.servidor-correo.net` 587 STARTTLS). Un buzón nuevo empieza desde ahora.
- El **cron único** (`api/cron.php`, cada 5 minutos) mueve, en este orden: copias, limpieza, Motor, buzones,
  mantenimiento del pipeline (cada hora), automatizaciones y turnos de los agentes.
- Conservación (RGPD): correos 1 año, registros de IA y Jarvis 90 días, registros de flujos y del Motor 180 días.

## Puesta en marcha, piloto automático y aprendizaje (v89)

- **🤖 IA → 🚀 Puesta en marcha** (`#/puesta-en-marcha`, `api/puesta.php`, `aprendizaje_lib.php`; coordinación,
  admin y super admin): lista de comprobación en directo (clave de OpenAI, cron, https, buzón y respuestas del
  Motor, Google Places, aviso legal, gestores, objetivo, dosieres, buzones, base de conocimiento, agentes,
  automatizaciones, mantenimiento, aprendizaje) con enlace a donde se resuelve cada punto.
- **Piloto automático**: un botón que deja los 15 agentes en «actúa», el barrido de todos los sectores (envío
  autónomo solo si se aceptó el aviso legal del Motor), 8 automatizaciones recomendadas, el mantenimiento con
  llamadas, los agentes de correo en automático, Jarvis y el aprendizaje diario. «Volver a modo prudente» lo
  deja todo con aprobación. Presupuestos, contratos, cobros, correos con importes o descuentos, quejas, perdidos
  y cambios de instrucciones esperan siempre a una persona.
- **Independencia**: si en un turno la IA no hace nada de su puesto, el manual de reglas del agente hace lo
  esencial (nunca queda sin hacer).
- **Aprendizaje diario** (cron, bloque `aprendizaje`): ángulo ganador por sector (dos proporciones, p < 0,10)
  como estándar, prioridad del barrido por conversión, zonas que responden, avisos por lo que dirección
  rechaza, instrucciones nuevas propuestas por el jefe de un agente con nota baja (las aprueba dirección) y
  ejemplos de estilo con los correos que una persona corrige (Motor y cada buzón).

## Motor de Scraping IA (v90)

`#/motor` es ahora un módulo aparte con cuatro zonas. Migración: `sql/migracion_motor_v2.sql` (incluida en la base de datos completa v90).

- **🛰️ Radar**: tres fuentes (Google Maps / Places, webs corporativas pegadas y CSV de directorios o registros
  mercantiles), varios sectores a la vez (con CNAE) o palabra clave, ubicación Asturias → comarca (Área
  metropolitana de Oviedo, Gijón, Avilés, Cuencas Mineras, Oriente, Occidente y las 8 comarcas oficiales) →
  concejo o código postal. Tabla en directo: empresa, sector, zona, web, correo corporativo, teléfono, madurez
  digital, resumen del negocio, encaje 0–100 y estado del agente.
- **Campañas**: una tarjeta por nicho (filtro por sector) con leads, verificados, enviados, respuestas,
  positivas y reuniones; identidad (perfil) y ángulo por campaña; feed en directo cada 8 s con pausar,
  intervenir (corregir el borrador) y aprobar.
- **🏭 Fábrica de agentes**:
  - *Scraper*: prefijos de correo genéricos (info, contacto, gerencia…), cualificación con IA (resumen,
    carencias y encaje) y encaje mínimo para entrar en campaña.
  - *Outreach*: identidad ICC Consultoría (ver v91): prompt maestro, tono, firma, límite de palabras, cadencia
    día 1 → 3 → 7 y ángulos por servicio. Las correcciones aprobadas se guardan como ejemplos de estilo.
  - *Buzones de envío*: varios buzones (mejor en un subdominio con SPF, DKIM y DMARC), límite diario por
    buzón (30–40), calentamiento (10 el primer día y +5 cada día), pausa aleatoria propia de 4 a 9 min y
    buzón reservado a un perfil. Los seguimientos salen del mismo buzón y en el mismo hilo. Las contraseñas
    se guardan cifradas y nunca vuelven al navegador.
  - *Envío y normativa*: horario, días laborables, aviso legal y modo de envío.
- **Respuestas**: se leen de todos los buzones, se clasifican, paran la secuencia y los interesados pasan al
  CRM con llamada. Los rebotes retiran el correo para siempre.
- Sin píxel de seguimiento (la apertura no se mide: es poco fiable y añade un tratamiento de datos). El correo
  se verifica por MX + rebotes, no sondeando el SMTP ajeno. Páginas Amarillas, registros mercantiles y
  directorios entran por CSV: no se extraen automáticamente de sus webs.

## Oficina virtual de ICC Consultoría (v91)

Identidad única: **ICC Consultoría · 100 % servicios · 100 % compañías · Reducción de costes garantizada**
(integralconnectionconsulting.es). El perfil Labs24k desaparece; `sql/migracion_icc_oficina.sql` (incluida en
la base de datos completa v91) pasa sus campañas a ICC.

- **Motor**: prompt maestro de ICC para B2B de energía (potencia, excesos, reactiva, tarifas), telefonía (líneas,
  permanencias, fibra, móviles, centralita), alarmas (cuota, mantenimiento, central receptora) y seguros
  (renovaciones sin revisar, coberturas). «Garantizada» solo con este sentido: si el estudio no encuentra una
  mejora real, se le dice al cliente y no cambia nada. Sin cifras, porcentajes, precios ni compañías concretas.
  Ángulos: auditoría integral, luz y gas, potencia, telefonía, alarmas, seguros, caso del sector, pregunta corta
  y estudio gratuito. Cuando una empresa responde con interés, pasa al CRM con la etiqueta «Interés: <servicio>»
  del ángulo de su campaña, que arranca el embudo de ese servicio.
- **Automatizaciones** (`#/automatizaciones`): 22 plantillas en tres grupos y botón **🏢 Instalar la oficina
  virtual de ICC** (crea y activa 20; también lo hace el piloto automático). Cada grupo se instala con un clic.
  - *Básicas*: lead nuevo (reparto, bienvenida y llamada en 5 min), recordatorio de cita, no asistió,
    documentación recibida (estudio en 48 h), seguimiento de la propuesta, propuesta aceptada, contrato en
    trámite, contrato activado (y revisión de la primera factura), contrato con incidencia (avisos y tarea en
    2 h, sin escribir al cliente), renovación anual (330 días), perdido a los 90 días, satisfacción y referidos.
  - *Embudos lineales*: Energía, Telefonía, Alarmas y Seguros (empiezan al día siguiente de la bienvenida:
    correo, WhatsApp, llamada y cierre), lead magnet y rescate omnicanal 2-24-48 h.
  - *Embudos avanzados*: auditoría integral 100 % servicios (ramas, espera a que agende y A/B), venta cruzada
    (mira qué servicios le faltan y ofrece el siguiente; con todos, pide referidos), setter BANT y
    reactivación de la base dormida.
- Disparadores nuevos: contrato registrado, activado, con incidencia y aniversario del contrato (filtrables por
  servicio). Un contrato cargado ya activo (importado) no dispara la bienvenida. Condiciones nuevas: «ya tiene
  contratado el servicio» y «ha mostrado interés en el servicio». Variables `{{servicio}}` y `{{web}}`. Pie de
  los correos con la firma de ICC Consultoría.
- Agentes, Jarvis y el agente de correo se presentan con la misma identidad y los cuatro servicios.

## Agentes de correo de la oficina de ICC (v92)

En **🤖 IA → Agente de correo → Buzones**, el panel **📮 Agentes de la oficina de ICC** crea y conecta en un paso
los 5 buzones de Hostalia, cada uno con su agente independiente (instrucciones, firma y permisos propios, modo
automático): responde y gestiona solo lo de su departamento y deja a una persona dinero, contratos y quejas
(con acuse de recibo).

| Buzón | Agente | Qué gestiona |
|---|---|---|
| info@ | Lucía · Ventas y atención | Leads, estudio gratuito, pide la factura y reserva llamada en la agenda del gestor |
| admin@ | Marta · Administración | Facturas, proformas y cobros (marcar un pago siempre se aprueba) |
| juan.a@ | Asistente de Juan · Dirección | Reuniones en la agenda de Juan; lo estratégico (socios, bancos, prensa, dinero) para Juan |
| produccion@ | Pablo · Producción | Estado real de las altas, documentación de compañías, incidencias y KO |
| tramitacion@ | Carmen · Tramitación | Documentación de las altas: guarda adjuntos y pide lo que falta |

Funciones nuevas: `produccion` y `direccion` (deriva entre buzones). Las contraseñas se escriben en el panel, se
guardan cifradas y nunca vuelven al navegador; un buzón sin contraseña no se lee. Si un buzón ya existía con
su agente configurado, se respeta. Sin cambios en la base de datos.

## Jefatura de ventas, coordinadores de equipo y agente de voz (v93)

**🧠 Zona de agentes** pasa a 17 agentes. Migración: `sql/migracion_voz.sql` (incluida en la base de datos completa v93).

- **Jefatura de Ventas · Presión de cierre** (turno cada hora, pestaña **🔥 Sala de cierre**): «da caña al equipo,
  nunca al cliente». Revisa todos los presupuestos abiertos y aplica la técnica que toca:
  - factura subida sin estudio → *velocidad*: estudio a backoffice para hoy;
  - sin factura → *micro-compromiso*: llamada para pedirla;
  - estudio hecho y no presentado → *presentación en caliente* (o *visita* si es cuenta grande: hotel, clínica,
    nave, más de 15.000 kWh/año o más de 5.000 €);
  - fin de permanencia en 60 días → *urgencia legítima* (solo fechas reales);
  - documentación → *firma sin fricción* (contrato a backoffice y llamada para firmar);
  - en propuesta → *cierre por alternativa*;
  - 10 días parado con el gestor → *cierre en pareja*: llamada a dos en la agenda del jefe de equipo.
  Las llamadas las hace el agente de voz si está encendido (si no, van a la agenda del gestor con el guion).
  Como mucho 6 empujones por gestor y día, sin repetir en 48 h, y parte del día a cada gestor. La pestaña
  muestra cada presupuesto con su técnica y guion, «Empujar ahora», «🤖 Llamar con IA» y el **manual de
  12 técnicas** (velocidad, micro-compromiso, presentación en caliente, cierre por alternativa, aislar la
  objeción, urgencia legítima, firma sin fricción, visita a cuenta grande, cierre en pareja, pack 100 %
  servicios, correo de ruptura y referidos). La cadencia de 6 toques sigue en **🤝 Cadencia**.
- **Coordinadores · Jefes de equipo**: cada mañana, el parte de su equipo a cada jefe (ranking por ganados en
  30 días, parados, llamadas atrasadas y citas) y una tarea de 15 minutos con quien acumula 3 o más parados o
  llamadas atrasadas. Los comerciales sin jefe van a coordinación. Los jefes ven solo su equipo.
- **📞 Agente de voz** (`api/voz_lib.php`, `api/voz_webhook.php`; coordinación, admin y super admin): llamadas
  con IA a través de **Vapi** con tu número de **Telnyx o Twilio**. El CRM manda la llamada con las variables
  del cliente y Vapi devuelve el informe de fin de llamada al webhook (cabecera `X-Vapi-Secret`). El CRM lo
  clasifica y actúa: interesado (etiqueta de interés y seguimiento a los 2 días), visita (agenda del gestor el
  día y franja acordados; cuentas grandes, al equipo de campo), llamada, llamar más tarde o «No contactar».
  Prompt de ICC listo para pegar en Vapi (se presenta como asistente de IA, AI Act art. 50; sin precios ni
  cifras de ahorro; facturas a facturacion@). Normas fijas: horario configurable (por defecto 9-14 y
  16-19:30, laborables), límite diario, 2 intentos por teléfono y semana, nunca a «No contactar» y llamadas en
  frío apagadas (si se encienden, solo sociedades con CIF). Las transcripciones se borran a los 90 días y las
  llamadas al año. Sin configurar, todo funciona igual con llamadas del gestor.
- **Automatizaciones**: paso nuevo «🤖 Llamada del agente de voz» (espera a su horario; si no puede, llamada del
  gestor). La plantilla «Lead nuevo» llama en minutos con el agente de voz. El SDR también lo usa.
- **Agentes de correo**: dos buzones más en la oficina de ICC, facturacion@ (Irene · facturas para auditoría:
  guarda la factura, confirma el plazo de 48 h y crea la tarea del estudio) y activaciones@ (Álvaro ·
  activaciones y cierres).

## Autocorrector: mantenimiento automático con memoria (v94)

Agente nuevo (**🧠 Zona de agentes → 🛠️ Autocorrector**, `api/autofix_lib.php`; 18 agentes) y bloque del cron
`autofix` cada 10 minutos, también de noche y sin depender de la IA. Migración: `sql/migracion_autofix.sql`
(incluida en la base de datos completa v94).

Revisa todos los procesos y arregla solo lo que «requiere acción»:

| Proceso | Qué detecta | Qué hace solo |
|---|---|---|
| Puesta en marcha | Interruptores apagados | Enciende la Zona de agentes, las automatizaciones de la oficina, el mantenimiento y el aprendizaje |
| Pipeline | Sin próximo paso, sin valor o sin gestor | Pasa el mantenimiento al momento, con llamadas en la agenda |
| Pipeline | Estancadas sin plan | Empujón de la Jefatura de ventas o llamada de rescate |
| Pipeline | Oportunidades sin vida | Llamada de rescate; a los 14 días sin cambios, Perdido con recontacto a 90 días (desactivable) |
| Correo | Buzón con error / correo atascado 30 min | Vuelve a probar la conexión / reprocesa el correo |
| Motor | Envío con error temporal | Lo devuelve a la cola |
| Agente de voz | Sin informe en 2 h o con error | Llamada del gestor |
| Cron | Proceso que falló | Lo vuelve a ejecutar |

Lo que necesita a una persona (clave de OpenAI, cron del hosting, contraseñas, objetivo del mes, la IA fallando,
decisiones esperando más de 48 h) se avisa a dirección con instrucciones, una vez al día. Nunca aprueba lo que por
diseño decide una persona.

**Memoria** (`autofix_memoria`): cada incidencia con sus intentos (como mucho 3 por episodio, con pausas de 10 y
60 minutos) y las veces que se repite; si algo vuelve 3 veces, lo anota en el Cerebro de la empresa para buscar
la causa. **Jarvis**: «¿Qué requiere acción?» y «Arregla lo que requiere acción» (dirección, con confirmación).

## Jefatura de Backoffice: rellamadas de presupuestos (v95)

Agente nuevo (**Jefatura de Backoffice · Rellamadas**, 19 agentes; `api/rellamadas_lib.php`, `api/rellamadas.php`,
`js/rellamadas.js`) y menú **📞 Rellamadas** para backoffice (ve las suyas) y dirección y jefes de equipo (todas).
Migración: `sql/migracion_rellamadas.sql` (incluida en la base de datos completa v95).

- Cada mañana pone en la agenda de la persona de backoffice elegida (por defecto, **Daniela**) las rellamadas a
  clientes en Propuesta o Negociación cuyo presupuesto lleva 2 días sin respuesta y sin cita, con el guion para que
  lo acepten y empiecen a ahorrar (presentación del ahorro, aislar la objeción y cierre por alternativa). Como
  mucho 15 al día (ajustable); «Dame más rellamadas» pide más.
- Resultado con un clic: **Acepta** → presupuesto a documentación, cliente a Negociación, tarea de preparar el
  contrato y aviso al gestor. **Lo piensa** → nueva rellamada a los 3 días laborables o el día acordado. **No
  contesta** → se reintenta al día siguiente; a la 3.ª, pasa al gestor. **No acepta** (con motivo) → llamada del
  gestor para tratar la objeción; nunca se marca perdido solo.
- **Da caña**: parte diario a backoffice (para hoy, atrasadas, resultados de ayer y aceptados de la semana) y aviso
  a coordinación cada mañana si acumula 3 o más rellamadas atrasadas. La Jefatura de ventas no empuja a los
  clientes que backoffice está rellamando.

## Zona de entrevistas: agentes de WhatsApp que entrevistan (v96)

**🤖 IA → 🧑‍💼 Zona de entrevistas** (`#/entrevistas`, `api/rrhh.php`, `rrhh_lib.php`, `rrhh_webhook.php`,
`rrhh_entrada.php`; dirección y jefes de equipo, los agentes y la conexión con Meta, coordinación y admin).
Migración: `sql/migracion_entrevistas.sql` (incluida en la base de datos completa v96).

- **Agentes de WhatsApp** (API oficial de WhatsApp Business de Meta, Cloud API): varios, cada uno con su número
  (`phone_number_id`), nombre y tono; cada vacante se asigna a uno. Webhook con verificación y firma
  `X-Hub-Signature-256` obligatoria; token y App Secret cifrados. Plantillas aprobadas para escribir fuera de la
  ventana de 24 h (invitación, recordatorio y «novedades»: el mensaje real espera a que el candidato responda).
- **Vacantes** con plantillas profesionales (comercial de campo, teleoperador/a, backoffice): filtros
  eliminatorios (sí/no, opciones o número mínimo), preguntas con criterio y peso, nota mínima, plazas, responsable
  y agendado automático. Enlace de formulario público con consentimiento y código `VAC<n>` para escribir al
  WhatsApp; importación de candidatos (con confirmación de consentimiento).
- **La entrevista**: se presenta como asistente de IA (AI Act art. 50), pide el consentimiento, hace los filtros,
  pregunta, repregunta si la respuesta es vaga, responde dudas solo con los datos de la oferta, puntúa cada
  respuesta (0-10, sin valorar ortografía ni datos personales) y la nota final (0-100) con un resumen para el
  responsable. Si supera la nota mínima, ofrece 2 huecos reales de su agenda y agenda la entrevista final (cita
  con el resumen y recordatorio). Recordatorio a las 20 h y abandono a las 48 h. «BAJA» y «BORRAR» en cualquier
  momento; «GUARDAR» lo deja 12 meses en la bolsa de talento.
- **Supervisión humana** (selección de personal = alto riesgo en el AI Act; RGPD art. 22): la IA nunca descarta
  ni contrata. Quien no cumple un filtro o no llega a la nota queda «para revisar»; una persona confirma los
  descartes (en bloque) y solo entonces sale un mensaje respetuoso. Contratar envía la bienvenida, crea la tarea
  de alta a backoffice y cierra la vacante al cubrir las plazas. Filtros y preguntas sobre edad, sexo, familia,
  salud, religión, origen, ideología o afiliación se bloquean al guardar.
- **Embudo de candidatos** (kanban) con ficha: respuestas con su puntuación y nota, resumen, conversación de
  WhatsApp y decisiones. **Simulador** para probar la entrevista sin WhatsApp.
- RGPD: los candidatos sin bolsa se borran a los N meses (6 por defecto); los mensajes, al año.

### Filtros de experiencia y requisitos legales (v97)

- Filtros rápidos en el editor de vacantes: años de experiencia (mínimo), experiencia en el sector, mayor de edad
  (edad mínima legal), permiso de trabajo en España, nivel de español (si el puesto lo necesita), carné B,
  jornada completa e incorporación. Las plantillas de comercial y backoffice piden al menos 1 año de experiencia.
- El filtro numérico entiende respuestas libres: «tres años», «más de 2», «año y medio», «6 meses» (0,5 años),
  «ninguna».
- Edad (rangos, «joven», año de nacimiento) y nacionalidad («¿eres española?», «extranjero») se bloquean al
  guardar con la alternativa legal: es discriminación en el empleo (Estatuto de los Trabajadores arts. 4 y 17,
  Ley 15/2022; infracción muy grave de la LISOS art. 16).

## Centro de control de la IA (v98)

**🤖 IA → 🎛️ Centro de control** (`#/centro-ia`, `api/centro_ia.php`, `centro_lib.php`; lo ven dirección y jefes de
equipo, lo cambian coordinación, admin y super admin; cada cambio queda en el registro de seguridad).

- **Interruptor general** «⏸ Pausar toda la IA / ▶ Reanudar»: con la pausa, el cron no ejecuta Motor, buzones,
  automatizaciones, mantenimiento, agentes, aprendizaje, Autocorrector ni entrevistas; el agente de voz no llama y
  los mensajes de WhatsApp se guardan y se contestan al reanudar. Copias y limpieza RGPD siguen. Lo que se pide a
  mano (Jarvis, botones) funciona. Al reanudar, cada módulo vuelve a su estado.
- **Un interruptor por módulo** (Zona de agentes, Motor, agentes de correo, automatizaciones, mantenimiento,
  Autocorrector, aprendizaje, rellamadas, agente de voz, entrevistas y Jarvis) con su última actividad y enlace a
  su configuración. Nuevos ajustes `correo_activo` y `flujos_activo`.
- **Un interruptor y la autonomía de cada agente** (observa / propone / actúa); `equipo_apagados` los saca de los
  turnos. Lo que siempre espera a una persona no cambia.
- Uso de la IA: llamadas, errores y tokens de hoy y de 7 días, y en qué se usa.

## Campaña de llamadas a negocios de Asturias sin web (v99)

Menú **📞 Campaña sin web** (`#/sin-web`, `api/sinweb.php`, `sinweb_lib.php`) y pestaña en el Motor. Dirección y
jefes de equipo buscan, reparten y exportan; comerciales y backoffice llaman a lo suyo. Migración:
`sql/migracion_sinweb.sql` (incluida en la base de datos completa v99).

- **Buscar**: sectores × zonas de Asturias en Google Places (máximo 40 búsquedas por vez); se guardan los
  negocios nuevos y la campaña son los que **no tienen web y sí teléfono**.
- **Repartir** por igual entre las personas elegidas (por comarca y concejo), con aviso a cada una.
- **Llamar**: tarjeta con el botón 📞 (enlace `tel:`), «Ver en Maps», guion editable (página web + estudio gratuito
  de luz y teléfono) y resultado en un clic: **Interesado** (pasa al CRM con la etiqueta «Interés: Página web» y
  visita el día acordado o llamada en la agenda del gestor), **Volver a llamar** (día y hora), **No contesta**
  (reintento al siguiente laborable en la otra franja; al 4.º, sale), **No le interesa** y **No llamar más** (nunca
  más, tampoco con el mismo teléfono en otra ficha). Historial en `motor_llamadas`.
- **Exportar CSV** (protegido contra fórmulas de Excel) y aviso de la Lista Robinson para autónomos.

## Retorno: lo que firma y ahorra (v100)

**🤖 IA → 🚀 Retorno** (`#/retorno`, `api/retorno.php`, `retorno_lib.php`; dirección todo, jefes su equipo).

- **Panel**: clientes firmados, valor firmado, % de leads que firman, pipeline ponderado (Lead 10 %, Auditoría 25 %,
  Propuesta 50 %, Negociación 75 %) y **ahorro anual que ICC genera a su cartera** (último estudio de cada fuente:
  estudios, comparador de energía y telefonía y auditorías; solo ahorro positivo, nunca inventado). Embudo por
  canal (Motor, campaña sin web, formulario, correo, comerciales), por sector y por gestor; contratos por mes y
  servicio; clientes de un solo servicio y renovaciones de los próximos 60 días; recomendaciones «dónde está el
  siguiente euro».
- **Agente CRO · Director de Retorno** (20 agentes; turno diario y botón «Optimizar ahora»): prioriza el barrido de
  Asturias por **firmas** (antes que por respuestas), mantiene activas las campañas de los 3 sectores que más
  firman, mete en el embudo de venta cruzada a los clientes activos de un solo servicio y envía el parte semanal
  de retorno a dirección.
- **Automatización «Informe de ahorro»** (23 plantillas; parte de la oficina, 20 activas con el piloto): a los 60
  días de activarse un contrato le cuenta al cliente su ahorro real (variable `{{ahorro}}`, condición «Tiene un
  ahorro estudiado»), le pide un referido y deja una llamada al gestor.


## Recuperar no firmados: darle la vuelta (v101)

**🤖 IA → 🔄 Recuperar no firmados** (`#/recuperacion`, `api/recuperacion.php`, `recuperacion_lib.php`;
tablas `recuperacion` y `ofertas_mes` en `sql/migracion_recuperacion.sql`). Dirección ve todo; jefes, su equipo; comerciales, lo suyo.

- **Detecta** a quien no firmó: oportunidad perdida (último año), rellamada «no acepta» o presupuesto parado 21+ días.
- **Averigua qué le frena** leyendo lo que dijo (motivo de pérdida, rellamadas, llamadas de voz, último correo y notas
  escritas por personas): reglas primero y, si no basta, IA en formato JSON. Objeciones: precio, permanencia, desconfianza,
  decisor, contento, trámites, momento, mala experiencia y otro. Se puede corregir a mano.
- **Playbook por objeción** (qué necesita para firmar y guion): re-estudio con todas las compañías, aviso 45 días antes del
  fin de permanencia, reunión con quien decide, firma digital sin papeleo, el jefe de equipo para malas experiencias…
- **Pone el plan en marcha**: llamada en la agenda del gestor con guion y oferta, tarea de re-estudio a backoffice, aviso y
  nota. Máximo 4 nuevas por gestor y turno; reintento a los 30 días, hasta 3 intentos. Los firmados pasan a «recuperado».
- **Ofertas exclusivas del mes** (coordinador, gerente y admin): servicio, compañía, título, **condiciones obligatorias** y
  vigencia. Botón «Llamar a los no firmados» para lanzar una oferta a quienes encajan. Las ofertas vigentes las usan el
  agente de recuperación, los agentes de correo y el Motor (una oferta real, tal cual, nunca inventada).
- **Agente Recuperación · Darle la vuelta** (21 agentes en la v101): herramientas `ver_no_firmados` y `recuperar_no_firmados`.
- Las llamadas y correos siguen las reglas de siempre (Lista Robinson, LSSI, aviso de IA). Dinero, contratos y firmas los cierra una persona.

## Control 360 · Ahorro siempre (v102)

**🛡️ Control 360** en el menú principal (`#/control`, `#/control?cliente=ID`, `api/control.php`, `control_lib.php`;
tablas `facturas_cliente`, `control_auditorias` y `control_clientes` en `sql/migracion_control360.sql`). Cada persona ve
su cartera; los ajustes, solo dirección. Acceso directo desde la ficha del cliente.

- **Entrada de facturas**: enlace de subida del cliente (`subir.html`), adjuntos de correos de clientes que parecen
  facturas (buzón facturacion@ o asunto/archivo con «factura», «recibo», «póliza») y subida desde el panel o la ficha.
- **Lectura con IA** (un esquema para luz, gas, telefonía, alarmas y seguros): proveedor, producto, periodo, importe,
  coste mensual comparable, permanencia, potencias y consumos P1-P6, reactiva, excesos, servicios añadidos, líneas y GB,
  consumos fuera de tarifa, cámaras y CRA, prima y coberturas. Lo que no es factura se descarta. Máximo 80 lecturas al día
  (`control_max_lecturas_dia`) y 5 por turno.
- **Auditoría con estudio de mercado** (las cifras las calcula el código; la IA solo redacta):
  - Energía: el mismo cálculo que el comparador (potencia, energía, IEE, alquiler e IVA/IGIC/IPSI) contra todas las
    tarifas activas de `cmp_ene_tarifas` (propias de ICC y de mercado) del mismo peaje y tipo de cliente.
  - Telefonía: el perfil del comparador más parecido (empresa u hogar, con al menos sus líneas), IVA incluido y con
    promociones del primer año.
  - Alarmas: kits de `tarifa_alarmas` que igualan lo que tiene (CRA y cámaras). Seguros: re-estudio a mano.
  - Resultado: coste actual anual, mejor opción (la más barata de todas las compañías; si la mejor propia de ICC es otra,
    se indica), ahorro, mínimo, media y máximo del mercado, **posición** (% de alternativas más baratas), qué tiene, qué
    necesita, mejoras (reactiva, excesos, servicios añadidos, consumos fuera de tarifa, centralita, CRA, autoconsumo,
    permanencia…) y las ofertas exclusivas del mes del servicio. Veredicto: en lo mejor del mercado, mejorable (≥5 % o
    ≥60 €), paga de más (≥15 % o ≥300 €) o falta estudio a mano.
- **Mes a mes** (cron `control`, cada 10 min): lee las nuevas, estudia al momento lo recién leído, rehace cada mes los
  estudios con las tarifas vigentes, avisa al gestor (tarea y notificación) de cada mejora y crea a backoffice la tarea de
  estudio a mano (como mucho una cada 120 días). A quien no manda factura en 40 días le pide la última por correo (máx. 1
  al mes, con enlace de subida y de baja; respeta «No contactar» y la lista de exclusión; se puede apagar).
- **Informe al cliente**: lo envía una persona con «Enviar informe del mes» (facturacion@, info@ o el buzón del Motor),
  con el ahorro de cada servicio y el aviso de que las cifras son estimadas y se confirman con la compañía.
- **Agente Control 360 · Ahorro siempre** (22 agentes, Backoffice): herramientas `ver_control` y `vigilar_ahorro`.
  Módulo propio en el Centro de control de IA (interruptor y pausa general).

## Rellamadas a tope: objetivo, ritmo y modo llamada (v103)

Para cuando backoffice llama desde su móvil (sin agente de voz). Sin cambios en la base de datos.

- **Objetivo diario** de llamadas (por defecto 20) y de aceptados (2), en Ajustes de Rellamadas. El cupo diario nunca es
  menor que el objetivo. Si no hay más presupuestos por rellamar, el objetivo baja a lo disponible (no se le exige
  trabajo que no existe).
- **Marcador** arriba del todo: llamadas y aceptados frente al objetivo, ritmo («vas 2 por detrás, a esta hora tocaban
  8»), racha de días cumpliendo, récord y valor aceptado en la semana.
- **Modo llamada (móvil)**: la siguiente llamada en grande con «📞 Llamar» (abre el marcador del móvil), «💬 WhatsApp»
  con un mensaje preparado si no contesta, el guion abierto y los cuatro resultados; al marcar, pasa a la siguiente.
- **Presión durante el día** (cron `rellamadas`, cada 15 min, jornada 9-14 y 16-19 laborables; interruptor «Presión
  durante el día»): pone las rellamadas y el parte a las 8:30 aunque la Zona de agentes esté apagada; avisos de ritmo a
  las 11:30, 13:30 y 17:30; aviso si pasa una hora sin marcar nada con llamadas pendientes (máx. 4 al día); celebración
  al cumplir los objetivos (a dirección, cuando cumple el de aceptados); a las 17:30 avisa a dirección si va 3 o más por
  detrás y por debajo del 60 % del ritmo; cierre del día a ella y a dirección a las 19:00, con aviso si es el segundo día
  seguido por debajo de la mitad del trabajo que había.
