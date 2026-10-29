# NUEVOCRMICC

**Labs Command Center 360™** (CRM de Labs24k) funcionando con **PHP + MySQL en
Hostalia**, sin Supabase. Misma estética y mismas funciones que la versión
anterior; los datos viven en la base de datos MySQL del propio hosting, igual
que en el CRM de IC.

| Qué | Dónde |
|---|---|
| Panel | `index.html` |
| Página de firma del cliente | `firmar.html` |
| Backend PHP (acceso, permisos, datos, archivos, firma) | `api/` |
| Base de datos (importar en phpMyAdmin) | `sql/base-de-datos.sql` |
| Archivos subidos (cerrada al público) | `storage/` |
| Seguridad del hosting (CSP, HTTPS) | `.htaccess` |
| Paquete listo para subir | `descargas/labs-crm-hostalia-mysql.zip` |
| Cómo está blindado (y cómo se ha atacado) | [`SEGURIDAD.md`](SEGURIDAD.md) |
| Cumplimiento RGPD: copias, brechas, derechos, documentos | [`CUMPLIMIENTO-RGPD.md`](CUMPLIMIENTO-RGPD.md) |

**Instalación:** ver [`LEEME-INSTALACION.md`](LEEME-INSTALACION.md). En resumen:
crear la base MySQL → importar `sql/base-de-datos.sql` → rellenar
`api/config.local.php` → subir por FTP → abrir `api/instalar.php` para poner la
contraseña de la cuenta raíz.

Los datos reales (`api/config.local.php` y el contenido de `storage/`) no se
suben nunca al repositorio.
