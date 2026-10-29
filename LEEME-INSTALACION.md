# Labs Command Center 360™ — Instalación en Hostalia (PHP + MySQL)

Oficina virtual de la red comercial de **Labs24k** (Grupo Evolvix Global, S.L.).

El panel es el mismo de siempre: misma estética, mismos módulos, mismas
funciones. Lo que cambia es **dónde viven los datos**: ya no en Supabase, sino
en una **base de datos MySQL de tu propio hosting de Hostalia**, igual que el
CRM de IC. El navegador habla con un pequeño backend PHP (`api/`) que está en el
mismo dominio.

---

## 1. Qué llevas en el paquete

| Archivo / carpeta | Qué es | ¿Se sube por FTP? |
|---|---|---|
| `index.html` | El panel completo | **Sí** |
| `firmar.html` | La página que abre el **cliente** para firmar su contrato | **Sí** |
| `.htaccess` | Cabeceras de seguridad, CSP y bloqueo de archivos sensibles | **Sí** |
| `api/` | El backend PHP: acceso, permisos, datos, archivos y firma | **Sí** (toda la carpeta) |
| `storage/` | Donde se guardan los documentos subidos (cerrada al público) | **Sí** (con su `.htaccess`) |
| `test.html` | Diagnóstico: comprueba que el hosting sirve HTML y JS | Opcional |
| `htaccess-blindado.txt` | Copia de referencia del `.htaccess` | No |
| `sql/base-de-datos.sql` | La base de datos entera, en un solo archivo | **No**: se importa en phpMyAdmin |
| `LEEME-INSTALACION.md` | Esta guía | No |

Los HTML, `api/` y `storage/` tienen que ir **juntos en la misma carpeta**
(normalmente `/httpdocs`).

> En el zip `descargas/labs-crm-hostalia-mysql.zip`: la carpeta **`web/`** es lo que
> se sube por FTP y **`base-de-datos.sql`** es lo que se importa en phpMyAdmin.

---

## 2. Instalación paso a paso

### Paso 1 · Crear la base de datos
Panel de Hostalia → **Bases de datos → MySQL** → crea una base de datos nueva.
Apunta estos cuatro datos: **servidor** (host), **nombre de la base**, **usuario**
y **contraseña**.

### Paso 2 · Importar las tablas
En ese mismo apartado abre **phpMyAdmin** → elige tu base de datos → pestaña
**Importar** → selecciona `sql/base-de-datos.sql` → **Continuar**.

Crea todas las tablas y la cuenta raíz `jalvarez@labs24k.com`, **sin contraseña
todavía** (así no queda ninguna contraseña escrita en ningún archivo). Se puede
volver a importar sin romper nada.

### Paso 3 · Poner los datos de la base de datos
En la carpeta `api/` copia `config.local.example.php` con el nombre
**`config.local.php`** y rellénalo:

```php
define('LABS_DB_HOST', 'el servidor que te da Hostalia');
define('LABS_DB_NAME', 'nombre_de_tu_base');
define('LABS_DB_USER', 'usuario_de_tu_base');
define('LABS_DB_PASS', 'contraseña_de_tu_base');
define('LABS_CLAVE_INSTALACION', 'inventa-aqui-una-clave-larga-tuya');
```

Este archivo **no se sube a GitHub** nunca (está en `.gitignore`).

### Paso 4 · Subir por FTP
Sube a la carpeta pública del dominio (`/httpdocs`): `index.html`,
`firmar.html`, `.htaccess`, la carpeta `api/` completa (con tu
`config.local.php`) y la carpeta `storage/`.

La carpeta `storage/` necesita **permiso de escritura** para PHP (en Hostalia
suele venir ya bien; si no, dale permisos 755 desde el administrador de archivos).

### Paso 5 · Poner la contraseña de la cuenta raíz
Abre **`https://crm.labs24k.com/api/instalar.php`**. Verás una lista de
comprobaciones (conexión, tablas, cuenta raíz, carpeta de archivos) y un
formulario que pide:

