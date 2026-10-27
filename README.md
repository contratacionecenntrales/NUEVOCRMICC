# NUEVOCRMICC

Base de partida: **Labs Command Center 360™** (CRM de Labs24k), importado tal cual.

- `index.html` — panel completo (HTML + CSS + JS autocontenido, sin build)
- `firmar.html` — página de firma de contratos para el cliente
- `.htaccess` / `htaccess-blindado.txt` — cabeceras de seguridad y CSP (con los hashes SHA-256 de los scripts en línea: si cambias un HTML, hay que recalcularlos)
- `test.html` — diagnóstico del hosting
- `supabase/*.sql` — guiones de base de datos, en orden 01 → 11
- `supabase/functions/admin-usuarios` — Edge Function de administración de usuarios

Instalación y base de datos: ver `LEEME-INSTALACION.md` y `LEEME-SUPABASE.md`.
