<?php
/**
 * Copia este archivo como api/config.local.php y rellena tus datos reales.
 * config.local.php esta en .gitignore: nunca se sube al repositorio.
 */
define('ICC_DB_HOST', 'TU_HOST_MYSQL');
define('ICC_DB_NAME', 'TU_BASE_DE_DATOS');
define('ICC_DB_USER', 'TU_USUARIO');
define('ICC_DB_PASS', 'TU_CONTRASENA');

// Cadena larga y aleatoria (p. ej. `openssl rand -hex 32`), ver api/backup.php.
define('ICC_BACKUP_TOKEN', 'CAMBIA_ESTE_TOKEN_POR_UNO_LARGO_Y_SECRETO');

// Inteligencia artificial (opcional, SOLO OpenAI). Tambien se puede guardar
// cifrada desde el panel «Inteligencia artificial» (manda la del panel).
// define('ICC_OPENAI_API_KEY', 'sk-...');
// define('ICC_IA_MODELO', 'gpt-5-mini');
// Token del cron unico (opcional; si no, se genera y se ve en el panel).
// define('ICC_CRON_TOKEN', 'cadena-larga-y-aleatoria');
// Clave para cifrar secretos (opcional; si no, se genera sola en la carpeta privada).
// define('ICC_CLAVE_CIFRADO', 'otra-cadena-larga-y-aleatoria');

// Motor de prospeccion (opcional): clave de Google Places (tambien desde el panel).
// define('ICC_PLACES_API_KEY', 'AIza...');
// Direccion publica del CRM para los enlaces de baja y los formularios (opcional).
// define('ICC_URL_PUBLICA', 'https://crm.tudominio.es');
// Agentes de correo: alta automatica de buzones de Hostalia (una sola vez).
// define('ICC_BUZONES', ['info@tudominio.es', 'soporte@tudominio.es', 'no-response@tudominio.es']);
// define('ICC_BUZONES_CLAVE', 'contrasena-comun-de-esos-buzones');

// Comparador de Energia (opcional): consulta SIPS.
// define('ICC_SIPS_URL', 'https://proveedor.example/api/sips?cups={cups}');
// define('ICC_SIPS_TOKEN', '...');
// define('ICC_SIPS_HEADER', 'Authorization: Bearer');

// SOLO en una instalacion de DEMOSTRACION aparte, con su propia BD de ejemplo
// (ver README, "Modo demostracion"). Nunca en la real.
// define('ICC_MODO_DEMO', true);
