<?php
/**
 * Copia este archivo como config.local.php (en esta misma carpeta api/) y
 * rellena tus datos. config.local.php NO se sube a GitHub.
 *
 * Los datos de la base de datos están en el panel de Hostalia:
 * Bases de datos → MySQL → (tu base de datos).
 */
defined('LABS') || exit;

define('LABS_DB_HOST', 'localhost');          // en Hostalia suele ser una IP o un nombre tipo bbdd.xxxx
define('LABS_DB_NAME', 'nombre_de_tu_base');
define('LABS_DB_USER', 'usuario_de_tu_base');
define('LABS_DB_PASS', 'contraseña_de_tu_base');

// Inventa una clave larga (por ejemplo 30 letras y números al azar). Te la
// pedirá api/instalar.php para poner la contraseña de la cuenta raíz.
define('LABS_CLAVE_INSTALACION', 'cambia-esto-por-una-clave-larga-y-tuya');