1. la **clave de instalación** que pusiste en `config.local.php`, y
2. la **contraseña nueva** de `jalvarez@labs24k.com` (mínimo 10 caracteres, con
   mayúscula, minúscula, número y símbolo).

Esa página solo funciona **una vez**: en cuanto la cuenta raíz tiene contraseña,
ya no deja cambiar nada. Después puedes borrar `api/instalar.php` si quieres.

### Paso 6 · Entrar
`https://crm.labs24k.com` → correo y contraseña. Desde **Usuarios y Accesos**
das de alta al resto del equipo, como siempre.

Para comprobarlo todo de un vistazo: **Configuración del Sistema → Base de
datos → Comprobar la instalación**.

---

## 3. Cómo está montado (por si alguien técnico lo revisa)

- **`api/index.php`** es la única puerta de entrada. Entiende las mismas rutas
  que el panel usaba con Supabase (`/rest/v1/...`, `/auth/v1/...`,
  `/storage/v1/...`), así que el panel apenas ha cambiado.
- **`api/esquema.php`** tiene, tabla por tabla, quién puede leer, crear, editar
  y borrar cada fila: es la traducción exacta de las políticas RLS y los
  disparadores de los antiguos guiones de Supabase (01 a 17).
- **Contraseñas** con bcrypt (`password_hash` de PHP). Nunca en texto plano.
- **Sesiones** con un token aleatorio que caduca cada hora y se renueva solo; en
  la base de datos solo se guarda su huella SHA-256.
- **Freno a la fuerza bruta**: tras 8 intentos fallidos con la misma cuenta (o
  30 desde la misma IP) se bloquea 15 minutos.
- **Archivos** en `storage/documentos/`, cerrada al público por su `.htaccess`:
  solo se descargan a través de `api/`, que comprueba los permisos de quien pide.
- PATCH y DELETE viajan como POST con la cabecera `X-HTTP-Method-Override`,
  porque Hostalia a veces bloquea esos métodos (lo mismo que en el CRM de IC).

---

## 3 bis. Centro de Seguridad

En el menú **Sistema → Centro de Seguridad** (administración):

- **Nivel de blindaje** de 0 a 100 y la lista de puertas revisadas en tu servidor.
- **Lanzar prueba de ataque**: el servidor intenta descargarse a sí mismo archivos
  cebo desde fuera y dice si algo queda expuesto.
- Botones de un clic para **llevar la configuración de MySQL a la carpeta
  privada** del hosting, **mover los documentos** fuera de la web y **eliminar los
  archivos sobrantes** (zips, SQL, notas) que hayan quedado en la carpeta pública.
- **Doble factor** con Google o Microsoft Authenticator (código QR en pantalla).
- Sesiones abiertas, intentos de entrada, IPs bloqueadas y verificación de la
  bitácora sellada.

Las tablas nuevas que necesita se crean solas la primera vez: no hace falta
volver a importar SQL. El detalle de cada defensa está en `SEGURIDAD.md`.

## 3 ter. Cumplimiento RGPD

En **Sistema → Cumplimiento RGPD**: copias cifradas diarias, registro de
brechas con plazo de 72 h, alertas por correo, derechos de las personas,
plazos de conservación y documentación. Para que la copia diaria se haga
aunque nadie entre, crea en Plesk una **tarea programada → Obtener una URL →
Diariamente** con la dirección que aparece en *Ajustes*. Detalle en
`CUMPLIMIENTO-RGPD.md`.

## 4. Contratos y firma del cliente

El módulo **Contratos y Facturación** genera vuestro contrato real —el de
prestación de servicios de embudos y captación 24/7, con sus dieciséis cláusulas
y su Anexo I.

1. Rellenas el formulario y pulsas **Registrar contrato**. Se guarda en MySQL.
2. En la cartera, el botón del **enlace** pide al servidor un token de un solo
   uso y te devuelve una dirección `…/firmar.html#t=…`.
3. Se la mandas al cliente por WhatsApp o correo desde el propio panel.
4. El cliente abre el enlace: ve el contrato entero, escribe su nombre y DNI,
   firma con el dedo y le sale su copia en PDF.
