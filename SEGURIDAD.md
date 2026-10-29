# Labs Command Center 360™ — Seguridad

Cómo está blindado el CRM en un hosting compartido como Hostalia (Plesk,
Apache con nginx delante, PHP y MySQL), pensado desde el lado del atacante:
cada puerta que alguien probaría y qué la cierra.

Todo se ve y se gestiona desde **Centro de Seguridad** en el panel (menú
Sistema). Administración ve el estado completo; el resto del equipo, su doble
factor y sus sesiones.

---

## 1. Puertas cerradas

| Por dónde entraría un atacante | Qué lo impide |
|---|---|
| **Descargar archivos privados** (documentos, copias `.sql`, `.zip`, notas `.txt`) si el hosting los sirve con nginx sin leer el `.htaccess` | Los documentos y la configuración se guardan en la carpeta **`private`** del hosting, fuera de la web: no hay URL que los alcance. El `.htaccess` bloquea además `.sql .zip .txt .csv .md .env .ini .log .bak` y comprimidos. El Centro de Seguridad lanza una **prueba de ataque real**: deja archivos cebo con un secreto, intenta descargarlos desde fuera y dice si se pueden |
| **Leer la contraseña de MySQL** si PHP fallara y mostrara el código | La configuración se lleva con un clic a `private/labs-crm/config.php`, fuera de la web |
| **Archivos olvidados** en la carpeta pública (zips de instalación, SQL, notas con contraseñas, copias antiguas del CRM) | Se detectan solos y se eliminan con un clic. Solo se puede borrar lo que el propio análisis ha marcado: ni `index.html` ni rutas trampa |
| **Fuerza bruta** contra el acceso | 8 fallos de una cuenta desde una IP en 15 min frenan esa IP para esa cuenta. 30 fallos desde una IP bloquean la IP 1 h; 100 en 24 h, 24 h. 40 fallos contra una cuenta desde muchas IPs la frenan 15 min |
| **Bloquear a propósito a una persona** (por ejemplo, a la cuenta raíz) fallando su contraseña | El freno es por cuenta + IP: el atacante se bloquea a sí mismo, no a la persona |
| **Saltarse los bloqueos inventándose la IP** en `X-Forwarded-For` | Solo se lee esa cabecera si la petición llega por el proxy del hosting, y se toma el último valor (el que añade el proxy), no los que pone el cliente |
| **Robar la contraseña** (reutilizada, vista, adivinada) | **Doble factor** con Google/Microsoft Authenticator: código de 6 cifras que cambia cada 30 s, no reutilizable, con 10 códigos de recuperación de un solo uso. QR generado dentro del propio panel (sin servicios externos) |
| **Adivinar el código del doble factor** | Cuenta como intento fallido: se aplica el mismo freno que a la contraseña |
| **Robar una sesión** abierta y olvidada | Acceso de 1 hora que se renueva solo; la sesión muere tras 3 días sin uso y, como máximo, a los 30 días. Cada ficha de renovación se usa una sola vez. Las sesiones se ven y se cierran desde el Centro de Seguridad |
| **Seguir dentro tras ser suspendido** | Suspender o dar de baja corta en el acto todas sus sesiones e impide entrar |
| **Descifrar las contraseñas** si se roba la base de datos | Argon2id (o bcrypt de coste 12 si el servidor no lo tiene). Se actualizan solas al entrar |
| **Saber quién tiene cuenta** probando correos | Misma respuesta y mismo tiempo exista o no la cuenta |
| **Borrar su rastro** en la base de datos | Bitácora encadenada: cada apunte lleva la huella del anterior. Retocar o borrar uno rompe la cadena y el Centro de Seguridad lo detecta |
| **Escalar privilegios** con peticiones manipuladas | Cada lectura y escritura pasa por las reglas del servidor (`api/esquema.php`): nadie se sube de rol, cambia su correo por detrás ni toca la cuenta raíz |
| **Subir un archivo malicioso** disfrazado (HTML o programa con extensión `.pdf`) | Se comprueba el contenido real, no solo la extensión. Se descarga siempre como adjunto y con `nosniff` |
| **Inyectar código en la página** (XSS) | Política de seguridad (CSP) por huellas: solo se ejecuta el código exacto del panel. Va en el `.htaccess` **y** dentro del propio HTML, por si el hosting no aplica el `.htaccess` |
| **Meter el panel en otra web** para engañar con clics (clickjacking) | `X-Frame-Options`, `frame-ancestors` y una salvaguarda en el propio código |
| **Saturar el servidor** | Peticiones de más de 2 MB y archivos de más de 25 MB rechazados. La página pública de firma frena a quien la martillee (60 peticiones / 10 min por IP) |
| **Buscar fallos conocidos** de la versión de PHP | No se publica la versión ni `X-Powered-By` |
| **Inyección SQL** | Consultas preparadas y nombres de columna contra lista blanca |
| **Página de instalación** como puerta trasera | Solo funciona mientras la cuenta raíz no tiene contraseña, pide la clave de instalación y frena los intentos |

## 2. Lo que depende de ti

1. **Activar el SSL** gratuito en Hostalia (Certificados SSL → Let's Encrypt). Sin
   él, las contraseñas viajan sin cifrar. Después, cambia el `.htaccess` por la
   versión con SSL (`htaccess-blindado.txt`).
2. **Activar el doble factor** en todas las cuentas de administración.
3. **No repetir contraseñas**: la de MySQL, la de Juan y la de admin, distintas.
4. Lanzar la **prueba de ataque** del Centro de Seguridad tras cada cambio en el
   hosting.

## 3. Cómo se ha probado

- **52 ataques automáticos** contra el servidor en Apache real, incluido un
  Apache que ignora el `.htaccess` (como nginx) para comprobar que la prueba de
  exposición detecta el peligro de verdad.
- **93 pruebas** de permisos y funcionamiento del CRM, **23** del panel completo
  en navegador, **10** de gestión de usuarios y **16** del Centro de Seguridad y
  el doble factor (activación por QR y entrada con código).
- Doble factor verificado con los vectores oficiales de la norma RFC 6238.
- Generador QR verificado módulo a módulo contra una librería de referencia (281
  códigos, versiones 1 a 10) y leído por un lector real desde una captura.