5. En vuestro panel el contrato pasa a **Firmado**, con la fecha, la hora, la IP,
   el navegador y una huella SHA-256 del texto exacto que aceptó.

El enlace **caduca a los 30 días** y **solo sirve una vez**.

### Qué validez tiene esa firma

Es una **firma electrónica simple** (art. 3.10 del Reglamento eIDAS). Es válida y
admisible como prueba, y las evidencias que se guardan son precisamente lo que
la sostiene. Pero si el cliente niega haber firmado, **la carga de demostrar que
fue él es vuestra**. Para contratos grandes, mejor un prestador cualificado
(Signaturit, Firmafy, Uanataca…), y que vuestro asesor legal revise el circuito.

---

## 5. Lo que aún no está conectado

Igual que antes, estas partes están construidas pero esperando a que las
enchufes, y el panel lo dice claramente:

- **Mission Control**: los agentes salen como «Sin conectar» hasta que les des
  una URL de webhook `https://` (n8n, Make, VAPI…).
- **Control por voz**: funciona en Chrome y Edge (el audio lo transcribe Google).
- **Integraciones**: IMAP/SMTP del webmail de Hostalia, app.metatok.ai y VAPI/Twilio.
- **Acceso con Google**: no está montado en el servidor propio; se entra con
  correo y contraseña.
- **«He olvidado mi contraseña»** ya no envía correo: deja un aviso en la
  bitácora de esa cuenta para que el administrador la restablezca desde
  **Usuarios y Accesos**.

---

## 6. Lo que se ha comprobado

- **93 pruebas automáticas del backend** contra un MySQL (MariaDB) real: acceso,
  renovación y cierre de sesión, altas por rol, que nadie se suba de rango, la
  cuenta raíz indestructible, contactos y su privacidad entre comerciales,
  subida, descarga y borrado de archivos (con rutas trampa y extensiones
  prohibidas), dosieres, tickets con asignación y escalado automáticos, roles
  personalizados, fichas de agente, contratos, el circuito completo de firma,
  «Ver como», restablecer contraseñas, bajas y el freno a la fuerza bruta.
- **Recorrido completo con navegador real** (22 comprobaciones): entrar, dar de
  alta a una agente, crear un contacto con seguimiento, comentario y documento,
  subir y descargar un dosier, abrir un ticket, registrar un contrato, firmarlo
  desde el móvil del cliente, comprobar la instalación, salir y entrar como la
  agente.
- Sin errores de JavaScript y **sin bloqueos de la CSP** del `.htaccess`.

---

## 7. Si algo falla

| Síntoma | Qué mirar |
|---|---|
| Error 403 y el dominio no tiene certificado SSL | Sube `.htaccess.SIN-SSL-TEMPORAL.txt` renombrado a `.htaccess` y entra por `http://`; cuando actives el SSL, vuelve al `.htaccess` normal |
| Página en blanco | Sube `test.html` y ábrelo. Si carga, el problema está en el `.htaccess` |
| Error 500 al entrar | El `.htaccess` no le gusta a tu Apache: renómbralo a `htaccess.txt` y avisa |
| «Sin conexión con el servidor» | Abre `api/instalar.php`: dice qué paso falta |
| «No conecta con MySQL» | Revisa los cuatro datos de `api/config.local.php` |
| No se pueden subir documentos | Permisos de escritura de `storage/`, o el límite de subida de PHP del plan |
| El cliente ve «enlace no válido» | El token ya se usó o caducó: emite uno nuevo |
| «Demasiados intentos fallidos» | Espera 15 minutos, o que un administrador restablezca la contraseña |

> **Si cambias `index.html` o `firmar.html`**, hay que recalcular las huellas
> `sha256-…` de la línea `script-src` del `.htaccess`, o el navegador bloqueará
> la página (pantalla en blanco).

---

*Labs24k · Labs Command Center 360™ · Grupo Evolvix Global, S.L. · CIF B21779673*
